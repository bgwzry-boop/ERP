import assert from "node:assert/strict";
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

function createHarness({ allowLocalFallback = false, api = {}, fulfillments: initialFulfillments = baseFulfillments, initialTodos = [], refreshTodoResult } = {}) {
  let fulfillments = initialFulfillments.map((item) => ({
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
  const harness = createHarness();
  await harness.controller.updateFulfillment("打印未知单据", "F-CONTROLLER-DELIVERY");
  assert.equal(harness.getModals().length, 0, "unknown print-like labels must not open a print modal");
  assert.match(harness.toasts.at(-1), /不支持的出库/);
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
  assert.match(harness.toasts.at(-1), /只适用于快递快运/);
  await harness.controller.updateFulfillment("确认已拉走", "F-CONTROLLER-EXPRESS");
  assert.equal(harness.calls.complete.length, 0);
  assert.match(harness.toasts.at(-1), /复核高风险摘要/);
  await harness.controller.updateFulfillment("确认已拉走", "F-CONTROLLER-EXPRESS", {
    confirmedFinalDelivery: true,
    expectedRevision: 2,
    idempotencyKey: "test-express-final-delivery",
  });
  assert.equal(harness.calls.complete.length, 1);
  assert.equal(harness.calls.complete[0].payload.confirmedFinalDelivery, true);
}

{
  const paperReady = {
    ...baseFulfillments[0],
    id: "F-CONTROLLER-PAPER",
    paperOutboundStatus: "已打印待交库房",
    paperOutboundDocument: { paperOutboundDocumentId: "POD-001", documentVersion: 1, revision: 1 },
  };
  const handedOver = {
    ...paperReady,
    id: "F-CONTROLLER-HANDED",
    paperOutboundStatus: "已交库房",
    paperOutboundDocument: { ...paperReady.paperOutboundDocument, revision: 2, status: "已交库房" },
  };
  const harness = createHarness({ fulfillments: [paperReady, handedOver] });
  await harness.controller.updateFulfillment("纸单交库房", "F-CONTROLLER-PAPER");
  assert.equal(harness.getModals()[0]?.type, "paperHandoff");
  await harness.controller.updateFulfillment("回录库房结果", "F-CONTROLLER-HANDED");
  assert.equal(harness.getModals()[1]?.type, "warehouseExecution");
  await harness.controller.updateFulfillment("数量不符", "F-CONTROLLER-HANDED");
  assert.equal(harness.getModals()[2]?.type, "warehouseExecution");
  assert.equal(harness.getModals()[2]?.initialWarehouseResult, "数量不符");
  await harness.controller.updateFulfillment("无法出库", "F-CONTROLLER-PAPER");
  assert.match(harness.toasts.at(-1), /必须基于已交库房/);
}

{
  const harness = createHarness();
  await harness.controller.updateFulfillment("退回重拍", "F-CONTROLLER-DELIVERY", { reason: "照片模糊" });
  assert.equal(harness.calls.review[0]?.customerName, "C001", "missing customer lookup must fall back to customer id");
  assert.equal(harness.calls.review[0]?.reason, "照片模糊");
}

console.log("Office fulfillment actions check passed: evidence reads, todo routing, print gates, and delivery modes are covered with formal-mode safeguards.");
