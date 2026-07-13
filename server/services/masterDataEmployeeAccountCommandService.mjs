import { issueRuntimeUserTemporaryPassword } from "../authSeed.mjs";
import { getWorkspaceSecurityPolicy } from "../apiSecurityPolicy.mjs";
import {
  getEmployeeAccountDepartment,
  getEmployeeAccountRoleLabel,
  normalizeEmployeeAccountRoleKey,
  validateEmployeeAccountIdentity,
  validateEnabledEmployeeAccountReview,
} from "./runtimeEmployeeAccountPolicy.mjs";
import {
  findRuntimeUserByEmployeeId,
  findRuntimeUserById,
  nextRuntimeSessionVersion,
  persistRuntimeIdentityState,
  sanitizeRuntimeUserForResponse,
  upsertRuntimeUser,
} from "./runtimeIdentityWorkspace.mjs";

const employeeAssignmentModes = new Set(["fixed_machine", "general_worker", "unassigned"]);
const defaultEmployeeAssignmentMachines = Object.freeze(
  Array.from({ length: 9 }, (_, index) => {
    const machineNumber = index + 1;
    return Object.freeze({
      machineId: `BAG-${String(machineNumber).padStart(2, "0")}`,
      machineLabel: `${machineNumber}号机`,
      workshop: `${Math.ceil(machineNumber / 3)}号车间`,
      enabled: true,
    });
  }),
);

export function createMasterDataEmployeeAccountCommandService(dependencies = {}) {
  const {
    buildOperationLog,
    now = () => new Date(),
  } = dependencies;
  if (typeof buildOperationLog !== "function") {
    throw new TypeError("buildOperationLog must be a function");
  }

  return {
    enableEmployeeAccount,
    issueEmployeeTemporaryPassword,
    revokeEmployeePassword,
    updateEmployeeAssignment,
  };

  async function updateEmployeeAssignment({ workspace, employeeId, body = {}, operatorId }) {
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before, employeeIndex } = context;
    const assignmentMode = cleanText(body.assignmentMode) || "unassigned";
    if (!employeeAssignmentModes.has(assignmentMode)) {
      return businessError(400, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_MODE_INVALID", "Unknown employee assignment mode.");
    }

    const assignmentOptions = buildEmployeeAssignmentOptions(workspace);
    const requestedWorkshop = cleanText(body.workshop);
    const requestedMachineId = cleanText(body.machineId);
    let defaultWorkshop = "";
    let defaultMachineId = "";
    if (assignmentMode === "fixed_machine") {
      const machine = assignmentOptions.machines.find((item) => item.machineId === requestedMachineId && item.enabled !== false);
      if (!machine) {
        return businessError(409, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_MACHINE_NOT_FOUND", "Selected machine is unavailable.");
      }
      defaultWorkshop = requestedWorkshop || machine.workshop;
      if (!defaultWorkshop) {
        return businessError(400, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_REQUIRED", "Workshop is required for a fixed-machine assignment.");
      }
      if (machine.workshop && machine.workshop !== defaultWorkshop) {
        return businessError(409, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_MISMATCH", "Selected machine does not belong to the selected workshop.");
      }
      defaultMachineId = machine.machineId;
    } else if (assignmentMode === "general_worker") {
      if (!requestedWorkshop) {
        return businessError(400, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_REQUIRED", "Workshop is required for a general-worker assignment.");
      }
      defaultWorkshop = requestedWorkshop;
    }

    const changedAt = cleanText(body.changedAt) || now().toISOString();
    const reason = cleanText(body.reason) || "管理员手动调整员工车间 / 机台";
    const updatedEmployee = {
      ...before,
      defaultWorkshop,
      defaultMachineId,
      assignmentMode,
      assignmentUpdatedBy: operatorId,
      assignmentUpdatedAt: changedAt,
      assignmentNote: reason,
      updatedAt: changedAt,
    };
    const stagedWorkspace = stageWorkspace(workspace);
    stagedWorkspace.employees[employeeIndex] = updatedEmployee;
    const existingUser = resolveEmployeeRuntimeUser(stagedWorkspace, updatedEmployee);
    if (existingUser) {
      upsertRuntimeUser(stagedWorkspace, {
        ...existingUser,
        defaultMachineId,
        metadata: {
          ...(existingUser.metadata ?? {}),
          defaultWorkshop,
          assignmentMode,
        },
        updatedAt: changedAt,
      });
    }
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_assignment",
      targetId: updatedEmployee.id,
      action: "master_data_employee_assignment_updated",
      before: {
        employeeId: before.id,
        defaultWorkshop: cleanText(before.defaultWorkshop),
        defaultMachineId: cleanText(before.defaultMachineId),
        assignmentMode: getEmployeeAssignmentMode(before),
      },
      after: {
        employeeId: updatedEmployee.id,
        defaultWorkshop,
        defaultMachineId,
        assignmentMode,
      },
      reason,
      operatorId,
      pageKey: "master_data",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    return success({
      employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, stagedWorkspace.users),
      assignmentOptions,
      operationLogId: operationLog.id,
    });
  }

  async function enableEmployeeAccount({ workspace, employeeId, body = {}, operatorId }) {
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before, employeeIndex } = context;
    const existingUser = resolveEmployeeRuntimeUser(workspace, before);
    const reviewedAt = cleanText(body.reviewedAt) || now().toISOString();
    const roleKey = normalizeEmployeeAccountRoleKey(
      body.roleKey || existingUser?.defaultRole,
      before.roleName,
    );
    const userId =
      cleanText(body.userId) ||
      cleanText(before.userId) ||
      cleanText(existingUser?.userId) ||
      buildEmployeeAccountUserId(before);
    const loginName =
      cleanText(body.loginName) ||
      cleanText(before.loginName) ||
      cleanText(existingUser?.loginName) ||
      buildEmployeeAccountLoginName(before);
    const reviewNote =
      cleanText(body.reviewNote ?? body.note) || "管理员复核启用导入员工账号";
    const effectiveBefore = buildEffectiveEmployeeAccount(before, existingUser);
    const reviewLockError = validateEnabledEmployeeAccountReview(effectiveBefore, {
      userId,
      loginName,
      roleKey,
    });
    if (reviewLockError) return businessError(409, reviewLockError.code, reviewLockError.message);
    const identityError = validateEmployeeAccountIdentity(workspace, {
      employeeId: context.employeeId,
      userId,
      loginName,
    });
    if (identityError) return businessError(409, identityError.code, identityError.message);

    const updatedEmployee = {
      ...before,
      userId,
      loginName,
      accountEnabled: true,
      profileStatus: "account_enabled",
      reviewedBy: operatorId,
      reviewedAt,
      reviewedRoleKey: roleKey,
      reviewNote,
      updatedAt: reviewedAt,
    };
    const stagedWorkspace = stageWorkspace(workspace);
    stagedWorkspace.employees[employeeIndex] = updatedEmployee;
    const user = upsertMasterDataEmployeeUser(stagedWorkspace, updatedEmployee, {
      roleKey,
      reviewedAt,
      existingUser,
      reviewedBy: operatorId,
      reviewNote,
    });
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_account_review",
      targetId: updatedEmployee.id,
      action: "master_data_employee_account_enabled",
      before: {
        employeeId: before.id,
        userId: before.userId,
        accountEnabled: before.accountEnabled === true,
        profileStatus: before.profileStatus,
      },
      after: {
        employeeId: updatedEmployee.id,
        userId: updatedEmployee.userId,
        loginName: updatedEmployee.loginName,
        accountEnabled: true,
        profileStatus: updatedEmployee.profileStatus,
        reviewedRoleKey: roleKey,
      },
      reason: reviewNote,
      operatorId,
      pageKey: "master_data",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    return success({
      employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, stagedWorkspace.users),
      employee: updatedEmployee,
      user: sanitizeRuntimeUserForResponse(user),
      operationLogId: operationLog.id,
    });
  }

  async function issueEmployeeTemporaryPassword({
    workspace,
    employeeId,
    body = {},
    operatorId,
  }) {
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before, employeeIndex } = context;
    const existingUser = resolveEmployeeRuntimeUser(workspace, before);
    const effectiveBefore = buildEffectiveEmployeeAccount(before, existingUser);
    if (!isEmployeeAccountEnabled(effectiveBefore)) {
      return businessError(
        409,
        "MASTER_DATA_EMPLOYEE_ACCOUNT_NOT_ENABLED",
        "Employee account must be reviewed and enabled before issuing a temporary password.",
      );
    }

    const issuedAt = cleanText(body.issuedAt) || now().toISOString();
    const roleKey = normalizeEmployeeAccountRoleKey(
      "",
      effectiveBefore.reviewedRoleKey || before.roleName,
    );
    const userId = cleanText(effectiveBefore.userId) || buildEmployeeAccountUserId(before);
    const loginName =
      cleanText(effectiveBefore.loginName) || buildEmployeeAccountLoginName(before);
    const reviewLockError = validateEnabledEmployeeAccountReview(effectiveBefore, {
      userId: cleanText(body.userId) || userId,
      loginName: cleanText(body.loginName) || loginName,
      roleKey: cleanText(body.roleKey) || roleKey,
    });
    if (reviewLockError) return businessError(409, reviewLockError.code, reviewLockError.message);
    const identityError = validateEmployeeAccountIdentity(workspace, {
      employeeId: context.employeeId,
      userId,
      loginName,
    });
    if (identityError) return businessError(409, identityError.code, identityError.message);

    const issueNote =
      cleanText(body.issueNote ?? body.note) || "管理员发放员工临时登录密码";
    const issuedPassword = issueRuntimeUserTemporaryPassword(
      { userId, loginName },
      {
        temporaryPassword: cleanText(body.temporaryPassword),
        nowMs: Date.parse(issuedAt) || now().getTime(),
        authSecret: getWorkspaceSecurityPolicy(workspace).authSecret,
      },
    );
    const updatedEmployee = {
      ...before,
      userId,
      loginName,
      accountEnabled: true,
      profileStatus: "account_enabled",
      reviewedRoleKey: roleKey,
      loginEnabled: true,
      passwordStatus: issuedPassword.passwordStatus,
      passwordIssuedBy: operatorId,
      passwordIssuedAt: issuedPassword.passwordIssuedAt,
      mustChangePassword: true,
      passwordIssueNote: issueNote,
      passwordExpiresAt: "",
      passwordExpiredAt: "",
      failedLoginCount: 0,
      lastFailedLoginAt: "",
      lockedUntil: "",
      sessionValidAfter: issuedPassword.passwordIssuedAt,
      updatedAt: issuedPassword.passwordIssuedAt,
    };
    const stagedWorkspace = stageWorkspace(workspace);
    stagedWorkspace.employees[employeeIndex] = updatedEmployee;
    const baseUser = upsertMasterDataEmployeeUser(stagedWorkspace, updatedEmployee, {
      roleKey,
      reviewedAt: issuedPassword.passwordIssuedAt,
      existingUser,
    });
    const user = upsertRuntimeUser(stagedWorkspace, {
      ...baseUser,
      loginEnabled: true,
      passwordHash: issuedPassword.passwordHash,
      passwordStatus: issuedPassword.passwordStatus,
      passwordIssuedBy: operatorId,
      passwordIssuedAt: issuedPassword.passwordIssuedAt,
      mustChangePassword: true,
      passwordExpiresAt: "",
      passwordExpiredAt: "",
      failedLoginCount: 0,
      lastFailedLoginAt: "",
      lockedUntil: "",
      sessionValidAfter: issuedPassword.passwordIssuedAt,
      sessionVersion: nextRuntimeSessionVersion(existingUser?.sessionVersion),
      updatedAt: issuedPassword.passwordIssuedAt,
    });
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_account_password",
      targetId: updatedEmployee.id,
      action: "master_data_employee_account_password_issued",
      before: {
        employeeId: before.id,
        userId: before.userId,
        loginName: before.loginName,
        passwordIssuedAt: before.passwordIssuedAt,
        passwordStatus: before.passwordStatus,
      },
      after: {
        employeeId: updatedEmployee.id,
        userId: updatedEmployee.userId,
        loginName: updatedEmployee.loginName,
        passwordIssuedAt: updatedEmployee.passwordIssuedAt,
        passwordStatus: updatedEmployee.passwordStatus,
        loginEnabled: true,
        mustChangePassword: true,
        lockedUntil: "",
      },
      reason: issueNote,
      operatorId,
      pageKey: "master_data",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    return success({
      employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, stagedWorkspace.users),
      issuedCredential: {
        userId,
        loginName,
        temporaryPassword: issuedPassword.temporaryPassword,
        passwordIssuedAt: issuedPassword.passwordIssuedAt,
        passwordStatus: issuedPassword.passwordStatus,
        mustChangePassword: true,
        visibleOnce: true,
      },
      user: sanitizeRuntimeUserForResponse(user),
      operationLogId: operationLog.id,
    });
  }

  async function revokeEmployeePassword({ workspace, employeeId, body = {}, operatorId }) {
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before, employeeIndex } = context;
    const runtimeUser = resolveEmployeeRuntimeUser(workspace, before);
    const userId = cleanText(before.userId) || cleanText(runtimeUser?.userId);
    if (!userId) {
      return businessError(
        409,
        "MASTER_DATA_EMPLOYEE_ACCOUNT_NOT_ENABLED",
        "Employee account must be reviewed and enabled before revoking password.",
      );
    }

    const revokedAt = cleanText(body.revokedAt) || now().toISOString();
    const revokeNote =
      cleanText(body.revokeNote ?? body.note) || "管理员撤销员工登录密码";
    const updatedEmployee = {
      ...before,
      userId,
      loginName: cleanText(before.loginName) || cleanText(runtimeUser?.loginName),
      accountEnabled: true,
      profileStatus: "account_enabled",
      reviewedRoleKey:
        cleanText(before.reviewedRoleKey) || cleanText(runtimeUser?.defaultRole),
      loginEnabled: false,
      passwordStatus: "password_revoked",
      mustChangePassword: false,
      passwordRevokedBy: operatorId,
      passwordRevokedAt: revokedAt,
      passwordRevokeNote: revokeNote,
      passwordExpiresAt: "",
      passwordExpiredAt: "",
      failedLoginCount: 0,
      lastFailedLoginAt: "",
      lockedUntil: "",
      sessionValidAfter: revokedAt,
      updatedAt: revokedAt,
    };
    const stagedWorkspace = stageWorkspace(workspace);
    stagedWorkspace.employees[employeeIndex] = updatedEmployee;
    const updatedUser = runtimeUser
      ? upsertRuntimeUser(stagedWorkspace, {
          ...runtimeUser,
          loginEnabled: false,
          passwordHash: "",
          passwordStatus: "password_revoked",
          mustChangePassword: false,
          passwordRevokedBy: operatorId,
          passwordRevokedAt: revokedAt,
          passwordExpiresAt: "",
          passwordExpiredAt: "",
          failedLoginCount: 0,
          lastFailedLoginAt: "",
          lockedUntil: "",
          sessionValidAfter: revokedAt,
          sessionVersion: nextRuntimeSessionVersion(runtimeUser.sessionVersion),
          updatedAt: revokedAt,
        })
      : null;
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_account_password",
      targetId: updatedEmployee.id,
      action: "master_data_employee_account_password_revoked",
      before: {
        employeeId: before.id,
        userId: before.userId,
        loginName: before.loginName,
        loginEnabled: before.loginEnabled === true,
        passwordStatus: before.passwordStatus,
        mustChangePassword: before.mustChangePassword === true,
        passwordIssuedAt: before.passwordIssuedAt,
        passwordChangedAt: before.passwordChangedAt,
      },
      after: {
        employeeId: updatedEmployee.id,
        userId: updatedEmployee.userId,
        loginName: updatedEmployee.loginName,
        loginEnabled: false,
        passwordStatus: updatedEmployee.passwordStatus,
        mustChangePassword: false,
        passwordRevokedAt: revokedAt,
        sessionsRevokedAfter: revokedAt,
      },
      reason: revokeNote,
      operatorId,
      pageKey: "master_data",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    return success({
      revoked: true,
      employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, stagedWorkspace.users),
      user: updatedUser ? sanitizeRuntimeUserForResponse(updatedUser) : null,
      sessionsRevokedAfter: revokedAt,
      operationLogId: operationLog.id,
    });
  }
}

export function toMasterDataEmployeeAccountReview(employee = {}, users = []) {
  const employeeId = cleanText(employee.id);
  const user = findEmployeeReviewUser(employee, users);
  const userId = cleanText(employee.userId) || cleanText(user?.userId ?? user?.id);
  const accountEnabled =
    employee.accountEnabled === true ||
    cleanText(employee.profileStatus) === "account_enabled" ||
    Boolean(user && user.enabled !== false);
  const roleKey =
    cleanText(employee.reviewedRoleKey) ||
    cleanText(user?.defaultRole) ||
    normalizeEmployeeAccountRoleKey("", employee.roleName);
  const userPasswordStatus = cleanText(user?.passwordStatus);
  const employeePasswordStatus = cleanText(employee.passwordStatus);
  return {
    employeeId,
    bizNo: cleanText(employee.bizNo) || employeeId,
    name: cleanText(employee.name),
    roleName: cleanText(employee.roleName),
    defaultWorkshop: cleanText(employee.defaultWorkshop),
    defaultMachineId: cleanText(employee.defaultMachineId),
    assignmentMode: getEmployeeAssignmentMode(employee),
    assignmentUpdatedBy: cleanText(employee.assignmentUpdatedBy),
    assignmentUpdatedAt: cleanText(employee.assignmentUpdatedAt),
    assignmentNote: cleanText(employee.assignmentNote),
    requestedEnabled: employee.requestedEnabled === true,
    accountEnabled,
    profileStatus:
      accountEnabled
        ? "account_enabled"
        : cleanText(employee.profileStatus) || "pending_admin_review",
    status: accountEnabled ? "account_enabled" : "pending_admin_review",
    statusLabel: accountEnabled ? "已启用" : "待管理员复核",
    recommendedRoleKey: roleKey,
    recommendedRoleLabel: getEmployeeAccountRoleLabel(roleKey),
    loginName:
      cleanText(employee.loginName) ||
      cleanText(user?.loginName) ||
      buildEmployeeAccountLoginName(employee),
    userId,
    userDisplayName: cleanText(user?.displayName) || cleanText(employee.name),
    reviewedBy: cleanText(employee.reviewedBy) || cleanText(user?.accountReviewedBy),
    reviewedAt: cleanText(employee.reviewedAt) || cleanText(user?.accountReviewedAt),
    reviewNote: cleanText(employee.reviewNote) || cleanText(user?.accountReviewNote),
    loginEnabled: employee.loginEnabled === true || user?.loginEnabled === true,
    passwordIssuedAt: cleanText(employee.passwordIssuedAt) || cleanText(user?.passwordIssuedAt),
    passwordStatus:
      userPasswordStatus === "password_expired"
        ? userPasswordStatus
        : employeePasswordStatus || userPasswordStatus,
    passwordIssuedBy: cleanText(employee.passwordIssuedBy) || cleanText(user?.passwordIssuedBy),
    passwordChangedAt: cleanText(employee.passwordChangedAt) || cleanText(user?.passwordChangedAt),
    passwordChangedBy: cleanText(employee.passwordChangedBy) || cleanText(user?.passwordChangedBy),
    passwordRevokedAt: cleanText(employee.passwordRevokedAt) || cleanText(user?.passwordRevokedAt),
    passwordRevokedBy: cleanText(employee.passwordRevokedBy) || cleanText(user?.passwordRevokedBy),
    mustChangePassword: employee.mustChangePassword === true || user?.mustChangePassword === true,
    passwordExpiresAt: cleanText(employee.passwordExpiresAt) || cleanText(user?.passwordExpiresAt),
    passwordExpiredAt: cleanText(employee.passwordExpiredAt) || cleanText(user?.passwordExpiredAt),
    failedLoginCount: Number(user?.failedLoginCount ?? employee.failedLoginCount) || 0,
    lastFailedLoginAt: cleanText(user?.lastFailedLoginAt) || cleanText(employee.lastFailedLoginAt),
    lockedUntil: cleanText(user?.lockedUntil) || cleanText(employee.lockedUntil),
    remark: cleanText(employee.remark),
    actionRequired: !accountEnabled,
  };
}

export function buildEmployeeAssignmentOptions(workspace = {}) {
  const byMachineId = new Map(defaultEmployeeAssignmentMachines.map((machine) => [machine.machineId, { ...machine }]));
  for (const machine of workspace.machines ?? []) {
    const machineId = cleanText(machine?.machineId ?? machine?.id);
    if (!machineId) continue;
    byMachineId.set(machineId, {
      machineId,
      machineLabel: cleanText(machine?.machineLabel ?? machine?.name) || machineId,
      workshop: cleanText(machine?.workshop),
      enabled: machine?.enabled !== false && cleanText(machine?.status) !== "inactive",
    });
  }
  const machines = [...byMachineId.values()].sort((left, right) =>
    left.machineLabel.localeCompare(right.machineLabel, "zh-CN", { numeric: true }),
  );
  const workshops = [...new Set([
    "1号车间",
    "2号车间",
    "3号车间",
    ...machines.map((machine) => machine.workshop).filter(Boolean),
  ])];
  return { workshops, machines };
}

function getEmployeeAssignmentMode(employee = {}) {
  const stored = cleanText(employee.assignmentMode);
  if (employeeAssignmentModes.has(stored)) return stored;
  if (cleanText(employee.defaultMachineId)) return "fixed_machine";
  if (cleanText(employee.defaultWorkshop)) return "general_worker";
  return "unassigned";
}

function getEmployeeContext(workspace, employeeId) {
  const safeEmployeeId = cleanText(employeeId);
  if (!safeEmployeeId) {
    return {
      result: businessError(400, "MASTER_DATA_EMPLOYEE_ID_REQUIRED", "employeeId is required."),
    };
  }
  workspace.employees = Array.isArray(workspace.employees) ? workspace.employees : [];
  const employeeIndex = workspace.employees.findIndex(
    (item) => cleanText(item?.id) === safeEmployeeId,
  );
  if (employeeIndex < 0) {
    return { result: notFound("MASTER_DATA_EMPLOYEE_NOT_FOUND") };
  }
  return {
    employeeId: safeEmployeeId,
    employeeIndex,
    before: { ...workspace.employees[employeeIndex] },
  };
}

function resolveEmployeeRuntimeUser(workspace, employee) {
  return (
    findRuntimeUserById(workspace, employee.userId) ||
    findRuntimeUserByEmployeeId(workspace, employee.id)
  );
}

function buildEffectiveEmployeeAccount(employee, runtimeUser) {
  return {
    ...employee,
    userId: cleanText(employee.userId) || cleanText(runtimeUser?.userId),
    loginName: cleanText(employee.loginName) || cleanText(runtimeUser?.loginName),
    accountEnabled: isEmployeeAccountEnabled(employee) || Boolean(runtimeUser?.enabled),
    profileStatus:
      isEmployeeAccountEnabled(employee) || runtimeUser?.enabled
        ? "account_enabled"
        : cleanText(employee.profileStatus),
    reviewedRoleKey:
      cleanText(employee.reviewedRoleKey) || cleanText(runtimeUser?.defaultRole),
  };
}

function isEmployeeAccountEnabled(employee) {
  return (
    employee?.accountEnabled === true ||
    cleanText(employee?.profileStatus) === "account_enabled"
  );
}

function upsertMasterDataEmployeeUser(workspace, employee, options = {}) {
  const roleKey = normalizeEmployeeAccountRoleKey(options.roleKey, employee.roleName);
  const reviewedAt = cleanText(options.reviewedAt) || new Date().toISOString();
  const userId = cleanText(employee.userId) || buildEmployeeAccountUserId(employee);
  return upsertRuntimeUser(workspace, {
    ...(options.existingUser ?? {}),
    id: userId,
    userId,
    loginName: cleanText(employee.loginName) || buildEmployeeAccountLoginName(employee),
    displayName: cleanText(employee.name) || userId,
    defaultRole: roleKey,
    department: getEmployeeAccountDepartment(roleKey),
    defaultMachineId: cleanText(employee.defaultMachineId),
    enabled: true,
    roles: [roleKey],
    employeeId: cleanText(employee.id),
    source: "master_data_import_review",
    accountReviewedBy:
      cleanText(options.reviewedBy) || cleanText(options.existingUser?.accountReviewedBy),
    accountReviewedAt:
      cleanText(options.reviewedAt) || cleanText(options.existingUser?.accountReviewedAt),
    accountReviewNote:
      cleanText(options.reviewNote) || cleanText(options.existingUser?.accountReviewNote),
    updatedAt: reviewedAt,
  });
}

async function persistAndCommitIdentityWorkspace(workspace, stagedWorkspace) {
  await persistRuntimeIdentityState(stagedWorkspace);
  workspace.employees = stagedWorkspace.employees;
  workspace.users = stagedWorkspace.users;
  workspace.operationLogs = stagedWorkspace.operationLogs;
}

function stageWorkspace(workspace) {
  return {
    ...workspace,
    employees: (workspace.employees ?? []).map((item) => ({ ...item })),
    users: (workspace.users ?? []).map((item) => ({ ...item })),
    operationLogs: [...(workspace.operationLogs ?? [])],
  };
}

function findEmployeeReviewUser(employee, users) {
  const userList = users instanceof Map ? [...users.values()] : Array.isArray(users) ? users : [];
  const userId = cleanText(employee.userId);
  const employeeId = cleanText(employee.id);
  return (
    (userId
      ? userList.find((user) => cleanText(user?.userId ?? user?.id) === userId)
      : null) ||
    userList.find((user) => cleanText(user?.employeeId) === employeeId) ||
    null
  );
}

function buildEmployeeAccountUserId(employee = {}) {
  return `U-EMP-${safeRecordPart(employee.id || employee.bizNo || employee.name).toUpperCase()}`;
}

function buildEmployeeAccountLoginName(employee = {}) {
  const source =
    cleanText(employee.bizNo) || cleanText(employee.name) || cleanText(employee.id);
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `emp.${normalized || safeRecordPart(employee.id).toLowerCase()}`;
}

function safeRecordPart(value) {
  return cleanText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "TASK";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function success(response) {
  return { statusCode: 200, response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}
