import {
  buildDocumentCameraFileName,
  captureDocumentCameraPhoto,
  getDocumentCameraSupport,
  startDocumentCamera,
} from "./documentCameraClient.js";

const DRIVER_CAMERA_MESSAGES = Object.freeze({
  unsupported: "当前浏览器不支持相机访问，请继续用文件上传水印照片。",
  canvas: "当前浏览器不支持拍照截图，请继续用文件上传水印照片。",
  permission: "相机权限未授权，请继续用文件上传水印照片。",
  notFound: "没有找到可用摄像头，请继续用文件上传水印照片。",
  inUse: "相机拍照启动失败，请继续用文件上传水印照片。",
  startFailed: "相机拍照启动失败，请继续用文件上传水印照片。",
  frame: "相机画面尚未准备好，请稍后再拍。",
  videoMissing: "相机预览未准备好，请稍后重试。",
  opening: "正在打开相机...",
  ready: "请对准送货现场或签收货物后点击拍照。",
});

export function getDriverDeliveryPhotoCameraSupport(env = globalThis) {
  const support = getDocumentCameraSupport(env, DRIVER_CAMERA_MESSAGES);
  if (support.supported) return { ...support, message: "支持浏览器相机拍照。" };
  return support;
}

export async function startDriverDeliveryPhotoCamera(input = {}) {
  const { deviceId = "", videoConstraints = { facingMode: { ideal: "environment" } }, ...rest } = input;
  return startDocumentCamera({
    ...rest,
    deviceId,
    videoConstraints,
    messages: DRIVER_CAMERA_MESSAGES,
    openingStatus: DRIVER_CAMERA_MESSAGES.opening,
    readyStatus: DRIVER_CAMERA_MESSAGES.ready,
  });
}

export async function captureDriverDeliveryPhotoFromVideo(input = {}) {
  const {
    fileName = getDriverDeliveryCameraPhotoFileName(),
    quality = 0.9,
    ...rest
  } = input;
  return captureDocumentCameraPhoto({
    ...rest,
    fileName,
    quality,
    messages: {
      ...DRIVER_CAMERA_MESSAGES,
      videoMissing: "相机预览未准备好，无法拍照。",
    },
  });
}

export function getDriverDeliveryCameraPhotoFileName(prefix = "driver-delivery-camera") {
  return buildDocumentCameraFileName(prefix);
}
