export function createProductionSchedulingCommandService({
  buildMachineQueueResponse,
  buildOperationLog,
  buildProductionTaskFromBody,
  findOrderLine,
  findProductionTask,
  inferProductionMachineIdFromTaskType,
  inferProductionTaskTypeFromOrderLine,
  isProductionTaskCompletedStatus,
  resolvePersistableCreatedBy,
  resolvePublishedProductionLineStatus,
  resolvePublishedProductionTaskStatus,
  summarizeOrderLineForChange,
  now = () => new Date(),
} = {}) {
  const dependencies = {
    buildMachineQueueResponse,
    buildOperationLog,
    buildProductionTaskFromBody,
    findOrderLine,
    findProductionTask,
    inferProductionMachineIdFromTaskType,
    inferProductionTaskTypeFromOrderLine,
    isProductionTaskCompletedStatus,
    resolvePersistableCreatedBy,
    resolvePublishedProductionLineStatus,
    resolvePublishedProductionTaskStatus,
    summarizeOrderLineForChange,
  };
  for (const [name, value] of Object.entries(dependencies)) requireFunction(value, name);

  return {
    async publishSchedule({ workspace, productionTaskId, body = {}, operatorId }) {
      const beforeTask =
        findProductionTask(workspace, productionTaskId) ??
        buildProductionTaskFromBody(workspace, productionTaskId, body);
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
        return businessError(422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
      }
      if (isProductionTaskCompletedStatus(beforeTask.taskStatus ?? beforeTask.status)) {
        return businessError(
          409,
          "PRODUCTION_TASK_ALREADY_COMPLETED",
          "Completed production tasks cannot be published again.",
        );
      }

      const orderLineId = cleanText(body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId);
      const beforeOrderLine = findOrderLine(workspace, orderLineId);
      if (!beforeOrderLine) return notFound("ORDER_LINE_NOT_FOUND");
      if (String(beforeOrderLine.orderType ?? "").includes("外加工")) {
        return businessError(
          409,
          "PRODUCTION_SCHEDULE_EXTERNAL_PROCESSING_NOT_SUPPORTED",
          "External-processing print service tasks are not published to the in-house workshop task pool.",
        );
      }

      const publishedAt = body.publishedAt ?? nowIso(now);
      const taskType =
        cleanText(body.processType ?? beforeTask.taskType) || inferProductionTaskTypeFromOrderLine(beforeOrderLine);
      const machineId =
        cleanText(body.machineId ?? beforeTask.machineId) || inferProductionMachineIdFromTaskType(taskType);
      const plannedQty = Math.trunc(
        Number(body.plannedQty ?? beforeTask.plannedQty ?? beforeTask.qty ?? beforeOrderLine.qty ?? beforeOrderLine.originalQty ?? 0),
      );
      if (!machineId) {
        return businessError(422, "VALIDATION_ERROR", "machineId is required when publishing a production schedule.");
      }
      if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
        return businessError(422, "VALIDATION_ERROR", "plannedQty must be greater than 0.");
      }

      const publishedScheduleId =
        cleanText(body.publishedScheduleId) ||
        cleanText(beforeTask.publishedScheduleId) ||
        nextPlainId("SCH", `${machineId}-${productionTaskId}-${compactTimestamp(publishedAt)}`);
      const taskStatus = body.taskStatus ?? resolvePublishedProductionTaskStatus({ taskType, beforeTask, beforeOrderLine });
      const productionTask = {
        ...beforeTask,
        id: productionTaskId,
        productionTaskId,
        bizNo: beforeTask.bizNo ?? productionTaskId,
        orderLineId,
        lineId: orderLineId,
        taskType,
        machineId,
        plannedQty,
        qty: plannedQty,
        taskStatus,
        status: taskStatus,
        publishedScheduleId,
        createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
        createdAt: beforeTask.createdAt ?? publishedAt,
        updatedAt: publishedAt,
      };
      const lineStatus = body.lineStatus ?? resolvePublishedProductionLineStatus({ taskType, beforeOrderLine, taskStatus });
      const orderLine = {
        ...beforeOrderLine,
        orderLineId: beforeOrderLine.orderLineId ?? beforeOrderLine.id,
        lineStatus,
        status: lineStatus,
        exceptionTags: beforeOrderLine.exceptionTags ?? beforeOrderLine.exceptions ?? [],
      };
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_task",
        targetId: productionTaskId,
        action: "publish_production_schedule",
        operatorId,
        before: {
          productionTask: beforeTask,
          orderLine: summarizeOrderLineForChange(beforeOrderLine),
        },
        after: {
          productionTask,
          orderLine: summarizeOrderLineForChange(orderLine),
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
        },
        reason: body.remark ?? "办公室发布排产到车间任务池",
      });
      const transaction = await workspace.productionPackingTransactionRepository.publishProductionSchedule({
        workspace,
        productionTask,
        orderLine,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });

      return success({
        productionTaskId,
        orderLineId,
        publishedScheduleId: transaction.productionTask.publishedScheduleId,
        status: transaction.productionTask.taskStatus,
        taskStatus: transaction.productionTask.taskStatus,
        orderLineStatus: transaction.orderLine?.lineStatus ?? lineStatus,
        taskType: transaction.productionTask.taskType,
        machineId: transaction.productionTask.machineId,
        plannedQty: transaction.productionTask.plannedQty,
        publishedAt: transaction.productionTask.updatedAt || publishedAt,
        productionTask: transaction.productionTask,
        orderLine: transaction.orderLine,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: transaction.operationLogId,
      });
    },

    async resequenceMachineQueue({ workspace, body = {}, operatorId }) {
      const machineId = cleanText(body.machineId);
      const orderedProductionTaskIds = normalizeStringArray(body.orderedProductionTaskIds ?? body.productionTaskIds);
      if (!machineId) {
        return businessError(422, "VALIDATION_ERROR", "machineId is required for production queue resequencing.");
      }
      if (orderedProductionTaskIds.length < 1) {
        return businessError(
          422,
          "VALIDATION_ERROR",
          "orderedProductionTaskIds must contain at least one production task.",
        );
      }
      if (new Set(orderedProductionTaskIds).size !== orderedProductionTaskIds.length) {
        return businessError(422, "VALIDATION_ERROR", "orderedProductionTaskIds must not contain duplicates.");
      }

      const beforeQueue = await buildMachineQueueResponse({ workspace, query: { machineId, status: "open" } });
      const machineQueueItems = beforeQueue.items.filter((item) => item.machineId === machineId);
      const queueByTaskId = new Map(machineQueueItems.map((item) => [item.productionTaskId, item]));
      const unknownIds = orderedProductionTaskIds.filter((productionTaskId) => !queueByTaskId.has(productionTaskId));
      if (unknownIds.length) {
        return businessError(
          422,
          "PRODUCTION_SCHEDULE_QUEUE_ITEM_NOT_FOUND",
          `Production tasks are not in the active queue for ${machineId}: ${unknownIds.join(", ")}`,
        );
      }
      const missingIds = machineQueueItems
        .map((item) => item.productionTaskId)
        .filter((productionTaskId) => !orderedProductionTaskIds.includes(productionTaskId));
      if (missingIds.length) {
        return businessError(
          422,
          "PRODUCTION_SCHEDULE_QUEUE_SEQUENCE_INCOMPLETE",
          `The new sequence must include every active queue item for ${machineId}: ${missingIds.join(", ")}`,
        );
      }

      const updatedAt = cleanText(body.updatedAt) || nowIso(now);
      const remark = cleanText(body.remark) || "办公室调整同机台排产队列顺序";
      const beforeRecords = cloneJson(workspace.productionScheduleRecords ?? []);
      const nextRecords = buildProductionScheduleRecordsForSequence({
        records: workspace.productionScheduleRecords ?? [],
        orderedItems: orderedProductionTaskIds.map((productionTaskId, index) => ({
          ...queueByTaskId.get(productionTaskId),
          queueSeq: index + 1,
        })),
        machineId,
        operatorId,
        updatedAt,
        remark,
      });
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_schedule_queue",
        targetId: machineId,
        action: "resequence_production_schedule_queue",
        operatorId,
        before: {
          machineId,
          items: machineQueueItems.map(summarizeProductionScheduleQueueItem),
          records: beforeRecords.filter((record) => cleanText(record.machineId) === machineId),
        },
        after: {
          machineId,
          items: nextRecords.map(summarizeProductionScheduleQueueItem),
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
        },
        reason: remark,
      });
      const transaction = await workspace.productionScheduleRecordRepository.resequenceMachineQueue({
        workspace,
        records: nextRecords,
        expectedRecords: beforeRecords.filter((record) => cleanText(record.machineId) === machineId),
        lockedMachineIds: [machineId],
        transactionContext: {
          machineId,
          updatedAt,
          updatedBy: operatorId,
          updatedCount: orderedProductionTaskIds.length,
        },
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });
      const afterQueue = await buildMachineQueueResponse({ workspace, query: { machineId, status: "open" } });

      return success({
        machineId,
        updatedCount: Number(transaction.transactionContext.updatedCount ?? orderedProductionTaskIds.length),
        updatedAt: cleanText(transaction.transactionContext.updatedAt) || updatedAt,
        updatedBy: cleanText(transaction.transactionContext.updatedBy) || operatorId,
        operationLogId: transaction.operationLogId,
        productionScheduleRecords: transaction.productionScheduleRecords,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        ...afterQueue,
      });
    },

    async moveMachineQueueItem({ workspace, body = {}, operatorId }) {
      const productionTaskId = cleanText(body.productionTaskId);
      const targetMachineId = cleanText(body.targetMachineId ?? body.machineId);
      if (!productionTaskId) {
        return businessError(422, "VALIDATION_ERROR", "productionTaskId is required for moving a production schedule item.");
      }
      if (!targetMachineId) {
        return businessError(422, "VALIDATION_ERROR", "targetMachineId is required for moving a production schedule item.");
      }

      const beforeQueue = await buildMachineQueueResponse({ workspace, query: { status: "open" } });
      const movingItem = beforeQueue.items.find((item) => item.productionTaskId === productionTaskId);
      if (!movingItem) {
        return businessError(
          404,
          "PRODUCTION_SCHEDULE_QUEUE_ITEM_NOT_FOUND",
          `Production task is not in the active machine queue: ${productionTaskId}`,
        );
      }
      const sourceMachineId = cleanText(movingItem.machineId);
      const targetQueueBase = beforeQueue.items.filter(
        (item) => item.machineId === targetMachineId && item.productionTaskId !== productionTaskId,
      );
      const positionedTargetQueue = insertProductionScheduleQueueItem({
        items: targetQueueBase,
        item: {
          ...movingItem,
          machineId: targetMachineId,
          machineLabel: targetMachineId,
          scheduleRecordId: "",
        },
        body,
      });
      if (positionedTargetQueue.error) {
        return businessError(422, positionedTargetQueue.error.code, positionedTargetQueue.error.message);
      }

      const updatedAt = cleanText(body.updatedAt) || nowIso(now);
      const remark =
        cleanText(body.remark) ||
        (sourceMachineId === targetMachineId
          ? "办公室插入调整机台排产队列顺序"
          : `办公室将生产任务从 ${sourceMachineId} 调整到 ${targetMachineId}`);
      const beforeRecords = cloneJson(workspace.productionScheduleRecords ?? []);
      const nextRecords = [];

      if (sourceMachineId !== targetMachineId) {
        const sourceQueueAfterMove = beforeQueue.items
          .filter((item) => item.machineId === sourceMachineId && item.productionTaskId !== productionTaskId)
          .map((item, index) => ({ ...item, queueSeq: index + 1 }));
        nextRecords.push(
          ...buildProductionScheduleRecordsForSequence({
            records: workspace.productionScheduleRecords ?? [],
            orderedItems: sourceQueueAfterMove,
            machineId: sourceMachineId,
            operatorId,
            updatedAt,
            remark,
            sourceKind: "machine_reassignment",
            reuseItemScheduleRecordId: true,
          }),
        );
        nextRecords.push(
          buildMovedProductionScheduleRecord({
            records: workspace.productionScheduleRecords ?? [],
            item: movingItem,
            sourceMachineId,
            operatorId,
            updatedAt,
            remark,
          }),
        );
      }

      const targetQueueAfterMove = positionedTargetQueue.items.map((item, index) => ({ ...item, queueSeq: index + 1 }));
      nextRecords.push(
        ...buildProductionScheduleRecordsForSequence({
          records: workspace.productionScheduleRecords ?? [],
          orderedItems: targetQueueAfterMove,
          machineId: targetMachineId,
          operatorId,
          updatedAt,
          remark,
          sourceKind: sourceMachineId === targetMachineId ? "queue_insert" : "machine_reassignment",
          reuseItemScheduleRecordId: false,
        }),
      );

      const beforeTask = findProductionTask(workspace, productionTaskId);
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      const productionTask = {
        ...beforeTask,
        id: productionTaskId,
        productionTaskId,
        machineId: targetMachineId,
        updatedAt,
      };
      const movedTargetItem = targetQueueAfterMove.find((item) => item.productionTaskId === productionTaskId);
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_schedule_queue",
        targetId: productionTaskId,
        action:
          sourceMachineId === targetMachineId
            ? "insert_production_schedule_queue_item"
            : "move_production_schedule_queue_item",
        operatorId,
        before: {
          productionTask: beforeTask,
          sourceMachineId,
          targetMachineId,
          sourceItems: beforeQueue.items
            .filter((item) => item.machineId === sourceMachineId)
            .map(summarizeProductionScheduleQueueItem),
          targetItems: beforeQueue.items
            .filter((item) => item.machineId === targetMachineId)
            .map(summarizeProductionScheduleQueueItem),
          records: beforeRecords.filter((record) => cleanText(record.productionTaskId) === productionTaskId),
        },
        after: {
          productionTask,
          sourceMachineId,
          targetMachineId,
          targetQueueSeq: movedTargetItem?.queueSeq ?? 0,
          records: nextRecords.map(summarizeProductionScheduleRecord),
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
        },
        reason: remark,
      });
      const transaction = await workspace.productionScheduleRecordRepository.moveMachineQueueItem({
        workspace,
        productionTask,
        records: nextRecords,
        expectedRecords: beforeRecords.filter((record) =>
          [sourceMachineId, targetMachineId].includes(cleanText(record.machineId)),
        ),
        lockedMachineIds: [sourceMachineId, targetMachineId],
        transactionContext: {
          productionTaskId,
          sourceMachineId,
          targetMachineId,
          targetQueueSeq: movedTargetItem?.queueSeq ?? 0,
          updatedCount: nextRecords.length,
          updatedAt,
          updatedBy: operatorId,
        },
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });
      const afterQueue = await buildMachineQueueResponse({ workspace, query: { status: "open" } });

      return success({
        productionTaskId,
        sourceMachineId: cleanText(transaction.transactionContext.sourceMachineId) || sourceMachineId,
        targetMachineId: cleanText(transaction.transactionContext.targetMachineId) || targetMachineId,
        targetQueueSeq: Number(transaction.transactionContext.targetQueueSeq ?? movedTargetItem?.queueSeq ?? 0),
        updatedCount: Number(transaction.transactionContext.updatedCount ?? nextRecords.length),
        updatedAt: cleanText(transaction.transactionContext.updatedAt) || updatedAt,
        updatedBy: cleanText(transaction.transactionContext.updatedBy) || operatorId,
        operationLogId: transaction.operationLogId,
        productionTask: transaction.productionTask,
        productionScheduleRecords: transaction.productionScheduleRecords,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        ...afterQueue,
      });
    },
  };
}

function buildProductionScheduleRecordsForSequence({
  records,
  orderedItems,
  machineId,
  operatorId,
  updatedAt,
  remark,
  sourceKind = "manual_resequence",
  status = "active",
  reuseItemScheduleRecordId = true,
}) {
  const nextByKey = new Map((records ?? []).map((record) => [getProductionScheduleRecordKey(record), { ...record }]));
  const nextRecords = [];
  for (const item of orderedItems) {
    const key = getProductionScheduleRecordKey(item);
    const current = nextByKey.get(key) ?? {};
    nextRecords.push({
      ...current,
      scheduleRecordId:
        cleanText(current.scheduleRecordId) ||
        (reuseItemScheduleRecordId ? cleanText(item.scheduleRecordId) : "") ||
        `SQR-${safeRecordPart(machineId)}-${safeRecordPart(item.publishedScheduleId || item.productionTaskId)}`,
      productionTaskId: item.productionTaskId,
      orderLineId: item.orderLineId,
      machineId,
      publishedScheduleId: item.publishedScheduleId,
      queueSeq: item.queueSeq,
      status,
      source: sourceKind,
      createdAt: cleanText(current.createdAt) || updatedAt,
      createdBy: cleanText(current.createdBy) || operatorId,
      updatedAt,
      updatedBy: operatorId,
      remark,
    });
  }
  return nextRecords.sort((left, right) => {
    const leftMachine = cleanText(left.machineId);
    const rightMachine = cleanText(right.machineId);
    if (leftMachine !== rightMachine) return leftMachine.localeCompare(rightMachine);
    return Math.max(0, Math.trunc(Number(left.queueSeq ?? 0))) - Math.max(0, Math.trunc(Number(right.queueSeq ?? 0)));
  });
}

function buildMovedProductionScheduleRecord({ records, item, sourceMachineId, operatorId, updatedAt, remark }) {
  const current =
    (records ?? []).find(
      (record) =>
        cleanText(record.machineId) === sourceMachineId &&
        cleanText(record.productionTaskId) === cleanText(item.productionTaskId),
    ) ?? {};
  return {
    ...current,
    scheduleRecordId:
      cleanText(current.scheduleRecordId) ||
      cleanText(item.scheduleRecordId) ||
      `SQR-${safeRecordPart(sourceMachineId)}-${safeRecordPart(item.publishedScheduleId || item.productionTaskId)}`,
    productionTaskId: item.productionTaskId,
    orderLineId: item.orderLineId,
    machineId: sourceMachineId,
    publishedScheduleId: item.publishedScheduleId,
    queueSeq: 0,
    status: "moved",
    source: "machine_reassignment",
    createdAt: cleanText(current.createdAt) || updatedAt,
    createdBy: cleanText(current.createdBy) || operatorId,
    updatedAt,
    updatedBy: operatorId,
    remark,
  };
}

function insertProductionScheduleQueueItem({ items, item, body }) {
  const beforeProductionTaskId = cleanText(body.insertBeforeProductionTaskId ?? body.beforeProductionTaskId);
  const afterProductionTaskId = cleanText(body.insertAfterProductionTaskId ?? body.afterProductionTaskId);
  const requestedQueueSeq = Math.trunc(Number(body.targetQueueSeq ?? body.queueSeq ?? body.insertAtQueueSeq ?? 0));
  const next = [...items];
  let insertIndex = next.length;
  if (beforeProductionTaskId) {
    insertIndex = next.findIndex((candidate) => candidate.productionTaskId === beforeProductionTaskId);
    if (insertIndex < 0) {
      return {
        error: {
          code: "PRODUCTION_SCHEDULE_INSERT_TARGET_NOT_FOUND",
          message: `insertBeforeProductionTaskId is not in the target machine queue: ${beforeProductionTaskId}`,
        },
      };
    }
  } else if (afterProductionTaskId) {
    insertIndex = next.findIndex((candidate) => candidate.productionTaskId === afterProductionTaskId);
    if (insertIndex < 0) {
      return {
        error: {
          code: "PRODUCTION_SCHEDULE_INSERT_TARGET_NOT_FOUND",
          message: `insertAfterProductionTaskId is not in the target machine queue: ${afterProductionTaskId}`,
        },
      };
    }
    insertIndex += 1;
  } else if (requestedQueueSeq > 0) {
    insertIndex = Math.min(Math.max(requestedQueueSeq - 1, 0), next.length);
  }
  next.splice(insertIndex, 0, item);
  return {
    items: next.map((candidate, index) => ({
      ...candidate,
      queueSeq: index + 1,
    })),
  };
}

function getProductionScheduleRecordKey(record = {}) {
  return `${cleanText(record.machineId)}::${cleanText(record.productionTaskId) || cleanText(record.publishedScheduleId)}`;
}

function summarizeProductionScheduleQueueItem(item) {
  return {
    scheduleRecordId: cleanText(item.scheduleRecordId),
    queueSeq: Math.max(0, Math.trunc(Number(item.queueSeq ?? 0))),
    machineId: cleanText(item.machineId),
    publishedScheduleId: cleanText(item.publishedScheduleId),
    productionTaskId: cleanText(item.productionTaskId),
    orderLineId: cleanText(item.orderLineId),
    customerName: cleanText(item.customerName),
    productName: cleanText(item.productName),
    plannedQty: Math.max(0, Math.trunc(Number(item.plannedQty ?? 0))),
    remainingQty: Math.max(0, Math.trunc(Number(item.remainingQty ?? 0))),
    status: cleanText(item.status),
  };
}

function summarizeProductionScheduleRecord(record) {
  return {
    scheduleRecordId: cleanText(record.scheduleRecordId ?? record.id),
    productionTaskId: cleanText(record.productionTaskId),
    orderLineId: cleanText(record.orderLineId),
    publishedScheduleId: cleanText(record.publishedScheduleId),
    machineId: cleanText(record.machineId),
    queueSeq: Math.max(0, Math.trunc(Number(record.queueSeq ?? 0))),
    status: cleanText(record.status ?? record.scheduleStatus),
    sourceKind: cleanText(record.sourceKind ?? record.source),
    sequenceUpdatedAt: cleanText(record.sequenceUpdatedAt ?? record.updatedAt),
    sequenceUpdatedBy: cleanText(record.sequenceUpdatedBy ?? record.updatedBy),
    remark: cleanText(record.remark),
  };
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function nextPlainId(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
}

function compactTimestamp(value) {
  return cleanText(value).replace(/[-:T.Z]/g, "").slice(0, 14) || "NOW";
}

function safeRecordPart(value) {
  return cleanText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "TASK";
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
