import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresEarlyShipmentSplitRepository } from "../server/earlyShipmentSplitRepository.mjs";
import { createEarlyShipmentSplitService } from "../server/services/earlyShipmentSplitService.mjs";

// P2-03 on a database with every migration applied: the follow-up line, task, delivery record and
// prices are copied inside one transaction; a daily report committed while the split waits for the
// task lock makes the whole split roll back.
const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 6 });
const repository = createPostgresEarlyShipmentSplitRepository({ idempotentTransactionJson: createPostgresPoolClient({ pool }).idempotentTransactionJson });
let logSeq = 0;
const service = createEarlyShipmentSplitService({ buildOperationLog: (_w, input) => ({ id: `LOG-EARLY-${++logSeq}`, pageKey: "api", ...input }) });

async function fixture(key) {
  const line = `OL-EARLY-${key}`, task = `PT-EARLY-${key}`, ful = `F-EARLY-${key}`, price = `PS-EARLY-${key}`;
  await pool.query(`INSERT INTO order_lines (id, biz_no, order_id, customer_id, product_name, order_type, size, bag_color, handle_type, style, print_flag, print_color, original_qty, fulfillment_method, line_status, created_by)
    VALUES ($1, $1, 'ORD-0629-002', 'C002', '定制印刷袋', 'custom_print', '30*40*10', '白色', '加长提', '印刷袋', true, '红', 10000, '送货', '制袋中', 'U-OFFICE-A')`, [line]);
  await pool.query(`INSERT INTO production_tasks (id, biz_no, order_line_id, task_type, machine_id, planned_qty, task_status, published_schedule_id, created_by)
    VALUES ($1, $1, $2, '制袋', 'BAG-03', 10000, '跨日继续', $3, 'U-OFFICE-A')`, [task, line, `SCH-${key}`]);
  await pool.query(`INSERT INTO workshop_reports (id, production_task_id, order_line_id, process_type, machine_id, operator_id, qualified_qty, exception_qty, evidence_json)
    VALUES ($1, $2, $3, '制袋', 'BAG-03', 'U-OFFICE-A', 6000, 0, '{"reportKind":"daily_progress"}'::jsonb)`, [`WDP-${key}`, task, line]);
  await pool.query(`INSERT INTO fulfillment_records (id, biz_no, order_line_id, customer_id, customer_snapshot, method, expected_qty, status, created_by)
    VALUES ($1, $1, $2, 'C002', '{"name":"李四电商","address":"一厂"}'::jsonb, '送货', 10000, '待出库', 'U-OFFICE-A')`, [ful, line]);
  await pool.query(`INSERT INTO price_snapshots (id, order_line_id, snapshot_type, version_no, bag_price, print_price, other_fee, chargeable_qty, final_amount, created_by, created_at, source_evidence_json)
    VALUES ($1, $2, 'order_confirm', 1, 0.15, 0.09, 30, 10000, 2430, 'U-OFFICE-A', now() - interval '1 day', '{"tier":"10000+"}'::jsonb)`, [price, line]);
  const workspace = {
    orderLines: [{ id: line, orderLineId: line, bizNo: line, orderId: "ORD-0629-002", orderType: "custom_print", qty: 10000, originalQty: 10000, qtyBasis: "pieces", lineStatus: "制袋中", revision: 1 }],
    productionTasks: [{ id: task, productionTaskId: task, bizNo: task, orderLineId: line, taskType: "制袋", machineId: "BAG-03", plannedQty: 10000, taskStatus: "跨日继续", publishedScheduleId: `SCH-${key}`, revision: 1 }],
    workshopReports: [{ id: `WDP-${key}`, productionTaskId: task, orderLineId: line, qualifiedQty: 6000, evidence: { reportKind: "daily_progress" } }],
    fulfillments: [{ id: ful, fulfillmentId: ful, bizNo: ful, orderLineId: line, expectedQty: 10000, actualQty: null, status: "待出库", revision: 1 }],
    priceSnapshots: [{ id: price, priceSnapshotId: price, orderLineId: line, snapshotType: "order_confirm", versionNo: 1, chargeableQty: 10000, finalAmount: 2430, otherFee: 30, adjustmentAmount: 0, createdAt: new Date(Date.now() - 86400000).toISOString() }],
    packingTasks: [], packages: [], statementLines: [], inventoryReservations: [], operationLogs: [],
    productionPackingTransactionRepository: repository,
  };
  return { line, task, ful, workspace };
}

try {
  const a = await fixture("A");
  // The office marks "今天先发" first; the split uses the mark up and the follow-up task starts unmarked.
  const marked = await service.setEarlyShipmentRequest({ workspace: a.workspace, productionTaskId: a.task, body: { expectedRevision: 1, note: "客户快递 7 点来取", idempotencyKey: "early-mark-a-1" }, operatorId: "U-OFFICE-A" });
  assert.equal(marked.error, undefined, marked.message);
  assert.equal((await pool.query("SELECT early_ship_note, revision FROM production_tasks WHERE id = $1", [a.task])).rows[0].revision, 2);
  const done = await service.splitForEarlyShipment({ workspace: a.workspace, productionTaskId: a.task, body: { expectedRevision: 2, packageCount: 5, qtyPerPackage: 1000, idempotencyKey: "early-split-a-1" }, operatorId: "U-OFFICE-A" });
  assert.equal(done.error, undefined, done.message);
  const rest = `${a.line}-R1`;
  const lines = (await pool.query("SELECT id, original_qty, split_from_order_line_id, order_id, customer_id, print_color, line_status, revision FROM order_lines WHERE id = ANY($1) ORDER BY id", [[a.line, rest]])).rows;
  assert.deepEqual(lines.map((row) => [row.id, row.original_qty, row.split_from_order_line_id, row.order_id, row.print_color, row.line_status, row.revision]),
    [[a.line, 5000, null, "ORD-0629-002", "红", "制袋中", 2], [rest, 5000, a.line, "ORD-0629-002", "红", "制袋中", 1]]);
  const tasks = (await pool.query("SELECT id, order_line_id, planned_qty, task_status, machine_id, published_schedule_id FROM production_tasks WHERE order_line_id = ANY($1) ORDER BY id", [[a.line, rest]])).rows;
  assert.deepEqual(tasks.map((row) => [row.id, row.planned_qty, row.task_status, row.machine_id, row.published_schedule_id]),
    [[a.task, 5000, "待完工确认", "BAG-03", "SCH-A"], [`${a.task}-R1`, 5000, "跨日继续", "BAG-03", "SCH-A-R1"]]);
  // Packed 5 × 1000 of the 6000 made: the 1000 made but not packed carry over to the follow-up task.
  const carry = (await pool.query("SELECT qualified_qty, evidence_json FROM workshop_reports WHERE production_task_id = $1", [`${a.task}-R1`])).rows;
  assert.deepEqual(carry.map((row) => [row.qualified_qty, row.evidence_json.reportKind, row.evidence_json.carriedFromSplit]), [[1000, "daily_progress", true]]);
  const marks = (await pool.query("SELECT id, early_ship_requested_at IS NULL AS clear FROM production_tasks WHERE order_line_id = ANY($1) ORDER BY id", [[a.line, rest]])).rows;
  assert.deepEqual(marks.map((row) => row.clear), [true, true]);
  const fuls = (await pool.query("SELECT id, order_line_id, expected_qty, customer_snapshot->>'address' AS address FROM fulfillment_records WHERE order_line_id = ANY($1) ORDER BY id", [[a.line, rest]])).rows;
  assert.deepEqual(fuls.map((row) => [row.id, row.order_line_id, row.expected_qty, row.address]), [[a.ful, a.line, 5000, "一厂"], [`${a.ful}-R1`, rest, 5000, "一厂"]]);
  const prices = (await pool.query("SELECT order_line_id, snapshot_type, version_no, chargeable_qty, final_amount::float AS amount, bag_price::float AS bag, source_evidence_json FROM price_snapshots WHERE order_line_id = ANY($1) AND id LIKE '%SPLIT%' ORDER BY order_line_id", [[a.line, rest]])).rows;
  // The shortened line's price version follows every earlier snapshot of the line (the order confirmation is version 1).
  assert.deepEqual(prices.map((row) => [row.order_line_id, row.snapshot_type, row.version_no, row.chargeable_qty, row.amount, row.bag]),
    [[a.line, "quantity_adjustment", 2, 5000, 1230, 0.15], [rest, "early_shipment_split", 1, 5000, 1200, 0.15]]);
  assert.equal(prices[1].source_evidence_json.tier, "10000+", "the follow-up price keeps the original tier evidence");
  assert.equal(prices[1].source_evidence_json.earlyShipmentSplit.orderedQty, 10000);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE target_id = $1 AND action = 'split_order_line_for_early_shipment'", [a.line])).rows[0].n, 1);

  // A daily report lands while the split waits on the task row: nothing is written.
  const b = await fixture("B");
  const blocker = await pool.connect();
  let pending;
  try {
    // The worker's daily report holds the same task lock the split takes before its statement.
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [`production-task:${b.task}`]);
    await blocker.query(`INSERT INTO workshop_reports (id, production_task_id, order_line_id, process_type, machine_id, operator_id, qualified_qty, exception_qty, evidence_json)
      VALUES ('WDP-B-LATE', $1, $2, '制袋', 'BAG-03', 'U-OFFICE-A', 500, 0, '{"reportKind":"daily_progress"}'::jsonb)`, [b.task, b.line]);
    pending = service.splitForEarlyShipment({ workspace: b.workspace, productionTaskId: b.task, body: { officeAuthorized: true, expectedRevision: 1, idempotencyKey: "early-split-b-1" }, operatorId: "U-OFFICE-A" });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await blocker.query("COMMIT");
  } finally {
    blocker.release();
  }
  const lost = await pending;
  assert.equal(lost.code, "BUSINESS_WRITE_CONFLICT", JSON.stringify(lost));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM order_lines WHERE split_from_order_line_id = $1", [b.line])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT original_qty FROM order_lines WHERE id = $1", [b.line])).rows[0].original_qty, 10000);
  console.log("PASS early shipment split on migrated PostgreSQL: follow-up line/task/delivery/prices copied in one transaction; a late daily report rolls the split back.");
} finally {
  await pool.end();
  await stopLivePostgres(runtime);
}
