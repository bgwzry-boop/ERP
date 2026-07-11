import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import { createDeliveryEvidenceAttachmentInput } from "../src/services/officeAttachmentApiClient.js";
import {
  applyDriverPackageScan,
  buildLocalDriverDeliveryTasks,
  buildDriverLoadPackageCheckRemark,
  buildDriverLoadRouteRemark,
  completeDriverDeliveryTask,
  confirmDriverDeliveryLoaded,
  getDriverLoadPackageCheckState,
  getDriverNavigationUrl,
  getDriverRouteExecutionContext,
  getDriverRouteLabel,
  getDriverRouteStopLabel,
  getDriverTaskMetrics,
  listDriverDeliveryTasks,
  mapDriverDeliveryExceptionReason,
  mapDriverDeliveryStatus,
  recordDriverDeviceFieldTest,
  reportDriverDeliveryException,
  sortDriverDeliveryTasks,
} from "../src/services/driverMobileApiClient.js";
import {
  buildDeliveryWatermarkImageLines,
  createWatermarkedDeliveryImageDataUrl,
  estimateDataUrlByteSize,
  getWatermarkedDeliveryFileName,
} from "../src/services/driverWatermarkImageClient.js";
import {
  appendDriverDeviceFieldTestNote,
  applyDriverPackageCameraFieldTestSignal,
  applyDriverPackageLabelScanFieldTestSignal,
  buildDriverDeviceFieldTestRecord,
  buildDriverPackageLabelScanSample,
  createDriverDeviceFieldTestChecks,
  getDriverDeviceFieldTestContext,
  getDriverDeviceFieldTestSummary,
  getDriverPackageLabelScanSampleSummary,
  normalizeDriverPackageLabelScanSample,
  updateDriverDeviceFieldTestCheck,
} from "../src/services/driverDeviceFieldTestClient.js";
import {
  captureDriverDeliveryPhotoFromVideo,
  getDriverDeliveryPhotoCameraSupport,
  startDriverDeliveryPhotoCamera,
} from "../src/services/driverCameraPhotoClient.js";
import { getDriverDeviceReadiness } from "../src/services/driverDeviceReadinessClient.js";
import {
  getDriverPackageCameraScannerSupport,
  normalizeDriverPackageBarcodeResults,
  startDriverPackageCameraScanner,
} from "../src/services/driverPackageCameraScannerClient.js";
import {
  buildDriverNativePackageScanRequest,
  DRIVER_NATIVE_PACKAGE_SCAN_EVENT,
  getDriverNativePackageScannerSupport,
  normalizeDriverNativePackageScanResult,
  requestDriverNativePackageLabelScan,
} from "../src/services/driverNativeBridgeClient.js";
import {
  buildDriverNativeNavigationRequest,
  DRIVER_NATIVE_NAVIGATION_EVENT,
  getDriverNativeNavigationSupport,
  normalizeDriverNativeNavigationResult,
  requestDriverNativeNavigation,
} from "../src/services/driverNativeNavigationBridgeClient.js";
import { getDriverNativeCapabilityDiagnostics } from "../src/services/driverNativeCapabilityClient.js";
import {
  buildDriverNativeIntegrationKit,
  getDriverNativeIntegrationKitSummary,
} from "../src/services/driverNativeIntegrationKitClient.js";

const authState = createLocalSeedAuthState("U-DRIVER-A");
const customers = [
  {
    id: "C002",
    name: "李四电商",
    contact: "李四",
    phone: "139****6221",
    address: "厚街仓库 A 区",
  },
];
const orderLines = [
  {
    id: "ORD-0629-022-01",
    customerId: "C002",
    product: "外卖活动袋",
    size: "40*30*10",
    color: "黄色",
    handle: "普通提",
    style: "空白袋",
    print: "是",
    printColor: "黑色",
    printSide: "双面",
    handleColor: "红色",
    qty: 3000,
    latest: "明天 19:00",
    exceptions: [],
  },
];
const fulfillments = [
  {
    id: "F008",
    method: "送货",
    customerId: "C002",
    lineId: "ORD-0629-022-01",
    goods: "外卖活动袋 40*30 黄袋红提",
    qty: 3000,
    packages: "6包",
    status: "待出库",
    latest: "明天 19:00",
    zone: "打包区",
    source: "生产中",
    routeDate: "2026-07-02",
    routeNo: "虎门线-A",
    routeSequence: 2,
    dispatchStatus: "已派单",
    plannedDepartureAt: "2026-07-02T08:30:00.000Z",
  },
];

assert(mapDriverDeliveryStatus("待出库") === "待送货", "pending delivery status was not mapped");
assert(mapDriverDeliveryStatus("配送中") === "配送中", "delivering status was not mapped");
assert(mapDriverDeliveryStatus("已交付") === "已完成", "completed delivery status was not mapped");
assert(mapDriverDeliveryStatus("数量不符") === "送货异常", "exception delivery status was not mapped");
assert(mapDriverDeliveryExceptionReason("装车少货") === "load_shortage", "load-shortage reason was not mapped");
assert(mapDriverDeliveryExceptionReason("客户不在") === "customer_unavailable", "customer-unavailable reason was not mapped");
assert(mapDriverDeliveryExceptionReason("未知") === "other", "unknown exception reason should map to other");

const watermarkImageLines = buildDeliveryWatermarkImageLines({
  watermarkOperatorName: "司机A",
  watermarkOrderRef: "#022-01",
  watermarkId: "WM-FRONT-SMOKE",
  watermarkAddress: "厚街仓库 A 区",
  watermarkCapturedAt: "2026-07-02T09:00:00.000Z",
  watermarkLocationLabel: "厚街仓库门岗",
  watermarkGeoPoint: "22.920000,113.680000",
});
assert(watermarkImageLines[0].includes("WM-FRONT-SMOKE"), "watermark image lines missed watermark id");
assert(watermarkImageLines.some((line) => line.includes("地址 厚街仓库")), "watermark image lines missed delivery address");
assert(
  getWatermarkedDeliveryFileName("driver-proof.png", "WM-FRONT-SMOKE") === "driver-proof-WM-FRONT-SMOKE.jpg",
  "watermarked delivery file name is incorrect",
);
assert(estimateDataUrlByteSize("data:image/png;base64,QUJDRA==") === 4, "data URL byte estimate is incorrect");
assert(
  (await createWatermarkedDeliveryImageDataUrl("data:image/png;base64,AAAA", { watermarkId: "WM-NODE-FALLBACK" })) ===
    "data:image/png;base64,AAAA",
  "watermark image client should safely fall back without browser canvas APIs",
);

const fullDeviceReadiness = getDriverDeviceReadiness({
  navigator: {
    mediaDevices: { getUserMedia() {} },
    geolocation: { getCurrentPosition() {} },
  },
  document: { createElement() {} },
  BarcodeDetector: class {},
  FileReader: class {},
});
assert(fullDeviceReadiness.summary.label === "4/4 项可用", "driver device readiness summary should report full support");
assert(fullDeviceReadiness.summary.tone === "success", "driver device readiness summary should be success when all items are available");
assert(
  fullDeviceReadiness.items.every((item) => item.status === "available"),
  "driver device readiness should mark every full-support item available",
);

const missingBarcodeReadiness = getDriverDeviceReadiness({
  navigator: {
    mediaDevices: { getUserMedia() {} },
    geolocation: { getCurrentPosition() {} },
  },
  document: { createElement() {} },
  FileReader: class {},
});
assert(
  missingBarcodeReadiness.items.find((item) => item.key === "package_camera_scan")?.status === "fallback",
  "driver device readiness should fall back when BarcodeDetector is missing",
);
assert(missingBarcodeReadiness.summary.tone === "warning", "missing BarcodeDetector should produce a warning readiness summary");

const missingMediaReadiness = getDriverDeviceReadiness({
  navigator: {},
  document: { createElement() {} },
  FileReader: class {},
});
assert(
  missingMediaReadiness.items.find((item) => item.key === "delivery_camera")?.status === "fallback",
  "driver device readiness should fall back when delivery camera media support is missing",
);
assert(
  missingMediaReadiness.items.find((item) => item.key === "package_camera_scan")?.status === "fallback",
  "driver device readiness should fall back when package camera media support is missing",
);
assert(
  missingMediaReadiness.items.find((item) => item.key === "geolocation")?.status === "fallback",
  "driver device readiness should fall back when geolocation is missing",
);

const missingFileReaderReadiness = getDriverDeviceReadiness({
  navigator: { mediaDevices: { getUserMedia() {} } },
  document: { createElement() {} },
  BarcodeDetector: class {},
});
assert(
  missingFileReaderReadiness.items.find((item) => item.key === "file_upload_fallback")?.status === "partial",
  "driver device readiness should mark file upload partial when FileReader is missing",
);

const fieldTestContext = getDriverDeviceFieldTestContext({
  navigator: {
    platform: "iPhone",
    userAgent: "Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    language: "zh-CN",
  },
});
assert(fieldTestContext.deviceLabel === "iPhone", "driver device field test context should detect platform");
assert(fieldTestContext.browserLabel === "Safari", "driver device field test context should detect Safari");
const defaultFieldTestChecks = createDriverDeviceFieldTestChecks(fullDeviceReadiness);
assert(defaultFieldTestChecks.length === 6, "driver device field test should include six manual checks");
assert(
  defaultFieldTestChecks.every((item) => item.status === "untested"),
  "driver device field test checks should start untested",
);
let updatedFieldTestChecks = updateDriverDeviceFieldTestCheck(defaultFieldTestChecks, "camera_permission", "passed", fullDeviceReadiness);
updatedFieldTestChecks = updateDriverDeviceFieldTestCheck(updatedFieldTestChecks, "watermark_photo", "passed", fullDeviceReadiness);
updatedFieldTestChecks = updateDriverDeviceFieldTestCheck(updatedFieldTestChecks, "package_label_scan", "failed", fullDeviceReadiness);
const fieldTestSummary = getDriverDeviceFieldTestSummary(updatedFieldTestChecks);
assert(fieldTestSummary.passedCount === 2, "driver field test summary should count passed checks");
assert(fieldTestSummary.failedCount === 1 && fieldTestSummary.tone === "danger", "driver field test summary should flag failed checks");
const fieldTestPackageLabelScanSample = buildDriverPackageLabelScanSample({
  task: {
    fulfillmentId: "F008",
    packageChecklist: [
      { packageId: "PKG-F008-1", labelText: "第 1/6 包" },
      { packageId: "PKG-F008-2", labelText: "第 2/6 包" },
    ],
  },
  checkedPackageIds: [],
  scannedText: "LABEL:PKG-F008-1",
  scanResult: {
    status: "matched",
    matchedPackageId: "PKG-F008-1",
    message: "第 1/6 包 已核对。",
  },
  method: "scanner_wedge",
  now: "2026-07-02T09:29:00.000Z",
});
assert(fieldTestPackageLabelScanSample?.sampleId === "DPLS-20260702092900-F008", "driver label scan sample id is incorrect");
assert(fieldTestPackageLabelScanSample.expectedPackageId === "PKG-F008-1", "driver label scan sample missed expected package id");
assert(fieldTestPackageLabelScanSample.matchedPackageId === "PKG-F008-1", "driver label scan sample missed matched package id");
assert(
  getDriverPackageLabelScanSampleSummary(fieldTestPackageLabelScanSample).includes("扫码枪/键盘口 · 已匹配"),
  "driver label scan sample summary is incorrect",
);
assert(
  normalizeDriverPackageLabelScanSample({ ...fieldTestPackageLabelScanSample, result: "blocked" }).result === "camera_error",
  "driver label scan sample should normalize blocked camera status",
);
const fieldTestRecord = buildDriverDeviceFieldTestRecord({
  task: { fulfillmentId: "F008", orderLineId: "ORD-0629-022-01", driverId: "U-DRIVER-A" },
  currentUser: { userId: "U-DRIVER-A", displayName: "司机A" },
  deviceLabel: "iPhone 15",
  browserLabel: "Safari 17",
  checks: updatedFieldTestChecks,
  packageLabelScanSample: fieldTestPackageLabelScanSample,
  readiness: fullDeviceReadiness,
  note: "扫码受光线影响",
  now: "2026-07-02T09:30:00.000Z",
  env: {
    navigator: {
      platform: "iPhone",
      userAgent: "Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      language: "zh-CN",
    },
  },
});
assert(fieldTestRecord.recordId === "DQA-20260702093000-F008", "driver field test record id is incorrect");
assert(fieldTestRecord.deviceLabel === "iPhone 15" && fieldTestRecord.browserLabel === "Safari 17", "driver field test record missed device/browser labels");
assert(fieldTestRecord.summary.failedCount === 1, "driver field test record missed summary");
assert(fieldTestRecord.packageLabelScanSample.matchedPackageId === "PKG-F008-1", "driver field test record missed package label scan sample");
assert(fieldTestRecord.nativeBridgeDiagnostics.label === "原生 0/2", "driver field test record missed native bridge diagnostics");
assert(fieldTestRecord.nativeBridgeDiagnostics.items.length === 2, "driver field test record should carry two native bridge diagnostics");
assert(fieldTestRecord.note === "扫码受光线影响", "driver field test record missed note");
const cameraOpenedFieldChecks = applyDriverPackageCameraFieldTestSignal(defaultFieldTestChecks, { type: "camera_opened" }, fullDeviceReadiness);
assert(
  cameraOpenedFieldChecks.find((item) => item.key === "camera_permission")?.status === "passed",
  "camera opened signal should mark camera permission passed",
);
assert(
  cameraOpenedFieldChecks.find((item) => item.key === "package_label_scan")?.status === "untested",
  "camera opened signal should not mark package scan passed before a label is scanned",
);
const cameraMatchedFieldChecks = applyDriverPackageCameraFieldTestSignal(defaultFieldTestChecks, { type: "camera_scan_result", scanStatus: "matched" }, fullDeviceReadiness);
assert(
  cameraMatchedFieldChecks.find((item) => item.key === "camera_permission")?.status === "passed" &&
    cameraMatchedFieldChecks.find((item) => item.key === "package_label_scan")?.status === "passed",
  "matched camera scan should mark camera permission and package scan passed",
);
const cameraWrongPackageFieldChecks = applyDriverPackageCameraFieldTestSignal(defaultFieldTestChecks, { type: "camera_scan_result", scanStatus: "not_found" }, fullDeviceReadiness);
assert(
  cameraWrongPackageFieldChecks.find((item) => item.key === "package_label_scan")?.status === "failed",
  "wrong package camera scan should mark package scan failed",
);
const cameraDeniedFieldChecks = applyDriverPackageCameraFieldTestSignal(defaultFieldTestChecks, { type: "camera_error", errorCode: "CAMERA_PERMISSION_DENIED" }, fullDeviceReadiness);
assert(
  cameraDeniedFieldChecks.find((item) => item.key === "camera_permission")?.status === "blocked" &&
    cameraDeniedFieldChecks.find((item) => item.key === "package_label_scan")?.status === "blocked",
  "camera permission denial should mark camera and package scan blocked",
);
const cameraMissingDeviceFieldChecks = applyDriverPackageCameraFieldTestSignal(defaultFieldTestChecks, { type: "camera_error", errorCode: "CAMERA_DEVICE_UNAVAILABLE" }, fullDeviceReadiness);
assert(
  cameraMissingDeviceFieldChecks.find((item) => item.key === "camera_permission")?.status === "failed",
  "missing camera device should mark camera permission check failed",
);
const scannerMatchedFieldChecks = applyDriverPackageLabelScanFieldTestSignal(defaultFieldTestChecks, { type: "package_scan_result", scanStatus: "matched" }, fullDeviceReadiness);
assert(
  scannerMatchedFieldChecks.find((item) => item.key === "package_label_scan")?.status === "passed" &&
    scannerMatchedFieldChecks.find((item) => item.key === "camera_permission")?.status === "untested",
  "scanner package scan should mark only package scan passed",
);
const scannerWrongPackageFieldChecks = applyDriverPackageLabelScanFieldTestSignal(defaultFieldTestChecks, { type: "package_scan_result", scanStatus: "not_found" }, fullDeviceReadiness);
assert(
  scannerWrongPackageFieldChecks.find((item) => item.key === "package_label_scan")?.status === "failed",
  "wrong scanner package scan should mark package scan failed",
);
assert(
  appendDriverDeviceFieldTestNote("旧备注", "相机权限未授权") === "旧备注；扫码核包：相机权限未授权",
  "driver field test note should append scanner notes",
);
assert(
  appendDriverDeviceFieldTestNote("旧备注；扫码核包：相机权限未授权", "相机权限未授权") === "旧备注；扫码核包：相机权限未授权",
  "driver field test note should not duplicate scanner notes",
);

assert(
  getDriverPackageCameraScannerSupport({ navigator: { mediaDevices: { getUserMedia() {} } } }).reason === "BARCODE_DETECTOR_UNAVAILABLE",
  "camera scanner support should report missing BarcodeDetector",
);
assert(
  normalizeDriverPackageBarcodeResults([{ displayValue: "  PKG-F008-2  " }]) === "PKG-F008-2",
  "camera scanner should normalize displayValue barcode results",
);
const fakeCameraTrack = { stopped: false, stop() { this.stopped = true; } };
const fakeCameraStream = { getTracks: () => [fakeCameraTrack] };
const fakeCameraVideo = {
  readyState: 4,
  srcObject: null,
  muted: false,
  playsInline: false,
  setAttribute(name, value) {
    this[name] = value;
  },
  async play() {
    this.played = true;
  },
  pause() {
    this.paused = true;
  },
};
const fakeCameraEvents = [];
let fakeCameraReady = false;
const fakeCameraEnv = {
  navigator: {
    mediaDevices: {
      async getUserMedia(constraints) {
        fakeCameraEvents.push({ constraints });
        return fakeCameraStream;
      },
    },
  },
  BarcodeDetector: class {
    async detect(video) {
      fakeCameraEvents.push({ detectedVideo: video === fakeCameraVideo });
      return [{ rawValue: "PKG-F008-3" }];
    }
  },
  setInterval() {
    fakeCameraEvents.push({ intervalStarted: true });
    return "camera-interval";
  },
  clearInterval(id) {
    fakeCameraEvents.push({ intervalCleared: id });
  },
};
let fakeCameraCode = "";
const fakeCameraSession = await startDriverPackageCameraScanner({
  videoElement: fakeCameraVideo,
  env: fakeCameraEnv,
  onReady: () => {
    fakeCameraReady = true;
  },
  onCode: (code) => {
    fakeCameraCode = code;
  },
});
assert(getDriverPackageCameraScannerSupport(fakeCameraEnv).supported === true, "camera scanner should detect fake browser support");
assert(fakeCameraReady === true, "camera scanner should emit ready after camera permission succeeds");
assert(fakeCameraCode === "PKG-F008-3", "camera scanner did not emit detected package code");
assert(fakeCameraTrack.stopped === true && fakeCameraVideo.srcObject === null, "camera scanner should stop media stream after a match");
assert(fakeCameraSession.stopped === true, "camera scanner session should be stopped after a match");
try {
  await startDriverPackageCameraScanner({
    videoElement: fakeCameraVideo,
    env: {
      navigator: {
        mediaDevices: {
          async getUserMedia() {
            const error = new Error("denied");
            error.name = "NotAllowedError";
            throw error;
          },
        },
      },
      BarcodeDetector: class {
        async detect() {
          return [];
        }
      },
    },
  });
  assert(false, "camera scanner permission denial should throw");
} catch (error) {
  assert(error.code === "CAMERA_PERMISSION_DENIED", "camera scanner should preserve permission denial code");
  assert(error.message.includes("相机权限未授权"), "camera scanner permission denial message is incorrect");
}

assert(
  getDriverNativePackageScannerSupport({}).reason === "NATIVE_BRIDGE_UNAVAILABLE",
  "native package scanner support should report missing bridge",
);
const missingNativeDiagnostics = getDriverNativeCapabilityDiagnostics({});
assert(missingNativeDiagnostics.supportedCount === 0, "native diagnostics should report no browser-native bridge in normal env");
assert(missingNativeDiagnostics.issueCount === 2, "native diagnostics should report two missing native capabilities");
assert(missingNativeDiagnostics.label === "原生 0/2", "native diagnostics missing label is incorrect");
const nativeBridgeTask = {
  fulfillmentId: "F008",
  orderLineId: "ORD-0629-022-01",
  customerName: "李四电商",
  contactName: "李四",
  contactPhone: "139****6221",
  address: "厚街仓库 A 区",
  addressArea: "厚街",
  routeDate: "2026-07-02",
  routeNo: "虎门线-A",
  routeSequence: 2,
  plannedDepartureAt: "2026-07-02T08:30:00.000Z",
  packageChecklist: [
    { packageId: "PKG-F008-1" },
    { packageId: "PKG-F008-2" },
    { packageId: "PKG-F008-3" },
    { packageId: "PKG-F008-4" },
    { packageId: "PKG-F008-5" },
    { packageId: "PKG-F008-6" },
  ],
};
const nativeIntegrationKit = buildDriverNativeIntegrationKit({
  task: nativeBridgeTask,
  operatorId: "U-DRIVER-A",
  navigationUrl: "https://uri.amap.com/search?keyword=%E5%8E%9A%E8%A1%97",
  geoPoint: "22.920000,113.680000",
  now: "2026-07-02T09:30:00.000Z",
});
assert(nativeIntegrationKit.items.length === 2, "native integration kit should expose two bridge contracts");
assert(
  nativeIntegrationKit.items[0].payload.requestId ===
    buildDriverNativePackageScanRequest({
      task: nativeBridgeTask,
      operatorId: "U-DRIVER-A",
      now: "2026-07-02T09:30:00.000Z",
    }).requestId,
  "native integration kit package-scan payload should reuse the scan request contract",
);
assert(
  nativeIntegrationKit.items[1].payload.requestId ===
    buildDriverNativeNavigationRequest({
      task: nativeBridgeTask,
      operatorId: "U-DRIVER-A",
      navigationUrl: "https://uri.amap.com/search?keyword=%E5%8E%9A%E8%A1%97",
      geoPoint: "22.920000,113.680000",
      now: "2026-07-02T09:30:00.000Z",
    }).requestId,
  "native integration kit navigation payload should reuse the navigation request contract",
);
assert(nativeIntegrationKit.eventNames.includes(DRIVER_NATIVE_PACKAGE_SCAN_EVENT), "native integration kit missed scan event");
assert(nativeIntegrationKit.eventNames.includes(DRIVER_NATIVE_NAVIGATION_EVENT), "native integration kit missed navigation event");
assert(
  getDriverNativeIntegrationKitSummary(nativeIntegrationKit).includes("driver.packageLabel.scan"),
  "native integration kit summary missed package-scan message type",
);
assert(
  getDriverNativeIntegrationKitSummary(null) === "未生成原生壳联调清单",
  "native integration kit summary should tolerate an empty task selection",
);
const directNativeCalls = [];
const directNativeResult = await requestDriverNativePackageLabelScan({
  task: nativeBridgeTask,
  operatorId: "U-DRIVER-A",
  now: "2026-07-02T09:32:00.000Z",
  env: {
    erpDriverNative: {
      scanPackageLabel(request) {
        directNativeCalls.push(request);
        return {
          requestId: request.requestId,
          scannedText: "PKG-F008-1",
          status: "scanned",
          message: "native direct scan",
          checkedAt: "2026-07-02T09:32:01.000Z",
        };
      },
    },
    setTimeout,
    clearTimeout,
  },
});
assert(directNativeCalls.length === 1, "native direct scanner should be invoked once");
assert(directNativeCalls[0].version === "p0-driver-native-bridge-v1", "native direct request missed bridge version");
assert(directNativeCalls[0].expectedPackageIds.length === 6, "native direct request missed expected package ids");
assert(directNativeResult.scannedText === "PKG-F008-1", "native direct scanner did not normalize scanned text");
assert(directNativeResult.source === "native_sdk", "native direct scanner missed source");
const directNativeDiagnostics = getDriverNativeCapabilityDiagnostics({
  erpDriverNative: {
    scanPackageLabel() {},
    openNavigation() {},
  },
});
assert(directNativeDiagnostics.supportedCount === 2, "native diagnostics should detect direct scanner and navigation bridge");
assert(directNativeDiagnostics.items.every((item) => item.bridgeTypeLabel === "JS bridge"), "native diagnostics direct bridge label is incorrect");

const androidNativeResult = await requestDriverNativePackageLabelScan({
  task: nativeBridgeTask,
  operatorId: "U-DRIVER-A",
  now: "2026-07-02T09:33:00.000Z",
  env: {
    ErpDriverNative: {
      scanPackageLabel(requestJson) {
        const request = JSON.parse(requestJson);
        return JSON.stringify({
          requestId: request.requestId,
          code: "PKG-F008-2",
          status: "success",
          message: "android native scan",
        });
      },
    },
    setTimeout,
    clearTimeout,
  },
});
assert(androidNativeResult.scannedText === "PKG-F008-2", "native Android JSON result should preserve scanned code");
assert(androidNativeResult.errorCode === "", "native Android JSON package code should not be treated as an error code");
const androidNativeDiagnostics = getDriverNativeCapabilityDiagnostics({
  ErpDriverNative: {
    scanPackageLabel() {},
    openNavigation() {},
  },
});
assert(androidNativeDiagnostics.supportedCount === 2, "native diagnostics should detect Android scanner and navigation bridge");
assert(androidNativeDiagnostics.items.every((item) => item.bridgeTypeLabel === "Android JSON"), "native diagnostics Android bridge label is incorrect");
assert(
  normalizeDriverNativePackageScanResult({ code: "PKG-F008-4", status: "success" }).scannedText === "PKG-F008-4",
  "native scan normalizer should treat code as package text",
);

const webkitNativeEnv = createFakeNativeEventEnv();
let webkitNativeRequest = null;
webkitNativeEnv.webkit = {
  messageHandlers: {
    erpDriver: {
      postMessage(request) {
        webkitNativeRequest = request;
        setTimeout(() => {
          webkitNativeEnv.dispatchNativePackageScan({
            requestId: request.requestId,
            rawValue: "PKG-F008-3",
            status: "scanned",
            message: "webkit native scan",
          });
        }, 0);
      },
    },
  },
};
const webkitNativeResult = await requestDriverNativePackageLabelScan({
  task: nativeBridgeTask,
  operatorId: "U-DRIVER-A",
  now: "2026-07-02T09:34:00.000Z",
  timeoutMs: 1000,
  env: webkitNativeEnv,
});
assert(webkitNativeRequest?.type === "driver.packageLabel.scan", "native webkit request missed message type");
assert(webkitNativeResult.scannedText === "PKG-F008-3", "native webkit event result did not normalize scanned text");

assert(
  getDriverNativeNavigationSupport({}).reason === "NATIVE_NAVIGATION_BRIDGE_UNAVAILABLE",
  "native navigation support should report missing bridge",
);
const navigationBridgeTask = {
  fulfillmentId: "F008",
  orderLineId: "ORD-0629-022-01",
  customerName: "李四电商",
  contactName: "李四",
  contactPhone: "139****6221",
  address: "厚街仓库 A 区",
  addressArea: "厚街仓库",
  routeDate: "2026-07-02",
  routeNo: "虎门线-A",
  routeSequence: 2,
  plannedDepartureAt: "2026-07-02T08:30:00.000Z",
};
const navigationUrl = "https://uri.amap.com/search?keyword=%E5%8E%9A%E8%A1%97%E4%BB%93%E5%BA%93%20A%20%E5%8C%BA";
const directNavigationCalls = [];
const directNavigationResult = await requestDriverNativeNavigation({
  task: navigationBridgeTask,
  navigationUrl,
  operatorId: "U-DRIVER-A",
  now: "2026-07-02T09:35:00.000Z",
  env: {
    erpDriverNative: {
      openNavigation(request) {
        directNavigationCalls.push(request);
        return {
          requestId: request.requestId,
          status: "opened",
          mapApp: "amap",
          message: "native navigation opened",
          checkedAt: "2026-07-02T09:35:01.000Z",
        };
      },
    },
    setTimeout,
    clearTimeout,
  },
});
assert(directNavigationCalls.length === 1, "native direct navigation should be invoked once");
assert(directNavigationCalls[0].version === "p0-driver-native-navigation-bridge-v1", "native direct navigation request missed bridge version");
assert(directNavigationCalls[0].type === "driver.navigation.open", "native direct navigation request missed message type");
assert(directNavigationCalls[0].address === "厚街仓库 A 区", "native direct navigation request missed address");
assert(directNavigationCalls[0].navigationUrl === navigationUrl, "native direct navigation request missed external URL fallback");
assert(directNavigationResult.status === "opened", "native direct navigation did not normalize opened status");
assert(directNavigationResult.source === "native_navigation_sdk", "native direct navigation missed source");

const directNavigationNoReturnResult = await requestDriverNativeNavigation({
  task: navigationBridgeTask,
  navigationUrl,
  operatorId: "U-DRIVER-A",
  now: "2026-07-02T09:35:30.000Z",
  env: {
    DriverNativeBridge: {
      openNavigation() {},
    },
    setTimeout,
    clearTimeout,
  },
});
assert(directNavigationNoReturnResult.status === "opened", "native direct navigation with no return should be treated as accepted");

const androidNavigationResult = await requestDriverNativeNavigation({
  task: navigationBridgeTask,
  navigationUrl,
  operatorId: "U-DRIVER-A",
  now: "2026-07-02T09:36:00.000Z",
  env: {
    ErpDriverNative: {
      openNavigation(requestJson) {
        const request = JSON.parse(requestJson);
        return JSON.stringify({
          requestId: request.requestId,
          result: "success",
          provider: "amap",
          url: request.navigationUrl,
          message: "android navigation opened",
        });
      },
    },
    setTimeout,
    clearTimeout,
  },
});
assert(androidNavigationResult.status === "opened", "native Android navigation result should normalize success");
assert(androidNavigationResult.mapApp === "amap", "native Android navigation result missed map app");
assert(androidNavigationResult.navigationUrl === navigationUrl, "native Android navigation result missed navigation URL");
assert(
  normalizeDriverNativeNavigationResult({ code: "AMAP", status: "success" }).errorCode === "",
  "native navigation normalizer should not treat provider code as an error code",
);

const webkitNavigationEnv = createFakeNativeEventEnv();
let webkitNavigationRequest = null;
webkitNavigationEnv.webkit = {
  messageHandlers: {
    erpDriver: {
      postMessage(request) {
        webkitNavigationRequest = request;
        setTimeout(() => {
          webkitNavigationEnv.dispatchNativeNavigation({
            requestId: request.requestId,
            status: "opened",
            mapApp: "apple_maps",
            message: "webkit navigation opened",
          });
        }, 0);
      },
    },
  },
};
const webkitNavigationResult = await requestDriverNativeNavigation({
  task: navigationBridgeTask,
  navigationUrl,
  operatorId: "U-DRIVER-A",
  now: "2026-07-02T09:37:00.000Z",
  timeoutMs: 1000,
  env: webkitNavigationEnv,
});
assert(webkitNavigationRequest?.type === "driver.navigation.open", "native webkit navigation request missed message type");
assert(webkitNavigationResult.status === "opened", "native webkit navigation event result did not normalize opened status");
assert(webkitNavigationResult.mapApp === "apple_maps", "native webkit navigation result missed map app");

assert(
  getDriverDeliveryPhotoCameraSupport({ navigator: { mediaDevices: { getUserMedia() {} } } }).reason === "CANVAS_UNAVAILABLE",
  "delivery photo camera support should report missing canvas",
);
const fakePhotoTrack = { stopped: false, stop() { this.stopped = true; } };
const fakePhotoStream = { getTracks: () => [fakePhotoTrack] };
const fakePhotoVideo = {
  videoWidth: 640,
  videoHeight: 480,
  srcObject: null,
  muted: false,
  playsInline: false,
  setAttribute(name, value) {
    this[name] = value;
  },
  async play() {
    this.played = true;
  },
  pause() {
    this.paused = true;
  },
};
const fakePhotoEvents = [];
const fakePhotoEnv = {
  navigator: {
    mediaDevices: {
      async getUserMedia(constraints) {
        fakePhotoEvents.push({ constraints });
        return fakePhotoStream;
      },
    },
  },
  document: {
    createElement(tagName) {
      assert(tagName === "canvas", "delivery photo capture should create a canvas");
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert(type === "2d", "delivery photo capture should request 2d context");
          return {
            drawImage(video, x, y, width, height) {
              fakePhotoEvents.push({ drewVideo: video === fakePhotoVideo, x, y, width, height });
            },
          };
        },
        toDataURL(type, quality) {
          fakePhotoEvents.push({ type, quality });
          return "data:image/jpeg;base64,QUJDRA==";
        },
      };
    },
  },
  async fetch(dataUrl) {
    fakePhotoEvents.push({ fetchedDataUrl: dataUrl.startsWith("data:image/jpeg") });
    return {
      async blob() {
        return { size: 4, type: "image/jpeg" };
      },
    };
  },
  File: class {
    constructor(parts, name, options = {}) {
      this.parts = parts;
      this.name = name;
      this.type = options.type ?? "";
      this.size = parts.reduce((total, part) => total + Number(part?.size ?? 0), 0);
      this.lastModified = options.lastModified ?? 0;
    }
  },
};
const fakePhotoStatuses = [];
const fakePhotoSession = await startDriverDeliveryPhotoCamera({
  videoElement: fakePhotoVideo,
  env: fakePhotoEnv,
  onStatus: (message) => fakePhotoStatuses.push(message),
});
assert(getDriverDeliveryPhotoCameraSupport(fakePhotoEnv).supported === true, "delivery photo camera should detect fake browser support");
assert(fakePhotoVideo.srcObject === fakePhotoStream && fakePhotoVideo.played === true, "delivery photo camera did not attach and play stream");
const capturedDeliveryPhoto = await captureDriverDeliveryPhotoFromVideo({
  videoElement: fakePhotoVideo,
  env: fakePhotoEnv,
  fileName: "delivery-photo-smoke.jpg",
});
assert(capturedDeliveryPhoto.file.name === "delivery-photo-smoke.jpg", "captured delivery photo file name is incorrect");
assert(capturedDeliveryPhoto.file.type === "image/jpeg", "captured delivery photo file type is incorrect");
assert(capturedDeliveryPhoto.file.size === 4, "captured delivery photo file size is incorrect");
assert(capturedDeliveryPhoto.width === 640 && capturedDeliveryPhoto.height === 480, "captured delivery photo dimensions are incorrect");
assert(fakePhotoEvents.some((event) => event.drewVideo === true), "captured delivery photo did not draw video frame");
fakePhotoSession.stop();
assert(fakePhotoTrack.stopped === true && fakePhotoVideo.srcObject === null, "delivery photo camera should stop media stream");

const localTasks = buildLocalDriverDeliveryTasks({ fulfillments, orderLines, customers, driverId: "U-DRIVER-A" });
assert(localTasks.length === 1, "local driver tasks did not include the delivery fulfillment");
assert(localTasks[0].status === "待送货", "local task status is incorrect");
assert(localTasks[0].goodsSummary.includes("黄印黑") && localTasks[0].goodsSummary.includes("黄袋红提"), "local task goods summary missed factory shorthand");
assert(localTasks[0].packageCount === 6 && localTasks[0].addressArea === "厚街仓库", "local task package/address fields were not mapped");
assert(localTasks[0].packageChecklist.length === 6, "local task package checklist was not generated");
assert(localTasks[0].packageChecklist[0].labelText === "第 1/6 包", "local task package checklist label is incorrect");
assert(localTasks[0].routeNo === "虎门线-A" && localTasks[0].routeSequence === 2, "local task route fields were not mapped");
assert(getDriverRouteLabel(localTasks[0]) === "2026-07-02 · 虎门线-A", "driver route label is incorrect");
assert(getDriverRouteStopLabel(localTasks[0]) === "第 2 站", "driver route stop label is incorrect");
assert(getDriverNavigationUrl(localTasks[0]).includes(encodeURIComponent("厚街仓库 A 区")), "driver navigation URL missed address");
assert(buildDriverLoadRouteRemark(localTasks[0]).includes("虎门线-A 第 2 站"), "driver load route remark missed route context");
const partialPackageCheck = getDriverLoadPackageCheckState(localTasks[0], [localTasks[0].packageChecklist[0].packageId]);
assert(partialPackageCheck.checkedCount === 1 && partialPackageCheck.missingCount === 5, "partial package check state is incorrect");
const checkedPackageIds = localTasks[0].packageChecklist.map((item) => item.packageId);
const fullPackageCheck = getDriverLoadPackageCheckState(localTasks[0], checkedPackageIds);
assert(fullPackageCheck.allChecked === true && fullPackageCheck.summary === "6/6包", "full package check state is incorrect");
assert(buildDriverLoadPackageCheckRemark(localTasks[0], checkedPackageIds) === "装车核对：6/6包", "package check remark is incorrect");
const routeSortedTasks = sortDriverDeliveryTasks([
  { ...localTasks[0], fulfillmentId: "F008-B", routeSequence: 3, sortSequence: 1 },
  { ...localTasks[0], fulfillmentId: "F008-A", routeSequence: 1, sortSequence: 9 },
]);
assert(routeSortedTasks[0].fulfillmentId === "F008-A", "driver route sort did not prioritize route sequence");
const routeContext = getDriverRouteExecutionContext(routeSortedTasks, routeSortedTasks[0]);
assert(routeContext.routeTaskCount === 2 && routeContext.nextTask?.fulfillmentId === "F008-B", "driver route execution context missed next stop");
assert(getDriverTaskMetrics(localTasks).pendingCount === 1, "driver task metrics were not mapped");

const listCalls = [];
const listResult = await listDriverDeliveryTasks(
  {
    authState,
    driverId: "U-DRIVER-A",
    operatorId: "U-DRIVER-A",
    localFulfillments: fulfillments,
    orderLines,
    customers,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      listCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [{
          fulfillmentId: "F008",
          driverTaskId: "F008",
          driverId: "U-DRIVER-A",
          orderLineId: "ORD-0629-022-01",
          orderTail: "22-01",
          customerId: "C002",
          customerName: "李四电商",
          contactName: "李四",
          contactPhone: "139****6221",
          address: "厚街仓库 A 区",
          addressArea: "厚街仓库",
          deliveryNoteNo: "PB-F008",
          goodsSummary: "外卖活动袋 40*30*10 黄印黑 / 黄袋红提 双面 3000个",
          packageSummary: "6包",
          packageCount: 6,
          packageChecklist: [
            {
              packageId: "PKG-F008-1",
              bizNo: "PKG-F008-1",
              packageSeq: 1,
              packageCount: 6,
              packedQty: 500,
              labelPrintRecordId: "PR-F008-1",
              status: "已打印",
            },
            {
              packageId: "PKG-F008-2",
              bizNo: "PKG-F008-2",
              packageSeq: 2,
              packageCount: 6,
              packedQty: 500,
              labelPrintRecordId: "PR-F008-1",
              status: "已打印",
            },
            {
              packageId: "PKG-F008-3",
              bizNo: "PKG-F008-3",
              packageSeq: 3,
              packageCount: 6,
              packedQty: 500,
              labelPrintRecordId: "PR-F008-1",
              status: "已打印",
            },
            {
              packageId: "PKG-F008-4",
              bizNo: "PKG-F008-4",
              packageSeq: 4,
              packageCount: 6,
              packedQty: 500,
              labelPrintRecordId: "PR-F008-1",
              status: "已打印",
            },
            {
              packageId: "PKG-F008-5",
              bizNo: "PKG-F008-5",
              packageSeq: 5,
              packageCount: 6,
              packedQty: 500,
              labelPrintRecordId: "PR-F008-1",
              status: "已打印",
            },
            {
              packageId: "PKG-F008-6",
              bizNo: "PKG-F008-6",
              packageSeq: 6,
              packageCount: 6,
              packedQty: 500,
              labelPrintRecordId: "PR-F008-1",
              status: "已打印",
            },
          ],
          qty: 3000,
          expectedQty: 3000,
          latest: "明天 19:00",
          status: "待送货",
          routeDate: "2026-07-02",
          routeNo: "虎门线-A",
          routeSequence: 2,
          dispatchStatus: "已派单",
          plannedDepartureAt: "2026-07-02T08:30:00.000Z",
          watermarkId: "WM-API-LIST-1",
          watermarkLocationLabel: "厚街仓库",
        }],
        total: 1,
        metrics: { pendingCount: 1, deliveringCount: 0, completedCount: 0, exceptionCount: 0 },
      });
    },
  },
);
assert(listResult.source === "api" && listResult.items.length === 1, "driver task list did not map the API response");
assert(listCalls[0]?.url === "http://127.0.0.1:8787/api/driver/delivery-tasks?driverId=U-DRIVER-A", "driver task list URL is incorrect");
assert(listCalls[0]?.init.headers["x-erp-user-id"] === "U-DRIVER-A", "driver task list did not send seed user header");
assert(listResult.items[0].routeNo === "虎门线-A" && listResult.items[0].routeSequence === 2, "driver API task route fields were not mapped");
assert(listResult.items[0].packageChecklist.length === 6, "driver API task package checklist was not mapped");
assert(listResult.items[0].packageChecklist[0].packageId === "PKG-F008-1", "driver API task did not preserve real package id");
assert(listResult.items[0].packageChecklist[0].labelText === "第 1/6 包", "driver API task package label should use sequence text");
assert(listResult.items[0].packageChecklist[0].quantityText === "500个", "driver API task package quantity was not mapped");
assert(listResult.items[0].packageChecklist[0].labelPrintRecordId === "PR-F008-1", "driver API task package print record was not mapped");
const firstScan = applyDriverPackageScan(listResult.items[0], [], "PKG-F008-1");
assert(firstScan.status === "matched", "driver package scan should match a real package id");
assert(firstScan.checkedPackageIds.length === 1 && firstScan.checkedPackageIds[0] === "PKG-F008-1", "driver package scan did not check the matched package");
const wrappedScan = applyDriverPackageScan(listResult.items[0], firstScan.checkedPackageIds, "LABEL:PKG-F008-2\n");
assert(wrappedScan.status === "matched" && wrappedScan.checkedPackageIds.length === 2, "driver package scan should match package ids embedded in label text");
const duplicateScan = applyDriverPackageScan(listResult.items[0], wrappedScan.checkedPackageIds, "PKG-F008-1");
assert(duplicateScan.status === "duplicate" && duplicateScan.checkedPackageIds.length === 2, "driver package scan should not duplicate checked package ids");
const missingScan = applyDriverPackageScan(listResult.items[0], wrappedScan.checkedPackageIds, "PKG-F008-404");
assert(missingScan.status === "not_found" && missingScan.checkedPackageIds.length === 2, "driver package scan should reject unknown package ids");

const loadCalls = [];
const loadResult = await confirmDriverDeliveryLoaded(
  {
    authState,
    task: listResult.items[0],
    operatorId: "U-DRIVER-A",
    checkedPackageIds: listResult.items[0].packageChecklist.map((item) => item.packageId),
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      loadCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: "F008",
        status: "配送中",
        task: { ...listResult.items[0], status: "配送中" },
        operationLogId: "LOG-DRIVER-LOAD-1",
      });
    },
  },
);
assert(loadResult.source === "api" && loadResult.status === "配送中", "driver load confirmation did not map API response");
assert(loadCalls[0]?.url.endsWith("/api/driver/delivery-tasks/F008/load-confirm"), "driver load confirmation URL is incorrect");
assert(loadCalls[0]?.body.operatorId === "U-DRIVER-A", "driver load confirmation missed operatorId");
assert(loadCalls[0]?.body.remark.includes("虎门线-A 第 2 站"), "driver load confirmation missed route remark");
assert(loadCalls[0]?.body.remark.includes("装车核对：6/6包"), "driver load confirmation missed package check remark");
assert(loadCalls[0]?.body.checkedPackageIds?.length === 6, "driver load confirmation missed checked package ids");

const fieldTestCalls = [];
const fieldTestApiResult = await recordDriverDeviceFieldTest(
  {
    authState,
    task: listResult.items[0],
    operatorId: "U-DRIVER-A",
    record: fieldTestRecord,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      fieldTestCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: "F008",
        record: { ...fieldTestRecord, summary: { ...fieldTestRecord.summary, failedCount: 1 } },
        summary: fieldTestRecord.summary,
        task: {
          ...listResult.items[0],
          deviceFieldTestRecord: fieldTestRecord,
          deviceFieldTestSummary: fieldTestRecord.summary,
        },
        operationLogId: "LOG-DRIVER-FIELD-1",
      });
    },
  },
);
assert(fieldTestApiResult.source === "api", "driver field test should map API response");
assert(
  fieldTestCalls[0]?.url.endsWith("/api/driver/delivery-tasks/F008/device-field-tests"),
  "driver field test URL is incorrect",
);
assert(fieldTestCalls[0]?.body.recordId === "DQA-20260702093000-F008", "driver field test request missed record id");
assert(fieldTestCalls[0]?.body.checks?.length === 6, "driver field test request missed checks");
assert(fieldTestCalls[0]?.body.packageLabelScanSample?.matchedPackageId === "PKG-F008-1", "driver field test request missed package label scan sample");
assert(fieldTestCalls[0]?.body.nativeBridgeDiagnostics?.label === "原生 0/2", "driver field test request missed native bridge diagnostics");
assert(fieldTestApiResult.record.summary.failedCount === 1, "driver field test response missed summary");
assert(fieldTestApiResult.record.packageLabelScanSample?.method === "scanner_wedge", "driver field test response missed package label scan method");
assert(fieldTestApiResult.record.nativeBridgeDiagnostics?.items?.length === 2, "driver field test response missed native bridge diagnostics");
assert(fieldTestApiResult.task.deviceFieldTestRecord.recordId === fieldTestRecord.recordId, "driver field test response missed task record");
assert(fieldTestApiResult.task.deviceFieldTestRecord.packageLabelScanSample?.matchedPackageId === "PKG-F008-1", "driver field test response task missed package label scan sample");
assert(fieldTestApiResult.task.deviceFieldTestRecord.nativeBridgeDiagnostics?.label === "原生 0/2", "driver field test response task missed native bridge diagnostics");
assert(fieldTestApiResult.operationLogId === "LOG-DRIVER-FIELD-1", "driver field test response missed operation log id");

const fieldTestDeniedResult = await recordDriverDeviceFieldTest(
  {
    authState,
    task: listResult.items[0],
    operatorId: "U-DRIVER-A",
    record: fieldTestRecord,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => createJsonResponse(403, {
      code: "PERMISSION_DENIED",
      message: "Missing action permission: delivery.device_qa.record",
      requiredPermission: "delivery.device_qa.record",
    }),
  },
);
assert(fieldTestDeniedResult.blocked === true, "driver field test permission denial should block local save");
assert(fieldTestDeniedResult.error.requiredPermission === "delivery.device_qa.record", "driver field test denial missed permission");

const fieldTestFallbackResult = await recordDriverDeviceFieldTest(
  {
    authState,
    task: listResult.items[0],
    operatorId: "U-DRIVER-A",
    record: fieldTestRecord,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => {
      throw new Error("network down");
    },
  },
);
assert(fieldTestFallbackResult.source === "local_fallback", "driver field test should fall back only on network failure");
assert(fieldTestFallbackResult.record.recordId === fieldTestRecord.recordId, "driver field test fallback missed record");

const missingPhotoResult = await completeDriverDeliveryTask({
  authState,
  task: listResult.items[0],
  operatorId: "U-DRIVER-A",
  watermarkedPhotoAttached: false,
});
assert(missingPhotoResult.blocked === true, "driver completion should require a watermarked photo before calling API");
assert(missingPhotoResult.error?.code === "DRIVER_WATERMARK_PHOTO_REQUIRED", "driver missing-photo error code is incorrect");

const evidenceInput = createDeliveryEvidenceAttachmentInput({
  task: listResult.items[0],
  operatorId: "U-DRIVER-A",
  evidenceType: "watermark",
  metadata: {
    watermarkId: "WM-FRONT-SMOKE",
    watermarkLocationLabel: "厚街仓库",
  },
  file: {
    name: "driver-watermark-smoke.png",
    type: "image/png",
    size: 128,
    contentDataUrl: "data:image/png;base64,AAAA",
  },
});
assert(evidenceInput.ownerType === "fulfillment", "driver evidence should attach to the fulfillment owner");
assert(evidenceInput.ownerId === "F008", "driver evidence owner id is incorrect");
assert(evidenceInput.purpose === "delivery_watermark_photo", "driver evidence purpose is incorrect");
assert(evidenceInput.contentDataUrl?.startsWith("data:image/png"), "driver evidence did not preserve image content");
assert(evidenceInput.metadata?.watermarkId === "WM-FRONT-SMOKE", "driver evidence metadata did not preserve watermark id");

const attachmentIdOnlyCalls = [];
const attachmentIdOnlyResult = await completeDriverDeliveryTask(
  {
    authState,
    task: { ...listResult.items[0], status: "配送中" },
    operatorId: "U-DRIVER-A",
    watermarkedPhotoAttached: false,
    watermarkedPhotoAttachmentId: "ATT-DRIVER-WM-1",
    watermarkId: "WM-ID-ONLY-1",
    watermarkCapturedAt: "2026-07-02T08:00:00.000Z",
    watermarkLocationLabel: "厚街仓库",
    watermarkGeoPoint: "22.920000,113.680000",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      attachmentIdOnlyCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: "F008",
        status: "已完成",
        statementCandidate: true,
        task: {
          ...listResult.items[0],
          status: "已完成",
          watermarkedPhotoAttached: true,
          watermarkedPhotoAttachmentId: "ATT-DRIVER-WM-1",
          watermarkId: "WM-ID-ONLY-1",
          watermarkLocationLabel: "厚街仓库",
        },
        operationLogId: "LOG-DRIVER-COMPLETE-ID-1",
      });
    },
  },
);
assert(attachmentIdOnlyResult.source === "api", "driver completion should accept watermarked attachment id evidence");
assert(
  attachmentIdOnlyCalls[0]?.body.watermarkedPhotoAttachmentId === "ATT-DRIVER-WM-1",
  "driver completion did not send watermarked attachment id",
);
assert(attachmentIdOnlyCalls[0]?.body.watermarkId === "WM-ID-ONLY-1", "driver completion did not send watermark id");
assert(attachmentIdOnlyCalls[0]?.body.watermarkGeoPoint === "22.920000,113.680000", "driver completion did not send GPS point");

const completeCalls = [];
const completeResult = await completeDriverDeliveryTask(
  {
    authState,
    task: { ...listResult.items[0], status: "配送中" },
    operatorId: "U-DRIVER-A",
    watermarkedPhotoAttached: true,
    watermarkedPhotoAttachmentId: "ATT-DRIVER-WM-2",
    watermarkId: "WM-FRONT-COMPLETE-1",
    watermarkText: "李四电商 / 地址 厚街仓库 A 区 / 水印 WM-FRONT-COMPLETE-1",
    watermarkCapturedAt: "2026-07-02T09:00:00.000Z",
    watermarkLocationLabel: "厚街仓库 A 区门岗",
    watermarkAddress: "厚街仓库 A 区",
    watermarkOperatorId: "U-DRIVER-A",
    watermarkOperatorName: "司机A",
    signaturePhotoAttached: true,
    signaturePhotoAttachmentId: "ATT-DRIVER-SIGN-1",
    receiverName: "门店小王",
    paperNoteStatus: "已交回",
    remark: "客户已签收",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      completeCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: "F008",
        status: "已完成",
        statementCandidate: true,
        evidenceResubmission: true,
        retakeTodoId: "T-RETAKE-1",
        task: {
          ...listResult.items[0],
          status: "已完成",
          watermarkedPhotoAttached: true,
          deliveryEvidenceReviewStatus: "待复核",
        },
        operationLogId: "LOG-DRIVER-COMPLETE-1",
      });
    },
  },
);
assert(completeResult.source === "api" && completeResult.status === "已完成", "driver completion did not map API response");
assert(completeResult.evidenceResubmission === true, "driver completion did not map evidence resubmission flag");
assert(completeResult.retakeTodoId === "T-RETAKE-1", "driver completion did not map retake todo id");
assert(completeResult.task.deliveryEvidenceReviewStatus === "待复核", "driver completion did not map retake review status");
assert(completeCalls[0]?.body.watermarkedPhotoAttached === true, "driver completion did not send watermarked photo evidence");
assert(completeCalls[0]?.body.watermarkedPhotoAttachmentId === "ATT-DRIVER-WM-2", "driver completion did not send watermark attachment id");
assert(completeCalls[0]?.body.watermarkId === "WM-FRONT-COMPLETE-1", "driver completion did not send watermark metadata");
assert(completeCalls[0]?.body.watermarkLocationLabel === "厚街仓库 A 区门岗", "driver completion did not send watermark location");
assert(completeCalls[0]?.body.signaturePhotoAttachmentId === "ATT-DRIVER-SIGN-1", "driver completion did not send signature attachment id");
assert(completeCalls[0]?.body.receiverName === "门店小王", "driver completion did not send receiver name");

const exceptionCalls = [];
const exceptionResult = await reportDriverDeliveryException(
  {
    authState,
    task: listResult.items[0],
    operatorId: "U-DRIVER-A",
    reason: "客户不在",
    remark: "电话无人接",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      exceptionCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: "F008",
        status: "送货异常",
        todoId: "T-DRIVER-1",
        todoType: "送货异常待处理",
        task: {
          ...listResult.items[0],
          status: "送货异常",
          exceptionReasonCode: "customer_unavailable",
          exceptionReason: "客户不在",
          exceptionOccurredAt: "2026-07-02T09:40:00.000Z",
        },
        operationLogId: "LOG-DRIVER-EXCEPTION-1",
      });
    },
  },
);
assert(exceptionResult.source === "api" && exceptionResult.todoType === "送货异常待处理", "driver exception did not map API response");
assert(exceptionResult.task.exceptionReasonCode === "customer_unavailable", "driver exception reason code was not mapped");
assert(exceptionResult.task.exceptionOccurredAt === "2026-07-02T09:40:00.000Z", "driver exception time was not mapped");
assert(exceptionCalls[0]?.body.reasonCode === "customer_unavailable", "driver exception reason code is incorrect");

const deniedResult = await listDriverDeliveryTasks(
  {
    authState,
    operatorId: "U-DRIVER-A",
    localFulfillments: fulfillments,
    orderLines,
    customers,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => createJsonResponse(403, {
      code: "PERMISSION_DENIED",
      message: "Missing action permission: delivery.view",
      requiredPermission: "delivery.view",
    }),
  },
);
assert(deniedResult.blocked === true && deniedResult.source === "api_error", "permission denial should not fall back to local driver tasks");
assert(deniedResult.error.requiredPermission === "delivery.view", "permission denial did not preserve required permission");

const strictWriteChecks = [
  {
    name: "load confirmation",
    expectedCode: "DRIVER_LOAD_CONFIRM_API_UNAVAILABLE",
    invoke: () => confirmDriverDeliveryLoaded({ authState, task: listResult.items[0], operatorId: "U-DRIVER-A" }, strictOfflineOptions()),
  },
  {
    name: "device field test",
    expectedCode: "DRIVER_DEVICE_FIELD_TEST_API_UNAVAILABLE",
    invoke: () => recordDriverDeviceFieldTest({ authState, task: listResult.items[0], record: fieldTestRecord, operatorId: "U-DRIVER-A" }, strictOfflineOptions()),
  },
  {
    name: "delivery completion",
    expectedCode: "DRIVER_DELIVERY_COMPLETE_API_UNAVAILABLE",
    invoke: () => completeDriverDeliveryTask({ authState, task: listResult.items[0], operatorId: "U-DRIVER-A", watermarkedPhotoAttached: true }, strictOfflineOptions()),
  },
  {
    name: "delivery exception",
    expectedCode: "DRIVER_DELIVERY_EXCEPTION_API_UNAVAILABLE",
    invoke: () => reportDriverDeliveryException({ authState, task: listResult.items[0], operatorId: "U-DRIVER-A", reason: "客户不在" }, strictOfflineOptions()),
  },
];

for (const check of strictWriteChecks) {
  const result = await check.invoke();
  assert(result.blocked === true, `strict ${check.name} must not use the local projection`);
  assert(result.source === "api_error", `strict ${check.name} should report an API error`);
  assert(result.error?.code === check.expectedCode, `strict ${check.name} reported the wrong API error`);
}

function strictOfflineOptions() {
  return {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  };
}

function createFakeNativeEventEnv() {
  const listeners = new Map();
  return {
    setTimeout,
    clearTimeout,
    addEventListener(type, handler) {
      const current = listeners.get(type) ?? [];
      listeners.set(type, [...current, handler]);
    },
    removeEventListener(type, handler) {
      const current = listeners.get(type) ?? [];
      listeners.set(type, current.filter((item) => item !== handler));
    },
    dispatchNativePackageScan(detail) {
      (listeners.get(DRIVER_NATIVE_PACKAGE_SCAN_EVENT) ?? []).forEach((handler) => handler({ detail }));
    },
    dispatchNativeNavigation(detail) {
      (listeners.get(DRIVER_NATIVE_NAVIGATION_EVENT) ?? []).forEach((handler) => handler({ detail }));
    },
  };
}

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
