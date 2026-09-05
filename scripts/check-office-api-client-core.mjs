import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  buildOfficeApiHeaders,
  buildOfficeServerRequiredWriteError,
  DEFAULT_OFFICE_API_TIMEOUT_MS,
  isOfficeApiRequestAbort,
  readOfficeApiJson,
  requestOfficeApi,
  toOfficeApiError,
} from "../src/services/officeApiClientCore.js";
import { createLazyApiClient } from "../src/services/createLazyApiClient.js";

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
assert.ok(calls[0].init.signal instanceof AbortSignal);

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
assert.deepEqual(await readOfficeApiJson({ json: async () => Promise.reject(new Error("invalid json")) }, {}), {});
assert.deepEqual(toOfficeApiError(null, 403, "禁止"), {
  code: "HTTP_403",
  message: "禁止",
  requiredPermission: undefined,
  currentRevision: undefined,
  status: 403,
});
assert.equal(toOfficeApiError({ code: "BUSINESS_WRITE_CONFLICT", currentRevision: 7 }, 409, "冲突").currentRevision, 7);
assert.deepEqual(
  toOfficeApiError({ error: { code: "NESTED_API_ERROR", message: "嵌套错误", details: { currentRevision: 8 } } }, 409, "冲突"),
  {
    code: "NESTED_API_ERROR",
    message: "嵌套错误",
    requiredPermission: undefined,
    currentRevision: 8,
    status: 409,
    details: { currentRevision: 8 },
  },
);
assert.equal(
  toOfficeApiError({ message: "database constraint leaked" }, 500, "服务失败", {
    sanitizeMessage: () => "服务失败",
  }).message,
  "服务失败",
);
assert.deepEqual(buildOfficeServerRequiredWriteError("WRITE_UNAVAILABLE", new Error("offline"), { item: null }), {
  source: "api_error",
  blocked: true,
  item: null,
  error: {
    code: "WRITE_UNAVAILABLE",
    message: "生产模式要求后端事务，未执行本地降级：offline",
  },
});

const timeoutError = await requestOfficeApi("/timeout", {
  apiBaseUrl: "http://127.0.0.1:8787/api",
  timeoutMs: 5,
  fetchImpl: (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }),
}).then(
  () => null,
  (error) => error,
);
assert.equal(timeoutError?.code, "REQUEST_TIMEOUT");
assert.equal(isOfficeApiRequestAbort(timeoutError), true);

const abortController = new AbortController();
const abortedRequest = requestOfficeApi("/cancel", {
  apiBaseUrl: "http://127.0.0.1:8787/api",
  signal: abortController.signal,
  timeoutMs: DEFAULT_OFFICE_API_TIMEOUT_MS,
  fetchImpl: (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }),
});
abortController.abort();
const abortError = await abortedRequest.then(
  () => null,
  (error) => error,
);
assert.equal(abortError?.code, "REQUEST_ABORTED");
assert.equal(isOfficeApiRequestAbort(abortError), true);

// A real HTTP response separates headers from its delayed body. These cases
// catch premature timeout disposal without relying on fetch mocks.
const slowServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.write('{"ok":');
  const endTimer = setTimeout(() => response.end("true}"), 500);
  response.on("close", () => clearTimeout(endTimer));
});
await new Promise((resolve) => slowServer.listen(0, "127.0.0.1", resolve));
const slowBaseUrl = `http://127.0.0.1:${slowServer.address().port}`;
try {
  for (const method of ["json", "text", "blob"]) {
    const response = await requestOfficeApi("/slow", { apiBaseUrl: slowBaseUrl, timeoutMs: 100 });
    assert.equal(response.status, 200);
    assert.equal(response.url, `${slowBaseUrl}/slow`);
    await assert.rejects(
      () => method === "json" ? readOfficeApiJson(response) : response[method](),
      { code: "REQUEST_TIMEOUT" },
      `${method} must remain bounded after response headers`,
    );
  }
  const controller = new AbortController();
  const response = await requestOfficeApi("/slow", {
    apiBaseUrl: slowBaseUrl, signal: controller.signal, timeoutMs: 2000,
  });
  const cloned = response.clone();
  const reads = Promise.allSettled([response.json(), cloned.json()]);
  controller.abort();
  for (const result of await reads) {
    assert.equal(result.status, "rejected");
    assert.equal(result.reason.code, "REQUEST_ABORTED", "both clone branches observe cancellation after headers");
  }
  const streamController = new AbortController();
  const streamResponse = await requestOfficeApi("/slow", {
    apiBaseUrl: slowBaseUrl, signal: streamController.signal, timeoutMs: 0,
  });
  const reader = streamResponse.body.getReader();
  assert.equal((await reader.read()).done, false);
  streamController.abort();
  await assert.rejects(() => reader.read(), { code: "REQUEST_ABORTED" });
  const unbounded = await requestOfficeApi("/slow", { apiBaseUrl: slowBaseUrl, timeoutMs: 0 });
  assert.deepEqual(await unbounded.json(), { ok: true }, "explicitly disabled timeout still permits body completion");
} finally {
  slowServer.closeAllConnections();
  await new Promise((resolve, reject) => slowServer.close((error) => error ? reject(error) : resolve()));
}

let lazyLoadCount = 0;
const lazyApiCall = createLazyApiClient(async () => {
  lazyLoadCount += 1;
  return {
    first: async (value) => `first:${value}`,
    second: async (left, right) => left + right,
  };
});
const lazyFirst = lazyApiCall("first");
const lazySecond = lazyApiCall("second");
assert.equal(await lazyFirst("ok"), "first:ok");
assert.equal(await lazySecond(2, 3), 5);
assert.equal(await lazyFirst("again"), "first:again");
assert.equal(lazyLoadCount, 1);
await assert.rejects(() => lazyApiCall("missing")(), /Lazy API export is not callable: missing/);

console.log("office API client core checks passed");
