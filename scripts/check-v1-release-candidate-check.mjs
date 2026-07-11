import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { createSeedSession } from "../server/authSeed.mjs";
import {
  buildV1FieldEvidenceManifestTemplate,
  serializeManifestJson,
} from "./v1FieldEvidenceManifest.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-release-candidate");
const spoolRoot = join(storageRoot, "spool");
const outputRoot = join(storageRoot, "reports");
const envFilePath = join(storageRoot, "prod.env");
const productionEnvSetupJsonPath = join(storageRoot, "production-env-setup.json");
const unsafeEnvFilePath = join(storageRoot, "prod.env.example");
const readyManifestPath = join(storageRoot, "ready-field-evidence-manifest.json");
const releaseScript = join(process.cwd(), "scripts", "run-v1-release-candidate-check.mjs");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");
const sensitiveValues = [
  "postgres://v1_user:pass@prod-db.internal:5432/erp",
  "postgres://restore_user:restore-pass@restore-db.internal:5432/erp_restore",
  "https://oss-secret.example.com",
  "erp-v1-private-bucket",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/usr/local/bin/node-secret",
  "/var/spool/erp-secret",
  "/usr/bin/lpstat-secret",
];
const officeDemoToken = createSeedSession("U-OFFICE-A").accessToken;
const driverDemoToken = createSeedSession("U-DRIVER-A").accessToken;
sensitiveValues.push(officeDemoToken, driverDemoToken);

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(spoolRoot, { recursive: true });

const baseEnv = {
  PATH: process.env.PATH ?? "",
};
const productionEnv = {
  ERP_RUNTIME_MODE: "production",
  ERP_V1_PERSISTENCE_PROFILE: "postgres",
  ERP_V1_DATABASE_URL: sensitiveValues[0],
  ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveValues[1],
  ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "false",
  ERP_V1_FILE_STORAGE_PROFILE: "object_storage",
  ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER: "s3_compatible",
  ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: sensitiveValues[2],
  ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveValues[3],
  ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveValues[4],
  ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveValues[5],
  ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: "prod-attachments",
  ERP_SYSTEM_PRINTER_ENABLED: "true",
  ERP_SYSTEM_PRINTER_ADAPTER: "command_bridge",
  ERP_SYSTEM_PRINTER_COMMAND: sensitiveValues[6],
  ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON: JSON.stringify([
    "scripts/print-command-bridge.mjs",
    "--print-job-id",
    "{printJobId}",
  ]),
  ERP_SYSTEM_PRINTER_ALLOWLIST: "PRN-LABEL-A,PRN-DOT-A",
  ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR: sensitiveValues[7],
  ERP_PRINT_COMMAND_BRIDGE_MODE: "cups_lp",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST: "标签机A,针式打印机A",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER: "标签机A",
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND: sensitiveValues[8],
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON: JSON.stringify(["-p", "{cupsPrinterName}"]),
  ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS: "5000",
  ERP_V1_READINESS_API_BASE_URL: "http://127.0.0.1:8787/api",
  ERP_V1_READINESS_OPERATOR_ID: "U-OFFICE-A",
  ERP_V1_READINESS_TOKEN: officeDemoToken,
  ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-DRIVER-A",
  ERP_V1_READINESS_DRIVER_TOKEN: driverDemoToken,
  ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR: ".erp-local-storage/v1-field-acceptance",
  ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL: "http://127.0.0.1:8787/api",
};

const server = createApiServer({
  attachmentRepositoryOptions: { storageRoot },
  attachmentAccessAuditRepositoryOptions: { storageRoot },
  attachmentObjectStorageOptions: { storageRoot },
  attachmentV1ReadinessOptions: {
    localFsAccepted: true,
    acceptanceReference: "automated V1 release candidate local storage fixture",
  },
  systemV1ReadinessOptions: {
    localPersistenceAccepted: true,
    acceptanceReference: "automated V1 release candidate local persistence fixture",
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

  const blockedRun = await runRelease(baseUrl, { env: baseEnv });
  assert.equal(blockedRun.status, 2, runFailureMessage("blocked release candidate should exit 2", blockedRun));
  const blockedResult = JSON.parse(blockedRun.stdout);
  assert.equal(blockedResult.status, "blocked");
  assert.equal(blockedResult.ready, false);
  assert.equal(blockedResult.summary.totalGateCount, 4);
  assert.equal(blockedResult.envFileAudit?.included, false);
  assert.equal(blockedResult.envFileAudit?.ready, true);
  assert.ok(blockedResult.blockingCount > 0);
  assert.ok(blockedResult.nextActions.some((item) => item.includes("生产环境变量预检")));
  assert.ok(blockedResult.nextActions.some((item) => item.includes("现场证据 manifest")));
  assert.ok(blockedResult.v2Differences.some((item) => item.includes("企业微信") || item.includes("AI")));
  assert.ok(Array.isArray(blockedResult.envPreflight?.fixChecklist), "release result should expose env fix checklist");
  assert.ok(
    blockedResult.envPreflight.fixChecklist.some(
      (item) => item.key === "v1-persistence-profile" && item.missingVariables.includes("ERP_V1_DATABASE_URL or DATABASE_URL or PGURL"),
    ),
    "release env fix checklist should preserve missing variable names",
  );
  const blockedMarkdown = readGeneratedFile(blockedResult.files.markdown);
  const blockedJson = readGeneratedFile(blockedResult.files.json);
  assert.match(blockedMarkdown, /ERP V1 发布候选检查/);
  assert.match(blockedMarkdown, /BLOCKED/);
  assert.match(blockedMarkdown, /V2 计划差异/);
  assert.match(blockedMarkdown, /生产 env 文件安全审计/);
  assert.match(blockedMarkdown, /生产环境预检修正清单/);
  assert.match(blockedJson, /"scope": "v1_release_candidate_check"/);
  assert.match(blockedJson, /"fixChecklist"/);
  assert.ok(existsSync(join(outputRoot, "latest.md")), "latest release candidate markdown report was not written");
  assert.ok(existsSync(join(outputRoot, "latest.json")), "latest release candidate json report was not written");
  assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr + blockedMarkdown + blockedJson);

  await preparePositiveReadiness(baseUrl);
  writeFileSync(readyManifestPath, serializeManifestJson(buildReadyFieldEvidenceManifest()));

  const readyRun = await runRelease(baseUrl, {
    env: { ...baseEnv, ...productionEnv },
    args: ["--field-evidence-manifest", readyManifestPath],
  });
  assert.equal(readyRun.status, 0, runFailureMessage("ready release candidate should exit 0", readyRun));
  const readyResult = JSON.parse(readyRun.stdout);
  assert.equal(readyResult.status, "ready");
  assert.equal(readyResult.ready, true);
  assert.equal(readyResult.summary.label, "4/4 发布门禁通过");
  assert.equal(readyResult.envFileAudit?.included, false);
  assert.equal(readyResult.envFileAudit?.ready, true);
  assert.equal(readyResult.blockingCount, 0);
  assert.equal(readyResult.summary.fieldEvidence, "V1 现场证据清单已通过");
  assert.equal(readyResult.fieldEvidenceManifest?.ready, true);
  assert.ok(
    readyResult.envPreflight.fixChecklist.every((item) => item.severity === "ok"),
    "ready release candidate env fix checklist should be all ok",
  );
  assert.ok(readyResult.fieldAcceptanceFiles?.markdown);
  const readyMarkdown = readGeneratedFile(readyResult.files.markdown);
  assert.match(readyMarkdown, /READY/);
  assert.match(readyMarkdown, /V1 范围/);
  assert.match(readyMarkdown, /V2 计划差异/);
  assert.match(readyMarkdown, /现场证据 manifest/);
  assert.match(readyMarkdown, /现场验收报告/);
  assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr + readyMarkdown);

  const textRun = await runRelease(baseUrl, {
    env: { ...baseEnv, ...productionEnv },
    json: false,
    args: ["--field-evidence-manifest", readyManifestPath],
  });
  assert.equal(textRun.status, 0, runFailureMessage("ready text release candidate should exit 0", textRun));
  assert.match(textRun.stdout, /V1 release candidate: READY/);
  assert.match(textRun.stdout, /Markdown:/);
  assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

  writeFileSync(
    envFilePath,
    [
      "# V1 release candidate env-file fixture",
      ...Object.entries(productionEnv).map(([key, value]) => `${key}='${String(value).replace(/'/g, "'\\''")}'`),
      "",
    ].join("\n"),
  );
  chmodSync(envFilePath, 0o600);
  const envFileRun = await runRelease(baseUrl, {
    env: baseEnv,
    args: ["--env-file", envFilePath, "--field-evidence-manifest", readyManifestPath],
  });
  assert.equal(envFileRun.status, 0, runFailureMessage("env-file release candidate should be ready", envFileRun));
  const envFileResult = JSON.parse(envFileRun.stdout);
  assert.equal(envFileResult.ready, true);
  assert.equal(envFileResult.envFileAudit?.included, true);
  assert.equal(envFileResult.envFileAudit?.ready, true);
  assert.equal(envFileResult.envFileAudit?.safeguards?.nonMutating, true);
  assert.equal(envFileResult.envFileAudit?.safeguards?.envFilePathExposed, false);
  assert.equal(envFileResult.envFileAudit?.files?.[0]?.path, "env 文件 1");
  assert.equal(envFileResult.envFileAudit?.files?.[0]?.pathRedacted, true);
  assert.equal(envFileResult.summary.envPreflight, "11/11 通过");
  const envFileMarkdown = readGeneratedFile(envFileResult.files.markdown);
  assert.match(envFileMarkdown, /生产 env 文件安全审计/);
  assert.doesNotMatch(envFileRun.stdout + envFileRun.stderr + envFileMarkdown, new RegExp(escapeRegExp(envFilePath)));
  assert.doesNotMatch(envFileRun.stdout + envFileRun.stderr + envFileMarkdown, /prod\.env/);
  assertNoSensitiveOutput(envFileRun.stdout + envFileRun.stderr + envFileMarkdown);

  writeFileSync(
    productionEnvSetupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "ready",
        ready: true,
        setupReady: true,
        checkedAt: new Date(Date.now() + 60_000).toISOString(),
        envFile: {
          path: envFilePath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );
  const setupEnvFileRun = await runRelease(baseUrl, {
    env: baseEnv,
    args: [
      "--use-production-env-setup-env-file",
      "--production-env-setup-json",
      productionEnvSetupJsonPath,
      "--field-evidence-manifest",
      readyManifestPath,
    ],
  });
  assert.equal(
    setupEnvFileRun.status,
    0,
    runFailureMessage("production env setup release candidate should be ready", setupEnvFileRun),
  );
  const setupEnvFileResult = JSON.parse(setupEnvFileRun.stdout);
  assert.equal(setupEnvFileResult.ready, true);
  assert.equal(setupEnvFileResult.envFileFromProductionSetup, true);
  assert.equal(setupEnvFileResult.envFileSource, "production_env_setup");
  assert.equal(setupEnvFileResult.summary.envFileFromProductionSetup, true);
  assert.equal(setupEnvFileResult.envPreflight?.safeguards?.envFileReadFromProductionSetup, true);
  assert.equal(setupEnvFileResult.envFileAudit?.safeguards?.envFilePathExposed, false);
  assert.equal(setupEnvFileResult.envFileAudit?.files?.[0]?.path, "env 文件 1");
  assert.equal(setupEnvFileResult.envFileAudit?.files?.[0]?.pathRedacted, true);
  const setupEnvFileMarkdown = readGeneratedFile(setupEnvFileResult.files.markdown);
  assert.match(setupEnvFileMarkdown, /生产 env 来源：生产 env setup 安全文件；复用 production env setup：是/);
  assert.doesNotMatch(
    setupEnvFileRun.stdout + setupEnvFileRun.stderr + setupEnvFileMarkdown,
    new RegExp(escapeRegExp(envFilePath)),
  );
  assert.doesNotMatch(setupEnvFileRun.stdout + setupEnvFileRun.stderr + setupEnvFileMarkdown, /prod\.env/);
  assertNoSensitiveOutput(setupEnvFileRun.stdout + setupEnvFileRun.stderr + setupEnvFileMarkdown);

  writeFileSync(
    unsafeEnvFilePath,
    [
      "# V1 release candidate unsafe template-like env-file fixture",
      ...Object.entries(productionEnv).map(([key, value]) => `${key}='${String(value).replace(/'/g, "'\\''")}'`),
      "",
    ].join("\n"),
  );
  const unsafeEnvFileRun = await runRelease(baseUrl, {
    env: baseEnv,
    args: ["--env-file", unsafeEnvFilePath, "--field-evidence-manifest", readyManifestPath],
  });
  assert.equal(
    unsafeEnvFileRun.status,
    2,
    runFailureMessage("template-like env-file release candidate should be blocked by file audit", unsafeEnvFileRun),
  );
  const unsafeEnvFileResult = JSON.parse(unsafeEnvFileRun.stdout);
  assert.equal(unsafeEnvFileResult.status, "blocked");
  assert.equal(unsafeEnvFileResult.ready, false);
  assert.equal(unsafeEnvFileResult.summary.label, "3/4 发布门禁通过");
  assert.equal(unsafeEnvFileResult.summary.envPreflight, "11/11 通过");
  assert.equal(unsafeEnvFileResult.envPreflight?.ready, true);
  assert.equal(unsafeEnvFileResult.envFileAudit?.included, true);
  assert.equal(unsafeEnvFileResult.envFileAudit?.ready, false);
  assert.ok(
    unsafeEnvFileResult.envFileAudit.blockingFindings.some((item) => item.key === "not-template-or-doc"),
    "template-like env-file should be called out as a blocking audit finding",
  );
  assert.ok(
    unsafeEnvFileResult.nextActions.some((item) => item.includes("生产 env 文件安全审计") || item.includes("模板")),
    "blocked unsafe env-file run should tell the operator to fix the file audit",
  );
  const unsafeEnvFileMarkdown = readGeneratedFile(unsafeEnvFileResult.files.markdown);
  assert.match(unsafeEnvFileMarkdown, /生产 env 文件安全审计/);
  assert.match(unsafeEnvFileMarkdown, /未直接使用模板/);
  assertNoSensitiveOutput(unsafeEnvFileRun.stdout + unsafeEnvFileRun.stderr + unsafeEnvFileMarkdown);

  const blockedArchiveRun = await runRelease(baseUrl, {
    env: baseEnv,
    allowBlockedExitZero: true,
  });
  assert.equal(
    blockedArchiveRun.status,
    0,
    runFailureMessage("archival blocked release candidate should support exit 0", blockedArchiveRun),
  );
  const blockedArchiveResult = JSON.parse(blockedArchiveRun.stdout);
  assert.equal(blockedArchiveResult.status, "blocked");
  assert.equal(blockedArchiveResult.ready, false);
  assert.ok(blockedArchiveResult.nextActions.some((item) => item.includes("生产环境变量")));
  assertNoSensitiveOutput(blockedArchiveRun.stdout + blockedArchiveRun.stderr);

  console.log("V1 release candidate check passed: blocked, ready, env-file audit, production env setup reuse, unsafe env-file block, archival blocked, field-evidence manifest, V1/V2 scope, reports, and redaction are covered.");
} finally {
  await closeServer(server);
}

function buildReadyFieldEvidenceManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.environment.apiBaseUrl = "http://127.0.0.1/api";
  manifest.environment.productionEnvPreflightReport = "RC-EVIDENCE-ENV-PREFLIGHT";
  manifest.environment.runtimeReadinessReport = "RC-EVIDENCE-RUNTIME-READINESS";
  manifest.environment.fieldAcceptanceReport = "RC-EVIDENCE-FIELD-ACCEPTANCE";
  for (const group of manifest.evidenceGroups) {
    for (const item of group.items) {
      item.status = "passed";
      item.evidenceRef = `RC-EVIDENCE-${group.key}-${item.key}`;
      item.notes = "release candidate positive fixture";
    }
  }
  for (const signoff of manifest.signoffs) {
    signoff.status = "signed";
    signoff.signer = `${signoff.role}负责人`;
    signoff.signedAt = "2026-07-04T10:30:00+08:00";
    signoff.notes = "release candidate positive fixture";
  }
  manifest.v1V2BoundaryConfirmed.status = "confirmed";
  manifest.v1V2BoundaryConfirmed.confirmedBy = "技术/管理负责人";
  manifest.v1V2BoundaryConfirmed.confirmedAt = "2026-07-04T10:30:00+08:00";
  return manifest;
}

async function preparePositiveReadiness(baseUrl) {
  const labelDevices = await getJson(baseUrl, "/print-devices?documentType=express_ltl_label");
  const labelDevice = labelDevices.items?.find((device) => device.printDeviceId === "PRN-LABEL-A");
  const dotDevices = await getJson(baseUrl, "/print-devices?documentType=delivery_note");
  const dotDevice = dotDevices.items?.find((device) => device.printDeviceId === "PRN-DOT-A");
  assert.ok(labelDevice, "positive release candidate setup missed label printer");
  assert.ok(dotDevice, "positive release candidate setup missed dot-matrix printer");
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
    recordId: "PDQA-V1-RC-LABEL-A",
    printDeviceId: "PRN-LABEL-A",
    documentType: "express_ltl_label",
    deviceLabel: "标签机A",
    driverLabel: "Generic 203dpi Label",
    paperLabel: "80x60 热敏标签",
  }));
  await postJson(baseUrl, "/print-devices/PRN-DOT-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-V1-RC-DOT-A",
    printDeviceId: "PRN-DOT-A",
    documentType: "delivery_note",
    deviceLabel: "针式打印机A",
    driverLabel: "Generic Dot Matrix",
    paperLabel: "连续二联针式纸",
  }));
  const driverTasks = await getDriverJson(baseUrl, "/driver/delivery-tasks?pageSize=1");
  const driverTask = driverTasks.items?.[0];
  assert.ok(driverTask?.fulfillmentId, "positive release candidate setup missed driver delivery task");
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
    checkedAt: "2026-07-04T10:20:00.000Z",
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
    note: "V1 release candidate positive printer field check",
  };
}

function buildPassedDriverDeviceFieldTest({ fulfillmentId, orderLineId, expectedPackageId }) {
  return {
    recordId: `DQA-V1-RC-${fulfillmentId}`,
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
      sampleId: `DPLS-V1-RC-${fulfillmentId}`,
      fulfillmentId,
      expectedPackageId,
      scannedText: expectedPackageId,
      matchedPackageId: expectedPackageId,
      method: "native_sdk",
      result: "matched",
      message: "原生扫码 SDK 已扫真实纸质包裹标签",
      checkedAt: "2026-07-04T10:24:59.000Z",
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
    note: "V1 release candidate positive driver native shell check",
  };
}

function runRelease(baseUrl, options = {}) {
  const args = [
    releaseScript,
    "--api-base-url",
    baseUrl,
    "--operator-id",
    options.operatorId || "U-OFFICE-A",
    "--driver-operator-id",
    options.driverOperatorId || "U-DRIVER-A",
    "--output-dir",
    outputRoot,
    ...(options.args || []),
  ];
  if (options.json !== false) args.push("--json");
  if (options.allowBlockedExitZero) args.push("--allow-blocked-exit-zero");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("release candidate process timed out after 40000ms"));
    }, 40000);
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
  for (const value of sensitiveValues) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)), `output leaked sensitive value: ${value}`);
  }
  assert.doesNotMatch(output, new RegExp(escapeRegExp(storageRoot)), "output leaked storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(spoolRoot)), "output leaked spool root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(process.execPath)), "output leaked node command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(printCommandBridgeScript)), "output leaked bridge command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fakeCupsStatusScript)), "output leaked fake CUPS command path");
  assert.doesNotMatch(output, /pass@prod-db/, "output leaked database credentials");
  assert.doesNotMatch(output, /SUPER_SECRET_VALUE/, "output leaked object-storage secret");
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
