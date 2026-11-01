import assert from "node:assert/strict";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";
import { applyRawMaterialOcrReview } from "../server/rawMaterialInboundOcrSupport.mjs";
import { normalizeRawMaterialInbound } from "../server/rawMaterialInboundRecordService.mjs";
import { normalizeRawMaterialInbound as normalizeClient } from "../src/services/officeRawMaterialInboundNormalizer.js";
import { officeReviewSubmitBlocker } from "../src/domain/officeRawMaterialInboundFlow.js";
import { hasStrongRawMaterialSupplierReturnEvidence, hasAmbiguousRawMaterialSupplierReturnEvidence } from "../shared/rawMaterialSupplierReturn.js";

const header = ["品名", "颜色", "规格", "数量", "重量", "单价", "金额"];
const received = ["无纺布", "红色", "78*90*1500", "1", "100", "10", "1000"];
const returned = ["无纺布", "宝蓝", "78*90*1500", "1", "-20", "10", "-200"];
assert.equal(hasStrongRawMaterialSupplierReturnEvidence({ documentDirection: "supplier_delivery", ocrRawText: "原材料退货单", ocrLines: [{ values: { totalWeightKg: 68 } }] }), true, "legacy text title remains usable when line source text is missing");
function build(rows, direction = "supplier_delivery") {
  const source = { inboundId: "RMI-RETURN-EVIDENCE", supplierNameHint: "人意无纺布", knownSupplierNames: ["人意无纺布"], documentDirectionHint: direction,
    ocr: { tables: [{ cells: rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x }))) }] } };
  const snapshot = structuredClone(source);
  const draft = buildRawMaterialInboundDraftFromOcr(source);
  assert.deepEqual(source, snapshot, "raw source must not be modified");
  return draft;
}
for (const extra of [["备注", "退货请填写退货单编号"], ["上期布料欠款", "-200"], ["布料折扣", "-50"]]) {
  const draft = build([header, received, extra]);
  assert.equal(draft.documentDirection, "supplier_delivery");
  assert.equal(draft.totalWeightKg, 100);
  assert.equal(hasStrongRawMaterialSupplierReturnEvidence(draft), false);
  assert.equal(officeReviewSubmitBlocker(draft), "");
}
for (const direction of ["supplier_delivery", "supplier_return"]) {
  const draft = build([header, received, returned], direction);
  assert.equal(draft.documentDirection, direction, "mixed material evidence cannot silently choose a direction");
  for (const normalized of [draft, normalizeRawMaterialInbound(draft), normalizeClient(draft)]) {
    assert.equal(hasAmbiguousRawMaterialSupplierReturnEvidence(normalized), true);
    assert.match(officeReviewSubmitBlocker(normalized), /同时包含送货和退货/);
    const snapshot = structuredClone(normalized);
    assert.throws(() => applyRawMaterialOcrReview({ before: normalized }), e => e.code === "RAW_MATERIAL_DOCUMENT_DIRECTION_AMBIGUOUS");
    assert.deepEqual(normalized, snapshot, "blocked review must not mutate a draft");
  }
}
const automaticReturn = build([["人意原材料退货单"], header, received]);
assert.equal(automaticReturn.documentDirection, "supplier_return");
assert.equal(automaticReturn.documentCaptureDirection, "supplier_delivery");
assert.equal(automaticReturn.status, "已识别待复核");
assert.equal(automaticReturn.rolls.length, 0);
assert.equal(automaticReturn.totalWeightKg, -100);
assert.equal(automaticReturn.amount, -1000);
console.log("PASS actual parser/review/client evidence: notes and balances remain deliveries; mixed physical directions block review on both directions; clear return titles preserve capture and pending status.");
