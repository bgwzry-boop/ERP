import assert from "node:assert/strict";
import fs from "node:fs";
import { createOfficeDriverDeliveryActions } from "../src/app/createOfficeDriverDeliveryActions.js";
import { buildDriverDeliveryCompletionSummary } from "../src/services/driverDeliveryCompletionClient.js";

const baseTask = {
  fulfillmentId: "F-DRIVER-1",
  orderLineId: "OL-DRIVER-1",
  customerId: "C-1",
  customerName: "测试客户",
  goodsSummary: "白袋 35*27 1000个",
  qty: 1000,
  latest: "今天 18:00",
  status: "待送货",
  address: "测试工业园",
  addressArea: "测试镇",
  deliveryNoteNo: "DN-1",
  packageChecklist: [
    { packageId: "PKG-1", labelText: "第1包" },
    { packageId: "PKG-2", labelText: "第2包" },
  ],
};

const baseFulfillment = {
  id: "F-DRIVER-1",
  lineId: "OL-DRIVER-1",
  customerId: "C-1",
  method: "送货",
  qty: 1000,
  status: "待送货",
  driverStatus: "待送货",
  deliveryEvidenceAttachmentFiles: [],
};

function createHarness({ allowLocalFallback = false, api = {}, guard = true, initialTodos = [] } = {}) {
  let tasks = [structuredClone(baseTask)];
  let fulfillments = [structuredClone(baseFulfillment)];
  let toast = "";
  const todos = [...initialTodos];
  const addedTodos = [];
  const refreshes = [];
  const guardCalls = [];
  const actions = createOfficeDriverDeliveryActions({
    addTodo: (todo) => {
      addedTodos.push(todo);
      todos.unshift(todo);
    },
    allowLocalFallback,
    api,
    authState: { session: { accessToken: "runtime-token" } },
    currentUser: { displayName: "司机A", loginName: "driver-a" },
    currentUserId: "U-DRIVER-A",
    driverDeliveryTasks: tasks,
    fulfillments,
    guardUiAction: (surface, action) => {
      guardCalls.push([surface, action]);
      return guard;
    },
    mergeAttachmentSummaries: (existing = [], next = []) => [...existing, ...next],
    now: () => "2026-07-12T08:00:00.000Z",
    readFileAsDataUrl: async (file) => file.contentDataUrl || "data:image/png;base64,AA==",
    refreshDriverDeliveryTasks: async (options) => refreshes.push(options),
    setDriverDeliveryTasks: (value) => {
      tasks = typeof value === "function" ? value(tasks) : value;
    },
    setFulfillments: (value) => {
      fulfillments = typeof value === "function" ? value(fulfillments) : value;
    },
    setToast: (value) => { toast = value; },
    todos,
  });
  return {
    actions,
    addedTodos,
    guardCalls,
    refreshes,
    get fulfillments() { return fulfillments; },
    get tasks() { return tasks; },
    get toast() { return toast; },
  };
}

{
  let calls = 0;
  const harness = createHarness({
    guard: false,
    api: { confirmDriverDeliveryLoaded: async () => { calls += 1; } },
  });
  const result = await harness.actions.handleDriverDeliveryAction("确认已装车", {
    fulfillmentId: "F-DRIVER-1",
    checkedPackageIds: ["PKG-1", "PKG-2"],
  });
  assert.equal(result, undefined);
  assert.equal(calls, 0);
  assert.deepEqual(harness.guardCalls, [["driverMobile", "确认已装车"]]);
}

{
  let calls = 0;
  const harness = createHarness({
    api: { confirmDriverDeliveryLoaded: async () => { calls += 1; } },
  });
  await harness.actions.handleDriverDeliveryAction("确认已装车", {
    fulfillmentId: "F-DRIVER-1",
    checkedPackageIds: ["PKG-1"],
  });
  assert.equal(calls, 0);
  assert.match(harness.toast, /还有 1 包未确认/);
  assert.equal(harness.fulfillments[0].status, "待送货");
}

{
  let receivedOptions;
  const harness = createHarness({
    api: {
      confirmDriverDeliveryLoaded: async (_input, options) => {
        receivedOptions = options;
        return { source: "api", blocked: false, status: "配送中" };
      },
    },
  });
  await harness.actions.handleDriverDeliveryAction("确认已装车", {
    fulfillmentId: "F-DRIVER-1",
    checkedPackageIds: ["PKG-1", "PKG-2"],
    routeLabel: "路线 A",
    routeStopLabel: "第 1 站",
  });
  assert.deepEqual(receivedOptions, { serverRequired: true });
  assert.equal(harness.fulfillments[0].status, "配送中");
  assert.equal(harness.tasks[0].status, "配送中");
  assert.equal(harness.fulfillments[0].loadedAt, "2026-07-12T08:00:00.000Z");
  assert.deepEqual(harness.refreshes, [{ showToast: false }]);
}

{
  const harness = createHarness({
    api: {
      confirmDriverDeliveryLoaded: async () => ({ source: "local_fallback", status: "配送中" }),
    },
  });
  await harness.actions.handleDriverDeliveryAction("确认已装车", {
    fulfillmentId: "F-DRIVER-1",
    checkedPackageIds: ["PKG-1", "PKG-2"],
  });
  assert.equal(harness.fulfillments[0].status, "待送货");
  assert.equal(harness.tasks[0].status, "待送货");
  assert.match(harness.toast, /正式后端模式禁止司机写操作使用本地降级结果/);
}

{
  const record = { recordId: "DFT-1", summary: { label: "6/6 通过" } };
  const harness = createHarness({
    api: {
      recordDriverDeviceFieldTest: async (_input, options) => ({
        source: "api",
        blocked: false,
        record,
        options,
      }),
    },
  });
  const result = await harness.actions.handleDriverDeliveryAction("保存验收", {
    fulfillmentId: "F-DRIVER-1",
    record,
  });
  assert.equal(result.record, record);
  assert.equal(harness.fulfillments[0].deviceFieldTestRecord, record);
  assert.equal(harness.tasks[0].deviceFieldTestSummary.label, "6/6 通过");
  assert.match(harness.toast, /后端 API/);
}

{
  const summary = buildDriverDeliveryCompletionSummary({
    task: { ...baseTask, packageCount: 2 },
    payload: {
      actualQty: 998,
      receiverName: "客户仓管",
      paperNoteStatus: "已交回",
      watermarkedPhotoAttached: true,
      signaturePhotoAttached: true,
    },
  });
  assert.equal(summary.title, "确认提交送达");
  assert(summary.fields.some((item) => item.label === "实际数量" && item.value === "998 个（应送 1000 个）"));
  assert(summary.fields.some((item) => item.label === "包裹" && item.value === "2 包"));
  assert(summary.fields.some((item) => item.label === "水印照片" && item.value === "已准备"));
  assert(summary.effects.some((item) => item.includes("对账候选")));
}

{
  let attachmentCalls = 0;
  let completionCalls = 0;
  const harness = createHarness({
    api: {
      createOfficeAttachment: async () => {
        attachmentCalls += 1;
        return { source: "api", blocked: false };
      },
      completeDriverDeliveryTask: async () => {
        completionCalls += 1;
        return { source: "api", blocked: false, status: "已完成" };
      },
    },
  });
  const result = await harness.actions.handleDriverDeliveryAction("提交送达", {
    fulfillmentId: "F-DRIVER-1",
    watermarkedPhotoAttached: true,
    watermarkedPhotoAttachmentId: "ATT-WM-EXISTING",
  });
  assert.equal(result.blocked, true);
  assert.equal(result.error.code, "DRIVER_DELIVERY_COMPLETION_CONFIRMATION_REQUIRED");
  assert.equal(attachmentCalls, 0);
  assert.equal(completionCalls, 0);
  assert.equal(harness.fulfillments[0].status, "待送货");
  assert.match(harness.toast, /未上传凭证或写入送货完成记录/);
}

{
  const attachmentCalls = [];
  let completeInput;
  const harness = createHarness({
    api: {
      createOfficeAttachment: async (input, options) => {
        attachmentCalls.push({ input, options });
        const isWatermark = input.purpose === "delivery_watermark_photo";
        return {
          source: "api",
          blocked: false,
          attachment: {
            attachmentId: isWatermark ? "ATT-WM-1" : "ATT-SIGN-1",
            fileName: input.fileName,
            purpose: input.purpose,
          },
        };
      },
      completeDriverDeliveryTask: async (input, options) => {
        completeInput = input;
        return { source: "api", blocked: false, status: "已完成", options };
      },
    },
  });
  await harness.actions.handleDriverDeliveryAction("提交送达", {
    fulfillmentId: "F-DRIVER-1",
    actualQty: 998,
    receiverName: "客户仓管",
    paperNoteStatus: "已交回",
    watermarkLocationLabel: "客户仓库门口",
    watermarkGeoPoint: "22.9000,113.7000",
    deliveryCompletionConfirmed: true,
    watermarkedPhotoFile: { name: "delivery.png", type: "image/png", size: 12 },
    signaturePhotoFile: { name: "signature.png", type: "image/png", size: 8 },
  });
  assert.equal(attachmentCalls.length, 2);
  assert.deepEqual(attachmentCalls.map((call) => call.options), [{ serverRequired: true }, { serverRequired: true }]);
  assert.equal(completeInput.watermarkedPhotoAttachmentId, "ATT-WM-1");
  assert.equal(completeInput.signaturePhotoAttachmentId, "ATT-SIGN-1");
  assert.equal(completeInput.watermarkCapturedAt, "2026-07-12T08:00:00.000Z");
  assert.equal(harness.fulfillments[0].status, "已交付");
  assert.equal(harness.fulfillments[0].actualQty, 998);
  assert.equal(harness.fulfillments[0].deliveryEvidenceReviewStatus, "待复核");
  assert.equal(harness.fulfillments[0].deliveryEvidenceAttachmentFiles.length, 2);
  assert.equal(harness.tasks[0].status, "已完成");
  assert.match(harness.toast, /水印照片附件 ATT-WM-1 已保存/);
}

{
  const harness = createHarness({
    api: {
      completeDriverDeliveryTask: async () => ({ source: "local_fallback", status: "已完成" }),
    },
  });
  await harness.actions.handleDriverDeliveryAction("提交送达", {
    fulfillmentId: "F-DRIVER-1",
    deliveryCompletionConfirmed: true,
    watermarkedPhotoAttached: true,
    watermarkedPhotoAttachmentId: "ATT-WM-EXISTING",
  });
  assert.equal(harness.fulfillments[0].status, "待送货");
  assert.equal(harness.tasks[0].status, "待送货");
  assert.match(harness.toast, /正式后端模式禁止司机写操作使用本地降级结果/);
}

{
  let receivedOptions;
  const harness = createHarness({
    api: {
      reportDriverDeliveryException: async (_input, options) => {
        receivedOptions = options;
        return { source: "api", blocked: false, status: "送货异常", todoId: "TODO-DRIVER-1" };
      },
    },
  });
  await harness.actions.handleDriverDeliveryAction("送货异常", {
    fulfillmentId: "F-DRIVER-1",
    reason: "客户不在",
  });
  assert.deepEqual(receivedOptions, { serverRequired: true });
  assert.equal(harness.fulfillments[0].status, "送货异常");
  assert.equal(harness.tasks[0].status, "送货异常");
  assert.equal(harness.addedTodos[0].id, "TODO-DRIVER-1");
  assert.match(harness.addedTodos[0].summary, /客户不在/);
}

{
  const harness = createHarness({
    api: {
      reportDriverDeliveryException: async () => ({ source: "local_fallback", status: "送货异常" }),
    },
  });
  await harness.actions.handleDriverDeliveryAction("装车异常", {
    fulfillmentId: "F-DRIVER-1",
    reason: "装车少货",
  });
  assert.equal(harness.fulfillments[0].status, "待送货");
  assert.equal(harness.addedTodos.length, 0);
  assert.match(harness.toast, /正式后端模式禁止司机写操作使用本地降级结果/);
}

const appSource = [
  fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  fs.readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
].join("\n");
const controllerSource = fs.readFileSync(new URL("../src/app/createOfficeDriverDeliveryActions.js", import.meta.url), "utf8");
const driverPageSource = fs.readFileSync(new URL("../src/features/driver/DriverMobilePage.jsx", import.meta.url), "utf8");
const driverDeliveryStageSource = fs.readFileSync(new URL("../src/features/driver/DriverDeliveryStage.jsx", import.meta.url), "utf8");
assert.match(appSource, /createOfficeDriverDeliveryActions\(\{/);
assert.match(appSource, /allowLocalFallback: !runtimeServerRequired/);
assert.doesNotMatch(appSource, /async function handleDriverDeliveryAction/);
assert.doesNotMatch(appSource, /completeDriverDeliveryTask|confirmDriverDeliveryLoaded|reportDriverDeliveryException/);
assert.match(controllerSource, /const apiOptions = \{ serverRequired: !allowLocalFallback \}/);
assert.match(controllerSource, /DRIVER_WRITE_LOCAL_FALLBACK_FORBIDDEN/);
assert.match(controllerSource, /DRIVER_DELIVERY_COMPLETION_CONFIRMATION_REQUIRED/);
assert.match(driverPageSource, /buildDriverDeliveryCompletionSummary/);
assert.match(driverPageSource, /import \{ DriverDeliveryStage \} from "\.\/DriverDeliveryStage\.jsx"/);
assert.match(driverDeliveryStageSource, /确认提交送达/);
assert.match(driverPageSource, /deliveryCompletionConfirmed: true/);
assert.match(driverPageSource, /restoreDeliveryCompletionTriggerFocusRef/);
assert.match(driverPageSource, /handleDeliveryCompletionConfirmationKeyDown/);
assert.match(driverDeliveryStageSource, /aria-live="assertive"/);
assert.match(driverDeliveryStageSource, /!deliveryCompletionConfirmation \? \(/);

console.log("Office driver delivery action checks passed: device QA, package loading, delivery confirmation, evidence completion, exceptions, and formal-mode fail-closed behavior are isolated.");
