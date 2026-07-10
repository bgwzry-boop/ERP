import { getDriverDeliveryPhotoCameraSupport } from "./driverCameraPhotoClient.js";
import { getDriverPackageCameraScannerSupport } from "./driverPackageCameraScannerClient.js";

export function getDriverDeviceReadiness(env = globalThis) {
  const deliveryCamera = getDriverDeliveryPhotoCameraSupport(env);
  const packageCameraScan = getDriverPackageCameraScannerSupport(env);
  const geolocation = getGeolocationSupport(env);
  const fileUploadFallback = getFileUploadFallbackSupport(env);
  const items = [
    mapDeliveryCameraReadiness(deliveryCamera),
    mapPackageScanReadiness(packageCameraScan),
    mapGeolocationReadiness(geolocation),
    mapFileUploadReadiness(fileUploadFallback),
  ];

  return {
    items,
    summary: getDriverDeviceReadinessSummary(items),
  };
}

export function getDriverDeviceReadinessSummary(items = []) {
  const total = items.length;
  const availableCount = items.filter((item) => item.status === "available").length;
  const fallbackCount = items.filter((item) => item.status === "fallback" || item.status === "partial").length;
  const unavailableCount = items.filter((item) => item.status === "unavailable").length;
  const issueCount = total - availableCount;
  const tone = unavailableCount > 0 ? "danger" : fallbackCount > 0 ? "warning" : "success";
  const label = issueCount > 0 ? `${availableCount}/${total} 项可用，${issueCount} 项需兜底` : `${availableCount}/${total} 项可用`;

  return {
    total,
    availableCount,
    fallbackCount,
    unavailableCount,
    issueCount,
    tone,
    label,
  };
}

function mapDeliveryCameraReadiness(support) {
  if (support.supported) {
    return createReadinessItem({
      key: "delivery_camera",
      label: "水印拍照",
      status: "available",
      statusLabel: "可用",
      tone: "success",
      message: "相机 + 截图可用",
    });
  }
  return createReadinessItem({
    key: "delivery_camera",
    label: "水印拍照",
    status: "fallback",
    statusLabel: "用上传兜底",
    tone: "warning",
    message: support.reason === "CANVAS_UNAVAILABLE" ? "缺少截图能力" : "缺少相机能力",
  });
}

function mapPackageScanReadiness(support) {
  if (support.supported) {
    return createReadinessItem({
      key: "package_camera_scan",
      label: "扫码核包",
      status: "available",
      statusLabel: "可用",
      tone: "success",
      message: "相机扫码可用",
    });
  }
  return createReadinessItem({
    key: "package_camera_scan",
    label: "扫码核包",
    status: "fallback",
    statusLabel: "用扫码枪/手输",
    tone: "warning",
    message: support.reason === "BARCODE_DETECTOR_UNAVAILABLE" ? "缺少识别能力" : "缺少相机能力",
  });
}

function mapGeolocationReadiness(support) {
  if (support.supported) {
    return createReadinessItem({
      key: "geolocation",
      label: "定位",
      status: "available",
      statusLabel: "可用",
      tone: "success",
      message: "GPS 读取可用",
    });
  }
  return createReadinessItem({
    key: "geolocation",
    label: "定位",
    status: "fallback",
    statusLabel: "用地址快照",
    tone: "warning",
    message: "缺少定位能力",
  });
}

function mapFileUploadReadiness(support) {
  if (support.supported) {
    return createReadinessItem({
      key: "file_upload_fallback",
      label: "上传兜底",
      status: "available",
      statusLabel: "可用",
      tone: "success",
      message: "图片选择 + 内容读取可用",
    });
  }
  if (support.hasFilePicker) {
    return createReadinessItem({
      key: "file_upload_fallback",
      label: "上传兜底",
      status: "partial",
      statusLabel: "部分可用",
      tone: "warning",
      message: "缺少内容读取能力",
    });
  }
  return createReadinessItem({
    key: "file_upload_fallback",
    label: "上传兜底",
    status: "unavailable",
    statusLabel: "不可用",
    tone: "danger",
    message: "缺少文件选择能力",
  });
}

function getGeolocationSupport(env) {
  const geolocation = env?.navigator?.geolocation;
  const supported = Boolean(geolocation && typeof geolocation.getCurrentPosition === "function");
  return { supported };
}

function getFileUploadFallbackSupport(env) {
  const hasFilePicker = Boolean(env?.document && typeof env.document.createElement === "function");
  const hasFileReader = typeof env?.FileReader === "function";
  return {
    supported: hasFilePicker && hasFileReader,
    hasFilePicker,
    hasFileReader,
  };
}

function createReadinessItem(input) {
  return {
    key: input.key,
    label: input.label,
    status: input.status,
    statusLabel: input.statusLabel,
    tone: input.tone,
    message: input.message,
  };
}
