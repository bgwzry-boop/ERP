import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createOfficeProductionWriteActions } from "../src/app/useOfficeProductionWrites.js";

const baseOrderLine = {
  id: "OL-001",
  orderLineId: "OL-001",
  customerId: "C001",
  product: "定制印刷袋",
  size: "30*40",
  color: "白色",
  handle: "普通提",
  style: "定制印刷",
  qty: 1000,
  status: "待生产",
  fulfillment: "快递快运",
  latest: "今天 18:00",
  productionTaskId: "PT-001",
  machineId: "BAG-01",
};

const baseInventory = {
  id: "INV-001",
  size: "30*40",
  color: "白色",
  handle: "普通提",
  style: "定制印刷",
  zone: "待快运区",
  inStock: 100,
  reserved: 20,
};

function createSetter(state) {
  return (update) => {
    state.value = typeof update === "function" ? update(state.value) : update;
  };
}

function createCase(overrides = {}) {
  const states = {
    orderLines: { value: structuredClone(overrides.orderLines ?? [baseOrderLine]) },
    inventory: { value: structuredClone(overrides.inventory ?? [baseInventory]) },
    production: {
      value: structuredClone(overrides.production ?? {
        productionTasks: [baseOrderLine],
        packingTasks: [{ packingTaskId: "PKT-OL-001", orderLineId: "OL-001", plannedQty: 1000, packageCount: 2 }],
        scheduleQueueItems: [],
        scheduleQueueMachines: [],
        reportResultsByLineId: {},
      }),
    },
    fulfillments: { value: structuredClone(overrides.fulfillments ?? []) },
    todos: { value: structuredClone(overrides.todos ?? []) },
    selectedTodoId: { value: "" },
  };
  for (const key of ["orderLines", "inventory", "production", "todos"]) {
    Object.defineProperty(states[key], "current", {
      get: () => states[key].value,
      set: (value) => {
        states[key].value = value;
      },
    });
  }
  const counters = { fulfillment: 0, inventory: 0, order: 0, production: 0, todo: 0 };
  const refreshResult = overrides.refreshResult ?? {};
  const refresh = (key) => async () => {
    counters[key] += 1;
    return refreshResult[key] ?? { source: "api", blocked: false };
  };
  const api = {
    moveOfficeProductionMachineQueueItem: async () => ({
      source: "api",
      productionTaskId: "PT-001",
      targetMachineId: "BAG-02",
      targetQueueSeq: 1,
      productionTask: { productionTaskId: "PT-001", orderLineId: "OL-001", machineId: "BAG-02" },
      items: [{ productionTaskId: "PT-001", machineId: "BAG-02", queueSeq: 1 }],
      machines: [{ machineId: "BAG-02", taskCount: 1 }],
      total: 1,
    }),
    resequenceOfficeProductionMachineQueue: async () => ({
      source: "api",
      machineId: "BAG-01",
      updatedCount: 2,
      items: [{ productionTaskId: "PT-002", queueSeq: 1 }, { productionTaskId: "PT-001", queueSeq: 2 }],
      machines: [{ machineId: "BAG-01", taskCount: 2 }],
      total: 2,
    }),
    publishOfficeProductionSchedule: async () => ({
      source: "api",
      productionTaskId: "PT-001",
      orderLineId: "OL-001",
      machineId: "BAG-01",
      taskType: "制袋",
      publishedScheduleId: "SCH-001",
      orderLineStatus: "已排产",
      productionTask: { productionTaskId: "PT-001", orderLineId: "OL-001", machineId: "BAG-01" },
    }),
    reportOfficeProductionDailyProgress: async () => ({
      source: "api",
      productionTaskId: "PT-001",
      reportId: "DPR-001",
      orderLineId: "OL-001",
      taskStatus: "生产中",
      dailyQualifiedQty: 300,
      previousQualifiedQty: 100,
      cumulativeQualifiedQty: 400,
      remainingQty: 600,
      plannedQty: 1000,
      carryOver: true,
      nextWorkDate: "2026-07-12",
      machineCount: 900,
    }),
    createOfficeAttachment: async () => ({
      source: "api",
      attachment: { attachmentId: "ATT-FG-001", fileName: "finished-goods.jpg" },
    }),
    uploadOfficeProductionFinishedGoodsPhoto: async () => ({
      source: "api",
      productionTaskId: "PT-001",
      orderLineId: "OL-001",
      finishedGoodsPhoto: { status: "待确认", attachmentId: "ATT-FG-001", fileName: "finished-goods.jpg" },
    }),
    reviewOfficeProductionFinishedGoodsPhoto: async () => ({
      source: "api",
      productionTaskId: "PT-001",
      orderLineId: "OL-001",
      finishedGoodsPhoto: { status: "已接受", attachmentId: "ATT-FG-001", fileName: "finished-goods.jpg" },
      todo: { todoId: "TODO-NOTIFY-001", notificationCopyText: "成品图已确认", notificationChannel: "微信" },
    }),
    reportOfficeProductionComplete: async () => ({
      source: "api",
      productionTaskId: "PT-001",
      reportId: "WR-001",
      orderLineId: "OL-001",
      orderLineStatus: "待打包",
      qualifiedQty: 800,
      machineCount: 1500,
      machineCountAffectsInventory: false,
      inventoryItemId: "INV-001",
      packingTaskId: "PKT-OL-001",
    }),
    completeOfficePackingTask: async () => ({
      source: "api",
      packingTaskId: "PKT-OL-001",
      orderLineId: "OL-001",
      status: "已完成",
      orderLineStatus: "待打印标签",
      actualPackedQty: 800,
      packageCount: 2,
      packageIds: ["PKG-001", "PKG-002"],
      fulfillmentId: "F-001",
      fulfillmentStatus: "待打印标签",
    }),
    ...(overrides.api ?? {}),
  };
  const actions = createOfficeProductionWriteActions({
    api,
    authState: { permissions: { user: { userId: "U-OFFICE-A" } } },
    createSampleFile: () => ({
      name: "finished-goods.jpg",
      type: "image/jpeg",
      size: 10,
      contentDataUrl: "data:image/jpeg;base64,AA==",
    }),
    currentUserDisplayName: "办公室A",
    currentUserId: "U-OFFICE-A",
    customers: [{ id: "C001", contact: "张三" }],
    inventoryRecordsRef: states.inventory,
    orderLinesRef: states.orderLines,
    productionPackingRef: states.production,
    refreshFulfillments: refresh("fulfillment"),
    refreshInventoryRecords: refresh("inventory"),
    refreshOrderPool: refresh("order"),
    refreshProductionPackingTaskLists: refresh("production"),
    refreshTodos: refresh("todo"),
    serverRequired: overrides.serverRequired ?? (() => false),
    setFulfillments: createSetter(states.fulfillments),
    setInventoryRecords: createSetter(states.inventory),
    setOrderLines: createSetter(states.orderLines),
    setProductionPacking: createSetter(states.production),
    setSelectedTodoId: createSetter(states.selectedTodoId),
    setTodos: createSetter(states.todos),
    todosRef: states.todos,
  });
  return { actions, counters, states };
}

const moveCase = createCase();
const moveResult = await moveCase.actions.executeProductionPackingAction({
  action: "移动排产任务",
  payload: { productionTaskId: "PT-001", orderLineId: "OL-001", targetMachineId: "BAG-02", targetQueueSeq: 1 },
});
assert.equal(moveCase.states.orderLines.value[0].machineId, "BAG-02");
assert.equal(moveCase.states.inventory.value[0].inStock, 100);
assert.equal(moveCase.counters.production, 1);
assert.match(moveResult.feedback, /不入库、不占用、不生成打包任务/);

const resequenceCase = createCase();
const resequenceResult = await resequenceCase.actions.executeProductionPackingAction({
  action: "调整排产顺序",
  payload: { machineId: "BAG-01", orderedProductionTaskIds: ["PT-002", "PT-001"] },
});
assert.equal(resequenceCase.states.production.value.scheduleQueueItems[0].productionTaskId, "PT-002");
assert.equal(resequenceCase.counters.production, 1);
assert.match(resequenceResult.feedback, /只更新队列顺序/);

const publishCase = createCase();
const publishResult = await publishCase.actions.executeProductionPackingAction({
  action: "发布排产",
  payload: { orderLineId: "OL-001", productionTaskId: "PT-001", machineId: "BAG-01", plannedQty: 1000 },
});
assert.equal(publishCase.states.orderLines.value[0].status, "已排产");
assert.equal(publishCase.counters.order, 1);
assert.equal(publishCase.counters.production, 1);
assert.match(publishResult.feedback, /只下发车间任务，不入库/);

const dailyCase = createCase();
const dailyResult = await dailyCase.actions.executeProductionPackingAction({
  action: "报当日数量",
  payload: { orderLineId: "OL-001", dailyQualifiedQty: 300, machineCount: 900 },
});
assert.equal(dailyCase.states.orderLines.value[0].dailyProgress.machineCount, 900);
assert.equal(dailyCase.states.orderLines.value[0].dailyProgress.machineCountAffectsInventory, false);
assert.equal(dailyCase.states.inventory.value[0].inStock, 100);
assert.match(dailyResult.feedback, /未入库、未占用、未生成打包任务/);

const uploadCase = createCase();
const uploadResult = await uploadCase.actions.executeProductionPackingAction({
  action: "上传成品图",
  payload: { orderLineId: "OL-001", productionTaskId: "PT-001" },
});
assert.equal(uploadCase.states.orderLines.value[0].finishedGoodsPhoto.attachmentId, "ATT-FG-001");
assert.equal(uploadCase.counters.production, 1);
assert.match(uploadResult.feedback, /登记为待确认/);

const reviewCase = createCase({
  orderLines: [{ ...baseOrderLine, finishedGoodsPhoto: { status: "待确认", attachmentId: "ATT-FG-001" } }],
});
const reviewResult = await reviewCase.actions.executeProductionPackingAction({
  action: "确认成品图",
  payload: { orderLineId: "OL-001", productionTaskId: "PT-001" },
});
assert.equal(reviewCase.states.todos.value[0].id, "TODO-NOTIFY-001");
assert.equal(reviewCase.counters.todo, 1);
assert.match(reviewResult.feedback, /客户消息仍由办公室人工发送/);

const reportCase = createCase();
const reportResult = await reportCase.actions.executeProductionPackingAction({
  action: "报工完成",
  payload: { orderLineId: "OL-001", qualifiedQty: 800, machineCount: 1500 },
});
assert.equal(reportCase.states.inventory.value[0].inStock, 900);
assert.equal(reportCase.states.inventory.value[0].reserved, 820);
assert.equal(reportCase.states.production.value.packingTasks[0].plannedQty, 800);
assert.equal(reportCase.counters.inventory, 1);
assert.match(reportResult.feedback, /机器计数只作为凭证，不参与库存/);

const packingCase = createCase();
const inventoryBeforePacking = structuredClone(packingCase.states.inventory.value);
const packingResult = await packingCase.actions.executeProductionPackingAction({
  action: "提交打包完成",
  payload: { packingTaskId: "PKT-OL-001", actualPackedQty: 800, packageCount: 2 },
});
assert.deepEqual(packingCase.states.inventory.value, inventoryBeforePacking);
assert.equal(packingCase.states.fulfillments.value[0].id, "F-001");
assert.equal(packingCase.states.todos.value[0].type, "待打印标签");
assert.equal(packingCase.counters.fulfillment, 1);
assert.equal(packingCase.counters.todo, 1);
assert.match(packingResult.feedback, /打包完成不扣库存/);

const permissionCase = createCase({
  api: {
    publishOfficeProductionSchedule: async () => ({
      source: "api_error",
      blocked: true,
      error: { code: "PERMISSION_DENIED", requiredPermission: "production.schedule.publish" },
    }),
  },
});
const permissionResult = await permissionCase.actions.executeProductionPackingAction({
  action: "发布排产",
  payload: { orderLineId: "OL-001" },
});
assert.equal(permissionResult.blocked, true);
assert.match(permissionResult.feedback, /production\.schedule\.publish/);
assert.equal(permissionCase.counters.production, 0);

const conflictCase = createCase({
  api: {
    reportOfficeProductionComplete: async () => ({
      source: "api_error",
      blocked: true,
      error: { code: "PRODUCTION_TASK_REVISION_CONFLICT", message: "任务版本已变化" },
    }),
  },
});
const conflictResult = await conflictCase.actions.executeProductionPackingAction({
  action: "报工完成",
  payload: { orderLineId: "OL-001", qualifiedQty: 800 },
});
assert.equal(conflictResult.blocked, true);
assert.match(conflictResult.feedback, /任务版本已变化/);
assert.equal(conflictCase.states.inventory.value[0].inStock, 100);

const productionFallbackCase = createCase({
  serverRequired: () => true,
  api: {
    publishOfficeProductionSchedule: async () => ({
      source: "local_fallback",
      orderLineId: "OL-001",
      machineId: "BAG-01",
      publishedScheduleId: "SCH-LOCAL",
    }),
  },
});
const productionFallbackResult = await productionFallbackCase.actions.executeProductionPackingAction({
  action: "发布排产",
  payload: { orderLineId: "OL-001" },
});
assert.equal(productionFallbackResult.blocked, true);
assert.equal(productionFallbackCase.states.orderLines.value[0].status, "待生产");
assert.equal(productionFallbackCase.counters.production, 0);

const refreshFailureCase = createCase({ refreshResult: { order: { source: "api_error", blocked: true } } });
const refreshFailureResult = await refreshFailureCase.actions.executeProductionPackingAction({
  action: "发布排产",
  payload: { orderLineId: "OL-001" },
});
assert.equal(refreshFailureResult.projectionRefreshFailed, true);
assert.match(refreshFailureResult.feedback, /刷新失败/);

const unsupportedCase = createCase();
const unsupportedBefore = structuredClone(unsupportedCase.states.production.value);
const unsupportedResult = await unsupportedCase.actions.executeProductionPackingAction({ action: "未知生产动作" });
assert.equal(unsupportedResult.blocked, true);
assert.deepEqual(unsupportedCase.states.production.value, unsupportedBefore);

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const directClient of [
  "completeOfficePackingTask",
  "moveOfficeProductionMachineQueueItem",
  "publishOfficeProductionSchedule",
  "reportOfficeProductionComplete",
  "reportOfficeProductionDailyProgress",
  "reviewOfficeProductionFinishedGoodsPhoto",
  "uploadOfficeProductionFinishedGoodsPhoto",
]) {
  assert.equal(appSource.includes(directClient), false, `App still owns ${directClient}`);
}
assert.match(appSource, /executeProductionPackingAction/);

console.log("Office production writes check passed: queue, schedule, daily count, photo, report, packing, permission, conflict, production fail-closed, and projection refreshes are covered.");
