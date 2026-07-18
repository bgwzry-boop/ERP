import assert from "node:assert/strict";
import { createBusinessDecisionPolicyService } from "../server/services/businessDecisionPolicyService.mjs";

const now = () => new Date("2026-07-17T04:00:00.000Z");
const service = createBusinessDecisionPolicyService({ now });
const workspace = buildWorkspace();

const delegated = service.evaluateDecision({
  workspace,
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "production.schedule.record_delegated"],
  decisionScope: "production_schedule",
  businessType: "production_task",
  businessId: "PT-001",
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionChannel: "微信",
    decidedAt: "2026-07-17T11:30:00+08:00",
    decisionContent: {
      summary: "同意本批订单优先生产",
      operatorId: "FORGED-NESTED-USER",
      enteredByUserId: "FORGED-NESTED-USER",
      amountSnapshot: 999999,
      businessNote: "先做急单",
      context: { operatorId: "FORGED-DEEP-USER", reason: "客户急用" },
    },
    authorizationBasis: "微信确认",
    evidenceDraftId: "BDED-PT-001",
    enteredByUserId: "FORGED-USER",
  },
});
assert.equal(delegated.ok, true);
assert.equal(delegated.decisionType, "delegated");
assert.equal(delegated.decisionMakerEmployee.id, "ERP-MOTHER");
assert.equal(delegated.enteredByUserId, "U-OFFICE-A");
assert.equal(delegated.decisionChannel, "wechat");
assert.equal(delegated.decisionContent.operatorId, undefined);
assert.equal(delegated.decisionContent.enteredByUserId, undefined);
assert.equal(delegated.decisionContent.amountSnapshot, undefined);
assert.equal(delegated.decisionContent.businessNote, "先做急单");
assert.equal(delegated.decisionContent.context.operatorId, undefined);
assert.equal(delegated.decisionContent.context.reason, "客户急用");

const direct = service.evaluateDecision({
  workspace,
  operatorId: "U-MANAGEMENT",
  actionPermissions: ["business_decision.act_directly", "statement.write_off.direct"],
  decisionScope: "statement_write_off",
  directDecisionContent: { summary: "本人确认本次授权抹零" },
  authorizationAmount: 80,
});
assert.equal(direct.ok, true);
assert.equal(direct.decisionType, "direct");
assert.equal(direct.decisionMakerEmployee.id, "ERP-OWNER");
assert.equal(direct.enteredByUserId, "U-MANAGEMENT");
assert.equal(direct.decisionChannel, "self_system");

const officeDirect = service.evaluateDecision({
  workspace,
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "statement.write_off.record_delegated"],
  decisionScope: "statement_write_off",
  directDecisionContent: { summary: "办公室不能直接决定" },
  authorizationAmount: 1,
});
assert.equal(officeDirect.statusCode, 403);
assert.equal(officeDirect.code, "BUSINESS_DECISION_DIRECT_PERMISSION_DENIED");

const selfSystemDelegated = service.evaluateDecision({
  workspace,
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "production.schedule.record_delegated"],
  decisionScope: "production_schedule",
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionChannel: "本人系统操作",
    decidedAt: "2026-07-17T11:30:00+08:00",
    decisionContent: { summary: "无效渠道" },
    authorizationBasis: "无效",
  },
});
assert.equal(selfSystemDelegated.code, "BUSINESS_DECISION_CHANNEL_INVALID");

const missingAuthorization = service.evaluateDecision({
  workspace,
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "raw_material.purchase.record_delegated"],
  decisionScope: "raw_material_purchase",
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-OFFICE-A",
    decisionChannel: "phone",
    decidedAt: "2026-07-17T11:30:00+08:00",
    decisionContent: { summary: "办公室人员没有采购决定权" },
    authorizationBasis: "电话",
  },
});
assert.equal(missingAuthorization.code, "SCOPE_MISMATCH");

const overAmount = service.evaluateDecision({
  workspace,
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "statement.write_off.record_delegated"],
  decisionScope: "statement_write_off",
  authorizationAmount: 101,
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionChannel: "wechat",
    decidedAt: "2026-07-17T11:30:00+08:00",
    decisionContent: { summary: "超过授权额度" },
    authorizationBasis: "微信确认",
  },
});
assert.equal(overAmount.code, "AMOUNT_EXCEEDED");
assert.equal(overAmount.details.authoritativeAmount, 101);
assert.equal(overAmount.details.authorizedMaxAmount, 100);

const missingEvidence = service.evaluateDecision({
  workspace,
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "statement.write_off.record_delegated"],
  decisionScope: "statement_write_off",
  authorizationAmount: 50,
  requireEvidence: true,
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionChannel: "wechat",
    decidedAt: "2026-07-17T11:30:00+08:00",
    decisionContent: { summary: "缺少凭据" },
    authorizationBasis: "微信确认",
  },
});
assert.equal(missingEvidence.code, "BUSINESS_DECISION_EVIDENCE_REQUIRED");

const futureDecision = service.evaluateDecision({
  workspace,
  operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "production.schedule.record_delegated"],
  decisionScope: "production_schedule",
  delegatedDecision: {
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionChannel: "wechat",
    decidedAt: "2026-07-17T12:30:00+08:00",
    decisionContent: { summary: "未来时间" },
    authorizationBasis: "微信确认",
  },
});
assert.equal(futureDecision.code, "BUSINESS_DECISION_TIME_IN_FUTURE");

console.log("Business decision policy checks passed: direct/delegated authority, formal identity, channels, time, evidence, and server-owned amount limits are enforced.");

function buildWorkspace() {
  return {
    users: [
      { id: "U-OFFICE-A", userId: "U-OFFICE-A", employeeId: "ERP-OFFICE-A", displayName: "办公室甲" },
      { id: "U-MANAGEMENT", userId: "U-MANAGEMENT", employeeId: "ERP-OWNER", displayName: "负责人" },
    ],
    employees: [
      { id: "ERP-OFFICE-A", bizNo: "010", name: "办公室甲", profileStatus: "account_enabled" },
      { id: "ERP-MOTHER", bizNo: "031", name: "母亲", profileStatus: "formal_no_account" },
      { id: "ERP-AUNT", bizNo: "032", name: "婶子", profileStatus: "formal_no_account" },
      { id: "ERP-OWNER", bizNo: "001", name: "负责人", profileStatus: "account_enabled" },
    ],
    attachments: [{ id: "ATT-DECISION-1", ownerType: "business_decision_evidence_draft", ownerId: "BDED-PT-001", purpose: "business_decision_evidence", status: "uploaded", hasContent: true, uploadedBy: "U-OFFICE-A", fileType: "image", fileSize: 128 }],
    businessDecisionEvidenceDrafts: [{ id: "BDED-PT-001", businessType: "production_task", businessId: "PT-001", decisionScope: "production_schedule", status: "pending", revision: 1 }],
    businessDecisionAuthorizations: [
      authorization("AUTH-MOTHER-SCHEDULE", "ERP-MOTHER", "production_schedule"),
      authorization("AUTH-MOTHER-WRITE-OFF", "ERP-MOTHER", "statement_write_off", 100),
      authorization("AUTH-OWNER-WRITE-OFF", "ERP-OWNER", "statement_write_off", 5000),
    ],
  };
}

function authorization(id, employeeId, decisionScope, maxAmount = null) {
  return {
    id,
    employeeId,
    decisionScope,
    maxAmount,
    activeFrom: "2026-01-01T00:00:00.000Z",
    activeTo: "2026-12-31T23:59:59.999Z",
    status: "active",
    authorizationNote: "负责人确认的当前授权",
    revision: 1,
  };
}
