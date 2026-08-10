import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-setup");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-env-setup.mjs");
const draftEnvPath = join(storageRoot, "secure-prod.env");
const readyEnvPath = join(storageRoot, "ready-prod.env");
const invalidShapeEnvPath = join(storageRoot, "invalid-shape-prod.env");
const importSourceEnvPath = join(storageRoot, "filled-source.env");
const importTargetEnvPath = join(storageRoot, "imported-secure-prod.env");
const reportDir = join(storageRoot, "report");
const invalidShapeReportDir = join(storageRoot, "invalid-shape-report");
const importReportDir = join(storageRoot, "import-report");
const unsafeReportDir = join(storageRoot, "unsafe-report");
const unsafeTargetPath = join(process.cwd(), "docs", "development", "unsafe-production.env");
const sensitiveValues = [
  "postgres://v1_user:secret-pass@prod-db.internal:5432/erp",
  "https://oss-secret.example.com",
  "erp-v1-private-bucket",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/usr/local/bin/erp-print-secret",
  "/var/spool/erp-secret",
  "office-token-secret",
  "driver-token-secret",
  "mysql://bad-user:bad-pass@mysql.internal:3306/erp",
  "ftp://bad-object-storage.internal",
  "bad/bucket",
  "timeout-secret",
];

rmSync(storageRoot, { recursive: true, force: true });
rmSync(unsafeTargetPath, { force: true });
mkdirSync(storageRoot, { recursive: true });

const setupRun = await runSetup(["--target", draftEnvPath, "--output-dir", reportDir, "--json"]);
assert.equal(setupRun.status, 0, runFailureMessage("draft setup should prepare a secure env file", setupRun));
const setupReport = JSON.parse(setupRun.stdout);
assert.equal(setupReport.scope, "v1_production_env_setup");
assert.equal(setupReport.status, "prepared");
assert.equal(setupReport.setupReady, true);
assert.equal(setupReport.ready, false);
assert.equal(setupReport.envFile.generated, true);
assert.equal(setupReport.envFile.gitIgnored, true);
assert.equal(setupReport.envFile.fileMode, "600");
assert.equal(setupReport.audit.ready, true);
assert.equal(setupReport.envPreflight.ready, false);
assert.ok(setupReport.envPreflight.remainingFixItems.some((item) => item.key === "v1-persistence-profile"));
assert.equal(setupReport.productionEnvFixChecklist.included, true);
assert.equal(setupReport.productionEnvFixChecklist.fixItemCount, 11);
assert.equal(setupReport.productionEnvFixChecklist.blockingItemCount, 6);
assert.equal(
  setupReport.productionEnvFixChecklist.items.find((item) => item.key === "runtime-mode")?.status,
  "passed",
);
assert.equal(setupReport.productionEnvValueIntakeChecklist.included, true);
assert.ok(setupReport.productionEnvValueIntakeChecklist.rowCount > 0);
assert.equal(setupReport.productionEnvMinimumValueIntakeChecklist.included, true);
assert.equal(setupReport.productionEnvMinimumValueIntakeChecklist.rowCount, 11);
assert.equal(setupReport.productionEnvMinimumValueIntakeChecklist.sourceRowCount, setupReport.productionEnvValueIntakeChecklist.rowCount);
assert.equal(setupReport.productionEnvMinimumValueIntakeChecklist.chooseOneGroupCount, 1);
assert.equal(setupReport.productionEnvMinimumValueIntakeChecklist.safeguards.onlyBlockingRowsIncluded, true);
assert.equal(setupReport.productionEnvMinimumValueIntakeChecklist.safeguards.safeLiteralRowsExcluded, true);
assert.ok(
  setupReport.productionEnvMinimumValueIntakeChecklist.rows.every((row) => !row.safeLiteralValue),
  "minimum checklist should contain only real values, not safe literal rows",
);
assert.ok(
  setupReport.productionEnvValueIntakeChecklist.rows.some(
    (row) => row.variableKey === "ERP_V1_DATABASE_URL" && /任选其一/.test(row.alternativeRule),
  ),
);
assert.ok(
  setupReport.productionEnvValueIntakeChecklist.rows.some(
    (row) =>
      row.variableKey === "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT" &&
      row.severity === "warning" &&
      row.status === "optional_fallback",
  ),
  "statement-export independent bucket rows should be optional when no explicit statement storage is configured",
);
const setupCommands = new Map(setupReport.commands.map((command) => [command.key, command.command]));
assert.equal(setupCommands.get("server-apply"), "ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> npm run api:dev");
assert.equal(
  setupCommands.get("server-audit-preview"),
  "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS=<secure-env-file> npm run api:dev",
);
assert.equal(
  setupCommands.get("values-fragment-dry-run"),
  "node -- scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-values-env-fragment> --use-production-env-setup-env-file --intake-csv <production-env-real-value-intake-csv> --dry-run",
);
assert.equal(
  setupCommands.get("first-stage-values-fragment-dry-run"),
  "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>",
);
assert.equal(
  setupCommands.get("first-stage-with-values-fragment"),
  "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>",
);
assert.equal(
  setupCommands.get("first-stage"),
  "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest>",
);
assert.ok(existsSync(draftEnvPath), "secure env draft should be written");
assert.ok(existsSync(join(reportDir, "latest.json")), "setup JSON report should be written");
assert.ok(existsSync(join(reportDir, "latest.md")), "setup Markdown report should be written");
assert.ok(existsSync(join(reportDir, "production-env-fix-checklist.zh-CN.md")), "setup fix checklist Markdown should be written");
assert.ok(existsSync(join(reportDir, "production-env-fix-checklist.csv")), "setup fix checklist CSV should be written");
assert.ok(
  existsSync(join(reportDir, "production-env-real-value-intake.zh-CN.md")),
  "setup real-value intake Markdown should be written",
);
assert.ok(existsSync(join(reportDir, "production-env-real-value-intake.csv")), "setup real-value intake CSV should be written");
assert.ok(
  existsSync(join(reportDir, "production-env-minimum-real-value-intake.zh-CN.md")),
  "setup minimum real-value intake Markdown should be written",
);
assert.ok(
  existsSync(join(reportDir, "production-env-minimum-real-value-intake.csv")),
  "setup minimum real-value intake CSV should be written",
);
assert.ok(
  existsSync(join(reportDir, "production-env-values-fragment.template.env.example")),
  "setup real-value env fragment template should be written",
);
assert.ok(
  existsSync(join(reportDir, "production-env-minimum-values-fragment.template.env.example")),
  "setup minimum real-value env fragment template should be written",
);
assert.ok(existsSync(join(reportDir, "production-env-fill-template.env.example")), "setup fill template should be written");

const draftText = readFileSync(draftEnvPath, "utf8");
assert.match(draftText, /ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file>/);
assert.match(draftText, /ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS=<secure-env-file> only for read-only audit \/ preview diagnostics/);
assert.match(draftText, /ERP_V1_PERSISTENCE_PROFILE=postgres/);
assert.match(draftText, /ERP_AUTH_MODE=strict/);
assert.match(draftText, /ERP_AUTH_SECRET=\n/);
assert.match(draftText, /ERP_API_MAX_JSON_BODY_BYTES=75497472/);
assert.match(draftText, /VITE_ERP_RUNTIME_MODE=production/);
assert.match(draftText, /ERP_V1_DATABASE_URL=\n/);
assert.match(draftText, /ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=\n/);
assert.match(draftText, /ERP_SYSTEM_PRINTER_ALLOWLIST=\n/);
assert.match(draftText, /ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=\n/);
assert.match(draftText, /ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON=\["-p","\{cupsPrinterName\}"\]/);
assert.doesNotMatch(draftText, /<REPLACE_WITH|<OPTIONAL|PRN-LABEL-A|标签机A/);
assert.equal((statSync(draftEnvPath).mode & 0o777).toString(8).padStart(3, "0"), "600");
const setupArtifactsText = [
  setupRun.stdout,
  setupRun.stderr,
  readFileSync(join(reportDir, "latest.md"), "utf8"),
  readFileSync(join(reportDir, "production-env-fix-checklist.zh-CN.md"), "utf8"),
  readFileSync(join(reportDir, "production-env-fix-checklist.csv"), "utf8"),
  readFileSync(join(reportDir, "production-env-real-value-intake.zh-CN.md"), "utf8"),
  readFileSync(join(reportDir, "production-env-real-value-intake.csv"), "utf8"),
  readFileSync(join(reportDir, "production-env-minimum-real-value-intake.zh-CN.md"), "utf8"),
  readFileSync(join(reportDir, "production-env-minimum-real-value-intake.csv"), "utf8"),
  readFileSync(join(reportDir, "production-env-minimum-values-fragment.template.env.example"), "utf8"),
  readFileSync(join(reportDir, "production-env-values-fragment.template.env.example"), "utf8"),
  readFileSync(join(reportDir, "production-env-fill-template.env.example"), "utf8"),
].join("\n");
assertNoSensitiveOutput(setupArtifactsText);
assert.match(setupArtifactsText, /ERP_V1_DATABASE_URL=<REPLACE_WITH_ERP_V1_DATABASE_URL>/);
assert.match(setupArtifactsText, /ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY>/);
assert.match(setupArtifactsText, /production-env-fill-template\.env\.example/);
assert.match(setupArtifactsText, /production-env-real-value-intake\.csv/);
assert.match(setupArtifactsText, /production-env-minimum-real-value-intake\.csv/);
assert.match(setupArtifactsText, /production-env-minimum-values-fragment\.template\.env\.example/);
assert.match(setupArtifactsText, /production-env-values-fragment\.template\.env\.example/);
assert.match(setupArtifactsText, /真实值片段预检（不写入）/);
assert.match(setupArtifactsText, /第一阶段真实值片段 dry-run（不写入）/);
assert.match(setupArtifactsText, /run-v1-production-env-intake-apply\.mjs --values-env-file <secure-values-env-fragment>/);
assert.match(setupArtifactsText, /--use-production-env-setup-env-file --intake-csv <production-env-real-value-intake-csv> --dry-run/);
assert.match(setupArtifactsText, /run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run/);
assert.match(setupArtifactsText, /run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest/);
assert.match(setupArtifactsText, /run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-minimum-values-env-fragment> --production-env-values-dry-run/);
assert.match(
  setupArtifactsText,
  /If bypassing the production env setup report, pass --target-env-file <secure-env-file> to the intake apply dry-run, or --env-file <secure-env-file> to the first-stage runner/,
);
assert.match(setupArtifactsText, /ERP V1 生产 env 真实值填写 \/ 验收清单/);
assert.match(setupArtifactsText, /ERP V1 生产 env 最小真实值填写 \/ 验收清单/);
assert.match(setupArtifactsText, /ERP V1 production env real values fragment template/);
assert.match(setupArtifactsText, /ERP V1 production env minimum real values fragment template/);
assert.match(setupArtifactsText, /--production-env-values-file <secure-values-env-fragment>/);
assert.match(setupArtifactsText, /--production-env-values-file <secure-minimum-values-env-fragment>/);
assert.match(setupArtifactsText, /merge only variables listed in production-env-real-value-intake\.csv/);
assert.match(setupArtifactsText, /任选其一，优先使用 ERP_V1_DATABASE_URL/);
assert.match(setupArtifactsText, /ERP_V1_DATABASE_URL \/ DATABASE_URL \/ PGURL/);
assert.match(setupArtifactsText, /Choose one: ERP_V1_DATABASE_URL or DATABASE_URL or PGURL/);
assert.match(setupArtifactsText, /PostgreSQL 生产库 \/ 持久化 profile/);
assert.match(setupArtifactsText, /WARNING \| 技术\/管理 \| 对账导出对象存储环境变量/);
assert.match(setupArtifactsText, /可选独立 bucket；附件对象存储 fallback 完整时本变量组可不填/);
assert.match(setupArtifactsText, /"filled","verified","evidenceRef"/);
const valuesFragmentTemplate = readFileSync(join(reportDir, "production-env-values-fragment.template.env.example"), "utf8");
assert.match(valuesFragmentTemplate, /Optional dry-run before first-stage/);
assert.match(valuesFragmentTemplate, /run-v1-production-env-intake-apply\.mjs --values-env-file <secure-values-env-fragment>/);
assert.match(valuesFragmentTemplate, /--use-production-env-setup-env-file --intake-csv <production-env-real-value-intake-csv> --dry-run/);
assert.match(valuesFragmentTemplate, /Or let the first-stage runner dry-run the same merge/);
assert.match(valuesFragmentTemplate, /--production-env-values-dry-run/);
assert.match(valuesFragmentTemplate, /# ERP_V1_DATABASE_URL=<REPLACE_WITH_ERP_V1_DATABASE_URL>/);
assert.match(valuesFragmentTemplate, /# ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT>/);
assert.match(
  valuesFragmentTemplate,
  /# ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=<REPLACE_WITH_ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND>/,
);
assert.match(valuesFragmentTemplate, /# Type: PostgreSQL 连接串/);
const minimumValuesFragmentTemplate = readFileSync(
  join(reportDir, "production-env-minimum-values-fragment.template.env.example"),
  "utf8",
);
assert.match(minimumValuesFragmentTemplate, /minimum real values fragment template/);
assert.match(minimumValuesFragmentTemplate, /minimum blocking path/);
assert.match(minimumValuesFragmentTemplate, /Minimum path uses: ERP_V1_DATABASE_URL/);
assert.match(minimumValuesFragmentTemplate, /# ERP_V1_DATABASE_URL=<REPLACE_WITH_ERP_V1_DATABASE_URL>/);
assert.doesNotMatch(minimumValuesFragmentTemplate, /# DATABASE_URL=<REPLACE_WITH_DATABASE_URL>/);
assert.doesNotMatch(minimumValuesFragmentTemplate, /# PGURL=<REPLACE_WITH_PGURL>/);
assert.match(
  minimumValuesFragmentTemplate,
  /# ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT>/,
);
assert.match(
  minimumValuesFragmentTemplate,
  /# ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=<REPLACE_WITH_ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND>/,
);
assert.doesNotMatch(minimumValuesFragmentTemplate, /ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT/);
assert.match(minimumValuesFragmentTemplate, /secure-minimum-values-env-fragment/);

writeFileSync(draftEnvPath, `${draftText}\nERP_V1_DATABASE_URL=postgres://keep-existing\n`, { mode: 0o600 });
chmodSync(draftEnvPath, 0o600);
const noOverwriteRun = await runSetup(["--target", draftEnvPath, "--output-dir", reportDir, "--json"]);
assert.equal(noOverwriteRun.status, 0, runFailureMessage("existing secure env should not be overwritten", noOverwriteRun));
assert.match(readFileSync(draftEnvPath, "utf8"), /postgres:\/\/keep-existing/);
assert.equal(JSON.parse(noOverwriteRun.stdout).envFile.generated, false);

writeFileSync(readyEnvPath, buildReadyEnv(), { mode: 0o600 });
chmodSync(readyEnvPath, 0o600);
const readyRun = await runSetup(["--target", readyEnvPath, "--output-dir", reportDir, "--json"]);
assert.equal(readyRun.status, 0, runFailureMessage("ready env should pass setup and preflight", readyRun));
const readyReport = JSON.parse(readyRun.stdout);
assert.equal(readyReport.status, "ready");
assert.equal(readyReport.ready, true);
assert.equal(readyReport.setupReady, true);
assert.equal(readyReport.envPreflight.ready, true);
assert.equal(readyReport.envPreflight.passedCount, readyReport.envPreflight.totalCount);
const readyArtifactsText = [
  readyRun.stdout,
  readyRun.stderr,
  readFileSync(join(reportDir, "production-env-fix-checklist.zh-CN.md"), "utf8"),
  readFileSync(join(reportDir, "production-env-fix-checklist.csv"), "utf8"),
  readFileSync(join(reportDir, "production-env-real-value-intake.zh-CN.md"), "utf8"),
  readFileSync(join(reportDir, "production-env-real-value-intake.csv"), "utf8"),
  readFileSync(join(reportDir, "production-env-minimum-values-fragment.template.env.example"), "utf8"),
  readFileSync(join(reportDir, "production-env-values-fragment.template.env.example"), "utf8"),
  readFileSync(join(reportDir, "production-env-fill-template.env.example"), "utf8"),
].join("\n");
assertNoSensitiveOutput(readyArtifactsText);
assert.doesNotMatch(readyArtifactsText, /prod-db\.internal|restore-db\.internal|statement-oss-secret/);
assert.doesNotMatch(
  readyArtifactsText,
  /ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=true/,
  "ready setup artifacts should not encourage persistent restore reset authorization",
);
assert.match(readyArtifactsText, /当前 production env setup 预检没有缺失或占位变量/);
assert.match(readyArtifactsText, /当前 production env setup 预检没有需要填写的真实值行/);
assert.match(readyArtifactsText, /当前 production env setup 预检没有 blocking 真实值片段/);
assert.match(readyArtifactsText, /当前 production env setup 预检没有需要填写的真实值片段/);

writeFileSync(invalidShapeEnvPath, buildInvalidShapeEnv(), { mode: 0o600 });
chmodSync(invalidShapeEnvPath, 0o600);
const invalidShapeRun = await runSetup(["--target", invalidShapeEnvPath, "--output-dir", invalidShapeReportDir, "--json"]);
assert.equal(
  invalidShapeRun.status,
  0,
  runFailureMessage("invalid shaped env should produce a blocked setup report without fake template keys", invalidShapeRun),
);
const invalidShapeReport = JSON.parse(invalidShapeRun.stdout);
assert.equal(invalidShapeReport.status, "prepared");
assert.equal(invalidShapeReport.ready, false);
assert.equal(invalidShapeReport.envPreflight.ready, false);
const invalidShapeTemplate = readFileSync(join(invalidShapeReportDir, "production-env-fill-template.env.example"), "utf8");
const invalidShapeIntake = readFileSync(join(invalidShapeReportDir, "production-env-real-value-intake.csv"), "utf8");
const invalidShapeValuesFragment = readFileSync(
  join(invalidShapeReportDir, "production-env-values-fragment.template.env.example"),
  "utf8",
);
const invalidShapeMinimumValuesFragment = readFileSync(
  join(invalidShapeReportDir, "production-env-minimum-values-fragment.template.env.example"),
  "utf8",
);
assert.match(invalidShapeTemplate, /ERP_V1_DATABASE_URL=<REPLACE_WITH_ERP_V1_DATABASE_URL>/);
assert.match(
  invalidShapeTemplate,
  /ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=<REPLACE_WITH_ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL>/,
);
assert.match(invalidShapeTemplate, /ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT>/);
assert.match(invalidShapeTemplate, /ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET>/);
assert.match(
  invalidShapeTemplate,
  /ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT>/,
);
assert.match(
  invalidShapeTemplate,
  /ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET=<REPLACE_WITH_ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET>/,
);
assert.match(
  invalidShapeTemplate,
  /ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS=<REPLACE_WITH_ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS>/,
);
assert.match(invalidShapeTemplate, /ERP_V1_READINESS_API_BASE_URL=<REPLACE_WITH_ERP_V1_READINESS_API_BASE_URL>/);
assert.match(invalidShapeTemplate, /ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL=<REPLACE_WITH_ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL>/);
assert.doesNotMatch(invalidShapeTemplate, /VALID_POSTGRESQL_CONNECTION_STRING|HTTP_HTTPS_URL|POSITIVE_INTEGER/);
assert.doesNotMatch(invalidShapeTemplate, /DIFFERENT_HOST_PORT_DATABASE|VALID_BUCKET_NAME|VALID_JSON_ARRAY/);
assert.match(invalidShapeIntake, /ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT/);
assert.match(invalidShapeIntake, /http\/https URL/);
assert.doesNotMatch(invalidShapeIntake, /VALID_POSTGRESQL_CONNECTION_STRING|HTTP_HTTPS_URL|POSITIVE_INTEGER/);
assert.match(invalidShapeValuesFragment, /--production-env-values-file <secure-values-env-fragment>/);
assert.match(invalidShapeValuesFragment, /# ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT>/);
assert.match(invalidShapeMinimumValuesFragment, /--production-env-values-file <secure-minimum-values-env-fragment>/);
assert.match(
  invalidShapeMinimumValuesFragment,
  /# ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT>/,
);
assert.doesNotMatch(invalidShapeMinimumValuesFragment, /VALID_POSTGRESQL_CONNECTION_STRING|HTTP_HTTPS_URL|POSITIVE_INTEGER/);
assert.doesNotMatch(invalidShapeValuesFragment, /VALID_POSTGRESQL_CONNECTION_STRING|HTTP_HTTPS_URL|POSITIVE_INTEGER/);
assertNoSensitiveOutput(
  invalidShapeRun.stdout + invalidShapeRun.stderr + invalidShapeTemplate + invalidShapeIntake + invalidShapeValuesFragment,
);

writeFileSync(importSourceEnvPath, buildReadyEnv(), { mode: 0o600 });
chmodSync(importSourceEnvPath, 0o600);
const importRun = await runSetup([
  "--import-from",
  importSourceEnvPath,
  "--target",
  importTargetEnvPath,
  "--output-dir",
  importReportDir,
  "--json",
]);
assert.equal(importRun.status, 0, runFailureMessage("filled secure env should import into target and pass preflight", importRun));
const importReport = JSON.parse(importRun.stdout);
assert.equal(importReport.status, "ready");
assert.equal(importReport.ready, true);
assert.equal(importReport.envFile.imported, true);
assert.equal(importReport.envFile.generated, false);
assert.equal(importReport.envFile.overwritten, false);
assert.equal(importReport.importSource.auditReady, true);
assert.equal(importReport.importSource.assignmentCount, importReport.envFile.assignmentCount);
assert.equal((statSync(importTargetEnvPath).mode & 0o777).toString(8).padStart(3, "0"), "600");
assert.match(readFileSync(importTargetEnvPath, "utf8"), /ERP_V1_DATABASE_URL=postgres:\/\/v1_user:secret-pass@prod-db\.internal:5432\/erp/);
assertNoSensitiveOutput(importRun.stdout + importRun.stderr + readFileSync(join(importReportDir, "latest.md"), "utf8"));

const importNoForceRun = await runSetup([
  "--import-from",
  importSourceEnvPath,
  "--target",
  importTargetEnvPath,
  "--output-dir",
  importReportDir,
  "--json",
]);
assert.equal(importNoForceRun.status, 2, runFailureMessage("existing import target should require --force", importNoForceRun));
const importNoForceReport = JSON.parse(importNoForceRun.stdout);
assert.equal(importNoForceReport.status, "blocked");
assert.ok(importNoForceReport.setupFindings.some((finding) => finding.key === "target-exists-import-needs-force"));
assertNoSensitiveOutput(importNoForceRun.stdout + importNoForceRun.stderr);

const unsafeRun = await runSetup(["--target", unsafeTargetPath, "--output-dir", unsafeReportDir, "--json"]);
assert.equal(unsafeRun.status, 2, runFailureMessage("unignored docs target should be blocked", unsafeRun));
const unsafeReport = JSON.parse(unsafeRun.stdout);
assert.equal(unsafeReport.status, "blocked");
assert.equal(unsafeReport.setupReady, false);
assert.ok(unsafeReport.setupFindings.some((finding) => finding.key === "target-not-ignored"));
assert.equal(existsSync(unsafeTargetPath), false, "unsafe target should not be created");
assert.ok(existsSync(join(unsafeReportDir, "latest.json")), "unsafe-target report should stay under the check output dir");

console.log("V1 production env setup check passed: secure draft creation, no overwrite, ready env, unsafe target block, reports, and redaction are covered.");

function buildReadyEnv() {
  return [
    "ERP_RUNTIME_MODE=production",
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=postgres://restore_user:restore-pass@restore-db.internal:5432/erp_restore",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER=s3_compatible",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[1]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[2]}`,
    "ERP_ATTACHMENT_OBJECT_STORAGE_REGION=cn-east-1",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[4]}`,
    "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX=erp-v1/attachments",
    "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED=false",
    "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF=",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT=https://statement-oss-secret.example.com",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET=statement-private-bucket",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID=AKIA_STATEMENT_SECRET",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY=STATEMENT_SECRET_VALUE",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX=erp-v1/statement-exports",
    "ERP_SYSTEM_PRINTER_ENABLED=true",
    "ERP_SYSTEM_PRINTER_ADAPTER=command_bridge",
    `ERP_SYSTEM_PRINTER_COMMAND=${sensitiveValues[5]}`,
    'ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON=["scripts/print-command-bridge.mjs","--print-job-id","{printJobId}"]',
    "ERP_SYSTEM_PRINTER_ALLOWLIST=PRN-LABEL-A,PRN-DOT-A",
    `ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=${sensitiveValues[6]}`,
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=Label-A,Dot-A",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER=Label-A",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=lpstat",
    'ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON=["-p","{cupsPrinterName}"]',
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS=5000",
    "ERP_V1_READINESS_API_BASE_URL=https://erp.example.com/api",
    "ERP_V1_READINESS_OPERATOR_ID=office-a",
    "ERP_V1_READINESS_DRIVER_OPERATOR_ID=driver-a",
    `ERP_V1_READINESS_TOKEN=${sensitiveValues[7]}`,
    `ERP_V1_READINESS_DRIVER_TOKEN=${sensitiveValues[8]}`,
    "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL=https://erp.example.com/api",
    "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR=.erp-local-storage/v1-field-acceptance",
    "ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID=office-a",
    "ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID=driver-a",
    "ERP_V1_FIELD_EVIDENCE_MANIFEST=.erp-local-storage/v1-field-evidence-intake/filled-manifest.json",
    "ERP_V1_RELEASE_API_BASE_URL=https://erp.example.com/api",
    "ERP_V1_RELEASE_CANDIDATE_OUTPUT_DIR=.erp-local-storage/v1-release-candidate",
    "ERP_V1_RELEASE_OPERATOR_ID=office-a",
    "ERP_V1_RELEASE_DRIVER_OPERATOR_ID=driver-a",
    "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED=false",
    "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF=",
    "",
  ].join("\n");
}

function buildInvalidShapeEnv() {
  return [
    "ERP_RUNTIME_MODE=production",
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL=${sensitiveValues[9]}`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=not-a-postgres-connection",
    "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER=s3_compatible",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[10]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[11]}`,
    "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=invalid-access",
    "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=invalid-secret",
    "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX=erp-v1/attachments",
    "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED=false",
    "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF=",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT=not-a-url",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET=statement/bucket",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID=statement-access",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY=statement-secret",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX=erp-v1/statement-exports",
    "ERP_SYSTEM_PRINTER_ENABLED=true",
    "ERP_SYSTEM_PRINTER_ADAPTER=command_bridge",
    "ERP_SYSTEM_PRINTER_COMMAND=scripts/print-command-bridge.mjs",
    'ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON=["--print-job-id","{printJobId}"]',
    "ERP_SYSTEM_PRINTER_ALLOWLIST=PRN-LABEL-A,PRN-DOT-A",
    "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=.erp-local-storage/print-spool",
    "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=Label-A,Dot-A",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER=Label-A",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=lpstat",
    'ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON=["-p","{cupsPrinterName}"]',
    `ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS=${sensitiveValues[12]}`,
    "ERP_V1_READINESS_API_BASE_URL=not-a-url",
    "ERP_V1_READINESS_OPERATOR_ID=office-a",
    "ERP_V1_READINESS_DRIVER_OPERATOR_ID=driver-a",
    "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL=not-a-url",
    "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR=.erp-local-storage/v1-field-acceptance",
    "ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID=office-a",
    "ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID=driver-a",
    "",
  ].join("\n");
}

function runSetup(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerScript, ...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("production env setup process timed out after 10000ms"));
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
  assert.doesNotMatch(output, /secret-pass|restore-pass|oss-secret|private-bucket|SUPER_SECRET_VALUE|office-token-secret|driver-token-secret/);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
