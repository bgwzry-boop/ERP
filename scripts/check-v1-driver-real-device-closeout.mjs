import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildV1FieldEvidenceManifestTemplate } from "./v1FieldEvidenceManifest.mjs";
import {
  buildDriverRealDeviceCloseout,
  formatDriverRealDeviceCloseout,
  redactDriverCloseoutText,
  writeDriverRealDeviceCloseoutArtifacts,
} from "./run-v1-driver-real-device-closeout.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-driver-real-device-closeout");
const readinessPath = join(storageRoot, "driver-readiness.json");
const fullReadinessPath = join(storageRoot, "v1-readiness-full.json");
const manifestPath = join(storageRoot, "field-evidence-manifest.json");
const outputDir = join(storageRoot, "closeout");
const runnerScript = join(process.cwd(), "scripts", "run-v1-driver-real-device-closeout.mjs");
const sensitiveDatabaseUrl = "postgres://erp_user:DRIVER_CLOSEOUT_PASSWORD@driver-db.internal:5432/erp";
const sensitiveAccessKey = "AKIA_DRIVER_CLOSEOUT_SECRET";
const sensitiveLocalPath = "/Users/xu/Documents/ERP/.erp-local-storage/driver-secret/latest.json";
const sensitiveGeoPoint = "22.543096, 114.057865";
const sensitiveScanText = "PKG-SECRET-SCAN-123";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  checkBlockedMissingArtifacts();
  checkReadyCloseout();
  checkReadyCloseoutFromFullReadinessReport();
  checkDriverEvidenceBlocked();
  checkStaleReadinessBlocked();
  checkSafeguardBlocked();
  await checkCliAndRedaction();
  console.log(
    "V1 driver real-device closeout check passed: missing artifacts, ready closeout, nested readiness, evidence blockers, stale readiness, safeguard failures, artifacts, CLI, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

function checkBlockedMissingArtifacts() {
  const report = buildDriverRealDeviceCloseout({
    driverReadinessPath: join(storageRoot, "missing-readiness.json"),
    fieldEvidenceManifestPath: join(storageRoot, "missing-manifest.json"),
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((item) => item.key === "driver-readiness-artifact")?.status, "blocked");
  assert.equal(report.stages.find((item) => item.key === "field-evidence-manifest-artifact")?.status, "blocked");
  assertNoSensitiveOutput(JSON.stringify(report) + formatDriverRealDeviceCloseout(report));
}

function checkReadyCloseout() {
  writeJson(readinessPath, buildDriverReadinessReport({ checkedAt: "2026-07-08T08:00:00.000Z" }));
  writeJson(manifestPath, buildDriverManifest({ completeDriverGroup: true }));

  const report = buildDriverRealDeviceCloseout({
    driverReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.passedCount, report.summary.totalCount);
  assert.equal(report.evidenceSummary.driverNativeDeviceEvidence.completedRequired, 6);
  assert.equal(report.evidenceSummary.driverNativeEvidence.nativeSupportedLabel, "2/2");
  assert.equal(report.evidenceSummary.driverNativeEvidence.scanTextIncluded, false);
  assert.equal(report.safeguards.cameraPermissionRequestedByCloseout, false);
  assert.equal(report.safeguards.locationPermissionRequestedByCloseout, false);
  assert.equal(report.safeguards.navigationAppOpenedByCloseout, false);
  assert.equal(report.safeguards.declaresFullV1Complete, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatDriverRealDeviceCloseout(report));

  const artifacts = writeDriverRealDeviceCloseoutArtifacts(report, { outputDir });
  assert.equal(existsSync(artifacts.latestJsonPath), true);
  assert.equal(existsSync(artifacts.latestMarkdownPath), true);
  assertNoSensitiveOutput(readFileSync(artifacts.latestJsonPath, "utf8"));
  assertNoSensitiveOutput(readFileSync(artifacts.latestMarkdownPath, "utf8"));
}

function checkReadyCloseoutFromFullReadinessReport() {
  writeJson(fullReadinessPath, {
    status: "ready",
    ready: true,
    checkedAt: "2026-07-08T08:30:00.000Z",
    scope: "v1_go_live_readiness",
    summary: { label: "11/11 通过", passedCount: 11, totalCount: 11, blockingCount: 0, warningCount: 0 },
    driverReadiness: buildDriverReadinessReport({ checkedAt: "2026-07-08T08:30:00.000Z" }),
  });
  writeJson(manifestPath, buildDriverManifest({ completeDriverGroup: true }));

  const report = buildDriverRealDeviceCloseout({
    driverReadinessPath: fullReadinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "ready");
  assert.equal(report.stages.find((item) => item.key === "driver-readiness-artifact")?.evidence.sourceScope, "v1_driver_mobile_readiness");
  assertNoSensitiveOutput(JSON.stringify(report) + formatDriverRealDeviceCloseout(report));
}

function checkDriverEvidenceBlocked() {
  writeJson(readinessPath, buildDriverReadinessReport({ checkedAt: "2026-07-08T08:00:00.000Z" }));
  writeJson(manifestPath, buildDriverManifest({ completeDriverGroup: false }));

  const report = buildDriverRealDeviceCloseout({
    driverReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const driverEvidence = report.stages.find((item) => item.key === "driver-native-device-evidence");
  assert.equal(driverEvidence?.status, "blocked");
  assert.ok(driverEvidence.blockingItems.some((item) => item.key === "map_navigation_checked"));
  assertNoSensitiveOutput(JSON.stringify(report) + formatDriverRealDeviceCloseout(report));
}

function checkStaleReadinessBlocked() {
  writeJson(readinessPath, buildDriverReadinessReport({ checkedAt: "2026-07-01T08:00:00.000Z" }));
  writeJson(manifestPath, buildDriverManifest({ completeDriverGroup: true }));

  const report = buildDriverRealDeviceCloseout({
    driverReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
    maxAgeHours: 72,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((item) => item.key === "driver-readiness-freshness")?.status, "blocked");
  assertNoSensitiveOutput(JSON.stringify(report) + formatDriverRealDeviceCloseout(report));
}

function checkSafeguardBlocked() {
  writeJson(
    readinessPath,
    buildDriverReadinessReport({
      checkedAt: "2026-07-08T08:00:00.000Z",
      browserOnly: true,
      safeguards: {
        payloadExposed: true,
        deliveryStatusChanged: true,
        nativeBridgeInvoked: true,
      },
    }),
  );
  writeJson(manifestPath, buildDriverManifest({ completeDriverGroup: true, sensitiveEvidenceRef: true }));

  const report = buildDriverRealDeviceCloseout({
    driverReadinessPath: readinessPath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T09:00:00.000Z",
    now: new Date("2026-07-08T09:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const nativeGate = report.stages.find((item) => item.key === "driver-native-gates");
  assert.equal(nativeGate?.status, "blocked");
  const safeguards = report.stages.find((item) => item.key === "driver-real-device-closeout-safeguards");
  assert.equal(safeguards?.status, "blocked");
  assert.ok(safeguards.blockingItems.some((item) => item.key === "readiness-redacted"));
  assert.ok(safeguards.blockingItems.some((item) => item.key === "readiness-runner-read-only"));
  assert.ok(safeguards.blockingItems.some((item) => item.key === "native-shell-required"));
  assert.ok(safeguards.blockingItems.some((item) => item.key === "manifest-evidence-ref-redacted"));
  assertNoSensitiveOutput(JSON.stringify(report) + formatDriverRealDeviceCloseout(report));
}

async function checkCliAndRedaction() {
  writeJson(readinessPath, buildDriverReadinessReport({ checkedAt: "2026-07-08T08:00:00.000Z" }));
  writeJson(manifestPath, buildDriverManifest({ completeDriverGroup: true }));
  const run = await runNodeCli([
    runnerScript,
    "--driver-readiness-json",
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

  const redacted = redactDriverCloseoutText(
    `${sensitiveDatabaseUrl} ${sensitiveAccessKey} ${sensitiveLocalPath} ${sensitiveGeoPoint}`,
  );
  assertNoSensitiveOutput(redacted);
}

function buildDriverReadinessReport({ checkedAt, browserOnly = false, safeguards = {} } = {}) {
  const nativeSupported = !browserOnly;
  const nativeDiagnostics = {
    items: [
      {
        key: "native_package_scan",
        label: "原生扫码",
        target: "包裹标签",
        supported: nativeSupported,
        statusLabel: nativeSupported ? "可用" : "未接入",
        tone: nativeSupported ? "success" : "warning",
        bridgeType: nativeSupported ? "android_interface" : "",
        bridgeTypeLabel: nativeSupported ? "Android JSON" : "未发现",
        version: "p0-driver-native-bridge-v1",
      },
      {
        key: "native_navigation",
        label: "原生导航",
        target: "地图打开",
        supported: nativeSupported,
        statusLabel: nativeSupported ? "可用" : "未接入",
        tone: nativeSupported ? "success" : "warning",
        bridgeType: nativeSupported ? "android_interface" : "",
        bridgeTypeLabel: nativeSupported ? "Android JSON" : "未发现",
        version: "p0-driver-native-navigation-bridge-v1",
      },
    ],
    total: 2,
    supportedCount: nativeSupported ? 2 : 0,
    issueCount: nativeSupported ? 0 : 2,
    tone: nativeSupported ? "success" : "warning",
    label: nativeSupported ? "原生能力可用" : "原生 0/2",
    message: nativeSupported ? "原生壳桥接已接入。" : "普通浏览器未接原生壳。",
  };
  const packageLabelScanSample = {
    sampleId: "DPLS-CLOSEOUT-F002-PKG-1",
    fulfillmentId: "F002",
    expectedPackageId: "PKG-F002-1",
    scannedText: sensitiveScanText,
    matchedPackageId: "PKG-F002-1",
    method: nativeSupported ? "native_sdk" : "camera",
    methodLabel: nativeSupported ? "原生扫码SDK" : "相机扫码",
    result: "matched",
    resultLabel: "已匹配",
    checkedAt: "2026-07-08T07:59:59.000Z",
  };
  const criteria = [
    criterion("driver-delivery-task-read-model", "司机送货任务读取", true),
    criterion("driver-device-field-test-record", "司机真机现场验收记录", true),
    criterion("driver-device-field-test-checks", "司机手机 6 项现场检查", true),
    criterion("driver-native-package-scan", "原生扫码能力", nativeSupported),
    criterion("driver-native-navigation", "原生导航能力", nativeSupported),
    criterion("driver-native-package-label-scan-sample", "纸质包裹标签原生扫码样本", nativeSupported),
  ];
  const blockingCriteria = criteria.filter((item) => item.status !== "passed");
  return {
    status: blockingCriteria.length ? "blocked" : "ready",
    ready: blockingCriteria.length === 0,
    checkedAt,
    operatorId: "U-DRIVER-A",
    scope: "v1_driver_mobile_readiness",
    summary: {
      label: `${criteria.length - blockingCriteria.length}/${criteria.length} 通过`,
      passedCount: criteria.length - blockingCriteria.length,
      totalCount: criteria.length,
      blockingCount: blockingCriteria.length,
      warningCount: 0,
    },
    criteria,
    blockingCriteria,
    deliveryTaskReadiness: { total: 3, sampleFulfillmentIds: ["F002"] },
    latestFieldTestRecord: {
      recordId: "DQA-CLOSEOUT-F002",
      fulfillmentId: "F002",
      checkedAt: "2026-07-08T08:00:00.000Z",
      checks: [
        { key: "camera_permission", status: "passed" },
        { key: "watermark_photo", status: "passed" },
        { key: "package_label_scan", status: "passed" },
        { key: "geolocation", status: "passed" },
        { key: "file_upload", status: "passed" },
        { key: "navigation", status: "passed" },
      ],
      packageLabelScanSample,
      nativeBridgeDiagnostics: nativeDiagnostics,
      note: `${sensitiveGeoPoint} ${sensitiveLocalPath}`,
    },
    latestFieldTestSummary: { label: "通过 6/6，异常 0", passedCount: 6, issueCount: 0 },
    nativeBridgeDiagnostics: nativeDiagnostics,
    packageLabelScanSample,
    remainingV1Risks: blockingCriteria.map((item) => item.detail),
    safeguards: {
      nonMutating: true,
      deliveryStatusChanged: false,
      requiresNativeShell: true,
      browserOnlyNotReady: !nativeSupported,
      physicalLabelScanRequired: true,
      navigationAppRequired: true,
      payloadExposed: false,
      ...safeguards,
    },
  };
}

function criterion(key, label, passed) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    blocking: true,
    detail: passed ? "passed" : `${label} 未通过`,
  };
}

function buildDriverManifest({ completeDriverGroup, sensitiveEvidenceRef = false } = {}) {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.updatedAt = "2026-07-08T08:10:00.000Z";
  const group = manifest.evidenceGroups.find((item) => item.key === "driver_native_device");
  assert.ok(group, "template must include driver_native_device group");
  for (const item of group.items) {
    const shouldComplete = completeDriverGroup || item.key !== "map_navigation_checked";
    item.status = shouldComplete ? "passed" : "pending";
    item.evidenceRef = shouldComplete
      ? sensitiveEvidenceRef && item.key === "native_package_scan_checked"
        ? `${sensitiveDatabaseUrl} ${sensitiveAccessKey}`
        : `ATT-DRIVER-${item.key}`
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
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, new RegExp(escapeRegExp(storageRoot)), "driver closeout output leaked storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(readinessPath)), "driver closeout output leaked readiness path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(manifestPath)), "driver closeout output leaked manifest path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveLocalPath)), "driver closeout output leaked local path");
  assert.doesNotMatch(output, /DRIVER_CLOSEOUT_PASSWORD/, "driver closeout output leaked database password");
  assert.doesNotMatch(output, /AKIA_DRIVER_CLOSEOUT_SECRET/, "driver closeout output leaked access key");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveGeoPoint)), "driver closeout output leaked geo point");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitiveScanText)), "driver closeout output leaked scanned text");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
