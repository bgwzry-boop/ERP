import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-intake-apply");
const setupScript = join(process.cwd(), "scripts", "run-v1-production-env-setup.mjs");
const applyScript = join(process.cwd(), "scripts", "run-v1-production-env-intake-apply.mjs");
const targetEnvPath = join(storageRoot, "secure-prod.env");
const valuesEnvPath = join(storageRoot, "real-values.env");
const minimumValuesEnvPath = join(storageRoot, "minimum-real-values.env");
const unknownValuesEnvPath = join(storageRoot, "unknown-real-values.env");
const conflictValuesEnvPath = join(storageRoot, "conflict-real-values.env");
const setupOutputDir = join(storageRoot, "setup-report");
const initialIntakeCsvPath = join(storageRoot, "initial-production-env-real-value-intake.csv");
const verifyOutputDir = join(storageRoot, "verify-report");
const applyOutputDir = join(storageRoot, "apply-report");
const minimumOutputDir = join(storageRoot, "minimum-report");
const unknownOutputDir = join(storageRoot, "unknown-report");
const conflictOutputDir = join(storageRoot, "conflict-report");
const sensitiveValues = [
  "postgres://v1_user:secret-pass@prod-db.internal:5432/erp",
  "postgres://restore_user:restore-pass@restore-db.internal:5432/erp_restore",
  "https://oss-secret.example.com",
  "erp-v1-private-bucket",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/usr/local/bin/erp-print-secret",
  "/var/spool/erp-secret",
  "https://erp-secret.example.com/api",
  "postgres://alias_user:other-secret@other-db.internal:5432/erp",
  "UNEXPECTED_SECRET_VALUE",
];
const minimumBlockingTargetSignature = [
  "alternative-group:ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "variable:ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
  "variable:ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
  "variable:ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
  "variable:ERP_SYSTEM_PRINTER_ALLOWLIST",
  "variable:ERP_SYSTEM_PRINTER_COMMAND",
  "variable:ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
].sort().join("|");

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

const setupRun = await runNode(setupScript, ["--target", targetEnvPath, "--output-dir", setupOutputDir, "--json"]);
assert.equal(setupRun.status, 0, runFailureMessage("setup should prepare target env", setupRun));
assert.ok(existsSync(targetEnvPath), "target env should exist before applying values");
const intakeCsvPath = join(setupOutputDir, "production-env-real-value-intake.csv");
const setupJsonPath = join(setupOutputDir, "latest.json");
const staleSetupJsonPath = join(storageRoot, "stale-production-env-setup.json");
assert.ok(existsSync(intakeCsvPath), "setup should generate real-value intake CSV");
assert.ok(existsSync(setupJsonPath), "setup should generate latest setup JSON");
writeFileSync(initialIntakeCsvPath, readFileSync(intakeCsvPath, "utf8"));

writeSecureFile(valuesEnvPath, buildRealValuesEnv());
writeSecureFile(minimumValuesEnvPath, buildMinimumValuesEnv());
writeSecureFile(
  staleSetupJsonPath,
  JSON.stringify(
    {
      scope: "v1_production_env_setup",
      setupReady: true,
      checkedAt: "2000-01-01T00:00:00.000Z",
      envFile: {
        path: targetEnvPath,
        gitIgnored: true,
        gitTracked: false,
        fileMode: "600",
      },
    },
    null,
    2,
  ),
);
const staleSetupRun = await runNode(applyScript, [
  "--values-env-file",
  minimumValuesEnvPath,
  "--use-production-env-setup-env-file",
  "--production-env-setup-json",
  staleSetupJsonPath,
  "--intake-csv",
  initialIntakeCsvPath,
  "--dry-run",
  "--json",
]);
assert.equal(staleSetupRun.status, 1, runFailureMessage("stale setup report should block intake apply", staleSetupRun));
const staleSetupError = JSON.parse(staleSetupRun.stdout);
assert.match(staleSetupError.error.message, /setup report is stale/);
assertNoSensitiveOutput(staleSetupRun.stdout + staleSetupRun.stderr);

const minimumDryRun = await runNode(applyScript, [
  "--values-env-file",
  minimumValuesEnvPath,
  "--use-production-env-setup-env-file",
  "--production-env-setup-json",
  setupJsonPath,
  "--intake-csv",
  initialIntakeCsvPath,
  "--output-dir",
  minimumOutputDir,
  "--dry-run",
  "--json",
]);
assert.equal(minimumDryRun.status, 2, runFailureMessage("minimum real values dry-run should not write target env", minimumDryRun));
const minimumDryRunReport = JSON.parse(minimumDryRun.stdout);
assert.equal(minimumDryRunReport.status, "dry_run");
assert.equal(minimumDryRunReport.targetEnvFile.applied, false);
assert.equal(minimumDryRunReport.targetEnvFile.fromProductionSetup, true);
assert.equal(minimumDryRunReport.summary.targetEnvFileFromProductionSetup, true);
assertSourceEnvFileFingerprint(minimumDryRunReport);
assert.equal(minimumDryRunReport.safeguards.targetEnvFileReadFromProductionSetup, true);
assert.equal(minimumDryRunReport.dryRunProjection.minimumBlockingCoverage.ready, true);
assert.equal(minimumDryRunReport.dryRunProjection.minimumBlockingCoverage.targetCount, 11);
assert.equal(minimumDryRunReport.dryRunProjection.minimumBlockingCoverage.satisfiedCount, 11);
assert.equal(minimumDryRunReport.dryRunProjection.minimumBlockingCoverage.missingCount, 0);
assert.equal(minimumDryRunReport.dryRunProjection.minimumBlockingCoverage.variableRowCount, 10);
assert.equal(minimumDryRunReport.dryRunProjection.minimumBlockingCoverage.alternativeGroupCount, 1);
assert.equal(minimumDryRunReport.dryRunProjection.minimumBlockingCoverage.targetSignature, minimumBlockingTargetSignature);
assert.ok(minimumDryRunReport.dryRunProjection.intakeCoverage.missingWarningVariableCount > 0, "minimum dry-run should still show warning variables outside the minimum path");
assert.match(readFileSync(join(minimumOutputDir, "latest.md"), "utf8"), /预计最小阻塞补值：已补齐 \(11\/11\)/);
assertNoSensitiveOutput(
  minimumDryRun.stdout +
    minimumDryRun.stderr +
    readFileSync(join(minimumOutputDir, "latest.md"), "utf8") +
    readFileSync(join(minimumOutputDir, "latest.json"), "utf8"),
);
const applyRun = await runNode(applyScript, [
  "--values-env-file",
  valuesEnvPath,
  "--use-production-env-setup-env-file",
  "--production-env-setup-json",
  setupJsonPath,
  "--intake-csv",
  initialIntakeCsvPath,
  "--setup-output-dir",
  setupOutputDir,
  "--verify-output-dir",
  verifyOutputDir,
  "--output-dir",
  applyOutputDir,
  "--json",
]);
assert.equal(applyRun.status, 0, runFailureMessage("allowed real values should apply and refresh gates", applyRun));
const applyReport = JSON.parse(applyRun.stdout);
assert.equal(applyReport.scope, "v1_production_env_real_value_intake_apply");
assert.equal(applyReport.status, "ready");
assert.equal(applyReport.ready, true);
assert.equal(applyReport.summary.appliedVariableCount, 15);
assert.equal(applyReport.summary.envPreflightReady, true);
assert.equal(applyReport.summary.intakeVerificationReady, true);
assert.equal(applyReport.summary.targetEnvFileFromProductionSetup, true);
assert.equal(applyReport.sourceEnvFile.pathIncluded, false);
assertSourceEnvFileFingerprint(applyReport);
assert.equal(applyReport.targetEnvFile.pathIncluded, false);
assert.equal(applyReport.targetEnvFile.fromProductionSetup, true);
assert.equal(applyReport.intakeCsv.pathIncluded, false);
assert.equal(applyReport.safeguards.envValuesExposed, false);
assert.equal(applyReport.safeguards.envFilePathIncluded, false);
assert.equal(applyReport.safeguards.onlyIntakeVariablesApplied, true);
assert.equal(applyReport.safeguards.targetEnvFileReadFromProductionSetup, true);
assert.equal((statSync(targetEnvPath).mode & 0o777).toString(8).padStart(3, "0"), "600");
assert.match(readFileSync(targetEnvPath, "utf8"), /ERP_V1_DATABASE_URL=postgres:\/\/v1_user:secret-pass@prod-db\.internal:5432\/erp/);
assert.match(readFileSync(targetEnvPath, "utf8"), /ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=lpstat/);
assert.ok(existsSync(join(applyOutputDir, "latest.json")), "apply JSON report should be written");
assert.ok(existsSync(join(applyOutputDir, "latest.md")), "apply Markdown report should be written");
assert.ok(existsSync(join(verifyOutputDir, "latest.json")), "intake verification report should be refreshed");
assertNoSensitiveOutput(
  applyRun.stdout +
    applyRun.stderr +
    readFileSync(join(applyOutputDir, "latest.md"), "utf8") +
    readFileSync(join(applyOutputDir, "latest.json"), "utf8") +
    readFileSync(join(verifyOutputDir, "latest.md"), "utf8"),
);

const targetTextAfterApply = readFileSync(targetEnvPath, "utf8");
writeSecureFile(unknownValuesEnvPath, `${buildRealValuesEnv()}ERP_NOT_IN_INTAKE_SECRET=${sensitiveValues[10]}\n`);
const unknownRun = await runNode(applyScript, [
  "--values-env-file",
  unknownValuesEnvPath,
  "--target-env-file",
  targetEnvPath,
  "--intake-csv",
  initialIntakeCsvPath,
  "--output-dir",
  unknownOutputDir,
  "--json",
]);
assert.equal(unknownRun.status, 2, runFailureMessage("unknown variables should block apply", unknownRun));
const unknownReport = JSON.parse(unknownRun.stdout);
assert.equal(unknownReport.status, "blocked");
assert.equal(unknownReport.ready, false);
assert.equal(unknownReport.summary.unknownSourceVariableCount, 1);
assert.equal(unknownReport.targetEnvFile.applied, false);
assert.ok(unknownReport.blockingFindings.some((finding) => finding.key === "values-contain-non-intake-keys"));
assert.equal(readFileSync(targetEnvPath, "utf8"), targetTextAfterApply, "blocked unknown-key run should not rewrite target env");
assertNoSensitiveOutput(unknownRun.stdout + unknownRun.stderr + readFileSync(join(unknownOutputDir, "latest.md"), "utf8"));

writeSecureFile(conflictValuesEnvPath, buildConflictValuesEnv());
const conflictRun = await runNode(applyScript, [
  "--values-env-file",
  conflictValuesEnvPath,
  "--target-env-file",
  targetEnvPath,
  "--intake-csv",
  initialIntakeCsvPath,
  "--output-dir",
  conflictOutputDir,
  "--json",
]);
assert.equal(conflictRun.status, 2, runFailureMessage("conflicting choose-one aliases should block apply", conflictRun));
const conflictReport = JSON.parse(conflictRun.stdout);
assert.equal(conflictReport.status, "blocked");
assert.ok(conflictReport.blockingFindings.some((finding) => finding.key === "alternative-group-conflict"));
assert.equal(conflictReport.targetEnvFile.applied, false);
assertNoSensitiveOutput(conflictRun.stdout + conflictRun.stderr + readFileSync(join(conflictOutputDir, "latest.md"), "utf8"));

const dryRunTargetBefore = readFileSync(targetEnvPath, "utf8");
const dryRun = await runNode(applyScript, [
  "--values-env-file",
  valuesEnvPath,
  "--target-env-file",
  targetEnvPath,
  "--intake-csv",
  initialIntakeCsvPath,
  "--output-dir",
  applyOutputDir,
  "--dry-run",
  "--json",
]);
assert.equal(dryRun.status, 2, runFailureMessage("dry-run should not claim ready because nothing was written", dryRun));
const dryRunReport = JSON.parse(dryRun.stdout);
assert.equal(dryRunReport.status, "dry_run");
assert.equal(dryRunReport.targetEnvFile.applied, false);
assertSourceEnvFileFingerprint(dryRunReport);
assert.equal(dryRunReport.dryRunProjection.envValuesIncluded, false);
assert.equal(dryRunReport.dryRunProjection.targetWouldBeWritten, false);
assert.equal(dryRunReport.dryRunProjection.productionEnvPreflight.ready, true);
assert.equal(dryRunReport.dryRunProjection.productionEnvPreflight.passedCount, 10);
assert.equal(dryRunReport.dryRunProjection.productionEnvPreflight.totalCount, 10);
assert.equal(dryRunReport.dryRunProjection.minimumBlockingCoverage.ready, true);
assert.equal(dryRunReport.dryRunProjection.minimumBlockingCoverage.satisfiedCount, 11);
assert.equal(dryRunReport.dryRunProjection.minimumBlockingCoverage.targetCount, 11);
assert.equal(dryRunReport.dryRunProjection.minimumBlockingCoverage.missingCount, 0);
assert.equal(dryRunReport.dryRunProjection.minimumBlockingCoverage.targetSignature, minimumBlockingTargetSignature);
assert.equal(dryRunReport.dryRunProjection.minimumWarningCoverage.ready, true);
assert.equal(dryRunReport.dryRunProjection.minimumWarningCoverage.missingCount, 0);
assert.equal(dryRunReport.dryRunProjection.intakeCoverage.missingRequiredVariableCount, 0);
assert.equal(dryRunReport.dryRunProjection.intakeCoverage.alternativeGroupBlockingCount, 0);
assert.equal(dryRunReport.dryRunProjection.intakeCoverage.configuredRowCount, 15);
assert.match(readFileSync(join(applyOutputDir, "latest.md"), "utf8"), /Dry-run 写入后预计结果/);
assert.match(readFileSync(join(applyOutputDir, "latest.md"), "utf8"), /预计生产 env 变量预检：通过 \(10\/10\)/);
assert.match(readFileSync(join(applyOutputDir, "latest.md"), "utf8"), /预计最小阻塞补值：已补齐 \(11\/11\)/);
assert.match(readFileSync(join(applyOutputDir, "latest.md"), "utf8"), /预计建议 \/ 可选补值：已补齐或无需补齐/);
assert.equal(readFileSync(targetEnvPath, "utf8"), dryRunTargetBefore, "dry-run should not change target env");
assertNoSensitiveOutput(
  dryRun.stdout +
    dryRun.stderr +
    readFileSync(join(applyOutputDir, "latest.md"), "utf8") +
    readFileSync(join(applyOutputDir, "latest.json"), "utf8"),
);

console.log("V1 production env intake apply check passed: whitelist merge, refresh, unknown-key block, alias conflict block, dry-run projection, and redaction are covered.");

function buildRealValuesEnv() {
  return [
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    `ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=${sensitiveValues[1]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[2]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[5]}`,
    `ERP_SYSTEM_PRINTER_COMMAND=${sensitiveValues[6]}`,
    "ERP_SYSTEM_PRINTER_ALLOWLIST=PRN-LABEL-A,PRN-DOT-A",
    `ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=${sensitiveValues[7]}`,
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=Label-A,Dot-A",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=lpstat",
    `ERP_V1_READINESS_API_BASE_URL=${sensitiveValues[8]}`,
    "ERP_V1_READINESS_OPERATOR_ID=office-a",
    "ERP_V1_READINESS_DRIVER_OPERATOR_ID=driver-a",
    `ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL=${sensitiveValues[8]}`,
    "",
  ].join("\n");
}

function buildMinimumValuesEnv() {
  return [
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    `ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=${sensitiveValues[1]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[2]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[4]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[5]}`,
    `ERP_SYSTEM_PRINTER_COMMAND=${sensitiveValues[6]}`,
    "ERP_SYSTEM_PRINTER_ALLOWLIST=PRN-LABEL-A,PRN-DOT-A",
    `ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=${sensitiveValues[7]}`,
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=Label-A,Dot-A",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=lpstat",
    "",
  ].join("\n");
}

function buildConflictValuesEnv() {
  return [
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    `DATABASE_URL=${sensitiveValues[9]}`,
    "",
  ].join("\n");
}

function writeSecureFile(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function assertSourceEnvFileFingerprint(report) {
  assert.equal(report.summary.sourceEnvFileFingerprintIncluded, true);
  assert.equal(report.sourceEnvFile.pathIncluded, false);
  assert.equal(report.sourceEnvFile.fingerprint.algorithm, "sha256");
  assert.match(report.sourceEnvFile.fingerprint.digest, /^[a-f0-9]{64}$/);
  assert.equal(report.sourceEnvFile.fingerprint.digestIncluded, true);
  assert.equal(report.sourceEnvFile.fingerprint.pathIncluded, false);
  assert.equal(report.sourceEnvFile.fingerprint.envValuesIncluded, false);
  assert.equal(report.sourceEnvFile.fingerprint.rawEnvLineIncluded, false);
  assert.equal(report.safeguards.sourceEnvFileFingerprintIncluded, true);
  assert.equal(report.safeguards.sourceEnvFileFingerprintValuesExposed, false);
}

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("process timed out after 10000ms"));
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

function assertNoSensitiveOutput(output) {
  for (const value of sensitiveValues) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)), `output leaked sensitive value: ${value}`);
  }
  assert.doesNotMatch(output, new RegExp(escapeRegExp(targetEnvPath)), "output leaked target env path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(setupJsonPath)), "output leaked production env setup JSON path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(valuesEnvPath)), "output leaked source env path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(minimumValuesEnvPath)), "output leaked minimum source env path");
  assert.doesNotMatch(output, /secret-pass|restore-pass|oss-secret|private-bucket|SUPER_SECRET_VALUE|UNEXPECTED_SECRET_VALUE/i);
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
