import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  buildPassedPrinterDeviceFieldTest as buildPassedPrinterDeviceFieldTestFixture,
  seedPrintedPrintReadinessJobs,
} from "./helpers/printReadinessTestFixture.mjs";
import {
  closeTestServer,
  getJson as getSharedJson,
  getTestServerBaseUrl,
  listenTestServer,
  postJson as postSharedJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "print-v1-readiness-runner");
const spoolRoot = join(storageRoot, "spool");
const runnerScript = join(process.cwd(), "scripts", "run-print-v1-readiness-check.mjs");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");
rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(spoolRoot, { recursive: true });
seedPrintedPrintReadinessJobs({ storageRoot, idPrefix: "PJ-RUNNER" });

const server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
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
}));
await server.ready;
await listenTestServer(server);

try {
  const baseUrl = getTestServerBaseUrl(server);
  const apiBaseUrl = `${baseUrl}/api`;

  const blockedRun = await runRunner(apiBaseUrl);
  assert.equal(blockedRun.status, 2, runFailureMessage("runner should exit 2 when V1 print gate is blocked", blockedRun));
  const blockedReport = JSON.parse(blockedRun.stdout);
  assert.equal(blockedReport.status, "blocked");
  assert.equal(blockedReport.ready, false);
  assert.equal(blockedReport.cups.ready, true, "runner should detect CUPS preflight ready");
  assert.equal(blockedReport.summary.totalCount, 9, "runner should read nine V1 print gate criteria");
  assert.equal(blockedReport.blockingCriteria.some((item) => item.key === "cups-queue-preflight"), false);
  assert.equal(blockedReport.blockingCriteria.some((item) => item.key.includes("driver-mode")), true);
  assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr);

  await preparePositiveReadiness(baseUrl);

  const readyRun = await runRunner(apiBaseUrl);
  assert.equal(readyRun.status, 0, runFailureMessage("runner should exit 0 when V1 print gate is ready", readyRun));
  const readyReport = JSON.parse(readyRun.stdout);
  assert.equal(readyReport.status, "ready");
  assert.equal(readyReport.ready, true);
  assert.equal(readyReport.cups.ready, true);
  assert.equal(readyReport.summary.totalCount, 9);
  assert.equal(readyReport.summary.blockingCount, 0);
  assert.equal(readyReport.blockingCriteria.length, 0);
  assert.equal(readyReport.safeguards.nonPrinting, true);
  assert.equal(readyReport.safeguards.physicalPrinterCalled, false);
  assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr);

  const textRun = await runRunner(apiBaseUrl, { json: false });
  assert.equal(textRun.status, 0, runFailureMessage("runner text output should exit 0 when V1 print gate is ready", textRun));
  assert.match(textRun.stdout, /V1 print readiness: READY/);
  assert.match(textRun.stdout, /CUPS queue preflight: READY/);
  assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

  console.log("Print V1 readiness runner check passed: blocked gate, ready gate, CUPS preflight, redaction, and exit codes are covered.");
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
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
  await postJson(baseUrl, "/print-devices/PRN-LABEL-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-RUNNER-LABEL-A",
    printDeviceId: "PRN-LABEL-A",
    printJobId: "PJ-RUNNER-LABEL-A",
    documentType: "express_ltl_label",
    deviceLabel: "标签机A",
    driverLabel: "Generic 203dpi Label",
    paperLabel: "80x60 热敏标签",
  }));
  await postJson(baseUrl, "/print-devices/PRN-DOT-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-RUNNER-DOT-A",
    printDeviceId: "PRN-DOT-A",
    printJobId: "PJ-RUNNER-DOT-A",
    documentType: "delivery_note",
    deviceLabel: "针式打印机A",
    driverLabel: "Generic Dot Matrix",
    paperLabel: "连续二联针式纸",
  }));
}

function buildPassedPrinterDeviceFieldTest(input) {
  return buildPassedPrinterDeviceFieldTestFixture({
    ...input,
    checkedAt: "2026-07-04T10:00:00.000Z",
    note: "Print V1 readiness runner positive check",
  });
}



function runRunner(baseUrl, options = {}) {
  const args = [
    runnerScript,
    "--api-base-url",
    baseUrl,
    "--operator-id",
    "U-OFFICE-A",
  ];
  if (options.json !== false) args.push("--json");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("runner process timed out after 15000ms"));
    }, 15000);
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
  assert.doesNotMatch(output, new RegExp(escapeRegExp(storageRoot)), "runner output leaked storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(spoolRoot)), "runner output leaked spool root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(process.execPath)), "runner output leaked node command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(printCommandBridgeScript)), "runner output leaked bridge command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fakeCupsStatusScript)), "runner output leaked fake CUPS command path");
}

async function getJson(baseUrl, route) {
  return getSharedJson(baseUrl, `/api${route}`, {
    headers: { "x-erp-user-id": "U-OFFICE-A" },
    closeConnection: true,
    timeoutMs: 10_000,
  });
}

async function postJson(baseUrl, route, body) {
  return postSharedJson(baseUrl, `/api${route}`, body, {
    headers: { "content-type": "application/json", "x-erp-user-id": "U-OFFICE-A" },
    closeConnection: true,
    timeoutMs: 10_000,
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
