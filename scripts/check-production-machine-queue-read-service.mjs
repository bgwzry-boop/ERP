import assert from "node:assert/strict";
import { createProductionMachineQueueReadService } from "../server/services/productionMachineQueueReadService.mjs";

const fixedNow = new Date("2026-07-14T08:00:00.000Z");
const calls = { schedules: 0, tasks: [] };
const scheduleRecords = [
  schedule("SQR-A", "PT-A", "BAG-01", "SCH-A", 2),
  schedule("SQR-B", "PT-B", "BAG-01", "SCH-B", 1),
];
const queueCandidates = [
  candidate(task("PT-A", "OL-A", "BAG-01", "SCH-A", "制袋已排产", "2026-07-14T07:00:00.000Z")),
  candidate(task("PT-B", "OL-B", "BAG-01", "SCH-B", "制袋已排产", "2026-07-14T06:00:00.000Z")),
  candidate(task("PT-C", "OL-C", "BAG-02", "", "跨日继续", "2026-07-13T06:00:00.000Z"), {
    latestReportId: "RPT-C",
    progressDate: "2026-07-13",
    latestDailyQualifiedQty: 40,
    cumulativeQualifiedQty: 40,
    remainingQty: 60,
    plannedQty: 100,
    machineCount: 450,
  }),
  candidate(task("PT-D", "OL-D", "BAG-02", "", "待开始", "2026-07-14T05:00:00.000Z")),
  candidate(task("PT-E", "OL-E", "BAG-03", "SCH-E", "已完成", "2026-07-14T04:00:00.000Z")),
  candidate(task("PT-F", "OL-F", "", "SCH-F", "丝印已排产", "2026-07-14T03:00:00.000Z", "丝印")),
];
const workspace = {
  customers: [
    { id: "C-A", name: "甲客户" },
    { id: "C-B", name: "乙客户" },
    { id: "C-C", name: "跨日客户" },
    { id: "C-F", name: "印刷客户" },
  ],
  orderLines: [
    orderLine("OL-A", "C-A", "白色袋", "30*38", 100),
    orderLine("OL-B", "C-B", "黄色袋", "35*41", 200),
    orderLine("OL-C", "C-C", "跨日袋", "40*45", 100),
    orderLine("OL-D", "C-C", "未发布袋", "20*25", 50),
    orderLine("OL-E", "C-C", "完成袋", "20*25", 50),
    orderLine("OL-F", "C-F", "丝印袋", "25*32", 80),
  ],
  productionScheduleRecordRepository: {
    async listProductionScheduleRecords({ filters }) {
      calls.schedules += 1;
      assert.deepEqual(filters, {});
      return structuredClone(scheduleRecords);
    },
  },
  productionPackingReadRepository: {
    async listProductionTasks({ query }) {
      calls.tasks.push(structuredClone(query));
      return { items: structuredClone(queueCandidates) };
    },
  },
};

const service = createProductionMachineQueueReadService({ now: () => fixedNow });
await assert.rejects(
  service.buildMachineQueue({ workspace: {} }),
  /productionScheduleRecordRepository\.listProductionScheduleRecords must be a function/,
);

const queue = await service.buildMachineQueue({ workspace, query: new URLSearchParams({ status: "open" }) });
assert.equal(calls.schedules, 1);
assert.deepEqual(calls.tasks[0], { status: "open", machineId: "", taskType: "", keyword: "", pageSize: 200 });
assert.deepEqual(queue.items.map((item) => item.productionTaskId), ["PT-B", "PT-A", "PT-C", "PT-F"]);
assert.deepEqual(queue.items.map((item) => item.queueSeq), [1, 2, 1, 1]);
assert.equal(queue.total, 4);
assert.equal(queue.generatedAt, fixedNow.toISOString());
assert.equal(queue.source, "derived_from_production_tasks");
assert.match(queue.note, /不代表完整排班/);
assert.equal(workspace.productionScheduleRecords.length, 2);
assert.equal(queue.items.some((item) => item.productionTaskId === "PT-D"), false);
assert.equal(queue.items.some((item) => item.productionTaskId === "PT-E"), false);
assert.equal(queue.items.find((item) => item.productionTaskId === "PT-C")?.queueReason, "跨日继续");
assert.equal(queue.items.find((item) => item.productionTaskId === "PT-C")?.dailyProgress?.machineCount, 450);
assert.equal(queue.items.find((item) => item.productionTaskId === "PT-C")?.dailyProgress?.machineCountAffectsInventory, false);
assert.equal(queue.items.find((item) => item.productionTaskId === "PT-C")?.dailyProgress?.inventoryCreated, false);
assert.equal(queue.items.find((item) => item.productionTaskId === "PT-F")?.machineId, "PRINT-01");
assert.deepEqual(
  queue.machines.map(({ machineId, total, plannedQty, remainingQty }) => ({ machineId, total, plannedQty, remainingQty })),
  [
    { machineId: "BAG-01", total: 2, plannedQty: 300, remainingQty: 300 },
    { machineId: "BAG-02", total: 1, plannedQty: 100, remainingQty: 60 },
    { machineId: "PRINT-01", total: 1, plannedQty: 80, remainingQty: 80 },
  ],
);

const aliasFiltered = await service.buildMachineQueue({
  workspace,
  query: { currentMachineId: "BAG-02", processType: "制袋", keyword: "跨日客户" },
});
assert.deepEqual(aliasFiltered.items.map((item) => item.productionTaskId), ["PT-C"]);
assert.deepEqual(calls.tasks[1], {
  status: "open",
  machineId: "BAG-02",
  taskType: "制袋",
  keyword: "跨日客户",
  pageSize: 200,
});

const statusFiltered = await service.buildMachineQueue({ workspace, query: { status: "丝印已排产" } });
assert.deepEqual(statusFiltered.items.map((item) => item.productionTaskId), ["PT-F"]);
assert.deepEqual(scheduleRecords.map((item) => item.revision), [1, 1]);

console.log(
  "Production machine queue read service checks passed: published/carry-over eligibility, manual ordering, filters, machine summaries, and machine-count safeguards are isolated.",
);

function task(productionTaskId, orderLineId, machineId, publishedScheduleId, status, createdAt, taskType = "制袋") {
  return {
    productionTaskId,
    orderLineId,
    machineId,
    publishedScheduleId,
    taskStatus: status,
    status,
    taskType,
    plannedQty: productionTaskId === "PT-B" ? 200 : productionTaskId === "PT-F" ? 80 : 100,
    createdAt,
  };
}

function candidate(productionTask, dailyProgress = null) {
  return { productionTaskId: productionTask.productionTaskId, orderLineId: productionTask.orderLineId, productionTask, dailyProgress };
}

function orderLine(id, customerId, productName, size, qty) {
  return { id, orderLineId: id, customerId, productName, size, qty, originalQty: qty, bagColor: "白色", handleType: "普通提" };
}

function schedule(scheduleRecordId, productionTaskId, machineId, publishedScheduleId, queueSeq) {
  return {
    scheduleRecordId,
    productionTaskId,
    machineId,
    publishedScheduleId,
    queueSeq,
    revision: 1,
    updatedAt: "2026-07-14T07:30:00.000Z",
    updatedBy: "U-OFFICE-A",
    remark: "人工顺序",
    source: "manual_resequence",
  };
}
