export function buildPrintDeviceRecord({ printDeviceId, name }) {
  return {
    printDeviceId,
    bizNo: printDeviceId,
    name,
    deviceType: "label_printer",
    status: "active",
    connectionType: "system_printer",
    connectionUri: "system://postgres-live-label",
    driverName: "Postgres Live 203dpi Driver",
    supportedDocumentTypes: ["express_ltl_label", "package_label"],
    defaultDocumentTypes: ["express_ltl_label"],
    paperWidthMm: 76,
    paperHeightMm: 50,
    paperName: "76x50 热敏标签",
    isContinuous: false,
    dpi: 203,
    defaultCopies: 1,
    darkness: 9,
    speed: 4,
    cutterEnabled: false,
    settings: {
      driverMode: "preview_only",
      source: "postgres-live",
    },
    createdBy: "U-OFFICE-A",
    updatedBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
    updatedAt: "2026-07-02T10:30:00.000Z",
  };
}

export function buildPrintDeviceOperationLog({ logId, printDevice }) {
  return {
    id: logId,
    targetType: "print_device",
    targetId: printDevice.printDeviceId,
    action: "upsert_print_device",
    before: null,
    after: printDevice,
    reason: "postgres live print device setup",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

export function buildPrintJobRecord(overrides = {}) {
  const printJobId = overrides.printJobId ?? "PJ-LIVE-REPO-001";
  const driverMode = overrides.driverMode ?? "preview_only";
  const jobStatus = overrides.jobStatus ?? "preview_only";
  return {
    printJobId,
    bizNo: printJobId,
    printRecordId: overrides.printRecordId ?? "PR-LIVE-FULFILLMENT-001",
    targetType: "fulfillment",
    targetId: "F001",
    documentType: "express_ltl_label",
    templateId: "tpl-p0-fulfillment",
    printDeviceId: overrides.printDeviceId ?? "PRN-LIVE-REPO-001",
    printDeviceSnapshot: {
      printDeviceId: overrides.printDeviceId ?? "PRN-LIVE-REPO-001",
      name: "Postgres Live 标签机",
      deviceType: "label_printer",
      connectionType: "system_printer",
      paperWidthMm: 76,
      paperHeightMm: 50,
      dpi: 203,
      defaultCopies: 1,
      settings: {
        driverMode,
      },
    },
    driverMode,
    jobStatus,
    attemptNo: overrides.attemptNo ?? 1,
    sourcePrintJobId: overrides.sourcePrintJobId ?? "",
    requestedBy: "U-OFFICE-A",
    queuedAt: jobStatus === "queued" ? "2026-07-02T10:30:00.000Z" : "",
    sentAt: "",
    finishedAt: "",
    errorCode: "",
    errorMessage: "",
    payload: {
      printTemplate: {
        documentType: "express_ltl_label",
        fields: { goodsSummary: "Postgres live print job" },
      },
    },
    metadata: {
      source: "postgres-live",
    },
    createdAt: "2026-07-02T10:30:00.000Z",
    updatedAt: "2026-07-02T10:30:00.000Z",
  };
}

export function buildPrintJobOperationLog({ logId, printJob, action, before = null }) {
  return {
    id: logId,
    targetType: "print_job",
    targetId: printJob.printJobId,
    action,
    before,
    after: printJob,
    reason: "postgres live print job check",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

export function buildPrintBatchRecord({ printBatchId, todoId, operatorName = "办公室A" }) {
  return {
    printBatchId,
    action: "批量打印标签",
    resultLabel: "部分打出",
    status: "partial",
    todoIds: [todoId],
    todoRefs: ["ORD-LIVE-PRINT-001"],
    totalTaskCount: 1,
    totalLabelCount: 2,
    printedLabelCount: 1,
    pendingLabelCount: 1,
    printedPackageIds: ["PKG-LIVE-PRINT-001"],
    pendingPackageIds: ["PKG-LIVE-PRINT-002"],
    printPackages: [
      {
        packageId: "PKG-LIVE-PRINT-001",
        packageSeq: 1,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "printed",
      },
      {
        packageId: "PKG-LIVE-PRINT-002",
        packageSeq: 2,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "not_printed",
      },
    ],
    printedPackages: [
      {
        packageId: "PKG-LIVE-PRINT-001",
        packageSeq: 1,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "printed",
      },
    ],
    pendingPackages: [
      {
        packageId: "PKG-LIVE-PRINT-002",
        packageSeq: 2,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "not_printed",
      },
    ],
    summary: "部分打出：1/2，待处理 1 张",
    operatorId: "U-OFFICE-A",
    operatorName,
    createdAt: "2026-07-02T10:30:00.000Z",
    operationLogId: "LOG-LIVE-PRINT-BATCH-001",
    metadata: {
      source: "postgres-live",
    },
  };
}

export function buildPrintBatchOperationLog({ logId, printBatchRecord }) {
  return {
    id: logId,
    targetType: "print_batch",
    targetId: printBatchRecord.printBatchId,
    action: "create_print_batch",
    before: null,
    after: printBatchRecord,
    reason: printBatchRecord.summary,
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}
