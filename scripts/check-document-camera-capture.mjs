import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DOCUMENT_CAMERA_MESSAGES,
  buildDocumentCameraFileName,
  captureDocumentCameraPhoto,
  getDocumentCameraSupport,
  listDocumentCameraDevices,
  readPreferredDocumentCameraId,
  rememberPreferredDocumentCameraId,
  startDocumentCamera,
} from "../src/services/documentCameraClient.js";
import { getDriverDeliveryPhotoCameraSupport } from "../src/services/driverCameraPhotoClient.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const inboundDetail = read("../src/features/raw-materials/InboundDetail.jsx");
const mobileReceiving = read("../src/features/raw-materials/RawMaterialMobileReceiving.jsx");
const reviewApp = read("../docs/prototypes/raw-material-roll-inventory-review/src/App.jsx");
const decisionFields = read("../src/components/DelegatedBusinessDecisionFields.jsx");
const payroll = read("../src/features/payroll/PayrollAttendancePage.jsx");
const inventory = read("../src/features/inventory/InventoryPage.jsx");
const actionModals = read("../src/app/ActionModals.jsx");
const driverClient = read("../src/services/driverCameraPhotoClient.js");
const cameraClient = read("../src/services/documentCameraClient.js");

assert.match(inboundDetail, /用高拍仪\/摄像头拍照/);
assert.match(inboundDetail, /扫描 \/ 上传送货单/);
assert.match(inboundDetail, /DocumentCameraCapture/);
assert.match(mobileReceiving, /capture="environment"/);
assert.match(mobileReceiving, /相册 \/ PDF/);
assert.match(mobileReceiving, /DocumentCameraCapture/);
assert.match(reviewApp, /直接拍照/);
assert.match(reviewApp, /相册 \/ PDF/);
assert.match(reviewApp, /DocumentCameraDialog/);
assert.match(decisionFields, /选择文件/);
assert.match(decisionFields, /用高拍仪\/摄像头拍照/);
assert.match(payroll, /DocumentCameraCapture/);
assert.match(inventory, /DocumentCameraCapture/);
assert.match(actionModals, /DocumentCameraCapture/);
assert.match(driverClient, /documentCameraClient\.js/);
assert.match(cameraClient, /enumerateDevices/);
assert.match(cameraClient, /getUserMedia/);
assert.match(DOCUMENT_CAMERA_MESSAGES.notFound, /UVC \/ Webcam/);
assert.match(DOCUMENT_CAMERA_MESSAGES.permission, /从文件选择/);

const unsupported = getDocumentCameraSupport({});
assert.equal(unsupported.supported, false);
assert.equal(unsupported.reason, "MEDIA_DEVICES_UNAVAILABLE");
assert.match(unsupported.message, /从文件选择/);
assert.match(unsupported.message, /UVC \/ Webcam/);

const driverUnsupported = getDriverDeliveryPhotoCameraSupport({});
assert.match(driverUnsupported.message, /文件上传水印照片/);

const storage = new Map();
const preferenceEnv = {
  sessionStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};
rememberPreferredDocumentCameraId("cam-high", preferenceEnv);
assert.equal(readPreferredDocumentCameraId(preferenceEnv), "cam-high");
rememberPreferredDocumentCameraId("", preferenceEnv);
assert.equal(readPreferredDocumentCameraId(preferenceEnv), "");

const opened = [];
function createEnv({ devices, failName, rejectExact = false }) {
  return {
    File,
    atob: globalThis.atob,
    fetch: async () => {
      throw new Error("use base64");
    },
    document: {
      createElement() {
        return {
          width: 0,
          height: 0,
          getContext() {
            return { drawImage() {} };
          },
          toDataURL: () => "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        };
      },
    },
    navigator: {
      mediaDevices: {
        async enumerateDevices() {
          return devices;
        },
        async getUserMedia(constraints) {
          opened.push(constraints);
          if (failName) {
            const error = new Error(failName);
            error.name = failName;
            throw error;
          }
          const exact = constraints?.video?.deviceId?.exact;
          if (rejectExact && exact) {
            const error = new Error("missing camera");
            error.name = "OverconstrainedError";
            throw error;
          }
          const track = {
            stopped: false,
            getSettings: () => ({ deviceId: exact || "cam-default" }),
            stop() {
              track.stopped = true;
            },
          };
          return { getVideoTracks: () => [track], getTracks: () => [track] };
        },
      },
    },
  };
}

const listed = await listDocumentCameraDevices(createEnv({
  devices: [
    { kind: "audioinput", deviceId: "mic", label: "麦克风" },
    { kind: "videoinput", deviceId: "cam-a", label: "高拍仪 S500" },
    { kind: "videoinput", deviceId: "cam-b", label: "" },
  ],
}));
assert.deepEqual(listed.map((device) => device.label), ["高拍仪 S500", "摄像头 2"]);

const video = {
  videoWidth: 1280,
  videoHeight: 960,
  srcObject: null,
  muted: false,
  playsInline: false,
  pause() {},
  setAttribute() {},
  async play() {},
};
const started = await startDocumentCamera({
  env: createEnv({ devices: [] }),
  videoElement: video,
  deviceId: "cam-a",
});
assert.equal(started.appliedDeviceId, "cam-a");
assert.equal(opened.at(-1).video.deviceId.exact, "cam-a");
assert.equal(opened.at(-1).audio, false);
const replacement = await startDocumentCamera({
  env: createEnv({ devices: [] }),
  videoElement: video,
  deviceId: "cam-b",
});
started.stop();
assert.equal(video.srcObject, replacement.stream, "stopping an older camera must not clear the current preview");
replacement.stop();
assert.equal(video.srcObject, null);

const fallbackVideo = { ...video, srcObject: null, pause() {}, setAttribute() {}, async play() {} };
const fellBack = await startDocumentCamera({
  env: createEnv({ devices: [], rejectExact: true }),
  videoElement: fallbackVideo,
  deviceId: "missing-cam",
});
assert.equal(fellBack.fellBack, true);
assert.equal(fellBack.appliedDeviceId, "cam-default");
fellBack.stop();

await assert.rejects(
  () => startDocumentCamera({ env: createEnv({ devices: [], failName: "NotAllowedError" }), videoElement: video }),
  (error) => error.code === "CAMERA_START_FAILED" && /权限被拒绝/.test(error.message) && /从文件选择/.test(error.message),
);
await assert.rejects(
  () => startDocumentCamera({ env: createEnv({ devices: [], failName: "NotFoundError" }), videoElement: video }),
  (error) => /没有找到可用摄像头/.test(error.message) && /UVC \/ Webcam/.test(error.message),
);
await assert.rejects(
  () => startDocumentCamera({ env: createEnv({ devices: [], failName: "NotReadableError" }), videoElement: video }),
  (error) => /其他程序占用/.test(error.message),
);

const photo = await captureDocumentCameraPhoto({
  env: createEnv({ devices: [] }),
  videoElement: video,
  fileName: buildDocumentCameraFileName("delivery-note", new Date("2026-10-28T01:02:03.000Z")),
});
assert.equal(photo.fileName, "delivery-note-20261028010203.jpg");
assert.equal(photo.file.type, "image/jpeg");
assert.equal(photo.file.name, photo.fileName);
assert.equal(photo.width, 1280);
assert.equal(photo.height, 960);
assert.ok(photo.size > 0);

const emptyFrame = { ...video, videoWidth: 0, videoHeight: 0 };
await assert.rejects(
  () => captureDocumentCameraPhoto({ env: createEnv({ devices: [] }), videoElement: emptyFrame }),
  (error) => error.code === "VIDEO_FRAME_UNAVAILABLE" && /尚未准备好/.test(error.message),
);

console.log("document camera capture: preview, device selection, direct file handoff and Chinese fallback checks passed");
