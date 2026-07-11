import assert from "node:assert/strict";
import {
  normalizeConfiguredV1ApiBaseUrl,
  resolveConfiguredOrLoopbackV1ApiBaseUrl,
  resolveLoopbackV1ApiBaseUrl,
} from "../server/services/v1ApiTargetPolicy.mjs";

const forgedRequest = {
  headers: { host: "attacker.invalid:9443", "x-forwarded-proto": "https" },
  socket: { localPort: 45123 },
};

assert.equal(resolveLoopbackV1ApiBaseUrl(forgedRequest), "http://127.0.0.1:45123/api");
assert.equal(resolveLoopbackV1ApiBaseUrl({ headers: forgedRequest.headers }), "http://127.0.0.1:8787/api");
assert.equal(
  resolveConfiguredOrLoopbackV1ApiBaseUrl({ request: forgedRequest }),
  "http://127.0.0.1:45123/api",
);
assert.equal(
  resolveConfiguredOrLoopbackV1ApiBaseUrl({
    request: forgedRequest,
    configuredApiBaseUrl: " https://erp.example.com/factory/api/ ",
  }),
  "https://erp.example.com/factory/api",
);
assert.equal(normalizeConfiguredV1ApiBaseUrl("http://127.0.0.1:8787/api/"), "http://127.0.0.1:8787/api");

for (const [value, expectedMessage] of [
  ["ftp://erp.example.com/api", /HTTP or HTTPS/],
  ["https://admin:SECRET@erp.example.com/api", /must not contain credentials/],
  ["https://erp.example.com/api?token=SECRET", /must not contain a query or fragment/],
  ["https://erp.example.com/api#SECRET", /must not contain a query or fragment/],
  ["https://erp.example.com/not-api", /path must end with \/api/],
  ["SECRET-NOT-A-URL", /absolute HTTP\(S\) URL/],
]) {
  assert.throws(() => normalizeConfiguredV1ApiBaseUrl(value), expectedMessage);
  try {
    normalizeConfiguredV1ApiBaseUrl(value);
  } catch (error) {
    assert.doesNotMatch(error.message, /admin|SECRET|token=/i);
  }
}

console.log("V1 API target policy checks passed");
