import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function createDependencies(api) {
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
      authState: { authenticated: true },
      currentUserId: "U-DRIVER-A",
      customers: [{ id: "C001", name: "客户A" }],
      fulfillmentsRef: { current: [{ id: "F-LOCAL" }] },
      orderLinesRef: { current: [{ id: "O-LOCAL" }] },
      rawMaterialInboundsRef: { current: [{ id: "RMI-LOCAL", status: "可用" }] },
      selectedRawMaterialInboundIdRef: { current: "RMI-LOCAL" },
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
assert.equal(rawResult.selectedRawMaterialInboundId, "RMI-LOCAL");
assert.equal(successCase.state.rawInbounds.value[0].id, "RMI-LOCAL");
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

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
for (const apiName of [
  "listDriverDeliveryTasks",
  "listOfficeRawMaterialInbounds",
  "listOfficeRawMaterialSupplierStatementReviews",
]) {
  assert.equal(appSource.includes(apiName), false, `App should not directly orchestrate ${apiName}`);
}
assert.match(workspaceSource, /useOfficeRoleToolReads/);
assert.match(workspaceSource, /\.\.\.roleToolReads/);
assert.match(workspaceSource, /selectedRawMaterialInboundIdRef\.current = selectedRawMaterialInboundId/);

console.log("Office role-tool reads check passed: driver, raw-material, supplier-review, and denial behavior are covered.");
