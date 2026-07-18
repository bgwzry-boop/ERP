import assert from "node:assert/strict";
import {
  buildPrintBatchOperationLog,
  buildPrintBatchRecord,
  buildPrintDeviceOperationLog,
  buildPrintDeviceRecord,
  buildPrintJobOperationLog,
  buildPrintJobRecord,
} from "./helpers/postgresLivePrintFixtures.mjs";

const printDevice = buildPrintDeviceRecord({ printDeviceId: "PRN-FIXTURE-001", name: "Fixture 标签机" });
assert.equal(printDevice.printDeviceId, printDevice.bizNo);
assert.equal(printDevice.settings.driverMode, "preview_only");
assert.equal(printDevice.supportedDocumentTypes.includes("express_ltl_label"), true);

const printDeviceLog = buildPrintDeviceOperationLog({ logId: "LOG-FIXTURE-DEVICE-001", printDevice });
assert.equal(printDeviceLog.targetId, printDevice.printDeviceId);
assert.equal(printDeviceLog.after, printDevice);

const previewJob = buildPrintJobRecord();
assert.equal(previewJob.driverMode, "preview_only");
assert.equal(previewJob.jobStatus, "preview_only");
assert.equal(previewJob.queuedAt, "");
assert.equal(previewJob.printDeviceSnapshot.settings.driverMode, previewJob.driverMode);

const retryJob = buildPrintJobRecord({
  printJobId: "PJ-FIXTURE-RETRY-002",
  driverMode: "system_printer",
  jobStatus: "queued",
  attemptNo: 2,
  sourcePrintJobId: "PJ-FIXTURE-001",
});
assert.equal(retryJob.queuedAt, "2026-07-02T10:30:00.000Z");
assert.equal(retryJob.attemptNo, 2);
assert.equal(retryJob.sourcePrintJobId, "PJ-FIXTURE-001");

const printJobLog = buildPrintJobOperationLog({
  logId: "LOG-FIXTURE-JOB-001",
  printJob: retryJob,
  action: "retry_print_job",
  before: previewJob,
});
assert.equal(printJobLog.targetId, retryJob.printJobId);
assert.equal(printJobLog.before, previewJob);
assert.equal(printJobLog.after, retryJob);

const printBatch = buildPrintBatchRecord({
  printBatchId: "PB-FIXTURE-001",
  todoId: "TODO-FIXTURE-001",
  operatorName: "Fixture 操作员",
});
assert.equal(printBatch.printedLabelCount + printBatch.pendingLabelCount, printBatch.totalLabelCount);
assert.equal(printBatch.printedPackages.length, printBatch.printedLabelCount);
assert.equal(printBatch.pendingPackages.length, printBatch.pendingLabelCount);
assert.equal(printBatch.operatorName, "Fixture 操作员");

const printBatchLog = buildPrintBatchOperationLog({ logId: "LOG-FIXTURE-BATCH-001", printBatchRecord: printBatch });
assert.equal(printBatchLog.targetId, printBatch.printBatchId);
assert.equal(printBatchLog.reason, printBatch.summary);

console.log("PostgreSQL live print fixture checks passed: device, job, retry, batch, and audit records are stable.");
