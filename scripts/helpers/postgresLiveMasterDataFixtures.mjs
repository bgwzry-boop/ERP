export function buildLiveMasterDataImportExecution() {
  const targetRecords = {
    standardColors: [{ id: "SC-MD-LIVE-001", colorKey: "md-live-red", name: "主数据导入红", enabled: true }],
    priceTables: [{ id: "PT-MD-LIVE-001", bizNo: "PT-MD-LIVE-001", name: "主数据导入价格表", status: "pending_review", effectiveFrom: "2026-07-03" }],
    customers: [{ id: "C-MD-LIVE-001", bizNo: "CUST-MD-LIVE-001", name: "主数据导入客户", shortName: "主数据客户", settlementCycle: "7天一结", riskStatus: "正常", enabled: true }],
    customerContacts: [{ id: "CC-MD-LIVE-001", customerId: "C-MD-LIVE-001", contactName: "导入联系人", phone: "13900009999", role: "客户本人", isDefault: true, remark: "live check" }],
    customerAddresses: [{ id: "CA-MD-LIVE-001", customerId: "C-MD-LIVE-001", contactId: "CC-MD-LIVE-001", address: "主数据导入地址", area: "虎门", defaultFulfillmentMethod: "自提", isDefault: true, remark: "live check" }],
    customerNotes: [{ id: "CN-MD-LIVE-001", customerId: "C-MD-LIVE-001", noteType: "office", content: "主数据导入备注", visibleTo: "office" }],
    colorAliases: [{ id: "CALIAS-MD-LIVE-001", alias: "导入红", standardColorId: "SC-MD-LIVE-001", sourceType: "global", sourceId: "", enabled: true }],
    sizeSpecs: [{ id: "SIZE-MD-LIVE-001", sizeKey: "md-live-30-38-10", displayName: "30*38*10", widthMm: 30, heightMm: 38, metadata: { source: "postgres-live" }, enabled: true }],
    finishedGoodsStyles: [{ id: "STYLE-MD-LIVE-001", styleKey: "blank-bag", name: "空白袋", enabled: true, allowedSizeKeys: ["md-live-30-38-10"] }],
    priceTableItems: [{ id: "PTI-MD-LIVE-001", priceTableId: "PT-MD-LIVE-001", sizeKey: "md-live-30-38-10", standardColorId: "SC-MD-LIVE-001", handleType: "普通提", styleKey: "blank-bag", bagPrice: 0.34, printPrice: 0, otherFee: 0, minQty: 1, enabled: false }],
    inventoryItems: [{ id: "INV-MD-LIVE-001", inventoryKey: "30*38*10|主数据导入红|普通提|空白袋|MD-LIVE|仓库已清点", size: "30*38*10", standardColorId: "SC-MD-LIVE-001", handleType: "普通提", style: "空白袋", zone: "MD-LIVE", inventoryState: "仓库已清点", onHandQty: 100, reservedQty: 0, waitingPickupLockedQty: 0, pendingHandlingQty: 0, trustLevel: "已清点" }],
    inventoryLedgerEntries: [{ id: "LEDGER-MD-LIVE-001", inventoryItemId: "INV-MD-LIVE-001", changeType: "initial_import", qtyBefore: 0, qtyChange: 100, qtyAfter: 100, sourceType: "master_data_import", sourceId: "MDE-MD-LIVE-001", occurredAt: "2026-07-03T10:30:00.000Z", reason: "基础资料初始库存导入", remark: "postgres live check" }],
    machines: [{ id: "MACH-MD-LIVE-001", bizNo: "MACH-MD-LIVE-001", name: "主数据导入制袋机", machineType: "bag_making", workshop: "1号车间", status: "active", enabled: true, settings: { source: "postgres-live" } }],
    employees: [{ id: "EMP-MD-LIVE-001", bizNo: "EMP-MD-LIVE-001", userId: "", name: "主数据导入员工", roleName: "制袋", defaultWorkshop: "1号车间", defaultMachineId: "MACH-MD-LIVE-001", baseHourlyWage: 22, positionAllowanceHourly: 2, wageEffectiveFrom: "2026-07-03", accountEnabled: false, profileStatus: "pending_admin_review", requestedEnabled: true, remark: "postgres live check" }],
    employeeMachineAssignments: [{ id: "EMA-MD-LIVE-001", employeeId: "EMP-MD-LIVE-001", machineId: "MACH-MD-LIVE-001", assignmentType: "default", workshop: "1号车间", effectiveFrom: "2026-07-03", enabled: true }],
    machineCapacityBaselines: [{ id: "MCB-MD-LIVE-001", machineId: "MACH-MD-LIVE-001", sizeKey: "md-live-30-38-10", dailyCapacityQty: 12000, hourlyCapacityQty: null, sourceKind: "manual_estimate", confidence: "low", effectiveFrom: "2026-07-03", remark: "postgres live check" }],
  };
  const targetRecordCount = Object.values(targetRecords).reduce((sum, records) => sum + records.length, 0);
  return {
    executionId: "MDE-MD-LIVE-001",
    planId: "MDP-MD-LIVE-001",
    draftId: "MDI-MD-LIVE-001",
    fileName: "master-data-live.xlsx",
    requestedBy: "管理A",
    requestedAt: "2026-07-03T10:30:00.000Z",
    status: "ready_for_transaction_writer",
    statusLabel: "待事务写入器执行",
    officialWriterKind: "postgres",
    officialImportEnabled: true,
    officialWriteAttempted: false,
    officialWriteScope: "master_data_import_v1",
    transactionStarted: false,
    summary: { stagedRowCount: 5, writableRowCount: 5, failedRowCount: 0, targetRecordCount, targetTableCount: 16 },
    importPayload: { targetRecords },
    failedRows: [],
    writeBatches: [],
    blockingReasons: [],
  };
}

export function buildLiveMasterDataImportReviewDraft() {
  return {
    draftId: "MDR-MD-LIVE-001",
    status: "ready_for_review_queue",
    statusLabel: "可进入复核",
    fileName: "master-data-review-live.xlsx",
    requestedBy: "办公室A",
    createdAt: "2026-07-03T10:20:00.000Z",
    checkedAt: "2026-07-03T10:20:00.000Z",
    canEnterReviewQueue: true,
    employeeRoleCoverage: {
      available: true,
      complete: false,
      employeeRowCount: 1,
      requiredRoleCount: 8,
      coveredRoleCount: 1,
      missingRoleCount: 7,
      coverageLabel: "1/8",
      missingRoleLabels: ["管理人员", "办公室", "仓库", "包装", "司机", "财务", "技术运维"],
      roles: [{ roleKey: "workshop", roleLabel: "车间", rowCount: 1 }],
    },
    summary: { stagedRowCount: 2, errorCount: 0, warningCount: 0, employeeRoleCoverageLabel: "1/8" },
  };
}

export function buildLiveMasterDataImportConfirmationPlan(reviewDraft) {
  return {
    planId: "MDP-MD-REVIEW-LIVE-001",
    draftId: reviewDraft.draftId,
    status: "ready_for_final_confirmation",
    statusLabel: "待最终确认",
    fileName: reviewDraft.fileName,
    createdBy: "办公室A",
    createdAt: "2026-07-03T10:21:00.000Z",
    employeeRoleCoverage: reviewDraft.employeeRoleCoverage,
    summary: { stagedRowCount: 2, targetRecordCount: 2, employeeRoleCoverageLabel: "1/8" },
    stagedRows: [{ sheetKey: "customers", rowCount: 1 }],
    targetTables: ["customers", "price_table_items"],
    writeBatches: [],
    officialImportEnabled: false,
    officialWriteScope: "none",
  };
}

export function buildLiveMasterDataImportReviewExecution(confirmationPlan) {
  return {
    executionId: "MDE-MD-REVIEW-LIVE-001",
    planId: confirmationPlan.planId,
    draftId: confirmationPlan.draftId,
    status: "committed",
    statusLabel: "已正式导入",
    fileName: confirmationPlan.fileName,
    requestedBy: "管理A",
    requestedAt: "2026-07-03T10:22:00.000Z",
    officialWriterKind: "postgres",
    officialImportEnabled: true,
    officialWriteAttempted: true,
    officialWriteScope: "master_data_import_v1",
    transactionStarted: true,
    summary: { stagedRowCount: 2, writableRowCount: 2, failedRowCount: 0, transactionRecordCount: 2 },
    importPayload: { targetRecords: {} },
    failedRows: [],
    blockingReasons: [],
  };
}

export function buildLiveMasterDataImportReviewPlanOperationLog(planId) {
  return {
    id: "LOG-MD-LIVE-REVIEW-PLAN-001",
    targetType: "master_data_import_confirmation_plan",
    targetId: planId,
    action: "master_data_import_confirmation_plan_created",
    before: null,
    after: { planId },
    reason: "postgres live master data import review plan",
    operatorId: "U-OFFICE-A",
    pageKey: "master_data",
    occurredAt: "2026-07-03T10:21:00.000Z",
    createdAt: "2026-07-03T10:21:00.000Z",
  };
}

export function buildLiveMasterDataImportReviewExecutionOperationLog(executionId) {
  return {
    id: "LOG-MD-LIVE-REVIEW-EXEC-001",
    targetType: "master_data_import_execution",
    targetId: executionId,
    action: "master_data_import_execution_committed",
    before: { status: "ready_for_transaction_writer" },
    after: { executionId, officialWriteScope: "master_data_import_v1" },
    reason: "postgres live master data import review execution",
    operatorId: "U-OFFICE-A",
    pageKey: "master_data",
    occurredAt: "2026-07-03T10:22:00.000Z",
    createdAt: "2026-07-03T10:22:00.000Z",
  };
}

export function buildLiveMasterDataImportOperationLog(executionId) {
  return {
    id: "LOG-MD-LIVE-IMPORT-001",
    targetType: "master_data_import_execution",
    targetId: executionId,
    action: "master_data_import_execution_committed",
    before: { status: "ready_for_transaction_writer" },
    after: { executionId, officialWriteScope: "master_data_import_v1" },
    reason: "postgres live master data import",
    operatorId: "U-OFFICE-A",
    pageKey: "master_data",
    occurredAt: "2026-07-03T10:30:00.000Z",
    createdAt: "2026-07-03T10:30:00.000Z",
  };
}
