export const PRINTER_DEVICE_FIELD_TEST_ITEMS = [
  {
    key: "sample_print",
    label: "样张打印",
    target: "能输出当前模板样张",
  },
  {
    key: "paper_alignment",
    label: "纸张对位",
    target: "标签或联单位置不偏移",
  },
  {
    key: "barcode_scan",
    label: "条码扫码",
    target: "纸质条码可被扫码枪或手机识别",
  },
  {
    key: "driver_callback",
    label: "驱动回写",
    target: "驱动或人工状态能回写到打印作业",
  },
  {
    key: "legibility",
    label: "内容清晰",
    target: "文字、数量、客户和规格信息清晰可读",
  },
  {
    key: "void_reprint",
    label: "作废重打",
    target: "异常时可作废旧单并生成重打记录",
  },
];

export const PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS = [
  { value: "untested", label: "未测", tone: "neutral" },
  { value: "passed", label: "通过", tone: "success" },
  { value: "failed", label: "失败", tone: "danger" },
  { value: "blocked", label: "受限", tone: "warning" },
];

export const PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS = [
  {
    key: "samplePrintReference",
    label: "样张/纸张证据",
    placeholder: "如 PJ-xxx 已出样张，80x60 对位 OK",
  },
  {
    key: "barcodeScanText",
    label: "扫码证据",
    placeholder: "如 F010-PKG-1 可扫码",
  },
  {
    key: "driverCallbackStatus",
    label: "回写证据",
    placeholder: "如 spool completed -> printed",
  },
  {
    key: "voidReprintReference",
    label: "作废重打证据",
    placeholder: "如 PR-xxx 作废后 PJ-yyy 重打",
  },
  {
    key: "operatorAcceptance",
    label: "现场签认",
    placeholder: "如 办公室A / 车间主管确认",
  },
];

export function createPrinterDeviceFieldTestChecks() {
  return PRINTER_DEVICE_FIELD_TEST_ITEMS.map((item) => createFieldTestCheck(item, "untested"));
}

export function createPrinterDeviceFieldTestEvidence() {
  return PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS.reduce((evidence, item) => {
    evidence[item.key] = "";
    return evidence;
  }, {});
}

export function normalizePrinterDeviceFieldTestChecks(checks = []) {
  const checkMap = new Map(toArray(checks).map((item) => [item?.key, item]));
  return PRINTER_DEVICE_FIELD_TEST_ITEMS.map((item) => {
    const current = checkMap.get(item.key) ?? {};
    return createFieldTestCheck(item, normalizeStatus(current.status));
  });
}

export function normalizePrinterDeviceFieldTestEvidence(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS.reduce((evidence, item) => {
    evidence[item.key] = cleanText(source[item.key]);
    return evidence;
  }, {});
}

export function getPrinterDeviceFieldTestEvidenceSummary(value = {}) {
  const evidence = normalizePrinterDeviceFieldTestEvidence(value);
  const requiredKeys = PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS.map((item) => item.key);
  const completedKeys = requiredKeys.filter((key) => Boolean(evidence[key]));
  const missingKeys = requiredKeys.filter((key) => !evidence[key]);
  const complete = missingKeys.length === 0;
  return {
    total: requiredKeys.length,
    completedCount: completedKeys.length,
    missingCount: missingKeys.length,
    completedKeys,
    missingKeys,
    complete,
    tone: complete ? "success" : completedKeys.length > 0 ? "warning" : "danger",
    label: complete ? `${completedKeys.length}/${requiredKeys.length} 项证据完整` : `证据 ${completedKeys.length}/${requiredKeys.length}，缺 ${missingKeys.length}`,
  };
}

export function getPrinterDeviceFieldTestSummary(checks = []) {
  const normalized = normalizePrinterDeviceFieldTestChecks(checks);
  const total = normalized.length;
  const passedCount = normalized.filter((item) => item.status === "passed").length;
  const failedCount = normalized.filter((item) => item.status === "failed").length;
  const blockedCount = normalized.filter((item) => item.status === "blocked").length;
  const untestedCount = normalized.filter((item) => item.status === "untested").length;
  const issueCount = failedCount + blockedCount;
  const tone = failedCount > 0 ? "danger" : issueCount > 0 || untestedCount > 0 ? "warning" : "success";
  const label =
    issueCount > 0
      ? `通过 ${passedCount}/${total}，异常 ${issueCount}`
      : untestedCount > 0
        ? `通过 ${passedCount}/${total}，未测 ${untestedCount}`
        : `${passedCount}/${total} 项通过`;

  return {
    total,
    passedCount,
    failedCount,
    blockedCount,
    untestedCount,
    issueCount,
    tone,
    label,
  };
}

export function getPrinterDeviceFieldTestAcceptance(value = {}) {
  const checks = normalizePrinterDeviceFieldTestChecks(value.checks ?? []);
  const evidence = normalizePrinterDeviceFieldTestEvidence(value.evidence ?? value.summary?.evidence);
  const summary = getPrinterDeviceFieldTestSummary(checks);
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(evidence);
  const printJob = value.printJob && typeof value.printJob === "object" ? value.printJob : null;
  const printJobId = cleanText(value.printJobId ?? printJob?.printJobId ?? printJob?.id);
  const printJobStatus = cleanText(printJob?.jobStatus ?? printJob?.status);
  const printDeviceId = cleanText(value.printDeviceId);
  const printJobDeviceId = cleanText(printJob?.printDeviceId ?? printJob?.printerDeviceId);
  const documentType = cleanText(value.documentType);
  const printJobDocumentType = cleanText(printJob?.documentType);
  const checksComplete = summary.passedCount === summary.total && summary.issueCount === 0 && summary.untestedCount === 0;
  const evidenceComplete = evidenceSummary.complete;
  const printedJobLinked = Boolean(
    printJobId &&
      printJob &&
      printJobStatus === "printed" &&
      (!printDeviceId || printJobDeviceId === printDeviceId) &&
      (!documentType || printJobDocumentType === documentType),
  );
  const blockers = [];
  if (!checksComplete) blockers.push("checks_incomplete");
  if (!evidenceComplete) blockers.push("evidence_incomplete");
  if (!printJobId) blockers.push("print_job_required");
  else if (!printJob) blockers.push("print_job_not_found");
  else {
    if (printJobStatus !== "printed") blockers.push("print_job_not_printed");
    if (printDeviceId && printJobDeviceId !== printDeviceId) blockers.push("print_device_mismatch");
    if (documentType && printJobDocumentType !== documentType) blockers.push("document_type_mismatch");
  }
  const ready = checksComplete && evidenceComplete && printedJobLinked;
  return {
    ready,
    status: ready ? "accepted" : "pending",
    label: ready ? "现场验收通过" : "现场验收待完成",
    checksComplete,
    evidenceComplete,
    printedJobLinked,
    printJobId,
    printJobStatus,
    blockers,
  };
}

export function buildPrinterDeviceFieldTestRecord(input = {}) {
  const {
    printDevice = {},
    printJob = {},
    currentUser = {},
    deviceLabel,
    driverLabel,
    paperLabel,
    documentType,
    checks,
    evidence,
    note,
    now = new Date(),
  } = input;
  const checkedAt = toIsoString(now);
  const printDeviceId = cleanText(printDevice.printDeviceId ?? printDevice.id ?? input.printDeviceId);
  const printJobId = cleanText(printJob.printJobId ?? printJob.id ?? input.printJobId);
  const normalizedChecks = normalizePrinterDeviceFieldTestChecks(checks);
  const normalizedEvidence = normalizePrinterDeviceFieldTestEvidence(evidence);
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(normalizedEvidence);
  const summary = getPrinterDeviceFieldTestSummary(normalizedChecks);
  const acceptance = getPrinterDeviceFieldTestAcceptance({
    checks: normalizedChecks,
    evidence: normalizedEvidence,
    printJob,
    printJobId,
    printDeviceId,
    documentType: documentType ?? printJob.documentType,
  });
  const recordId = `PDQA-${compactTimestamp(checkedAt)}-${safeRecordPart(printDeviceId || "PRINT")}`;

  return {
    recordId,
    printDeviceId,
    printJobId,
    documentType: cleanText(documentType ?? printJob.documentType),
    operatorId: cleanText(currentUser.userId ?? currentUser.id),
    operatorName: cleanText(currentUser.displayName ?? currentUser.loginName),
    checkedAt,
    deviceLabel: cleanText(deviceLabel) || cleanText(printDevice.name),
    driverLabel: cleanText(driverLabel) || cleanText(printDevice.driverName ?? printDevice.connectionType),
    paperLabel: cleanText(paperLabel) || getPaperLabel(printDevice),
    summary: {
      ...summary,
      evidenceSummary,
      acceptance,
    },
    checks: normalizedChecks,
    evidence: normalizedEvidence,
    note: cleanText(note),
  };
}

function createFieldTestCheck(item, status) {
  const statusConfig = getStatusConfig(status);
  return {
    key: item.key,
    label: item.label,
    target: item.target,
    status: statusConfig.value,
    statusLabel: statusConfig.label,
    tone: statusConfig.tone,
  };
}

function getStatusConfig(status) {
  const safeStatus = normalizeStatus(status);
  return PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS.find((item) => item.value === safeStatus) ?? PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS[0];
}

function normalizeStatus(status) {
  const safeStatus = cleanText(status);
  return PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS.some((item) => item.value === safeStatus) ? safeStatus : "untested";
}

function getPaperLabel(printDevice = {}) {
  const paperName = cleanText(printDevice.paperName);
  if (paperName) return paperName;
  const width = Number(printDevice.paperWidthMm ?? 0);
  const height = Number(printDevice.paperHeightMm ?? 0);
  if (width > 0 && height > 0) return `${width}x${height}mm`;
  return "";
}

function compactTimestamp(value) {
  return cleanText(value).replace(/[-:T.Z]/g, "").slice(0, 14) || "NOW";
}

function safeRecordPart(value) {
  return cleanText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "PRINT";
}

function toIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}
