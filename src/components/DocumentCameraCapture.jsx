import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DOCUMENT_CAMERA_MESSAGES,
  buildDocumentCameraFileName,
  captureDocumentCameraPhoto,
  getDocumentCameraSupport,
  listDocumentCameraDevices,
  readPreferredDocumentCameraId,
  rememberPreferredDocumentCameraId,
  startDocumentCamera,
  waitForDocumentCameraFrame,
} from "../services/documentCameraClient.js";
import "../styles/features/document-camera.css";

export function DocumentCameraCapture({
  children,
  className = "button-like document-camera-trigger",
  disabled = false,
  fileNamePrefix = "document-camera",
  label = "用高拍仪/摄像头拍照",
  onCapture,
  onUseSystemCamera,
}) {
  const [open, setOpen] = useState(false);
  const triggerClass = [className, disabled ? "is-disabled" : ""].filter(Boolean).join(" ");
  return (
    <>
      <button className={triggerClass} disabled={disabled} onClick={() => setOpen(true)} type="button">
        {children || label}
      </button>
      {open ? (
        <DocumentCameraDialog
          fileNamePrefix={fileNamePrefix}
          onCapture={onCapture}
          onClose={() => setOpen(false)}
          onUseSystemCamera={onUseSystemCamera}
        />
      ) : null}
    </>
  );
}

export function DocumentCameraDialog({
  fileNamePrefix = "document-camera",
  onCapture,
  onClose,
  onUseSystemCamera,
}) {
  const titleId = useId();
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const [deviceId, setDeviceId] = useState(() => readPreferredDocumentCameraId());
  const [devices, setDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [status, setStatus] = useState(DOCUMENT_CAMERA_MESSAGES.opening);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    let cancelled = false;
    async function openCamera() {
      setError("");
      setReady(false);
      setStatus(DOCUMENT_CAMERA_MESSAGES.opening);
      const support = getDocumentCameraSupport();
      if (!support.supported) {
        setError(support.message);
        setStatus("");
        return;
      }
      try {
        const session = await startDocumentCamera({
          videoElement,
          deviceId,
          onStatus: (message) => {
            if (!cancelled) setStatus(message);
          },
        });
        if (cancelled || session.stopped) {
          session.stop();
          return;
        }
        sessionRef.current = session;
        setActiveDeviceId(session.appliedDeviceId || deviceId);
        if (session.appliedDeviceId) rememberPreferredDocumentCameraId(session.appliedDeviceId);
        if (session.fellBack && !cancelled) {
          setStatus("上次选择的摄像头不可用，已改用当前摄像头。对准单据后拍照，照片会直接挂到当前单据。");
        }
        try {
          const listed = await listDocumentCameraDevices();
          if (!cancelled) setDevices(listed);
        } catch {
          if (!cancelled) setDevices([]);
        }
        const framed = await waitForDocumentCameraFrame(videoElement);
        if (cancelled) return;
        if (!framed) {
          setStatus("摄像头已打开，但还没有画面。请稍等，或更换摄像头后重试；也可以改用从文件选择上传。");
        }
        setReady(framed);
      } catch (cameraError) {
        if (!cancelled) {
          setReady(false);
          setError(cameraError?.message || DOCUMENT_CAMERA_MESSAGES.startFailed);
          setStatus("");
        }
      }
    }
    void openCamera();
    return () => {
      cancelled = true;
      sessionRef.current?.stop?.();
      sessionRef.current = null;
    };
  }, [deviceId]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function capture() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const photo = await captureDocumentCameraPhoto({
        videoElement: videoRef.current,
        fileName: buildDocumentCameraFileName(fileNamePrefix),
      });
      await onCapture?.(photo.file);
      onClose?.();
    } catch (captureError) {
      setError(captureError?.message || "拍照失败，请重试或改用从文件选择上传。");
    } finally {
      setBusy(false);
    }
  }

  function chooseDevice(nextDeviceId) {
    if (nextDeviceId === deviceId) return;
    rememberPreferredDocumentCameraId(nextDeviceId);
    setDeviceId(nextDeviceId);
  }

  const selectedDevice = devices.find((device) => device.deviceId === (activeDeviceId || deviceId));
  const showUnlabeledHint = ready && devices.some((device) => /^摄像头 \d+$/.test(device.label));
  const dialog = (
    <div className="document-camera-backdrop" onMouseDown={() => { if (!busy) onClose?.(); }} role="presentation">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="document-camera-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <span>标准摄像头</span>
            <h2 id={titleId}>用高拍仪 / 摄像头拍照</h2>
          </div>
          <button aria-label="关闭拍照" disabled={busy} onClick={onClose} type="button">×</button>
        </header>
        <video autoPlay className="document-camera-preview" muted playsInline ref={videoRef} />
        {devices.length > 1 ? (
          <label className="document-camera-device">
            <span>摄像头</span>
            <select disabled={busy} onChange={(event) => chooseDevice(event.target.value)} value={activeDeviceId || deviceId}>
              {devices.map((device) => (
                <option key={device.deviceId || device.label} value={device.deviceId}>{device.label}</option>
              ))}
            </select>
          </label>
        ) : selectedDevice ? (
          <p className="document-camera-device-name">当前摄像头：{selectedDevice.label}</p>
        ) : ready ? (
          <p className="document-camera-device-name">当前摄像头已打开。</p>
        ) : null}
        {status ? <p className="document-camera-status" role="status">{status}</p> : null}
        {error ? <p className="document-camera-error" role="alert">{error}</p> : null}
        {error || showUnlabeledHint ? (
          <p className="document-camera-hint">若列表里没有高拍仪，说明网页没有把它认成摄像头。请在设备上打开 UVC / Webcam 模式，或改用能被系统识别为摄像头的型号，然后继续用文件上传。</p>
        ) : (
          <p className="document-camera-hint">拍下后直接进入当前单据，不用再选文件上传。多摄像头时可在上面切换，高拍仪通常显示自己的设备名。</p>
        )}
        <footer>
          {error && onUseSystemCamera ? (
            <button disabled={busy} onClick={() => { onUseSystemCamera(); onClose?.(); }} type="button">改用系统相机</button>
          ) : null}
          <button disabled={busy} onClick={onClose} type="button">关闭</button>
          <button className="document-camera-shutter" disabled={!ready || busy} onClick={() => { void capture(); }} type="button">
            {busy ? "正在挂到单据…" : "拍下并挂到单据"}
          </button>
        </footer>
      </section>
    </div>
  );
  if (typeof document === "undefined" || !document.body) return dialog;
  return createPortal(dialog, document.body);
}
