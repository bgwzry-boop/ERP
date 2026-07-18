import { createHash } from "node:crypto";
import {
  getBusinessDecisionChannelLabel,
  getBusinessDecisionScopeLabel,
  getBusinessDecisionStatusLabel,
  getBusinessDecisionTypeLabel,
} from "../../shared/businessDecisionCatalog.js";

export function createBusinessDecisionEvidenceService({ policyService, now = () => new Date() } = {}) {
  if (!policyService?.evaluateDecision) {
    throw new TypeError("createBusinessDecisionEvidenceService requires policyService.evaluateDecision.");
  }
  if (typeof now !== "function") throw new TypeError("createBusinessDecisionEvidenceService requires now.");

  function prepareDecision({
    workspace,
    businessType,
    businessId,
    decisionScope,
    operatorId,
    actionPermissions,
    delegatedDecision,
    directDecisionContent,
    authorizationAmount,
    requireEvidence = false,
    operationLogId = "",
    supersedesDecisionId = "",
    idempotencyKey = "",
  } = {}) {
    const safeBusinessType = cleanText(businessType);
    const safeBusinessId = cleanText(businessId);
    if (!safeBusinessType || !safeBusinessId) {
      return validation("BUSINESS_DECISION_TARGET_REQUIRED", "经营决定必须绑定具体业务对象。");
    }
    const evaluated = policyService.evaluateDecision({
      workspace,
      operatorId,
      actionPermissions,
      decisionScope,
      delegatedDecision,
      directDecisionContent,
      authorizationAmount,
      requireEvidence,
      businessType: safeBusinessType,
      businessId: safeBusinessId,
    });
    if (evaluated.error) return evaluated;
    const employee = evaluated.decisionMakerEmployee;
    const authorization = evaluated.authorization;
    const createdAt = toIso(now());
    const decisionId = buildDecisionId({
      businessType: safeBusinessType,
      businessId: safeBusinessId,
      decisionScope: evaluated.decisionScope,
      enteredByUserId: evaluated.enteredByUserId,
      enteredAt: evaluated.enteredAt,
      idempotencyKey,
    });
    const record = {
      id: decisionId,
      businessDecisionId: decisionId,
      businessType: safeBusinessType,
      businessId: safeBusinessId,
      decisionScope: evaluated.decisionScope,
      decisionType: evaluated.decisionType,
      decisionMakerEmployeeId: cleanText(employee.id ?? employee.employeeId),
      decisionMakerEmployeeNoSnapshot: cleanText(employee.bizNo ?? employee.employeeNo ?? employee.id),
      decisionMakerNameSnapshot: cleanText(employee.name),
      decisionChannel: evaluated.decisionChannel,
      decidedAt: evaluated.decidedAt,
      decisionContent: cloneJson(evaluated.decisionContent),
      authorizationId: cleanText(authorization.authorizationId),
      authorizationSnapshot: cloneJson(authorization),
      authorizationBasis: evaluated.authorizationBasis,
      amountSnapshot: evaluated.amountSnapshot,
      currency: "CNY",
      evidenceAttachmentIds: [...evaluated.evidenceAttachmentIds],
      evidenceDraftId: cleanText(evaluated.evidenceDraftId),
      enteredByUserId: evaluated.enteredByUserId,
      enteredAt: evaluated.enteredAt,
      status: "active",
      supersedesDecisionId: cleanText(supersedesDecisionId),
      lateEntry: evaluated.lateEntry === true,
      lateEntryReason: evaluated.lateEntryReason,
      revision: 1,
      operationLogId: cleanText(operationLogId),
      createdAt,
      updatedAt: createdAt,
    };
    return {
      ok: true,
      record,
      attachmentLinks: record.evidenceAttachmentIds.map((attachmentId, index) => ({
        id: `AL-BD-${safePart(decisionId)}-${String(index + 1).padStart(2, "0")}`,
        attachmentId,
        ownerType: "business_decision",
        ownerId: decisionId,
        purpose: "business_decision_evidence",
        createdAt,
      })),
      projection: toBusinessDecisionProjection(record, { operator: evaluated.enteredByUser }),
    };
  }

  return Object.freeze({ prepareDecision, toProjection: toBusinessDecisionProjection });
}

export function toBusinessDecisionProjection(record = {}, context = {}) {
  const status = cleanText(record.status || "active");
  const decisionScope = cleanText(record.decisionScope ?? record.decision_scope);
  const decisionType = cleanText(record.decisionType ?? record.decision_type);
  const decisionChannel = cleanText(record.decisionChannel ?? record.decision_channel);
  const operator = context.operator ?? {};
  return {
    businessDecisionId: cleanText(record.businessDecisionId ?? record.id),
    businessType: cleanText(record.businessType ?? record.business_type),
    businessId: cleanText(record.businessId ?? record.business_id),
    decisionScope,
    decisionScopeLabel: getBusinessDecisionScopeLabel(decisionScope),
    decisionType,
    decisionTypeLabel: getBusinessDecisionTypeLabel(decisionType),
    decisionMakerEmployeeId: cleanText(record.decisionMakerEmployeeId ?? record.decision_maker_employee_id),
    decisionMakerEmployeeNo: cleanText(record.decisionMakerEmployeeNoSnapshot ?? record.decision_maker_employee_no_snapshot),
    decisionMakerName: cleanText(record.decisionMakerNameSnapshot ?? record.decision_maker_name_snapshot),
    decisionChannel,
    decisionChannelLabel: getBusinessDecisionChannelLabel(decisionChannel),
    decidedAt: cleanText(record.decidedAt ?? record.decided_at),
    decisionContent: cloneJson(record.decisionContent ?? record.decision_content_json ?? {}),
    authorizationId: cleanText(record.authorizationId ?? record.authorization_id),
    authorization: cloneJson(record.authorizationSnapshot ?? record.authorization_snapshot_json ?? {}),
    authorizationBasis: cleanText(record.authorizationBasis ?? record.authorization_basis),
    amountSnapshot: nullableNumber(record.amountSnapshot ?? record.amount_snapshot),
    currency: cleanText(record.currency || "CNY"),
    evidenceAttachmentIds: normalizeArray(record.evidenceAttachmentIds ?? record.evidence_attachment_ids_json),
    evidenceDraftId: cleanText(record.evidenceDraftId ?? record.evidence_draft_id),
    enteredByUserId: cleanText(record.enteredByUserId ?? record.entered_by_user_id),
    enteredByName: cleanText(record.enteredByName ?? operator.displayName ?? operator.name),
    enteredAt: cleanText(record.enteredAt ?? record.entered_at),
    status,
    statusLabel: getBusinessDecisionStatusLabel(status),
    supersedesDecisionId: cleanText(record.supersedesDecisionId ?? record.supersedes_decision_id),
    lateEntry: record.lateEntry === true || record.late_entry === true,
    lateEntryReason: cleanText(record.lateEntryReason ?? record.late_entry_reason),
    operationLogId: cleanText(record.operationLogId ?? record.operation_log_id),
    revision: Math.max(1, Math.trunc(Number(record.revision ?? 1) || 1)),
  };
}

function buildDecisionId(input) {
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  return `BD-${digest}`;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value === "string") {
    try { return normalizeArray(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function safePart(value) {
  return cleanText(value).replace(/[^a-z0-9_-]/gi, "").slice(-28) || "DECISION";
}

function toIso(value) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function validation(code, message) {
  return { error: true, statusCode: 422, code, message };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
