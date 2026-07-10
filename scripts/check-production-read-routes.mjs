import assert from "node:assert/strict";
import { handleProductionReadRoutes } from "../server/routes/productionReadRoutes.mjs";

const calls = [];
const workspace = {
  productionPackingReadRepository: {
    async listProductionTasks({ query }) {
      return { items: [{ productionTaskId: "PT-1" }], page: Number(query.get("page") ?? 1) };
    },
    async getProductionTaskDetail({ productionTaskId }) {
      return productionTaskId === "PT-1" ? { productionTaskId } : null;
    },
    async listPackingTasks() {
      return { items: [{ packingTaskId: "PKT-1" }] };
    },
    async getPackingTaskDetail({ packingTaskId }) {
      return packingTaskId === "PKT-1" ? { packingTaskId } : null;
    },
  },
};
const dependencies = {
  response: {},
  workspace,
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  async buildProductionMachineQueueResponse({ query }) {
    return { items: [{ machineId: query.get("machineId") ?? "BAG-1" }] };
  },
};

await expectJson("/api/production-tasks?page=2", { items: [{ productionTaskId: "PT-1" }], page: 2 });
await expectJson("/api/production-schedules/machine-queue?machineId=BAG-2", { items: [{ machineId: "BAG-2" }] });
await expectJson("/api/production-tasks/PT-1", { productionTaskId: "PT-1" });
await expectJson("/api/packing-tasks", { items: [{ packingTaskId: "PKT-1" }] });
await expectJson("/api/packing-tasks/PKT-1", { packingTaskId: "PKT-1" });
await expectNotFound("/api/production-tasks/UNKNOWN", "PRODUCTION_TASK_NOT_FOUND");
await expectNotFound("/api/packing-tasks/UNKNOWN", "PACKING_TASK_NOT_FOUND");
assert.equal(await handleProductionReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/inventory/items") }), false);

console.log("production read routes checks passed");

async function expectJson(pathname, body) {
  assert.equal(await handleProductionReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.pop(), { kind: "json", response: dependencies.response, status: 200, body });
}

async function expectNotFound(pathname, code) {
  assert.equal(await handleProductionReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.pop(), { kind: "notFound", response: dependencies.response, code });
}
