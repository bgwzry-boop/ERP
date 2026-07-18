import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { buildV1FieldEvidenceManifestTemplate } from "./v1FieldEvidenceManifest.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import {
  buildDriverRealDeviceExecution,
  formatDriverRealDeviceExecution,
  writeDriverRealDeviceExecutionArtifacts,
} from "./run-v1-driver-real-device-execution.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-driver-real-device-execution");
const apiStorageRoot = join(storageRoot, "api-storage");
const outputDir = join(storageRoot, "execution");
const readinessOutputDir = join(storageRoot, "readiness");
const closeoutOutputDir = join(storageRoot, "closeout");
const completeManifestPath = join(storageRoot, "field-evidence-complete.json");
const incompleteManifestPath = join(storageRoot, "field-evidence-incomplete.json");
const runnerScript = join(process.cwd(), "scripts", "run-v1-driver-real-device-execution.mjs");
const sensitiveDatabaseUrl = "postgres://erp_user:DRIVER_EXECUTION_PASSWORD@driver-db.internal:5432/erp";
const sensitiveAccessKey = "AKIA_DRIVER_EXECUTION_SECRET";
const sensitiveLocalPath = "/Users/xu/Documents/ERP/.erp-local-storage/driver-execution-secret/latest.json";
const sensitiveGeoPoint = "22.543096, 114.057865";
const sensitiveScanText = "PKG-SECRET-SCAN-123";
const sensitiveBearerToken = "DRIVER_EXECUTION_TOKEN_SECRET";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });
writeJson(completeManifestPath, buildDriverManifest({ completeDriverGroup: true }));
writeJson(incompleteManifestPath, buildDriverManifest({ completeDriverGroup: false, sensitiveEvidenceRef: true }));

const server = createApiServer({
  driverDeviceFieldTestRepositoryOptions: { storageRoot: apiStorageRoot },
});

try {
  await listenTestServer(server);
  const baseUrl = `${getTestServerBaseUrl(server)}/api`;

  await checkPlanOnly(baseUrl);
  await preparePositiveDriverReadiness(baseUrl);
  await checkBlockedPendingEvidence(baseUrl);
  await checkReadyCli(baseUrl);

  console.log(
    "V1 driver real-device execution check passed: plan-only, driver readiness capture, blocked evidence, closeout, artifacts, CLI, and redaction are covered.",
  );
} finally {
  await closeTestServer(server, { forceAfterMs: 1000 });
  rmSync(storageRoot, { recursive: true, force: true });
}

async function checkPlanOnly(baseUrl) {
  const report = await buildDriverRealDeviceExecution({
    apiBaseUrl: baseUrl,
    driverOperatorId: "U-DRIVER-A",
    fieldEvidenceManifestPath: completeManifestPath,
    outputDir,
    planOnly: true,
  });
  assert.equal(report.status, "planned");
  assert.equal(report.ready, false);
  assert.equal(report.summary.plannedCount, 2);
  assert.equal(report.stages.every((stage) => stage.status === "planned"), true);
  assert.equal(report.safeguards.cameraPermissionRequestedByExecution, false);
  assert.equal(report.safeguards.navigationAppOpenedByExecution, false);
  assert.equal(report.safeguards.deliveryStatusChangedByExecution, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatDriverRealDeviceExecution(report));
}

async function checkBlockedPendingEvidence(baseUrl) {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(readinessOutputDir, { recursive: true, force: true });
  rmSync(closeoutOutputDir, { recursive: true, force: true });

  const run = await runCli([
    "--api-base-url",
    baseUrl,
    "--driver-operator-id",
    "U-DRIVER-A",
    "--field-evidence-manifest",
    incompleteManifestPath,
    "--driver-readiness-output-dir",
    readinessOutputDir,
    "--closeout-output-dir",
    closeoutOutputDir,
    "--output-dir",
    outputDir,
    "--json",
  ]);
  assert.equal(run.status, 2, runFailureMessage("pending driver evidence should keep execution blocked", run));
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((stage) => stage.key === "driver-v1-readiness")?.status, "passed");
  assert.equal(report.stages.find((stage) => stage.key === "driver-real-device-closeout")?.status, "blocked");
  assert.equal(existsSync(join(readinessOutputDir, "latest.json")), true, "driver readiness latest JSON should be written");
  assert.equal(existsSync(join(closeoutOutputDir, "latest.json")), true, "closeout latest JSON should be written");
  assertNoSensitiveOutput(run.stdout + run.stderr + formatDriverRealDeviceExecution(report));

  const artifacts = writeDriverRealDeviceExecutionArtifacts(report, { outputDir });
  assert.equal(existsSync(artifacts.latestJsonPath), true);
  assert.equal(existsSync(artifacts.latestMarkdownPath), true);
  assertNoSensitiveOutput(readFileSync(artifacts.latestJsonPath, "utf8"));
  assertNoSensitiveOutput(readFileSync(artifacts.latestMarkdownPath, "utf8"));
}

async function checkReadyCli(baseUrl) {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(readinessOutputDir, { recursive: true, force: true });
  rmSync(closeoutOutputDir, { recursive: true, force: true });

  const run = await runCli([
    "--api-base-url",
    baseUrl,
    "--driver-operator-id",
    "U-DRIVER-A",
    "--field-evidence-manifest",
    completeManifestPath,
    "--driver-readiness-output-dir",
    readinessOutputDir,
    "--closeout-output-dir",
    closeoutOutputDir,
    "--output-dir",
    outputDir,
    "--json",
  ]);
  assert.equal(run.status, 0, runFailureMessage("ready driver real-device execution should exit 0", run));
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.passedCount, 2);
  assert.equal(report.safeguards.nativeBridgeInvokedByExecution, false);
  assert.equal(report.safeguards.photoUploadedByExecution, false);
  assert.equal(report.safeguards.declaresFullV1Complete, false);
  assert.equal(existsSync(join(readinessOutputDir, "latest.json")), true);
  assert.equal(existsSync(join(closeoutOutputDir, "latest.json")), true);
  assert.equal(existsSync(join(outputDir, "latest.json")), true);
  assert.equal(existsSync(join(outputDir, "latest.md")), true);
  assertNoSensitiveOutput(run.stdout + run.stderr);
  assertNoSensitiveOutput(readFileSync(join(outputDir, "latest.json"), "utf8"));
  assertNoSensitiveOutput(readFileSync(join(outputDir, "latest.md"), "utf8"));
}

async function preparePositiveDriverReadiness(baseUrl) {
  const driverTasks = await getDriverJson(baseUrl, "/driver/delivery-tasks?pageSize=1");
  const driverTask = driverTasks.items?.[0];
  assert.ok(driverTask?.fulfillmentId, "positive readiness setup missed driver delivery task");
  const expectedPackageId = driverTask.packageChecklist?.[0]?.packageId || `${driverTask.fulfillmentId}-PKG-1`;
  const fieldTest = await postDriverJson(
    baseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(driverTask.fulfillmentId)}/device-field-tests`,
    buildPassedDriverDeviceFieldTest({
      fulfillmentId: driverTask.fulfillmentId,
      orderLineId: driverTask.orderLineId,
      expectedPackageId,
    }),
  );
  assert.equal(fieldTest.acceptance?.ready, true);
  assert.equal(fieldTest.acceptance?.packageIdsMatch, true);
  assert.equal(fieldTest.acceptance?.navigationSampleReady, true);
  assert.equal(fieldTest.safeguards?.nativeBridgeInvoked, false);
}

function buildPassedDriverDeviceFieldTest({ fulfillmentId, orderLineId, expectedPackageId }) {
  return {
    recordId: `DQA-V1-EXEC-${fulfillmentId}`,
    fulfillmentId,
    orderLineId,
    driverId: "U-DRIVER-A",
    operatorId: "U-DRIVER-A",
    operatorName: "司机A",
    checkedAt: "2026-07-08T10:10:00.000Z",
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
      sampleId: `DPLS-V1-EXEC-${fulfillmentId}`,
      requestId: `DNPS-V1-EXEC-${fulfillmentId}`,
      fulfillmentId,
      expectedPackageId,
      scannedText: sensitiveScanText,
      matchedPackageId: expectedPackageId,
      method: "native_sdk",
      source: "native_sdk",
      result: "matched",
      message: "原生扫码 SDK 已扫真实纸质包裹标签",
      checkedAt: "2026-07-08T10:09:59.000Z",
    },
    nativeNavigationSample: {
      requestId: `DNN-V1-EXEC-${fulfillmentId}`,
      fulfillmentId,
      status: "opened",
      source: "native_navigation_sdk",
      mapApp: "高德地图",
      checkedAt: "2026-07-08T10:10:00.000Z",
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
    note: "V1 driver real-device execution positive check",
  };
}

function buildDriverManifest({ completeDriverGroup, sensitiveEvidenceRef = false } = {}) {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.updatedAt = "2026-07-08T10:20:00.000Z";
  const group = manifest.evidenceGroups.find((item) => item.key === "driver_native_device");
  assert.ok(group, "template must include driver_native_device group");
  for (const item of group.items) {
    const shouldComplete = completeDriverGroup || item.key !== "map_navigation_checked";
    item.status = shouldComplete ? "passed" : "pending";
    item.evidenceRef = shouldComplete
      ? sensitiveEvidenceRef && item.key === "driver_real_phone_checked"
        ? `ATT-DRIVER-${item.key} ${sensitiveDatabaseUrl} ${sensitiveAccessKey} ${sensitiveLocalPath} ${sensitiveGeoPoint}`
        : `ATT-DRIVER-${item.key}`
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
      reject(new Error("driver real-device execution process timed out after 20000ms"));
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

async function getDriverJson(baseUrl, route) {
  return fetchJson(baseUrl, route, {
    headers: { "x-erp-user-id": "U-DRIVER-A" },
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
    timeoutMs: 10000,
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
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveDatabaseUrl)), "output leaked database URL");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveAccessKey)), "output leaked access key");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveLocalPath)), "output leaked local path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveGeoPoint)), "output leaked geo point");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveScanText)), "output leaked scan text");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveBearerToken)), "output leaked bearer token");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
