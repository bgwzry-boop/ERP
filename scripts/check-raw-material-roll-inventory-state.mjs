import assert from "node:assert/strict";
import {
  buildRawMaterialAvailableDistribution,
  buildRawMaterialRollLedger,
  filterRawMaterialRollLedger,
  getRawMaterialRollFilterOptions,
  summarizeRawMaterialRollLedger,
} from "../src/domain/rawMaterialRollInventoryState.js";

const inbounds = [
  {
    id: "RMI-001",
    supplierName: "人意无纺布",
    deliveryNoteNo: "RY-001",
    receivedAt: "2026-08-07 09:20",
    factoryColor: "深灰",
    spec: "78*80*2000",
    unit: "kg",
    rolls: [
      { id: "RM-001", supplierRollNo: "重1", weightKg: 95.8, inventoryStatus: "可用", labelStatus: "已贴标/可用库存", location: "原材料仓库" },
      { id: "RM-002", supplierRollNo: "重2", weightKg: 95.6, inventoryStatus: "可用", labelStatus: "已贴标/可用库存", location: "原材料仓库" },
      { id: "RM-003", supplierRollNo: "重3", weightKg: 95.5, remainingMachineSideWeightKg: 31.2, inventoryStatus: "机边领用", labelStatus: "已贴标/可用库存", location: "1号机边" },
      { id: "RM-004", supplierRollNo: "重4", weightKg: 95.4, inventoryStatus: "不可用", labelStatus: "已打印待贴标", location: "待贴标区" },
    ],
  },
  {
    id: "RMI-002",
    supplierName: "河北宏尚",
    receivedAt: "2026-08-06 10:00",
    factoryColor: "大红",
    materialType: "提手",
    unit: "件",
    spec: "78*5",
    rolls: [
      { id: "RM-005", weightKg: 0, inventoryStatus: "余料待复核", labelStatus: "已贴标/可用库存", location: "余料区" },
    ],
  },
];

const ledger = buildRawMaterialRollLedger(inbounds);
assert.deepEqual(ledger.map((roll) => roll.id), ["RM-001", "RM-002", "RM-003", "RM-005"], "pending receiving rolls must stay out of the confirmed inventory ledger");
assert.equal(ledger[0].specDisplay, "78克*80宽*2000米");
assert.equal(ledger[2].currentWeightKg, 31.2, "machine-side remaining weight must be the current ledger weight");
assert.equal(ledger[3].widthLabel, "5cm 提手条");

assert.deepEqual(summarizeRawMaterialRollLedger(ledger), {
  available: { count: 2, weightKg: 191.4 },
  machineSide: { count: 1, weightKg: 31.2 },
  review: { count: 1, weightKg: 0 },
});
assert.deepEqual(filterRawMaterialRollLedger(ledger, { keyword: "RY-001" }).map((roll) => roll.id), ["RM-001", "RM-002", "RM-003"]);
assert.deepEqual(filterRawMaterialRollLedger(ledger, { status: "可用" }).map((roll) => roll.id), ["RM-001", "RM-002"]);

const distribution = buildRawMaterialAvailableDistribution(ledger);
assert.equal(distribution.length, 1, "only available rolls may appear in available distribution");
assert.equal(distribution[0].widthLabel, "80cm");
assert.equal(distribution[0].items[0].count, 2);
assert.equal(distribution[0].items[0].weightKg, 191.4);

const options = getRawMaterialRollFilterOptions(ledger);
assert.deepEqual(options.statuses, ["可用", "机边领用", "余料待复核"]);
assert.deepEqual(options.widths, ["80cm", "5cm 提手条"]);

console.log("raw-material roll inventory state checks passed");
