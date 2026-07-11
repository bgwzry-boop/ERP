import { getSeedUsers } from "../authSeed.mjs";
import { roleCatalog } from "../../shared/auth/roleCatalog.js";

const runtimeEmployeeRoleKeys = new Set([
  "office",
  "warehouse",
  "finance",
  "management",
  "technical_operations",
  "driver",
  "workshop",
  "packing",
]);

export function normalizeEmployeeAccountRoleKey(roleKey, roleName = "") {
  const normalized = text(roleKey);
  if (runtimeEmployeeRoleKeys.has(normalized)) return normalized;
  const name = text(roleName);
  if (/技术运维|系统运维|运维/.test(name)) return "technical_operations";
  if (/管理|主管|负责人/.test(name)) return "management";
  if (/办公室|文员|录单|客服/.test(name)) return "office";
  if (/财务|对账|收款/.test(name)) return "finance";
  if (/库房|出库|仓库/.test(name)) return "warehouse";
  if (/司机|送货/.test(name)) return "driver";
  if (/打包|杂工/.test(name)) return "packing";
  return "workshop";
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
