import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-preflight");
const envFilePath = join(storageRoot, "prod.env");
const setupJsonPath = join(storageRoot, "production-env-setup.json");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-env-preflight.mjs");
const sensitiveValues = [
  "postgres://v1_user:pass@prod-db.internal:5432/erp",
  "postgres://restore_user:restore-pass@restore-db.internal:5432/erp_restore",
  "https://oss-secret.example.com",
  "erp-v1-private-bucket",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/usr/local/bin/node-secret",
  "/var/spool/erp-secret",
  "/usr/bin/lpstat-secret",
  "mysql://v1_user:pass@prod-db.internal:3306/erp",
  "ftp://oss-secret.example.com",
  "https://bucket-name-should-not-be-url.example.com/path",
  "not-a-production-api-url",
  "https://bad-prefix.example.com/path",
  "../secret-prefix",
];

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

const baseEnv = {
  PATH: process.env.PATH ?? "",
};
const productionEnv = {
  ERP_V1_PERSISTENCE_PROFILE: "postgres",
  ERP_V1_DATABASE_URL: sensitiveValues[0],
  ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveValues[1],
  ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "false",
  ERP_V1_FILE_STORAGE_PROFILE: "object_storage",
  ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER: "s3_compatible",
  ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: sensitiveValues[2],
  ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveValues[3],
  ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveValues[4],
  ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveValues[5],
  ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: "prod-attachments",
  ERP_SYSTEM_PRINTER_ENABLED: "true",
  ERP_SYSTEM_PRINTER_ADAPTER: "command_bridge",
  ERP_SYSTEM_PRINTER_COMMAND: sensitiveValues[6],
  ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON: JSON.stringify([
    "scripts/print-command-bridge.mjs",
    "--print-job-id",
    "{printJobId}",
  ]),
  ERP_SYSTEM_PRINTER_ALLOWLIST: "PRN-LABEL-A,PRN-DOT-A",
  ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR: sensitiveValues[7],
  ERP_PRINT_COMMAND_BRIDGE_MODE: "cups_lp",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST: "标签机A,针式打印机A",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER: "标签机A",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND: sensitiveValues[8],
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON: JSON.stringify(["-p", "{cupsPrinterName}"]),
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS: "5000",
  ERP_V1_READINESS_API_BASE_URL: "http://127.0.0.1:8787/api",
  ERP_V1_READINESS_OPERATOR_ID: "U-OFFICE-A",
  ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-DRIVER-A",
  ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR: ".erp-local-storage/v1-field-acceptance",
};

const blockedRun = await runPreflight({ env: baseEnv });
assert.equal(blockedRun.status, 2, runFailureMessage("empty environment should be blocked", blockedRun));
const blockedReport = JSON.parse(blockedRun.stdout);
assert.equal(blockedReport.status, "blocked");
assert.equal(blockedReport.ready, false);
assert.ok(blockedReport.summary.blockingCount >= 5);
assert.equal(blockedReport.criteria.find((item) => item.key === "preflight-redaction-safeguard")?.status, "passed");
assert.ok(Array.isArray(blockedReport.fixChecklist), "blocked report should include a fix checklist");
const blockedPersistenceFix = blockedReport.fixChecklist.find((item) => item.key === "v1-persistence-profile");
assert.equal(blockedPersistenceFix?.ownerRole, "技术/管理");
assert.equal(blockedPersistenceFix?.severity, "blocking");
assert.ok(
  blockedPersistenceFix?.valueGuidance?.some((item) => item.includes("生产必须显式使用 postgres")),
  "blocked persistence fix should include operator value guidance",
);
assert.ok(
  blockedPersistenceFix?.verificationSteps?.includes("npm run v1-production-profile-live:check"),
  "blocked persistence fix should include production profile verification",
);
assert.ok(
  blockedPersistenceFix?.missingVariables.includes("ERP_V1_DATABASE_URL or DATABASE_URL or PGURL"),
  "blocked persistence fix should name the redacted database URL variable group",
);
assert.ok(
  blockedReport.fixChecklist.some((item) => item.nextAction.includes("真实值只放安全 env 文件")),
  "blocked fix checklist should guide operators to keep real values in secure env files",
);
assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr);

const readyRun = await runPreflight({ env: { ...baseEnv, ...productionEnv } });
assert.equal(readyRun.status, 0, runFailureMessage("complete production env should be ready", readyRun));
const readyReport = JSON.parse(readyRun.stdout);
assert.equal(readyReport.status, "ready");
assert.equal(readyReport.ready, true);
assert.equal(readyReport.summary.blockingCount, 0);
assert.equal(readyReport.criteria.find((item) => item.key === "v1-persistence-profile")?.status, "passed");
assert.equal(readyReport.criteria.find((item) => item.key === "postgres-restore-validation-env")?.status, "passed");
assert.equal(
  readyReport.criteria.find((item) => item.key === "postgres-restore-validation-env")?.evidence
    .resetAllowedCurrentlyTrue,
  false,
);
assert.equal(
  readyReport.criteria.find((item) => item.key === "postgres-restore-validation-env")?.evidence
    .resetAllowedCurrentlyFalse,
  true,
);
assert.equal(readyReport.criteria.find((item) => item.key === "attachment-object-storage-env")?.status, "passed");
assert.equal(readyReport.criteria.find((item) => item.key === "system-printer-command-bridge-env")?.status, "passed");
assert.equal(readyReport.criteria.find((item) => item.key === "cups-preflight-env")?.status, "passed");
assert.ok(readyReport.fixChecklist.every((item) => item.severity === "ok"), "ready fix checklist should be all ok");
assert.ok(
  readyReport.fixChecklist.every((item) => Array.isArray(item.valueGuidance) && item.valueGuidance.length > 0),
  "ready fix checklist should keep value guidance for operator handoff",
);
assert.ok(
  readyReport.fixChecklist.every((item) => Array.isArray(item.verificationSteps) && item.verificationSteps.length > 0),
  "ready fix checklist should keep verification steps for operator handoff",
);
assert.equal(
  readyReport.fixChecklist.find((item) => item.key === "attachment-object-storage-env")?.configuredVariableCount,
  4,
);
assert.equal(readyReport.safeguards.connectionStringExposed, false);
assert.equal(readyReport.safeguards.commandValueExposed, false);
assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr);

const textRun = await runPreflight({ env: { ...baseEnv, ...productionEnv }, json: false });
assert.equal(textRun.status, 0, runFailureMessage("complete production env text output should be ready", textRun));
assert.match(textRun.stdout, /V1 production env preflight: READY/);
assert.match(textRun.stdout, /统一 V1 持久化 profile/);
assert.match(textRun.stdout, /Fix checklist:/);
assert.match(textRun.stdout, /填写提示：生产必须显式使用 postgres/);
assert.match(textRun.stdout, /复核：node scripts\/run-v1-production-env-file-audit\.mjs --env-file <secure-env-file>/);
assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

const persistentRestoreResetRun = await runPreflight({
  env: {
    ...baseEnv,
    ...productionEnv,
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "true",
  },
});
assert.equal(
  persistentRestoreResetRun.status,
  2,
  runFailureMessage("persistent restore reset authorization in env should be blocked", persistentRestoreResetRun),
);
const persistentRestoreResetReport = JSON.parse(persistentRestoreResetRun.stdout);
const persistentRestoreResetCriterion = persistentRestoreResetReport.criteria.find(
  (item) => item.key === "postgres-restore-validation-env",
);
assert.equal(persistentRestoreResetReport.status, "blocked");
assert.equal(persistentRestoreResetReport.ready, false);
assert.equal(persistentRestoreResetCriterion?.status, "pending");
assert.equal(persistentRestoreResetCriterion?.evidence.resetAllowedCurrentlyTrue, true);
assert.equal(persistentRestoreResetCriterion?.evidence.resetAllowedCurrentlyFalse, false);
assert.equal(persistentRestoreResetCriterion?.evidence.persistentResetAllowedBlocked, true);
const persistentRestoreResetFix = persistentRestoreResetReport.fixChecklist.find(
  (item) => item.key === "postgres-restore-validation-env",
);
assert.ok(
  persistentRestoreResetFix?.missingVariables.includes("ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false"),
  "persistent true restore-reset env should require false in the fix checklist",
);
assert.ok(
  persistentRestoreResetFix?.nextAction.includes("--allow-restore-reset"),
  "persistent true restore-reset env should point operators to explicit runtime authorization",
);
assertNoSensitiveOutput(persistentRestoreResetRun.stdout + persistentRestoreResetRun.stderr);

writeFileSync(
  envFilePath,
  [
    "# V1 production env preflight fixture",
    ...Object.entries(productionEnv).map(([key, value]) => `${key}='${String(value).replace(/'/g, "'\\''")}'`),
    "",
  ].join("\n"),
);
const envFileRun = await runPreflight({ env: baseEnv, args: ["--env-file", envFilePath] });
assert.equal(envFileRun.status, 0, runFailureMessage("env-file production env should be ready", envFileRun));
const envFileReport = JSON.parse(envFileRun.stdout);
assert.equal(envFileReport.envFileCount, 1);
assert.equal(envFileReport.ready, true);
assertNoSensitiveOutput(envFileRun.stdout + envFileRun.stderr);

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
const setupEnvFileRun = await runPreflight({
  env: baseEnv,
  args: ["--use-production-env-setup-env-file", "--production-env-setup-json", setupJsonPath],
});
assert.equal(setupEnvFileRun.status, 0, runFailureMessage("setup env-file production env should be ready", setupEnvFileRun));
const setupEnvFileReport = JSON.parse(setupEnvFileRun.stdout);
assert.equal(setupEnvFileReport.ready, true);
assert.equal(setupEnvFileReport.envFileSource, "production_env_setup");
assert.equal(setupEnvFileReport.envFileFromProductionSetup, true);
assert.equal(setupEnvFileReport.safeguards.envFileReadFromProductionSetup, true);
assert.equal(setupEnvFileReport.summary.envFileSourceLabel, "生产 env setup 安全文件");
assert.doesNotMatch(setupEnvFileRun.stdout, new RegExp(escapeRegExp(envFilePath)), "setup-source report should not print env file path");
assertNoSensitiveOutput(setupEnvFileRun.stdout + setupEnvFileRun.stderr);

writeFileSync(
  setupJsonPath,
  `${JSON.stringify(
    {
      scope: "v1_production_env_setup",
      setupReady: true,
      checkedAt: "2000-01-01T00:00:00.000Z",
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
const staleSetupEnvFileRun = await runPreflight({
  env: baseEnv,
  args: ["--use-production-env-setup-env-file", "--production-env-setup-json", setupJsonPath],
});
assert.equal(staleSetupEnvFileRun.status, 1, runFailureMessage("stale setup report should be rejected", staleSetupEnvFileRun));
const staleSetupError = JSON.parse(staleSetupEnvFileRun.stdout);
assert.match(staleSetupError.error.message, /setup report is stale/);
assertNoSensitiveOutput(staleSetupEnvFileRun.stdout + staleSetupEnvFileRun.stderr);

const placeholderRun = await runPreflight({
  env: {
    ...baseEnv,
    ...productionEnv,
    ERP_V1_DATABASE_URL: "<REPLACE_WITH_POSTGRES_CONNECTION_URL>",
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: "<REPLACE_WITH_DEDICATED_RESTORE_VALIDATION_DATABASE_URL>",
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "<REPLACE_WITH_RESTORE_RESET_FLAG>",
    ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: "https://<REPLACE_WITH_OBJECT_STORAGE_ENDPOINT>",
    ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: "<REPLACE_WITH_ATTACHMENT_BUCKET>",
    ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: "<REPLACE_WITH_ACCESS_KEY_ID>",
    ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: "<REPLACE_WITH_SECRET_ACCESS_KEY>",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT: "https://<REPLACE_WITH_OBJECT_STORAGE_ENDPOINT>",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET: "<REPLACE_WITH_STATEMENT_EXPORT_BUCKET>",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID: "<REPLACE_WITH_ACCESS_KEY_ID>",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY: "<REPLACE_WITH_SECRET_ACCESS_KEY>",
    ERP_SYSTEM_PRINTER_COMMAND: "<REPLACE_WITH_NODE_OR_BRIDGE_COMMAND>",
    ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR: "<REPLACE_WITH_SECURE_SPOOL_DIR>",
    ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND: "<REPLACE_WITH_LPSTAT_COMMAND>",
    ERP_V1_READINESS_API_BASE_URL: "https://<REPLACE_WITH_ERP_HOST>/api",
    ERP_V1_READINESS_OPERATOR_ID: "<REPLACE_WITH_OFFICE_VALIDATION_USER_ID>",
    ERP_V1_READINESS_DRIVER_OPERATOR_ID: "<REPLACE_WITH_DRIVER_VALIDATION_USER_ID>",
    ERP_V1_READINESS_TOKEN: "<OPTIONAL_OFFICE_BEARER_TOKEN>",
  },
});
assert.equal(placeholderRun.status, 2, runFailureMessage("placeholder env values should be blocked", placeholderRun));
const placeholderReport = JSON.parse(placeholderRun.stdout);
assert.equal(placeholderReport.status, "blocked");
assert.equal(placeholderReport.ready, false);
assert.ok(placeholderReport.summary.placeholderValueCount >= 10, "placeholder values should be counted");
assert.equal(placeholderReport.safeguards.placeholderValuesAccepted, false);
assert.equal(
  placeholderReport.criteria.find((item) => item.key === "v1-persistence-profile")?.evidence.databaseUrlConfigured,
  false,
);
assert.equal(
  placeholderReport.criteria.find((item) => item.key === "postgres-restore-validation-env")?.evidence
    .restoreDatabaseUrlConfigured,
  false,
);
assert.equal(
  placeholderReport.criteria.find((item) => item.key === "attachment-object-storage-env")?.evidence.endpointConfigured,
  false,
);
assert.equal(
  placeholderReport.criteria.find((item) => item.key === "system-printer-command-bridge-env")?.evidence.commandConfigured,
  false,
);
const placeholderPersistenceFix = placeholderReport.fixChecklist.find((item) => item.key === "v1-persistence-profile");
assert.ok(
  placeholderPersistenceFix?.placeholderVariables.includes("ERP_V1_DATABASE_URL"),
  "placeholder database URL should be reported by variable name only",
);
assert.equal(
  placeholderReport.fixChecklist.find((item) => item.key === "attachment-object-storage-env")?.placeholderVariableCount,
  4,
);
assert.ok(
  placeholderReport.fixChecklist
    .find((item) => item.key === "postgres-restore-validation-env")
    ?.placeholderVariables.includes("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL"),
  "placeholder restore validation URL should be reported by variable name only",
);
assertNoSensitiveOutput(placeholderRun.stdout + placeholderRun.stderr);
assert.doesNotMatch(placeholderRun.stdout, /REPLACE_WITH_POSTGRES_CONNECTION_URL|OPTIONAL_OFFICE_BEARER_TOKEN/);

const invalidRun = await runPreflight({
  env: {
    ...baseEnv,
    ...productionEnv,
    ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON: "not-json",
    ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON: "{\"not\":\"array\"}",
  },
});
assert.equal(invalidRun.status, 2, runFailureMessage("invalid JSON env should be blocked", invalidRun));
const invalidReport = JSON.parse(invalidRun.stdout);
assert.equal(invalidReport.ready, false);
assert.ok(
  invalidReport.blockingCriteria.some((item) => item.detail.includes("valid JSON array")),
  "invalid JSON blocker was not reported",
);
assertNoSensitiveOutput(invalidRun.stdout + invalidRun.stderr);

const invalidShapeRun = await runPreflight({
  env: {
    ...baseEnv,
    ...productionEnv,
    ERP_V1_DATABASE_URL: sensitiveValues[9],
    ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: sensitiveValues[10],
    ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveValues[11],
    ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: sensitiveValues[13],
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT: "not-a-url",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET: "statement/export/bucket",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX: sensitiveValues[14],
    ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS: "not-a-number",
    ERP_V1_READINESS_API_BASE_URL: sensitiveValues[12],
    ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL: "file:///tmp/erp",
  },
});
assert.equal(invalidShapeRun.status, 2, runFailureMessage("invalid production env value shapes should be blocked", invalidShapeRun));
const invalidShapeReport = JSON.parse(invalidShapeRun.stdout);
assert.equal(invalidShapeReport.ready, false);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "v1-persistence-profile")?.evidence
    .databaseConnectionStringParsed,
  false,
);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "attachment-object-storage-env")?.evidence
    .endpointUrlValid,
  false,
);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "attachment-object-storage-env")?.evidence
    .bucketNameValid,
  false,
);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "attachment-object-storage-env")?.evidence
    .keyPrefixValid,
  false,
);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "statement-export-object-storage-env")?.evidence
    .explicitEndpointUrlValid,
  false,
);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "statement-export-object-storage-env")?.evidence
    .explicitBucketNameValid,
  false,
);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "statement-export-object-storage-env")?.evidence
    .explicitKeyPrefixValid,
  false,
);
assert.equal(
  invalidShapeReport.criteria.find((item) => item.key === "cups-preflight-env")?.evidence.timeoutValid,
  false,
);
assert.ok(
  invalidShapeReport.blockingCriteria.some((item) => item.detail.includes("valid PostgreSQL connection string")),
  "invalid database URL shape should be reported by variable name only",
);
assert.ok(
  invalidShapeReport.fixChecklist
    .find((item) => item.key === "v1-persistence-profile")
    ?.missingVariables.includes("ERP_V1_DATABASE_URL valid PostgreSQL connection string"),
  "invalid database URL shape should be included in fix checklist by real variable name",
);
assert.ok(
  invalidShapeReport.blockingCriteria.some((item) => item.detail.includes("http/https URL")),
  "invalid object-storage endpoint shape should be reported by variable name only",
);
assert.ok(
  invalidShapeReport.blockingCriteria.some((item) => item.detail.includes("valid bucket name")),
  "invalid object-storage bucket shape should be reported by variable name only",
);
assert.ok(
  invalidShapeReport.fixChecklist
    .find((item) => item.key === "attachment-object-storage-env")
    ?.missingVariables.includes("ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix"),
  "invalid attachment object-storage key prefix should be included in fix checklist by variable name",
);
assert.ok(
  invalidShapeReport.fixChecklist
    .find((item) => item.key === "statement-export-object-storage-env")
    ?.missingVariables.includes("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix"),
  "invalid statement export key prefix should be included in fix checklist by variable name",
);
assert.ok(
  invalidShapeReport.warningCriteria.some((item) => item.key === "v1-readiness-identity-env"),
  "invalid readiness URL shape should remain a warning criterion",
);
assertNoSensitiveOutput(invalidShapeRun.stdout + invalidShapeRun.stderr);
assert.doesNotMatch(
  invalidShapeRun.stdout,
  /not-a-url|statement\/export\/bucket|not-a-number|file:\/\/\/tmp\/erp|bad-prefix|secret-prefix/,
);

const sameRestoreTargetRun = await runPreflight({
  env: {
    ...baseEnv,
    ...productionEnv,
    ERP_V1_DATABASE_URL: "postgres://v1_user:secret-a@prod-db.internal:5432/erp?application_name=source",
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL:
      "postgresql://restore_user:secret-b@prod-db.internal:5432/erp?application_name=restore",
  },
});
assert.equal(
  sameRestoreTargetRun.status,
  2,
  runFailureMessage("restore validation database pointing to production physical target should be blocked", sameRestoreTargetRun),
);
const sameRestoreTargetReport = JSON.parse(sameRestoreTargetRun.stdout);
const sameRestoreCriterion = sameRestoreTargetReport.criteria.find(
  (item) => item.key === "postgres-restore-validation-env",
);
assert.equal(sameRestoreCriterion?.status, "pending");
assert.equal(sameRestoreCriterion?.evidence.sourceDatabaseConnectionStringParsed, true);
assert.equal(sameRestoreCriterion?.evidence.restoreDatabaseConnectionStringParsed, true);
assert.equal(sameRestoreCriterion?.evidence.restoreTargetComparable, true);
assert.equal(sameRestoreCriterion?.evidence.restoreTargetSamePhysicalDatabase, true);
assert.ok(
  sameRestoreTargetReport.fixChecklist
    .find((item) => item.key === "postgres-restore-validation-env")
    ?.missingVariables.includes(
      "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL different host/port/database from production source",
    ),
  "same physical restore target should be included in fix checklist by variable name only",
);
assertNoSensitiveOutput(sameRestoreTargetRun.stdout + sameRestoreTargetRun.stderr);
assert.doesNotMatch(sameRestoreTargetRun.stdout, /secret-a|secret-b|prod-db\.internal/);

const localBypassRun = await runPreflight({
  env: {
    ...baseEnv,
    ...productionEnv,
    ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED: "true",
    ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF: "manager signed local risk",
  },
});
assert.equal(localBypassRun.status, 0, runFailureMessage("local bypass should warn but not block env syntax", localBypassRun));
const localBypassReport = JSON.parse(localBypassRun.stdout);
assert.equal(localBypassReport.ready, true);
assert.ok(localBypassReport.summary.warningCount >= 1);
assert.equal(localBypassReport.criteria.find((item) => item.key === "local-v1-acceptance-bypass-env")?.status, "warning");
assertNoSensitiveOutput(localBypassRun.stdout + localBypassRun.stderr);

console.log("V1 production env preflight check passed: blocked, ready, env-file, placeholder rejection, invalid JSON, warning, exit codes, and redaction are covered.");

function runPreflight({ env, args = [], json = true }) {
  const finalArgs = [runnerScript, ...args];
  if (json) finalArgs.push("--json");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, finalArgs, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("production env preflight process timed out after 10000ms"));
    }, 10000);
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
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)), `output leaked sensitive value: ${value}`);
  }
  assert.doesNotMatch(output, /pass@prod-db/, "output leaked database credentials");
  assert.doesNotMatch(output, /SUPER_SECRET_VALUE/, "output leaked object-storage secret");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
