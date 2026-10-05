import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { buildV1FieldEvidenceManifestTemplate } from "./v1FieldEvidenceManifest.mjs";
import {
  buildPrintChainExecution,
  formatPrintChainExecution,
  writePrintChainExecutionArtifacts,
} from "./run-v1-print-chain-execution.mjs";
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

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-print-chain-execution");
const apiStorageRoot = join(storageRoot, "api-storage");
const spoolRoot = join(storageRoot, "spool");
const outputDir = join(storageRoot, "execution");
const cupsOutputDir = join(storageRoot, "cups");
const readinessOutputDir = join(storageRoot, "readiness");
const closeoutOutputDir = join(storageRoot, "closeout");
const completeManifestPath = join(storageRoot, "field-evidence-complete.json");
const incompleteManifestPath = join(storageRoot, "field-evidence-incomplete.json");
const runnerScript = join(process.cwd(), "scripts", "run-v1-print-chain-execution.mjs");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");
const sensitiveSpoolPath = "/var/spool/erp-print-secret/job-001.json";
const sensitiveDatabaseUrl = "postgres://erp_user:PRINT_EXECUTION_PASSWORD@print-db.internal:5432/erp";
const sensitiveAccessKey = "AKIA_PRINT_EXECUTION_SECRET";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });
mkdirSync(spoolRoot, { recursive: true });
const printedPrintJobs = seedPrintedPrintReadinessJobs({
  storageRoot: apiStorageRoot,
  idPrefix: "PJ-EXEC",
});
writeJson(completeManifestPath, buildPrintManifest({ completePrintGroup: true }));
writeJson(incompleteManifestPath, buildPrintManifest({ completePrintGroup: false, sensitiveEvidenceRef: true }));

const server = createApiServer({ allowLocalFixture: true,
  printDeviceRepositoryOptions: { storageRoot: apiStorageRoot },
  printJobRepositoryOptions: { storageRoot: apiStorageRoot },
  printerDeviceFieldTestRepositoryOptions: { storageRoot: apiStorageRoot },
  printDriverAdapterOptions: {
    systemPrinterEnabled: true,
    systemPrinterAdapterKind: "command_bridge",
    systemPrinterCommand: process.execPath,
    systemPrinterCommandArgs: [
      printCommandBridgeScript,
      "--storage-root",
      apiStorageRoot,
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

  checkPlanOnly(baseUrl);
  await preparePositiveReadiness(baseUrl);
  await checkBlockedPendingEvidence(baseUrl);
  await checkReadyCli(baseUrl);

  console.log(
    "V1 print-chain execution check passed: plan-only, CUPS/readiness execution, blocked evidence, closeout, artifacts, CLI, and redaction are covered.",
  );
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
  rmSync(storageRoot, { recursive: true, force: true });
}

function checkPlanOnly(baseUrl) {
  const report = buildPrintChainExecution({
    apiBaseUrl: baseUrl,
    cupsAllowlist: "标签机A,针式打印机A",
    cupsPrinter: "标签机A",
    cupsStatusArgsJson: JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
    cupsStatusCommand: process.execPath,
    fieldEvidenceManifestPath: completeManifestPath,
    outputDir,
    planOnly: true,
  });
  assert.equal(report.status, "planned");
  assert.equal(report.ready, false);
  assert.equal(report.summary.plannedCount, 3);
  assert.equal(report.stages.every((stage) => stage.status === "planned"), true);
  assert.equal(report.safeguards.physicalPrinterCalledByExecution, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatPrintChainExecution(report));
}

async function checkBlockedPendingEvidence(baseUrl) {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(cupsOutputDir, { recursive: true, force: true });
  rmSync(readinessOutputDir, { recursive: true, force: true });
  rmSync(closeoutOutputDir, { recursive: true, force: true });

  const run = await runCli([
    "--api-base-url",
    baseUrl,
    "--operator-id",
    "U-OFFICE-A",
    "--cups-printer",
    "标签机A",
    "--cups-allowlist",
    "标签机A,针式打印机A",
    "--cups-status-command",
    process.execPath,
    "--cups-status-args-json",
    JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
    "--field-evidence-manifest",
    incompleteManifestPath,
    "--cups-preflight-output-dir",
    cupsOutputDir,
    "--print-readiness-output-dir",
    readinessOutputDir,
    "--closeout-output-dir",
    closeoutOutputDir,
    "--output-dir",
    outputDir,
    "--json",
  ]);
  assert.equal(run.status, 2, runFailureMessage("pending print evidence should keep execution blocked", run));
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((stage) => stage.key === "standalone-cups-queue-preflight")?.status, "passed");
  assert.equal(report.stages.find((stage) => stage.key === "print-v1-readiness")?.status, "passed");
  assert.equal(report.stages.find((stage) => stage.key === "print-chain-closeout")?.status, "blocked");
  assert.equal(existsSync(join(cupsOutputDir, "latest.json")), true, "CUPS preflight latest JSON should be written");
  assert.equal(existsSync(join(readinessOutputDir, "latest.json")), true, "print readiness latest JSON should be written");
  assert.equal(existsSync(join(closeoutOutputDir, "latest.json")), true, "closeout latest JSON should be written");
  assertNoSensitiveOutput(run.stdout + run.stderr + formatPrintChainExecution(report));

  const artifacts = writePrintChainExecutionArtifacts(report, { outputDir });
  assert.equal(existsSync(artifacts.latestJsonPath), true);
  assert.equal(existsSync(artifacts.latestMarkdownPath), true);
  assertNoSensitiveOutput(readFileSync(artifacts.latestJsonPath, "utf8"));
  assertNoSensitiveOutput(readFileSync(artifacts.latestMarkdownPath, "utf8"));
}

async function checkReadyCli(baseUrl) {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(cupsOutputDir, { recursive: true, force: true });
  rmSync(readinessOutputDir, { recursive: true, force: true });
  rmSync(closeoutOutputDir, { recursive: true, force: true });

  const run = await runCli([
    "--api-base-url",
    baseUrl,
    "--operator-id",
    "U-OFFICE-A",
    "--cups-printer",
    "标签机A",
    "--cups-allowlist",
    "标签机A,针式打印机A",
    "--cups-status-command",
    process.execPath,
    "--cups-status-args-json",
    JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
    "--field-evidence-manifest",
    completeManifestPath,
    "--cups-preflight-output-dir",
    cupsOutputDir,
    "--print-readiness-output-dir",
    readinessOutputDir,
    "--closeout-output-dir",
    closeoutOutputDir,
    "--output-dir",
    outputDir,
    "--json",
  ]);
  assert.equal(run.status, 0, runFailureMessage("ready print-chain execution should exit 0", run));
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.passedCount, 3);
  assert.equal(report.safeguards.cupsSubmitCalledByExecution, false);
  assert.equal(report.safeguards.declaresFullV1Complete, false);
  assert.equal(existsSync(join(cupsOutputDir, "latest.json")), true);
  assert.equal(existsSync(join(readinessOutputDir, "latest.json")), true);
  assert.equal(existsSync(join(closeoutOutputDir, "latest.json")), true);
  assert.equal(existsSync(join(outputDir, "latest.json")), true);
  assert.equal(existsSync(join(outputDir, "latest.md")), true);
  assertNoSensitiveOutput(run.stdout + run.stderr);
  assertNoSensitiveOutput(readFileSync(join(outputDir, "latest.json"), "utf8"));
  assertNoSensitiveOutput(readFileSync(join(outputDir, "latest.md"), "utf8"));
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
      recordId: "PDQA-EXEC-LABEL-A",
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
      recordId: "PDQA-EXEC-DOT-A",
      printDeviceId: "PRN-DOT-A",
      printJobId: printedPrintJobs.dotMatrix.printJobId,
      documentType: "delivery_note",
      deviceLabel: "针式打印机A",
      driverLabel: "Generic Dot Matrix",
      paperLabel: "连续二联针式纸",
    }),
  );
}

function buildPassedPrinterDeviceFieldTest(input) {
  return buildPassedPrinterDeviceFieldTestFixture({
    ...input,
    checkedAt: "2026-07-08T10:00:00.000Z",
    note: "Print-chain execution positive check",
  });
}

function buildPrintManifest({ completePrintGroup, sensitiveEvidenceRef = false } = {}) {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.updatedAt = "2026-07-08T10:10:00.000Z";
  const group = manifest.evidenceGroups.find((item) => item.key === "print_hardware");
  assert.ok(group, "template must include print_hardware group");
  for (const item of group.items) {
    const shouldComplete = completePrintGroup || item.key !== "barcode_scan_checked";
    item.status = shouldComplete ? "passed" : "pending";
    item.evidenceRef = shouldComplete
      ? sensitiveEvidenceRef && item.key === "label_sample_printed"
        ? `ATT-PRINT-${item.key} ${sensitiveDatabaseUrl} ${sensitiveAccessKey}`
        : `ATT-PRINT-${item.key}`
      : "";
    item.notes = shouldComplete ? "现场已核对" : "";
  }
  return manifest;
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerScript, ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("print-chain execution process timed out after 20000ms"));
    }, 20000);
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

async function getJson(baseUrl, route) {
  return fetchJson(baseUrl, route, {
    headers: { "x-erp-user-id": "U-OFFICE-A" },
  });
}

async function postJson(baseUrl, route, body) {
  return fetchJson(baseUrl, route, {
    method: "POST",
    headers: { "content-type": "application/json", "x-erp-user-id": "U-OFFICE-A" },
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

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, new RegExp(escapeRegExp(storageRoot)), "output leaked storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(apiStorageRoot)), "output leaked API storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(spoolRoot)), "output leaked spool root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(process.execPath)), "output leaked node command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(printCommandBridgeScript)), "output leaked bridge command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fakeCupsStatusScript)), "output leaked fake CUPS command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveSpoolPath)), "output leaked sensitive spool path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveDatabaseUrl)), "output leaked database URL");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveAccessKey)), "output leaked access key");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
