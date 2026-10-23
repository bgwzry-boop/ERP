import {createPostgresInventoryIntentTransactionRepository} from "../server/inventoryIntentTransactionRepository.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresRawMaterialSupplierStatementReviewRepository } from "../server/rawMaterialSupplierStatementReviewRepository.mjs";
const name = `erp-raw-concurrency-${process.pid}-${Date.now()}`;
const docker = (args) => { const result = spawnSync("docker", args, { encoding: "utf8" }); if (result.status !== 0) throw new Error(result.stderr || result.stdout); return result.stdout.trim(); };
let pool;
try {
  docker(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) {
    if (spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break;
    if (i === 59) throw new Error("isolated PostgreSQL startup timeout");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  pool = new pg.Pool({ host: "127.0.0.1", port: Number(docker(["port", name, "5432/tcp"]).split(":").at(-1)), database: "erp", user: "erp", password: "erp" });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  const postgresClient = createPostgresPoolClient({ pool });
  const repo = createPostgresRawMaterialSupplierStatementReviewRepository({ postgresClient });
  const workspace = { rawMaterialSupplierStatementReviews: [] };
  const base = { workspace, operatorId: "U-OFFICE-A", operatorName: "办公室", now: "2026-09-05T04:00:00.000Z" };
  const draft = await repo.createReviewDraft({ ...base, supplierName: "测试供应商", fileName: "test.xlsx", statementResult: { summary: { totalAmount: 100, rowCount: 1 }, rows: [{ id: "LINE-1", amount: 100, matchingStatus: "matched" }], adjustments: [] } });
  const draftWorkspace = structuredClone(workspace);
  const reviewId = draft.review.reviewId;
  assert.equal(draft.review.revision, 1);
  const reviewed = await repo.confirmReview({ ...base, reviewId, decision: "一致" });
  assert.equal(reviewed.review.revision, 2);
  await repo.confirmStatement({ ...base, reviewId });
  const payable = await repo.generatePayableDraft({ ...base, reviewId });
  assert.equal(payable.review.revision, 4);
  const paymentInputs = ["BANK-A", "BANK-B"].map((paymentReferenceNo) => ({ ...base, workspace: structuredClone(workspace), reviewId, paidAmount: 100, paymentReferenceNo }));
  const payments = await Promise.allSettled(paymentInputs.map((input) => repo.confirmPayment(input)));
  assert.equal(payments.filter((item) => item.status === "fulfilled").length, 1);
  const rejectedPayment = payments.find((item) => item.status === "rejected").reason;
  assert.equal(rejectedPayment.statusCode, 409);
  assert.equal(rejectedPayment.code, "RAW_MATERIAL_SUPPLIER_REVIEW_CONFLICT");
  const winner = payments.find((item) => item.status === "fulfilled").value.review;
  const persisted = (await pool.query("SELECT payload_json FROM raw_material_supplier_statement_reviews WHERE id=$1", [reviewId])).rows[0].payload_json;
  assert.equal(persisted.revision, 5);
  assert.equal(persisted.supplierPaymentRecord.paymentReferenceNo, winner.supplierPaymentRecord.paymentReferenceNo);
  await assert.rejects(repo.confirmReview({ ...base, workspace: draftWorkspace, reviewId, decision: "一致" }), (error) => error.statusCode === 409);
  await assert.rejects(repo.confirmReview({ ...base, workspace: { rawMaterialSupplierStatementReviews: [persisted] }, reviewId, decision: "一致" }), (error) => error.statusCode === 409);
  const afterRejected = (await pool.query("SELECT payload_json FROM raw_material_supplier_statement_reviews WHERE id=$1", [reviewId])).rows[0].payload_json;
  assert.deepEqual(afterRejected, persisted);
  const paymentLogs = (await pool.query("SELECT count(*)::int count FROM operation_logs WHERE target_id=$1 AND action='confirm_raw_material_supplier_payment'", [reviewId])).rows[0].count;
  assert.equal(paymentLogs, 1, "losing payment must not leave a second financial audit event");

  const creditCases = [];
  for (const suffix of ["A", "B"]) {
    const creditWorkspace = { rawMaterialSupplierStatementReviews: [], rawMaterialInbounds: [{ id: "CREDIT-SHARED", supplierName: "same supplier", documentDirection: "supplier_return", status: "退货单已复核", receivedAt: "2026-09-01", amount: -10, totalWeightKg: -1, rollCount: -1 }] };
    const creditDraft = await repo.createReviewDraft({ ...base, workspace: creditWorkspace, supplierName: "same supplier", fileName: `2026-09-credit-${suffix}.xlsx`, statementResult: { summary: { totalAmount: 90 }, rows: [], adjustments: [], linkedSupplierReturnIds: ["CREDIT-SHARED"] } });
    await repo.confirmReview({ ...base, workspace: creditWorkspace, reviewId: creditDraft.review.reviewId, decision: "一致" });
    assert.ok(creditWorkspace.rawMaterialSupplierStatementReviews[0].addedSupplierReturnIds.includes("CREDIT-SHARED"));
    creditCases.push({ ...base, workspace: creditWorkspace, reviewId: creditDraft.review.reviewId });
  }
  const creditResults = await Promise.allSettled(creditCases.map((input) => repo.confirmStatement(input)));
  assert.equal(creditResults.filter((item) => item.status === "fulfilled").length, 1, "same supplier return cannot be deducted by two distinct reviews");
  assert.equal(creditResults.find((item) => item.status === "rejected").reason.statusCode, 409);
  const creditClaimCount = (await pool.query("SELECT count(*)::int count FROM raw_material_supplier_statement_reviews WHERE payload_json->'addedSupplierReturnIds' ? 'CREDIT-SHARED' AND COALESCE(payload_json->>'statementConfirmationId','') <> ''")).rows[0].count;
  assert.equal(creditClaimCount, 1);
  const losingCreditIndex = creditResults.findIndex((item) => item.status === "rejected");
  await assert.rejects(repo.confirmStatement(creditCases[losingCreditIndex]), (error) => error.statusCode === 409);
  const losingCredit = (await pool.query("SELECT payload_json FROM raw_material_supplier_statement_reviews WHERE id=$1", [creditCases[losingCreditIndex].reviewId])).rows[0].payload_json;
  assert.equal(losingCredit.revision, 2);
  assert.equal(losingCredit.reviewStatus, "reviewed");


  await pool.query("INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,trust_level) VALUES('INV-EXPIRY','INV-EXPIRY','30*38*10','SC-WHITE','普通提','空白袋','EXPIRE','仓库已清点',100,3,'已清点')");
  await pool.query("INSERT INTO inventory_intents(id,source_draft_id,source_message_id,intent_type,intent_status,customer_id,related_reservation_id) SELECT 'INT-EXPIRY',id,'MSG-EXPIRY','temporary_hold','临时留货-生效','C001','HOLD-EXPIRY' FROM order_drafts LIMIT 1");
  await pool.query("INSERT INTO inventory_reservations(id,inventory_item_id,source_intent_id,customer_id,reserved_qty,reservation_type,status,expires_at) VALUES('HOLD-EXPIRY','INV-EXPIRY','INT-EXPIRY','C001',3,'临时留货','生效','2026-09-07T00:00:00Z')");
  const holdRepo=createPostgresInventoryIntentTransactionRepository({postgresClient});
  const expiryInput={workspace:{},intentId:'INT-EXPIRY',reservationId:'HOLD-EXPIRY',inventoryItemId:'INV-EXPIRY',expectedRevision:1,targetStatus:'已过期',updatedAt:'2026-09-06T00:00:00Z',idempotencyKey:'expiry-future',idempotencyPayload:{test:'future'},operationLog:{id:'LOG-EXPIRY-FUTURE',targetType:'inventory_intent',targetId:'INT-EXPIRY',action:'expire',operatorId:'U-OFFICE-A',occurredAt:'2026-09-06T00:00:00Z'},inventoryLedgerEntry:{ledgerId:'LEDGER-EXPIRY-FUTURE',inventoryItemId:'INV-EXPIRY',changeType:'临时留货到期释放',qtyBefore:3,qtyChange:-3,qtyAfter:0,sourceType:'inventory_temporary_hold_expiry',sourceId:'HOLD-EXPIRY',operatorId:'U-OFFICE-A',occurredAt:'2026-09-06T00:00:00Z'}};
  await assert.rejects(holdRepo.releaseTemporaryHold(expiryInput),e=>e.statusCode===409);
  await pool.query("UPDATE inventory_reservations SET expires_at='2026-09-05T00:00:00Z' WHERE id='HOLD-EXPIRY'");
  const blocker=await pool.connect();let outcome;
  try{
    await blocker.query('BEGIN');const pid=(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    await blocker.query("UPDATE inventory_reservations SET expires_at='2026-09-07T00:00:00Z' WHERE id='HOLD-EXPIRY'");
    outcome=holdRepo.releaseTemporaryHold({...expiryInput,idempotencyKey:'expiry-wait',idempotencyPayload:{test:'wait'},operationLog:{...expiryInput.operationLog,id:'LOG-EXPIRY-WAIT'},inventoryLedgerEntry:{...expiryInput.inventoryLedgerEntry,ledgerId:'LEDGER-EXPIRY-WAIT'}}).then(value=>({value}),error=>({error}));
    let waiting=false;for(let i=0;i<100;i++){waiting=(await pool.query('SELECT pid FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))',[pid])).rowCount>0;if(waiting)break;await new Promise(r=>setTimeout(r,20));}assert.equal(waiting,true);
    await blocker.query('COMMIT');assert.equal((await outcome).error?.statusCode,409);
    assert.equal((await pool.query("SELECT reserved_qty FROM inventory_items WHERE id='INV-EXPIRY'")).rows[0].reserved_qty,3);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id IN ('LOG-EXPIRY-WAIT','LOG-EXPIRY-FUTURE')")).rows[0].n,0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM inventory_ledger_entries WHERE id IN ('LEDGER-EXPIRY-WAIT','LEDGER-EXPIRY-FUTURE')")).rows[0].n,0);
  }finally{await blocker.query('ROLLBACK');blocker.release();if(outcome)await outcome;}
  console.log('PASS actual PostgreSQL: one supplier payment/credit winner with immutable first evidence and stale review rollback; premature hold expiry and extension committed during observed row-lock wait preserve reservation, stock, ledger and audit.');
}finally{await pool?.end();spawnSync('docker',['rm','-f',name],{stdio:'ignore'});}
