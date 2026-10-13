import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";
import { buildPrintJobOperationLog, buildPrintJobRecord } from "../../helpers/postgresLivePrintFixtures.mjs";

export async function checkPrintApi(runtime, { baseUrl, headers, warehouseHeaders, printDriverHeaders, printJobRepository, postJson, getJson, assertPostgresOperationLogOperator }) {
  const { queryJson, sqlLiteral } = runtime;
  const apiPrintDevice = await postJson(
    baseUrl,
    "/api/print-devices",
    {
      printDeviceId: "PRN-LIVE-API-001",
      name: "API Postgres 标签机",
      deviceType: "label_printer",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://postgres-live-label",
      driverName: "Postgres Live 203dpi Driver",
      supportedDocumentTypes: ["express_ltl_label", "package_label", "pickup_note", "delivery_note", "outbound_note"],
      defaultDocumentTypes: ["express_ltl_label", "pickup_note", "delivery_note"],
      paperWidthMm: 76,
      paperHeightMm: 50,
      paperName: "76x50 热敏标签",
      dpi: 203,
      defaultCopies: 1,
      darkness: 9,
      speed: 4,
      cutterEnabled: false,
      settings: { driverMode: "preview_only", source: "postgres-live-api" },
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(apiPrintDevice.printDevice.printDeviceId, "PRN-LIVE-API-001");
  assert.ok(apiPrintDevice.operationLogId);
  assertPostgresOperationLogOperator(queryJson, apiPrintDevice.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('paperWidthMm', paper_width_mm, 'driver', driver_name) AS result FROM printer_devices WHERE id = 'PRN-LIVE-API-001';",
    ).driver,
    "Postgres Live 203dpi Driver",
  );
  const apiPrintDevices = await getJson(baseUrl, "/api/print-devices?documentType=express_ltl_label", { headers });
  assert.ok(apiPrintDevices.total >= 1);
  assert.ok(apiPrintDevices.items.some((device) => device.printDeviceId === "PRN-LIVE-API-001"));

  const apiLivePrintDeviceMode = await postJson(
    baseUrl,
    "/api/print-devices/PRN-LIVE-API-001/driver-mode",
    {
      driverMode: "system_printer",
      operatorId: "U-SPOOFED",
      reason: "postgres live trusted print projection check",
    },
    { headers },
  );
  assert.equal(apiLivePrintDeviceMode.driverMode, "system_printer");
  const apiPrintCandidateFulfillments = await getJson(baseUrl, "/api/fulfillments?pageSize=50", { headers });
  const apiTrustedPrintFulfillment = apiPrintCandidateFulfillments.items.find((item) => {
    const count = queryJson(
      `SELECT json_build_object('count', COUNT(*)) AS result FROM print_records WHERE target_type = 'fulfillment' AND target_id = ${sqlLiteral(item.fulfillmentId)};`,
    ).count;
    return Number(count) === 0 && item.status !== "已交付";
  });
  assert.ok(apiTrustedPrintFulfillment?.fulfillmentId, "postgres live needs one unprinted fulfillment");
  const apiTrustedPrintInitialStatus = apiTrustedPrintFulfillment.status;
  const apiTrustedPrintMethod =
    apiTrustedPrintFulfillment.method === "express" || apiTrustedPrintFulfillment.method === "快递快运"
      ? "express"
      : apiTrustedPrintFulfillment.method === "delivery" || apiTrustedPrintFulfillment.method === "送货"
        ? "delivery"
        : "pickup";
  const apiTrustedPrintExpectedStatus =
    apiTrustedPrintMethod === "express" ? "待确认拉走" : apiTrustedPrintInitialStatus;
  const apiTrustedPrintRequest = await postJson(
    baseUrl,
    `/api/fulfillments/${apiTrustedPrintFulfillment.fulfillmentId}/print`,
    {
      templateId:
        apiTrustedPrintMethod === "express"
          ? "tpl-p0-express-ltl-label"
          : apiTrustedPrintMethod === "delivery"
            ? "tpl-p0-delivery-note"
            : "tpl-p0-pickup-note",
      documentType:
        apiTrustedPrintMethod === "express"
          ? "express_ltl_label"
          : apiTrustedPrintMethod === "delivery"
            ? "delivery_note"
            : "pickup_note",
      printDeviceId: "PRN-LIVE-API-001",
      printAction: "first_print",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiTrustedPrintInitial({ apiTrustedPrintRequest, apiTrustedPrintInitialStatus });
  assertPostgresOperationLogOperator(queryJson, apiTrustedPrintRequest.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM print_records WHERE id = ${sqlLiteral(apiTrustedPrintRequest.printRecord.printRecordId)};`,
    ).status,
    "submitted",
  );
  const apiTrustedPrintCallback = await postJson(
    baseUrl,
    `/api/print-jobs/${apiTrustedPrintRequest.printJob.printJobId}/driver-status`,
    {
      status: "printed",
      adapterName: "postgres-live-driver",
      eventSource: "driver_callback",
      driverStatus: "completed",
      eventAt: "2026-07-02T10:29:00.000Z",
      operatorId: "PRINT-DRIVER-FREEFORM",
    },
    { headers: printDriverHeaders },
  );
  assert.equal(apiTrustedPrintCallback.printRecord.status, "printed");
  assert.equal(apiTrustedPrintCallback.fulfillment.status, apiTrustedPrintExpectedStatus);
  assert.equal(apiTrustedPrintCallback.physicalPrintConfirmed, true);
  assert.ok(apiTrustedPrintCallback.operationLogId);
  assert.ok(apiTrustedPrintCallback.fulfillmentOperationLogId);
  assert.notEqual(apiTrustedPrintCallback.operationLogId, apiTrustedPrintCallback.fulfillmentOperationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM print_records WHERE id = ${sqlLiteral(apiTrustedPrintRequest.printRecord.printRecordId)};`,
    ).status,
    "printed",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(apiTrustedPrintFulfillment.fulfillmentId)};`,
    ).status,
    apiTrustedPrintExpectedStatus,
  );
  const apiTrustedPrintProjectionLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiTrustedPrintCallback.fulfillmentOperationLogId)};`,
  );
  assert.equal(apiTrustedPrintProjectionLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiTrustedPrintProjectionLog.action, "confirm_fulfillment_print_from_driver");

  const apiSeedPrintJobWorkspace = { printJobs: [], operationLogs: [] };
  const apiSeedPrintJob = buildPrintJobRecord({
    printJobId: "PJ-LIVE-API-001",
    printRecordId: "PR-LIVE-FULFILLMENT-001",
    printDeviceId: "PRN-LIVE-API-001",
    jobStatus: "queued",
    driverMode: "system_printer",
  });
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiSeedPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-001",
      printJob: apiSeedPrintJob,
      action: "create_print_job",
    }),
  });
  const apiPrintJobList = await getJson(baseUrl, "/api/print-jobs?printRecordId=PR-LIVE-FULFILLMENT-001", {
    headers,
  });
  assert.ok(apiPrintJobList.items.some((job) => job.printJobId === "PJ-LIVE-API-001"));
  const apiDispatchedPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/dispatch",
    {
      reason: "postgres live dispatch boundary",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiDispatchedPrintJob({ apiDispatchedPrintJob });
  assertPostgresOperationLogOperator(queryJson, apiDispatchedPrintJob.operationLogId);
  const apiFailedPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/status",
    {
      status: "failed",
      errorCode: "LIVE_API_DRIVER_TIMEOUT",
      errorMessage: "postgres live API simulated driver timeout",
      reason: "postgres live status callback",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiFailedPrintJob({ apiFailedPrintJob });
  assertPostgresOperationLogOperator(queryJson, apiFailedPrintJob.operationLogId);
  const apiRetryPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/retry",
    {
      retryReason: "postgres live retry",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiRetryPrintJob({ apiRetryPrintJob });
  assertPostgresOperationLogOperator(queryJson, apiRetryPrintJob.operationLogId);

  const apiPollingPrintJob = {
    ...buildPrintJobRecord({
      printJobId: "PJ-LIVE-API-POLL-001",
      printRecordId: "PR-LIVE-FULFILLMENT-001",
      printDeviceId: "PRN-LIVE-API-001",
      jobStatus: "sent",
      driverMode: "system_printer",
    }),
    queuedAt: "2026-07-02T10:40:00.000Z",
    sentAt: "2026-07-02T10:41:00.000Z",
    metadata: {
      source: "postgres-live",
      externalJobId: "DRY-PJ-LIVE-API-POLL-001",
    },
  };
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiPollingPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-POLL-001",
      printJob: apiPollingPrintJob,
      action: "create_print_job",
    }),
  });
  const deniedApiStatusPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    {
      statuses: ["sent"],
      reason: "postgres live warehouse poll denial",
    },
    { headers: warehouseHeaders, expectedStatus: 403 },
  );
  assert.equal(deniedApiStatusPoll.requiredPermission, "print.job.callback");
  const apiStatusPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    {
      statuses: ["sent"],
      reason: "postgres live dry-run poll",
    },
    { headers: printDriverHeaders },
  );
  const apiStatusPollItem = apiStatusPoll.items.find((item) => item.printJobId === "PJ-LIVE-API-POLL-001");
  assert.equal(apiStatusPollItem.beforeStatus, "sent");
  assert.equal(apiStatusPollItem.afterStatus, "printed");
  assert.equal(apiStatusPollItem.pollResult.adapterStatus, "dry_run_completed");
  assert.equal(apiStatusPollItem.driverStatusEvent.operatorId, "U-PRINT-DRIVER-A");
  assert.ok(apiStatusPollItem.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', job_status, 'eventSource', metadata_json->'lastDriverStatusEvent'->>'eventSource') AS result FROM print_jobs WHERE id = 'PJ-LIVE-API-POLL-001';",
    ).status,
    "printed",
  );
  const apiStatusPollOperationLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiStatusPollItem.operationLogId)};`,
  );
  assert.equal(apiStatusPollOperationLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiStatusPollOperationLog.action, "record_print_job_driver_status");

  const apiCallbackPrintJob = {
    ...buildPrintJobRecord({
      printJobId: "PJ-LIVE-API-CALLBACK-001",
      printRecordId: "PR-LIVE-FULFILLMENT-001",
      printDeviceId: "PRN-LIVE-API-001",
      jobStatus: "sent",
      driverMode: "system_printer",
    }),
    queuedAt: "2026-07-02T10:30:00.000Z",
    sentAt: "2026-07-02T10:31:00.000Z",
    metadata: {
      source: "postgres-live",
      externalJobId: "SYS-LIVE-API-CALLBACK-001",
    },
  };
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiCallbackPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-CALLBACK-001",
      printJob: apiCallbackPrintJob,
      action: "create_print_job",
    }),
  });
  const apiCallbackPrintJobDetail = await getJson(baseUrl, "/api/print-jobs/PJ-LIVE-API-CALLBACK-001", {
    headers,
  });
  assert.equal(apiCallbackPrintJobDetail.printJob.jobStatus, "sent");
  const apiDriverStatusPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-CALLBACK-001/driver-status",
    {
      status: "printed",
      externalJobId: "SYS-LIVE-API-CALLBACK-001",
      adapterName: "postgres-live-driver",
      eventSource: "driver_callback",
      driverStatus: "completed",
      eventAt: "2026-07-02T10:32:00.000Z",
      message: "postgres live callback completed",
      operatorId: "PRINT-DRIVER-FREEFORM",
    },
    { headers: printDriverHeaders },
  );
  postgresAssertions.assertApiDriverStatusPrintJob({ apiDriverStatusPrintJob });
  const apiDriverStatusOperationLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiDriverStatusPrintJob.operationLogId)};`,
  );
  assert.equal(apiDriverStatusOperationLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiDriverStatusOperationLog.action, "record_print_job_driver_status");

  const apiPrintBatchBody = {
    printBatchId: "PB-LIVE-API-001",
    idempotencyKey: "print-batch-live-api-001",
    action: "批量打印标签",
    resultLabel: "部分打出",
    status: "partial",
    todoIds: ["T-LIVE-API-PRINT-001"],
    todoRefs: ["ORD-LIVE-API-PRINT-001"],
    totalTaskCount: 1,
    totalLabelCount: 3,
    printedLabelCount: 2,
    pendingLabelCount: 1,
    printedPackageIds: ["PKG-LIVE-API-PRINT-001", "PKG-LIVE-API-PRINT-002"],
    pendingPackageIds: ["PKG-LIVE-API-PRINT-003"],
    printPackages: [
      { packageId: "PKG-LIVE-API-PRINT-001", packageSeq: 1, packageCount: 3, status: "printed" },
      { packageId: "PKG-LIVE-API-PRINT-002", packageSeq: 2, packageCount: 3, status: "printed" },
      { packageId: "PKG-LIVE-API-PRINT-003", packageSeq: 3, packageCount: 3, status: "not_printed" },
    ],
    operatorId: "U-SPOOFED",
    operatorName: "伪造操作人",
    createdAt: "今天 10:30",
  };
  const apiPrintBatch = await postJson(
    baseUrl,
    "/api/print-batches",
    apiPrintBatchBody,
    { headers },
  );
  postgresAssertions.assertApiPrintBatch({ apiPrintBatch });
  const replayedApiPrintBatch = await postJson(baseUrl, "/api/print-batches", apiPrintBatchBody, { headers });
  assert.equal(replayedApiPrintBatch.operationLogId, apiPrintBatch.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', status, 'pending', pending_package_ids[1]) AS result FROM print_batch_records WHERE id = 'PB-LIVE-API-001';",
    ).pending,
    "PKG-LIVE-API-PRINT-003",
  );
  const apiPrintBatchList = await getJson(baseUrl, "/api/print-batches?todoId=T-LIVE-API-PRINT-001", { headers });
  assert.equal(apiPrintBatchList.total, 1);
  assert.equal(apiPrintBatchList.items[0].printBatchId, "PB-LIVE-API-001");
}
