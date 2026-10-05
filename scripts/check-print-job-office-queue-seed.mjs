import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer,
  getJson,
  getTestServerBaseUrl,
  listenTestServer,
  postJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "print-job-office-queue");
rmSync(checkStorageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;
delete process.env.ERP_PRINT_DRIVER_DRY_RUN;
delete process.env.ERP_SYSTEM_PRINTER_ENABLED;
delete process.env.ERP_SYSTEM_PRINTER_ADAPTER;
delete process.env.ERP_SYSTEM_PRINTER_COMMAND;
delete process.env.ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON;
delete process.env.ERP_SYSTEM_PRINTER_COMMAND_TIMEOUT_MS;
delete process.env.ERP_SYSTEM_PRINTER_ALLOWLIST;

const server = createApiServer({ allowLocalFixture: true });

try {
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);

  const initialList = await getJson(baseUrl, "/api/print-jobs?pageSize=10", {
    headers: { "x-erp-user-id": "U-OFFICE-A" },
  });
  const queuedJob = initialList.items.find((item) => item.printJobId === "PJ-DEMO-QUEUED-DISPATCH");
  const failedJob = initialList.items.find((item) => item.printJobId === "PJ-DEMO-FAILED-RETRY");
  assert.equal(queuedJob?.jobStatus, "queued", "seed should include a queued print job");
  assert.equal(queuedJob?.driverMode, "system_printer", "queued demo job should exercise guarded system-printer dispatch");
  assert.equal(failedJob?.jobStatus, "failed", "seed should include a failed print job");
  assert.equal(failedJob?.errorCode, "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED", "failed demo job should explain the driver boundary");

  const dispatchResult = await postJson(
    baseUrl,
    `/api/print-jobs/${encodeURIComponent(queuedJob.printJobId)}/dispatch`,
    {
      operatorId: "U-OFFICE-A",
      reason: "office queue seed check dispatch",
    },
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(dispatchResult.printJob.printJobId, queuedJob.printJobId);
  assert.equal(dispatchResult.printJob.jobStatus, "failed", "guarded dispatch should make the job visibly failed");
  assert.equal(dispatchResult.dispatchResult.adapterStatus, "failed");
  assert.equal(dispatchResult.dispatchResult.errorCode, "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED");

  const retryResult = await postJson(
    baseUrl,
    `/api/print-jobs/${encodeURIComponent(failedJob.printJobId)}/retry`,
    {
      operatorId: "U-OFFICE-A",
      retryReason: "office queue seed check retry",
    },
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(retryResult.sourcePrintJob.printJobId, failedJob.printJobId);
  assert.equal(retryResult.printJob.sourcePrintJobId, failedJob.printJobId);
  assert.equal(retryResult.printJob.jobStatus, "queued", "retry should create a new queued job for office dispatch");
  assert.match(retryResult.printJob.printJobId, /^PJ-PJ-DEMO-FAILED-RETRY-retry-2-/);

  const queuedList = await getJson(baseUrl, "/api/print-jobs?status=queued&pageSize=10", {
    headers: { "x-erp-user-id": "U-OFFICE-A" },
  });
  assert(
    queuedList.items.some((item) => item.printJobId === retryResult.printJob.printJobId),
    "queued list should include the new retry job",
  );

  const restartedServer = createApiServer({ allowLocalFixture: true });
  await listenTestServer(restartedServer);
  const restartBaseUrl = getTestServerBaseUrl(restartedServer);
  try {
    const afterRestart = await getJson(restartBaseUrl, "/api/print-jobs?pageSize=20", {
      headers: { "x-erp-user-id": "U-OFFICE-A" },
    });
    assert.equal(
      afterRestart.items.filter((item) => item.printJobId === "PJ-DEMO-QUEUED-DISPATCH").length,
      1,
      "demo queued job should persist without duplication after API restart",
    );
    assert(
      afterRestart.items.some((item) => item.printJobId === retryResult.printJob.printJobId),
      "retry job should persist through local print-job repository restart",
    );
  } finally {
    await closeTestServer(restartedServer);
  }

  console.log("Print job office queue seed check passed: queued dispatch, failed retry, and restart persistence are covered.");
} finally {
  await closeTestServer(server);
}
