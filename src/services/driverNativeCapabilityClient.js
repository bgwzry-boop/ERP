import {
  DRIVER_NATIVE_BRIDGE_VERSION,
  getDriverNativePackageScannerSupport,
} from "./driverNativeBridgeClient.js";
import {
  DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
  getDriverNativeNavigationSupport,
} from "./driverNativeNavigationBridgeClient.js";

export function getDriverNativeCapabilityDiagnostics(env = globalThis) {
  const items = [
    buildNativeCapabilityItem({
      key: "native_package_scan",
      label: "原生扫码",
      target: "包裹标签",
      support: getDriverNativePackageScannerSupport(env),
      version: DRIVER_NATIVE_BRIDGE_VERSION,
    }),
    buildNativeCapabilityItem({
      key: "native_navigation",
      label: "原生导航",
      target: "地图打开",
      support: getDriverNativeNavigationSupport(env),
      version: DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
    }),
  ];
  const total = items.length;
  const supportedCount = items.filter((item) => item.supported).length;
  const issueCount = total - supportedCount;
  const tone = issueCount > 0 ? "warning" : "success";
  return {
    items,
    total,
    supportedCount,
    issueCount,
    tone,
    label: issueCount > 0 ? `原生 ${supportedCount}/${total}` : "原生能力可用",
    message: issueCount > 0 ? "普通浏览器未接原生壳。" : "原生壳桥接已接入。",
  };
}

export function normalizeDriverNativeCapabilityDiagnostics(value = {}) {
  if (!value || typeof value !== "object") return null;
  const items = toArray(value.items).map(normalizeNativeCapabilityItem).filter(Boolean);
  const total = Number.isFinite(Number(value.total)) && Number(value.total) > 0 ? Number(value.total) : items.length;
  const supportedCount = Number.isFinite(Number(value.supportedCount))
    ? Number(value.supportedCount)
    : items.filter((item) => item.supported).length;
  const issueCount = Number.isFinite(Number(value.issueCount))
    ? Number(value.issueCount)
    : Math.max(0, total - supportedCount);
  const tone = cleanText(value.tone) || (issueCount > 0 ? "warning" : "success");
  if (!items.length && total <= 0) return null;
  return {
    items,
    total,
    supportedCount,
    issueCount,
    tone,
    label: cleanText(value.label) || (issueCount > 0 ? `原生 ${supportedCount}/${total}` : "原生能力可用"),
    message: cleanText(value.message) || (issueCount > 0 ? "普通浏览器未接原生壳。" : "原生壳桥接已接入。"),
  };
}

function buildNativeCapabilityItem(input = {}) {
  const support = input.support ?? {};
  const supported = support.supported === true;
  return {
    key: input.key,
    label: input.label,
    target: input.target,
    supported,
    statusLabel: supported ? "可用" : "未接入",
    tone: supported ? "success" : "warning",
    bridgeType: cleanText(support.bridgeType),
    bridgeTypeLabel: getBridgeTypeLabel(support.bridgeType),
    version: cleanText(support.version) || cleanText(input.version),
    message: cleanText(support.message),
    reason: cleanText(support.reason),
  };
}

function normalizeNativeCapabilityItem(value = {}) {
  if (!value || typeof value !== "object") return null;
  const key = cleanText(value.key);
  const label = cleanText(value.label);
  if (!key && !label) return null;
  const supported = value.supported === true || cleanText(value.statusLabel) === "可用";
  const bridgeType = cleanText(value.bridgeType);
  return {
    key,
    label,
    target: cleanText(value.target),
    supported,
    statusLabel: cleanText(value.statusLabel) || (supported ? "可用" : "未接入"),
    tone: cleanText(value.tone) || (supported ? "success" : "warning"),
    bridgeType,
    bridgeTypeLabel: cleanText(value.bridgeTypeLabel) || getBridgeTypeLabel(bridgeType),
    version: cleanText(value.version),
    message: cleanText(value.message),
    reason: cleanText(value.reason),
  };
}

function getBridgeTypeLabel(value) {
  const safeValue = cleanText(value);
  if (safeValue === "direct") return "JS bridge";
  if (safeValue === "android_interface") return "Android JSON";
  if (safeValue === "webkit_message_handler") return "WebKit";
  return "未发现";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}
