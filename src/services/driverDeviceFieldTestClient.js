import {
  getDriverNativeCapabilityDiagnostics,
  normalizeDriverNativeCapabilityDiagnostics,
} from "./driverNativeCapabilityClient.js";
import { DRIVER_NATIVE_BRIDGE_VERSION } from "./driverNativeBridgeClient.js";
import { DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION } from "./driverNativeNavigationBridgeClient.js";

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
    requestId: cleanText(value.requestId ?? value.request_id),
    source: cleanText(value.source),
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
    requestId: input.requestId ?? scanResult.requestId,
    source: input.source ?? scanResult.source,
    checkedAt,
  });
}

export function normalizeDriverNativeNavigationSample(value = {}) {
  if (!value || typeof value !== "object") return null;
  const requestId = cleanText(value.requestId ?? value.request_id);
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.fulfillment_id);
  const status = cleanText(value.status);
  const source = cleanText(value.source);
  const message = cleanText(value.message);
  const hasContent = Boolean(requestId || fulfillmentId || status || source || message);
  if (!hasContent) return null;
  return {
    requestId,
    fulfillmentId,
    status,
    source,
    mapApp: cleanText(value.mapApp ?? value.map_app),
    message,
    checkedAt: toIsoString(value.checkedAt ?? value.checked_at ?? new Date()),
  };
}

export function buildDriverNativeNavigationSample(input = {}) {
  const task = input.task ?? {};
  const result = input.result ?? input.nativeResult ?? {};
  return normalizeDriverNativeNavigationSample({
    requestId: input.requestId ?? result.requestId,
    fulfillmentId: input.fulfillmentId ?? task.fulfillmentId ?? task.id,
    status: input.status ?? result.status,
    source: input.source ?? result.source,
    mapApp: input.mapApp ?? result.mapApp,
    message: input.message ?? result.message,
    checkedAt: input.checkedAt ?? result.checkedAt,
  });
}

export function getDriverDeviceFieldTestAcceptance(input = {}) {
  const record = input.record ?? {};
  const task = input.task ?? {};
  const checks = normalizeDriverDeviceFieldTestChecks(record.checks ?? []);
  const summary = getDriverDeviceFieldTestSummary(checks);
  const recordFulfillmentId = cleanText(record.fulfillmentId);
  const taskFulfillmentId = cleanText(task.fulfillmentId ?? task.id);
  const recordOrderLineId = cleanText(record.orderLineId);
  const taskOrderLineId = cleanText(task.orderLineId);
  const recordDriverId = cleanText(record.driverId);
  const taskDriverId = cleanText(task.driverId);
  const sample = normalizeDriverPackageLabelScanSample(record.packageLabelScanSample);
  const navigationSample = normalizeDriverNativeNavigationSample(record.nativeNavigationSample);
  const nativeDiagnostics = normalizeDriverNativeCapabilityDiagnostics(record.nativeBridgeDiagnostics);
  const expectedPackageIds = new Set(
    toArray(task.packageChecklist)
      .map((item) => cleanText(item?.packageId ?? item?.id))
      .filter(Boolean),
  );
  const packageScanCapability = getNativeCapabilityAcceptance(
    nativeDiagnostics,
    "native_package_scan",
    DRIVER_NATIVE_BRIDGE_VERSION,
  );
  const navigationCapability = getNativeCapabilityAcceptance(
    nativeDiagnostics,
    "native_navigation",
    DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
  );
  const taskLinked = Boolean(recordFulfillmentId && taskFulfillmentId && recordFulfillmentId === taskFulfillmentId);
  const orderLineLinked = !recordOrderLineId || !taskOrderLineId || recordOrderLineId === taskOrderLineId;
  const driverLinked = Boolean(recordDriverId && taskDriverId && recordDriverId === taskDriverId);
  const packageIdsMatch = Boolean(
    sample?.expectedPackageId &&
      sample?.matchedPackageId &&
      sample.expectedPackageId === sample.matchedPackageId,
  );
  const packageBelongsToTask = Boolean(sample?.matchedPackageId && expectedPackageIds.has(sample.matchedPackageId));
  const packageSampleReady = Boolean(
    sample &&
      sample.fulfillmentId === recordFulfillmentId &&
      sample.method === "native_sdk" &&
      sample.source === "native_sdk" &&
      sample.requestId.startsWith("DNPS-") &&
      ["matched", "duplicate"].includes(sample.result) &&
      sample.scannedText &&
      packageIdsMatch &&
      packageBelongsToTask,
  );
  const navigationSampleReady = Boolean(
    navigationSample &&
      navigationSample.fulfillmentId === recordFulfillmentId &&
      navigationSample.status === "opened" &&
      navigationSample.source === "native_navigation_sdk" &&
      navigationSample.requestId.startsWith("DNN-"),
  );
  const deviceIdentityReady = Boolean(
    cleanText(record.deviceLabel) &&
      cleanText(record.browserLabel) &&
      !["待填写", "浏览器待确认"].includes(cleanText(record.deviceLabel)) &&
      !["待填写", "浏览器待确认"].includes(cleanText(record.browserLabel)),
  );
  const allChecksPassed = summary.passedCount === summary.total && summary.total === DRIVER_DEVICE_FIELD_TEST_ITEMS.length;
  const blockers = [
    acceptanceBlocker("task_link", taskLinked, "验收记录必须关联当前权威送货任务"),
    acceptanceBlocker("order_line_link", orderLineLinked, "验收记录订单行与送货任务不一致"),
    acceptanceBlocker("driver_link", driverLinked, "验收司机必须与任务分配司机一致"),
    acceptanceBlocker("device_identity", deviceIdentityReady, "必须填写真实手机型号和运行环境"),
    acceptanceBlocker("field_checks", allChecksPassed, "司机手机 6 项现场检查尚未全部通过"),
    acceptanceBlocker("native_package_scan", packageScanCapability.ready, packageScanCapability.detail),
    acceptanceBlocker("package_sample", packageSampleReady, "必须用原生 SDK 扫描并严格匹配当前任务的真实包裹标签"),
    acceptanceBlocker("native_navigation", navigationCapability.ready, navigationCapability.detail),
    acceptanceBlocker("navigation_sample", navigationSampleReady, "必须保留当前任务原生导航成功打开的回执"),
  ].filter(Boolean);
  const ready = blockers.length === 0;
  return {
    ready,
    status: ready ? "accepted" : "pending",
    statusLabel: ready ? "现场验收已通过" : "现场验收未通过",
    allChecksPassed,
    taskLinked,
    orderLineLinked,
    driverLinked,
    deviceIdentityReady,
    packageSampleReady,
    packageIdsMatch,
    packageBelongsToTask,
    navigationSampleReady,
    nativePackageScanReady: packageScanCapability.ready,
    nativeNavigationReady: navigationCapability.ready,
    blockerCount: blockers.length,
    blockers,
  };
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
    nativeNavigationSample,
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
    nativeNavigationSample: normalizeDriverNativeNavigationSample(nativeNavigationSample),
    nativeBridgeDiagnostics:
      normalizeDriverNativeCapabilityDiagnostics(nativeBridgeDiagnostics) ?? getDriverNativeCapabilityDiagnostics(env),
    note: cleanText(note),
  };
}

function getNativeCapabilityAcceptance(diagnostics, key, expectedVersion) {
  const item = toArray(diagnostics?.items).find((candidate) => cleanText(candidate?.key) === key);
  const supportedBridge = ["direct", "android_interface", "webkit_message_handler"].includes(cleanText(item?.bridgeType));
  const versionMatches = cleanText(item?.version) === expectedVersion;
  const ready = item?.supported === true && supportedBridge && versionMatches;
  return {
    ready,
    detail: ready
      ? `${cleanText(item.label) || key}桥接有效`
      : `${cleanText(item?.label) || key}必须由受支持的原生桥接和当前协议版本证明`,
  };
}

function acceptanceBlocker(key, passed, detail) {
  return passed ? null : { key, detail };
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
