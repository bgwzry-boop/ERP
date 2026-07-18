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

function createOrderWriteCase({ api = {}, draftApiMeta = { draftId: "DRAFT-API-1", clientRevision: 2, source: "api" }, draftStatus = "已识别待确认", entryText = "客户A 30*38 白色 100个", serverRequired = false, refreshResults = {} } = {}) {
  const states = {
    draftApiMeta: createState(draftApiMeta),
    draftRows: createState([draftRow]),
    draftStatus: createState(draftStatus),
    entryText: createState(entryText),
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
    entryText,
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
    setEntryText: states.entryText.set,
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

const sourceTextEditCase = createOrderWriteCase({ draftStatus: "已保存草稿" });
assert.deepEqual(sourceTextEditCase.actions.updateOrderEntryText("客户A 30*38 白色 100个，备注急单"), { changed: true });
assert.equal(sourceTextEditCase.states.entryText.value, "客户A 30*38 白色 100个，备注急单");
assert.equal(sourceTextEditCase.states.draftStatus.value, "原文已修改待重新识别");

const unchangedSourceTextCase = createOrderWriteCase({ draftStatus: "已保存草稿" });
assert.deepEqual(unchangedSourceTextCase.actions.updateOrderEntryText("客户A 30*38 白色 100个"), { changed: false });
assert.equal(unchangedSourceTextCase.states.draftStatus.value, "已保存草稿");

const unsupportedEntryActionCase = createOrderWriteCase();
const unsupportedEntryActionResult = await unsupportedEntryActionCase.actions.executeOrderEntryAction("未知草稿动作");
assert.equal(unsupportedEntryActionResult.blocked, true, "unknown order-entry actions must fail closed");
assert.match(unsupportedEntryActionResult.feedback, /未识别订单草稿操作/);
assert.equal(unsupportedEntryActionCase.states.draftStatus.value, "已识别待确认");

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

const holdDraftCase = createOrderWriteCase({
  api: {
    async recognizeOfficeDraft(input) {
      assert.match(input.sourceText, /我要.*30\*38.*20个/);
      return {
        source: "api",
        draft: { draftId: "DRAFT-HOLD-1", clientRevision: 1 },
        rows: [{ ...draftRow, id: "DRAFT-HOLD-1-L1", qty: 20 }],
      };
    },
  },
});
const holdDraftResult = await holdDraftCase.actions.prepareOrderDraftFromTemporaryHold({
  intent: { intentId: "INT-HOLD-1", customerId: "C001", sourceText: "有的话给我留20个" },
  hold: { reservationId: "HOLD-1", reservedQty: 20 },
  candidate: { product: "空白袋", size: "30*38", color: "白色", handle: "普通提", qty: 20 },
});
assert.equal(holdDraftCase.states.draftRows.value[0].sourceHoldId, "HOLD-1");
assert.equal(holdDraftCase.states.draftRows.value[0].sourceIntentId, "INT-HOLD-1");
assert.equal(holdDraftCase.states.draftApiMeta.value.draftId, "DRAFT-HOLD-1");
assert.match(holdDraftCase.states.draftRows.value[0].note, /由临时留货 HOLD-1 转入/);
assert.match(holdDraftResult.feedback, /不会重复扣库存/);

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

const restoreCase = createOrderWriteCase({
  api: {
    async restoreOfficeDraftShortageCancellation(input) {
      assert.equal(input.draftId, "DRAFT-API-1");
      assert.equal(input.draftLineId, "DRAFT-1");
      assert.equal(input.clientRevision, 2);
      assert.equal(input.reason, "客户确认恢复订购");
      return {
        source: "api",
        draft: { draftId: "DRAFT-API-1", clientRevision: 3, status: "待审核" },
        line: { ...draftRow, cancellationStatus: "", excludedFromConfirmation: false, cancellationRestoration: { restoredBy: "U-OFFICE-A" } },
      };
    },
  },
});
restoreCase.states.draftRows.set([{ ...draftRow, cancellationStatus: "库存不足取消", excludedFromConfirmation: true }]);
const restoreResult = await restoreCase.actions.restoreShortageCancelledLine({
  draftLineId: "DRAFT-1",
  reason: "客户确认恢复订购",
});
assert.equal(restoreCase.states.draftRows.value[0].cancellationStatus, "");
assert.equal(restoreCase.states.draftRows.value[0].excludedFromConfirmation, false);
assert.equal(restoreCase.states.draftApiMeta.value.clientRevision, 3);
assert.equal(restoreCase.states.draftStatus.value, "已恢复待确认");
assert.match(restoreResult.feedback, /取消来源和恢复操作已留痕/);

const blockedRestoreCase = createOrderWriteCase({
  serverRequired: true,
  api: {
    async restoreOfficeDraftShortageCancellation() {
      return { source: "local_fallback", line: { ...draftRow, cancellationStatus: "" } };
    },
  },
});
const blockedRestore = await blockedRestoreCase.actions.restoreShortageCancelledLine({
  draftLineId: "DRAFT-1",
  reason: "客户确认恢复订购",
});
assert.equal(blockedRestore.blocked, true);
assert.equal(blockedRestoreCase.states.draftRows.value[0].id, "DRAFT-1");
assert.equal(blockedRestoreCase.states.draftStatus.value, "恢复订购失败");

const crossDraftCancelCase = createOrderWriteCase({
  api: {
    async linkOfficeDraftShortageCancellation(input) {
      assert.equal(input.draftId, "DRAFT-API-1");
      assert.equal(input.draftLineId, "DRAFT-1");
      assert.equal(input.intentId, "INT-CROSS-CANCEL-1");
      assert.equal(input.clientRevision, 2);
      return {
        source: "api",
        draft: { draftId: "DRAFT-API-1", clientRevision: 3, status: "待审核" },
        line: { ...draftRow, cancellationStatus: "库存不足取消", excludedFromConfirmation: true, crossDraftCancellation: { intentId: input.intentId } },
      };
    },
  },
});
const crossDraftCancelResult = await crossDraftCancelCase.actions.linkCrossDraftShortageCancellation({
  intentId: "INT-CROSS-CANCEL-1",
  reason: "办公室核对来源消息后关联到当前草稿明细",
});
assert.equal(crossDraftCancelCase.states.draftRows.value[0].excludedFromConfirmation, true);
assert.equal(crossDraftCancelCase.states.draftApiMeta.value.clientRevision, 3);
assert.equal(crossDraftCancelCase.states.draftStatus.value, "已关联取消待确认");
assert.match(crossDraftCancelResult.feedback, /不会生成正式订单/);

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

const splitPreviewCase = createOrderWriteCase({
  api: {
    async previewOfficeDraftSplit(input) {
      assert.equal(input.draftRows.length, 1);
      return {
        source: "api",
        draftId: input.draftId,
        splitPlan: {
          planHash: "split-plan-001",
          groups: [{ groupId: "SPLIT-1" }, { groupId: "SPLIT-2" }],
          canConfirm: true,
        },
      };
    },
  },
});
const splitPreviewResult = await splitPreviewCase.actions.executeOrderEntryAction("拆分订单");
assert.equal(splitPreviewResult.splitPlan.groups.length, 2);
assert.match(splitPreviewResult.feedback, /2 个客户\/交付组/);
assert.equal(splitPreviewCase.states.draftRows.value.length, 1, "split preview must not split the selected row locally");

const unpersistedSplitCase = createOrderWriteCase({
  draftApiMeta: { draftId: "", clientRevision: 0, source: "local" },
  api: {
    async recognizeOfficeDraft() {
      return {
        source: "api",
        draft: { draftId: "DRAFT-SPLIT-PREPARED", clientRevision: 1 },
        rows: [],
      };
    },
    async saveOfficeDraft(input) {
      assert.equal(input.draftId, "DRAFT-SPLIT-PREPARED");
      assert.equal(input.draftRows[0].id, "DRAFT-1", "current edited rows must be persisted before preview");
      return {
        source: "api",
        draftId: input.draftId,
        draft: { draftId: input.draftId, clientRevision: 2 },
        todos: [],
      };
    },
    async previewOfficeDraftSplit(input) {
      assert.equal(input.draftId, "DRAFT-SPLIT-PREPARED");
      assert.equal(input.clientRevision, 2);
      return {
        source: "api",
        splitPlan: { planHash: "prepared-plan", groups: [{}, {}], canConfirm: true },
      };
    },
  },
});
const unpersistedSplitResult = await unpersistedSplitCase.actions.executeOrderEntryAction("拆分订单");
assert.equal(unpersistedSplitResult.splitPlan.planHash, "prepared-plan");
assert.deepEqual(unpersistedSplitCase.states.draftApiMeta.value, {
  draftId: "DRAFT-SPLIT-PREPARED",
  clientRevision: 2,
  source: "api",
});
assert.equal(unpersistedSplitCase.states.draftStatus.value, "拆单预览待确认");

const splitConfirmCase = createOrderWriteCase({
  serverRequired: true,
  api: {
    async confirmOfficeDraftSplit(input) {
      assert.equal(input.splitPlanHash, "split-plan-001");
      return {
        source: "api",
        draft: { draftId: input.draftId, clientRevision: 3 },
        confirmation: {
          orderId: "ORD-SPLIT-001",
          orderIds: ["ORD-SPLIT-001", "ORD-SPLIT-002"],
          splitConfirmed: true,
          orderLines: [{ id: "ORD-SPLIT-001-01" }, { id: "ORD-SPLIT-002-01" }],
        },
      };
    },
  },
});
const splitConfirmResult = await splitConfirmCase.actions.executeOrderEntryAction("确认拆单", {
  splitPlanHash: "split-plan-001",
});
assert.equal(splitConfirmCase.states.draftStatus.value, "已生成多个正式订单");
assert.equal(splitConfirmResult.navigateTo, "orders");
assert.deepEqual(splitConfirmCase.refreshCalls.sort(), ["fulfillments", "inventory", "orders", "todos"]);
assert.match(splitConfirmResult.feedback, /2 个正式订单/);

const fullyCancelledCase = createOrderWriteCase({
  serverRequired: true,
  api: {
    async confirmOfficeDraftViaApi() {
      return {
        source: "api",
        draft: { draftId: "DRAFT-API-1", clientRevision: 3, status: "库存不足取消" },
        confirmation: {
          orderId: "",
          closedWithoutOrder: true,
          orderLines: [],
          cancelledDraftLineIds: ["DRAFT-1"],
          appliedShortageCancellationIntentIds: ["INT-CANCEL-1"],
        },
      };
    },
  },
});
const fullyCancelledResult = await fullyCancelledCase.actions.executeOrderEntryAction("保存并确认");
assert.equal(fullyCancelledCase.states.draftStatus.value, "库存不足取消");
assert.equal(fullyCancelledCase.states.selectedOrderId.value, "OL-1");
assert.equal(fullyCancelledResult.navigateTo, undefined);
assert.deepEqual(fullyCancelledCase.refreshCalls.sort(), ["inventory", "todos"]);
assert.match(fullyCancelledResult.feedback, /未生成正式订单、库存占用或交付任务/);

const queueCase = createOrderWriteCase({
  api: {
    async recognizeOfficeDraftQueue() {
      return {
        source: "api",
        queueBatch: { batchId: "QBAT-WRITE-1", summary: { queueItemCount: 2, orderDraftCount: 1, intentDraftCount: 1 } },
        drafts: [],
      };
    },
    async listOfficeDraftQueue() {
      return { source: "api", items: [], total: 2, summary: { orderDraftCount: 1, intentDraftCount: 1 } };
    },
  },
});
const queueRecognitionResult = await queueCase.actions.recognizeOrderDraftQueue();
assert.match(queueRecognitionResult.feedback, /订单草稿 1 张，库存\/复核上下文 1 项/);
const queueRefreshResult = await queueCase.actions.refreshOrderDraftQueue("QBAT-WRITE-1");
assert.match(queueRefreshResult.feedback, /共 2 项/);
const queuedOrderItem = {
  kind: "order_draft",
  draft: { draftId: "DRAFT-Q-WRITE-1", sourceText: "队列订单", status: "待审核", clientRevision: 1 },
  rows: [{ ...draftRow, id: "DRAFT-Q-WRITE-1-01", source: "队列订单" }],
};
const openedQueueDraft = queueCase.actions.openQueuedOrderDraft(queuedOrderItem);
assert.equal(queueCase.states.draftApiMeta.value.draftId, "DRAFT-Q-WRITE-1");
assert.equal(queueCase.states.draftRows.value[0].id, "DRAFT-Q-WRITE-1-01");
assert.match(openedQueueDraft.feedback, /已打开独立订单草稿/);
const blockedIntentOpen = queueCase.actions.openQueuedOrderDraft({ kind: "inventory_inquiry", draft: { draftId: "DRAFT-Q-INTENT-1" } });
assert.equal(blockedIntentOpen.blocked, true);
assert.match(blockedIntentOpen.feedback, /不能作为订单明细打开/);

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

console.log("Office order writes check passed: recognition, independent draft queue, save, shortage-cancellation restore, 409 conflict, production fail-closed, confirmation, all-cancelled closure, quantity, and void behavior are covered.");
