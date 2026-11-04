import assert from "node:assert/strict";
import { createLocalProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";
import { buildEarlyShipmentSplitQuery } from "../server/earlyShipmentSplitRepository.mjs";
import { createEarlyShipmentSplitService } from "../server/services/earlyShipmentSplitService.mjs";
import { buildEarlyShipmentRequestQuery } from "../server/earlyShipmentSplitRepository.mjs";
import { buildDeliveryBatchFamily, describeBatchProgress } from "../shared/deliveryBatches.js";
import { projectBagwinDeliveries } from "../server/miniapp/bagwinErpIntegrationService.mjs";

// 负责人 2026-11-04：定制单 1 万个当天没做完，做好的先发一部分，剩下的第二天做完再发。
// 办公室点「先发已做好的部分」：原明细改成已做好的数量、车间确认完工后照常打包出库；
// 剩下的拆成续做明细（同机台接着做），单价不变，两条金额加起来等于原金额。
const workspace = fixture();
let logSeq = 0;
const service = createEarlyShipmentSplitService({
  buildOperationLog: (_workspace, input) => ({ id: `LOG-${++logSeq}`, pageKey: "api", ...input }),
  now: () => new Date("2026-11-04T09:30:00.000Z"),
});
const split = (body = {}, productionTaskId = "PT-OL-1-BAG") => service.splitForEarlyShipment({
  workspace, productionTaskId, body: { expectedRevision: 3, idempotencyKey: "split-ol-1", ...body }, operatorId: "U-OFFICE-A",
});

// Guards: stale revision, nothing reported yet, already complete.
assert.equal((await split({ expectedRevision: 2 })).code, "BUSINESS_WRITE_CONFLICT");
const empty = fixture({ reports: [] });
assert.equal((await service.splitForEarlyShipment({ workspace: empty, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3 }, operatorId: "U-OFFICE-A" })).code, "EARLY_SHIPMENT_NOTHING_READY");
const full = fixture({ reports: [daily("WDP-1", 6000), daily("WDP-2", 4000)] });
assert.equal((await service.splitForEarlyShipment({ workspace: full, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3 }, operatorId: "U-OFFICE-A" })).code, "EARLY_SHIPMENT_TASK_BLOCKED");
const silk = fixture();
silk.productionTasks[1] = { ...silk.productionTasks[1], taskStatus: "丝印中", status: "丝印中" };
assert.equal((await service.splitForEarlyShipment({ workspace: silk, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3 }, operatorId: "U-OFFICE-A" })).code, "EARLY_SHIPMENT_OTHER_TASK_OPEN");
assert.equal((await service.splitForEarlyShipment({ workspace: silk, productionTaskId: "PT-OL-1", body: { expectedRevision: 2 }, operatorId: "U-OFFICE-A" })).code, "EARLY_SHIPMENT_STAGE_UNSUPPORTED", "silk-screen is printed in one go; only the last stage ships early");
const started = fixture();
started.fulfillments[0].physicalOutboundAt = "2026-11-04T08:00:00.000Z";
assert.equal((await service.splitForEarlyShipment({ workspace: started, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3 }, operatorId: "U-OFFICE-A" })).code, "EARLY_SHIPMENT_FULFILLMENT_STARTED");
const rolls = fixture();
rolls.orderLines[0] = { ...rolls.orderLines[0], qtyBasis: "incoming_rolls" };
assert.equal((await service.splitForEarlyShipment({ workspace: rolls, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3 }, operatorId: "U-OFFICE-A" })).code, "EARLY_SHIPMENT_QTY_BASIS_UNSUPPORTED");

// The split itself.
const result = await split({ reason: "客户今天先拉一部分" });
assert.equal(result.error, undefined, result.message);
assert.deepEqual([result.response.shippedNowQty, result.response.remainderQty], [6000, 4000]);
assert.equal(result.response.remainderOrderLineId, "OL-1-R1");
const line = workspace.orderLines.find((row) => row.id === "OL-1");
const rest = workspace.orderLines.find((row) => row.id === "OL-1-R1");
assert.deepEqual([line.qty, line.originalQty, line.revision], [6000, 6000, 2]);
assert.deepEqual([rest.qty, rest.splitFromOrderLineId, rest.orderId, rest.customerId, rest.printColor, rest.lineStatus], [4000, "OL-1", "ORD-1", "C1", "红", "制袋中"]);
const task = workspace.productionTasks.find((row) => row.productionTaskId === "PT-OL-1-BAG");
const restTask = workspace.productionTasks.find((row) => row.productionTaskId === "PT-OL-1-BAG-R1");
assert.deepEqual([task.plannedQty, task.taskStatus, task.revision], [6000, "待完工确认", 4], "the worker confirms the 6000 to start packing");
assert.deepEqual([restTask.orderLineId, restTask.plannedQty, restTask.taskStatus, restTask.machineId, restTask.taskType], ["OL-1-R1", 4000, "跨日继续", "BAG-01", "制袋"]);
assert.match(restTask.publishedScheduleId, /^SCH-1-R1$/, "the follow-up task stays on the same machine's published schedule");
const ful = workspace.fulfillments.find((row) => row.fulfillmentId === "F-OL-1");
const restFul = workspace.fulfillments.find((row) => row.fulfillmentId === "F-OL-1-R1");
assert.deepEqual([ful.expectedQty, restFul.expectedQty, restFul.orderLineId, restFul.customerSnapshot.address], [6000, 4000, "OL-1-R1", "李记一厂"]);
// Price: same unit price (0.15 + 0.09 per bag), amounts conserve the original 2400 + 30 other fee.
const linePrice = workspace.priceSnapshots.find((row) => row.priceSnapshotId === "PS-OL-1-SPLIT-1");
const restPrice = workspace.priceSnapshots.find((row) => row.priceSnapshotId === "PS-OL-1-R1-SPLIT");
assert.deepEqual([linePrice.snapshotType, linePrice.chargeableQty, linePrice.finalAmount, linePrice.bagPrice, linePrice.printPrice], ["quantity_adjustment", 6000, 1470, 0.15, 0.09]);
assert.deepEqual([restPrice.chargeableQty, restPrice.finalAmount, restPrice.bagPrice, restPrice.printPrice, restPrice.otherFee], [4000, 960, 0.15, 0.09, 0]);
assert.equal(linePrice.finalAmount + restPrice.finalAmount, 2430);
assert.equal(restPrice.sourceEvidence.earlyShipmentSplit.orderedQty, 10000, "the follow-up line remembers the order quantity its price tier came from");
assert.equal(workspace.operationLogs[0].action, "split_order_line_for_early_shipment");
assert.equal(workspace.operationLogs[0].reason, "客户今天先拉一部分");

// The same request replays; a second split of the now-confirming task is refused.
const replay = await workspace.productionPackingTransactionRepository.splitForEarlyShipment({
  workspace, plan: {}, operationLog: { id: "X" }, idempotencyKey: "split-ol-1",
  idempotencyPayload: { productionTaskId: "PT-OL-1-BAG", operatorId: "U-OFFICE-A", expectedRevision: 3, readyQty: 6000, reason: "客户今天先拉一部分" },
});
assert.equal(replay.remainderOrderLineId, "OL-1-R1");
assert.equal((await split({ expectedRevision: 4, idempotencyKey: "split-ol-1-again" })).code, "EARLY_SHIPMENT_TASK_BLOCKED");

// The follow-up line can itself ship early again the next day.
workspace.workshopReports.push({ ...daily("WDP-R1", 1500), productionTaskId: "PT-OL-1-BAG-R1", orderLineId: "OL-1-R1" });
const again = await service.splitForEarlyShipment({ workspace, productionTaskId: "PT-OL-1-BAG-R1", body: { expectedRevision: 1, idempotencyKey: "split-r1" }, operatorId: "U-OFFICE-A" });
assert.equal(again.error, undefined, again.message);
assert.equal(again.response.remainderOrderLineId, "OL-1-R1-R1");
assert.deepEqual([again.response.shippedNowQty, again.response.remainderQty], [1500, 2500]);

// A write that loses a race leaves nothing behind.
const raced = fixture();
const racedService = createEarlyShipmentSplitService({ buildOperationLog: (_w, input) => ({ id: "LOG-RACE", ...input }) });
const racedRepo = raced.productionPackingTransactionRepository;
raced.productionPackingTransactionRepository = { splitForEarlyShipment: (input) => { raced.workshopReports.push(daily("WDP-LATE", 100)); return racedRepo.splitForEarlyShipment(input); } };
const lost = await racedService.splitForEarlyShipment({ workspace: raced, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3, idempotencyKey: "split-race" }, operatorId: "U-OFFICE-A" });
assert.equal(lost.code, "BUSINESS_WRITE_CONFLICT");
assert.equal(raced.orderLines.length, 1);

// PostgreSQL statement carries the same guards and copies the rows inside one transaction.
const query = buildEarlyShipmentSplitQuery({
  plan: { orderLineId: "OL-1", productionTaskId: "PT-1", fulfillmentId: "F-1", priceSnapshotId: "PS-1", lineRevision: 1, taskRevision: 3, fulfillmentRevision: 1, plannedQty: 10000, readyQty: 6000, remainderQty: 4000, taskType: "制袋" },
  remainderLine: { id: "OL-1-R1", bizNo: "OL-1-R1" }, remainderTask: { id: "PT-1-R1", bizNo: "PT-1-R1", publishedScheduleId: "SCH-1-R1", taskStatus: "跨日继续" },
  remainderFulfillment: { id: "F-1-R1", bizNo: "F-1-R1" },
  linePrice: { priceSnapshotId: "PS-A", snapshotType: "quantity_adjustment", versionNo: 1, chargeableQty: 6000, finalAmount: 1470, otherFee: 30, adjustmentAmount: 0, overrideReason: "x", sourceEvidence: {} },
  remainderPrice: { priceSnapshotId: "PS-B", snapshotType: "early_shipment_split", versionNo: 1, chargeableQty: 4000, finalAmount: 960, otherFee: 0, adjustmentAmount: 0, overrideReason: "x", sourceEvidence: {} },
  operatorId: "U-OFFICE-A",
  operationLog: { id: "LOG-PG", targetType: "order_line", targetId: "OL-1", action: "split_order_line_for_early_shipment", operatorId: "U-OFFICE-A" },
});
for (const pattern of [/FOR UPDATE/, /evidence_json->>'reportKind' = 'daily_progress'/, /ERP_EARLY_SHIPMENT_FULFILLMENT_CONFLICT/, /jsonb_populate_record\(NULL::order_lines/, /'split_from_order_line_id'/, /NOT EXISTS \(SELECT 1 FROM statement_lines/]) {
  assert.match(query.text, pattern);
}
// ---- 今天先发（出多少发多少）: the office marks, the normal end-of-day report ships what is made.
{
  const ws = fixture({ reports: [daily("WDP-1", 3500)] });
  const completions = [];
  const flow = createEarlyShipmentSplitService({
    buildOperationLog: (_w, input) => ({ id: `LOG-F-${++logSeq}`, pageKey: "api", ...input }),
    now: () => new Date("2026-11-04T09:00:00.000Z"),
    completeProductionReport: async (input) => {
      completions.push(input);
      const task = ws.productionTasks.find((row) => row.productionTaskId === input.productionTaskId);
      assert.deepEqual([task.taskStatus, task.plannedQty], ["待完工确认", input.body.qualifiedQty], "completion sees the split already applied");
      return { response: { packingTaskId: `PKT-${task.orderLineId}` } };
    },
  });
  assert.equal(await flow.afterDailyProgress({ workspace: ws, productionTaskId: "PT-OL-1-BAG", operatorId: "U-W" }), null, "an unmarked task is untouched by the daily report");
  assert.equal((await flow.setEarlyShipmentRequest({ workspace: ws, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 2 }, operatorId: "U-OFFICE-A" })).code, "BUSINESS_WRITE_CONFLICT");
  const marked = await flow.setEarlyShipmentRequest({ workspace: ws, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3, note: "客户快递 7 点装车", idempotencyKey: "mark-task-1" }, operatorId: "U-OFFICE-A" });
  assert.equal(marked.error, undefined, marked.message);
  const markedTask = ws.productionTasks.find((row) => row.productionTaskId === "PT-OL-1-BAG");
  assert.deepEqual([Boolean(markedTask.earlyShipRequestedAt), markedTask.earlyShipNote, markedTask.revision], [true, "客户快递 7 点装车", 4]);
  // End of the day: the worker reports today's count as usual (3500 + 2730), the system ships 6230.
  ws.workshopReports.push(daily("WDP-2", 2730));
  const shipped = await flow.afterDailyProgress({ workspace: ws, productionTaskId: "PT-OL-1-BAG", operatorId: "U-W", idempotencyKey: "daily-2" });
  assert.equal(shipped.status, "split", shipped.message);
  assert.deepEqual([shipped.shippedNowQty, shipped.remainderQty, shipped.completion.status], [6230, 3770, "completed"]);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].body.idempotencyKey, "daily-2-early-complete");
  const restTask = ws.productionTasks.find((row) => row.productionTaskId === "PT-OL-1-BAG-R1");
  assert.equal(restTask.earlyShipRequestedAt, "", "the follow-up task is not marked; tomorrow is a normal day");
  assert.equal(ws.productionTasks.find((row) => row.productionTaskId === "PT-OL-1-BAG").earlyShipRequestedAt, "", "the mark is used up");
  assert.equal(ws.operationLogs[0].after.trigger, "车间下班报数后自动先发");
  // Mark → cancel works too.
  const ws2 = fixture();
  await flow.setEarlyShipmentRequest({ workspace: ws2, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 3 }, operatorId: "U-OFFICE-A" });
  const cancelled = await flow.setEarlyShipmentRequest({ workspace: ws2, productionTaskId: "PT-OL-1-BAG", body: { expectedRevision: 4, requested: false }, operatorId: "U-OFFICE-A" });
  assert.equal(cancelled.response.requested, false);
  assert.equal(ws2.productionTasks[0].earlyShipRequestedAt, "");
  const markSql = buildEarlyShipmentRequestQuery({ productionTaskId: "PT-1", expectedRevision: 3, requested: true, requestedAt: "2026-11-04T09:00:00.000Z", operatorId: "U-OFFICE-A", note: "x",
    operationLog: { id: "LOG-M", targetType: "production_task", targetId: "PT-1", action: "request_early_shipment", operatorId: "U-OFFICE-A" } });
  assert.match(markSql.text, /early_ship_requested_at = \$\d+::timestamptz/);

  // ---- The customer and the delivery note see one order shipped in batches.
  const firstFulfillment = ws.fulfillments.find((row) => row.fulfillmentId === "F-OL-1");
  assert.equal(describeBatchProgress(buildDeliveryBatchFamily(ws, "OL-1"), { fulfillmentId: "F-OL-1" }), "分批发货 第1批（共2批）：本次 6230 个 / 整单 10000 个 / 已发 0 个 / 待发 3770 个");
  Object.assign(firstFulfillment, { status: "已交付", actualQty: 6230, physicalOutboundAt: "2026-11-04T11:00:00.000Z" });
  ws.packages = [1, 2, 3].map((n) => ({ packageId: `PKG-${n}`, fulfillmentId: "F-OL-1", status: "已打印" }));
  // Next day the rest is split once more (2000 made), then the last 1770.
  ws.workshopReports.push({ ...daily("WDP-R1", 2000), productionTaskId: "PT-OL-1-BAG-R1", orderLineId: "OL-1-R1" });
  const second = await flow.splitForEarlyShipment({ workspace: ws, productionTaskId: "PT-OL-1-BAG-R1", body: { expectedRevision: 1, idempotencyKey: "split-day-2" }, operatorId: "U-OFFICE-A" });
  assert.equal(second.error, undefined, second.message);
  const family = buildDeliveryBatchFamily(ws, "OL-1-R1-R1");
  assert.deepEqual(family.batches.map((batch) => [batch.batchNo, batch.orderLineId, batch.qty, batch.shipped, batch.packageCount]),
    [[1, "OL-1", 6230, true, 3], [2, "OL-1-R1", 2000, false, 0], [3, "OL-1-R1-R1", 1770, false, 0]]);
  assert.deepEqual([family.orderedQty, family.shippedQty, family.pendingQty], [10000, 6230, 3770]);
  assert.equal(describeBatchProgress(family, { fulfillmentId: "F-OL-1-R1" }), "分批发货 第2批（共3批）：本次 2000 个 / 整单 10000 个 / 已发 6230 个 / 待发 1770 个");
  const deliveries = projectBagwinDeliveries({
    deliveryLines: ws.orderLines.map((line) => ({ orderLineId: line.id, splitFromOrderLineId: line.splitFromOrderLineId ?? null, qty: line.qty, lineStatus: line.lineStatus, productName: line.productName, size: "30*40", bagColor: "白", createdAt: line.createdAt ?? "2026-11-01T00:00:00.000Z" })),
    deliveryFulfillments: ws.fulfillments.map((row) => ({ fulfillmentId: row.fulfillmentId, orderLineId: row.orderLineId, status: row.status, expectedQty: row.expectedQty, actualQty: row.actualQty, physicalOutboundAt: row.physicalOutboundAt ?? null })),
    deliveryPackages: ws.packages,
  });
  assert.equal(deliveries.length, 1, "the customer sees one item, not three");
  assert.deepEqual([deliveries[0].productName, deliveries[0].orderedQty, deliveries[0].shippedQty, deliveries[0].pendingQty], ["无纺布袋", 10000, 6230, 3770]);
  assert.deepEqual(deliveries[0].batches.map((batch) => [batch.batchNo, batch.qty, batch.packageCount, batch.shipped]), [[1, 6230, 3, true], [2, 2000, 0, false], [3, 1770, 0, false]]);
  assert.equal(deliveries[0].batches[0].shippedAt, "2026-11-04T11:00:00.000Z");
}

console.log("Early shipment split: ready part stays on the line for completion, rest becomes a follow-up line on the same machine, price conserved, guarded.");

function fixture({ reports } = {}) {
  const ws = {
    orderLines: [{ id: "OL-1", orderLineId: "OL-1", bizNo: "OL-1", orderId: "ORD-1", customerId: "C1", product: "无纺布袋", productName: "无纺布袋", orderType: "custom_print", print: "是", printColor: "红", qty: 10000, originalQty: 10000, qtyBasis: "pieces", lineStatus: "制袋中", status: "制袋中", revision: 1 }],
    productionTasks: [
      { id: "PT-OL-1-BAG", productionTaskId: "PT-OL-1-BAG", bizNo: "PT-OL-1-BAG", orderLineId: "OL-1", taskType: "制袋", machineId: "BAG-01", plannedQty: 10000, taskStatus: "跨日继续", status: "跨日继续", publishedScheduleId: "SCH-1", revision: 3 },
      { id: "PT-OL-1", productionTaskId: "PT-OL-1", bizNo: "PT-OL-1", orderLineId: "OL-1", taskType: "丝印", machineId: "PRINT-01", plannedQty: 10000, taskStatus: "已完成", status: "已完成", publishedScheduleId: "SCH-0", revision: 2 },
    ],
    workshopReports: reports ?? [daily("WDP-1", 3500), daily("WDP-2", 2500)],
    fulfillments: [{ id: "F-OL-1", fulfillmentId: "F-OL-1", bizNo: "F-OL-1", orderLineId: "OL-1", lineId: "OL-1", customerId: "C1", method: "送货", expectedQty: 10000, qty: 10000, actualQty: null, status: "待出库", customerSnapshot: { address: "李记一厂" }, revision: 1 }],
    priceSnapshots: [{ id: "PS-OL-1", priceSnapshotId: "PS-OL-1", orderLineId: "OL-1", snapshotType: "order_confirm", versionNo: 1, bagPrice: 0.15, printPrice: 0.09, otherFee: 30, adjustmentAmount: 0, chargeableQty: 10000, finalAmount: 2430, createdAt: "2026-11-01T00:00:00.000Z", sourceEvidence: { tier: "≥10000" } }],
    packingTasks: [],
    packages: [],
    statementLines: [],
    inventoryReservations: [],
    operationLogs: [],
  };
  ws.productionPackingTransactionRepository = createLocalProductionPackingTransactionRepository();
  return ws;
}

function daily(reportId, qualifiedQty) {
  return { id: reportId, reportId, productionTaskId: "PT-OL-1-BAG", orderLineId: "OL-1", processType: "制袋", qualifiedQty, evidence: { reportKind: "daily_progress" } };
}
