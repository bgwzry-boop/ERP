import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeOrderWriteActions } from "../src/app/useOfficeOrderWrites.js";

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

const draftRow = {
  id: "DRAFT-1",
  customerId: "C001",
  customer: "客户A",
  product: "空白袋",
  size: "30*38",
  color: "白色",
  handle: "普通提",
  style: "空白袋",
  print: "否",
  qty: 100,
  fulfillment: "自提",
  latest: "明天",
  printColor: "非印刷",
  printSide: "非印刷",
  artworkStatus: "非印刷",
  inventory: "可用",
  amount: 100,
  source: "测试订单",
};

function createOrderWriteCase({ api = {}, serverRequired = false, refreshResults = {} } = {}) {
  const states = {
    draftApiMeta: createState({ draftId: "DRAFT-API-1", clientRevision: 2, source: "api" }),
    draftRows: createState([draftRow]),
    draftStatus: createState("已识别待确认"),
    fulfillments: createState([{ id: "F001", lineId: "OL-1", qty: 10, status: "待出库" }]),
    inventoryRecords: createState([{ id: "S001", size: "30*38", color: "白色", handle: "普通提", style: "空白袋", inStock: 500, reserved: 0 }]),
    orderLines: createState([{ id: "OL-1", qty: 10, originalQty: 10, amount: 100, exceptions: [] }]),
    selectedDraftId: createState("DRAFT-1"),
    selectedOrderId: createState("OL-1"),
    selectedTodoId: createState(""),
    statements: createState([{ id: "ST-1", receivable: 100, received: 20, variance: 80 }]),
    todos: createState([]),
  };
  const refreshCalls = [];
  const refresh = (name) => async () => {
    refreshCalls.push(name);
    return refreshResults[name] ?? { source: "api" };
  };
  const actions = createOfficeOrderWriteActions({
    api,
    authState: {},
    currentUserId: "U-OFFICE-A",
    customers: [{ id: "C001", name: "客户A" }],
    draftApiMeta: states.draftApiMeta.value,
    draftRows: states.draftRows.value,
    entryText: "客户A 30*38 白色 100个",
    fulfillments: states.fulfillments.value,
    inventoryRecords: states.inventoryRecords.value,
    orderLines: states.orderLines.value,
    selectedDraftId: states.selectedDraftId.value,
    createSplitId: () => "DRAFT-SPLIT-TEST",
    refreshFulfillments: refresh("fulfillments"),
    refreshInventoryRecords: refresh("inventory"),
    refreshOrderPool: refresh("orders"),
    refreshTodos: refresh("todos"),
    serverRequired: () => serverRequired,
    setDraftApiMeta: states.draftApiMeta.set,
    setDraftRows: states.draftRows.set,
    setDraftStatus: states.draftStatus.set,
    setFulfillments: states.fulfillments.set,
    setInventoryRecords: states.inventoryRecords.set,
    setOrderLines: states.orderLines.set,
    setSelectedDraftId: states.selectedDraftId.set,
    setSelectedOrderId: states.selectedOrderId.set,
    setSelectedTodoId: states.selectedTodoId.set,
    setStatements: states.statements.set,
    setTodos: states.todos.set,
  });
  return { actions, refreshCalls, states };
}

const recognizeCase = createOrderWriteCase({
  api: {
    async recognizeOfficeDraft() {
      return {
        source: "api",
        draft: { draftId: "DRAFT-RECOGNIZED", clientRevision: 1 },
        rows: [{ ...draftRow, id: "DRAFT-RECOGNIZED-L1" }],
      };
    },
  },
});
const recognizeResult = await recognizeCase.actions.recognizeOrderDraft();
assert.equal(recognizeCase.states.draftRows.value[0].id, "DRAFT-RECOGNIZED-L1");
assert.equal(recognizeCase.states.draftStatus.value, "已识别待确认");
assert.equal(recognizeCase.states.draftApiMeta.value.draftId, "DRAFT-RECOGNIZED");
assert.match(recognizeResult.feedback, /后端 API.*识别 1 行/);

const saveCase = createOrderWriteCase({
  api: {
    async saveOfficeDraft() {
      return {
        source: "api",
        draftId: "DRAFT-API-1",
        draft: { draftId: "DRAFT-API-1", clientRevision: 3 },
        todos: [{ id: "T-SAVE-1", type: "订单草稿待确认", customerId: "C001", summary: "待确认" }],
      };
    },
  },
});
const saveResult = await saveCase.actions.executeOrderEntryAction("保存草稿");
assert.equal(saveCase.states.draftStatus.value, "已保存草稿");
assert.equal(saveCase.states.draftApiMeta.value.clientRevision, 3);
assert.equal(saveCase.states.todos.value[0].id, "T-SAVE-1");
assert.equal(saveCase.states.selectedTodoId.value, "T-SAVE-1");
assert.match(saveResult.feedback, /后端 API保存/);

const voidDraftCase = createOrderWriteCase({
  api: {
    async saveOfficeDraft(input) {
      assert.equal(input.draftStatus, "已作废");
      assert.equal(input.saveReason, "office_entry_void_draft");
      return {
        source: "api",
        draftId: input.draftId,
        draft: { draftId: input.draftId, clientRevision: 3, status: "已作废" },
        todos: [],
      };
    },
  },
});
const voidDraftResult = await voidDraftCase.actions.executeOrderEntryAction("作废草稿");
assert.equal(voidDraftCase.states.draftStatus.value, "已作废");
assert.equal(voidDraftCase.states.todos.value.length, 0);
assert.match(voidDraftResult.feedback, /后端 API作废/);

const conflictCase = createOrderWriteCase({
  api: {
    async saveOfficeDraft() {
      return {
        source: "api_error",
        blocked: true,
        error: { code: "ORDER_DRAFT_REVISION_CONFLICT", message: "草稿版本冲突，请刷新后重试。" },
      };
    },
  },
});
const conflictResult = await conflictCase.actions.executeOrderEntryAction("保存草稿");
assert.equal(conflictCase.states.draftStatus.value, "保存失败");
assert.equal(conflictCase.states.todos.value.length, 0);
assert.match(conflictResult.feedback, /版本冲突/);

const productionFallbackCase = createOrderWriteCase({
  serverRequired: true,
  api: {
    async saveOfficeDraft() {
      return { source: "local_fallback", draftId: "DRAFT-LOCAL", todos: [] };
    },
  },
});
const productionFallbackResult = await productionFallbackCase.actions.executeOrderEntryAction("保存草稿");
assert.equal(productionFallbackResult.blocked, true);
assert.equal(productionFallbackResult.source, "api_error");
assert.equal(productionFallbackResult.upstreamSource, "local_fallback");
assert.equal(productionFallbackCase.states.draftStatus.value, "保存失败");
assert.equal(productionFallbackCase.states.todos.value.length, 0);

const confirmCase = createOrderWriteCase({
  serverRequired: true,
  api: {
    async confirmOfficeDraftViaApi() {
      return {
        source: "api",
        draft: { draftId: "DRAFT-API-1", clientRevision: 3 },
        confirmation: { orderId: "ORD-1", orderLines: [{ id: "OL-CONFIRMED" }] },
      };
    },
  },
});
const confirmResult = await confirmCase.actions.executeOrderEntryAction("保存并确认");
assert.equal(confirmCase.states.draftStatus.value, "已确认");
assert.equal(confirmCase.states.selectedOrderId.value, "OL-CONFIRMED");
assert.equal(confirmResult.navigateTo, "orders");
assert.deepEqual(confirmCase.refreshCalls.sort(), ["fulfillments", "inventory", "orders", "todos"]);
assert.match(confirmResult.feedback, /投影已刷新/);

const quantityCase = createOrderWriteCase({
  api: {
    async adjustOfficeOrderLineQuantity() {
      return {
        source: "api",
        orderLineId: "OL-1",
        previousQty: 10,
        newQty: 6,
        finalAmount: 60,
        adjustedStatements: [{ statementId: "ST-1", receivable: 60, received: 20, variance: 40 }],
      };
    },
  },
});
const quantityResult = await quantityCase.actions.executeOrderLineAction({
  action: "quantity",
  orderLine: quantityCase.states.orderLines.value[0],
  payload: { newQty: 6, reason: "客户改量" },
});
assert.equal(quantityCase.states.orderLines.value[0].qty, 6);
assert.equal(quantityCase.states.orderLines.value[0].amount, 60);
assert.equal(quantityCase.states.fulfillments.value[0].qty, 6);
assert.equal(quantityCase.states.statements.value[0].receivable, 60);
assert.equal(quantityResult.closeModal, true);
assert.match(quantityResult.feedback, /数量从 10 调整为 6/);

const deniedVoidCase = createOrderWriteCase({
  api: {
    async voidOfficeOrderLine() {
      return {
        source: "api_error",
        blocked: true,
        error: { requiredPermission: "order.void", message: "forbidden" },
      };
    },
  },
});
const deniedVoidResult = await deniedVoidCase.actions.executeOrderLineAction({
  action: "void",
  orderLine: deniedVoidCase.states.orderLines.value[0],
  payload: { reason: "客户取消" },
});
assert.equal(deniedVoidResult.closeModal, undefined);
assert.equal(deniedVoidCase.states.orderLines.value[0].status, undefined);
assert.match(deniedVoidResult.feedback, /缺少权限 order\.void/);

const unsupportedCase = createOrderWriteCase();
const unsupportedResult = await unsupportedCase.actions.executeOrderLineAction({
  action: "delete_everything",
  orderLine: unsupportedCase.states.orderLines.value[0],
  payload: {},
});
assert.equal(unsupportedResult.blocked, true);
assert.equal(unsupportedResult.error.code, "ORDER_LINE_ACTION_UNSUPPORTED");
assert.equal(unsupportedCase.states.orderLines.value[0].status, undefined);

const voidCase = createOrderWriteCase({
  api: {
    async voidOfficeOrderLine() {
      return { source: "api", orderLineId: "OL-1", canceledFulfillmentIds: ["F001"] };
    },
  },
});
const voidResult = await voidCase.actions.executeOrderLineAction({
  action: "void",
  orderLine: voidCase.states.orderLines.value[0],
  payload: { reason: "客户取消" },
});
assert.equal(voidCase.states.orderLines.value[0].status, "已关闭");
assert.equal(voidCase.states.fulfillments.value[0].status, "已取消");
assert.equal(voidResult.closeModal, true);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const directWrite of [
  "confirmOfficeDraftViaApi",
  "recognizeOfficeDraft",
  "saveOfficeDraft",
  "adjustOfficeOrderLineQuantity",
  "voidOfficeOrderLine",
]) {
  assert.equal(appSource.includes(directWrite), false, `App must not own ${directWrite}`);
}
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
assert.match(workspaceSource, /useOfficeOrderWrites/);
assert.match(workspaceSource, /\.\.\.orderWrites/);

console.log("Office order writes check passed: recognition, save, 409 conflict, production fail-closed, confirmation refresh, quantity, and void behavior are covered.");
