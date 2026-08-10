import assert from "node:assert/strict";

import { nextId } from "../src/domain/officeRules.js";
import { confirmDraftOrder } from "../src/state/officeOrderActions.js";
import { updateDraftRowsField } from "../src/state/officeDraftActions.js";

const sparseFulfillments = [
  { id: "F001" },
  { id: "F002" },
  { id: "F006" },
  { id: "F008" },
  { id: "F-LIVE-EXPORT-001" },
];

assert.equal(nextId("F", sparseFulfillments), "F009");
assert.equal(nextId("F", sparseFulfillments, 1), "F010");
assert.equal(
  nextId("ORD-P0-", [{ orderNo: "ORD-P0-002" }, { id: "ORD-P0-009-01", orderNo: "ORD-P0-009" }]),
  "ORD-P0-010",
);
assert.equal(nextId("F", 7), "F008");

const result = confirmDraftOrder({
  draftRows: [
    {
      id: "DRAFT-SPARSE-ID-01",
      customerId: "C001",
      customer: "张三服饰",
      product: "空白袋",
      size: "30*38*10",
      color: "红色",
      handle: "普通提",
      style: "空白袋",
      print: "否",
      qty: 10,
      fulfillment: "自提",
      latest: "明天",
      printSide: "非印刷",
      printColor: "非印刷",
      artworkStatus: "不需要",
      handleColor: "",
      note: "",
    },
  ],
  inventoryRecords: [
    {
      id: "30*38*10-红色-普通提-空白袋-A区",
      size: "30*38*10",
      color: "红色",
      handle: "普通提",
      style: "空白袋",
      state: "仓库已清点",
      inStock: 100,
      reserved: 0,
      locked: 0,
      pending: 0,
      estimated: false,
    },
  ],
  orderLines: [
    { id: "ORD-P0-002-01", orderNo: "ORD-P0-002" },
    { id: "ORD-P0-009-01", orderNo: "ORD-P0-009" },
  ],
  fulfillments: sparseFulfillments,
  customers: [{ id: "C001", name: "张三服饰" }],
});

assert.equal(result.blocked, false);
assert.equal(result.orderNo, "ORD-P0-010");
assert.equal(result.newLines[0].id, "ORD-P0-010-01");
assert.equal(result.newFulfillments[0].id, "F009");

const customPrintResult = confirmDraftOrder({
  draftRows: [{
    id: "DRAFT-CUSTOM-01",
    customerId: "C004",
    customer: "美的空调网店",
    product: "美的空调",
    size: "30*38*10",
    color: "白色",
    handle: "普通提",
    handleColor: "黑色",
    style: "空白袋",
    print: "是",
    printColor: "黑色",
    printSide: "单面",
    artworkStatus: "已上传",
    artworkAttachment: {
      attachmentId: "ATT-ARTWORK-001",
      fileName: "美的定稿.psd",
      mimeType: "application/octet-stream",
      fileSize: 12 * 1024 * 1024,
      status: "uploaded",
      version: 1,
    },
    qty: 12,
    fulfillment: "快递快运",
    latest: "明天",
    note: "",
  }],
  inventoryRecords: [],
  orderLines: [],
  fulfillments: [],
  customers: [{ id: "C004", name: "美的空调网店" }],
});
assert.equal(customPrintResult.blocked, false);
assert.equal(customPrintResult.newLines[0].status, "待排产");
assert.equal(customPrintResult.newLines[0].artworkAttachment.attachmentId, "ATT-ARTWORK-001");
assert.equal(customPrintResult.newFulfillments[0].lineId, customPrintResult.newLines[0].id);
assert.equal(customPrintResult.newFulfillments[0].status, "待排产");

const reviewedRows = updateDraftRowsField([{
  id: "DRAFT-REVIEW-01",
  size: "40*30*10",
  fieldReviews: [{
    reviewId: "MSG-REVIEW:size",
    field: "size",
    fieldLabel: "尺寸",
    originalValue: "40+30",
    suggestedValue: "40*30*10",
    reason: "疑似尺寸输入错误",
    status: "pending",
  }],
  dimensionEvidence: { original: "40+30", suggested: "40*30*10", requiresConfirmation: true },
}], {
  id: "DRAFT-REVIEW-01",
  field: "fieldReviewConfirmation",
  value: "MSG-REVIEW:size",
  customers: [],
  inventoryRecords: [],
});
assert.equal(reviewedRows[0].fieldReviews[0].status, "confirmed");
assert.equal(reviewedRows[0].fieldReviews[0].confirmationMethod, "accepted");
assert.equal(reviewedRows[0].dimensionEvidence.requiresConfirmation, false);

console.log("Office order action checks passed.");
