import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPrintJobLifecycleService } from "../server/services/printJobLifecycleService.mjs";

const fixedNow = "2026-07-11T10:00:00.000Z";

{
  const harness = createHarness([]);
  assert.equal(
    (await harness.service.updatePrintJobStatus({
      workspace: harness.workspace,
      printJobId: "PJ-MISSING",
      body: {},
      operatorId: "U-OFFICE-A",
    })).notFound,
    true,
  );
}

{
  const harness = createHarness([createPrintJob()]);
  const invalid = await harness.service.updatePrintJobStatus({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    body: { status: "unknown" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.code, "INVALID_PRINT_JOB_STATUS");

  const updated = await harness.service.updatePrintJobStatus({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    body: {
      status: "sent",
      operatorId: "U-SPOOFED",
      reason: "manual status check",
      idempotencyKey: "status-001",
      metadata: { source: "direct_check" },
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(updated.printJob.jobStatus, "sent");
  assert.equal(updated.printJob.sentAt, fixedNow);
  assert.equal(updated.printJob.metadata.statusUpdatedBy, "U-OFFICE-A");
  assert.equal(updated.printJob.metadata.source, "direct_check");
  assert.equal(harness.updateCalls.at(-1).idempotencyKey, "status-001");
  assert.equal(harness.updateCalls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(harness.updateCalls.at(-1).operationLog.operatorId, "U-OFFICE-A");
  assert.equal(harness.updateCalls.at(-1).operationLog.action, "update_print_job_status");
  assert.equal(harness.projectionCalls.at(-1).printJob.jobStatus, "sent");
}

{
  const harness = createHarness([createPrintJob()]);
  const dispatched = await harness.service.dispatchPrintJob({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    body: { operatorId: "U-SPOOFED", reason: "send to driver", idempotencyKey: "dispatch-001" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(dispatched.printJob.jobStatus, "sent");
  assert.equal(dispatched.printJob.metadata.externalJobId, undefined);
  assert.equal(dispatched.printJob.metadata.lastDispatch.externalJobId, "EXT-PJ-001");
  assert.equal(dispatched.dispatchResult.adapterStatus, "sent");
  assert.equal(harness.dispatchCalls.at(-1).operatorId, "U-OFFICE-A");
  assert.equal(harness.updateCalls.at(-1).operationLog.action, "dispatch_print_job");
  assert.equal(harness.updateCalls.at(-1).operationLog.operatorId, "U-OFFICE-A");
  assert.equal(harness.updateCalls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");

  const duplicate = await harness.service.dispatchPrintJob({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.code, "PRINT_JOB_ALREADY_DISPATCHED");
}

{
  const harness = createHarness([
    createPrintJob({
      jobStatus: "sent",
      metadata: { lastDispatch: { externalJobId: "EXT-PJ-001" } },
    }),
  ]);
  const mismatch = await harness.service.recordPrintJobDriverStatus({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    operatorId: "U-PRINT-DRIVER-A",
    body: { status: "printed", externalJobId: "WRONG-PJ-001" },
  });
  assert.equal(mismatch.statusCode, 409);
  assert.equal(mismatch.code, "PRINT_JOB_EXTERNAL_ID_MISMATCH");

  const printed = await harness.service.recordPrintJobDriverStatus({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    operatorId: "U-PRINT-DRIVER-A",
    body: {
      status: "printed",
      externalJobId: "EXT-PJ-001",
      eventSource: "dry_run_check",
      driverStatus: "completed",
      operatorId: "UNTRUSTED-REPORTED-BY",
      message: "spool completed",
      idempotencyKey: "callback-001",
    },
  });
  assert.equal(printed.printJob.jobStatus, "printed");
  assert.equal(printed.printJob.finishedAt, fixedNow);
  assert.equal(printed.driverStatusEvent.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(printed.driverStatusEvent.eventSource, "dry_run_check");
  assert.equal(printed.driverStatusEvent.metadata.reportedBy, "UNTRUSTED-REPORTED-BY");
  assert.equal(harness.updateCalls.at(-1).operationLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(harness.projectionCalls.at(-1).printJob.jobStatus, "printed");

  const regression = await harness.service.recordPrintJobDriverStatus({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    operatorId: "U-PRINT-DRIVER-A",
    body: { status: "sent", externalJobId: "EXT-PJ-001" },
  });
  assert.equal(regression.statusCode, 409);
  assert.equal(regression.code, "PRINT_JOB_TERMINAL_STATUS_LOCKED");
}

{
  const harness = createHarness([
    createPrintJob({ printJobId: "PJ-QUEUED", bizNo: "PJ-QUEUED", jobStatus: "queued" }),
    createPrintJob({
      printJobId: "PJ-SENT",
      bizNo: "PJ-SENT",
      jobStatus: "sent",
      metadata: { lastDispatch: { externalJobId: "EXT-PJ-SENT" } },
    }),
    createPrintJob({ printJobId: "PJ-FAILED", bizNo: "PJ-FAILED", jobStatus: "failed" }),
  ], {
    pollPrintJobStatus({ printJob }) {
      if (printJob.printJobId === "PJ-SENT") {
        return {
          status: "printed",
          externalJobId: "EXT-PJ-SENT",
          eventSource: "driver_poll",
          driverStatus: "completed",
          polledAt: fixedNow,
          adapterStatus: "completed",
        };
      }
      return { adapterStatus: "no_status" };
    },
  });
  const polled = await harness.service.pollPrintJobs({
    workspace: harness.workspace,
    operatorId: "U-PRINT-DRIVER-A",
    body: { statuses: ["queued", "sent", "failed"], limit: 10, idempotencyKey: "poll-001" },
  });
  assert.deepEqual(polled.requestedStatuses, ["queued", "sent"]);
  assert.equal(polled.totalCandidates, 2);
  assert.equal(polled.updatedCount, 1);
  assert.equal(polled.unchangedCount, 1);
  assert.equal(polled.errorCount, 0);
  assert.equal(polled.items.find((item) => item.printJobId === "PJ-SENT").afterStatus, "printed");
  assert.equal(polled.items.find((item) => item.printJobId === "PJ-QUEUED").updated, false);
}

{
  const harness = createHarness([createPrintJob({ jobStatus: "failed", attemptNo: 1 })]);
  const retried = await harness.service.retryPrintJob({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    body: { operatorId: "U-SPOOFED", retryReason: "paper replaced", idempotencyKey: "retry-001" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(retried.sourcePrintJob.printJobId, "PJ-001");
  assert.equal(retried.printJob.sourcePrintJobId, "PJ-001");
  assert.equal(retried.printJob.attemptNo, 2);
  assert.equal(retried.printJob.jobStatus, "queued");
  assert.equal(retried.printJob.metadata.retryReason, "paper replaced");
  assert.equal(harness.createCalls.at(-1).operationLog.action, "retry_print_job");
  assert.equal(harness.createCalls.at(-1).operationLog.operatorId, "U-OFFICE-A");
  assert.equal(harness.createCalls.at(-1).idempotencyKey, "retry-001");
  assert.equal(harness.createCalls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");

  const notRetryable = await harness.service.retryPrintJob({
    workspace: harness.workspace,
    printJobId: retried.printJob.printJobId,
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(notRetryable.statusCode, 409);
  assert.equal(notRetryable.code, "PRINT_JOB_RETRY_REQUIRES_FAILED_JOB");
}

{
  const harness = createHarness([createPrintJob({ jobStatus: "preview_only", driverMode: "preview_only" })]);
  const previewCallback = await harness.service.recordPrintJobDriverStatus({
    workspace: harness.workspace,
    printJobId: "PJ-001",
    operatorId: "U-PRINT-DRIVER-A",
    body: { status: "printed" },
  });
  assert.equal(previewCallback.code, "PRINT_JOB_DRIVER_CALLBACK_NOT_EXPECTED");
}

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.match(apiServerSource, /createPrintJobLifecycleService/);
for (const embeddedFunction of [
  "buildRetryPrintJobRecord",
  "buildDispatchedPrintJobRecord",
  "buildPrintJobDriverStatusEvent",
  "getPrintJobDriverStatusTransitionError",
  "buildDriverStatusPrintJobRecord",
]) {
  assert.doesNotMatch(apiServerSource, new RegExp(`function ${embeddedFunction}\\b`));
}

console.log("Print job lifecycle service checks passed: status, dispatch, callback, polling, terminal locks, and retry are isolated.");

function createHarness(initialJobs, adapterOverrides = {}) {
  const updateCalls = [];
  const createCalls = [];
  const projectionCalls = [];
  const dispatchCalls = [];
  let operationLogSequence = 0;
  const workspace = {
    printJobs: initialJobs.map((item) => structuredClone(item)),
    printJobRepository: {
      async listPrintJobs() {
        return workspace.printJobs;
      },
      async updatePrintJob(input) {
        updateCalls.push(input);
        workspace.printJobs = workspace.printJobs.map((item) =>
          item.printJobId === input.printJob.printJobId ? input.printJob : item,
        );
        return { printJob: input.printJob, operationLogId: input.operationLog.id };
      },
      async createPrintJob(input) {
        createCalls.push(input);
        workspace.printJobs.push(input.printJob);
        return { printJob: input.printJob, operationLogId: input.operationLog.id };
      },
    },
    printDriverAdapter: {
      dispatchPrintJob(input) {
        dispatchCalls.push(input);
        return {
          adapterStatus: "sent",
          jobStatus: "sent",
          externalJobId: `EXT-${input.printJob.printJobId}`,
          dispatchedAt: fixedNow,
          message: "driver accepted",
        };
      },
      pollPrintJobStatus() {
        return { adapterStatus: "no_status" };
      },
      ...adapterOverrides,
    },
  };
  const service = createPrintJobLifecycleService({
    now: () => new Date(fixedNow),
    buildOperationLog(_workspace, input) {
      operationLogSequence += 1;
      return { id: `LOG-${operationLogSequence}`, ...input, occurredAt: fixedNow, createdAt: fixedNow };
    },
    printJobBusinessProjectionService: {
      async syncPrintJobBusinessProjection(input) {
        projectionCalls.push(input);
        return { projectionChecked: true };
      },
    },
  });
  return { service, workspace, updateCalls, createCalls, projectionCalls, dispatchCalls };
}

function createPrintJob(overrides = {}) {
  return {
    printJobId: "PJ-001",
    bizNo: "PJ-001",
    printRecordId: "PR-001",
    printDeviceId: "PRN-001",
    driverMode: "system_printer",
    jobStatus: "queued",
    attemptNo: 1,
    queuedAt: "2026-07-11T09:00:00.000Z",
    sentAt: "",
    finishedAt: "",
    errorCode: "",
    errorMessage: "",
    metadata: {},
    createdAt: "2026-07-11T09:00:00.000Z",
    updatedAt: "2026-07-11T09:00:00.000Z",
    ...overrides,
  };
}
