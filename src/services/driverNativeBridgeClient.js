export const DRIVER_NATIVE_BRIDGE_VERSION = "p0-driver-native-bridge-v1";
export const DRIVER_NATIVE_PACKAGE_SCAN_EVENT = "erp-driver-native-package-scan";
export const DRIVER_NATIVE_PACKAGE_SCAN_MESSAGE_TYPE = "driver.packageLabel.scan";
export const DRIVER_NATIVE_PACKAGE_SCAN_TIMEOUT_MS = 15000;

export function getDriverNativePackageScannerSupport(env = globalThis) {
  const directBridge = getDirectNativeBridge(env);
  const webkitHandler = getWebkitDriverHandler(env);
  if (directBridge) {
    return {
      supported: true,
      reason: "SUPPORTED",
      bridgeType: directBridge.bridgeType,
      message: "原生扫码 SDK 可用。",
      version: DRIVER_NATIVE_BRIDGE_VERSION,
    };
  }
  if (webkitHandler) {
    return {
      supported: true,
      reason: "SUPPORTED",
      bridgeType: "webkit_message_handler",
      message: "原生扫码 SDK 可用。",
      version: DRIVER_NATIVE_BRIDGE_VERSION,
    };
  }
  return {
    supported: false,
    reason: "NATIVE_BRIDGE_UNAVAILABLE",
    bridgeType: "",
    message: "原生扫码 SDK 未接入，可继续用扫码枪、手输或相机扫码。",
    version: DRIVER_NATIVE_BRIDGE_VERSION,
  };
}

export async function requestDriverNativePackageLabelScan(input = {}) {
  const {
    env = globalThis,
    task = {},
    operatorId,
    timeoutMs = DRIVER_NATIVE_PACKAGE_SCAN_TIMEOUT_MS,
    now = new Date(),
  } = input;
  const support = getDriverNativePackageScannerSupport(env);
  if (!support.supported) {
    throw createDriverNativeBridgeError("NATIVE_BRIDGE_UNAVAILABLE", support.message);
  }

  const request = buildDriverNativePackageScanRequest({
    task,
    operatorId,
    now,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanupHandlers = [];
    const finish = (value, isError = false) => {
      if (settled) return;
      settled = true;
      cleanupHandlers.forEach((cleanup) => cleanup());
      if (isError) reject(value);
      else resolve(value);
    };

    cleanupHandlers.push(registerNativePackageScanListener(env, request.requestId, finish));
    cleanupHandlers.push(registerNativePackageScanCallback(env, request.requestId, finish));
    const timeoutId = (env.setTimeout ?? setTimeout)(() => {
      finish(createDriverNativeBridgeError("NATIVE_SCAN_TIMEOUT", "原生扫码 SDK 未在规定时间内返回结果。"), true);
    }, Math.max(1000, Number(timeoutMs || DRIVER_NATIVE_PACKAGE_SCAN_TIMEOUT_MS)));
    cleanupHandlers.push(() => (env.clearTimeout ?? clearTimeout)(timeoutId));

    try {
      const invokeResult = invokeNativePackageScanner(env, support, request);
      Promise.resolve(invokeResult)
        .then((result) => {
          const normalized = normalizeDriverNativePackageScanResult(result, request);
          if (isTerminalNativePackageScanResult(normalized)) finish(normalized);
        })
        .catch((error) => finish(normalizeNativeBridgeError(error), true));
    } catch (error) {
      finish(normalizeNativeBridgeError(error), true);
    }
  });
}

export function normalizeDriverNativePackageScanResult(value, fallback = {}) {
  if (typeof value === "string") {
    const parsed = parseMaybeJson(value);
    if (parsed && typeof parsed === "object") {
      return normalizeDriverNativePackageScanResult(parsed, fallback);
    }
    const scannedText = cleanText(value);
    return {
      requestId: cleanText(fallback.requestId),
      status: scannedText ? "scanned" : "empty",
      scannedText,
      rawText: scannedText,
      message: scannedText ? "原生扫码 SDK 已返回包裹码。" : "原生扫码 SDK 未返回包裹码。",
      checkedAt: toIsoString(fallback.checkedAt ?? new Date()),
      source: "native_sdk",
    };
  }
  if (!value || typeof value !== "object") {
    return {
      requestId: cleanText(fallback.requestId),
      status: "pending",
      scannedText: "",
      rawText: "",
      message: "",
      checkedAt: toIsoString(fallback.checkedAt ?? new Date()),
      source: "native_sdk",
    };
  }
  const scannedText = cleanText(
    value.scannedText ?? value.scanned_text ?? value.rawValue ?? value.displayValue ?? value.code ?? value.text ?? value.value,
  );
  const rawText = cleanText(value.rawText ?? value.raw_text) || scannedText;
  const errorCode = cleanText(value.errorCode ?? value.error_code);
  const checkedAt = toIsoString(value.checkedAt ?? value.checked_at ?? fallback.checkedAt ?? new Date());
  return {
    requestId: cleanText(value.requestId ?? value.request_id ?? fallback.requestId),
    status: normalizeNativePackageScanStatus(value.status ?? value.result, scannedText, errorCode),
    scannedText,
    rawText,
    message: cleanText(value.message),
    errorCode,
    checkedAt,
    source: "native_sdk",
  };
}

export function buildDriverNativePackageScanRequest(input = {}) {
  const checkedAt = toIsoString(input.now ?? new Date());
  const task = input.task ?? {};
  const fulfillmentId = cleanText(task.fulfillmentId ?? task.id);
  return {
    type: DRIVER_NATIVE_PACKAGE_SCAN_MESSAGE_TYPE,
    version: DRIVER_NATIVE_BRIDGE_VERSION,
    requestId: `DNPS-${compactTimestamp(checkedAt)}-${safeRecordPart(fulfillmentId || "TASK")}`,
    fulfillmentId,
    orderLineId: cleanText(task.orderLineId),
    operatorId: cleanText(input.operatorId),
    expectedPackageIds: toArray(task.packageChecklist)
      .map((item) => cleanText(item?.packageId ?? item?.id))
      .filter(Boolean),
    checkedAt,
  };
}

function invokeNativePackageScanner(env, support, request) {
  const directBridge = getDirectNativeBridge(env);
  if (directBridge) {
    if (directBridge.bridgeType === "android_interface") {
      return directBridge.bridge.scanPackageLabel(JSON.stringify(request));
    }
    return directBridge.bridge.scanPackageLabel(request);
  }
  const webkitHandler = getWebkitDriverHandler(env);
  if (webkitHandler) {
    webkitHandler.postMessage(request);
    return null;
  }
  throw createDriverNativeBridgeError("NATIVE_BRIDGE_UNAVAILABLE", support.message);
}

function registerNativePackageScanListener(env, requestId, finish) {
  if (typeof env.addEventListener !== "function") return () => {};
  const onNativeScan = (event) => {
    const payload = event?.detail ?? event;
    const normalized = normalizeDriverNativePackageScanResult(payload, { requestId });
    if (!nativePackageScanMatchesRequest(normalized, requestId)) return;
    if (normalized.errorCode) {
      finish(createDriverNativeBridgeError(normalized.errorCode, normalized.message || "原生扫码 SDK 返回异常。"), true);
      return;
    }
    if (isTerminalNativePackageScanResult(normalized)) finish(normalized);
  };
  env.addEventListener(DRIVER_NATIVE_PACKAGE_SCAN_EVENT, onNativeScan);
  return () => env.removeEventListener?.(DRIVER_NATIVE_PACKAGE_SCAN_EVENT, onNativeScan);
}

function registerNativePackageScanCallback(env, requestId, finish) {
  const callbackRoot = env.__erpDriverNativeBridge && typeof env.__erpDriverNativeBridge === "object"
    ? env.__erpDriverNativeBridge
    : {};
  const previousCallback = callbackRoot.receivePackageScanResult;
  callbackRoot.receivePackageScanResult = (payload) => {
    const normalized = normalizeDriverNativePackageScanResult(payload, { requestId });
    if (!nativePackageScanMatchesRequest(normalized, requestId)) return;
    if (normalized.errorCode) {
      finish(createDriverNativeBridgeError(normalized.errorCode, normalized.message || "原生扫码 SDK 返回异常。"), true);
      return;
    }
    if (isTerminalNativePackageScanResult(normalized)) finish(normalized);
  };
  env.__erpDriverNativeBridge = callbackRoot;
  return () => {
    if (previousCallback) callbackRoot.receivePackageScanResult = previousCallback;
    else delete callbackRoot.receivePackageScanResult;
  };
}

function nativePackageScanMatchesRequest(result, requestId) {
  return !result.requestId || result.requestId === requestId;
}

function isTerminalNativePackageScanResult(result) {
  if (!result) return false;
  if (result.errorCode) return true;
  if (result.scannedText) return true;
  return ["canceled", "failed", "empty"].includes(result.status);
}

function getDirectNativeBridge(env) {
  const bridgeCandidates = [
    { bridge: env?.erpDriverNative, bridgeType: "direct" },
    { bridge: env?.DriverNativeBridge, bridgeType: "direct" },
    { bridge: env?.ErpDriverNative, bridgeType: "android_interface" },
    { bridge: env?.AndroidDriverNative, bridgeType: "android_interface" },
  ];
  return bridgeCandidates.find((item) => typeof item.bridge?.scanPackageLabel === "function") ?? null;
}

function getWebkitDriverHandler(env) {
  const handler = env?.webkit?.messageHandlers?.erpDriver;
  return typeof handler?.postMessage === "function" ? handler : null;
}

function normalizeNativePackageScanStatus(status, scannedText, errorCode) {
  const safeStatus = cleanText(status);
  if (errorCode) return "failed";
  if (["scanned", "matched", "success", "ok"].includes(safeStatus)) return "scanned";
  if (["cancel", "canceled", "cancelled"].includes(safeStatus)) return "canceled";
  if (["empty", "none"].includes(safeStatus)) return "empty";
  if (["failed", "error"].includes(safeStatus)) return "failed";
  return scannedText ? "scanned" : "pending";
}

function normalizeNativeBridgeError(error) {
  if (error?.code) return error;
  return createDriverNativeBridgeError("NATIVE_SCAN_FAILED", error?.message ?? String(error));
}

function parseMaybeJson(value) {
  const text = cleanText(value);
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createDriverNativeBridgeError(code, message) {
  const error = new Error(message);
  error.code = cleanText(code) || "NATIVE_SCAN_FAILED";
  return error;
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
