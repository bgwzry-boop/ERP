import assert from "node:assert/strict";
import fs from "node:fs";
import { createOfficePrintWriteActions } from "../src/app/useOfficePrintWrites.js";

function createHarness(overrides = {}) {
  let fulfillments = [{ id: "F-1", method: "快递快运", status: "待打印标签", printed: false, qty: 100 }];
  let todos = [{
    id: "T-1",
    type: "待打印标签",
    ref: "F-1",
    handled: false,
    packages: "2包",
    summary: "测试标签 2包",
    customerId: "C-1",
  }];
  let printBatchRecords = [];
  let printJobQueue = { source: "idle", items: [], total: 0, actionJobId: "", error: "" };
  let printerDeviceQa = {
    selectedDeviceId: "PRN-1",
    devices: [{
      printDeviceId: "PRN-1",
      name: "标签机A",
      driverName: "Driver A",
      paperName: "76x50",
      settings: { driverMode: "system_printer" },
    }],
    driverModeDraft: "system_printer",
    checks: [{ key: "sample_print", status: "passed" }],
    evidence: { samplePrintReference: "E-1" },
    fieldTests: [],
    note: "现场记录",
  };
  let selectedTodoId = "T-1";
  const calls = [];

  const fulfillmentsRef = { current: fulfillments };
  const todosRef = { current: todos };
  const printBatchRecordsRef = { current: printBatchRecords };
  const printerDeviceQaRef = { current: printerDeviceQa };
  const setFulfillments = (value) => {
    fulfillments = typeof value === "function" ? value(fulfillments) : value;
    fulfillmentsRef.current = fulfillments;
  };
  const setTodos = (value) => {
    todos = typeof value === "function" ? value(todos) : value;
    todosRef.current = todos;
  };
  const setPrintBatchRecords = (value) => {
    printBatchRecords = typeof value === "function" ? value(printBatchRecords) : value;
    printBatchRecordsRef.current = printBatchRecords;
  };
  const setPrintJobQueue = (value) => {
    printJobQueue = typeof value === "function" ? value(printJobQueue) : value;
  };
  const setPrinterDeviceQa = (value) => {
    printerDeviceQa = typeof value === "function" ? value(printerDeviceQa) : value;
    printerDeviceQaRef.current = printerDeviceQa;
  };
  const refreshApi = (name) => async () => {
    calls.push(name);
    return { source: "api" };
  };
  const api = {
    dispatchOfficePrintJob: async ({ printJobId }) => ({
      source: "api",
      printJob: { printJobId, jobStatus: "sent" },
      dispatchResult: { jobStatus: "sent" },
    }),
    retryOfficePrintJob: async ({ printJobId }) => ({
      source: "api",
      sourcePrintJob: { printJobId, jobStatus: "failed" },
      printJob: { printJobId: `${printJobId}-R2`, sourcePrintJobId: printJobId, jobStatus: "queued" },
    }),
    updateOfficePrintDeviceDriverMode: async ({ driverMode }) => ({
      source: "api",
      printDevice: { ...printerDeviceQa.devices[0], settings: { driverMode } },
    }),
    recordOfficePrinterDeviceFieldTest: async () => ({
      source: "api",
      record: {
        recordId: "QA-1",
        printDeviceId: "PRN-1",
        checks: printerDeviceQa.checks,
        evidence: printerDeviceQa.evidence,
        summary: { label: "1/1 通过" },
        checkedAt: "2026-07-11T01:00:00.000Z",
      },
    }),
    printOfficeFulfillment: async () => ({
      source: "api",
      printRecord: { printRecordId: "PR-1", status: "submitted", printAction: "first_print" },
      printJob: { printJobId: "PJ-1", jobStatus: "queued" },
      physicalPrintConfirmed: false,
    }),
    voidOfficePrintRecord: async ({ printRecordId }) => ({
      source: "api",
      printRecord: { printRecordId, status: "voided", voidedAt: "2026-07-11T02:00:00.000Z" },
    }),
    handleOfficeTodoBatch: async () => ({ source: "api" }),
    handleOfficeTodoAction: async () => ({ source: "api" }),
    createOfficePrintBatchRecord: async ({ printBatchRecord }) => ({ source: "api", printBatchRecord }),
    ...overrides.api,
  };
  const actions = createOfficePrintWriteActions({
    api,
    authState: { token: "test" },
    currentUserDisplayName: "办公室A",
    currentUserId: "U-OFFICE-A",
    fulfillmentsRef,
    printerDeviceQaRef,
    printBatchRecordsRef,
    refreshFulfillments: refreshApi("fulfillments"),
    refreshOfficePrintJobQueue: refreshApi("print_jobs"),
    refreshPrinterDeviceQa: refreshApi("printer_qa"),
    refreshPrintDriverReadiness: refreshApi("print_readiness"),
    refreshTodos: refreshApi("todos"),
    serverRequired: overrides.serverRequired ?? (() => false),
    setFulfillments,
    setPrinterDeviceQa,
    setPrintBatchRecords,
    setPrintJobQueue,
    setSelectedTodoId: (value) => { selectedTodoId = value; },
    setTodos,
    todosRef,
  });
  return {
    actions,
    calls,
    get fulfillments() { return fulfillments; },
    get printerDeviceQa() { return printerDeviceQa; },
    get printBatchRecords() { return printBatchRecords; },
    get printJobQueue() { return printJobQueue; },
    get selectedTodoId() { return selectedTodoId; },
    get todos() { return todos; },
  };
}

{
  const harness = createHarness();
  const result = await harness.actions.printFulfillmentDocument({
    modal: { type: "print", fulfillmentId: "F-1", action: "打印标签" },
    payload: {},
  });
  assert.equal(result.blocked, undefined);
  assert.match(result.feedback, /等待 spool \/ 驱动回读为 printed/);
  assert.equal(harness.fulfillments[0].status, "待打印标签");
  assert.equal(harness.fulfillments[0].printed, false);
  assert.equal(harness.fulfillments[0].printRecordStatus, "submitted");
  assert.equal(harness.printJobQueue.items[0].jobStatus, "queued");
  assert.deepEqual(harness.calls, ["print_jobs", "fulfillments"]);
}

{
  const harness = createHarness({
    api: {
      printOfficeFulfillment: async () => ({
        source: "api",
        printRecord: { printRecordId: "PR-PREVIEW", status: "previewed", printAction: "preview" },
        printJob: { printJobId: "PJ-PREVIEW", jobStatus: "preview_only" },
        physicalPrintConfirmed: false,
      }),
    },
  });
  const result = await harness.actions.printFulfillmentDocument({
    modal: { type: "print", fulfillmentId: "F-1", action: "打印预览" },
  });
  assert.match(result.feedback, /预览不等于实体打印/);
  assert.equal(harness.fulfillments[0].status, "待打印标签");
  assert.equal(harness.fulfillments[0].printed, false);
}

{
  const harness = createHarness({
    serverRequired: () => true,
    api: {
      printOfficeFulfillment: async () => ({
        source: "local_fallback",
        printRecord: { printRecordId: "LOCAL-PR", status: "printed" },
      }),
    },
  });
  const result = await harness.actions.printFulfillmentDocument({
    modal: { type: "print", fulfillmentId: "F-1", action: "打印标签" },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.source, "api_error");
  assert.equal(harness.fulfillments[0].printRecordStatus, undefined);
}

{
  const harness = createHarness();
  const dispatchResult = await harness.actions.dispatchPrintJobQueueItem("PJ-DISPATCH");
  assert.match(dispatchResult.feedback, /只有 printed 回读才代表打印完成/);
  assert.equal(harness.printJobQueue.items[0].jobStatus, "sent");
  const retryResult = await harness.actions.retryPrintJobQueueItem("PJ-FAILED");
  assert.match(retryResult.feedback, /等待可信状态回读/);
  assert(harness.printJobQueue.items.some((item) => item.printJobId === "PJ-FAILED-R2"));
}

{
  const harness = createHarness();
  const modeResult = await harness.actions.savePrinterDeviceMode();
  assert.match(modeResult.feedback, /真实打印候选模式/);
  assert.match(modeResult.feedback, /不证明已出纸/);
  assert.equal(harness.printerDeviceQa.devices[0].settings.driverMode, "system_printer");
  const qaResult = await harness.actions.savePrinterDeviceQaRecord();
  assert.match(qaResult.feedback, /仍需现场证据支撑/);
  assert.equal(harness.printerDeviceQa.latestRecord.recordId, "QA-1");
}

{
  let printRequestCount = 0;
  const harness = createHarness({
    api: {
      printOfficeFulfillment: async () => {
        printRequestCount += 1;
        return { source: "api" };
      },
    },
  });
  const result = await harness.actions.confirmBatchPrintResult({
    modal: { type: "batchPrintResult", todoIds: ["T-1"] },
    payload: { reason: "全部打出" },
  });
  assert.equal(printRequestCount, 0, "confirming a batch result must not create print jobs after the fact");
  assert.match(result.feedback, /不替代 spool printed 回读，也不推进交付/);
  assert.equal(harness.todos[0].handled, true);
  assert.equal(harness.fulfillments[0].status, "待打印标签");
  assert.equal(harness.printBatchRecords.length, 1);
}

{
  const harness = createHarness();
  harness.fulfillments[0].printed = true;
  harness.fulfillments[0].activePrintRecordId = "PR-OLD";
  const result = await harness.actions.voidFulfillmentPrintRecord({
    modal: { type: "printVoid", fulfillmentId: "F-1", printRecordId: "PR-OLD" },
    payload: { reason: "信息变更需重打" },
  });
  assert.match(result.feedback, /收到 printed 回读后/);
  assert.equal(harness.fulfillments[0].printed, false);
  assert.equal(harness.fulfillments[0].printRecordStatus, "voided");
}

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const directWriteName of [
  "createOfficePrintBatchRecord",
  "dispatchOfficePrintJob",
  "printOfficeFulfillment",
  "recordOfficePrinterDeviceFieldTest",
  "retryOfficePrintJob",
  "updateOfficePrintDeviceDriverMode",
  "voidOfficePrintRecord",
]) {
  assert.equal(appSource.includes(directWriteName), false, `App.jsx still owns ${directWriteName}`);
}

console.log("office print writes checks passed");
