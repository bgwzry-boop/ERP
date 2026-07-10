import {
  getDriverNativeCapabilityDiagnostics,
  normalizeDriverNativeCapabilityDiagnostics,
} from "./driverNativeCapabilityClient.js";

export const DRIVER_DEVICE_FIELD_TEST_ITEMS = [
  {
    key: "camera_permission",
    label: "相机权限",
    target: "打开相机后能看到实时画面",
    readinessKey: "delivery_camera",
  },
  {
    key: "watermark_photo",
    label: "水印拍照",
    target: "能拍照并进入水印照片",
    readinessKey: "delivery_camera",
  },
  {
    key: "package_label_scan",
    label: "包裹扫码",
    target: "能识别纸质包裹标签",
    readinessKey: "package_camera_scan",
  },
  {
    key: "geolocation",
    label: "定位读取",
    target: "能读取 GPS 或确认地址快照",
    readinessKey: "geolocation",
  },
  {
    key: "file_upload",
    label: "上传兜底",
    target: "能选择图片并读取内容",
    readinessKey: "file_upload_fallback",
  },
  {
    key: "navigation",
    label: "外部导航",
    target: "能打开地图导航链接",
    readinessKey: "",
  },
];

export const DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS = [
  { value: "untested", label: "未测", tone: "neutral" },
  { value: "passed", label: "通过", tone: "success" },
  { value: "failed", label: "失败", tone: "danger" },
  { value: "blocked", label: "受限", tone: "warning" },
];

export const DRIVER_PACKAGE_LABEL_SCAN_METHOD_OPTIONS = [
  { value: "scanner_wedge", label: "扫码枪/键盘口" },
  { value: "camera", label: "相机扫码" },
  { value: "manual", label: "手输核对" },
  { value: "native_sdk", label: "原生扫码SDK" },
];

export const DRIVER_PACKAGE_LABEL_SCAN_RESULT_OPTIONS = [
  { value: "matched", label: "已匹配", tone: "success" },
  { value: "duplicate", label: "已重复核对", tone: "success" },
  { value: "not_found", label: "未匹配", tone: "danger" },
  { value: "ambiguous", label: "包裹号不唯一", tone: "danger" },
  { value: "empty", label: "未扫码", tone: "warning" },
  { value: "camera_error", label: "相机受限", tone: "warning" },
  { value: "failed", label: "异常", tone: "danger" },
];

export function getDriverDeviceFieldTestContext(env = globalThis) {
  const navigatorRef = env?.navigator ?? {};
  const userAgent = cleanText(navigatorRef.userAgent);
  return {
    deviceLabel: cleanText(navigatorRef.platform) || "待填写",
    browserLabel: getBrowserLabel(userAgent),
    userAgent,
    language: cleanText(navigatorRef.language),
  };
}

export function createDriverDeviceFieldTestChecks(readiness = {}) {
  return DRIVER_DEVICE_FIELD_TEST_ITEMS.map((item) => createFieldTestCheck(item, "untested", readiness));
}

export function normalizeDriverDeviceFieldTestChecks(checks = [], readiness = {}) {
  const checkMap = new Map(toArray(checks).map((item) => [item?.key, item]));
  return DRIVER_DEVICE_FIELD_TEST_ITEMS.map((item) => {
    const current = checkMap.get(item.key) ?? {};
    return createFieldTestCheck(item, normalizeStatus(current.status), readiness);
  });
}

export function updateDriverDeviceFieldTestCheck(checks = [], key, status, readiness = {}) {
  return normalizeDriverDeviceFieldTestChecks(checks, readiness).map((item) => (
    item.key === key ? createFieldTestCheck(item, normalizeStatus(status), readiness) : item
  ));
}

export function getDriverDeviceFieldTestSummary(checks = []) {
  const normalized = normalizeDriverDeviceFieldTestChecks(checks);
  const total = normalized.length;
  const passedCount = normalized.filter((item) => item.status === "passed").length;
  const failedCount = normalized.filter((item) => item.status === "failed").length;
  const blockedCount = normalized.filter((item) => item.status === "blocked").length;
  const untestedCount = normalized.filter((item) => item.status === "untested").length;
  const tone = failedCount > 0 ? "danger" : blockedCount > 0 || untestedCount > 0 ? "warning" : "success";
  const label =
    failedCount > 0 || blockedCount > 0
      ? `通过 ${passedCount}/${total}，异常 ${failedCount + blockedCount}`
      : untestedCount > 0
        ? `通过 ${passedCount}/${total}，未测 ${untestedCount}`
        : `${passedCount}/${total} 项通过`;

  return {
    total,
    passedCount,
    failedCount,
    blockedCount,
    untestedCount,
    issueCount: failedCount + blockedCount,
    tone,
    label,
  };
}

export function normalizeDriverPackageLabelScanSample(value = {}) {
  if (!value || typeof value !== "object") return null;
  const sampleId = cleanText(value.sampleId ?? value.sample_id ?? value.id);
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.fulfillment_id);
  const expectedPackageId = cleanText(value.expectedPackageId ?? value.expected_package_id);
  const scannedText = cleanText(value.scannedText ?? value.scanned_text);
  const matchedPackageId = cleanText(value.matchedPackageId ?? value.matched_package_id);
  const message = cleanText(value.message);
  const hasContent = Boolean(sampleId || fulfillmentId || expectedPackageId || scannedText || matchedPackageId || message);
  if (!hasContent) return null;
  const checkedAt = toIsoString(value.checkedAt ?? value.checked_at ?? new Date());
  const method = normalizePackageLabelScanMethod(value.method);
  const result = normalizePackageLabelScanResult(value.result ?? value.status ?? value.scanStatus);
  const methodConfig = getPackageLabelScanMethodConfig(method);
  const resultConfig = getPackageLabelScanResultConfig(result);

  return {
    sampleId: sampleId || `DPLS-${compactTimestamp(checkedAt)}-${safeRecordPart(fulfillmentId || matchedPackageId || expectedPackageId || "PKG")}`,
    fulfillmentId,
    expectedPackageId,
    scannedText,
    matchedPackageId,
    method,
    methodLabel: methodConfig.label,
    result,
    resultLabel: resultConfig.label,
    tone: resultConfig.tone,
    message,
    checkedAt,
  };
}

export function buildDriverPackageLabelScanSample(input = {}) {
  const task = input.task ?? {};
  const scanResult = input.scanResult ?? {};
  const checkedAt = toIsoString(input.checkedAt ?? input.now ?? new Date());
  const fulfillmentId = cleanText(input.fulfillmentId ?? task.fulfillmentId ?? task.id);
  const expectedPackageId =
    cleanText(input.expectedPackageId) ||
    inferExpectedPackageId(task, input.checkedPackageIds ?? input.previousCheckedPackageIds);

  return normalizeDriverPackageLabelScanSample({
    sampleId: input.sampleId,
    fulfillmentId,
    expectedPackageId,
    scannedText: input.scannedText ?? input.scanText,
    matchedPackageId: input.matchedPackageId ?? scanResult.matchedPackageId,
    method: input.method,
    result: input.result ?? scanResult.status,
    message: input.message ?? scanResult.message,
    checkedAt,
  });
}

export function getDriverPackageLabelScanSampleSummary(sample) {
  const normalized = normalizeDriverPackageLabelScanSample(sample);
  if (!normalized) return "未记录纸质标签扫码样本";
  const packageId = normalized.matchedPackageId || normalized.expectedPackageId || "包裹待确认";
  const scanText = normalized.scannedText && normalized.scannedText !== packageId
    ? `${normalized.scannedText} -> ${packageId}`
    : packageId;
  return `${normalized.methodLabel} · ${normalized.resultLabel} · ${scanText}`;
}

export function applyDriverPackageCameraFieldTestSignal(checks = [], signal = {}, readiness = {}) {
  return applyDriverPackageLabelScanFieldTestSignal(checks, signal, readiness);
}

export function applyDriverPackageLabelScanFieldTestSignal(checks = [], signal = {}, readiness = {}) {
  const normalizedChecks = normalizeDriverDeviceFieldTestChecks(checks, readiness);
  const updates = getPackageLabelScanFieldTestUpdates(signal);
  if (!Object.keys(updates).length) return normalizedChecks;
  return normalizedChecks.map((item) => (
    updates[item.key] ? createFieldTestCheck(item, updates[item.key], readiness) : item
  ));
}

export function appendDriverDeviceFieldTestNote(note, message, label = "扫码核包") {
  const current = cleanText(note);
  const cleanMessage = cleanText(message);
  if (!cleanMessage) return current;
  const nextLine = `${cleanText(label) || "现场验收"}：${cleanMessage}`;
  if (current.includes(nextLine)) return current;
  return [current, nextLine].filter(Boolean).join("；");
}

export function buildDriverDeviceFieldTestRecord(input = {}) {
  const {
    task = {},
    currentUser = {},
    deviceLabel,
    browserLabel,
    note,
    readiness,
    checks,
    packageLabelScanSample,
    nativeBridgeDiagnostics,
    env = globalThis,
    now = new Date(),
  } = input;
  const context = getDriverDeviceFieldTestContext(env);
  const normalizedChecks = normalizeDriverDeviceFieldTestChecks(checks, readiness);
  const summary = getDriverDeviceFieldTestSummary(normalizedChecks);
  const checkedAt = toIsoString(now);
  const fulfillmentId = cleanText(task.fulfillmentId ?? task.id);
  const recordId = `DQA-${compactTimestamp(checkedAt)}-${safeRecordPart(fulfillmentId || "TASK")}`;

  return {
    recordId,
    fulfillmentId,
    orderLineId: cleanText(task.orderLineId),
    driverId: cleanText(task.driverId ?? currentUser.userId ?? currentUser.id),
    operatorId: cleanText(currentUser.userId ?? currentUser.id),
    operatorName: cleanText(currentUser.displayName ?? currentUser.loginName ?? task.driverName),
    checkedAt,
    deviceLabel: cleanText(deviceLabel) || context.deviceLabel,
    browserLabel: cleanText(browserLabel) || context.browserLabel,
    userAgent: context.userAgent,
    language: context.language,
    summary,
    checks: normalizedChecks,
    packageLabelScanSample: normalizeDriverPackageLabelScanSample(packageLabelScanSample),
    nativeBridgeDiagnostics:
      normalizeDriverNativeCapabilityDiagnostics(nativeBridgeDiagnostics) ?? getDriverNativeCapabilityDiagnostics(env),
    note: cleanText(note),
  };
}

function getPackageLabelScanFieldTestUpdates(signal = {}) {
  const type = cleanText(signal.type);
  if (type === "camera_opened") {
    return { camera_permission: "passed" };
  }
  if (type === "package_scan_result") {
    const scanStatus = cleanText(signal.scanStatus ?? signal.result);
    const packageScanPassed = scanStatus === "matched" || scanStatus === "duplicate";
    return { package_label_scan: packageScanPassed ? "passed" : "failed" };
  }
  if (type === "camera_scan_result") {
    const scanStatus = cleanText(signal.scanStatus);
    const packageScanPassed = scanStatus === "matched" || scanStatus === "duplicate";
    return {
      camera_permission: "passed",
      package_label_scan: packageScanPassed ? "passed" : "failed",
    };
  }
  if (type === "camera_error") {
    const errorCode = cleanText(signal.errorCode);
    const cameraStatus = errorCode === "CAMERA_DEVICE_UNAVAILABLE" ? "failed" : "blocked";
    return {
      camera_permission: cameraStatus,
      package_label_scan: "blocked",
    };
  }
  return {};
}

function createFieldTestCheck(item, status, readiness = {}) {
  const statusConfig = getStatusConfig(status);
  const readinessItem = getReadinessItem(readiness, item.readinessKey);
  return {
    key: item.key,
    label: item.label,
    target: item.target,
    readinessKey: item.readinessKey,
    readinessStatus: readinessItem?.status ?? "",
    readinessMessage: readinessItem?.message ?? "",
    status: statusConfig.value,
    statusLabel: statusConfig.label,
    tone: statusConfig.tone,
  };
}

function getReadinessItem(readiness, key) {
  if (!key) return null;
  return toArray(readiness?.items).find((item) => item.key === key) ?? null;
}

function getStatusConfig(status) {
  const safeStatus = normalizeStatus(status);
  return DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS.find((item) => item.value === safeStatus) ?? DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS[0];
}

function normalizeStatus(status) {
  const safeStatus = cleanText(status);
  return DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS.some((item) => item.value === safeStatus) ? safeStatus : "untested";
}

function getBrowserLabel(userAgent) {
  const text = cleanText(userAgent);
  if (!text) return "待填写";
  if (text.includes("Edg/")) return "Microsoft Edge";
  if (text.includes("CriOS/")) return "Chrome iOS";
  if (text.includes("Chrome/")) return "Chrome";
  if (text.includes("Firefox/")) return "Firefox";
  if (text.includes("Safari/")) return "Safari";
  return "浏览器待确认";
}

function inferExpectedPackageId(task = {}, checkedPackageIds = []) {
  const checked = new Set(toArray(checkedPackageIds).map((item) => cleanText(item)).filter(Boolean));
  const checklist = toArray(task.packageChecklist);
  const nextItem = checklist.find((item) => {
    const packageId = cleanText(item?.packageId ?? item?.id);
    return packageId && !checked.has(packageId);
  });
  return cleanText(nextItem?.packageId ?? nextItem?.id ?? checklist[0]?.packageId ?? checklist[0]?.id);
}

function normalizePackageLabelScanMethod(value) {
  const safeMethod = cleanText(value);
  return DRIVER_PACKAGE_LABEL_SCAN_METHOD_OPTIONS.some((item) => item.value === safeMethod) ? safeMethod : "scanner_wedge";
}

function getPackageLabelScanMethodConfig(method) {
  return DRIVER_PACKAGE_LABEL_SCAN_METHOD_OPTIONS.find((item) => item.value === method) ?? DRIVER_PACKAGE_LABEL_SCAN_METHOD_OPTIONS[0];
}

function normalizePackageLabelScanResult(value) {
  const safeResult = cleanText(value);
  if (DRIVER_PACKAGE_LABEL_SCAN_RESULT_OPTIONS.some((item) => item.value === safeResult)) return safeResult;
  if (safeResult === "blocked") return "camera_error";
  return "failed";
}

function getPackageLabelScanResultConfig(result) {
  return DRIVER_PACKAGE_LABEL_SCAN_RESULT_OPTIONS.find((item) => item.value === result) ?? DRIVER_PACKAGE_LABEL_SCAN_RESULT_OPTIONS.at(-1);
}

function compactTimestamp(value) {
  return cleanText(value).replace(/[-:T.Z]/g, "").slice(0, 14) || "NOW";
}

function safeRecordPart(value) {
  return cleanText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "TASK";
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
