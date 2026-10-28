import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_RAW_MATERIAL_ROLL_INVENTORY_STATUS,
  RAW_MATERIAL_ONE_CLICK_INBOUND_ACTION,
  RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS,
  evaluateRawMaterialOneClickInbound,
  resolveRawMaterialWholeRollMachine,
} from "../src/domain/rawMaterialWholeRollPolicy.js";
import { RAW_MATERIAL_MACHINE_OPTIONS } from "../src/domain/rawMaterialScanOutbound.js";
import { applyRawMaterialInboundAction } from "../server/services/rawMaterialInboundCommandService.mjs";

assert.equal(DEFAULT_RAW_MATERIAL_ROLL_INVENTORY_STATUS, "可用");
assert.equal(RAW_MATERIAL_ONE_CLICK_INBOUND_ACTION, "本单已贴齐/一键入库");
assert.deepEqual(RAW_MATERIAL_MACHINE_OPTIONS, RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS);
assert.deepEqual([...RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS], ["1号机", "2号机", "3号机", "4号机", "5号机", "6号机", "7号机", "8号机", "9号机"]);
assert.equal(resolveRawMaterialWholeRollMachine("BAG-09"), "9号机");
assert.equal(resolveRawMaterialWholeRollMachine("制袋机-03"), "3号机");
assert.equal(resolveRawMaterialWholeRollMachine("PRINT-01"), "");
assert.equal(resolveRawMaterialWholeRollMachine("10号机"), "");

const workbenchSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundWorkbench.jsx", import.meta.url), "utf8");
const reviewSource = readFileSync(new URL("../docs/prototypes/raw-material-roll-inventory-review/src/App.jsx", import.meta.url), "utf8");
assert.match(workbenchSource, /useState\(DEFAULT_RAW_MATERIAL_ROLL_INVENTORY_STATUS\)/);
assert.match(workbenchSource, /setStatus\(DEFAULT_RAW_MATERIAL_ROLL_INVENTORY_STATUS\)/);
assert.match(workbenchSource, /widthLabel\}::\$\{item\.color\}/);
assert.match(reviewSource, /useState\("可用"\)/);
assert.match(reviewSource, /setStatus\("可用"\)/);

function roll(id, overrides = {}) {
  return {
    id,
    supplierRollNo: id,
    weightKg: 80,
    labelStatus: "已打印待贴标",
    inventoryStatus: "待贴标",
    ...overrides,
  };
}

const pendingInbound = {
  id: "RMI-WHOLE-1",
  revision: 1,
  supplierName: "测试供应商",
  materialType: "无纺布",
  productName: "本白布",
  spec: "78*80*2000",
  factoryColor: "本白",
  widthCm: 80,
  unit: "kg",
  status: "已打印待贴标",
  rolls: [roll("RM-WHOLE-01"), roll("RM-WHOLE-02")],
};

const blocked = evaluateRawMaterialOneClickInbound({
  rolls: [roll("RM-A"), roll("RM-B", { labelStatus: "待打印标签", inventoryStatus: "不可用" })],
});
assert.equal(blocked.allowed, false);
assert.equal(blocked.printedLabelCount, 1);
assert.equal(blocked.rollCount, 2);
assert.match(blocked.blocker, /不能一键入库/);

const exceptionGate = evaluateRawMaterialOneClickInbound({
  rolls: [
    roll("RM-OK"),
    roll("RM-BAD", { labelStatus: "标签或实物不符/待确认", inventoryStatus: "待确认" }),
  ],
});
assert.equal(exceptionGate.allowed, false);
assert.equal(exceptionGate.exceptionCount, 1);

const incompleteInbound = {
  ...pendingInbound,
  id: "RMI-WHOLE-BLOCKED",
  rolls: [roll("RM-BLOCK-01"), roll("RM-BLOCK-02", { labelStatus: "待打印标签", inventoryStatus: "不可用" })],
};
assert.throws(() => applyRawMaterialInboundAction({
  inbounds: [incompleteInbound],
  inboundId: incompleteInbound.id,
  action: "one_click_inbound",
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  serverNow: "2026-10-21T02:00:00.000Z",
  body: { expectedRevision: 1 },
}), (error) => error.code === "RAW_MATERIAL_ONE_CLICK_INBOUND_BLOCKED");

const opened = applyRawMaterialInboundAction({
  inbounds: [pendingInbound],
  inboundId: pendingInbound.id,
  action: "本单已贴齐/一键入库",
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  serverNow: "2026-10-21T02:00:00.000Z",
  body: { expectedRevision: 1, location: "原料库-可用区" },
});
assert.equal(opened.inbound.rolls.every((item) => item.inventoryStatus === "可用"), true);
assert.equal(opened.inbound.rolls.every((item) => item.labelStatus === "已贴标/可用库存"), true);
assert.equal(opened.inbound.labelVerificationSummary.oneClickInbound, true);

const exceptionInbound = {
  ...pendingInbound,
  id: "RMI-WHOLE-EX",
  rolls: [
    roll("RM-EX-01"),
    roll("RM-EX-02", { labelStatus: "标签或实物不符/待确认", inventoryStatus: "待确认" }),
  ],
};
assert.throws(() => applyRawMaterialInboundAction({
  inbounds: [exceptionInbound],
  inboundId: exceptionInbound.id,
  action: "one_click_inbound",
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  serverNow: "2026-10-21T02:05:00.000Z",
  body: { expectedRevision: 1 },
}), (error) => error.code === "RAW_MATERIAL_ONE_CLICK_INBOUND_BLOCKED" && error.details.exceptionCount === 1);
assert.equal(exceptionInbound.rolls[1].inventoryStatus, "待确认", "exception rolls stay out of available stock");

const availableInbound = {
  ...pendingInbound,
  id: "RMI-WHOLE-OUT",
  status: "已贴标入库/可用",
  rolls: [roll("RM-OUT-01", { labelStatus: "已贴标/可用库存", inventoryStatus: "可用", weightKg: 96.5 })],
};

assert.throws(() => applyRawMaterialInboundAction({
  inbounds: [availableInbound],
  inboundId: availableInbound.id,
  action: "issue_to_machine",
  operatorId: "U-WAREHOUSE-A",
  operatorName: "库房A",
  serverNow: "2026-10-21T03:00:00.000Z",
  body: { expectedRevision: 1, rollId: "RM-OUT-01", machineId: "1号机", issuedWeightKg: 40 },
}), (error) => error.code === "RAW_MATERIAL_PARTIAL_ISSUE_DISABLED");

assert.throws(() => applyRawMaterialInboundAction({
  inbounds: [availableInbound],
  inboundId: availableInbound.id,
  action: "issue_to_machine",
  operatorId: "U-WAREHOUSE-A",
  operatorName: "库房A",
  serverNow: "2026-10-21T03:01:00.000Z",
  body: { expectedRevision: 1, rollId: "RM-OUT-01", machineId: "PRINT-01" },
}), (error) => error.code === "RAW_MATERIAL_ISSUE_MACHINE_NOT_ALLOWED");

const issued = applyRawMaterialInboundAction({
  inbounds: [availableInbound],
  inboundId: availableInbound.id,
  action: "扫码出库",
  operatorId: "U-WAREHOUSE-A",
  operatorName: "库房A",
  serverNow: "2026-10-21T03:02:00.000Z",
  body: { expectedRevision: 1, rollId: "RM-OUT-01", machineId: "BAG-04" },
});
assert.equal(issued.inbound.rolls.length, 1);
assert.equal(issued.inbound.rolls[0].inventoryStatus, "机边领用");
assert.equal(issued.inbound.rolls[0].machineId, "4号机");
assert.equal(issued.inbound.rolls[0].weightKg, 96.5);
assert.equal(issued.inbound.rawMaterialSplitRecords.length, 0);
assert.notEqual(issued.inbound.rolls[0].inventoryStatus, "可用");

for (const action of ["return_leftover", "余料退回", "review_leftover", "复核余料可用"]) {
  const before = structuredClone(issued.inbound);
  assert.throws(() => applyRawMaterialInboundAction({
    inbounds: [issued.inbound],
    inboundId: availableInbound.id,
    action,
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房A",
    serverNow: "2026-10-21T03:03:00.000Z",
    body: { expectedRevision: issued.inbound.revision, rollId: "RM-OUT-01", reviewedWeightKg: 96.5, leftoverWeightKg: 96.5 },
  }), (error) => error.code === "RAW_MATERIAL_LEFTOVER_RETURN_TO_AVAILABLE_DISABLED", action);
  assert.deepEqual(issued.inbound, before, `${action} must not restore available stock`);
  assert.equal(issued.inbound.rolls[0].inventoryStatus, "机边领用");
}

const pendingLeftover = {
  ...issued.inbound,
  rolls: [{ ...issued.inbound.rolls[0], inventoryStatus: "余料待复核", leftoverWeightKg: 20 }],
};
for (const action of ["review_leftover", "复核余料可用", "return_leftover"]) {
  const before = structuredClone(pendingLeftover);
  assert.throws(() => applyRawMaterialInboundAction({
    inbounds: [pendingLeftover],
    inboundId: availableInbound.id,
    action,
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房A",
    serverNow: "2026-10-21T03:04:00.000Z",
    body: { expectedRevision: pendingLeftover.revision, rollId: "RM-OUT-01", reviewedWeightKg: 20 },
  }), (error) => error.code === "RAW_MATERIAL_LEFTOVER_RETURN_TO_AVAILABLE_DISABLED", action);
  assert.deepEqual(pendingLeftover, before);
  assert.equal(pendingLeftover.rolls[0].inventoryStatus, "余料待复核");
  assert.notEqual(pendingLeftover.rolls[0].inventoryStatus, "可用");
}

console.log("raw-material whole-roll policy checks passed");
