import assert from "node:assert/strict";
import { createBusinessDecisionEvidenceRepository } from "../server/businessDecisionEvidenceRepository.mjs";
import { createRawMaterialPurchaseRepository } from "../server/rawMaterialPurchaseRepository.mjs";
import { createBusinessDecisionEvidenceService } from "../server/services/businessDecisionEvidenceService.mjs";
import { createBusinessDecisionPolicyService } from "../server/services/businessDecisionPolicyService.mjs";
import { createRawMaterialCommandService } from "../server/services/rawMaterialCommandService.mjs";
import { createWorkspaceRecordService } from "../server/services/workspaceRecordService.mjs";

const clock = () => new Date("2026-07-17T04:00:00.000Z");
const policyService = createBusinessDecisionPolicyService({ now: clock });
const evidenceService = createBusinessDecisionEvidenceService({ policyService, now: clock });
const workspaceRecords = createWorkspaceRecordService({ now: clock });
const service = createRawMaterialCommandService({
  businessDecisionEvidenceService: evidenceService,
  buildOperationLog: workspaceRecords.buildOperationLog,
  nextId: workspaceRecords.nextId,
  now: clock,
});
const workspace = buildWorkspace();
const permissions = ["business_decision.record_delegated", "raw_material.purchase.record_delegated"];

const createBody = {
  idempotencyKey: "purchase:create:001",
  supplierName: "薄膜供应商甲",
  materialLines: [{ materialName: "无纺布", color: "米白", qty: 300, unit: "kg" }],
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionChannel: "wechat",
    decidedAt: "2026-07-17T11:30:00+08:00",
    decisionContent: { summary: "同意采购 300kg 米白无纺布" },
    authorizationBasis: "微信确认",
  },
};
const created = await service.createPurchaseRequest({
  workspace,
  body: createBody,
  operatorId: "U-OFFICE-A",
  actionPermissions: permissions,
});
assert.equal(created.purchaseRequest.status, "待执行");
assert.equal(created.purchaseRequest.revision, 1);
assert.equal(created.businessDecision.decisionMakerName, "母亲");
assert.equal(created.businessDecision.enteredByUserId, "U-OFFICE-A");
assert.equal(workspace.rawMaterialPurchaseRequests.length, 1);
assert.equal(workspace.businessDecisionRecords.length, 1);
assert.equal(workspace.operationLogs.length, 1);

const replay = await service.createPurchaseRequest({
  workspace,
  body: createBody,
  operatorId: "U-OFFICE-A",
  actionPermissions: permissions,
});
assert.equal(replay.replayed, true);
assert.equal(replay.purchaseRequest.id, created.purchaseRequest.id);
assert.equal(workspace.rawMaterialPurchaseRequests.length, 1);

const contacted = await service.updatePurchaseRequestStatus({
  workspace,
  requestId: created.purchaseRequest.id,
  operatorId: "U-OFFICE-A",
  actionPermissions: permissions,
  body: {
    idempotencyKey: "purchase:status:001",
    expectedRevision: 1,
    status: "已联系供应商",
    reason: "已电话确认交期",
  },
});
assert.equal(contacted.purchaseRequest.revision, 2);
assert.equal(contacted.businessDecision, null);

const statusReplay = await service.updatePurchaseRequestStatus({
  workspace,
  requestId: created.purchaseRequest.id,
  operatorId: "U-OFFICE-A",
  actionPermissions: permissions,
  body: {
    idempotencyKey: "purchase:status:001",
    expectedRevision: 1,
    status: "已联系供应商",
    reason: "已电话确认交期",
  },
});
assert.equal(statusReplay.replayed, true);
assert.equal(statusReplay.purchaseRequest.revision, 2);

const stale = await service.updatePurchaseRequestStatus({
  workspace,
  requestId: created.purchaseRequest.id,
  operatorId: "U-OFFICE-A",
  actionPermissions: permissions,
  body: {
    idempotencyKey: "purchase:status:stale",
    expectedRevision: 1,
    status: "已下单",
  },
});
assert.equal(stale.statusCode, 409);
assert.equal(stale.code, "BUSINESS_WRITE_CONFLICT");
assert.equal(stale.details.currentRevision, 2);

console.log("Raw-material purchase checks passed: delegated decision evidence, atomic create, idempotent replay, expectedRevision, and Chinese statuses are enforced.");

function buildWorkspace() {
  const workspace = {
    users: [{ id: "U-OFFICE-A", employeeId: "ERP-OFFICE-A", displayName: "办公室甲" }],
    employees: [
      { id: "ERP-OFFICE-A", bizNo: "010", name: "办公室甲", profileStatus: "account_enabled" },
      { id: "ERP-MOTHER", bizNo: "031", name: "母亲", profileStatus: "formal_no_account" },
    ],
    businessDecisionAuthorizations: [{
      id: "AUTH-MOTHER-PURCHASE",
      employeeId: "ERP-MOTHER",
      decisionScope: "raw_material_purchase",
      activeFrom: "2026-01-01T00:00:00.000Z",
      activeTo: "2026-12-31T23:59:59.999Z",
      status: "active",
      authorizationNote: "负责人确认采购授权",
      revision: 1,
    }],
    businessDecisionRecords: [],
    rawMaterialPurchaseRequests: [],
    attachmentLinks: [],
    attachments: [],
    operationLogs: [],
    operationIdempotencyRecords: [],
  };
  workspace.businessDecisionEvidenceRepository = createBusinessDecisionEvidenceRepository({ mode: "local", allowLocalFixture: true });
  workspace.rawMaterialPurchaseRepository = createRawMaterialPurchaseRepository({ mode: "local", allowLocalFixture: true });
  return workspace;
}
