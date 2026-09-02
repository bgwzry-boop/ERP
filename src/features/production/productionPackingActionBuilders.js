export function isProductionReportingBlocked(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  return ["异常暂停", "数量差异待处理", "已作废"].includes(status);
}

export function buildScheduleActionIdempotencyKey(action, payload = {}) {
  const taskId = payload.productionTaskId || payload.machineId || "queue";
  const revision = Number(payload.expectedRevision ?? 0);
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const actionToken = {
    发布排产: "publish",
    移动排产任务: "move",
    调整排产顺序: "resequence",
  }[action] ?? "action";
  return `production-schedule:${actionToken}:${taskId}:${revision}:${uuid}`;
}

export function buildProductionReportActionPayload({
  kind,
  selectedProductionLine,
  findCustomer,
  buildProductionTaskId,
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  reportQualifiedQty,
  reportExceptionQty,
  reportMachineCount,
}) {
  if (!selectedProductionLine) return null;
  const customer = findCustomer(selectedProductionLine.customerId);
  const qualifiedQty = Number(reportQualifiedQty || 0);
  return {
    entryLabel: "生产/打包工作台",
    productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
    productionTask: selectedProductionLine.productionTask ?? selectedProductionLine,
    orderLineId: selectedProductionLine.id,
    orderLine: selectedProductionLine,
    customerName: customer?.name ?? selectedProductionLine.customerName ?? "",
    goodsSummary: [
      selectedProductionLine.product ?? selectedProductionLine.productName,
      selectedProductionLine.size,
      getLineColorSpecLabel(selectedProductionLine),
      getLinePrintSide(selectedProductionLine),
      getLineRemark(selectedProductionLine),
    ].filter(Boolean).join(" · "),
    ...(kind === "daily" ? { dailyQualifiedQty: qualifiedQty } : { qualifiedQty }),
    exceptionQty: Number(reportExceptionQty || 0),
    machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
  };
}

export function buildProductionExceptionActionPayload({
  selectedProductionLine,
  buildProductionTaskId,
  productionExceptionType,
  continuationMode,
  productionExceptionLossQty,
  productionExceptionAffectsDelivery,
  productionExceptionRemark,
}) {
  if (!selectedProductionLine || !productionExceptionType) return null;
  return {
    entryLabel: "生产/打包工作台",
    productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
    orderLineId: selectedProductionLine.id,
    orderLine: selectedProductionLine,
    exceptionType: productionExceptionType,
    continuationMode,
    estimatedLossQty: Number(productionExceptionLossQty || 0),
    affectsDelivery: productionExceptionAffectsDelivery,
    remark: productionExceptionRemark,
  };
}

export function buildProductionExceptionResolutionConfirmation({
  selectedProductionLine,
  latestProductionException,
  productionExceptionResolutionCode,
  productionExceptionResolutionNote,
  buildProductionTaskId,
  findCustomer,
  resolutionOptions,
  buildResolutionEffects,
}) {
  if (!selectedProductionLine || !latestProductionException || !productionExceptionResolutionCode || !productionExceptionResolutionNote) {
    return null;
  }
  const resolutionLabel =
    resolutionOptions.find((item) => item.value === productionExceptionResolutionCode)?.label ??
    productionExceptionResolutionCode;
  const productionTaskId = selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine);
  return {
    payload: {
      entryLabel: "生产/打包工作台",
      productionTaskId,
      orderLineId: selectedProductionLine.id,
      orderLine: selectedProductionLine,
      productionException: latestProductionException,
      productionExceptionId: latestProductionException.productionExceptionId,
      resolutionCode: productionExceptionResolutionCode,
      resolutionNote: productionExceptionResolutionNote,
    },
    summary: {
      title: `确认异常处理：${resolutionLabel}`,
      fields: [
        { label: "生产任务", value: productionTaskId },
        { label: "客户", value: findCustomer(selectedProductionLine.customerId).name },
        { label: "货品", value: `${selectedProductionLine.product ?? selectedProductionLine.productName ?? ""} / ${selectedProductionLine.size ?? ""}` },
        { label: "异常", value: `${latestProductionException.exceptionType ?? "生产异常"} / ${latestProductionException.status ?? "待处理"}` },
        { label: "处理结果", value: resolutionLabel },
        { label: "处理说明", value: productionExceptionResolutionNote },
      ],
      effects: buildResolutionEffects(productionExceptionResolutionCode),
    },
  };
}

export function buildPackingCompletionActionPayload({
  selectedPackingTask,
  findCustomer,
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  packingActualQty,
  packingPackageCount,
}) {
  if (!selectedPackingTask?.orderLine) return null;
  const orderLine = selectedPackingTask.orderLine;
  const customer = findCustomer(orderLine.customerId);
  return {
    entryLabel: "生产/打包工作台",
    packingTaskId: selectedPackingTask.packingTaskId,
    packingTask: selectedPackingTask,
    orderLineId: selectedPackingTask.orderLineId,
    orderLine,
    customerName: customer?.name ?? orderLine.customerName ?? "",
    goodsSummary: [
      orderLine.product ?? orderLine.productName,
      orderLine.size,
      getLineColorSpecLabel(orderLine),
      getLinePrintSide(orderLine),
      getLineRemark(orderLine),
    ].filter(Boolean).join(" · "),
    actualPackedQty: Number(packingActualQty || 0),
    packageCount: Number(packingPackageCount || 1),
  };
}

export function buildScheduleResequenceConfirmation({
  selectedScheduleQueueItem,
  selectedMachineScheduleQueueItems,
  nextOrderedItems,
  scheduleDecisionPayload,
  direction,
}) {
  if (!selectedScheduleQueueItem || !nextOrderedItems.length) return null;
  const directionLabel = direction === "up" ? "上移" : "下移";
  const summary = `${selectedScheduleQueueItem.machineId} 队列${directionLabel} ${selectedScheduleQueueItem.productionTaskId}`;
  return {
    action: "调整排产顺序",
    payload: {
      ...scheduleDecisionPayload(summary),
      machineId: selectedScheduleQueueItem.machineId,
      businessDecisionTargetId: selectedScheduleQueueItem.productionTaskId,
      orderedProductionTaskIds: nextOrderedItems.map((item) => item.productionTaskId),
      affectedRevisions: selectedMachineScheduleQueueItems.map((item) => ({
        productionTaskId: item.productionTaskId,
        revision: Number(item.revision ?? 0),
      })),
      expectedRevision: selectedMachineScheduleQueueItems.reduce(
        (sum, item) => sum + Number(item.revision ?? 0),
        0,
      ),
      remark: `${selectedScheduleQueueItem.machineId} ${selectedScheduleQueueItem.productionTaskId} ${directionLabel}`,
    },
    summary,
    effects: `将同机台 ${nextOrderedItems.length} 条任务按新顺序整体写入；不改库存、合格数量、打包或对账。`,
  };
}

export function buildScheduleMoveConfirmation({
  selectedScheduleQueueItem,
  queueMoveTargetMachineId,
  queueMoveTargetSeq,
  queueMoveReason,
  queueMoveImpact,
  scheduleDecisionPayload,
}) {
  if (!selectedScheduleQueueItem || !queueMoveTargetMachineId) return null;
  const summary = `${selectedScheduleQueueItem.productionTaskId} 调整到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}`;
  return {
    action: "移动排产任务",
    payload: {
      ...scheduleDecisionPayload(summary),
      productionTaskId: selectedScheduleQueueItem.productionTaskId,
      expectedRevision: Number(selectedScheduleQueueItem.revision ?? 0),
      orderLineId: selectedScheduleQueueItem.orderLineId,
      sourceMachineId: selectedScheduleQueueItem.machineId,
      targetMachineId: queueMoveTargetMachineId,
      targetQueueSeq: queueMoveTargetSeq,
      reasonCode: queueMoveReason.value,
      reasonLabel: queueMoveReason.label,
      impactSummary: queueMoveImpact.remark,
      remark: `${queueMoveReason.label}：${selectedScheduleQueueItem.productionTaskId} 从 ${selectedScheduleQueueItem.machineId} 移到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}；${queueMoveImpact.remark}`,
    },
    summary,
    effects: `${queueMoveImpact.remark}；更新受影响排产记录、决定证据和审计，不改库存、报工或对账。`,
  };
}
