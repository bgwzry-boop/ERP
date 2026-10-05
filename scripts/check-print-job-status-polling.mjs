import { rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer,
  getJson as getSharedJson,
  getTestServerBaseUrl,
  listenTestServer,
  postJson as postSharedJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "print-job-status-polling");
rmSync(checkStorageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;

const server = createApiServer({ allowLocalFixture: true,
  printDriverAdapterOptions: {
    dryRunEnabled: true,
  },
});
await server.ready;
await listenTestServer(server);

try {
  const baseUrl = getTestServerBaseUrl(server);
  const officeHeaders = { "x-erp-user-id": "U-OFFICE-A" };
  const warehouseHeaders = { "x-erp-user-id": "U-WAREHOUSE-A" };
  const printDriverHeaders = { "x-erp-user-id": "U-PRINT-DRIVER-A" };

  const fulfillmentList = await getJson(baseUrl, "/api/fulfillments?method=快递快运&pageSize=1");
  const fulfillmentId = fulfillmentList.items?.[0]?.fulfillmentId;
  if (!fulfillmentId) throw new Error("No express/LTL fulfillment available for print polling check");

  await postJson(
    baseUrl,
    "/api/print-devices",
    {
      printDeviceId: "PRN-STATUS-POLL-CHECK",
      name: "状态轮询校验标签机",
      deviceType: "label_printer",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://status-poll-check",
      driverName: "Status Poll Check 203dpi",
      supportedDocumentTypes: ["express_ltl_label"],
      defaultDocumentTypes: ["express_ltl_label"],
      paperWidthMm: 76,
      paperHeightMm: 50,
      paperName: "76x50 热敏标签",
      dpi: 203,
      defaultCopies: 1,
      settings: { driverMode: "system_printer" },
      operatorId: "U-OFFICE-A",
    },
    { headers: officeHeaders },
  );

  const printFulfillment = await postJson(
    baseUrl,
    `/api/fulfillments/${fulfillmentId}/print`,
    {
      templateId: "tpl-p0-express-label",
      documentType: "express_ltl_label",
      printDeviceId: "PRN-STATUS-POLL-CHECK",
      printAction: "first_print",
      operatorId: "U-OFFICE-A",
    },
    { headers: officeHeaders },
  );
  const printJobId = printFulfillment.printJob?.printJobId;
  if (!printJobId || printFulfillment.printJob?.jobStatus !== "queued") {
    throw new Error("System-printer fulfillment print did not create a queued print job");
  }

  const dispatchResult = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/dispatch`,
    {
      reason: "dry-run status polling check",
      operatorId: "U-OFFICE-A",
    },
    { headers: officeHeaders },
  );
  if (
    dispatchResult.printJob?.jobStatus !== "sent" ||
    dispatchResult.dispatchResult?.adapterStatus !== "dry_run_sent" ||
    dispatchResult.dispatchResult?.externalJobId !== `DRY-${printJobId}`
  ) {
    throw new Error("/api/print-jobs/{printJobId}/dispatch did not dry-run send the print job");
  }

  const deniedBatchPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    { reason: "warehouse should not poll driver state" },
    { expectedStatus: 403, headers: warehouseHeaders },
  );
  if (deniedBatchPoll.requiredPermission !== "print.job.callback") {
    throw new Error("/api/print-jobs/status-poll did not require service callback permission");
  }

  const batchPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    { statuses: ["sent"], reason: "dry-run batch status polling" },
    { headers: printDriverHeaders },
  );
  const batchItem = batchPoll.items?.find((item) => item.printJobId === printJobId);
  if (
    batchPoll.updatedCount !== 1 ||
    batchItem?.beforeStatus !== "sent" ||
    batchItem?.afterStatus !== "printed" ||
    batchItem?.pollResult?.adapterStatus !== "dry_run_completed" ||
    batchItem?.driverStatusEvent?.eventSource !== "driver_poll" ||
    batchItem?.driverStatusEvent?.operatorId !== "U-PRINT-DRIVER-A" ||
    !batchItem?.operationLogId
  ) {
    throw new Error("/api/print-jobs/status-poll did not poll and persist the sent print job");
  }

  const detailAfterBatchPoll = await getJson(baseUrl, `/api/print-jobs/${printJobId}`);
  if (
    detailAfterBatchPoll.printJob?.jobStatus !== "printed" ||
    detailAfterBatchPoll.printJob?.metadata?.lastDriverStatusEvent?.eventSource !== "driver_poll" ||
    detailAfterBatchPoll.printJob?.metadata?.lastDriverStatusEvent?.driverStatus !== "completed"
  ) {
    throw new Error("/api/print-jobs/status-poll did not persist driver poll metadata");
  }

  const operationLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=print_job&targetId=${encodeURIComponent(printJobId)}&limit=10`,
    { headers: officeHeaders },
  );
  const pollLog = operationLogs.items?.find((log) => log.action === "record_print_job_driver_status");
  if (pollLog?.operatorId !== "U-PRINT-DRIVER-A") {
    throw new Error("/api/print-jobs/status-poll did not write operation log under service account");
  }

  const singlePollAfterTerminal = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/poll-status`,
    { reason: "terminal poll should not mutate" },
    { headers: printDriverHeaders },
  );
  if (
    singlePollAfterTerminal.updated !== false ||
    singlePollAfterTerminal.pollResult?.adapterStatus !== "terminal_no_poll" ||
    singlePollAfterTerminal.printJob?.jobStatus !== "printed"
  ) {
    throw new Error("/api/print-jobs/{printJobId}/poll-status did not preserve terminal print jobs");
  }

  console.log("print-job-status-polling check passed");
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
}

async function getJson(baseUrl, route, options = {}) {
  return getSharedJson(baseUrl, route, options);
}

async function postJson(baseUrl, route, body, options = {}) {
  return postSharedJson(baseUrl, route, body, options);
}
