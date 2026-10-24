import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { createPostgresPaymentRecordRepository } from "../server/paymentRecordRepository.mjs";
import { createPostgresAttachmentRepository } from "../server/attachmentRepository.mjs";
import { createPostgresStatementSettlementTransactionRepository } from "../server/statementSettlementTransactionRepository.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { exactPaymentBody } from "./helpers/statementExactPaymentFixture.mjs";

const runtime = await startLivePostgres(), pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 8 });
const client = createPostgresPoolClient({ pool }), core = createPostgresCoreWorkspaceReadRepository({ postgresClient: client });
const payments = createPostgresPaymentRecordRepository({ postgresClient: client }), attachments = createPostgresAttachmentRepository({ postgresClient: client });
const repository = createPostgresStatementSettlementTransactionRepository({ postgresClient: client });
const service = createApiSharedServiceRegistry().statementFinancialCommandService;
const statementId = "ST-0629-001", operatorId = "U-OFFICE-A";
const cold = async () => ({ ...await core.loadState(), ...await payments.loadState(), ...await attachments.loadState(), statementSettlementTransactionRepository: repository });
const run = (workspace, body) => service.settleExactPayment({ workspace, statementId, operatorId, body, actionPermissions: ["statement.exact_payment.settle"] });
const counts = async () => (await pool.query("SELECT (SELECT count(*) FROM statement_write_off_records WHERE statement_id=$1)::int receipts,(SELECT count(*) FROM operation_logs WHERE action='settle_statement_exact_payment')::int logs,(SELECT row_to_json(s) FROM statements s WHERE id=$1) AS statement", [statementId])).rows[0];
async function waitBlocked(connection) {
  const pid = (await connection.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  for (let attempt = 0; attempt < 150; attempt++) {
    if ((await pool.query("SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [pid])).rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw Error("Expected an observed database lock wait");
}
try {
  await pool.query("UPDATE statements SET status='待核销',receivable_amount=100,received_amount=100,variance_amount=0,revision=1 WHERE id=$1", [statementId]);
  await pool.query("INSERT INTO attachments(id,file_name,file_type,purpose,mime_type,has_content,uploaded_by,status) VALUES ('ATT-EXACT-PAY','合成到账.png','image','payment_screenshot','image/png',true,$1,'uploaded'),('ATT-EXACT-CUSTOMER','合成客户.png','image','statement_customer_confirmation','image/png',true,$1,'uploaded')", [operatorId]);
  await pool.query("INSERT INTO attachment_links(id,attachment_id,owner_type,owner_id,purpose) VALUES('LINK-EXACT-PAY','ATT-EXACT-PAY','statement',$1,'payment_screenshot'),('LINK-EXACT-CUSTOMER','ATT-EXACT-CUSTOMER','statement',$1,'statement_customer_confirmation')", [statementId]);
  await pool.query("INSERT INTO payment_records(id,biz_no,statement_id,customer_id,amount,payment_method,status,evidence_attachment_ids,registered_by) SELECT 'PAY-EXACT-SYNTHETIC','PAY-EXACT-SYNTHETIC',id,customer_id,100,'wechat','recorded','[\"ATT-EXACT-PAY\"]',$2 FROM statements WHERE id=$1", [statementId, operatorId]);
  await pool.query("INSERT INTO statement_send_records(id,statement_id,channel,sent_to,sent_by) VALUES('SEND-EXACT-SYNTHETIC',$1,'wechat','合成客户',$2)", [statementId, operatorId]);
  await pool.query("INSERT INTO statement_confirmation_records(id,statement_id,send_record_id,content,attachment_ids_json,recorded_by) VALUES('CONF-EXACT-SYNTHETIC',$1,'SEND-EXACT-SYNTHETIC','合成客户确认100元已付','[\"ATT-EXACT-CUSTOMER\"]',$2)", [statementId, operatorId]);
  let workspace = await cold();
  const blocker = await pool.connect(); let pending;
  try {
    await blocker.query("BEGIN"); await blocker.query("UPDATE statements SET received_amount=90,variance_amount=10,revision=2 WHERE id=$1", [statementId]);
    pending = run(workspace, exactPaymentBody("pg-exact-amount-race")).then(value => ({ value }), error => ({ error }));
    await waitBlocked(blocker); await blocker.query("COMMIT");
    assert.ok((await pending).error, "Amount/revision must be checked after waiting for the real statement lock");
    assert.equal((await counts()).receipts, 0); assert.equal((await counts()).logs, 0);
  } finally { await blocker.query("ROLLBACK"); blocker.release(); if (pending) await pending; }
  await pool.query("UPDATE statements SET received_amount=100,variance_amount=0 WHERE id=$1", [statementId]);
  workspace = await cold();
  const body = { ...exactPaymentBody("pg-exact-evidence-race"), expectedRevision: 2 };
  const evidenceBlocker = await pool.connect(); let evidencePending;
  try {
    await evidenceBlocker.query("BEGIN"); await evidenceBlocker.query("UPDATE attachments SET status='voided' WHERE id='ATT-EXACT-CUSTOMER'");
    evidencePending = run(workspace, body).then(value => ({ value }), error => ({ error }));
    await waitBlocked(evidenceBlocker); await evidenceBlocker.query("COMMIT");
    assert.ok((await evidencePending).error, "A previously viewed attachment void cannot bypass the locked evidence guard");
    assert.equal((await counts()).receipts, 0); assert.equal((await counts()).logs, 0);
  } finally { await evidenceBlocker.query("ROLLBACK"); evidenceBlocker.release(); if (evidencePending) await evidencePending; }
  await pool.query("UPDATE attachments SET status='uploaded' WHERE id='ATT-EXACT-CUSTOMER'");
  const collisionKey = "pg-exact-audit-collision", identity = createHash("sha256").update(JSON.stringify([statementId, operatorId, collisionKey])).digest("hex").slice(0, 32);
  await pool.query("INSERT INTO operation_logs(id,target_type,target_id,action,operator_id) VALUES($1,'statement',$2,'synthetic_existing_log',$3)", [`LOG-EXACT-${identity}`, statementId, operatorId]);
  const beforeCollision = await counts();
  await assert.rejects(run(await cold(), { ...body, idempotencyKey: collisionKey }));
  assert.deepEqual(await counts(), beforeCollision, "A late audit insert failure rolls back the statement and receipt together");
  const [first, second] = await Promise.all([cold(), cold()]);
  const race = await Promise.allSettled([run(first, { ...body, idempotencyKey: "pg-exact-winner-a" }), run(second, { ...body, idempotencyKey: "pg-exact-winner-b" })]);
  assert.equal(race.filter(item => item.status === "fulfilled").length, 1);
  const result = race.find(item => item.status === "fulfilled").value;
  const winningKey = race[0].status === "fulfilled" ? "pg-exact-winner-a" : "pg-exact-winner-b";
  const after = await counts(); assert.equal(after.receipts, 1); assert.equal(after.logs, 1);
  assert.equal(Number(after.statement.receivable_amount), 100); assert.equal(Number(after.statement.received_amount), 100);
  assert.equal(after.statement.revision, 3); assert.equal(after.statement.status, "已核销");
  assert.deepEqual(await run(await cold(), { ...body, idempotencyKey: winningKey }), result);
  assert.deepEqual(await counts(), after);
  const receipt = (await cold()).statementWriteOffRecords.find(row => row.statementId === statementId);
  assert.equal(receipt.settlementKind, "office_exact_payment"); assert.equal(receipt.receiptConfirmation.paymentAttachmentId, "ATT-EXACT-PAY");
  await assert.rejects(pool.query("INSERT INTO statement_write_off_records(id,statement_id,receivable_snapshot,received_snapshot,variance_snapshot,write_off_amount,handling_result,recorded_by,settlement_kind) VALUES('SYNTHETIC-BAD',$1,100,100,0,0,'invalid',$2,'office_exact_payment')", [statementId, operatorId]));
  console.log("PASS PostgreSQL exact settlement: current complete migration set, observed amount/evidence lock races, no allowance/price changes, late audit rollback, one concurrent winner, durable cold receipt and exact closed-period replay.");
} finally { await pool.end(); await stopLivePostgres(runtime); }
