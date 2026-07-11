import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeProductionReadActions } from "../src/app/useOfficeProductionReads.js";

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

const localOrderLine = {
  id: "OL-1",
  customerId: "C-1",
  product: "定制袋",
  size: "35*41",
  color: "白色",
  handle: "黑色提手",
  style: "空白袋",
  qty: 1000,
  status: "制袋中",
};

function createDependencies(api, options = {}) {
  const productionPacking = createState({
    productionTasks: [{ id: "LOCAL-PRODUCTION" }],
    packingTasks: [{ packingTaskId: "LOCAL-PACKING" }],
    taskListSource: "local",
    taskListLoading: false,
    taskListError: "",
    productionTaskTotal: 1,
    packingTaskTotal: 1,
    scheduleQueueItems: [{ productionTaskId: "LOCAL-QUEUE" }],
    scheduleQueueMachines: [{ machineId: "LOCAL-MACHINE" }],
    scheduleQueueTotal: 1,
    scheduleQueueSource: "local",
    scheduleQueueError: "",
    scheduleQueueLastSyncedAt: "09:00",
    scheduleQueueNote: "local note",
  });
  const calls = [];
  const trackedApi = Object.fromEntries(
    Object.entries(api).map(([name, action]) => [
      name,
      async (input) => {
        calls.push({ name, input });
        return action(input);
      },
    ]),
  );
  return {
    actions: createOfficeProductionReadActions({
      api: trackedApi,
      activePage: options.activePage ?? "packing",
      authState: { authenticated: true },
      currentUser: options.currentUser ?? { userId: "U-OFFICE-A" },
      currentUserId: options.currentUserId ?? "U-OFFICE-A",
      orderLinesRef: { current: [localOrderLine] },
      serverRequired: () => options.serverRequired === true,
      setProductionPacking: productionPacking.set,
    }),
    calls,
    productionPacking,
  };
}

const successApi = {
  async listOfficeProductionTasks() {
    return {
      source: "api",
      items: [{
        productionTaskId: "PT-1",
        orderLineId: "OL-1",
        productionTask: {
          productionTaskId: "PT-1",
          orderLineId: "OL-1",
          taskType: "制袋",
          machineId: "BAG-01",
          plannedQty: 1000,
          taskStatus: "制袋中",
        },
        orderLine: { orderLineId: "OL-1", productName: "定制袋", originalQty: 1000 },
      }],
      total: 1,
    };
  },
  async listOfficePackingTasks() {
    return {
      source: "api",
      items: [{
        packingTaskId: "PKT-1",
        orderLineId: "OL-1",
        packingTask: { packingTaskId: "PKT-1", orderLineId: "OL-1", plannedQty: 1000, status: "待打包" },
        orderLine: { orderLineId: "OL-1", productName: "定制袋", originalQty: 1000 },
        packageCount: 3,
      }],
      total: 1,
    };
  },
  async listOfficeProductionMachineQueue() {
    return {
      source: "api",
      items: [{ productionTaskId: "PT-1", machineId: "BAG-01", queueSeq: 1 }],
      machines: [{ machineId: "BAG-01", total: 1 }],
      total: 1,
      note: "server queue",
    };
  },
};

const successCase = createDependencies(successApi, {
  activePage: "workshopMobile",
  currentUser: { userId: "U-WORKSHOP-A", defaultMachineId: "BAG-01" },
  currentUserId: "U-WORKSHOP-A",
});
const successResult = await successCase.actions.refreshProductionPackingTaskLists({ showToast: true });
assert.equal(successResult.blocked, false);
assert.equal(successResult.source, "api");
assert.equal(successCase.productionPacking.value.productionTasks[0].productionTaskId, "PT-1");
assert.equal(successCase.productionPacking.value.packingTasks[0].packingTaskId, "PKT-1");
assert.equal(successCase.productionPacking.value.scheduleQueueItems[0].productionTaskId, "PT-1");
assert.equal(successCase.productionPacking.value.scheduleQueueNote, "server queue");
assert.equal(successCase.productionPacking.value.taskListLoading, false);
assert.match(successResult.feedback, /车间机台 BAG-01/);
const productionCall = successCase.calls.find((item) => item.name === "listOfficeProductionTasks");
const queueCall = successCase.calls.find((item) => item.name === "listOfficeProductionMachineQueue");
assert.deepEqual(productionCall.input.query, {
  pageSize: 200,
  status: "open",
  visibility: "workshop_mobile",
  machineId: "BAG-01",
});
assert.deepEqual(queueCall.input.query, { status: "open", pageSize: 200, machineId: "BAG-01" });

const fallbackApi = Object.fromEntries(
  Object.keys(successApi).map((name) => [
    name,
    async () => ({
      source: "local_fallback",
      items: [],
      machines: [],
      total: 0,
      error: { code: "API_UNAVAILABLE", message: `${name} unavailable` },
    }),
  ]),
);
const fallbackCase = createDependencies(fallbackApi);
const fallbackResult = await fallbackCase.actions.refreshProductionPackingTaskLists({ showToast: true });
assert.equal(fallbackResult.blocked, false);
assert.equal(fallbackResult.source, "local_fallback");
assert.equal(fallbackCase.productionPacking.value.productionTasks[0].id, "LOCAL-PRODUCTION");
assert.equal(fallbackCase.productionPacking.value.packingTasks[0].packingTaskId, "LOCAL-PACKING");
assert.equal(fallbackCase.productionPacking.value.scheduleQueueItems[0].productionTaskId, "LOCAL-QUEUE");
assert.match(fallbackResult.feedback, /本地规则降级/);

const productionCase = createDependencies(fallbackApi, { serverRequired: true });
const productionResult = await productionCase.actions.refreshProductionPackingTaskLists({ showToast: true });
assert.equal(productionResult.blocked, true);
assert.equal(productionResult.source, "api_error");
assert.equal(productionResult.production.upstreamSource, "local_fallback");
assert.equal(productionCase.productionPacking.value.taskListSource, "api_error");
assert.equal(productionCase.productionPacking.value.scheduleQueueSource, "api_error");
assert.equal(productionCase.productionPacking.value.productionTasks[0].id, "LOCAL-PRODUCTION");
assert.match(productionResult.feedback, /任务池刷新失败/);

const deniedCase = createDependencies({
  ...successApi,
  async listOfficeProductionTasks() {
    return {
      source: "api_error",
      blocked: true,
      items: [],
      total: 0,
      error: { message: "权限不足", requiredPermission: "production.task.view" },
    };
  },
});
const deniedResult = await deniedCase.actions.refreshProductionPackingTaskLists({ showToast: true });
assert.equal(deniedResult.blocked, true);
assert.match(deniedResult.feedback, /缺少权限 production\.task\.view/);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
for (const apiName of [
  "listOfficeProductionTasks",
  "listOfficePackingTasks",
  "listOfficeProductionMachineQueue",
]) {
  assert.equal(appSource.includes(apiName), false, `App should not directly orchestrate ${apiName}`);
}
assert.match(workspaceSource, /useOfficeProductionReads/);
assert.match(workspaceSource, /\.\.\.productionReads/);
assert.match(workspaceSource, /activePage,/);
assert.match(workspaceSource, /currentUser,/);

console.log("Office production reads check passed: task, packing, queue, workshop scope, denial, and production fail-closed behavior are covered.");
