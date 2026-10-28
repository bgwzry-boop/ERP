export const DOCUMENT_CAMERA_DEVICE_STORAGE_KEY = "erp.documentCamera.deviceId";

export const DOCUMENT_CAMERA_VIDEO_CONSTRAINTS = Object.freeze({
  facingMode: { ideal: "environment" },
  width: { ideal: 2560 },
  height: { ideal: 1920 },
});

export const DOCUMENT_CAMERA_MESSAGES = Object.freeze({
  unsupported: "当前浏览器不能调用摄像头。请改用从文件选择上传。若高拍仪只在厂商软件里出现、网页枚举不到，请打开 UVC / Webcam 模式，或改用系统能识别为摄像头的型号。",
  canvas: "当前浏览器不能从摄像头截取照片。请改用从文件选择上传。",
  permission: "摄像头权限被拒绝。请在浏览器地址栏允许使用摄像头后重试，也可以改用从文件选择上传。",
  notFound: "没有找到可用摄像头。请确认高拍仪已连接，并被系统识别为摄像头；也可以改用从文件选择上传。若设备只在厂商软件里出现，请打开 UVC / Webcam 模式。",
  inUse: "摄像头正被其他程序占用。请关闭厂商拍摄软件后重试，或改用从文件选择上传。",
  startFailed: "摄像头打开失败。请改用从文件选择上传。若高拍仪没有出现在设备列表里，请打开 UVC / Webcam 模式。",
  frame: "摄像头画面尚未准备好，请稍后再拍。",
  videoMissing: "相机预览未准备好，请稍后重试。",
  opening: "正在打开摄像头…",
  ready: "对准单据后点击拍照。照片会直接挂到当前单据，不用再选文件上传。",
});

export function getDocumentCameraSupport(env = globalThis, messages = DOCUMENT_CAMERA_MESSAGES) {
  const mediaDevices = env?.navigator?.mediaDevices;
  const hasMediaDevices = Boolean(mediaDevices && typeof mediaDevices.getUserMedia === "function");
  const hasCanvas = Boolean(env?.document && typeof env.document.createElement === "function");

  if (!hasMediaDevices) {
    return {
      supported: false,
      reason: "MEDIA_DEVICES_UNAVAILABLE",
      message: messages.unsupported,
      hasMediaDevices,
      hasCanvas,
    };
  }
  if (!hasCanvas) {
    return {
      supported: false,
      reason: "CANVAS_UNAVAILABLE",
      message: messages.canvas,
      hasMediaDevices,
      hasCanvas,
    };
  }
  return {
    supported: true,
    reason: "SUPPORTED",
    message: "支持浏览器摄像头拍照。",
    hasMediaDevices,
    hasCanvas,
  };
}

export function readPreferredDocumentCameraId(env = globalThis) {
  try {
    return String(env.sessionStorage?.getItem(DOCUMENT_CAMERA_DEVICE_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

export function rememberPreferredDocumentCameraId(deviceId, env = globalThis) {
  try {
    if (deviceId) env.sessionStorage?.setItem(DOCUMENT_CAMERA_DEVICE_STORAGE_KEY, deviceId);
    else env.sessionStorage?.removeItem(DOCUMENT_CAMERA_DEVICE_STORAGE_KEY);
  } catch {
    // Storage can be blocked; device choice still applies to this preview.
  }
}

export async function listDocumentCameraDevices(env = globalThis) {
  const enumerate = env?.navigator?.mediaDevices?.enumerateDevices;
  if (typeof enumerate !== "function") return [];
  const devices = await enumerate.call(env.navigator.mediaDevices);
  return (Array.isArray(devices) ? devices : [])
    .filter((device) => device?.kind === "videoinput")
    .map((device, index) => ({
      deviceId: String(device.deviceId || ""),
      groupId: String(device.groupId || ""),
      label: String(device.label || "").trim() || `摄像头 ${index + 1}`,
    }));
}

export function waitForDocumentCameraFrame(videoElement, timeoutMs = 2000) {
  if (Number(videoElement?.videoWidth) > 0 && Number(videoElement?.videoHeight) > 0) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      videoElement?.removeEventListener?.("loadedmetadata", onReady);
      videoElement?.removeEventListener?.("resize", onReady);
      clearTimeout(timer);
      resolve(Number(videoElement?.videoWidth) > 0 && Number(videoElement?.videoHeight) > 0);
    };
    const onReady = () => {
      if (Number(videoElement?.videoWidth) > 0 && Number(videoElement?.videoHeight) > 0) finish();
    };
    videoElement?.addEventListener?.("loadedmetadata", onReady);
    videoElement?.addEventListener?.("resize", onReady);
    const timer = setTimeout(finish, timeoutMs);
  });
}

export async function startDocumentCamera(input = {}) {
  const {
    videoElement,
    deviceId = "",
    videoConstraints,
    onStatus,
    env = globalThis,
    messages = DOCUMENT_CAMERA_MESSAGES,
    openingStatus = messages.opening,
    readyStatus = messages.ready,
  } = input;
  if (!videoElement) {
    throw createDocumentCameraError("VIDEO_ELEMENT_REQUIRED", messages.videoMissing);
  }
  const support = getDocumentCameraSupport(env, messages);
  if (!support.supported) {
    throw createDocumentCameraError(support.reason, support.message);
  }

  let stopped = false;
  let stream = null;
  const stop = () => {
    stopped = true;
    const current = stream;
    stopMediaStream(current);
    if (current && videoElement.srcObject === current) {
      videoElement.srcObject = null;
      if (typeof videoElement.pause === "function") videoElement.pause();
    }
    stream = null;
  };
  const session = {
    stop,
    appliedDeviceId: "",
    fellBack: false,
    get stopped() {
      return stopped;
    },
    get stream() {
      return stream;
    },
  };

  try {
    if (typeof onStatus === "function") onStatus(openingStatus);
    const requestedId = String(deviceId || "");
    try {
      stream = await requestCameraStream(env, buildVideoConstraints(requestedId, videoConstraints));
    } catch (error) {
      if (!requestedId || !isMissingCameraError(error)) throw error;
      stream = await requestCameraStream(env, buildVideoConstraints("", videoConstraints));
      session.fellBack = true;
    }
    if (stopped) {
      stop();
      return session;
    }
    const track = typeof stream.getVideoTracks === "function" ? stream.getVideoTracks()[0] : null;
    session.appliedDeviceId = String(track?.getSettings?.().deviceId || requestedId || "");
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.srcObject = stream;
    if (typeof videoElement.setAttribute === "function") videoElement.setAttribute("playsinline", "true");
    if (typeof videoElement.play === "function") {
      try {
        await videoElement.play();
      } catch {
        // The shutter can still capture once a frame is available.
      }
    }
    if (stopped) {
      stop();
      return session;
    }
    if (typeof onStatus === "function") onStatus(readyStatus);
    return session;
  } catch (error) {
    stop();
    if (error?.code) throw error;
    throw createDocumentCameraError("CAMERA_START_FAILED", getDocumentCameraStartFailureMessage(error, messages), error);
  }
}

export async function captureDocumentCameraPhoto(input = {}) {
  const {
    videoElement,
    env = globalThis,
    fileName = buildDocumentCameraFileName(),
    mimeType = "image/jpeg",
    quality = 0.92,
    messages = DOCUMENT_CAMERA_MESSAGES,
  } = input;
  if (!videoElement) {
    throw createDocumentCameraError("VIDEO_ELEMENT_REQUIRED", messages.videoMissing);
  }
  const documentRef = env?.document;
  if (!documentRef || typeof documentRef.createElement !== "function") {
    throw createDocumentCameraError("CANVAS_UNAVAILABLE", messages.canvas);
  }
  const width = Math.max(0, Number(videoElement.videoWidth || 0));
  const height = Math.max(0, Number(videoElement.videoHeight || 0));
  if (!width || !height) {
    throw createDocumentCameraError("VIDEO_FRAME_UNAVAILABLE", messages.frame);
  }
  const canvas = documentRef.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext?.("2d");
  if (!context || typeof context.drawImage !== "function" || typeof canvas.toDataURL !== "function") {
    throw createDocumentCameraError("CANVAS_CONTEXT_UNAVAILABLE", messages.canvas);
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

export function buildDocumentCameraFileName(prefix = "document-camera", now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const safePrefix = String(prefix || "document-camera").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "document-camera";
  return `${safePrefix}-${stamp}.jpg`;
}

export function getDocumentCameraStartFailureMessage(error, messages = DOCUMENT_CAMERA_MESSAGES) {
  const name = String(error?.name || "").trim();
  if (name === "NotAllowedError" || name === "SecurityError") return messages.permission;
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return messages.notFound;
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return messages.inUse;
  return messages.startFailed;
}

export function createDocumentCameraError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function buildVideoConstraints(deviceId, videoConstraints) {
  const base = { ...(videoConstraints || DOCUMENT_CAMERA_VIDEO_CONSTRAINTS) };
  if (!deviceId) return base;
  delete base.facingMode;
  return { ...base, deviceId: { exact: deviceId } };
}

function requestCameraStream(env, video) {
  return env.navigator.mediaDevices.getUserMedia({ video, audio: false });
}

function isMissingCameraError(error) {
  const name = String(error?.name || "");
  return name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError";
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
