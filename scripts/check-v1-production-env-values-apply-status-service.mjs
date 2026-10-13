import assert from "node:assert/strict";
import { createV1ProductionEnvValuesApplyStatusService } from "../server/services/v1ProductionEnvValuesApplyStatusService.mjs";
import { sanitizeV1SensitiveStatusText } from "../server/services/v1StatusTextSanitizer.mjs";

const checkedAt = "2026-07-14T09:00:00.000Z";
const valuesFile = "/private/erp/values.env";

assert.throws(() => createV1ProductionEnvValuesApplyStatusService(), /buildTargetSetupStatus/);

for (const [options, expectedStatus, expectedReady] of [
  [{ applyEnabled: false }, "disabled", false],
  [{ valuesFiles: [] }, "not_configured", false],
  [{ valuesFiles: [valuesFile, "/private/erp/other.env"] }, "multiple_configured", false],
  [{ targetReady: false }, "target_not_ready", false],
  [{ auditReady: false }, "audit_blocked", false],
  [{ proofReady: false, proofStatus: "stale_or_expired" }, "dry_run_expired", false],
  [{ proofReady: false, proofStatus: "stale_or_mismatched" }, "dry_run_stale_or_mismatched", false],
  [
    { proofReady: false, proofStatus: "values_fingerprint_mismatch" },
    "dry_run_file_binding_blocked",
    false,
  ],
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
  assert.equal(gate.summary.valuesFilePathAccepted, false);
  assert.equal(gate.safeguards.productionEnvFileMutated, false);
  assert.equal(gate.safeguards.valuesFilePathAcceptedFromRequest, false);
}

const maliciousText =
  "postgres://owner:secret@db.internal/prod ERP_RUNTIME_TOKEN=token-value /Users/private/values.env";
const maliciousHarness = createHarness({
  targetLabel: maliciousText,
  auditLabel: maliciousText,
  proofReady: false,
  proofStatus: "missing",
});
const projectedBody = maliciousHarness.service.buildResponseBody({
  operatorId: "U-MANAGER-TEST",
  checkedAt,
  status: "blocked",
  valuesFileConfig: maliciousHarness.valuesFileConfig,
  configuredValuesFileCount: 1,
  targetSetupStatus: maliciousHarness.targetSetupStatus,
  valuesFileAuditStatus: maliciousHarness.valuesFileAuditStatus,
  dryRunProofStatus: { ready: false, status: "missing", nextAction: maliciousText },
  blockingItems: [
    { key: "blocked", label: maliciousText, detail: maliciousText, nextAction: maliciousText },
  ],
  nextAction: maliciousText,
  error: { code: "UNSAFE code", message: maliciousText },
});
const projectedSerialized = JSON.stringify(projectedBody);
for (const sentinel of ["postgres://", "secret@db.internal", "token-value", "/Users/private"]) {
  assert.equal(projectedSerialized.includes(sentinel), false, `response must redact ${sentinel}`);
}
assert.equal(projectedBody.version, "p0-v1-production-first-stage-values-apply-live-run-v1");
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

console.log(
  "V1 production-env values-apply status service checks passed: ten gate states, response/guidance redaction, and write/projection ownership are covered.",
);

function createHarness({
  applyEnabled = true,
  valuesFiles = [valuesFile],
  targetReady = true,
  targetLabel = "目标安全草稿",
  auditReady = true,
  auditLabel = "真实值片段审计",
  proofReady = true,
  proofStatus = proofReady ? "ready" : "missing",
} = {}) {
  const valuesFileConfig = {
    envFiles: valuesFiles,
    configuredEnvFileCount: valuesFiles.length,
    selectedEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
  };
  const targetSetupStatus = {
    available: true,
    ready: targetReady,
    status: targetReady ? "configured" : "blocked",
    summary: { label: targetLabel, targetEnvFileConfigured: targetReady },
    blockingItems: targetReady
      ? []
      : [{ key: "target", label: targetLabel, status: "blocked", detail: targetLabel }],
    nextAction: targetReady ? "继续。" : targetLabel,
  };
  const valuesFileAuditStatus = {
    available: true,
    ready: auditReady,
    status: auditReady ? "passed" : "blocked",
    summary: { label: auditLabel, auditExecuted: true },
    blockingItems: auditReady
      ? []
      : [{ key: "audit", label: auditLabel, status: "blocked", detail: auditLabel }],
    nextAction: auditReady ? "继续。" : auditLabel,
  };
  const service = createV1ProductionEnvValuesApplyStatusService({
    env: { ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED: applyEnabled ? "true" : "false" },
    now: () => new Date(checkedAt),
    getValuesFileConfig: () => valuesFileConfig,
    buildTargetSetupStatus: () => targetSetupStatus,
    readStatusArtifacts: () => ({
      productionFirstStageExecution: { value: { scope: "v1_production_first_stage_execution" } },
    }),
    buildDryRunProofStatus: () => ({
      available: true,
      ready: proofReady,
      status: proofStatus,
      included: true,
      nextAction: proofReady ? "继续。" : "重新 dry-run。",
    }),
    buildValuesFileAuditStatus: () => valuesFileAuditStatus,
    sanitizeBlockingItem: sanitizeTestBlockingItem,
  });
  return { service, valuesFileConfig, targetSetupStatus, valuesFileAuditStatus };
}

function sanitizeTestBlockingItem(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const key = /^[A-Za-z0-9_.:-]{1,120}$/.test(String(source.key || ""))
    ? String(source.key)
    : "";
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
