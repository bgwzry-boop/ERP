import assert from "node:assert/strict";
import { createOfficeV1GoLiveStatusActions } from "../src/services/officeV1GoLiveStatusActions.js";

const identityNormalizers = new Proxy({}, {
  get() {
    return (value) => value;
  },
});
const actions = createOfficeV1GoLiveStatusActions(identityNormalizers);

const requests = [];
const fetchImpl = async (url, init) => {
  requests.push({ url, init });
  return response({ ready: false, marker: "normalized" });
};

const statusResult = await actions.getOfficeV1GoLiveStatus(
  { operatorId: "U-TECH-A" },
  { apiBaseUrl: "http://127.0.0.1:9999/api", fetchImpl },
);
assert.equal(statusResult.source, "api");
assert.equal(statusResult.statusData.marker, "normalized");
assert.equal(requests[0].url, "http://127.0.0.1:9999/api/system/v1-go-live-status");
assert.equal(requests[0].init.method, "GET");

const stageResult = await actions.stageOfficeV1FieldEvidenceIntakeRow(
  { operatorId: "U-TECH-A", row: { rowType: "evidence", itemKey: "sample" } },
  { apiBaseUrl: "http://127.0.0.1:9999/api", fetchImpl },
);
assert.equal(stageResult.blocked, false);
assert.deepEqual(JSON.parse(requests[1].init.body), { rowType: "evidence", itemKey: "sample" });
assert.match(requests[1].init.headers["idempotency-key"], /^erp-/);

const setupResult = await actions.runOfficeV1ProductionEnvSetup(
  { operatorId: "U-TECH-A" },
  { apiBaseUrl: "http://127.0.0.1:9999/api", fetchImpl },
);
assert.equal(setupResult.blocked, true, "a successful HTTP response must not convert a blocked readiness result into success");

const deniedResult = await actions.precheckOfficeV1ProductionEnv(
  { operatorId: "U-OFFICE-A" },
  {
    apiBaseUrl: "http://127.0.0.1:9999/api",
    fetchImpl: async () => response({ error: { code: "FORBIDDEN", message: "无权限", requiredPermission: "system.v1_precheck" } }, 403),
  },
);
assert.equal(deniedResult.source, "api_error");
assert.equal(deniedResult.blocked, true);
assert.equal(deniedResult.error.requiredPermission, "system.v1_precheck");

const offlineResult = await actions.precheckOfficeV1DriverReadiness(
  { operatorId: "U-TECH-A" },
  {
    apiBaseUrl: "http://127.0.0.1:9999/api",
    fetchImpl: async () => { throw new Error("offline"); },
  },
);
assert.equal(offlineResult.source, "local_fallback");
assert.equal(offlineResult.blocked, true);
assert.equal(offlineResult.precheckResult, null);
assert.equal(offlineResult.error.code, "V1_DRIVER_READINESS_LIVE_PRECHECK_API_UNAVAILABLE");

assert.throws(() => createOfficeV1GoLiveStatusActions({}), /Missing V1 normalizer/);

console.log("V1 status action checks passed: HTTP contracts, idempotency, denial, readiness blocking, and offline fail-closed behavior are centralized.");

function response(json, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return json;
    },
  };
}
