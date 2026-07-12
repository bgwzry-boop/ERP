import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeFulfillmentActions } from "../src/app/createOfficeFulfillmentActions.js";

const baseFulfillments = [
  {
    id: "F-CONTROLLER-DELIVERY",
    lineId: "OL-DELIVERY-001",
    customerId: "C001",
    method: "送货",
    status: "待送货",
    goods: "白鲸袋 35*27 白印黑",
    qty: 100,
    latest: "今天",
    watermarkedPhotoAttachmentId: "ATT-WATERMARK-1",
    deliveryEvidenceAttachmentFiles: [
      { attachmentId: "ATT-WATERMARK-1", fileName: "watermark.jpg", mimeType: "image/jpeg" },
    ],
  },
  {
    id: "F-CONTROLLER-EXPRESS",
    lineId: "OL-EXPRESS-001",
    customerId: "C002",
    method: "快递快运",
    status: "待确认拉走",
    goods: "快运袋",
    qty: 50,
    printed: true,
    printRecordStatus: "printed",
  },
];

function createHarness({ allowLocalFallback = false, api = {}, initialTodos = [], refreshTodoResult } = {}) {
  let fulfillments = baseFulfillments.map((item) => ({
    ...item,
    deliveryEvidenceAttachmentFiles: item.deliveryEvidenceAttachmentFiles?.map((file) => ({ ...file })) ?? [],
  }));
  let todos = initialTodos.map((item) => ({ ...item }));
  let selectedTodoId = "";
  let activePage = "fulfillment";
  const modals = [];
  const viewers = [];
  const toasts = [];
  const calls = { complete: [], prepared: [], review: [] };
  const controller = createOfficeFulfillmentActions({
    allowLocalFallback,
    api,
    authState: { authenticated: true },
    completeFulfillmentAction: async (input) => {
      calls.complete.push(input);
      return { source: "api", feedback: `完成 ${input.action}` };
    },
    createOfficeTodo: (input) => ({ id: "T-LOCAL-1", ...input, handled: false }),
    currentUserId: "U-WAREHOUSE-A",
    findCustomer: () => null,
    focusOrderLine: () => {},
    fulfillments,
    getFulfillmentDocumentLabel: (item) => item.method === "快递快运" ? "标签" : "交付单",
    guardUiAction: () => true,
    loadAttachmentAccessAudit: async () => ({ source: "api", items: [], total: 0 }),
    markFulfillmentPrepared: async (input) => {
      calls.prepared.push(input);
      return { source: "api", feedback: "已备货" };
    },
    mergeAttachmentSummaries: (existing = [], next = []) => {
      const merged = existing.map((item) => ({ ...item }));
      next.forEach((item) => {
        const index = merged.findIndex((current) => current.attachmentId === item.attachmentId);
        if (index >= 0) merged[index] = { ...merged[index], ...item };
        else merged.push(item);
      });
      return merged;
    },
    openAttachmentViewer: (value) => viewers.push(value),
    openModal: (value) => modals.push(value),
    readBlobAsDataUrl: async () => "data:image/jpeg;base64,AA==",
    refreshTodos: async () => refreshTodoResult ?? { source: "api", items: [] },
    reviewFulfillmentDeliveryEvidence: async (input) => {
      calls.review.push(input);
      return { source: "api", feedback: "已复核" };
    },
    selectedFulfillmentId: fulfillments[0].id,
    setActivePage: (value) => {
      activePage = value;
    },
    setFulfillments: (updater) => {
      fulfillments = typeof updater === "function" ? updater(fulfillments) : updater;
    },
    setSelectedTodoId: (value) => {
      selectedTodoId = value;
    },
    setTodos: (updater) => {
      todos = typeof updater === "function" ? updater(todos) : updater;
    },
    setToast: (message) => toasts.push(message),
    todos,
  });
  return {
    calls,
    controller,
    getActivePage: () => activePage,
    getFulfillments: () => fulfillments,
    getModals: () => modals,
    getSelectedTodoId: () => selectedTodoId,
    getTodos: () => todos,
    getViewers: () => viewers,
    toasts,
  };
}

{
  const optionsSeen = [];
  const harness = createHarness({
    api: {
      downloadOfficeAttachmentContent: async (_input, options) => {
        optionsSeen.push(options);
        return { source: "local_fallback" };
      },
    },
  });
  await harness.controller.updateFulfillment("查看水印照片");
  assert.equal(optionsSeen[0]?.serverRequired, true);
  assert.equal(harness.getViewers().length, 0);
  assert.equal(harness.getFulfillments()[0].deliveryEvidenceAttachmentFiles[0].previewDataUrl, undefined);
  assert.match(harness.toasts.at(-1), /读取 API 暂不可用/);
}

{
  const harness = createHarness({
    api: {
      downloadOfficeAttachmentContent: async () => ({
        source: "api",
        contentBlob: {},
        contentType: "image/jpeg",
        contentDisposition: "inline; filename=watermark.jpg",
      }),
    },
  });
  await harness.controller.updateFulfillment("查看水印照片");
  assert.equal(harness.getViewers().length, 1);
  assert.match(harness.getFulfillments()[0].deliveryEvidenceAttachmentFiles[0].previewDataUrl, /^data:image/);
}

{
  const staleTodo = {
    id: "T-STALE-LOCAL",
    ref: "OL-DELIVERY-001",
    type: "无法出库待处理",
    handled: false,
  };
  const harness = createHarness({
    refreshTodoResult: { source: "local_fallback", items: [staleTodo] },
  });
  await harness.controller.updateFulfillment("打开待办");
  assert.equal(harness.getActivePage(), "fulfillment", "formal mode must not navigate to a stale local todo");
  assert.equal(harness.getSelectedTodoId(), "");
  assert.match(harness.toasts.at(-1), /production 不创建本地替代记录/);
}

{
  const staleTodo = {
    id: "T-STALE-IN-STATE",
    ref: "OL-DELIVERY-001",
    type: "无法出库待处理",
    handled: false,
  };
  const harness = createHarness({
    initialTodos: [staleTodo],
    refreshTodoResult: { source: "local_fallback", items: [staleTodo] },
  });
  await harness.controller.updateFulfillment("打开待办");
  assert.equal(harness.getActivePage(), "fulfillment", "formal mode must refresh instead of trusting stale state");
  assert.equal(harness.getSelectedTodoId(), "");
}

{
  const harness = createHarness({ allowLocalFallback: true, refreshTodoResult: { source: "local_fallback", items: [] } });
  await harness.controller.updateFulfillment("打开待办");
  assert.equal(harness.getActivePage(), "todos");
  assert.equal(harness.getSelectedTodoId(), "T-LOCAL-1");
  assert.equal(harness.getTodos()[0].type, "无法出库待处理");
}

{
  const harness = createHarness();
  await harness.controller.updateFulfillment("编辑派单", "F-CONTROLLER-EXPRESS");
  assert.equal(harness.getModals().length, 0);
  assert.match(harness.toasts.at(-1), /只用于送货/);
  await harness.controller.updateFulfillment("编辑派单", "F-CONTROLLER-DELIVERY");
  assert.equal(harness.getModals()[0]?.type, "dispatch");
}

{
  const harness = createHarness();
  await harness.controller.updateFulfillment("作废旧单据", "F-CONTROLLER-DELIVERY");
  assert.equal(harness.getModals().length, 0);
  assert.match(harness.toasts.at(-1), /缺少可作废的打印记录 ID/);
}

{
  const harness = createHarness();
  await harness.controller.updateFulfillment("确认已拉走", "F-CONTROLLER-DELIVERY");
  assert.equal(harness.calls.complete.length, 0);
  assert.match(harness.toasts.at(-1), /只用于快递\/快运/);
  await harness.controller.updateFulfillment("确认已拉走", "F-CONTROLLER-EXPRESS");
  assert.equal(harness.calls.complete[0]?.action, "确认已拉走");
}

{
  const harness = createHarness();
  await harness.controller.updateFulfillment("退回重拍", "F-CONTROLLER-DELIVERY", { reason: "照片模糊" });
  assert.equal(harness.calls.review[0]?.customerName, "C001", "missing customer lookup must fall back to customer id");
  assert.equal(harness.calls.review[0]?.reason, "照片模糊");
}

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSource, /createOfficeFulfillmentActions\(\{/);
assert.match(appSource, /allowLocalFallback: !runtimeServerRequired/);
assert.doesNotMatch(appSource, /async function updateFulfillment\(/);

console.log("Office fulfillment actions check passed: evidence reads, todo routing, print gates, delivery modes, and App ownership are isolated with formal-mode safeguards.");
