import assert from "node:assert/strict";
import {
  assertWholeRollIssue,
  resolveRawMaterialWholeRollMachine,
  RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS,
  RAW_MATERIAL_WHOLE_ROLL_PRINT_MACHINE_LABELS,
} from "../src/domain/rawMaterialWholeRollPolicy.js";
import { applyRawMaterialInboundAction } from "../server/services/rawMaterialInboundCommandService.mjs";

const stock = {
  id: "RMI-MACHINE-RANGE", revision: 1, supplierName: "测试原料厂", status: "已贴标入库",
  materialType: "无纺布", productName: "布料", spec: "78*90*1500", factoryColor: "红色", unit: "kg",
  rolls: [{ id: "RM-MACHINE-01", weightKg: 50, factoryColor: "红色", spec: "78*90*1500", labelStatus: "已贴标/可用库存", inventoryStatus: "可用", location: "原料库" }],
};
const snapshot = structuredClone(stock);
function issue(machineId) {
  return applyRawMaterialInboundAction({
    inbounds: [stock], inboundId: stock.id, action: "issue_to_machine", operatorId: "TEST-WAREHOUSE", operatorName: "测试库房",
    serverNow: "2026-11-01T08:00:00.000Z", body: { expectedRevision: 1, rollId: stock.rolls[0].id, machineId },
  });
}
for (let i = 1; i <= 4; i += 1) {
  const expected = RAW_MATERIAL_WHOLE_ROLL_PRINT_MACHINE_LABELS[i - 1];
  for (const machine of [`PRINT-0${i}`, `${i}号丝印机`, `丝印机-0${i}`]) {
    assert.equal(resolveRawMaterialWholeRollMachine(machine), expected);
    const result = issue(machine);
    assert.equal(result.inbound.rolls[0].machineId, expected);
    assert.equal(result.inbound.rolls[0].inventoryStatus, "机边领用");
    assert.equal(result.inbound.rolls[0].weightKg, 50);
  }
}
for (let i = 5; i <= 9; i += 1) {
  for (const machine of [`PRINT-0${i}`, `${i}号丝印机`, `丝印机-0${i}`]) {
    assert.equal(resolveRawMaterialWholeRollMachine(machine), "");
    assert.equal(assertWholeRollIssue({ machineId: machine, fullWeightKg: 50 }).code, "RAW_MATERIAL_ISSUE_MACHINE_NOT_ALLOWED");
    assert.throws(() => issue(machine), error => error.code === "RAW_MATERIAL_ISSUE_MACHINE_NOT_ALLOWED");
  }
}
for (let i = 1; i <= 9; i += 1) {
  for (const machine of [`BAG-0${i}`, `${i}号机`, `制袋机-0${i}`]) {
    assert.equal(resolveRawMaterialWholeRollMachine(machine), RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS[i - 1]);
  }
}
assert.equal(issue("BAG-09").inbound.rolls[0].machineId, "9号机");
assert.equal(resolveRawMaterialWholeRollMachine("1号制袋机"), "1号机");
assert.equal(issue("丝印车间").inbound.rolls[0].machineId, "丝印车间", "shared printing-workshop target remains supported");
for (const machine of ["PRINT-00", "PRINT-10", "BAG-00", "BAG-10", "10号机", "切袋机-01", "unknown"])
  assert.throws(() => issue(machine), error => error.code === "RAW_MATERIAL_ISSUE_MACHINE_NOT_ALLOWED");
assert.deepEqual(stock, snapshot, "rejected or isolated test commands do not modify source stock");
console.log("PASS material issue machine range: 4 printing machines and 9 bag-making machines; valid aliases/workshop retained; unknown machines cannot issue inventory. Isolated command checks, no business writes.");
