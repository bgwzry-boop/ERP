import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceiptMaterialPresentation,
  buildReceiptRowPresentation,
  formatReceiptArrivalTime,
} from "../src/receipt-presentation.js";

test("receipt rows expose the six facts required for desktop scanning", () => {
  assert.deepEqual(buildReceiptRowPresentation({
    supplierName: "宁晋县隆胜无纺布有限公司",
    deliveryNoteNo: "XS-2026-07-04-104",
    receivedAt: "2026-07-04 10:35:42",
    rollCount: 9,
    totalWeightKg: 853.8,
    status: "已识别待复核",
  }), {
    supplierName: "宁晋县隆胜无纺布有限公司",
    ticketText: "XS-2026-07-04-104",
    arrivalTime: "2026-07-04 10:35",
    countLabel: "9卷",
    totalWeightLabel: "853.8kg",
    reviewStatus: "已识别待复核",
    duplicateText: "未发现重复",
    duplicateNeedsAttention: false,
  });
});

test("receipt rows stay truthful when ticket, time or weight is unconfirmed", () => {
  const presentation = buildReceiptRowPresentation({ materialCategory: "提手条", unit: "件", rollCount: 4, totalWeightKg: 0, status: "部分贴标" });
  assert.equal(presentation.ticketText, "供应商未提供单号");
  assert.equal(presentation.arrivalTime, "时间待确认");
  assert.equal(presentation.countLabel, "4件");
  assert.equal(presentation.totalWeightLabel, "待确认");
  assert.equal(formatReceiptArrivalTime("2026/07/04 09:20"), "2026-07-04 09:20");
  assert.equal(formatReceiptArrivalTime("2026-07-16T08:36:53.153Z"), "2026-07-16 16:36");
});

test("an unclassified OCR draft keeps its physical roll count despite a supplier piece unit", () => {
  const presentation = buildReceiptRowPresentation({ unit: "件", rollCount: 5, rolls: [{}, {}, {}, {}, {}] });
  assert.equal(presentation.countLabel, "5卷");
});

test("duplicate review remains separate from inbound review status", () => {
  const presentation = buildReceiptRowPresentation({
    status: "已识别待复核",
    duplicate: "发现 1 条相似候选",
    documentDirection: "supplier_return",
    rollCount: 1,
    totalWeightKg: -3.8,
  });
  assert.equal(presentation.reviewStatus, "已识别待复核");
  assert.equal(presentation.duplicateText, "发现 1 条相似候选");
  assert.equal(presentation.duplicateNeedsAttention, true);
  assert.equal(presentation.countLabel, "1件");
  assert.equal(presentation.totalWeightLabel, "-3.8kg");
});

test("receipt detail presents handle material as type and authoritative width", () => {
  assert.deepEqual(buildReceiptMaterialPresentation({
    materialCategory: "提手条",
    productName: "提手条",
    spec: "65克*5宽",
    widthCm: 5,
  }), {
    materialType: "把条",
    widthLabel: "5cm",
  });
  assert.deepEqual(buildReceiptMaterialPresentation({
    materialType: "无纺布",
    spec: "78*80*1300",
  }), {
    materialType: "无纺布",
    widthLabel: "80cm",
  });
});
