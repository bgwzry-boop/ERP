import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createV1ProductionEnvValuesApplyService } from "../server/services/v1ProductionEnvValuesApplyService.mjs";
import { sanitizeV1SensitiveStatusText } from "../server/services/v1StatusTextSanitizer.mjs";

const checkedAt = "2026-07-13T19:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const valuesFile = "/private/erp/values.env";

assert.throws(() => createV1ProductionEnvValuesApplyService(), /buildTargetSetupStatus/);

const disabled = createHarness({ applyEnabled: false });
const disabledResult = await disabled.service.run({ operatorId });
assert.equal(disabledResult.body.status, "disabled");
assert.equal(disabledResult.body.operatorId, operatorId);
assert.equal(disabledResult.body.checkedAt, checkedAt);
assert.equal(disabled.calls.audit, 1);
assert.equal(disabled.calls.apply, 0);

const missing = createHarness({ valuesFiles: [] });
const missingResult = await missing.service.run({ operatorId });
assert.equal(missingResult.body.status, "not_configured");
assert.equal(missingResult.body.summary.configuredValuesFileCount, 0);
assert.equal(missing.calls.audit, 1);
assert.equal(missing.calls.apply, 0);

const multiple = createHarness({ valuesFiles: [valuesFile, "/private/erp/other.env"] });
const multipleResult = await multiple.service.run({ operatorId });
assert.equal(multipleResult.body.status, "blocked");
assert.equal(multipleResult.body.blockingItems[0].key, "production-env-values-file-count");
assert.equal(multiple.calls.audit, 1);
assert.equal(multiple.calls.apply, 0);

const targetBlocked = createHarness({
  targetReady: false,
  targetBlockingItems: [{ key: "target", label: "目标阻塞", status: "blocked" }],
});
const targetBlockedResult = await targetBlocked.service.run({ operatorId });
assert.equal(targetBlockedResult.body.status, "target_not_ready");
assert.equal(targetBlockedResult.body.blockingItems[0].key, "target");
assert.equal(targetBlocked.calls.audit, 1);
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

for (const [options, expectedStatus, expectedReady] of [
  [{ applyEnabled: false }, "disabled", false],
  [{ valuesFiles: [] }, "not_configured", false],
  [{ valuesFiles: [valuesFile, "/private/erp/other.env"] }, "multiple_configured", false],
  [{ auditReady: false }, "audit_blocked", false],
  [{ targetReady: false }, "target_not_ready", false],
  [{ proofReady: false, proofStatus: "stale_or_expired" }, "dry_run_expired", false],
  [{ proofReady: false, proofStatus: "stale_or_mismatched" }, "dry_run_stale_or_mismatched", false],
  [{ proofReady: false, proofStatus: "values_fingerprint_mismatch" }, "dry_run_file_binding_blocked", false],
  [{ proofReady: false, proofStatus: "missing" }, "dry_run_not_ready", false],
  [{}, "enabled", true],
]) {
  const harness = createHarness(options);
  const gate = harness.service.buildGateStatus({
    productionEnvIntakeVerification: buildIntakeVerification(),
    productionFirstStageExecution: { scope: "v1_production_first_stage_execution" },
  });
  assert.equal(gate.status, expectedStatus);
  assert.equal(gate.ready, expectedReady);
  assert.equal(gate.summary.requestBodyIgnored, true);
  assert.equal(gate.safeguards.valuesFilePathAcceptedFromFrontend, false);
  assert.equal(gate.safeguards.productionEnvFileMutated, false);
}

const responseHarness = createHarness();
const maliciousText =
  "postgres://owner:secret@db.internal/prod ERP_RUNTIME_TOKEN=token-value /Users/private/values.env";
const projectedBody = responseHarness.service.buildResponseBody({
  operatorId,
  checkedAt,
  status: "blocked",
  valuesFileConfig: responseHarness.valuesFileConfig,
  configuredValuesFileCount: 1,
  targetSetupStatus: responseHarness.targetSetupStatus,
  valuesFileAuditStatus: responseHarness.valuesFileAuditStatus,
  dryRunProofStatus: { ready: false, status: "missing", nextAction: maliciousText },
  blockingItems: [{ key: "blocked", label: maliciousText, detail: maliciousText, nextAction: maliciousText }],
  nextAction: maliciousText,
  error: { code: "UNSAFE code", message: maliciousText },
});
const projectedSerialized = JSON.stringify(projectedBody);
for (const sentinel of ["postgres://", "secret@db.internal", "token-value", "/Users/private"]) {
  assert.equal(projectedSerialized.includes(sentinel), false, `response must redact ${sentinel}`);
}
assert.equal(projectedBody.version, "p0-v1-production-first-stage-values-apply-live-run-v1");
assert.equal(projectedBody.scope, "v1_production_first_stage_values_apply_live_run");
assert.equal(projectedBody.summary.valuesFilePathExposed, false);
assert.equal(projectedBody.safeguards.businessDataMutated, false);
assert.equal(projectedBody.error.code, "");

const guidanceHarness = createHarness({ proofReady: false, proofStatus: "missing" });
const guidance = guidanceHarness.service.buildServerConfigGuidance({
  valuesFileConfig: guidanceHarness.valuesFileConfig,
  configuredValuesFileCount: 1,
  ready: false,
  status: "dry_run_not_ready",
  applyEnabled: true,
  targetSetupStatus: guidanceHarness.targetSetupStatus,
  valuesFileAuditStatus: guidanceHarness.valuesFileAuditStatus,
  productionEnvValuesDryRunProofStatus: { ready: false, status: "missing" },
});
assert.equal(guidance.applyEnabled, true);
assert.equal(guidance.acceptsFrontendPath, false);
assert.equal(guidance.pathValueExposed, false);
assert.equal(guidance.safeguards.productionEnvFileMayBeMutated, false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
const statusResponseSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusResponseService.mjs", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /async function runSystemV1ProductionFirstStageValuesApply/);
assert.match(routeSource, /runProductionFirstStageValuesApply:[\s\S]*v1ProductionEnvValuesApplyService\.run\(\{ operatorId \}\)/);
assert.doesNotMatch(
  routeSource,
  /process\.env|getConfiguredV1ProductionEnvValuesFileConfig|buildV1ProductionEnvValuesDryRunProofStatus|runV1ProductionFirstStageValuesApplyCommand|blockingItems/,
);
assert.match(registrySource, /createV1ProductionEnvValuesApplyService\(\{/);
assert.match(
  registrySource,
  /buildProductionEnvValuesApplyGateStatus: \(input\) =>\s+v1ProductionEnvValuesApplyService\.buildGateStatus\(input\)/,
);
assert.match(
  statusResponseSource,
  /buildProductionEnvValuesApplyGateStatus\(\{\s*productionEnvIntakeVerification,\s*productionFirstStageExecution,/,
);
for (const oldFunction of [
  "buildV1ProductionEnvValuesApplyGateStatus",
  "buildV1ProductionFirstStageValuesApplyLiveRunBody",
  "buildV1ProductionFirstStageValuesApplyServerConfigGuidance",
  "isV1ProductionEnvValuesApplyEnabled",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${oldFunction}\\(`));
}

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
  const calls = { audit: 0, apply: 0, applyInput: null, proof: 0 };
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
  const valuesFileAuditStatus = {
    available: true,
    ready: auditReady,
    status: auditReady ? "passed" : "blocked",
    blockingItems: auditReady
      ? []
      : [{ key: "audit", label: "审计阻塞", status: "blocked" }],
    nextAction: auditReady ? "继续。" : "修正审计。",
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
    buildDryRunProofStatus(execution, intake, options = {}) {
      calls.proof += 1;
      if (execution?.scope === "v1_production_first_stage_execution") {
        assert.equal(intake?.ready === true || intake?.minimumBlockingReady === true, true);
      }
      if (Object.hasOwn(options, "valuesFileConfig")) {
        assert.equal(options.valuesFileConfig, valuesFileConfig);
        assert.equal(options.configuredValuesFileCount, valuesFiles.length);
        assert.equal(options.checkFileBinding, valuesFiles.length === 1);
      }
      return { ready: proofReady, status: proofStatus, nextAction: "重新 dry-run。" };
    },
    buildValuesFileAuditStatus(input) {
      calls.audit += 1;
      assert.deepEqual(input, { valuesFileConfig, configuredValuesFileCount: valuesFiles.length });
      return valuesFileAuditStatus;
    },
    async runApplyCommand(input) {
      calls.apply += 1;
      calls.applyInput = input;
      if (applyError) throw applyError;
      return report;
    },
    sanitizeBlockingItem: sanitizeTestBlockingItem,
  });
  return { service, calls, valuesFileConfig, targetSetupStatus, valuesFileAuditStatus };
}

function sanitizeTestBlockingItem(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const key = /^[A-Za-z0-9_.:-]{1,120}$/.test(String(source.key || "")) ? String(source.key) : "";
  const label = sanitizeV1SensitiveStatusText(source.label);
  if (!key && !label) return null;
  return {
    key,
    label: label || key,
    status: String(source.status || "blocked"),
    detail: sanitizeV1SensitiveStatusText(source.detail),
    nextAction: sanitizeV1SensitiveStatusText(source.nextAction),
  };
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

function buildIntakeVerification() {
  return {
    scope: "v1_production_env_real_value_intake_verification",
    available: true,
    ready: true,
    status: "passed",
    summary: {
      minimumBlockingTargetCount: 1,
      minimumBlockingSatisfiedCount: 1,
      minimumBlockingMissingCount: 0,
      minimumBlockingLabel: "1/1",
    },
  };
}
