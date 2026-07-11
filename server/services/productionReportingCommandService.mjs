export function createProductionReportingCommandService({
  buildOperationLog,
  buildProductionTaskFromBody,
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

    async completeProductionReport({ workspace, productionTaskId, body = {}, operatorId }) {
      const beforeTask =
        findProductionTask(workspace, productionTaskId) ??
        buildProductionTaskFromBody(workspace, productionTaskId, body);
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
        return businessError(422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
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
        idempotencyPayload: { ...body, operatorId },
      });

      return success({
        productionTaskId,
        reportId: transaction.workshopReport.reportId,
        orderLineId,
        status: transaction.productionTask.taskStatus,
        orderLineStatus: transaction.orderLine?.lineStatus ?? orderLine.status,
        qualifiedQty: transaction.workshopReport.qualifiedQty,
        machineCount: transaction.workshopReport.machineCount ?? null,
        machineCountAffectsInventory: false,
        capacityCalibrationCreated: Boolean(transaction.machineCapacityBaseline?.capacityBaselineId),
        capacityBaselineId: transaction.machineCapacityBaseline?.capacityBaselineId ?? "",
        capacityCalibration: transaction.machineCapacityBaseline
          ? {
              capacityBaselineId: transaction.machineCapacityBaseline.capacityBaselineId,
              machineId: transaction.machineCapacityBaseline.machineId,
              sizeKey: transaction.machineCapacityBaseline.sizeKey,
              dailyCapacityQty: transaction.machineCapacityBaseline.dailyCapacityQty,
              sourceKind: transaction.machineCapacityBaseline.sourceKind,
              confidence: transaction.machineCapacityBaseline.confidence,
              effectiveFrom: transaction.machineCapacityBaseline.effectiveFrom,
            }
          : null,
        inventoryItemId: inventoryItem.id,
        reservationId: transaction.inventoryReservations[0]?.reservationId ?? reservation.reservationId,
        packingTaskId: transaction.packingTask?.packingTaskId ?? "",
        inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
        operationLogId: transaction.operationLogId,
      });
    },
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

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
