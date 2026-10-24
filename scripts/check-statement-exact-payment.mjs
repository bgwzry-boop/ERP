import assert from "node:assert/strict";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { exactPaymentFixture, exactPaymentBody } from "./helpers/statementExactPaymentFixture.mjs";
import { settleOfficeStatementExactPayment } from "../src/services/officeStatementExactPaymentApiClient.js";

const service = createApiSharedServiceRegistry().statementFinancialCommandService;
const run = (workspace, body = exactPaymentBody(), permissions = ["statement.exact_payment.settle"]) => service.settleExactPayment({ workspace,
  statementId: workspace.statements[0].id, body, operatorId: "U-OFFICE-A", actionPermissions: permissions });
const workspace = exactPaymentFixture();
const before = structuredClone({ payment: workspace.paymentRecords, confirmations: workspace.statementConfirmationRecords, attachments: workspace.attachments });
const result = await run(workspace);
assert.equal(result.response.writeOffRecord.recordedBy, "U-OFFICE-A");
assert.equal(result.response.writeOffRecord.businessDecisionId, "");
assert.equal(result.response.writeOffRecord.settlementKind, "office_exact_payment");
assert.equal(workspace.statements[0].revision, 2); assert.equal(workspace.statements[0].status, "已核销");
assert.equal(workspace.statements[0].received, 100); assert.equal(workspace.operationLogs.length, 1);
assert.deepEqual(await run(workspace), result, "Exact receipt replay survives the now-closed statement without rewriting it");
await assert.rejects(run(workspace, { ...exactPaymentBody(), matchNote: "changed" }), { code: "IDEMPOTENCY_KEY_REUSED" });
assert.deepEqual({ payment: workspace.paymentRecords, confirmations: workspace.statementConfirmationRecords, attachments: workspace.attachments }, before);
for (const [label, mutate, patch] of [
  ["underpayment", w => { w.statements[0].received = 90; w.statements[0].variance = 10; }],
  ["overpayment", w => { w.statements[0].received = 110; w.statements[0].variance = -10; }],
  ["unknown amount", w => { w.statements[0].received = null; }],
  ["unknown variance", w => { delete w.statements[0].variance; }],
  ["stale revision", () => {}, { expectedRevision: 2 }],
  ["forged current amount", () => {}, { expectedReceivable: 90 }],
  ["wrong customer", w => { w.paymentRecords[0].customerId = "OTHER"; }],
  ["old cumulative payment", w => { w.paymentRecords[0].amount = 90; }],
  ["no durable content", w => { w.attachments[0].hasContent = false; }],
  ["voided customer image", w => { w.attachments[1].status = "voided"; }],
  ["wrong owner", w => { w.attachments[0].ownerId = "OTHER"; }],
  ["one image for two purposes", () => {}, { customerAttachmentId: "ATT-EXACT-PAY" }],
  ["unlinked customer reply", w => { w.statementConfirmationRecords[0].sendRecordId = "OTHER"; }],
  ["closed period", w => { w.statements[0].status = "已结清"; }],
]) {
  const w = exactPaymentFixture(); mutate(w);
  const saved = JSON.stringify([w.statements, w.statementWriteOffRecords, w.operationLogs]);
  await assert.rejects(run(w, { ...exactPaymentBody(label), ...patch }), undefined, label);
  assert.equal(JSON.stringify([w.statements, w.statementWriteOffRecords, w.operationLogs]), saved, label);
}
assert.equal((await run(exactPaymentFixture(), exactPaymentBody(), ["statement.write_off"])).statusCode, 403, "General write-off cannot substitute for the restricted permission");
for (const json of [{}, { statementId: "OTHER", operationLogId: "LOG" }]) {
  const response = await settleOfficeStatementExactPayment({ statement: { id: "ST" }, ...exactPaymentBody() }, {
    fetchImpl: async () => new Response(JSON.stringify(json), { status: 200 }), serverRequired: true });
  assert.equal(response.blocked, true, "Incomplete/wrong-target 200 receipts never count as success");
}
console.log("PASS exact office settlement: two durable owned evidence classes, exact cumulative amounts, permission, closed/unknown/stale rejection, immutable retry and no accounting repricing.");
