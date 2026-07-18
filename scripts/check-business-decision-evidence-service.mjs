import assert from "node:assert/strict";
import { createBusinessDecisionEvidenceService } from "../server/services/businessDecisionEvidenceService.mjs";
import { createBusinessDecisionPolicyService } from "../server/services/businessDecisionPolicyService.mjs";

const now = () => new Date("2026-07-17T04:00:00.000Z");
const service = createBusinessDecisionEvidenceService({
  now,
  policyService: createBusinessDecisionPolicyService({ now }),
});
const workspace = {
  users: [{ id: "U-OFFICE-A", userId: "U-OFFICE-A", employeeId: "ERP-OFFICE-A", displayName: "办公室甲" }],
  employees: [
    { id: "ERP-OFFICE-A", bizNo: "010", name: "办公室甲", profileStatus: "account_enabled" },
    { id: "ERP-MOTHER", bizNo: "031", name: "母亲", profileStatus: "formal_no_account" },
  ],
  attachments: [{ id: "ATT-DECISION-1", ownerType: "business_decision_evidence_draft", ownerId: "BDED-PT-001", purpose: "business_decision_evidence", status: "uploaded", hasContent: true, uploadedBy: "U-OFFICE-A", fileType: "image", fileSize: 128 }],
  businessDecisionEvidenceDrafts: [{ id: "BDED-PT-001", businessType: "production_task", businessId: "PT-001", decisionScope: "production_schedule", status: "pending", revision: 1 }],
  businessDecisionAuthorizations: [{
    id: "AUTH-MOTHER-SCHEDULE",
    employeeId: "ERP-MOTHER",
    decisionScope: "production_schedule",
    activeFrom: "2026-01-01T00:00:00.000Z",
    activeTo: "2026-12-31T23:59:59.999Z",
    status: "active",
    authorizationNote: "生产计划授权",
    revision: 3,
  }],
};

const input = {
  workspace,
  businessType: "production_task",
  businessId: "PT-001",
  decisionScope: "production_schedule",
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "production.schedule.record_delegated"],
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionMakerNameSnapshot: "伪造姓名",
    decisionChannel: "wechat",
    decidedAt: "2026-07-17T11:30:00+08:00",
    decisionContent: { summary: "同意优先生产", operatorId: "FORGED" },
    authorizationBasis: "微信确认",
    evidenceDraftId: "BDED-PT-001",
    enteredByUserId: "FORGED",
    amountSnapshot: 999999,
  },
  idempotencyKey: "schedule-decision-stable-key",
  operationLogId: "LOG-DECISION-001",
};
const result = service.prepareDecision(input);
assert.equal(result.ok, true);
assert.match(result.record.id, /^BD-[A-F0-9]{20}$/);
assert.equal(result.record.decisionMakerNameSnapshot, "母亲");
assert.equal(result.record.decisionMakerEmployeeNoSnapshot, "031");
assert.equal(result.record.enteredByUserId, "U-OFFICE-A");
assert.equal(result.record.amountSnapshot, null);
assert.equal(result.record.authorizationSnapshot.revision, 3);
assert.equal(result.record.operationLogId, "LOG-DECISION-001");
assert.deepEqual(result.record.evidenceAttachmentIds, ["ATT-DECISION-1"]);
assert.equal(result.attachmentLinks[0].ownerType, "business_decision");
assert.equal(result.attachmentLinks[0].ownerId, result.record.id);
assert.equal(result.projection.decisionScopeLabel, "生产排产");
assert.equal(result.projection.decisionChannelLabel, "微信");
assert.equal(result.projection.enteredByName, "办公室甲");

const replayProjection = service.prepareDecision(input);
assert.equal(replayProjection.record.id, result.record.id, "stable idempotent inputs must create the same decision id");

const changed = service.prepareDecision({
  ...input,
  delegatedDecision: {
    ...input.delegatedDecision,
    decisionContent: { summary: "改成另一项决定" },
  },
});
assert.equal(changed.record.id, result.record.id, "decision identity is tied to command idempotency, not client content");
assert.notDeepEqual(changed.record.decisionContent, result.record.decisionContent);

console.log("Business decision evidence checks passed: employee/operator snapshots, server-owned fields, immutable authorization evidence, attachment links, and Chinese read projections are covered.");
