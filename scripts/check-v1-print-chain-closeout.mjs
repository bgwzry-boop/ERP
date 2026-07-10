import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildV1FieldEvidenceManifestTemplate } from "./v1FieldEvidenceManifest.mjs";
import {
  buildPrintChainCloseout,
  formatPrintChainCloseout,
  redactPrintCloseoutText,
  writePrintChainCloseoutArtifacts,
} from "./run-v1-print-chain-closeout.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-print-chain-closeout");
const readinessPath = join(storageRoot, "print-readiness.json");
const manifestPath = join(storageRoot, "field-evidence-manifest.json");
const outputDir = join(storageRoot, "closeout");
const runnerScript = join(process.cwd(), "scripts", "run-v1-print-chain-closeout.mjs");
const sensitiveCommandPath = "/usr/local/bin/secret-print-wrapper";
const sensitiveSpoolPath = "/var/spool/erp-print-secret/job-001.json";
const sensitiveDatabaseUrl = "postgres://erp_user:PRINT_CLOSEOUT_PASSWORD@print-db.internal:5432/erp";
const sensitiveAccessKey = "AKIA_PRINT_CLOSEOUT_SECRET";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  checkBlockedMissingArtifacts();
  checkReadyCloseout();
  checkPrintEvidenceBlocked();
  checkStaleReadinessBlocked();
  checkSafeguardBlocked();
  await checkCliAndRedaction();
  console.log(
    "V1 print-chain closeout check passed: missing artifacts, ready closeout, evidence blockers, stale readiness, safeguard failures, artifacts, CLI, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

function checkBlockedMissingArtifacts() {
  const report = buildPrintChainCloseout({
    printReadinessPath: join(storageRoot, "missing-readiness.json"),
    fieldEvidenceManifestPath: join(storageRoot, "missing-manifest.json"),
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((item) => item.key === "print-readiness-artifact")?.status, "blocked");
  assert.equal(report.stages.find((item) => item.key === "field-evidence-manifest-artifact")?.status, "blocked");
  assertNoSensitiveOutput(JSON.stringify(report) + formatPrintChainCloseout(report));
}

function checkReadyCloseout() {
  writeJson(readinessPath, buildPrintReadinessReport({ checkedAt: "2026-07-08T08:00:00.000Z" }));
  writeJson(manifestPath, buildPrintManifest({ completePrintGroup: true }));

  const report = buildPrintChainCloseout({
    printReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.passedCount, report.summary.totalCount);
  assert.equal(report.evidenceSummary.printHardwareEvidence.completedRequired, 7);
  assert.equal(report.evidenceSummary.printHardwareEvidence.rawEvidenceRefsIncluded, false);
  assert.equal(report.safeguards.physicalPrinterCalledByCloseout, false);
  assert.equal(report.safeguards.declaresFullV1Complete, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatPrintChainCloseout(report));

  const artifacts = writePrintChainCloseoutArtifacts(report, { outputDir });
  assert.equal(existsSync(artifacts.latestJsonPath), true);
  assert.equal(existsSync(artifacts.latestMarkdownPath), true);
  assertNoSensitiveOutput(readFileSync(artifacts.latestJsonPath, "utf8"));
  assertNoSensitiveOutput(readFileSync(artifacts.latestMarkdownPath, "utf8"));
}

function checkPrintEvidenceBlocked() {
  writeJson(readinessPath, buildPrintReadinessReport({ checkedAt: "2026-07-08T08:00:00.000Z" }));
  writeJson(manifestPath, buildPrintManifest({ completePrintGroup: false }));

  const report = buildPrintChainCloseout({
    printReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const printEvidence = report.stages.find((item) => item.key === "print-hardware-evidence");
  assert.equal(printEvidence?.status, "blocked");
  assert.ok(printEvidence.blockingItems.some((item) => item.key === "barcode_scan_checked"));
  assertNoSensitiveOutput(JSON.stringify(report) + formatPrintChainCloseout(report));
}

function checkStaleReadinessBlocked() {
  writeJson(readinessPath, buildPrintReadinessReport({ checkedAt: "2026-07-01T08:00:00.000Z" }));
  writeJson(manifestPath, buildPrintManifest({ completePrintGroup: true }));

  const report = buildPrintChainCloseout({
    printReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
    maxAgeHours: 72,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((item) => item.key === "print-readiness-freshness")?.status, "blocked");
  assertNoSensitiveOutput(JSON.stringify(report) + formatPrintChainCloseout(report));
}

function checkSafeguardBlocked() {
  writeJson(
    readinessPath,
    buildPrintReadinessReport({
      checkedAt: "2026-07-08T08:00:00.000Z",
      safeguards: { commandValueExposed: true },
      cupsSafeguards: { physicalPrinterCalled: true },
    }),
  );
  writeJson(manifestPath, buildPrintManifest({ completePrintGroup: true, sensitiveEvidenceRef: true }));

  const report = buildPrintChainCloseout({
    printReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const safeguards = report.stages.find((item) => item.key === "print-chain-closeout-safeguards");
  assert.equal(safeguards?.status, "blocked");
  assert.ok(safeguards.blockingItems.some((item) => item.key === "readiness-redacted"));
  assert.ok(safeguards.blockingItems.some((item) => item.key === "readiness-runner-non-printing"));
  assert.ok(safeguards.blockingItems.some((item) => item.key === "manifest-evidence-ref-redacted"));
  assertNoSensitiveOutput(JSON.stringify(report) + formatPrintChainCloseout(report));
}

async function checkCliAndRedaction() {
  writeJson(readinessPath, buildPrintReadinessReport({ checkedAt: "2026-07-08T08:00:00.000Z" }));
  writeJson(manifestPath, buildPrintManifest({ completePrintGroup: true }));
  const run = await runNodeCli([
    runnerScript,
    "--print-readiness-json",
    readinessPath,
    "--field-evidence-manifest",
    manifestPath,
    "--max-age-hours",
    "72",
    "--output-dir",
    outputDir,
    "--json",
  ]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.artifacts.latestJsonPath.includes("[redacted-path]"), true);
  assertNoSensitiveOutput(run.stdout + run.stderr);

  const redacted = redactPrintCloseoutText(
    `${sensitiveDatabaseUrl} ${sensitiveCommandPath} ${sensitiveSpoolPath} ${sensitiveAccessKey} ${readinessPath} ${manifestPath}`,
  );
  assertNoSensitiveOutput(redacted);
}

function buildPrintReadinessReport({ checkedAt, safeguards = {}, cupsSafeguards = {} } = {}) {
  return {
    status: "ready",
    ready: true,
    checkedAt,
    summary: { label: "9/9 通过", passedCount: 9, totalCount: 9, blockingCount: 0, warningCount: 0 },
    cups: {
      status: "ready",
      ready: true,
      checkedAt,
      scope: "non_printing_cups_queue_preflight",
      cupsPrinterConfigured: true,
      cupsPrinterAllowed: true,
      cupsStatusCommandConfigured: true,
      cupsStatusCommandRunnable: true,
      stdoutBytes: 120,
      stderrBytes: 0,
      safeguards: {
        nonPrinting: true,
        physicalPrinterCalled: false,
        commandValueExposed: false,
        commandArgsExposed: false,
        stdoutExposed: false,
        stderrExposed: false,
        payloadExposed: false,
        printFileCreated: false,
        ...cupsSafeguards,
      },
    },
    criteria: [
      "system-printer-enabled",
      "command-bridge-configured",
      "spool-readback",
      "required-label-device",
      "required-dot-matrix-device",
      "label-device-driver-mode",
      "dot-matrix-driver-mode",
      "field-qa-complete",
      "cups-queue-preflight",
    ].map((key) => ({
      key,
      label: key,
      status: "passed",
      blocking: true,
      detail: "passed",
    })),
    blockingCriteria: [],
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      printFileCreated: false,
      ...safeguards,
    },
    nextActions: ["继续现场签收。"],
    diagnosticNoise: `${sensitiveCommandPath} ${sensitiveSpoolPath}`,
  };
}

function buildPrintManifest({ completePrintGroup, sensitiveEvidenceRef = false } = {}) {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.updatedAt = "2026-07-08T08:10:00.000Z";
  const group = manifest.evidenceGroups.find((item) => item.key === "print_hardware");
  assert.ok(group, "template must include print_hardware group");
  for (const item of group.items) {
    const shouldComplete = completePrintGroup || item.key !== "barcode_scan_checked";
    item.status = shouldComplete ? "passed" : "pending";
    item.evidenceRef = shouldComplete
      ? sensitiveEvidenceRef && item.key === "label_sample_printed"
        ? `${sensitiveDatabaseUrl} ${sensitiveAccessKey}`
        : `ATT-PRINT-${item.key}`
      : "";
    item.notes = shouldComplete ? "现场已核对" : "";
  }
  return manifest;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runNodeCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH || "" },
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

function assertNoSensitiveOutput(value) {
  const text = String(value || "");
  for (const sensitive of [
    sensitiveCommandPath,
    sensitiveSpoolPath,
    sensitiveDatabaseUrl,
    "PRINT_CLOSEOUT_PASSWORD",
    sensitiveAccessKey,
    readinessPath,
    manifestPath,
    outputDir,
  ]) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(sensitive)), `sensitive output leaked: ${sensitive}`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
