import assert from "node:assert/strict";
import { createV1ProductionFirstStageValuesDryRunLivePrecheckService } from "../server/services/v1ProductionFirstStageValuesDryRunLivePrecheckService.mjs";

const FIXED_NOW = "2026-07-14T08:00:00.000Z";
const PRIVATE_VALUES_FILE = "/Users/private/production-values.env";

const notConfigured = createHarness({ valuesFileConfig: buildValuesFileConfig([]) });
const notConfiguredResult = await notConfigured.service.precheck({
  operatorId: "U-MANAGER-A",
  valuesFilePath: "/tmp/attacker.env",
  databaseUrl: "postgres://user:secret@prod/db",
});
assert.equal(notConfiguredResult.httpStatus, 200);
assert.equal(notConfiguredResult.body.status, "not_configured");
assert.equal(notConfiguredResult.body.ready, false);
assert.equal(notConfiguredResult.body.checkedAt, FIXED_NOW);
assert.equal(notConfiguredResult.body.summary.configuredValuesFileCount, 0);
assert.equal(notConfiguredResult.body.summary.requestBodyIgnored, true);
assert.equal(notConfiguredResult.body.blockingItems[0].key, "production-env-values-file-not-configured");
assert.equal(notConfiguredResult.body.serverConfigGuidance.acceptsFrontendPath, false);
assert.equal(notConfiguredResult.body.safeguards.valuesFilePathAcceptedFromRequest, false);
assert.equal(notConfiguredResult.body.safeguards.productionEnvFileMutated, false);
assert.equal(notConfigured.calls.command.length, 0);
assert.equal(JSON.stringify(notConfiguredResult).includes("attacker.env"), false);
assert.equal(JSON.stringify(notConfiguredResult).includes("user:secret"), false);

const multiple = createHarness({ valuesFileConfig: buildValuesFileConfig(["/private/a.env", "/private/b.env"]) });
const multipleResult = await multiple.service.precheck({ operatorId: "U-TECH-A" });
assert.equal(multipleResult.body.status, "blocked");
assert.equal(multipleResult.body.summary.configuredValuesFileCount, 2);
assert.equal(multipleResult.body.blockingItems[0].key, "production-env-values-file-count");
assert.equal(multiple.calls.command.length, 0);
assert.equal(JSON.stringify(multipleResult).includes("/private/a.env"), false);

const auditBlocked = createHarness({
  valuesFileAuditStatus: buildAuditStatus({
    ready: false,
    blockingItems: [
      {
        key: "unsafe-file",
        label: "真实值片段安全审计阻塞",
        status: "blocked",
        detail: "片段未通过安全审计",
      },
    ],
  }),
});
const auditBlockedResult = await auditBlocked.service.precheck({ operatorId: "U-MANAGER-A" });
assert.equal(auditBlockedResult.body.status, "audit_blocked");
assert.equal(auditBlockedResult.body.summary.valuesFileAuditReady, false);
assert.equal(auditBlockedResult.body.blockingItems[0].label, "已脱敏");
assert.equal(auditBlocked.calls.command.length, 0);
assert.equal(JSON.stringify(auditBlockedResult).includes(PRIVATE_VALUES_FILE), false);
assert.equal(JSON.stringify(auditBlockedResult).includes("user:secret"), false);

const targetBlocked = createHarness({ targetSetupStatus: buildTargetStatus({ ready: false }) });
const targetBlockedResult = await targetBlocked.service.precheck({ operatorId: "U-MANAGER-A" });
assert.equal(targetBlockedResult.body.status, "target_not_ready");
assert.equal(targetBlockedResult.body.summary.targetSetupReady, false);
assert.equal(targetBlockedResult.body.blockingItems[0].key, "production-env-setup-target-not-ready");
assert.equal(targetBlocked.calls.command.length, 0);

const ready = createHarness();
const readyResult = await ready.service.precheck({ operatorId: "U-MANAGER-A", body: { valuesFilePath: "/tmp/evil" } });
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.dryRunProofReady, true);
assert.equal(readyResult.body.summary.minimumBlockingLabel, "1/1");
assert.equal(readyResult.body.summary.valuesFilePathAccepted, false);
assert.equal(readyResult.body.summary.valuesFilePathExposed, false);
assert.equal(readyResult.body.serverConfigGuidance.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_FILE");
assert.equal(readyResult.body.serverConfigGuidance.dryRunProofValuesFingerprintDigestExposed, false);
assert.equal(readyResult.body.safeguards.dryRunProofValuesIncluded, false);
assert.equal(readyResult.body.safeguards.schemaMigrationApplyExecuted, false);
assert.equal(readyResult.body.safeguards.businessDataMutated, false);
assert.equal(readyResult.body.safeguards.physicalPrinterCalled, false);
assert.deepEqual(ready.calls.command, [[{ valuesFile: PRIVATE_VALUES_FILE }]]);
assert.equal(ready.calls.readArtifacts, 1);
assert.equal(ready.calls.proof[0].options.checkFileBinding, true);
assert.equal(JSON.stringify(readyResult).includes(PRIVATE_VALUES_FILE), false);

const stale = createHarness({ proofStatus: buildProofStatus({ status: "stale_or_mismatched", ready: false }) });
const staleResult = await stale.service.precheck({ operatorId: "U-MANAGER-A" });
assert.equal(staleResult.body.status, "dry_run_stale_or_mismatched");
assert.equal(staleResult.body.ready, false);
assert.equal(staleResult.body.nextAction, "重新执行受控 dry-run");

const fingerprint = createHarness({ proofStatus: buildProofStatus({ status: "values_fingerprint_mismatch", ready: false }) });
const fingerprintResult = await fingerprint.service.precheck({ operatorId: "U-MANAGER-A" });
assert.equal(fingerprintResult.body.status, "dry_run_file_binding_blocked");
assert.equal(fingerprintResult.body.ready, false);

const commandError = createHarness({
  runCommand: async () => {
    throw new Error(`postgres://user:secret@prod/db ${PRIVATE_VALUES_FILE}`);
  },
});
const commandErrorResult = await commandError.service.precheck({ operatorId: "U-MANAGER-A" });
assert.equal(commandErrorResult.body.status, "error");
assert.equal(commandErrorResult.body.error.code, "V1_PRODUCTION_FIRST_STAGE_VALUES_DRY_RUN_LIVE_PRECHECK_FAILED");
assert.equal(commandErrorResult.body.safeguards.businessDataMutated, false);
assert.equal(JSON.stringify(commandErrorResult).includes("user:secret"), false);
assert.equal(JSON.stringify(commandErrorResult).includes(PRIVATE_VALUES_FILE), false);

assert.throws(
  () => createV1ProductionFirstStageValuesDryRunLivePrecheckService({}),
  /getValuesFileConfig must be a function/,
);
const invalidClock = createHarness({ now: () => new Date("invalid") });
await assert.rejects(() => invalidClock.service.precheck({}), /now\(\) must return a valid Date/);

console.log("V1 production first-stage values dry-run live-precheck service checks passed: source gates, audit/setup blocks, safe command input, proof mapping, redaction, and thin API composition are covered.");

function createHarness(options = {}) {
  const calls = { audit: [], blocking: [], command: [], proof: [], readArtifacts: 0, target: 0 };
  const proofStatus = options.proofStatus || buildProofStatus();
  const service = createV1ProductionFirstStageValuesDryRunLivePrecheckService({
    getValuesFileConfig: () => options.valuesFileConfig || buildValuesFileConfig([PRIVATE_VALUES_FILE]),
    buildTargetSetupStatus: () => {
      calls.target += 1;
      return options.targetSetupStatus || buildTargetStatus({ ready: true });
    },
    buildValuesFileAuditStatus: (args) => {
      calls.audit.push(args);
      return options.valuesFileAuditStatus || buildAuditStatus({ ready: true });
    },
    readStatusArtifacts: () => {
      calls.readArtifacts += 1;
      return {
        productionFirstStageExecution: { value: {} },
        productionEnvIntakeVerification: { value: { status: "blocked", summary: {} } },
      };
    },
    runCommand: async (...args) => {
      calls.command.push(args);
      if (options.runCommand) return options.runCommand(...args);
      return buildReport();
    },
    buildDryRunProofStatus: (source, minimumFillStatus, proofOptions) => {
      calls.proof.push({ source, minimumFillStatus, options: proofOptions });
      if (source?.scope === "v1_production_first_stage_execution") return proofStatus;
      if (source?.status) return { ...buildProofStatus({ status: "missing", ready: false }), ...source };
      return buildProofStatus({ status: "missing", ready: false });
    },
    sanitizeBlockingItem: (item) => {
      calls.blocking.push(item);
      return item?.key
        ? { key: item.key, label: "已脱敏", status: item.status || "blocked", detail: "", nextAction: "" }
        : null;
    },
    now: options.now || (() => new Date(FIXED_NOW)),
  });
  return { calls, service };
}

function buildValuesFileConfig(envFiles) {
  return {
    envFiles,
    configuredEnvFileCount: envFiles.length,
    selectedEnvVariable: envFiles.length ? "ERP_V1_PRODUCTION_ENV_VALUES_FILE" : "",
    selectedEnvVariableLabel: envFiles.length ? "主真实值片段" : "未配置",
    selectedSourceKind: envFiles.length ? "primary" : "none",
    configuredSourceVariableCount: envFiles.length ? 1 : 0,
    sources: [
      {
        envVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
        kind: "primary",
        label: "主真实值片段",
        order: 1,
        configured: envFiles.length > 0,
        selected: envFiles.length === 1,
        envFileCount: envFiles.length,
      },
    ],
  };
}

function buildTargetStatus({ ready }) {
  return {
    available: true,
    status: ready ? "configured" : "blocked",
    ready,
    summary: {
      setupReportAvailable: true,
      envFileCount: ready ? 1 : 0,
      targetEnvFileConfigured: ready,
    },
    nextAction: ready ? "目标已就绪" : "先准备目标安全 env",
    safeguards: { targetEnvFilePathExposed: false },
  };
}

function buildAuditStatus({ ready, blockingItems = [] }) {
  return {
    available: true,
    status: ready ? "passed" : "blocked",
    ready,
    summary: {
      auditExecuted: true,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    blockingItems,
    nextAction: ready ? "可执行 dry-run" : "先修复片段审计",
    safeguards: { valuesFilePathExposed: false },
  };
}

function buildProofStatus({ status = "ready", ready = true } = {}) {
  return {
    available: true,
    status,
    ready,
    included: true,
    statusLabel: ready ? "已通过" : "需复核",
    fresh: true,
    freshnessStatus: "fresh",
    freshnessLabel: "24小时内",
    maxAgeHours: 24,
    ageHours: 0,
    expiresAt: "2026-07-15T08:00:00.000Z",
    remainingHours: 24,
    checkedAtIncluded: true,
    checkedAt: FIXED_NOW,
    dryRunMatchesCurrentMinimumPath: true,
    dryRunMinimumBlockingTargetSignatureIncluded: true,
    currentMinimumBlockingTargetSignatureIncluded: true,
    minimumBlockingReady: ready,
    minimumBlockingLabel: "1/1",
    minimumBlockingTargetCount: 1,
    minimumBlockingSatisfiedCount: ready ? 1 : 0,
    minimumBlockingMissingCount: ready ? 0 : 1,
    valuesFingerprintStatus: ready ? "matched" : status,
    valuesFingerprintStatusLabel: ready ? "已匹配" : "需复核",
    valuesFingerprintCompared: true,
    valuesFingerprintIncluded: true,
    valuesFingerprintMatched: ready,
    valuesFileUnchangedAfterProof: ready,
    targetEnvFileUnchangedAfterProof: ready,
    nextAction: "重新执行受控 dry-run",
  };
}

function buildReport() {
  return {
    scope: "v1_production_first_stage_execution",
    status: "passed",
    ready: true,
    checkedAt: FIXED_NOW,
    summary: {
      label: "1/1 步骤通过",
      passedCount: 1,
      totalCount: 1,
      blockingCount: 0,
      errorCount: 0,
      productionEnvValuesDryRunCoverage: {
        included: true,
        stageStatus: "passed",
        minimumBlockingReady: true,
        minimumBlockingSatisfiedCount: 1,
        minimumBlockingTargetCount: 1,
        minimumWarningSatisfiedCount: 0,
        minimumWarningTargetCount: 0,
        envPreflightReady: true,
        envPreflightPassedCount: 1,
        envPreflightTotalCount: 1,
        intakeConfiguredRowCount: 1,
        intakeRowCount: 1,
      },
    },
    execution: { productionEnvValuesDryRun: true, productionEnvValuesDryRunStopsBeforeFirstStage: true },
    stages: [],
    blockingStages: [],
    nextActions: ["负责人确认后正式合并"],
  };
}
