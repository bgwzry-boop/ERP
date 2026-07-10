import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-readiness-runner");
const spoolRoot = join(storageRoot, "spool");
const runnerScript = join(process.cwd(), "scripts", "run-v1-readiness-check.mjs");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(spoolRoot, { recursive: true });

const server = createApiServer({
  attachmentRepositoryOptions: { storageRoot },
  attachmentAccessAuditRepositoryOptions: { storageRoot },
  attachmentObjectStorageOptions: { storageRoot },
  attachmentV1ReadinessOptions: {
    localFsAccepted: true,
    acceptanceReference: "automated V1 readiness check local storage fixture",
  },
  systemV1ReadinessOptions: {
    localPersistenceAccepted: true,
    acceptanceReference: "automated V1 readiness check local persistence fixture",
  },
  printDeviceRepositoryOptions: { storageRoot },
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
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const blockedRun = await runRunner(baseUrl);
  assert.equal(blockedRun.status, 2, runFailureMessage("runner should exit 2 when V1 gate is blocked", blockedRun));
  const blockedReport = JSON.parse(blockedRun.stdout);
  assert.equal(blockedReport.status, "blocked");
  assert.equal(blockedReport.ready, false);
  assert.equal(blockedReport.summary.totalCount, 11);
  assert.equal(blockedReport.criteria.find((item) => item.key === "api-health")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "openapi-contract")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "system-v1-persistence")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "operator-permissions")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "driver-operator-permissions")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "attachment-storage-diagnostics")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "attachment-v1-readiness")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "print-cups-diagnostics")?.status, "passed");
  assert.equal(blockedReport.criteria.find((item) => item.key === "print-v1-readiness")?.status, "pending");
  assert.equal(blockedReport.criteria.find((item) => item.key === "driver-v1-readiness")?.status, "pending");
  assert.equal(blockedReport.printReadiness.summary.totalCount, 9);
  assert.equal(blockedReport.driverReadiness.summary.totalCount, 6);
  assert.equal(blockedReport.systemPersistence.ready, true);
  assert.equal(blockedReport.systemPersistence.localPersistenceAcceptance.accepted, true);
  assert.equal(blockedReport.productionEnvFileApplication.available, true);
  assert.equal(blockedReport.productionEnvFileApplication.applied, false);
  assert.equal(blockedReport.productionEnvFileApplication.safeguards.envValuesIncluded, false);
  assert.equal(blockedReport.productionEnvFileApplication.safeguards.envFilePathExposed, false);
  assertSystemPersistenceIncludesRawMaterialAndIdentity(blockedReport.systemPersistence, "local_json");
  assert.equal(blockedReport.safeguards.nonPrinting, true);
  assert.equal(blockedReport.safeguards.systemReadOnly, true);
  assert.equal(blockedReport.safeguards.productionEnvFileApplicationReported, true);
  assert.equal(blockedReport.safeguards.productionEnvAppliedToProcess, false);
  assert.equal(blockedReport.safeguards.productionEnvFilePathExposed, false);
  assert.equal(blockedReport.safeguards.productionEnvValuesIncluded, false);
  assert.equal(blockedReport.safeguards.systemRepositoryPayloadExposed, false);
  assert.equal(blockedReport.safeguards.systemConnectionStringExposed, false);
  assert.equal(blockedReport.safeguards.systemLocalPathExposed, false);
  assert.equal(blockedReport.safeguards.physicalPrinterCalled, false);
  assert.equal(blockedReport.safeguards.driverReadOnly, true);
  assert.equal(blockedReport.safeguards.driverDeliveryStatusChanged, false);
  assert.equal(blockedReport.safeguards.secretFieldsExposed, false);
  assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr);

  await preparePositiveReadiness(baseUrl);

  const readyRun = await runRunner(baseUrl);
  assert.equal(readyRun.status, 0, runFailureMessage("runner should exit 0 when V1 gate is ready", readyRun));
  const readyReport = JSON.parse(readyRun.stdout);
  assert.equal(readyReport.status, "ready");
  assert.equal(readyReport.ready, true);
  assert.equal(readyReport.summary.label, "11/11 通过");
  assert.equal(readyReport.summary.blockingCount, 0);
  assert.equal(readyReport.systemPersistence.ready, true);
  assert.equal(readyReport.systemPersistence.localPersistenceAcceptance.accepted, true);
  assert.equal(readyReport.productionEnvFileApplication.available, true);
  assert.equal(readyReport.productionEnvFileApplication.safeguards.envValuesIncluded, false);
  assert.equal(readyReport.productionEnvFileApplication.safeguards.envFilePathExposed, false);
  assertSystemPersistenceIncludesRawMaterialAndIdentity(readyReport.systemPersistence, "local_json");
  assert.equal(readyReport.attachmentStorage.ready, true);
  assert.equal(readyReport.attachmentReadiness.ready, true);
  assert.equal(readyReport.attachmentReadiness.storageMode.localFsAcceptedForV1, true);
  assert.equal(readyReport.spoolDiagnostics.ready, true);
  assert.equal(readyReport.cupsDiagnostics.ready, true);
  assert.equal(readyReport.printReadiness.ready, true);
  assert.equal(readyReport.printReadiness.summary.totalCount, 9);
  assert.equal(readyReport.printReadiness.blockingCriteria.length, 0);
  assert.equal(readyReport.driverReadiness.ready, true);
  assert.equal(readyReport.driverReadiness.summary.totalCount, 6);
  assert.equal(readyReport.driverReadiness.blockingCriteria.length, 0);
  assert.equal(readyReport.driverReadiness.packageLabelScanSample.method, "native_sdk");
  assert.equal(readyReport.driverReadiness.nativeBridgeDiagnostics.supportedCount, 2);
  assert.equal(readyReport.safeguards.nonPrinting, true);
  assert.equal(readyReport.safeguards.physicalPrinterCalled, false);
  assert.equal(readyReport.safeguards.driverReadOnly, true);
  assert.equal(readyReport.safeguards.driverDeliveryStatusChanged, false);
  assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr);

  const textRun = await runRunner(baseUrl, { json: false });
  assert.equal(textRun.status, 0, runFailureMessage("runner text output should exit 0 when V1 gate is ready", textRun));
  assert.match(textRun.stdout, /V1 readiness: READY/);
  assert.match(textRun.stdout, /System persistence: READY/);
  assert.match(textRun.stdout, /Attachment storage: READY/);
  assert.match(textRun.stdout, /Attachment V1 storage gate: READY/);
  assert.match(textRun.stdout, /Print V1 gate: READY/);
  assert.match(textRun.stdout, /Driver V1 gate: READY/);
  assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

  const financeRun = await runRunner(baseUrl, { operatorId: "U-FINANCE-A" });
  assert.equal(financeRun.status, 2, runFailureMessage("finance runner should exit 2 because print permission is missing", financeRun));
  const financeReport = JSON.parse(financeRun.stdout);
  assert.equal(financeReport.status, "blocked");
  assert.equal(financeReport.criteria.find((item) => item.key === "operator-permissions")?.status, "pending");
  assert.ok(financeReport.remainingV1Risks.some((risk) => risk.includes("fulfillment.print")));
  assertNoSensitiveOutput(financeRun.stdout + financeRun.stderr);

  console.log("V1 readiness runner check passed: blocked, ready, permission-blocked, redaction, and exit codes are covered.");
} finally {
  await closeServer(server);
}

function assertSystemPersistenceIncludesRawMaterialAndIdentity(systemPersistence, expectedKind) {
  const runtimeIdentityRepository = systemPersistence.repositories?.find(
    (repository) => repository.key === "runtimeIdentityRepository",
  );
  assert.equal(runtimeIdentityRepository?.kind, expectedKind);
  const rawMaterialInboundRepository = systemPersistence.repositories?.find(
    (repository) => repository.key === "rawMaterialInboundRepository",
  );
  assert.equal(rawMaterialInboundRepository?.kind, expectedKind);
  const rawMaterialSupplierStatementReviewRepository = systemPersistence.repositories?.find(
    (repository) => repository.key === "rawMaterialSupplierStatementReviewRepository",
  );
  assert.equal(rawMaterialSupplierStatementReviewRepository?.kind, expectedKind);
  assert.equal(
    systemPersistence.repositoryGroups?.some((group) =>
      group.repositories?.some((repository) => repository.key === "runtimeIdentityRepository"),
    ),
    true,
  );
  assert.equal(
    systemPersistence.repositoryGroups?.some((group) =>
      group.repositories?.some((repository) => repository.key === "rawMaterialSupplierStatementReviewRepository"),
    ),
    true,
  );
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
    recordId: "PDQA-V1-RUNNER-LABEL-A",
    printDeviceId: "PRN-LABEL-A",
    documentType: "express_ltl_label",
    deviceLabel: "标签机A",
    driverLabel: "Generic 203dpi Label",
    paperLabel: "80x60 热敏标签",
  }));
  await postJson(baseUrl, "/print-devices/PRN-DOT-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-V1-RUNNER-DOT-A",
    printDeviceId: "PRN-DOT-A",
    documentType: "delivery_note",
    deviceLabel: "针式打印机A",
    driverLabel: "Generic Dot Matrix",
    paperLabel: "连续二联针式纸",
  }));
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

function buildPassedPrinterDeviceFieldTest({
  recordId,
  printDeviceId,
  documentType,
  deviceLabel,
  driverLabel,
  paperLabel,
}) {
  return {
    recordId,
    printDeviceId,
    documentType,
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    checkedAt: "2026-07-04T10:00:00.000Z",
    deviceLabel,
    driverLabel,
    paperLabel,
    checks: [
      { key: "sample_print", status: "passed" },
      { key: "paper_alignment", status: "passed" },
      { key: "barcode_scan", status: "passed" },
      { key: "driver_callback", status: "passed" },
      { key: "legibility", status: "passed" },
      { key: "void_reprint", status: "passed" },
    ],
    evidence: {
      samplePrintReference: `${recordId} 样张已出纸且纸张对位通过`,
      barcodeScanText: `${printDeviceId}-SAMPLE-CODE 可扫码`,
      driverCallbackStatus: "spool completed -> printed",
      voidReprintReference: `${recordId}-VOID-REPRINT 作废后重打通过`,
      operatorAcceptance: "办公室A 现场签认",
    },
    note: "V1 readiness runner positive check",
  };
}

function buildPassedDriverDeviceFieldTest({ fulfillmentId, orderLineId, expectedPackageId }) {
  return {
    recordId: `DQA-V1-RUNNER-${fulfillmentId}`,
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
      sampleId: `DPLS-V1-RUNNER-${fulfillmentId}`,
      fulfillmentId,
      expectedPackageId,
      scannedText: expectedPackageId,
      matchedPackageId: expectedPackageId,
      method: "native_sdk",
      result: "matched",
      message: "原生扫码 SDK 已扫真实纸质包裹标签",
      checkedAt: "2026-07-04T10:09:59.000Z",
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
    note: "V1 readiness runner positive driver native shell check",
  };
}

function runRunner(baseUrl, options = {}) {
  const args = [
    runnerScript,
    "--api-base-url",
    baseUrl,
    "--operator-id",
    options.operatorId || "U-OFFICE-A",
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: { ...(options.headers ?? {}), connection: "close" },
      signal: controller.signal,
    });
    const json = await readJson(response);
    if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
    return json;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${route} request timed out after 10000ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function listen(targetServer) {
  return new Promise((resolve) => {
    targetServer.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(targetServer) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    targetServer.close(finish);
    targetServer.closeIdleConnections?.();
    const timeout = setTimeout(() => {
      targetServer.closeAllConnections?.();
      finish();
    }, 1000);
    timeout.unref?.();
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
