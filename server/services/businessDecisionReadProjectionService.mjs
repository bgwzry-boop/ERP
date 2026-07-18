import { toBusinessDecisionProjection } from "./businessDecisionEvidenceService.mjs";
import { getBusinessDecisionScopeLabel } from "../../shared/businessDecisionCatalog.js";

export function createBusinessDecisionReadProjectionService() {
  function projectDecision(workspace, record = {}) {
    const enteredByUserId = cleanText(record.enteredByUserId ?? record.entered_by_user_id);
    const operator = (workspace?.users ?? []).find((user) => cleanText(user.userId ?? user.id) === enteredByUserId) ?? {};
    const projection = toBusinessDecisionProjection(record, { operator });
    return {
      ...projection,
      evidenceAttachments: (projection.evidenceAttachmentIds ?? []).map((attachmentId) => {
        const attachment = (workspace?.attachments ?? []).find((item) => cleanText(item.attachmentId ?? item.id) === attachmentId) ?? {};
        return {
          attachmentId,
          fileName: cleanText(attachment.fileName) || "决定凭据",
          fileType: cleanText(attachment.fileType),
          uploadedBy: cleanText(attachment.uploadedBy),
          uploadedAt: cleanText(attachment.uploadedAt),
          viewUrl: `/api/attachments/${encodeURIComponent(attachmentId)}/content`,
        };
      }),
    };
  }

  function listDecisions(workspace, records = [], filters = {}) {
    const businessType = cleanText(filters.businessType ?? filters.business_type);
    const businessId = cleanText(filters.businessId ?? filters.business_id);
    const decisionScope = cleanText(filters.decisionScope ?? filters.decision_scope);
    const status = cleanText(filters.status);
    return records
      .filter((record) => !businessType || cleanText(record.businessType ?? record.business_type) === businessType)
      .filter((record) => !businessId || cleanText(record.businessId ?? record.business_id) === businessId)
      .filter((record) => !decisionScope || cleanText(record.decisionScope ?? record.decision_scope) === decisionScope)
      .filter((record) => !status || cleanText(record.status) === status)
      .map((record) => projectDecision(workspace, record))
      .sort((left, right) => Date.parse(right.decidedAt || right.enteredAt || 0) - Date.parse(left.decidedAt || left.enteredAt || 0));
  }

  function listAuthorizations(workspace, records = [], filters = {}) {
    const scope = cleanText(filters.scope ?? filters.decisionScope);
    const employeeId = cleanText(filters.employeeId);
    const status = cleanText(filters.status);
    const asOf = parseAsOf(filters.asOf) ?? new Date();
    const effectiveOnly = filters.effectiveOnly === true;
    return records
      .filter((record) => !scope || cleanText(record.decisionScope ?? record.decision_scope) === scope)
      .filter((record) => !employeeId || cleanText(record.employeeId ?? record.employee_id) === employeeId)
      .filter((record) => !status || cleanText(record.status || "active") === status)
      .map((record) => {
        const recordEmployeeId = cleanText(record.employeeId ?? record.employee_id);
        const employee = (workspace?.employees ?? []).find(
          (item) => cleanText(item.id ?? item.employeeId) === recordEmployeeId,
        ) ?? {};
        const effective = getAuthorizationEffectiveState(record, employee, asOf);
        const historySource = Array.isArray(record.history) ? record.history : (workspace?.operationLogs ?? [])
          .filter((log) => cleanText(log.targetType ?? log.target_type) === "business_decision_authorization" && cleanText(log.targetId ?? log.target_id) === cleanText(record.authorizationId ?? record.id));
        const history = historySource
          .map((log) => ({
            operationLogId: cleanText(log.operationLogId ?? log.id), action: cleanText(log.action), reason: cleanText(log.reason),
            operatorId: cleanText(log.operatorId ?? log.operator_id), occurredAt: cleanText(log.occurredAt ?? log.occurred_at ?? log.createdAt ?? log.created_at),
            before: log.before ?? log.before_json ?? null, after: log.after ?? log.after_json ?? null,
          }))
          .sort((left, right) => Date.parse(right.occurredAt || 0) - Date.parse(left.occurredAt || 0));
        return {
          authorizationId: cleanText(record.authorizationId ?? record.id),
          employeeId: recordEmployeeId,
          employeeNo: cleanText(employee.bizNo ?? employee.employeeNo ?? employee.id),
          employeeName: cleanText(employee.name),
          decisionScope: cleanText(record.decisionScope ?? record.decision_scope),
          decisionScopeLabel: getBusinessDecisionScopeLabel(record.decisionScope ?? record.decision_scope),
          maxAmount: nullableNumber(record.maxAmount ?? record.max_amount),
          activeFrom: cleanText(record.activeFrom ?? record.active_from),
          activeTo: cleanText(record.activeTo ?? record.active_to),
          status: cleanText(record.status || "active"),
          effectiveStatus: effective.status,
          effectiveStatusLabel: effective.label,
          isEffective: effective.status === "current",
          authorizationNote: cleanText(record.authorizationNote ?? record.authorization_note),
          revision: Math.max(1, Math.trunc(Number(record.revision ?? 1) || 1)),
          createdBy: cleanText(record.createdBy ?? record.created_by),
          updatedBy: cleanText(record.updatedBy ?? record.updated_by),
          deactivatedBy: cleanText(record.deactivatedBy ?? record.deactivated_by),
          deactivatedAt: cleanText(record.deactivatedAt ?? record.deactivated_at),
          deactivationReason: cleanText(record.deactivationReason ?? record.deactivation_reason),
          operationLogId: cleanText(record.operationLogId ?? record.operation_log_id),
          createdAt: cleanText(record.createdAt ?? record.created_at),
          updatedAt: cleanText(record.updatedAt ?? record.updated_at),
          history,
        };
      })
      .filter((record) => !effectiveOnly || record.isEffective)
      .sort((left, right) => Date.parse(right.activeFrom || 0) - Date.parse(left.activeFrom || 0));
  }

  return Object.freeze({ listAuthorizations, listDecisions, projectDecision });
}

function getAuthorizationEffectiveState(record, employee, asOf) {
  const employeeStatus = cleanText(employee.profileStatus ?? employee.profile_status).toLowerCase();
  const employeeSource = cleanText(employee.sourceType ?? employee.source ?? employee.source_type).toLowerCase();
  const employeeInvalid = !cleanText(employee.id ?? employee.employeeId) || !cleanText(employee.name) ||
    ["seed", "demo", "synthetic", "real_sample"].some((value) => employeeSource.includes(value)) ||
    ["depart", "retir", "void", "merged"].some((value) => employeeStatus.includes(value));
  if (employeeInvalid) return { status: "employee_invalid", label: "员工档案无效" };
  if (cleanText(record.status || "active") !== "active") return { status: "inactive", label: "已停用" };
  const point = asOf.getTime();
  const from = Date.parse(record.activeFrom ?? record.active_from ?? "");
  const to = Date.parse(record.activeTo ?? record.active_to ?? "");
  if (!Number.isFinite(from) || from > point) return { status: "future", label: "待生效" };
  if (Number.isFinite(to) && to < point) return { status: "expired", label: "已过期" };
  return { status: "current", label: "当前有效" };
}

function parseAsOf(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
