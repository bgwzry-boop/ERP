import assert from "node:assert/strict";
import { buildStatementDetail } from "../server/services/statementDetailProjectionService.mjs";
import { normalizeStatementDetail } from "../src/services/officeStatementSelectors.js";
import { getOfficePrintJob } from "../src/services/officePrintJobApiClient.js";
import { paymentReview, amountInCents, printAction } from "../docs/prototypes/raw-material-roll-inventory-review/src/finance-dialog-model.js";

const statement = { id: "ST-1", customerId: "C-1", receivable: 1000, received: 200, period: "2026-09", revision: 3, lineIds: ["LINE-1"] };
const workspace = {
  statements: [statement], customers: [{ id: "C-1", name: "测试客户", debt: 50 }],
  orderLines: [{ id: "LINE-1", product: "袋子", qty: 1000, amount: 1000 }],
  statementLines: [{ statementId: "ST-1", orderLineId: "LINE-1", deliveredQty: 900, chargeableQty: 900, amount: 900 }],
  paymentRecords: [{ paymentRecordId: "PAY-1", statementId: "ST-1", customerId: "C-1", amount: 200, attachmentIds: ["ATT-1", "ATT-FOREIGN"] }, { paymentRecordId: "PAY-WRONG", statementId: "ST-1", customerId: "C-2", amount: 999 }],
  attachments: [{ attachmentId: "ATT-1", ownerType: "statement", ownerId: "ST-1", purpose: "payment_screenshot", hasContent: true, status: "uploaded", url: "secret-url" }, { attachmentId: "ATT-FOREIGN", ownerType: "statement", ownerId: "ST-2", purpose: "payment_screenshot", hasContent: true }],
  statementSendRecords: [{ sendRecordId: "SEND-1", statementId: "ST-1", sentAt: "2026-10-01T00:00:00Z" }],
  statementConfirmationRecords: [{ confirmationRecordId: "CONF-FOREIGN", statementId: "ST-1", sendRecordId: "SEND-FOREIGN" }],
};
const noAttachment = buildStatementDetail(workspace, statement);
assert.deepEqual(noAttachment.attachments, []);
assert.deepEqual(noAttachment.payments[0].attachmentIds, []);
const detail = normalizeStatementDetail(buildStatementDetail(workspace, statement, { includeAttachments: true }));
assert.equal(detail.customerName, "测试客户");
assert.equal(detail.statementLines[0].deliveredQty, 900);
assert.equal(detail.lineSource, "persisted_statement");
assert.equal(detail.payments.length, 1);
assert.equal(detail.attachments[0].url, "");
assert.deepEqual(detail.payments[0].attachmentIds, ["ATT-1"]);
assert.equal(detail.confirmationRecords.length, 0);
assert.equal(detail.evidenceWarnings.mismatchedCustomerPaymentCount, 1);
assert.equal(detail.evidenceWarnings.unlinkedConfirmationCount, 1);
assert.deepEqual(paymentReview(statement, "500.25"), { amount: 500.25, previous: 200, difference: 300.25, unpaid: 499.75, overpaid: 0 });
for (const amount of ["0", "-1", "NaN", "1e4", "1.001", "9007199254740992"]) assert.throws(() => amountInCents(amount));
assert.equal(printAction({ jobStatus: "sent" }), "");
assert.equal(printAction({ jobStatus: "printed" }), "");
assert.equal(printAction({ jobStatus: "failed" }), "retry");
assert.equal(printAction({ jobStatus: "preview_only" }), "dispatch");
const mismatch = await getOfficePrintJob({ printJobId: "PJ-1" }, { fetchImpl: async () => new Response(JSON.stringify({ printJob: { printJobId: "PJ-OTHER" } })) });
assert.equal(mismatch.error.code, "PRINT_JOB_ID_MISMATCH");
const denied = await getOfficePrintJob({ printJobId: "PJ-1" }, { fetchImpl: async () => new Response(JSON.stringify({ code: "FORBIDDEN", message: "无权限" }), { status: 403 }) });
assert.equal(denied.blocked, true);
console.log("Finance dialog contracts passed: exact statement records, scoped attachments, cumulative money, print identity and allowed actions.");
