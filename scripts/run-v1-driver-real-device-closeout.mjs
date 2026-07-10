#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";
import { redactCloseoutText } from "./run-v1-production-first-stage-closeout.mjs";

const defaultDriverReadinessPath = ".erp-local-storage/v1-driver-readiness/latest.json";
const defaultFieldEvidenceManifestPath = "docs/development/v1-field-evidence-manifest.template.json";
const defaultOutputDir = ".erp-local-storage/v1-driver-real-device-closeout";
const defaultMaxAgeHours = 72;
const requiredDriverEvidenceKeys = [
  "driver_real_phone_checked",
  "camera_permission_checked",
  "native_package_scan_checked",
  "geo_location_checked",
  "map_navigation_checked",
  "offline_upload_fallback_checked",
];
const physicalDeviceProofKeys = [
  "driver_real_phone_checked",
  "camera_permission_checked",
  "native_package_scan_checked",
  "geo_location_checked",
  "map_navigation_checked",
  "offline_upload_fallback_checked",
];

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildDriverRealDeviceCloseout({
      driverReadinessPath: options.driverReadinessPath,
      fieldEvidenceManifestPath: options.fieldEvidenceManifestPath,
      maxAgeHours: options.maxAgeHours,
      now: new Date(),
    });
    const outputReport = redactDriverCloseoutReport(
      options.write
        ? {
            ...report,
            artifacts: writeDriverRealDeviceCloseoutArtifacts(report, { outputDir: options.outputDir }),
          }
        : report,
    );
    if (options.json) {
      process.stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`);
    } else {
      process.stdout.write(formatDriverRealDeviceCloseout(outputReport));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactDriverCloseoutText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 driver real-device closeout failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    driverReadinessPath: defaultDriverReadinessPath,
    fieldEvidenceManifestPath: defaultFieldEvidenceManifestPath,
    outputDir: defaultOutputDir,
    maxAgeHours: defaultMaxAgeHours,
    write: true,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--driver-readiness-json") {
      options.driverReadinessPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifestPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-age-hours") {
      options.maxAgeHours = parseNonNegativeNumber(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function parseNonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be zero or a positive number.`);
  return number;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-driver-real-device-closeout.mjs [options]",
    "",
    "Options:",
    "  --driver-readiness-json <path>  Driver V1 readiness JSON, either GET /driver/v1-readiness output or the full run-v1-readiness-check JSON.",
    "                                 Defaults to .erp-local-storage/v1-driver-readiness/latest.json.",
    "  --field-evidence-manifest <path> Filled V1 field evidence manifest. Defaults to the pending template.",
    "  --max-age-hours <n>             Maximum driver readiness report age. Defaults to 72; use 0 to disable freshness blocking.",
    "  --output-dir <path>             Write redacted closeout files. Defaults to .erp-local-storage/v1-driver-real-device-closeout.",
    "  --no-write                      Do not write JSON / Markdown closeout files.",
    "  --json                          Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Real driver-device evidence is ready for stage closeout",
    "  1  Runner/read/write error",
    "  2  Closeout is readable but still blocked",
    "",
    "This closeout does not request camera/location permissions, open navigation apps, invoke native bridges, call APIs, or change driver delivery state. It validates saved readiness evidence and the driver_native_device evidence group in the field-evidence manifest.",
  ].join("\n");
}

function buildDriverRealDeviceCloseout({
  driverReadinessPath = defaultDriverReadinessPath,
  fieldEvidenceManifestPath = defaultFieldEvidenceManifestPath,
  maxAgeHours = defaultMaxAgeHours,
  checkedAt = new Date().toISOString(),
  now = new Date(checkedAt),
} = {}) {
  const readinessArtifact = readJsonArtifact({
    artifactKey: "driver-v1-readiness",
    label: "司机端 V1 readiness",
    filePath: driverReadinessPath,
  });
  const manifestArtifact = readJsonArtifact({
    artifactKey: "field-evidence-manifest",
    label: "现场证据 manifest",
    filePath: fieldEvidenceManifestPath,
  });
  const manifestValidation = manifestArtifact.readable
    ? validateV1FieldEvidenceManifest(manifestArtifact.report)
    : buildMissingManifestValidation(manifestArtifact);
  const driverGroup = getDriverNativeDeviceGroup(manifestValidation);
  const stages = [
    buildDriverReadinessArtifactStage(readinessArtifact),
    buildDriverReadinessReadyStage(readinessArtifact),
    buildDriverNativeGateStage(readinessArtifact),
    buildReadinessFreshnessStage({ artifact: readinessArtifact, maxAgeHours, now }),
    buildManifestArtifactStage({ manifestArtifact, manifestValidation }),
    buildDriverEvidenceStage(driverGroup),
    buildPhysicalDeviceProofStage(driverGroup),
    buildDriverCloseoutSafeguardsStage({ readinessArtifact, manifestValidation }),
  ];
  const passedCount = stages.filter((item) => item.status === "passed").length;
  const blockingCount = stages.length - passedCount;
  const ready = blockingCount === 0;
  const report = {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_driver_real_device_closeout",
    summary: {
      label: `${passedCount}/${stages.length} 通过`,
      passedCount,
      totalCount: stages.length,
      blockingCount,
      warningCount: 0,
    },
    stages,
    blockingStages: stages.filter((item) => item.status !== "passed"),
    evidenceSummary: {
      driverReadiness: summarizeDriverReadinessArtifact(readinessArtifact),
      driverNativeEvidence: summarizeDriverNativeEvidence(readinessArtifact),
      driverNativeDeviceEvidence: summarizeDriverNativeDeviceEvidence(driverGroup),
      maxAgeHours,
      sourceArtifactPathsIncluded: false,
      rawReadinessReportIncluded: false,
      rawEvidenceRefsIncluded: false,
      closeoutCoversOnlyDriverStage: true,
    },
    safeguards: {
      nonMutating: true,
      externalServiceCalledByCloseout: false,
      apiCalledByCloseout: false,
      cameraPermissionRequestedByCloseout: false,
      locationPermissionRequestedByCloseout: false,
      navigationAppOpenedByCloseout: false,
      nativeBridgeInvokedByCloseout: false,
      deliveryStatusChangedByCloseout: false,
      sourceArtifactPathExposed: false,
      rawReadinessReportIncluded: false,
      rawEvidenceRefsIncluded: false,
      scannedTextExposed: false,
      photoPayloadExposed: false,
      geoPointExposed: false,
      payloadExposed: false,
      secretFieldsExposed: false,
      declaresFullV1Complete: false,
      physicalPrinterCalled: false,
    },
    nextActions: buildNextActions(stages, ready),
  };
  return redactDriverCloseoutReport(report);
}

function readJsonArtifact({ artifactKey, label, filePath }) {
  const fullPath = resolve(filePath);
  if (!existsSync(fullPath)) {
    return {
      artifactKey,
      label,
      available: false,
      readable: false,
      error: "Evidence JSON not found.",
      rawPathIncluded: false,
    };
  }
  try {
    const stats = statSync(fullPath);
    if (!stats.isFile()) throw new Error("Evidence path is not a file.");
    const parsed = JSON.parse(readFileSync(fullPath, "utf8"));
    return {
      artifactKey,
      label,
      available: true,
      readable: true,
      report: parsed,
      bytes: stats.size,
      rawPathIncluded: false,
    };
  } catch (error) {
    return {
      artifactKey,
      label,
      available: true,
      readable: false,
      error: error?.message || String(error),
      rawPathIncluded: false,
    };
  }
}

function extractDriverReadinessReport(report = {}) {
  if (!report || typeof report !== "object") return null;
  if (cleanString(report.scope) === "v1_driver_mobile_readiness") return report;
  if (report.driverReadiness && typeof report.driverReadiness === "object") return report.driverReadiness;
  return null;
}

function buildMissingManifestValidation(manifestArtifact) {
  return {
    status: "invalid",
    ready: false,
    schemaValid: false,
    schemaErrors: [manifestArtifact.error || "manifest is unavailable"],
    groups: [],
    blockers: [],
    safeguards: {
      evidenceRefsRedacted: true,
      possibleSensitiveEvidenceRefCount: 0,
      rawEvidenceRefsIncludedInReport: false,
    },
  };
}

function buildDriverReadinessArtifactStage(artifact) {
  const driverReadiness = extractDriverReadinessReport(artifact.report);
  const criteria = Array.isArray(driverReadiness?.criteria) ? driverReadiness.criteria : [];
  const passed =
    artifact.readable === true &&
    Boolean(driverReadiness) &&
    cleanString(driverReadiness.status) &&
    typeof driverReadiness.ready === "boolean" &&
    criteria.length >= 6;
  return {
    key: "driver-readiness-artifact",
    label: "司机 readiness 文件",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed ? "司机 readiness JSON 可读取且包含真机门禁摘要。" : artifact.error || "司机 readiness JSON 不可读取或格式不完整。",
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      available: artifact.available === true,
      readable: artifact.readable === true,
      sourceScope: cleanString(driverReadiness?.scope || artifact.report?.scope || "unavailable"),
      sourceStatus: cleanString(driverReadiness?.status || "unavailable"),
      sourceReady: driverReadiness?.ready === true,
      criteriaCount: criteria.length,
      byteCount: numberOrZero(artifact.bytes),
      rawPathIncluded: false,
    },
    nextAction: passed
      ? "继续检查司机 readiness 是否 ready。"
      : "先保存 GET /driver/v1-readiness 或 run-v1-readiness-check 的 JSON 后重跑 closeout。",
  };
}

function buildDriverReadinessReadyStage(artifact) {
  const driverReadiness = extractDriverReadinessReport(artifact.report) || {};
  const blockingCriteria = Array.isArray(driverReadiness.blockingCriteria) ? driverReadiness.blockingCriteria : [];
  const ready =
    artifact.readable === true &&
    driverReadiness.ready === true &&
    cleanString(driverReadiness.status) === "ready" &&
    numberOrZero(driverReadiness.summary?.blockingCount) === 0 &&
    blockingCriteria.length === 0;
  return {
    key: "driver-readiness-ready",
    label: "司机 V1 readiness ready",
    status: ready ? "passed" : "blocked",
    ready,
    detail: ready ? "司机 V1 readiness 已 ready 且无阻塞门禁。" : "司机 V1 readiness 未 ready 或仍有阻塞门禁。",
    summary: {
      label: cleanString(driverReadiness.summary?.label) || (ready ? "ready" : "blocked"),
      passedCount: numberOrZero(driverReadiness.summary?.passedCount),
      totalCount: numberOrZero(driverReadiness.summary?.totalCount),
      blockingCount: ready ? 0 : Math.max(1, numberOrZero(driverReadiness.summary?.blockingCount || blockingCriteria.length)),
      warningCount: numberOrZero(driverReadiness.summary?.warningCount),
    },
    blockingItems: sanitizeBlockingCriteria(blockingCriteria),
    evidence: {
      sourceStatus: cleanString(driverReadiness.status || "unavailable"),
      sourceReady: driverReadiness.ready === true,
      rawReportIncluded: false,
    },
    nextAction: ready ? "继续核对原生桥、纸质标签扫码样本和现场证据。" : firstAction(driverReadiness.nextActions) || "先处理司机 readiness 阻塞项。",
  };
}

function buildDriverNativeGateStage(artifact) {
  const driverReadiness = extractDriverReadinessReport(artifact.report) || {};
  const criteriaByKey = new Map((driverReadiness.criteria || []).map((item) => [cleanString(item.key), item]));
  const nativeDiagnostics = driverReadiness.nativeBridgeDiagnostics || {};
  const nativeItems = Array.isArray(nativeDiagnostics.items) ? nativeDiagnostics.items : [];
  const sample = driverReadiness.packageLabelScanSample || {};
  const checks = [
    gateCheck({
      key: "native-package-scan-criterion",
      label: "原生扫码门禁",
      passed: criterionPassed(criteriaByKey.get("driver-native-package-scan")),
      detail: "driver readiness 里的原生扫码能力必须通过。",
    }),
    gateCheck({
      key: "native-navigation-criterion",
      label: "原生导航门禁",
      passed: criterionPassed(criteriaByKey.get("driver-native-navigation")),
      detail: "driver readiness 里的原生导航能力必须通过。",
    }),
    gateCheck({
      key: "native-package-label-sample-criterion",
      label: "纸质标签原生扫码样本门禁",
      passed: criterionPassed(criteriaByKey.get("driver-native-package-label-scan-sample")),
      detail: "纸质包裹标签样本必须由原生 SDK 扫码并匹配包裹。",
    }),
    gateCheck({
      key: "native-bridge-2-of-2",
      label: "原生桥 2/2 可用",
      passed:
        numberOrZero(nativeDiagnostics.supportedCount) >= 2 &&
        ["native_package_scan", "native_navigation"].every((key) => nativeItems.some((item) => cleanString(item.key) === key && item.supported === true)),
      detail: "原生扫码桥和原生导航桥都必须由真实壳支持。",
    }),
    gateCheck({
      key: "native-scan-sample-physical-label",
      label: "扫码样本来自原生 SDK",
      passed:
        cleanString(sample.method) === "native_sdk" &&
        ["matched", "duplicate"].includes(cleanString(sample.result)) &&
        Boolean(cleanString(sample.expectedPackageId)) &&
        Boolean(cleanString(sample.matchedPackageId)) &&
        Boolean(cleanString(sample.scannedText)),
      detail: "样本必须包含预期包裹、匹配包裹和已读回扫码文本；报告不输出原始扫码文本。",
    }),
  ];
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "driver-native-gates",
    label: "原生扫码 / 导航 / 纸质标签样本",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "原生扫码、原生导航和纸质标签扫码样本均达到 V1 真机要求。"
        : `${blockingItems.length} 项原生真机门禁仍未通过。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    evidence: {
      nativeSupportedLabel: `${numberOrZero(nativeDiagnostics.supportedCount)}/${numberOrZero(nativeDiagnostics.total || 2)}`,
      packageLabelScanSampleId: cleanString(sample.sampleId),
      packageLabelScanMethod: cleanString(sample.method),
      packageLabelScanResult: cleanString(sample.result),
      scanTextIncluded: false,
      rawNativePayloadIncluded: false,
    },
    nextAction:
      blockingItems.length === 0
        ? "继续检查现场证据 manifest。"
        : "先用真实 Android / iOS 原生壳跑扫码、导航和纸质标签扫码样本，并保存 readiness JSON。",
  };
}

function buildReadinessFreshnessStage({ artifact, maxAgeHours, now }) {
  if (Number(maxAgeHours) <= 0) {
    return {
      key: "driver-readiness-freshness",
      label: "司机 readiness 时效",
      status: "passed",
      ready: true,
      detail: "司机 readiness 时效检查已按 --max-age-hours 0 关闭。",
      summary: { label: "时效检查关闭", passedCount: 1, totalCount: 1, blockingCount: 0, warningCount: 0 },
      evidence: { maxAgeHours: 0 },
      nextAction: "继续检查现场证据 manifest。",
    };
  }
  const driverReadiness = extractDriverReadinessReport(artifact.report) || {};
  const checkedAt = cleanString(driverReadiness.checkedAt || artifact.report?.checkedAt);
  const parsed = checkedAt ? new Date(checkedAt) : null;
  const valid = parsed instanceof Date && !Number.isNaN(parsed.getTime());
  const ageHours = valid ? Math.max(0, (now.getTime() - parsed.getTime()) / 3600000) : Number.POSITIVE_INFINITY;
  const passed = valid && ageHours <= maxAgeHours;
  return {
    key: "driver-readiness-freshness",
    label: "司机 readiness 时效",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed ? `司机 readiness 报告在 ${maxAgeHours} 小时内。` : `司机 readiness 报告缺少 checkedAt 或超过 ${maxAgeHours} 小时。`,
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      checkedAt,
      maxAgeHours,
      ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(2)) : null,
      validCheckedAt: valid,
    },
    nextAction: passed ? "继续检查现场证据 manifest。" : "重新保存最新司机 readiness JSON 后重跑 closeout。",
  };
}

function buildManifestArtifactStage({ manifestArtifact, manifestValidation }) {
  const passed = manifestArtifact.readable === true && manifestValidation.schemaValid === true;
  return {
    key: "field-evidence-manifest-artifact",
    label: "现场证据 manifest 文件",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed ? "现场证据 manifest 可读取且 schema 正确。" : manifestArtifact.error || "现场证据 manifest 不可读取或 schema 错误。",
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      available: manifestArtifact.available === true,
      readable: manifestArtifact.readable === true,
      schemaValid: manifestValidation.schemaValid === true,
      schemaErrorCount: Array.isArray(manifestValidation.schemaErrors) ? manifestValidation.schemaErrors.length : 0,
      wholeManifestReady: manifestValidation.ready === true,
      rawPathIncluded: false,
    },
    nextAction: passed ? "继续检查 driver_native_device 证据组。" : "先修正现场证据 manifest 格式后重跑 closeout。",
  };
}

function buildDriverEvidenceStage(driverGroup) {
  const itemMap = new Map((driverGroup?.items || []).map((item) => [item.key, item]));
  const checks = requiredDriverEvidenceKeys.map((key) => {
    const item = itemMap.get(key);
    const passed =
      Boolean(item) &&
      ["passed", "accepted"].includes(cleanString(item.status)) &&
      item.evidenceRefFilled === true;
    return {
      key,
      label: cleanString(item?.label || key),
      status: passed ? "passed" : "pending",
      ready: passed,
      detail: passed ? "状态已通过且 evidenceRef 已填写。" : "需要状态为 passed/accepted，并填写 evidenceRef。",
    };
  });
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "driver-native-device-evidence",
    label: "司机真机现场证据",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "driver_native_device 6 项现场证据均已通过并填写证据引用。"
        : `driver_native_device 仍有 ${blockingItems.length} 项证据未完成。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    evidence: {
      groupFound: Boolean(driverGroup),
      groupStatus: cleanString(driverGroup?.status || "missing"),
      requiredEvidenceItemsTotal: requiredDriverEvidenceKeys.length,
      requiredEvidenceItemsCompleted: checks.length - blockingItems.length,
      rawEvidenceRefsIncluded: false,
    },
    nextAction:
      blockingItems.length === 0
        ? "继续检查真实手机覆盖项。"
        : "先在现场证据 manifest 的 driver_native_device 组补齐 passed/accepted 和 evidenceRef。",
  };
}

function buildPhysicalDeviceProofStage(driverGroup) {
  const itemMap = new Map((driverGroup?.items || []).map((item) => [item.key, item]));
  const checks = physicalDeviceProofKeys.map((key) => {
    const item = itemMap.get(key);
    const passed =
      Boolean(item) &&
      ["passed", "accepted"].includes(cleanString(item.status)) &&
      item.evidenceRefFilled === true;
    return {
      key,
      label: physicalProofLabel(key, item?.label),
      status: passed ? "passed" : "pending",
      ready: passed,
      detail: passed ? "已有现场真机证据引用。" : "缺少真实手机、扫码、定位、导航、水印拍照或上传兜底证据。",
    };
  });
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "physical-driver-device-proof",
    label: "真实手机 / 扫码 / 定位 / 导航覆盖",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "真实手机登录、相机水印、原生扫码、定位、地图导航和上传兜底均有现场证据。"
        : `${blockingItems.length} 项真实司机手机覆盖证据仍未完成。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    nextAction:
      blockingItems.length === 0
        ? "司机真机 closeout 可作为司机阶段签收依据。"
        : "继续补真实手机登录、相机水印、纸质标签原生扫码、定位、导航和弱网上传兜底证据。",
  };
}

function buildDriverCloseoutSafeguardsStage({ readinessArtifact, manifestValidation }) {
  const driverReadiness = extractDriverReadinessReport(readinessArtifact.report) || {};
  const safeguards = driverReadiness.safeguards || {};
  const manifestSafeguards = manifestValidation.safeguards || {};
  const checks = [
    safeguardCheck({
      key: "readiness-redacted",
      label: "readiness 输出已脱敏",
      passed:
        safeguards.payloadExposed !== true &&
        safeguards.scannedTextExposed !== true &&
        safeguards.photoPayloadExposed !== true &&
        safeguards.geoPointExposed !== true,
      detail: "司机 readiness 报告不能暴露送货 payload、扫码文本、照片内容或定位原文。",
    }),
    safeguardCheck({
      key: "readiness-runner-read-only",
      label: "readiness / closeout 不改司机状态",
      passed:
        safeguards.nonMutating !== false &&
        safeguards.deliveryStatusChanged !== true &&
        safeguards.nativeBridgeInvoked !== true &&
        safeguards.navigationAppOpened !== true,
      detail: "closeout 只能读取已保存证据，不能请求权限、打开导航、调用原生桥或改送货状态。",
    }),
    safeguardCheck({
      key: "native-shell-required",
      label: "普通浏览器不能冒充真机",
      passed:
        safeguards.requiresNativeShell !== false &&
        safeguards.browserOnlyNotReady !== true &&
        safeguards.physicalLabelScanRequired !== false &&
        safeguards.navigationAppRequired !== false,
      detail: "ready 报告必须明确依赖真实原生壳、纸质标签扫码和地图导航能力。",
    }),
    safeguardCheck({
      key: "manifest-evidence-ref-redacted",
      label: "manifest 证据引用未泄露敏感字段",
      passed:
        manifestSafeguards.evidenceRefsRedacted === true &&
        manifestSafeguards.rawEvidenceRefsIncludedInReport !== true &&
        numberOrZero(manifestSafeguards.possibleSensitiveEvidenceRefCount) === 0,
      detail: "证据引用只能是报告编号、截图名、附件编号或签字单编号，不能包含密钥、连接串、定位原文或客户隐私。",
    }),
  ];
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "driver-real-device-closeout-safeguards",
    label: "司机阶段 closeout 安全护栏",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "司机阶段 closeout 的脱敏、只读、真机和证据引用护栏均通过。"
        : `${blockingItems.length} 项司机阶段安全护栏未通过。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    nextAction:
      blockingItems.length === 0
        ? "司机阶段 closeout 可交给司机 / 技术负责人复核。"
        : "先清理敏感输出，或补齐真实原生壳 / 只读 / 现场证据边界后重跑 closeout。",
  };
}

function getDriverNativeDeviceGroup(manifestValidation = {}) {
  return (manifestValidation.groups || []).find((group) => group.key === "driver_native_device") || null;
}

function summarizeDriverReadinessArtifact(artifact) {
  const driverReadiness = extractDriverReadinessReport(artifact.report) || {};
  return {
    available: artifact.available === true,
    readable: artifact.readable === true,
    status: cleanString(driverReadiness.status || "unavailable"),
    ready: driverReadiness.ready === true,
    checkedAt: cleanString(driverReadiness.checkedAt || artifact.report?.checkedAt),
    summaryLabel: cleanString(driverReadiness.summary?.label),
    rawPathIncluded: false,
  };
}

function summarizeDriverNativeEvidence(artifact) {
  const driverReadiness = extractDriverReadinessReport(artifact.report) || {};
  const diagnostics = driverReadiness.nativeBridgeDiagnostics || {};
  const sample = driverReadiness.packageLabelScanSample || {};
  return {
    nativeSupportedLabel: `${numberOrZero(diagnostics.supportedCount)}/${numberOrZero(diagnostics.total || 2)}`,
    packageLabelScanMethod: cleanString(sample.method),
    packageLabelScanResult: cleanString(sample.result),
    packageLabelScanSamplePresent: Boolean(cleanString(sample.sampleId)),
    scanTextIncluded: false,
    rawNativePayloadIncluded: false,
  };
}

function summarizeDriverNativeDeviceEvidence(driverGroup) {
  return {
    groupFound: Boolean(driverGroup),
    status: cleanString(driverGroup?.status || "missing"),
    ready: driverGroup?.ready === true,
    requiredTotal: numberOrZero(driverGroup?.requiredTotal || requiredDriverEvidenceKeys.length),
    completedRequired: numberOrZero(driverGroup?.completedRequired),
    blockedRequired: numberOrZero(driverGroup?.blockedRequired),
    rawEvidenceRefsIncluded: false,
  };
}

function criterionPassed(item) {
  return item?.status === "passed" || item?.ready === true || item?.passed === true;
}

function gateCheck({ key, label, passed, detail }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    ready: passed === true,
    detail,
  };
}

function safeguardCheck({ key, label, passed, detail }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    ready: passed === true,
    detail,
  };
}

function sanitizeBlockingCriteria(items = []) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((item) => ({
    key: cleanString(item.key),
    label: cleanString(item.label),
    status: cleanString(item.status),
    detail: cleanString(item.detail),
  }));
}

function physicalProofLabel(key, fallback) {
  const labels = {
    driver_real_phone_checked: "真实手机安装登录",
    camera_permission_checked: "相机 / 水印照片",
    native_package_scan_checked: "纸质标签原生扫码",
    geo_location_checked: "定位记录",
    map_navigation_checked: "地图导航",
    offline_upload_fallback_checked: "弱网上传兜底",
  };
  return labels[key] || cleanString(fallback || key);
}

function buildNextActions(stages, ready) {
  if (ready) {
    return [
      "把 driver real-device closeout、司机 readiness 报告和 driver_native_device 现场证据编号写入上线交接包。",
      "继续下一阶段真实订单试跑：录入、库存、出库、生产打包、对账收款和异常待办。",
    ];
  }
  return stages
    .filter((item) => item.status !== "passed")
    .map((item) => cleanString(item.nextAction))
    .filter(Boolean)
    .slice(0, 8);
}

function writeDriverRealDeviceCloseoutArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const safeTimestamp = cleanString(report.checkedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatDriverRealDeviceCloseout(report);
  const jsonPath = join(outputDir, `driver-real-device-closeout-${safeTimestamp}.json`);
  const markdownPath = join(outputDir, `driver-real-device-closeout-${safeTimestamp}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  writeFileSync(jsonPath, json);
  writeFileSync(markdownPath, markdown);
  writeFileSync(latestJsonPath, json);
  writeFileSync(latestMarkdownPath, markdown);
  return {
    outputDir,
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
  };
}

function formatDriverRealDeviceCloseout(report) {
  const lines = [
    "# V1 Driver Real-Device Closeout",
    "",
    `Status: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Checked at: ${report.checkedAt}`,
    "",
    "## Stages",
  ];
  for (const stage of report.stages) {
    lines.push(`- ${stage.status.toUpperCase()} ${stage.label}: ${stage.detail}`);
    if (stage.nextAction && stage.status !== "passed") lines.push(`  - Next: ${stage.nextAction}`);
  }
  lines.push(
    "",
    "## Evidence Summary",
    `- Driver readiness: ${report.evidenceSummary.driverReadiness.status} ${report.evidenceSummary.driverReadiness.summaryLabel}`,
    `- Native capability: ${report.evidenceSummary.driverNativeEvidence.nativeSupportedLabel} / ${report.evidenceSummary.driverNativeEvidence.packageLabelScanMethod || "no-scan-method"}`,
    `- Driver native-device evidence: ${report.evidenceSummary.driverNativeDeviceEvidence.status} ${report.evidenceSummary.driverNativeDeviceEvidence.completedRequired}/${report.evidenceSummary.driverNativeDeviceEvidence.requiredTotal}`,
    `- Source artifact paths included: ${yesNo(report.evidenceSummary.sourceArtifactPathsIncluded)}`,
    `- Raw readiness report included: ${yesNo(report.evidenceSummary.rawReadinessReportIncluded)}`,
    `- Raw evidence refs included: ${yesNo(report.evidenceSummary.rawEvidenceRefsIncluded)}`,
    "",
    "## Safeguards",
    `- External service called by closeout: ${yesNo(report.safeguards.externalServiceCalledByCloseout)}`,
    `- API called by closeout: ${yesNo(report.safeguards.apiCalledByCloseout)}`,
    `- Camera permission requested by closeout: ${yesNo(report.safeguards.cameraPermissionRequestedByCloseout)}`,
    `- Location permission requested by closeout: ${yesNo(report.safeguards.locationPermissionRequestedByCloseout)}`,
    `- Navigation app opened by closeout: ${yesNo(report.safeguards.navigationAppOpenedByCloseout)}`,
    `- Native bridge invoked by closeout: ${yesNo(report.safeguards.nativeBridgeInvokedByCloseout)}`,
    `- Delivery status changed by closeout: ${yesNo(report.safeguards.deliveryStatusChangedByCloseout)}`,
    `- Source artifact path exposed: ${yesNo(report.safeguards.sourceArtifactPathExposed)}`,
    `- Raw evidence refs included: ${yesNo(report.safeguards.rawEvidenceRefsIncluded)}`,
    `- Scanned text exposed: ${yesNo(report.safeguards.scannedTextExposed)}`,
    `- Photo payload exposed: ${yesNo(report.safeguards.photoPayloadExposed)}`,
    `- Geo point exposed: ${yesNo(report.safeguards.geoPointExposed)}`,
    `- Declares full V1 complete: ${yesNo(report.safeguards.declaresFullV1Complete)}`,
    "",
    report.ready ? "## Next" : "## Next Blockers",
  );
  for (const action of report.nextActions) lines.push(`- ${action}`);
  if (report.artifacts) {
    lines.push("", "## Artifacts", `- JSON: ${report.artifacts.latestJsonPath}`, `- Markdown: ${report.artifacts.latestMarkdownPath}`);
  }
  lines.push("");
  return redactDriverCloseoutText(lines.join("\n"));
}

function redactDriverCloseoutReport(report) {
  const outputReport = {
    ...report,
    ...(report.artifacts ? { artifacts: redactCloseoutArtifactPaths(report.artifacts) } : {}),
  };
  return JSON.parse(redactDriverCloseoutText(JSON.stringify(outputReport)));
}

function redactCloseoutArtifactPaths(artifacts = {}) {
  return Object.fromEntries(
    Object.entries(artifacts).map(([key, value]) => [
      key,
      key === "outputDir" || key.endsWith("Path") ? "[redacted-path]" : value,
    ]),
  );
}

function redactDriverCloseoutText(value) {
  return redactCloseoutText(value)
    .replace(/\/(?:Users|private|var|tmp|usr|opt)\/[^\s"'<>]+/g, "[redacted-path]")
    .replace(/\b(?:-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,})\b/g, "[redacted-geo]");
}

function firstAction(values) {
  return Array.isArray(values) ? cleanString(values.find(Boolean) || "") : cleanString(values);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildDriverRealDeviceCloseout,
  formatDriverRealDeviceCloseout,
  parseArgs,
  redactDriverCloseoutText,
  writeDriverRealDeviceCloseoutArtifacts,
};
