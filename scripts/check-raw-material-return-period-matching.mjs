import assert from "node:assert/strict";
import { mergeReviewedSupplierReturnsIntoStatement as merge } from "../server/services/rawMaterialSupplierReturnReconciliationService.mjs";

const supplierName = "人意无纺布";
function returned(id, receivedAt, fields = {}) {
  return { id, supplierName, receivedAt, documentDirection: "supplier_return", status: "退货单已复核", totalWeightKg: -10, amount: -100, ...fields };
}
function statement(fields = {}) {
  return { supplierName, fileName: "supplier-2026-11.xlsx", rows: [{ id: "NOV-ROW", lineType: "return", supplierName, documentDate: "2026-11-02", totalWeightKg: -10, amount: -100 }], adjustments: [], summary: {}, ...fields };
}
const older = returned("OCT-RETURN", "2026-10-02");
const current = returned("NOV-RETURN", "2026-11-02");
const original = statement();
const snapshot = structuredClone(original);
const matched = merge(original, [older, current]);
assert.deepEqual(original, snapshot, "input statement must not be changed");
assert.equal(matched.rows[0].sourceReturnInboundId, current.id, "older no-number same-amount/weight return must not steal a current-period row");
assert.deepEqual(matched.addedSupplierReturnIds, []);
assert.equal(matched.adjustments.length, 0, "the Excel return and ERP return are one negative fact");
assert.equal(matched.summary.totalAmount, -100);

const oldSameNumber = returned("OCT-NUMBER", "2026-10-02", { deliveryNoteNo: "TH-1" });
const newSameNumber = returned("NOV-NUMBER", "2026-11-02", { deliveryNoteNo: "TH-1" });
const reusedNumber = merge(statement({ rows: [{ ...original.rows[0], documentNo: "TH-1" }] }), [oldSameNumber, newSameNumber]);
assert.equal(reusedNumber.rows[0].sourceReturnInboundId, newSameNumber.id, "a reused document number cannot bypass a known statement month");
assert.equal(reusedNumber.adjustments.length, 0);

const differentDay = returned("A-NOV-FIRST", "2026-11-01");
const sameMonth = merge(statement(), [differentDay, current]);
assert.equal(sameMonth.rows[0].sourceReturnInboundId, current.id, "same-month contradictory dates must not fuzzy-match by amount/weight");
assert.deepEqual(sameMonth.adjustments.map(item => item.sourceReturnInboundId), [differentDay.id], "the independent unmatched return remains a separate reviewed adjustment");

const alreadyLinked = statement({ rows: [{ ...original.rows[0], sourceReturnInboundId: current.id }] });
const twin = returned("AAA-TWIN", current.receivedAt);
const retained = merge(alreadyLinked, [twin, current]);
assert.equal(retained.rows[0].sourceReturnInboundId, current.id, "an existing source binding cannot be overwritten by an equal candidate");
assert.deepEqual(retained.adjustments.map(item => item.sourceReturnInboundId), [twin.id]);
const replayed = merge(retained, [twin, current]);
assert.equal(replayed.adjustments.length, 1, "re-merging the same Excel result must not append another ERP return");
assert.equal(replayed.rows[0].sourceReturnInboundId, current.id);
assert.deepEqual(replayed.addedSupplierReturnIds, []);

const mismatchedSupplier = statement({ rows: [{ ...original.rows[0], supplierName: "其他无纺布" }] });
const supplierGuard = merge(mismatchedSupplier, [current]);
assert.equal(supplierGuard.rows[0].sourceReturnInboundId, undefined, "known supplier disagreement must not match a row");
assert.deepEqual(supplierGuard.addedSupplierReturnIds, [current.id]);

const sameDayVariant = merge(statement({ rows: [{ ...original.rows[0], documentDate: "2026/11/2" }] }), [current]);
assert.equal(sameDayVariant.rows[0].sourceReturnInboundId, current.id, "equivalent written dates preserve matching");
assert.equal(sameDayVariant.adjustments.length, 0);
const differentTimestampDay = merge(statement({ rows: [{ ...original.rows[0], documentDate: "2026-11-03T12:00:00+08:00" }] }), [current]);
assert.equal(differentTimestampDay.rows[0].sourceReturnInboundId, undefined, "timestamp formatting cannot hide a known contradictory day");

const explicitId = merge(statement({ rows: [{ ...original.rows[0], matchedInboundId: current.id, documentDate: "2026-11-03" }] }), [current]);
assert.equal(explicitId.rows[0].sourceReturnInboundId, current.id, "an already exact ERP identity remains authoritative within the period");
const explicitSource = merge(statement({ rows: [{ ...original.rows[0], sourceReturnInboundId: current.id, matchedInboundId: "ORIGINAL-STOCK", documentDate: "2026-11-03" }] }), [current]);
assert.equal(explicitSource.adjustments.length, 0, "an explicit return source retains precedence over other matching metadata");
const explicitNumber = merge(statement({ rows: [{ ...original.rows[0], documentNo: "TH-NOV", documentDate: "2026-11-03" }] }), [returned("RET-NOV-ID", "2026-11-02", { deliveryNoteNo: "TH-NOV" })]);
assert.equal(explicitNumber.adjustments.length, 0, "an exact document number retains the prior explicit-identity matching policy");

console.log("PASS supplier return period matching: cross-month and contradictory-day fuzzy matches rejected; exact source/document ownership retained; same Excel return never adds a duplicate ERP adjustment.");
