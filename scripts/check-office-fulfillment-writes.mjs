import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeFulfillmentWriteActions } from "../src/app/useOfficeFulfillmentWrites.js";

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

const delivery = {
  id: "F008",
  method: "送货",
  customerId: "C001",
  lineId: "OL-1",
  goods: "30*38 白色空白袋",
  qty: 500,
  latest: "今天",
  status: "待出库",
  watermarkedPhotoAttachmentId: "ATT-WATERMARK-1",
};

function createFulfillmentWriteCase({ api = {}, refreshResults = {}, serverRequired = false } = {}) {
  const states = {
    fulfillments: createState([delivery]),
    selectedTodoId: createState(""),
    todos: createState([]),
  };
  const fulfillmentsRef = { current: states.fulfillments.value };
  const todosRef = { current: states.todos.value };
  const refreshCalls = [];
  const refresh = (name) => async (options = {}) => {
    refreshCalls.push({ name, options });
    return refreshResults[name] ?? { source: "api" };
  };
  const actions = createOfficeFulfillmentWriteActions({
    api,
    authState: {},
    currentUserDisplayName: "办公室A",
    currentUserId: "U-OFFICE-A",
    fulfillmentsRef,
    refreshFulfillments: refresh("fulfillments"),
    refreshInventoryRecords: refresh("inventory"),
    refreshStatements: refresh("statements"),
    refreshTodos: refresh("todos"),
    serverRequired: () => serverRequired,
    setFulfillments: states.fulfillments.set,
    setSelectedTodoId: states.selectedTodoId.set,
    setTodos: states.todos.set,
    todosRef,
  });
  return { actions, fulfillmentsRef, refreshCalls, states, todosRef };
}

const preparedCase = createFulfillmentWriteCase({
  api: {
    async markOfficeFulfillmentPrepared(input) {
      assert.equal(input.fulfillment.id, "F008");
      return { source: "api", fulfillmentId: "F008", status: "已备货" };
    },
  },
});
const preparedResult = await preparedCase.actions.markFulfillmentPrepared({ fulfillment: delivery });
assert.equal(preparedCase.states.fulfillments.value[0].status, "已备货");
assert.deepEqual(preparedCase.refreshCalls.map((item) => item.name), ["fulfillments"]);
assert.match(preparedResult.feedback, /未扣减库存/);

const productionFallbackCase = createFulfillmentWriteCase({
  serverRequired: true,
  api: {
    async markOfficeFulfillmentPrepared() {
      return { source: "local_fallback", fulfillmentId: "F008", status: "已备货" };
    },
  },
});
const productionFallback = await productionFallbackCase.actions.markFulfillmentPrepared({ fulfillment: delivery });
assert.equal(productionFallback.blocked, true);
assert.equal(productionFallback.upstreamSource, "local_fallback");
assert.equal(productionFallbackCase.states.fulfillments.value[0].status, "待出库");

const completeCase = createFulfillmentWriteCase({
  api: {
    async completeOfficeFulfillment(input) {
      assert.equal(input.actualQty, 500);
      return { source: "api", fulfillmentId: "F008", status: "已交付", statementCandidate: true };
    },
  },
});
const completeResult = await completeCase.actions.completeFulfillmentAction({ action: "完成送货", fulfillment: delivery });
assert.equal(completeCase.states.fulfillments.value[0].status, "已交付");
assert.deepEqual(
  completeCase.refreshCalls.map((item) => item.name).sort(),
  ["fulfillments", "inventory", "statements", "todos"],
);
assert.equal(completeResult.projectionRefreshFailed, false);
assert.match(completeResult.feedback, /进入对账候选/);

const conflictCase = createFulfillmentWriteCase({
  api: {
    async completeOfficeFulfillment() {
      return {
        source: "api_error",
        blocked: true,
        error: { code: "INVENTORY_RESERVATION_CONFLICT", message: "库存占用版本冲突。" },
      };
    },
  },
});
const conflictResult = await conflictCase.actions.completeFulfillmentAction({ action: "完成送货", fulfillment: delivery });
assert.equal(conflictResult.blocked, true);
assert.equal(conflictCase.states.fulfillments.value[0].status, "待出库");
assert.match(conflictResult.feedback, /版本冲突/);

const pickupCase = createFulfillmentWriteCase({
  api: {
    async confirmOfficeFulfillmentPickup() {
      return { source: "api", fulfillmentId: "F003", status: "已交付", statementCandidate: true };
    },
  },
});
const pickupResult = await pickupCase.actions.completeFulfillmentAction({
  action: "确认已拉走",
  fulfillment: { ...delivery, id: "F003", method: "快递快运" },
});
assert.match(pickupResult.feedback, /快递\/快运现在才进入交付和对账/);

const dispatchCase = createFulfillmentWriteCase({
  api: {
    async updateOfficeFulfillmentDispatch() {
      return {
        source: "api",
        fulfillmentId: "F008",
        dispatch: {
          driverId: "U-DRIVER-A",
          routeDate: "2026-07-12",
          routeNo: "R-01",
          routeSequence: 2,
          stopSequence: 2,
          dispatchStatus: "已派单",
        },
      };
    },
  },
});
const dispatchResult = await dispatchCase.actions.saveFulfillmentDispatch({
  fulfillment: delivery,
  payload: { driverId: "U-DRIVER-A", routeDate: "2026-07-12", routeNo: "R-01", routeSequence: 2 },
});
assert.equal(dispatchCase.states.fulfillments.value[0].routeNo, "R-01");
assert.equal(dispatchCase.states.fulfillments.value[0].routeSequence, 2);
assert.match(dispatchResult.feedback, /第 2 站/);

const exceptionCase = createFulfillmentWriteCase({
  api: {
    async createOfficeFulfillmentException() {
      return { source: "api", fulfillmentId: "F008", status: "数量差异待处理", todoId: "T-EX-1" };
    },
  },
});
const exceptionResult = await exceptionCase.actions.submitFulfillmentException({
  fulfillment: delivery,
  modalType: "mismatch",
  payload: { actualQty: 480, reason: "数量不符" },
});
assert.equal(exceptionCase.states.fulfillments.value[0].status, "数量差异待处理");
assert.equal(exceptionCase.states.fulfillments.value[0].actualQty, 480);
assert.deepEqual(
  exceptionCase.refreshCalls.map((item) => item.name).sort(),
  ["fulfillments", "inventory", "todos"],
);
assert.match(exceptionResult.feedback, /生成办公室公共待办/);

const evidenceCase = createFulfillmentWriteCase({
  api: {
    async reviewOfficeDeliveryEvidence(input) {
      assert.equal(input.reviewStatus, "approved");
      return {
        source: "api",
        fulfillmentId: "F008",
        reviewStatus: "已复核",
        reviewedAt: "2026-07-11T05:00:00.000Z",
        reviewedBy: "办公室A",
        reviewedByUserId: "U-OFFICE-A",
      };
    },
  },
});
const evidenceResult = await evidenceCase.actions.reviewFulfillmentDeliveryEvidence({
  action: "证据复核通过",
  fulfillment: delivery,
});
assert.equal(evidenceCase.states.fulfillments.value[0].deliveryEvidenceReviewStatus, "已复核");
assert.deepEqual(evidenceCase.refreshCalls.map((item) => item.name).sort(), ["fulfillments", "todos"]);
assert.match(evidenceResult.feedback, /复核送达证据/);

const missingEvidenceCase = createFulfillmentWriteCase();
const missingEvidence = await missingEvidenceCase.actions.reviewFulfillmentDeliveryEvidence({
  action: "证据复核通过",
  fulfillment: { ...delivery, watermarkedPhotoAttachmentId: "" },
});
assert.equal(missingEvidence.blocked, true);
assert.equal(missingEvidence.error.code, "DELIVERY_WATERMARK_REQUIRED");

const refreshFailureCase = createFulfillmentWriteCase({
  refreshResults: { inventory: { source: "api_error", blocked: true, error: { message: "offline" } } },
  api: {
    async completeOfficeFulfillment() {
      return { source: "api", fulfillmentId: "F008", status: "已交付" };
    },
  },
});
const refreshFailure = await refreshFailureCase.actions.completeFulfillmentAction({
  action: "完成送货",
  fulfillment: delivery,
});
assert.equal(refreshFailure.projectionRefreshFailed, true);
assert.match(refreshFailure.feedback, /已由后端提交.*刷新失败/);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const directWrite of [
  "completeOfficeFulfillment",
  "confirmOfficeFulfillmentPickup",
  "createOfficeFulfillmentException",
  "markOfficeFulfillmentPrepared",
  "reviewOfficeDeliveryEvidence",
  "updateOfficeFulfillmentDispatch",
]) {
  assert.equal(appSource.includes(directWrite), false, `App must not own ${directWrite}`);
}
assert.equal(appSource.includes("后端暂未接该轻量状态"), false);
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
assert.match(workspaceSource, /useOfficeFulfillmentWrites/);
assert.match(workspaceSource, /\.\.\.fulfillmentWrites/);

console.log("Office fulfillment writes check passed: prepared, complete/pickup, conflict, production fail-closed, dispatch, exception, evidence, and committed projection refreshes are covered.");
