export const DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION = "p0-driver-native-navigation-bridge-v1";
export const DRIVER_NATIVE_NAVIGATION_EVENT = "erp-driver-native-navigation";
export const DRIVER_NATIVE_NAVIGATION_MESSAGE_TYPE = "driver.navigation.open";
export const DRIVER_NATIVE_NAVIGATION_TIMEOUT_MS = 10000;

export function getDriverNativeNavigationSupport(env = globalThis) {
  const directBridge = getDirectNativeNavigationBridge(env);
  const webkitHandler = getWebkitDriverHandler(env);
  if (directBridge) {
    return {
      supported: true,
      reason: "SUPPORTED",
      bridgeType: directBridge.bridgeType,
      message: "原生导航 SDK 可用。",
      version: DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
    };
  }
  if (webkitHandler) {
    return {
      supported: true,
      reason: "SUPPORTED",
      bridgeType: "webkit_message_handler",
      message: "原生导航 SDK 可用。",
      version: DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
    };
  }
  return {
    supported: false,
    reason: "NATIVE_NAVIGATION_BRIDGE_UNAVAILABLE",
    bridgeType: "",
    message: "原生导航 SDK 未接入，可继续使用外部地图链接。",
    version: DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
  };
}

export async function requestDriverNativeNavigation(input = {}) {
  const {
    env = globalThis,
    task = {},
    navigationUrl = "",
    operatorId,
    geoPoint = "",
    timeoutMs = DRIVER_NATIVE_NAVIGATION_TIMEOUT_MS,
    now = new Date(),
  } = input;
  const support = getDriverNativeNavigationSupport(env);
  if (!support.supported) {
    throw createDriverNativeNavigationError("NATIVE_NAVIGATION_BRIDGE_UNAVAILABLE", support.message);
  }

  const request = buildDriverNativeNavigationRequest({
    task,
    navigationUrl,
    operatorId,
    geoPoint,
    now,
  });
  if (!request.address && !request.navigationUrl) {
    throw createDriverNativeNavigationError("NATIVE_NAVIGATION_TARGET_MISSING", "导航地址待补，无法调用原生导航。");
  }

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

    cleanupHandlers.push(registerNativeNavigationListener(env, request.requestId, finish));
    cleanupHandlers.push(registerNativeNavigationCallback(env, request.requestId, finish));
    const timeoutId = (env.setTimeout ?? setTimeout)(() => {
      finish(createDriverNativeNavigationError("NATIVE_NAVIGATION_TIMEOUT", "原生导航 SDK 未在规定时间内返回结果。"), true);
    }, Math.max(1000, Number(timeoutMs || DRIVER_NATIVE_NAVIGATION_TIMEOUT_MS)));
    cleanupHandlers.push(() => (env.clearTimeout ?? clearTimeout)(timeoutId));

    try {
      const invokeResult = invokeNativeNavigation(env, support, request);
      Promise.resolve(invokeResult)
        .then((result) => {
          const normalized = normalizeDriverNativeNavigationResult(result, request);
          if (normalized.errorCode) {
            finish(createDriverNativeNavigationError(normalized.errorCode, normalized.message || "原生导航 SDK 返回异常。"), true);
            return;
          }
          if (isTerminalNativeNavigationResult(normalized)) finish(normalized);
        })
        .catch((error) => finish(normalizeNativeNavigationError(error), true));
    } catch (error) {
      finish(normalizeNativeNavigationError(error), true);
    }
  });
}

export function normalizeDriverNativeNavigationResult(value, fallback = {}) {
  if (value === true) {
    return createOpenedNavigationResult(fallback, "原生导航 SDK 已接收导航请求。");
  }
  if (value === false) {
    return createFailedNavigationResult(fallback, "原生导航 SDK 未能打开导航。");
  }
  if (typeof value === "string") {
    const parsed = parseMaybeJson(value);
    if (parsed && typeof parsed === "object") {
      return normalizeDriverNativeNavigationResult(parsed, fallback);
    }
    const text = cleanText(value);
    const status = normalizeNativeNavigationStatus(text, "");
    return {
      requestId: cleanText(fallback.requestId),
      status,
      message: text ? getNavigationStatusMessage(status, text) : "",
      mapApp: "",
      navigationUrl: cleanText(fallback.navigationUrl),
      checkedAt: toIsoString(fallback.checkedAt ?? new Date()),
      source: "native_navigation_sdk",
      errorCode: status === "failed" ? "NATIVE_NAVIGATION_FAILED" : "",
    };
  }
  if (!value || typeof value !== "object") {
    return {
      requestId: cleanText(fallback.requestId),
      status: "pending",
      message: "",
      mapApp: "",
      navigationUrl: cleanText(fallback.navigationUrl),
      checkedAt: toIsoString(fallback.checkedAt ?? new Date()),
      source: "native_navigation_sdk",
      errorCode: "",
    };
  }

  const errorCode = cleanText(value.errorCode ?? value.error_code);
  const status = normalizeNativeNavigationStatus(value.status ?? value.result, errorCode, true);
  const message = cleanText(value.message ?? value.reason) || getNavigationStatusMessage(status, "");
  return {
    requestId: cleanText(value.requestId ?? value.request_id ?? fallback.requestId),
    status,
    message,
    mapApp: cleanText(value.mapApp ?? value.map_app ?? value.provider ?? value.app),
    navigationUrl: cleanText(value.navigationUrl ?? value.navigation_url ?? value.url ?? fallback.navigationUrl),
    checkedAt: toIsoString(value.checkedAt ?? value.checked_at ?? fallback.checkedAt ?? new Date()),
    source: "native_navigation_sdk",
    errorCode,
  };
}

export function buildDriverNativeNavigationRequest(input = {}) {
  const checkedAt = toIsoString(input.now ?? new Date());
  const task = input.task ?? {};
  const fulfillmentId = cleanText(task.fulfillmentId ?? task.id);
  return {
    type: DRIVER_NATIVE_NAVIGATION_MESSAGE_TYPE,
    version: DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
    requestId: `DNN-${compactTimestamp(checkedAt)}-${safeRecordPart(fulfillmentId || "TASK")}`,
    fulfillmentId,
    orderLineId: cleanText(task.orderLineId),
    operatorId: cleanText(input.operatorId),
    customerName: cleanText(task.customerName),
    contactName: cleanText(task.contactName),
    contactPhone: cleanText(task.contactPhone),
    address: cleanText(task.address),
    addressArea: cleanText(task.addressArea),
    navigationUrl: cleanText(input.navigationUrl ?? task.navigationUrl),
    geoPoint: cleanText(input.geoPoint ?? task.geoPoint ?? task.watermarkGeoPoint),
    routeDate: cleanText(task.routeDate),
    routeNo: cleanText(task.routeNo),
    routeSequence: Number(task.routeSequence || 0),
    plannedDepartureAt: cleanText(task.plannedDepartureAt),
    checkedAt,
  };
}

function invokeNativeNavigation(env, support, request) {
  const directBridge = getDirectNativeNavigationBridge(env);
  if (directBridge) {
    const rawResult = directBridge.bridgeType === "android_interface"
      ? directBridge.bridge.openNavigation(JSON.stringify(request))
      : directBridge.bridge.openNavigation(request);
    if (typeof rawResult === "undefined" || rawResult === null) {
      return createOpenedNavigationResult(request, "原生导航 SDK 已接收导航请求。");
    }
    return rawResult;
  }
  const webkitHandler = getWebkitDriverHandler(env);
  if (webkitHandler) {
    webkitHandler.postMessage(request);
    return null;
  }
  throw createDriverNativeNavigationError("NATIVE_NAVIGATION_BRIDGE_UNAVAILABLE", support.message);
}

function registerNativeNavigationListener(env, requestId, finish) {
  if (typeof env.addEventListener !== "function") return () => {};
  const onNativeNavigation = (event) => {
    const payload = event?.detail ?? event;
    const normalized = normalizeDriverNativeNavigationResult(payload, { requestId });
    if (!nativeNavigationMatchesRequest(normalized, requestId)) return;
    if (normalized.errorCode) {
      finish(createDriverNativeNavigationError(normalized.errorCode, normalized.message || "原生导航 SDK 返回异常。"), true);
      return;
    }
    if (isTerminalNativeNavigationResult(normalized)) finish(normalized);
  };
  env.addEventListener(DRIVER_NATIVE_NAVIGATION_EVENT, onNativeNavigation);
  return () => env.removeEventListener?.(DRIVER_NATIVE_NAVIGATION_EVENT, onNativeNavigation);
}

function registerNativeNavigationCallback(env, requestId, finish) {
  const callbackRoot = env.__erpDriverNativeBridge && typeof env.__erpDriverNativeBridge === "object"
    ? env.__erpDriverNativeBridge
    : {};
  const previousCallback = callbackRoot.receiveNavigationResult;
  callbackRoot.receiveNavigationResult = (payload) => {
    const normalized = normalizeDriverNativeNavigationResult(payload, { requestId });
    if (!nativeNavigationMatchesRequest(normalized, requestId)) return;
    if (normalized.errorCode) {
      finish(createDriverNativeNavigationError(normalized.errorCode, normalized.message || "原生导航 SDK 返回异常。"), true);
      return;
    }
    if (isTerminalNativeNavigationResult(normalized)) finish(normalized);
  };
  env.__erpDriverNativeBridge = callbackRoot;
  return () => {
    if (previousCallback) callbackRoot.receiveNavigationResult = previousCallback;
    else delete callbackRoot.receiveNavigationResult;
  };
}

function nativeNavigationMatchesRequest(result, requestId) {
  return !result.requestId || result.requestId === requestId;
}

function isTerminalNativeNavigationResult(result) {
  if (!result) return false;
  if (result.errorCode) return true;
  return ["opened", "canceled", "failed", "unavailable"].includes(result.status);
}

function getDirectNativeNavigationBridge(env) {
  const bridgeCandidates = [
    { bridge: env?.erpDriverNative, bridgeType: "direct" },
    { bridge: env?.DriverNativeBridge, bridgeType: "direct" },
    { bridge: env?.ErpDriverNative, bridgeType: "android_interface" },
    { bridge: env?.AndroidDriverNative, bridgeType: "android_interface" },
  ];
  return bridgeCandidates.find((item) => typeof item.bridge?.openNavigation === "function") ?? null;
}

function getWebkitDriverHandler(env) {
  const handler = env?.webkit?.messageHandlers?.erpDriver;
  return typeof handler?.postMessage === "function" ? handler : null;
}

function normalizeNativeNavigationStatus(status, errorCode, defaultOpened = false) {
  const safeStatus = cleanText(status);
  if (errorCode) return "failed";
  if (["opened", "open", "success", "ok", "launched", "accepted"].includes(safeStatus)) return "opened";
  if (["cancel", "canceled", "cancelled"].includes(safeStatus)) return "canceled";
  if (["unavailable", "unsupported", "not_available"].includes(safeStatus)) return "unavailable";
  if (["failed", "fail", "error"].includes(safeStatus)) return "failed";
  if (["pending", "processing"].includes(safeStatus)) return "pending";
  return defaultOpened ? "opened" : "pending";
}

function getNavigationStatusMessage(status, fallbackMessage) {
  if (fallbackMessage && !["opened", "success", "ok", "launched", "accepted", "cancel", "canceled", "failed", "fail", "error"].includes(fallbackMessage)) {
    return fallbackMessage;
  }
  if (status === "opened") return "原生导航 SDK 已打开导航。";
  if (status === "canceled") return "原生导航已取消。";
  if (status === "unavailable") return "原生导航 SDK 当前不可用。";
  if (status === "failed") return "原生导航 SDK 打开失败。";
  return "";
}

function createOpenedNavigationResult(fallback, message) {
  return {
    requestId: cleanText(fallback.requestId),
    status: "opened",
    message,
    mapApp: "",
    navigationUrl: cleanText(fallback.navigationUrl),
    checkedAt: toIsoString(fallback.checkedAt ?? new Date()),
    source: "native_navigation_sdk",
    errorCode: "",
  };
}

function createFailedNavigationResult(fallback, message) {
  return {
    requestId: cleanText(fallback.requestId),
    status: "failed",
    message,
    mapApp: "",
    navigationUrl: cleanText(fallback.navigationUrl),
    checkedAt: toIsoString(fallback.checkedAt ?? new Date()),
    source: "native_navigation_sdk",
    errorCode: "NATIVE_NAVIGATION_FAILED",
  };
}

function normalizeNativeNavigationError(error) {
  if (error?.code) return error;
  return createDriverNativeNavigationError("NATIVE_NAVIGATION_FAILED", error?.message ?? String(error));
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

function createDriverNativeNavigationError(code, message) {
  const error = new Error(message);
  error.code = cleanText(code) || "NATIVE_NAVIGATION_FAILED";
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
