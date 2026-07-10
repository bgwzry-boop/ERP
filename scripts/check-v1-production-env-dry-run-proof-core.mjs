import assert from "node:assert/strict";
import {
  buildV1ProductionEnvValuesDryRunProofFileBindingStatus,
  buildV1ProductionEnvValuesDryRunProofStatus,
  buildV1ProductionEnvTargetSignatureFromItems,
  buildV1ProductionEnvValuesDryRunProofFreshness,
  buildV1ProductionEnvValuesMinimumFillStatus,
  getV1ProductionEnvValuesDryRunProofMaxAgeHours,
  isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus,
} from "../server/v1ProductionEnvDryRunProofCore.mjs";

assert.equal(getV1ProductionEnvValuesDryRunProofMaxAgeHours({}), 24);
assert.equal(getV1ProductionEnvValuesDryRunProofMaxAgeHours({ ERP_V1_PRODUCTION_ENV_VALUES_DRY_RUN_MAX_AGE_HOURS: "0" }), 0);
assert.equal(getV1ProductionEnvValuesDryRunProofMaxAgeHours({ ERP_V1_PRODUCTION_ENV_VALUES_DRY_RUN_MAX_AGE_HOURS: "bad" }), 24);
assert.equal(
  buildV1ProductionEnvTargetSignatureFromItems([
    { variableKey: "ERP_V1_DATABASE_URL" },
    { type: "alternative_group", alternativeGroup: "OBJECT_STORAGE" },
    { variableKey: "ERP_V1_DATABASE_URL" },
  ]),
  "alternative-group:OBJECT_STORAGE|variable:ERP_V1_DATABASE_URL",
);

const minimumFill = buildV1ProductionEnvValuesMinimumFillStatus({
  status: "blocked",
  available: true,
  summary: {
    minimumBlockingTargetCount: 3,
    minimumBlockingSatisfiedCount: 2,
    minimumWarningTargetCount: 2,
    minimumWarningSatisfiedCount: 1,
  },
  minimumBlockingItems: [{ variableKey: "ERP_V1_DATABASE_URL" }],
});
assert.equal(minimumFill.minimumBlockingLabel, "2/3");
assert.equal(minimumFill.minimumBlockingMissingCount, 1);
assert.equal(minimumFill.minimumBlockingReady, false);
assert.equal(minimumFill.minimumBlockingTargetSignature, "variable:ERP_V1_DATABASE_URL");
assert.equal(minimumFill.minimumWarningLabel, "1/2");

const now = new Date("2026-07-10T12:00:00.000Z");
const fresh = buildV1ProductionEnvValuesDryRunProofFreshness({
  checkedAt: "2026-07-10T00:30:00.000Z",
  maxAgeHours: 12,
  now,
});
assert.equal(fresh.status, "fresh");
assert.equal(fresh.ready, true);
assert.equal(fresh.ageHours, 11.5);
assert.equal(fresh.remainingHours, 0.5);
const stale = buildV1ProductionEnvValuesDryRunProofFreshness({
  checkedAt: "2026-07-09T23:59:00.000Z",
  maxAgeHours: 12,
  now,
});
assert.equal(stale.status, "stale");
assert.equal(stale.ready, false);
assert.equal(buildV1ProductionEnvValuesDryRunProofFreshness({ maxAgeHours: 0 }).status, "disabled");

const currentMinimumFill = {
  available: true,
  minimumBlockingTargetSignature: "variable:ERP_V1_DATABASE_URL",
};
const matchedFileBinding = {
  status: "matched",
  statusLabel: "已匹配",
  ready: true,
  checked: true,
  valuesFingerprintCompared: true,
  valuesFingerprintIncluded: true,
  valuesFingerprintMatched: true,
  valuesFileUnchangedAfterProof: true,
  targetEnvFileUnchangedAfterProof: true,
};
const coveredDryRun = {
  scope: "v1_production_first_stage_execution",
  available: true,
  checkedAt: new Date().toISOString(),
  status: "ready",
  summary: { label: "第一阶段 dry-run" },
  dryRunCoverage: {
    available: true,
    included: true,
    checkedAt: new Date().toISOString(),
    minimumBlockingReady: true,
    envPreflightReady: true,
    minimumBlockingTargetSignature: "variable:ERP_V1_DATABASE_URL",
    minimumBlockingTargetCount: 1,
    minimumBlockingSatisfiedCount: 1,
    minimumBlockingMissingCount: 0,
  },
};
const coveredProof = buildV1ProductionEnvValuesDryRunProofStatus(coveredDryRun, currentMinimumFill, {
  buildFileBindingStatus: () => matchedFileBinding,
  sanitizeExecution: (value) => value,
});
assert.equal(coveredProof.status, "ready");
assert.equal(coveredProof.ready, true);
assert.equal(coveredProof.valuesFingerprintMatched, true);
assert.equal(coveredProof.valuesFingerprintDigestExposed, false);

const fingerprintMismatchProof = buildV1ProductionEnvValuesDryRunProofStatus(coveredDryRun, currentMinimumFill, {
  buildFileBindingStatus: () => ({
    ...matchedFileBinding,
    status: "values_fingerprint_mismatch",
    statusLabel: "指纹不一致",
    ready: false,
    valuesFingerprintMatched: false,
    nextAction: "重新执行 dry-run。",
  }),
  sanitizeExecution: (value) => value,
});
assert.equal(fingerprintMismatchProof.status, "values_fingerprint_mismatch");
assert.equal(fingerprintMismatchProof.ready, false);
assert.equal(fingerprintMismatchProof.nextAction, "重新执行 dry-run。");

const staleLegacyProof = buildV1ProductionEnvValuesDryRunProofStatus(
  {
    available: true,
    included: true,
    ready: true,
    checkedAt: "2020-01-01T00:00:00.000Z",
    minimumBlockingTargetSignature: "variable:ERP_V1_DATABASE_URL",
    minimumBlockingTargetCount: 1,
    minimumBlockingSatisfiedCount: 1,
    envPreflightReady: true,
  },
  currentMinimumFill,
  { buildFileBindingStatus: () => matchedFileBinding },
);
assert.equal(staleLegacyProof.status, "stale_or_expired");
assert.equal(staleLegacyProof.ready, false);

const embeddedFileBinding = buildV1ProductionEnvValuesDryRunProofFileBindingStatus({
  source: {
    valuesFingerprintStatus: "matched",
    valuesFingerprintStatusLabel: "已匹配",
    valuesFingerprintCompared: true,
    valuesFingerprintIncluded: true,
    valuesFingerprintMatched: true,
  },
});
assert.equal(embeddedFileBinding.status, "matched");
assert.equal(embeddedFileBinding.ready, true);
assert.equal(embeddedFileBinding.safeguards.valuesFilePathExposed, false);

const checkedFileBinding = buildV1ProductionEnvValuesDryRunProofFileBindingStatus(
  {
    checkFileBinding: true,
    valuesFileConfig: { envFiles: ["server-only-values-fragment"] },
    configuredValuesFileCount: 1,
  },
  {
    readProofReport: () => ({
      status: "ready",
      ready: true,
      summary: {
        label: "最近 dry-run 已匹配",
        valuesFingerprintIncluded: true,
        valuesFingerprintMatched: true,
        valuesFileUnchangedAfterProof: true,
        targetEnvFileUnchangedAfterProof: true,
      },
      safeguards: { valuesEnvFileFingerprintCompared: true },
      blockingFindings: [],
    }),
  },
);
assert.equal(checkedFileBinding.status, "matched");
assert.equal(checkedFileBinding.ready, true);
assert.equal(checkedFileBinding.valuesFingerprintDigestExposed, false);

const mismatchFileBinding = buildV1ProductionEnvValuesDryRunProofFileBindingStatus(
  {
    checkFileBinding: true,
    valuesFileConfig: { envFiles: ["server-only-values-fragment"] },
    configuredValuesFileCount: 1,
  },
  {
    readProofReport: () => ({
      status: "blocked",
      ready: false,
      blockingFindings: [{ key: "values-env-file-fingerprint-mismatch" }],
      nextActions: ["重新生成 dry-run。"],
    }),
  },
);
assert.equal(mismatchFileBinding.status, "values_fingerprint_mismatch");
assert.equal(mismatchFileBinding.ready, false);
assert.equal(mismatchFileBinding.nextAction, "重新生成 dry-run。");
assert.equal(isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(mismatchFileBinding.status), true);
assert.equal(isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus("stale_or_expired"), false);

console.log("V1 production env dry-run proof core checks passed");
