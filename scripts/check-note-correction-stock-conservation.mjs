// #109 复查（2026-11-13）：连续改数量时库存守恒。库存不够时改大只能少扣，之后再改小只退回「实际净扣」的部分；
// 退回永远不超过这次交付实际净扣的数，整张作废退回净扣的全部。真实改单服务 + 本地提交，只用内存数据。
import assert from "node:assert/strict";
import { createFulfillmentNoteCorrectionService } from "../server/services/fulfillmentNoteCorrectionService.mjs";
import { buildNoteCorrectionQuery, createLocalNoteCorrectionMethods } from "../server/fulfillmentNoteCorrectionTransaction.mjs";

const w = {
  fulfillments: [{ id: "TEST-F", orderLineId: "TEST-L", customerId: "TEST-C", actualQty: 100, expectedQty: 100, status: "已提货", revision: 1, customerSnapshot: { name: "测试客户" } }],
  inventories: [{ id: "TEST-I", inStock: 0, onHandQty: 0, onHand: 0 }],
  inventoryLedgers: [{ id: "TEST-D", inventoryItemId: "TEST-I", qtyBefore: 100, qtyChange: -100, qtyAfter: 0, sourceType: "fulfillment_pickup", sourceId: "TEST-F" }],
  printRecords: [{ id: "TEST-P1", targetType: "fulfillment", targetId: "TEST-F", documentType: "pickup_note", status: "printed", createdAt: "2026-11-01T00:00:00Z", printedAt: "2026-11-01T00:00:00Z" }],
  paperOutboundDocuments: [],
  statements: [{ id: "TEST-S", status: "待生成", received: 0, receivable: 100, variance: 100, revision: 1, lineIds: ["TEST-L"] }],
  statementLines: [{ id: "TEST-SL", statementId: "TEST-S", orderLineId: "TEST-L", fulfillmentId: "TEST-F", deliveredQty: 100, chargeableQty: 100, freeQty: 0, amount: 100, adjustmentAmount: 0, finalAmount: 100, revision: 1 }],
  priceSnapshots: [{ id: "TEST-PS", orderLineId: "TEST-L", snapshotType: "confirmation", bagPrice: 1, printPrice: 0, chargeableQty: 100, finalAmount: 100, versionNo: 1, createdAt: "2026-11-01T00:00:00Z" }],
  operationLogs: [], statementSendRecords: [],
};
w.fulfillmentActionTransactionRepository = createLocalNoteCorrectionMethods();
let tick = 0;
const svc = createFulfillmentNoteCorrectionService({ findInventoryItem: (state, id) => state.inventories.find((item) => item.id === id), now: () => new Date(Date.UTC(2026, 10, 13, 0, 0, ++tick)) });
const stock = () => w.inventories[0].inStock;
const net = () => -w.inventoryLedgers.filter((row) => row.sourceId === "TEST-F").reduce((sum, row) => sum + row.qtyChange, 0) || 0;
let printNo = 1;
const reprint = () => { printNo += 1; w.printRecords.push({ id: `TEST-P${printNo}`, targetType: "fulfillment", targetId: "TEST-F", documentType: "pickup_note", status: "reprinted", createdAt: `2026-11-13T0${printNo}:00:00Z`, printedAt: `2026-11-13T0${printNo}:00:00Z` }); };
const correct = (body, key) => svc.correctFulfillmentNote({ workspace: w, fulfillmentId: "TEST-F", operatorId: "TEST-OP", body: { expectedRevision: w.fulfillments[0].revision, reason: "测试", idempotencyKey: key, ...body } });

// 100 → 200：库存 0，补扣不到，提示少扣 100
const first = await correct({ correctedQty: 200 }, "conserve-up-200");
assert.equal(first.statusCode, 200, JSON.stringify(first));
assert.ok(first.response.changes.some((text) => text.includes("少扣了 100")));
assert.equal(stock(), 0); assert.equal(net(), 100);

// 200 → 50：只退 100 - 50 = 50（原来会退 150）
reprint();
const plan = svc.planFulfillmentNoteCorrection({ workspace: w, fulfillmentId: "TEST-F", operatorId: "TEST-OP", body: { expectedRevision: w.fulfillments[0].revision, correctedQty: 50, reason: "测试", idempotencyKey: "conserve-down-50" } });
assert.equal(plan.plan.inventoryAdjustments[0].onHandQtyChange, 50);
assert.equal(plan.plan.inventoryAdjustments[0].expectedNetDeducted, 100);
const query = buildNoteCorrectionQuery(plan.plan);
assert.match(query.text, /item_net_deducted/u, "数据库事务里现算净扣并校验");
assert.match(query.text, /net\.net - locked_items\.change < 0/u, "退回不能超过净扣");
const second = await correct({ correctedQty: 50 }, "conserve-down-50");
assert.equal(second.statusCode, 200, JSON.stringify(second));
assert.equal(stock(), 50); assert.equal(net(), 50, "净扣等于交付数量");

// 本地提交也拦：页面读到的净扣和流水对不上就拒绝
reprint();
const stalePlan = svc.planFulfillmentNoteCorrection({ workspace: w, fulfillmentId: "TEST-F", operatorId: "TEST-OP", body: { expectedRevision: w.fulfillments[0].revision, correctedQty: 10, reason: "测试", idempotencyKey: "conserve-stale-1" } });
w.inventoryLedgers.push({ id: "TEST-X", inventoryItemId: "TEST-I", qtyChange: 30, sourceType: "fulfillment_note_correction_return", sourceId: "TEST-F" });
await assert.rejects(w.fulfillmentActionTransactionRepository.recordNoteCorrection({ workspace: w, plan: stalePlan.plan }), { code: "NOTE_CORRECTION_CHANGED" });
w.inventoryLedgers.pop();

// 50 → 80：库存有 50，补扣 30
const up = await correct({ correctedQty: 80 }, "conserve-up-80");
assert.equal(up.statusCode, 200, JSON.stringify(up));
assert.equal(stock(), 20); assert.equal(net(), 80);

// 整张作废：退回净扣的 80
reprint();
const voided = await correct({ voidWhole: true }, "conserve-void-1");
assert.equal(voided.statusCode, 200, JSON.stringify(voided));
assert.equal(stock(), 100); assert.equal(net(), 0);
console.log("note correction stock conservation ok: 库存不够少扣后再改小只退实际净扣、补扣按差额、净扣过期拒绝、整张作废退回净扣全部");
