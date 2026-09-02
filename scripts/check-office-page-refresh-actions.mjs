import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficePageRefreshActions } from "../src/app/createOfficePageRefreshActions.js";

function createHarness({ activePage, allowLocalFallback = false, results = {} } = {}) {
  const calls = [];
  const toasts = [];
  const refresh = (name, fallback = { source: "api" }) => async (input) => {
    calls.push([name, input]);
    return results[name] ?? fallback;
  };
  const controller = createOfficePageRefreshActions({
    activeMetaLabel: "测试页面",
    activePage,
    allowLocalFallback,
    canUsePrintDiagnostics: true,
    refreshDriverDeliveryTasks: refresh("driver"),
    refreshFulfillments: refresh("fulfillment"),
    refreshInventoryLedgerEntries: refresh("ledger"),
    refreshInventoryIntents: refresh("intents"),
    refreshInventoryRecords: refresh("inventory", { source: "api", selectedStockId: "S-API" }),
    refreshMasterDataEmployeeAccountReviews: refresh("employeeReviews"),
    refreshMasterDataImportReviewDrafts: refresh("importReviews"),
    refreshOfficePrintJobQueue: refresh("printJobs"),
    refreshOrderPool: refresh("orders"),
    refreshPrintDriverConfig: refresh("printConfig"),
    refreshPrintDriverCupsDiagnostics: refresh("cups"),
    refreshPrintDriverReadiness: refresh("printReadiness"),
    refreshPrinterDeviceQa: refresh("printerQa", { devices: { source: "api" }, blocked: false }),
    refreshProductionPackingTaskLists: refresh("production"),
    refreshRawMaterialInbounds: refresh("rawMaterials"),
    refreshRawMaterialSupplierStatementReviews: refresh("supplierReviews"),
    refreshStatementDetail: refresh("statementDetail"),
    refreshStatements: refresh("statements", { source: "api", selectedStatementId: "ST-API" }),
    refreshTodos: refresh("todos", { source: "api", feedback: "待办完成" }),
    refreshV1GoLiveStatus: refresh("v1"),
    selectedStatementId: "ST-LOCAL",
    selectedStockIdRef: { current: "S-LOCAL" },
    setToast: (message) => toasts.push(message),
  });
  return { calls, controller, toasts };
}

{
  const harness = createHarness({ activePage: "todos" });
  assert.equal((await harness.controller.refreshActivePage()).source, "api");
  assert.equal(harness.toasts.at(-1), "待办完成");
}

{
  const harness = createHarness({ activePage: "inventory" });
  assert.equal((await harness.controller.refreshActivePage()).source, "api");
  assert.equal(harness.calls.find(([name]) => name === "ledger")[1].stockId, "S-API");
  assert.equal(harness.calls.some(([name]) => name === "intents"), true);
}

{
  const harness = createHarness({
    activePage: "inventory",
    results: { inventory: { source: "local_fallback", selectedStockId: "S-UNTRUSTED" } },
  });
  assert.equal((await harness.controller.refreshActivePage()).blocked, true);
  assert.equal(harness.calls.some(([name]) => name === "ledger"), false);
  assert.match(harness.toasts.at(-1), /库存刷新未完成/);
}

{
  const harness = createHarness({ activePage: "statements" });
  assert.equal((await harness.controller.refreshActivePage()).source, "api");
  assert.equal(harness.calls.find(([name]) => name === "statementDetail")[1].statementId, "ST-API");
}

{
  const harness = createHarness({
    activePage: "rawMaterials",
    results: { supplierReviews: { source: "local_fallback", items: [] } },
  });
  assert.equal((await harness.controller.refreshActivePage()).blocked, true);
  assert.match(harness.toasts.at(-1), /原材料刷新未完成/);
}

{
  const harness = createHarness({ activePage: "packing" });
  assert.equal((await harness.controller.refreshActivePage()).source, "api");
  for (const expected of ["production", "printConfig", "printerQa", "printJobs", "printReadiness", "cups"]) {
    assert.equal(harness.calls.some(([name]) => name === expected), true, `packing refresh must include ${expected}`);
  }
}

{
  const harness = createHarness({ activePage: "entry" });
  const result = await harness.controller.refreshActivePage();
  assert.equal(result.skipped, true);
  assert.match(harness.toasts.at(-1), /草稿编辑区/);
  assert.doesNotMatch(harness.toasts.at(-1), /本地假数据/);
}

{
  const harness = createHarness({
    activePage: "rawMaterials",
    allowLocalFallback: true,
    results: {
      rawMaterials: { source: "local_fallback" },
      supplierReviews: { source: "local_fallback" },
    },
  });
  assert.equal((await harness.controller.refreshActivePage()).source, "local_fallback");
}

const workbenchSource = readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8");
const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  workbenchSource,
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
assert.match(appSource, /createOfficePageRefreshActions\(\{/);
assert.doesNotMatch(appSource, /function refreshActivePage\(/);
assert.equal(workbenchSource.split("\n").length < 1000, true, "OfficeWorkbench should remain below the split composition-root target");

console.log("Office page refresh actions check passed: single/group refreshes, formal source gates, empty editor behavior, and App ownership are isolated.");
