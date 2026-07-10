import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildListPrintDevicesQuery,
  buildListPrintDevicesSql,
  buildUpsertPrintDeviceTransactionQuery,
  buildUpsertPrintDeviceTransactionSql,
  createLocalPrintDeviceRepository,
  createPostgresPrintDeviceRepository,
} from "../server/printDeviceRepository.mjs";

checkLocalPrintDeviceRepository();
await checkPostgresPrintDeviceSqlBoundary();

console.log(
  "Print device repository check passed: default devices, local JSON persistence, and PostgreSQL device + operation log SQL are covered.",
);

function checkLocalPrintDeviceRepository() {
  const storageRoot = mkdtempSync(join(tmpdir(), "erp-print-device-check-"));
  try {
    const repository = createLocalPrintDeviceRepository({ storageRoot });
    const loaded = repository.loadState();
    assert.ok(loaded.printDevices.some((device) => device.printDeviceId === "PRN-LABEL-A"));
    assert.ok(loaded.printDevices.some((device) => device.defaultDocumentTypes.includes("outbound_slip")));
    const dotMatrixDevice = loaded.printDevices.find((device) => device.printDeviceId === "PRN-DOT-A");
    assert.equal(dotMatrixDevice?.name, "EPSON LQ-615KII 针式单据打印机");
    assert.equal(dotMatrixDevice?.settings?.model, "LQ-615KII");
    assert.equal(dotMatrixDevice?.settings?.printHeadPins, 24);
    assert.equal(dotMatrixDevice?.settings?.columnsAt10Cpi, 82);
    assert.equal(dotMatrixDevice?.settings?.recommendedCupsQueueName, "epson_lq_615kii_notes");
    assert.equal(dotMatrixDevice?.paperName, "二联二等分连续针式纸");
    assert.equal(dotMatrixDevice?.settings?.hostOperatingSystem, "Windows 11");
    assert.equal(dotMatrixDevice?.settings?.sampleDocumentType, "delivery_note");
    assert.equal(dotMatrixDevice?.settings?.systemPrinterNameKnown, false);
    assert.deepEqual(dotMatrixDevice?.settings?.officialContinuousPaperWidthRangeMm, [101.6, 254]);

    const workspace = { printDevices: loaded.printDevices, operationLogs: [] };
    const printDevice = buildPrintDevice({ name: "O'Brien 标签机" });
    const operationLog = buildOperationLog({ after: printDevice });

    const transaction = repository.upsertPrintDevice({ workspace, printDevice, operationLog });

    assert.equal(transaction.printDevice.printDeviceId, "PRN-CHECK-1");
    assert.equal(transaction.operationLogId, "LOG-PRINT-DEVICE-CHECK-1");
    assert.equal(workspace.operationLogs.length, 1);
    assert.equal(
      repository.listPrintDevices({ workspace, filters: { documentType: "express_ltl_label" } })[0].printDeviceId,
      "PRN-CHECK-1",
    );
    assert.equal(
      repository.getDefaultPrintDevice({ workspace, documentType: "express_ltl_label" }).printDeviceId,
      "PRN-CHECK-1",
    );

    const storePath = join(storageRoot, "metadata", "print-devices.json");
    assert.equal(existsSync(storePath), true);
    const savedJson = JSON.parse(readFileSync(storePath, "utf8"));
    assert.ok(savedJson.printDevices.some((device) => device.printDeviceId === "PRN-CHECK-1"));

    const reloadedState = createLocalPrintDeviceRepository({ storageRoot }).loadState();
    assert.equal(reloadedState.printDevices.find((device) => device.printDeviceId === "PRN-CHECK-1").paperWidthMm, 76);
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
}

async function checkPostgresPrintDeviceSqlBoundary() {
  const calls = [];
  const printDevice = buildPrintDevice({ name: "O'Brien 标签机" });
  const operationLog = buildOperationLog({ after: printDevice });
  const repository = createPostgresPrintDeviceRepository({
    postgresClient: {
      queryJson(text, values) {
        calls.push({ kind: "query", text, values });
        return [printDevice];
      },
      transactionJson(text, values) {
        calls.push({ kind: "transaction", text, values });
        return { printDevice, operationLogId: operationLog.id };
      },
    },
  });
  const workspace = { printDevices: [], operationLogs: [] };

  const transaction = await repository.upsertPrintDevice({ workspace, printDevice, operationLog });
  const listed = await repository.listPrintDevices({ filters: { documentType: "express_ltl_label", status: "active" } });

  assert.equal(transaction.printDevice.printDeviceId, "PRN-CHECK-1");
  assert.equal(transaction.operationLogId, "LOG-PRINT-DEVICE-CHECK-1");
  assert.equal(listed.length, 1);
  assert.equal(workspace.printDevices.length, 1);
  assert.equal(workspace.operationLogs.length, 1);

  const createCall = calls[0];
  assert.equal(createCall.kind, "transaction");
  assert.match(createCall.text, /^BEGIN;/);
  assert.match(createCall.text, /INSERT INTO printer_devices/);
  assert.match(createCall.text, /supported_document_types/);
  assert.match(createCall.text, /default_document_types/);
  assert.match(createCall.text, /settings_json/);
  assert.match(createCall.text, /INSERT INTO operation_logs/);
  assert.match(createCall.text, /COMMIT;/);
  assert.match(createCall.text, /\$\d+::text\[\]/);
  assert.doesNotMatch(createCall.text, /O''Brien/);
  assert.ok(createCall.values.includes("O'Brien 标签机"));

  const listCall = calls[1];
  assert.equal(listCall.kind, "query");
  assert.match(listCall.text, /FROM printer_devices/);
  assert.match(listCall.text, /status = \$1::text/);
  assert.match(listCall.text, /\$2::text = ANY\(supported_document_types\)/);
  assert.deepEqual(listCall.values, ["active", "express_ltl_label", "express_ltl_label", "express_ltl_label", 200]);

  const directCreateQuery = buildUpsertPrintDeviceTransactionQuery({ printDevice, operationLog });
  const directCreateSql = buildUpsertPrintDeviceTransactionSql({ printDevice, operationLog });
  assert.match(directCreateSql, /printer_devices/);
  assert.match(directCreateSql, /paper_width_mm/);
  assert.equal(directCreateQuery.text, directCreateSql);
  assert.ok(directCreateQuery.values.length > 25);

  const directListQuery = buildListPrintDevicesQuery({ documentType: "delivery_note", limit: 20 });
  const directListSql = buildListPrintDevicesSql({ documentType: "delivery_note", limit: 20 });
  assert.match(directListSql, /LIMIT \$4::integer/);
  assert.match(directListSql, /\$1::text = ANY\(supported_document_types\)/);
  assert.equal(directListQuery.text, directListSql);
  assert.deepEqual(directListQuery.values, ["delivery_note", "delivery_note", "delivery_note", 20]);
}

function buildPrintDevice(overrides = {}) {
  return {
    printDeviceId: "PRN-CHECK-1",
    bizNo: "PRN-CHECK-1",
    name: overrides.name ?? "测试标签机",
    deviceType: "label_printer",
    status: "active",
    connectionType: "system_printer",
    connectionUri: "system://test-label-printer",
    driverName: "Test 203dpi Label Driver",
    supportedDocumentTypes: ["express_ltl_label", "package_label"],
    defaultDocumentTypes: ["express_ltl_label"],
    paperWidthMm: 76,
    paperHeightMm: 50,
    paperName: "76x50 热敏标签",
    isContinuous: false,
    dpi: 203,
    defaultCopies: 1,
    darkness: 9,
    speed: 4,
    cutterEnabled: false,
    settings: {
      driverMode: "preview_only",
      calibration: "repository-check",
    },
    createdBy: "U-OFFICE-A",
    updatedBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
    updatedAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildOperationLog({ after }) {
  return {
    id: "LOG-PRINT-DEVICE-CHECK-1",
    targetType: "print_device",
    targetId: after.printDeviceId,
    action: "upsert_print_device",
    before: null,
    after,
    reason: "打印设备参数维护",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}
