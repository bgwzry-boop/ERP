import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sanitizeV1ProductionEnvFillTemplate,
  sanitizeV1ProductionEnvGate,
  sanitizeV1ProductionEnvIntakeVerification,
  sanitizeV1ProductionEnvSetupReport,
  sanitizeV1ProductionFirstStageExecution,
  sanitizeV1ProductionPersistenceEvidence,
  sanitizeV1TodoLoadPrecheck,
} from "../server/services/v1ProductionStatusProjectionService.mjs";

const secrets = {
  databaseUrl: "postgresql://erp:secret@db.internal:5432/erp",
  endpoint: "https://minio.internal:9000",
  bucket: "erp-secret-bucket",
  bearer: "Bearer top-secret-token",
  envAssignment: "ERP_AUTH_SECRET=top-secret-auth",
  envPath: "/Users/xu/private/secure-prod.env",
  artifactPath: ".erp-local-storage/private/latest.json",
  blockingSignature: "SECRET-BLOCKING-SIGNATURE",
  warningSignature: "SECRET-WARNING-SIGNATURE",
};
const unsafeText = [
  `database-url=${secrets.databaseUrl}`,
  `endpoint=${secrets.endpoint}`,
  `bucket=${secrets.bucket}`,
  secrets.bearer,
  secrets.envAssignment,
  secrets.envPath,
  secrets.artifactPath,
].join(" ");

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(
  new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url),
  "utf8",
);
const statusResponseSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusResponseService.mjs", import.meta.url),
  "utf8",
);
assert.match(statusResponseSource, /from "\.\/v1ProductionStatusProjectionService\.mjs"/);
assert.match(registrySource, /createV1GoLiveStatusResponseService/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1ProductionEnvGate/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1ProductionFirstStageExecution/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1ProductionEnvFillTemplate/);

const envGate = sanitizeV1ProductionEnvGate({
  status: "blocked",
  ready: false,
  summary: { passedCount: 3, totalCount: 4, blockingCount: 1 },
  fixChecklist: [{
    key: "postgres",
    label: `PostgreSQL ${unsafeText}`,
    ownerRole: `技术运维 ${secrets.bearer}`,
    severity: "blocking",
    status: "pending",
    requiredVariables: ["ERP_V1_DATABASE_URL"],
    valueGuidance: [unsafeText],
    verificationSteps: [unsafeText],
    nextAction: unsafeText,
  }],
  nextActions: [unsafeText],
});
assert.equal(envGate.status, "blocked");
assert.equal(envGate.summary.readinessLabel, "3/4");
assert.equal(envGate.summary.blockingCount, 1);
assert.deepEqual(envGate.checks[0].requiredVariables, ["ERP_V1_DATABASE_URL"]);

const setupReport = sanitizeV1ProductionEnvSetupReport({
  scope: "v1_production_env_setup",
  status: "prepared",
  setupReady: true,
  summary: {
    label: unsafeText,
    envPreflightPassedCount: 3,
    envPreflightTotalCount: 4,
    envPreflightBlockingCount: 1,
  },
  envFile: { assignmentCount: 5, fileMode: "600" },
  setupFindings: [{ key: "unsafe", label: unsafeText, detail: unsafeText, nextAction: unsafeText }],
  commands: [{
    key: "apply",
    label: "正式合并",
    command: `node run.mjs --token cli-secret --endpoint ${secrets.endpoint} --env-file ${secrets.envPath}`,
  }],
  nextActions: [unsafeText],
});
assert.equal(setupReport.setupReady, true);
assert.equal(setupReport.summary.envPreflightLabel, "3/4");
assert.match(setupReport.commands[0].command, /<值已隐藏>|<服务地址已隐藏>|<本地路径已隐藏>|<server-path>/);

const intakeVerification = sanitizeV1ProductionEnvIntakeVerification({
  scope: "v1_production_env_intake_verify",
  status: "blocked",
  ready: false,
  summary: {
    label: unsafeText,
    intakeRowCount: 22,
    configuredRowCount: 0,
    blockingCount: 1,
    minimumBlockingTargetCount: 11,
    minimumBlockingTargetSignature: secrets.blockingSignature,
    minimumWarningTargetCount: 6,
    minimumWarningTargetSignature: secrets.warningSignature,
  },
  blockingFindings: [{
    type: "variable_row",
    key: "database",
    label: unsafeText,
    variableKey: "ERP_V1_DATABASE_URL",
    variables: ["ERP_V1_DATABASE_URL"],
    severity: "blocking",
    detail: unsafeText,
    nextAction: unsafeText,
  }],
  nextActions: [unsafeText],
});
assert.equal(intakeVerification.summary.minimumBlockingTargetSignatureIncluded, true);
assert.equal(intakeVerification.summary.minimumWarningTargetSignatureIncluded, true);
assert.equal("minimumBlockingTargetSignature" in intakeVerification.summary, false);
assert.equal("minimumWarningTargetSignature" in intakeVerification.summary, false);

const persistenceEvidence = sanitizeV1ProductionPersistenceEvidence({
  scope: "v1_production_persistence_evidence",
  status: "blocked",
  ready: false,
  summary: { label: unsafeText, passedCount: 3, totalCount: 8, blockingCount: 5 },
  stages: [{
    key: "postgres_preflight",
    label: unsafeText,
    status: "blocked",
    detail: unsafeText,
    nextAction: unsafeText,
  }],
  nextActions: [unsafeText],
});
assert.equal(persistenceEvidence.summary.passedLabel, "3/8");
assert.equal(persistenceEvidence.summary.blockingCount, 5);

const firstStage = sanitizeV1ProductionFirstStageExecution({
  scope: "v1_production_first_stage_execution",
  status: "blocked",
  ready: false,
  summary: {
    label: unsafeText,
    passedCount: 1,
    totalCount: 6,
    blockingCount: 5,
    productionEnvValuesDryRunCoverage: {
      included: true,
      stageStatus: "blocked",
      minimumBlockingTargetCount: 11,
      minimumBlockingTargetSignature: secrets.blockingSignature,
      minimumWarningTargetCount: 6,
      minimumWarningTargetSignature: secrets.warningSignature,
    },
  },
  stages: [{
    key: "env",
    label: unsafeText,
    status: "blocked",
    detail: unsafeText,
    evidence: { summaryLabel: unsafeText },
    nextActions: [unsafeText],
  }],
  nextActions: [unsafeText],
});
assert.equal(firstStage.summary.passedLabel, "1/6");
assert.equal(firstStage.dryRunCoverage.minimumBlockingTargetSignatureIncluded, true);
assert.equal(firstStage.dryRunCoverage.minimumWarningTargetSignatureIncluded, true);
assert.equal("minimumBlockingTargetSignature" in firstStage.dryRunCoverage, false);
assert.equal("minimumWarningTargetSignature" in firstStage.dryRunCoverage, false);

const todoLoadSource = {
  scope: "v1_todo_load_precheck",
  status: "ready",
  ready: true,
  checkedAt: "2026-07-13T02:00:00.000Z",
  target: {
    protocol: "https",
    loopback: false,
    apiPathValidated: true,
    embeddedCredentials: false,
    addressExposed: false,
    rawAddress: "https://erp.internal.example/api",
  },
  config: { maxP95Ms: 1000, maxErrorRate: 0.01 },
  authentication: {
    formalRuntimeSession: true,
    serverVerified: true,
    sessionType: "runtime",
    identityExposed: false,
    operatorIdentity: "SECRET-OFFICE-IDENTITY",
  },
  summary: {
    label: "5/5 通过",
    requestCount: 100,
    successCount: 100,
    errorCount: 0,
    errorRate: 0,
    throughputPerSecond: 125.5,
    latencyMs: { p50: 120, p95: 240, max: 320 },
    snapshotChanged: false,
  },
  blockingStages: [],
  warnings: [],
  safeguards: {
    explicitReadLoadConfirmation: true,
    businessReadOnly: true,
    businessDataMutated: false,
    requestCountBounded: true,
    concurrencyBounded: true,
    responsePayloadStored: false,
    todoIdentityStored: false,
    credentialsExposed: false,
    apiAddressExposed: false,
    physicalPrinterCalled: false,
  },
  responsePayload: "SECRET-TODO-PAYLOAD",
};
const todoLoad = sanitizeV1TodoLoadPrecheck(todoLoadSource, { now: "2026-07-13T03:00:00.000Z" });
assert.equal(todoLoad.status, "ready");
assert.equal(todoLoad.ready, true);
assert.equal(todoLoad.freshness.fresh, true);
assert.equal(todoLoad.freshness.ageHours, 1);
assert.equal(todoLoad.target.ready, true);
assert.equal(todoLoad.authentication.ready, true);
assert.equal(todoLoad.safeguards.ready, true);
assert.equal(todoLoad.summary.successLabel, "100/100");
assert.equal(todoLoad.summary.throughputLabel, "125.5 次/秒");
assert.equal(todoLoad.summary.latencyMs.p95, 240);

const staleTodoLoad = sanitizeV1TodoLoadPrecheck(todoLoadSource, { now: "2026-07-17T03:00:00.000Z" });
assert.equal(staleTodoLoad.status, "blocked");
assert.equal(staleTodoLoad.ready, false);
assert.equal(staleTodoLoad.freshness.fresh, false);
assert.match(staleTodoLoad.nextAction, /超过 72 小时/);

const unsafeTodoLoad = sanitizeV1TodoLoadPrecheck({
  ...todoLoadSource,
  safeguards: { ...todoLoadSource.safeguards, businessDataMutated: true },
}, { now: "2026-07-13T03:00:00.000Z" });
assert.equal(unsafeTodoLoad.status, "blocked");
assert.equal(unsafeTodoLoad.ready, false);
assert.equal(unsafeTodoLoad.safeguards.ready, false);
assert.match(unsafeTodoLoad.nextAction, /只读/);

const fillTemplate = sanitizeV1ProductionEnvFillTemplate([
  "ERP_V1_DATABASE_ADAPTER=postgres",
  `ERP_V1_DATABASE_URL=${secrets.databaseUrl}`,
  "ERP_V1_ATTACHMENT_STORAGE_ADAPTER=object_storage",
  `ERP_V1_ATTACHMENT_STORAGE_ENDPOINT=${secrets.endpoint}`,
  `ERP_V1_ATTACHMENT_STORAGE_BUCKET=${secrets.bucket}`,
  `ERP_AUTH_SECRET=${secrets.envAssignment}`,
  "ERP_V1_PRINT_DRIVER_ENABLED=true",
  "ERP_V1_PRINT_DRIVER_MODE=command_bridge",
  "ERP_V1_PRINT_DRIVER_COMMAND=cups_lp",
].join("\n"));
assert.match(fillTemplate.previewLines.join("\n"), /ERP_V1_DATABASE_ADAPTER=postgres/);
assert.match(fillTemplate.previewLines.join("\n"), /ERP_V1_ATTACHMENT_STORAGE_ADAPTER=object_storage/);
assert.match(fillTemplate.previewLines.join("\n"), /ERP_V1_PRINT_DRIVER_ENABLED=true/);
assert.match(fillTemplate.previewLines.join("\n"), /ERP_V1_PRINT_DRIVER_MODE=command_bridge/);
assert.match(fillTemplate.previewLines.join("\n"), /ERP_V1_PRINT_DRIVER_COMMAND=cups_lp/);
assert.match(fillTemplate.previewLines.join("\n"), /ERP_V1_DATABASE_URL=<待填写>/);

const serialized = JSON.stringify({
  envGate,
  setupReport,
  intakeVerification,
  persistenceEvidence,
  firstStage,
  todoLoad,
  fillTemplate,
});
for (const secret of Object.values(secrets)) {
  assert.equal(serialized.includes(secret), false, `${secret} must not enter production status projections`);
}

console.log(
  "V1 production-status projection service checks passed: env, persistence, first-stage, todo-load capacity, freshness, and redaction are isolated.",
);
