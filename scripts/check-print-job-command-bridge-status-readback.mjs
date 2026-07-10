import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "print-job-command-bridge-status-readback");
const bridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
rmSync(checkStorageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;

const server = createApiServer({
  printDriverAdapterOptions: {
    dryRunEnabled: false,
    systemPrinterEnabled: true,
    systemPrinterAdapterKind: "command_bridge",
    systemPrinterCommand: process.execPath,
    systemPrinterCommandArgs: [
      bridgeScript,
      "--storage-root",
      checkStorageRoot,
      "--print-job-id",
      "{printJobId}",
      "--print-device-id",
      "{printDeviceId}",
      "--print-device-name",
      "{printDeviceName}",
    ],
    commandBridgeSpoolDir: join(checkStorageRoot, "print-command-bridge"),
    allowedPrinterNames: ["PRN-COMMAND-STATUS-CHECK", "状态回读标签机"],
  },
});

try {
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const officeHeaders = { "x-erp-user-id": "U-OFFICE-A" };
  const printDriverHeaders = { "x-erp-user-id": "U-PRINT-DRIVER-A" };

  const fulfillmentList = await getJson(baseUrl, "/api/fulfillments?method=快递快运&pageSize=1", {
    headers: officeHeaders,
  });
  const fulfillmentId = fulfillmentList.items?.[0]?.fulfillmentId;
  if (!fulfillmentId) throw new Error("No express/LTL fulfillment available for command-bridge status check");

  await postJson(
    baseUrl,
    "/api/print-devices",
    {
      printDeviceId: "PRN-COMMAND-STATUS-CHECK",
      name: "状态回读标签机",
      deviceType: "label_printer",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://command-status-check",
      driverName: "Command Bridge Status Check 203dpi",
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
      printDeviceId: "PRN-COMMAND-STATUS-CHECK",
      printAction: "first_print",
      operatorId: "U-OFFICE-A",
    },
    { headers: officeHeaders },
  );
  const printJobId = printFulfillment.printJob?.printJobId;
  if (!printJobId || printFulfillment.printJob?.jobStatus !== "queued") {
    throw new Error("Command-bridge status check did not create a queued print job");
  }

  const dispatchResult = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/dispatch`,
    {
      reason: "command-bridge status readback check",
      operatorId: "U-OFFICE-A",
    },
    { headers: officeHeaders },
  );
  const externalJobId = dispatchResult.dispatchResult?.externalJobId;
  if (
    dispatchResult.printJob?.jobStatus !== "sent" ||
    dispatchResult.dispatchResult?.adapterStatus !== "command_sent" ||
    !externalJobId?.startsWith("PCB-")
  ) {
    throw new Error("/api/print-jobs/{printJobId}/dispatch did not submit through command_bridge");
  }

  const spoolPath = join(checkStorageRoot, "print-command-bridge", "queued", `${externalJobId}.json`);
  if (!existsSync(spoolPath)) {
    throw new Error("Command bridge did not create the expected spool file");
  }

  const pendingPoll = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/poll-status`,
    { reason: "command-bridge queued spool readback" },
    { headers: printDriverHeaders },
  );
  if (
    pendingPoll.beforeStatus !== "sent" ||
    pendingPoll.afterStatus !== "sent" ||
    pendingPoll.updated !== false ||
    pendingPoll.pollResult?.adapterStatus !== "command_bridge_pending" ||
    pendingPoll.pollResult?.status !== "sent" ||
    pendingPoll.pollResult?.driverStatus !== "queued" ||
    !pendingPoll.operationLogId
  ) {
    throw new Error("/api/print-jobs/{printJobId}/poll-status did not preserve queued command-bridge spool status");
  }

  const completeBridgeJob = spawnSync(
    process.execPath,
    [
      bridgeScript,
      "--storage-root",
      checkStorageRoot,
      "--action",
      "complete",
      "--external-job-id",
      externalJobId,
    ],
    { encoding: "utf8" },
  );
  if (completeBridgeJob.status !== 0) {
    throw new Error(`Command bridge complete action failed: ${completeBridgeJob.stderr}`);
  }
  const completeBridgeJobOutput = JSON.parse(completeBridgeJob.stdout);
  if (
    completeBridgeJobOutput.previousStatus !== "queued" ||
    completeBridgeJobOutput.status !== "completed" ||
    completeBridgeJobOutput.statusDirectory !== "completed"
  ) {
    throw new Error("Command bridge complete action returned an unexpected lifecycle summary");
  }

  const completedPoll = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/poll-status`,
    { reason: "command-bridge completed spool readback" },
    { headers: printDriverHeaders },
  );
  if (
    completedPoll.beforeStatus !== "sent" ||
    completedPoll.afterStatus !== "printed" ||
    completedPoll.updated !== true ||
    completedPoll.pollResult?.adapterStatus !== "command_bridge_completed" ||
    completedPoll.pollResult?.status !== "printed" ||
    completedPoll.pollResult?.driverStatus !== "completed" ||
    completedPoll.driverStatusEvent?.eventSource !== "driver_poll" ||
    completedPoll.driverStatusEvent?.operatorId !== "U-PRINT-DRIVER-A" ||
    !completedPoll.operationLogId
  ) {
    throw new Error("/api/print-jobs/{printJobId}/poll-status did not persist completed command-bridge spool status");
  }

  const detailAfterCompletedPoll = await getJson(baseUrl, `/api/print-jobs/${printJobId}`, {
    headers: officeHeaders,
  });
  if (
    detailAfterCompletedPoll.printJob?.jobStatus !== "printed" ||
    detailAfterCompletedPoll.printJob?.metadata?.lastDriverStatusEvent?.driverStatus !== "completed" ||
    detailAfterCompletedPoll.printJob?.metadata?.lastDriverStatusEvent?.metadata?.commandBridge?.bridgeStatus !==
      "completed"
  ) {
    throw new Error("Command-bridge completed spool status was not persisted on the print job");
  }

  const terminalPoll = await postJson(
    baseUrl,
    `/api/print-jobs/${printJobId}/poll-status`,
    { reason: "terminal command-bridge poll should not mutate" },
    { headers: printDriverHeaders },
  );
  if (
    terminalPoll.updated !== false ||
    terminalPoll.pollResult?.adapterStatus !== "terminal_no_poll" ||
    terminalPoll.printJob?.jobStatus !== "printed"
  ) {
    throw new Error("Terminal command-bridge poll mutated a printed job");
  }

  console.log("print-job-command-bridge-status-readback check passed");
} finally {
  await close(server);
}

async function getJson(baseUrl, route, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(`${baseUrl}${route}`, {
    headers: options.headers ?? {},
  });
  const json = await readJson(response);
  if (response.status !== expectedStatus) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  if (expectedStatus < 400 && !response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function postJson(baseUrl, route, body, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (response.status !== expectedStatus) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  if (expectedStatus < 400 && !response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function listen(apiServer) {
  return new Promise((resolve, reject) => {
    apiServer.once("error", reject);
    apiServer.listen(0, "127.0.0.1", resolve);
  });
}

function close(apiServer) {
  if (!apiServer?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    apiServer.close((error) => (error ? reject(error) : resolve()));
  });
}
