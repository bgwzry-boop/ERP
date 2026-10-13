import { randomUUID } from "node:crypto";
import { getWorkspaceSecurityPolicy } from "../apiSecurityPolicy.mjs";
import { issueRuntimeUserTemporaryPassword } from "../authSeed.mjs";
import {
  getPermissionCatalog,
  normalizeRoleKeys,
  resolvePermissionAssignment,
  roleCatalog,
} from "../../shared/auth/roleCatalog.js";
import {
  findRuntimeUserById,
  nextRuntimeSessionVersion,
  persistRuntimeIdentityState,
  sanitizeRuntimeUserForResponse,
  upsertRuntimeUser,
} from "./runtimeIdentityWorkspace.mjs";

const subaccountSource = "subaccount_admin_created";
const humanRoleKeys = Object.freeze(Object.keys(roleCatalog).filter((roleKey) => roleKey !== "print_driver_service"));
const accountStatuses = new Set(["draft", "active", "suspended", "disabled"]);

export function createMasterDataSubaccountCommandService(dependencies = {}) {
  const { buildOperationLog, now = () => new Date(), createId = () => randomUUID() } = dependencies;
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");

  return {
    getPermissionCatalog: () => buildPermissionCatalogProjection(),
    listSubaccounts,
    createSubaccount,
    updateSubaccount,
    issueTemporaryPassword,
    suspendSubaccount,
    reactivateSubaccount,
    disableSubaccount,
  };

  function listSubaccounts(workspace, filters = {}) {
    const keyword = cleanText(filters.keyword).toLowerCase();
    const status = cleanText(filters.status);
    return (workspace.users ?? [])
      .filter((user) => cleanText(user.source) === subaccountSource)
      .filter((user) => !status || resolveAccountStatus(user) === status)
      .filter((user) => {
        if (!keyword) return true;
        return [user.userId, user.loginName, user.displayName, user.employeeId, ...(user.roles ?? [])]
          .some((value) => cleanText(value).toLowerCase().includes(keyword));
      })
      .map((user) => projectSubaccount(workspace, user))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.loginName.localeCompare(right.loginName));
  }

  async function createSubaccount({ workspace, body = {}, operatorId, operatorPermissions = [] }) {
    const displayName = cleanText(body.displayName);
    const loginName = normalizeLoginName(body.loginName);
    const reason = cleanText(body.reason);
    if (!displayName) return businessError(400, "SUBACCOUNT_DISPLAY_NAME_REQUIRED", "创建子账号必须填写显示名称。");
    if (!loginName || !/^[a-z][a-z0-9._-]{2,31}$/.test(loginName)) {
      return businessError(400, "SUBACCOUNT_LOGIN_NAME_INVALID", "登录名须以字母开头，仅含小写字母、数字、点、下划线或短横线，共 3–32 位。");
    }
    if (!reason) return businessError(400, "SUBACCOUNT_REASON_REQUIRED", "创建子账号必须填写原因。");
    if (findUserByLoginName(workspace, loginName)) {
      return businessError(409, "SUBACCOUNT_LOGIN_NAME_CONFLICT", "该登录名已被使用。");
    }
    const assignment = validateAssignment(body, operatorPermissions);
    if (assignment.error) return assignment.error;
    const employee = validateEmployeeBinding(workspace, body.employeeId);
    if (employee.error) return employee.error;

    const changedAt = now().toISOString();
    const userId = buildSubaccountUserId(createId(), workspace.users);
    const user = {
      id: userId,
      userId,
      loginName,
      displayName,
      defaultRole: assignment.roles[0],
      department: roleCatalog[assignment.roles[0]]?.department ?? "",
      enabled: true,
      roles: assignment.roles,
      employeeId: employee.employeeId,
      source: subaccountSource,
      accountType: "subaccount",
      accountStatus: "draft",
      loginEnabled: false,
      passwordStatus: "not_issued",
      mustChangePassword: false,
      authMethods: ["password"],
      permissionAllowlist: assignment.allowPermissions,
      permissionDenylist: assignment.denyPermissions,
      permissionRevision: 1,
      permissionsUpdatedBy: operatorId,
      permissionsUpdatedAt: changedAt,
      accountCreatedBy: operatorId,
      accountCreatedAt: changedAt,
      accountStatusUpdatedBy: operatorId,
      accountStatusUpdatedAt: changedAt,
      accountStatusReason: reason,
      sessionVersion: 0,
      updatedAt: changedAt,
    };
    const staged = stageWorkspace(workspace);
    upsertRuntimeUser(staged, user);
    const operationLog = addAudit(staged, {
      targetType: "master_data_subaccount",
      targetId: userId,
      action: "master_data_subaccount_created",
      before: null,
      after: auditSnapshot(user),
      reason,
      operatorId,
      occurredAt: changedAt,
    });
    await persistAndCommit(workspace, staged);
    return success({ subaccount: projectSubaccount(staged, user), operationLogId: operationLog.id }, 201);
  }

  async function updateSubaccount({ workspace, userId, body = {}, operatorId, operatorPermissions = [] }) {
    const context = getSubaccountContext(workspace, userId);
    if (context.result) return context.result;
    if (context.userId === cleanText(operatorId)) return selfMutationError();
    if (resolveAccountStatus(context.before) === "disabled") {
      return businessError(409, "SUBACCOUNT_DISABLED_IMMUTABLE", "已停用子账号不能再修改权限或资料。");
    }
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Math.max(0, Number(context.before.permissionRevision) || 0)) {
      return businessError(409, "SUBACCOUNT_PERMISSION_REVISION_CONFLICT", "权限版本已变化，请刷新后重试。");
    }
    const reason = cleanText(body.reason);
    if (!reason) return businessError(400, "SUBACCOUNT_REASON_REQUIRED", "调整子账号必须填写原因。");
    const assignment = validateAssignment(body, operatorPermissions);
    if (assignment.error) return assignment.error;
    const employee = validateEmployeeBinding(workspace, body.employeeId, context.userId);
    if (employee.error) return employee.error;
    const displayName = cleanText(body.displayName);
    if (!displayName) return businessError(400, "SUBACCOUNT_DISPLAY_NAME_REQUIRED", "子账号显示名称不能为空。");

    const changedAt = now().toISOString();
    const updated = {
      ...context.before,
      displayName,
      employeeId: employee.employeeId,
      defaultRole: assignment.roles[0],
      department: roleCatalog[assignment.roles[0]]?.department ?? "",
      roles: assignment.roles,
      permissionAllowlist: assignment.allowPermissions,
      permissionDenylist: assignment.denyPermissions,
      permissionRevision: expectedRevision + 1,
      permissionsUpdatedBy: operatorId,
      permissionsUpdatedAt: changedAt,
      updatedAt: changedAt,
    };
    const staged = stageWorkspace(workspace);
    upsertRuntimeUser(staged, updated);
    const operationLog = addAudit(staged, {
      targetType: "master_data_subaccount_permission",
      targetId: context.userId,
      action: "master_data_subaccount_permission_updated",
      before: auditSnapshot(context.before),
      after: auditSnapshot(updated),
      reason,
      operatorId,
      occurredAt: changedAt,
    });
    await persistAndCommit(workspace, staged);
    return success({ subaccount: projectSubaccount(staged, updated), operationLogId: operationLog.id });
  }

  async function issueTemporaryPassword({ workspace, userId, body = {}, operatorId }) {
    const context = getSubaccountContext(workspace, userId);
    if (context.result) return context.result;
    if (context.userId === cleanText(operatorId)) return selfMutationError();
    const status = resolveAccountStatus(context.before);
    if (status === "disabled") return businessError(409, "SUBACCOUNT_DISABLED_IMMUTABLE", "已停用子账号不能发放密码。");
    const reason = cleanText(body.reason);
    if (!reason) return businessError(400, "SUBACCOUNT_REASON_REQUIRED", "发放临时密码必须填写原因。");
    const changedAt = now().toISOString();
    const credential = issueRuntimeUserTemporaryPassword(context.before, {
      authSecret: getWorkspaceSecurityPolicy(workspace).authSecret,
      nowMs: now().getTime(),
    });
    const { temporaryPassword, ...credentialState } = credential;
    const updated = {
      ...context.before,
      ...credentialState,
      enabled: true,
      loginEnabled: true,
      accountStatus: "active",
      passwordIssuedBy: operatorId,
      accountStatusUpdatedBy: operatorId,
      accountStatusUpdatedAt: changedAt,
      accountStatusReason: reason,
      sessionValidAfter: changedAt,
      sessionVersion: nextRuntimeSessionVersion(context.before.sessionVersion),
      updatedAt: changedAt,
    };
    const staged = stageWorkspace(workspace);
    upsertRuntimeUser(staged, updated);
    const operationLog = addAudit(staged, {
      targetType: "master_data_subaccount_password",
      targetId: context.userId,
      action: "master_data_subaccount_temporary_password_issued",
      before: securityAuditSnapshot(context.before),
      after: securityAuditSnapshot(updated),
      reason,
      operatorId,
      occurredAt: changedAt,
    });
    await persistAndCommit(workspace, staged);
    return success({
      subaccount: projectSubaccount(staged, updated),
      credential: { userId: context.userId, loginName: updated.loginName, temporaryPassword, issuedAt: changedAt },
      operationLogId: operationLog.id,
    });
  }

  async function suspendSubaccount(input) {
    return updateAccountStatus(input, "suspended", "master_data_subaccount_suspended");
  }

  async function reactivateSubaccount(input) {
    return updateAccountStatus(input, "active", "master_data_subaccount_reactivated");
  }

  async function disableSubaccount(input) {
    return updateAccountStatus(input, "disabled", "master_data_subaccount_disabled");
  }

  async function updateAccountStatus({ workspace, userId, body = {}, operatorId }, nextStatus, action) {
    const context = getSubaccountContext(workspace, userId);
    if (context.result) return context.result;
    if (context.userId === cleanText(operatorId)) return selfMutationError();
    const currentStatus = resolveAccountStatus(context.before);
    if (currentStatus === "disabled") return businessError(409, "SUBACCOUNT_DISABLED_IMMUTABLE", "已停用子账号不可恢复或重复操作。");
    if (nextStatus === "active" && currentStatus !== "suspended") {
      return businessError(409, "SUBACCOUNT_STATUS_TRANSITION_INVALID", "只有已暂停子账号可以恢复。");
    }
    if (nextStatus === "suspended" && currentStatus !== "active") {
      return businessError(409, "SUBACCOUNT_STATUS_TRANSITION_INVALID", "只有使用中的子账号可以暂停。");
    }
    const reason = cleanText(body.reason);
    if (!reason) return businessError(400, "SUBACCOUNT_REASON_REQUIRED", "账号状态变更必须填写原因。");
    const changedAt = now().toISOString();
    const hasCredential = Boolean(cleanText(context.before.passwordHash));
    const updated = {
      ...context.before,
      enabled: nextStatus === "active",
      loginEnabled: nextStatus === "active" && hasCredential,
      accountStatus: nextStatus,
      accountStatusUpdatedBy: operatorId,
      accountStatusUpdatedAt: changedAt,
      accountStatusReason: reason,
      sessionValidAfter: changedAt,
      sessionVersion: nextRuntimeSessionVersion(context.before.sessionVersion),
      updatedAt: changedAt,
    };
    const staged = stageWorkspace(workspace);
    upsertRuntimeUser(staged, updated);
    const operationLog = addAudit(staged, {
      targetType: "master_data_subaccount",
      targetId: context.userId,
      action,
      before: securityAuditSnapshot(context.before),
      after: securityAuditSnapshot(updated),
      reason,
      operatorId,
      occurredAt: changedAt,
    });
    await persistAndCommit(workspace, staged);
    return success({ subaccount: projectSubaccount(staged, updated), operationLogId: operationLog.id });
  }

  function addAudit(workspace, input) {
    const operationLog = buildOperationLog(workspace, { ...input, pageKey: "master_data" });
    workspace.operationLogs.unshift(operationLog);
    return operationLog;
  }
}

function validateAssignment(body, operatorPermissions) {
  const roles = normalizeRoleKeys(body.roleKeys).filter((roleKey) => humanRoleKeys.includes(roleKey));
  if (!roles.length) return { error: businessError(400, "SUBACCOUNT_ROLE_REQUIRED", "请至少选择一个岗位。") };
  const catalog = getPermissionCatalog();
  const known = new Set(catalog.map((item) => item.permissionKey));
  const allowPermissions = unique(body.permissionAllowlist).map(cleanText);
  const denyPermissions = unique(body.permissionDenylist).map(cleanText);
  const invalid = [...allowPermissions, ...denyPermissions].filter((permissionKey) => !known.has(permissionKey));
  if (invalid.length) return { error: businessError(400, "SUBACCOUNT_PERMISSION_UNKNOWN", "存在系统未登记的权限项。", { permissionKeys: invalid }) };
  const resolved = resolvePermissionAssignment({ roles, permissionAllowlist: allowPermissions, permissionDenylist: denyPermissions });
  const operatorSet = new Set((Array.isArray(operatorPermissions) ? operatorPermissions : []).map(cleanText));
  if (!operatorSet.has("permission.manage")) {
    return { error: businessError(403, "SUBACCOUNT_PERMISSION_MANAGE_REQUIRED", "当前账号没有子账号权限管理能力。") };
  }
  const escalation = allowPermissions.filter((permissionKey) => !operatorSet.has(permissionKey));
  if (escalation.length) {
    return { error: businessError(403, "SUBACCOUNT_PERMISSION_ESCALATION_BLOCKED", "单项额外权限不能超过当前管理员自己的权限；请改用已审核的权限模板或由更高权限管理员处理。", { permissionKeys: escalation }) };
  }
  return resolved;
}

function validateEmployeeBinding(workspace, employeeId, currentUserId = "") {
  const safeEmployeeId = cleanText(employeeId);
  if (!safeEmployeeId) return { employeeId: "" };
  const employee = (workspace.employees ?? []).find((item) => cleanText(item.id) === safeEmployeeId);
  if (!employee) return { error: businessError(400, "SUBACCOUNT_EMPLOYEE_NOT_FOUND", "绑定的员工不存在。") };
  const conflict = (workspace.users ?? []).find((user) =>
    cleanText(user.userId ?? user.id) !== cleanText(currentUserId) &&
    cleanText(user.employeeId) === safeEmployeeId &&
    cleanText(user.source) === subaccountSource &&
    resolveAccountStatus(user) !== "disabled",
  );
  if (conflict) return { error: businessError(409, "SUBACCOUNT_EMPLOYEE_BINDING_CONFLICT", "该员工已绑定另一个未停用子账号。") };
  return { employeeId: safeEmployeeId };
}

function buildPermissionCatalogProjection() {
  return {
    roles: humanRoleKeys.map((roleKey) => ({
      roleKey,
      displayName: roleCatalog[roleKey].displayName,
      department: roleCatalog[roleKey].department,
      permissionCount: unique([...roleCatalog[roleKey].buttonPermissions, ...roleCatalog[roleKey].actionPermissions]).length,
    })),
    permissions: getPermissionCatalog(),
  };
}

function projectSubaccount(workspace, user) {
  const safe = sanitizeRuntimeUserForResponse(user);
  const assignment = resolvePermissionAssignment({
    roles: user.roles,
    permissionAllowlist: user.permissionAllowlist,
    permissionDenylist: user.permissionDenylist,
  });
  const employee = (workspace.employees ?? []).find((item) => cleanText(item.id) === cleanText(user.employeeId));
  const lastAudit = (workspace.operationLogs ?? []).find((log) => cleanText(log.targetId) === cleanText(user.userId ?? user.id));
  return {
    ...safe,
    accountStatus: resolveAccountStatus(user),
    accountStatusLabel: accountStatusLabel(resolveAccountStatus(user)),
    employeeName: cleanText(employee?.name),
    roleLabels: assignment.roles.map((roleKey) => roleCatalog[roleKey]?.displayName ?? roleKey),
    effectiveButtonPermissions: assignment.buttonPermissions,
    effectiveActionPermissions: assignment.actionPermissions,
    effectivePermissionCount: unique([...assignment.buttonPermissions, ...assignment.actionPermissions]).length,
    lastAudit: lastAudit ? {
      action: cleanText(lastAudit.action),
      reason: cleanText(lastAudit.reason),
      operatorId: cleanText(lastAudit.operatorId),
      occurredAt: cleanText(lastAudit.occurredAt),
    } : null,
  };
}

function getSubaccountContext(workspace, userId) {
  const safeUserId = cleanText(userId);
  const before = findRuntimeUserById(workspace, safeUserId);
  if (!before || cleanText(before.source) !== subaccountSource) return { result: notFound("SUBACCOUNT_NOT_FOUND") };
  return { before, userId: safeUserId };
}

function findUserByLoginName(workspace, loginName) {
  return (workspace.users ?? []).find((user) => normalizeLoginName(user.loginName) === loginName) ?? null;
}

function resolveAccountStatus(user) {
  const explicit = cleanText(user.accountStatus);
  if (accountStatuses.has(explicit)) return explicit;
  if (user.enabled === false) return "suspended";
  if (user.loginEnabled === true) return "active";
  return "draft";
}

function accountStatusLabel(status) {
  return { draft: "未启用", active: "使用中", suspended: "已暂停", disabled: "已停用" }[status] ?? status;
}

function buildSubaccountUserId(value, users = []) {
  const existing = new Set((users ?? []).map((user) => cleanText(user.userId ?? user.id)));
  const source = cleanText(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
  let candidate = `U-SUB-${source.slice(0, 10) || Date.now().toString(36).toUpperCase()}`;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `U-SUB-${source.slice(0, 7)}-${suffix++}`;
  return candidate;
}

function auditSnapshot(user) {
  return {
    userId: cleanText(user.userId ?? user.id),
    loginName: cleanText(user.loginName),
    displayName: cleanText(user.displayName),
    employeeId: cleanText(user.employeeId),
    roles: normalizeRoleKeys(user.roles),
    permissionAllowlist: unique(user.permissionAllowlist).map(cleanText),
    permissionDenylist: unique(user.permissionDenylist).map(cleanText),
    permissionRevision: Math.max(0, Number(user.permissionRevision) || 0),
    accountStatus: resolveAccountStatus(user),
  };
}

function securityAuditSnapshot(user) {
  return {
    userId: cleanText(user.userId ?? user.id),
    accountStatus: resolveAccountStatus(user),
    enabled: user.enabled !== false,
    loginEnabled: user.loginEnabled === true,
    passwordStatus: cleanText(user.passwordStatus),
    mustChangePassword: user.mustChangePassword === true,
    sessionVersion: Number(user.sessionVersion) || 0,
  };
}

async function persistAndCommit(workspace, staged) {
  await persistRuntimeIdentityState(staged);
  workspace.users = staged.users;
  workspace.operationLogs = staged.operationLogs;
}

function stageWorkspace(workspace) {
  return {
    ...workspace,
    users: (workspace.users ?? []).map((user) => ({ ...user })),
    operationLogs: [...(workspace.operationLogs ?? [])],
  };
}

function selfMutationError() {
  return businessError(409, "SUBACCOUNT_SELF_MUTATION_BLOCKED", "不能在当前登录会话中修改、暂停或停用自己的账号。");
}

function normalizeLoginName(value) {
  return cleanText(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function success(response, statusCode = 200) {
  return { statusCode, response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message, details = undefined) {
  return { error: true, statusCode, code, message, ...(details ? { details } : {}) };
}
