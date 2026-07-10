import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-intake-verify");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-env-intake-verify.mjs");
const readyEnvPath = join(storageRoot, "ready.env");
const missingEnvPath = join(storageRoot, "missing.env");
const conflictEnvPath = join(storageRoot, "conflict.env");
const duplicateEnvPath = join(storageRoot, "duplicate.env");
const mismatchEnvPath = join(storageRoot, "mismatch.env");
const partialStatementEnvPath = join(storageRoot, "partial-statement.env");
const incompleteChecklistEnvPath = join(storageRoot, "incomplete-checklist.env");
const setupJsonPath = join(storageRoot, "production-env-setup.json");
const intakeCsvPath = join(storageRoot, "production-env-real-value-intake.csv");
const incompleteIntakeCsvPath = join(storageRoot, "production-env-real-value-intake-incomplete.csv");
const reportDir = join(storageRoot, "report");
const sensitiveValues = [
  "postgres://v1_user:secret-pass@prod-db.internal:5432/erp",
  "postgres://alias_user:alias-pass@prod-db.internal:5432/erp",
  "postgres://alias_user:other-pass@other-db.internal:5432/erp",
  "https://oss-secret.example.com",
  "erp-v1-private-bucket",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/usr/local/bin/erp-print-secret",
  "/var/spool/erp-secret",
  "office-token-secret",
];

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

writeSecureFile(intakeCsvPath, buildIntakeCsv({ completeChecklist: true }));
writeSecureFile(incompleteIntakeCsvPath, buildIntakeCsv({ completeChecklist: false }));
writeSecureFile(readyEnvPath, buildReadyEnv());
writeSecureFile(missingEnvPath, buildMissingEnv());
writeSecureFile(conflictEnvPath, buildConflictEnv());
writeSecureFile(duplicateEnvPath, buildDuplicateEnv());
writeSecureFile(mismatchEnvPath, buildMismatchEnv());
writeSecureFile(partialStatementEnvPath, buildPartialStatementEnv());
writeSecureFile(incompleteChecklistEnvPath, buildReadyEnv());
writeSecureFile(setupJsonPath, JSON.stringify(buildProductionEnvSetupReport(readyEnvPath), null, 2));

const readyRun = await runVerify(["--env-file", readyEnvPath, "--intake-csv", intakeCsvPath, "--output-dir", reportDir, "--json"]);
assert.equal(readyRun.status, 0, runFailureMessage("ready env and completed intake should pass", readyRun));
const readyReport = JSON.parse(readyRun.stdout);
assert.equal(readyReport.scope, "v1_production_env_real_value_intake_verification");
assert.equal(readyReport.status, "ready");
assert.equal(readyReport.ready, true);
assert.equal(readyReport.summary.blockingCount, 0);
assert.equal(readyReport.summary.warningCount, 0);
assert.equal(readyReport.summary.fullIntakeConfiguredLabel, "9/15");
assert.equal(readyReport.summary.minimumBlockingLabel, "9/9");
assert.equal(readyReport.summary.minimumBlockingVariableRowCount, 8);
assert.equal(readyReport.summary.minimumBlockingAlternativeGroupCount, 1);
assert.equal(readyReport.summary.minimumWarningLabel, "0/0");
assert.equal(readyReport.summary.envFilePathIncluded, false);
assert.equal(readyReport.safeguards.envValuesIncluded, false);
assert.equal(readyReport.safeguards.envFilePathIncluded, false);
assert.equal(readyReport.safeguards.rawEvidenceRefIncluded, false);
assert.ok(readyReport.alternativeGroups.some((group) => group.status === "passed" && group.configuredKeyCount === 1));
assert.equal(readyReport.conditionalRules.statementExportObjectStorage.status, "covered_by_attachment_fallback");
assert.ok(
  readyReport.rows.some(
    (row) =>
      row.variableKey === "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT" &&
      row.status === "not_required" &&
      /fallback/.test(row.detail),
  ),
);
assert.ok(existsSync(join(reportDir, "latest.json")), "verification JSON report should be written");
assert.ok(existsSync(join(reportDir, "latest.md")), "verification Markdown report should be written");
assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr + readFileSync(join(reportDir, "latest.md"), "utf8"));
assert.doesNotMatch(readyRun.stdout, /EV-/);

const setupEnvRun = await runVerify([
  "--use-production-env-setup-env-file",
  "--production-env-setup-json",
  setupJsonPath,
  "--intake-csv",
  intakeCsvPath,
  "--output-dir",
  reportDir,
  "--json",
]);
assert.equal(setupEnvRun.status, 0, runFailureMessage("setup env file reuse should pass", setupEnvRun));
const setupEnvReport = JSON.parse(setupEnvRun.stdout);
assert.equal(setupEnvReport.ready, true);
assert.equal(setupEnvReport.summary.envFileSource, "production_env_setup");
assert.equal(setupEnvReport.summary.envFileFromProductionSetup, true);
assert.equal(setupEnvReport.summary.envFileSourceLabel, "生产 env setup 安全文件");
assert.equal(setupEnvReport.safeguards.envFileReadFromProductionSetup, true);
assert.equal(setupEnvReport.safeguards.envFilePathIncluded, false);
assertNoSensitiveOutput(setupEnvRun.stdout + setupEnvRun.stderr + readFileSync(join(reportDir, "latest.md"), "utf8"));

writeSecureFile(setupJsonPath, JSON.stringify({ ...buildProductionEnvSetupReport(readyEnvPath), checkedAt: "2000-01-01T00:00:00.000Z" }, null, 2));
const staleSetupRun = await runVerify([
  "--use-production-env-setup-env-file",
  "--production-env-setup-json",
  setupJsonPath,
  "--intake-csv",
  intakeCsvPath,
  "--json",
]);
assert.equal(staleSetupRun.status, 1, runFailureMessage("stale setup report should block intake verify", staleSetupRun));
const staleSetupError = JSON.parse(staleSetupRun.stdout);
assert.match(staleSetupError.error.message, /setup report is stale/);
assertNoSensitiveOutput(staleSetupRun.stdout + staleSetupRun.stderr);
writeSecureFile(setupJsonPath, JSON.stringify(buildProductionEnvSetupReport(readyEnvPath), null, 2));

const missingRun = await runVerify(["--env-file", missingEnvPath, "--intake-csv", intakeCsvPath, "--output-dir", reportDir, "--json"]);
assert.equal(missingRun.status, 2, runFailureMessage("missing choose-one group should be blocked", missingRun));
const missingReport = JSON.parse(missingRun.stdout);
assert.equal(missingReport.status, "blocked");
assert.equal(missingReport.ready, false);
assert.equal(missingReport.summary.minimumBlockingLabel, "8/9");
assert.equal(missingReport.summary.minimumBlockingMissingCount, 1);
assert.equal(missingReport.summary.minimumBlockingVariableRowCount, 8);
assert.equal(missingReport.summary.minimumBlockingAlternativeGroupCount, 1);
assert.match(
  missingReport.summary.minimumBlockingTargetSignature,
  /alternative-group:ERP_V1_DATABASE_URL \/ DATABASE_URL \/ PGURL/,
);
assert.match(
  missingReport.summary.minimumBlockingTargetSignature,
  /variable:ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT/,
);
assert.ok(
  missingReport.blockingFindings.some(
    (finding) => finding.type === "alternative_group" && /没有任何已配置变量/.test(finding.detail),
  ),
);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

const conflictRun = await runVerify(["--env-file", conflictEnvPath, "--intake-csv", intakeCsvPath, "--output-dir", reportDir, "--json"]);
assert.equal(conflictRun.status, 2, runFailureMessage("conflicting aliases should be blocked", conflictRun));
const conflictReport = JSON.parse(conflictRun.stdout);
assert.equal(conflictReport.ready, false);
assert.ok(
  conflictReport.blockingFindings.some(
    (finding) => finding.type === "alternative_group" && /最终值不一致/.test(finding.detail),
  ),
);
assertNoSensitiveOutput(conflictRun.stdout + conflictRun.stderr + readFileSync(join(reportDir, "latest.md"), "utf8"));

const duplicateRun = await runVerify(["--env-file", duplicateEnvPath, "--intake-csv", intakeCsvPath, "--output-dir", reportDir, "--json"]);
assert.equal(duplicateRun.status, 0, runFailureMessage("duplicate aliases with same value should warn but not block", duplicateRun));
const duplicateReport = JSON.parse(duplicateRun.stdout);
assert.equal(duplicateReport.ready, true);
assert.equal(duplicateReport.status, "ready_with_warnings");
assert.ok(
  duplicateReport.warningFindings.some(
    (finding) => finding.type === "alternative_group" && /同一值/.test(finding.detail),
  ),
);
assertNoSensitiveOutput(duplicateRun.stdout + duplicateRun.stderr);

const mismatchRun = await runVerify(["--env-file", mismatchEnvPath, "--intake-csv", intakeCsvPath, "--output-dir", reportDir, "--json"]);
assert.equal(mismatchRun.status, 2, runFailureMessage("safe literal mismatch should be blocked", mismatchRun));
const mismatchReport = JSON.parse(mismatchRun.stdout);
assert.equal(mismatchReport.ready, false);
assert.ok(
  mismatchReport.blockingFindings.some(
    (finding) => finding.variableKey === "ERP_V1_PERSISTENCE_PROFILE" && /应配置为 postgres/.test(finding.detail),
  ),
);
assertNoSensitiveOutput(mismatchRun.stdout + mismatchRun.stderr);
assert.doesNotMatch(mismatchRun.stdout, /local_json/);

const partialStatementRun = await runVerify([
  "--env-file",
  partialStatementEnvPath,
  "--intake-csv",
  intakeCsvPath,
  "--output-dir",
  reportDir,
  "--json",
]);
assert.equal(
  partialStatementRun.status,
  2,
  runFailureMessage("partially configured statement-export object storage should be blocked", partialStatementRun),
);
const partialStatementReport = JSON.parse(partialStatementRun.stdout);
assert.equal(partialStatementReport.ready, false);
assert.equal(
  partialStatementReport.conditionalRules.statementExportObjectStorage.status,
  "independent_config_incomplete",
);
assert.ok(
  partialStatementReport.blockingFindings.some(
    (finding) => finding.variableKey === "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET" && /尚未/.test(finding.detail),
  ),
);
assertNoSensitiveOutput(partialStatementRun.stdout + partialStatementRun.stderr);

const incompleteChecklistRun = await runVerify([
  "--env-file",
  incompleteChecklistEnvPath,
  "--intake-csv",
  incompleteIntakeCsvPath,
  "--output-dir",
  reportDir,
  "--json",
]);
assert.equal(
  incompleteChecklistRun.status,
  0,
  runFailureMessage("configured env with incomplete intake checklist columns should warn only", incompleteChecklistRun),
);
const incompleteChecklistReport = JSON.parse(incompleteChecklistRun.stdout);
assert.equal(incompleteChecklistReport.ready, true);
assert.equal(incompleteChecklistReport.status, "ready_with_warnings");
assert.ok(
  incompleteChecklistReport.warningFindings.some(
    (finding) => finding.type === "variable_row" && /filled \/ verified \/ evidenceRef/.test(finding.detail),
  ),
);
assertNoSensitiveOutput(incompleteChecklistRun.stdout + incompleteChecklistRun.stderr);

const textRun = await runVerify(["--env-file", readyEnvPath, "--intake-csv", intakeCsvPath, "--output-dir", reportDir]);
assert.equal(textRun.status, 0, runFailureMessage("text output should pass for ready env", textRun));
assert.match(textRun.stdout, /ERP V1 生产 env 真实值 intake 校验/);
assert.match(textRun.stdout, /READY/);
assert.match(textRun.stdout, /最小阻塞补值：9\/9/);
assert.match(textRun.stdout, /全量清单配置：9\/15/);
assert.match(textRun.stdout, /条件覆盖规则/);
assert.match(textRun.stdout, /变量行摘要/);
assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

function writeSecureFile(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function buildProductionEnvSetupReport(envFilePath) {
  return {
    scope: "v1_production_env_setup",
    setupReady: true,
    checkedAt: new Date(Date.now() + 60_000).toISOString(),
    envFile: {
      path: envFilePath,
      generated: true,
      gitIgnored: true,
      gitTracked: false,
      fileMode: "600",
    },
  };
}

function buildIntakeCsv({ completeChecklist }) {
  const mark = completeChecklist ? "yes" : "";
  const evidence = completeChecklist ? "EV-SECRET-REF" : "";
  const rows = [
    row({
      itemKey: "v1-persistence-profile",
      label: "统一 V1 持久化 profile",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_V1_PERSISTENCE_PROFILE",
      expectedValueType: "安全固定值",
      safeLiteralValue: "postgres",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "v1-persistence-profile",
      label: "PostgreSQL 生产库 / 持久化 profile",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_V1_DATABASE_URL",
      alternativeGroup: "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
      alternativeRule: "任选其一，优先使用 ERP_V1_DATABASE_URL",
      expectedValueType: "PostgreSQL connection string",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "v1-persistence-profile",
      label: "PostgreSQL 生产库 / 持久化 profile",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "DATABASE_URL",
      alternativeGroup: "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
      alternativeRule: "任选其一，优先使用 ERP_V1_DATABASE_URL",
      expectedValueType: "PostgreSQL connection string",
    }),
    row({
      itemKey: "v1-persistence-profile",
      label: "PostgreSQL 生产库 / 持久化 profile",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "PGURL",
      alternativeGroup: "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
      alternativeRule: "任选其一，优先使用 ERP_V1_DATABASE_URL",
      expectedValueType: "PostgreSQL connection string",
    }),
    row({
      itemKey: "v1-persistence-profile",
      label: "统一 V1 文件留档 profile",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_V1_FILE_STORAGE_PROFILE",
      expectedValueType: "安全固定值",
      safeLiteralValue: "object_storage",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "postgres-restore-validation-env",
      label: "PostgreSQL 恢复验证授权",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED",
      expectedValueType: "安全固定值",
      safeLiteralValue: "false",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "attachment-object-storage-env",
      label: "附件对象存储 endpoint",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
      expectedValueType: "http/https URL",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "attachment-object-storage-env",
      label: "附件对象存储 bucket",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
      expectedValueType: "bucket name",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "attachment-object-storage-env",
      label: "附件对象存储 access key",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
      expectedValueType: "access key",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "attachment-object-storage-env",
      label: "附件对象存储 secret key",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
      expectedValueType: "secret key",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "statement-export-object-storage-env",
      label: "对账导出对象存储 endpoint",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
      expectedValueType: "http/https URL",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "statement-export-object-storage-env",
      label: "对账导出对象存储 bucket",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
      expectedValueType: "bucket name",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "statement-export-object-storage-env",
      label: "对账导出对象存储 access key",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
      expectedValueType: "access key",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "statement-export-object-storage-env",
      label: "对账导出对象存储 secret key",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
      expectedValueType: "secret key",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
    row({
      itemKey: "cups-preflight-env",
      label: "CUPS 队列模式",
      ownerRole: "技术/管理",
      severity: "blocking",
      variableKey: "ERP_PRINT_COMMAND_BRIDGE_MODE",
      expectedValueType: "安全固定值",
      safeLiteralValue: "cups_lp",
      filled: mark,
      verified: mark,
      evidenceRef: evidence,
    }),
  ];
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
  return `${[headers, ...rows].map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}

function row(overrides) {
  return [
    overrides.itemKey || "",
    overrides.label || "",
    overrides.ownerRole || "",
    overrides.severity || "blocking",
    "pending",
    overrides.variableKey || "",
    overrides.alternativeGroup || "",
    overrides.alternativeRule || "",
    "现场系统",
    overrides.expectedValueType || "",
    overrides.safeLiteralValue || "",
    overrides.filled || "",
    overrides.verified || "",
    overrides.evidenceRef || "",
    "待填写真实值",
    "待预检",
    "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
    "填入安全 env 文件后重跑。",
  ];
}

function buildReadyEnv() {
  return [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[5]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[6]}`,
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "",
  ].join("\n");
}

function buildMissingEnv() {
  return [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[5]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[6]}`,
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "",
  ].join("\n");
}

function buildConflictEnv() {
  return [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    `DATABASE_URL=${sensitiveValues[2]}`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[5]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[6]}`,
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "",
  ].join("\n");
}

function buildDuplicateEnv() {
  return [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    `DATABASE_URL=${sensitiveValues[0]}`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[5]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[6]}`,
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "",
  ].join("\n");
}

function buildMismatchEnv() {
  return [
    "ERP_V1_PERSISTENCE_PROFILE=local_json",
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[5]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[6]}`,
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "",
  ].join("\n");
}

function buildPartialStatementEnv() {
  return [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[5]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[6]}`,
    `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[3]}`,
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "",
  ].join("\n");
}

function csvCell(value) {
  const normalized = String(value ?? "");
  if (!/[",\n\r]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

async function runVerify(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runnerScript, ...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assertNoSensitiveOutput(output) {
  for (const value of sensitiveValues) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)), `output leaked sensitive value: ${value}`);
  }
  assert.doesNotMatch(output, new RegExp(escapeRegExp(readyEnvPath)), "output leaked env file path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(conflictEnvPath)), "output leaked conflict env file path");
  assert.doesNotMatch(output, /prod-db\.internal|other-db\.internal|oss-secret|private-bucket|SECRET_VALUE|secret-pass/i);
}

function runFailureMessage(message, result) {
  return `${message}\nstatus=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
