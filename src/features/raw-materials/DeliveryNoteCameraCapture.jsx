import { useEffect, useRef, useState } from "react";

// 电脑端「调用摄像头 / 高拍仪」：高拍仪在电脑上就是一个 USB 摄像头，
// 用浏览器直接取景、拍照，拍好的照片和「上传照片」走同一条识别流程。
const DEVICE_STORAGE_KEY = "erp.rawMaterial.deliveryNoteCameraId";

function readStoredDevice() {
  try {
    return globalThis.localStorage?.getItem(DEVICE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function storeDevice(value) {
  try {
    globalThis.localStorage?.setItem(DEVICE_STORAGE_KEY, value);
  } catch {
    // Remembering the scanner is only a convenience.
  }
}

export function isDeliveryNoteCameraSupported(env = globalThis) {
  return typeof env?.navigator?.mediaDevices?.getUserMedia === "function";
}

// Windows lets only one program use a USB camera at a time, and some
// document cameras refuse resolution hints. Try from most to least specific.
export function buildCameraConstraintAttempts(deviceId = "") {
  const hd = { width: { ideal: 3264 }, height: { ideal: 2448 } };
  const attempts = [];
  if (deviceId) {
    attempts.push({ video: { deviceId: { exact: deviceId }, ...hd }, audio: false });
    attempts.push({ video: { deviceId: { exact: deviceId } }, audio: false });
  }
  attempts.push({ video: hd, audio: false });
  attempts.push({ video: true, audio: false });
  return attempts;
}

export function describeCameraError(cause) {
  const name = String(cause?.name || "");
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "浏览器没有摄像头权限。请点地址栏左边的图标，把「摄像头」改成允许，然后点「重试」。";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "高拍仪正被别的软件占用（比如科密高拍仪 / Scan）。请先把那个软件完全关掉（任务栏右键 → 关闭窗口），再点「重试」。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "没有找到摄像头或高拍仪。请检查 USB 线是否插好，插好后点「重试」，或改用「上传照片」。";
  }
  return `摄像头打不开（${name || "未知原因"}）。请关掉高拍仪软件后点「重试」，或改用「上传照片」。`;
}

async function openCamera(deviceId, mediaDevices = navigator.mediaDevices) {
  let firstError = null;
  let lastError = null;
  for (const constraints of buildCameraConstraintAttempts(deviceId)) {
    try {
      return await mediaDevices.getUserMedia(constraints);
    } catch (cause) {
      firstError ||= cause;
      lastError = cause;
      // Permission problems will not be fixed by looser constraints.
      if (["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(cause?.name)) throw cause;
    }
  }
  // "In use by another program" is the most useful thing to report if any attempt saw it.
  throw [firstError, lastError].find((cause) => cause?.name === "NotReadableError") || lastError || firstError;
}

export function DeliveryNoteCameraCapture({ onCapture, onClose, completeLabel = "拍好了，开始识别", maxPages = Infinity }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const panelRef = useRef(null);
  const pagesRef = useRef([]);
  const mountedRef = useRef(false);
  const captureRef = useRef(false);
  const finishingRef = useRef(false);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(readStoredDevice);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const pageLimit = Number.isFinite(Number(maxPages)) ? Math.max(0, Math.floor(Number(maxPages))) : Infinity;

  useEffect(() => {
    mountedRef.current = true;
    const previous = document.activeElement;
    panelRef.current?.querySelector("button")?.focus();
    return () => {
      mountedRef.current = false;
      pagesRef.current.forEach(page => URL.revokeObjectURL(page.url));
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setReady(false);
      setError("");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      try {
        const stream = await openCamera(deviceId);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
        if (!cancelled) {
          setDevices(list);
          setReady(true);
        }
      } catch (cause) {
        if (cancelled) return;
        setError(describeCameraError(cause));
        const list = await navigator.mediaDevices.enumerateDevices?.().catch(() => []) ?? [];
        if (!cancelled) setDevices(list.filter((device) => device.kind === "videoinput"));
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [deviceId, attempt]);

  function chooseDevice(value) {
    setDeviceId(value);
    storeDevice(value);
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!ready || !video?.videoWidth || captureRef.current || finishingRef.current || pagesRef.current.length >= pageLimit) return;
    captureRef.current = true;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("拍照失败，请重试。");
      if (!mountedRef.current || pagesRef.current.length >= pageLimit) return;
      const file = new File([blob], `送货单-高拍仪-${pagesRef.current.length + 1}.jpg`, { type: "image/jpeg" });
      const nextPages = [...pagesRef.current, { file, url: URL.createObjectURL(blob) }];
      pagesRef.current = nextPages;
      setPages(nextPages);
    } catch (cause) {
      if (mountedRef.current) setError(cause?.message || "拍照失败，请重试。");
    } finally {
      captureRef.current = false;
      if (mountedRef.current) setCapturing(false);
    }
  }

  function finish() {
    if (!pagesRef.current.length || captureRef.current || finishingRef.current) return;
    finishingRef.current = true;
    onCapture?.(pagesRef.current.map((page) => page.file));
    onClose?.();
  }

  function close() {
    if (!captureRef.current && !finishingRef.current) onClose?.();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...panelRef.current.querySelectorAll("button:not(:disabled), select:not(:disabled)")];
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div className="delivery-note-camera" role="dialog" aria-modal="true" aria-label="摄像头 / 高拍仪拍送货单" onKeyDown={handleKeyDown}>
      <div className="delivery-note-camera-panel" ref={panelRef}>
        <header>
          <strong>摄像头 / 高拍仪拍送货单</strong>
          {devices.length > 1 || (error && devices.length) ? (
            <select aria-label="选择摄像头" disabled={capturing} onChange={(event) => chooseDevice(event.target.value)} value={deviceId}>
              <option value="">默认摄像头</option>
              {devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `摄像头 ${index + 1}`}</option>)}
            </select>
          ) : null}
        </header>
        {error ? <p className="delivery-note-camera-error" role="alert">{error}</p> : (
          <video aria-label="取景" muted playsInline ref={videoRef} />
        )}
        {pages.length ? (
          <div className="delivery-note-camera-pages" aria-label="已拍页">
            {pages.map((page, index) => <img alt={`第 ${index + 1} 页`} key={page.url} src={page.url} />)}
          </div>
        ) : <p className="delivery-note-camera-hint">把送货单放平在高拍仪下，整张都进取景框再拍。多页就连拍几张。</p>}
        <footer>
          <button disabled={capturing} onClick={close} type="button">取消</button>
          {error ? <button onClick={() => setAttempt((value) => value + 1)} type="button">重试</button> : null}
          <button disabled={!ready || capturing || pages.length >= pageLimit} onClick={takePhoto} type="button">{capturing ? "正在拍照…" : pages.length >= pageLimit ? `已拍 ${pages.length} 页` : pages.length ? `再拍一页（已拍 ${pages.length} 页）` : "拍照"}</button>
          <button className="primary-action" disabled={!pages.length || capturing} onClick={finish} type="button">{completeLabel}</button>
        </footer>
      </div>
    </div>
  );
}
