import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeOrderActions } from "../src/app/createOfficeOrderActions.js";

function createHarness({
  api = {},
  allowLocalFallback = false,
  confirmDiscardResult = true,
  draftRows = [],
  draftStatus = "待录入",
  entryText = "",
  fulfillmentSource = "api",
  orderPoolSource = "api",
  statementSource = "api",
  guardResult = true,
  results = {},
} = {}) {
  let activePage = "todos";
  let selectedFulfillmentId = "";
  let fulfillmentTab = "";
  let selectedOrderId = "";
  let selectedStatementId = "";
  let selectedStockId = "";
  let orderFilters = null;
  const modals = [];
  const toasts = [];
  const calls = { entry: [], fulfillmentRefresh: 0, linkCancellation: [], orderRefresh: 0, restore: [], statementRefresh: 0 };
  const orderLines = [{ id: "OL-1", orderNo: "ORD-1", customerId: "C001", size: "30*38*10", color: "红色", handle: "普通提", style: "空白袋" }];
  const inventoryRecords = [{ id: "INV-1", size: "30*38*10", color: "红色", handle: "普通提", style: "空白袋", state: "仓库已清点" }];
  const fulfillments = [{ id: "F-1", lineId: "OL-1", method: "送货" }];
  const statements = [{ id: "ST-1", lineIds: ["OL-1"] }];
  const draftReset = { rows: draftRows, status: draftStatus, entryText, apiMeta: null, selectedId: "DRAFT-1" };
  const controller = createOfficeOrderActions({
    api,
    allowLocalFallback,
    authState: { authenticated: true },
    confirmDiscardDraft: (message) => {
      calls.confirmDiscard = (calls.confirmDiscard ?? 0) + 1;
      calls.confirmMessage = message;
      return confirmDiscardResult;
    },
    defaultOrderFilters: { status: "全部", customerId: "全部" },
    currentUserId: "U-OFFICE-A",
    draftApiMeta: { draftId: "DRAFT-CURRENT" },
    draftRows,
    draftStatus,
    entryText,
    executeOrderEntryAction: async (label, payload) => {
      calls.entry.push({ label, payload });
      return results.entry ?? { source: "api", feedback: `${label}成功`, navigateTo: label === "保存并确认" ? "orders" : undefined };
    },
    fulfillmentSource,
    fulfillments,
    guardUiAction: () => guardResult,
    inventoryRecords,
    linkCrossDraftShortageCancellation: async (input) => {
      calls.linkCancellation.push(input);
      return results.linkCancellation ?? { source: "api", feedback: "关联取消成功" };
    },
    openOrderActionModal: (value) => modals.push(value),
    openQueuedOrderDraft: (item) => {
      calls.openedDraft = item;
      return { source: "api", draft: item.draft, rows: item.rows };
    },
    orderLines,
    orderPoolSource,
    recognizeOrderDraft: async () => results.recognize ?? { source: "local_fallback", feedback: "本地识别预填" },
    refreshFulfillments: async () => {
      calls.fulfillmentRefresh += 1;
      return results.fulfillmentRefresh ?? { source: "api", items: fulfillments };
    },
    refreshOrderPool: async () => {
      calls.orderRefresh += 1;
      return results.orderRefresh ?? { source: "api", items: orderLines };
    },
    refreshStatements: async () => {
      calls.statementRefresh += 1;
      return results.statementRefresh ?? { source: "api", statements };
    },
    resolveLineFromRef: (lines, statementItems, ref) => {
      const exact = lines.find((item) => item.id === ref || item.orderNo === ref);
      if (exact) return exact;
      const statement = statementItems.find((item) => item.id === ref);
      return lines.find((item) => item.id === statement?.lineIds?.[0]) ?? null;
    },
    restoreShortageCancelledLine: async (input) => {
      calls.restore.push(input);
      return results.restore ?? { source: "api", feedback: "恢复订购成功" };
    },
    runOrderDraftCommand: (action) => ({ source: "local_draft", feedback: `${action}完成` }),
    setActivePage: (value) => {
      activePage = value;
    },
    setDraftApiMeta: (value) => {
      draftReset.apiMeta = value;
    },
    setDraftRows: (value) => {
      draftReset.rows = value;
    },
    setDraftStatus: (value) => {
      draftReset.status = value;
    },
    setEntryText: (value) => {
      draftReset.entryText = value;
    },
    setFulfillmentTab: (value) => {
      fulfillmentTab = value;
    },
    setOrderFilters: (value) => {
      orderFilters = value;
    },
    setSelectedFulfillmentId: (value) => {
      selectedFulfillmentId = value;
    },
    setSelectedOrderId: (value) => {
      selectedOrderId = value;
    },
    setSelectedDraftId: (value) => {
      draftReset.selectedId = value;
    },
    setSelectedStatementId: (value) => {
      selectedStatementId = value;
    },
    setSelectedStockId: (value) => {
      selectedStockId = value;
    },
    setToast: (value) => toasts.push(value),
    statementSource,
    statements,
    updateOrderDraftField: (...input) => {
      calls.draftField = input;
    },
  });
  return {
    calls,
    controller,
    draftReset,
    modals,
    state: () => ({ activePage, fulfillmentTab, orderFilters, selectedFulfillmentId, selectedOrderId, selectedStatementId, selectedStockId }),
    toasts,
  };
}

{
  const harness = createHarness({
    api: {
      getOfficeDraft: async ({ draftId }) => ({
        source: "api",
        item: { kind: "order_draft", draft: { id: draftId, draftId }, rows: [{ id: "DRAFT-LINE-REMOTE" }] },
      }),
    },
  });
  const result = await harness.controller.focusOrderDraft("DRAFT-REMOTE");
  assert.equal(result.draft.draftId, "DRAFT-REMOTE");
  assert.equal(harness.calls.openedDraft.kind, "order_draft");
  assert.equal(harness.state().activePage, "entry");
}

{
  const harness = createHarness();
  const stock = await harness.controller.focusInventoryByRef("OL-1", { summary: "30*38红色缺货" });
  assert.equal(stock.id, "INV-1");
  assert.equal(harness.state().selectedStockId, "INV-1");
  assert.equal(harness.state().activePage, "inventory");
}

{
  const harness = createHarness({ draftRows: [{ id: "DRAFT-1" }] });
  await harness.controller.linkCancellationIntentToSelectedLine("INT-CROSS-CANCEL-1");
  assert.deepEqual(harness.calls.linkCancellation, [{
    intentId: "INT-CROSS-CANCEL-1",
    reason: "办公室核对来源消息后关联到当前草稿明细",
  }]);
  assert.match(harness.toasts.at(-1), /关联取消成功/);
}

{
  const harness = createHarness({ draftRows: [{ id: "DRAFT-1" }], draftStatus: "已调整待确认", entryText: "未保存内容", confirmDiscardResult: false });
  assert.equal(harness.controller.createOrderFromTopbar(), null);
  assert.equal(harness.state().activePage, "todos");
  assert.equal(harness.calls.confirmDiscard, 1);
  assert.match(harness.calls.confirmMessage, /尚未保存/);
  assert.equal(harness.draftReset.rows.length, 1);
}

{
  const harness = createHarness({ draftRows: [{ id: "DRAFT-1" }], draftStatus: "已调整待确认", entryText: "未保存内容", confirmDiscardResult: true });
  assert.deepEqual(harness.controller.createOrderFromTopbar(), { blocked: false });
  assert.equal(harness.state().activePage, "entry");
  assert.equal(harness.calls.confirmDiscard, 1);
  assert.deepEqual(harness.draftReset.rows, []);
  assert.equal(harness.draftReset.status, "待录入");
  assert.equal(harness.draftReset.entryText, "");
  assert.equal(harness.draftReset.selectedId, "");
  assert.deepEqual(harness.draftReset.apiMeta, { draftId: "", clientRevision: 0, source: "local" });
}

{
  const harness = createHarness({ results: { entry: { source: "local_fallback", feedback: "本地确认", navigateTo: "orders" } } });
  const result = await harness.controller.entryAction("保存并确认");
  assert.equal(result.blocked, true);
  assert.equal(result.source, "api_error");
  assert.equal(harness.state().activePage, "todos");
  assert.match(harness.toasts.at(-1), /production 不接受本地替代结果/);
}

{
  const harness = createHarness({ allowLocalFallback: true, results: { entry: { source: "local_fallback", feedback: "本地确认", navigateTo: "orders" } } });
  const result = await harness.controller.entryAction("保存并确认");
  assert.equal(result.blocked, undefined);
  assert.equal(harness.state().activePage, "orders");
}

{
  const harness = createHarness({ results: { entry: { source: "api", feedback: "拆单成功", navigateTo: "orders" } } });
  const result = await harness.controller.entryAction("确认拆单", { splitPlanHash: "split-plan-001" });
  assert.equal(result.source, "api");
  assert.deepEqual(harness.calls.entry[0], { label: "确认拆单", payload: { splitPlanHash: "split-plan-001" } });
  assert.equal(harness.state().activePage, "orders");
}

{
  const harness = createHarness();
  const recognition = await harness.controller.recognize();
  assert.equal(recognition.source, "local_fallback", "recognition fallback remains an editable, unpersisted prefill");
  assert.match(harness.toasts.at(-1), /本地识别预填/);
  assert.equal(harness.controller.handleDraftCommand("拆分当前行").source, "local_draft");
  harness.controller.updateDraftField("D-1", "qty", 20);
  assert.deepEqual(harness.calls.draftField, ["D-1", "qty", 20]);
  const restored = await harness.controller.restoreCancelledDraftLine("D-1");
  assert.equal(restored.source, "api");
  assert.deepEqual(harness.calls.restore[0], { draftLineId: "D-1", reason: "客户确认恢复订购" });
  assert.match(harness.toasts.at(-1), /恢复订购成功/);
}

{
  const harness = createHarness();
  harness.controller.openOrderLineAction("delete_everything", { id: "OL-1" });
  assert.equal(harness.modals.length, 0);
  assert.match(harness.toasts.at(-1), /不支持的订单动作/);
  harness.controller.openOrderLineAction("quantity", { id: "OL-1" });
  assert.equal(harness.modals[0]?.type, "quantity");
}

{
  const harness = createHarness({ orderPoolSource: "local" });
  const line = await harness.controller.focusOrderLine("OL-1", "待办");
  assert.equal(harness.calls.orderRefresh, 1);
  assert.equal(line.id, "OL-1");
  assert.equal(harness.state().selectedOrderId, "OL-1");
  assert.equal(harness.state().orderFilters.customerId, "C001");
}

{
  const harness = createHarness({
    orderPoolSource: "local",
    results: { orderRefresh: { source: "local_fallback", items: [{ id: "OL-LOCAL" }] } },
  });
  assert.equal(await harness.controller.focusOrderLine("OL-LOCAL"), null);
  assert.equal(harness.state().selectedOrderId, "");
  assert.match(harness.toasts.at(-1), /不使用本地订单定位/);
}

{
  const harness = createHarness({ fulfillmentSource: "local" });
  const fulfillment = await harness.controller.focusFulfillmentByRef("OL-1");
  assert.equal(harness.calls.fulfillmentRefresh, 1);
  assert.equal(fulfillment.id, "F-1");
  assert.equal(harness.state().activePage, "fulfillment");
  assert.equal(harness.state().fulfillmentTab, "送货");
}

{
  const harness = createHarness({ statementSource: "local" });
  const statement = await harness.controller.focusStatementByRef("ST-1");
  assert.equal(harness.calls.statementRefresh, 1);
  assert.equal(statement.id, "ST-1");
  assert.equal(harness.state().activePage, "statements");
  assert.equal(harness.state().selectedStatementId, "ST-1");
}

{
  const harness = createHarness({ results: { fulfillmentRefresh: { source: "api", items: [] } }, fulfillmentSource: "local" });
  const result = await harness.controller.focusFulfillmentByRef("MISSING");
  assert.equal(result, null);
  assert.equal(harness.state().activePage, "orders");
  assert.match(harness.toasts.at(-1), /或订单明细/);
}

{
  const harness = createHarness({ guardResult: false });
  harness.controller.createOrderFromTopbar();
  assert.equal(harness.state().activePage, "todos");
  assert.equal(await harness.controller.entryAction("保存草稿"), null);
  assert.equal(harness.calls.entry.length, 0);
}

const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
].join("\n");
assert.match(appSource, /createOfficeOrderActions\(\{/);
assert.match(appSource, /fulfillmentSource: fulfillmentMeta\.source/);
assert.match(appSource, /orderPoolSource: orderPoolMeta\.source/);
assert.match(appSource, /statementSource: statementReadMeta\.source/);
for (const localOwner of [
  "function createOrderFromTopbar(",
  "function focusOrderLine(",
  "function focusFulfillmentByRef(",
  "function focusStatementByRef(",
  "function openOrderLineAction(",
  "async function recognize(",
  "function updateDraftField(",
  "function handleDraftCommand(",
  "async function restoreCancelledDraftLine(",
  "async function entryAction(",
]) {
  assert.equal(appSource.includes(localOwner), false, `App must not own ${localOwner}`);
}

console.log("Office order controller check passed: formal writes, source refreshes, navigation, draft-only edits, action gates, and App ownership are isolated.");
