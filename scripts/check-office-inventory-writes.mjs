import assert from "node:assert/strict";
import { createOfficeInventoryDetailReadActions } from "../src/app/useOfficeInventoryDetailReads.js";
import { createOfficeInventoryWriteActions } from "../src/app/useOfficeInventoryWrites.js";

function createState(initialValue) {
  let value = initialValue;
  return {
    get value() {
      return value;
    },
    set(nextValue) {
      value = typeof nextValue === "function" ? nextValue(value) : nextValue;
    },
  };
}

const stock = {
  id: "S001",
  size: "30*38",
  color: "白色",
  handle: "普通提",
  style: "空白袋",
  inStock: 500,
};
const pendingDraft = {
  id: "ICD-1",
  correctionDraftId: "ICD-1",
  inventoryItemId: "S001",
  status: "待确认生效",
  systemQty: 500,
  actualQty: 480,
};

function createInventoryWriteCase({ api = {}, initialDrafts = [], refreshResults = {}, serverRequired = false } = {}) {
  const states = {
    drafts: createState(initialDrafts),
    queue: createState({ source: "api", items: initialDrafts, total: initialDrafts.length, confirmingId: "", error: "" }),
    selectedStockId: createState("S001"),
    intent: createState({ source: "api", items: [], holds: [], loading: false, mutatingId: "", error: "" }),
  };
  const draftsRef = { current: initialDrafts };
  const selectedStockIdRef = { current: "S001" };
  const refreshCalls = [];
  const refresh = (name) => async (options = {}) => {
    refreshCalls.push({ name, options });
    if (refreshResults[name] instanceof Error) throw refreshResults[name];
    return refreshResults[name] ?? { source: "api" };
  };
  const actions = createOfficeInventoryWriteActions({
    api,
    authState: {},
    currentUserDisplayName: "办公室A",
    currentUserId: "U-OFFICE-A",
    inventoryCorrectionDraftsRef: draftsRef,
    loadInventoryCorrectionDetail: refresh("detail"),
    refreshInventoryCorrectionQueue: refresh("queue"),
    refreshInventoryLedgerEntries: refresh("ledger"),
    refreshInventoryIntents: refresh("intents"),
    refreshInventoryRecords: refresh("inventory"),
    refreshTodos: refresh("todos"),
    selectedStockIdRef,
    serverRequired: () => serverRequired,
    setInventoryCorrectionDrafts: states.drafts.set,
    setInventoryCorrectionQueueState: states.queue.set,
    setInventoryIntentState: states.intent.set,
    setSelectedStockId: states.selectedStockId.set,
  });
  return { actions, draftsRef, refreshCalls, selectedStockIdRef, states };
}

const createCase = createInventoryWriteCase({
  api: {
    async createOfficeInventoryCorrectionDraft(input) {
      assert.equal(input.expectedQty, 500);
      assert.equal(input.actualQty, 480);
      return { source: "api", draft: pendingDraft, todoId: "T-ICD-1" };
    },
  },
});
const createResult = await createCase.actions.createInventoryCorrectionDraft({
  stock,
  actualQty: 480,
  reason: "盘点差异",
});
assert.equal(createCase.states.drafts.value[0].id, "ICD-1");
assert.equal(createCase.states.queue.value.total, 1);
assert.deepEqual(createCase.refreshCalls.map((item) => item.name).sort(), ["queue", "todos"]);
assert.equal(createResult.projectionRefreshFailed, false);
assert.match(createResult.feedback, /未修改库存总数/);

const attachmentCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  api: {
    async readAttachmentFileAsDataUrl(file) {
      assert.equal(file.name, "count.jpg");
      return "data:image/jpeg;base64,Y291bnQ=";
    },
    createInventoryCorrectionEvidenceAttachmentInput(input) {
      assert.equal(input.correctionDraftId, "ICD-1");
      return {
        ownerType: "inventory_correction",
        ownerId: "ICD-1",
        purpose: "inventory_correction_evidence",
        fileType: "image",
        fileName: input.file.name,
        contentRef: "p0://inventory-correction/ICD-1/count.jpg",
        mimeType: input.file.type,
        fileSize: input.file.size,
        contentDataUrl: input.file.contentDataUrl,
        uploadedBy: input.operatorId,
      };
    },
    async createOfficeAttachment(input) {
      assert.equal(input.ownerId, "ICD-1");
      assert.equal(input.uploadedBy, "U-OFFICE-A");
      return { source: "api", attachment: { attachmentId: "ATT-COUNT-1", ...input } };
    },
    async linkOfficeInventoryCorrectionAttachments(input) {
      assert.equal(input.correctionDraftId, "ICD-1");
      assert.deepEqual(input.attachmentIds, ["ATT-COUNT-1"]);
      return {
        source: "api",
        linkage: {
          correctionDraftId: "ICD-1",
          attachmentIds: ["ATT-COUNT-1"],
          revision: 2,
          operationLogId: "LOG-LINK-1",
        },
      };
    },
  },
});
const attachmentResult = await attachmentCase.actions.linkInventoryCorrectionAttachment({
  draft: pendingDraft,
  file: { name: "count.jpg", type: "image/jpeg", size: 5 },
});
assert.deepEqual(attachmentResult.attachmentIds, ["ATT-COUNT-1"]);
assert.deepEqual(attachmentCase.states.drafts.value[0].attachmentIds, ["ATT-COUNT-1"]);
assert.deepEqual(attachmentCase.refreshCalls.map((item) => item.name).sort(), ["detail", "queue"]);
assert.match(attachmentResult.feedback, /不会修改库存/);

const deniedCreateCase = createInventoryWriteCase({
  api: {
    async createOfficeInventoryCorrectionDraft() {
      return {
        source: "api_error",
        blocked: true,
        error: { requiredPermission: "inventory.correction.create", message: "forbidden" },
        draft: null,
      };
    },
  },
});
const deniedCreate = await deniedCreateCase.actions.createInventoryCorrectionDraft({ stock, actualQty: 480, reason: "盘点差异" });
assert.equal(deniedCreate.blocked, true);
assert.equal(deniedCreateCase.states.drafts.value.length, 0);
assert.match(deniedCreate.feedback, /缺少权限 inventory\.correction\.create/);

const productionFallbackCase = createInventoryWriteCase({
  serverRequired: true,
  api: {
    async createOfficeInventoryCorrectionDraft() {
      return { source: "local_fallback", draft: pendingDraft };
    },
  },
});
const productionFallback = await productionFallbackCase.actions.createInventoryCorrectionDraft({
  stock,
  actualQty: 480,
  reason: "盘点差异",
});
assert.equal(productionFallback.blocked, true);
assert.equal(productionFallback.upstreamSource, "local_fallback");
assert.equal(productionFallbackCase.states.drafts.value.length, 0);

const confirmCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  api: {
    async confirmOfficeInventoryCorrectionDraft(input) {
      assert.equal(input.correctionDraftId, "ICD-1");
      return {
        source: "api",
        confirmation: {
          correctionDraftId: "ICD-1",
          inventoryItemId: "S001",
          ledger: { ledgerId: "LEDGER-1", inventoryItemId: "S001" },
        },
      };
    },
  },
});
const confirmResult = await confirmCase.actions.confirmInventoryCorrectionDraft(pendingDraft);
assert.equal(confirmCase.states.drafts.value[0].status, "已确认生效");
assert.equal(confirmCase.states.queue.value.total, 0);
assert.equal(confirmCase.states.queue.value.confirmingId, "");
assert.equal(confirmCase.selectedStockIdRef.current, "S001");
assert.deepEqual(
  confirmCase.refreshCalls.map((item) => item.name).sort(),
  ["detail", "inventory", "ledger", "queue", "todos"],
);
assert.equal(confirmResult.projectionRefreshFailed, false);
assert.match(confirmResult.feedback, /公共待办已同步/);

const conflictCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  api: {
    async confirmOfficeInventoryCorrectionDraft() {
      return {
        source: "api_error",
        blocked: true,
        error: { code: "INVENTORY_REVISION_CONFLICT", message: "库存版本冲突，请刷新后重试。" },
        confirmation: null,
      };
    },
  },
});
const conflictResult = await conflictCase.actions.confirmInventoryCorrectionDraft(pendingDraft);
assert.equal(conflictResult.blocked, true);
assert.equal(conflictCase.states.drafts.value[0].status, "待确认生效");
assert.equal(conflictCase.states.queue.value.confirmingId, "");
assert.match(conflictCase.states.queue.value.error, /版本冲突/);

const refreshFailureCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  refreshResults: { todos: { source: "api_error", blocked: true, error: { message: "offline" } } },
  api: {
    async confirmOfficeInventoryCorrectionDraft() {
      return { source: "api", confirmation: { correctionDraftId: "ICD-1", inventoryItemId: "S001" } };
    },
  },
});
const refreshFailure = await refreshFailureCase.actions.confirmInventoryCorrectionDraft(pendingDraft);
assert.equal(refreshFailure.projectionRefreshFailed, true);
assert.match(refreshFailure.feedback, /已通过后端 API确认.*刷新失败/);

const temporaryHoldIntent = { intentId: "INT-1", revision: 1, intentType: "temporary_hold" };
const temporaryHold = {
  reservationId: "HOLD-1",
  inventoryItemId: "S001",
  reservedQty: 20,
  intent: { ...temporaryHoldIntent, revision: 2, intentStatus: "临时留货-生效" },
};
const holdCase = createInventoryWriteCase({
  api: {
    async createOfficeTemporaryInventoryHold(input) {
      assert.equal(input.intentId, "INT-1");
      assert.equal(input.expectedRevision, 1);
      return { source: "api", intent: temporaryHold.intent, hold: temporaryHold, inventoryItem: { inventoryItemId: "S001" } };
    },
    async extendOfficeTemporaryInventoryHold(input) {
      assert.equal(input.expectedRevision, 2);
      return { source: "api", intent: { ...temporaryHold.intent, revision: 3 }, hold: { ...temporaryHold, expiresAt: input.expiresAt } };
    },
    async releaseOfficeTemporaryInventoryHold(input) {
      assert.equal(input.expectedRevision, 2);
      return { source: "api", intent: { ...temporaryHold.intent, intentStatus: "已取消" }, hold: { ...temporaryHold, reservedQty: 0 } };
    },
  },
});
const holdCreated = await holdCase.actions.createTemporaryInventoryHold({
  intent: temporaryHoldIntent,
  candidateIndex: 0,
  inventoryItemId: "S001",
  qty: 20,
  reason: "客户明确留货",
});
assert.equal(holdCreated.blocked, undefined);
assert.deepEqual(holdCase.refreshCalls.map((item) => item.name).sort(), ["intents", "inventory", "ledger"]);
assert.match(holdCreated.feedback, /库存、流水和意图队列已同步/);

holdCase.refreshCalls.length = 0;
const holdExtended = await holdCase.actions.extendTemporaryInventoryHold({
  hold: temporaryHold,
  expiresAt: "2026-07-12T20:30:00+08:00",
  reason: "客户授权",
});
assert.equal(holdExtended.source, "api");
assert.equal(holdCase.states.intent.value.mutatingId, "");

holdCase.refreshCalls.length = 0;
const holdReleased = await holdCase.actions.releaseTemporaryInventoryHold({ hold: temporaryHold, reason: "客户取消" });
assert.equal(holdReleased.hold.reservedQty, 0);
assert.deepEqual(holdCase.refreshCalls.map((item) => item.name).sort(), ["intents", "inventory", "ledger"]);

const detailState = createState({ source: "idle", detail: null, requestedId: "", loading: false, error: "" });
const detailActions = createOfficeInventoryDetailReadActions({
  api: {
    async getOfficeInventoryCorrectionDetail() {
      return { source: "api", detail: { ...pendingDraft, operationLogs: [] } };
    },
  },
  authState: {},
  currentUserId: "U-OFFICE-A",
  inventoryCorrectionDraftsRef: { current: [pendingDraft] },
  inventoryLedgerEntriesRef: { current: [] },
  inventoryLedgerFiltersRef: { current: {} },
  selectedStockIdRef: { current: "S001" },
  serverRequired: () => true,
  setInventoryCorrectionDrafts() {},
  setInventoryCorrectionDetailState: detailState.set,
  setInventoryCorrectionQueueState() {},
  setInventoryIntentState() {},
  setInventoryLedgerState() {},
});
const detailResult = await detailActions.loadInventoryCorrectionDetail("ICD-1", null, { showToast: true });
assert.equal(detailState.value.detail.id, "ICD-1");
assert.match(detailResult.feedback, /后端 API.*ICD-1/);

const blockedDetailState = createState({ detail: { id: "STALE" } });
const blockedDetailActions = createOfficeInventoryDetailReadActions({
  api: {
    async getOfficeInventoryCorrectionDetail() {
      return { source: "local_fallback", detail: pendingDraft, error: { message: "offline" } };
    },
  },
  authState: {},
  currentUserId: "U-OFFICE-A",
  inventoryCorrectionDraftsRef: { current: [pendingDraft] },
  inventoryLedgerEntriesRef: { current: [] },
  inventoryLedgerFiltersRef: { current: {} },
  selectedStockIdRef: { current: "S001" },
  serverRequired: () => true,
  setInventoryCorrectionDrafts() {},
  setInventoryCorrectionDetailState: blockedDetailState.set,
  setInventoryCorrectionQueueState() {},
  setInventoryIntentState() {},
  setInventoryLedgerState() {},
});
const blockedDetail = await blockedDetailActions.loadInventoryCorrectionDetail("ICD-1");
assert.equal(blockedDetail.blocked, true);
assert.equal(blockedDetailState.value.detail, null);

const intentReadState = createState({ items: [], holds: [], loading: false, error: "" });
const intentReadActions = createOfficeInventoryDetailReadActions({
  api: {
    async listOfficeInventoryIntents() {
      return { source: "api", items: [temporaryHoldIntent] };
    },
    async listOfficeTemporaryInventoryHolds() {
      return { source: "api", items: [temporaryHold] };
    },
  },
  authState: {},
  currentUserId: "U-OFFICE-A",
  serverRequired: () => true,
  setInventoryIntentState: intentReadState.set,
});
const intentRead = await intentReadActions.refreshInventoryIntents({ showToast: true });
assert.equal(intentReadState.value.items[0].intentId, "INT-1");
assert.equal(intentReadState.value.holds[0].reservationId, "HOLD-1");
assert.match(intentRead.feedback, /临时留货已刷新/);

console.log("Office inventory writes check passed: create/confirm, permission, conflict, production fail-closed, detail reads, and inventory/ledger/queue/todo refreshes are covered.");

{
 const saved={source:'api',hold:{reservationId:'H-REFRESH',inventoryItemId:'S001'}};
 const harness=createInventoryWriteCase({api:{createOfficeTemporaryInventoryHold:async()=>saved},refreshResults:{intents:new Error('Network lost after save')}});
 const result=await harness.actions.createTemporaryInventoryHold({intent:{intentId:'I-REFRESH',revision:1},candidateIndex:0,qty:10});
 assert.equal(result.source,'api');
 assert.equal(result.projectionRefreshFailed,true);
 assert.equal(result.hold.reservationId,'H-REFRESH');
 assert.equal(harness.states.intent.value.mutatingId,'');
}

for (const [action, method, payload] of [
 ['createTemporaryInventoryHold','createOfficeTemporaryInventoryHold',{intent:temporaryHoldIntent,candidateIndex:0,inventoryItemId:'S001',qty:10,expiresAt:'2099-01-01T19:30',reason:'customer request'}],
 ['extendTemporaryInventoryHold','extendOfficeTemporaryInventoryHold',{hold:temporaryHold,expiresAt:'2099-01-02T19:30',reason:'customer request'}],
 ['releaseTemporaryInventoryHold','releaseOfficeTemporaryInventoryHold',{hold:temporaryHold,reason:'customer cancellation'}],
]) {
 const sent=[];
 const testCase=createInventoryWriteCase({api:{[method]:async input=>{sent.push(structuredClone(input));return {source:'api_error',blocked:true,error:{message:'connection lost'}};}}});
 const request={...payload,idempotencyKey:'frozen-'+action};
 await testCase.actions[action](request);
 await testCase.actions[action](request);
 assert.equal(sent[0].idempotencyKey,request.idempotencyKey);
 assert.deepEqual(sent[0],sent[1]);
 assert.equal(testCase.states.intent.value.mutatingId,'');
}
console.log('PASS all three hold write actions preserve caller retry identity and payload.');

for (const [action,method,payload] of [
 ['createTemporaryInventoryHold','createOfficeTemporaryInventoryHold',{intent:temporaryHoldIntent}],
 ['releaseTemporaryInventoryHold','releaseOfficeTemporaryInventoryHold',{hold:temporaryHold}],
 ['extendTemporaryInventoryHold','extendOfficeTemporaryInventoryHold',{hold:temporaryHold}],
]) {
 const testCase=createInventoryWriteCase({api:{[method]:()=>{throw new Error('transport interrupted');}}});
 const result=await testCase.actions[action](payload);
 assert.equal(result.blocked,true);
 assert.equal(result.error.code,'TEMPORARY_HOLD_SAVE_UNCONFIRMED');
 assert.equal(testCase.states.intent.value.mutatingId,'');
 assert.equal(testCase.refreshCalls.length,0);
 assert.ok(result.feedback.includes('未确认'));
}
console.log('PASS thrown hold requests return uncertain results and clear busy state without success refresh.');

{
 let finish, calls=0;
 const testCase=createInventoryWriteCase({api:{createOfficeTemporaryInventoryHold:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},releaseOfficeTemporaryInventoryHold:()=>{calls++;throw new Error('must not run');}}});
 const first=testCase.actions.createTemporaryInventoryHold({intent:temporaryHoldIntent});
 const duplicate=await testCase.actions.releaseTemporaryInventoryHold({hold:temporaryHold});
 assert.equal(duplicate.error?.code,'TEMPORARY_HOLD_WRITE_PENDING');
 assert.equal(calls,1);
 assert.equal(testCase.states.intent.value.mutatingId,temporaryHoldIntent.intentId);
 finish({source:'api_error',blocked:true,error:{message:'uncertain'}});
 await first;
 assert.equal(testCase.states.intent.value.mutatingId,'');
}
console.log('PASS overlapping hold actions cannot send a second request or clear the first busy state.');

// Render the real hook: a new auth object on rerender must not reset pending ownership.
{
 const {build}=await import('esbuild');
 const {chromium}=await import('playwright');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState} from 'react';
 import {createRoot} from 'react-dom/client';
 import {useOfficeInventoryWrites} from './src/app/useOfficeInventoryWrites.js';
 window.calls=0;
 const api={createOfficeTemporaryInventoryHold:()=>{window.calls++;return new Promise(resolve=>{window.finish=resolve});}};
 function Harness({revision,user,token}) {
  const [state,setState]=useState({mutatingId:''});
  window.actions=useOfficeInventoryWrites({api,currentUserId:user,authState:{session:{accessToken:token}},setInventoryIntentState:setState,serverRequired:()=>false});
  return <output>{revision}:{state.mutatingId}</output>;
 }
 const root=createRoot(document.getElementById('app'));
 window.render=(n,user='A',token='token-'+user)=>root.render(<Harness revision={n} user={user} token={token}/>);window.unmount=()=>root.unmount();window.render(0);
 `},bundle:true,write:false,jsx:'automatic',logLevel:'silent'});
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<div id="app"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.actions);
  await page.evaluate(()=>{window.pending=window.actions.createTemporaryInventoryHold({intent:{intentId:'I',revision:1}});});
  await page.waitForFunction(()=>document.querySelector('output').textContent==='0:I');
  await page.evaluate(()=>window.render(1));await page.waitForFunction(()=>document.querySelector('output').textContent==='1:I');
  const second=await page.evaluate(()=>window.actions.createTemporaryInventoryHold({intent:{intentId:'I',revision:1}}));
  assert.equal(second.error.code,'TEMPORARY_HOLD_WRITE_PENDING');assert.equal(await page.evaluate(()=>window.calls),1);
  await page.evaluate(()=>{window.finish({source:'api_error',blocked:true,error:{message:'unconfirmed'}});return window.pending;});
  await page.waitForFunction(()=>document.querySelector('output').textContent==='1:');
  await page.evaluate(()=>{window.pending=window.actions.createTemporaryInventoryHold({intent:{intentId:'I',revision:1}});});
  assert.equal(await page.evaluate(()=>window.calls),2);
  await page.evaluate(()=>{window.finish({source:'api_error',blocked:true,error:{message:'unconfirmed'}});return window.pending;});
  await page.evaluate(()=>{window.oldPending=window.actions.createTemporaryInventoryHold({intent:{intentId:'OLD',revision:1}});window.oldFinish=window.finish;window.render(2,'B');});
  await page.waitForFunction(()=>document.querySelector('output').textContent.startsWith('2:'));
  await page.evaluate(()=>{window.newPending=window.actions.createTemporaryInventoryHold({intent:{intentId:'NEW',revision:1}});});
  await page.waitForFunction(()=>document.querySelector('output').textContent==='2:NEW');
  const stale=await page.evaluate(()=>{window.oldFinish({source:'api_error',blocked:true,error:{message:'old error'}});return window.oldPending;});
  assert.equal(stale.stale,true);
  assert.equal(await page.locator('output').innerText(),'2:NEW');
  await page.evaluate(()=>{window.finish({source:'api_error',blocked:true,error:{message:'new error'}});return window.newPending;});
  await page.evaluate(()=>{window.pending=window.actions.createTemporaryInventoryHold({intent:{intentId:'TOKEN',revision:1}});window.render(3,'B','renewed-token');});
  await page.waitForFunction(()=>document.querySelector('output').textContent.startsWith('3:'));
  const oldToken=await page.evaluate(()=>{window.finish({source:'api',hold:{inventoryItemId:'S001'}});return window.pending;});
  assert.equal(oldToken.stale,true);
  await page.evaluate(()=>{window.pending=window.actions.createTemporaryInventoryHold({intent:{intentId:'UNMOUNT',revision:1}});window.unmount();});
  const unmounted=await page.evaluate(()=>{window.finish({source:'api',hold:{inventoryItemId:'S001'}});return window.pending;});
  assert.equal(unmounted.stale,true);
  assert.equal(unmounted.feedback,'');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
 console.log('PASS actual React hold hook retains pending ownership across rerender and allows retry after settlement; transport mocked.');
}

{
 const state=createState({mutatingId:'ACTIVE-WRITE',items:[],holds:[]});
 const requests=[];
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,setInventoryIntentState:state.set,api:{listOfficeInventoryIntents:()=>new Promise(resolve=>requests.push(resolve)),listOfficeTemporaryInventoryHolds:async()=>({source:'api',items:[]})}});
 const old=actions.refreshInventoryIntents();const latest=actions.refreshInventoryIntents();
 await Promise.resolve();
 requests[1]({source:'api',items:[{intentId:'NEW'}]});await latest;
 requests[0]({source:'api_error',blocked:true,error:{message:'old failure'}});
 const result=await old;
 assert.equal(result.stale,true);assert.equal(state.value.items[0].intentId,'NEW');assert.equal(state.value.mutatingId,'ACTIVE-WRITE');
}

for (const failure of ['throw', 'blocked', 'malformed']) {
 const state=createState({mutatingId:'ACTIVE-WRITE',loading:false,items:[],holds:[]});
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,setInventoryIntentState:state.set,api:{listOfficeInventoryIntents:()=>{if(failure==='throw')throw Error('offline');if(failure==='malformed')return {};return {source:'api_error',blocked:true,error:{message:'denied'}};},listOfficeTemporaryInventoryHolds:async()=>({source:'api',items:[]})}});
 const result=await actions.refreshInventoryIntents();
 assert.equal(result.blocked,true);
 assert.equal(state.value.loading,false);
 assert.equal(state.value.mutatingId,'ACTIVE-WRITE');
 assert.ok(state.value.error);
}

{
 let current=true, finish, calls=0;
 const state=createState({items:[],holds:[],loading:false});
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',isInventoryReadOwnerCurrent:()=>current,serverRequired:()=>false,setInventoryIntentState:state.set,api:{listOfficeInventoryIntents:()=>{calls++;return new Promise(resolve=>{finish=resolve});},listOfficeTemporaryInventoryHolds:async()=>({source:'api',items:[]})}});
 const pending=actions.refreshInventoryIntents({showToast:true});await Promise.resolve();current=false;
 const before=structuredClone(state.value);
 finish({source:'api',items:[{intentId:'OLD-ACCOUNT'}]});
 const result=await pending;
 assert.equal(result.stale,true);assert.deepEqual(state.value,before);assert.equal(result.feedback,'');
 assert.equal((await actions.refreshInventoryIntents()).stale,true);assert.equal(calls,1);
}

{
 const {build}=await import('esbuild');const {chromium}=await import('playwright');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import{useOfficeInventoryDetailReads}from'./src/app/useOfficeInventoryDetailReads.js';
 window.calls=0;window.updates=0;
 const api={listOfficeInventoryIntents:()=>{window.calls++;return new Promise(resolve=>window.finish=resolve);},listOfficeTemporaryInventoryHolds:async()=>({source:'api',items:[]})};
 function Harness({user,token}) {
  const[state,setState]=useState({items:[],holds:[]});
  window.actions=useOfficeInventoryDetailReads({api,currentUserId:user,authState:{session:{accessToken:token}},serverRequired:()=>false,setInventoryIntentState:value=>{window.updates++;setState(value);}});
  return <output>{user}:{token}:{JSON.stringify(state.items)}</output>;
 }
 const root=createRoot(document.getElementById('app'));window.render=(user,token)=>root.render(<Harness user={user} token={token}/>);window.unmount=()=>root.unmount();window.render('A','a');
 `},bundle:true,write:false,jsx:'automatic',logLevel:'silent'});
 const browser=await chromium.launch();try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="app"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>window.actions);
  for(const [user,token]of[['B','b'],['B','renewed']]){
   await page.evaluate(()=>{window.oldAction=window.actions.refreshInventoryIntents;window.pending=window.oldAction({showToast:true});});
   await page.waitForFunction(()=>window.finish);
   await page.evaluate(([u,t])=>window.render(u,t),[user,token]);
   await page.waitForFunction(prefix=>document.querySelector('output').textContent.startsWith(prefix),user+':'+token+':');
   const before=await page.evaluate(()=>window.updates);
   const result=await page.evaluate(()=>{window.finish({source:'api',items:[{intentId:'OLD'}]});window.finish=null;return window.pending;});
   assert.equal(result.stale,true);assert.equal(await page.evaluate(()=>window.updates),before);
   const calls=await page.evaluate(()=>window.calls);assert.equal((await page.evaluate(()=>window.oldAction())).stale,true);assert.equal(await page.evaluate(()=>window.calls),calls);
  }
  await page.evaluate(()=>{window.pending=window.actions.refreshInventoryIntents();});await page.waitForFunction(()=>window.finish);
  await page.evaluate(()=>window.unmount());const before=await page.evaluate(()=>window.updates);
  const result=await page.evaluate(()=>{window.finish({source:'api',items:[{intentId:'UNMOUNT'}]});return window.pending;});
  assert.equal(result.stale,true);assert.equal(await page.evaluate(()=>window.updates),before);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 console.log('PASS actual intent read hook account/token/unmount isolation without replacement reads; transport mocked.');
}

{
 const state=createState({detail:null});const requests=[];
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,inventoryCorrectionDraftsRef:{current:[]},inventoryLedgerEntriesRef:{current:[]},setInventoryCorrectionDetailState:state.set,api:{getOfficeInventoryCorrectionDetail:()=>new Promise(resolve=>requests.push(resolve))}});
 const old=actions.loadInventoryCorrectionDetail('OLD');const current=actions.loadInventoryCorrectionDetail('NEW');
 requests[1]({source:'api',detail:{correctionDraftId:'NEW'}});await current;
 requests[0]({source:'api',detail:{correctionDraftId:'OLD'}});
 assert.equal((await old).stale,true);assert.equal(state.value.requestedId,'NEW');assert.equal(state.value.detail.correctionDraftId,'NEW');
}

for(const mode of ['wrong-id','throw']){
 const state=createState({detail:null});
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,inventoryCorrectionDraftsRef:{current:[]},inventoryLedgerEntriesRef:{current:[]},setInventoryCorrectionDetailState:state.set,api:{getOfficeInventoryCorrectionDetail:()=>{if(mode==='throw')throw Error('offline');return {source:'api',detail:{correctionDraftId:'OTHER'}};}}});
 const result=await actions.loadInventoryCorrectionDetail('EXPECTED');
 assert.equal(result.blocked,true);assert.equal(state.value.detail,null);assert.equal(state.value.loading,false);assert.equal(state.value.requestedId,'EXPECTED');assert.ok(state.value.error);
}

{
 const state=createState({items:[]});const requests=[];
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,selectedStockIdRef:{current:'A'},inventoryLedgerFiltersRef:{current:{}},setInventoryLedgerState:state.set,api:{listOfficeInventoryLedgerEntries:()=>new Promise(resolve=>requests.push(resolve))}});
 const old=actions.refreshInventoryLedgerEntries({stockId:'A'});const latest=actions.refreshInventoryLedgerEntries({stockId:'B'});
 requests[1]({source:'api',items:[{inventoryItemId:'B'}],total:1});await latest;
 requests[0]({source:'api',items:[{inventoryItemId:'A'}],total:1});assert.equal((await old).stale,true);assert.equal(state.value.items[0].inventoryItemId,'B');
 const pending=actions.refreshInventoryLedgerEntries({stockId:'A'});await actions.refreshInventoryLedgerEntries({stockId:''});
 requests[2]({source:'api',items:[{inventoryItemId:'A'}],total:1});assert.equal((await pending).stale,true);assert.deepEqual(state.value.items,[]);
}

for(const mode of ['throw','missing','wrong-stock']){
 const state=createState({items:[]});
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,selectedStockIdRef:{current:'EXPECTED'},inventoryLedgerFiltersRef:{current:{}},setInventoryLedgerState:state.set,api:{listOfficeInventoryLedgerEntries:()=>{if(mode==='throw')throw Error('offline');return mode==='missing'?{source:'api'}:{source:'api',items:[{inventoryItemId:'OTHER'}],total:1};}}});
 const result=await actions.refreshInventoryLedgerEntries();
 assert.equal(result.blocked,true);assert.equal(state.value.loading,false);assert.deepEqual(state.value.items,[]);assert.ok(state.value.error);
}

{
 const state=createState({items:[],confirmingId:'BUSY'});const drafts=createState([]);const requests=[];
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,inventoryCorrectionDraftsRef:{current:[]},setInventoryCorrectionQueueState:state.set,setInventoryCorrectionDrafts:drafts.set,api:{listOfficeInventoryCorrectionDrafts:()=>new Promise(resolve=>requests.push(resolve))}});
 const old=actions.refreshInventoryCorrectionQueue();const latest=actions.refreshInventoryCorrectionQueue();
 requests[1]({source:'api',items:[{id:'NEW'}],total:1});await latest;requests[0]({source:'api',items:[{id:'OLD'}],total:1});
 assert.equal((await old).stale,true);assert.equal(state.value.items[0].id,'NEW');assert.equal(drafts.value[0].id,'NEW');assert.equal(state.value.confirmingId,'BUSY');
}
for(const mode of ['throw','missing']){
 const state=createState({items:[],confirmingId:'BUSY'});
 const actions=createOfficeInventoryDetailReadActions({authState:{},currentUserId:'A',serverRequired:()=>false,inventoryCorrectionDraftsRef:{current:[]},setInventoryCorrectionQueueState:state.set,setInventoryCorrectionDrafts:()=>{throw Error('invalid data must not sync');},api:{listOfficeInventoryCorrectionDrafts:()=>{if(mode==='throw')throw Error('offline');return {source:'api'};}}});
 assert.equal((await actions.refreshInventoryCorrectionQueue()).blocked,true);assert.equal(state.value.loading,false);assert.equal(state.value.confirmingId,'BUSY');
}
