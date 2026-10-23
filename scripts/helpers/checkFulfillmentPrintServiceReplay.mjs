import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalFulfillmentActionTransactionRepository } from "../../server/fulfillmentActionTransactionRepository.mjs";
import { createLocalPrintJobRepository } from "../../server/printJobRepository.mjs";
import { createFulfillmentPrintCommandService } from "../../server/services/fulfillmentPrintCommandService.mjs";
import { createPrintJobBusinessProjectionService } from "../../server/services/printJobBusinessProjectionService.mjs";
import { buildIdempotencyRequestHash } from "../../server/idempotency.mjs";

export async function checkFulfillmentPrintServiceReplay() {
  const storageRoot = mkdtempSync(join(tmpdir(), "erp-local-print-replay-"));
  try {
    const clock = "2026-09-06T00:00:00.000Z";
    let sequence = 0;
    const buildOperationLog = (_workspace, input) => ({ id: `LOG-LOCAL-REPLAY-${++sequence}`, ...input, createdAt: clock, occurredAt: clock });
    const buildFulfillmentActionRecord = (_workspace, record) => ({ ...record, fulfillmentId: record.fulfillmentId ?? record.id });
    const service = createFulfillmentPrintCommandService({
      now: () => new Date(clock), buildOperationLog, buildFulfillmentActionRecord,
      buildFulfillmentPrintTemplate: ({ fulfillment, printRecord }) => ({ documentType: "express_ltl_label", templateId: printRecord.templateId, customerText: fulfillment.customerText }),
      buildPrintDeviceSnapshot: record => record,
      getDocumentType: () => "express_ltl_label", getTemplateId: () => "tpl-p0-express-ltl-label",
    });
    const localJobs = createLocalPrintJobRepository({ storageRoot });
    let failWrite = true;
    const device = { printDeviceId: "LOCAL-LABEL", status: "active", supportedDocumentTypes: ["express_ltl_label"], defaultDocumentTypes: ["express_ltl_label"], settings: { driverMode: "system_printer" } };
    const workspace = {
      fulfillments: [{ id: "F-LOCAL-REPLAY", fulfillmentId: "F-LOCAL-REPLAY", status: "待打印标签", method: "express_ltl", revision: 1, customerText: "original customer" }],
      packages: [{ id: "PK-LOCAL-REPLAY", packageId: "PK-LOCAL-REPLAY", fulfillmentId: "F-LOCAL-REPLAY", revision: 1, status: "待打印标签" }],
      fulfillmentActionTransactionRepository: createLocalFulfillmentActionTransactionRepository(),
      printDeviceRepository: { getDefaultPrintDevice: async () => device, listPrintDevices: async () => [device] },
      printJobRepository: { ...localJobs, createPrintJob(input) {
        if (failWrite) { failWrite = false; throw new Error("synthetic local persistence failure"); }
        return localJobs.createPrintJob(input);
      } },
    };
    const request = { workspace, fulfillmentId: "F-LOCAL-REPLAY", operatorId: "U-OFFICE-A", body: { idempotencyKey: "local-first-print-replay" } };
    await assert.rejects(service.printFulfillment(request), /local persistence failure/);
    const firstRecordId = workspace.printRecords[0].printRecordId;
    const firstJobId = workspace.printJobs[0].printJobId;
    const queued = await service.printFulfillment(request);
    assert.equal(queued.printRecord.printRecordId, firstRecordId);
    assert.equal(queued.printJobId, firstJobId);
    assert.equal(workspace.operationLogs.filter(log => log.action === "print_fulfillment").length, 1);
    assert.equal(localJobs.loadState().printJobs.length, 1);
    assert.deepEqual(await service.printFulfillment(request), queued);

    const projection = createPrintJobBusinessProjectionService({ buildOperationLog, buildFulfillmentActionRecord });
    const confirmedJob = { ...queued.printJob, jobStatus: "printed", finishedAt: clock };
    localJobs.updatePrintJob({ workspace, printJob: confirmedJob, operationLog: buildOperationLog(workspace, { targetType: "print_job", targetId: firstJobId, action: "record_print_job_driver_status", operatorId: "U-PRINT-DRIVER-A" }) });
    const projected = await projection.syncPrintJobBusinessProjection({
      workspace, printJob: confirmedJob, operatorId: "U-PRINT-DRIVER-A", idempotencyKey: "local-first-print-confirm",
    });
    assert.equal(projected.physicalPrintConfirmed, true);
    // Current business and default device have changed since submission.
    workspace.fulfillments[0].customerText = "later customer text";
    workspace.printDeviceRepository = { getDefaultPrintDevice: () => { throw new Error("Replay must not resolve a device"); } };
    const current = JSON.stringify({ fulfillments: workspace.fulfillments, packages: workspace.packages, printRecords: workspace.printRecords, printJobs: workspace.printJobs });
    assert.deepEqual(await service.printFulfillment(request), queued);
    assert.equal(JSON.stringify({ fulfillments: workspace.fulfillments, packages: workspace.packages, printRecords: workspace.printRecords, printJobs: workspace.printJobs }), current);
    assert.equal(localJobs.loadState().printJobs[0].jobStatus, "printed", "Local persistence recovery must never re-queue a printed job");
    assert.equal(queued.printTemplate.customerText, "original customer");
    for (const changed of [{ fulfillmentId: "OTHER" }, { operatorId: "OTHER" }, { body: { ...request.body, paperNo: "changed" } }]) {
      await assert.rejects(service.printFulfillment({ ...request, ...changed }), error => error.code === "IDEMPOTENCY_KEY_REUSED");
    }
    // A historical Local receipt stored the job only in its creation audit.
    const legacy = workspace.operationIdempotencyRecords.find(record => record.scope === "fulfillment.print_fulfillment");
    legacy.requestHash = buildIdempotencyRequestHash({ ...request.body, printAction: "first_print", documentType: queued.printJob.documentType, templateId: queued.printJob.templateId, packageIds: ["PK-LOCAL-REPLAY"], operatorId: request.operatorId });
    legacy.response.printJob = null;
    legacy.response.printJobOperationLogId = "";
    assert.deepEqual(await service.printFulfillment(request), queued, "Legacy Local replay reads the original job creation audit, not the current printed job as its receipt");
    await service.voidPrintRecord({ workspace, printRecordId: firstRecordId, operatorId: request.operatorId, body: { idempotencyKey: "local-first-print-void", voidReason: "重新核对" } });
    assert.equal(workspace.printRecords.find(record => record.printRecordId === firstRecordId).status, "voided");
    assert.deepEqual(await service.printFulfillment(request), queued);
    assert.equal(workspace.printRecords.find(record => record.printRecordId === firstRecordId).status, "voided");
    assert.equal(localJobs.loadState().printJobs.length, 1);
    console.log("PASS Local print service replay: persistence failure, original template and audit, current printed/voided state, changed device, intent binding and legacy receipt. Synthetic output only.");
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
}
