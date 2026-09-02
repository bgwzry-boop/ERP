import assert from "node:assert/strict";
import { recognizeOfficeRawMaterialDeliveryNote } from "../src/services/officeRawMaterialApiClient.js";

const mebibyte = 1024 * 1024;
const sourceFiles = [
  { name: "腾胜第一页.jpg", type: "image/jpeg", size: 7 * mebibyte },
  { name: "腾胜第二页.jpg", type: "image/jpeg", size: 6 * mebibyte },
];
const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  if (url.includes("/attachments/binary?")) {
    const pageNumber = calls.filter((item) => item.url.includes("/attachments/binary?")).length;
    const uploadUrl = new URL(url);
    assert.equal(init.body, sourceFiles[pageNumber - 1], "the original File must be uploaded as binary content");
    assert.equal(init.headers["content-type"], "image/jpeg");
    assert.equal(uploadUrl.searchParams.get("ownerId"), "RMCAP-TEST:U-OFFICE-A", "capture attachment ownership must be scoped to the current operator");
    assert.equal(JSON.parse(uploadUrl.searchParams.get("metadata")).captureOwnerId, "RMCAP-TEST:U-OFFICE-A");
    return jsonResponse({
      attachmentId: `ATT-SOURCE-${pageNumber}`,
      ownerType: "raw_material_inbound_capture",
      purpose: "raw_material_delivery_note",
      hasContent: true,
      status: "uploaded",
    });
  }
  if (url.endsWith("/raw-material-inbounds/ocr-jobs")) {
    const body = JSON.parse(init.body);
    assert.equal(body.documentDirectionHint, "supplier_return");
    assert.equal(body.supplierNameHint, "腾胜无纺布");
    assert.equal("contentDataUrl" in body, false, "the first page must not be duplicated at the request top level");
    assert.equal(body.pages.length, 2);
    assert.deepEqual(body.pages.map((page) => page.sourceAttachmentId), ["ATT-SOURCE-1", "ATT-SOURCE-2"]);
    assert.deepEqual(body.pages.map((page) => page.ocrAttachmentId), ["ATT-SOURCE-1", "ATT-SOURCE-2"]);
    assert.equal(body.pages.every((page) => !("contentDataUrl" in page)), true, "OCR JSON must contain attachment ids instead of base64 images");
    return jsonResponse({ job: { jobId: "RMOJ-TEST", status: "queued", pageCount: 2 } });
  }
  if (url.endsWith("/raw-material-inbounds/ocr-jobs/RMOJ-TEST/status")) {
    return jsonResponse({ job: {
      jobId: "RMOJ-TEST",
      status: "completed",
      currentPage: 2,
      pageCount: 2,
      result: {
        inbound: { id: "RMI-OCR-BINARY", status: "已识别待复核", sourceAttachmentIds: ["ATT-SOURCE-1", "ATT-SOURCE-2"] },
        attachmentIds: ["ATT-SOURCE-1", "ATT-SOURCE-2"],
      },
    } });
  }
  throw new Error(`unexpected request ${url}`);
};

const result = await recognizeOfficeRawMaterialDeliveryNote({
  operatorId: "U-OFFICE-A",
  documentDirectionHint: "supplier_return",
  supplierNameHint: "腾胜无纺布",
  onProgress(progress) {
    assert.match(progress.message, /第 \d\/2 页|识别 2 页|识别完成/u);
  },
  pages: sourceFiles.map((sourceFile, index) => ({
    fileName: sourceFile.name,
    mimeType: "image/jpeg",
    fileSize: 3 * mebibyte,
    contentDataUrl: `data:image/jpeg;base64,${index === 0 ? "b2NyLTE=" : "b2NyLTI="}`,
    sourceMimeType: "image/jpeg",
    sourceFileSize: sourceFile.size,
    sourceFile,
    captureId: "RMCAP-TEST",
  })),
}, { fetchImpl, apiBaseUrl: "http://erp.test/api", deliveryNoteJobPollIntervalMs: 0 });
assert.equal(result.inbound.id, "RMI-OCR-BINARY");
assert.equal(calls.filter((item) => item.url.includes("/attachments/binary?")).length, 2);
assert.equal(calls.filter((item) => item.url.endsWith("/raw-material-inbounds/ocr-jobs")).length, 1);
assert.equal(calls.filter((item) => item.url.endsWith("/raw-material-inbounds/ocr-jobs/RMOJ-TEST/status")).length, 1);

let oversizeFetchCount = 0;
const oversize = await recognizeOfficeRawMaterialDeliveryNote({
  operatorId: "U-OFFICE-A",
  pages: [{
    fileName: "oversize.jpg",
    mimeType: "image/jpeg",
    contentDataUrl: `data:image/jpeg;base64,${"A".repeat(23 * mebibyte)}`,
  }],
}, { fetchImpl: async () => { oversizeFetchCount += 1; return jsonResponse({}); } });
assert.equal(oversize.blocked, true);
assert.equal(oversize.error.code, "RAW_MATERIAL_DELIVERY_NOTE_REQUEST_TOO_LARGE");
assert.equal(oversizeFetchCount, 0, "oversized OCR JSON must be blocked before any upload or API request");

const rejected = await recognizeOfficeRawMaterialDeliveryNote({
  operatorId: "U-OFFICE-A",
  contentDataUrl: "data:image/jpeg;base64,b2Ny",
  fileName: "server-limit.jpg",
  mimeType: "image/jpeg",
}, {
  fetchImpl: async () => jsonResponse({ code: "REQUEST_BODY_TOO_LARGE", message: "Request body exceeds the 25165824-byte JSON limit." }, 413),
});
assert.equal(rejected.error.code, "RAW_MATERIAL_DELIVERY_NOTE_REQUEST_TOO_LARGE");
assert.doesNotMatch(rejected.error.message, /25165824|Request body/u);

const unavailableCalls = [];
const unavailable = await recognizeOfficeRawMaterialDeliveryNote({
  operatorId: "U-OFFICE-A",
  pages: [{
    fileName: "实测送货单.jpg",
    mimeType: "image/jpeg",
    contentDataUrl: "data:image/jpeg;base64,b2Ny",
    sourceFile: { name: "实测送货单.jpg", type: "image/jpeg", size: 3 },
  }],
}, {
  fetchImpl: async (url) => {
    unavailableCalls.push(url);
    if (url.includes("/attachments/binary?")) {
      return jsonResponse({
        attachmentId: "ATT-UNAVAILABLE",
        ownerType: "raw_material_inbound_capture",
        purpose: "raw_material_delivery_note",
        hasContent: true,
        status: "uploaded",
      });
    }
    if (url.endsWith("/raw-material-inbounds/ocr-jobs")) {
      return jsonResponse({
        code: "TENCENT_OCR_CREDENTIALS_REQUIRED",
        message: "腾讯云 OCR 密钥尚未配置，照片没有发送到腾讯云。请联系管理员配置后再识别。",
      }, 503);
    }
    throw new Error(`unavailable OCR must not poll or retry: ${url}`);
  },
});
assert.equal(unavailable.error.code, "TENCENT_OCR_CREDENTIALS_REQUIRED");
assert.match(unavailable.error.message, /照片没有发送到腾讯云.*联系管理员/);
assert.equal(unavailableCalls.filter((url) => url.includes("/ocr-jobs/")).length, 0, "configuration errors must not create a retry loop");

const disconnected = await recognizeOfficeRawMaterialDeliveryNote({
  operatorId: "U-OFFICE-A",
  pages: [
    { contentDataUrl: "data:image/jpeg;base64,b2NyLTE=", mimeType: "image/jpeg" },
    { contentDataUrl: "data:image/jpeg;base64,b2NyLTI=", mimeType: "image/jpeg" },
  ],
}, {
  fetchImpl: async () => { throw new TypeError("Load failed"); },
});
assert.equal(disconnected.error.code, "RAW_MATERIAL_DELIVERY_NOTE_OCR_API_UNAVAILABLE");
assert.match(disconnected.error.message, /2 页送货单.*连接中断/u);
assert.match(disconnected.error.message, /不用重拍/u);

const cancellationController = new AbortController();
const cancelledRequest = recognizeOfficeRawMaterialDeliveryNote({
  operatorId: "U-OFFICE-A",
  contentDataUrl: "data:image/jpeg;base64,b2Ny",
  fileName: "cancel.jpg",
  mimeType: "image/jpeg",
  ocrJobId: "RMOJ-CANCEL",
  signal: cancellationController.signal,
}, {
  fetchImpl: async (url, init) => {
    if (url.endsWith("/raw-material-inbounds/ocr-jobs/RMOJ-CANCEL/retry")) {
      return jsonResponse({ job: { jobId: "RMOJ-CANCEL", status: "queued", pageCount: 1 } });
    }
    if (url.endsWith("/raw-material-inbounds/ocr-jobs/RMOJ-CANCEL/status")) {
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    }
    throw new Error(`unexpected cancellation request ${url}`);
  },
});
await new Promise((resolve) => setTimeout(resolve, 0));
cancellationController.abort();
const cancelled = await cancelledRequest;
assert.equal(cancelled.cancelled, true);
assert.equal(cancelled.error.code, "REQUEST_ABORTED");

console.log("Frontend raw-material OCR API client check passed: originals use binary upload, OCR JSON stays light, cancellation stops polling, and network errors are readable Chinese.");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
