import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCommandResultHttpAdapterService } from "../server/services/commandResultHttpAdapterService.mjs";

const calls = [];
const service = createCommandResultHttpAdapterService({
  sendBusinessError(response, statusCode, code, message, details) {
    calls.push({ type: "error", response, statusCode, code, message, details });
    return "error-sent";
  },
  sendJson(response, statusCode, payload) {
    calls.push({ type: "json", response, statusCode, payload });
    return "json-sent";
  },
  sendNotFound(response, code) {
    calls.push({ type: "not-found", response, code });
    return "not-found-sent";
  },
});

assert.equal(Object.isFrozen(service), true);
assert.deepEqual(Object.keys(service), ["sendCommandRecord", "sendCommandResponse"]);

const response = { id: "RES-1" };
assert.equal(service.sendCommandResponse(response, { response: { ok: true }, statusCode: 201 }), "json-sent");
assert.deepEqual(calls.pop(), { type: "json", response, statusCode: 200, payload: { ok: true } });

assert.equal(
  service.sendCommandResponse(response, { response: { created: true }, statusCode: 201 }, { useResultStatusCode: true }),
  "json-sent",
);
assert.deepEqual(calls.pop(), { type: "json", response, statusCode: 201, payload: { created: true } });

const record = { printJobId: "PJ-1", status: "printed" };
assert.equal(service.sendCommandRecord(response, record, { statusCode: 202 }), "json-sent");
assert.deepEqual(calls.pop(), { type: "json", response, statusCode: 202, payload: record });

assert.equal(
  service.sendCommandResponse(response, { notFound: true, code: "ORDER_NOT_FOUND" }, { notFoundCode: "FALLBACK" }),
  "not-found-sent",
);
assert.deepEqual(calls.pop(), { type: "not-found", response, code: "ORDER_NOT_FOUND" });

assert.equal(
  service.sendCommandRecord(response, { notFound: true }, { notFoundCode: "PRINT_JOB_NOT_FOUND" }),
  "not-found-sent",
);
assert.deepEqual(calls.pop(), { type: "not-found", response, code: "PRINT_JOB_NOT_FOUND" });

const blocked = {
  error: true,
  statusCode: 409,
  code: "REVISION_CONFLICT",
  message: "Revision conflict.",
  details: { currentRevision: 3 },
};
assert.equal(service.sendCommandResponse(response, blocked), "error-sent");
assert.deepEqual(calls.pop(), {
  type: "error",
  response,
  statusCode: 409,
  code: "REVISION_CONFLICT",
  message: "Revision conflict.",
  details: undefined,
});

assert.equal(service.sendCommandResponse(response, blocked, { includeErrorDetails: true }), "error-sent");
assert.deepEqual(calls.pop()?.details, { currentRevision: 3 });

for (const invalid of [null, undefined, [], "invalid"]) {
  assert.throws(() => service.sendCommandResponse(response, invalid), /command result must be an object/);
}
for (const missing of ["sendBusinessError", "sendJson", "sendNotFound"]) {
  const dependencies = {
    sendBusinessError() {},
    sendJson() {},
    sendNotFound() {},
  };
  delete dependencies[missing];
  assert.throws(() => createCommandResultHttpAdapterService(dependencies), new RegExp(`${missing} must be a function`));
}

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(
  new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url),
  "utf8",
);
assert.doesNotMatch(apiSource, /createCommandResultHttpAdapterService/);
assert.match(apiSource, /apiSharedServiceRegistry/);
assert.match(registrySource, /createCommandResultHttpAdapterService/);
assert.match(apiSource, /sendCommandRecord/);
assert.match(apiSource, /sendCommandResponse/);

console.log("Command-result HTTP adapter checks passed: response/raw payloads, status, errors, details, not-found fallback, and dependencies are covered.");
