import { getSeedUsers } from "../authSeed.mjs";
import {
  normalizeV1RuntimeEmployeeRoleKey,
  roleCatalog,
} from "../../shared/auth/roleCatalog.js";

export function normalizeEmployeeAccountRoleKey(roleKey, roleName = "") {
  return normalizeV1RuntimeEmployeeRoleKey(roleKey, roleName) || "workshop";
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
  const changed =
    (text(employee.userId) && text(employee.userId) !== text(requested.userId)) ||
    (text(employee.loginName) && text(employee.loginName).toLowerCase() !== text(requested.loginName).toLowerCase()) ||
    (currentRoleKey && currentRoleKey !== text(requested.roleKey));
  return changed
    ? conflict(
        "MASTER_DATA_EMPLOYEE_ACCOUNT_REVIEW_LOCKED",
        "Enabled employee identity or role cannot be changed through account enable/password actions.",
      )
    : null;
}

function conflict(code, message) {
  return { code, message };
}

function text(value) {
  return String(value ?? "").trim();
}
