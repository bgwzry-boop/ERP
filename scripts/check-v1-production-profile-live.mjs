import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { buildDefaultPrintDevices } from "../server/printDeviceRepository.mjs";
import {
  v1PersistencePostgresRepositoryOptionKeys,
  v1PersistenceRepositoryObjectKeys,
  v1PersistenceStorageObjectKeys,
} from "../server/v1PersistenceProfile.mjs";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";

const dockerImage = process.env.ERP_POSTGRES_DOCKER_IMAGE || "postgres:16-alpine";
const containerName = `erp-v1-profile-live-${process.pid}-${Date.now()}`;
const bucketName = "erp-v1-production-profile-live";
const objectStorageKeyPrefix = "v1-production-profile-live";
const objectStorageAccessKeyId = "ERP_V1_PROFILE_LIVE_AKID";
const objectStorageSecretAccessKey = "ERP_V1_PROFILE_LIVE_SECRET_SHOULD_NOT_LEAK";
const runnerScript = new URL("./run-v1-readiness-check.mjs", import.meta.url).pathname;
const printCommandBridgeScript = new URL("./print-command-bridge.mjs", import.meta.url).pathname;
const fakeCupsStatusScript = new URL("./fake-cups-lpstat.mjs", import.meta.url).pathname;
const fieldGateStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-profile-field-gates");
const fieldGateSpoolRoot = join(fieldGateStorageRoot, "spool");

let apiServer = null;
const objectStorageServer = createFakeS3CompatibleServer({ bucketName });

try {
  assertDockerAvailable();
  startPostgresContainer();
  await waitForPostgres();
  applyMigrations();
  seedMinimalRuntimeUsers();

  await listen(objectStorageServer.server);
  const objectStorageEndpoint = `http://127.0.0.1:${objectStorageServer.server.address().port}`;
  const objectStorageOptions = {
    provider: "s3_compatible",
    endpoint: objectStorageEndpoint,
    bucket: bucketName,
    region: "cn-v1-profile-live",
    accessKeyId: objectStorageAccessKeyId,
    secretAccessKey: objectStorageSecretAccessKey,
    keyPrefix: objectStorageKeyPrefix,
    forcePathStyle: true,
  };

  apiServer = createApiServer({
    v1PersistenceProfile: {
      repositoryMode: "postgres",
      fileStorageMode: "object_storage",
      queryJson,
      objectStorageOptions,
    },
  });
  await listen(apiServer);
  const apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}/api`;

  await checkHealthProfile(apiBaseUrl);
  await checkPostgresBackedReadRoutes(apiBaseUrl);
  await checkSystemPersistenceReadiness(apiBaseUrl);
  await checkAttachmentObjectStorageReadiness(apiBaseUrl, objectStorageEndpoint);
  await checkTopLevelReadinessRunner(apiBaseUrl);

  await closeServer(apiServer);
  apiServer = null;
  seedMinimalFieldGateBusinessRows();
  prepareFieldGateLocalStorage();

  apiServer = createApiServer({
    v1PersistenceProfile: {
      repositoryMode: "postgres",
      fileStorageMode: "object_storage",
      queryJson,
      objectStorageOptions,
    },
    printDriverAdapterOptions: {
      systemPrinterEnabled: true,
      systemPrinterAdapterKind: "command_bridge",
      systemPrinterCommand: process.execPath,
      systemPrinterCommandArgs: [
        printCommandBridgeScript,
        "--storage-root",
        fieldGateStorageRoot,
        "--cups-status-command",
        process.execPath,
        "--cups-status-args-json",
        JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
      ],
      commandBridgeSpoolDir: fieldGateSpoolRoot,
      allowedPrinterNames: ["PRN-LABEL-A", "PRN-DOT-A", "标签机A", "针式打印机A"],
    },
  });
  await listen(apiServer);
  const fieldGateApiBaseUrl = `http://127.0.0.1:${apiServer.address().port}/api`;
  await checkAutomatedFieldGateReadiness(fieldGateApiBaseUrl);

  console.log(
    "V1 production profile live check passed: PostgreSQL repository profile, object-storage file profile, system persistence readiness, attachment V1 readiness, baseline 7/11 field-gate blocking, and automated 11/11 readiness evidence boundaries are covered.",
  );
} finally {
  if (apiServer) await closeServer(apiServer);
  await closeServer(objectStorageServer.server);
  stopPostgresContainer();
}

async function checkHealthProfile(apiBaseUrl) {
  const health = await getJson(apiBaseUrl, "/health");
  const seed = health.seed ?? {};
  assert.equal(health.status, "ok");
  assert.equal(seed.v1PersistenceProfile?.repositoryProfile, "postgres");
  assert.equal(seed.v1PersistenceProfile?.fileStorageProfile, "object_storage");
  assert.equal(
    seed.v1PersistenceProfile?.postgresRepositoryDefaultsApplied,
    v1PersistencePostgresRepositoryOptionKeys.length,
  );
  assert.equal(seed.v1PersistenceProfile?.objectStorageDefaultsApplied, 2);
  assert.equal(seed.v1PersistenceProfile?.unsupportedRepositoryCount, 0);
  assert.equal(seed.v1PersistenceProfile?.connectionStringExposed, false);
  assert.equal(seed.v1PersistenceProfile?.secretFieldsExposed, false);
  assert.equal(seed.attachmentRepository, "postgres");
  assert.equal(seed.attachmentAccessAuditRepository, "postgres");
  assert.equal(seed.orderPoolReadRepository, "postgres");
  assert.equal(seed.printDeviceRepository, "postgres");
  assert.equal(seed.masterDataImportReviewRepository, "postgres");
  assert.equal(seed.runtimeIdentityRepository, "postgres");
  assert.equal(seed.masterDataImportTransactionRepository, "postgres");
  assert.equal(seed.rawMaterialInboundRepository, "postgres");
  assert.equal(seed.rawMaterialSupplierStatementReviewRepository, "postgres");
  assert.equal(seed.attachmentObjectStorage, "object_storage");
  assert.equal(seed.statementExportObjectStorage, "object_storage");
  assert.equal(seed.coreWorkspaceReadRepository, "postgres");
  assert.equal(seed.todoActionRepository, "postgres");
  assert.equal(seed.inventoryCorrectionTransactionRepository, "postgres");
  assert.equal(seed.productionFinishedGoodsPhotoTransactionRepository, "postgres");
  assert.equal(seed.orderDraftRepository, "postgres");
  assertNoSensitiveOutput(JSON.stringify(health));
}

async function checkPostgresBackedReadRoutes(apiBaseUrl) {
  const orderLines = await getJson(apiBaseUrl, "/order-lines?pageSize=1");
  assert.equal(Array.isArray(orderLines.items), true);
  assert.equal(typeof orderLines.total, "number");
  const attachmentList = await getJson(
    apiBaseUrl,
    "/attachments?ownerType=statement&ownerId=ST-V1-PROFILE-LIVE-MISSING",
  );
  assert.equal(Array.isArray(attachmentList.items), true);
  assert.equal(typeof attachmentList.total, "number");
}

async function checkSystemPersistenceReadiness(apiBaseUrl) {
  const readiness = await getJson(apiBaseUrl, "/system/v1-readiness");
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.ready, true);
  assert.equal(readiness.summary?.label, "7/7 通过");
  assert.equal(readiness.summary?.blockingCount, 0);
  assert.equal(readiness.localPersistenceAcceptance?.accepted, false);
  assert.equal(readiness.safeguards?.requiresPostgresPersistence, true);
  assert.equal(readiness.safeguards?.localPersistenceAcceptedForV1, false);
  assert.equal(readiness.safeguards?.connectionStringExposed, false);
  assert.equal(readiness.safeguards?.localPathExposed, false);
  assert.equal(readiness.persistenceProfile?.repositoryProfile, "postgres");
  assert.equal(readiness.persistenceProfile?.fileStorageProfile, "object_storage");
  assert.equal(
    readiness.repositories?.length,
    v1PersistenceRepositoryObjectKeys.length + v1PersistenceStorageObjectKeys.length,
  );
  const orderDraftRepository = readiness.repositories?.find(
    (repository) => repository.key === "orderDraftRepository",
  );
  assert.equal(orderDraftRepository?.kind, "postgres");
  assert.equal(orderDraftRepository?.productionReady, true);
  const coreWorkspaceReadRepository = readiness.repositories?.find(
    (repository) => repository.key === "coreWorkspaceReadRepository",
  );
  assert.equal(coreWorkspaceReadRepository?.kind, "postgres");
  assert.equal(coreWorkspaceReadRepository?.productionReady, true);
  const todoActionRepository = readiness.repositories?.find(
    (repository) => repository.key === "todoActionRepository",
  );
  assert.equal(todoActionRepository?.kind, "postgres");
  assert.equal(todoActionRepository?.productionReady, true);
  const inventoryCorrectionTransactionRepository = readiness.repositories?.find(
    (repository) => repository.key === "inventoryCorrectionTransactionRepository",
  );
  assert.equal(inventoryCorrectionTransactionRepository?.kind, "postgres");
  assert.equal(inventoryCorrectionTransactionRepository?.productionReady, true);
  const productionFinishedGoodsPhotoTransactionRepository = readiness.repositories?.find(
    (repository) => repository.key === "productionFinishedGoodsPhotoTransactionRepository",
  );
  assert.equal(productionFinishedGoodsPhotoTransactionRepository?.kind, "postgres");
  assert.equal(productionFinishedGoodsPhotoTransactionRepository?.productionReady, true);
  const runtimeIdentityRepository = readiness.repositories?.find(
    (repository) => repository.key === "runtimeIdentityRepository",
  );
  assert.equal(runtimeIdentityRepository?.kind, "postgres");
  assert.equal(runtimeIdentityRepository?.productionReady, true);
  const rawMaterialInboundRepository = readiness.repositories?.find(
    (repository) => repository.key === "rawMaterialInboundRepository",
  );
  assert.equal(rawMaterialInboundRepository?.kind, "postgres");
  assert.equal(rawMaterialInboundRepository?.productionReady, true);
  const rawMaterialSupplierStatementReviewRepository = readiness.repositories?.find(
    (repository) => repository.key === "rawMaterialSupplierStatementReviewRepository",
  );
  assert.equal(rawMaterialSupplierStatementReviewRepository?.kind, "postgres");
  assert.equal(rawMaterialSupplierStatementReviewRepository?.productionReady, true);
  assert.equal(
    readiness.repositoryGroups?.some((group) =>
      group.repositories?.some((repository) => repository.key === "runtimeIdentityRepository"),
    ),
    true,
  );
  assert.equal(
    readiness.repositoryGroups?.some((group) =>
      group.repositories?.some((repository) => repository.key === "rawMaterialSupplierStatementReviewRepository"),
    ),
    true,
  );
  assert.equal(readiness.repositories?.some((item) => item.localKind), false);
  assert.equal(readiness.repositoryGroups?.every((group) => group.ready === true), true);
  assertNoSensitiveOutput(JSON.stringify(readiness));
}

async function checkAttachmentObjectStorageReadiness(apiBaseUrl, objectStorageEndpoint) {
  const attachmentText = "v1 production profile attachment object proof";
  const attachment = await postJson(apiBaseUrl, "/attachments", {
    ownerType: "statement",
    ownerId: "ST-V1-PROFILE-LIVE-001",
    fileType: "image",
    purpose: "payment_screenshot",
    fileName: "v1 production profile proof.png",
    contentRef: "v1-production-profile-live",
    uploadedBy: "U-OFFICE-A",
    mimeType: "image/png",
    fileSize: Buffer.byteLength(attachmentText),
    contentDataUrl: `data:image/png;base64,${Buffer.from(attachmentText, "utf8").toString("base64")}`,
  });
  const expectedDigest = createHash("sha256").update(attachmentText).digest("hex");
  assert.equal(attachment.storageProvider, "object_storage");
  assert.equal(
    attachment.storageKey,
    `${objectStorageKeyPrefix}/sha256/${expectedDigest.slice(0, 2)}/${expectedDigest}`,
  );
  assert.equal(attachment.contentDigest, expectedDigest);

  const permissionRead = await getText(apiBaseUrl, `/attachments/${attachment.attachmentId}/content`);
  assert.equal(permissionRead.status, 200);
  assert.equal(permissionRead.text, attachmentText);

  const access = await getJson(apiBaseUrl, `/attachments/${attachment.attachmentId}/access-url?ttlSeconds=300`);
  assert.equal(access.deliveryMode, "object_storage_signed_url");
  assert.equal(access.storageProvider, "object_storage");
  assert.match(access.accessUrl, new RegExp(`^${escapeRegExp(objectStorageEndpoint)}/${escapeRegExp(bucketName)}/`));
  assert.doesNotMatch(access.accessUrl, new RegExp(escapeRegExp(objectStorageSecretAccessKey)));

  const directRead = await fetchText(access.accessUrl);
  assert.equal(directRead.status, 200);
  assert.equal(directRead.text, attachmentText);

  const diagnosticsRequestCount = objectStorageServer.requests.length;
  const diagnostics = await getJson(apiBaseUrl, "/attachments/storage-diagnostics");
  assert.equal(diagnostics.status, "ok");
  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.storageKind, "object_storage");
  assert.equal(diagnostics.storageProvider, "object_storage");
  assert.equal(diagnostics.configured, true);
  assert.equal(diagnostics.writeOk, true);
  assert.equal(diagnostics.readOk, true);
  assert.equal(diagnostics.digestOk, true);
  assert.equal(diagnostics.cleanupOk, true);
  assert.equal(diagnostics.secretFieldsExposed, false);

  const diagnosticRequests = objectStorageServer.requests.slice(diagnosticsRequestCount);
  assert.deepEqual(diagnosticRequests.map((item) => item.method), ["PUT", "GET", "DELETE"]);
  assert.equal(objectStorageServer.objects.has(diagnostics.diagnosticStorageKey), false);

  const readiness = await getJson(apiBaseUrl, "/attachments/v1-readiness");
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.ready, true);
  assert.equal(readiness.summary?.label, "5/5 通过");
  assert.equal(readiness.summary?.blockingCount, 0);
  assert.equal(readiness.storageMode?.storageKind, "object_storage");
  assert.equal(readiness.storageMode?.objectStorageLive, true);
  assert.equal(readiness.storageMode?.localFsAcceptedForV1, false);
  assert.equal(readiness.safeguards?.diagnosticObjectCleanedUp, true);
  assert.equal(readiness.safeguards?.secretFieldsExposed, false);
  assertNoSensitiveOutput(JSON.stringify({ diagnostics, readiness }));
}

async function checkTopLevelReadinessRunner(apiBaseUrl) {
  const run = await runReadinessRunner(apiBaseUrl);
  assert.equal(run.status, 2, runFailureMessage("top-level V1 runner should remain blocked by field gates", run));
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.summary?.label, "7/11 通过");
  assert.equal(report.summary?.passedCount, 7);
  assert.equal(report.summary?.blockingCount, 4);
  assert.equal(report.criteria?.find((item) => item.key === "system-v1-persistence")?.status, "passed");
  assert.equal(report.criteria?.find((item) => item.key === "attachment-storage-diagnostics")?.status, "passed");
  assert.equal(report.criteria?.find((item) => item.key === "attachment-v1-readiness")?.status, "passed");
  assert.deepEqual(
    (report.blockingCriteria ?? []).map((item) => item.key),
    ["print-spool-diagnostics", "print-cups-diagnostics", "print-v1-readiness", "driver-v1-readiness"],
  );
  assert.equal(report.systemPersistence?.ready, true);
  assert.equal(report.attachmentReadiness?.ready, true);
  assert.equal(report.safeguards?.systemRequiresPostgresPersistence, true);
  assert.equal(report.safeguards?.attachmentRequiresObjectStorageLive, true);
  assertNoSensitiveOutput(run.stdout + run.stderr);
}

async function checkAutomatedFieldGateReadiness(apiBaseUrl) {
  await checkHealthProfile(apiBaseUrl);
  await checkSystemPersistenceReadiness(apiBaseUrl);
  await preparePositiveV1FieldGateEvidence(apiBaseUrl);

  const run = await runReadinessRunner(apiBaseUrl);
  assert.equal(run.status, 0, runFailureMessage("top-level V1 runner should pass with automated field-gate evidence", run));
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary?.label, "11/11 通过");
  assert.equal(report.summary?.passedCount, 11);
  assert.equal(report.summary?.blockingCount, 0);
  assert.equal(report.blockingCriteria?.length, 0);
  assert.equal(report.criteria?.every((item) => item.status === "passed"), true);
  assert.equal(report.systemPersistence?.ready, true);
  assert.equal(report.attachmentReadiness?.ready, true);
  assert.equal(report.attachmentReadiness?.storageMode?.objectStorageLive, true);
  assert.equal(report.spoolDiagnostics?.ready, true);
  assert.equal(report.cupsDiagnostics?.ready, true);
  assert.equal(report.printReadiness?.ready, true);
  assert.equal(report.printReadiness?.summary?.label, "9/9 通过");
  assert.equal(report.driverReadiness?.ready, true);
  assert.equal(report.driverReadiness?.summary?.label, "6/6 通过");
  assert.equal(report.driverReadiness?.packageLabelScanSample?.method, "native_sdk");
  assert.equal(report.driverReadiness?.nativeBridgeDiagnostics?.supportedCount, 2);
  assert.equal(report.safeguards?.nonPrinting, true);
  assert.equal(report.safeguards?.physicalPrinterCalled, false);
  assert.equal(report.safeguards?.printFileCreated, false);
  assert.equal(report.safeguards?.driverReadOnly, true);
  assert.equal(report.safeguards?.driverDeliveryStatusChanged, false);
  assertNoSensitiveOutput(run.stdout + run.stderr);

  const persistedEvidence = queryJson(`
SELECT json_build_object(
  'printerDeviceCount', (SELECT COUNT(*) FROM printer_devices WHERE id IN ('PRN-LABEL-A', 'PRN-DOT-A')),
  'printerDeviceSystemModeCount', (
    SELECT COUNT(*)
    FROM printer_devices
    WHERE id IN ('PRN-LABEL-A', 'PRN-DOT-A')
      AND settings_json->>'driverMode' = 'system_printer'
  ),
  'printerQaCount', (
    SELECT COUNT(*)
    FROM printer_device_field_tests
    WHERE id IN ('PDQA-V1-PROFILE-LABEL-A', 'PDQA-V1-PROFILE-DOT-A')
  ),
  'driverQaCount', (
    SELECT COUNT(*)
    FROM driver_device_field_tests
    WHERE id = 'DQA-V1-PROFILE-F002'
  ),
  'driverSampleResult', (
    SELECT summary_json->'packageLabelScanSample'->>'result'
    FROM driver_device_field_tests
    WHERE id = 'DQA-V1-PROFILE-F002'
  )
) AS result;
`);
  assert.equal(Number(persistedEvidence?.printerDeviceCount), 2);
  assert.equal(Number(persistedEvidence?.printerDeviceSystemModeCount), 2);
  assert.equal(Number(persistedEvidence?.printerQaCount), 2);
  assert.equal(Number(persistedEvidence?.driverQaCount), 1);
  assert.equal(persistedEvidence?.driverSampleResult, "matched");
}

async function preparePositiveV1FieldGateEvidence(apiBaseUrl) {
  const defaultDevices = buildDefaultPrintDevices("2026-07-04T10:00:00.000Z");
  for (const device of defaultDevices) {
    const saved = await postJson(apiBaseUrl, "/print-devices", {
      ...device,
      settings: {
        ...(device.settings ?? {}),
        driverMode: "system_printer",
      },
      createdBy: "U-OFFICE-A",
      updatedBy: "U-OFFICE-A",
      operatorId: "U-OFFICE-A",
      reason: "V1 production profile automated field-gate check",
    });
    assert.equal(saved.printDevice?.settings?.driverMode, "system_printer");
  }

  await postJson(apiBaseUrl, "/print-devices/PRN-LABEL-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-V1-PROFILE-LABEL-A",
    printDeviceId: "PRN-LABEL-A",
    documentType: "express_ltl_label",
    deviceLabel: "标签机A",
    driverLabel: "Generic 203dpi Label",
    paperLabel: "80x60 热敏标签",
  }));
  await postJson(apiBaseUrl, "/print-devices/PRN-DOT-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-V1-PROFILE-DOT-A",
    printDeviceId: "PRN-DOT-A",
    documentType: "delivery_note",
    deviceLabel: "针式打印机A",
    driverLabel: "Generic Dot Matrix",
    paperLabel: "连续二联针式纸",
  }));

  const driverTasks = await getDriverJson(apiBaseUrl, "/driver/delivery-tasks?pageSize=3");
  const driverTask = driverTasks.items?.find((item) => item.fulfillmentId === "F002") ?? driverTasks.items?.[0];
  assert.ok(driverTask?.fulfillmentId, "automated field-gate setup missed a PostgreSQL driver task");
  const expectedPackageId = driverTask.packageChecklist?.[0]?.packageId || `${driverTask.fulfillmentId}-PKG-1`;
  await postDriverJson(
    apiBaseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(driverTask.fulfillmentId)}/device-field-tests`,
    buildPassedDriverDeviceFieldTest({
      recordId: "DQA-V1-PROFILE-F002",
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
      samplePrintReference: `${recordId} automated sample evidence`,
      barcodeScanText: `${printDeviceId}-SAMPLE-CODE matched`,
      driverCallbackStatus: "spool completed -> printed",
      voidReprintReference: `${recordId}-VOID-REPRINT passed`,
      operatorAcceptance: "办公室A automated field-gate evidence accepted",
    },
    note: "V1 production profile automated print field-gate check",
  };
}

function buildPassedDriverDeviceFieldTest({ recordId, fulfillmentId, orderLineId, expectedPackageId }) {
  return {
    recordId,
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
      sampleId: `DPLS-V1-PROFILE-${fulfillmentId}`,
      fulfillmentId,
      expectedPackageId,
      scannedText: expectedPackageId,
      matchedPackageId: expectedPackageId,
      method: "native_sdk",
      result: "matched",
      message: "原生扫码 SDK 已扫自动化纸质包裹标签样本",
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
    note: "V1 production profile automated driver native shell field-gate check",
  };
}

function assertDockerAvailable() {
  const result = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("Docker is required for npm run v1-production-profile-live:check.");
  }
}

function startPostgresContainer() {
  runDocker([
    "run",
    "--rm",
    "--detach",
    "--name",
    containerName,
    "--env",
    "POSTGRES_DB=erp",
    "--env",
    "POSTGRES_USER=erp",
    "--env",
    "POSTGRES_PASSWORD=erp",
    dockerImage,
  ]);
}

async function waitForPostgres() {
  let lastOutput = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "erp", "-d", "erp"], {
      encoding: "utf8",
    });
    if (result.status === 0) return;
    lastOutput = result.stderr || result.stdout || `status ${result.status}`;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`PostgreSQL container did not become ready: ${lastOutput}`);
}

function applyMigrations() {
  const migrations = loadMigrationFiles();
  const { createdTables } = validateMigrationSet(migrations);
  runPsql(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`);

  for (const migration of migrations) {
    runPsql(
      [
        "BEGIN;",
        migration.sql.trim(),
        `INSERT INTO schema_migrations (id, filename, checksum) VALUES (${sqlLiteral(migration.id)}, ${sqlLiteral(
          migration.filename,
        )}, ${sqlLiteral(migration.checksum)});`,
        "COMMIT;",
      ].join("\n\n"),
    );
  }

  const tableCount = Number(
    runPsql(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
      { capture: true },
    ).trim(),
  );
  assert.ok(tableCount >= createdTables.size, `expected at least ${createdTables.size} migrated tables, got ${tableCount}`);
}

function seedMinimalRuntimeUsers() {
  runPsql(`
INSERT INTO users (id, login_name, display_name, department)
VALUES
  ('U-OFFICE-A', 'office.a', '办公室A', 'office'),
  ('U-DRIVER-A', 'driver.a', '司机A', 'driver'),
  ('U-PRINT-DRIVER-A', 'print.driver.a', '打印驱动服务账号A', 'system')
ON CONFLICT (id) DO UPDATE SET
  login_name = EXCLUDED.login_name,
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  updated_at = now();
`);
}

function seedMinimalFieldGateBusinessRows() {
  runPsql(`
INSERT INTO customers (id, biz_no, name, short_name, settlement_cycle, created_by)
VALUES
  ('C002', 'CUST-V1-PROFILE-002', '李四电商', '李四电商', '15天一结', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  biz_no = EXCLUDED.biz_no,
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  settlement_cycle = EXCLUDED.settlement_cycle,
  updated_at = now();

INSERT INTO original_orders (id, biz_no, customer_id, customer_snapshot, summary_status, created_by)
VALUES
  ('ORD-0629-002', 'ORD-0629-002', 'C002', '{"name":"李四电商"}'::jsonb, '已备货', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  customer_snapshot = EXCLUDED.customer_snapshot,
  summary_status = EXCLUDED.summary_status,
  updated_at = now();

INSERT INTO order_lines (
  id,
  biz_no,
  order_id,
  customer_id,
  product_name,
  order_type,
  size,
  bag_color,
  handle_type,
  style,
  original_qty,
  fulfillment_method,
  line_status,
  created_by
) VALUES (
  'ORD-0629-002-01',
  'ORD-0629-002-01',
  'ORD-0629-002',
  'C002',
  '服装店白袋',
  '现货有货',
  '25*32*10',
  '白色',
  '加长提',
  '空白袋',
  1200,
  '送货',
  '已备货',
  'U-OFFICE-A'
)
ON CONFLICT (id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  customer_id = EXCLUDED.customer_id,
  product_name = EXCLUDED.product_name,
  original_qty = EXCLUDED.original_qty,
  fulfillment_method = EXCLUDED.fulfillment_method,
  line_status = EXCLUDED.line_status,
  updated_at = now();

INSERT INTO fulfillment_records (
  id,
  biz_no,
  order_line_id,
  customer_id,
  customer_snapshot,
  method,
  expected_qty,
  actual_qty,
  status,
  created_by
) VALUES (
  'F002',
  'F002',
  'ORD-0629-002-01',
  'C002',
  '{"name":"李四电商"}'::jsonb,
  '送货',
  1200,
  1200,
  '已备货',
  'U-OFFICE-A'
)
ON CONFLICT (id) DO UPDATE SET
  order_line_id = EXCLUDED.order_line_id,
  customer_id = EXCLUDED.customer_id,
  expected_qty = EXCLUDED.expected_qty,
  actual_qty = EXCLUDED.actual_qty,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO driver_delivery_dispatches (
  id,
  biz_no,
  fulfillment_id,
  driver_id,
  route_date,
  route_batch_no,
  stop_sequence,
  dispatch_status,
  planned_departure_at,
  assigned_by,
  assigned_at,
  remark
) VALUES (
  'DDIS-V1-PROFILE-F002',
  'DDIS-V1-PROFILE-F002',
  'F002',
  'U-DRIVER-A',
  '2026-07-04',
  '虎门线-A',
  1,
  '已派单',
  '2026-07-04T08:30:00.000Z',
  'U-OFFICE-A',
  '2026-07-04T08:00:00.000Z',
  'V1 production profile automated field-gate delivery task'
)
ON CONFLICT (id) DO UPDATE SET
  driver_id = EXCLUDED.driver_id,
  route_date = EXCLUDED.route_date,
  route_batch_no = EXCLUDED.route_batch_no,
  stop_sequence = EXCLUDED.stop_sequence,
  dispatch_status = EXCLUDED.dispatch_status,
  planned_departure_at = EXCLUDED.planned_departure_at,
  assigned_by = EXCLUDED.assigned_by,
  assigned_at = EXCLUDED.assigned_at,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO packages (
  id,
  biz_no,
  order_line_id,
  fulfillment_id,
  package_seq,
  package_count,
  packed_qty,
  label_print_record_id,
  status,
  created_by
) VALUES
  ('PKG-V1-PROFILE-F002-1', 'PKG-V1-PROFILE-F002-1', 'ORD-0629-002-01', 'F002', 1, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-V1-PROFILE-F002-2', 'PKG-V1-PROFILE-F002-2', 'ORD-0629-002-01', 'F002', 2, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-V1-PROFILE-F002-3', 'PKG-V1-PROFILE-F002-3', 'ORD-0629-002-01', 'F002', 3, 3, 400, NULL, '已打印', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  fulfillment_id = EXCLUDED.fulfillment_id,
  package_seq = EXCLUDED.package_seq,
  package_count = EXCLUDED.package_count,
  packed_qty = EXCLUDED.packed_qty,
  label_print_record_id = EXCLUDED.label_print_record_id,
  status = EXCLUDED.status,
  updated_at = now();
`);
}

function prepareFieldGateLocalStorage() {
  rmSync(fieldGateStorageRoot, { recursive: true, force: true });
  mkdirSync(fieldGateSpoolRoot, { recursive: true });
}

function queryJson(sql, values = []) {
  const stdout = runPsql(renderPsqlQuery(sql, values), { capture: true });
  const jsonLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("{") || line.startsWith("[") || line === "null");
  if (!jsonLine || jsonLine === "null") return null;
  return JSON.parse(jsonLine);
}

function renderPsqlQuery(sql, values) {
  let rendered = String(sql ?? "");
  for (let index = values.length; index >= 1; index -= 1) {
    rendered = rendered.replace(
      new RegExp(`\\$${index}(?!\\d)`, "g"),
      sqlParameterLiteral(values[index - 1]),
    );
  }
  if (/\$\d+/.test(rendered)) throw new Error("The production-profile live query has unbound SQL parameters.");
  return rendered;
}

function sqlParameterLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (Array.isArray(value)) {
    if (!value.length) return "ARRAY[]::text[]";
    return `ARRAY[${value.map((item) => sqlLiteral(item)).join(", ")}]`;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return sqlLiteral(value);
}

function runPsql(sql, options = {}) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "--interactive",
      containerName,
      "psql",
      "-U",
      "erp",
      "-d",
      "erp",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--pset=footer=off",
    ],
    {
      input: sql,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `docker psql exited with status ${result.status}`);
  }
  return options.capture ? result.stdout : "";
}

function runDocker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `docker ${args.join(" ")} exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

function stopPostgresContainer() {
  spawnSync("docker", ["rm", "--force", containerName], { encoding: "utf8" });
}

function createFakeS3CompatibleServer({ bucketName: expectedBucket }) {
  const objects = new Map();
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const key = extractStorageKey({ pathname: url.pathname, expectedBucket });
      if (!key) {
        sendText(response, 404, "bucket or object key not found");
        return;
      }
      const method = String(request.method ?? "GET").toUpperCase();
      const requestRecord = {
        method,
        key,
        hasAuthorizationHeader: Boolean(request.headers.authorization),
        hasAmzDateHeader: Boolean(request.headers["x-amz-date"] || url.searchParams.get("X-Amz-Date")),
        hasPayloadHashHeader: Boolean(request.headers["x-amz-content-sha256"]),
        presigned: url.searchParams.has("X-Amz-Signature"),
      };
      requests.push(requestRecord);

      if (method === "PUT") {
        assert.equal(requestRecord.hasAuthorizationHeader, true, "PUT should include SigV4 authorization");
        assert.equal(requestRecord.hasAmzDateHeader, true, "PUT should include x-amz-date");
        assert.equal(requestRecord.hasPayloadHashHeader, true, "PUT should include x-amz-content-sha256");
        const body = await readBody(request);
        objects.set(key, {
          buffer: body,
          contentType: String(request.headers["content-type"] ?? "application/octet-stream"),
        });
        sendText(response, 200, "");
        return;
      }

      if (method === "GET") {
        assert.equal(
          requestRecord.hasAuthorizationHeader || requestRecord.presigned,
          true,
          "GET should be signed by header or presigned URL",
        );
        assert.equal(requestRecord.hasAmzDateHeader, true, "GET should include SigV4 date");
        const object = objects.get(key);
        if (!object) {
          sendText(response, 404, "object not found");
          return;
        }
        response.writeHead(200, {
          "content-type": object.contentType,
          "content-length": String(object.buffer.length),
          connection: "close",
        });
        response.end(object.buffer);
        return;
      }

      if (method === "DELETE") {
        assert.equal(requestRecord.hasAuthorizationHeader, true, "DELETE should include SigV4 authorization");
        assert.equal(requestRecord.hasAmzDateHeader, true, "DELETE should include x-amz-date");
        const existed = objects.delete(key);
        sendText(response, existed ? 204 : 404, "");
        return;
      }

      sendText(response, 405, "method not allowed");
    } catch (error) {
      sendText(response, 500, error?.message || "fake object storage error");
    }
  });
  return { server, objects, requests };
}

function extractStorageKey({ pathname, expectedBucket }) {
  const decodedPath = decodeURIComponent(String(pathname ?? ""));
  const prefix = `/${expectedBucket}/`;
  if (!decodedPath.startsWith(prefix)) return "";
  return decodedPath.slice(prefix.length).replace(/^\/+/, "");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function runReadinessRunner(apiBaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [runnerScript, "--api-base-url", apiBaseUrl, "--operator-id", "U-OFFICE-A", "--driver-operator-id", "U-DRIVER-A", "--json"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("V1 readiness runner timed out after 20000ms"));
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

function getJson(apiBaseUrl, path) {
  return fetchJson(`${apiBaseUrl}${path}`, {
    headers: {
      "x-erp-user-id": "U-OFFICE-A",
      connection: "close",
    },
  });
}

function getDriverJson(apiBaseUrl, path) {
  return fetchJson(`${apiBaseUrl}${path}`, {
    headers: {
      "x-erp-user-id": "U-DRIVER-A",
      connection: "close",
    },
  });
}

function postJson(apiBaseUrl, path, body) {
  return fetchJson(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-OFFICE-A",
      connection: "close",
    },
    body: JSON.stringify(body),
  });
}

function postDriverJson(apiBaseUrl, path, body) {
  return fetchJson(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-DRIVER-A",
      connection: "close",
    },
    body: JSON.stringify(body),
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

async function getText(apiBaseUrl, path) {
  return fetchText(`${apiBaseUrl}${path}`, {
    headers: {
      "x-erp-user-id": "U-OFFICE-A",
      connection: "close",
    },
  });
}

async function fetchText(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${url} request timed out after 10000ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    connection: "close",
  });
  response.end(body);
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    server.close(finish);
    server.closeIdleConnections?.();
    const timeout = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, 1000);
    timeout.unref?.();
  });
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, new RegExp(escapeRegExp(objectStorageAccessKeyId)), "output leaked object-storage access key id");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(objectStorageSecretAccessKey)), "output leaked object-storage secret");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(objectStorageServer.server.address()?.port ?? "")), "output leaked object-storage endpoint port");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fieldGateStorageRoot)), "output leaked field-gate storage root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fieldGateSpoolRoot)), "output leaked field-gate spool root");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(printCommandBridgeScript)), "output leaked print bridge command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fakeCupsStatusScript)), "output leaked fake CUPS command path");
  assert.doesNotMatch(output, /authorization/i, "output leaked authorization header text");
  assert.doesNotMatch(output, /x-amz-security-token/i, "output leaked session-token header text");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
