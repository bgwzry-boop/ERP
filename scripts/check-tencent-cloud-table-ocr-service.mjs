import assert from "node:assert/strict";
import {
  createTencentCloudTableOcrService,
  normalizeTencentOcrImage,
  TENCENT_TABLE_OCR_ACTION,
  TENCENT_TABLE_OCR_VERSION,
} from "../server/services/tencentCloudTableOcrService.mjs";

const requests = [];
const service = createTencentCloudTableOcrService({
  env: {
    ERP_TENCENT_OCR_SECRET_ID: "AKID-CHECK-ONLY",
    ERP_TENCENT_OCR_SECRET_KEY: "SECRET-CHECK-ONLY",
    ERP_TENCENT_OCR_REGION: "ap-guangzhou",
  },
  now: () => new Date("2026-07-16T08:00:00.000Z"),
  async fetchImpl(url, options) {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          Response: {
            RequestId: "ocr-request-1",
            Angle: 0,
            TableDetections: [{
              Type: 1,
              Cells: [{ ColTl: 0, RowTl: 0, ColBr: 0, RowBr: 0, Text: "品名", Confidence: 99.8 }],
              Data: "must-not-be-projected",
            }],
          },
        };
      },
    };
  },
});

assert.equal(service.getReadiness().configured, true);
const result = await service.recognizeTable({
  contentDataUrl: "data:image/png;base64,c2hpcHBpbmctbm90ZQ==",
  mimeType: "image/png",
});
assert.equal(result.requestId, "ocr-request-1");
assert.equal(result.action, TENCENT_TABLE_OCR_ACTION);
assert.equal(result.tables[0].cells[0].text, "品名");
assert.equal("data" in result.tables[0], false, "Tencent Excel/base64 output must not be projected into ERP state");
assert.equal(requests.length, 1);
assert.equal(requests[0].options.headers["X-TC-Action"], TENCENT_TABLE_OCR_ACTION);
assert.equal(requests[0].options.headers["X-TC-Version"], TENCENT_TABLE_OCR_VERSION);
assert.equal(requests[0].options.headers["X-TC-Region"], "ap-guangzhou");
assert.match(requests[0].options.headers.Authorization, /Credential=AKID-CHECK-ONLY\//);
assert.doesNotMatch(requests[0].options.headers.Authorization, /SECRET-CHECK-ONLY/);
assert.equal(JSON.parse(requests[0].options.body).ImageBase64, "c2hpcHBpbmctbm90ZQ==");

const missingCredentials = createTencentCloudTableOcrService({ env: {}, fetchImpl: async () => assert.fail("must not call fetch") });
await assert.rejects(
  () => missingCredentials.recognizeTable({ contentDataUrl: "data:image/png;base64,YQ==", mimeType: "image/png" }),
  (error) => error.code === "TENCENT_OCR_CREDENTIALS_REQUIRED" && error.statusCode === 503,
);

assert.throws(
  () => normalizeTencentOcrImage({ contentDataUrl: "data:text/plain;base64,YQ==", mimeType: "text/plain" }),
  (error) => error.code === "TENCENT_OCR_FILE_TYPE_NOT_SUPPORTED",
);
assert.throws(
  () => normalizeTencentOcrImage({ contentDataUrl: "data:image/png;base64,%%%", mimeType: "image/png" }),
  (error) => error.code === "TENCENT_OCR_IMAGE_INVALID",
);

const failedService = createTencentCloudTableOcrService({
  env: { ERP_TENCENT_OCR_SECRET_ID: "ID", ERP_TENCENT_OCR_SECRET_KEY: "KEY" },
  async fetchImpl() {
    return {
      ok: false,
      status: 401,
      async json() {
        return { Response: { Error: { Code: "AuthFailure.SignatureFailure", Message: "sensitive cloud detail" }, RequestId: "req-safe" } };
      },
    };
  },
});
await assert.rejects(
  () => failedService.recognizeTable({ contentDataUrl: "data:image/png;base64,YQ==", mimeType: "image/png" }),
  (error) => {
    assert.equal(error.code, "TENCENT_OCR_REQUEST_FAILED");
    assert.equal(error.statusCode, 503);
    assert.equal(error.details.cloudCode, "AuthFailure.SignatureFailure");
    assert.equal(error.details.requestId, "req-safe");
    assert.doesNotMatch(error.message, /sensitive cloud detail/);
    return true;
  },
);

console.log("Tencent Cloud table OCR checks passed: TC3 signing, V3 request projection, input limits, readiness, and sanitized cloud failures are covered.");
