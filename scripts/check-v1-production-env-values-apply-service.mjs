import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createV1ProductionEnvValuesApplyService } from "../server/services/v1ProductionEnvValuesApplyService.mjs";

const checkedAt = "2026-07-13T19:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const valuesFile = "/private/erp/values.env";

assert.throws(() => createV1ProductionEnvValuesApplyService(), /buildTargetSetupStatus/);

const disabled = createHarness({ applyEnabled: false });
const disabledResult = await disabled.service.run({ operatorId });
assert.equal(disabledResult.body.status, "disabled");
assert.equal(disabledResult.body.operatorId, operatorId);
assert.equal(disabledResult.body.checkedAt, checkedAt);
assert.equal(disabled.calls.audit, 0);
assert.equal(disabled.calls.apply, 0);

const missing = createHarness({ valuesFiles: [] });
const missingResult = await missing.service.run({ operatorId });
assert.equal(missingResult.body.status, "not_configured");
assert.equal(missingResult.body.configuredValuesFileCount, 0);
assert.equal(missing.calls.audit, 0);
assert.equal(missing.calls.apply, 0);

const multiple = createHarness({ valuesFiles: [valuesFile, "/private/erp/other.env"] });
const multipleResult = await multiple.service.run({ operatorId });
assert.equal(multipleResult.body.status, "blocked");
assert.equal(multipleResult.body.blockingItems[0].key, "production-env-values-file-count");
assert.equal(multiple.calls.apply, 0);

const targetBlocked = createHarness({
  targetReady: false,
  targetBlockingItems: [{ key: "target", label: "目标阻塞", status: "blocked" }],
});
const targetBlockedResult = await targetBlocked.service.run({ operatorId });
assert.equal(targetBlockedResult.body.status, "target_not_ready");
assert.equal(targetBlockedResult.body.blockingItems[0].key, "target");
assert.equal(targetBlocked.calls.audit, 0);
assert.equal(targetBlocked.calls.apply, 0);

const auditBlocked = createHarness({ auditReady: false });
const auditBlockedResult = await auditBlocked.service.run({ operatorId });
assert.equal(auditBlockedResult.body.status, "audit_blocked");
assert.equal(auditBlocked.calls.audit, 1);
assert.equal(auditBlocked.calls.apply, 0);

for (const [proofStatus, expectedStatus] of [
  ["values_fingerprint_mismatch", "dry_run_file_binding_blocked"],
  ["stale_or_expired", "dry_run_expired"],
  ["stale_or_mismatched", "dry_run_stale_or_mismatched"],
  ["missing", "dry_run_not_ready"],
]) {
  const harness = createHarness({ proofReady: false, proofStatus });
  const result = await harness.service.run({ operatorId });
  assert.equal(result.body.status, expectedStatus);
  assert.equal(harness.calls.audit, 1);
  assert.equal(harness.calls.apply, 0);
}

const ready = createHarness({ report: buildApplyReport({ ready: true }) });
const readyResult = await ready.service.run({ operatorId });
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.deepEqual(ready.calls.applyInput, { valuesFile });
assert.equal(ready.calls.audit, 1);
assert.equal(ready.calls.apply, 1);
assert.equal(readyResult.body.nextAction.includes("重启生产API"), true);

const stillBlocked = createHarness({ report: buildApplyReport({ ready: false }) });
const stillBlockedResult = await stillBlocked.service.run({ operatorId });
assert.equal(stillBlockedResult.body.status, "blocked");
assert.equal(stillBlockedResult.body.ready, false);
assert.equal(stillBlockedResult.body.nextAction, "继续补值。");

const sensitiveError = "postgres://owner:secret@db.internal/prod /Users/private/values.env";
const failed = createHarness({ applyError: new Error(sensitiveError) });
const failedResult = await failed.service.run({ operatorId });
assert.equal(failedResult.body.status, "error");
assert.equal(failedResult.body.error.code, "V1_PRODUCTION_FIRST_STAGE_VALUES_APPLY_LIVE_RUN_FAILED");
assert.equal(JSON.stringify(failedResult).includes("postgres://"), false);
assert.equal(JSON.stringify(failedResult).includes("/Users/private"), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const apiFunction = apiSource.match(
  /async function runSystemV1ProductionFirstStageValuesApply\(\{ operatorId \}\) \{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(apiFunction, "API values-apply composition function should exist");
assert.match(apiFunction, /return v1ProductionEnvValuesApplyService\.run\(\{ operatorId \}\);/);
assert.doesNotMatch(
  apiFunction,
  /process\.env|getConfiguredV1ProductionEnvValuesFileConfig|buildV1ProductionEnvValuesDryRunProofStatus|runV1ProductionFirstStageValuesApplyCommand|blockingItems/,
);
assert.match(apiSource, /createV1ProductionEnvValuesApplyService\(\{/);

console.log(
  "V1 production-env values-apply service checks passed: flag, source, target, audit, dry-run proof, controlled execution, failure redaction, and thin API composition are covered.",
);

function createHarness({
  applyEnabled = true,
  valuesFiles = [valuesFile],
  targetReady = true,
  targetBlockingItems = [],
  auditReady = true,
  proofReady = true,
  proofStatus = proofReady ? "ready" : "missing",
  report = buildApplyReport({ ready: true }),
  applyError = null,
} = {}) {
  const calls = { audit: 0, apply: 0, applyInput: null };
  const valuesFileConfig = {
    envFiles: valuesFiles,
    configuredEnvFileCount: valuesFiles.length,
    selectedEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
  };
  const targetSetupStatus = {
    available: true,
    ready: targetReady,
    status: targetReady ? "configured" : "blocked",
    blockingItems: targetBlockingItems,
    nextAction: targetReady ? "继续。" : "先修正目标。",
  };
  const service = createV1ProductionEnvValuesApplyService({
    env: { ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED: applyEnabled ? "true" : "false" },
    now: () => new Date(checkedAt),
    getValuesFileConfig(inputEnv) {
      assert.equal(inputEnv.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED, applyEnabled ? "true" : "false");
      return valuesFileConfig;
    },
    buildTargetSetupStatus: () => targetSetupStatus,
    readStatusArtifacts: () => ({
      productionEnvIntakeVerification: {
        value: {
          scope: "v1_production_env_real_value_intake_verification",
          ready: true,
          status: "passed",
          summary: { intakeRowCount: 11, configuredRowCount: 11 },
        },
      },
      productionFirstStageExecution: { value: { scope: "v1_production_first_stage_execution" } },
    }),
    buildDryRunProofStatus(_execution, intake, options) {
      assert.equal(intake.ready, true);
      assert.equal(options.valuesFileConfig, valuesFileConfig);
      assert.equal(options.configuredValuesFileCount, valuesFiles.length);
      assert.equal(options.checkFileBinding, valuesFiles.length === 1);
      return { ready: proofReady, status: proofStatus, nextAction: "重新 dry-run。" };
    },
    buildValuesFileAuditStatus(input) {
      calls.audit += 1;
      assert.deepEqual(input, { valuesFileConfig, configuredValuesFileCount: valuesFiles.length });
      return {
        available: true,
        ready: auditReady,
        status: auditReady ? "passed" : "blocked",
        blockingItems: auditReady
          ? []
          : [{ key: "audit", label: "审计阻塞", status: "blocked" }],
        nextAction: auditReady ? "继续。" : "修正审计。",
      };
    },
    async runApplyCommand(input) {
      calls.apply += 1;
      calls.applyInput = input;
      if (applyError) throw applyError;
      return report;
    },
    buildResponseBody(input) {
      return input;
    },
  });
  return { service, calls };
}

function buildApplyReport({ ready }) {
  return {
    scope: "v1_production_env_real_value_intake_apply",
    status: ready ? "ready" : "blocked",
    ready,
    summary: { appliedVariableCount: ready ? 11 : 0 },
    targetEnvFile: { applied: ready, changed: ready, fileMode: "600" },
    blockingFindings: [],
    warningFindings: [],
    nextActions: ready ? [] : ["继续补值。"],
  };
}
