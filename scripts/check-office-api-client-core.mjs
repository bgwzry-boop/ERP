import assert from "node:assert/strict";
import {
  buildOfficeApiHeaders,
  buildOfficeServerRequiredWriteError,
  readOfficeApiJson,
  requestOfficeApi,
  toOfficeApiError,
} from "../src/services/officeApiClientCore.js";

const bearerHeaders = buildOfficeApiHeaders(
  { session: { accessToken: "session-core-check" } },
  "U-OFFICE-A",
  { "x-request-id": "REQ-CORE-1" },
);
assert.equal(bearerHeaders.authorization, "Bearer session-core-check");
assert.equal(bearerHeaders["x-erp-user-id"], undefined);
assert.equal(bearerHeaders["x-request-id"], "REQ-CORE-1");

const operatorHeaders = buildOfficeApiHeaders(null, "U-WAREHOUSE-A");
assert.equal(operatorHeaders["x-erp-user-id"], "U-WAREHOUSE-A");
const productionOperatorHeaders = buildOfficeApiHeaders(null, "U-WAREHOUSE-A", {}, { runtimeMode: "production" });
assert.equal(productionOperatorHeaders["x-erp-user-id"], undefined);

const calls = [];
await requestOfficeApi("/inventory/items", {
  apiBaseUrl: "http://127.0.0.1:8787/api/",
  authState: { session: { accessToken: "session-core-check" } },
  idempotencyKey: "idem-client-core-001",
  method: "POST",
  body: { remark: "O'Reilly" },
  fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  },
});
assert.equal(calls[0].url, "http://127.0.0.1:8787/api/inventory/items");
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.headers.authorization, "Bearer session-core-check");
assert.equal(calls[0].init.headers["idempotency-key"], "idem-client-core-001");
assert.equal(calls[0].init.body, JSON.stringify({ remark: "O'Reilly" }));

await requestOfficeApi("/health", {
  apiBaseUrl: "http://127.0.0.1:8787/api",
  fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  },
});
assert.equal("body" in calls[1].init, false);
assert.equal(calls[1].init.headers["idempotency-key"], undefined);

assert.deepEqual(await readOfficeApiJson({ json: async () => ({ ok: true }) }), { ok: true });
assert.equal(await readOfficeApiJson({ json: async () => Promise.reject(new Error("invalid json")) }), null);
assert.deepEqual(toOfficeApiError(null, 403, "禁止"), {
  code: "HTTP_403",
  message: "禁止",
  requiredPermission: undefined,
  currentRevision: undefined,
  status: 403,
});
assert.equal(toOfficeApiError({ code: "BUSINESS_WRITE_CONFLICT", currentRevision: 7 }, 409, "冲突").currentRevision, 7);
assert.deepEqual(buildOfficeServerRequiredWriteError("WRITE_UNAVAILABLE", new Error("offline"), { item: null }), {
  source: "api_error",
  blocked: true,
  item: null,
  error: {
    code: "WRITE_UNAVAILABLE",
    message: "生产模式要求后端事务，未执行本地降级：offline",
  },
});

console.log("office API client core checks passed");
