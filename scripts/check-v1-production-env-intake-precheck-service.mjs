import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  precheckV1ProductionEnvIntake,
  resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck,
  V1_PRODUCTION_ENV_INTAKE_CSV_PATH,
} from "../server/services/v1ProductionEnvIntakePrecheckService.mjs";

const checkedAt = "2026-07-13T16:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const setupPath = "/private/erp/setup/latest.json";
const envPath = "/private/erp/production.env";

const missingResolution = resolveFixture({ files: {} });
assert.equal(missingResolution.status, "not_configured");
assert.equal(missingResolution.ready, false);
assert.equal(missingResolution.blockingItems[0].key, "production-env-setup-latest-missing");

const malformedResolution = resolveFixture({ files: { [setupPath]: "not-json" } });
assert.equal(malformedResolution.status, "blocked");
assert.equal(malformedResolution.blockingItems[0].key, "production-env-setup-latest-unreadable");

const unsafeResolution = resolveFixture({
  files: {
    [setupPath]: JSON.stringify({
      scope: "wrong_scope",
      setupReady: false,
      envFile: { path: envPath, gitIgnored: false, gitTracked: true, fileMode: "644" },
    }),
  },
});
assert.equal(unsafeResolution.ready, false);
assert.deepEqual(
  unsafeResolution.blockingItems.map((item) => item.key),
  [
    "production-env-setup-latest-shape",
    "production-env-setup-not-ready",
    "production-env-setup-env-file-git-safety",
    "production-env-setup-env-file-mode",
    "production-env-setup-env-file-not-found",
  ],
);

const safeFiles = {
  [setupPath]: JSON.stringify({
    scope: "v1_production_env_setup",
    setupReady: true,
    envFile: { path: envPath, gitIgnored: true, gitTracked: false, fileMode: "600" },
  }),
  [envPath]: "ERP_RUNTIME_MODE=production\n",
};
const safeResolution = resolveFixture({ files: safeFiles });
assert.equal(safeResolution.ready, true);
assert.deepEqual(safeResolution.envFiles, [envPath]);

let verificationCalled = false;
const notConfiguredResult = precheckV1ProductionEnvIntake({
  operatorId,
  now: () => new Date(checkedAt),
  resolveSetup: () => missingResolution,
  buildVerification() {
    verificationCalled = true;
  },
});
assert.equal(verificationCalled, false);
assert.equal(notConfiguredResult.body.status, "not_configured");
assert.equal(notConfiguredResult.body.summary.envFilePathExposed, false);

let verificationInput;
const readyResult = precheckV1ProductionEnvIntake({
  operatorId,
  now: () => new Date(checkedAt),
  resolveSetup: () => safeResolution,
  buildVerification(input) {
    verificationInput = input;
    return buildVerificationFixture();
  },
});
assert.deepEqual(verificationInput, {
  envFiles: [envPath],
  intakeCsv: V1_PRODUCTION_ENV_INTAKE_CSV_PATH,
});
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.configuredLabel, "11/11");
assert.equal(readyResult.body.safeguards.envFilePathAcceptedFromRequest, false);
assert.equal(readyResult.body.safeguards.productionEnvFileMutated, false);
assert.equal(JSON.stringify(readyResult).includes(envPath), false);
assert.equal(JSON.stringify(readyResult).includes(V1_PRODUCTION_ENV_INTAKE_CSV_PATH), false);

const sensitiveError = "postgres://owner:secret@db.internal/prod /Users/private/prod.env";
const errorResult = precheckV1ProductionEnvIntake({
  operatorId,
  now: () => new Date(checkedAt),
  resolveSetup: () => safeResolution,
  buildVerification() {
    throw new Error(sensitiveError);
  },
});
assert.equal(errorResult.body.status, "error");
assert.equal(errorResult.body.error.code, "V1_PRODUCTION_ENV_INTAKE_LIVE_PRECHECK_FAILED");
assert.equal(JSON.stringify(errorResult).includes("postgres://"), false);
assert.equal(JSON.stringify(errorResult).includes("/Users/private"), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const apiFunction = apiSource.match(
  /function precheckSystemV1ProductionEnvIntake\(\{ operatorId \}\) \{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(apiFunction, "API production-env intake composition function should exist");
assert.match(apiFunction, /return precheckV1ProductionEnvIntake\(\{ operatorId \}\);/);
assert.doesNotMatch(apiFunction, /buildProductionEnvIntakeVerifyReport|resolve|readFileSync|process\.env/);
assert.doesNotMatch(
  apiSource,
  /function resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck\(/,
);
assert.doesNotMatch(apiSource, /const V1_PRODUCTION_ENV_INTAKE_CSV_PATH\s*=/);
assert.match(apiSource, /productionEnvSetupJson: V1_PRODUCTION_ENV_SETUP_JSON_PATH/);
assert.match(
  apiSource,
  /const resolution = resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck\(\);/,
);

console.log(
  "V1 production-env intake precheck service checks passed: setup safety gates, fixed server input, redaction, and thin API composition are covered.",
);

function resolveFixture({ files }) {
  return resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck({
    setupJsonPath: setupPath,
    resolvePath: (value) => value,
    exists: (value) => Object.hasOwn(files, value),
    readFile: (value) => files[value],
  });
}

function buildVerificationFixture() {
  return {
    scope: "v1_production_env_real_value_intake_verification",
    status: "passed",
    ready: true,
    checkedAt,
    summary: {
      label: "生产 env 真实值校验通过",
      envFileCount: 1,
      intakeRowCount: 11,
      configuredRowCount: 11,
      missingRowCount: 0,
      passedRowCount: 11,
      blockingCount: 0,
      warningCount: 0,
      minimumBlockingTargetCount: 5,
      minimumBlockingSatisfiedCount: 5,
      minimumWarningTargetCount: 3,
      minimumWarningSatisfiedCount: 3,
      auditReady: true,
      intakeCsvReady: true,
    },
    blockingFindings: [],
    warningFindings: [],
    nextActions: ["继续执行生产 env 变量预检。"],
  };
}
