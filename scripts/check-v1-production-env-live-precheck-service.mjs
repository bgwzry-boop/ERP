import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { precheckV1ProductionEnv } from "../server/services/v1ProductionEnvLivePrecheckService.mjs";

const checkedAt = "2026-07-13T12:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const env = { ERP_RUNTIME_MODE: "production", MARKER: "server-owned" };
let receivedInput;

const readyResult = precheckV1ProductionEnv({
  operatorId,
  env,
  now: () => new Date(checkedAt),
  buildPreflight(input) {
    receivedInput = input;
    return buildPreflightFixture({ ready: true });
  },
});

assert.deepEqual(receivedInput, { env, envFiles: [] });
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.operatorId, operatorId);
assert.equal(readyResult.body.summary.readinessLabel, "2/2");
assert.equal(readyResult.body.summary.envFileCount, 0);
assert.equal(readyResult.body.blockingChecks.length, 0);
assert.equal(readyResult.body.warningChecks.length, 0);
assert.equal(readyResult.body.safeguards.nonMutating, true);
assert.equal(readyResult.body.safeguards.requestBodyIgnored, true);
assert.equal(readyResult.body.safeguards.envFilePathAccepted, false);
assert.equal(readyResult.body.safeguards.envFileReadByRequest, false);
assert.equal(readyResult.body.safeguards.releaseCandidateRefreshed, false);
assert.equal(readyResult.body.safeguards.goLiveSuiteRefreshed, false);

const blockedResult = precheckV1ProductionEnv({
  operatorId,
  env,
  now: () => new Date(checkedAt),
  buildPreflight: () => buildPreflightFixture({ ready: false }),
});

assert.equal(blockedResult.httpStatus, 200);
assert.equal(blockedResult.body.status, "blocked");
assert.equal(blockedResult.body.ready, false);
assert.equal(blockedResult.body.summary.blockerCount, 1);
assert.equal(blockedResult.body.summary.warningCheckCount, 1);
assert.deepEqual(blockedResult.body.blockingChecks.map((item) => item.key), ["database"]);
assert.deepEqual(blockedResult.body.warningChecks.map((item) => item.key), ["monitoring"]);

const sensitiveError = ["postgres://owner:secret@db.internal/prod", "/Users/private/prod.env"].join(" ");
const errorResult = precheckV1ProductionEnv({
  operatorId,
  env,
  now: () => new Date(checkedAt),
  buildPreflight() {
    throw new Error(sensitiveError);
  },
});

assert.equal(errorResult.httpStatus, 500);
assert.equal(errorResult.body.status, "error");
assert.equal(errorResult.body.error.code, "V1_PRODUCTION_ENV_LIVE_PRECHECK_FAILED");
assert.equal(JSON.stringify(errorResult).includes("postgres://"), false);
assert.equal(JSON.stringify(errorResult).includes("/Users/private"), false);
assert.equal(errorResult.body.safeguards.environmentValuesIncluded, false);
assert.equal(errorResult.body.safeguards.secretValuesIncluded, false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(
  new URL("../server/services/v1ProductionEnvLivePrecheckService.mjs", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /function precheckSystemV1ProductionEnv/);
assert.match(routeSource, /precheckProductionEnv:[\s\S]*precheckV1ProductionEnv\(\{ operatorId \}\)/);
assert.doesNotMatch(routeSource, /buildProductionEnvPreflight|sanitizeV1ProductionEnvGate|process\.env/);
assert.doesNotMatch(apiSource, /code: "V1_PRODUCTION_ENV_LIVE_PRECHECK_FAILED"/);
assert.match(serviceSource, /envFiles: \[\]/);
assert.doesNotMatch(
  serviceSource,
  /getConfiguredV1ProductionEnv|buildProductionEnvFileAuditReport|parseEnvFile|readFileSync|writeFileSync/,
);

console.log(
  "V1 production-env live-precheck service checks passed: ready/blocked projection, server-owned env, redaction, safeguards, and thin API composition are covered.",
);

function buildPreflightFixture({ ready }) {
  const checks = ready
    ? [
        buildCheck("database", "blocking", true),
        buildCheck("monitoring", "warning", true),
      ]
    : [
        buildCheck("database", "blocking", false),
        buildCheck("monitoring", "warning", false),
      ];
  return {
    status: ready ? "passed" : "blocked",
    ready,
    checkedAt,
    summary: {
      passedCount: ready ? 2 : 0,
      totalCount: 2,
      blockingCount: ready ? 0 : 1,
      warningCount: ready ? 0 : 1,
      placeholderValueCount: 0,
    },
    fixChecklist: checks,
    nextActions: ready ? [] : ["配置生产数据库。"],
  };
}

function buildCheck(key, severity, ready) {
  return {
    key,
    label: key,
    severity,
    status: ready ? "passed" : "blocked",
    ready,
    detail: ready ? "已通过" : "未通过",
    nextAction: ready ? "" : "补齐配置。",
    requiredVariables: [],
    missingVariables: [],
  };
}
