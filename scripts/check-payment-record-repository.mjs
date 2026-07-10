import assert from "node:assert/strict";
import {
  buildInsertPaymentRecordSql,
  buildInsertPaymentRecordQuery,
  buildListPaymentRecordsSql,
  buildListPaymentRecordsQuery,
  createLocalPaymentRecordRepository,
  createPostgresPaymentRecordRepository,
} from "../server/paymentRecordRepository.mjs";

await checkLocalPaymentRecordRepository();
await checkPostgresPaymentRecordSqlBoundary();

console.log("Payment record repository check passed: local memory and PostgreSQL SQL boundaries are covered.");

async function checkLocalPaymentRecordRepository() {
  const repository = createLocalPaymentRecordRepository();
  const workspace = { paymentRecords: [] };
  const payment = buildPaymentRecord({ paymentRecordId: "PAY-LOCAL-001", statementId: "ST-LOCAL-001" });

  const saved = await repository.createPaymentRecord({ workspace, paymentRecord: payment });
  assert.equal(saved.paymentRecordId, payment.paymentRecordId);
  assert.equal(workspace.paymentRecords.length, 1);

  const listed = await repository.listPaymentRecords({ workspace, filters: { statementId: "ST-LOCAL-001" } });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].attachmentIds[0], "ATT-PAY-001");

  const missed = await repository.listPaymentRecords({ workspace, filters: { statementId: "ST-MISSING" } });
  assert.equal(missed.length, 0);
}

async function checkPostgresPaymentRecordSqlBoundary() {
  const calls = [];
  const payment = buildPaymentRecord({ paymentRecordId: "PAY-PG-001", statementId: "ST-PG-001" });
  const repository = createPostgresPaymentRecordRepository({
    queryJson(text, values) {
      calls.push({ text, values });
      if (text.includes("INSERT INTO payment_records")) return payment;
      if (text.includes("json_agg")) return [payment];
      throw new Error(`Unexpected PostgreSQL payment record SQL:\n${text}`);
    },
  });

  const workspace = { paymentRecords: [] };
  const saved = await repository.createPaymentRecord({ workspace, paymentRecord: payment });
  assert.equal(saved.paymentRecordId, "PAY-PG-001");
  assert.equal(saved.statementId, "ST-PG-001");
  assert.match(calls[0].text, /INSERT INTO payment_records/);
  assert.match(calls[0].text, /evidence_attachment_id/);
  assert.match(calls[0].text, /ON CONFLICT \(id\) DO UPDATE/);
  assert.equal(calls[0].text.includes(payment.paymentRecordId), false);
  assert.deepEqual(calls[0].values.slice(0, 4), ["PAY-PG-001", "PAY-PG-001", "ST-PG-001", "C001"]);

  const listed = await repository.listPaymentRecords({ filters: { statementId: "ST-PG-001", customerId: "C001" } });
  assert.equal(listed.length, 1);
  assert.match(calls[1].text, /WHERE statement_id = \$1/);
  assert.match(calls[1].text, /customer_id = \$2/);
  assert.deepEqual(calls[1].values, ["ST-PG-001", "C001"]);

  const insertSql = buildInsertPaymentRecordSql(payment);
  assert.match(insertSql, /registered_by/);
  assert.match(insertSql, /payment_at/);

  const listSql = buildListPaymentRecordsSql({ statementId: "ST-PG-001" });
  assert.match(listSql, /json_agg/);
  assert.match(listSql, /ORDER BY payment_at DESC/);

  const insertQuery = buildInsertPaymentRecordQuery(payment);
  assert.match(insertQuery.text, /\$1/);
  assert.equal(insertQuery.values.includes(payment.remark), true);
  const listQuery = buildListPaymentRecordsQuery({ statementId: "ST-PG-001" });
  assert.match(listQuery.text, /statement_id = \$1/);
  assert.deepEqual(listQuery.values, ["ST-PG-001"]);
}

function buildPaymentRecord(overrides = {}) {
  return {
    paymentRecordId: overrides.paymentRecordId,
    bizNo: overrides.paymentRecordId,
    statementId: overrides.statementId,
    customerId: "C001",
    amount: 273,
    paidAt: "2026-07-01T10:30:00.000Z",
    method: "wechat",
    status: "recorded",
    attachmentIds: ["ATT-PAY-001"],
    operatorId: "U-OFFICE-A",
    remark: "payment repository check",
  };
}
