export function getDriverDeliveryPhotoCameraSupport(env = globalThis) {
  const mediaDevices = env?.navigator?.mediaDevices;
  const hasMediaDevices = Boolean(mediaDevices && typeof mediaDevices.getUserMedia === "function");
  const hasCanvas = Boolean(env?.document && typeof env.document.createElement === "function");

  if (!hasMediaDevices) {
    return {
      supported: false,
      reason: "MEDIA_DEVICES_UNAVAILABLE",
      message: "当前浏览器不支持相机访问，请继续用文件上传水印照片。",
      hasMediaDevices,
      hasCanvas,
    };
  }
  if (!hasCanvas) {
    return {
      supported: false,
      reason: "CANVAS_UNAVAILABLE",
      message: "当前浏览器不支持拍照截图，请继续用文件上传水印照片。",
      hasMediaDevices,
      hasCanvas,
    };
  }

  return {
    supported: true,
    reason: "SUPPORTED",
    message: "支持浏览器相机拍照。",
    hasMediaDevices,
    hasCanvas,
  };
}

export async function startDriverDeliveryPhotoCamera(input = {}) {
  const { videoElement, onStatus, env = globalThis } = input;
  if (!videoElement) {
    throw createCameraPhotoError("VIDEO_ELEMENT_REQUIRED", "相机预览未准备好，请稍后重试。");
  }

  const support = getDriverDeliveryPhotoCameraSupport(env);
  if (!support.supported) {
    throw createCameraPhotoError(support.reason, support.message);
  }

  let stopped = false;
  let stream = null;

  const stop = () => {
    stopped = true;
    stopMediaStream(stream);
    stream = null;
    if (videoElement.srcObject) videoElement.srcObject = null;
    if (typeof videoElement.pause === "function") videoElement.pause();
  };

  const session = {
    stop,
    get stopped() {
      return stopped;
    },
    get stream() {
      return stream;
    },
  };

  try {
    if (typeof onStatus === "function") onStatus("正在打开相机...");
    stream = await env.navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    if (stopped) {
      stop();
      return session;
    }
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.playsInline = true;
    if (typeof videoElement.setAttribute === "function") videoElement.setAttribute("playsinline", "true");
    if (typeof videoElement.play === "function") await videoElement.play();
    if (typeof onStatus === "function") onStatus("请对准送货现场或签收货物后点击拍照。");
    return session;
  } catch (error) {
    stop();
    if (error?.code) throw error;
    throw createCameraPhotoError("CAMERA_START_FAILED", getCameraPhotoStartFailureMessage(error), error);
  }
}

export async function captureDriverDeliveryPhotoFromVideo(input = {}) {
  const {
    videoElement,
    env = globalThis,
    fileName = getDriverDeliveryCameraPhotoFileName(),
    mimeType = "image/jpeg",
    quality = 0.9,
  } = input;
  if (!videoElement) {
    throw createCameraPhotoError("VIDEO_ELEMENT_REQUIRED", "相机预览未准备好，无法拍照。");
  }
  const documentRef = env?.document;
  if (!documentRef || typeof documentRef.createElement !== "function") {
    throw createCameraPhotoError("CANVAS_UNAVAILABLE", "当前浏览器不支持拍照截图，请继续用文件上传水印照片。");
  }

  const width = Math.max(1, Number(videoElement.videoWidth || videoElement.clientWidth || videoElement.width || 0));
  const height = Math.max(1, Number(videoElement.videoHeight || videoElement.clientHeight || videoElement.height || 0));
  if (!width || !height) {
    throw createCameraPhotoError("VIDEO_FRAME_UNAVAILABLE", "相机画面尚未准备好，请稍后再拍。");
  }

  const canvas = documentRef.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext?.("2d");
  if (!context) {
    throw createCameraPhotoError("CANVAS_CONTEXT_UNAVAILABLE", "当前浏览器不支持拍照截图，请继续用文件上传水印照片。");
  }
  context.drawImage(videoElement, 0, 0, width, height);
  const contentDataUrl = canvas.toDataURL(mimeType, quality);
  const file = await createFileLikeFromDataUrl(contentDataUrl, fileName, mimeType, env);
  return {
    file,
    fileName,
    mimeType,
    contentDataUrl,
    size: Number(file?.size ?? estimateDataUrlByteSize(contentDataUrl) ?? 0),
    width,
    height,
  };
}

export function getDriverDeliveryCameraPhotoFileName(prefix = "driver-delivery-camera") {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `${prefix}-${stamp}.jpg`;
}

async function createFileLikeFromDataUrl(dataUrl, fileName, mimeType, env) {
  const blob = await dataUrlToBlob(dataUrl, mimeType, env);
  if (typeof env?.File === "function") {
    const file = new env.File([blob], fileName, { type: mimeType, lastModified: Date.now() });
    safelyAssign(file, "contentDataUrl", dataUrl);
    return file;
  }
  safelyAssign(blob, "name", fileName);
  safelyAssign(blob, "lastModified", Date.now());
  safelyAssign(blob, "contentDataUrl", dataUrl);
  return blob;
}

async function dataUrlToBlob(dataUrl, mimeType, env) {
  if (typeof env?.fetch === "function") {
    try {
      const response = await env.fetch(dataUrl);
      if (typeof response?.blob === "function") return await response.blob();
    } catch {
      // Fall through to manual base64 decoding.
    }
  }

  const base64 = String(dataUrl).split(",")[1] ?? "";
  const byteString = typeof env?.atob === "function" ? env.atob(base64) : "";
  const bytes = new Uint8Array(byteString.length);
  for (let index = 0; index < byteString.length; index += 1) {
    bytes[index] = byteString.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function stopMediaStream(stream) {
  const tracks = typeof stream?.getTracks === "function" ? stream.getTracks() : [];
  tracks.forEach((track) => {
    if (typeof track?.stop === "function") track.stop();
  });
}

function getCameraPhotoStartFailureMessage(error) {
  const name = cleanText(error?.name);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "相机权限未授权，请继续用文件上传水印照片。";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "没有找到可用摄像头，请继续用文件上传水印照片。";
  }
  return "相机拍照启动失败，请继续用文件上传水印照片。";
}

function createCameraPhotoError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function estimateDataUrlByteSize(dataUrl = "") {
  const base64 = String(dataUrl).split(",")[1] ?? "";
  if (!base64) return undefined;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function safelyAssign(target, key, value) {
  try {
    target[key] = value;
  } catch {
    try {
      Object.defineProperty(target, key, { value, configurable: true });
    } catch {
      // Ignore non-extensible objects; FileReader can still read the Blob/File.
    }
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}
