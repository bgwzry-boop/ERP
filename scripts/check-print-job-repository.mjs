import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCreatePrintJobTransactionQuery,
  buildCreatePrintJobTransactionSql,
  buildListPrintJobsQuery,
  buildListPrintJobsSql,
  buildUpdatePrintJobTransactionQuery,
  buildUpdatePrintJobTransactionSql,
  createLocalPrintJobRepository,
  createPostgresPrintJobRepository,
} from "../server/printJobRepository.mjs";

checkLocalPrintJobRepository();
await checkPostgresPrintJobSqlBoundary();

console.log(
  "Print job repository check passed: local JSON persistence, failed status updates, retry jobs, and PostgreSQL SQL boundaries are covered.",
);

function checkLocalPrintJobRepository() {
  const storageRoot = mkdtempSync(join(tmpdir(), "erp-print-job-check-"));
  try {
    const repository = createLocalPrintJobRepository({ storageRoot });
    const loaded = repository.loadState();
    assert.deepEqual(loaded.printJobs, []);

    const workspace = { printJobs: loaded.printJobs, operationLogs: [] };
    const printJob = buildPrintJob({ printJobId: "PJ-CHECK-1", jobStatus: "queued", driverMode: "system_printer" });
    const createLog = buildOperationLog({
      logId: "LOG-PRINT-JOB-CREATE-1",
      targetId: printJob.printJobId,
      action: "create_print_job",
      after: printJob,
    });
    const created = repository.createPrintJob({ workspace, printJob, operationLog: createLog });
    assert.equal(created.printJob.printJobId, "PJ-CHECK-1");
    assert.equal(created.printJob.jobStatus, "queued");
    assert.equal(workspace.operationLogs.length, 1);

    const failedJob = {
      ...created.printJob,
      jobStatus: "failed",
      finishedAt: "2026-07-02T10:35:00.000Z",
      errorCode: "DRIVER_TIMEOUT",
      errorMessage: "Driver O'Brien timeout",
      updatedAt: "2026-07-02T10:35:00.000Z",
    };
    const failed = repository.updatePrintJob({
      workspace,
      printJob: failedJob,
      operationLog: buildOperationLog({
        logId: "LOG-PRINT-JOB-FAILED-1",
        targetId: failedJob.printJobId,
        action: "update_print_job_status",
        before: created.printJob,
        after: failedJob,
      }),
    });
    assert.equal(failed.printJob.jobStatus, "failed");
    assert.equal(repository.listPrintJobs({ workspace, filters: { status: "failed" } }).length, 1);

    const retryJob = buildPrintJob({
      printJobId: "PJ-CHECK-1-RETRY-2",
      jobStatus: "queued",
      driverMode: "system_printer",
      attemptNo: 2,
      sourcePrintJobId: "PJ-CHECK-1",
    });
    const retried = repository.createPrintJob({
      workspace,
      printJob: retryJob,
      operationLog: buildOperationLog({
        logId: "LOG-PRINT-JOB-RETRY-1",
        targetId: retryJob.printJobId,
        action: "retry_print_job",
        before: failed.printJob,
        after: retryJob,
      }),
    });
    assert.equal(retried.printJob.sourcePrintJobId, "PJ-CHECK-1");
    assert.equal(retried.printJob.attemptNo, 2);
    assert.equal(repository.listPrintJobs({ workspace, filters: { printRecordId: "PR-CHECK-1" } }).length, 2);

    const storePath = join(storageRoot, "metadata", "print-jobs.json");
    assert.equal(existsSync(storePath), true);
    const savedJson = JSON.parse(readFileSync(storePath, "utf8"));
    assert.equal(savedJson.printJobs.length, 2);

    const reloadedState = createLocalPrintJobRepository({ storageRoot }).loadState();
    assert.equal(reloadedState.printJobs.find((job) => job.printJobId === "PJ-CHECK-1").jobStatus, "failed");
    assert.equal(reloadedState.printJobs.find((job) => job.printJobId === "PJ-CHECK-1-RETRY-2").attemptNo, 2);
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
}

async function checkPostgresPrintJobSqlBoundary() {
  const calls = [];
  const printJob = buildPrintJob({
    printJobId: "PJ-CHECK-1",
    jobStatus: "queued",
    driverMode: "system_printer",
  });
  const failedJob = {
    ...printJob,
    jobStatus: "failed",
    finishedAt: "2026-07-02T10:35:00.000Z",
    errorCode: "DRIVER_TIMEOUT",
    errorMessage: "Driver O'Brien timeout",
    updatedAt: "2026-07-02T10:35:00.000Z",
  };
  const createLog = buildOperationLog({
    logId: "LOG-PRINT-JOB-CREATE-1",
    targetId: printJob.printJobId,
    action: "create_print_job",
    after: printJob,
  });
  const updateLog = buildOperationLog({
    logId: "LOG-PRINT-JOB-FAILED-1",
    targetId: failedJob.printJobId,
    action: "update_print_job_status",
    before: printJob,
    after: failedJob,
  });
  const repository = createPostgresPrintJobRepository({
    postgresClient: {
      queryJson(text, values) {
        calls.push({ kind: "query", text, values });
        return [{ ...failedJob, revision: 2 }];
      },
      idempotentTransactionJson(request) {
        calls.push({ kind: "idempotent", ...request });
        if (request.text.includes("INSERT INTO print_jobs")) {
          return { printJob: { ...printJob, revision: 1 }, operationLogId: createLog.id };
        }
        return { printJob: { ...failedJob, revision: 2 }, operationLogId: updateLog.id };
      },
    },
  });
  const workspace = { printJobs: [], operationLogs: [] };

  const created = await repository.createPrintJob({
    workspace,
    printJob,
    operationLog: createLog,
    idempotencyKey: "idem-print-job-create-001",
  });
  const updated = await repository.updatePrintJob({
    workspace,
    printJob: failedJob,
    operationLog: updateLog,
    idempotencyKey: "idem-print-job-update-001",
  });
  const listed = await repository.listPrintJobs({ filters: { status: "failed", printRecordId: "PR-CHECK-1" } });

  assert.equal(created.printJob.printJobId, "PJ-CHECK-1");
  assert.equal(updated.printJob.jobStatus, "failed");
  assert.equal(listed.length, 1);
  assert.equal(workspace.printJobs.length, 1);
  assert.equal(workspace.operationLogs.length, 2);

  const createCall = calls[0];
  assert.equal(createCall.kind, "idempotent");
  assert.equal(createCall.scope, "print.job.create.pj-check-1");
  assert.equal(createCall.idempotencyKey, "idem-print-job-create-001");
  assert.ok(createCall.resourceLocks.includes("print-job:PJ-CHECK-1"));
  assert.match(createCall.text, /^BEGIN;/);
  assert.match(createCall.text, /INSERT INTO operation_logs/);
  assert.match(createCall.text, /INSERT INTO print_jobs/);
  assert.match(createCall.text, /printer_device_snapshot/);
  assert.match(createCall.text, /payload_json/);
  assert.match(createCall.text, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(createCall.text, /ERP_PRINT_JOB_CREATE_CONCURRENCY_CONFLICT/);
  assert.match(createCall.text, /COMMIT;/);
  assert.match(createCall.text, /\$\d+::jsonb/);

  const updateCall = calls[1];
  assert.equal(updateCall.kind, "idempotent");
  assert.equal(updateCall.scope, "print.job.update.pj-check-1");
  assert.equal(updateCall.idempotencyKey, "idem-print-job-update-001");
  assert.match(updateCall.text, /UPDATE print_jobs/);
  assert.match(updateCall.text, /FOR UPDATE/);
  assert.match(updateCall.text, /revision = print_jobs\.revision \+ 1/);
  assert.match(updateCall.text, /ERP_PRINT_JOB_CONCURRENCY_CONFLICT/);
  assert.match(updateCall.text, /job_status = \$\d+::text/);
  assert.doesNotMatch(updateCall.text, /Driver O''Brien timeout/);
  assert.ok(updateCall.values.includes("Driver O'Brien timeout"));

  const listCall = calls[2];
  assert.equal(listCall.kind, "query");
  assert.match(listCall.text, /FROM print_jobs/);
  assert.match(listCall.text, /job_status = \$1::text/);
  assert.match(listCall.text, /print_record_id = \$2::text/);
  assert.deepEqual(listCall.values, ["failed", "PR-CHECK-1", 100]);

  const directCreateQuery = buildCreatePrintJobTransactionQuery({ printJob, operationLog: createLog });
  const directCreateSql = buildCreatePrintJobTransactionSql({ printJob, operationLog: createLog });
  assert.match(directCreateSql, /source_print_job_id/);
  assert.match(directCreateSql, /queued_at/);
  assert.equal(directCreateQuery.text, directCreateSql);
  assert.ok(directCreateQuery.values.length > 20);

  const directUpdateQuery = buildUpdatePrintJobTransactionQuery({ printJob: failedJob, operationLog: updateLog });
  const directUpdateSql = buildUpdatePrintJobTransactionSql({ printJob: failedJob, operationLog: updateLog });
  assert.match(directUpdateSql, /error_code = \$\d+::text/);
  assert.equal(directUpdateQuery.text, directUpdateSql);
  assert.ok(directUpdateQuery.values.includes("DRIVER_TIMEOUT"));

  const directListQuery = buildListPrintJobsQuery({ targetType: "fulfillment", targetId: "F001", limit: 20 });
  const directListSql = buildListPrintJobsSql({ targetType: "fulfillment", targetId: "F001", limit: 20 });
  assert.match(directListSql, /LIMIT \$3::integer/);
  assert.match(directListSql, /target_type = \$1::text/);
  assert.match(directListSql, /target_id = \$2::text/);
  assert.equal(directListQuery.text, directListSql);
  assert.deepEqual(directListQuery.values, ["fulfillment", "F001", 20]);
}

function buildPrintJob(overrides = {}) {
  const printJobId = overrides.printJobId ?? "PJ-CHECK-1";
  return {
    printJobId,
    bizNo: printJobId,
    printRecordId: "PR-CHECK-1",
    targetType: "fulfillment",
    targetId: "F001",
    documentType: "express_ltl_label",
    templateId: "tpl-p0-express-label",
    printDeviceId: "PRN-CHECK-1",
    printDeviceSnapshot: {
      printDeviceId: "PRN-CHECK-1",
      name: "测试标签机",
      deviceType: "label_printer",
      connectionType: "system_printer",
      paperWidthMm: 76,
      paperHeightMm: 50,
      dpi: 203,
      defaultCopies: 1,
      settings: { driverMode: overrides.driverMode ?? "preview_only" },
    },
    driverMode: overrides.driverMode ?? "preview_only",
    jobStatus: overrides.jobStatus ?? "preview_only",
    attemptNo: overrides.attemptNo ?? 1,
    sourcePrintJobId: overrides.sourcePrintJobId ?? "",
    requestedBy: "U-OFFICE-A",
    queuedAt: overrides.jobStatus === "queued" ? "2026-07-02T10:30:00.000Z" : "",
    sentAt: "",
    finishedAt: "",
    errorCode: "",
    errorMessage: "",
    payload: {
      printTemplate: {
        title: "快递快运包裹标签",
        fields: { goodsSummary: "白鲸活动袋 35*27 白印黑 / 1500个 / 3包" },
      },
    },
    metadata: {
      route: "repository_check",
    },
    createdAt: "2026-07-02T10:30:00.000Z",
    updatedAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildOperationLog({ logId, targetId, action, before = null, after = null }) {
  return {
    id: logId,
    targetType: "print_job",
    targetId,
    action,
    before,
    after,
    reason: "print job repository check",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}
