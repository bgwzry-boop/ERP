import assert from "node:assert/strict";
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
    if (overrides.refresh?.[name]) return overrides.refresh[name]({setFulfillments});
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
      source: "api", fulfillmentId: "F-1", operationLogId: "LOG-PRINT", printJobOperationLogId: "LOG-JOB",
      printRecord: { targetType: "fulfillment", targetId: "F-1", printRecordId: "PR-1", status: "submitted", printAction: "first_print" },
      printJob: { targetType: "fulfillment", targetId: "F-1", printRecordId: "PR-1", printJobId: "PJ-1", jobStatus: "queued" },
      physicalPrintConfirmed: false,
    }),
    voidOfficePrintRecord: async ({ printRecordId }) => ({
      source: "api", fulfillmentId: "F-1", operationLogId: "LOG-PRINT", printJobOperationLogId: "LOG-JOB",
      printRecord: { targetType: "fulfillment", targetId: "F-1", printRecordId, status: "voided", voidedAt: "2026-07-11T02:00:00.000Z" },
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
    isPrintSessionCurrent: overrides.isPrintSessionCurrent,
    printerQaPendingRef: overrides.printerQaPendingRef,
    setFulfillments,
    setPrinterDeviceQa,
    setPrintBatchRecords,
    setPrintJobQueue,
    setSelectedTodoId: (value) => { selectedTodoId = value; },
    setTodos,
    todosRef,
  });
  return {
    setPrinterDeviceQa,
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
  assert.match(result.feedback, /设备确认打印完成/);
  assert.equal(harness.fulfillments[0].status, "待打印标签");
  assert.equal(harness.fulfillments[0].printed, false);
  assert.equal(harness.fulfillments[0].printRecordStatus, undefined);
  assert.equal(harness.printJobQueue.items.length, 0, "Old submission receipts do not project current queue state");
  assert.deepEqual(harness.calls, ["fulfillments", "print_jobs"]);
}

{
  const harness = createHarness({
    api: {
      printOfficeFulfillment: async () => ({
        source: "api", fulfillmentId: "F-1", operationLogId: "LOG-PRINT", printJobOperationLogId: "LOG-JOB",
        printRecord: { targetType: "fulfillment", targetId: "F-1", printRecordId: "PR-PREVIEW", status: "previewed", printAction: "preview" },
        printJob: { targetType: "fulfillment", targetId: "F-1", printRecordId: "PR-PREVIEW", printJobId: "PJ-PREVIEW", jobStatus: "preview_only" },
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

for(const physicalPrintConfirmed of [false,undefined]){
  const harness=createHarness({serverRequired:()=>true,api:{printOfficeFulfillment:async()=>({
    source:'api',fulfillmentId:'F-1',operationLogId:'LOG-PRINT',printJobOperationLogId:'LOG-JOB',physicalPrintConfirmed,
    printRecord:{targetType:"fulfillment",targetId:"F-1",printRecordId:'PR-STALE',status:'printed'},
    printJob:{targetType:"fulfillment",targetId:"F-1",printRecordId:"PR-STALE",printJobId:'PJ-STALE',jobStatus:'printed'},
    printTrustStatus:'package_revision_changed',
  })},refresh:{fulfillments:async()=>({source:'api_error',blocked:true})}});
  const result=await harness.actions.printFulfillmentDocument({modal:{fulfillmentId:'F-1',action:'打印标签'}});
  assert.equal(harness.fulfillments[0].printed,false,'Unverified printed job must not promote fulfillment');
  assert.equal(harness.fulfillments[0].status,'待打印标签');
  assert.equal(harness.fulfillments[0].activePrintRecordId,undefined);
  assert.equal(result.projectionRefreshFailed,true);
  assert.match(result.feedback,/尚未确认当前单据/);
  assert.doesNotMatch(result.feedback,/交付.*已.*推进/);
}

{
  const harness=createHarness({serverRequired:()=>true,api:{printOfficeFulfillment:async()=>({
    source:'api',fulfillmentId:'F-1',operationLogId:'LOG-PRINT',printJobOperationLogId:'LOG-JOB',physicalPrintConfirmed:true,
    printRecord:{targetType:"fulfillment",targetId:"F-1",printRecordId:'PR-VERIFIED',status:'printed'},
    printJob:{targetType:"fulfillment",targetId:"F-1",printRecordId:"PR-VERIFIED",printJobId:'PJ-VERIFIED',jobStatus:'printed'},
  })},refresh:{fulfillments:async({setFulfillments})=>{
    setFulfillments([{id:'F-1',printed:false,labelsPrinted:true,status:'待打印出库单',revision:2}]);
    return {source:'api'};
  }}});
  const result=await harness.actions.printFulfillmentDocument({modal:{fulfillmentId:'F-1',action:'打印标签'}});
  assert.equal(harness.fulfillments[0].printed,false,'Label completion is not paper-document completion');
  assert.equal(harness.fulfillments[0].labelsPrinted,true);
  assert.equal(harness.fulfillments[0].status,'待打印出库单');
  assert.match(result.feedback,/已确认打印完成/);
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
  const harness = createHarness();
  assert.equal(harness.actions.confirmBatchPrintResult, undefined, "manual print completion is no longer an exposed write action");
}

{
  const harness = createHarness();
  harness.fulfillments[0].printed = true;
  harness.fulfillments[0].activePrintRecordId = "PR-OLD";
  const result = await harness.actions.voidFulfillmentPrintRecord({
    modal: { type: "printVoid", fulfillmentId: "F-1", printRecordId: "PR-OLD" },
    payload: { reason: "信息变更需重打" },
  });
  assert.match(result.feedback, /作废凭据已确认/);
  assert.equal(harness.fulfillments[0].printed, true);
  assert.equal(harness.fulfillments[0].printRecordStatus, undefined);
}

console.log("office print writes checks passed");

for (const invalid of [
  { source: 'api' },
  { source: 'api', fulfillmentId: 'F-1', operationLogId: 'L', printJobOperationLogId: 'LJ', printRecord: { printRecordId:'P',targetType:'fulfillment',targetId:'OTHER' },printJob:{printJobId:'J',printRecordId:'P',targetType:'fulfillment',targetId:'F-1'} },
  { source: 'api', fulfillmentId: 'F-1', operationLogId: 'L', printJobOperationLogId: 'LJ', printRecord: { printRecordId:'P',targetType:'fulfillment',targetId:'F-1' },printJob:{printJobId:'J',printRecordId:'OTHER',targetType:'fulfillment',targetId:'F-1'} },
]) {
  const harness=createHarness({api:{printOfficeFulfillment:async()=>invalid}});
  const result=await harness.actions.printFulfillmentDocument({modal:{fulfillmentId:'F-1',action:'打印标签'}});
  assert.equal(result.blocked,true);assert.equal(result.confirmed,undefined);assert.deepEqual(harness.calls,[]);
}
{
  let calls=[];
  const harness=createHarness({api:{printOfficeFulfillment:async input=>{calls.push(input);throw new Error('network');}}});
  const modal={fulfillmentId:'F-1',action:'重打标签'};
  const request={idempotencyKey:'print-frozen-request',fulfillment:{id:'F-1',method:'快递快运',activePrintRecordId:'PR-ORIGINAL'},reason:'原说明'};
  const first=await harness.actions.printFulfillmentDocument({modal,payload:{printRequest:request}});
  assert.equal(first.blocked,true);
  harness.fulfillments[0].method='送货';harness.fulfillments[0].activePrintRecordId='PR-NEW';
  await harness.actions.printFulfillmentDocument({modal,payload:{printRequest:request,reason:'后来编辑'}});
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].idempotencyKey,'print-frozen-request');
}
{
  const harness=createHarness({refresh:{fulfillments:async()=>{throw new Error('refresh failed');}}});
  harness.fulfillments[0].printed=true;
  const result=await harness.actions.voidFulfillmentPrintRecord({modal:{fulfillmentId:'F-1',printRecordId:'PR-OLD'}});
  assert.equal(result.confirmed,true);assert.equal(result.projectionRefreshFailed,true);
  assert.equal(harness.fulfillments[0].printed,true);assert.match(result.feedback,/不必重新提交/);
}
{
  let current=true,resolve;
  const harness=createHarness({isPrintSessionCurrent:()=>current,api:{printOfficeFulfillment:()=>new Promise(r=>resolve=r)}});
  const pending=harness.actions.printFulfillmentDocument({modal:{fulfillmentId:'F-1',action:'打印标签'}});
  current=false;resolve({source:'api'});
  const result=await pending;assert.equal(result.stale,true);assert.deepEqual(harness.calls,[]);
}
console.log('PASS print write recovery: strict receipt target/job binding, frozen inputs, refresh failure preserves current state and stale account response is ignored.');

for (const method of ['savePrinterDeviceMode','savePrinterDeviceQaRecord']) for (const blocked of [false,true]) {
 let finish;
 const apiName=method==='savePrinterDeviceMode'?'updateOfficePrintDeviceDriverMode':'recordOfficePrinterDeviceFieldTest';
 const harness=createHarness({api:{[apiName]:()=>new Promise(resolve=>{finish=resolve;})}});
 const pending=harness.actions[method]();
 harness.setPrinterDeviceQa({...harness.printerDeviceQa,selectedDeviceId:'PRN-2',deviceLabel:'Second device',latestRecord:null,saving:false,savingDeviceMode:false});
 const newState=structuredClone(harness.printerDeviceQa);
 finish({source:'api',blocked,error:blocked?{message:'Old failure'}:undefined,printDevice:{printDeviceId:'PRN-1',name:'Old device'},record:{recordId:'OLD',printDeviceId:'PRN-1'}});
 assert.equal((await pending).stale,true);
 assert.deepEqual(harness.printerDeviceQa,newState);
 assert.deepEqual(harness.calls,[],'Old save must not refresh and reselect its former device');
}

for (const method of ['savePrinterDeviceMode','savePrinterDeviceQaRecord']) {
 let finish;
 const apiName=method==='savePrinterDeviceMode'?'updateOfficePrintDeviceDriverMode':'recordOfficePrinterDeviceFieldTest';
 const harness=createHarness({api:{[apiName]:()=>new Promise(resolve=>{finish=resolve;})}});
 const pending=harness.actions[method]();
 harness.setPrinterDeviceQa({...harness.printerDeviceQa,selectedDeviceId:'PRN-2',selectionRevision:1});
 harness.setPrinterDeviceQa({...harness.printerDeviceQa,selectedDeviceId:'PRN-1',selectionRevision:2,note:'New editing session',saving:false,savingDeviceMode:false});
 const newState=structuredClone(harness.printerDeviceQa);
 finish({source:'api',printDevice:{printDeviceId:'PRN-1',name:'Old'},record:{recordId:'OLD',printDeviceId:'PRN-1'}});
 assert.equal((await pending).stale,true);
 assert.deepEqual(harness.printerDeviceQa,newState);
 assert.deepEqual(harness.calls,[]);
}

{
  const pending = { current: new Set() };
  let release;
  let requests = 0;
  const api = { recordOfficePrinterDeviceFieldTest: async () => {
    requests += 1;
    return new Promise((resolve) => { release = resolve; });
  } };
  const first = createHarness({ api, printerQaPendingRef: pending });
  const saving = first.actions.savePrinterDeviceQaRecord();
  const recreated = createHarness({ api, printerQaPendingRef: pending });
  const duplicate = await recreated.actions.savePrinterDeviceQaRecord();
  assert.equal(duplicate.blocked, true);
  assert.equal(requests, 1, "A recreated action must share the synchronous pending guard");
  release({ source: "api_error", blocked: true, error: { message: "Response lost" } });
  await saving;
  assert.equal(pending.current.size, 0);
  assert.equal(first.printerDeviceQa.saving, false);
}
{
  let requests = 0;
  const harness = createHarness({ api: { recordOfficePrinterDeviceFieldTest: async () => {
    requests += 1;
    throw new Error("Unexpected transport rejection");
  } } });
  const result = await harness.actions.savePrinterDeviceQaRecord();
  assert.equal(result.blocked, true);
  assert.equal(result.error.code, "PRINTER_QA_SAVE_UNCONFIRMED");
  assert.equal(harness.printerDeviceQa.saving, false);
  assert.equal(harness.printerDeviceQa.note, "现场记录");
  await harness.actions.savePrinterDeviceQaRecord();
  assert.equal(requests, 2, "Thrown request must release pending guard");
}
console.log("PASS QA simultaneous submit suppression and thrown-request recovery.");

{
  const harness = createHarness({ refresh: { printer_qa: async () => { throw new Error("Refresh failed"); } } });
  const result = await harness.actions.savePrinterDeviceQaRecord();
  assert.equal(result.source, "api");
  assert.equal(result.projectionRefreshFailed, true);
  assert.equal(harness.printerDeviceQa.latestRecord.recordId, "QA-1");
  assert.equal(harness.printerDeviceQa.saving, false);
}

{
 let finishRefresh;
 const harness = createHarness({ refresh: { printer_qa: () => new Promise(resolve => {finishRefresh = resolve;}) } });
 const pending = harness.actions.savePrinterDeviceQaRecord();
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(typeof finishRefresh,"function");
 harness.setPrinterDeviceQa(current => ({...current,selectedDeviceId:"PRN-OTHER",selectionRevision:1}));
 finishRefresh({source:"api"});
 const result = await pending;
 assert.equal(result.stale,true,"Old save completion must not toast in the new selection");
 assert.equal(result.feedback,undefined);
}
