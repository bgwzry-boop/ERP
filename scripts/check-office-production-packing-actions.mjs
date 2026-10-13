import assert from "node:assert/strict";
import { createOfficeProductionPackingActions } from "../src/app/createOfficeProductionPackingActions.js";

function createHarness({ allowLocalFallback = false, api = {}, guardResult = true, results = {} } = {}) {
  let detailState = null;
  const calls = { cups: 0, detail: [], execute: [], jobs: 0, printConfig: 0 };
  const toasts = [];
  const controller = createOfficeProductionPackingActions({
    allowLocalFallback,
    api,
    authState: { token: "test" },
    currentUserId: "U-OFFICE-A",
    executeProductionPackingAction: async (input) => {
      calls.execute.push(input);
      return Object.hasOwn(results, "write") ? results.write : { source: "api", feedback: "动作成功" };
    },
    guardUiAction: () => guardResult,
    inventoryRecords: [{ id: "STOCK-1", stockKey: "KEY-1", qty: 10 }],
    orderLines: [{ id: "OL-1", inventoryKey: "KEY-1", product: "测试袋" }],
    productionPacking: {
      productionTasks: [{ id: "OL-1", orderLineId: "OL-1", productionTaskId: "PT-1" }],
      packingTasks: [{ packingTaskId: "PKT-1", orderLineId: "OL-1", orderLine: { id: "OL-1" } }],
      reportResultsByLineId: { "OL-1": { reportId: "R-1", productionTaskId: "PT-1" } },
    },
    refreshOfficePrintJobQueue: async () => {
      calls.jobs += 1;
      return results.jobs ?? { source: "api", feedback: "作业已刷新" };
    },
    refreshPrintDriverConfig: async () => {
      calls.printConfig += 1;
      return results.printConfig ?? { source: "api" };
    },
    refreshPrintDriverCupsDiagnostics: async () => {
      calls.cups += 1;
      return results.cups ?? { source: "api" };
    },
    setProductionPackingDetailState: (value) => {
      detailState = value;
    },
    setToast: (message) => toasts.push(message),
  });
  return { calls, controller, getDetailState: () => detailState, toasts };
}

{
  const optionsSeen = [];
  const harness = createHarness({
    api: {
      getOfficeProductionTaskDetail: async (input, options) => {
        harness.calls.detail.push(input);
        optionsSeen.push(options);
        return { source: "local_fallback", detail: { productionTaskId: "PT-LOCAL" } };
      },
    },
  });
  assert.equal(await harness.controller.loadProductionPackingSourceDetail({ mode: "production", taskId: "PT-1", orderLineId: "OL-1" }), null);
  assert.equal(optionsSeen[0]?.serverRequired, true);
  assert.equal(harness.getDetailState().source, "api_error");
  assert.equal(harness.getDetailState().detail, null);
  assert.match(harness.toasts.at(-1), /后端拒绝读取/);
}

{
  const harness = createHarness({
    api: {
      getOfficeProductionTaskDetail: async (input) => {
        harness.calls.detail.push(input);
        return { source: "api", detail: { productionTaskId: input.productionTaskId, trusted: true } };
      },
    },
  });
  const detail = await harness.controller.loadProductionPackingSourceDetail({ mode: "production", taskId: "PT-1", orderLineId: "OL-1" });
  assert.equal(detail.trusted, true);
  assert.equal(harness.getDetailState().source, "api");
  assert.equal(harness.calls.detail[0].reportResult.reportId, "R-1");
}

{
  const harness = createHarness({
    allowLocalFallback: true,
    api: {
      getOfficePackingTaskDetail: async () => ({ source: "local_fallback", detail: { packingTaskId: "PKT-1" } }),
    },
  });
  const detail = await harness.controller.loadProductionPackingSourceDetail({ mode: "packing", taskId: "PKT-1", orderLineId: "OL-1" });
  assert.equal(detail.packingTaskId, "PKT-1");
  assert.equal(harness.getDetailState().source, "local_fallback");
}

{
  const harness = createHarness({ results: { write: { source: "local_fallback", feedback: "本地成功" } } });
  const result = await harness.controller.handleProductionPackingAction("报工完成", { orderLineId: "OL-1" });
  assert.equal(result.blocked, true);
  assert.equal(result.source, "api_error");
  assert.match(harness.toasts.at(-1), /production 不接受本地替代结果/);
}

{
  const harness = createHarness({ guardResult: false });
  assert.equal(await harness.controller.handleProductionPackingAction("报工完成", {}), null);
  assert.equal(harness.calls.execute.length, 0);
}

{
  const harness = createHarness({ results: { write: undefined } });
  const result = await harness.controller.handleProductionPackingAction("报工完成", {});
  assert.equal(result.blocked, true);
  assert.match(harness.toasts.at(-1), /未返回结果/);
}

{
  const harness = createHarness({ results: { cups: { source: "local_fallback" } } });
  const result = await harness.controller.refreshPrintDriverDiagnostics();
  assert.equal(result.blocked, true);
  assert.match(harness.toasts.at(-1), /刷新未完成/);
  assert.equal((await harness.controller.refreshPrintJobs()).source, "api");
}

{
  const harness = createHarness();
  assert.equal(await harness.controller.loadProductionPackingSourceDetail({ mode: "production" }), null);
  assert.equal(harness.getDetailState().source, "ui_error");
}

console.log("Office production/packing actions check passed: trusted detail reads, formal write gates, print refreshes, and App ownership are isolated.");
