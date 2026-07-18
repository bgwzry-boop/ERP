import assert from "node:assert/strict";
import {
  buildMachineCapacityBaselineRecord,
  buildPackageRecord,
  buildPackingTaskRecord,
  buildProductionInventoryLedgerRecord,
  buildProductionOperationLog,
  buildProductionOrderLineRecord,
  buildProductionReservationRecord,
  buildProductionScheduleOperationLog,
  buildProductionScheduleRecord,
  buildProductionTaskRecord,
  buildWorkshopReportRecord,
} from "./helpers/postgresLiveProductionFixtures.mjs";

const task = buildProductionTaskRecord({ taskStatus: "已完成" });
assert.equal(task.taskStatus, "已完成");
assert.equal(task.plannedQty, 80);

const report = buildWorkshopReportRecord({ qualifiedQty: 70, exceptionQty: 10 });
assert.equal(report.machineCount, 8888);
assert.match(report.evidence.machineCountLabel, /非合格成品数量/);
assert.equal(report.qualifiedQty + report.exceptionQty, 80);

const packingTask = buildPackingTaskRecord({ actualPackedQty: 80, status: "已完成" });
assert.equal(packingTask.plannedQty, packingTask.actualPackedQty);
assert.equal(packingTask.status, "已完成");

const capacity = buildMachineCapacityBaselineRecord({ dailyCapacityQty: 96 });
assert.equal(capacity.machineId, "BAG-LIVE-01");
assert.equal(capacity.dailyCapacityQty, 96);

const orderLine = buildProductionOrderLineRecord({ lineStatus: "已完成" });
const reservation = buildProductionReservationRecord({ reservedQty: 70 });
const ledger = buildProductionInventoryLedgerRecord({ qtyBefore: 20, qtyChange: 70, qtyAfter: 90 });
assert.equal(orderLine.id, reservation.orderLineId);
assert.equal(ledger.qtyBefore + ledger.qtyChange, ledger.qtyAfter);
assert.equal(ledger.remark, "机器计数不参与库存");

const packageRecord = buildPackageRecord({ packageId: "PKG-FIXTURE-002", packageSeq: 2, packageCount: 2, packedQty: 40 });
assert.equal(packageRecord.id, packageRecord.packageId);
assert.equal(packageRecord.bizNo, packageRecord.packageId);

const productionLog = buildProductionOperationLog({ logId: "LOG-FIXTURE-PROD-001" });
assert.equal(productionLog.id, "LOG-FIXTURE-PROD-001");
assert.equal(productionLog.targetType, "production_task");

const schedule = buildProductionScheduleRecord({ productionTaskId: "PT-FIXTURE-002", queueSeq: 2 });
assert.equal(schedule.scheduleRecordId, "SQR-PT-FIXTURE-002");
assert.equal(schedule.queueSeq, 2);

const scheduleLog = buildProductionScheduleOperationLog({ logId: "LOG-FIXTURE-SCHEDULE-001" });
assert.equal(scheduleLog.id, "LOG-FIXTURE-SCHEDULE-001");
assert.equal(scheduleLog.after.inventoryCreated, false);
assert.equal(scheduleLog.after.packingTaskCreated, false);

console.log("PostgreSQL live production fixture checks passed: production, packing, schedule, inventory, and audit records are stable.");
