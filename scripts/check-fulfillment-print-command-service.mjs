import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFulfillmentPrintCommandService } from "../server/services/fulfillmentPrintCommandService.mjs";

const fixedNow = "2026-07-11T11:00:00.000Z";

{
  const harness = createHarness({ fulfillments: [] });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-MISSING",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.notFound, true);
}

{
  const harness = createHarness({ printDevices: [] });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printAction: "first_print" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "PRINT_DEVICE_NOT_CONFIGURED");
}

{
  const harness = createHarness({
    printDevices: [
      createPrintDevice({
        supportedDocumentTypes: ["delivery_note"],
        defaultDocumentTypes: ["delivery_note"],
      }),
    ],
  });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printDeviceId: "PRN-001", printAction: "first_print" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.statusCode, 422);
  assert.equal(result.code, "PRINT_DEVICE_UNSUPPORTED_DOCUMENT");
}

{
  const harness = createHarness({
    printDevices: [createPrintDevice({ driverMode: "preview_only" })],
  });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: {
      printDeviceId: "PRN-001",
      printAction: "preview",
      operatorId: "U-SPOOFED",
      idempotencyKey: "preview-001",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.printRecord.status, "previewed");
  assert.equal(result.printRecord.submittedAt, "");
  assert.equal(result.printJob.jobStatus, "preview_only");
  assert.equal(result.physicalPrintConfirmed, false);
  assert.equal(result.nextStatus, "待打印标签");
  assert.equal(harness.fulfillmentCalls.at(-1).idempotencyKey, "preview-001");
  assert.equal(harness.fulfillmentCalls.at(-1).operationLog.action, "print_fulfillment");
  assert.equal(harness.fulfillmentCalls.at(-1).operationLog.operatorId, "U-OFFICE-A");
  assert.equal(harness.fulfillmentCalls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(harness.printJobCalls.at(-1).operationLog.action, "create_print_job");
  assert.equal(harness.printJobCalls.at(-1).operationLog.operatorId, "U-OFFICE-A");
  assert.equal(harness.printJobCalls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");
}

{
  const harness = createHarness({ printDevices: [createPrintDevice()] });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: {
      printDeviceId: "PRN-001",
      printAction: "first_print",
      packageIds: ["PKG-001"],
      paperNo: "NO-001",
      operatorId: "U-SPOOFED",
      idempotencyKey: "print-001",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.printRecord.status, "submitted");
  assert.equal(result.printRecord.submittedAt, fixedNow);
  assert.equal(result.printJob.jobStatus, "queued");
  assert.equal(result.printJob.queuedAt, fixedNow);
  assert.deepEqual(result.printJob.payload.request.packageIds, ["PKG-001"]);
  assert.equal(result.printJob.payload.request.paperNo, "NO-001");
  assert.equal(result.physicalPrintConfirmed, false);

  const duplicate = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printDeviceId: "PRN-001", printAction: "first_print" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.code, "ACTIVE_PRINT_RECORD_EXISTS");
}

{
  const activeRecord = createPrintRecord({ status: "printed" });
  const harness = createHarness({ printDevices: [createPrintDevice()], printRecords: [activeRecord] });
  const missingPrevious = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printAction: "reprint", printDeviceId: "PRN-001" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(missingPrevious.code, "REPRINT_REQUIRES_PREVIOUS_PRINT_RECORD");

  const notVoided = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printAction: "reprint", printDeviceId: "PRN-001", previousPrintRecordId: "PR-OLD" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(notVoided.statusCode, 409);
  assert.equal(notVoided.code, "REPRINT_REQUIRES_VOIDED_RECORD");

  harness.workspace.printRecords[0] = { ...activeRecord, status: "voided" };
  const reprinted = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: {
      printAction: "reprint",
      printDeviceId: "PRN-001",
      previousPrintRecordId: "PR-OLD",
      reprintReason: "paper jam",
      operatorId: "U-SPOOFED",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(reprinted.printRecord.status, "reprint_submitted");
  assert.equal(reprinted.printRecord.previousPrintRecordId, "PR-OLD");
  assert.equal(reprinted.printRecord.reprintReason, "paper jam");
}

{
  const harness = createHarness({ printRecords: [createPrintRecord({ status: "submitted" })] });
  const notVoidable = await harness.service.voidPrintRecord({
    workspace: harness.workspace,
    printRecordId: "PR-OLD",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(notVoidable.statusCode, 409);
  assert.equal(notVoidable.code, "PRINT_RECORD_NOT_VOIDABLE");

  harness.workspace.printRecords[0] = createPrintRecord({ status: "printed" });
  const voided = await harness.service.voidPrintRecord({
    workspace: harness.workspace,
    printRecordId: "PR-OLD",
    body: { operatorId: "U-SPOOFED", voidReason: "content_changed", idempotencyKey: "void-001" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(voided.printRecord.status, "voided");
  assert.equal(voided.printRecord.voidReason, "content_changed");
  assert.equal(voided.printRecord.voidedAt, fixedNow);
  assert.equal(voided.nextStatus, "待打印标签");
  assert.equal(harness.fulfillmentCalls.at(-1).idempotencyKey, "void-001");
  assert.equal(harness.fulfillmentCalls.at(-1).operationLog.action, "void_print_record");
  assert.equal(harness.fulfillmentCalls.at(-1).operationLog.operatorId, "U-OFFICE-A");
  assert.equal(harness.fulfillmentCalls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");
}

{
  const orphanRecord = createPrintRecord({ targetType: "other", targetId: "OTHER-001", status: "printed" });
  const productionHarness = createHarness({ printRecords: [orphanRecord], production: true });
  const blocked = await productionHarness.service.voidPrintRecord({
    workspace: productionHarness.workspace,
    printRecordId: "PR-OLD",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.code, "PRINT_RECORD_PERSISTENCE_REQUIRED");
  assert.equal(productionHarness.workspace.printRecords[0].status, "printed");

  const demoHarness = createHarness({ printRecords: [orphanRecord] });
  const localVoid = await demoHarness.service.voidPrintRecord({
    workspace: demoHarness.workspace,
    printRecordId: "PR-OLD",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(localVoid.printRecord.status, "voided");
  assert.equal(demoHarness.workspace.operationLogs.length, 1);
}

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.match(apiServerSource, /createFulfillmentPrintCommandService/);
for (const embeddedFunction of [
  "buildFulfillmentPrintRecord",
  "buildPrintJobRecord",
  "resolvePrintDeviceForDocument",
  "validateFulfillmentPrintRequest",
]) {
  assert.doesNotMatch(apiServerSource, new RegExp(`function ${embeddedFunction}\\b`));
}

console.log("Fulfillment print command service checks passed: device gates, preview, queueing, void/reprint, and production persistence are isolated.");

function createHarness({
  fulfillments = [createFulfillment()],
  printRecords = [],
  printDevices = [createPrintDevice()],
  production = false,
} = {}) {
  const fulfillmentCalls = [];
  const printJobCalls = [];
  let logSequence = 0;
  const workspace = {
    runtimeConfig: { mode: production ? "production" : "test", production },
    fulfillments: fulfillments.map((item) => structuredClone(item)),
    printRecords: printRecords.map((item) => structuredClone(item)),
    printJobs: [],
    printDevices: printDevices.map((item) => structuredClone(item)),
    operationLogs: [],
    orderLines: [{ id: "OL-001", orderLineId: "OL-001", customerId: "C-001", qty: 1500 }],
    customers: [{ id: "C-001", name: "白鲸自营店" }],
    printDeviceRepository: {
      async listPrintDevices({ filters = {} }) {
        return workspace.printDevices.filter((device) => !filters.status || device.status === filters.status);
      },
      async getDefaultPrintDevice({ documentType }) {
        return workspace.printDevices.find(
          (device) => device.status === "active" && device.defaultDocumentTypes.includes(documentType),
        ) ?? null;
      },
    },
    fulfillmentActionTransactionRepository: {
      async recordFulfillmentAction(input) {
        fulfillmentCalls.push(input);
        workspace.printRecords = upsert(workspace.printRecords, input.printRecord, "printRecordId");
        return {
          fulfillment: input.fulfillment,
          printRecord: input.printRecord,
          operationLogId: input.operationLog.id,
        };
      },
    },
    printJobRepository: {
      async createPrintJob(input) {
        printJobCalls.push(input);
        workspace.printJobs.push(input.printJob);
        return { printJob: input.printJob, operationLogId: input.operationLog.id };
      },
    },
  };
  const service = createFulfillmentPrintCommandService({
    now: () => new Date(fixedNow),
    buildFulfillmentActionRecord(_workspace, fulfillment, input) {
      return { ...fulfillment, fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id, actualQty: input.actualQty };
    },
    buildFulfillmentPrintTemplate(input) {
      return {
        templateId: input.printRecord.templateId,
        documentType: "express_ltl_label",
        fulfillmentId: input.fulfillment.id,
        customerName: input.customer.name,
      };
    },
    buildOperationLog(_workspace, input) {
      logSequence += 1;
      return { id: `LOG-${logSequence}`, ...input, occurredAt: fixedNow, createdAt: fixedNow };
    },
    buildPrintDeviceSnapshot(device) {
      return device ? structuredClone(device) : null;
    },
    getDocumentType() {
      return "express_ltl_label";
    },
    getTemplateId() {
      return "tpl-express-label";
    },
  });
  return { service, workspace, fulfillmentCalls, printJobCalls };
}

function createFulfillment(overrides = {}) {
  return {
    id: "F-001",
    fulfillmentId: "F-001",
    customerId: "C-001",
    orderLineId: "OL-001",
    method: "快递快运",
    status: "待打印标签",
    qty: 1500,
    actualQty: 1500,
    ...overrides,
  };
}

function createPrintDevice(overrides = {}) {
  const driverMode = overrides.driverMode ?? "system_printer";
  return {
    printDeviceId: "PRN-001",
    name: "标签机 A",
    status: "active",
    supportedDocumentTypes: ["express_ltl_label"],
    defaultDocumentTypes: ["express_ltl_label"],
    settings: { driverMode },
    ...overrides,
  };
}

function createPrintRecord(overrides = {}) {
  return {
    printRecordId: "PR-OLD",
    targetType: "fulfillment",
    targetId: "F-001",
    status: "printed",
    printAction: "first_print",
    ...overrides,
  };
}

function upsert(rows, record, key) {
  if (!record) return rows;
  const index = rows.findIndex((item) => item[key] === record[key]);
  if (index < 0) return [...rows, record];
  return rows.map((item, itemIndex) => (itemIndex === index ? record : item));
}
