import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RAW_MATERIAL_ISSUE_PURPOSES,
  buildRawMaterialIssuePurpose,
  listRawMaterialIssueTaskOptions,
} from "../src/domain/rawMaterialScanOutbound.js";
import { buildRawMaterialPickList, checkRollAgainstPickTask, resolvePickWorkshop } from "../src/domain/rawMaterialTaskPicking.js";

assert.deepEqual(RAW_MATERIAL_ISSUE_PURPOSES.map((item) => item.key), ["bag_making", "printing"]);
assert.equal(buildRawMaterialIssuePurpose("bag_making"), "制袋（空白通货）·暂不关联订单");
assert.equal(buildRawMaterialIssuePurpose("printing", "PT-1"), "印刷（先印后制袋）");
assert.equal(buildRawMaterialIssuePurpose("unknown"), "");

const tasks = [
  { productionTaskId: "PT-1", machineId: "3号机", status: "生产中", customerName: "客户甲", orderLineId: "OL-1" },
  { productionTaskId: "PT-2", machineId: "5号机", status: "待生产" },
  { productionTaskId: "PT-3", status: "待生产", goodsSpec: "30×37" },
  { productionTaskId: "PT-4", machineId: "3号机", status: "已完成" },
  { status: "待生产" },
];
assert.deepEqual(listRawMaterialIssueTaskOptions(tasks, "3号机").map((option) => option.id), ["PT-1", "PT-3"]);
assert.equal(listRawMaterialIssueTaskOptions(tasks, "3号机")[0].label, "PT-1 · 客户甲 · 订单行 OL-1");
assert.deepEqual(listRawMaterialIssueTaskOptions(tasks, "").map((option) => option.id), ["PT-1", "PT-2", "PT-3"]);
assert.deepEqual(listRawMaterialIssueTaskOptions(null, "3号机"), []);

// Task-driven picking: 杂工 per workshop, roll checked against the task.
const queueItems = [
  { productionTaskId: "PT-B2", orderLineId: "OL-1", machineId: "BAG-02", taskType: "制袋", size: "40*30*10", bagColor: "红", plannedQty: 1000, queueSeq: 2 },
  { productionTaskId: "PT-B7", orderLineId: "OL-3", machineId: "BAG-07", taskType: "制袋", size: "40*30*10", bagColor: "红", plannedQty: 1000, queueSeq: 1 },
  { productionTaskId: "PT-P1", orderLineId: "OL-2", taskType: "丝印", size: "30*37*8", bagColor: "白", plannedQty: 500 },
  { productionTaskId: "PT-B5", orderLineId: "OL-2", machineId: "BAG-05", taskType: "制袋", size: "30*37*8", bagColor: "白" },
  { productionTaskId: "PT-B1", orderLineId: "OL-4", machineId: "BAG-01", taskType: "制袋", status: "已完成" },
];
const pickedPrint = [{ rawMaterialIssueRecords: [{ productionTaskId: "PT-P1", issuedWeightKg: 20 }] }];
assert.equal(resolvePickWorkshop({ machineId: "BAG-02" }), "1号车间");
assert.equal(resolvePickWorkshop({ machineId: "BAG-07" }), "3号车间");
assert.equal(resolvePickWorkshop({ taskType: "丝印" }), "丝印车间");
assert.deepEqual(buildRawMaterialPickList({ queueItems, workshop: "1号车间" }).map((task) => task.productionTaskId), ["PT-B2"]);
assert.deepEqual(buildRawMaterialPickList({ queueItems, workshop: "丝印车间" }).map((task) => task.productionTaskId), ["PT-P1"]);
assert.deepEqual(buildRawMaterialPickList({ queueItems, workshop: "2号车间" }).map((task) => task.productionTaskId), ["PT-B5"]);
// Printed material flows on to bag-making for the same order line: no second scan.
assert.deepEqual(buildRawMaterialPickList({ queueItems, inbounds: pickedPrint, workshop: "2号车间" }), []);
assert.deepEqual(buildRawMaterialPickList({ queueItems, inbounds: pickedPrint, workshop: "丝印车间" }), []);
const task = buildRawMaterialPickList({ queueItems, workshop: "1号车间" })[0];
assert.equal(task.target, "2号机");
assert.equal(task.requiredWidthCm, 76);
assert.equal(task.requiredColor, "红");
assert.deepEqual(checkRollAgainstPickTask(task, { widthCm: 76, factoryColor: "红" }), { ok: true, problems: [] });
const wrong = checkRollAgainstPickTask(task, { widthCm: 90, factoryColor: "绿" });
assert.equal(wrong.ok, false);
assert.equal(wrong.problems.length, 2);
assert.match(wrong.problems.join(" "), /宽幅不对.*颜色不对/);
// Any matching roll will do, and a task keeps its place until enough weight is picked.
assert.ok(task.requiredWeightKg > 0);
const oneRoll = [{ rawMaterialIssueRecords: [{ productionTaskId: "PT-B2", issuedWeightKg: 1 }] }];
const afterOne = buildRawMaterialPickList({ queueItems, inbounds: oneRoll, workshop: "1号车间" })[0];
assert.equal(afterOne.pickedRollCount, 1);
assert.ok(afterOne.remainingWeightKg > 0 && afterOne.remainingWeightKg < task.requiredWeightKg);
const enough = [{ rawMaterialIssueRecords: [{ productionTaskId: "PT-B2", issuedWeightKg: task.requiredWeightKg }] }];
assert.deepEqual(buildRawMaterialPickList({ queueItems, inbounds: enough, workshop: "1号车间" }), []);

const page = readFileSync(new URL("../src/features/raw-materials/RawMaterialScannerPage.jsx", import.meta.url), "utf8");
assert.match(page, /startDriverPackageCameraScanner/, "workers scan the roll QR with the phone camera");
assert.match(page, /buildRawMaterialPickList/, "the 杂工 picks by task");
assert.match(page, /role="alertdialog"/, "a mismatching roll pops up a warning");
assert.match(page, /taskCheck\.ok/, "a mismatching roll cannot be issued");
assert.match(page, /试用期：没有任务，直接出库/, "trial fallback without tasks");

console.log("raw-material issue/picking check passed: workshop task lists, print-to-bag hand-off without rescan, roll-vs-task mismatch pop-up, camera scanning, trial fallback.");

// Owner decision 2026-11-02: untasked scan outbound stays for the trial and closes in production.
{
  const { resolveRawMaterialUntaskedIssueAllowed, assertRawMaterialUntaskedIssueAllowed } = await import("../server/services/rawMaterialUntaskedIssuePolicy.mjs");
  const { strict: policyAssert } = await import("node:assert");
  policyAssert.equal(resolveRawMaterialUntaskedIssueAllowed({ env: {}, runtimeConfig: { production: false } }), true, "trial/staging keeps the no-task outbound");
  policyAssert.equal(resolveRawMaterialUntaskedIssueAllowed({ env: {}, runtimeConfig: { production: true } }), false, "production requires a task by default");
  policyAssert.equal(resolveRawMaterialUntaskedIssueAllowed({ env: { ERP_RAW_MATERIAL_UNTASKED_ISSUE: "allow" }, runtimeConfig: { production: true } }), true);
  policyAssert.equal(resolveRawMaterialUntaskedIssueAllowed({ env: { ERP_RAW_MATERIAL_UNTASKED_ISSUE: "block" }, runtimeConfig: { production: false } }), false);
  policyAssert.throws(() => resolveRawMaterialUntaskedIssueAllowed({ env: { ERP_RAW_MATERIAL_UNTASKED_ISSUE: "maybe" } }), /allow or block/);
  policyAssert.doesNotThrow(() => assertRawMaterialUntaskedIssueAllowed({ rawMaterialUntaskedIssueAllowed: false }, "PT-1"));
  policyAssert.doesNotThrow(() => assertRawMaterialUntaskedIssueAllowed({ rawMaterialUntaskedIssueAllowed: true }, ""));
  policyAssert.throws(() => assertRawMaterialUntaskedIssueAllowed({ rawMaterialUntaskedIssueAllowed: false }, ""), (error) => error.code === "RAW_MATERIAL_ISSUE_TASK_REQUIRED" && error.statusCode === 409);
  const { readFileSync: readPolicySource } = await import("node:fs");
  policyAssert.match(readPolicySource(new URL("../server/rawMaterialTraceabilityActionService.mjs", import.meta.url), "utf8"), /assertRawMaterialUntaskedIssueAllowed\(workspace, productionTaskId\)/);
  policyAssert.match(readPolicySource(new URL("../src/features/raw-materials/RawMaterialScannerPage.jsx", import.meta.url), "utf8"), /rawMaterialUntaskedIssue\?\.allowed === false/);
}
