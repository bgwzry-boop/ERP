import assert from "node:assert/strict";
import { createPostgresRawMaterialInboundRepository, createLocalRawMaterialInboundRepository } from "../server/rawMaterialInboundRepository.mjs";
import { buildRawMaterialRollListResponse } from "../server/services/rawMaterialRollReadProjectionService.mjs";
import { handleRawMaterialReadRoutes } from "../server/routes/rawMaterialReadRoutes.mjs";

const receipt = (id, width, rolls, extra = {}) => ({
  id, supplierName: "测试无纺布有限公司", deliveryNoteNo: `NOTE-${id}`, status: "已贴标入库/可用",
  receivedAt: "2026-09-01", unit: "卷", widthCm: width, gramWeightGsm: 78, location: "A区",
  rolls: rolls.map((roll) => ({ labelStatus: "已贴标/可用库存", inventoryStatus: "可用", weightKg: 10, factoryColor: "白色", ...roll })), ...extra,
});
// The smallest roll deliberately belongs to the oldest receipt beyond 200 receipts.
const databaseInbounds = Array.from({ length: 260 }, (_, index) => receipt(`I-${index}`, 100 + index, [{ id: `R-${index}` }]));
databaseInbounds.push(receipt("OLDEST", 5, [{ id: "R-MIN", weightKg: 2, factoryColor: "红色" }], { receivedAt: "2020-01-01" }));
databaseInbounds.push(receipt("MIXED", 0, [
  { id: "R-UNKNOWN", weightKg: 3 },
  { id: "R-70", widthCm: 70, weightKg: 4, factoryColor: "本白" },
  { id: "R-70-RED", widthCm: 70, weightKg: 6, factoryColor: "红色", location: "B区" },
  { id: "R-MACHINE", widthCm: 70, inventoryStatus: "机边领用", machineId: "M-1", weightKg: 8, remainingMachineSideWeightKg: 8 },
  { id: "R-LEFTOVER", widthCm: 70, inventoryStatus: "余料待复核", machineId: "M-1", weightKg: 8, leftoverWeightKg: 1 },
  { id: "R-SPLIT", widthCm: 70, weightKg: 2, leftoverReviewedWeightKg: 20 },
  { id: "R-CONSUMED", widthCm: 70, inventoryStatus: "已消耗", machineId: "M-1" },
  { id: "R-ISOLATED", widthCm: 70, inventoryStatus: "退厂隔离", machineId: "M-1" },
  { id: "R-UNLABELED", widthCm: 70, labelStatus: "待贴标核对" },
  { id: "R-ZERO", widthCm: 70, weightKg: 0 },
]));
databaseInbounds.push(receipt("DRAFT", 1, [{ id: "R-OCR", inventoryStatus: "可用" }], { status: "已识别待复核" }));
databaseInbounds.push(receipt("VOID", 1, [{ id: "R-VOID" }], { status: "已作废" }));
let queryCount = 0;
const repo = createPostgresRawMaterialInboundRepository({ queryJson: async (text, values) => {
  queryCount += 1;
  assert.match(text, /FROM raw_material_inbounds/);
  assert.doesNotMatch(text, /LIMIT|OFFSET/);
  assert.equal(values.includes("70"), false, "roll width must not become a receipt-level filter");
  return databaseInbounds;
} });
const staleWorkspace = { rawMaterialInbounds: [receipt("STALE", 1, [{ id: "STALE-ROLL" }])] };
const first = await repo.listRawMaterialRolls({ workspace: staleWorkspace, query: new URLSearchParams({ pageSize: "2" }) });
assert.equal(first.items[0].id, "R-MIN");
assert.equal(first.items.length, 2);
assert.equal(first.total, 267);
assert.equal(first.summary.available.count, 265);
assert.equal(first.summary.available.weight, 2617);
assert.deepEqual(first.summary.machineSide, { count: 1, weight: 8 });
assert.deepEqual(first.summary.review, { count: 1, weight: 1 });
assert.equal(first.widthOptions[1], "5cm 提手条");
assert.equal(first.widthOptions.at(-1), "宽幅待确认");
assert.equal(first.aggregateScope, "all_inventory");
const last = await repo.listRawMaterialRolls({ workspace: staleWorkspace, query: { page: 134, pageSize: 2 } });
assert.equal(last.items.at(-1).id, "R-UNKNOWN");
const seventy = await repo.listRawMaterialRolls({ query: { width: 70, status: "可用", pageSize: 1, page: 2 } });
assert.equal(seventy.total, 3);
assert.equal(seventy.items.length, 1);
assert.deepEqual(seventy.summary, first.summary, "summary is global, never page-scoped");
const distribution = first.distribution.find((group) => group.widthCm === 70);
assert.equal(distribution.countValue, 3);
assert.equal(distribution.weightValue, 12);
assert.equal(distribution.items.find((item) => item.color === "白色").weightValue, 6);
assert.equal(distribution.items.find((item) => item.color === "红色").weightValue, 6);
const red = await repo.listRawMaterialRolls({ query: { width: 70, color: "大红", location: "B区", keyword: "NOTE-MIXED" } });
assert.deepEqual(red.items.map((item) => item.id), ["R-70-RED"]);
assert.equal(red.items[0].sourceInbound.id, "MIXED");
assert.equal(red.items[0].sourceInbound.rolls.length, 10);
assert.equal(red.items[0].weightKg, 6);
const consumed = await repo.listRawMaterialRolls({ query: { keyword: "R-CONSUMED" } });
assert.equal(consumed.total, 0);
assert.equal(queryCount, 5);
assert.equal(staleWorkspace.rawMaterialInbounds[0].id, "STALE", "reads never replace runtime state");
const failed = createPostgresRawMaterialInboundRepository({ queryJson: async () => { throw new Error("database unavailable"); } });
await assert.rejects(failed.listRawMaterialRolls({ workspace: staleWorkspace }), /database unavailable/);
const local = createLocalRawMaterialInboundRepository();
assert.equal(local.listRawMaterialRolls({ workspace: staleWorkspace }).items[0].id, "STALE-ROLL");
assert.equal(buildRawMaterialRollListResponse(databaseInbounds, { page: -1, pageSize: Infinity }).pageSize, 50);
assert.equal(buildRawMaterialRollListResponse(databaseInbounds, { page: 0.2 }).page, 1);
assert.equal(buildRawMaterialRollListResponse(databaseInbounds, { page: 999 }).items.length, 0);
let response;
assert.equal(await handleRawMaterialReadRoutes({ url: new URL("http://erp.test/api/raw-material-rolls?width=70&pageSize=1"), workspace: { rawMaterialInboundRepository: repo }, sendJson: (_, code, result) => { response = { code, result }; } }), true);
assert.equal(response.code, 200);
assert.equal(response.result.total, 5);
assert.equal(response.result.items.length, 1);
console.log("Raw-material roll reads passed: complete database snapshot, global width pagination/filtering/aggregates, exact color/weight, draft isolation, and database failure closure.");
