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
    assert.equal(init.body, sourceFiles[pageNumber - 1], "the original File must be uploaded as binary content");
    assert.equal(init.headers["content-type"], "image/jpeg");
    return jsonResponse({
      attachmentId: `ATT-SOURCE-${pageNumber}`,
      ownerType: "raw_material_inbound_capture",
      purpose: "raw_material_delivery_note",
      hasContent: true,
      status: "uploaded",
    });
  }
  const body = JSON.parse(init.body);
  assert.equal("contentDataUrl" in body, false, "the first page must not be duplicated at the request top level");
  assert.equal(body.pages.length, 2);
  assert.deepEqual(body.pages.map((page) => page.sourceAttachmentId), ["ATT-SOURCE-1", "ATT-SOURCE-2"]);
  assert.equal(body.pages.every((page) => page.sourceContentDataUrl === ""), true, "original images must not be repeated inside OCR JSON");
  return jsonResponse({
    inbound: { id: "RMI-OCR-BINARY", status: "已识别待复核", sourceAttachmentIds: ["ATT-SOURCE-1", "ATT-SOURCE-2"] },
    attachmentIds: ["ATT-SOURCE-1", "ATT-SOURCE-2"],
  });
};

const result = await recognizeOfficeRawMaterialDeliveryNote({
  operatorId: "U-OFFICE-A",
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
}, { fetchImpl, apiBaseUrl: "http://erp.test/api" });
assert.equal(result.inbound.id, "RMI-OCR-BINARY");
assert.equal(calls.filter((item) => item.url.includes("/attachments/binary?")).length, 2);
assert.equal(calls.filter((item) => item.url.endsWith("/raw-material-inbounds/recognize-delivery-note")).length, 1);

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

console.log("Frontend raw-material OCR API client check passed: originals use binary upload, OCR JSON stays light, and 413 errors are readable Chinese.");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
