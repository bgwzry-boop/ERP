import assert from "node:assert/strict";
import { createRawMaterialCommandService } from "../server/services/rawMaterialCommandService.mjs";

const calls = [];
const workspace = {
  users: [{ id: "U-RAW", displayName: "郝蒙蒙" }],
  operationLogs: [{ id: "LOG-1", stale: true }, { id: "LOG-OLD" }],
  rawMaterialInboundRepository: {
    async recordRawMaterialInboundAction(input) {
      calls.push({ method: "recordInbound", input });
      return {
        inbound: { id: input.inboundId, status: input.action },
        operationLog: { id: "LOG-1", action: input.action },
      };
    },
  },
  rawMaterialSupplierStatementReviewRepository: {
    async createReviewDraft(input) {
      calls.push({ method: "createReview", input });
      return { review: { reviewId: "RSR-1" }, operationLog: { id: "LOG-CREATE" } };
    },
    async confirmReview(input) {
      calls.push({ method: "confirmReview", input });
      return {
        review: { reviewId: input.reviewId, reviewStatus: input.decision },
        operationLogId: "LOG-CONFIRM-SAVED",
        operationLog: { id: "LOG-CONFIRM" },
      };
    },
    async confirmStatement(input) {
      calls.push({ method: "confirmStatement", input });
      return { review: { reviewId: input.reviewId, status: "confirmed" }, operationLog: { id: "LOG-STATEMENT" } };
    },
    async generatePayableDraft(input) {
      calls.push({ method: "generatePayable", input });
      return {
        review: { reviewId: input.reviewId },
        payableDraft: { payableDraftId: "RMSP-1" },
        operationLog: { id: "LOG-PAYABLE" },
      };
    },
    async confirmPayment(input) {
      calls.push({ method: "confirmPayment", input });
      return {
        review: { reviewId: input.reviewId },
        paymentRecord: { paymentRecordId: "RMSPAY-1", paidAmount: input.paidAmount },
        operationLog: { id: "LOG-PAYMENT" },
      };
    },
  },
};
const service = createRawMaterialCommandService();

const inbound = await service.recordInboundAction({
  workspace,
  inboundId: "RMI-1",
  actionSlug: "review",
  body: { idempotencyKey: "IDEM-1", note: "复核", expectedRevision: 1 },
  operatorId: "U-RAW",
});
assert.deepEqual(inbound, {
  inbound: { id: "RMI-1", status: "review" },
  operationLogId: "LOG-1",
});
assert.equal(calls[0].input.operatorName, "郝蒙蒙");
assert.equal(calls[0].input.idempotencyKey, "IDEM-1");
assert.deepEqual(calls[0].input.idempotencyPayload, { idempotencyKey: "IDEM-1", note: "复核", expectedRevision: 1 });
assert.deepEqual(workspace.operationLogs.map((item) => item.id), ["LOG-1", "LOG-OLD"]);

const invalidReview = await service.createSupplierStatementReviewDraft({
  workspace,
  body: {},
  operatorId: "U-RAW",
});
assert.deepEqual(invalidReview, {
  error: true,
  statusCode: 422,
  code: "VALIDATION_ERROR",
  message: "statementResult is required",
});
assert.equal(calls.some((call) => call.method === "createReview"), false);

const created = await service.createSupplierStatementReviewDraft({
  workspace,
  body: {
    result: { supplier: "白侯" },
    fileName: "statement.xlsx",
    supplierName: "白侯",
    note: "首轮",
    now: "2026-07-14T10:00:00.000Z",
  },
  operatorId: "U-RAW",
});
assert.deepEqual(created, { review: { reviewId: "RSR-1" }, operationLogId: "LOG-CREATE" });
const createInput = calls.find((call) => call.method === "createReview").input;
assert.deepEqual(createInput.statementResult, { supplier: "白侯" });
assert.equal(createInput.operatorName, "郝蒙蒙");

const confirmedReview = await service.confirmSupplierStatementReview({
  workspace,
  reviewId: "RSR-1",
  body: { decision: "一致", note: "已核对", now: "2026-07-14T10:10:00.000Z" },
  operatorId: "U-RAW",
});
assert.equal(confirmedReview.operationLogId, "LOG-CONFIRM-SAVED");
assert.equal(calls.find((call) => call.method === "confirmReview").input.decision, "一致");

const confirmedStatement = await service.confirmSupplierStatement({
  workspace,
  reviewId: "RSR-1",
  body: { note: "确认对账" },
  operatorId: "U-MISSING",
});
assert.equal(confirmedStatement.operationLogId, "LOG-STATEMENT");
assert.equal(calls.find((call) => call.method === "confirmStatement").input.operatorName, "U-MISSING");

const payable = await service.generateSupplierPayableDraft({
  workspace,
  reviewId: "RSR-1",
  body: { note: "生成应付" },
  operatorId: "U-RAW",
});
assert.deepEqual(payable.payableDraft, { payableDraftId: "RMSP-1" });

const payment = await service.confirmSupplierPayment({
  workspace,
  reviewId: "RSR-1",
  body: {
    amount: 1280,
    paymentMethod: "银行转账",
    paymentAccount: "基本户",
    paymentReferenceNo: "BANK-1",
    paymentVoucherNo: "VOUCHER-1",
    paidAt: "2026-07-14T11:00:00.000Z",
    note: "已付",
  },
  operatorId: "U-RAW",
});
assert.deepEqual(payment.paymentRecord, { paymentRecordId: "RMSPAY-1", paidAmount: 1280 });
const paymentInput = calls.find((call) => call.method === "confirmPayment").input;
assert.equal(paymentInput.paymentMethod, "银行转账");
assert.equal(paymentInput.paymentReferenceNo, "BANK-1");

workspace.rawMaterialInboundRepository.recordRawMaterialInboundAction = async () => {
  throw Object.assign(new Error("missing inbound"), { statusCode: 404 });
};
assert.deepEqual(
  await service.recordInboundAction({ workspace, inboundId: "MISSING", actionSlug: "review", body: { expectedRevision: 1 }, operatorId: "U-RAW" }),
  {
    error: true,
    statusCode: 404,
    code: "RAW_MATERIAL_INBOUND_NOT_FOUND",
    message: "missing inbound",
  },
);

workspace.rawMaterialInboundRepository.recordRawMaterialInboundAction = async () => {
  throw Object.assign(new Error("repository failed"), { statusCode: "invalid", code: "" });
};
assert.deepEqual(
  await service.recordInboundAction({ workspace, inboundId: "RMI-1", actionSlug: "review", body: { expectedRevision: 1 }, operatorId: "U-RAW" }),
  {
    error: true,
    statusCode: 500,
    code: "RAW_MATERIAL_INBOUND_ACTION_FAILED",
    message: "repository failed",
  },
);

assert.deepEqual(workspace.operationLogs.map((item) => item.id).slice(0, 5), [
  "LOG-PAYMENT",
  "LOG-PAYABLE",
  "LOG-STATEMENT",
  "LOG-CONFIRM",
  "LOG-CREATE",
]);

console.log(
  "raw-material command service checks passed: mapping, validation, operator identity, error projection, and idempotent operation-log insertion are isolated",
);
