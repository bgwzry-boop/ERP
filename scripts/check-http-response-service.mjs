import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildApiSecurityPolicy } from "../server/apiSecurityPolicy.mjs";
import { createHttpResponseService } from "../server/services/httpResponseService.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createHttpResponseService\(\)/);
assert.match(registrySource, /const \{[\s\S]*sendBusinessError,[\s\S]*sendNotFound[\s\S]*\} = httpResponseService;/);
assert.doesNotMatch(apiSource, /getCorsAllowedRequestHeaders/);
for (const functionName of [
  "buildCorsHeaders",
  "createResponseBuffer",
  "sendBusinessError",
  "sendFile",
  "sendInlineFile",
  "sendJson",
  "sendNotFound",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${functionName}\\(`));
}
assert.match(apiSource, /isCorsRequestAllowed\(securityPolicy, response\.erpRequestOrigin\)/);

function createResponse({ policy, origin } = {}) {
  const state = { statusCode: null, headers: null, body: null };
  return {
    erpSecurityPolicy: policy,
    erpRequestOrigin: origin,
    state,
    writeHead(statusCode, headers) {
      state.statusCode = statusCode;
      state.headers = headers;
    },
    end(body) {
      state.body = body;
    },
  };
}

function parseJsonBody(response) {
  return JSON.parse(String(response.state.body));
}

const service = createHttpResponseService();
assert.equal(Object.isFrozen(service), true);
for (const method of Object.values(service)) assert.equal(typeof method, "function");

const localPolicy = buildApiSecurityPolicy({}, {});
const strictPolicy = buildApiSecurityPolicy(
  {
    strictAuth: true,
    authSecret: "response-service-test-secret",
    corsAllowedOrigins: "https://erp.example.test",
  },
  {},
);

const localResponse = createResponse({ policy: localPolicy });
service.sendJson(localResponse, 200, { ok: true });
assert.equal(localResponse.state.statusCode, 200);
assert.equal(localResponse.state.headers["content-type"], "application/json; charset=utf-8");
assert.equal(localResponse.state.headers["access-control-allow-origin"], "*");
assert.equal(
  localResponse.state.headers["access-control-allow-headers"],
  "content-type, authorization, idempotency-key, x-erp-user-id, x-erp-action-permissions",
);
assert.equal(String(localResponse.state.body), '{\n  "ok": true\n}');

const noContentResponse = createResponse({ policy: localPolicy });
service.sendJson(noContentResponse, 204, { ignored: true });
assert.equal(noContentResponse.state.body, "");

const strictAllowedResponse = createResponse({
  policy: strictPolicy,
  origin: "https://erp.example.test",
});
service.sendJson(strictAllowedResponse, 200, { ok: true });
assert.equal(strictAllowedResponse.state.headers["access-control-allow-origin"], "https://erp.example.test");
assert.equal(strictAllowedResponse.state.headers.vary, "Origin");
assert.equal(
  strictAllowedResponse.state.headers["access-control-allow-headers"],
  "content-type, authorization, idempotency-key",
);

for (const origin of [undefined, "https://untrusted.example.test"]) {
  const strictDeniedResponse = createResponse({ policy: strictPolicy, origin });
  service.sendJson(strictDeniedResponse, 200, { ok: true });
  assert.equal(strictDeniedResponse.state.headers["access-control-allow-origin"], undefined);
  assert.equal(strictDeniedResponse.state.headers.vary, undefined);
}

const utf8Download = createResponse({ policy: localPolicy });
service.sendFile(utf8Download, 200, "ERP下载", {
  contentType: "text/plain; charset=utf-8",
  fileName: "对账单.txt",
});
assert.equal(utf8Download.state.headers["content-length"], Buffer.byteLength("ERP下载"));
assert.equal(utf8Download.state.headers["content-type"], "text/plain; charset=utf-8");
assert.equal(
  utf8Download.state.headers["content-disposition"],
  `attachment; filename*=UTF-8''${encodeURIComponent("对账单.txt")}`,
);
assert.equal(
  utf8Download.state.headers["access-control-expose-headers"],
  "content-disposition, content-type",
);
assert.equal(Buffer.isBuffer(utf8Download.state.body), true);

const binaryCases = [
  [Buffer.from("binary"), "binary"],
  [new Uint8Array([65, 66, 67]), "ABC"],
  [new Uint8Array([68, 69, 70]).buffer, "DEF"],
  [Buffer.from("base64-body").toString("base64"), "base64-body", "base64"],
];
for (const [body, expected, contentEncoding] of binaryCases) {
  const response = createResponse({ policy: localPolicy });
  service.sendFile(response, 200, body, { contentEncoding });
  assert.equal(response.state.body.toString("utf8"), expected);
}

const inlineResponse = createResponse({ policy: localPolicy });
service.sendInlineFile(inlineResponse, 206, new Uint8Array([80, 68, 70]), { contentType: "application/pdf" });
assert.equal(inlineResponse.state.statusCode, 206);
assert.equal(inlineResponse.state.headers["content-disposition"], "inline; filename*=UTF-8''attachment.bin");
assert.equal(inlineResponse.state.body.toString("utf8"), "PDF");

const notFoundResponse = createResponse({ policy: localPolicy });
service.sendNotFound(notFoundResponse, "ORDER_NOT_FOUND");
assert.equal(notFoundResponse.state.statusCode, 404);
assert.deepEqual(parseJsonBody(notFoundResponse), {
  code: "ORDER_NOT_FOUND",
  message: "The requested route or record does not exist.",
});

const businessErrorResponse = createResponse({ policy: localPolicy });
service.sendBusinessError(businessErrorResponse, 409, "AUTHORITATIVE_CODE", "Authoritative message.", {
  code: "FORGED_CODE",
  message: "Forged message.",
  field: "quantity",
});
assert.deepEqual(parseJsonBody(businessErrorResponse), {
  field: "quantity",
  code: "AUTHORITATIVE_CODE",
  message: "Authoritative message.",
});
for (const details of [null, "invalid", ["invalid"]]) {
  const response = createResponse({ policy: localPolicy });
  service.sendBusinessError(response, 400, "INVALID_REQUEST", "Invalid request.", details);
  assert.deepEqual(parseJsonBody(response), {
    code: "INVALID_REQUEST",
    message: "Invalid request.",
  });
}

console.log(
  "HTTP response service checks passed: CORS, JSON, downloads, inline files, authoritative errors, and generic not-found responses are locked",
);
