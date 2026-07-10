import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

import {
  buildProductionEnvValuesDryRunProofReport,
  formatProductionEnvValuesDryRunProofReport,
} from "./run-v1-production-env-values-dry-run-proof-check.mjs";
import { buildProductionEnvValuesFileFingerprint } from "./run-v1-production-env-intake-apply.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-values-dry-run-proof");
const scriptPath = join(process.cwd(), "scripts", "run-v1-production-env-values-dry-run-proof-check.mjs");
const valuesEnvPath = join(storageRoot, "production-values.env");
const targetEnvPath = join(storageRoot, "secure-prod.env");
const applyReportPath = join(storageRoot, "apply-latest.json");
const setupJsonPath = join(storageRoot, "production-env-setup.json");
const sensitiveDatabaseUrl = "postgres://erp_user:DRY_RUN_PROOF_SECRET@prod-db.internal:5432/erp";
const sensitiveSecret = "DRY_RUN_PROOF_OBJECT_STORAGE_SECRET_VALUE";
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

try {
  writeSecureFile(valuesEnvPath, buildValuesEnv());
  writeSecureFile(targetEnvPath, "ERP_V1_PERSISTENCE_PROFILE=postgres\nERP_V1_FILE_STORAGE_PROFILE=object_storage\n");
  writeFreshSetupJson();
  writeDryRunReport();

  checkReadyProofWithExplicitTarget();
  checkReadyProofWithProductionEnvSetupTarget();
  checkChangedValuesFileFingerprintBlocks();
  checkMissingFingerprintBlocks();
  checkChangedValuesFileBlocks();
  checkChangedTargetFileBlocks();
  checkExpiredProofBlocks();
  await checkCliAndRedaction();

  console.log(
    "V1 production env values dry-run proof check passed: fresh proof, setup target reuse, file freshness blockers, expiry blockers, CLI, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

function checkReadyProofWithExplicitTarget() {
  const report = buildProductionEnvValuesDryRunProofReport({
    valuesEnvFile: valuesEnvPath,
    targetEnvFile: targetEnvPath,
    applyReportJson: applyReportPath,
  });
  assert.equal(report.scope, "v1_production_env_values_dry_run_proof_check");
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.valuesFileUnchangedAfterProof, true);
  assert.equal(report.summary.targetEnvFileUnchangedAfterProof, true);
  assert.equal(report.summary.valuesAuditReady, true);
  assert.equal(report.summary.targetAuditReady, true);
  assert.equal(report.proof.minimumBlockingReady, true);
  assert.equal(report.proof.minimumBlockingTargetCount, 11);
  assert.equal(report.proof.minimumBlockingSatisfiedCount, 11);
  assert.equal(report.proof.minimumBlockingTargetSignatureIncluded, true);
  assert.equal(report.proof.valuesEnvFileFingerprintIncluded, true);
  assert.equal(report.proof.valuesEnvFileFingerprintValid, true);
  assert.equal(report.proof.valuesEnvFileFingerprintAlgorithm, "sha256");
  assert.equal(report.proof.valuesEnvFileFingerprintDigestIncluded, false);
  assert.equal(report.summary.valuesFingerprintIncluded, true);
  assert.equal(report.summary.valuesFingerprintMatched, true);
  assert.equal(report.valuesEnvFile.fingerprintCalculated, true);
  assert.equal(report.valuesEnvFile.fingerprintDigestIncluded, false);
  assert.equal(report.safeguards.valuesEnvFileFingerprintCompared, true);
  assert.equal(report.safeguards.valuesEnvFileFingerprintDigestExposed, false);
  assert.equal(report.safeguards.valuesEnvFileFingerprintValuesExposed, false);
  assert.equal(report.safeguards.envValuesExposed, false);
  assert.equal(report.safeguards.envFilePathIncluded, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionEnvValuesDryRunProofReport(report));
}

function checkReadyProofWithProductionEnvSetupTarget() {
  writeDryRunReport({ targetFromProductionSetup: true });
  const report = buildProductionEnvValuesDryRunProofReport({
    valuesEnvFile: valuesEnvPath,
    useProductionEnvSetupEnvFile: true,
    productionEnvSetupJson: setupJsonPath,
    applyReportJson: applyReportPath,
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.targetEnvFile.fromProductionSetup, true);
  assert.equal(report.summary.targetEnvFileFromProductionSetup, true);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionEnvValuesDryRunProofReport(report));
  writeDryRunReport();
}

function checkChangedValuesFileFingerprintBlocks() {
  writeDryRunReport();
  const checkedAtMs = Date.parse(JSON.parse(readFileSync(applyReportPath, "utf8")).checkedAt);
  writeSecureFile(valuesEnvPath, buildChangedValuesEnv());
  touchBefore(valuesEnvPath, checkedAtMs - 10_000);
  const report = buildProductionEnvValuesDryRunProofReport({
    valuesEnvFile: valuesEnvPath,
    targetEnvFile: targetEnvPath,
    applyReportJson: applyReportPath,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.ok(report.blockingFindings.some((item) => item.key === "values-env-file-fingerprint-mismatch"));
  assert.equal(report.valuesEnvFile.changedAfterDryRunProof, false);
  assert.equal(report.summary.valuesFingerprintMatched, false);
  assert.equal(report.safeguards.valuesEnvFileFingerprintCompared, true);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionEnvValuesDryRunProofReport(report));
  writeSecureFile(valuesEnvPath, buildValuesEnv());
  writeDryRunReport();
}

function checkMissingFingerprintBlocks() {
  writeDryRunReport({ includeFingerprint: false });
  const report = buildProductionEnvValuesDryRunProofReport({
    valuesEnvFile: valuesEnvPath,
    targetEnvFile: targetEnvPath,
    applyReportJson: applyReportPath,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.ok(report.blockingFindings.some((item) => item.key === "dry-run-values-fingerprint-missing"));
  assert.equal(report.proof.valuesEnvFileFingerprintIncluded, false);
  assert.equal(report.summary.valuesFingerprintMatched, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionEnvValuesDryRunProofReport(report));
  writeDryRunReport();
}

function checkChangedValuesFileBlocks() {
  writeDryRunReport();
  const checkedAtMs = Date.parse(JSON.parse(readFileSync(applyReportPath, "utf8")).checkedAt);
  touchAfter(valuesEnvPath, checkedAtMs + 5000);
  const report = buildProductionEnvValuesDryRunProofReport({
    valuesEnvFile: valuesEnvPath,
    targetEnvFile: targetEnvPath,
    applyReportJson: applyReportPath,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.ok(report.blockingFindings.some((item) => item.key === "values-env-file-newer-than-dry-run"));
  assert.equal(report.valuesEnvFile.changedAfterDryRunProof, true);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionEnvValuesDryRunProofReport(report));
  writeSecureFile(valuesEnvPath, buildValuesEnv());
  writeDryRunReport();
}

function checkChangedTargetFileBlocks() {
  writeDryRunReport();
  const checkedAtMs = Date.parse(JSON.parse(readFileSync(applyReportPath, "utf8")).checkedAt);
  touchAfter(targetEnvPath, checkedAtMs + 5000);
  const report = buildProductionEnvValuesDryRunProofReport({
    valuesEnvFile: valuesEnvPath,
    targetEnvFile: targetEnvPath,
    applyReportJson: applyReportPath,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.ok(report.blockingFindings.some((item) => item.key === "target-env-file-newer-than-dry-run"));
  assert.equal(report.targetEnvFile.changedAfterDryRunProof, true);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionEnvValuesDryRunProofReport(report));
  writeSecureFile(targetEnvPath, "ERP_V1_PERSISTENCE_PROFILE=postgres\nERP_V1_FILE_STORAGE_PROFILE=object_storage\n");
  writeFreshSetupJson();
  writeDryRunReport();
}

function checkExpiredProofBlocks() {
  writeDryRunReport({ checkedAt: "2000-01-01T00:00:00.000Z" });
  const oldDate = new Date("1999-12-31T23:59:00.000Z");
  utimesSync(valuesEnvPath, oldDate, oldDate);
  utimesSync(targetEnvPath, oldDate, oldDate);
  const report = buildProductionEnvValuesDryRunProofReport({
    valuesEnvFile: valuesEnvPath,
    targetEnvFile: targetEnvPath,
    applyReportJson: applyReportPath,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.ok(report.blockingFindings.some((item) => item.key === "dry-run-proof-stale"));
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionEnvValuesDryRunProofReport(report));
  writeSecureFile(valuesEnvPath, buildValuesEnv());
  writeSecureFile(targetEnvPath, "ERP_V1_PERSISTENCE_PROFILE=postgres\nERP_V1_FILE_STORAGE_PROFILE=object_storage\n");
  writeFreshSetupJson();
  writeDryRunReport();
}

async function checkCliAndRedaction() {
  writeDryRunReport({ targetFromProductionSetup: true });
  const run = await runNode([
    scriptPath,
    "--values-env-file",
    valuesEnvPath,
    "--use-production-env-setup-env-file",
    "--production-env-setup-json",
    setupJsonPath,
    "--apply-report-json",
    applyReportPath,
    "--json",
  ]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ready, true);
  assert.equal(report.targetEnvFile.fromProductionSetup, true);
  assertNoSensitiveOutput(run.stdout + run.stderr);
}

function writeDryRunReport({ checkedAt = new Date().toISOString(), targetFromProductionSetup = false, includeFingerprint = true } = {}) {
  const sourceEnvFile = includeFingerprint
    ? {
        pathIncluded: false,
        fingerprint: buildProductionEnvValuesFileFingerprint(valuesEnvPath),
      }
    : {
        pathIncluded: false,
      };
  writeFileSync(
    applyReportPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_real_value_intake_apply",
        status: "dry_run",
        ready: false,
        checkedAt,
        dryRun: true,
        targetEnvFile: {
          fromProductionSetup: targetFromProductionSetup,
          pathIncluded: false,
        },
        sourceEnvFile,
        dryRunProjection: {
          targetWouldBeWritten: false,
          productionEnvPreflight: {
            ready: true,
            passedCount: 10,
            totalCount: 10,
            blockingCount: 0,
            warningCount: 0,
          },
          intakeCoverage: {
            missingRequiredVariableCount: 0,
            alternativeGroupBlockingCount: 0,
          },
          minimumBlockingCoverage: {
            ready: true,
            targetCount: 11,
            satisfiedCount: 11,
            missingCount: 0,
            targetSignature: minimumBlockingTargetSignature,
          },
        },
        safeguards: {
          envValuesExposed: false,
          envFilePathIncluded: false,
          secretFieldsExposed: false,
        },
      },
      null,
      2,
    )}\n`,
  );
}

function writeFreshSetupJson() {
  const checkedAt = new Date().toISOString();
  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
        setupReady: true,
        checkedAt,
        envFile: {
          path: targetEnvPath,
          exists: true,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );
}

function buildValuesEnv() {
  return [
    `ERP_V1_DATABASE_URL=${sensitiveDatabaseUrl}`,
    "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=postgres://restore:restore-pass@restore-db.internal:5432/erp_restore",
    "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=https://oss-proof.example.com",
    "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=erp-proof-private-bucket",
    "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=AKIA_PROOF_KEY",
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveSecret}`,
    "ERP_SYSTEM_PRINTER_COMMAND=print-bridge",
    "ERP_SYSTEM_PRINTER_ALLOWLIST=label-a,dot-a",
    "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=/tmp/erp-proof-spool",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=epson_lq_615kii_notes",
    "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=lpstat",
    "",
  ].join("\n");
}

function buildChangedValuesEnv() {
  return buildValuesEnv().replace("ERP_SYSTEM_PRINTER_ALLOWLIST=label-a,dot-a", "ERP_SYSTEM_PRINTER_ALLOWLIST=label-a,dot-b");
}

function writeSecureFile(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function touchAfter(path, timestampMs) {
  const date = new Date(timestampMs);
  utimesSync(path, date, date);
}

function touchBefore(path, timestampMs) {
  const date = new Date(timestampMs);
  utimesSync(path, date, date);
}

function runNode(args) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
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
    child.on("close", (status) => {
      resolvePromise({ status, stdout, stderr });
    });
  });
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, /DRY_RUN_PROOF_SECRET/);
  assert.doesNotMatch(output, /DRY_RUN_PROOF_OBJECT_STORAGE_SECRET_VALUE/);
  assert.doesNotMatch(output, /prod-db\.internal/);
  assert.doesNotMatch(output, /erp-proof-private-bucket/);
  assert.doesNotMatch(output, /oss-proof\.example\.com/);
  assert.doesNotMatch(output, new RegExp(escapeRegExp(valuesEnvPath)));
  assert.doesNotMatch(output, new RegExp(escapeRegExp(targetEnvPath)));
  assert.doesNotMatch(output, new RegExp(escapeRegExp(applyReportPath)));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
