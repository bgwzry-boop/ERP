import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  listOfficePrinterDeviceFieldTests,
  listOfficePrintDevices,
  normalizePrinterDeviceFieldTestRecordForClient,
  recordOfficePrinterDeviceFieldTest,
  updateOfficePrintDeviceDriverMode,
} from "../src/services/officePrinterDeviceApiClient.js";
import {
  createPrinterDeviceFieldTestChecks,
  getPrinterDeviceFieldTestEvidenceSummary,
  getPrinterDeviceFieldTestSummary,
  normalizePrinterDeviceFieldTestEvidence,
} from "../src/services/printerDeviceFieldTestClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const printDevice = {
  printDeviceId: "PRN-LABEL-A",
  name: "标签机A",
  deviceType: "label_printer",
  status: "active",
  connectionType: "system_printer",
  connectionUri: "system://label-printer-a",
  driverName: "Generic 203dpi Label",
  supportedDocumentTypes: ["express_ltl_label", "package_label"],
  defaultDocumentTypes: ["express_ltl_label"],
  paperWidthMm: 80,
  paperHeightMm: 60,
  paperName: "80x60 热敏标签",
  isContinuous: false,
  dpi: 203,
  defaultCopies: 1,
  darkness: 8,
  speed: 4,
  cutterEnabled: false,
  settings: { driverMode: "preview_only" },
};
const printJob = {
  printJobId: "PJ-API-FIELD-1",
  printRecordId: "PR-API-FIELD-1",
  targetType: "fulfillment",
  targetId: "F003",
  documentType: "express_ltl_label",
  printDeviceId: printDevice.printDeviceId,
  jobStatus: "preview_only",
  attemptNo: 1,
};
const checks = createPrinterDeviceFieldTestChecks().map((item) => {
  if (["sample_print", "paper_alignment", "barcode_scan", "legibility"].includes(item.key)) {
    return { ...item, status: "passed" };
  }
  if (item.key === "driver_callback") return { ...item, status: "blocked" };
  return item;
});
const evidence = normalizePrinterDeviceFieldTestEvidence({
  samplePrintReference: "PJ-API-FIELD-1 样张已出纸",
  barcodeScanText: "F003-PKG-1",
  driverCallbackStatus: "spool sent",
  voidReprintReference: "",
  operatorAcceptance: "办公室A 现场确认",
});
const record = {
  recordId: "PDQA-FRONT-PRN-LABEL-A",
  printDeviceId: printDevice.printDeviceId,
  printJobId: printJob.printJobId,
  documentType: printJob.documentType,
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  checkedAt: "2026-07-02T11:35:00.000Z",
  deviceLabel: "标签机A",
  driverLabel: "Generic 203dpi Label",
  paperLabel: "80x60 热敏标签",
  checks,
  evidence,
  summary: {
    ...getPrinterDeviceFieldTestSummary(checks),
    evidenceSummary: getPrinterDeviceFieldTestEvidenceSummary(evidence),
  },
  note: "前端打印设备验收 API client 校验",
};

const deviceListCalls = [];
const deviceListResult = await listOfficePrintDevices(
  {
    authState,
    query: { documentType: "express_ltl_label", status: "active", pageSize: 5 },
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      deviceListCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [printDevice],
        page: 1,
        pageSize: 5,
        total: 1,
      });
    },
  },
);

assert(deviceListResult.source === "api", "print device list should use API response");
assert(deviceListCalls[0]?.url.includes("/api/print-devices?"), "print device list URL is incorrect");
assert(deviceListCalls[0]?.url.includes("documentType=express_ltl_label"), "print device list missed document type");
assert(deviceListCalls[0]?.url.includes("status=active"), "print device list missed status");
assert(deviceListCalls[0]?.init.method === "GET", "print device list method is incorrect");
assert(deviceListCalls[0]?.init.headers["x-erp-user-id"] === "U-OFFICE-A", "print device list missed seed user header");
assert(deviceListResult.items[0]?.printDeviceId === "PRN-LABEL-A", "print device list did not map device id");

const saveDeviceCalls = [];
const systemPrinterDevice = {
  ...printDevice,
  settings: {
    ...printDevice.settings,
    driverMode: "system_printer",
  },
};
const saveDeviceResult = await updateOfficePrintDeviceDriverMode(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.printer-device-save" },
    },
    printDeviceId: printDevice.printDeviceId,
    driverMode: "system_printer",
    operatorId: "U-OFFICE-A",
    reason: "前端保存设备驱动模式校验",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      saveDeviceCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        printDevice: systemPrinterDevice,
        printDeviceId: printDevice.printDeviceId,
        previousDriverMode: "preview_only",
        driverMode: "system_printer",
        operationLogId: "LOG-PRINT-DEVICE-SAVE-1",
      });
    },
  },
);

assert(saveDeviceResult.source === "api", "print device save should use API response");
assert(
  saveDeviceCalls[0]?.url === "http://127.0.0.1:8787/api/print-devices/PRN-LABEL-A/driver-mode",
  "print device driver-mode URL is incorrect",
);
assert(saveDeviceCalls[0]?.init.method === "POST", "print device save method is incorrect");
assert(saveDeviceCalls[0]?.init.headers.authorization === "Bearer seed-session.printer-device-save", "print device save missed bearer auth");
const savedDriverModeRequest = saveDeviceCalls[0]?.body ?? {};
assert(!("paperWidthMm" in savedDriverModeRequest), "print device driver-mode request should not send full device fields");
assert(savedDriverModeRequest.driverMode === "system_printer", "print device save request missed driver mode");
assert(savedDriverModeRequest.reason === "前端保存设备驱动模式校验", "print device save request missed reason");
assert(savedDriverModeRequest.operatorId === "U-OFFICE-A", "print device save request missed operator id");
assert(!JSON.stringify(savedDriverModeRequest).includes("ERP_SYSTEM_PRINTER_COMMAND"), "print device save leaked command config");
assert(saveDeviceResult.printDevice.settings.driverMode === "system_printer", "print device save response missed driver mode");
assert(saveDeviceResult.previousDriverMode === "preview_only", "print device save response missed previous driver mode");
assert(saveDeviceResult.driverMode === "system_printer", "print device save response missed returned driver mode");
assert(saveDeviceResult.operationLogId === "LOG-PRINT-DEVICE-SAVE-1", "print device save response missed operation log");

const fieldTestCalls = [];
const fieldTestResult = await recordOfficePrinterDeviceFieldTest(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.printer-device-check" },
    },
    printDevice,
    printJob,
    operatorId: "U-OFFICE-A",
    record,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      fieldTestCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        printDeviceId: printDevice.printDeviceId,
        printDevice: {
          ...printDevice,
          latestFieldTestRecord: record,
          latestFieldTestSummary: record.summary,
          latestFieldTestCheckedAt: record.checkedAt,
        },
        printJob,
        record,
        summary: record.summary,
        operationLogId: "LOG-PDQA-FRONT-1",
      });
    },
  },
);

assert(fieldTestResult.source === "api", "printer device field test should use API response");
assert(
  fieldTestCalls[0]?.url === "http://127.0.0.1:8787/api/print-devices/PRN-LABEL-A/field-tests",
  "printer device field test URL is incorrect",
);
assert(fieldTestCalls[0]?.init.method === "POST", "printer device field test method is incorrect");
assert(
  fieldTestCalls[0]?.init.headers.authorization === "Bearer seed-session.printer-device-check",
  "printer device field test did not send bearer auth",
);
assert(fieldTestCalls[0]?.body.recordId === record.recordId, "printer device field test request missed record id");
assert(fieldTestCalls[0]?.body.printJobId === printJob.printJobId, "printer device field test request missed print job id");
assert(fieldTestCalls[0]?.body.checks?.length === 6, "printer device field test request missed normalized checks");
assert(fieldTestCalls[0]?.body.evidence?.barcodeScanText === "F003-PKG-1", "printer device field test request missed evidence");
assert(fieldTestResult.record.summary.passedCount === 4, "printer device field test response missed passed count");
assert(fieldTestResult.record.summary.issueCount === 1, "printer device field test response missed issue count");
assert(fieldTestResult.record.summary.evidenceSummary.missingCount === 1, "printer device field test response missed evidence summary");
assert(
  fieldTestResult.printDevice.latestFieldTestRecord.recordId === record.recordId,
  "printer device field test response missed latest device record",
);
assert(fieldTestResult.printJob.printJobId === printJob.printJobId, "printer device field test response missed print job");
assert(fieldTestResult.operationLogId === "LOG-PDQA-FRONT-1", "printer device field test response missed operation log");

const listFieldTestsCalls = [];
const listFieldTestsResult = await listOfficePrinterDeviceFieldTests(
  {
    authState,
    printDeviceId: printDevice.printDeviceId,
    query: { printJobId: printJob.printJobId, pageSize: 10 },
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      listFieldTestsCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [record],
        page: 1,
        pageSize: 10,
        total: 1,
        printDevice,
        latestRecord: record,
      });
    },
  },
);

assert(listFieldTestsResult.source === "api", "printer device field-test list should use API response");
assert(
  listFieldTestsCalls[0]?.url.endsWith("/api/print-devices/PRN-LABEL-A/field-tests?printJobId=PJ-API-FIELD-1&pageSize=10"),
  "printer device field-test list URL is incorrect",
);
assert(listFieldTestsCalls[0]?.init.method === "GET", "printer device field-test list method is incorrect");
assert(listFieldTestsResult.items.length === 1, "printer device field-test list did not map items");
assert(listFieldTestsResult.latestRecord.recordId === record.recordId, "printer device field-test list missed latest record");

const deniedResult = await recordOfficePrinterDeviceFieldTest(
  {
    authState,
    printDevice,
    printJob,
    operatorId: "U-WAREHOUSE-A",
    record,
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: print.device_qa.record",
        requiredPermission: "print.device_qa.record",
      }),
  },
);

assert(deniedResult.blocked === true, "printer device field-test permission denial should block local save");
assert(deniedResult.error.requiredPermission === "print.device_qa.record", "printer device field-test denial missed permission");

const deniedSaveResult = await updateOfficePrintDeviceDriverMode(
  {
    authState,
    printDeviceId: printDevice.printDeviceId,
    driverMode: "system_printer",
    operatorId: "U-FINANCE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: fulfillment.print",
        requiredPermission: "fulfillment.print",
      }),
  },
);
assert(deniedSaveResult.blocked === true, "print device save permission denial should block");
assert(deniedSaveResult.error.requiredPermission === "fulfillment.print", "print device save denial missed permission");

const offlineSaveResult = await updateOfficePrintDeviceDriverMode(
  {
    authState,
    printDeviceId: printDevice.printDeviceId,
    driverMode: "system_printer",
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("printer device save API offline");
    },
  },
);
assert(offlineSaveResult.blocked === true, "print device save must not fake-save while API is offline");
assert(offlineSaveResult.error.code === "PRINT_DEVICE_DRIVER_MODE_API_UNAVAILABLE", "print device save offline code is incorrect");

const invalidDriverModeResult = await updateOfficePrintDeviceDriverMode({
  authState,
  printDeviceId: printDevice.printDeviceId,
  driverMode: "manual",
  operatorId: "U-OFFICE-A",
});
assert(invalidDriverModeResult.blocked === true, "print device driver-mode client should reject unsupported mode");
assert(
  invalidDriverModeResult.error.code === "INVALID_PRINT_DEVICE_DRIVER_MODE",
  "print device driver-mode invalid-mode code is incorrect",
);

const fallbackResult = await recordOfficePrinterDeviceFieldTest(
  {
    authState,
    printDevice,
    printJob,
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    checks,
    note: "API offline fallback",
    now: new Date("2026-07-02T11:40:00.000Z"),
  },
  {
    fetchImpl: async () => {
      throw new Error("printer API offline");
    },
  },
);

assert(fallbackResult.source === "api_error" && fallbackResult.blocked === true, "Offline QA must remain unconfirmed");
assert(!fallbackResult.record && !fallbackResult.resultStatus, "Offline QA must not fabricate a saved record");

const strictFallbackResult = await recordOfficePrinterDeviceFieldTest(
  {
    authState,
    printDevice,
    printJob,
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    checks,
    now: new Date("2026-07-02T11:40:00.000Z"),
  },
  {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("printer API offline");
    },
  },
);

assert(strictFallbackResult.blocked === true, "strict printer field test must not use the local projection");
assert(strictFallbackResult.source === "api_error", "strict printer field test should report an API error");
assert(strictFallbackResult.error?.code === "PRINTER_DEVICE_FIELD_TEST_API_UNAVAILABLE", "strict printer field test reported the wrong API error");

const localListFallback = await listOfficePrinterDeviceFieldTests(
  {
    authState,
    printDeviceId: printDevice.printDeviceId,
    localFieldTests: [record, { ...record, recordId: "PDQA-OTHER", printDeviceId: "PRN-DOT-A" }],
  },
  {
    fetchImpl: async () => {
      throw new Error("printer field-test list offline");
    },
  },
);
assert(localListFallback.source === "local_fallback", "printer device field-test list should fall back locally on network failure");
assert(localListFallback.items.length === 1, "printer device field-test local fallback should filter by device");

const normalized = normalizePrinterDeviceFieldTestRecordForClient({
  id: "PDQA-NORMALIZED",
  printDeviceId: "PRN-LABEL-A",
  checks: [{ key: "sample_print", status: "passed" }],
});
assert(normalized.checks.length === 6, "printer device field-test normalization should expand checks");
assert(normalized.summary.passedCount === 1, "printer device field-test normalization should compute summary");
assert(normalized.summary.evidenceSummary.missingCount === 5, "printer device field-test normalization should compute evidence summary");

const missingDeviceResult = await recordOfficePrinterDeviceFieldTest({ authState, operatorId: "U-OFFICE-A" });
assert(missingDeviceResult.blocked === true, "printer device field-test should require a print device");
assert(missingDeviceResult.error.code === "PRINT_DEVICE_REQUIRED", "printer device field-test missing-device code is incorrect");

console.log(
  "Frontend printer device API client check passed: device list, device mode save, field-test record/list, denial blocking, offline save blocking, local list fallback, and normalization are covered.",
);

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const body of [
 {},
 {printDeviceId:'PRN-LABEL-A',driverMode:'system_printer',operationLogId:'L'},
 {printDeviceId:'OTHER',driverMode:'system_printer',operationLogId:'L',printDevice:{...printDevice,settings:{driverMode:'system_printer'}}},
 {printDeviceId:'PRN-LABEL-A',driverMode:'system_printer',operationLogId:'L',printDevice},
 {printDeviceId:'PRN-LABEL-A',driverMode:'system_printer',printDevice:{...printDevice,settings:{driverMode:'system_printer'}}},
]) {
 const result=await updateOfficePrintDeviceDriverMode({authState,printDeviceId:'PRN-LABEL-A',driverMode:'system_printer'},
 {fetchImpl:async()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}})});
 assert(result.blocked===true && result.error.code==='PRINT_DEVICE_MODE_SAVE_UNCONFIRMED','Malformed success must not confirm printer mode');
}

for (const body of [{},{printDeviceId:printDevice.printDeviceId,operationLogId:'L'},
 {printDeviceId:printDevice.printDeviceId,record:{...record,printDeviceId:'OTHER'},operationLogId:'L'},
 {printDeviceId:printDevice.printDeviceId,record:{...record,printJobId:'OTHER'},operationLogId:'L'},
 {printDeviceId:printDevice.printDeviceId,record}]) {
 const result=await recordOfficePrinterDeviceFieldTest({authState,printDevice,printJob,record},{fetchImpl:async()=>createJsonResponse(200,body)});
 assert(result.blocked && result.error.code==='PRINTER_DEVICE_FIELD_TEST_SAVE_UNCONFIRMED','Invalid QA receipt accepted');
}

const retryRequests = [];
const retryResults = [];
for (let attempt = 0; attempt < 2; attempt += 1) {
  retryResults.push(await recordOfficePrinterDeviceFieldTest(
    { authState, printDevice, printJob, record, idempotencyKey: "QA-STABLE-REQUEST" },
    { fetchImpl: async (_url, init) => {
      retryRequests.push({ headers: init.headers, body: JSON.parse(init.body) });
      if (attempt === 0) throw new Error("Response lost after server commit");
      return createJsonResponse(200, { printDeviceId: printDevice.printDeviceId, record, operationLogId: "LOG-STABLE" });
    } },
  ));
}
assert(retryResults[0].blocked === true && !retryResults[0].record, "Lost response must not fabricate saved evidence");
assert(retryResults[1].source === "api" && !retryResults[1].blocked, "Original receipt should resolve retry");
for (const request of retryRequests) {
  assert(request.headers["idempotency-key"] === "QA-STABLE-REQUEST", "Caller key must reach every request header");
  assert(request.body.idempotencyKey === "QA-STABLE-REQUEST", "Caller key must reach every request body");
}
assert(JSON.stringify(retryRequests[0].body) === JSON.stringify(retryRequests[1].body), "Prepared record retry must preserve request body");
console.log("PASS prepared printer QA request transport after response loss (mock HTTP; not UI or database replay).");
