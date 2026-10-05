import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { createSeedSession } from "../server/authSeed.mjs";
import {
  buildProductionGoLivePrecheckReport,
  formatProductionGoLivePrecheckReport,
} from "./run-v1-production-go-live-precheck.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import {
  buildPassedPrinterDeviceFieldTest as buildPassedPrinterDeviceFieldTestFixture,
  seedPrintedPrintReadinessJobs,
} from "./helpers/printReadinessTestFixture.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-go-live-precheck");
const spoolRoot = join(storageRoot, "spool");
const envFilePath = join(storageRoot, "prod.env");
const setupJsonPath = join(storageRoot, "production-env-setup.json");
const intakeCsvPath = join(storageRoot, "production-env-real-value-intake.csv");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-go-live-precheck.mjs");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");
const sensitiveValues = [
  "postgres://v1_user:pass@prod-db.internal:5432/erp",
  "https://oss-secret.example.com",
  "erp-v1-private-bucket",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "https://statement-oss-secret.example.com",
  "erp-v1-statement-private-bucket",
  "AKIA_PROD_STATEMENT_SECRET",
  "SUPER_STATEMENT_SECRET_VALUE",
  "/usr/local/bin/node-secret",
  "/var/spool/erp-secret",
  "/usr/bin/lpstat-secret",
  "v1.precheck.office",
  "SUPER_SECRET_PRECHECK_OFFICE_PASSWORD",
  "v1.precheck.driver",
  "SUPER_SECRET_PRECHECK_DRIVER_PASSWORD",
];
const officeDemoToken = createSeedSession("U-OFFICE-A").accessToken;
const driverDemoToken = createSeedSession("U-DRIVER-A").accessToken;
sensitiveValues.push(officeDemoToken, driverDemoToken);

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(spoolRoot, { recursive: true });
const printedPrintJobs = seedPrintedPrintReadinessJobs({
  storageRoot,
  idPrefix: "PJ-V1-PROD-PRECHECK",
});

const productionEnv = {
  ERP_RUNTIME_MODE: "production",
  ERP_V1_PERSISTENCE_PROFILE: "postgres",
  ERP_V1_DATABASE_URL: sensitiveValues[0],
  ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: "postgres://v1_restore:pass@restore-db.internal:5432/erp_restore",
  ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "false",
  ERP_V1_FILE_STORAGE_PROFILE: "object_storage",
  ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER: "s3_compatible",
  ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: sensitiveValues[1],
  ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveValues[2],
  ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveValues[3],
  ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveValues[4],
  ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: "prod-attachments",
  ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT: "https://statement-oss-secret.example.com",
  ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET: "erp-v1-statement-private-bucket",
  ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID: "AKIA_PROD_STATEMENT_SECRET",
  ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY: "SUPER_STATEMENT_SECRET_VALUE",
  ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX: "prod-statements",
  ERP_SYSTEM_PRINTER_ENABLED: "true",
  ERP_SYSTEM_PRINTER_ADAPTER: "command_bridge",
  ERP_SYSTEM_PRINTER_COMMAND: sensitiveValues[5],
  ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON: JSON.stringify([
    "scripts/print-command-bridge.mjs",
    "--print-job-id",
    "{printJobId}",
  ]),
  ERP_SYSTEM_PRINTER_ALLOWLIST: "PRN-LABEL-A,PRN-DOT-A",
  ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR: sensitiveValues[6],
  ERP_PRINT_COMMAND_BRIDGE_MODE: "cups_lp",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST: "标签机A,针式打印机A",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER: "标签机A",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND: sensitiveValues[7],
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON: JSON.stringify(["-p", "{cupsPrinterName}"]),
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS: "5000",
  ERP_V1_READINESS_OPERATOR_ID: "U-OFFICE-A",
  ERP_V1_READINESS_TOKEN: officeDemoToken,
  ERP_V1_READINESS_LOGIN_NAME: sensitiveValues[12],
  ERP_V1_READINESS_PASSWORD: sensitiveValues[13],
  ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-DRIVER-A",
  ERP_V1_READINESS_DRIVER_TOKEN: driverDemoToken,
  ERP_V1_READINESS_DRIVER_LOGIN_NAME: sensitiveValues[14],
  ERP_V1_READINESS_DRIVER_PASSWORD: sensitiveValues[15],
  ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR: ".erp-local-storage/v1-field-acceptance",
};

writeEnvFile(envFilePath, productionEnv);
writeProductionEnvIntakeCsv(intakeCsvPath);
chmodSync(envFilePath, 0o600);
writeFileSync(
  setupJsonPath,
  `${JSON.stringify(
    {
      scope: "v1_production_env_setup",
      setupReady: true,
      checkedAt: new Date(Date.now() + 60_000).toISOString(),
      envFile: {
        path: envFilePath,
        gitIgnored: true,
        gitTracked: false,
        fileMode: "600",
      },
    },
    null,
    2,
  )}\n`,
);

const syntheticInput = {
  envFileCount: 1,
  envFileAudit: {
    status: "passed",
    ready: true,
    summary: { label: "1 个 env 文件安全审计通过", blockingCount: 0, warningCount: 0 },
    blockingFindings: [],
  },
  envIntakeVerification: {
    status: "ready",
    ready: true,
    summary: { label: "生产 env 真实值 intake 校验通过", blockingCount: 0, warningCount: 0 },
    blockingFindings: [],
    nextActions: [],
  },
  envPreflight: {
    status: "ready",
    ready: true,
    summary: { label: "10/10 通过", passedCount: 10, totalCount: 10, blockingCount: 0, warningCount: 0 },
    blockingCriteria: [],
    fixChecklist: [
      {
        key: "v1-persistence-profile",
        label: "统一 V1 持久化 profile",
        ownerRole: "技术/管理",
        severity: "ok",
        configuredVariableCount: 3,
        totalVariableCount: 3,
        missingVariables: [],
        placeholderVariables: [],
        placeholderVariableCount: 0,
        valueGuidance: ["生产库 DSN 来自技术/管理确认的 PostgreSQL 实例。"],
        verificationSteps: ["node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file --json"],
        nextAction: "继续运行 runtime readiness。",
      },
    ],
  },
  runtimeReadiness: buildSyntheticProductionRuntimeReadiness(),
};
const syntheticReady = buildProductionGoLivePrecheckReport(syntheticInput);
assert.equal(syntheticReady.status, "ready");
assert.equal(syntheticReady.ready, true);
assert.equal(syntheticReady.summary.label, "5/5 通过");
assert.equal(syntheticReady.stages.find((item) => item.key === "runtime-production-profile")?.status, "passed");
assert.equal(syntheticReady.stages.find((item) => item.key === "runtime-production-profile")?.summary.label, "6/6 通过");
const missingRoleAccountRuntime = structuredClone(syntheticInput.runtimeReadiness);
missingRoleAccountRuntime.systemPersistence.runtimeEmployeeAccountReadiness = {
  ready: false,
  requiredRoleCount: 8,
  coveredRoleCount: 7,
  missingRoleCount: 1,
  formalAccountCount: 7,
  readyFormalAccountCount: 7,
  roles: [],
};
const syntheticMissingRoleAccount = buildProductionGoLivePrecheckReport({
  ...syntheticInput,
  runtimeReadiness: missingRoleAccountRuntime,
});
assert.equal(syntheticMissingRoleAccount.ready, false);
assert.equal(syntheticMissingRoleAccount.stages.find((item) => item.key === "runtime-production-profile")?.status, "pending");
assert.ok(
  syntheticMissingRoleAccount.stages
    .find((item) => item.key === "runtime-production-profile")
    ?.blockingItems.some((item) => item.key === "runtime-formal-role-account-coverage"),
  "production profile stage should block when a required formal role account is missing",
);
assert.ok(
  syntheticReady.stages
    .find((item) => item.key === "runtime-production-profile")
    ?.checks.some((item) => item.key === "runtime-production-env-file-applied" && item.status === "passed"),
  "production profile stage should require current API startup env application",
);
assert.equal(syntheticReady.safeguards.productionEnvAppliedToProcess, true);
assert.equal(syntheticReady.unblockChecklist.length, 5);
assert.equal(syntheticReady.fieldEvidenceCoverage.summary.totalCount, 10);
assert.equal(syntheticReady.fieldEvidenceCoverage.summary.reportSupportedCount, 2);
assert.equal(syntheticReady.fieldEvidenceCoverage.summary.reportSupportedLabel, "2/10");
assert.ok(
  syntheticReady.fieldEvidenceCoverage.items.some(
    (item) => item.itemKey === "production_env_preflight_10_of_10" && item.status === "report_supported",
  ),
  "production env 10/10 evidence item should be supported by a ready production env preflight",
);
assert.ok(
  syntheticReady.fieldEvidenceCoverage.items.some(
    (item) => item.itemKey === "postgres_backup_configured" && item.status === "onsite_required",
  ),
  "database backup evidence should remain onsite-required and not be auto-covered by precheck",
);
assert.ok(
  syntheticReady.fieldEvidenceCoverage.items.some(
    (item) =>
      item.itemKey === "postgres_migration_applied" &&
      item.nextAction.includes("run-v1-production-postgres-preflight.mjs"),
  ),
  "PostgreSQL migration evidence should point operators to the production PostgreSQL preflight",
);
assert.ok(
  syntheticReady.fieldEvidenceCoverage.items.some(
    (item) =>
      item.itemKey === "attachment_upload_readback_checked" &&
      item.nextAction.includes("run-v1-production-object-storage-preflight"),
  ),
  "attachment object-storage evidence should point operators to the production object-storage preflight",
);
assert.ok(
  syntheticReady.fieldEvidenceCoverage.items.some(
    (item) =>
      item.itemKey === "statement_export_storage_checked" &&
      item.nextAction.includes("run-v1-production-object-storage-preflight"),
  ),
  "statement export object-storage evidence should point operators to the production object-storage preflight",
);
assert.ok(syntheticReady.unblockChecklist.every((item) => item.ready === true), "synthetic ready unblock checklist should be all ready");
assert.ok(
  syntheticReady.unblockChecklist.every((item) => item.verificationSteps.length > 0 && item.evidenceToKeep.length > 0),
  "unblock checklist should include verification and evidence guidance",
);
assert.ok(
  syntheticReady.fixChecklist[0].valueGuidance.some((item) => item.includes("PostgreSQL")),
  "go-live report should preserve env value guidance",
);
assert.ok(
  syntheticReady.fixChecklist[0].verificationSteps.some((item) => item.includes("run-v1-production-env-preflight")),
  "go-live report should preserve env verification steps",
);
assert.match(formatProductionGoLivePrecheckReport(syntheticReady), /Stage unblock checklist/);
assert.match(formatProductionGoLivePrecheckReport(syntheticReady), /Field evidence coverage: 2\/10/);

const server = createApiServer({ allowLocalFixture: true,
  attachmentRepositoryOptions: { storageRoot },
  attachmentAccessAuditRepositoryOptions: { storageRoot },
  attachmentObjectStorageOptions: { storageRoot },
  attachmentV1ReadinessOptions: {
    localFsAccepted: true,
    acceptanceReference: "automated V1 production go-live precheck local storage fixture",
  },
  systemV1ReadinessOptions: {
    localPersistenceAccepted: true,
    acceptanceReference: "automated V1 production go-live precheck local persistence fixture",
  },
  printDeviceRepositoryOptions: { storageRoot },
  printJobRepositoryOptions: { storageRoot },
  printerDeviceFieldTestRepositoryOptions: { storageRoot },
  printDriverAdapterOptions: {
    systemPrinterEnabled: true,
    systemPrinterAdapterKind: "command_bridge",
    systemPrinterCommand: process.execPath,
    systemPrinterCommandArgs: [
      printCommandBridgeScript,
      "--storage-root",
      storageRoot,
      "--cups-status-command",
      process.execPath,
      "--cups-status-args-json",
      JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
    ],
    commandBridgeSpoolDir: spoolRoot,
    allowedPrinterNames: ["PRN-LABEL-A", "PRN-DOT-A", "标签机A", "针式打印机A"],
  },
});

try {
  await listenTestServer(server);
  const baseUrl = `${getTestServerBaseUrl(server)}/api`;
  const blockedRun = await runPrecheck(baseUrl);
  assert.equal(blockedRun.status, 2, runFailureMessage("precheck should be blocked before field evidence is prepared", blockedRun));
  const blockedReport = JSON.parse(blockedRun.stdout);
  assert.equal(blockedReport.status, "blocked");
  assert.equal(blockedReport.ready, false);
  assert.equal(blockedReport.stages.find((item) => item.key === "production-env-file-audit")?.status, "passed");
  assert.equal(blockedReport.stages.find((item) => item.key === "production-env-intake-verify")?.status, "passed");
  assert.equal(blockedReport.stages.find((item) => item.key === "production-env-preflight")?.status, "passed");
  assert.equal(blockedReport.stages.find((item) => item.key === "runtime-v1-readiness")?.status, "pending");
  assert.equal(blockedReport.stages.find((item) => item.key === "runtime-production-profile")?.status, "pending");
  assert.equal(blockedReport.unblockChecklist.length, 5);
  assert.equal(blockedReport.fieldEvidenceCoverage.summary.totalCount, 10);
  assert.ok(
    blockedReport.fieldEvidenceCoverage.items.some(
      (item) => item.itemKey === "production_env_preflight_10_of_10" && item.status === "report_supported",
    ),
    "blocked runtime report should still expose env evidence coverage when env preflight is ready",
  );
  assert.ok(
    blockedReport.fieldEvidenceCoverage.items.some((item) => item.status === "waiting_for_stage"),
    "blocked report should identify evidence items that are waiting for a stage",
  );
  assert.ok(blockedReport.unblockChecklist.some((item) => item.key === "production-env-file-audit" && item.ready === true));
  assert.ok(blockedReport.unblockChecklist.some((item) => item.key === "runtime-production-profile" && item.ready === false));
  assert.ok(
    blockedReport.stages
      .find((item) => item.key === "runtime-production-profile")
      ?.blockingItems.some((item) => item.key === "runtime-production-env-file-applied"),
    "blocked runtime report should require startup application of the audited production env file",
  );
  assert.ok(
    blockedReport.unblockChecklist
      .find((item) => item.key === "runtime-production-profile")
      ?.verificationSteps.some((item) => item.includes("run-v1-production-go-live-precheck")),
    "runtime production profile unblock item should include the go-live precheck verification command",
  );
  assert.ok(
    blockedReport.fixChecklist.every((item) => Array.isArray(item.valueGuidance) && Array.isArray(item.verificationSteps)),
    "server-side env fix checklist should keep guidance arrays through the go-live precheck",
  );
  assert.equal(blockedReport.safeguards.productionEnvAppliedToProcess, false);
  assert.equal(blockedReport.safeguards.releaseCandidateRefreshed, false);
  assert.equal(blockedReport.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(blockedReport.safeguards.envValuesExposed, false);
  assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr);

  const setupBlockedRun = await runPrecheck(baseUrl, { useProductionEnvSetupEnvFile: true });
  assert.equal(setupBlockedRun.status, 2, runFailureMessage("setup env-file precheck should still be blocked before field evidence", setupBlockedRun));
  const setupBlockedReport = JSON.parse(setupBlockedRun.stdout);
  assert.equal(setupBlockedReport.envFileSource, "production_env_setup");
  assert.equal(setupBlockedReport.envFileFromProductionSetup, true);
  assert.equal(setupBlockedReport.safeguards.envFileReadFromProductionSetup, true);
  assert.equal(setupBlockedReport.stages.find((item) => item.key === "production-env-file-audit")?.status, "passed");
  assert.equal(setupBlockedReport.stages.find((item) => item.key === "production-env-intake-verify")?.status, "passed");
  assert.doesNotMatch(setupBlockedRun.stdout, new RegExp(escapeRegExp(envFilePath)), "setup-source precheck should not print env file path");
  assertNoSensitiveOutput(setupBlockedRun.stdout + setupBlockedRun.stderr);

  await preparePositiveReadiness(baseUrl);

  const labReadyButProductionBlockedRun = await runPrecheck(baseUrl);
  assert.equal(
    labReadyButProductionBlockedRun.status,
    2,
    runFailureMessage("lab 11/11 runtime readiness should still be blocked for production go-live", labReadyButProductionBlockedRun),
  );
  const labReport = JSON.parse(labReadyButProductionBlockedRun.stdout);
  assert.equal(labReport.status, "blocked");
  assert.equal(labReport.ready, false);
  assert.equal(labReport.summary.label, "4/5 通过");
  assert.equal(labReport.stages.find((item) => item.key === "runtime-v1-readiness")?.status, "passed");
  const profileStage = labReport.stages.find((item) => item.key === "runtime-production-profile");
  assert.equal(profileStage?.status, "pending");
  const profileUnblockItem = labReport.unblockChecklist.find((item) => item.key === "runtime-production-profile");
  assert.equal(profileUnblockItem?.ready, false);
  assert.match(profileUnblockItem?.nextAction || "", /本地接受旁路|PostgreSQL|object_storage/);
  assert.ok(profileUnblockItem?.evidenceToKeep.some((item) => item.includes("生产上线组合预检")));
  assert.ok(
    profileStage?.blockingItems.some((item) => item.key === "no-local-persistence-acceptance"),
    "production profile stage should block local persistence acceptance",
  );
  assert.ok(
    profileStage?.blockingItems.some((item) => item.key === "runtime-production-env-file-applied"),
    "production profile stage should block when current API has not applied the audited production env file",
  );
  assert.ok(
    profileStage?.blockingItems.some((item) => item.key === "no-local-attachment-acceptance"),
    "production profile stage should block local attachment acceptance",
  );
  assert.equal(labReport.runtimeReadiness.ready, true);
  assert.equal(labReport.runtimeReadiness.systemPersistence.localPersistenceAcceptedForV1, true);
  assert.equal(labReport.runtimeReadiness.attachmentReadiness.storageMode.localFsAcceptedForV1, true);
  assertNoSensitiveOutput(labReadyButProductionBlockedRun.stdout + labReadyButProductionBlockedRun.stderr);

  const textRun = await runPrecheck(baseUrl, { json: false });
  assert.equal(textRun.status, 2, runFailureMessage("text precheck should still be blocked by production profile", textRun));
  assert.match(textRun.stdout, /V1 production go-live precheck: BLOCKED/);
  assert.match(textRun.stdout, /生产 env 真实值 intake 校验/);
  assert.match(textRun.stdout, /当前 API 生产 profile 确认/);
  assert.match(textRun.stdout, /Stage unblock checklist/);
  assert.match(textRun.stdout, /Evidence:/);
  assert.match(textRun.stdout, /Field evidence coverage:/);
  assert.match(textRun.stdout, /Production env applied to current process: no/);
  assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

  console.log(
    "V1 production go-live precheck check passed: synthetic ready, env-file/preflight, lab-runtime block, text output, safeguards, and redaction are covered.",
  );
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
  rmSync(storageRoot, { recursive: true, force: true });
}

function buildSyntheticProductionRuntimeReadiness() {
  return {
    status: "ready",
    ready: true,
    summary: { label: "11/11 通过", passedCount: 11, totalCount: 11, blockingCount: 0 },
    criteria: [],
    blockingCriteria: [],
    systemPersistence: {
      status: "ready",
      ready: true,
      summary: { label: "8/8 通过", passedCount: 8, totalCount: 8, blockingCount: 0 },
      localPersistenceAcceptance: { accepted: false },
      safeguards: { localPersistenceAcceptedForV1: false },
      runtimeEmployeeAccountReadiness: {
        ready: true,
        requiredRoleCount: 8,
        coveredRoleCount: 8,
        missingRoleCount: 0,
        formalAccountCount: 8,
        readyFormalAccountCount: 8,
        roles: [],
      },
      repositories: [
        { key: "orderRepository", kind: "postgres", productionReady: true, localKind: false },
        { key: "attachmentStorage", kind: "object_storage", productionReady: true, localKind: false },
      ],
    },
    attachmentStorage: {
      status: "ready",
      ready: true,
      storageKind: "object_storage",
    },
    attachmentReadiness: {
      status: "ready",
      ready: true,
      summary: { label: "5/5 通过", passedCount: 5, totalCount: 5, blockingCount: 0 },
      storageMode: {
        storageKind: "object_storage",
        storageProvider: "s3_compatible",
        objectStorageLive: true,
        localFsAcceptedForV1: false,
      },
      safeguards: { localStorageAcceptedForV1: false },
    },
    productionEnvFileApplication: {
      status: "applied",
      ready: true,
      applied: true,
      selectedSourceKind: "primary",
      configuredEnvFileCount: 1,
      configuredApplicationSourceVariableCount: 1,
      configuredAuditOnlySourceVariableCount: 0,
      fallbackSourceUsed: false,
      auditOnlySourceConfigured: false,
      ignoredConfiguredFallbackVariableCount: 0,
      assignmentCount: 49,
      auditReady: true,
      auditStatus: "passed",
      auditBlockingCount: 0,
      auditWarningCount: 0,
      safeguards: {
        auditRequiredBeforeApply: true,
        auditOnlyPathApplied: false,
        frontendPathAccepted: false,
        envFilePathExposed: false,
        rawEnvFileIncluded: false,
        envValuesIncluded: false,
        secretValuesIncluded: false,
        commandValuesIncluded: false,
        connectionStringExposed: false,
        objectStorageEndpointExposed: false,
        objectStorageBucketExposed: false,
        localPathExposed: false,
      },
    },
    safeguards: {
      nonMutating: true,
      physicalPrinterCalled: false,
      driverReadOnly: true,
    },
  };
}

async function preparePositiveReadiness(baseUrl) {
  const labelDevices = await getJson(baseUrl, "/print-devices?documentType=express_ltl_label");
  const labelDevice = labelDevices.items?.find((device) => device.printDeviceId === "PRN-LABEL-A");
  const dotDevices = await getJson(baseUrl, "/print-devices?documentType=delivery_note");
  const dotDevice = dotDevices.items?.find((device) => device.printDeviceId === "PRN-DOT-A");
  assert.ok(labelDevice, "positive readiness setup missed label printer");
  assert.ok(dotDevice, "positive readiness setup missed dot-matrix printer");
  await postJson(baseUrl, "/print-devices", {
    ...labelDevice,
    settings: { ...(labelDevice.settings ?? {}), driverMode: "system_printer" },
    operatorId: "U-OFFICE-A",
  });
  await postJson(baseUrl, "/print-devices", {
    ...dotDevice,
    settings: { ...(dotDevice.settings ?? {}), driverMode: "system_printer" },
    operatorId: "U-OFFICE-A",
  });
  await postJson(
    baseUrl,
    "/print-devices/PRN-LABEL-A/field-tests",
    buildPassedPrinterDeviceFieldTest({
      recordId: "PDQA-V1-PROD-PRECHECK-LABEL-A",
      printDeviceId: "PRN-LABEL-A",
      printJobId: printedPrintJobs.label.printJobId,
      documentType: "express_ltl_label",
      deviceLabel: "标签机A",
      driverLabel: "Generic 203dpi Label",
      paperLabel: "80x60 热敏标签",
    }),
  );
  await postJson(
    baseUrl,
    "/print-devices/PRN-DOT-A/field-tests",
    buildPassedPrinterDeviceFieldTest({
      recordId: "PDQA-V1-PROD-PRECHECK-DOT-A",
      printDeviceId: "PRN-DOT-A",
      printJobId: printedPrintJobs.dotMatrix.printJobId,
      documentType: "delivery_note",
      deviceLabel: "针式打印机A",
      driverLabel: "Generic Dot Matrix",
      paperLabel: "连续二联针式纸",
    }),
  );
  const driverTasks = await getDriverJson(baseUrl, "/driver/delivery-tasks?pageSize=1");
  const driverTask = driverTasks.items?.[0];
  assert.ok(driverTask?.fulfillmentId, "positive readiness setup missed driver delivery task");
  const expectedPackageId = driverTask.packageChecklist?.[0]?.packageId || `${driverTask.fulfillmentId}-PKG-1`;
  await postDriverJson(
    baseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(driverTask.fulfillmentId)}/device-field-tests`,
    buildPassedDriverDeviceFieldTest({
      fulfillmentId: driverTask.fulfillmentId,
      orderLineId: driverTask.orderLineId,
      expectedPackageId,
    }),
  );
}

function buildPassedPrinterDeviceFieldTest(input) {
  return buildPassedPrinterDeviceFieldTestFixture({
    ...input,
    checkedAt: "2026-07-04T10:00:00.000Z",
    note: "V1 production go-live precheck positive check",
  });
}

function buildPassedDriverDeviceFieldTest({ fulfillmentId, orderLineId, expectedPackageId }) {
  return {
    recordId: `DQA-V1-PROD-PRECHECK-${fulfillmentId}`,
    fulfillmentId,
    orderLineId,
    driverId: "U-DRIVER-A",
    operatorId: "U-DRIVER-A",
    operatorName: "司机A",
    checkedAt: "2026-07-04T10:10:00.000Z",
    deviceLabel: "Android field shell",
    browserLabel: "ERP Driver Native Shell",
    userAgent: "ERPDriverNative/1.0 Android",
    language: "zh-CN",
    checks: [
      { key: "camera_permission", status: "passed" },
      { key: "watermark_photo", status: "passed" },
      { key: "package_label_scan", status: "passed" },
      { key: "geolocation", status: "passed" },
      { key: "file_upload", status: "passed" },
      { key: "navigation", status: "passed" },
    ],
    packageLabelScanSample: {
      sampleId: `DPLS-V1-PROD-PRECHECK-${fulfillmentId}`,
      fulfillmentId,
      expectedPackageId,
      scannedText: expectedPackageId,
      matchedPackageId: expectedPackageId,
      method: "native_sdk",
      result: "matched",
      requestId: `DNPS-V1-PROD-PRECHECK-${fulfillmentId}`,
      source: "native_sdk",
      message: "原生扫码 SDK 已扫真实纸质包裹标签",
      checkedAt: "2026-07-04T10:09:59.000Z",
    },
    nativeNavigationSample: {
      requestId: `DNN-V1-PROD-PRECHECK-${fulfillmentId}`,
      fulfillmentId,
      status: "opened",
      source: "native_navigation_sdk",
      mapApp: "高德地图",
      checkedAt: "2026-07-04T10:10:00.000Z",
    },
    nativeBridgeDiagnostics: {
      items: [
        {
          key: "native_package_scan",
          label: "原生扫码",
          target: "包裹标签",
          supported: true,
          statusLabel: "可用",
          tone: "success",
          bridgeType: "android_interface",
          bridgeTypeLabel: "Android JSON",
          version: "p0-driver-native-bridge-v1",
        },
        {
          key: "native_navigation",
          label: "原生导航",
          target: "地图打开",
          supported: true,
          statusLabel: "可用",
          tone: "success",
          bridgeType: "android_interface",
          bridgeTypeLabel: "Android JSON",
          version: "p0-driver-native-navigation-bridge-v1",
        },
      ],
      total: 2,
      supportedCount: 2,
      issueCount: 0,
      tone: "success",
      label: "原生能力可用",
      message: "原生壳桥接已接入。",
    },
    note: "V1 production go-live precheck positive driver native shell check",
  };
}

function writeEnvFile(path, env) {
  writeFileSync(
    path,
    [
      "# V1 production go-live precheck fixture",
      ...Object.entries(env).map(([key, value]) => `${key}='${String(value).replace(/'/g, "'\\''")}'`),
      "",
    ].join("\n"),
  );
}

function writeProductionEnvIntakeCsv(path) {
  const headers = [
    "itemKey",
    "label",
    "ownerRole",
    "severity",
    "status",
    "variableKey",
    "alternativeGroup",
    "alternativeRule",
    "sourceSystem",
    "expectedValueType",
    "safeLiteralValue",
    "filled",
    "verified",
    "evidenceRef",
    "fillStatus",
    "verifiedStatus",
    "verificationSteps",
    "nextAction",
  ];
  const rows = [
    intakeRow({
      itemKey: "v1-persistence-profile",
      label: "统一 V1 持久化 profile",
      variableKey: "ERP_V1_DATABASE_URL",
      alternativeGroup: "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
      sourceSystem: "PostgreSQL 生产库 / 持久化 profile",
      expectedValueType: "PostgreSQL 连接串",
      nextAction: "任选其一，优先使用 ERP_V1_DATABASE_URL。",
    }),
    intakeRow({
      itemKey: "postgres-restore-validation-env",
      label: "PostgreSQL 恢复验证库环境变量",
      variableKey: "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
      sourceSystem: "PostgreSQL 专用恢复验证库",
      expectedValueType: "PostgreSQL 连接串",
      nextAction: "补齐专用恢复验证库 URL。",
    }),
    ...[
      "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
      "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
      "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ].map((variableKey) =>
      intakeRow({
        itemKey: "attachment-object-storage-env",
        label: "附件对象存储环境变量",
        variableKey,
        sourceSystem: "附件对象存储 bucket",
        expectedValueType: variableKey.includes("ENDPOINT") ? "http/https URL" : "对象存储真实值",
        nextAction: "补齐附件对象存储 endpoint、bucket、access key 和 secret key。",
      }),
    ),
    ...[
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ].map((variableKey) =>
      intakeRow({
        itemKey: "statement-export-object-storage-env",
        label: "对账导出对象存储环境变量",
        variableKey,
        sourceSystem: "对账导出对象存储 bucket",
        expectedValueType: variableKey.includes("ENDPOINT") ? "http/https URL" : "对象存储真实值",
        nextAction: "补齐对账导出对象存储 4 个变量。",
      }),
    ),
    ...["ERP_SYSTEM_PRINTER_COMMAND", "ERP_SYSTEM_PRINTER_ALLOWLIST", "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR"].map(
      (variableKey) =>
        intakeRow({
          itemKey: "system-printer-command-bridge-env",
          label: "系统打印 command_bridge 环境变量",
          variableKey,
          sourceSystem: "办公室打印桥 / 命令桥",
          expectedValueType: "命令 / 队列 / spool 真实值",
          nextAction: "补齐打印命令桥开关、命令、JSON 参数、设备 allowlist 和 spool 目录。",
        }),
    ),
    ...["ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST", "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND"].map((variableKey) =>
      intakeRow({
        itemKey: "cups-preflight-env",
        label: "CUPS 队列预检环境变量",
        variableKey,
        sourceSystem: "CUPS 真实打印队列",
        expectedValueType: "队列 / 命令真实值",
        nextAction: "补齐 CUPS 模式、队列 allowlist、状态命令和 JSON 参数。",
      }),
    ),
  ];
  writeFileSync(path, `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`);
}

function intakeRow({
  itemKey,
  label,
  variableKey,
  alternativeGroup = "",
  sourceSystem,
  expectedValueType,
  nextAction,
}) {
  return [
    itemKey,
    label,
    "技术/管理",
    "blocking",
    "pending",
    variableKey,
    alternativeGroup,
    alternativeGroup ? "任选其一，优先使用 ERP_V1_DATABASE_URL。" : "填写真实生产值",
    sourceSystem,
    expectedValueType,
    "",
    "yes",
    "yes",
    "EVT-PROD-GO-LIVE-PRECHECK-FIXTURE",
    "已填写",
    "已验收",
    "node scripts/run-v1-production-env-intake-verify.mjs --use-production-env-setup-env-file --json",
    nextAction,
  ];
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function runPrecheck(baseUrl, options = {}) {
  const args = [
    runnerScript,
    "--production-env-intake-csv",
    intakeCsvPath,
    "--api-base-url",
    baseUrl,
    "--operator-id",
    "U-OFFICE-A",
    "--driver-operator-id",
    "U-DRIVER-A",
  ];
  if (options.useProductionEnvSetupEnvFile) {
    args.splice(1, 0, "--use-production-env-setup-env-file", "--production-env-setup-json", setupJsonPath);
  } else {
    args.splice(1, 0, "--env-file", envFilePath);
  }
  if (options.json !== false) args.push("--json");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("production go-live precheck process timed out after 45000ms"));
    }, 45000);
    timeout.unref?.();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  for (const value of sensitiveValues) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)), `precheck output leaked sensitive value: ${value}`);
  }
  assert.doesNotMatch(output, new RegExp(escapeRegExp(envFilePath)), "precheck output leaked env file path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(storageRoot)), "precheck output leaked storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(spoolRoot)), "precheck output leaked spool root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(process.execPath)), "precheck output leaked node command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(printCommandBridgeScript)), "precheck output leaked bridge command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fakeCupsStatusScript)), "precheck output leaked fake CUPS command path");
}

async function getJson(baseUrl, route) {
  return fetchJson(baseUrl, route, {
    headers: { "x-erp-user-id": "U-OFFICE-A" },
  });
}

async function getDriverJson(baseUrl, route) {
  return fetchJson(baseUrl, route, {
    headers: { "x-erp-user-id": "U-DRIVER-A" },
  });
}

async function postJson(baseUrl, route, body) {
  return fetchJson(baseUrl, route, {
    method: "POST",
    headers: { "content-type": "application/json", "x-erp-user-id": "U-OFFICE-A" },
    body: JSON.stringify(body),
  });
}

async function postDriverJson(baseUrl, route, body) {
  return fetchJson(baseUrl, route, {
    method: "POST",
    headers: { "content-type": "application/json", "x-erp-user-id": "U-DRIVER-A" },
    body: JSON.stringify(body),
  });
}

async function fetchJson(baseUrl, route, options = {}) {
  const result = await requestJson(`${baseUrl}/`, route.replace(/^\/+/, ""), {
    ...options,
    closeConnection: true,
    expectedStatus: "ok",
    timeoutMs: 10_000,
  });
  return result.body;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
