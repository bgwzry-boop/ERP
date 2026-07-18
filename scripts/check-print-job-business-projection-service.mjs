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
assert.equal(printedProjection.fulfillment.status, "待打印出库单");
assert.equal(printedProjection.fulfillment.labelsPrinted, true);
assert.equal(printedProjection.fulfillment.printed, false);
assert.equal(printedProjection.packages[0].status, "已打印标签");
assert.equal(printedProjection.packages[0].labelPrintRecordId, "PR-001");
assert.equal(transactionCalls.at(-1).operationLog.targetType, "fulfillment");
assert.equal(transactionCalls.at(-1).operationLog.action, "confirm_fulfillment_print_from_driver");

{
  const atomicCalls = [];
  const atomicWorkspace = createWorkspace();
  atomicWorkspace.runtimeConfig = { mode: "production", production: true };
  atomicWorkspace.fulfillmentActionTransactionRepository = {
    kind: "postgres",
    async recordFulfillmentPrint(input) {
      atomicCalls.push(input);
      return {
        fulfillment: { ...input.fulfillment, revision: 2 },
        printRecord: input.printRecord,
        printJob: { ...input.printJob, revision: 2 },
        operationLogId: input.operationLog.id,
        printJobOperationLogId: input.printJobOperationLog.id,
      };
    },
  };
  const projection = await service.persistFulfillmentPrintJobProjection({
    workspace: atomicWorkspace,
    printJob: createPrintJob({ jobStatus: "printed", revision: 1, finishedAt: "2026-07-11T09:02:00.000Z" }),
    printJobOperationLog: {
      id: "LOG-PRINT-JOB-ATOMIC-001",
      targetType: "print_job",
      targetId: "PJ-001",
      action: "record_print_job_driver_status",
      operatorId: "U-PRINT-DRIVER-A",
    },
    printJobWriteMode: "update",
    operatorId: "U-PRINT-DRIVER-A",
    reason: "trusted spool callback",
    idempotencyKey: "print-confirmed-atomic-001",
  });
  assert.equal(projection.handled, true);
  assert.equal(projection.printJob.revision, 2);
  assert.equal(projection.fulfillment.labelsPrinted, true);
  assert.equal(projection.fulfillment.printed, false);
  assert.equal(projection.physicalPrintConfirmed, true);
  assert.equal(atomicCalls.length, 1);
  assert.equal(atomicCalls[0].printJobWriteMode, "update");
  assert.equal(atomicCalls[0].printJobOperationLog.id, "LOG-PRINT-JOB-ATOMIC-001");
  assert.equal(atomicCalls[0].operationLog.action, "confirm_fulfillment_print_from_driver");
}

{
  const blockedWorkspace = createWorkspace();
  blockedWorkspace.runtimeConfig = { mode: "production", production: true };
  blockedWorkspace.fulfillmentActionTransactionRepository = {
    kind: "postgres",
    async recordFulfillmentAction() {
      throw new Error("Production projection must not fall back to a separate fulfillment write");
    },
  };
  const blocked = await service.persistFulfillmentPrintJobProjection({
    workspace: blockedWorkspace,
    printJob: createPrintJob({ jobStatus: "printed", revision: 1 }),
    printJobOperationLog: { id: "LOG-PRINT-JOB-BLOCKED-001" },
    printJobWriteMode: "update",
    operatorId: "U-PRINT-DRIVER-A",
  });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.code, "PRINT_STATUS_TRANSACTION_PERSISTENCE_REQUIRED");
}

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

{
  const staleWorkspace = createWorkspace();
  staleWorkspace.packages[0].revision = 2;
  const staleProjection = await service.syncPrintJobBusinessProjection({
    workspace: staleWorkspace,
    printJob: createPrintJob({ jobStatus: "printed", finishedAt: "2026-07-11T09:04:00.000Z" }),
    operatorId: "U-PRINT-DRIVER-A",
  });
  assert.equal(staleProjection.physicalPrintConfirmed, false);
  assert.equal(staleProjection.printTrustStatus, "package_revision_changed");
  assert.equal(staleProjection.fulfillment.status, "待打印标签");
  assert.equal(staleProjection.packages.length, 0);
}

{
  const voidedWorkspace = createWorkspace({ printRecordStatus: "voided" });
  const ignoredLateCallback = await service.syncPrintJobBusinessProjection({
    workspace: voidedWorkspace,
    printJob: createPrintJob({ jobStatus: "printed", finishedAt: "2026-07-11T09:05:00.000Z" }),
    operatorId: "U-PRINT-DRIVER-A",
  });
  assert.deepEqual(ignoredLateCallback, {});
  assert.equal(voidedWorkspace.fulfillments[0].status, "待打印标签");
}

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
const lifecycleSource = readFileSync(new URL("../server/services/printJobLifecycleService.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createPrintJobBusinessProjectionService/);
assert.match(lifecycleSource, /persistFulfillmentPrintJobProjection/);
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
        revision: 1,
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
        documentType: "express_ltl_label",
        templateId: "tpl-p0-express-ltl-label",
        fulfillmentRevision: 1,
        packageSnapshot: [{ packageId: "PKG-001", revision: 1 }],
      },
    ],
    packages: [
      {
        id: "PKG-001",
        packageId: "PKG-001",
        orderLineId: "OL-001",
        fulfillmentId: "FUL-001",
        status: "待打印标签",
        revision: 1,
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
