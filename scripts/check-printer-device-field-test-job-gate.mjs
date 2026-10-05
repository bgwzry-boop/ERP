import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer,
  getJson as getSharedJson,
  getTestServerBaseUrl,
  listenTestServer,
  postJson as postSharedJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const storageRoot = mkdtempSync(join(tmpdir(), "erp-printer-qa-gate-"));
const server = createApiServer({ allowLocalFixture: true,
  printDeviceRepositoryOptions: { storageRoot },
  printJobRepositoryOptions: { storageRoot },
  printerDeviceFieldTestRepositoryOptions: { storageRoot },
});
await server.ready;
await listenTestServer(server);

try {
  const baseUrl = getTestServerBaseUrl(server);
  await postJson(baseUrl, "/print-devices/PRN-LABEL-A/driver-mode", {
    driverMode: "system_printer",
    reason: "isolated field-test job gate check",
  });

  const evidence = {
    samplePrintReference: "隔离验收样张已出纸且对位通过",
    barcodeScanText: "F003-PKG-1 可扫码",
    driverCallbackStatus: "spool completed -> printed",
    voidReprintReference: "隔离旧单作废并重打通过",
    operatorAcceptance: "隔离测试现场签认",
  };
  const checks = [
    "sample_print",
    "paper_alignment",
    "barcode_scan",
    "driver_callback",
    "legibility",
    "void_reprint",
  ].map((key) => ({ key, status: "passed" }));
  const baseRecord = {
    printDeviceId: "PRN-LABEL-A",
    documentType: "express_ltl_label",
    checks,
    evidence,
    note: "isolated V8.167 HTTP gate check",
  };

  const missingJob = await postJson(
    baseUrl,
    "/print-devices/PRN-LABEL-A/field-tests",
    { ...baseRecord, recordId: "PDQA-V8167-MISSING-JOB" },
    422,
  );
  assert.equal(missingJob.code, "PRINTER_DEVICE_FIELD_TEST_PRINTED_JOB_REQUIRED");

  const seededPrintJob = await getJson(baseUrl, "/print-jobs/PJ-DEMO-QUEUED-DISPATCH");
  assert.equal(seededPrintJob.printJob.jobStatus, "queued");
  assert.equal(seededPrintJob.printJob.targetId, "F003");
  const printJobId = seededPrintJob.printJob.printJobId;

  const queuedJob = await postJson(
    baseUrl,
    "/print-devices/PRN-LABEL-A/field-tests",
    { ...baseRecord, recordId: "PDQA-V8167-QUEUED-JOB", printJobId },
    409,
  );
  assert.equal(queuedJob.code, "PRINTER_DEVICE_FIELD_TEST_PRINT_JOB_NOT_PRINTED");

  const printed = await postJson(baseUrl, `/print-jobs/${encodeURIComponent(printJobId)}/status`, {
    status: "printed",
    externalJobId: printJobId,
    idempotencyKey: "v8-167-isolated-print-job-status",
  });
  assert.equal(printed.printJob.jobStatus, "printed");
  const beforeQaRevision = printed.printJob.revision;

  const accepted = await postJson(baseUrl, "/print-devices/PRN-LABEL-A/field-tests", {
    ...baseRecord,
    recordId: "PDQA-V8167-PRINTED-JOB",
    printJobId,
    idempotencyKey: "v8-167-isolated-field-test",
  });
  assert.equal(accepted.acceptance.ready, true);
  assert.equal(accepted.acceptance.printedJobLinked, true);
  assert.equal(accepted.resultStatus.recordSaved, true);
  assert.equal(accepted.resultStatus.onsiteAcceptancePassed, true);
  assert.equal(accepted.resultStatus.physicalPrinterCalledByRequest, false);
  assert.equal(accepted.resultStatus.printJobStatusChangedByRequest, false);
  assert.equal(accepted.safeguards.nonPrinting, true);
  assert.equal(accepted.safeguards.physicalPrinterCalled, false);

  const afterQa = await getJson(baseUrl, `/print-jobs/${encodeURIComponent(printJobId)}`);
  assert.equal(afterQa.printJob.jobStatus, "printed");
  assert.equal(afterQa.printJob.revision, beforeQaRevision);

  const readiness = await getJson(baseUrl, "/print-driver/v1-readiness");
  const labelQaCriterion = readiness.criteria.find(
    (item) => item.key === "express-ltl-label-printer-field-qa",
  );
  assert.equal(labelQaCriterion.status, "passed");
  assert.equal(labelQaCriterion.evidence.printJobId, printJobId);
  assert.equal(labelQaCriterion.evidence.printJobStatus, "printed");
  assert.equal(labelQaCriterion.evidence.printedJobLinked, true);
  assert.equal(readiness.ready, false, "one isolated label-printer QA must not open the complete print gate");

  console.log(
    "Printer device field-test job gate HTTP check passed: missing/queued jobs are rejected, printed jobs are accepted, and QA remains non-printing.",
  );
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
  rmSync(storageRoot, { recursive: true, force: true });
}

async function getJson(baseUrl, route) {
  return getSharedJson(baseUrl, `/api${route}`);
}

async function postJson(baseUrl, route, body, expectedStatus = 200) {
  return postSharedJson(baseUrl, `/api${route}`, body, {
    expectedStatus,
  });
}
