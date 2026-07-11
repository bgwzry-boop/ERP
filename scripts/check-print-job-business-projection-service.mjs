import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPrintJobBusinessProjectionService } from "../server/services/printJobBusinessProjectionService.mjs";

const transactionCalls = [];
const service = createPrintJobBusinessProjectionService({
  buildFulfillmentActionRecord(_workspace, fulfillment, input) {
    return {
      ...fulfillment,
      fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
      actualQty: input.actualQty,
      confirmedBy: input.operatorId,
    };
  },
  buildOperationLog(_workspace, input) {
    return {
      ...input,
      occurredAt: "2026-07-11T09:00:00.000Z",
      createdAt: "2026-07-11T09:00:00.000Z",
    };
  },
});

const sentWorkspace = createWorkspace({ printRecordStatus: "previewed" });
const sentProjection = await service.syncPrintJobBusinessProjection({
  workspace: sentWorkspace,
  printJob: createPrintJob({ jobStatus: "sent", updatedAt: "2026-07-11T09:01:00.000Z" }),
  operatorId: "U-PRINT-DRIVER-A",
  reason: "driver accepted",
  idempotencyKey: "print-sent-001",
});
assert.equal(sentProjection.printRecord.status, "submitted");
assert.equal(sentProjection.physicalPrintConfirmed, false);
assert.equal(sentProjection.fulfillment.status, "待打印标签");
assert.equal(sentProjection.fulfillment.printed, false);
assert.equal(transactionCalls.at(-1).operationLog.targetType, "print_record");
assert.equal(transactionCalls.at(-1).operationLog.action, "sync_print_record_from_job");
assert.equal(transactionCalls.at(-1).idempotencyKey, "print-sent-001:business-projection");

const printedWorkspace = createWorkspace();
const printedProjection = await service.syncPrintJobBusinessProjection({
  workspace: printedWorkspace,
  printJob: createPrintJob({ jobStatus: "printed", finishedAt: "2026-07-11T09:02:00.000Z" }),
  operatorId: "U-PRINT-DRIVER-A",
  reason: "trusted spool callback",
  idempotencyKey: "print-confirmed-001",
});
assert.equal(printedProjection.printRecord.status, "printed");
assert.equal(printedProjection.printRecord.printedAt, "2026-07-11T09:02:00.000Z");
assert.equal(printedProjection.physicalPrintConfirmed, true);
assert.equal(printedProjection.fulfillment.status, "待确认拉走");
assert.equal(printedProjection.fulfillment.printed, true);
assert.equal(transactionCalls.at(-1).operationLog.targetType, "fulfillment");
assert.equal(transactionCalls.at(-1).operationLog.action, "confirm_fulfillment_print_from_driver");

const unchangedWorkspace = createWorkspace();
const callsBeforeUnchanged = transactionCalls.length;
assert.deepEqual(
  await service.syncPrintJobBusinessProjection({
    workspace: unchangedWorkspace,
    printJob: createPrintJob({ jobStatus: "sent" }),
    operatorId: "U-PRINT-DRIVER-A",
  }),
  {},
);
assert.equal(transactionCalls.length, callsBeforeUnchanged);

const previewWorkspace = createWorkspace();
assert.deepEqual(
  await service.syncPrintJobBusinessProjection({
    workspace: previewWorkspace,
    printJob: createPrintJob({ jobStatus: "preview_only" }),
    operatorId: "U-OFFICE-A",
  }),
  {},
);

const standaloneWorkspace = createWorkspace({ targetType: "raw_material_roll", targetId: "RMR-001" });
const standaloneProjection = await service.syncPrintJobBusinessProjection({
  workspace: standaloneWorkspace,
  printJob: createPrintJob({ jobStatus: "printed", finishedAt: "2026-07-11T09:03:00.000Z" }),
  operatorId: "U-WAREHOUSE-A",
});
assert.equal(standaloneProjection.physicalPrintConfirmed, true);
assert.equal(standaloneWorkspace.printRecords[0].status, "printed");

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.match(apiServerSource, /createPrintJobBusinessProjectionService/);
assert.doesNotMatch(apiServerSource, /async function syncPrintJobBusinessProjection/);

console.log("Print job business projection service checks passed: trusted print confirmation remains the fulfillment gate.");

function createWorkspace({
  printRecordStatus = "submitted",
  targetType = "fulfillment",
  targetId = "FUL-001",
} = {}) {
  const workspace = {
    fulfillments: [
      {
        id: "FUL-001",
        fulfillmentId: "FUL-001",
        method: "快递快运",
        status: "待打印标签",
        qty: 1500,
        actualQty: 1500,
        printed: false,
      },
    ],
    printRecords: [
      {
        printRecordId: "PR-001",
        targetType,
        targetId,
        batchNo: "PB-001",
        printAction: "first_print",
        status: printRecordStatus,
      },
    ],
    fulfillmentActionTransactionRepository: {
      async recordFulfillmentAction(input) {
        transactionCalls.push(input);
        return {
          fulfillment: input.fulfillment,
          printRecord: input.printRecord,
          operationLogId: input.operationLog.id,
        };
      },
    },
  };
  return workspace;
}

function createPrintJob(overrides = {}) {
  return {
    printJobId: "PJ-001",
    printRecordId: "PR-001",
    jobStatus: "sent",
    updatedAt: "2026-07-11T09:00:00.000Z",
    ...overrides,
  };
}
