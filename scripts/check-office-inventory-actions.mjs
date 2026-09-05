import assert from "node:assert/strict";
import { createOfficeInventoryActions } from "../src/app/createOfficeInventoryActions.js";

function createHarness({
  allowLocalFallback = false,
  inventoryLedgerSource = "api",
  results = {},
  guardResult = true,
} = {}) {
  let activePage = "inventory";
  let selectedFulfillmentId = "";
  let fulfillmentTab = "";
  let selectedOrderId = "";
  let orderFilters = null;
  let productionFocus = null;
  let productionDetailState = null;
  const toasts = [];
  const calls = {
    attachment: [],
    confirm: [],
    create: [],
    detail: [],
    ledgerRefresh: [],
    productionDetail: [],
    queueRefresh: [],
  };
  const orderLines = [{ id: "OL-1", customerId: "C001", orderNo: "ORD-1" }];
  const fulfillments = [{ id: "F-1", fulfillmentId: "FUL-1", lineId: "OL-1", method: "送货" }];
  const productionPacking = {
    productionTasks: [],
    packingTasks: [{ packingTaskId: "PKT-OL-1", orderLineId: "OL-1" }],
    reportResultsByLineId: {},
  };
  const controller = createOfficeInventoryActions({
    allowLocalFallback,
    confirmInventoryCorrectionDraft: async (input) => {
      calls.confirm.push(input);
      return results.confirm ?? { source: "api", confirmation: { id: "IC-1" }, feedback: "确认成功" };
    },
    createInventoryCorrectionDraft: async (input) => {
      calls.create.push(input);
      return results.create ?? { source: "api", draft: { id: "ICD-1" }, feedback: "草稿成功" };
    },
    defaultOrderFilters: { status: "全部", customerId: "全部" },
    fulfillments,
    guardUiAction: () => guardResult,
    inventoryLedgerSource,
    linkInventoryCorrectionAttachment: async (input) => {
      calls.attachment.push(input);
      return results.attachment ?? { source: "api", attachmentIds: ["ATT-1"], feedback: "凭证成功" };
    },
    loadInventoryCorrectionDetail: async (...input) => {
      calls.detail.push(input);
      return results.detail ?? { source: "api", detail: { id: input[0] }, feedback: "详情成功" };
    },
    loadProductionPackingSourceDetail: async (input) => {
      calls.productionDetail.push(input);
      return input;
    },
    orderLines,
    productionPacking,
    refreshInventoryCorrectionQueue: async (input) => {
      calls.queueRefresh.push(input);
      return results.queueRefresh ?? { source: "api", items: [], feedback: "队列成功" };
    },
    refreshInventoryLedgerEntries: async (input) => {
      calls.ledgerRefresh.push(input);
      return results.ledgerRefresh ?? { source: "api", items: [], feedback: "流水成功" };
    },
    resolveLineFromRef: (lines, _statements, ref) => lines.find((item) => item.id === ref) ?? null,
    setActivePage: (value) => {
      activePage = value;
    },
    setFulfillmentTab: (value) => {
      fulfillmentTab = value;
    },
    setOrderFilters: (value) => {
      orderFilters = value;
    },
    setProductionPackingDetailState: (value) => {
      productionDetailState = value;
    },
    setProductionPackingFocus: (value) => {
      productionFocus = value;
    },
    setSelectedFulfillmentId: (value) => {
      selectedFulfillmentId = value;
    },
    setSelectedOrderId: (value) => {
      selectedOrderId = value;
    },
    setToast: (value) => toasts.push(value),
    statements: [],
  });
  return {
    calls,
    controller,
    getState: () => ({
      activePage,
      fulfillmentTab,
      orderFilters,
      productionDetailState,
      productionFocus,
      selectedFulfillmentId,
      selectedOrderId,
    }),
    toasts,
  };
}

{
  const harness = createHarness();
  const draft = await harness.controller.handleInventoryCorrectionDraft({ stock: { id: "S-1" }, actualQty: 9, reason: "盘点" });
  assert.equal(draft.id, "ICD-1");
  assert.match(harness.toasts.at(-1), /草稿成功/);
}

{
  const harness = createHarness({
    results: { create: { source: "local_fallback", draft: { id: "LOCAL-ICD" }, feedback: "本地成功" } },
  });
  const draft = await harness.controller.handleInventoryCorrectionDraft({ stock: { id: "S-1" }, actualQty: 9, reason: "盘点" });
  assert.equal(draft, null);
  assert.match(harness.toasts.at(-1), /production 不接受本地替代结果/);
}

{
  const harness = createHarness({
    results: {
      attachment: { source: "local_fallback", attachmentIds: ["LOCAL-ATT"] },
      confirm: { source: "local_fallback", confirmation: { id: "LOCAL-IC" } },
    },
  });
  const attachment = await harness.controller.handleInventoryCorrectionAttachment({ draft: { id: "ICD-1" }, file: {} });
  const confirmation = await harness.controller.handleInventoryCorrectionConfirm({ id: "ICD-1" });
  assert.equal(attachment.blocked, true);
  assert.equal(attachment.source, "api_error");
  assert.equal(confirmation, null);
}

{
  const harness = createHarness({ guardResult: false });
  const draft = await harness.controller.handleInventoryCorrectionDraft({ stock: { id: "S-1" }, actualQty: 9, reason: "盘点" });
  assert.equal(draft, null);
  assert.equal(harness.calls.create.length, 0);
}

{
  const harness = createHarness({
    results: {
      detail: { source: "local_fallback", detail: { id: "LOCAL-DETAIL" } },
      ledgerRefresh: { source: "local_fallback", items: [{ id: "LOCAL-LEDGER" }] },
      queueRefresh: { source: "local_fallback", items: [{ id: "LOCAL-DRAFT" }] },
    },
  });
  assert.equal(await harness.controller.openInventoryCorrectionDetail("ICD-1"), null);
  assert.equal((await harness.controller.refreshInventoryLedgerAction({ stockId: "S-1" })).blocked, true);
  assert.equal((await harness.controller.refreshInventoryCorrectionQueueAction({})).blocked, true);
}

{
  const harness = createHarness({ inventoryLedgerSource: "local_fallback" });
  harness.controller.focusInventoryLedgerSource({ ledgerId: "LED-LOCAL", sourceType: "order_confirm", sourceId: "OL-1" });
  assert.equal(harness.getState().activePage, "inventory");
  assert.equal(harness.getState().selectedOrderId, "");
  assert.match(harness.toasts.at(-1), /不使用本地流水定位/);
}

{
  const harness = createHarness();
  harness.controller.focusInventoryLedgerSource({ ledgerId: "LED-ORDER", sourceType: "order_confirm", sourceId: "OL-1" });
  assert.deepEqual(harness.getState().orderFilters, { status: "全部", customerId: "C001" });
  assert.equal(harness.getState().activePage, "orders");
  assert.equal(harness.getState().selectedOrderId, "OL-1");
}

{
  const harness = createHarness();
  harness.controller.focusInventoryLedgerSource({ ledgerId: "LED-F", sourceType: "fulfillment_complete", sourceId: "F-1" });
  assert.equal(harness.getState().activePage, "fulfillment");
  assert.equal(harness.getState().selectedFulfillmentId, "F-1");
  assert.equal(harness.getState().fulfillmentTab, "送货");
}

{
  const harness = createHarness();
  harness.controller.focusInventoryLedgerSource({ ledgerId: "LED-P", sourceType: "packing_complete", sourceId: "PKT-OL-1" });
  await Promise.resolve();
  assert.equal(harness.getState().activePage, "packing");
  assert.equal(harness.getState().productionFocus.taskId, "PKT-OL-1");
  assert.equal(harness.calls.productionDetail[0]?.mode, "packing");
}

{
  const harness = createHarness();
  harness.controller.focusInventoryLedgerSource({ ledgerId: "LED-C", sourceType: "inventory_correction", sourceId: "ICD-1" });
  await Promise.resolve();
  assert.equal(harness.calls.detail[0]?.[0], "ICD-1");
}

console.log("Office inventory actions check passed: correction actions, formal API-source gates, refreshes, and ledger navigation are covered.");
