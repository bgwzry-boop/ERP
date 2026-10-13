import assert from "node:assert/strict";
import { createV1ProductionEnvValuesSafetyStatusService } from "../server/services/v1ProductionEnvValuesSafetyStatusService.mjs";

const PRIVATE_VALUES_FILE = "/private/erp/production-values.env";
const PRIVATE_SETUP_REPORT = "/private/erp/setup/latest.json";

const notConfigured = createHarness({ valuesFileConfig: buildValuesFileConfig([]) });
const notConfiguredStatus = notConfigured.service.buildValuesFileAuditStatus({
  valuesFileConfig: notConfigured.valuesFileConfig,
});
assert.equal(notConfiguredStatus.status, "not_run");
assert.equal(notConfiguredStatus.ready, false);
assert.equal(notConfiguredStatus.summary.fileCount, 0);
assert.equal(notConfigured.calls.audit.length, 0);

const multiple = createHarness({
  valuesFileConfig: buildValuesFileConfig([PRIVATE_VALUES_FILE, "/private/erp/second.env"]),
});
const multipleStatus = multiple.service.buildValuesFileAuditStatus({
  valuesFileConfig: multiple.valuesFileConfig,
});
assert.equal(multipleStatus.status, "not_run");
assert.equal(multipleStatus.summary.fileCount, 2);
assert.equal(multiple.calls.audit.length, 0);
assert.equal(JSON.stringify(multipleStatus).includes(PRIVATE_VALUES_FILE), false);

const ready = createHarness();
const readyAudit = ready.service.buildValuesFileAuditStatus({ valuesFileConfig: ready.valuesFileConfig });
assert.equal(readyAudit.status, "passed");
assert.equal(readyAudit.ready, true);
assert.equal(readyAudit.summary.auditExecuted, true);
assert.equal(readyAudit.summary.passedCount, 1);
assert.deepEqual(ready.calls.audit, [{ envFiles: [PRIVATE_VALUES_FILE] }]);
assert.equal(JSON.stringify(readyAudit).includes(PRIVATE_VALUES_FILE), false);

const blocked = createHarness({
  auditReport: {
    ready: false,
    summary: { label: "postgres://user:secret@prod/db", fileCount: 1, blockingCount: 1 },
    blockingFindings: [
      {
        key: "unsafe-values-file",
        label: "postgres://user:secret@prod/db",
        detail: `${PRIVATE_VALUES_FILE} contains unsafe values`,
        nextAction: "remove token=private-secret",
      },
    ],
  },
});
const blockedAudit = blocked.service.buildValuesFileAuditStatus({ valuesFileConfig: blocked.valuesFileConfig });
assert.equal(blockedAudit.status, "blocked");
assert.equal(blockedAudit.ready, false);
assert.equal(blockedAudit.blockingItems.length, 1);
assert.equal(JSON.stringify(blockedAudit).includes("user:secret"), false);
assert.equal(JSON.stringify(blockedAudit).includes(PRIVATE_VALUES_FILE), false);
assert.equal(JSON.stringify(blockedAudit).includes("private-secret"), false);

const auditError = createHarness({ auditError: new Error(`${PRIVATE_VALUES_FILE} postgres://user:secret@prod/db`) });
const auditErrorStatus = auditError.service.buildValuesFileAuditStatus({
  valuesFileConfig: auditError.valuesFileConfig,
});
assert.equal(auditErrorStatus.status, "error");
assert.equal(auditErrorStatus.blockingItems[0].key, "production-env-values-file-audit-error");
assert.equal(JSON.stringify(auditErrorStatus).includes("user:secret"), false);
assert.equal(JSON.stringify(auditErrorStatus).includes(PRIVATE_VALUES_FILE), false);

const readyTarget = ready.service.buildTargetSetupStatus();
assert.equal(readyTarget.status, "configured");
assert.equal(readyTarget.ready, true);
assert.equal(readyTarget.summary.targetEnvFileConfigured, true);
assert.equal(readyTarget.safeguards.targetEnvFilePathExposed, false);

const blockedTargetHarness = createHarness({
  setupResolution: {
    ready: false,
    status: "blocked",
    setupReportAvailable: true,
    setupReady: false,
    envFileCount: 1,
    nextAction: "inspect postgres://user:secret@prod/db",
    blockingItems: [
      {
        key: "target-not-ready",
        label: "目标未就绪",
        detail: `${PRIVATE_VALUES_FILE} is unsafe`,
        nextAction: "remove token=private-secret",
      },
    ],
  },
});
const blockedTarget = blockedTargetHarness.service.buildTargetSetupStatus();
assert.equal(blockedTarget.status, "blocked");
assert.equal(blockedTarget.ready, false);
assert.equal(blockedTarget.blockingItems.length, 1);
assert.equal(JSON.stringify(blockedTarget).includes("user:secret"), false);
assert.equal(JSON.stringify(blockedTarget).includes(PRIVATE_VALUES_FILE), false);
assert.equal(JSON.stringify(blockedTarget).includes("private-secret"), false);

const binding = ready.service.buildDryRunProofFileBindingStatus({
  valuesFileConfig: ready.valuesFileConfig,
  configuredValuesFileCount: 1,
  checkFileBinding: true,
});
assert.equal(binding.status, "matched");
assert.equal(binding.ready, true);
assert.equal(binding.valuesFingerprintMatched, true);
assert.equal(binding.valuesFingerprintDigestExposed, false);
assert.equal(ready.calls.proof.length, 1);
assert.equal(ready.calls.proof[0].valuesEnvFile, PRIVATE_VALUES_FILE);
assert.equal(ready.calls.proof[0].productionEnvSetupJson, PRIVATE_SETUP_REPORT);
assert.equal(JSON.stringify(binding).includes(PRIVATE_VALUES_FILE), false);

const configuredFragment = ready.service.buildFragmentSourceStatus({
  productionEnvIntakeVerification: buildMinimumFillStatus(),
  buildServerConfigGuidance: buildGuidance,
});
assert.equal(configuredFragment.status, "configured");
assert.equal(configuredFragment.ready, true);
assert.equal(configuredFragment.summary.configuredValuesFileCount, 1);
assert.equal(configuredFragment.summary.targetSetupReady, true);
assert.equal(configuredFragment.summary.valuesFileAuditReady, true);
assert.equal(configuredFragment.summary.minimumBlockingLabel, "1/1");
assert.equal(configuredFragment.safeguards.valuesFilePathAcceptedFromFrontend, false);
assert.equal(configuredFragment.safeguards.productionEnvFileMutated, false);
assert.equal(JSON.stringify(configuredFragment).includes(PRIVATE_VALUES_FILE), false);

const missingFragment = notConfigured.service.buildFragmentSourceStatus({
  productionEnvIntakeVerification: buildMinimumFillStatus(),
  buildServerConfigGuidance: buildGuidance,
});
assert.equal(missingFragment.status, "not_configured");
assert.equal(missingFragment.ready, false);

const multipleFragment = multiple.service.buildFragmentSourceStatus({
  productionEnvIntakeVerification: buildMinimumFillStatus(),
  buildServerConfigGuidance: buildGuidance,
});
assert.equal(multipleFragment.status, "multiple_configured");

const auditBlockedFragmentHarness = createHarness({
  auditReport: { ready: false, summary: { fileCount: 1, blockingCount: 1 }, blockingFindings: [] },
});
const auditBlockedFragment = auditBlockedFragmentHarness.service.buildFragmentSourceStatus({
  productionEnvIntakeVerification: buildMinimumFillStatus(),
  buildServerConfigGuidance: buildGuidance,
});
assert.equal(auditBlockedFragment.status, "audit_blocked");

const targetBlockedFragment = blockedTargetHarness.service.buildFragmentSourceStatus({
  productionEnvIntakeVerification: buildMinimumFillStatus(),
  buildServerConfigGuidance: buildGuidance,
});
assert.equal(targetBlockedFragment.status, "target_not_ready");

assert.throws(
  () => createV1ProductionEnvValuesSafetyStatusService({ getValuesFileConfig: null }),
  /getValuesFileConfig must be a function/,
);
assert.throws(
  () => ready.service.buildFragmentSourceStatus({ buildServerConfigGuidance: null }),
  /buildServerConfigGuidance must be a function/,
);

console.log("V1 production env values safety-status service checks passed: source, audit, setup, proof binding, redaction, and thin API composition are covered.");

function createHarness(options = {}) {
  const calls = { audit: [], proof: [], setup: 0 };
  const valuesFileConfig = options.valuesFileConfig || buildValuesFileConfig([PRIVATE_VALUES_FILE]);
  const service = createV1ProductionEnvValuesSafetyStatusService({
    getValuesFileConfig: () => valuesFileConfig,
    resolveSetupTarget: () => {
      calls.setup += 1;
      return options.setupResolution || {
        ready: true,
        status: "ready",
        setupReportAvailable: true,
        setupReady: true,
        envFileCount: 1,
        nextAction: "target ready",
        blockingItems: [],
      };
    },
    buildFileAuditReport: (args) => {
      calls.audit.push(args);
      if (options.auditError) throw options.auditError;
      return options.auditReport || {
        ready: true,
        summary: { label: "审计通过", fileCount: 1, passedCount: 1, blockingCount: 0, warningCount: 0 },
        blockingFindings: [],
        nextActions: [],
      };
    },
    buildDryRunProofReport: (args) => {
      calls.proof.push(args);
      return {
        ready: true,
        status: "ready",
        summary: {
          label: "指纹匹配",
          valuesFingerprintIncluded: true,
          valuesFingerprintMatched: true,
          valuesFileUnchangedAfterProof: true,
          targetEnvFileUnchangedAfterProof: true,
        },
        blockingFindings: [],
        nextActions: [],
        safeguards: { valuesEnvFileFingerprintCompared: true },
      };
    },
    productionEnvSetupJson: PRIVATE_SETUP_REPORT,
  });
  return { calls, service, valuesFileConfig };
}

function buildValuesFileConfig(envFiles) {
  return {
    envFiles,
    configuredEnvFileCount: envFiles.length,
    selectedEnvVariable: envFiles.length ? "ERP_V1_PRODUCTION_ENV_VALUES_FILE" : "",
    selectedEnvVariableLabel: envFiles.length ? "主真实值片段" : "未配置",
    selectedSourceKind: envFiles.length ? "primary" : "none",
    configuredSourceVariableCount: envFiles.length ? 1 : 0,
    fallbackSourceUsed: false,
  };
}

function buildMinimumFillStatus() {
  return {
    available: true,
    status: "blocked",
    ready: false,
    summary: {
      minimumBlockingLabel: "1/1",
      minimumBlockingTargetCount: 1,
      minimumBlockingSatisfiedCount: 1,
      minimumBlockingMissingCount: 0,
      minimumBlockingVariableRowCount: 1,
      minimumBlockingAlternativeGroupCount: 0,
      minimumWarningLabel: "0/0",
      minimumWarningMissingCount: 0,
      fullIntakeConfiguredLabel: "1/29",
    },
  };
}

function buildGuidance({ valuesFileConfig, configuredValuesFileCount }) {
  return {
    sourceStatuses: [],
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE"],
    selectedEnvVariable: valuesFileConfig.selectedEnvVariable,
    configuredValuesFileCount,
  };
}
