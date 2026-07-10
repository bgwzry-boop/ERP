import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  dispatchOfficePrintJob,
  listOfficePrintJobs,
  normalizePrintJobForClient,
  retryOfficePrintJob,
} from "../src/services/officePrintJobApiClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const printJob = {
  printJobId: "PJ-FRONT-CHECK-1",
  bizNo: "PJ-FRONT-CHECK-1",
  printRecordId: "PR-FRONT-CHECK-1",
  targetType: "fulfillment",
  targetId: "F003",
  documentType: "express_ltl_label",
  templateId: "tpl-p0-express-ltl-label",
  printDeviceId: "PRN-LABEL-A",
  printDeviceSnapshot: {
    printDeviceId: "PRN-LABEL-A",
    name: "标签机A",
    settings: { driverMode: "system_printer" },
  },
  driverMode: "system_printer",
  jobStatus: "queued",
  attemptNo: 1,
  requestedBy: "U-OFFICE-A",
  queuedAt: "2026-07-02T12:20:00.000Z",
  metadata: {
    route: "fulfillment_print",
  },
};
const failedPrintJob = {
  ...printJob,
  printJobId: "PJ-FRONT-CHECK-FAILED",
  jobStatus: "failed",
  errorCode: "SYSTEM_PRINTER_COMMAND_FAILED",
  errorMessage: "adapter failed",
};

const listCalls = [];
const listResult = await listOfficePrintJobs(
  {
    authState,
    operatorId: "U-OFFICE-A",
    query: { status: "queued", targetType: "fulfillment", pageSize: 8 },
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      listCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [printJob],
        page: 1,
        pageSize: 8,
        total: 1,
      });
    },
  },
);

assert(listResult.source === "api", "print job list should use API response");
assert(listCalls[0]?.url.includes("/api/print-jobs?"), "print job list URL is incorrect");
assert(listCalls[0]?.url.includes("status=queued"), "print job list missed status query");
assert(listCalls[0]?.url.includes("targetType=fulfillment"), "print job list missed target type query");
assert(listCalls[0]?.init.method === "GET", "print job list method is incorrect");
assert(listCalls[0]?.init.headers["x-erp-user-id"] === "U-OFFICE-A", "print job list missed seed user header");
assert(listResult.items[0]?.printDeviceName === "标签机A", "print job list missed print device name");
assert(listResult.items[0]?.driverMode === "system_printer", "print job list missed driver mode");

const dispatchCalls = [];
const dispatchResult = await dispatchOfficePrintJob(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.print-job-check" },
    },
    printJobId: printJob.printJobId,
    operatorId: "U-OFFICE-A",
    reason: "front check dispatch",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      dispatchCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        printJob: {
          ...printJob,
          jobStatus: "sent",
          sentAt: "2026-07-02T12:22:00.000Z",
        },
        dispatchResult: {
          adapterStatus: "command_sent",
          jobStatus: "sent",
          externalJobId: "EXT-PJ-FRONT-CHECK-1",
          dispatchedAt: "2026-07-02T12:22:00.000Z",
        },
        operationLogId: "LOG-PRINT-JOB-DISPATCH-1",
      });
    },
  },
);

assert(dispatchResult.source === "api", "print job dispatch should use API response");
assert(
  dispatchCalls[0]?.url === "http://127.0.0.1:8787/api/print-jobs/PJ-FRONT-CHECK-1/dispatch",
  "print job dispatch URL is incorrect",
);
assert(dispatchCalls[0]?.init.method === "POST", "print job dispatch method is incorrect");
assert(dispatchCalls[0]?.init.headers.authorization === "Bearer seed-session.print-job-check", "print job dispatch missed bearer auth");
assert(dispatchCalls[0]?.body.operatorId === "U-OFFICE-A", "print job dispatch missed operator id");
assert(dispatchResult.printJob.jobStatus === "sent", "print job dispatch did not map job status");
assert(dispatchResult.dispatchResult.adapterStatus === "command_sent", "print job dispatch did not map adapter status");

const retryCalls = [];
const retryResult = await retryOfficePrintJob(
  {
    authState,
    printJobId: failedPrintJob.printJobId,
    operatorId: "U-OFFICE-A",
    retryReason: "front check retry",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      retryCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        sourcePrintJob: failedPrintJob,
        printJob: {
          ...failedPrintJob,
          printJobId: "PJ-FRONT-CHECK-FAILED-RETRY-2",
          jobStatus: "queued",
          attemptNo: 2,
          sourcePrintJobId: failedPrintJob.printJobId,
          errorCode: "",
          errorMessage: "",
        },
        operationLogId: "LOG-PRINT-JOB-RETRY-1",
      });
    },
  },
);

assert(retryResult.source === "api", "print job retry should use API response");
assert(
  retryCalls[0]?.url === "http://127.0.0.1:8787/api/print-jobs/PJ-FRONT-CHECK-FAILED/retry",
  "print job retry URL is incorrect",
);
assert(retryCalls[0]?.body.retryReason === "front check retry", "print job retry missed reason");
assert(retryResult.sourcePrintJob.jobStatus === "failed", "print job retry missed source job");
assert(retryResult.printJob.attemptNo === 2, "print job retry did not map retry attempt");
assert(retryResult.printJob.sourcePrintJobId === failedPrintJob.printJobId, "print job retry did not map source job id");

const deniedResult = await dispatchOfficePrintJob(
  {
    authState,
    printJobId: printJob.printJobId,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => createJsonResponse(403, {
      error: {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: fulfillment.print",
        requiredPermission: "fulfillment.print",
      },
    }),
  },
);

assert(deniedResult.blocked === true, "print job dispatch permission denial should be blocked");
assert(deniedResult.error.requiredPermission === "fulfillment.print", "print job dispatch denial missed permission");

const offlineDispatchResult = await dispatchOfficePrintJob(
  {
    authState,
    printJobId: printJob.printJobId,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => {
      throw new Error("print job dispatch offline");
    },
  },
);

assert(offlineDispatchResult.blocked === true, "print job dispatch should not fake local dispatch when API is unavailable");
assert(offlineDispatchResult.error.code === "PRINT_JOB_DISPATCH_API_UNAVAILABLE", "print job dispatch offline code is incorrect");

const localListResult = await listOfficePrintJobs(
  {
    authState,
    query: { status: "failed", pageSize: 1 },
    operatorId: "U-OFFICE-A",
    localPrintJobs: [printJob, failedPrintJob],
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => {
      throw new Error("print job list offline");
    },
  },
);

assert(localListResult.source === "local_fallback", "print job list should fall back locally on network failure");
assert(localListResult.items.length === 1, "print job local fallback should filter status and page size");
assert(localListResult.items[0].printJobId === failedPrintJob.printJobId, "print job local fallback returned wrong job");

const normalized = normalizePrintJobForClient({
  id: "PJ-NORMALIZE",
  status: "queued",
  printDeviceSnapshot: { name: "针式打印机A", settings: { driverMode: "preview_only" } },
});
assert(normalized.printJobId === "PJ-NORMALIZE", "print job normalization should read id fallback");
assert(normalized.printDeviceName === "针式打印机A", "print job normalization missed device name");
assert(normalized.driverMode === "preview_only", "print job normalization missed driver mode fallback");

const missingJobResult = await dispatchOfficePrintJob({ authState, printJobId: "" });
assert(missingJobResult.blocked === true, "print job dispatch should require job id");
assert(missingJobResult.error.code === "PRINT_JOB_REQUIRED", "print job missing-job code is incorrect");

console.log("Frontend print job API client check passed: list, dispatch, retry, denial blocking, offline safety, local list fallback, and normalization are covered.");

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
