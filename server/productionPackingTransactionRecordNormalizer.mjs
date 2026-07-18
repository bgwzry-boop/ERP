export function normalizeProductionReportTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      productionTask: null,
      workshopReport: null,
      orderLine: null,
      packingTask: null,
      machineCapacityBaseline: null,
      inventoryReservations: [],
      inventoryItems: [],
      inventoryLedgerEntries: [],
      operationLogId: "",
    };
  }
  return {
    productionTask: normalizeProductionTask(value.productionTask ?? value.production_task),
    workshopReport: normalizeWorkshopReport(value.workshopReport ?? value.workshop_report),
    orderLine: normalizeOrderLine(value.orderLine ?? value.order_line),
    packingTask: normalizePackingTask(value.packingTask ?? value.packing_task),
    machineCapacityBaseline: normalizeMachineCapacityBaseline(value.machineCapacityBaseline ?? value.machine_capacity_baseline),
    inventoryReservations: normalizeInventoryReservations(value.inventoryReservations ?? value.inventory_reservations ?? []),
    inventoryItems: normalizeInventoryItems(value.inventoryItems ?? value.inventory_items ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeProductionDailyProgressTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { productionTask: null, workshopReport: null, operationLogId: "" };
  }
  return {
    productionTask: normalizeProductionTask(value.productionTask ?? value.production_task),
    workshopReport: normalizeWorkshopReport(value.workshopReport ?? value.workshop_report),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeProductionExceptionTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { productionTask: null, productionException: null, todo: null, todoEvent: null, operationLogId: "" };
  }
  return {
    productionTask: normalizeProductionTask(value.productionTask ?? value.production_task),
    productionException: normalizeProductionException(value.productionException ?? value.production_exception),
    todo: normalizeTodo(value.todo),
    todoEvent: normalizeTodoEvent(value.todoEvent ?? value.todo_event),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeProductionSchedulePublishTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { productionTask: null, productionScheduleRecord: null, orderLine: null, operationLogId: "" };
  }
  return {
    productionTask: normalizeProductionTask(value.productionTask ?? value.production_task),
    productionScheduleRecord: normalizeProductionScheduleRecord(
      value.productionScheduleRecord ?? value.production_schedule_record,
    ),
    orderLine: normalizeOrderLine(value.orderLine ?? value.order_line),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeProductionScheduleRecord(record) {
  if (!record || typeof record !== "object") return null;
  const scheduleRecordId = String(record.scheduleRecordId ?? record.schedule_record_id ?? record.id ?? "").trim();
  const productionTaskId = String(record.productionTaskId ?? record.production_task_id ?? "").trim();
  const machineId = String(record.machineId ?? record.machine_id ?? "").trim();
  if (!scheduleRecordId || !productionTaskId || !machineId) return null;
  const status = String(record.status ?? record.scheduleStatus ?? record.schedule_status ?? "active").trim() || "active";
  return {
    ...record,
    id: scheduleRecordId,
    scheduleRecordId,
    bizNo: String(record.bizNo ?? record.biz_no ?? scheduleRecordId).trim() || scheduleRecordId,
    productionTaskId,
    orderLineId: String(record.orderLineId ?? record.order_line_id ?? "").trim(),
    publishedScheduleId: String(record.publishedScheduleId ?? record.published_schedule_id ?? "").trim(),
    machineId,
    queueSeq: Math.max(0, toFiniteInteger(record.queueSeq ?? record.queue_seq, 0)),
    status,
    scheduleStatus: status,
    sourceKind: String(record.sourceKind ?? record.source_kind ?? record.source ?? "schedule_publish").trim() || "schedule_publish",
    revision: positiveRevision(record.revision),
    sequenceUpdatedAt: record.sequenceUpdatedAt ?? record.sequence_updated_at ?? "",
    sequenceUpdatedBy: String(record.sequenceUpdatedBy ?? record.sequence_updated_by ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? record.updated_at ?? "",
  };
}

export function normalizePackingCompletionTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      packingTask: null,
      packages: [],
      fulfillment: null,
      orderLine: null,
      inventoryItems: [],
      inventoryLedgerEntries: [],
      todo: null,
      todoEvent: null,
      operationLogId: "",
    };
  }
  return {
    packingTask: normalizePackingTask(value.packingTask ?? value.packing_task),
    packages: normalizePackages(value.packages ?? []),
    fulfillment: normalizeFulfillment(value.fulfillment),
    orderLine: normalizeOrderLine(value.orderLine ?? value.order_line),
    inventoryItems: normalizeInventoryItems(value.inventoryItems ?? value.inventory_items ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    todo: normalizeTodo(value.todo),
    todoEvent: normalizeTodoEvent(value.todoEvent ?? value.todo_event),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeProductionTask(record) {
  if (!record || typeof record !== "object") return null;
  const productionTaskId = String(record.productionTaskId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  if (!productionTaskId || !orderLineId) return null;
  return {
    ...record,
    productionTaskId,
    bizNo: String(record.bizNo ?? record.biz_no ?? productionTaskId).trim() || productionTaskId,
    orderLineId,
    taskType: String(record.taskType ?? record.task_type ?? "制袋").trim() || "制袋",
    machineId: String(record.machineId ?? record.machine_id ?? "").trim(),
    plannedQty: toFiniteInteger(record.plannedQty ?? record.planned_qty ?? record.qty),
    taskStatus: String(record.taskStatus ?? record.task_status ?? record.status ?? "待开始").trim() || "待开始",
    publishedScheduleId: String(record.publishedScheduleId ?? record.published_schedule_id ?? "").trim(),
    revision: positiveRevision(record.revision),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? record.updated_at ?? "",
  };
}

export function normalizeWorkshopReport(record) {
  if (!record || typeof record !== "object") return null;
  const reportId = String(record.reportId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!reportId || !orderLineId) return null;
  return {
    reportId,
    productionTaskId: String(record.productionTaskId ?? record.production_task_id ?? "").trim(),
    orderLineId,
    processType: String(record.processType ?? record.process_type ?? "制袋").trim() || "制袋",
    machineId: String(record.machineId ?? record.machine_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    qualifiedQty: toFiniteInteger(record.qualifiedQty ?? record.qualified_qty ?? 0),
    exceptionQty: toFiniteInteger(record.exceptionQty ?? record.exception_qty ?? 0),
    machineCount: optionalInteger(record.machineCount ?? record.machine_count),
    startedAt: record.startedAt ?? record.started_at ?? "",
    completedAt: record.completedAt ?? record.completed_at ?? new Date().toISOString(),
    remark: String(record.remark ?? "").trim(),
    evidence: normalizeObject(record.evidence ?? record.evidence_json),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

export function normalizeProductionException(record) {
  if (!record || typeof record !== "object") return null;
  const productionExceptionId = String(record.productionExceptionId ?? record.id ?? "").trim();
  const productionTaskId = String(record.productionTaskId ?? record.production_task_id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  const exceptionType = String(record.exceptionType ?? record.exception_type ?? "").trim();
  const continuationMode = String(record.continuationMode ?? record.continuation_mode ?? "").trim();
  if (!productionExceptionId || !productionTaskId || !orderLineId || !exceptionType || !continuationMode) return null;
  return {
    productionExceptionId,
    bizNo: String(record.bizNo ?? record.biz_no ?? productionExceptionId).trim() || productionExceptionId,
    productionTaskId,
    orderLineId,
    processType: String(record.processType ?? record.process_type ?? "制袋").trim() || "制袋",
    machineId: String(record.machineId ?? record.machine_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    exceptionType,
    continuationMode,
    status: String(record.status ?? "待生产确认").trim() || "待生产确认",
    resolutionCode: String(record.resolutionCode ?? record.resolution_code ?? "").trim(),
    resolutionNote: String(record.resolutionNote ?? record.resolution_note ?? "").trim(),
    resolvedBy: String(record.resolvedBy ?? record.resolved_by ?? "").trim(),
    resolvedAt: record.resolvedAt ?? record.resolved_at ?? "",
    estimatedLossQty: Math.max(0, toFiniteInteger(record.estimatedLossQty ?? record.estimated_loss_qty ?? 0)),
    affectsDelivery: record.affectsDelivery === true || record.affects_delivery === true,
    remark: String(record.remark ?? "").trim(),
    evidence: normalizeObject(record.evidence ?? record.evidence_json),
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

export function normalizePackingTask(record) {
  if (!record || typeof record !== "object") return null;
  const packingTaskId = String(record.packingTaskId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  if (!packingTaskId || !orderLineId) return null;
  return {
    ...record,
    packingTaskId,
    bizNo: String(record.bizNo ?? record.biz_no ?? packingTaskId).trim() || packingTaskId,
    orderLineId,
    plannedQty: toFiniteInteger(record.plannedQty ?? record.planned_qty ?? record.qty),
    actualPackedQty: toFiniteInteger(record.actualPackedQty ?? record.actual_packed_qty ?? 0),
    status: String(record.status ?? "待打包").trim() || "待打包",
    revision: positiveRevision(record.revision),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

export function normalizeMachineCapacityBaseline(record) {
  if (!record || typeof record !== "object") return null;
  const capacityBaselineId = String(record.capacityBaselineId ?? record.id ?? "").trim();
  const machineId = String(record.machineId ?? record.machine_id ?? "").trim();
  const sizeKey = String(record.sizeKey ?? record.size_key ?? "").trim();
  if (!capacityBaselineId || !machineId || !sizeKey) return null;
  return {
    capacityBaselineId,
    machineId,
    sizeKey,
    dailyCapacityQty: toFiniteInteger(record.dailyCapacityQty ?? record.daily_capacity_qty ?? 0),
    hourlyCapacityQty: optionalInteger(record.hourlyCapacityQty ?? record.hourly_capacity_qty),
    sourceKind: String(record.sourceKind ?? record.source_kind ?? "production_report").trim() || "production_report",
    confidence: String(record.confidence ?? "medium").trim() || "medium",
    effectiveFrom: normalizeDateText(record.effectiveFrom ?? record.effective_from),
    remark: String(record.remark ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

export function normalizePackages(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizePackage(record)).filter(Boolean);
}

export function normalizePackage(record) {
  if (!record || typeof record !== "object") return null;
  const packageId = String(record.packageId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!packageId || !orderLineId) return null;
  return {
    packageId,
    bizNo: String(record.bizNo ?? record.biz_no ?? packageId).trim() || packageId,
    orderLineId,
    fulfillmentId: String(record.fulfillmentId ?? record.fulfillment_id ?? "").trim(),
    packageSeq: toFiniteInteger(record.packageSeq ?? record.package_seq ?? 1),
    packageCount: toFiniteInteger(record.packageCount ?? record.package_count ?? 1),
    packedQty: toFiniteInteger(record.packedQty ?? record.packed_qty ?? record.qty),
    labelPrintRecordId: String(record.labelPrintRecordId ?? record.label_print_record_id ?? "").trim(),
    status: String(record.status ?? "待打印标签").trim() || "待打印标签",
    revision: positiveRevision(record.revision),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

export function normalizeFulfillment(record) {
  if (!record || typeof record !== "object") return null;
  const fulfillmentId = String(record.fulfillmentId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  if (!fulfillmentId || !orderLineId) return null;
  return {
    ...record,
    fulfillmentId,
    orderLineId,
    expectedQty: toFiniteInteger(record.expectedQty ?? record.expected_qty ?? record.qty),
    actualQty: optionalInteger(record.actualQty ?? record.actual_qty),
    status: String(record.status ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    revision: positiveRevision(record.revision),
  };
}

export function normalizeOrderLine(record) {
  if (!record || typeof record !== "object") return null;
  const orderLineId = String(record.orderLineId ?? record.id ?? "").trim();
  if (!orderLineId) return null;
  return {
    ...record,
    orderLineId,
    lineStatus: String(record.lineStatus ?? record.line_status ?? record.status ?? "").trim(),
    revision: positiveRevision(record.revision),
    exceptionTags: Array.isArray(record.exceptionTags)
      ? record.exceptionTags
      : Array.isArray(record.exception_tags)
        ? record.exception_tags
        : Array.isArray(record.exceptions)
          ? record.exceptions
          : [],
  };
}

export function normalizeInventoryReservations(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryReservation(record)).filter(Boolean);
}

export function normalizeInventoryReservation(record) {
  if (!record || typeof record !== "object") return null;
  const reservationId = String(record.reservationId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!reservationId || !orderLineId || !inventoryItemId) return null;
  return {
    reservationId,
    orderLineId,
    inventoryItemId,
    reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.qty),
    reservationType: String(record.reservationType ?? record.reservation_type ?? "生产完成待出库占用").trim() || "生产完成待出库占用",
    status: String(record.status ?? "生效").trim() || "生效",
    expiresAt: record.expiresAt ?? record.expires_at ?? "",
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

export function normalizeInventoryAdjustments(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryAdjustment(record)).filter(Boolean);
}

export function normalizeInventoryAdjustment(record) {
  if (!record || typeof record !== "object") return null;
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!inventoryItemId) return null;
  return {
    inventoryItemId,
    onHandQtyChange: toFiniteInteger(record.onHandQtyChange ?? record.on_hand_qty_change ?? 0),
    reservedQtyChange: toFiniteInteger(record.reservedQtyChange ?? record.reserved_qty_change ?? 0),
    waitingPickupLockedQtyChange: toFiniteInteger(record.waitingPickupLockedQtyChange ?? record.waiting_pickup_locked_qty_change ?? 0),
    expectedRevision: optionalInteger(record.expectedRevision ?? record.expected_revision),
    expectedOnHandQty: optionalInteger(record.expectedOnHandQty ?? record.expected_on_hand_qty),
    expectedReservedQty: optionalInteger(record.expectedReservedQty ?? record.expected_reserved_qty),
  };
}

export function normalizeInventoryItems(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryItem(record)).filter(Boolean);
}

export function normalizeInventoryItem(record) {
  if (!record || typeof record !== "object") return null;
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? record.id ?? "").trim();
  if (!inventoryItemId) return null;
  return {
    inventoryItemId,
    onHandQty: toFiniteInteger(record.onHandQty ?? record.on_hand_qty ?? record.inStock),
    reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.reserved),
    waitingPickupLockedQty: toFiniteInteger(record.waitingPickupLockedQty ?? record.waiting_pickup_locked_qty ?? record.locked),
    revision: positiveRevision(record.revision),
  };
}

export function normalizeInventoryLedgerEntries(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryLedgerEntry(record)).filter(Boolean);
}

export function normalizeInventoryLedgerEntry(record) {
  if (!record || typeof record !== "object") return null;
  const ledgerId = String(record.ledgerId ?? record.id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!ledgerId || !inventoryItemId) return null;
  return {
    ledgerId,
    inventoryItemId,
    changeType: String(record.changeType ?? record.change_type ?? "").trim() || "生产入库",
    qtyBefore: toFiniteInteger(record.qtyBefore ?? record.qty_before ?? 0),
    qtyChange: toFiniteInteger(record.qtyChange ?? record.qty_change ?? 0),
    qtyAfter: toFiniteInteger(record.qtyAfter ?? record.qty_after ?? 0),
    sourceType: String(record.sourceType ?? record.source_type ?? "production_report").trim() || "production_report",
    sourceId: String(record.sourceId ?? record.source_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    reason: String(record.reason ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
  };
}

export function normalizeTodo(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id ?? record.todoId ?? "").trim();
  const refId = String(record.refId ?? record.ref ?? "").trim();
  const refType = String(record.refType ?? "").trim();
  if (!id || !record.type || !refId || !refType) return null;
  return {
    ...record,
    id,
    todoId: id,
    bizNo: String(record.bizNo ?? id).trim() || id,
    type: String(record.type).trim(),
    ref: refId,
    refType,
    refId,
    priority: String(record.priority ?? record.urgency ?? "普通").trim() || "普通",
    status: record.handled ? "已处理" : String(record.status ?? "未处理").trim() || "未处理",
    summary: String(record.summary ?? "").trim(),
    dueAt: record.dueAt ?? "",
    remindAt: record.remindAt ?? "",
    handledBy: String(record.handledBy ?? "").trim(),
    handledAt: record.handledAt ?? "",
    handlingResult: String(record.handlingResult ?? "").trim(),
    createdBy: String(record.createdBy ?? "").trim(),
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}

export function normalizeTodoEvent(record) {
  if (!record || typeof record !== "object") return null;
  const eventId = String(record.eventId ?? record.id ?? "").trim();
  const todoId = String(record.todoId ?? "").trim();
  if (!eventId || !todoId) return null;
  return {
    ...record,
    eventId,
    todoId,
    eventType: String(record.eventType ?? "todo_source:packing_completed").trim(),
    eventPayload: record.eventPayload ?? {},
    operatorId: String(record.operatorId ?? "").trim(),
    occurredAt: record.occurredAt ?? new Date().toISOString(),
    createdAt: record.createdAt ?? new Date().toISOString(),
  };
}

export function normalizeOperationLog(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    targetType: String(record.targetType ?? record.target_type ?? "").trim(),
    targetId: String(record.targetId ?? record.target_id ?? "").trim(),
    action: String(record.action ?? "").trim(),
    before: record.before ?? null,
    after: record.after ?? null,
    reason: String(record.reason ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    pageKey: String(record.pageKey ?? record.page_key ?? "api").trim() || "api",
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  return toFiniteInteger(value);
}

function normalizeDateText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toFiniteInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}
