import assert from "node:assert/strict";
import { createOfficeRoleToolReadActions } from "../src/app/useOfficeRoleToolReads.js";

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

function createDependencies(api, { serverRequired = () => false, activePage, isRawMaterialReadCurrent, authState = { authenticated: true } } = {}) {
  const state = {
    driverTasks: createState([]),
    selectedDriverTaskId: createState("F-OLD"),
    driverMeta: createState({ source: "local", loading: false }),
    rawInbounds: createState([]),
    selectedRawInboundId: createState("RMI-LOCAL"),
    rawMeta: createState({ source: "local", loading: false }),
    supplierReviews: createState([]),
    supplierReviewMeta: createState({ source: "local", loading: false }),
  };
  return {
    actions: createOfficeRoleToolReadActions({
      api,
      activePage,
      isRawMaterialReadCurrent,
      authState,
      currentUserId: "U-DRIVER-A",
      customers: [{ id: "C001", name: "客户A" }],
      fulfillmentsRef: { current: [{ id: "F-LOCAL" }] },
      orderLinesRef: { current: [{ id: "O-LOCAL" }] },
      rawMaterialInboundsRef: { current: [{ id: "RMI-LOCAL", status: "可用" }] },
      selectedRawMaterialInboundIdRef: { current: "RMI-LOCAL" },
      serverRequired,
      setDriverDeliveryTasks: state.driverTasks.set,
      setSelectedDriverTaskId: state.selectedDriverTaskId.set,
      setDriverDeliveryMeta: state.driverMeta.set,
      setRawMaterialInbounds: state.rawInbounds.set,
      setSelectedRawMaterialInboundId: state.selectedRawInboundId.set,
      setRawMaterialInboundMeta: state.rawMeta.set,
      setRawMaterialSupplierStatementReviews: state.supplierReviews.set,
      setRawMaterialSupplierStatementReviewMeta: state.supplierReviewMeta.set,
    }),
    state,
  };
}

const api = {
  async listDriverDeliveryTasks() {
    return {
      source: "api",
      items: [{ fulfillmentId: "F-API", status: "待送货" }],
      total: 1,
      metrics: { pending: 1 },
    };
  },
  async listOfficeRawMaterialInbounds() {
    return { source: "api", items: [], total: 0 };
  },
  async listOfficeRawMaterialSupplierStatementReviews() {
    return { source: "api", items: [{ reviewId: "RMSR-API", status: "待复核" }], total: 1 };
  },
};

const successCase = createDependencies(api);
const driverResult = await successCase.actions.refreshDriverDeliveryTasks({ showToast: true });
assert.equal(successCase.state.driverTasks.value[0].fulfillmentId, "F-API");
assert.equal(successCase.state.selectedDriverTaskId.value, "F-API");
assert.equal(successCase.state.driverMeta.value.source, "api");
assert.match(driverResult.feedback, /司机送货任务已通过后端 API刷新/);

const rawResult = await successCase.actions.refreshRawMaterialInbounds({ showToast: true });
assert.equal(rawResult.selectedRawMaterialInboundId, "");
assert.deepEqual(successCase.state.rawInbounds.value, [], "an authoritative API empty state must clear stale local rows");
assert.match(rawResult.feedback, /打印标签仍不会直接入可用库存/);

const supplierResult = await successCase.actions.refreshRawMaterialSupplierStatementReviews({ showToast: true });
assert.equal(successCase.state.supplierReviews.value[0].reviewId, "RMSR-API");
assert.match(supplierResult.feedback, /草稿不写库存、不生成应付、不确认付款/);

const blockedApi = {
  ...api,
  async listOfficeRawMaterialInbounds() {
    return {
      source: "api_error",
      blocked: true,
      error: { message: "权限不足", requiredPermission: "raw_material.inbound.view" },
    };
  },
};
const blockedCase = createDependencies(blockedApi);
const blockedResult = await blockedCase.actions.refreshRawMaterialInbounds({ showToast: true });
assert.equal(blockedResult.blocked, true);
assert.equal(blockedCase.state.rawMeta.value.error, "权限不足");
assert.match(blockedResult.feedback, /缺少权限 raw_material\.inbound\.view/);

const formalOptions = [];
const formalFallbackApi = {
  async listDriverDeliveryTasks(_input, options) {
    formalOptions.push(options);
    return { source: "local_fallback", items: [{ fulfillmentId: "F-LOCAL-FALLBACK" }], total: 1 };
  },
  async listOfficeRawMaterialInbounds(_input, options) {
    formalOptions.push(options);
    return { source: "local_fallback", items: [{ id: "RMI-LOCAL-FALLBACK" }], total: 1 };
  },
  async listOfficeRawMaterialSupplierStatementReviews(_input, options) {
    formalOptions.push(options);
    return { source: "local_fallback", items: [{ reviewId: "RMSR-LOCAL-FALLBACK" }], total: 1 };
  },
};
const formalCase = createDependencies(formalFallbackApi, { serverRequired: () => true });
assert.equal((await formalCase.actions.refreshDriverDeliveryTasks({ showToast: true })).blocked, true);
assert.equal((await formalCase.actions.refreshRawMaterialInbounds({ showToast: true })).blocked, true);
assert.equal((await formalCase.actions.refreshRawMaterialSupplierStatementReviews({ showToast: true })).blocked, true);
assert.deepEqual(formalCase.state.driverTasks.value, []);
assert.deepEqual(formalCase.state.rawInbounds.value, []);
assert.deepEqual(formalCase.state.supplierReviews.value, []);
assert.equal(formalCase.state.selectedDriverTaskId.value, "F-OLD");
assert.equal(formalCase.state.selectedRawInboundId.value, "");
assert.equal(formalOptions.every((options) => options?.serverRequired === true), true);

console.log("Office role-tool reads check passed: driver, raw-material, supplier-review, API empty-state clearing, denial, and production fail-closed behavior are covered.");

let fullReceiptCalls = 0;
let stockCalls = 0;
const workerCase = createDependencies({
  async listOfficeRawMaterialInbounds() { fullReceiptCalls += 1; throw new Error("worker requested receipt data"); },
  async listOfficeRawMaterialStockInbounds() { stockCalls += 1; return { source: "api", items: [{ id: "STOCK-INBOUND", revision: 3, projectionScope: "stock_only", rolls: [{ id: "ROLL-201" }] }], total: 1, rollTotal: 201 }; },
}, { serverRequired: () => true, authState: { permissions: { actionPermissions: ["raw_material.stock.read"] } } });
await workerCase.actions.refreshRawMaterialInbounds();
assert.equal(stockCalls, 1);
assert.equal(fullReceiptCalls, 0);
assert.equal(workerCase.state.rawInbounds.value[0].projectionScope, "stock_only");
assert.equal(workerCase.state.selectedRawInboundId.value, "STOCK-INBOUND");

// Scanner must use all-page stock reads even when receipt permission also exists.
const dualAuth = { permissions: { actionPermissions: ['raw_material.stock.read', 'raw_material.inbound.read'] } };
let scannerStockCalls = 0, scannerReceiptCalls = 0;
const dualApi = {
  async listOfficeRawMaterialStockInbounds() { scannerStockCalls++; return {source:'api',items:[{id:'LAST',projectionScope:'stock_only',rolls:[{id:'ROLL-201'}]}],total:1}; },
  async listOfficeRawMaterialInbounds() { scannerReceiptCalls++; return {source:'api',items:[],total:0}; },
};
const scanner = createDependencies(dualApi,{activePage:'rawMaterialScanner',authState:dualAuth,serverRequired:()=>true});
await scanner.actions.refreshRawMaterialInbounds();
assert.equal(scanner.state.rawInbounds.value[0].rolls[0].id,'ROLL-201');
assert.equal(scannerStockCalls,1);assert.equal(scannerReceiptCalls,0);
await createDependencies(dualApi,{activePage:'rawMaterials',authState:dualAuth}).actions.refreshRawMaterialInbounds();
assert.equal(scannerReceiptCalls,1);
let resolveOld, current = true;
const old = createDependencies({listOfficeRawMaterialInbounds:()=>new Promise(resolve=>resolveOld=resolve)}, {isRawMaterialReadCurrent:()=>current});
const pending = old.actions.refreshRawMaterialInbounds();
current=false;resolveOld({source:'api',items:[{id:'OLD-RECEIPT'}],total:1});
assert.equal((await pending).source,'superseded');
assert.deepEqual(old.state.rawInbounds.value,[]);
console.log('Scanner dual-permission routing, receipt routing and superseded response suppression passed.');
