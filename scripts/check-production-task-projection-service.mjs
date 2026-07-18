import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProductionTaskProjectionService } from "../server/services/productionTaskProjectionService.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createProductionTaskProjectionService\(\{/);
assert.match(registrySource, /\} = productionTaskProjectionService;/);

const methodNames = [
  "buildProductionTaskFromBody",
  "inferProductionMachineIdFromTaskType",
  "inferProductionTaskTypeFromOrderLine",
  "isProductionTaskCompletedStatus",
  "resolvePublishedProductionLineStatus",
  "resolvePublishedProductionTaskStatus",
  "toProductionTaskSummary",
];
for (const functionName of methodNames) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${functionName}\\(`));
}

const fixedNow = new Date("2026-07-14T14:00:00.000Z");
const photoCalls = [];
const workspace = {
  orderLines: [
    {
      id: "OL-1",
      orderLineId: "OL-PRIMARY",
      lineStatus: "待丝印",
      qty: 120,
      createdBy: "U-OFFICE-A",
    },
    {
      id: "OL-2",
      status: "待制袋",
      originalQty: 80,
    },
  ],
};
const service = createProductionTaskProjectionService({
  buildPhotoSummary(photoWorkspace, task, orderLine) {
    photoCalls.push({ photoWorkspace, task, orderLine });
    return { reviewStatus: task.photoStatus ?? "待上传" };
  },
  cleanServerText(value) {
    return String(value ?? "").trim();
  },
  findOrderLine(currentWorkspace, id) {
    return currentWorkspace.orderLines.find(
      (line) => line.id === String(id ?? "").trim() || line.orderLineId === String(id ?? "").trim(),
    ) ?? null;
  },
  now: () => fixedNow,
});

assert.equal(Object.isFrozen(service), true);
assert.deepEqual(Object.keys(service).sort(), [...methodNames].sort());

assert.deepEqual(service.buildProductionTaskFromBody(workspace, "PT-1", { orderLineId: "OL-PRIMARY" }), {
  id: "PT-1",
  productionTaskId: "PT-1",
  bizNo: "PT-1",
  orderLineId: "OL-PRIMARY",
  lineId: "OL-PRIMARY",
  taskType: "丝印",
  machineId: "PRINT-01",
  plannedQty: 120,
  qty: 120,
  taskStatus: "待开始",
  status: "待开始",
  createdBy: "U-OFFICE-A",
  createdAt: fixedNow.toISOString(),
});
assert.deepEqual(
  service.buildProductionTaskFromBody(workspace, "PT-2", {
    lineId: "OL-2",
    bizNo: "BIZ-2",
    processType: "制袋",
    machineId: "BAG-09",
    plannedQty: 75,
    createdAt: "2026-07-14T13:00:00.000Z",
  }),
  {
    id: "PT-2",
    productionTaskId: "PT-2",
    bizNo: "BIZ-2",
    orderLineId: "OL-2",
    lineId: "OL-2",
    taskType: "制袋",
    machineId: "BAG-09",
    plannedQty: 75,
    qty: 75,
    taskStatus: "待开始",
    status: "待开始",
    createdBy: "",
    createdAt: "2026-07-14T13:00:00.000Z",
  },
);
assert.equal(service.buildProductionTaskFromBody(workspace, "PT-404", { orderLineId: "OL-404" }), null);

assert.equal(service.inferProductionTaskTypeFromOrderLine({ lineStatus: "补印待排产" }), "丝印");
assert.equal(service.inferProductionTaskTypeFromOrderLine({ status: "待制袋" }), "制袋");
assert.equal(service.inferProductionMachineIdFromTaskType("丝印"), "PRINT-01");
assert.equal(service.inferProductionMachineIdFromTaskType("制袋"), "BAG-01");
assert.deepEqual(
  ["已完成", " completed ", "DONE", "制袋中", ""].map(service.isProductionTaskCompletedStatus),
  [true, true, true, false, false],
);

assert.equal(
  service.resolvePublishedProductionTaskStatus({ taskType: "丝印", beforeTask: { status: "待开始" } }),
  "丝印已排产",
);
assert.equal(
  service.resolvePublishedProductionTaskStatus({ taskType: "制袋", beforeTask: { taskStatus: "制袋中" } }),
  "制袋中",
);
assert.equal(
  service.resolvePublishedProductionLineStatus({
    taskType: "制袋",
    beforeOrderLine: { lineStatus: "待排产" },
    taskStatus: "制袋已排产",
  }),
  "制袋已排产",
);
assert.equal(
  service.resolvePublishedProductionLineStatus({
    taskType: "制袋",
    beforeOrderLine: { status: "待生产复核" },
    taskStatus: " 丝印已排产 ",
  }),
  "丝印已排产",
);

const orderLine = workspace.orderLines[0];
const task = {
  id: "PT-3",
  lineId: "OL-1",
  processType: "丝印",
  machineId: "PRINT-01",
  qty: 120,
  status: "丝印中",
  revision: 2.9,
  photoStatus: "已接受",
  createdBy: "U-WORKSHOP-A",
  createdAt: "2026-07-14T10:00:00.000Z",
};
assert.deepEqual(service.toProductionTaskSummary(task, orderLine), {
  productionTaskId: "PT-3",
  bizNo: "PT-3",
  orderLineId: "OL-1",
  taskType: "丝印",
  machineId: "PRINT-01",
  publishedScheduleId: "",
  plannedQty: 120,
  taskStatus: "丝印中",
  status: "丝印中",
  revision: 2,
  finishedGoodsPhoto: { reviewStatus: "已接受" },
  createdBy: "U-WORKSHOP-A",
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "",
});
assert.equal(photoCalls.length, 1);
assert.equal(photoCalls[0].photoWorkspace, null);
assert.equal(photoCalls[0].task, task);
assert.equal(photoCalls[0].orderLine, orderLine);

for (const invalid of [
  { buildPhotoSummary: null, cleanServerText() {}, findOrderLine() {}, now() {} },
  { buildPhotoSummary() {}, cleanServerText: null, findOrderLine() {}, now() {} },
  { buildPhotoSummary() {}, cleanServerText() {}, findOrderLine: null, now() {} },
  { buildPhotoSummary() {}, cleanServerText() {}, findOrderLine() {}, now: null },
]) {
  assert.throws(() => createProductionTaskProjectionService(invalid), /requires .* to be a function/);
}

console.log(
  "Production task projection service checks passed: task creation, machine/type inference, completion policy, publish states, photo summary, and source ownership are isolated",
);
