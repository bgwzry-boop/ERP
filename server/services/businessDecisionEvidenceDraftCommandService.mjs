import { createHash } from "node:crypto";
import { businessDecisionScopes } from "../../shared/businessDecisionCatalog.js";
import { getBusinessDecisionPermissionKeys } from "./businessDecisionPolicyService.mjs";
import { normalizeDraft } from "../businessDecisionEvidenceDraftRepository.mjs";

const businessTypesByScope = Object.freeze({
  order_priority: new Set(["order", "order_draft"]),
  production_schedule: new Set(["production_task", "production_schedule_queue"]),
  raw_material_purchase: new Set(["raw_material_purchase_request"]),
  fulfillment_quantity_variance: new Set(["fulfillment"]),
  statement_variance: new Set(["statement"]),
  statement_write_off: new Set(["statement"]),
});

export function createBusinessDecisionEvidenceDraftCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function.");
  return Object.freeze({ createDraft, voidDraft, voidAttachment, getDraft, listDraftAttachments });

  async function createDraft({ workspace, body = {}, operatorId } = {}) {
    const target = validateTarget(body);
    if (target.error) return target;
    const idempotencyKey = cleanText(body.idempotencyKey);
    if (!idempotencyKey) return failure(400, "IDEMPOTENCY_KEY_REQUIRED", "创建凭据草稿必须提供幂等键。");
    const timestamp = now().toISOString();
    const draftId = `BDED-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24).toUpperCase()}`;
    const draft = normalizeDraft({
      draftId,
      ...target.value,
      status: "pending",
      createdBy: operatorId,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const operationLog = buildOperationLog(workspace, {
      targetType: "business_decision_evidence_draft", targetId: draftId,
      action: "business_decision_evidence_draft_created", before: null, after: draft,
      reason: "为经营决定创建凭据草稿", operatorId, pageKey: "api",
    });
    return write(workspace, { action: "create", draft, operationLog, idempotencyKey, idempotencyPayload: { action: "create", target: target.value } }, 201);
  }

  async function voidDraft({ workspace, draftId, body = {}, operatorId } = {}) {
    const current = await getDraftRecord(workspace, draftId);
    if (!current) return failure(404, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", "凭据草稿不存在。");
    if (current.status !== "pending") return failure(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING", "只有待提交凭据草稿可以作废。", { currentVersion: current });
    const expectedRevision = positiveInteger(body.expectedRevision);
    if (!expectedRevision) return failure(400, "EXPECTED_REVISION_REQUIRED", "作废凭据草稿必须提交当前版本号。");
    if (expectedRevision !== current.revision) return failure(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_WRITE_CONFLICT", "凭据草稿已被更新，请刷新后重试。", { currentVersion: current, submittedVersion: { expectedRevision } });
    const reason = cleanText(body.reason);
    if (!reason) return failure(422, "BUSINESS_DECISION_EVIDENCE_DRAFT_VOID_REASON_REQUIRED", "作废凭据草稿必须填写原因。");
    const idempotencyKey = cleanText(body.idempotencyKey);
    if (!idempotencyKey) return failure(400, "IDEMPOTENCY_KEY_REQUIRED", "作废凭据草稿必须提供幂等键。");
    const draft = normalizeDraft({ ...current, status: "voided", revision: current.revision + 1, updatedAt: now().toISOString() });
    const operationLog = buildOperationLog(workspace, {
      targetType: "business_decision_evidence_draft", targetId: current.draftId,
      action: "business_decision_evidence_draft_voided", before: current, after: draft,
      reason, operatorId, pageKey: "api",
    });
    return write(workspace, { action: "void", draft, operationLog, expectedRevision, idempotencyKey, idempotencyPayload: { action: "void", draftId: current.draftId, expectedRevision, reason } }, 200);
  }

  async function getDraft({ workspace, draftId } = {}) {
    const draft = await getDraftRecord(workspace, draftId);
    if (!draft) return failure(404, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", "凭据草稿不存在。");
    return { statusCode: 200, response: { draft, attachments: await listDraftAttachments({ workspace, draftId }) } };
  }

  async function voidAttachment({ workspace, draftId, attachmentId, body = {}, operatorId } = {}) {
    const draft = await getDraftRecord(workspace, draftId);
    if (!draft) return failure(404, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", "凭据草稿不存在。");
    if (draft.status !== "pending") return failure(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING", "凭据草稿已提交或作废，不能删除附件。");
    const attachment = await workspace.attachmentRepository.findAttachmentById({ workspace, attachmentId });
    if (!attachment || cleanText(attachment.ownerType) !== "business_decision_evidence_draft" || cleanText(attachment.ownerId) !== draft.draftId || cleanText(attachment.purpose) !== "business_decision_evidence") {
      return failure(404, "BUSINESS_DECISION_EVIDENCE_ATTACHMENT_NOT_FOUND", "凭据附件不存在或不属于当前草稿。");
    }
    const reason = cleanText(body.reason) || "未使用的经营决定凭据附件";
    const idempotencyKey = cleanText(body.idempotencyKey);
    if (!idempotencyKey) return failure(400, "IDEMPOTENCY_KEY_REQUIRED", "删除凭据附件必须提供幂等键。");
    const operationLog = buildOperationLog(workspace, {
      targetType: "business_decision_evidence_draft", targetId: draft.draftId,
      action: "business_decision_evidence_attachment_voided",
      before: toAttachmentSummary(attachment), after: { attachmentId: cleanText(attachment.attachmentId), status: "voided" },
      reason, operatorId, pageKey: "api",
    });
    try {
      const saved = await workspace.attachmentRepository.voidAttachment({
        workspace, attachmentId: cleanText(attachment.attachmentId), ownerType: "business_decision_evidence_draft",
        ownerId: draft.draftId, purpose: "business_decision_evidence", operationLog, idempotencyKey,
        idempotencyPayload: { draftId: draft.draftId, attachmentId: cleanText(attachment.attachmentId), reason },
      });
      return { statusCode: 200, response: { attachment: toAttachmentSummary(saved.attachment), operationLogId: saved.operationLogId, replayed: saved.replayed === true } };
    } catch (caught) {
      if (Number.isInteger(caught?.statusCode)) return failure(caught.statusCode, caught.code, caught.message);
      if (cleanText(caught?.code) === "ERP_ATTACHMENT_VOID_CONFLICT") return failure(409, "BUSINESS_DECISION_EVIDENCE_ATTACHMENT_NOT_ACTIVE", "凭据附件已失效，不能重复删除。");
      throw caught;
    }
  }

  async function listDraftAttachments({ workspace, draftId } = {}) {
    const items = await workspace.attachmentRepository.listAttachments({ workspace, filters: {
      ownerType: "business_decision_evidence_draft", ownerId: cleanText(draftId), purpose: "business_decision_evidence",
    } });
    return (items ?? []).filter((item) => cleanText(item.status || "uploaded") !== "deleted").map(toAttachmentSummary);
  }

  async function write(workspace, input, statusCode) {
    try {
      const saved = await workspace.businessDecisionEvidenceDraftRepository.writeDraft({ workspace, ...input });
      if (input.action === "void") await workspace.attachmentRepository?.saveState?.({ workspace });
      return { statusCode, response: { draft: saved.draft, operationLogId: saved.operationLogId, replayed: saved.replayed === true } };
    } catch (caught) {
      if (cleanText(caught?.code) === "ERP_BUSINESS_DECISION_EVIDENCE_DRAFT_WRITE_CONFLICT") {
        return failure(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_WRITE_CONFLICT", "凭据草稿已被更新，请刷新后重试。", { currentVersion: await getDraftRecord(workspace, input.draft.draftId) });
      }
      if (Number.isInteger(caught?.statusCode)) return failure(caught.statusCode, caught.code, caught.message, caught.details);
      throw caught;
    }
  }
}

export function canAccessBusinessDecisionEvidenceDraft({ permissionContext, draft } = {}) {
  const permissions = new Set(permissionContext?.actionPermissions ?? []);
  const keys = getBusinessDecisionPermissionKeys(draft?.decisionScope);
  return Boolean(
    draft && keys && permissions.has("business_decision.record_delegated") && permissions.has(keys.delegated),
  );
}

export async function validateBusinessDecisionEvidenceAttachmentUpload({ workspace, body = {}, permissionContext } = {}) {
  const isDraftOwner = cleanText(body.ownerType) === "business_decision_evidence_draft";
  const isDecisionEvidence = cleanText(body.purpose) === "business_decision_evidence";
  if (!isDraftOwner && !isDecisionEvidence) return { ok: true };
  if (!isDraftOwner || !isDecisionEvidence) {
    return failure(422, "BUSINESS_DECISION_EVIDENCE_ATTACHMENT_BINDING_INVALID", "经营决定凭据必须绑定凭据草稿及固定用途。");
  }
  const draft = await getDraftRecord(workspace, body.ownerId);
  if (!draft) return failure(404, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", "凭据草稿不存在。");
  if (draft.status !== "pending") return failure(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING", "凭据草稿已提交或作废，不能继续上传。");
  if (!canAccessBusinessDecisionEvidenceDraft({ permissionContext, draft })) {
    return failure(403, "BUSINESS_DECISION_EVIDENCE_DRAFT_ACCESS_DENIED", "当前账号无权向该凭据草稿上传文件。");
  }
  const attachments = await workspace.attachmentRepository.listAttachments({ workspace, filters: {
    ownerType: "business_decision_evidence_draft", ownerId: draft.draftId, purpose: "business_decision_evidence",
  } });
  if ((attachments ?? []).filter((item) => cleanText(item.status || "uploaded") === "uploaded").length >= 5) {
    return failure(422, "BUSINESS_DECISION_EVIDENCE_ATTACHMENT_LIMIT", "每个经营决定凭据草稿最多上传 5 个文件。");
  }
  return { ok: true, draft };
}

export function validateTarget(body = {}) {
  const businessType = cleanText(body.businessType);
  const businessId = cleanText(body.businessId);
  const decisionScope = cleanText(body.decisionScope);
  if (!businessType || !businessId) return failure(422, "BUSINESS_DECISION_EVIDENCE_DRAFT_TARGET_REQUIRED", "凭据草稿必须绑定具体业务对象。");
  if (!businessDecisionScopes.includes(decisionScope)) return failure(422, "BUSINESS_DECISION_SCOPE_INVALID", "凭据草稿授权范围无效。");
  if (!businessTypesByScope[decisionScope]?.has(businessType)) return failure(422, "BUSINESS_DECISION_EVIDENCE_DRAFT_TARGET_MISMATCH", "业务对象类型与决定范围不匹配。");
  return { ok: true, value: { businessType, businessId, decisionScope } };
}

async function getDraftRecord(workspace, draftId) {
  return workspace.businessDecisionEvidenceDraftRepository.findDraft({ workspace, draftId: cleanText(draftId) });
}

function toAttachmentSummary(item) {
  return {
    attachmentId: cleanText(item.attachmentId ?? item.id), fileName: cleanText(item.fileName),
    fileType: cleanText(item.fileType), mimeType: cleanText(item.mimeType), fileSize: Number(item.fileSize ?? 0),
    status: cleanText(item.status), uploadedBy: cleanText(item.uploadedBy), uploadedAt: cleanText(item.uploadedAt),
    hasContent: item.hasContent === true,
  };
}

function positiveInteger(value) { const number = Math.trunc(Number(value)); return number > 0 ? number : 0; }
function failure(statusCode, code, message, details) { return { error: true, statusCode, code, message, ...(details ? { details } : {}) }; }
function cleanText(value) { return String(value ?? "").trim(); }
