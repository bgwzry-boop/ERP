import { completePhysicalPackingFixture } from "./helpers/physicalPackingFixture.mjs";
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
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "print-job-driver-status");
rmSync(checkStorageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;

const server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
  printDriverAdapterOptions: {
    dryRunEnabled: true,
  },
}));
await server.ready;
await listenTestServer(server);

try {
  const baseUrl = getTestServerBaseUrl(server);
  const officeHeaders = { "x-erp-user-id": "U-OFFICE-A" };
  const warehouseHeaders = { "x-erp-user-id": "U-WAREHOUSE-A" };
  const printDriverHeaders = { "x-erp-user-id": "U-PRINT-DRIVER-A" };
  const packing = await completePhysicalPackingFixture(baseUrl);
  const fulfillmentId = packing.fulfillmentId;

  await postJson(
    baseUrl,
    "/api/print-devices",
    {
      printDeviceId: "PRN-DRIVER-STATUS-CHECK",
      name: "驱动状态校验针式打印机",
      deviceType: "dot_matrix",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://driver-status-check",
      driverName: "Driver Status Check 203dpi",
      supportedDocumentTypes: ["delivery_note"],
      defaultDocumentTypes: ["delivery_note"],
      paperWidthMm: 241,
      paperHeightMm: 140,
      paperName: "241mm 连续二联纸",
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
      templateId: "tpl-p0-delivery-note",
      documentType: "delivery_note",
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
