export function createInitialPrinterDeviceQaState({ createChecks = () => [], createEvidence = () => ({}) } = {}) {
  return {
    devices: [],
    selectedDeviceId: "",
    eligiblePrintJobs: [],
    selectedPrintJobId: "",
    fieldTests: [],
    latestRecord: null,
    checks: createChecks(),
    deviceLabel: "",
    driverLabel: "",
    driverModeDraft: "preview_only",
    paperLabel: "",
    evidence: createEvidence(),
    note: "",
    source: "idle",
    recordSource: "idle",
    loading: false,
    saving: false,
    savingDeviceMode: false,
    error: "",
    lastSyncedAt: "",
  };
}

export function createInitialPrintJobQueueState() {
  return {
    source: "idle",
    items: [],
    total: 0,
    loading: false,
    actionJobId: "",
    error: "",
    lastSyncedAt: "",
  };
}

export function createInitialPrintDriverConfigState() {
  return {
    source: "idle",
    config: null,
    loading: false,
    error: "",
    lastSyncedAt: "",
  };
}

export function createInitialPrintDriverReadinessState() {
  return {
    source: "idle",
    readiness: null,
    loading: false,
    error: "",
    lastSyncedAt: "",
  };
}

export function createInitialPrintDriverCupsDiagnosticsState() {
  return {
    source: "idle",
    diagnostics: null,
    loading: false,
    error: "",
    lastSyncedAt: "",
  };
}

export function getSortablePrintJobTime(printJob = {}) {
  const timestamp = Date.parse(
    printJob.updatedAt ||
      printJob.finishedAt ||
      printJob.sentAt ||
      printJob.queuedAt ||
      printJob.createdAt ||
      "",
  );
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergeOfficePrintJobQueueItems(currentItems = [], incomingItems = [], { limit = 8 } = {}) {
  const safeLimit = Math.max(1, Number(limit) || 8);
  const byId = new Map(
    (Array.isArray(currentItems) ? currentItems : [])
      .filter((item) => item?.printJobId)
      .map((item) => [item.printJobId, item]),
  );
  for (const printJob of Array.isArray(incomingItems) ? incomingItems : [incomingItems]) {
    if (printJob?.printJobId) byId.set(printJob.printJobId, printJob);
  }
  return [...byId.values()]
    .sort((left, right) => getSortablePrintJobTime(right) - getSortablePrintJobTime(left))
    .slice(0, safeLimit);
}

export function getPrintJobStatusLabel(status) {
  const normalized = String(status ?? "").trim();
  const labels = {
    queued: "待派发",
    sent: "已派发",
    printed: "已打印",
    failed: "失败",
    canceled: "已取消",
    preview_only: "仅预览",
  };
  return (labels[normalized] ?? normalized) || "状态待补";
}

export function getPrinterDeviceQaDriverLabel(printDevice = {}) {
  const device = printDevice && typeof printDevice === "object" ? printDevice : {};
  return String(device.driverName ?? device.connectionType ?? "").trim();
}

export function getPrinterDeviceDriverMode(printDevice = {}) {
  const device = printDevice && typeof printDevice === "object" ? printDevice : {};
  const mode = String(device.settings?.driverMode ?? device.driverMode ?? "").trim();
  return mode || "preview_only";
}

export function getPrinterDeviceQaPaperLabel(printDevice = {}) {
  const device = printDevice && typeof printDevice === "object" ? printDevice : {};
  const paperName = String(device.paperName ?? "").trim();
  if (paperName) return paperName;
  const width = Number(device.paperWidthMm ?? 0);
  const height = Number(device.paperHeightMm ?? 0);
  if (width > 0 && height > 0) return `${width}x${height}mm`;
  return "";
}
