import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeOrderActions } from "../src/app/createOfficeOrderActions.js";

function createHarness({
  allowLocalFallback = false,
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
  let orderFilters = null;
  const modals = [];
  const toasts = [];
  const calls = { entry: [], fulfillmentRefresh: 0, orderRefresh: 0, statementRefresh: 0 };
  const orderLines = [{ id: "OL-1", orderNo: "ORD-1", customerId: "C001" }];
  const fulfillments = [{ id: "F-1", lineId: "OL-1", method: "送货" }];
  const statements = [{ id: "ST-1", lineIds: ["OL-1"] }];
  const controller = createOfficeOrderActions({
    allowLocalFallback,
    defaultOrderFilters: { status: "全部", customerId: "全部" },
    executeOrderEntryAction: async (label) => {
      calls.entry.push(label);
      return results.entry ?? { source: "api", feedback: `${label}成功`, navigateTo: label === "保存并确认" ? "orders" : undefined };
    },
    fulfillmentSource,
    fulfillments,
    guardUiAction: () => guardResult,
    openOrderActionModal: (value) => modals.push(value),
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
    runOrderDraftCommand: (action) => ({ source: "local_draft", feedback: `${action}完成` }),
    setActivePage: (value) => {
      activePage = value;
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
    setSelectedStatementId: (value) => {
      selectedStatementId = value;
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
    modals,
    state: () => ({ activePage, fulfillmentTab, orderFilters, selectedFulfillmentId, selectedOrderId, selectedStatementId }),
    toasts,
  };
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
  const harness = createHarness();
  const recognition = await harness.controller.recognize();
  assert.equal(recognition.source, "local_fallback", "recognition fallback remains an editable, unpersisted prefill");
  assert.match(harness.toasts.at(-1), /本地识别预填/);
  assert.equal(harness.controller.handleDraftCommand("拆分当前行").source, "local_draft");
  harness.controller.updateDraftField("D-1", "qty", 20);
  assert.deepEqual(harness.calls.draftField, ["D-1", "qty", 20]);
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

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
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
  "async function entryAction(",
]) {
  assert.equal(appSource.includes(localOwner), false, `App must not own ${localOwner}`);
}

console.log("Office order controller check passed: formal writes, source refreshes, navigation, draft-only edits, action gates, and App ownership are isolated.");
