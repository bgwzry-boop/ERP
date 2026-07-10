const DEFAULT_DRIVER_PACKAGE_BARCODE_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "itf",
  "codabar",
  "upc_a",
  "upc_e",
];

export function getDriverPackageCameraScannerSupport(env = globalThis) {
  const mediaDevices = env?.navigator?.mediaDevices;
  const hasMediaDevices = Boolean(mediaDevices && typeof mediaDevices.getUserMedia === "function");
  const hasBarcodeDetector = typeof env?.BarcodeDetector === "function";

  if (!hasMediaDevices) {
    return {
      supported: false,
      reason: "MEDIA_DEVICES_UNAVAILABLE",
      message: "当前浏览器不支持相机访问，请继续用扫描枪或手输包裹号。",
      hasMediaDevices,
      hasBarcodeDetector,
    };
  }
  if (!hasBarcodeDetector) {
    return {
      supported: false,
      reason: "BARCODE_DETECTOR_UNAVAILABLE",
      message: "当前浏览器不支持相机扫码识别，请继续用扫描枪或手输包裹号。",
      hasMediaDevices,
      hasBarcodeDetector,
    };
  }

  return {
    supported: true,
    reason: "SUPPORTED",
    message: "支持浏览器相机扫码。",
    hasMediaDevices,
    hasBarcodeDetector,
  };
}

export function normalizeDriverPackageBarcodeResults(results = []) {
  return toArray(results)
    .map((item) => cleanText(item?.rawValue ?? item?.displayValue ?? item?.value ?? item?.text))
    .find(Boolean) ?? "";
}

export async function startDriverPackageCameraScanner(input = {}) {
  const {
    videoElement,
    onCode,
    onReady,
    onStatus,
    env = globalThis,
    formats = DEFAULT_DRIVER_PACKAGE_BARCODE_FORMATS,
    scanIntervalMs = 350,
  } = input;
  if (!videoElement) {
    throw createScannerError("VIDEO_ELEMENT_REQUIRED", "相机预览未准备好，请稍后重试。");
  }

  const support = getDriverPackageCameraScannerSupport(env);
  if (!support.supported) {
    throw createScannerError(support.reason, support.message);
  }

  const mediaDevices = env.navigator.mediaDevices;
  const detector = createDriverPackageBarcodeDetector(env, formats);
  let stopped = false;
  let stream = null;
  let timerId = null;
  let detecting = false;

  const stop = () => {
    stopped = true;
    if (timerId !== null) {
      const clearIntervalFn = env.clearInterval ?? clearInterval;
      clearIntervalFn(timerId);
      timerId = null;
    }
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

  async function detectOnce() {
    if (stopped || detecting) return;
    detecting = true;
    try {
      if (Number(videoElement.readyState ?? 0) >= 2) {
        const code = normalizeDriverPackageBarcodeResults(await detector.detect(videoElement));
        if (code) {
          stop();
          if (typeof onCode === "function") onCode(code);
        }
      }
    } catch (error) {
      if (!stopped && typeof onStatus === "function") {
        onStatus(`扫码识别暂不可用：${error?.message ?? String(error)}`);
      }
    } finally {
      detecting = false;
    }
  }

  try {
    if (typeof onStatus === "function") onStatus("正在打开相机...");
    stream = await mediaDevices.getUserMedia({
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
    if (typeof onReady === "function") onReady({ stream });
    if (typeof onStatus === "function") onStatus("请把包裹标签二维码/条码放入取景框。");
    timerId = (env.setInterval ?? setInterval)(detectOnce, scanIntervalMs);
    await detectOnce();
    return session;
  } catch (error) {
    stop();
    if (error?.code) throw error;
    const failure = getCameraStartFailure(error);
    throw createScannerError(failure.code, failure.message, error);
  }
}

function createDriverPackageBarcodeDetector(env, formats) {
  try {
    return new env.BarcodeDetector({ formats });
  } catch {
    return new env.BarcodeDetector();
  }
}

function stopMediaStream(stream) {
  toArray(stream?.getTracks?.()).forEach((track) => {
    if (typeof track?.stop === "function") track.stop();
  });
}

function getCameraStartFailure(error) {
  const name = cleanText(error?.name);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      code: "CAMERA_PERMISSION_DENIED",
      message: "相机权限未授权，请继续用扫描枪或手输包裹号。",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      code: "CAMERA_DEVICE_UNAVAILABLE",
      message: "没有找到可用摄像头，请继续用扫描枪或手输包裹号。",
    };
  }
  return {
    code: "CAMERA_START_FAILED",
    message: "相机扫码启动失败，请继续用扫描枪或手输包裹号。",
  };
}

function createScannerError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}
