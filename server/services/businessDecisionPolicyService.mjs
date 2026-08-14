import {
  businessDecisionChannels,
  businessDecisionScopes,
  getBusinessDecisionChannelLabel,
  getBusinessDecisionScopeLabel,
  normalizeBusinessDecisionChannel,
} from "../../shared/businessDecisionCatalog.js";
import { attachmentUploadLimits } from "../../shared/attachmentUploadPolicy.js";

const permissionByScope = Object.freeze({
  order_priority: Object.freeze({ direct: "order.priority.direct", delegated: "order.priority.record_delegated" }),
  production_schedule: Object.freeze({ direct: "production.schedule.direct", delegated: "production.schedule.record_delegated" }),
  raw_material_purchase: Object.freeze({ direct: "raw_material.purchase.direct", delegated: "raw_material.purchase.record_delegated" }),
  fulfillment_quantity_variance: Object.freeze({ direct: "fulfillment.quantity_variance.direct", delegated: "fulfillment.quantity_variance.record_delegated" }),
  statement_variance: Object.freeze({ direct: "statement.variance.direct", delegated: "statement.variance.record_delegated" }),
  statement_write_off: Object.freeze({ direct: "statement.write_off.direct", delegated: "statement.write_off.record_delegated" }),
  major_exception: Object.freeze({ direct: "major_exception.direct", delegated: "major_exception.record_delegated" }),
});

export function createBusinessDecisionPolicyService({
  now = () => new Date(),
  lateEntryThresholdMs = 24 * 60 * 60 * 1000,
  lateEntryReasonThresholdMs = 72 * 60 * 60 * 1000,
} = {}) {
  if (typeof now !== "function") throw new TypeError("createBusinessDecisionPolicyService requires now to be a function.");

  function evaluateDecision({
    workspace,
    operatorId,
    actionPermissions = [],
    decisionScope,
    delegatedDecision,
    directDecisionContent,
    authorizationAmount = null,
    requireEvidence = false,
    businessType = "",
    businessId = "",
  } = {}) {
    const scope = cleanText(decisionScope);
    if (!businessDecisionScopes.includes(scope)) {
      return validation("BUSINESS_DECISION_SCOPE_INVALID", "业务决定授权范围无效。", { decisionScope: scope });
    }
    const permissionSet = new Set((Array.isArray(actionPermissions) ? actionPermissions : []).map(cleanText));
    const operator = findUser(workspace, operatorId);
    if (!operator) {
      return validation("BUSINESS_DECISION_OPERATOR_INVALID", "无法从认证会话确定系统操作人。");
    }
    const enteredAt = toIso(now());
    const delegated = delegatedDecision && typeof delegatedDecision === "object";
    const permissionKeys = permissionByScope[scope];
    if (delegated) {
      if (!permissionSet.has("business_decision.record_delegated") || !permissionSet.has(permissionKeys.delegated)) {
        return forbidden(
          "BUSINESS_DECISION_DELEGATED_PERMISSION_DENIED",
          `当前账号无权代录${getBusinessDecisionScopeLabel(scope)}决定。`,
          { requiredPermissions: ["business_decision.record_delegated", permissionKeys.delegated] },
        );
      }
      return evaluateDelegatedDecision({
        workspace,
        operator,
        operatorId,
        scope,
        delegatedDecision,
        authorizationAmount,
        requireEvidence,
        enteredAt,
        businessType,
        businessId,
      });
    }
    if (!permissionSet.has("business_decision.act_directly") || !permissionSet.has(permissionKeys.direct)) {
      return forbidden(
        "BUSINESS_DECISION_DIRECT_PERMISSION_DENIED",
        `当前账号无${getBusinessDecisionScopeLabel(scope)}直接决定权。`,
        { requiredPermissions: ["business_decision.act_directly", permissionKeys.direct] },
      );
    }
    return evaluateDirectDecision({
      workspace,
      operator,
      operatorId,
      scope,
      directDecisionContent,
      authorizationAmount,
      enteredAt,
    });
  }

  function evaluateDelegatedDecision({ workspace, operator, operatorId, scope, delegatedDecision, authorizationAmount, requireEvidence, enteredAt, businessType, businessId }) {
    const decisionMakerEmployeeId = cleanText(delegatedDecision.decisionMakerEmployeeId);
    const employee = findFormalEmployee(workspace, decisionMakerEmployeeId);
    if (!employee) {
      return validation("BUSINESS_DECISION_MAKER_INVALID", "业务决定人必须选择有效正式员工档案。");
    }
    const channel = normalizeBusinessDecisionChannel(delegatedDecision.decisionChannel);
    if (!businessDecisionChannels.includes(channel) || channel === "self_system") {
      return validation("BUSINESS_DECISION_CHANNEL_INVALID", "办公室代录不能选择“本人系统操作”。");
    }
    const decidedAt = parseDecidedAt(delegatedDecision.decidedAt, enteredAt);
    if (decidedAt.error) return decidedAt.error;
    const content = normalizeDecisionContent(delegatedDecision.decisionContent);
    if (!content) {
      return validation("BUSINESS_DECISION_CONTENT_REQUIRED", "决定内容必须包含明确摘要。");
    }
    const authorizationBasis = cleanText(delegatedDecision.authorizationBasis);
    if (!authorizationBasis) {
      return validation("BUSINESS_DECISION_AUTHORIZATION_BASIS_REQUIRED", "办公室代录必须填写授权依据。");
    }
    const evidence = resolveEvidenceDraft({ workspace, delegatedDecision, businessType, businessId, scope, requireEvidence });
    if (evidence.error) return evidence.error;
    const elapsedMs = Date.parse(enteredAt) - Date.parse(decidedAt.value);
    const lateEntry = elapsedMs > lateEntryThresholdMs;
    const lateEntryReason = cleanText(delegatedDecision.lateEntryReason);
    if (elapsedMs > lateEntryReasonThresholdMs && !lateEntryReason) {
      return validation("BUSINESS_DECISION_LATE_ENTRY_REASON_REQUIRED", "决定时间与录入时间相隔较长，必须说明补录原因。");
    }
    const authorization = resolveAuthorization(workspace, employee, scope, enteredAt, authorizationAmount);
    if (authorization.error) return authorization.error;
    return {
      ok: true,
      decisionType: "delegated",
      decisionScope: scope,
      decisionMakerEmployee: employee,
      decisionChannel: channel,
      decisionChannelLabel: getBusinessDecisionChannelLabel(channel),
      decidedAt: decidedAt.value,
      enteredAt,
      enteredByUser: operator,
      enteredByUserId: cleanText(operator.userId ?? operator.id ?? operatorId),
      decisionContent: content,
      authorization: authorization.value,
      authorizationBasis,
      amountSnapshot: normalizeAmount(authorizationAmount),
      evidenceAttachmentIds: evidence.attachmentIds,
      evidenceDraftId: evidence.draftId,
      lateEntry,
      lateEntryReason,
    };
  }

  function evaluateDirectDecision({ workspace, operator, operatorId, scope, directDecisionContent, authorizationAmount, enteredAt }) {
    const employeeId = cleanText(operator.employeeId);
    const employee = findFormalEmployee(workspace, employeeId);
    if (!employee) {
      return validation("BUSINESS_DECISION_DIRECT_EMPLOYEE_REQUIRED", "直接决定账号必须绑定有效正式员工档案。");
    }
    const content = normalizeDecisionContent(directDecisionContent);
    if (!content) {
      return validation("BUSINESS_DECISION_CONTENT_REQUIRED", "管理人员直接决定也必须记录原因或确认内容。");
    }
    const authorization = resolveAuthorization(workspace, employee, scope, enteredAt, authorizationAmount);
    if (authorization.error) return authorization.error;
    return {
      ok: true,
      decisionType: "direct",
      decisionScope: scope,
      decisionMakerEmployee: employee,
      decisionChannel: "self_system",
      decisionChannelLabel: getBusinessDecisionChannelLabel("self_system"),
      decidedAt: enteredAt,
      enteredAt,
      enteredByUser: operator,
      enteredByUserId: cleanText(operator.userId ?? operator.id ?? operatorId),
      decisionContent: content,
      authorization: authorization.value,
      authorizationBasis: cleanText(authorization.value.authorizationNote) || "本人按当前有效授权直接决定",
      amountSnapshot: normalizeAmount(authorizationAmount),
      evidenceAttachmentIds: [],
      evidenceDraftId: "",
      lateEntry: false,
      lateEntryReason: "",
    };
  }

  function parseDecidedAt(value, enteredAt) {
    const timestamp = Date.parse(cleanText(value));
    if (!Number.isFinite(timestamp)) {
      return { error: validation("BUSINESS_DECISION_TIME_INVALID", "必须填写有效决定时间。") };
    }
    if (timestamp > Date.parse(enteredAt)) {
      return { error: validation("BUSINESS_DECISION_TIME_IN_FUTURE", "决定时间不能晚于录入时间。") };
    }
    return { value: new Date(timestamp).toISOString() };
  }

  return Object.freeze({ evaluateDecision, permissionByScope });
}

export function getBusinessDecisionPermissionKeys(scope) {
  return permissionByScope[cleanText(scope)] ?? null;
}

function resolveAuthorization(workspace, employee, scope, decidedAt, authorizationAmount) {
  const timestamp = Date.parse(decidedAt);
  const employeeAuthorizations = (workspace?.businessDecisionAuthorizations ?? [])
    .filter((item) => cleanText(item.employeeId ?? item.employee_id) === cleanText(employee.id ?? employee.employeeId));
  const scopedAuthorizations = employeeAuthorizations
    .filter((item) => cleanText(item.decisionScope ?? item.decision_scope) === scope);
  if (!scopedAuthorizations.length) {
    return { error: forbidden("SCOPE_MISMATCH", `决定人没有${getBusinessDecisionScopeLabel(scope)}授权。`, { decisionScope: scope }) };
  }
  const activeAuthorizations = scopedAuthorizations.filter((item) => cleanText(item.status || "active") === "active");
  if (!activeAuthorizations.length) {
    return { error: forbidden("INACTIVE", `决定人的${getBusinessDecisionScopeLabel(scope)}授权已停用。`, { decisionScope: scope }) };
  }
  const candidates = activeAuthorizations
    .filter((item) => {
      const activeFrom = Date.parse(item.activeFrom ?? item.active_from ?? "");
      const activeTo = Date.parse(item.activeTo ?? item.active_to ?? "");
      return Number.isFinite(activeFrom) && activeFrom <= timestamp && (!Number.isFinite(activeTo) || activeTo >= timestamp);
    })
    .sort((left, right) => Date.parse(right.activeFrom ?? right.active_from) - Date.parse(left.activeFrom ?? left.active_from));
  const authorization = candidates[0];
  if (!authorization) {
    const hasFuture = activeAuthorizations.some((item) => Date.parse(item.activeFrom ?? item.active_from ?? "") > timestamp);
    return { error: forbidden("EXPIRED", hasFuture ? "决定人的授权尚未生效。" : "决定人的授权已过期。", { decisionScope: scope, hasFuture }) };
  }
  const amount = normalizeAmount(authorizationAmount);
  const maxAmount = nullableAmount(authorization.maxAmount ?? authorization.max_amount);
  if (amount !== null && maxAmount !== null && amount > maxAmount) {
    return {
      error: forbidden("AMOUNT_EXCEEDED", "本次处理金额超过决定人授权额度。", {
        decisionScope: scope,
        authorizedMaxAmount: maxAmount,
        authoritativeAmount: amount,
      }),
    };
  }
  return {
    value: {
      authorizationId: cleanText(authorization.authorizationId ?? authorization.id),
      employeeId: cleanText(authorization.employeeId ?? authorization.employee_id),
      decisionScope: scope,
      decisionScopeLabel: getBusinessDecisionScopeLabel(scope),
      maxAmount,
      activeFrom: toIso(authorization.activeFrom ?? authorization.active_from),
      activeTo: nullableIso(authorization.activeTo ?? authorization.active_to),
      status: "active",
      authorizationNote: cleanText(authorization.authorizationNote ?? authorization.authorization_note),
      revision: positiveInteger(authorization.revision, 1),
    },
  };
}

function findFormalEmployee(workspace, employeeId) {
  const target = cleanText(employeeId);
  if (!target) return null;
  return (workspace?.employees ?? []).find((employee) => {
    const id = cleanText(employee.id ?? employee.employeeId);
    const name = cleanText(employee.name);
    const status = cleanText(employee.profileStatus ?? employee.profile_status);
    const source = cleanText(employee.source);
    return id === target && name && source !== "seed" && !["retired", "voided", "merged"].includes(status);
  }) ?? null;
}

function findUser(workspace, userId) {
  const target = cleanText(userId);
  if (!target) return null;
  return (workspace?.users ?? []).find((user) => cleanText(user.userId ?? user.id) === target) ?? null;
}

function resolveEvidenceDraft({ workspace, delegatedDecision, businessType, businessId, scope, requireEvidence }) {
  const draftId = cleanText(delegatedDecision.evidenceDraftId);
  if (!draftId) {
    if (requireEvidence) {
      return { error: validation("BUSINESS_DECISION_EVIDENCE_REQUIRED", "本次决定必须上传决定凭据。") };
    }
    if (normalizeAttachmentIds(delegatedDecision.evidenceAttachmentIds).length) {
      return { error: validation("BUSINESS_DECISION_EVIDENCE_DRAFT_REQUIRED", "本次决定必须通过凭据草稿上传决定凭据。") };
    }
    return { draftId: "", attachmentIds: [] };
  }
  const draft = (workspace?.businessDecisionEvidenceDrafts ?? []).find((item) => cleanText(item.draftId ?? item.id) === draftId);
  if (!draft) return { error: validation("BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", "决定凭据草稿不存在。") };
  if (cleanText(draft.status) !== "pending" || cleanText(draft.consumedByDecisionId ?? draft.consumed_by_decision_id)) {
    return { error: validation("BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING", "决定凭据草稿已提交或作废，不能重复使用。") };
  }
  if (
    cleanText(draft.businessType ?? draft.business_type) !== cleanText(businessType) ||
    cleanText(draft.businessId ?? draft.business_id) !== cleanText(businessId) ||
    cleanText(draft.decisionScope ?? draft.decision_scope) !== scope
  ) {
    return { error: validation("BUSINESS_DECISION_EVIDENCE_DRAFT_TARGET_MISMATCH", "决定凭据草稿与当前业务对象或授权范围不匹配。") };
  }
  const attachments = (workspace?.attachments ?? []).filter((attachment) =>
    cleanText(attachment.ownerType) === "business_decision_evidence_draft" &&
    cleanText(attachment.ownerId) === draftId &&
    cleanText(attachment.purpose) === "business_decision_evidence" &&
    cleanText(attachment.status || "uploaded") === "uploaded",
  );
  if (attachments.length > 5) return { error: validation("BUSINESS_DECISION_EVIDENCE_ATTACHMENT_LIMIT", "每个经营决定最多使用 5 个凭据文件。") };
  for (const attachment of attachments) {
    const uploaderId = cleanText(attachment.uploadedBy);
    const fileType = cleanText(attachment.fileType);
    const size = Number(attachment.fileSize ?? attachment.fileSizeBytes ?? 0);
    if (!uploaderId || !findUser(workspace, uploaderId)) {
      return { error: validation("BUSINESS_DECISION_EVIDENCE_UPLOADER_INVALID", "决定凭据缺少有效的认证上传人。") };
    }
    if (attachment.hasContent !== true || !["image", "pdf", "document", "spreadsheet"].includes(fileType) || !Number.isFinite(size) || size <= 0 || size > attachmentUploadLimits.documentBytes) {
      return { error: validation("BUSINESS_DECISION_EVIDENCE_INVALID", "决定凭据内容、类型或大小不符合要求。", { attachmentId: cleanText(attachment.attachmentId ?? attachment.id) }) };
    }
  }
  if (requireEvidence && attachments.length === 0) return { error: validation("BUSINESS_DECISION_EVIDENCE_REQUIRED", "本次决定必须上传决定凭据。") };
  return { draftId, attachmentIds: attachments.map((item) => cleanText(item.attachmentId ?? item.id)).filter(Boolean) };
}

function normalizeDecisionContent(value) {
  if (typeof value === "string") {
    const summary = cleanText(value);
    return summary ? { summary } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = cleanText(value.summary ?? value.reason ?? value.content);
  if (!summary) return null;
  const reservedKeys = new Set([
    "operatorId", "operator_id", "enteredByUserId", "entered_by_user_id", "enteredByName",
    "decisionMakerEmployeeId", "decision_maker_employee_id", "authorizationId", "authorization_id",
    "authorizationAmount", "authorization_amount", "amountSnapshot", "amount_snapshot",
    "decidedAt", "decided_at", "enteredAt", "entered_at", "evidenceAttachmentIds",
    "evidence_attachment_ids", "operationLogId", "operation_log_id", "revision", "status",
    "__proto__", "prototype", "constructor",
  ]);
  const sanitized = sanitizeDecisionContentValue(value, reservedKeys);
  return { ...sanitized, summary };
}

function sanitizeDecisionContentValue(value, reservedKeys, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((item) => sanitizeDecisionContentValue(item, reservedKeys, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !reservedKeys.has(key))
      .map(([key, item]) => [key, sanitizeDecisionContentValue(item, reservedKeys, depth + 1)]),
  );
}

function normalizeAttachmentIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function nullableAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}

function normalizeAmount(value) {
  return nullableAmount(value);
}

function nullableIso(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function toIso(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value ?? "");
  return new Date(parsed).toISOString();
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function validation(code, message, details = undefined) {
  return { error: true, statusCode: 422, code, message, ...(details ? { details } : {}) };
}

function forbidden(code, message, details = undefined) {
  return { error: true, statusCode: 403, code, message, ...(details ? { details } : {}) };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
