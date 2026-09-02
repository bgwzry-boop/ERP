import assert from "node:assert/strict";
import {
  createDemoWorkspaceSeedService,
  isProductionRuntime,
} from "../server/services/demoWorkspaceSeedService.mjs";

const fixedNow = new Date("2026-07-14T10:00:00.000Z");
const calls = [];
const labelDevice = {
  printDeviceId: "PRN-LABEL-A",
  name: "标签打印机 A",
  deviceType: "label_printer",
  settings: { paper: "100x150" },
};
const service = createDemoWorkspaceSeedService({
  buildOperationLog(_workspace, input) {
    calls.push({ kind: "operationLog", input });
    return { id: `LOG-${input.targetId}`, ...input };
  },
  buildPrintDeviceSnapshot(device) {
    calls.push({ kind: "deviceSnapshot", device });
    return {
      printDeviceId: device.printDeviceId,
      name: device.name,
      settings: { ...device.settings },
    };
  },
  async findPrintDevice(_workspace, printDeviceId) {
    calls.push({ kind: "findPrintDevice", printDeviceId });
    return printDeviceId === labelDevice.printDeviceId ? labelDevice : null;
  },
  nextPlainId(prefix, value) {
    return `${prefix}-${value}`;
  },
  now: () => fixedNow,
});

assert.equal(Object.isFrozen(service), true);
assert.equal(isProductionRuntime({ production: true }), true);
assert.equal(isProductionRuntime({ isProduction: true }), true);
assert.equal(isProductionRuntime({ mode: " PRODUCTION " }), true);
assert.equal(isProductionRuntime({ production: false, mode: "demo" }), false);

const orderLines = [
  { id: "OL-BAG", status: "制袋中", qty: 100 },
  { id: "OL-PRINT", status: "丝印中", originalQty: 200 },
  { id: "OL-SCHEDULE", lineStatus: "待排产", qty: 300 },
  { orderLineId: "OL-REPRINT", status: "待补印", qty: 400 },
  { id: "OL-PACK", status: "待打包", qty: 500 },
  { id: "OL-DONE", status: "已完成", qty: 600 },
];
for (const runtimeConfig of [
  { production: true },
  { isProduction: true },
  { mode: "production" },
]) {
  assert.deepEqual(
    service.buildInitialTaskSeeds({ workspace: { orderLines }, runtimeConfig }),
    { productionTasks: [], packingTasks: [] },
  );
}

const taskSeeds = service.buildInitialTaskSeeds({
  workspace: { orderLines },
  runtimeConfig: { mode: "demo" },
});
assert.equal(taskSeeds.productionTasks.length, 4);
assert.equal(taskSeeds.packingTasks.length, 1);
assert.deepEqual(
  taskSeeds.productionTasks.map((item) => ({
    orderLineId: item.orderLineId,
    taskType: item.taskType,
    machineId: item.machineId,
    publishedScheduleId: item.publishedScheduleId,
    qty: item.qty,
    createdAt: item.createdAt,
  })),
  [
    {
      orderLineId: "OL-BAG",
      taskType: "制袋",
      machineId: "BAG-01",
      publishedScheduleId: "SCH-BAG-01-OL-BAG",
      qty: 100,
      createdAt: fixedNow.toISOString(),
    },
    {
      orderLineId: "OL-PRINT",
      taskType: "丝印",
      machineId: "PRINT-01",
      publishedScheduleId: "SCH-PRINT-01-OL-PRINT",
      qty: 200,
      createdAt: fixedNow.toISOString(),
    },
    {
      orderLineId: "OL-SCHEDULE",
      taskType: "制袋",
      machineId: "BAG-01",
      publishedScheduleId: "",
      qty: 300,
      createdAt: fixedNow.toISOString(),
    },
    {
      orderLineId: "OL-REPRINT",
      taskType: "丝印",
      machineId: "PRINT-01",
      publishedScheduleId: "SCH-PRINT-01-OL-REPRINT",
      qty: 400,
      createdAt: fixedNow.toISOString(),
    },
  ],
);
assert.deepEqual(taskSeeds.packingTasks[0], {
  id: "PKT-OL-PACK",
  packingTaskId: "PKT-OL-PACK",
  bizNo: "PKT-OL-PACK",
  orderLineId: "OL-PACK",
  lineId: "OL-PACK",
  plannedQty: 500,
  actualPackedQty: 0,
  qty: 500,
  status: "待打包",
  createdBy: "U-OFFICE-A",
  createdAt: fixedNow.toISOString(),
});

calls.length = 0;
const productionWorkspace = buildPrintWorkspace({ runtimeConfig: { isProduction: true } });
assert.deepEqual(await service.seedPrintJobs(productionWorkspace), {
  createdCount: 0,
  createdPrintJobIds: [],
  skippedReason: "production_runtime",
});
assert.deepEqual(calls, []);
assert.deepEqual(productionWorkspace.persisted, []);

calls.length = 0;
assert.deepEqual(await service.seedPrintJobs({ runtimeConfig: { mode: "demo" } }), {
  createdCount: 0,
  createdPrintJobIds: [],
  skippedReason: "repository_unavailable",
});
assert.deepEqual(calls, []);

calls.length = 0;
const unavailableDeviceWorkspace = buildPrintWorkspace({
  runtimeConfig: { mode: "demo" },
  printDevices: [],
});
const noDeviceService = createDemoWorkspaceSeedService({
  buildOperationLog: () => {
    throw new Error("operation log must not be built without a print device");
  },
  buildPrintDeviceSnapshot: () => {
    throw new Error("snapshot must not be built without a print device");
  },
  findPrintDevice: async () => null,
  nextPlainId: (prefix, value) => `${prefix}-${value}`,
  now: () => fixedNow,
});
assert.deepEqual(await noDeviceService.seedPrintJobs(unavailableDeviceWorkspace), {
  createdCount: 0,
  createdPrintJobIds: [],
  skippedReason: "print_device_unavailable",
});

calls.length = 0;
const demoWorkspace = buildPrintWorkspace({ runtimeConfig: { mode: "demo" } });
assert.deepEqual(await service.seedPrintJobs(demoWorkspace), {
  createdCount: 2,
  createdPrintJobIds: ["PJ-DEMO-QUEUED-DISPATCH", "PJ-DEMO-FAILED-RETRY"],
  skippedReason: "",
});
assert.equal(demoWorkspace.persisted.length, 2);
const [queued, failed] = demoWorkspace.persisted.map((item) => item.printJob);
assert.equal(queued.jobStatus, "queued");
assert.equal(queued.queuedAt, fixedNow.toISOString());
assert.equal(queued.finishedAt, "");
assert.equal(queued.targetId, "F003");
assert.equal(failed.jobStatus, "failed");
assert.equal(failed.finishedAt, fixedNow.toISOString());
assert.equal(failed.errorCode, "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED");
assert.equal(failed.targetId, "F004");
for (const job of [queued, failed]) {
  assert.equal(job.targetType, "fulfillment");
  assert.equal(job.documentType, "express_ltl_label");
  assert.equal(job.printDeviceSnapshot.settings.paper, "100x150");
  assert.equal(job.printDeviceSnapshot.settings.driverMode, "system_printer");
  assert.equal(job.metadata.route, "seed_office_print_job_demo");
}
assert.equal(calls.filter((item) => item.kind === "operationLog").length, 2);

calls.length = 0;
const partialWorkspace = buildPrintWorkspace({
  runtimeConfig: { mode: "demo" },
  printJobs: [{ printJobId: "PJ-DEMO-QUEUED-DISPATCH" }],
});
assert.deepEqual(await service.seedPrintJobs(partialWorkspace), {
  createdCount: 1,
  createdPrintJobIds: ["PJ-DEMO-FAILED-RETRY"],
  skippedReason: "",
});
assert.equal(partialWorkspace.persisted.length, 1);

calls.length = 0;
const completeWorkspace = buildPrintWorkspace({
  runtimeConfig: { mode: "demo" },
  printJobs: [
    { printJobId: "PJ-DEMO-QUEUED-DISPATCH" },
    { printJobId: "PJ-DEMO-FAILED-RETRY" },
  ],
});
assert.deepEqual(await service.seedPrintJobs(completeWorkspace), {
  createdCount: 0,
  createdPrintJobIds: [],
  skippedReason: "",
});
assert.equal(completeWorkspace.persisted.length, 0);
assert.equal(calls.filter((item) => item.kind === "operationLog").length, 0);

for (const dependencyName of [
  "buildOperationLog",
  "buildPrintDeviceSnapshot",
  "findPrintDevice",
  "nextPlainId",
  "now",
]) {
  assert.throws(
    () => createDemoWorkspaceSeedService({
      buildOperationLog: () => {},
      buildPrintDeviceSnapshot: () => {},
      findPrintDevice: () => {},
      nextPlainId: () => {},
      now: () => fixedNow,
      [dependencyName]: null,
    }),
    new RegExp(`${dependencyName} must be a function`),
  );
}

console.log(
  "demo workspace seed service checks passed: production isolation, task mapping, print-job fidelity, and idempotent demo seeding are locked",
);

function buildPrintWorkspace({ runtimeConfig, printJobs = [], printDevices = [labelDevice] } = {}) {
  const persisted = [];
  return {
    runtimeConfig,
    printJobs,
    printDevices,
    persisted,
    printJobRepository: {
      async createPrintJob(input) {
        persisted.push(input);
      },
    },
  };
}
