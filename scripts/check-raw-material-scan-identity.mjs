import assert from "node:assert/strict";
import { findRawMaterialRollByScan, getRawMaterialScanOutboundBlocker, resolveRawMaterialRollScan } from "../src/domain/rawMaterialScanOutbound.js";

const roll = (id, supplierRollNo, inventoryStatus = "可用") => ({
  id, supplierRollNo, inventoryStatus, labelStatus: "已贴标/可用库存", weightKg: 100,
});
const records = [
  { id: "RECEIPT-A", rolls: [roll("RM-A", "RM-B")] },
  { id: "RECEIPT-B", rolls: [roll("RM-B", "001")] },
];
for (const inbounds of [records, [...records].reverse()]) {
  const exact = findRawMaterialRollByScan(inbounds, "*RAW-MATERIAL:rm-b*");
  assert.equal(exact.inbound.id, "RECEIPT-B");
  assert.equal(exact.roll.id, "RM-B");
  assert.equal(exact.scanCode, "RM-B");
  const alias = findRawMaterialRollByScan(inbounds, "001");
  assert.equal(alias.roll.id, "RM-B");
  assert.equal(alias.scanCode, "RM-B", "A unique alias resolves to the canonical code for later actions.");
}
const ambiguous = [
  { id: "RECEIPT-A", rolls: [roll("RM-A", "001")] },
  { id: "RECEIPT-B", rolls: [roll("RM-B", "001")] },
];
assert.deepEqual(resolveRawMaterialRollScan(ambiguous, "001"), { match: null, ambiguous: true });
assert.equal(findRawMaterialRollByScan(ambiguous, "001"), null);
assert.ok(getRawMaterialScanOutboundBlocker(findRawMaterialRollByScan(ambiguous, "001")));
assert.deepEqual(resolveRawMaterialRollScan([{ id: "SAME-RECEIPT", rolls: [roll("RM-A", "001"), roll("RM-B", "001")] }], "001"), { match: null, ambiguous: true });
assert.deepEqual(resolveRawMaterialRollScan([{ id: "A", rolls: [roll("RM-SAME", "001")] }, { id: "B", rolls: [roll("RM-SAME", "002")] }], "RM-SAME"), { match: null, ambiguous: true });
const unavailable = [records[0], { id: "RECEIPT-B", rolls: [roll("RM-B", "001", "机边领用")] }];
assert.equal(findRawMaterialRollByScan(unavailable, "RM-B").roll.inventoryStatus, "机边领用");
assert.match(getRawMaterialScanOutboundBlocker(findRawMaterialRollByScan(unavailable, "RM-B")), /不能重复出库/);
assert.deepEqual(resolveRawMaterialRollScan(records, "unknown"), { match: null, ambiguous: false });
assert.deepEqual(resolveRawMaterialRollScan(records, ""), { match: null, ambiguous: false });
console.log("Raw-material scan identity passed: canonical codes outrank supplier aliases; duplicate aliases/canonical identities block; unique aliases retain canonical identity and physical state guards.");
