import {
  DRIVER_NATIVE_BRIDGE_VERSION,
  DRIVER_NATIVE_PACKAGE_SCAN_EVENT,
  DRIVER_NATIVE_PACKAGE_SCAN_MESSAGE_TYPE,
  buildDriverNativePackageScanRequest,
} from "./driverNativeBridgeClient.js";
import {
  DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
  DRIVER_NATIVE_NAVIGATION_EVENT,
  DRIVER_NATIVE_NAVIGATION_MESSAGE_TYPE,
  buildDriverNativeNavigationRequest,
} from "./driverNativeNavigationBridgeClient.js";

export function buildDriverNativeIntegrationKit(input = {}) {
  const { task = {}, operatorId = "", navigationUrl = "", geoPoint = "", now = new Date() } = input;
  const packageScanRequest = buildDriverNativePackageScanRequest({ task, operatorId, now });
  const navigationRequest = buildDriverNativeNavigationRequest({ task, operatorId, navigationUrl, geoPoint, now });
  const items = [
    {
      key: "native_package_scan",
      label: "原生扫码",
      version: DRIVER_NATIVE_BRIDGE_VERSION,
      messageType: DRIVER_NATIVE_PACKAGE_SCAN_MESSAGE_TYPE,
      requestId: packageScanRequest.requestId,
      directMethod: "window.erpDriverNative.scanPackageLabel(payload)",
      androidMethod: "ErpDriverNative.scanPackageLabel(JSON.stringify(payload))",
      webkitHandler: "window.webkit.messageHandlers.erpDriver.postMessage(payload)",
      eventName: DRIVER_NATIVE_PACKAGE_SCAN_EVENT,
      callbackName: "window.__erpDriverNativeBridge.receivePackageScanResult(payload)",
      resultShape: "{ requestId, status: 'scanned', scannedText, checkedAt }",
      payload: packageScanRequest,
    },
    {
      key: "native_navigation",
      label: "原生导航",
      version: DRIVER_NATIVE_NAVIGATION_BRIDGE_VERSION,
      messageType: DRIVER_NATIVE_NAVIGATION_MESSAGE_TYPE,
      requestId: navigationRequest.requestId,
      directMethod: "window.erpDriverNative.openNavigation(payload)",
      androidMethod: "ErpDriverNative.openNavigation(JSON.stringify(payload))",
      webkitHandler: "window.webkit.messageHandlers.erpDriver.postMessage(payload)",
      eventName: DRIVER_NATIVE_NAVIGATION_EVENT,
      callbackName: "window.__erpDriverNativeBridge.receiveNavigationResult(payload)",
      resultShape: "{ requestId, status: 'opened', mapApp, checkedAt }",
      payload: navigationRequest,
    },
  ];

  return {
    title: "原生壳联调",
    version: "p0-driver-native-integration-kit-v1",
    items,
    summary: `${items.length} 项桥接合同`,
    messageTypes: items.map((item) => item.messageType),
    eventNames: items.map((item) => item.eventName),
  };
}

export function getDriverNativeIntegrationKitSummary(kit = {}) {
  const items = Array.isArray(kit?.items) ? kit.items : [];
  if (!items.length) return "未生成原生壳联调清单";
  return items.map((item) => `${cleanText(item.label)} ${cleanText(item.messageType)}`).join(" / ");
}

function cleanText(value) {
  return String(value ?? "").trim();
}
