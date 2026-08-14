export function createProductionReportingCommandService({
  buildOperationLog,
  buildProductionTaskFromBody,
  buildTodo,
  findInventoryItem,
  findOrderLine,
  findProductionTask,
  isProductionTaskCompletedStatus,
  resolvePersistableCreatedBy,
  summarizeOrderLineForChange,
  now = () => new Date(),
} = {}) {
  const dependencies = {
    buildOperationLog,
    buildProductionTaskFromBody,
    buildTodo,
    findInventoryItem,
    findOrderLine,
    findProductionTask,
    isProductionTaskCompletedStatus,
    resolvePersistableCreatedBy,
    summarizeOrderLineForChange,
  };
  for (const [name, value] of Object.entries(dependencies)) requireFunction(value, name);

  return {
    async recordDailyProgress({ workspace, productionTaskId, body = {}, operatorId }) {
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
          "Completed production tasks cannot record daily progress.",
        );
      }
      if (isProductionTaskExceptionPaused(beforeTask.taskStatus ?? beforeTask.status)) {
        return businessError(409, "PRODUCTION_TASK_EXCEPTION_PAUSED", "Paused production tasks require an explicit follow-up decision before daily progress.");
      }

      const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
      const beforeOrderLine = findOrderLine(workspace, orderLineId);
      if (!beforeOrderLine) return notFound("ORDER_LINE_NOT_FOUND");
      if (String(beforeOrderLine.orderType ?? "").includes("外加工")) {
        return businessError(
          409,
          "PRODUCTION_PROGRESS_EXTERNAL_PROCESSING_NOT_SUPPORTED",
          "External-processing print service tasks do not use workshop daily progress.",
        );
      }

      const dailyQualifiedQty = Math.trunc(Number(body.dailyQualifiedQty ?? body.qualifiedQty ?? 0));
      if (!Number.isFinite(dailyQualifiedQty) || dailyQualifiedQty <= 0) {
        return businessError(422, "VALIDATION_ERROR", "dailyQualifiedQty must be greater than 0.");
      }
      const reportedAt = body.reportedAt ?? body.completedAt ?? nowIso(now);
      const reportDate = normalizeDateInput(body.progressDate ?? reportedAt);
      const machineCount =
        body.machineCount === undefined || body.machineCount === null
          ? undefined
          : Math.trunc(Number(body.machineCount));
      const plannedQty = Math.trunc(
        Number(
          beforeTask.plannedQty ??
            beforeTask.qty ??
            beforeOrderLine.qty ??
            beforeOrderLine.originalQty ??
            dailyQualifiedQty,
        ),
      );
      const previousQualifiedQty = sumProductionDailyProgressQty(workspace, {
        productionTaskId,
        orderLineId,
        excludeReportId: body.reportId,
      });
      const cumulativeQualifiedQty = Number.isFinite(Math.trunc(Number(body.cumulativeQualifiedQty)))
        ? Math.max(0, Math.trunc(Number(body.cumulativeQualifiedQty)))
        : previousQualifiedQty + dailyQualifiedQty;
      const remainingQty = Math.max(0, plannedQty - cumulativeQualifiedQty);
      const nextWorkDate = body.nextWorkDate ?? (remainingQty > 0 ? getNextDateText(reportDate) : "");
      const effectiveMachineId = cleanText(beforeTask.machineId ?? body.machineId);
      const productionTask = {
        ...beforeTask,
        productionTaskId,
        orderLineId,
        taskType: body.processType ?? beforeTask.taskType ?? "制袋",
        machineId: effectiveMachineId,
        plannedQty,
        taskStatus: remainingQty > 0 ? "跨日继续" : "待完工确认",
        createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
      };
      const reportId =
        body.reportId ?? nextPlainId("WDP", `${productionTaskId}-${(workspace.workshopReports ?? []).length + 1}`);
      const workshopReport = {
        reportId,
        productionTaskId,
        orderLineId,
        processType: body.processType ?? productionTask.taskType,
        machineId: effectiveMachineId,
        operatorId,
        qualifiedQty: dailyQualifiedQty,
        exceptionQty: Math.max(0, Math.trunc(Number(body.exceptionQty ?? 0))),
        machineCount,
        startedAt: body.startedAt ?? "",
        completedAt: reportedAt,
        remark: body.remark ?? "",
        evidence: {
          ...(body.evidence ?? {}),
          reportKind: "daily_progress",
          progressDate: reportDate,
          plannedQty,
          dailyQualifiedQty,
          previousQualifiedQty,
          cumulativeQualifiedQty,
          remainingQty,
          carryOver: remainingQty > 0,
          nextWorkDate,
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
          machineCountAffectsInventory: false,
          machineCountLabel: machineCount === undefined ? "" : "机器计数/动作次数，非合格成品数量",
        },
        createdAt: reportedAt,
      };
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_task",
        targetId: productionTaskId,
        action: "record_production_daily_progress",
        operatorId,
        before: beforeTask,
        after: {
          productionTask,
          workshopReport,
          orderLine: summarizeOrderLineForChange(beforeOrderLine),
          dailyQualifiedQty,
          previousQualifiedQty,
          cumulativeQualifiedQty,
          remainingQty,
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
          machineCount: machineCount ?? null,
        },
        reason: body.remark ?? "生产跨日当日报数",
      });
      const transaction = await workspace.productionPackingTransactionRepository.recordProductionDailyProgress({
        workspace,
        productionTask,
        workshopReport,
        orderLine: beforeOrderLine,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });
      const savedEvidence = transaction.workshopReport.evidence ?? {};

      return success({
        productionTaskId,
        reportId: transaction.workshopReport.reportId,
        orderLineId,
        status: transaction.productionTask.taskStatus,
        taskStatus: transaction.productionTask.taskStatus,
        plannedQty: Number(savedEvidence.plannedQty ?? plannedQty),
        progressDate: savedEvidence.progressDate ?? reportDate,
        dailyQualifiedQty: transaction.workshopReport.qualifiedQty,
        previousQualifiedQty: Number(savedEvidence.previousQualifiedQty ?? previousQualifiedQty),
        cumulativeQualifiedQty: Number(savedEvidence.cumulativeQualifiedQty ?? cumulativeQualifiedQty),
        remainingQty: Number(savedEvidence.remainingQty ?? remainingQty),
        carryOver: savedEvidence.carryOver ?? remainingQty > 0,
        nextWorkDate: savedEvidence.nextWorkDate ?? nextWorkDate,
        machineCount: transaction.workshopReport.machineCount ?? null,
        machineCountAffectsInventory: false,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: transaction.operationLogId,
      });
    },

    async recordProductionException({ workspace, productionTaskId, body = {}, operatorId }) {
      const beforeTask =
        findProductionTask(workspace, productionTaskId) ??
        buildProductionTaskFromBody(workspace, productionTaskId, body);
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
        return businessError(422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
      }
      if (isProductionTaskCompletedStatus(beforeTask.taskStatus ?? beforeTask.status)) {
        return businessError(409, "PRODUCTION_TASK_ALREADY_COMPLETED", "Completed production tasks cannot report a new exception.");
      }
      if (cleanText(beforeTask.taskStatus ?? beforeTask.status) === "已作废") {
        return businessError(409, "PRODUCTION_TASK_VOIDED", "Voided production tasks cannot report a new exception.");
      }

      const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
      const beforeOrderLine = findOrderLine(workspace, orderLineId);
      if (!beforeOrderLine) return notFound("ORDER_LINE_NOT_FOUND");
      const exceptionType = normalizeProductionExceptionType(body.exceptionType);
      if (!exceptionType) {
        return businessError(422, "VALIDATION_ERROR", "exceptionType must be one of the supported production exception types.");
      }
      const continuationMode = normalizeProductionExceptionContinuationMode(body.continuationMode);
      if (!continuationMode) {
        return businessError(422, "VALIDATION_ERROR", "continuationMode must be \"继续生产\" or \"暂停等确认\".");
      }
      const remark = cleanText(body.remark ?? body.reason);
      if (exceptionType === "其他" && !remark) {
        return businessError(422, "PRODUCTION_EXCEPTION_REMARK_REQUIRED", "Other production exceptions require a remark.");
      }
      const estimatedLossQty = Math.trunc(Number(body.estimatedLossQty ?? body.exceptionQty ?? 0));
      if (!Number.isFinite(estimatedLossQty) || estimatedLossQty < 0) {
        return businessError(422, "VALIDATION_ERROR", "estimatedLossQty must be greater than or equal to 0.");
      }

      const occurredAt = body.occurredAt ?? body.reportedAt ?? nowIso(now);
      const productionExceptionId =
        cleanText(body.productionExceptionId) ||
        nextPlainId("PEX", `${productionTaskId}-${(workspace.productionExceptions ?? []).length + 1}`);
      const paused = continuationMode === "暂停等确认";
      const productionTask = {
        ...beforeTask,
        productionTaskId,
        orderLineId,
        taskType: body.processType ?? beforeTask.taskType ?? "制袋",
        machineId: cleanText(beforeTask.machineId ?? body.machineId),
        plannedQty: Number(beforeTask.plannedQty ?? beforeTask.qty ?? beforeOrderLine.qty ?? beforeOrderLine.originalQty ?? 0),
        taskStatus: paused ? "异常暂停" : beforeTask.taskStatus ?? beforeTask.status ?? "制袋中",
        createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
      };
      const productionException = {
        productionExceptionId,
        bizNo: productionExceptionId,
        productionTaskId,
        orderLineId,
        processType: productionTask.taskType,
        machineId: productionTask.machineId,
        operatorId,
        exceptionType,
        continuationMode,
        status: paused ? "待生产确认" : "已记录待跟进",
        estimatedLossQty,
        affectsDelivery: body.affectsDelivery === true,
        remark,
        evidence: {
          ...(body.evidence ?? {}),
          taskStatusBeforePause: cleanText(beforeTask.taskStatus ?? beforeTask.status) || "制袋中",
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
          statementUpdated: false,
          reportedFrom: cleanText(body.entryLabel),
        },
        occurredAt,
        createdAt: occurredAt,
      };
      const todo = buildTodo(workspace, {
        id: `T-${productionExceptionId}`,
        bizNo: `T-${productionExceptionId}`,
        type: "生产异常",
        ref: productionTaskId,
        refType: "production_task",
        priority: paused || productionException.affectsDelivery ? "紧急" : "异常",
        status: "未处理",
        summary: `${exceptionType} / ${continuationMode}${remark ? ` / ${remark}` : ""}`,
        dueAt: productionException.affectsDelivery ? beforeOrderLine.latestNeededAt ?? beforeOrderLine.latest ?? "" : "",
        createdBy: operatorId,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
      const todoEvent = {
        eventId: `TE-${productionExceptionId}`,
        todoId: todo.id,
        eventType: "todo_source:production_exception_reported",
        eventPayload: {
          productionExceptionId,
          productionTaskId,
          exceptionType,
          continuationMode,
          status: productionException.status,
          estimatedLossQty,
          affectsDelivery: productionException.affectsDelivery,
        },
        operatorId,
        occurredAt,
        createdAt: occurredAt,
      };
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_task",
        targetId: productionTaskId,
        action: "record_production_exception",
        operatorId,
        before: beforeTask,
        after: {
          productionTask,
          productionException,
          todoId: todo.id,
          orderLine: summarizeOrderLineForChange(beforeOrderLine),
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
          statementUpdated: false,
        },
        reason: remark || exceptionType,
      });
      const transaction = await workspace.productionPackingTransactionRepository.recordProductionException({
        workspace,
        productionTask,
        productionException,
        orderLine: beforeOrderLine,
        todo,
        todoEvent,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });

      return success({
        productionTaskId,
        orderLineId,
        productionExceptionId: transaction.productionException.productionExceptionId,
        exceptionType: transaction.productionException.exceptionType,
        continuationMode: transaction.productionException.continuationMode,
        exceptionStatus: transaction.productionException.status,
        taskStatus: transaction.productionTask.taskStatus,
        status: transaction.productionTask.taskStatus,
        todoId: transaction.todo?.id ?? todo.id,
        estimatedLossQty: transaction.productionException.estimatedLossQty,
        affectsDelivery: transaction.productionException.affectsDelivery,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        statementUpdated: false,
        operationLogId: transaction.operationLogId,
      });
    },

    async resolveProductionException({ workspace, productionTaskId, body = {}, operatorId }) {
      const beforeTask = findProductionTask(workspace, productionTaskId);
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
        return businessError(422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
      }
      const productionExceptionId = cleanText(body.productionExceptionId);
      if (!productionExceptionId) {
        return businessError(422, "VALIDATION_ERROR", "productionExceptionId is required when handling a production exception.");
      }
      if (body.resolutionConfirmed !== true) {
        return businessError(
          422,
          "PRODUCTION_EXCEPTION_RESOLUTION_CONFIRMATION_REQUIRED",
          "Production exception handling requires an explicit confirmation marker.",
        );
      }
      const beforeException = findProductionException(workspace, productionExceptionId);
      if (!beforeException || cleanText(beforeException.productionTaskId ?? beforeException.production_task_id) !== productionTaskId) {
        return notFound("PRODUCTION_EXCEPTION_NOT_FOUND");
      }
      if (isTerminalProductionExceptionStatus(beforeException.status) && !cleanText(body.idempotencyKey)) {
        return businessError(409, "PRODUCTION_EXCEPTION_ALREADY_RESOLVED", "This production exception has already reached a terminal decision.");
      }
      const resolutionCode = normalizeProductionExceptionResolutionCode(body.resolutionCode);
      if (!resolutionCode) {
        return businessError(422, "VALIDATION_ERROR", "resolutionCode must be one of the supported production exception follow-up decisions.");
      }
      const resolutionNote = cleanText(body.resolutionNote ?? body.remark);
      if (!resolutionNote) {
        return businessError(422, "PRODUCTION_EXCEPTION_RESOLUTION_NOTE_REQUIRED", "Production exception handling requires a resolution note.");
      }
      const beforeTodo = findProductionExceptionTodo(workspace, productionExceptionId);
      if (!beforeTodo) return businessError(409, "PRODUCTION_EXCEPTION_TODO_NOT_FOUND", "The production exception follow-up todo is missing.");

      const resolution = getProductionExceptionResolution(resolutionCode);
      const resolvedAt = nowIso(now);
      const taskStatus = resolveProductionExceptionTaskStatus({ beforeTask, beforeException, resolutionCode });
      const resolutionEntry = {
        resolutionCode,
        resolutionLabel: resolution.label,
        resolutionNote,
        resolvedBy: operatorId,
        resolvedAt,
        taskStatus,
      };
      const previousEvidence = asObject(beforeException.evidence ?? beforeException.evidence_json);
      const resolutionHistory = [...(Array.isArray(previousEvidence.resolutionHistory) ? previousEvidence.resolutionHistory : []), resolutionEntry].slice(-10);
      const productionException = {
        ...beforeException,
        productionExceptionId,
        status: resolution.exceptionStatus,
        resolutionCode,
        resolutionNote,
        resolvedBy: operatorId,
        resolvedAt,
        evidence: {
          ...previousEvidence,
          lastResolution: resolutionEntry,
          resolutionHistory,
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
          statementUpdated: false,
        },
      };
      const productionTask = {
        ...beforeTask,
        productionTaskId,
        orderLineId: beforeTask.orderLineId ?? beforeTask.lineId,
        taskStatus,
        status: taskStatus,
        createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
        updatedAt: resolvedAt,
      };
      const todo = {
        ...beforeTodo,
        id: beforeTodo.id ?? beforeTodo.todoId,
        todoId: beforeTodo.todoId ?? beforeTodo.id,
        status: resolution.todoStatus,
        handled: resolution.todoStatus === "已处理",
        handledBy: resolution.todoStatus === "已处理" ? operatorId : "",
        handledAt: resolution.todoStatus === "已处理" ? resolvedAt : "",
        handlingResult: `${resolution.label}：${resolutionNote}`,
        summary: `${beforeException.exceptionType ?? "生产异常"} / ${resolution.label}${resolutionNote ? ` / ${resolutionNote}` : ""}`,
        updatedAt: resolvedAt,
      };
      const todoEvent = {
        eventId: nextPlainId("TE", `${productionExceptionId}-resolution-${resolutionCode}-${resolvedAt}`),
        todoId: todo.id,
        eventType: "todo_source:production_exception_resolved",
        eventPayload: {
          productionExceptionId,
          productionTaskId,
          ...resolutionEntry,
          exceptionStatus: productionException.status,
          todoStatus: todo.status,
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
          statementUpdated: false,
        },
        operatorId,
        occurredAt: resolvedAt,
        createdAt: resolvedAt,
      };
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_exception",
        targetId: productionExceptionId,
        action: "resolve_production_exception",
        operatorId,
        before: { productionTask: beforeTask, productionException: beforeException, todo: beforeTodo },
        after: {
          productionTask,
          productionException,
          todo,
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
          statementUpdated: false,
        },
        reason: resolutionNote,
      });
      const transaction = await workspace.productionPackingTransactionRepository.resolveProductionException({
        workspace,
        productionTask,
        productionException,
        todo,
        todoEvent,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });

      return success({
        productionTaskId,
        orderLineId: cleanText(transaction.productionTask.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId),
        productionExceptionId: transaction.productionException.productionExceptionId,
        exceptionStatus: transaction.productionException.status,
        resolutionCode: transaction.productionException.resolutionCode,
        resolutionLabel: resolution.label,
        resolutionNote: transaction.productionException.resolutionNote,
        resolvedBy: transaction.productionException.resolvedBy,
        resolvedAt: transaction.productionException.resolvedAt,
        taskStatus: transaction.productionTask.taskStatus,
        status: transaction.productionTask.taskStatus,
        todoId: transaction.todo?.id ?? todo.id,
        todoStatus: transaction.todo?.status ?? todo.status,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        statementUpdated: false,
        operationLogId: transaction.operationLogId,
      });
    },

    async completeProductionReport({ workspace, productionTaskId, body = {}, operatorId }) {
      const beforeTask =
        findProductionTask(workspace, productionTaskId) ??
        buildProductionTaskFromBody(workspace, productionTaskId, body);
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
        return businessError(422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
      }
      const idempotencyPayload = { ...body, operatorId };
      if (body.idempotencyKey) {
        const replay = await workspace.productionPackingTransactionRepository.findProductionReportIdempotentReplay?.({
          idempotencyKey: body.idempotencyKey,
          idempotencyPayload,
        });
        if (replay) return success(buildProductionReportResponse(replay, { productionTaskId }));
      }
      if (isProductionTaskCompletedStatus(beforeTask.taskStatus ?? beforeTask.status)) {
        return businessError(409, "PRODUCTION_TASK_ALREADY_COMPLETED", "Completed production tasks cannot submit another completion report.");
      }
      if (isProductionTaskExceptionPaused(beforeTask.taskStatus ?? beforeTask.status)) {
        return businessError(409, "PRODUCTION_TASK_EXCEPTION_PAUSED", "Paused production tasks require an explicit follow-up decision before completion reporting.");
      }
      const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
      const beforeOrderLine = findOrderLine(workspace, orderLineId);
      if (!beforeOrderLine) return notFound("ORDER_LINE_NOT_FOUND");
      if (String(beforeOrderLine.orderType ?? "").includes("外加工")) {
        return businessError(
          409,
          "PRODUCTION_REPORT_EXTERNAL_PROCESSING_NOT_INVENTORY",
          "External-processing print service reports do not create finished-goods inventory.",
        );
      }
      const qualifiedQty = Math.trunc(Number(body.qualifiedQty ?? 0));
      if (!Number.isFinite(qualifiedQty) || qualifiedQty <= 0) {
        return businessError(422, "VALIDATION_ERROR", "qualifiedQty must be greater than 0.");
      }
      const inventoryItem = body.inventoryItemId
        ? findInventoryItem(workspace, body.inventoryItemId)
        : findUniqueMatchingInventory(workspace, beforeOrderLine);
      if (!inventoryItem) return notFound("INVENTORY_ITEM_NOT_FOUND");

      const completedAt = body.completedAt ?? nowIso(now);
      const machineCount =
        body.machineCount === undefined || body.machineCount === null
          ? undefined
          : Math.trunc(Number(body.machineCount));
      const effectiveMachineId = cleanText(beforeTask.machineId ?? body.machineId);
      const productionTask = {
        ...beforeTask,
        productionTaskId,
        orderLineId,
        taskType: body.processType ?? beforeTask.taskType ?? "制袋",
        machineId: effectiveMachineId,
        plannedQty: Number(beforeTask.plannedQty ?? beforeTask.qty ?? beforeOrderLine.qty ?? qualifiedQty),
        taskStatus: "已完成",
        createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
      };
      const orderLine = {
        ...beforeOrderLine,
        orderLineId: beforeOrderLine.orderLineId ?? beforeOrderLine.id,
        lineStatus: body.createPackingTask === false ? "待出库" : "待打包",
        status: body.createPackingTask === false ? "待出库" : "待打包",
        exceptionTags: beforeOrderLine.exceptionTags ?? beforeOrderLine.exceptions ?? [],
      };
      const reportId =
        body.reportId ?? nextPlainId("WR", `${productionTaskId}-${(workspace.workshopReports ?? []).length + 1}`);
      const workshopReport = {
        reportId,
        productionTaskId,
        orderLineId,
        processType: body.processType ?? productionTask.taskType,
        machineId: effectiveMachineId,
        operatorId,
        qualifiedQty,
        exceptionQty: Math.max(0, Math.trunc(Number(body.exceptionQty ?? 0))),
        machineCount,
        startedAt: body.startedAt ?? "",
        completedAt,
        remark: body.remark ?? "",
        evidence: {
          ...(body.evidence ?? {}),
          machineCountLabel: machineCount === undefined ? "" : "机器计数/动作次数，非合格成品数量",
        },
        createdAt: completedAt,
      };
      const machineCapacityBaseline = buildProductionMachineCapacityBaseline({
        productionTask,
        workshopReport,
        orderLine: beforeOrderLine,
        inventoryItem,
        operatorId,
        completedAt,
      });
      const packingTask =
        body.createPackingTask === false
          ? null
          : {
              packingTaskId: body.packingTaskId ?? nextPlainId("PKT", orderLineId),
              bizNo: body.packingTaskBizNo ?? body.packingTaskId ?? nextPlainId("PKT", orderLineId),
              orderLineId,
              plannedQty: qualifiedQty,
              actualPackedQty: 0,
              status: "待打包",
              createdBy: operatorId,
              createdAt: completedAt,
            };
      const onHandBefore = Number(inventoryItem.inStock ?? inventoryItem.onHand ?? 0);
      const reservedBefore = Number(inventoryItem.reserved ?? 0);
      const reservation = {
        reservationId: body.reservationId ?? nextPlainId("RSV", `${productionTaskId}-PROD`),
        orderLineId,
        inventoryItemId: inventoryItem.id,
        reservedQty: qualifiedQty,
        reservationType: "生产完成待出库占用",
        status: "生效",
        createdBy: operatorId,
        createdAt: completedAt,
      };
      const inventoryLedgerEntries = [
        {
          ledgerId: body.inboundLedgerId ?? nextPlainId("LEDGER", `${reportId}-IN`),
          inventoryItemId: inventoryItem.id,
          changeType: "生产入库",
          qtyBefore: onHandBefore,
          qtyChange: qualifiedQty,
          qtyAfter: onHandBefore + qualifiedQty,
          sourceType: "production_report",
          sourceId: reportId,
          operatorId,
          confirmedBy: operatorId,
          occurredAt: completedAt,
          createdAt: completedAt,
          reason: "车间合格报工入库",
          remark: `合格数量 ${qualifiedQty}；机器计数 ${machineCount ?? "未填"} 不参与库存`,
        },
        {
          ledgerId: body.reserveLedgerId ?? nextPlainId("LEDGER", `${reportId}-RESERVE`),
          inventoryItemId: inventoryItem.id,
          changeType: "生产完成占用",
          qtyBefore: reservedBefore,
          qtyChange: qualifiedQty,
          qtyAfter: reservedBefore + qualifiedQty,
          sourceType: "production_report_reservation",
          sourceId: reportId,
          operatorId,
          confirmedBy: operatorId,
          occurredAt: completedAt,
          createdAt: completedAt,
          reason: "生产完成后锁定给订单明细",
          remark: `订单明细 ${orderLineId} 生产完成占用 ${qualifiedQty}`,
        },
      ];
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_task",
        targetId: productionTaskId,
        action: "complete_production_report",
        operatorId,
        before: beforeTask,
        after: {
          productionTask,
          workshopReport,
          orderLine: summarizeOrderLineForChange(orderLine),
          packingTaskId: packingTask?.packingTaskId ?? "",
          inventoryItemId: inventoryItem.id,
          qualifiedQty,
          machineCount: machineCount ?? null,
          capacityBaselineId: machineCapacityBaseline?.capacityBaselineId ?? "",
        },
        reason: body.remark ?? "生产报工完成",
      });
      const transaction = await workspace.productionPackingTransactionRepository.recordProductionReport({
        workspace,
        productionTask,
        workshopReport,
        orderLine,
        packingTask,
        machineCapacityBaseline,
        inventoryReservations: [reservation],
        inventoryAdjustments: [
          {
            inventoryItemId: inventoryItem.id,
            onHandQtyChange: qualifiedQty,
            reservedQtyChange: qualifiedQty,
            expectedRevision: Number(inventoryItem.revision ?? 1),
            expectedOnHandQty: onHandBefore,
            expectedReservedQty: reservedBefore,
          },
        ],
        inventoryLedgerEntries,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload,
      });

      return success(buildProductionReportResponse(transaction, { productionTaskId, orderLineId, inventoryItemId: inventoryItem.id }));
    },
  };
}

function buildProductionReportResponse(transaction, fallbacks = {}) {
  const productionTask = transaction.productionTask ?? {};
  const workshopReport = transaction.workshopReport ?? {};
  const orderLine = transaction.orderLine ?? {};
  const capacityBaseline = transaction.machineCapacityBaseline ?? null;
  const inventoryItemId =
    fallbacks.inventoryItemId ??
    transaction.inventoryItems?.[0]?.id ??
    transaction.inventoryLedgerEntries?.[0]?.inventoryItemId ??
    "";
  return {
    productionTaskId: productionTask.productionTaskId ?? productionTask.id ?? fallbacks.productionTaskId ?? "",
    reportId: workshopReport.reportId ?? "",
    orderLineId: workshopReport.orderLineId ?? productionTask.orderLineId ?? orderLine.orderLineId ?? orderLine.id ?? fallbacks.orderLineId ?? "",
    status: productionTask.taskStatus ?? productionTask.status ?? "",
    orderLineStatus: orderLine.lineStatus ?? orderLine.status ?? "",
    qualifiedQty: workshopReport.qualifiedQty ?? 0,
    machineCount: workshopReport.machineCount ?? null,
    machineCountAffectsInventory: false,
    capacityCalibrationCreated: Boolean(capacityBaseline?.capacityBaselineId),
    capacityBaselineId: capacityBaseline?.capacityBaselineId ?? "",
    capacityCalibration: capacityBaseline
      ? {
          capacityBaselineId: capacityBaseline.capacityBaselineId,
          machineId: capacityBaseline.machineId,
          sizeKey: capacityBaseline.sizeKey,
          dailyCapacityQty: capacityBaseline.dailyCapacityQty,
          sourceKind: capacityBaseline.sourceKind,
          confidence: capacityBaseline.confidence,
          effectiveFrom: capacityBaseline.effectiveFrom,
        }
      : null,
    inventoryItemId,
    reservationId: transaction.inventoryReservations?.[0]?.reservationId ?? "",
    packingTaskId: transaction.packingTask?.packingTaskId ?? "",
    inventoryLedgerIds: (transaction.inventoryLedgerEntries ?? []).map((entry) => entry.ledgerId),
    operationLogId: transaction.operationLogId ?? "",
  };
}

function buildProductionMachineCapacityBaseline({
  productionTask,
  workshopReport,
  orderLine,
  inventoryItem,
  operatorId,
  completedAt,
}) {
  const machineId = cleanText(workshopReport?.machineId ?? productionTask?.machineId);
  const sizeKey = buildProductionCapacitySizeKey(orderLine, inventoryItem);
  const qualifiedQty = Math.trunc(Number(workshopReport?.qualifiedQty ?? 0));
  const effectiveFrom = normalizeDateInput(completedAt);
  if (!machineId || !sizeKey || !Number.isFinite(qualifiedQty) || qualifiedQty <= 0 || !effectiveFrom) return null;
  return {
    capacityBaselineId: nextPlainId("MCB", `${machineId}-${sizeKey}-production-report-${effectiveFrom}`),
    machineId,
    sizeKey,
    dailyCapacityQty: qualifiedQty,
    hourlyCapacityQty: null,
    sourceKind: "production_report",
    confidence: "medium",
    effectiveFrom,
    remark: `生产报工 ${workshopReport.reportId} 合格 ${qualifiedQty}；机器计数仅作动作证据，不参与产能数量`,
    createdBy: operatorId,
    createdAt: completedAt,
  };
}

function sumProductionDailyProgressQty(workspace, input = {}) {
  const productionTaskId = cleanText(input.productionTaskId);
  const orderLineId = cleanText(input.orderLineId);
  const excludeReportId = cleanText(input.excludeReportId);
  return (workspace.workshopReports ?? []).reduce((total, report) => {
    const reportId = cleanText(report?.reportId ?? report?.id);
    if (excludeReportId && reportId === excludeReportId) return total;
    const matchesTask =
      productionTaskId && cleanText(report?.productionTaskId ?? report?.production_task_id) === productionTaskId;
    const matchesLine = orderLineId && cleanText(report?.orderLineId ?? report?.order_line_id) === orderLineId;
    const evidence = report?.evidence ?? report?.evidence_json ?? {};
    if (!(matchesTask || matchesLine) || evidence?.reportKind !== "daily_progress") return total;
    return total + Math.max(0, Math.trunc(Number(report.qualifiedQty ?? report.qualified_qty ?? 0)));
  }, 0);
}

function getNextDateText(value) {
  const dateText = normalizeDateInput(value);
  if (!dateText) return "";
  const [year, month, day] = dateText.split("-").map((item) => Number(item));
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function buildProductionCapacitySizeKey(orderLine, inventoryItem) {
  const sizeText = cleanText(
    orderLine?.size ??
      orderLine?.productSize ??
      orderLine?.specSize ??
      orderLine?.standardSize ??
      inventoryItem?.size ??
      inventoryItem?.model,
  );
  return sizeText.replace(/\s+/g, "");
}

function findUniqueMatchingInventory(workspace, line) {
  const matches = (workspace.inventories ?? []).filter(
    (item) =>
      item.size === line.size &&
      item.color === (line.color ?? line.bagColor) &&
      item.handle === (line.handle ?? line.handleType) &&
      item.style === line.style &&
      !String(item.state ?? "").includes("待处理") &&
      !String(item.state ?? "").includes("报废"),
  );
  return matches.length === 1 ? matches[0] : null;
}

const productionExceptionTypes = new Set([
  "印刷问题",
  "材料问题",
  "机器问题",
  "尺寸/模具问题",
  "数量异常",
  "客户/订单信息不清",
  "其他",
]);

function normalizeProductionExceptionType(value) {
  const type = cleanText(value);
  return productionExceptionTypes.has(type) ? type : "";
}

function normalizeProductionExceptionContinuationMode(value) {
  const mode = cleanText(value);
  return mode === "继续生产" || mode === "暂停等确认" ? mode : "";
}

const productionExceptionResolutions = Object.freeze({
  继续生产: { label: "继续生产", exceptionStatus: "已恢复生产", todoStatus: "已处理" },
  改任务顺序: { label: "待调序", exceptionStatus: "待调序", todoStatus: "处理中" },
  "等待材料/维修": { label: "等待材料/维修", exceptionStatus: "等待材料/维修", todoStatus: "处理中" },
  转数量差异处理: { label: "已转数量差异处理", exceptionStatus: "已转数量差异处理", todoStatus: "处理中" },
  "转售后/质量问题": { label: "已转售后/质量问题", exceptionStatus: "已转售后/质量问题", todoStatus: "处理中" },
  "取消/作废任务": { label: "已作废任务", exceptionStatus: "已作废", todoStatus: "已处理" },
});

function normalizeProductionExceptionResolutionCode(value) {
  const code = cleanText(value);
  return productionExceptionResolutions[code] ? code : "";
}

function getProductionExceptionResolution(code) {
  return productionExceptionResolutions[code];
}

function resolveProductionExceptionTaskStatus({ beforeTask, beforeException, resolutionCode }) {
  if (resolutionCode === "取消/作废任务") return "已作废";
  if (resolutionCode === "转数量差异处理") return "数量差异待处理";
  if (resolutionCode !== "继续生产") return "异常暂停";
  const statusBeforePause = cleanText(
    asObject(beforeException.evidence ?? beforeException.evidence_json).taskStatusBeforePause ??
      beforeTask.taskStatus ??
      beforeTask.status,
  );
  return ["", "异常暂停", "数量差异待处理", "已完成", "已作废", "待完工确认"].includes(statusBeforePause)
    ? "制袋中"
    : statusBeforePause;
}

function isTerminalProductionExceptionStatus(value) {
  return ["已恢复生产", "已作废"].includes(cleanText(value));
}

function findProductionException(workspace, productionExceptionId) {
  return (workspace.productionExceptions ?? []).find(
    (record) => cleanText(record.productionExceptionId ?? record.id) === productionExceptionId,
  ) ?? null;
}

function findProductionExceptionTodo(workspace, productionExceptionId) {
  const expectedTodoId = `T-${productionExceptionId}`;
  return (workspace.todos ?? []).find(
    (todo) => cleanText(todo.id ?? todo.todoId) === expectedTodoId,
  ) ?? null;
}

function isProductionTaskExceptionPaused(value) {
  return ["异常暂停", "数量差异待处理", "已作废"].includes(cleanText(value));
}

function normalizeDateInput(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))) return text;
  if (!Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString().slice(0, 10);
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

function nextPlainId(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
