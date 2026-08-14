import assert from "node:assert/strict";
import { commitLocalDecisionBundle } from "../server/businessDecisionEvidenceRepository.mjs";
import { commitLocalDraftWrite } from "../server/businessDecisionEvidenceDraftRepository.mjs";
import {
  createBusinessDecisionEvidenceDraftCommandService,
  validateBusinessDecisionEvidenceAttachmentUpload,
} from "../server/services/businessDecisionEvidenceDraftCommandService.mjs";
import { createBusinessDecisionEvidenceService } from "../server/services/businessDecisionEvidenceService.mjs";
import { createBusinessDecisionPolicyService } from "../server/services/businessDecisionPolicyService.mjs";
import { validateBusinessAttachment } from "../server/services/businessAttachmentValidationService.mjs";
import { roleCatalog } from "../shared/auth/roleCatalog.js";
import { attachmentUploadLimits } from "../shared/attachmentUploadPolicy.js";

const now = () => new Date("2026-07-17T04:00:00.000Z");
let logSequence = 0;
const draftService = createBusinessDecisionEvidenceDraftCommandService({
  now,
  buildOperationLog(_workspace, input) {
    logSequence += 1;
    return { id: `LOG-DRAFT-${logSequence}`, ...input, occurredAt: now().toISOString(), createdAt: now().toISOString() };
  },
});
const policy = createBusinessDecisionPolicyService({ now });
const evidenceService = createBusinessDecisionEvidenceService({ policyService: policy, now });
const workspace = buildWorkspace();
workspace.businessDecisionEvidenceDraftRepository = {
  writeDraft: commitLocalDraftWrite,
  findDraft({ workspace: target, draftId }) { return target.businessDecisionEvidenceDrafts.find((item) => item.draftId === draftId) ?? null; },
};
workspace.attachmentRepository = {
  listAttachments({ workspace: target, filters }) {
    return target.attachments.filter((item) => item.ownerType === filters.ownerType && item.ownerId === filters.ownerId && item.purpose === filters.purpose);
  },
};

const created = await draftService.createDraft({ workspace, operatorId: "U-OFFICE-A", body: {
  idempotencyKey: "evidence-draft-office-a-create",
  businessType: "raw_material_purchase_request",
  businessId: "RMP-001",
  decisionScope: "raw_material_purchase",
  createdBy: "FORGED",
} });
assert.equal(created.statusCode, 201);
assert.equal(created.response.draft.createdBy, "U-OFFICE-A");
const draftId = created.response.draft.draftId;

workspace.attachments.push(validAttachment("ATT-EVIDENCE-1", draftId, "U-OFFICE-A"));
assert.equal((await validateBusinessDecisionEvidenceAttachmentUpload({
  workspace,
  body: { ownerType: "business_decision_evidence_draft", ownerId: draftId, purpose: "business_decision_evidence" },
  permissionContext: { actionPermissions: delegatedPermissions() },
})).ok, true);
const originalAttachments = [...workspace.attachments];
for (let index = 2; index <= 5; index += 1) workspace.attachments.push(validAttachment(`ATT-EVIDENCE-${index}`, draftId, "U-OFFICE-A"));
assert.equal((await validateBusinessDecisionEvidenceAttachmentUpload({
  workspace,
  body: { ownerType: "business_decision_evidence_draft", ownerId: draftId, purpose: "business_decision_evidence" },
  permissionContext: { actionPermissions: delegatedPermissions() },
})).code, "BUSINESS_DECISION_EVIDENCE_ATTACHMENT_LIMIT");
workspace.attachments = originalAttachments;
const delegated = evaluate(workspace, { evidenceDraftId: draftId }, "U-OFFICE-B");
assert.equal(delegated.ok, true, "office B may continue office A's draft within the same shared task and permission scope");
assert.deepEqual(delegated.evidenceAttachmentIds, ["ATT-EVIDENCE-1"]);
assert.equal(delegated.enteredByUserId, "U-OFFICE-B");

const manualId = evaluate(workspace, { evidenceAttachmentIds: ["ATT-EVIDENCE-1"] });
assert.equal(manualId.code, "BUSINESS_DECISION_EVIDENCE_DRAFT_REQUIRED");
const missingRequired = policy.evaluateDecision({
  workspace, operatorId: "U-OFFICE-A", actionPermissions: delegatedPermissions(), decisionScope: "raw_material_purchase",
  businessType: "raw_material_purchase_request", businessId: "RMP-001", requireEvidence: true,
  delegatedDecision: decisionFields({}),
});
assert.equal(missingRequired.code, "BUSINESS_DECISION_EVIDENCE_REQUIRED");

const crossBusiness = policy.evaluateDecision({
  workspace, operatorId: "U-OFFICE-A", actionPermissions: delegatedPermissions(), decisionScope: "raw_material_purchase",
  businessType: "raw_material_purchase_request", businessId: "RMP-OTHER",
  delegatedDecision: decisionFields({ evidenceDraftId: draftId }),
});
assert.equal(crossBusiness.code, "BUSINESS_DECISION_EVIDENCE_DRAFT_TARGET_MISMATCH");

for (const [patch, expectedCode] of [
  [{ status: "voided" }, "BUSINESS_DECISION_EVIDENCE_REQUIRED"],
  [{ hasContent: false }, "BUSINESS_DECISION_EVIDENCE_INVALID"],
  [{ fileSize: attachmentUploadLimits.documentBytes + 1 }, "BUSINESS_DECISION_EVIDENCE_INVALID"],
  [{ fileType: "binary" }, "BUSINESS_DECISION_EVIDENCE_INVALID"],
  [{ uploadedBy: "UNKNOWN-USER" }, "BUSINESS_DECISION_EVIDENCE_UPLOADER_INVALID"],
  [{ ownerId: "OTHER-DRAFT" }, "BUSINESS_DECISION_EVIDENCE_REQUIRED"],
  [{ purpose: "other" }, "BUSINESS_DECISION_EVIDENCE_REQUIRED"],
]) {
  const original = workspace.attachments[0];
  workspace.attachments[0] = { ...original, ...patch };
  const result = policy.evaluateDecision({
    workspace, operatorId: "U-OFFICE-A", actionPermissions: delegatedPermissions(), decisionScope: "raw_material_purchase",
    businessType: "raw_material_purchase_request", businessId: "RMP-001", requireEvidence: true,
    delegatedDecision: decisionFields({ evidenceDraftId: draftId }),
  });
  assert.equal(result.code, expectedCode);
  workspace.attachments[0] = original;
}

const validation = validateBusinessAttachment({
  workspace,
  attachmentId: "ATT-EVIDENCE-1",
  findAttachment: (target, attachmentId) => target.attachments.find((item) => item.attachmentId === attachmentId),
  expectedOwnerType: "business_decision_evidence_draft",
  expectedOwnerId: draftId,
  expectedPurpose: "business_decision_evidence",
  requireUploader: true,
  validateUploader: (uploaderId) => workspace.users.some((user) => user.userId === uploaderId),
  allowedFileTypes: ["image", "pdf", "document", "spreadsheet"],
  allowedMimePrefixes: ["image/"],
  requirePositiveSize: true,
  maxBytes: attachmentUploadLimits.documentBytes,
});
assert.equal(validation.ok, true);

const prepared = evidenceService.prepareDecision({
  workspace, businessType: "raw_material_purchase_request", businessId: "RMP-001", decisionScope: "raw_material_purchase",
  operatorId: "U-OFFICE-B", actionPermissions: delegatedPermissions(), delegatedDecision: decisionFields({ evidenceDraftId: draftId }),
  requireEvidence: true, idempotencyKey: "decision-with-evidence-draft", operationLogId: "LOG-BUSINESS-1",
});
assert.equal(prepared.ok, true);

const beforeFailure = structuredClone(workspace.businessDecisionEvidenceDrafts);
assert.throws(() => commitLocalDecisionBundle({
  workspace, decisionRecord: prepared.record, attachmentLinks: prepared.attachmentLinks,
  operationLog: { id: "LOG-BUSINESS-1" },
  applyBusinessMutation() { throw Object.assign(new Error("simulated business failure"), { code: "SIMULATED_FAILURE" }); },
}), /simulated business failure/);
assert.deepEqual(workspace.businessDecisionEvidenceDrafts, beforeFailure, "a failed business write must not consume the evidence draft");

commitLocalDecisionBundle({
  workspace, decisionRecord: prepared.record, attachmentLinks: prepared.attachmentLinks,
  operationLog: { id: "LOG-BUSINESS-1" }, applyBusinessMutation() { return { commitKeys: [], result: {} }; },
});
assert.equal(workspace.businessDecisionEvidenceDrafts.find((item) => item.draftId === draftId).status, "consumed");
const reused = evaluate(workspace, { evidenceDraftId: draftId });
assert.equal(reused.code, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING");

assert.equal(roleCatalog.office.actionPermissions.includes("attachment.view"), true);
assert.equal(roleCatalog.warehouse.actionPermissions.includes("attachment.view"), false, "an unauthorized warehouse role cannot preview decision evidence through the permissioned content API");

console.log("Business decision evidence draft checks passed: target binding, A/B handoff, strict owner/purpose/uploader/content/type/size validation, no manual IDs, cross-business and reuse blocking, rollback-safe consumption, and preview permission isolation are covered.");

function evaluate(target, patch, operatorId = "U-OFFICE-A") {
  return policy.evaluateDecision({
    workspace: target, operatorId, actionPermissions: delegatedPermissions(), decisionScope: "raw_material_purchase",
    businessType: "raw_material_purchase_request", businessId: "RMP-001",
    delegatedDecision: decisionFields(patch),
  });
}

function decisionFields(patch) {
  return {
    decisionMakerEmployeeId: "ERP-MOTHER", decisionChannel: "wechat", decidedAt: "2026-07-17T03:30:00.000Z",
    decisionContent: { summary: "同意采购" }, authorizationBasis: "微信确认", ...patch,
  };
}

function delegatedPermissions() { return ["business_decision.record_delegated", "raw_material.purchase.record_delegated"]; }

function validAttachment(attachmentId, ownerId, uploadedBy) {
  return {
    id: attachmentId, attachmentId, ownerType: "business_decision_evidence_draft", ownerId,
    purpose: "business_decision_evidence", status: "uploaded", hasContent: true, uploadedBy,
    fileName: "微信确认.png", fileType: "image", mimeType: "image/png", fileSize: 256, uploadedAt: now().toISOString(),
  };
}

function buildWorkspace() {
  return {
    users: [
      { id: "U-OFFICE-A", userId: "U-OFFICE-A", employeeId: "ERP-OFFICE-A" },
      { id: "U-OFFICE-B", userId: "U-OFFICE-B", employeeId: "ERP-OFFICE-B" },
    ],
    employees: [
      { id: "ERP-OFFICE-A", bizNo: "010", name: "办公室甲", profileStatus: "account_enabled", source: "master_data_import_review" },
      { id: "ERP-OFFICE-B", bizNo: "011", name: "办公室乙", profileStatus: "account_enabled", source: "master_data_import_review" },
      { id: "ERP-MOTHER", bizNo: "031", name: "母亲", profileStatus: "formal_no_account", source: "master_data_import_review" },
    ],
    businessDecisionAuthorizations: [{
      id: "AUTH-MOTHER-PURCHASE", authorizationId: "AUTH-MOTHER-PURCHASE", employeeId: "ERP-MOTHER",
      decisionScope: "raw_material_purchase", maxAmount: null, activeFrom: "2026-01-01T00:00:00.000Z",
      activeTo: "2026-12-31T23:59:59.999Z", status: "active", authorizationNote: "负责人确认", revision: 1,
    }],
    businessDecisionEvidenceDrafts: [], businessDecisionRecords: [], attachments: [], attachmentLinks: [],
    operationLogs: [], operationIdempotencyRecords: [],
  };
}
