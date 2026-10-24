import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";

const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 8 });
const client = createPostgresPoolClient({ pool: {
  query: (...args) => pool.query(...args),
  async connect() {
    const connection = await pool.connect();
    return { query: (...args) => connection.query(...args).catch(error => { if (/ERP_/u.test(error.message)) console.log("Observed SQL guard:", error.message); throw error; }), release: () => connection.release() };
  },
} });
const repository = createPostgresFulfillmentActionTransactionRepository({ postgresClient: client });
const reader = createPostgresCoreWorkspaceReadRepository({ postgresClient: client });
const service = createApiSharedServiceRegistry().fulfillmentActionCommandService;
async function workspace() { const w = await reader.loadState(); w.fulfillmentActionTransactionRepository = repository; return w; }
async function waitForBlock(blocker) {
  const pid = (await blocker.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  for (let i = 0; i < 150; i++) {
    if ((await pool.query("SELECT 1 FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))", [pid])).rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw Error("Expected an actual PostgreSQL lock wait");
}
async function stateCounts() {
  return (await pool.query("SELECT (SELECT count(*) FROM warehouse_outbound_executions)::int executions, (SELECT count(*) FROM operation_logs)::int logs, (SELECT count(*) FROM statement_lines)::int lines, (SELECT count(*) FROM inventory_ledger_entries)::int ledgers")).rows[0];
}
try {
  await pool.query("UPDATE fulfillment_records SET revision=1,status='待出库',physical_outbound_at=NULL,final_delivery_at=NULL,delivered_at=NULL,loaded_at=NULL,legacy_state_review_required=false WHERE id='F001'");
  await pool.query("INSERT INTO employees(id,biz_no,name,role_name) VALUES('EMP-R3-WAREHOUSE','R3-WH','合成库房','库房')");
  await pool.query("INSERT INTO print_records(id,biz_no,target_type,target_id,print_action,status,printed_by,printed_at) VALUES('PR-R3','PR-R3','fulfillment','F001','first_print','printed','U-OFFICE-A','2026-07-01T00:00:00Z')");
  await pool.query("INSERT INTO paper_outbound_documents(id,fulfillment_id,print_record_id,document_type,document_version,status,revision) VALUES('POD-R3','F001','PR-R3','outbound_note',1000,'待打印确认',1)");
  const w = await workspace();
  const body = { expectedRevision: 1, paperOutboundDocumentId: "POD-R3", paperDocumentVersion: 1000, paperDocumentRevision: 1,
    result: "已备货", physicalExecutorEmployeeId: "EMP-R3-WAREHOUSE", feedbackChannel: "当面", executedAt: "2026-07-01T01:00:00Z", idempotencyKey: "r3-prepare-before-paper" };
  const before = await stateCounts();
  const prepared = await service.recordWarehouseOutboundExecution({ workspace: w, fulfillmentId: "F001", body, operatorId: "U-WAREHOUSE-A" });
  assert.ok(prepared.response, JSON.stringify(prepared));
  const cold = await workspace(); const f = cold.fulfillments.find(row => row.id === "F001");
  assert.equal(f.status, "已备货"); assert.equal(f.physicalOutboundAt, "");
  assert.equal(cold.paperOutboundDocuments.find(row => (row.id ?? row.paperOutboundDocumentId) === "POD-R3").status, "待打印确认");
  const after = await stateCounts(); assert.equal(after.executions, before.executions + 1); assert.equal(after.ledgers, before.ledgers); assert.equal(after.lines, before.lines);
  const replay = await service.recordWarehouseOutboundExecution({ workspace: cold, fulfillmentId: "F001", body, operatorId: "U-WAREHOUSE-A" });
  assert.equal(replay.response.replayed, true); assert.deepEqual(await stateCounts(), after);
  // A printer voids the viewed paper while this request waits for its row lock.
  const blocker = await pool.connect(); let pending;
  try {
    await blocker.query("BEGIN"); await blocker.query("UPDATE print_records SET status='voided' WHERE id='PR-R3'");
    pending = service.recordWarehouseOutboundExecution({ workspace: cold, fulfillmentId: "F001", body: { ...body, expectedRevision: f.revision, idempotencyKey: "r3-prepare-print-race" }, operatorId: "U-WAREHOUSE-A" }).then(value => ({ value }), error => ({ error }));
    await waitForBlock(blocker); await blocker.query("COMMIT");
    const result = await pending; assert.ok(result.error, JSON.stringify(result));
    assert.deepEqual(await stateCounts(), after);
  } finally { await blocker.query("ROLLBACK"); blocker.release(); if (pending) await pending; }

  await pool.query("UPDATE print_records SET status='printed' WHERE id='PR-R3'");
  await pool.query("DELETE FROM statement_lines WHERE fulfillment_id='F001' OR order_line_id=(SELECT order_line_id FROM fulfillment_records WHERE id='F001')");
  await pool.query("INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by) SELECT 'PS-R3-CARRIER',order_line_id,'quantity_adjustment',9999,1,expected_qty,expected_qty,'U-OFFICE-A' FROM fulfillment_records WHERE id='F001'");
  await pool.query("UPDATE fulfillment_records SET status='待承运方拉走',physical_outbound_at='2026-07-31T12:00:00Z',physical_outbound_document_id='POD-R3',method='express_ltl',actual_qty=expected_qty WHERE id='F001'");
  const customer = (await pool.query("SELECT customer_id FROM fulfillment_records WHERE id='F001'")).rows[0].customer_id;
  await pool.query("INSERT INTO statements(id,biz_no,customer_id,period_start,period_end,status,revision) VALUES('ST-R3-JULY','ST-R3-JULY',$1,'2026-07-01','2026-07-31','待生成',1)", [customer]);
  let carrierWorkspace = await workspace();
  const carrierBody = { expectedRevision: carrierWorkspace.fulfillments.find(row => row.id === "F001").revision,
    confirmedFinalDelivery: true, actualHandoffAt: "2026-07-31T13:00:00Z", idempotencyKey: "r3-carrier-month-close" };
  // A concurrent close cannot be bypassed using a pre-close workspace snapshot.
  const closing = await pool.connect(); let carrierPending;
  const beforeCarrier = await stateCounts();
  try {
    await closing.query("BEGIN"); await closing.query("UPDATE statements SET status='已结清',revision=revision+1 WHERE id='ST-R3-JULY'");
    carrierPending = service.updateFulfillmentStatus({ workspace: carrierWorkspace, fulfillmentId: "F001", action: "确认已拉走", body: carrierBody, operatorId: "U-OFFICE-A" }).then(value => ({ value }), error => ({ error }));
    await waitForBlock(closing); await closing.query("COMMIT");
    const outcome = await carrierPending; assert.ok(outcome.error, JSON.stringify(outcome));
    assert.deepEqual(await stateCounts(), beforeCarrier);
    assert.equal((await pool.query("SELECT final_delivery_at FROM fulfillment_records WHERE id='F001'")).rows[0].final_delivery_at, null);
  } finally { await closing.query("ROLLBACK"); closing.release(); if (carrierPending) await carrierPending; }
  await pool.query("UPDATE statements SET status='待生成',revision=revision+1 WHERE id='ST-R3-JULY'");
  carrierWorkspace = await workspace();
  const delivered = await service.updateFulfillmentStatus({ workspace: carrierWorkspace, fulfillmentId: "F001", action: "确认已拉走", body: carrierBody, operatorId: "U-OFFICE-A" });
  assert.ok(delivered.response, JSON.stringify(delivered));
  const persisted = (await pool.query("SELECT final_delivery_at,delivered_at,confirmed_at FROM fulfillment_records WHERE id='F001'")).rows[0];
  assert.equal(persisted.final_delivery_at.toISOString(), "2026-07-31T13:00:00.000Z"); assert.equal(persisted.delivered_at.toISOString(), persisted.final_delivery_at.toISOString());
  assert.ok(persisted.confirmed_at > persisted.final_delivery_at);
  assert.equal((await pool.query("SELECT statement_id FROM statement_lines WHERE fulfillment_id='F001'")).rows[0].statement_id, "ST-R3-JULY");
  const afterCarrier = await stateCounts(); assert.equal(afterCarrier.ledgers, beforeCarrier.ledgers); assert.equal(afterCarrier.lines, beforeCarrier.lines + 1);
  const again = await service.updateFulfillmentStatus({ workspace: await workspace(), fulfillmentId: "F001", action: "确认已拉走", body: carrierBody, operatorId: "U-OFFICE-A" });
  assert.equal(again.response.replayed, true); assert.deepEqual(await stateCounts(), afterCarrier);
  console.log("PASS PostgreSQL cold-read preparation before paper, observed print-void/statement-close lock races roll back atomically, actual business time/confirmation time persist separately, July accounting and exact replay avoid a second stock movement.");
} finally { await pool.end(); await stopLivePostgres(runtime); }
