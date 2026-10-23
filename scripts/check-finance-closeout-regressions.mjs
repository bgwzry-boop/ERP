import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createStatementFinancialCommandService } from "../server/services/statementFinancialCommandService.mjs";
import { createLocalStatementPaymentTransactionRepository } from "../server/statementPaymentTransactionRepository.mjs";
import { createLocalStatementSendTransactionRepository } from "../server/statementSendTransactionRepository.mjs";
import { closedStatementPaymentStatuses } from "../shared/statementPaymentPolicy.js";
import { confirmStatementPayment, confirmStatementVariance, confirmStatementWriteOff, getStatementWriteOffBlocker, markStatementSent, recordStatementCustomerConfirmation } from "../src/state/officeStatementActions.js";
import { resolveFulfillmentPrintPricing } from "../server/services/fulfillmentPrintPricingService.mjs";
import { buildFulfillmentPrintTemplate } from "../src/domain/printTemplates.js";
import { allocateFulfillmentAmount } from "../shared/fulfillmentAmountAllocation.mjs";

const service = createStatementFinancialCommandService({
  businessDecisionEvidenceService: { prepareDecision() { throw new Error("closed period must not reach a new decision"); } },
  buildOperationLog: (_workspace, input) => ({ ...input, id: input.id ?? randomUUID() }),
  buildTodo: (_workspace, input) => ({ ...input, id: randomUUID() }),
  confirmStatementPayment, confirmStatementVariance, confirmStatementWriteOff, getStatementWriteOffBlocker,
  findStatement: (workspace, id) => workspace.statements.find(row => row.id === id),
  findAttachment: () => null, nextId: () => "REUSED-COUNT-BASED-ID",
});
const base = { id: "ST-TEST", customerId: "C-TEST", receivable: 100, received: 20, revision: 1, status: "差额待确认" };
function workspace(statement = base) { return { statements: [structuredClone(statement)], paymentRecords: [], todos: [], operationLogs: [], statementPaymentTransactionRepository: createLocalStatementPaymentTransactionRepository() }; }
for (const status of closedStatementPaymentStatuses) {
  const current = workspace({ ...base, status });
  for (const method of ["recordPayment", "handleVariance", "writeOffStatement"]) {
    const result = await service[method]({ workspace: current, statementId: base.id, operatorId: "U-FINANCE", body: { amount: 50, expectedRevision: 1 } });
    assert.equal(result.code, "STATEMENT_PAYMENT_PERIOD_CLOSED", `${status} cannot reopen through ${method}`);
  }
  assert.equal(markStatementSent(current.statements, base.id)[0].status, status);
  assert.equal(recordStatementCustomerConfirmation(current.statements, base.id)[0].status, status);
  assert.throws(() => current.statementPaymentTransactionRepository.recordStatementPayment({ workspace: current, statement: { ...base, received: 50 }, paymentRecord: { paymentRecordId: "PAY-FORGED", statementId: base.id, amount: 50 } }), /本期|作废/);
  assert.throws(() => createLocalStatementSendTransactionRepository().markStatementSent({ workspace: current, statement: { ...base, status: "已发送待回款" } }), /更新/);
  assert.equal(current.statements[0].status, status);
  assert.equal(current.paymentRecords.length, 0);
}
const current = workspace();
const request = { workspace: current, statementId: base.id, operatorId: "U-FINANCE", body: { amount: 50, expectedRevision: 1, idempotencyKey: "cumulative-50" } };
const payment = await service.recordPayment(request);
assert.equal(current.statements[0].received, 50, "the new cumulative value replaces 20, never adds another 50");
const replay = await service.recordPayment(request);
assert.deepEqual(replay.response, payment.response);
assert.equal(current.paymentRecords.length, 1);
await assert.rejects(service.recordPayment({ ...request, body: { ...request.body, amount: 60 } }), error => error.code === "IDEMPOTENCY_KEY_REUSED");
current.statements[0].status = "已核销";
assert.deepEqual((await service.recordPayment(request)).response, payment.response, "original saved request remains replayable after period close");
assert.equal(current.statements[0].status, "已核销");
const other = workspace({ ...base, id: "ST-OTHER" });
const second = await service.recordPayment({ ...request, workspace: other, statementId: "ST-OTHER" });
assert.notEqual(second.response.payment.paymentRecordId, payment.response.payment.paymentRecordId, "separate empty process snapshots cannot allocate the same payment identity");

const orderLine = { id: "OL-TEST", qty: 1000, amount: 109, print: "是" };
const fulfillment = { id: "F-TEST", orderLineId: orderLine.id, qty: 500, expectedQty: 500, method: "送货" };
const printWorkspace = { orderLines: [orderLine], priceSnapshots: [{ id: "PS-TEST", orderLineId: orderLine.id, versionNo: 1, chargeableQty: 1000, finalAmount: 109, createdAt: "2026-10-01T00:00:00Z" }], statementLines: [], statements: [], runtimeConfig: { production: true } };
const result = resolveFulfillmentPrintPricing({ workspace: printWorkspace, fulfillment, orderLine });
assert.equal(result.pricing.amount, 54.5, "half shipment allocates half of the confirmed total including discounts/fees");
const oldTemplate = buildFulfillmentPrintTemplate({ fulfillment, orderLine, documentType: "delivery_note", pricing: result.pricing });
assert.equal(oldTemplate.fields.totalAmountText, "¥54.5");
assert.equal(oldTemplate.fields.lineItems[0].unitPriceText, "¥0.109");
printWorkspace.statementLines.push({ id: "SL-TEST", orderLineId: orderLine.id, fulfillmentId: fulfillment.id, deliveredQty: 500, chargeableQty: 500, freeQty: 0, finalAmount: 54.5 });
printWorkspace.priceSnapshots[0].finalAmount = 120;
const reprint = resolveFulfillmentPrintPricing({ workspace: printWorkspace, fulfillment, orderLine });
assert.equal(reprint.pricing.amount, 54.5, "recorded shipment reprint preserves its original accounting amount after current price changes");
assert.equal(reprint.pricing.source, "recorded_statement");
assert.equal(oldTemplate.fields.pricingEvidence.amount, 54.5, "prior print payload is an independent immutable value");
assert.throws(() => resolveFulfillmentPrintPricing({ workspace: printWorkspace, fulfillment: { ...fulfillment, actualQty: 501 }, orderLine }), /原入账/);
assert.throws(() => resolveFulfillmentPrintPricing({ workspace: { ...printWorkspace, statementLines: [], priceSnapshots: [] }, fulfillment, orderLine }), /价格快照/);
const priorLines = [];
for (let index = 0; index < 3; index++) { const allocation = allocateFulfillmentAmount({ totalAmount: 10, totalChargeableQty: 3, chargeableQty: 1, priorLines }); priorLines.push({ fulfillmentId: `F-${index}`, chargeableQty: 1, finalAmount: allocation.amount }); }
assert.deepEqual(priorLines.map(row => row.finalAmount), [3.33, 3.34, 3.33]);
assert.equal(priorLines.reduce((sum, row) => sum + Math.round(row.finalAmount * 100), 0), 1000);
console.log("Finance closeout regressions passed: closed periods, cumulative payment replay and identity, partial-shipment money, recorded reprint snapshots and cent rounding.");
