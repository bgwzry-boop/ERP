import test from "node:test";
import assert from "node:assert/strict";
import { getReceiptSourcePages, resolveRollSourceEvidence } from "../src/receipt-source.js";

test("source pages retain ordering and missing audit attachments", () => {
  assert.deepEqual(getReceiptSourcePages({ sourceAttachmentIds: ["A", "", "C"], ocrPages: [{}, {}, {}] }), [
    { index: 0, attachmentId: "A" }, { index: 1, attachmentId: "" }, { index: 2, attachmentId: "C" },
  ]);
  assert.deepEqual(getReceiptSourcePages({ sourceAttachmentId: "ONE" }), [{ index: 0, attachmentId: "ONE" }]);
  assert.deepEqual(getReceiptSourcePages({}), []);
});

test("roll evidence follows the saved OCR line instead of list position", () => {
  const inbound = { deliveryNoteNo: "DN-REAL", ocrLines: [
    { lineId: "L1", sourcePageIndex: 0, sourceRowIndex: 3 },
    { lineId: "L2", sourcePageIndex: 1, sourceRowIndex: 6, sourceText: "票面原文" },
  ] };
  assert.deepEqual(resolveRollSourceEvidence(inbound, { ocrLineId: "L2", sourceLineRollIndex: 2 }), {
    deliveryNoteNo: "DN-REAL", lineId: "L2", pageIndex: 1, rowIndex: 6, rollIndex: 2, sourceText: "票面原文",
  });
  assert.equal(resolveRollSourceEvidence(inbound, { ocrLineId: "L1", sourceLineRollIndex: 0 }).rollIndex, 0);
});

test("missing trace indices remain unknown and never become the first row or roll", () => {
  assert.deepEqual(resolveRollSourceEvidence({}, {}), {
    deliveryNoteNo: "", lineId: "", pageIndex: null, rowIndex: null, rollIndex: null, sourceText: "",
  });
});
