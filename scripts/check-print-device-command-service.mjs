import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPrintDeviceCommandService } from "../server/services/printDeviceCommandService.mjs";

const fixedNow = "2026-07-11T12:00:00.000Z";

{
  const harness = createHarness();
  const created = await harness.service.upsertPrintDevice({
    workspace: harness.workspace,
    body: {
      name: "新标签机",
      operatorId: "U-SPOOFED",
      status: "active",
      idempotencyKey: "device-upsert-001",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.match(created.printDevice.printDeviceId, /^PRN-[A-F0-9]{12}$/);
  assert.equal(created.printDevice.createdAt, fixedNow);
  assert.equal(created.printDevice.updatedBy, "U-OFFICE-A");
  assert.equal(harness.deviceWriteCalls.at(-1).idempotencyKey, "device-upsert-001");
  assert.equal(harness.deviceWriteCalls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(harness.deviceWriteCalls.at(-1).operationLog.action, "upsert_print_device");
  assert.equal(harness.deviceWriteCalls.at(-1).operationLog.operatorId, "U-OFFICE-A");
}

{
  const harness = createHarness();
  const missing = await harness.service.updatePrintDeviceDriverMode({
    workspace: harness.workspace,
    printDeviceId: "PRN-MISSING",
    body: { driverMode: "system_printer" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(missing.notFound, true);
  assert.equal(missing.code, "PRINT_DEVICE_NOT_FOUND");

  const invalid = await harness.service.updatePrintDeviceDriverMode({
    workspace: harness.workspace,
    printDeviceId: "PRN-001",
    body: { driverMode: "unsafe_driver" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.code, "INVALID_PRINT_DEVICE_DRIVER_MODE");

  const updated = await harness.service.updatePrintDeviceDriverMode({
    workspace: harness.workspace,
    printDeviceId: "PRN-001",
    body: { driverMode: "system_printer", reason: "field setup", idempotencyKey: "driver-mode-001" },
    operatorId: "U-TECH-A",
  });
  assert.equal(updated.previousDriverMode, "preview_only");
  assert.equal(updated.driverMode, "system_printer");
  assert.equal(updated.printDevice.settings.driverMode, "system_printer");
  assert.equal(updated.printDevice.updatedBy, "U-TECH-A");
  assert.equal(harness.deviceWriteCalls.at(-1).operationLog.operatorId, "U-TECH-A");
}

{
  const harness = createHarness();
  const mismatch = await harness.service.recordPrinterDeviceFieldTest({
    workspace: harness.workspace,
    printDeviceId: "PRN-001",
    body: { printDeviceId: "PRN-OTHER" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(mismatch.statusCode, 422);
  assert.equal(mismatch.code, "VALIDATION_ERROR");

  const missingJob = await harness.service.recordPrinterDeviceFieldTest({
    workspace: harness.workspace,
    printDeviceId: "PRN-001",
    body: { printJobId: "PJ-MISSING" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(missingJob.notFound, true);
  assert.equal(missingJob.code, "PRINT_JOB_NOT_FOUND");

  harness.workspace.printJobs.push({
    printJobId: "PJ-WRONG-DEVICE",
    printDeviceId: "PRN-OTHER",
    documentType: "express_ltl_label",
  });
  const wrongDevice = await harness.service.recordPrinterDeviceFieldTest({
    workspace: harness.workspace,
    printDeviceId: "PRN-001",
    body: { printJobId: "PJ-WRONG-DEVICE" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(wrongDevice.statusCode, 422);
  assert.equal(wrongDevice.code, "VALIDATION_ERROR");
}

{
  const harness = createHarness();
  const recorded = await harness.service.recordPrinterDeviceFieldTest({
    workspace: harness.workspace,
    printDeviceId: "PRN-001",
    body: {
      printJobId: "PJ-001",
      operatorId: "UNTRUSTED-BODY-OPERATOR",
      operatorName: "办公室A",
      checks: [
        { key: "sample_print", status: "passed" },
        { key: "paper_alignment", status: "passed" },
        { key: "barcode_scan", status: "passed" },
      ],
      evidence: {
        samplePrintReference: "sample-001",
        barcodeScanText: "F-001-PKG-001",
      },
      idempotencyKey: "printer-field-test-001",
    },
    operatorId: "U-TECH-A",
  });
  assert.equal(recorded.record.printDeviceId, "PRN-001");
  assert.equal(recorded.record.printJobId, "PJ-001");
  assert.equal(recorded.record.documentType, "express_ltl_label");
  assert.equal(recorded.record.operatorId, "U-TECH-A");
  assert.equal(recorded.record.deviceLabel, "标签机 A");
  assert.equal(recorded.record.driverLabel, "Generic Label Driver");
  assert.equal(recorded.record.paperLabel, "76x50mm");
  assert.equal(recorded.record.checkedAt, fixedNow);
  assert.match(recorded.record.recordId, /^PDQA-20260711120000-PRN-001$/);
  assert.equal(harness.fieldTestCalls.at(-1).idempotencyKey, "printer-field-test-001");
  assert.equal(harness.fieldTestCalls.at(-1).operationLog.operatorId, "U-TECH-A");
}

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.match(apiServerSource, /createPrintDeviceCommandService/);
for (const embeddedFunction of [
  "normalizePrinterDeviceFieldTestApiRecord",
  "getPrintDevicePaperLabel",
  "normalizeOfficePrintDeviceDriverMode",
]) {
  assert.doesNotMatch(apiServerSource, new RegExp(`function ${embeddedFunction}\\b`));
}

console.log("Print device command service checks passed: maintenance, driver mode, QA ownership, identity, and idempotency are isolated.");

function createHarness() {
  const deviceWriteCalls = [];
  const fieldTestCalls = [];
  let logSequence = 0;
  const workspace = {
    printDevices: [
      {
        printDeviceId: "PRN-001",
        name: "标签机 A",
        status: "active",
        connectionType: "system_printer",
        driverName: "Generic Label Driver",
        paperWidthMm: 76,
        paperHeightMm: 50,
        settings: { driverMode: "preview_only" },
      },
    ],
    printJobs: [
      {
        printJobId: "PJ-001",
        printDeviceId: "PRN-001",
        documentType: "express_ltl_label",
      },
    ],
    printerDeviceFieldTests: [],
    operationLogs: [],
    printDeviceRepository: {
      async listPrintDevices() {
        return workspace.printDevices;
      },
      async upsertPrintDevice(input) {
        deviceWriteCalls.push(input);
        workspace.printDevices = upsert(workspace.printDevices, input.printDevice, "printDeviceId");
        return { printDevice: input.printDevice, operationLogId: input.operationLog.id };
      },
    },
    printJobRepository: {
      async listPrintJobs() {
        return workspace.printJobs;
      },
    },
    printerDeviceFieldTestRepository: {
      async recordPrinterDeviceFieldTest(input) {
        fieldTestCalls.push(input);
        workspace.printerDeviceFieldTests = upsert(workspace.printerDeviceFieldTests, input.record, "recordId");
        workspace.printDevices = workspace.printDevices.map((device) =>
          device.printDeviceId === input.record.printDeviceId
            ? { ...device, latestFieldTestRecord: input.record }
            : device,
        );
        return { record: input.record, operationLogId: input.operationLog.id };
      },
    },
  };
  const service = createPrintDeviceCommandService({
    now: () => new Date(fixedNow),
    buildOperationLog(_workspace, input) {
      logSequence += 1;
      return { id: `LOG-${logSequence}`, ...input, occurredAt: fixedNow, createdAt: fixedNow };
    },
  });
  return { service, workspace, deviceWriteCalls, fieldTestCalls };
}

function upsert(rows, record, key) {
  const index = rows.findIndex((item) => item[key] === record[key]);
  if (index < 0) return [...rows, record];
  return rows.map((item, itemIndex) => (itemIndex === index ? record : item));
}
