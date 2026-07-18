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
  const harness = createHarness({ printDevices: [createPrintDevice()] });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printDeviceId: "PRN-001", printAction: "archive" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.statusCode, 422);
  assert.equal(result.code, "PRINT_ACTION_UNSUPPORTED");
  assert.equal(harness.fulfillmentCalls.length, 0, "unsupported print action must not create fulfillment writes");
  assert.equal(harness.printJobCalls.length, 0, "unsupported print action must not create print jobs");
}

{
  const harness = createHarness({ packages: [] });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printDeviceId: "PRN-001", printAction: "first_print" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "FULFILLMENT_PACKAGES_REQUIRED_FOR_LABEL_PRINT");
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
      packageIds: ["PKG-SPOOFED"],
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
  assert.equal(result.printRecord.fulfillmentRevision, 2);
  assert.deepEqual(result.printJob.payload.request.packageIds, ["PKG-001"]);
  assert.deepEqual(result.printRecord.packageSnapshot, [{ packageId: "PKG-001", revision: 1 }]);
  assert.equal(result.ignoredClientPackageIds, true);
  assert.equal(result.printJob.payload.request.paperNo, "NO-001");
  assert.equal(result.physicalPrintConfirmed, false);
  assert.equal(result.paperOutboundDocument, null, "package labels must not create a paper outbound document");

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
  const harness = createHarness({ production: true, atomicPrint: true });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printDeviceId: "PRN-001", printAction: "first_print", idempotencyKey: "atomic-print-001" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.printRecord.status, "submitted");
  assert.equal(result.printJob.jobStatus, "queued");
  assert.equal(harness.atomicPrintCalls.length, 1, "PostgreSQL prints must use the combined fulfillment print transaction");
  assert.equal(harness.fulfillmentCalls.length, 0, "PostgreSQL prints must not first commit an independent print record");
  assert.equal(harness.printJobCalls.length, 0, "PostgreSQL prints must not create a second standalone print-job transaction");
  assert.equal(harness.workspace.printRecords.length, 1);
  assert.equal(harness.workspace.printJobs.length, 1);
  assert.equal(harness.workspace.operationLogs.length, 2);
  assert.notEqual(
    harness.atomicPrintCalls[0].operationLog.id,
    harness.atomicPrintCalls[0].printJobOperationLog.id,
    "the combined transaction must retain separate fulfillment and print-job audit records",
  );
  assert.equal(harness.atomicPrintCalls[0].printJob.printRecordId, harness.atomicPrintCalls[0].printRecord.printRecordId);
  assert.equal(harness.atomicPrintCalls[0].printJobOperationLog.targetId, result.printJob.printJobId);
}

{
  const harness = createHarness({ production: true });
  const result = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: { printDeviceId: "PRN-001", printAction: "first_print" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "PRINT_TRANSACTION_PERSISTENCE_REQUIRED");
  assert.equal(harness.fulfillmentCalls.length, 0, "production must not fall back to a standalone print-record write");
  assert.equal(harness.printJobCalls.length, 0, "production must not create a standalone job after a blocked print record");
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
  const harness = createHarness({
    fulfillments: [createFulfillment({ status: "待确认拉走", printed: true })],
    printRecords: [createPrintRecord({ status: "printed", fulfillmentRevision: 1, packageSnapshot: [{ packageId: "PKG-001", revision: 1 }] })],
    packages: [createPackage({ status: "已打印标签", labelPrintRecordId: "PR-OLD", revision: 2 })],
  });
  const voided = await harness.service.voidPrintRecord({
    workspace: harness.workspace,
    printRecordId: "PR-OLD",
    body: { voidReason: "label_reprint_required", idempotencyKey: "void-current-label-001" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(voided.nextStatus, "待打印标签");
  assert.equal(voided.packages[0].status, "待打印标签");
  assert.equal(voided.packages[0].labelPrintRecordId, "");
  assert.equal(voided.packages[0].revision, 3);
}

{
  const paperOutboundDocument = {
    id: "POD-OLD",
    paperOutboundDocumentId: "POD-OLD",
    fulfillmentId: "F-001",
    printRecordId: "PR-OLD",
    documentType: "outbound_note",
    documentVersion: 1,
    status: "已交库房",
    revision: 2,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };
  const harness = createHarness({
    fulfillments: [createFulfillment({ status: "数量差异待处理", paperOutboundStatus: "已交库房", paperOutboundDocumentId: "POD-OLD" })],
    printRecords: [createPrintRecord({ status: "printed", documentType: "outbound_note" })],
    paperOutboundDocuments: [paperOutboundDocument],
    warehouseOutboundExecutions: [{
      warehouseOutboundExecutionId: "WEX-OLD",
      fulfillmentId: "F-001",
      paperOutboundDocumentId: "POD-OLD",
      result: "数量不符",
      actualQty: 1430,
    }],
  });
  const voided = await harness.service.voidPrintRecord({
    workspace: harness.workspace,
    printRecordId: "PR-OLD",
    body: { voidReason: "qty_changed" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(voided.printRecord.status, "voided");
  assert.equal(voided.paperOutboundDocument.status, "已作废");
  assert.equal(harness.workspace.paperOutboundDocuments[0].status, "已作废");

  const reprinted = await harness.service.printFulfillment({
    workspace: harness.workspace,
    fulfillmentId: "F-001",
    body: {
      printAction: "reprint",
      printDeviceId: "PRN-001",
      previousPrintRecordId: "PR-OLD",
      documentType: "outbound_note",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(reprinted.paperOutboundDocument.documentVersion, 2);

  const physicalHarness = createHarness({
    fulfillments: [createFulfillment({ physicalOutboundDocumentId: "POD-OLD", physicalOutboundAt: fixedNow })],
    printRecords: [createPrintRecord({ status: "printed", documentType: "outbound_note" })],
    paperOutboundDocuments: [paperOutboundDocument],
    warehouseOutboundExecutions: [{
      warehouseOutboundExecutionId: "WEX-PHYSICAL",
      fulfillmentId: "F-001",
      paperOutboundDocumentId: "POD-OLD",
      result: "实物已出库",
      actualQty: 1500,
    }],
  });
  const blocked = await physicalHarness.service.voidPrintRecord({
    workspace: physicalHarness.workspace,
    printRecordId: "PR-OLD",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(blocked.code, "PAPER_OUTBOUND_DOCUMENT_PHYSICAL_EXECUTION_RECORDED");
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
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createFulfillmentPrintCommandService/);
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
  packages = [createPackage()],
  paperOutboundDocuments = [],
  warehouseOutboundExecutions = [],
  production = false,
  atomicPrint = false,
} = {}) {
  const fulfillmentCalls = [];
  const atomicPrintCalls = [];
  const printJobCalls = [];
  let logSequence = 0;
  const workspace = {
    runtimeConfig: { mode: production ? "production" : "test", production },
    fulfillments: fulfillments.map((item) => structuredClone(item)),
    printRecords: printRecords.map((item) => structuredClone(item)),
    printJobs: [],
    paperOutboundDocuments: paperOutboundDocuments.map((item) => structuredClone(item)),
    warehouseOutboundExecutions: warehouseOutboundExecutions.map((item) => structuredClone(item)),
    packages: packages.map((item) => structuredClone(item)),
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
      kind: atomicPrint ? "postgres" : "local_memory",
      async recordFulfillmentAction(input) {
        fulfillmentCalls.push(input);
        workspace.printRecords = upsert(workspace.printRecords, input.printRecord, "printRecordId");
        workspace.paperOutboundDocuments = upsert(
          workspace.paperOutboundDocuments,
          input.paperOutboundDocument,
          "paperOutboundDocumentId",
        );
        return {
          fulfillment: input.fulfillment,
          printRecord: input.printRecord,
          paperOutboundDocument: input.paperOutboundDocument ?? null,
          operationLogId: input.operationLog.id,
        };
      },
      ...(atomicPrint
        ? {
            async recordFulfillmentPrint(input) {
              atomicPrintCalls.push(input);
              workspace.printRecords = upsert(workspace.printRecords, input.printRecord, "printRecordId");
              workspace.printJobs = upsert(workspace.printJobs, input.printJob, "printJobId");
              workspace.paperOutboundDocuments = upsert(
                workspace.paperOutboundDocuments,
                input.paperOutboundDocument,
                "paperOutboundDocumentId",
              );
              workspace.operationLogs = upsert(workspace.operationLogs, input.operationLog, "id");
              workspace.operationLogs = upsert(workspace.operationLogs, input.printJobOperationLog, "id");
              return {
                fulfillment: input.fulfillment,
                printRecord: input.printRecord,
                printJob: input.printJob,
                paperOutboundDocument: input.paperOutboundDocument ?? null,
                operationLogId: input.operationLog.id,
                printJobOperationLogId: input.printJobOperationLog.id,
              };
            },
          }
        : {}),
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
  return { service, workspace, fulfillmentCalls, atomicPrintCalls, printJobCalls };
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
    supportedDocumentTypes: ["express_ltl_label", "outbound_note"],
    defaultDocumentTypes: ["express_ltl_label", "outbound_note"],
    settings: { driverMode },
    ...overrides,
  };
}

function createPrintRecord(overrides = {}) {
  return {
    printRecordId: "PR-OLD",
    targetType: "fulfillment",
    targetId: "F-001",
    documentType: "express_ltl_label",
    templateId: "tpl-p0-express-ltl-label",
    status: "printed",
    printAction: "first_print",
    ...overrides,
  };
}

function createPackage(overrides = {}) {
  return {
    id: "PKG-001",
    packageId: "PKG-001",
    orderLineId: "OL-001",
    fulfillmentId: "F-001",
    packageSeq: 1,
    packageCount: 1,
    packedQty: 1500,
    status: "待打印标签",
    revision: 1,
    ...overrides,
  };
}

function upsert(rows, record, key) {
  if (!record) return rows;
  const index = rows.findIndex((item) => item[key] === record[key]);
  if (index < 0) return [...rows, record];
  return rows.map((item, itemIndex) => (itemIndex === index ? record : item));
}
