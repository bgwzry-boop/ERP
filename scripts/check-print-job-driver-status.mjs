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

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "print-job-driver-status");
rmSync(checkStorageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;

const server = createApiServer({
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
  if (!fulfillmentId) throw new Error("No express/LTL fulfillment available for print driver status check");

  await postJson(
    baseUrl,
    "/api/print-devices",
    {
      printDeviceId: "PRN-DRIVER-STATUS-CHECK",
      name: "驱动状态校验标签机",
      deviceType: "label_printer",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://driver-status-check",
      driverName: "Driver Status Check 203dpi",
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
      printDeviceId: "PRN-DRIVER-STATUS-CHECK",
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
      reason: "dry-run driver status check",
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

  const detailBeforeCallback = await getJson(baseUrl, `/api/print-jobs/${printJobId}`);
  if (detailBeforeCallback.printJob?.jobStatus !== "sent") {
    throw new Error("/api/print-jobs/{printJobId} did not return the sent print job detail");
  }

  const deniedWarehouseCallback = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/driver-status`,
    {
      status: "printed",
      externalJobId: `DRY-${printJobId}`,
      adapterName: "dry-run-check",
    },
    { expectedStatus: 403, headers: warehouseHeaders },
  );
  if (deniedWarehouseCallback.requiredPermission !== "print.job.callback") {
    throw new Error("/api/print-jobs/{printJobId}/driver-status did not require service callback permission");
  }

  const mismatchedCallback = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/driver-status`,
    {
      status: "printed",
      externalJobId: `WRONG-${printJobId}`,
      adapterName: "dry-run-check",
    },
    { expectedStatus: 409, headers: printDriverHeaders },
  );
  if (mismatchedCallback.code !== "PRINT_JOB_EXTERNAL_ID_MISMATCH") {
    throw new Error("/api/print-jobs/{printJobId}/driver-status did not reject mismatched external job id");
  }

  const driverStatus = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/driver-status`,
    {
      status: "printed",
      externalJobId: `DRY-${printJobId}`,
      adapterName: "dry-run-check",
      eventSource: "driver_callback",
      driverStatus: "completed",
      message: "dry-run callback completed",
      operatorId: "PRINT-DRIVER-FREEFORM",
    },
    { headers: printDriverHeaders },
  );
  if (
    driverStatus.printJob?.jobStatus !== "printed" ||
    !driverStatus.printJob?.finishedAt ||
    driverStatus.driverStatusEvent?.externalJobId !== `DRY-${printJobId}` ||
    driverStatus.driverStatusEvent?.operatorId !== "U-PRINT-DRIVER-A" ||
    driverStatus.printJob?.metadata?.lastDriverStatusEvent?.driverStatus !== "completed" ||
    driverStatus.printJob?.metadata?.lastDriverStatusEvent?.metadata?.reportedBy !== "PRINT-DRIVER-FREEFORM" ||
    !driverStatus.operationLogId
  ) {
    throw new Error("/api/print-jobs/{printJobId}/driver-status did not persist printed status");
  }

  const operationLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=print_job&targetId=${encodeURIComponent(printJobId)}&limit=10`,
    { headers: officeHeaders },
  );
  const callbackLog = operationLogs.items?.find((log) => log.action === "record_print_job_driver_status");
  if (callbackLog?.operatorId !== "U-PRINT-DRIVER-A") {
    throw new Error("/api/print-jobs/{printJobId}/driver-status did not write operation log under service account");
  }

  const regressionCallback = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/driver-status`,
    {
      status: "sent",
      externalJobId: `DRY-${printJobId}`,
      adapterName: "dry-run-check",
    },
    { expectedStatus: 409, headers: printDriverHeaders },
  );
  if (regressionCallback.code !== "PRINT_JOB_TERMINAL_STATUS_LOCKED") {
    throw new Error("/api/print-jobs/{printJobId}/driver-status did not lock terminal status");
  }

  console.log("print-job-driver-status check passed");
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
}

async function getJson(baseUrl, route, options = {}) {
  return getSharedJson(baseUrl, route, options);
}

async function postJson(baseUrl, route, body, options = {}) {
  return postSharedJson(baseUrl, route, body, options);
}
