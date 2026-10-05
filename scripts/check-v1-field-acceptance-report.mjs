import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
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

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-field-acceptance-report");
const spoolRoot = join(storageRoot, "spool");
const outputRoot = join(storageRoot, "reports");
const reportScript = join(process.cwd(), "scripts", "run-v1-field-acceptance-report.mjs");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(spoolRoot, { recursive: true });
const printedPrintJobs = seedPrintedPrintReadinessJobs({
  storageRoot,
  idPrefix: "PJ-V1-ACCEPTANCE",
});

const server = createApiServer({ allowLocalFixture: true,
  attachmentRepositoryOptions: { storageRoot },
  attachmentAccessAuditRepositoryOptions: { storageRoot },
  attachmentObjectStorageOptions: { storageRoot },
  attachmentV1ReadinessOptions: {
    localFsAccepted: true,
    acceptanceReference: "automated V1 field acceptance report local storage fixture",
  },
  systemV1ReadinessOptions: {
    localPersistenceAccepted: true,
    acceptanceReference: "automated V1 field acceptance report local persistence fixture",
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

  const blockedRun = await runReport(baseUrl);
  assert.equal(blockedRun.status, 2, runFailureMessage("blocked field acceptance report should exit 2", blockedRun));
  const blockedResult = JSON.parse(blockedRun.stdout);
  assert.equal(blockedResult.status, "blocked");
  assert.equal(blockedResult.ready, false);
  assert.equal(blockedResult.summary.totalCount, 11);
  assert.ok(blockedResult.blockingCount > 0);
  assert.ok(blockedResult.nextActions.some((item) => item.includes("打印") || item.includes("司机")));
  const blockedMarkdown = readGeneratedFile(blockedResult.files.markdown);
  const blockedJson = readGeneratedFile(blockedResult.files.json);
  assert.match(blockedMarkdown, /ERP V1 现场验收报告/);
  assert.match(blockedMarkdown, /BLOCKED/);
  assert.match(blockedMarkdown, /打印现场门禁/);
  assert.match(blockedMarkdown, /司机真机门禁/);
  assert.match(blockedJson, /"scope": "v1_field_acceptance_report"/);
  assert.ok(existsSync(join(outputRoot, "latest.md")), "latest markdown report was not written");
  assert.ok(existsSync(join(outputRoot, "latest.json")), "latest json report was not written");
  assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr + blockedMarkdown + blockedJson);

  await preparePositiveReadiness(baseUrl);

  const readyRun = await runReport(baseUrl);
  assert.equal(readyRun.status, 0, runFailureMessage("ready field acceptance report should exit 0", readyRun));
  const readyResult = JSON.parse(readyRun.stdout);
  assert.equal(readyResult.status, "ready");
  assert.equal(readyResult.ready, true);
  assert.equal(readyResult.summary.label, "11/11 通过");
  assert.equal(readyResult.blockingCount, 0);
  const readyMarkdown = readGeneratedFile(readyResult.files.markdown);
  const readyJson = readGeneratedFile(readyResult.files.json);
  assert.match(readyMarkdown, /READY/);
  assert.match(readyMarkdown, /生产持久化/);
  assert.match(readyMarkdown, /附件留档/);
  assert.match(readyMarkdown, /打印现场验收/);
  assert.match(readyMarkdown, /司机真机验收/);
  assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr + readyMarkdown + readyJson);

  const textRun = await runReport(baseUrl, { json: false });
  assert.equal(textRun.status, 0, runFailureMessage("ready text field acceptance report should exit 0", textRun));
  assert.match(textRun.stdout, /V1 field acceptance: READY/);
  assert.match(textRun.stdout, /Markdown:/);
  assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

  const blockedArchiveRun = await runReport(baseUrl, {
    operatorId: "U-FINANCE-A",
    allowBlockedExitZero: true,
  });
  assert.equal(
    blockedArchiveRun.status,
    0,
    runFailureMessage("archival blocked field acceptance report should support exit 0", blockedArchiveRun),
  );
  const blockedArchiveResult = JSON.parse(blockedArchiveRun.stdout);
  assert.equal(blockedArchiveResult.status, "blocked");
  assert.ok(blockedArchiveResult.nextActions.some((item) => item.includes("fulfillment.print") || item.includes("权限")));
  assertNoSensitiveOutput(blockedArchiveRun.stdout + blockedArchiveRun.stderr);

  console.log("V1 field acceptance report check passed: blocked, ready, archival blocked, report files, and redaction are covered.");
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
}

async function preparePositiveReadiness(baseUrl) {
  const labelDevices = await getJson(baseUrl, "/print-devices?documentType=express_ltl_label");
  const labelDevice = labelDevices.items?.find((device) => device.printDeviceId === "PRN-LABEL-A");
  const dotDevices = await getJson(baseUrl, "/print-devices?documentType=delivery_note");
  const dotDevice = dotDevices.items?.find((device) => device.printDeviceId === "PRN-DOT-A");
  assert.ok(labelDevice, "positive field acceptance setup missed label printer");
  assert.ok(dotDevice, "positive field acceptance setup missed dot-matrix printer");
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
    recordId: "PDQA-V1-ACCEPTANCE-LABEL-A",
    printDeviceId: "PRN-LABEL-A",
    printJobId: printedPrintJobs.label.printJobId,
    documentType: "express_ltl_label",
    deviceLabel: "标签机A",
    driverLabel: "Generic 203dpi Label",
    paperLabel: "80x60 热敏标签",
  }));
  await postJson(baseUrl, "/print-devices/PRN-DOT-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-V1-ACCEPTANCE-DOT-A",
    printDeviceId: "PRN-DOT-A",
    printJobId: printedPrintJobs.dotMatrix.printJobId,
    documentType: "delivery_note",
    deviceLabel: "针式打印机A",
    driverLabel: "Generic Dot Matrix",
    paperLabel: "连续二联针式纸",
  }));
  const driverTasks = await getDriverJson(baseUrl, "/driver/delivery-tasks?pageSize=1");
  const driverTask = driverTasks.items?.[0];
  assert.ok(driverTask?.fulfillmentId, "positive field acceptance setup missed driver delivery task");
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
    checkedAt: "2026-07-04T10:20:00.000Z",
    note: "V1 field acceptance report positive check",
  });
}

function buildPassedDriverDeviceFieldTest({ fulfillmentId, orderLineId, expectedPackageId }) {
  return {
    recordId: `DQA-V1-ACCEPTANCE-${fulfillmentId}`,
    fulfillmentId,
    orderLineId,
    driverId: "U-DRIVER-A",
    operatorId: "U-DRIVER-A",
    operatorName: "司机A",
    checkedAt: "2026-07-04T10:25:00.000Z",
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
      sampleId: `DPLS-V1-ACCEPTANCE-${fulfillmentId}`,
      fulfillmentId,
      expectedPackageId,
      scannedText: expectedPackageId,
      matchedPackageId: expectedPackageId,
      method: "native_sdk",
      result: "matched",
      requestId: `DNPS-V1-ACCEPTANCE-${fulfillmentId}`,
      source: "native_sdk",
      message: "原生扫码 SDK 已扫真实纸质包裹标签",
      checkedAt: "2026-07-04T10:24:59.000Z",
    },
    nativeNavigationSample: {
      requestId: `DNN-V1-ACCEPTANCE-${fulfillmentId}`,
      fulfillmentId,
      status: "opened",
      source: "native_navigation_sdk",
      mapApp: "高德地图",
      checkedAt: "2026-07-04T10:25:00.000Z",
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
    note: "V1 field acceptance report positive driver native shell check",
  };
}

function runReport(baseUrl, options = {}) {
  const args = [
    reportScript,
    "--api-base-url",
    baseUrl,
    "--operator-id",
    options.operatorId || "U-OFFICE-A",
    "--driver-operator-id",
    options.driverOperatorId || "U-DRIVER-A",
    "--output-dir",
    outputRoot,
  ];
  if (options.json !== false) args.push("--json");
  if (options.allowBlockedExitZero) args.push("--allow-blocked-exit-zero");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("field acceptance report process timed out after 20000ms"));
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

function readGeneratedFile(displayPath) {
  const fullPath = join(process.cwd(), displayPath);
  assert.ok(existsSync(fullPath), `generated report file is missing: ${displayPath}`);
  return readFileSync(fullPath, "utf8");
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, new RegExp(escapeRegExp(storageRoot)), "output leaked storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(spoolRoot)), "output leaked spool root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(process.execPath)), "output leaked node command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(printCommandBridgeScript)), "output leaked bridge command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fakeCupsStatusScript)), "output leaked fake CUPS command path");
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
