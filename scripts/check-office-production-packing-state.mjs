import assert from "node:assert/strict";
import {
  applyPrintRecordProjection,
  buildFulfillmentFromPacking,
  buildProductionTaskListQueryForPage,
  createInitialProductionPackingState,
  findFulfillmentForPrintTodo,
  inferPackageCountFromQty,
  mapPackingTaskListItemToTask,
  mapProductionTaskListItemToLine,
  upsertPackingTask,
  upsertProductionTaskLine,
} from "../src/state/officeProductionPackingState.js";

const localOrderLines = [
  {
    id: "OL-001",
    orderNo: "ORD-001",
    customerId: "C001",
    product: "定制印刷袋",
    size: "30*40",
    color: "白色",
    handle: "普通提",
    style: "定制印刷",
    qty: 1200,
    status: "待打包",
    fulfillment: "快递快运",
    latest: "明天",
  },
];

const initial = createInitialProductionPackingState(localOrderLines, {
  buildPackingTaskId: (line) => `PACK-${line.id}`,
});
assert.equal(initial.packingTasks.length, 1);
assert.equal(initial.packingTasks[0].packingTaskId, "PACK-OL-001");
assert.equal(initial.packingTasks[0].packageCount, 3);
assert.equal(inferPackageCountFromQty(1800), 4);
assert.deepEqual(buildProductionTaskListQueryForPage("packing", {}, "U-WORKSHOP-A"), { pageSize: 200 });
assert.deepEqual(buildProductionTaskListQueryForPage("workshopMobile", {}, "U-WORKSHOP-A"), {
  pageSize: 200,
  status: "open",
  visibility: "workshop_mobile",
  machineId: "BAG-01",
});

const productionLine = mapProductionTaskListItemToLine(
  {
    productionTaskId: "PT-001",
    productionTask: { orderLineId: "OL-001", taskStatus: "生产中", plannedQty: 1200, taskType: "制袋", machineId: "BAG-01" },
    orderLine: { orderLineId: "OL-001", productName: "定制印刷袋", bagColor: "白色", lineStatus: "待生产" },
  },
  localOrderLines,
);
assert.equal(productionLine.id, "OL-001");
assert.equal(productionLine.status, "生产中");
assert.equal(productionLine.productionTaskId, "PT-001");

const packingTask = mapPackingTaskListItemToTask(
  {
    packingTaskId: "PK-001",
    packingTask: { orderLineId: "OL-001", plannedQty: 1200, actualPackedQty: 1000, packageCount: 3, status: "打包中" },
    orderLine: { orderLineId: "OL-001", productName: "定制印刷袋", lineStatus: "待打包" },
    packages: [{ packageId: "PKG-001" }],
    inventoryDeducted: true,
  },
  localOrderLines,
);
assert.equal(packingTask.packingTaskId, "PK-001");
assert.equal(packingTask.actualPackedQty, 1000);
assert.equal(packingTask.packageCount, 3);
assert.equal(packingTask.inventoryDeducted, true);

const updatedPacking = upsertPackingTask(initial.packingTasks, { packingTaskId: "PACK-OL-001", actualPackedQty: 1200 });
assert.equal(updatedPacking.length, 1);
assert.equal(updatedPacking[0].actualPackedQty, 1200);
const updatedProduction = upsertProductionTaskLine([productionLine], { productionTaskId: "PT-001", status: "已完成" });
assert.equal(updatedProduction.length, 1);
assert.equal(updatedProduction[0].status, "已完成");

const fulfillment = buildFulfillmentFromPacking({
  orderLine: localOrderLines[0],
  packingResult: { fulfillmentId: "F-001", actualPackedQty: 1200 },
  packageCount: 3,
});
assert.equal(fulfillment.status, "待打印标签");
assert.equal(fulfillment.packages, "3包");

const printed = applyPrintRecordProjection(
  [{ id: "F-001", status: "待打印标签", printed: false }],
  "F-001",
  { printRecordId: "PR-001", status: "printed", batchNo: "PB-001" },
);
assert.equal(printed[0].printed, true);
assert.equal(printed[0].activePrintRecordId, "PR-001");
assert.equal(findFulfillmentForPrintTodo({ ref: "OL-001" }, [{ ...fulfillment, lineId: "OL-001" }])?.id, "F-001");

console.log("office production/packing state checks passed");
