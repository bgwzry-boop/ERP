import assert from "node:assert/strict";
import {
  buildRawMaterialStockLookup,
  calculateRawMaterialOrderRequirement,
  evaluateRawMaterialOrderSupport,
} from "../shared/rawMaterialInventorySupport.js";

const inbounds = [
  {
    id: "RMI-A",
    receivedAt: "2026-07-04T10:00:00.000Z",
    factoryColor: "本白",
    widthCm: 90,
    gramWeightGsm: 78,
    unitPrice: 9.7,
    rolls: [
      { id: "ROLL-A", inventoryStatus: "可用", weightKg: 80 },
      { id: "ROLL-B", inventoryStatus: "机边领用", weightKg: 20 },
      { id: "ROLL-X", supplierColor: "黑色", widthCm: 90, gramWeightGsm: 78, inventoryStatus: "可用", weightKg: 50 },
    ],
  },
  {
    id: "RMI-B",
    receivedAt: "2026-07-05T10:00:00.000Z",
    factoryColor: "白色",
    spec: "90*78*1300",
    unitPrice: 9.8,
    rolls: [{ id: "ROLL-C", inventoryStatus: "可用", weightKg: 25 }],
  },
  {
    id: "RMI-C",
    factoryColor: "黑色",
    widthCm: 90,
    gramWeightGsm: 78,
    unitPrice: 9.9,
    rolls: [{ id: "ROLL-D", inventoryStatus: "可用", weightKg: 99 }],
  },
];

const lookup = buildRawMaterialStockLookup(inbounds, { color: "白色", widthCm: 90, gramWeightGsm: 78 });
assert.equal(lookup.availableWeightKg, 105);
assert.equal(lookup.availableRollCount, 2);
assert.equal(lookup.machineSideWeightKg, 20);
assert.equal(lookup.latestUnitPrice, 9.8);

const requirement = calculateRawMaterialOrderRequirement({ size: "30*38*8", qty: 1000 });
assert.equal(requirement.requiredWidthCm, 90);
assert.equal(requirement.materialLengthCm, 40);
assert.equal(requirement.requiredWeightKg, 28.08);

const supported = evaluateRawMaterialOrderSupport({
  inbounds,
  order: { productionTaskId: "TASK-1", size: "30*38*8", bagColor: "白色", plannedQty: 1000 },
});
assert.equal(supported.supportStatus, "支持订单");
assert.equal(supported.shortageWeightKg, 0);

const shortage = evaluateRawMaterialOrderSupport({
  inbounds,
  order: { productionTaskId: "TASK-2", size: "30*38*8", bagColor: "白色", plannedQty: 5000 },
});
assert.equal(shortage.supportStatus, "库存不足");
assert.equal(shortage.shortageWeightKg, 35.4);

console.log("Raw-material inventory support checks passed: color/width stock, available weight, latest kg price, order width, and shortage are covered.");
