import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficePrintReadActions } from "../src/app/useOfficePrintReads.js";

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

function createDependencies(api, { serverRequired = false } = {}) {
  const state = {
    config: createState({ source: "idle", config: null }),
    readiness: createState({ source: "idle", readiness: null }),
    cups: createState({ source: "idle", diagnostics: null }),
    devices: createState({
      source: "idle",
      devices: [],
      selectedDeviceId: "",
      checks: [],
      evidence: {},
      deviceLabel: "",
      driverLabel: "",
      driverModeDraft: "preview_only",
      paperLabel: "",
    }),
    jobs: createState({ source: "idle", items: [{ printJobId: "PJ-LOCAL" }], total: 1 }),
  };
  return {
    actions: createOfficePrintReadActions({
      api,
      authState: { authenticated: true },
      currentUserId: "U-OFFICE-A",
      printerDeviceQaSelectedIdRef: { current: "PD-2" },
      printJobQueueItemsRef: { current: [{ printJobId: "PJ-LOCAL" }] },
      serverRequired: () => serverRequired,
      setPrintDriverConfig: state.config.set,
      setPrintDriverReadiness: state.readiness.set,
      setPrintDriverCupsDiagnostics: state.cups.set,
      setPrinterDeviceQa: state.devices.set,
      setPrintJobQueue: state.jobs.set,
    }),
    state,
  };
}

const successApi = {
  async getOfficePrintDriverConfig() {
    return { source: "api", config: { adapterName: "command-bridge", systemPrintEnabled: false } };
  },
  async getOfficePrintDriverV1Readiness() {
    return { source: "api", readiness: { ready: false, summary: { blockingCount: 2 } } };
  },
  async getOfficePrintDriverCupsDiagnostics() {
    return { source: "api", diagnostics: { ready: false, printerConfigured: false } };
  },
  async listOfficePrintDevices() {
    return {
      source: "api",
      items: [
        { printDeviceId: "PD-1", name: "标签机A", driverName: "Driver-A", paperName: "80x60mm" },
        { printDeviceId: "PD-2", name: "针式机B", driverName: "Driver-B", settings: { driverMode: "system_print" }, paperWidthMm: 241, paperHeightMm: 140 },
      ],
      total: 2,
    };
  },
  async listOfficePrinterDeviceFieldTests(input) {
    return {
      source: "api",
      items: [{ printerDeviceFieldTestId: "PDQA-1", printDeviceId: input.printDeviceId }],
      total: 1,
      latestRecord: {
        printerDeviceFieldTestId: "PDQA-1",
        checks: [{ key: "sample_print", status: "passed" }],
        evidence: { samplePrint: "sample-1" },
      },
    };
  },
  async listOfficePrintJobs() {
    return { source: "api", items: [{ printJobId: "PJ-API", jobStatus: "queued" }], total: 1 };
  },
};

const successCase = createDependencies(successApi);
const configResult = await successCase.actions.refreshPrintDriverConfig({ showToast: true });
assert.equal(successCase.state.config.value.config.adapterName, "command-bridge");
assert.match(configResult.feedback, /后端 API/);
const readinessResult = await successCase.actions.refreshPrintDriverReadiness({ showToast: true });
assert.equal(successCase.state.readiness.value.readiness.summary.blockingCount, 2);
assert.match(readinessResult.feedback, /仍有 2 项阻塞/);
const cupsResult = await successCase.actions.refreshPrintDriverCupsDiagnostics({ showToast: true });
assert.equal(successCase.state.cups.value.diagnostics.ready, false);
assert.match(cupsResult.feedback, /队列未通过/);
const deviceResult = await successCase.actions.refreshPrinterDeviceQa({ showToast: true });
assert.equal(deviceResult.blocked, false);
assert.equal(successCase.state.devices.value.selectedDeviceId, "PD-2");
assert.equal(successCase.state.devices.value.deviceLabel, "针式机B");
assert.equal(successCase.state.devices.value.driverLabel, "Driver-B");
assert.equal(successCase.state.devices.value.driverModeDraft, "system_print");
assert.equal(successCase.state.devices.value.paperLabel, "241x140mm");
assert.equal(successCase.state.devices.value.latestRecord.printerDeviceFieldTestId, "PDQA-1");
assert.match(deviceResult.feedback, /共 2 台设备/);
const jobsResult = await successCase.actions.refreshOfficePrintJobQueue({ showToast: true });
assert.equal(successCase.state.jobs.value.items[0].printJobId, "PJ-API");
assert.match(jobsResult.feedback, /共 1 条/);

const deniedCase = createDependencies({
  ...successApi,
  async listOfficePrintDevices() {
    return {
      source: "api_error",
      blocked: true,
      error: { message: "权限不足", requiredPermission: "print.device.view" },
    };
  },
});
const deniedResult = await deniedCase.actions.refreshPrinterDeviceQa({ showToast: true });
assert.equal(deniedResult.blocked, true);
assert.equal(deniedCase.state.devices.value.devices.length, 0);
assert.match(deniedResult.feedback, /缺少权限 print\.device\.view/);

const fallbackApi = Object.fromEntries(
  Object.keys(successApi).map((name) => [
    name,
    async () => ({
      source: "local_fallback",
      config: { adapterName: "local" },
      readiness: { ready: true },
      diagnostics: { ready: true },
      items: [{ printDeviceId: "PD-LOCAL", printJobId: "PJ-LOCAL-FAKE" }],
      total: 1,
      error: { code: "API_UNAVAILABLE", message: `${name} unavailable` },
    }),
  ]),
);
const productionCase = createDependencies(fallbackApi, { serverRequired: true });
const productionConfig = await productionCase.actions.refreshPrintDriverConfig({ showToast: true });
assert.equal(productionConfig.blocked, true);
assert.equal(productionConfig.upstreamSource, "local_fallback");
assert.equal(productionCase.state.config.value.config, null);
const productionDevices = await productionCase.actions.refreshPrinterDeviceQa({ showToast: true });
assert.equal(productionDevices.blocked, true);
assert.equal(productionCase.state.devices.value.devices.length, 0);
const productionJobs = await productionCase.actions.refreshOfficePrintJobQueue({ showToast: true });
assert.equal(productionJobs.blocked, true);
assert.equal(productionCase.state.jobs.value.items[0].printJobId, "PJ-LOCAL");

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
for (const apiName of ["listOfficePrintDevices", "listOfficePrinterDeviceFieldTests", "listOfficePrintJobs", "getOfficePrintDriverConfig"]) {
  assert.equal(appSource.includes(apiName), false, `App should not directly orchestrate ${apiName}`);
}
for (const callbackName of [
  "refreshPrintDriverConfig",
  "refreshPrintDriverReadiness",
  "refreshPrintDriverCupsDiagnostics",
  "refreshPrinterDeviceQa",
  "refreshOfficePrintJobQueue",
]) {
  assert.equal(appSource.includes(`const ${callbackName} = useCallback`), false, `App should not define ${callbackName}`);
}
assert.match(workspaceSource, /useOfficePrintReads/);
assert.match(workspaceSource, /\.\.\.printReads/);

console.log("Office print reads check passed: config, readiness, CUPS, device QA, jobs, denial, selection, and production fail-closed behavior are covered.");
