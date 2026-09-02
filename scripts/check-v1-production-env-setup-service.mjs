import assert from "node:assert/strict";
import { runV1ProductionEnvSetup } from "../server/services/v1ProductionEnvSetupService.mjs";

const checkedAt = "2026-07-13T15:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
let commandArguments;

const preparedResult = await runV1ProductionEnvSetup({
  operatorId,
  now: () => new Date(checkedAt),
  runCommand(...args) {
    commandArguments = args;
    return buildSetupFixture({ ready: false, setupReady: true });
  },
});
assert.deepEqual(commandArguments, []);
assert.equal(preparedResult.httpStatus, 200);
assert.equal(preparedResult.body.status, "prepared");
assert.equal(preparedResult.body.ready, false);
assert.equal(preparedResult.body.summary.setupReady, true);
assert.equal(preparedResult.body.summary.productionReady, false);
assert.equal(preparedResult.body.summary.targetEnvDraftMayBeCreated, true);
assert.equal(preparedResult.body.summary.productionEnvRealValuesWritten, false);
assert.equal(preparedResult.body.summary.productionEnvValuesApplyExecuted, false);
assert.equal(preparedResult.body.serverConfigGuidance.acceptsFrontendTargetPath, false);
assert.equal(preparedResult.body.serverConfigGuidance.forceOverwriteEnabled, false);
assert.equal(preparedResult.body.safeguards.targetEnvFilePathExposed, false);
assert.equal(preparedResult.body.safeguards.businessDataMutated, false);
assert.equal(JSON.stringify(preparedResult).includes("/secure/production.env"), false);
assert.equal(JSON.stringify(preparedResult).includes("postgres://"), false);

const readyResult = await runV1ProductionEnvSetup({
  operatorId,
  now: () => new Date(checkedAt),
  runCommand: async () => buildSetupFixture({ ready: true, setupReady: true }),
});
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.auditReady, true);
assert.equal(readyResult.body.summary.envPreflightReady, true);
assert.equal(readyResult.body.summary.envPreflightLabel, "11/11");
assert.equal(readyResult.body.safeguards.releaseCandidateRefreshed, false);
assert.equal(readyResult.body.safeguards.goLiveSuiteRefreshed, false);

const sensitiveError = ["postgres://owner:secret@db.internal/prod", "/Users/private/prod.env"].join(" ");
const errorResult = await runV1ProductionEnvSetup({
  operatorId,
  now: () => new Date(checkedAt),
  runCommand() {
    throw new Error(sensitiveError);
  },
});
assert.equal(errorResult.httpStatus, 200);
assert.equal(errorResult.body.status, "error");
assert.equal(errorResult.body.error.code, "V1_PRODUCTION_ENV_SETUP_LIVE_RUN_FAILED");
assert.equal(errorResult.body.setupFindings[0].key, "production-env-setup-command-failed");
assert.equal(JSON.stringify(errorResult).includes("postgres://"), false);
assert.equal(JSON.stringify(errorResult).includes("/Users/private"), false);
assert.equal(errorResult.body.safeguards.commandValueExposed, false);
assert.equal(errorResult.body.safeguards.envValuesIncluded, false);

const missingCommandResult = await runV1ProductionEnvSetup({
  operatorId,
  now: () => new Date(checkedAt),
});
assert.equal(missingCommandResult.body.status, "error");
assert.equal(missingCommandResult.body.error.code, "V1_PRODUCTION_ENV_SETUP_LIVE_RUN_FAILED");

console.log(
  "V1 production-env setup service checks passed: prepared/ready/error projection, fixed command input, no overwrite, redaction, safeguards, and thin API composition are covered.",
);

function buildSetupFixture({ ready, setupReady }) {
  return {
    scope: "v1_production_env_setup",
    status: ready ? "ready" : setupReady ? "prepared" : "blocked",
    ready,
    setupReady,
    checkedAt,
    summary: {
      label: ready ? "生产 env 已通过" : "安全草稿已准备",
      generated: true,
      imported: false,
      overwritten: false,
      targetExistedBefore: false,
      setupBlockingCount: 0,
      auditReady: true,
      envPreflightReady: ready,
      envPreflightPassedCount: ready ? 11 : 3,
      envPreflightTotalCount: 11,
      envPreflightBlockingCount: ready ? 0 : 8,
      envPreflightWarningCount: 0,
      remainingFixItemCount: ready ? 0 : 1,
    },
    envFile: {
      path: "/secure/production.env",
      assignmentCount: 11,
      existedBefore: false,
      gitIgnored: true,
      gitTracked: false,
      fileMode: "600",
    },
    audit: {
      status: "passed",
      ready: true,
      summary: { label: "审计通过" },
    },
    envPreflight: {
      status: ready ? "passed" : "blocked",
      ready,
      passedCount: ready ? 11 : 3,
      totalCount: 11,
      blockingCount: ready ? 0 : 8,
      warningCount: 0,
      readinessLabel: ready ? "11/11" : "3/11",
      remainingFixItems: ready
        ? []
        : [
            {
              key: "database",
              label: "数据库真实值待补",
              status: "blocked",
              detail: "补齐数据库配置。",
              nextAction: "在服务器安全文件中补齐。",
            },
          ],
    },
    setupFindings: [],
    commands: ["node scripts/run-v1-production-env-setup.mjs --json postgres://owner:secret@db.internal/prod"],
    nextActions: ready ? [] : ["补齐真实值后重新校验。"],
  };
}
