import assert from "node:assert/strict";
import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import { createOfficePrintBatchRecord } from "../src/services/officePrintBatchApiClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const printBatchRecord = {
  printBatchId: "PB-FRONT-CHECK-1",
  todoIds: ["T-PRINT-A"],
  status: "printed",
};
const calls = [];
const apiResult = await createOfficePrintBatchRecord(
  { authState, operatorId: "U-OFFICE-A", printBatchRecord },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, {
        printBatchRecord,
        operationLogId: "LOG-PB-FRONT-CHECK-1",
      });
    },
  },
);
assert.equal(apiResult.source, "api");
assert.equal(calls[0].url, "http://127.0.0.1:8787/api/print-batches");
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.headers["x-erp-user-id"], "U-OFFICE-A");
assert.equal(JSON.parse(calls[0].init.body).operatorId, "U-OFFICE-A");

const strictResult = await createOfficePrintBatchRecord(
  { authState, operatorId: "U-OFFICE-A", printBatchRecord },
  { serverRequired: true, fetchImpl: async () => Promise.reject(new Error("offline")) },
);
assert.equal(strictResult.source, "api_error");
assert.equal(strictResult.blocked, true);
assert.equal(strictResult.error.code, "PRINT_BATCH_API_UNAVAILABLE");

console.log("frontend print-batch API client check passed");

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
