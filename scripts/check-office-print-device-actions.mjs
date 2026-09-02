import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficePrintDeviceActions } from "../src/app/createOfficePrintDeviceActions.js";

function createHarness({
  allowLocalFallback = false,
  guardResult = true,
  printerSource = "api",
  refreshResult = { devices: { source: "api" } },
  results = {},
} = {}) {
  let printerDeviceQa = {
    source: printerSource,
    devices: [{
      printDeviceId: "PRN-1",
      name: "标签机A",
      driverName: "CUPS Driver",
      paperName: "76x50",
      settings: { driverMode: "system_printer" },
    }],
    selectedDeviceId: "",
    checks: [{ key: "sample_print", status: "pending" }],
    evidence: {},
  };
  const selectedIdRef = { current: "" };
  const calls = { dispatch: [], guard: [], refresh: [], retry: [], saveMode: 0, saveQa: 0 };
  const toasts = [];
  const controller = createOfficePrintDeviceActions({
    allowLocalFallback,
    dispatchPrintJobQueueItem: async (id) => {
      calls.dispatch.push(id);
      return Object.hasOwn(results, "dispatch") ? results.dispatch : { source: "api", feedback: "派发成功" };
    },
    guardUiAction: (surface, action) => {
      calls.guard.push([surface, action]);
      return guardResult;
    },
    printerDeviceQa,
    printerDeviceQaSelectedIdRef: selectedIdRef,
    refreshPrinterDeviceQa: async (options) => {
      calls.refresh.push(options);
      return refreshResult;
    },
    retryPrintJobQueueItem: async (id) => {
      calls.retry.push(id);
      return results.retry ?? { source: "api", feedback: "重试成功" };
    },
    savePrinterDeviceMode: async () => {
      calls.saveMode += 1;
      return results.saveMode ?? { source: "api", feedback: "模式已保存" };
    },
    savePrinterDeviceQaRecord: async () => {
      calls.saveQa += 1;
      return results.saveQa ?? { source: "api", feedback: "验收已保存" };
    },
    setPrinterDeviceQa: (updater) => {
      printerDeviceQa = typeof updater === "function" ? updater(printerDeviceQa) : updater;
    },
    setToast: (message) => toasts.push(message),
  });
  return { calls, controller, getQa: () => printerDeviceQa, selectedIdRef, toasts };
}

{
  const harness = createHarness({ guardResult: false });
  assert.equal(await harness.controller.dispatchPrintJobQueueItem("PJ-1"), null);
  assert.equal(harness.calls.dispatch.length, 0);
  assert.deepEqual(harness.calls.guard[0], ["productionPacking", "派发打印作业"]);
}

{
  const harness = createHarness({ results: { dispatch: { source: "local_fallback", feedback: "本地派发" } } });
  const result = await harness.controller.dispatchPrintJobQueueItem("PJ-LOCAL");
  assert.equal(result.blocked, true);
  assert.equal(result.source, "api_error");
  assert.match(harness.toasts.at(-1), /production 不接受本地替代结果/);
}

{
  const harness = createHarness({
    results: {
      retry: { source: "local_fallback" },
      saveMode: { source: "local_fallback" },
      saveQa: { source: "local_fallback" },
    },
  });
  assert.equal((await harness.controller.retryPrintJobQueueItem("PJ-1")).blocked, true);
  assert.equal((await harness.controller.savePrinterDeviceMode()).blocked, true);
  assert.equal((await harness.controller.savePrinterDeviceQaRecord()).blocked, true);
}

{
  const harness = createHarness({ results: { dispatch: undefined } });
  const result = await harness.controller.dispatchPrintJobQueueItem("PJ-MISSING");
  assert.equal(result.blocked, true);
  assert.match(harness.toasts.at(-1), /未返回结果/);
}

{
  const harness = createHarness({
    allowLocalFallback: true,
    results: { dispatch: { source: "local_fallback", feedback: "演示派发" } },
  });
  const result = await harness.controller.dispatchPrintJobQueueItem("PJ-DEMO");
  assert.equal(result.blocked, undefined);
  assert.equal(result.source, "local_fallback");
}

{
  const harness = createHarness({
    printerSource: "idle",
    refreshResult: { devices: { source: "local_fallback" } },
  });
  assert.equal(await harness.controller.selectPrinterDeviceQaDevice("PRN-1"), null);
  assert.equal(harness.selectedIdRef.current, "PRN-1");
  assert.equal(harness.getQa().selectedDeviceId, "");
  assert.match(harness.toasts.at(-1), /不使用本地设备/);
}

{
  const harness = createHarness();
  const result = await harness.controller.selectPrinterDeviceQaDevice("PRN-1");
  assert.equal(result.devices.source, "api");
  assert.equal(harness.getQa().selectedDeviceId, "PRN-1");
  assert.equal(harness.getQa().driverModeDraft, "system_printer");
  assert.equal(harness.getQa().paperLabel, "76x50");
  assert.deepEqual(harness.calls.refresh[0], { selectedDeviceId: "PRN-1", showToast: false });

  harness.controller.changePrinterDeviceQaField("note", "现场通过");
  harness.controller.changePrinterDeviceQaCheck("sample_print", "passed");
  harness.controller.changePrinterDeviceQaEvidenceField("samplePrintReference", "ATT-PRINT-1");
  assert.equal(harness.getQa().note, "现场通过");
  assert.equal(harness.getQa().checks[0].status, "passed");
  assert.equal(harness.getQa().evidence.samplePrintReference, "ATT-PRINT-1");
}

const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
assert.match(appSource, /createOfficePrintDeviceActions\(\{/);
for (const localOwner of [
  "async function dispatchPrintJob(",
  "async function retryPrintJob(",
  "async function selectPrinterDeviceQaDevice(",
  "async function persistPrinterDeviceMode(",
]) {
  assert.equal(appSource.includes(localOwner), false, `App must not own ${localOwner}`);
}

console.log("Office print device actions check passed: permissions, formal API-source gates, device selection, QA drafts, and App ownership are isolated.");
