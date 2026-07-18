import { getSeedUsers } from "../authSeed.mjs";
import {
  normalizeV1RuntimeEmployeeRoleKeys,
  normalizeV1RuntimeEmployeeRoleKey,
  roleCatalog,
  splitV1RuntimeEmployeeRoleInputs,
} from "../../shared/auth/roleCatalog.js";

export const ownerAccountIdentityConfirmationEmployeeId = "ERP-0001";

export function normalizeEmployeeAccountRoleKey(roleKey, roleName = "") {
  return normalizeV1RuntimeEmployeeRoleKey(roleKey, roleName) || "workshop";
}

export function normalizeEmployeeAccountRoleKeys(roleKeys = [], primaryRoleKey = "", roleName = "") {
  const primary = normalizeEmployeeAccountRoleKey(primaryRoleKey, roleName);
  return [...new Set([
    primary,
    ...normalizeV1RuntimeEmployeeRoleKeys([roleKeys, roleName]),
  ])];
}

export function getInvalidEmployeeAccountRoleInputs(roleKeys = []) {
  return splitV1RuntimeEmployeeRoleInputs(roleKeys).filter(
    (value) => !normalizeV1RuntimeEmployeeRoleKey(value, value),
  );
}

export function getEmployeeAccountRoleLabel(roleKey) {
  return roleCatalog[roleKey]?.displayName ?? roleCatalog.workshop.displayName;
}

export function getEmployeeAccountDepartment(roleKey) {
  return roleCatalog[roleKey]?.department ?? roleCatalog.workshop.department;
}

export function validateEmployeeAccountIdentity(workspace = {}, input = {}) {
  const employeeId = text(input.employeeId);
  const userId = text(input.userId);
  const loginName = text(input.loginName);
  if (!userId || !loginName) {
    return conflict("MASTER_DATA_EMPLOYEE_ACCOUNT_IDENTITY_REQUIRED", "Employee user ID and login name are required.");
  }

  const normalizedLoginName = loginName.toLowerCase();
  const reservedSeed = getSeedUsers().find((user) =>
    text(user.userId) === userId || text(user.loginName).toLowerCase() === normalizedLoginName,
  );
  if (reservedSeed) {
    return conflict(
      "MASTER_DATA_EMPLOYEE_ACCOUNT_SEED_IDENTITY_CONFLICT",
      "Employee user ID or login name conflicts with a reserved prototype identity.",
    );
  }

  const conflictingUser = (Array.isArray(workspace.users) ? workspace.users : []).find((user) => {
    const sameEmployee = employeeId && text(user.employeeId) === employeeId;
    if (sameEmployee) return false;
    return (
      text(user.userId ?? user.id) === userId ||
      (normalizedLoginName && text(user.loginName).toLowerCase() === normalizedLoginName)
    );
  });
  if (conflictingUser) {
    return conflict(
      "MASTER_DATA_EMPLOYEE_ACCOUNT_IDENTITY_CONFLICT",
      "Employee user ID or login name is already assigned to another account.",
    );
  }

  const conflictingEmployee = (Array.isArray(workspace.employees) ? workspace.employees : []).find((employee) => {
    if (text(employee.id) === employeeId) return false;
    return (
      text(employee.userId) === userId ||
      (normalizedLoginName && text(employee.loginName).toLowerCase() === normalizedLoginName)
    );
  });
  if (conflictingEmployee) {
    return conflict(
      "MASTER_DATA_EMPLOYEE_ACCOUNT_IDENTITY_CONFLICT",
      "Employee user ID or login name is already assigned to another employee.",
    );
  }
  return null;
}

export function validateEnabledEmployeeAccountReview(employee = {}, requested = {}) {
  const accountEnabled = employee.accountEnabled === true || text(employee.profileStatus) === "account_enabled";
  if (!accountEnabled) return null;
  const currentRoleKey = text(employee.reviewedRoleKey);
  const currentRoleKeys = normalizeEmployeeAccountRoleKeys(
    employee.reviewedRoleKeys,
    currentRoleKey,
    employee.roleName,
  );
  const requestedRoleKeys = normalizeEmployeeAccountRoleKeys(
    requested.roleKeys,
    requested.roleKey,
    employee.roleName,
  );
  const changed =
    (text(employee.userId) && text(employee.userId) !== text(requested.userId)) ||
    (text(employee.loginName) && text(employee.loginName).toLowerCase() !== text(requested.loginName).toLowerCase()) ||
    (currentRoleKey && currentRoleKey !== text(requested.roleKey)) ||
    currentRoleKeys.length !== requestedRoleKeys.length ||
    currentRoleKeys.some((roleKey) => !requestedRoleKeys.includes(roleKey));
  return changed
    ? conflict(
        "MASTER_DATA_EMPLOYEE_ACCOUNT_REVIEW_LOCKED",
        "Enabled employee identity or role cannot be changed through account enable/password actions.",
      )
    : null;
}

export function getEmployeeAccountIdentityConfirmation(
  employee = {},
  roleKeys = [],
  operationLogs = [],
) {
  const employeeId = text(employee.id ?? employee.employeeId).toUpperCase();
  const name = text(employee.name);
  const normalizedRoleKeys = normalizeEmployeeAccountRoleKeys(
    roleKeys,
    employee.reviewedRoleKey,
    employee.roleName,
  );
  const required = employee.identityConfirmationRequired === true || (
    employeeId === ownerAccountIdentityConfirmationEmployeeId &&
    normalizedRoleKeys.includes("management") &&
    normalizedRoleKeys.includes("finance")
  );
  if (!required) {
    return {
      required: false,
      confirmed: false,
      status: "not_required",
      statusLabel: "无需身份确认",
      activationBlocked: false,
      blockerCode: "",
      blockerLabel: "",
      confirmedBy: "",
      confirmedAt: "",
      confirmationNote: "",
    };
  }

  const confirmationLog = (Array.isArray(operationLogs) ? operationLogs : []).find((log) => {
    if (
      text(log?.targetType ?? log?.target_type) !== "master_data_employee_identity_confirmation" ||
      text(log?.targetId ?? log?.target_id).toUpperCase() !== employeeId ||
      text(log?.action) !== "master_data_employee_identity_confirmed"
    ) return false;
    const after = log.after ?? log.after_json ?? {};
    const confirmedRoleKeys = normalizeEmployeeAccountRoleKeys(after.roleKeys, after.primaryRoleKey, "");
    return (
      text(after.employeeId).toUpperCase() === employeeId &&
      text(after.name) === name &&
      normalizedRoleKeys.length === confirmedRoleKeys.length &&
      normalizedRoleKeys.every((roleKey) => confirmedRoleKeys.includes(roleKey))
    );
  });
  const confirmed = Boolean(confirmationLog);
  return {
    required: true,
    confirmed,
    status: confirmed ? "confirmed" : "pending_confirmation",
    statusLabel: confirmed ? "身份已确认" : "身份待确认",
    activationBlocked: !confirmed,
    blockerCode: confirmed ? "" : "MASTER_DATA_EMPLOYEE_ACCOUNT_IDENTITY_CONFIRMATION_REQUIRED",
    blockerLabel: confirmed ? "" : "负责人身份和正式显示名待确认",
    confirmedBy: confirmed ? text(confirmationLog.operatorId ?? confirmationLog.operator_id) : "",
    confirmedAt: confirmed ? text(confirmationLog.occurredAt ?? confirmationLog.occurred_at) : "",
    confirmationNote: confirmed ? text(confirmationLog.reason) : "",
  };
}

export function validateEmployeeAccountIdentityConfirmation(employee = {}, roleKeys = [], operationLogs = []) {
  const confirmation = getEmployeeAccountIdentityConfirmation(employee, roleKeys, operationLogs);
  return confirmation.activationBlocked
    ? conflict(confirmation.blockerCode, "Employee identity and formal display name must be explicitly confirmed before account enablement.")
    : null;
}

function conflict(code, message) {
  return { code, message };
}

function text(value) {
  return String(value ?? "").trim();
}
