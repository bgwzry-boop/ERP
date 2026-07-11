import assert from "node:assert/strict";
import {
  buildCurrentV1RuntimeReadinessReport,
  precheckV1RuntimeReadiness,
  resolveCurrentV1RuntimeApiBaseUrl,
} from "../server/services/v1RuntimeLivePrecheckService.mjs";

const fixedDate = new Date("2026-07-12T15:00:00.000Z");
const request = {
  headers: {
    host: "attacker.invalid:9443",
    "x-forwarded-proto": "https",
    authorization: "Bearer erp-runtime-session-v1.OPERATOR-SECRET",
  },
  socket: { localPort: 43123 },
};

assert.equal(resolveCurrentV1RuntimeApiBaseUrl(request), "http://127.0.0.1:43123/api");
assert.equal(resolveCurrentV1RuntimeApiBaseUrl({ headers: { host: "attacker.invalid" } }), "http://127.0.0.1:8787/api");

const calls = { authInputs: [], sourceArgs: null, reportArgs: null, healthUrl: "" };
const dependencies = {
  env: {
    ERP_V1_READINESS_TOKEN: "ENV-OPERATOR-SECRET",
    ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-V1-DRIVER",
    ERP_V1_READINESS_DRIVER_TOKEN: "DRIVER-SECRET",
  },
  now: () => fixedDate,
  async fetchImpl(url) {
    calls.healthUrl = url;
    return { ok: true, status: 200, json: async () => ({ seed: { runtimeConfig: { mode: "production" } } }) };
  },
  buildAuthInput(input) {
    calls.authInputs.push(input);
    return { role: input.role, ...input.overrides };
  },
  async authenticateRole({ authInput }) {
    return {
      source: "runtime_token",
      operatorId: authInput.role === "driver" ? "U-V1-DRIVER" : authInput.operatorId,
      headers: { authorization: `Bearer ${authInput.role}-AUTH-SECRET` },
      formalRuntimeSession: true,
      legacyIdentityHeaderUsed: false,
      production: true,
    };
  },
  async readSources(args) {
    calls.sourceArgs = args;
    return { permissions: { rawPermission: "PERMISSION-SECRET" } };
  },
  buildReport(args) {
    calls.reportArgs = args;
    return buildReport({ ready: false, driverOperatorId: args.driverOperatorId });
  },
};

const report = await buildCurrentV1RuntimeReadinessReport({
  request,
  operatorId: "U-V1-MANAGEMENT",
  ...dependencies,
});
assert.equal(calls.healthUrl, "http://127.0.0.1:43123/api/health");
assert.equal(calls.authInputs[0].overrides.bearerToken, "erp-runtime-session-v1.OPERATOR-SECRET");
assert.equal(calls.authInputs[1].role, "driver");
assert.equal(calls.sourceArgs.apiBaseUrl, "http://127.0.0.1:43123/api");
assert.equal(calls.reportArgs.responses.authentication.operator.formalRuntimeSession, true);
assert.equal(calls.reportArgs.responses.authentication.driver.operatorId, "U-V1-DRIVER");
assert.equal(report.driverOperatorId, "U-V1-DRIVER");

const blocked = await precheckV1RuntimeReadiness({
  request,
  operatorId: "U-V1-MANAGEMENT",
  ...dependencies,
});
assert.equal(blocked.httpStatus, 200);
assert.equal(blocked.body.status, "blocked");
assert.equal(blocked.body.summary.readinessLabel, "10/11");
assert.equal(blocked.body.driverOperatorId, "U-V1-DRIVER");
assert.equal(blocked.body.safeguards.requestHostAccepted, false);
assert.equal(blocked.body.safeguards.forwardedProtocolAccepted, false);
assert.equal(blocked.body.safeguards.loopbackTargetOnly, true);
assert.doesNotMatch(JSON.stringify(blocked), /attacker\.invalid|OPERATOR-SECRET|DRIVER-SECRET|PERMISSION-SECRET/);

const ready = await precheckV1RuntimeReadiness({
  request,
  operatorId: "U-V1-MANAGEMENT",
  ...dependencies,
  buildReport: (args) => buildReport({ ready: true, driverOperatorId: args.driverOperatorId }),
});
assert.equal(ready.body.status, "ready");
assert.equal(ready.body.summary.readinessLabel, "11/11");

const error = await precheckV1RuntimeReadiness({
  request,
  operatorId: "U-V1-MANAGEMENT",
  now: () => fixedDate,
  async fetchImpl() {
    throw new Error("https://attacker.invalid SECRET-RUNTIME-TOKEN");
  },
});
assert.equal(error.httpStatus, 500);
assert.equal(error.body.error.code, "V1_RUNTIME_READINESS_LIVE_PRECHECK_FAILED");
assert.equal(error.body.safeguards.loopbackTargetOnly, true);
assert.doesNotMatch(JSON.stringify(error), /attacker\.invalid|SECRET-RUNTIME-TOKEN/);

console.log("V1 runtime live-precheck service checks passed");

function buildReport({ ready, driverOperatorId }) {
  const criteria = Array.from({ length: 11 }, (_, index) => ({
    key: `runtime-${index + 1}`,
    label: `运行时门禁 ${index + 1}`,
    status: ready || index < 10 ? "passed" : "pending",
    blocking: true,
    detail: ready || index < 10 ? "通过" : "缺现场条件",
  }));
  return {
    ready,
    driverOperatorId,
    checkedAt: fixedDate.toISOString(),
    summary: { passedCount: ready ? 11 : 10, totalCount: 11, blockingCount: ready ? 0 : 1 },
    criteria,
    nextActions: ready ? [] : ["补齐当前运行时门禁"],
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      secretFieldsExposed: false,
      payloadExposed: false,
    },
    rawSources: { token: "RAW-SOURCE-SECRET" },
  };
}
