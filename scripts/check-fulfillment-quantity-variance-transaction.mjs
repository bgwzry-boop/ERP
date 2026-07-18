import assert from "node:assert/strict";
import { createLocalBusinessDecisionEvidenceRepository } from "../server/businessDecisionEvidenceRepository.mjs";
import {
  buildRecordFulfillmentActionTransactionQuery,
  createLocalFulfillmentActionTransactionRepository,
} from "../server/fulfillmentActionTransactionRepository.mjs";

const repository = createLocalFulfillmentActionTransactionRepository();
const workspace = {
  fulfillments: [fulfillment({ revision: 2 })],
  fulfillmentExceptions: [exception()],
  fulfillmentQuantityVarianceResolutions: [],
  todos: [todo()],
  operationLogs: [],
  operationIdempotencyRecords: [],
  businessDecisionRecords: [],
  businessDecisionAuthorizations: [],
  attachments: [],
  attachmentLinks: [],
  businessDecisionEvidenceRepository: createLocalBusinessDecisionEvidenceRepository(),
};
const input = {
  workspace,
  idempotencyKey: "fulfillment:variance:resolve:001",
  idempotencyPayload: { fulfillmentId: "FUL-001", expectedRevision: 2, resolutionResult: "按实际数量出库" },
  fulfillment: fulfillment({ revision: 2, status: "差异已确认待重新出库", paperOutboundStatus: "待重新打印" }),
  fulfillmentException: exception({ status: "已解决" }),
  quantityVarianceResolution: resolution(),
  todo: todo({ handled: true, status: "已处理", handlingResult: "按实际数量出库" }),
  operationLog: operationLog(),
  decisionRecord: decision(),
  attachmentLinks: [],
};

const saved = await repository.recordFulfillmentAction(input);
assert.equal(saved.fulfillment.revision, 3);
assert.equal(saved.quantityVarianceResolution.resolutionResult, "按实际数量出库");
assert.equal(saved.businessDecision.id, "BD-FQVR-001");
assert.equal(workspace.fulfillmentQuantityVarianceResolutions.length, 1);
assert.equal(workspace.businessDecisionRecords.length, 1);
assert.equal(workspace.fulfillmentExceptions[0].status, "已解决");
assert.equal(workspace.todos[0].handled, true);

const replay = await repository.recordFulfillmentAction(input);
assert.equal(replay.replayed, true);
assert.equal(replay.fulfillment.revision, 3);
assert.equal(workspace.fulfillmentQuantityVarianceResolutions.length, 1);

assert.throws(
  () => repository.recordFulfillmentAction({
    ...input,
    idempotencyKey: "fulfillment:variance:resolve:stale",
    idempotencyPayload: { ...input.idempotencyPayload, resolutionResult: "补货后再出库" },
    fulfillment: fulfillment({ revision: 2, status: "待补货" }),
    quantityVarianceResolution: resolution({ id: "FQVR-002", resolutionResult: "补货后再出库" }),
    decisionRecord: decision({ id: "BD-FQVR-002" }),
  }),
  (error) => error.code === "BUSINESS_WRITE_CONFLICT" && error.details.currentRevision === 3,
);

const query = buildRecordFulfillmentActionTransactionQuery({ ...input, workspace: undefined });
assert.match(query.text, /INSERT INTO business_decision_records/);
assert.match(query.text, /INSERT INTO fulfillment_quantity_variance_resolutions/);
assert.match(query.text, /ERP_FULFILLMENT_CONCURRENCY_CONFLICT/);
assert.equal(query.values.includes("按实际数量出库"), true);

console.log("Fulfillment quantity-variance transaction checks passed: decision evidence, resolution, todo/exception closure, replay, and stale-write rejection are atomic.");

function fulfillment(overrides = {}) {
  return {
    id: "FUL-001",
    fulfillmentId: "FUL-001",
    bizNo: "FUL-001",
    orderLineId: "OL-001",
    customerId: "C001",
    customerSnapshot: { customerId: "C001", name: "客户甲" },
    method: "自提",
    expectedQty: 500,
    actualQty: 430,
    qty: 500,
    status: "数量差异待处理",
    paperOutboundStatus: "已交库房",
    finalDeliveryStatus: "待最终交付",
    revision: 2,
    ...overrides,
  };
}

function exception(overrides = {}) {
  return {
    id: "FEX-001",
    exceptionId: "FEX-001",
    fulfillmentId: "FUL-001",
    exceptionType: "quantity_mismatch",
    expectedQty: 500,
    actualQty: 430,
    reasonCode: "shortage",
    reason: "纸单 500，实物 430",
    status: "待办公室处理",
    todoId: "TODO-FQVR-001",
    reportedBy: "U-OFFICE-A",
    occurredAt: "2026-07-17T03:00:00.000Z",
    createdAt: "2026-07-17T03:00:00.000Z",
    ...overrides,
  };
}

function todo(overrides = {}) {
  return {
    id: "TODO-FQVR-001",
    bizNo: "TODO-FQVR-001",
    type: "数量差异待处理",
    refType: "fulfillment",
    refId: "FUL-001",
    priority: "exception",
    status: "未处理",
    summary: "出库数量差异 70",
    handled: false,
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-17T03:00:00.000Z",
    ...overrides,
  };
}

function resolution(overrides = {}) {
  return {
    id: "FQVR-001",
    fulfillmentId: "FUL-001",
    fulfillmentExceptionId: "FEX-001",
    expectedQty: 500,
    actualQty: 430,
    resolutionResult: "按实际数量出库",
    businessDecisionId: "BD-FQVR-001",
    recordedBy: "U-OFFICE-A",
    revision: 1,
    operationLogId: "LOG-FQVR-001",
    createdAt: "2026-07-17T04:00:00.000Z",
    updatedAt: "2026-07-17T04:00:00.000Z",
    ...overrides,
  };
}

function operationLog() {
  return {
    id: "LOG-FQVR-001",
    targetType: "fulfillment",
    targetId: "FUL-001",
    action: "resolve_fulfillment_quantity_variance",
    before: { status: "数量差异待处理" },
    after: { status: "差异已确认待重新出库" },
    reason: "按实际数量出库",
    operatorId: "U-OFFICE-A",
    pageKey: "fulfillment",
    occurredAt: "2026-07-17T04:00:00.000Z",
    createdAt: "2026-07-17T04:00:00.000Z",
  };
}

function decision(overrides = {}) {
  return {
    id: "BD-FQVR-001",
    businessType: "fulfillment",
    businessId: "FUL-001",
    decisionScope: "fulfillment_quantity_variance",
    decisionType: "delegated",
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionMakerEmployeeNoSnapshot: "031",
    decisionMakerNameSnapshot: "负责人",
    decisionChannel: "wechat",
    decidedAt: "2026-07-17T03:50:00.000Z",
    decisionContent: { summary: "同意按实际数量重新出库" },
    authorizationId: "AUTH-FQVR",
    authorizationSnapshot: { authorizationId: "AUTH-FQVR" },
    authorizationBasis: "微信确认",
    amountSnapshot: null,
    currency: "CNY",
    evidenceAttachmentIds: [],
    enteredByUserId: "U-OFFICE-A",
    enteredAt: "2026-07-17T04:00:00.000Z",
    status: "active",
    lateEntry: false,
    lateEntryReason: "",
    revision: 1,
    operationLogId: "LOG-FQVR-001",
    createdAt: "2026-07-17T04:00:00.000Z",
    updatedAt: "2026-07-17T04:00:00.000Z",
    ...overrides,
  };
}
