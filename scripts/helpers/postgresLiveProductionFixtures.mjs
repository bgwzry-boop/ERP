export function buildProductionTaskRecord(overrides = {}) {
  return {
    productionTaskId: "PT-LIVE-PROD-001",
    id: "PT-LIVE-PROD-001",
    bizNo: "PT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    taskType: "制袋",
    machineId: "BAG-LIVE-01",
    plannedQty: 80,
    taskStatus: "制袋中",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

export function buildWorkshopReportRecord(overrides = {}) {
  return {
    reportId: "WR-LIVE-PROD-001",
    productionTaskId: "PT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    processType: "制袋",
    machineId: "BAG-LIVE-01",
    operatorId: "U-OFFICE-A",
    qualifiedQty: 80,
    exceptionQty: 0,
    machineCount: 8888,
    completedAt: "2026-07-02T12:30:00.000Z",
    remark: "Postgres live production report",
    evidence: { machineCountLabel: "机器计数/动作次数，非合格成品数量" },
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

export function buildPackingTaskRecord(overrides = {}) {
  return {
    packingTaskId: "PKT-LIVE-PROD-001",
    id: "PKT-LIVE-PROD-001",
    bizNo: "PKT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    plannedQty: 80,
    actualPackedQty: 0,
    status: "待打包",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

export function buildMachineCapacityBaselineRecord(overrides = {}) {
  return {
    capacityBaselineId: "MCB-LIVE-PROD-001",
    id: "MCB-LIVE-PROD-001",
    machineId: "BAG-LIVE-01",
    sizeKey: "30*38*10",
    dailyCapacityQty: 80,
    hourlyCapacityQty: null,
    sourceKind: "production_report",
    confidence: "medium",
    effectiveFrom: "2026-07-02",
    remark: "Postgres live production capacity calibration",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

export function buildProductionOrderLineRecord(overrides = {}) {
  return {
    orderLineId: "OL-LIVE-PROD-001",
    id: "OL-LIVE-PROD-001",
    lineStatus: "制袋中",
    exceptionTags: [],
    ...overrides,
  };
}

export function buildProductionReservationRecord(overrides = {}) {
  return {
    reservationId: "RSV-LIVE-PROD-001",
    id: "RSV-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    inventoryItemId: "INV-LIVE-PROD-001",
    reservedQty: 80,
    reservationType: "生产完成待出库占用",
    status: "生效",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

export function buildProductionInventoryLedgerRecord(overrides = {}) {
  return {
    ledgerId: "LEDGER-LIVE-PROD-IN-001",
    inventoryItemId: "INV-LIVE-PROD-001",
    changeType: "生产入库",
    qtyBefore: 20,
    qtyChange: 80,
    qtyAfter: 100,
    sourceType: "production_report",
    sourceId: "WR-LIVE-PROD-001",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-OFFICE-A",
    occurredAt: "2026-07-02T12:30:00.000Z",
    createdAt: "2026-07-02T12:30:00.000Z",
    reason: "车间合格报工入库",
    remark: "机器计数不参与库存",
    ...overrides,
  };
}

export function buildPackageRecord(overrides = {}) {
  const packageId = overrides.packageId ?? "PKG-LIVE-PROD-001-1";
  return {
    packageId,
    id: packageId,
    bizNo: overrides.bizNo ?? packageId,
    orderLineId: "OL-LIVE-PROD-001",
    fulfillmentId: "",
    packageSeq: 1,
    packageCount: 1,
    packedQty: 80,
    labelPrintRecordId: "",
    status: "待打印标签",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:40:00.000Z",
    ...overrides,
  };
}

export function buildProductionOperationLog(overrides = {}) {
  const id = overrides.logId ?? overrides.id ?? "LOG-LIVE-PROD-001";
  return {
    id,
    targetType: "production_task",
    targetId: "PT-LIVE-PROD-001",
    action: "complete_production_report",
    before: null,
    after: { check: "postgres-live" },
    reason: "postgres live production packing transaction",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T12:30:00.000Z",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

export function buildProductionScheduleRecord(overrides = {}) {
  const productionTaskId = overrides.productionTaskId ?? "PT-LIVE-PROD-001";
  return {
    scheduleRecordId: overrides.scheduleRecordId ?? `SQR-${productionTaskId}`,
    productionTaskId,
    orderLineId: overrides.orderLineId ?? "OL-LIVE-PROD-001",
    publishedScheduleId: overrides.publishedScheduleId ?? "SCH-LIVE-PROD-001",
    machineId: overrides.machineId ?? "BAG-LIVE-01",
    queueSeq: overrides.queueSeq ?? 1,
    status: overrides.status ?? "active",
    sourceKind: overrides.sourceKind ?? "manual_resequence",
    sequenceUpdatedAt: overrides.sequenceUpdatedAt ?? "2026-07-02T12:35:00.000Z",
    sequenceUpdatedBy: overrides.sequenceUpdatedBy ?? "U-OFFICE-A",
    remark: overrides.remark ?? "Postgres live production schedule resequence",
    createdBy: overrides.createdBy ?? "U-OFFICE-A",
    createdAt: overrides.createdAt ?? "2026-07-02T12:35:00.000Z",
    updatedBy: overrides.updatedBy ?? "U-OFFICE-A",
    updatedAt: overrides.updatedAt ?? "2026-07-02T12:35:00.000Z",
  };
}

export function buildProductionScheduleOperationLog(overrides = {}) {
  const id = overrides.logId ?? overrides.id ?? "LOG-LIVE-SCHEDULE-RESEQ-001";
  return {
    id,
    targetType: overrides.targetType ?? "production_schedule_queue",
    targetId: overrides.targetId ?? "BAG-LIVE-01",
    action: overrides.action ?? "resequence_production_schedule_queue",
    before: overrides.before ?? { items: [] },
    after: overrides.after ?? {
      items: [{ productionTaskId: "PT-LIVE-PROD-001", queueSeq: 1 }],
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
    },
    reason: overrides.reason ?? "Postgres live production schedule resequence",
    operatorId: overrides.operatorId ?? "U-OFFICE-A",
    pageKey: overrides.pageKey ?? "api",
    occurredAt: overrides.occurredAt ?? "2026-07-02T12:35:00.000Z",
    createdAt: overrides.createdAt ?? "2026-07-02T12:35:00.000Z",
    ...overrides,
  };
}

export function buildProductionScheduleDecisionRecord({
  decisionId,
  businessId,
  operationLogId,
  operatorId = "U-OFFICE-A",
}) {
  return {
    id: decisionId,
    businessType: "production_schedule_queue",
    businessId,
    decisionScope: "production_schedule",
    decisionType: "delegated",
    decisionMakerEmployeeId: "EMP-LIVE-MANAGER-001",
    decisionMakerEmployeeNoSnapshot: "031",
    decisionMakerNameSnapshot: "负责人",
    decisionChannel: "wechat",
    decidedAt: "2026-07-02T12:30:00.000Z",
    decisionContent: { summary: "确认排产顺序" },
    authorizationId: "AUTH-SCHEDULE-LIVE",
    authorizationSnapshot: {
      authorizationId: "AUTH-SCHEDULE-LIVE",
      decisionScope: "production_schedule",
      maxAmount: null,
    },
    authorizationBasis: "微信确认",
    amountSnapshot: null,
    currency: "CNY",
    evidenceAttachmentIds: [],
    enteredByUserId: operatorId,
    enteredAt: "2026-07-02T12:35:00.000Z",
    status: "active",
    lateEntry: false,
    lateEntryReason: "",
    revision: 1,
    operationLogId,
    createdAt: "2026-07-02T12:35:00.000Z",
    updatedAt: "2026-07-02T12:35:00.000Z",
  };
}
