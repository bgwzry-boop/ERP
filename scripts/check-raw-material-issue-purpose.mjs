import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RAW_MATERIAL_ISSUE_PURPOSES,
  buildRawMaterialIssuePurpose,
  listRawMaterialIssueTaskOptions,
} from "../src/domain/rawMaterialScanOutbound.js";

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

const page = readFileSync(new URL("../src/features/raw-materials/RawMaterialScannerPage.jsx", import.meta.url), "utf8");
assert.match(page, /startDriverPackageCameraScanner/, "workers scan the roll QR with the phone camera");
assert.match(page, /RAW_MATERIAL_ISSUE_PURPOSES\.map/, "workers choose 制袋 or 印刷");
assert.match(page, /!purposeKey/, "outbound needs a purpose");
assert.match(page, /productionTaskId,\n/, "the chosen production task is sent with the outbound");

console.log("raw-material issue purpose check passed: 制袋/印刷 purposes, optional order linking by machine, and camera scanning.");
