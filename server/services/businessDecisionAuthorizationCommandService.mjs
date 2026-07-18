import { createHash } from "node:crypto";
import { businessDecisionScopes, getBusinessDecisionScopeLabel } from "../../shared/businessDecisionCatalog.js";
import { normalizeAuthorization } from "../businessDecisionAuthorizationRepository.mjs";

const invalidEmployeeStatuses = new Set([
  "departed", "left", "retired", "void", "voided", "merged", "merged_duplicate", "inactive_employee",
]);

export function createBusinessDecisionAuthorizationCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function.");
  if (typeof now !== "function") throw new TypeError("now must be a function.");
  return Object.freeze({ createAuthorization, updateAuthorization, deactivateAuthorization });

  async function createAuthorization({ workspace, body = {}, operatorId } = {}) {
    const input = validateAuthorizationInput(workspace, body);
    if (input.error) return input;
    const timestamp = now().toISOString();
    const idempotencyKey = cleanText(body.idempotencyKey);
    if (!idempotencyKey) return error(400, "IDEMPOTENCY_KEY_REQUIRED", "新建授权必须提供幂等键。");
    const authorizationId = buildAuthorizationId(idempotencyKey);
    const authorization = normalizeAuthorization({
      authorizationId,
      ...input.value,
      status: "active",
      revision: 1,
      createdBy: operatorId,
      updatedBy: operatorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const operationLog = buildOperationLog(workspace, {
      targetType: "business_decision_authorization",
      targetId: authorizationId,
      action: "business_decision_authorization_created",
      before: null,
      after: snapshot(authorization),
      reason: authorization.authorizationNote,
      operatorId,
      pageKey: "master_data",
    });
    authorization.operationLogId = operationLog.id;
    return write(workspace, {
      action: "create", authorization, operationLog, idempotencyKey,
      idempotencyPayload: { action: "create", authorization: snapshot(authorization) },
    });
  }

  async function updateAuthorization({ workspace, authorizationId, body = {}, operatorId } = {}) {
    const current = findAuthorization(workspace, authorizationId);
    if (!current) return error(404, "BUSINESS_DECISION_AUTHORIZATION_NOT_FOUND", "授权记录不存在。");
    if (current.status !== "active") {
      return error(409, "BUSINESS_DECISION_AUTHORIZATION_INACTIVE_IMMUTABLE", "已停用授权不能覆盖或重新启用，请新建授权。", { currentVersion: current });
    }
    const expectedRevision = positiveInteger(body.expectedRevision);
    if (!expectedRevision) return error(400, "EXPECTED_REVISION_REQUIRED", "更新授权必须提交当前版本号。");
    if (expectedRevision !== current.revision) return conflict(current, body, expectedRevision);
    const input = validateAuthorizationInput(workspace, body);
    if (input.error) return input;
    const idempotencyKey = cleanText(body.idempotencyKey);
    if (!idempotencyKey) return error(400, "IDEMPOTENCY_KEY_REQUIRED", "更新授权必须提供幂等键。");
    const timestamp = now().toISOString();
    const authorization = normalizeAuthorization({
      ...current,
      ...input.value,
      revision: current.revision + 1,
      updatedBy: operatorId,
      updatedAt: timestamp,
      operationLogId: "",
    });
    const operationLog = buildOperationLog(workspace, {
      targetType: "business_decision_authorization",
      targetId: current.authorizationId,
      action: "business_decision_authorization_updated",
      before: snapshot(current),
      after: snapshot(authorization),
      reason: cleanText(body.reason) || authorization.authorizationNote,
      operatorId,
      pageKey: "master_data",
    });
    authorization.operationLogId = operationLog.id;
    return write(workspace, {
      action: "update", authorization, operationLog, expectedRevision, idempotencyKey,
      idempotencyPayload: { action: "update", authorization: snapshot(authorization), expectedRevision },
    });
  }

  async function deactivateAuthorization({ workspace, authorizationId, body = {}, operatorId } = {}) {
    const current = findAuthorization(workspace, authorizationId);
    if (!current) return error(404, "BUSINESS_DECISION_AUTHORIZATION_NOT_FOUND", "授权记录不存在。");
    const expectedRevision = positiveInteger(body.expectedRevision);
    if (!expectedRevision) return error(400, "EXPECTED_REVISION_REQUIRED", "停用授权必须提交当前版本号。");
    if (expectedRevision !== current.revision) return conflict(current, body, expectedRevision);
    if (current.status !== "active") return error(409, "BUSINESS_DECISION_AUTHORIZATION_ALREADY_INACTIVE", "授权已经停用。", { currentVersion: current });
    const reason = cleanText(body.reason ?? body.deactivationReason);
    if (!reason) return error(422, "BUSINESS_DECISION_AUTHORIZATION_DEACTIVATION_REASON_REQUIRED", "停用授权必须填写原因。");
    const idempotencyKey = cleanText(body.idempotencyKey);
    if (!idempotencyKey) return error(400, "IDEMPOTENCY_KEY_REQUIRED", "停用授权必须提供幂等键。");
    const timestamp = now().toISOString();
    const authorization = normalizeAuthorization({
      ...current,
      status: "inactive",
      revision: current.revision + 1,
      updatedBy: operatorId,
      updatedAt: timestamp,
      deactivatedBy: operatorId,
      deactivatedAt: timestamp,
      deactivationReason: reason,
      operationLogId: "",
    });
    const operationLog = buildOperationLog(workspace, {
      targetType: "business_decision_authorization",
      targetId: current.authorizationId,
      action: "business_decision_authorization_deactivated",
      before: snapshot(current),
      after: snapshot(authorization),
      reason,
      operatorId,
      pageKey: "master_data",
    });
    authorization.operationLogId = operationLog.id;
    return write(workspace, {
      action: "deactivate", authorization, operationLog, expectedRevision, idempotencyKey,
      idempotencyPayload: { action: "deactivate", authorizationId: current.authorizationId, expectedRevision, reason },
    });
  }

  async function write(workspace, input) {
    try {
      const saved = await workspace.businessDecisionAuthorizationRepository.writeAuthorization({ workspace, ...input });
      return {
        statusCode: input.action === "create" ? 201 : 200,
        response: { authorization: saved.authorization, operationLogId: saved.operationLogId, replayed: saved.replayed === true },
      };
    } catch (caught) {
      const code = cleanText(caught?.code);
      if (code === "ERP_BUSINESS_DECISION_AUTHORIZATION_WRITE_CONFLICT") {
        const current = findAuthorization(workspace, input.authorization.authorizationId);
        return error(409, "BUSINESS_DECISION_AUTHORIZATION_WRITE_CONFLICT", "授权已被其他操作人更新，请刷新后重试。", {
          currentVersion: current,
          submittedVersion: { expectedRevision: input.expectedRevision, ...snapshot(input.authorization) },
        });
      }
      if (Number.isInteger(caught?.statusCode)) return error(caught.statusCode, caught.code, caught.message, caught.details);
      throw caught;
    }
  }
}

export function validateFormalBusinessDecisionMaker(workspace, employeeId) {
  const id = cleanText(employeeId);
  const employee = (workspace?.employees ?? []).find((item) => cleanText(item.id ?? item.employeeId) === id);
  if (!employee || !cleanText(employee.name)) return error(422, "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_INVALID", "业务决定人必须是有效正式员工档案。");
  const source = cleanText(employee.sourceType ?? employee.source ?? employee.source_type).toLowerCase();
  if (["seed", "demo", "synthetic", "real_sample", "isolated_test_fixture"].some((value) => source.includes(value))) {
    return error(422, "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_NOT_FORMAL", "演示、种子或样例员工不能获得经营决定授权。");
  }
  const status = cleanText(employee.profileStatus ?? employee.profile_status).toLowerCase();
  if (invalidEmployeeStatuses.has(status) || ["depart", "retir", "void", "merged"].some((value) => status.includes(value))) {
    return error(422, "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_STATUS_INVALID", "离职、作废或已合并员工不能获得经营决定授权。");
  }
  return { ok: true, employee };
}

function validateAuthorizationInput(workspace, body) {
  const formal = validateFormalBusinessDecisionMaker(workspace, body.employeeId);
  if (formal.error) return formal;
  const decisionScope = cleanText(body.decisionScope ?? body.scope);
  if (!businessDecisionScopes.includes(decisionScope)) return error(422, "BUSINESS_DECISION_SCOPE_INVALID", "授权范围不在服务端固定目录中。");
  const maxAmount = nullableAmount(body.maxAmount);
  if (body.maxAmount !== null && body.maxAmount !== undefined && body.maxAmount !== "" && maxAmount === null) {
    return error(422, "BUSINESS_DECISION_AUTHORIZATION_AMOUNT_INVALID", "授权额度必须为非负数；留空表示不限额。");
  }
  const activeFrom = parseTimestamp(body.activeFrom);
  if (!activeFrom) return error(422, "BUSINESS_DECISION_AUTHORIZATION_ACTIVE_FROM_INVALID", "授权生效时间无效。");
  const activeTo = body.activeTo ? parseTimestamp(body.activeTo) : "";
  if (body.activeTo && !activeTo) return error(422, "BUSINESS_DECISION_AUTHORIZATION_ACTIVE_TO_INVALID", "授权截止时间无效。");
  if (activeTo && Date.parse(activeTo) < Date.parse(activeFrom)) return error(422, "BUSINESS_DECISION_AUTHORIZATION_RANGE_INVALID", "授权截止时间不能早于生效时间。");
  return {
    ok: true,
    value: {
      employeeId: cleanText(formal.employee.id ?? formal.employee.employeeId),
      decisionScope,
      maxAmount,
      activeFrom,
      activeTo,
      authorizationNote: cleanText(body.authorizationNote ?? body.note),
    },
  };
}

function findAuthorization(workspace, authorizationId) {
  return (workspace?.businessDecisionAuthorizations ?? []).map(normalizeAuthorization).find(
    (item) => item?.authorizationId === cleanText(authorizationId),
  ) ?? null;
}

function conflict(current, body, expectedRevision) {
  return error(409, "BUSINESS_DECISION_AUTHORIZATION_WRITE_CONFLICT", "授权已被其他操作人更新，请刷新后重试。", {
    currentVersion: current,
    submittedVersion: {
      expectedRevision,
      employeeId: cleanText(body.employeeId), decisionScope: cleanText(body.decisionScope ?? body.scope),
      maxAmount: body.maxAmount ?? null, activeFrom: cleanText(body.activeFrom), activeTo: cleanText(body.activeTo),
      authorizationNote: cleanText(body.authorizationNote ?? body.note),
    },
  });
}

function snapshot(value) {
  const item = normalizeAuthorization(value);
  if (!item) return null;
  return {
    authorizationId: item.authorizationId, employeeId: item.employeeId,
    decisionScope: item.decisionScope, decisionScopeLabel: getBusinessDecisionScopeLabel(item.decisionScope),
    maxAmount: item.maxAmount, activeFrom: item.activeFrom, activeTo: item.activeTo,
    status: item.status, authorizationNote: item.authorizationNote, revision: item.revision,
    createdBy: item.createdBy, updatedBy: item.updatedBy, deactivatedBy: item.deactivatedBy,
    deactivatedAt: item.deactivatedAt, deactivationReason: item.deactivationReason,
  };
}

function buildAuthorizationId(idempotencyKey) {
  return `BDA-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24).toUpperCase()}`;
}

function nullableAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}

function parseTimestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function positiveInteger(value) {
  const number = Math.trunc(Number(value));
  return number > 0 ? number : 0;
}

function error(statusCode, code, message, details) {
  return { error: true, statusCode, code, message, ...(details ? { details } : {}) };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
