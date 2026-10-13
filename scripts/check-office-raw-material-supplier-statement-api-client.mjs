import assert from "node:assert/strict";
import {
  confirmOfficeRawMaterialSupplierPayment,
  confirmOfficeRawMaterialSupplierStatement,
  confirmOfficeRawMaterialSupplierStatementReview,
  createOfficeRawMaterialSupplierStatementReviewDraft,
  generateOfficeRawMaterialSupplierPayableDraft,
  listOfficeRawMaterialSupplierStatementReviews,
} from "../src/services/officeRawMaterialSupplierStatementApiClient.js";

const authState = { session: { accessToken: "runtime-token" } };

function createRequestHarness(json, status = 200) {
  const calls = [];
  return {
    calls,
    options: {
      apiBaseUrl: "http://erp.test/api",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(json), {
          status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
}

{
  const harness = createRequestHarness({
    items: [{
      reviewId: " RMSR-1 ",
      supplierName: " 北陈无纺布 ",
      supplierPayableDraft: { supplierPayableId: " PAY-1 ", payableAmount: "125.5" },
    }],
    page: "2",
    pageSize: "10",
    total: "11",
    metrics: { pendingCount: 1 },
  });
  const result = await listOfficeRawMaterialSupplierStatementReviews({
    authState,
    operatorId: "U-FINANCE-A",
    page: 2,
    pageSize: 10,
    filters: { keyword: " 北陈 ", status: "待复核" },
  }, harness.options);
  assert.equal(result.source, "api");
  assert.equal(result.items[0].reviewId, "RMSR-1");
  assert.equal(result.items[0].supplierName, "北陈无纺布");
  assert.equal(result.items[0].supplierPayableDraft.payableAmount, 125.5);
  assert.equal(result.total, 11);
  assert.match(harness.calls[0].url, /page=2/);
  assert.match(harness.calls[0].url, /pageSize=10/);
  assert.match(harness.calls[0].url, /keyword=%E5%8C%97%E9%99%88/);
  assert.match(harness.calls[0].url, /status=%E5%BE%85%E5%A4%8D%E6%A0%B8/);
}

{
  let requested = false;
  const result = await createOfficeRawMaterialSupplierStatementReviewDraft({
    authState,
    operatorId: "U-FINANCE-A",
  }, {
    fetchImpl: async () => {
      requested = true;
      throw new Error("should not request");
    },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.error.code, "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_INVALID");
  assert.equal(requested, false);
}

{
  const harness = createRequestHarness({ review: { reviewId: "RMSR-2" }, operationLogId: "LOG-2" });
  const result = await createOfficeRawMaterialSupplierStatementReviewDraft({
    authState,
    operatorId: "U-FINANCE-A",
    supplierName: "北陈无纺布",
    fileName: "2026-08.xlsx",
    note: "月结导入",
    statementResult: { rows: [{ inboundId: "RMI-1" }] },
  }, harness.options);
  assert.equal(result.review.reviewId, "RMSR-2");
  assert.equal(harness.calls[0].url, "http://erp.test/api/raw-material-supplier-statement-reviews");
  assert.equal(harness.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(harness.calls[0].init.body), {
    operatorId: "U-FINANCE-A",
    supplierName: "北陈无纺布",
    fileName: "2026-08.xlsx",
    note: "月结导入",
    statementResult: { rows: [{ inboundId: "RMI-1" }] },
  });
}

{
  const harness = createRequestHarness({ review: { reviewId: "RMSR-3", reviewStatus: "已复核" } });
  await confirmOfficeRawMaterialSupplierStatementReview({
    authState,
    operatorId: "U-FINANCE-A",
    reviewId: " RMSR-3 ",
    decision: "approved",
    adjustments: [{ lineId: "L-1", amount: 2 }],
    note: "已核对",
  }, harness.options);
  assert.equal(harness.calls[0].url, "http://erp.test/api/raw-material-supplier-statement-reviews/RMSR-3/confirm-review");
  assert.deepEqual(JSON.parse(harness.calls[0].init.body), {
    operatorId: "U-FINANCE-A",
    decision: "approved",
    adjustments: [{ lineId: "L-1", amount: 2 }],
    note: "已核对",
  });
}

{
  const harness = createRequestHarness({ review: { reviewId: "RMSR-4", statementStatus: "已确认" } });
  await confirmOfficeRawMaterialSupplierStatement({
    authState,
    operatorId: "U-FINANCE-A",
    reviewId: "RMSR-4",
    note: "确认月结",
  }, harness.options);
  assert.equal(harness.calls[0].url, "http://erp.test/api/raw-material-supplier-statement-reviews/RMSR-4/confirm-statement");
  assert.deepEqual(JSON.parse(harness.calls[0].init.body), { operatorId: "U-FINANCE-A", note: "确认月结" });
}

{
  const harness = createRequestHarness({
    review: { reviewId: "RMSR-5" },
    payableDraft: { supplierPayableId: "PAY-5", payableAmount: "800.25", lineSubtotal: "790" },
  });
  const result = await generateOfficeRawMaterialSupplierPayableDraft({
    authState,
    operatorId: "U-FINANCE-A",
    reviewId: "RMSR-5",
    note: "生成应付",
  }, harness.options);
  assert.equal(harness.calls[0].url, "http://erp.test/api/raw-material-supplier-statement-reviews/RMSR-5/generate-payable");
  assert.equal(result.payableDraft.payableAmount, 800.25);
  assert.equal(result.payableDraft.lineSubtotal, 790);
}

{
  const harness = createRequestHarness({
    review: { reviewId: "RMSR-6" },
    paymentRecord: { supplierPaymentConfirmationId: "SPC-6", paidAmount: "800.25" },
  });
  const result = await confirmOfficeRawMaterialSupplierPayment({
    authState,
    operatorId: "U-FINANCE-A",
    reviewId: "RMSR-6",
    paidAmount: 800.25,
    paymentMethod: "bank_transfer",
    paymentAccount: "尾号 1234",
    paymentReferenceNo: "BANK-6",
    paymentVoucherNo: "VOUCHER-6",
    paidAt: "2026-09-02T10:00:00.000Z",
    note: "已付款",
  }, harness.options);
  assert.equal(harness.calls[0].url, "http://erp.test/api/raw-material-supplier-statement-reviews/RMSR-6/confirm-payment");
  assert.equal(result.paymentRecord.paidAmount, 800.25);
  assert.equal(result.paymentRecord.status, "已确认付款");
  assert.equal(JSON.parse(harness.calls[0].init.body).paymentReferenceNo, "BANK-6");
}

{
  const harness = createRequestHarness({ code: "DB_ERROR", message: "relation raw_material_supplier_payables does not exist" }, 500);
  const result = await listOfficeRawMaterialSupplierStatementReviews({ authState, operatorId: "U-FINANCE-A" }, harness.options);
  assert.equal(result.blocked, true);
  assert.equal(result.error.message, "供应商月结复核草稿 API 返回错误。");
}

console.log("Office raw-material supplier statement API client checks passed: list, draft, review, statement, payable, payment, normalization, and error sanitization are covered.");
