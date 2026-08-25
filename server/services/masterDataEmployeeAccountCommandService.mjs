import { issueRuntimeUserTemporaryPassword } from "../authSeed.mjs";
import { getWorkspaceSecurityPolicy } from "../apiSecurityPolicy.mjs";
import {
  getInvalidEmployeeAccountRoleInputs,
  getEmployeeAccountIdentityConfirmation,
  getEmployeeAccountDepartment,
  getEmployeeAccountRoleLabel,
  normalizeEmployeeAccountRoleKey,
  normalizeEmployeeAccountRoleKeys,
  validateEmployeeAccountIdentity,
  validateEmployeeAccountIdentityConfirmation,
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
import { normalizeMasterDataMachines } from "../masterDataMachineConfigurationRepository.mjs";
import { resolveConfiguredMasterDataMachine } from "../../shared/masterDataMachineIdentity.js";
import { findPayrollPosition } from "../../shared/payrollPositionCatalog.js";

const employeeAssignmentModes = new Set(["fixed_machine", "general_worker", "unassigned"]);

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
    enableEmployeeAccounts,
    departEmployeeAccount,
    issueEmployeeTemporaryPassword,
    revokeEmployeePassword,
    confirmEmployeeIdentity,
    mergeEmployeeIdentity,
    updateEmployeeAssignment,
    updateEmployeeProfile,
  };

  async function updateEmployeeProfile({ workspace, employeeId, body = {}, operatorId }) {
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before, employeeIndex } = context;
    const birthDate = normalizeOptionalIsoDate(body.birthDate, "birthDate");
    if (birthDate.error) return birthDate.error;
    const hireDate = normalizeOptionalIsoDate(body.hireDate, "hireDate");
    if (hireDate.error) return hireDate.error;
    const payrollPositionKey = cleanText(body.payrollPositionKey).toUpperCase();
    if (payrollPositionKey && !findPayrollPosition(payrollPositionKey)) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_PAYROLL_POSITION_INVALID",
        "工资岗位键不在已确认的岗位工资目录中。",
      );
    }
    const wageEffectiveFrom = normalizeOptionalIsoDate(
      body.wageEffectiveFrom,
      "wageEffectiveFrom",
    );
    if (wageEffectiveFrom.error) return wageEffectiveFrom.error;
    if (birthDate.value && hireDate.value && birthDate.value >= hireDate.value) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_PROFILE_DATE_ORDER_INVALID",
        "入职日期必须晚于出生日期。",
      );
    }
    if (hireDate.value && wageEffectiveFrom.value && wageEffectiveFrom.value < hireDate.value) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_WAGE_EFFECTIVE_DATE_INVALID",
        "工资生效日期不能早于入职日期。",
      );
    }
    const baseHourlyWage = normalizeNonNegativeMoney(body.baseHourlyWage, "baseHourlyWage");
    if (baseHourlyWage.error) return baseHourlyWage.error;
    const positionAllowanceHourly = normalizeNonNegativeMoney(
      body.positionAllowanceHourly,
      "positionAllowanceHourly",
    );
    if (positionAllowanceHourly.error) return positionAllowanceHourly.error;

    const attendanceProvider = cleanText(body.attendanceProvider).toLowerCase();
    const attendanceExternalId = cleanText(body.attendanceExternalId);
    if (Boolean(attendanceProvider) !== Boolean(attendanceExternalId)) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_ATTENDANCE_MAPPING_INCOMPLETE",
        "考勤来源和考勤人员编号必须同时填写，或同时留空。",
      );
    }
    if (attendanceProvider && attendanceExternalId) {
      const duplicate = (workspace.employees ?? []).find(
        (employee) =>
          cleanText(employee.id) !== context.employeeId &&
          cleanText(employee.attendanceProvider).toLowerCase() === attendanceProvider &&
          cleanText(employee.attendanceExternalId) === attendanceExternalId,
      );
      if (duplicate) {
        return businessError(
          409,
          "MASTER_DATA_EMPLOYEE_ATTENDANCE_MAPPING_CONFLICT",
          "该考勤人员编号已经绑定到其他员工。",
        );
      }
    }

    const reason = cleanText(body.reason);
    if (!reason) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_PROFILE_REASON_REQUIRED",
        "维护员工档案必须填写原因。",
      );
    }

    const changedAt = now().toISOString();
    const attendanceMappingChanged =
      attendanceProvider !== cleanText(before.attendanceProvider) ||
      attendanceExternalId !== cleanText(before.attendanceExternalId);
    const updatedEmployee = {
      ...before,
      birthDate: birthDate.value,
      hireDate: hireDate.value,
      payrollPositionKey,
      baseHourlyWage: baseHourlyWage.value,
      positionAllowanceHourly: positionAllowanceHourly.value,
      wageEffectiveFrom: wageEffectiveFrom.value,
      attendanceProvider,
      attendanceExternalId,
      attendanceMappingUpdatedBy: attendanceMappingChanged
        ? operatorId
        : cleanText(before.attendanceMappingUpdatedBy),
      attendanceMappingUpdatedAt: attendanceMappingChanged
        ? changedAt
        : cleanText(before.attendanceMappingUpdatedAt),
      remark: cleanText(body.remark ?? before.remark),
      updatedAt: changedAt,
    };
    const stagedWorkspace = stageWorkspace(workspace);
    stagedWorkspace.employees[employeeIndex] = updatedEmployee;
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_profile",
      targetId: context.employeeId,
      action: "master_data_employee_profile_updated",
      before: employeeProfileAuditSnapshot(before),
      after: employeeProfileAuditSnapshot(updatedEmployee),
      reason,
      operatorId,
      pageKey: "master_data",
      occurredAt: changedAt,
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace, {
      identityEmployeeUpdates: [updatedEmployee],
    });
    return success({
      employeeAccountReview: toMasterDataEmployeeAccountReview(
        updatedEmployee,
        stagedWorkspace.users,
        stagedWorkspace.machines,
        stagedWorkspace.operationLogs,
      ),
      operationLogId: operationLog.id,
    });
  }

  async function confirmEmployeeIdentity({ workspace, employeeId, body = {}, operatorId }) {
    if (body.confirmed !== true) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_REQUIRED",
        "Employee identity confirmation requires explicit confirmation.",
      );
    }
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before } = context;
    if (isEmployeeDeparted(before)) {
      return businessError(409, "MASTER_DATA_EMPLOYEE_DEPARTED", "Departed employee records cannot be confirmed or enabled.");
    }
    if (isMergedDuplicate(before)) {
      return businessError(409, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_MERGED", "Merged employee records cannot be confirmed.");
    }
    if (hasFormalRuntimeUser(workspace, before) || isEmployeeAccountEnabled(before)) {
      return businessError(409, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_ACCOUNT_EXISTS", "Identity confirmation must be completed before account enablement.");
    }
    const confirmedEmployeeId = cleanText(body.confirmedEmployeeId).toUpperCase();
    if (!confirmedEmployeeId || confirmedEmployeeId !== context.employeeId.toUpperCase()) {
      return businessError(400, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_ID_MISMATCH", "Confirmed employee ID does not match the selected employee.");
    }
    const confirmedName = cleanText(body.confirmedName);
    if (!confirmedName || confirmedName !== cleanText(before.name)) {
      return businessError(409, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_NAME_MISMATCH", "Confirmed display name must match the current formal employee record.");
    }
    const reason = cleanText(body.reason);
    if (!reason) {
      return businessError(400, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_REASON_REQUIRED", "An identity confirmation reason is required.");
    }
    const roleKey = normalizeEmployeeAccountRoleKey(before.reviewedRoleKey, before.roleName);
    const roleKeys = normalizeEmployeeAccountRoleKeys(
      before.reviewedRoleKeys ?? before.roleKeys ?? before.roleName,
      roleKey,
      before.roleName,
    );
    const existingConfirmation = getEmployeeAccountIdentityConfirmation(before, roleKeys, workspace.operationLogs);
    if (!existingConfirmation.required) {
      return businessError(409, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_NOT_REQUIRED", "This employee does not require identity confirmation.");
    }
    if (existingConfirmation.confirmed) {
      return success({
        employeeAccountReview: toMasterDataEmployeeAccountReview(before, workspace.users, workspace.machines, workspace.operationLogs),
        operationLogId: "",
        identityAlreadyConfirmed: true,
      });
    }

    const confirmedAt = now().toISOString();
    const stagedWorkspace = stageWorkspace(workspace);
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_identity_confirmation",
      targetId: context.employeeId,
      action: "master_data_employee_identity_confirmed",
      before: {
        employeeId: context.employeeId,
        name: cleanText(before.name),
        roleKeys,
        status: existingConfirmation.status,
      },
      after: {
        employeeId: context.employeeId,
        name: confirmedName,
        primaryRoleKey: roleKey,
        roleKeys,
        status: "confirmed",
      },
      reason,
      operatorId,
      pageKey: "master_data",
      occurredAt: confirmedAt,
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);
    return success({
      employeeAccountReview: toMasterDataEmployeeAccountReview(before, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs),
      operationLogId: operationLog.id,
      identityAlreadyConfirmed: false,
    });
  }

  async function mergeEmployeeIdentity({ workspace, employeeId, body = {}, operatorId }) {
    if (body.confirmed !== true) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_CONFIRMATION_REQUIRED",
        "Employee identity merge requires explicit confirmation.",
      );
    }
    const sourceContext = getEmployeeContext(workspace, employeeId);
    if (sourceContext.result) return sourceContext.result;
    const targetEmployeeId = cleanText(body.targetEmployeeId);
    if (!targetEmployeeId) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_TARGET_REQUIRED",
        "A retained employee ID is required.",
      );
    }
    if (targetEmployeeId === sourceContext.employeeId) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_SAME_EMPLOYEE",
        "Source and retained employee IDs must be different.",
      );
    }
    const targetContext = getEmployeeContext(workspace, targetEmployeeId);
    if (targetContext.result) return targetContext.result;
    if (isMergedDuplicate(sourceContext.before) || isMergedDuplicate(targetContext.before)) {
      return businessError(
        409,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_ALREADY_RESOLVED",
        "Merged employee records cannot be merged again.",
      );
    }
    if (hasFormalRuntimeUser(workspace, sourceContext.before) || hasFormalRuntimeUser(workspace, targetContext.before)) {
      return businessError(
        409,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_ACCOUNT_EXISTS",
        "Identity merge is blocked after a formal runtime account exists.",
      );
    }
    if (isEmployeeAccountEnabled(sourceContext.before) || isEmployeeAccountEnabled(targetContext.before)) {
      return businessError(
        409,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_ACCOUNT_ENABLED",
        "Identity merge is blocked after either employee account is enabled.",
      );
    }
    const canonicalName = cleanText(body.canonicalName);
    if (!canonicalName) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_CANONICAL_NAME_REQUIRED",
        "A confirmed canonical employee name is required.",
      );
    }
    const reason = cleanText(body.reason);
    if (!reason) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_REASON_REQUIRED",
        "A merge reason is required.",
      );
    }

    const mergedAt = cleanText(body.mergedAt) || now().toISOString();
    const retainedAssignment = resolveRetainedIdentityAssignment({
      sourceEmployee: sourceContext.before,
      targetEmployee: targetContext.before,
    });
    if (retainedAssignment.error) return retainedAssignment.error;
    const stagedWorkspace = stageWorkspace(workspace);
    const retainedEmployee = {
      ...targetContext.before,
      name: canonicalName,
      defaultWorkshop: retainedAssignment.defaultWorkshop,
      defaultMachineId: retainedAssignment.defaultMachineId,
      assignmentMode: retainedAssignment.assignmentMode,
      updatedAt: mergedAt,
    };
    const retiredEmployee = {
      ...sourceContext.before,
      accountEnabled: false,
      requestedEnabled: false,
      profileStatus: "merged_duplicate",
      identityMergedIntoEmployeeId: targetEmployeeId,
      identityMergedAt: mergedAt,
      identityMergedBy: operatorId,
      identityMergeReason: reason,
      remark: `已合并至 ${targetEmployeeId}`,
      updatedAt: mergedAt,
    };
    stagedWorkspace.employees[targetContext.employeeIndex] = retainedEmployee;
    stagedWorkspace.employees[sourceContext.employeeIndex] = retiredEmployee;
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_identity_merge",
      targetId: sourceContext.employeeId,
      action: "master_data_employee_identity_merged",
      before: {
        sourceEmployeeId: sourceContext.employeeId,
        targetEmployeeId,
        sourceProfileStatus: cleanText(sourceContext.before.profileStatus),
        targetName: cleanText(targetContext.before.name),
        targetDefaultMachineId: cleanText(targetContext.before.defaultMachineId),
        sourceDefaultMachineId: cleanText(sourceContext.before.defaultMachineId),
      },
      after: {
        sourceEmployeeId: sourceContext.employeeId,
        sourceProfileStatus: retiredEmployee.profileStatus,
        targetEmployeeId,
        canonicalName,
        retainedDefaultMachineId: retainedEmployee.defaultMachineId,
      },
      reason,
      operatorId,
      pageKey: "master_data",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace, {
      identityEmployeeUpdates: [retainedEmployee, retiredEmployee],
    });

    return success({
      retainedEmployee: toMasterDataEmployeeAccountReview(retainedEmployee, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs),
      retiredEmployeeId: sourceContext.employeeId,
      operationLogId: operationLog.id,
    });
  }

  async function departEmployeeAccount({ workspace, employeeId, body = {}, operatorId }) {
    if (body.confirmed !== true) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_DEPARTURE_CONFIRMATION_REQUIRED",
        "Employee departure requires explicit confirmation.",
      );
    }
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before, employeeIndex } = context;
    if (isMergedDuplicate(before)) {
      return businessError(409, "MASTER_DATA_EMPLOYEE_DEPARTURE_MERGED", "Merged employee records cannot be marked as departed.");
    }
    const reason = cleanText(body.reason);
    if (!reason) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_DEPARTURE_REASON_REQUIRED",
        "An employee departure reason is required.",
      );
    }
    if (isEmployeeDeparted(before)) {
      return success({
        departed: true,
        alreadyDeparted: true,
        employeeAccountReview: toMasterDataEmployeeAccountReview(
          before,
          workspace.users,
          workspace.machines,
          workspace.operationLogs,
        ),
        operationLogId: "",
      });
    }

    const departureEffectiveDate = normalizeOptionalIsoDate(
      body.departureEffectiveDate,
      "departureEffectiveDate",
    );
    if (departureEffectiveDate.error) return departureEffectiveDate.error;
    if (!departureEffectiveDate.value) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_DEPARTURE_EFFECTIVE_DATE_REQUIRED",
        "离职必须填写实际最后工作日。",
      );
    }
    if (cleanText(before.hireDate) && departureEffectiveDate.value < cleanText(before.hireDate)) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_DEPARTURE_EFFECTIVE_DATE_BEFORE_HIRE",
        "实际最后工作日不能早于入职日期。",
      );
    }
    const departureRecordedAt = now();
    if (departureEffectiveDate.value > shanghaiDateOnly(departureRecordedAt)) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_DEPARTURE_EFFECTIVE_DATE_IN_FUTURE",
        "实际最后工作日不能晚于今天；计划离职请在实际离厂后办理。",
      );
    }

    const departedAt = departureRecordedAt.toISOString();
    const stagedWorkspace = stageWorkspace(workspace);
    const runtimeUser = resolveEmployeeRuntimeUser(stagedWorkspace, before);
    const updatedEmployee = {
      ...before,
      defaultWorkshop: "",
      defaultMachineId: "",
      assignmentMode: "unassigned",
      assignmentUpdatedBy: operatorId,
      assignmentUpdatedAt: departedAt,
      assignmentNote: reason,
      accountEnabled: false,
      requestedEnabled: false,
      profileStatus: "departed",
      loginEnabled: false,
      mustChangePassword: false,
      departedAt,
      departureEffectiveDate: departureEffectiveDate.value,
      departedBy: operatorId,
      departureReason: reason,
      remark: `已离职：${reason}`,
      updatedAt: departedAt,
    };
    stagedWorkspace.employees[employeeIndex] = updatedEmployee;
    const updatedUser = runtimeUser
      ? upsertRuntimeUser(stagedWorkspace, {
          ...runtimeUser,
          enabled: false,
          loginEnabled: false,
          passwordHash: "",
          passwordStatus: "password_revoked",
          mustChangePassword: false,
          defaultMachineId: "",
          passwordRevokedBy: operatorId,
          passwordRevokedAt: departedAt,
          sessionValidAfter: departedAt,
          sessionVersion: nextRuntimeSessionVersion(runtimeUser.sessionVersion),
          updatedAt: departedAt,
        })
      : null;
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_departure",
      targetId: context.employeeId,
      action: "master_data_employee_departed",
      before: {
        employeeId: context.employeeId,
        profileStatus: cleanText(before.profileStatus),
        accountEnabled: before.accountEnabled === true,
        requestedEnabled: before.requestedEnabled === true,
        defaultWorkshop: cleanText(before.defaultWorkshop),
        defaultMachineId: cleanText(before.defaultMachineId),
      },
      after: {
        employeeId: context.employeeId,
        profileStatus: "departed",
        accountEnabled: false,
        requestedEnabled: false,
        loginEnabled: false,
        defaultWorkshop: "",
        defaultMachineId: "",
        departedAt,
        departureEffectiveDate: departureEffectiveDate.value,
      },
      reason,
      operatorId,
      pageKey: "master_data",
      occurredAt: departedAt,
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace, {
      identityEmployeeUpdates: [updatedEmployee],
    });

    return success({
      departed: true,
      alreadyDeparted: false,
      employeeAccountReview: toMasterDataEmployeeAccountReview(
        updatedEmployee,
        stagedWorkspace.users,
        stagedWorkspace.machines,
        stagedWorkspace.operationLogs,
      ),
      user: updatedUser ? sanitizeRuntimeUserForResponse(updatedUser) : null,
      sessionsRevokedAfter: runtimeUser ? departedAt : "",
      operationLogId: operationLog.id,
    });
  }

  async function updateEmployeeAssignment({ workspace, employeeId, body = {}, operatorId }) {
    const context = getEmployeeContext(workspace, employeeId);
    if (context.result) return context.result;
    const { before, employeeIndex } = context;
    if (isEmployeeDeparted(before)) {
      return businessError(409, "MASTER_DATA_EMPLOYEE_DEPARTED", "Departed employees cannot receive workshop or machine assignments.");
    }
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
      if (!requestedWorkshop) {
        return businessError(400, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_REQUIRED", "Workshop is required for a fixed-machine assignment.");
      }
      if (!assignmentOptions.workshops.includes(requestedWorkshop)) {
        return businessError(409, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_NOT_FOUND", "Selected workshop is unavailable.");
      }
      const machine = assignmentOptions.machines.find((item) => item.machineId === requestedMachineId && item.enabled !== false);
      if (!machine) {
        return businessError(409, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_MACHINE_NOT_FOUND", "Selected machine is unavailable.");
      }
      defaultWorkshop = requestedWorkshop;
      if (machine.workshop && machine.workshop !== defaultWorkshop) {
        return businessError(409, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_MISMATCH", "Selected machine does not belong to the selected workshop.");
      }
      defaultMachineId = machine.machineId;
    } else if (assignmentMode === "general_worker") {
      if (!requestedWorkshop) {
        return businessError(400, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_REQUIRED", "Workshop is required for a general-worker assignment.");
      }
      if (!assignmentOptions.workshops.includes(requestedWorkshop)) {
        return businessError(409, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_NOT_FOUND", "Selected workshop is unavailable.");
      }
      defaultWorkshop = requestedWorkshop;
    }

    const changedAt = now().toISOString();
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
      employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs),
      assignmentOptions,
      operationLogId: operationLog.id,
    });
  }

  async function enableEmployeeAccount({ workspace, employeeId, body = {}, operatorId }) {
    const reviewedAt = cleanText(body.reviewedAt) || now().toISOString();
    const stagedWorkspace = stageWorkspace(workspace);
    const staged = stageEmployeeAccountEnable({
      stagedWorkspace,
      employeeId,
      body,
      operatorId,
      reviewedAt,
    });
    if (staged.result) return staged.result;
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    return success({
      employeeAccountReview: toMasterDataEmployeeAccountReview(staged.updatedEmployee, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs),
      employee: staged.updatedEmployee,
      user: sanitizeRuntimeUserForResponse(staged.user),
      operationLogId: staged.operationLog.id,
    });
  }

  async function enableEmployeeAccounts({ workspace, body = {}, operatorId }) {
    if (body.confirmed !== true) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_CONFIRMATION_REQUIRED",
        "Batch employee account enablement requires explicit confirmation.",
      );
    }
    if (!Array.isArray(body.employeeIds)) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_IDS_REQUIRED",
        "employeeIds must be an array.",
      );
    }
    const employeeIds = [...new Set(body.employeeIds.map(cleanText).filter(Boolean))];
    if (!employeeIds.length) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_IDS_REQUIRED",
        "At least one employeeId is required.",
      );
    }
    if (employeeIds.length > 100) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_LIMIT_EXCEEDED",
        "A batch may enable at most 100 employee accounts.",
      );
    }

    const reviewedAt = cleanText(body.reviewedAt) || now().toISOString();
    const reviewNote = cleanText(body.reviewNote ?? body.note) || "管理员批量复核导入员工岗位、机台和角色";
    const stagedWorkspace = stageWorkspace(workspace);
    const enabled = [];
    const skipped = [];
    const operationLogIds = [];

    for (const employeeId of employeeIds) {
      const context = getEmployeeContext(stagedWorkspace, employeeId);
      if (context.result) {
        return batchValidationError(employeeId, context.result);
      }
      const existingUser = resolveEmployeeRuntimeUser(stagedWorkspace, context.before);
      if (isEmployeeAccountEnabled(buildEffectiveEmployeeAccount(context.before, existingUser))) {
        skipped.push(toMasterDataEmployeeAccountReview(context.before, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs));
        continue;
      }
      const staged = stageEmployeeAccountEnable({
        stagedWorkspace,
        employeeId,
        body: { reviewNote },
        operatorId,
        reviewedAt,
      });
      if (staged.result) {
        return batchValidationError(employeeId, staged.result);
      }
      enabled.push(toMasterDataEmployeeAccountReview(staged.updatedEmployee, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs));
      operationLogIds.push(staged.operationLog.id);
    }

    if (enabled.length) {
      await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);
    }

    return success({
      employeeAccountReviews: enabled,
      requestedCount: employeeIds.length,
      enabledCount: enabled.length,
      skippedCount: skipped.length,
      skippedEmployeeIds: skipped.map((review) => review.employeeId),
      operationLogIds,
      reviewedAt,
      atomic: true,
    });
  }

  function stageEmployeeAccountEnable({ stagedWorkspace, employeeId, body, operatorId, reviewedAt }) {
    const context = getEmployeeContext(stagedWorkspace, employeeId);
    if (context.result) return { result: context.result };
    const { before, employeeIndex } = context;
    if (isEmployeeDeparted(before)) {
      return { result: businessError(409, "MASTER_DATA_EMPLOYEE_DEPARTED", "Departed employees cannot be enabled.") };
    }
    const existingUser = resolveEmployeeRuntimeUser(stagedWorkspace, before);
    const roleKey = normalizeEmployeeAccountRoleKey(
      body.roleKey || existingUser?.defaultRole,
      before.roleName,
    );
    const requestedRoleInputs = body.roleKeys === undefined
      ? (existingUser?.roles?.length ? existingUser.roles : before.roleKeys ?? before.roleName)
      : body.roleKeys;
    const invalidRoleInputs = getInvalidEmployeeAccountRoleInputs(requestedRoleInputs);
    if (invalidRoleInputs.length) {
      return {
        result: businessError(
          400,
          "MASTER_DATA_EMPLOYEE_ACCOUNT_ROLES_INVALID",
          `Unknown employee account roles: ${invalidRoleInputs.join(", ")}.`,
        ),
      };
    }
    const roleKeys = normalizeEmployeeAccountRoleKeys(
      requestedRoleInputs,
      roleKey,
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
      roleKeys,
    });
    if (reviewLockError) return { result: businessError(409, reviewLockError.code, reviewLockError.message) };
    const identityConfirmationError = validateEmployeeAccountIdentityConfirmation(
      effectiveBefore,
      roleKeys,
      stagedWorkspace.operationLogs,
    );
    if (identityConfirmationError) {
      return { result: businessError(409, identityConfirmationError.code, identityConfirmationError.message) };
    }
    const machineReview = resolveEmployeeMachineConfiguration(stagedWorkspace, effectiveBefore, roleKeys);
    if (machineReview.error) {
      return { result: businessError(409, machineReview.error.code, machineReview.error.message) };
    }
    const identityError = validateEmployeeAccountIdentity(stagedWorkspace, {
      employeeId: context.employeeId,
      userId,
      loginName,
    });
    if (identityError) return { result: businessError(409, identityError.code, identityError.message) };

    const updatedEmployee = {
      ...before,
      defaultWorkshop: machineReview.machine?.workshop || before.defaultWorkshop,
      defaultMachineId: machineReview.machine?.machineId || before.defaultMachineId,
      userId,
      loginName,
      accountEnabled: true,
      profileStatus: "account_enabled",
      reviewedBy: operatorId,
      reviewedAt,
      reviewedRoleKey: roleKey,
      reviewedRoleKeys: roleKeys,
      reviewNote,
      updatedAt: reviewedAt,
    };
    stagedWorkspace.employees[employeeIndex] = updatedEmployee;
    const user = upsertMasterDataEmployeeUser(stagedWorkspace, updatedEmployee, {
      roleKey,
      roleKeys,
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
        reviewedRoleKeys: roleKeys,
        defaultMachineId: updatedEmployee.defaultMachineId,
      },
      reason: reviewNote,
      operatorId,
      pageKey: "master_data",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    return { updatedEmployee, user, operationLog };
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
      effectiveBefore.reviewedRoleKey || existingUser?.defaultRole,
      before.roleName,
    );
    const requestedRoleInputs = body.roleKeys === undefined
      ? (existingUser?.roles?.length ? existingUser.roles : effectiveBefore.reviewedRoleKeys ?? before.roleKeys ?? before.roleName)
      : body.roleKeys;
    const invalidRoleInputs = getInvalidEmployeeAccountRoleInputs(requestedRoleInputs);
    if (invalidRoleInputs.length) {
      return businessError(
        400,
        "MASTER_DATA_EMPLOYEE_ACCOUNT_ROLES_INVALID",
        `Unknown employee account roles: ${invalidRoleInputs.join(", ")}.`,
      );
    }
    const roleKeys = normalizeEmployeeAccountRoleKeys(
      requestedRoleInputs,
      roleKey,
      before.roleName,
    );
    const userId = cleanText(effectiveBefore.userId) || buildEmployeeAccountUserId(before);
    const loginName =
      cleanText(effectiveBefore.loginName) || buildEmployeeAccountLoginName(before);
    const reviewLockError = validateEnabledEmployeeAccountReview(effectiveBefore, {
      userId: cleanText(body.userId) || userId,
      loginName: cleanText(body.loginName) || loginName,
      roleKey: cleanText(body.roleKey) || roleKey,
      roleKeys,
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
      reviewedRoleKeys: roleKeys,
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
      roleKeys,
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
      employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs),
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
      reviewedRoleKeys: normalizeEmployeeAccountRoleKeys(
        runtimeUser?.roles ?? before.reviewedRoleKeys ?? before.roleKeys ?? before.roleName,
        cleanText(before.reviewedRoleKey) || cleanText(runtimeUser?.defaultRole),
        before.roleName,
      ),
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
      employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, stagedWorkspace.users, stagedWorkspace.machines, stagedWorkspace.operationLogs),
      user: updatedUser ? sanitizeRuntimeUserForResponse(updatedUser) : null,
      sessionsRevokedAfter: revokedAt,
      operationLogId: operationLog.id,
    });
  }
}

export function toMasterDataEmployeeAccountReview(employee = {}, users = [], machines = [], operationLogs = []) {
  const employeeId = cleanText(employee.id);
  const user = findEmployeeReviewUser(employee, users);
  const userId = cleanText(employee.userId) || cleanText(user?.userId ?? user?.id);
  const departed = isEmployeeDeparted(employee);
  const accountEnabled =
    !departed && (
      employee.accountEnabled === true ||
      cleanText(employee.profileStatus) === "account_enabled" ||
      Boolean(user && user.enabled !== false)
    );
  const roleKey =
    cleanText(employee.reviewedRoleKey) ||
    cleanText(user?.defaultRole) ||
    normalizeEmployeeAccountRoleKey("", employee.roleName);
  const roleKeys = normalizeEmployeeAccountRoleKeys(
    user?.roles ?? employee.reviewedRoleKeys ?? employee.roleKeys ?? employee.roleName,
    roleKey,
    employee.roleName,
  );
  const userPasswordStatus = cleanText(user?.passwordStatus);
  const employeePasswordStatus = cleanText(employee.passwordStatus);
  const machineConfiguration = buildEmployeeMachineConfigurationProjection(employee, roleKeys, machines);
  const identityConfirmation = getEmployeeAccountIdentityConfirmation(employee, roleKeys, operationLogs);
  return {
    employeeId,
    bizNo: cleanText(employee.bizNo) || employeeId,
    name: cleanText(employee.name),
    roleName: cleanText(employee.roleName),
    defaultWorkshop: cleanText(employee.defaultWorkshop),
    defaultMachineId: cleanText(employee.defaultMachineId),
    birthDate: cleanText(employee.birthDate),
    age: calculateCompletedYears(employee.birthDate),
    hireDate: cleanText(employee.hireDate),
    seniorityYears: calculateCompletedYears(employee.hireDate),
    payrollPositionKey: cleanText(employee.payrollPositionKey),
    baseHourlyWage: nonNegativeNumber(employee.baseHourlyWage),
    positionAllowanceHourly: nonNegativeNumber(employee.positionAllowanceHourly),
    wageEffectiveFrom: cleanText(employee.wageEffectiveFrom),
    attendanceProvider: cleanText(employee.attendanceProvider),
    attendanceExternalId: cleanText(employee.attendanceExternalId),
    attendanceMappingUpdatedBy: cleanText(employee.attendanceMappingUpdatedBy),
    attendanceMappingUpdatedAt: cleanText(employee.attendanceMappingUpdatedAt),
    attendanceMapped: Boolean(
      cleanText(employee.attendanceProvider) && cleanText(employee.attendanceExternalId),
    ),
    departedAt: cleanText(employee.departedAt),
    departureEffectiveDate: cleanText(employee.departureEffectiveDate),
    departedBy: cleanText(employee.departedBy),
    departureReason: cleanText(employee.departureReason),
    updatedAt: cleanText(employee.updatedAt),
    configuredMachineId: machineConfiguration.machineId,
    configuredMachineLabel: machineConfiguration.machineLabel,
    machineConfigurationStatus: machineConfiguration.status,
    machineConfigurationStatusLabel: machineConfiguration.statusLabel,
    assignmentMode: getEmployeeAssignmentMode(employee),
    assignmentUpdatedBy: cleanText(employee.assignmentUpdatedBy),
    assignmentUpdatedAt: cleanText(employee.assignmentUpdatedAt),
    assignmentNote: cleanText(employee.assignmentNote),
    requestedEnabled: employee.requestedEnabled === true,
    accountEnabled,
    profileStatus:
      departed
        ? "departed"
        : accountEnabled
        ? "account_enabled"
        : cleanText(employee.profileStatus) || "pending_admin_review",
    status: departed
      ? "departed"
      : accountEnabled
      ? "account_enabled"
      : identityConfirmation.activationBlocked ? "identity_confirmation_required" : "pending_admin_review",
    statusLabel: departed
      ? "已离职"
      : accountEnabled
      ? "已启用"
      : identityConfirmation.activationBlocked ? "身份待确认" : "待管理员复核",
    recommendedRoleKey: roleKey,
    recommendedRoleLabel: getEmployeeAccountRoleLabel(roleKey),
    recommendedRoleKeys: roleKeys,
    recommendedRoleLabels: roleKeys.map(getEmployeeAccountRoleLabel),
    loginName:
      cleanText(employee.loginName) ||
      cleanText(user?.loginName) ||
      buildEmployeeAccountLoginName(employee),
    userId,
    userDisplayName: cleanText(user?.displayName) || cleanText(employee.name),
    reviewedBy: cleanText(employee.reviewedBy) || cleanText(user?.accountReviewedBy),
    reviewedAt: cleanText(employee.reviewedAt) || cleanText(user?.accountReviewedAt),
    reviewNote: cleanText(employee.reviewNote) || cleanText(user?.accountReviewNote),
    loginEnabled: !departed && (employee.loginEnabled === true || user?.loginEnabled === true),
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
    identityConfirmationRequired: identityConfirmation.required,
    identityConfirmed: identityConfirmation.confirmed,
    identityConfirmationStatus: identityConfirmation.status,
    identityConfirmationStatusLabel: identityConfirmation.statusLabel,
    identityConfirmedBy: identityConfirmation.confirmedBy,
    identityConfirmedAt: identityConfirmation.confirmedAt,
    identityConfirmationNote: identityConfirmation.confirmationNote,
    accountActivationBlocked: identityConfirmation.activationBlocked,
    accountActivationBlockerCode: identityConfirmation.blockerCode,
    accountActivationBlockerLabel: identityConfirmation.blockerLabel,
    remark: cleanText(employee.remark),
    actionRequired: !accountEnabled && !departed,
  };
}

export function listMasterDataEmployeeAccountReviews(workspace = {}, filters = {}) {
  const statusFilter = cleanText(filters.status);
  const employeeIdFilter = cleanText(filters.employeeId);
  const keyword = cleanText(filters.keyword).toLowerCase();
  const users = new Map((workspace.users ?? []).map((user) => [cleanText(user.userId ?? user.id), user]));
  return (Array.isArray(workspace.employees) ? workspace.employees : [])
    .filter((employee) => !isMergedDuplicate(employee))
    .map((employee) => toMasterDataEmployeeAccountReview(employee, users, workspace.machines, workspace.operationLogs))
    .filter((review) => {
      if (employeeIdFilter && review.employeeId !== employeeIdFilter) return false;
      if (statusFilter && review.status !== statusFilter && review.profileStatus !== statusFilter) return false;
      if (!keyword) return true;
      return [
        review.employeeId,
        review.bizNo,
        review.name,
        review.roleName,
        review.defaultWorkshop,
        review.defaultMachineId,
        review.loginName,
      ].some((value) => cleanText(value).toLowerCase().includes(keyword));
    });
}

export function buildEmployeeAssignmentOptions(workspace = {}) {
  const machines = normalizeMasterDataMachines(workspace.machines).map((machine) => ({
    ...machine,
    machineLabel: machine.name || machine.machineId,
    enabled: machine.enabled !== false && machine.status === "active",
  })).sort((left, right) =>
    left.machineLabel.localeCompare(right.machineLabel, "zh-CN", { numeric: true }),
  );
  const workshops = [...new Set(machines.map((machine) => machine.workshop).filter(Boolean))];
  return { workshops, machines };
}

function resolveEmployeeMachineConfiguration(workspace, employee, roleKeys) {
  if (!roleKeys.includes("workshop")) return { machine: null };
  const machineId = cleanText(employee.defaultMachineId);
  if (!machineId) {
    return { error: { code: "MASTER_DATA_EMPLOYEE_ACCOUNT_MACHINE_REQUIRED", message: "Workshop employees require a configured default machine before account enablement." } };
  }
  const machine = resolveConfiguredMasterDataMachine(workspace.machines, machineId);
  if (!machine) {
    return { error: { code: "MASTER_DATA_EMPLOYEE_ACCOUNT_MACHINE_NOT_CONFIGURED", message: "The employee default machine is not in authoritative machine configuration." } };
  }
  if (machine.enabled === false || machine.status !== "active") {
    return { error: { code: "MASTER_DATA_EMPLOYEE_ACCOUNT_MACHINE_NOT_ACTIVE", message: "The employee default machine is not active." } };
  }
  const workshop = cleanText(employee.defaultWorkshop);
  if (!workshop) {
    return { error: { code: "MASTER_DATA_EMPLOYEE_ACCOUNT_WORKSHOP_REQUIRED", message: "Workshop employees require a configured workshop before account enablement." } };
  }
  if (cleanText(machine.workshop) !== workshop) {
    return { error: { code: "MASTER_DATA_EMPLOYEE_ACCOUNT_MACHINE_WORKSHOP_MISMATCH", message: "The employee workshop does not match the configured machine workshop." } };
  }
  return { machine };
}

function buildEmployeeMachineConfigurationProjection(employee, roleKeys, machines) {
  if (!roleKeys.includes("workshop")) {
    return { machineId: "", machineLabel: "", status: "not_required", statusLabel: "无需机台" };
  }
  const machineId = cleanText(employee.defaultMachineId);
  if (!machineId) {
    return { machineId: "", machineLabel: "", status: "missing", statusLabel: "待分配机台" };
  }
  const machine = resolveConfiguredMasterDataMachine(machines, machineId);
  if (!machine) {
    return { machineId: "", machineLabel: "", status: "not_configured", statusLabel: "机台资料不存在" };
  }
  if (machine.enabled === false || machine.status !== "active") {
    return { machineId: machine.machineId, machineLabel: machine.name || machine.machineId, status: "not_active", statusLabel: "机台未启用" };
  }
  if (!cleanText(employee.defaultWorkshop) || cleanText(machine.workshop) !== cleanText(employee.defaultWorkshop)) {
    return { machineId: machine.machineId, machineLabel: machine.name || machine.machineId, status: "workshop_mismatch", statusLabel: "车间与机台不一致" };
  }
  return {
    machineId: machine.machineId,
    machineLabel: machine.name || machine.machineId,
    status: machine.machineId === machineId ? "active" : "legacy_alias",
    statusLabel: machine.machineId === machineId ? "机台已配置" : "历史编号已匹配",
  };
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

function hasFormalRuntimeUser(workspace, employee) {
  return Boolean(resolveEmployeeRuntimeUser(workspace, employee));
}

function isMergedDuplicate(employee = {}) {
  return cleanText(employee.profileStatus) === "merged_duplicate";
}

function isEmployeeDeparted(employee = {}) {
  return ["departed", "left", "retired", "inactive_employee"].includes(
    cleanText(employee.profileStatus).toLowerCase(),
  );
}

function resolveRetainedIdentityAssignment({ sourceEmployee = {}, targetEmployee = {} }) {
  const sourceMachineId = cleanText(sourceEmployee.defaultMachineId);
  const targetMachineId = cleanText(targetEmployee.defaultMachineId);
  if (sourceMachineId && targetMachineId && sourceMachineId !== targetMachineId) {
    return {
      error: businessError(
        409,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_ASSIGNMENT_CONFLICT",
        "Identity merge is blocked because the two employee records have different default machines.",
      ),
    };
  }
  const sourceWorkshop = cleanText(sourceEmployee.defaultWorkshop);
  const targetWorkshop = cleanText(targetEmployee.defaultWorkshop);
  if (sourceWorkshop && targetWorkshop && sourceWorkshop !== targetWorkshop) {
    return {
      error: businessError(
        409,
        "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_ASSIGNMENT_CONFLICT",
        "Identity merge is blocked because the two employee records have different default workshops.",
      ),
    };
  }
  const defaultMachineId = targetMachineId || sourceMachineId;
  const defaultWorkshop = targetWorkshop || sourceWorkshop;
  const assignmentMode = defaultMachineId
    ? "fixed_machine"
    : defaultWorkshop
      ? "general_worker"
      : "unassigned";
  return { defaultWorkshop, defaultMachineId, assignmentMode };
}

function buildEffectiveEmployeeAccount(employee, runtimeUser) {
  if (isEmployeeDeparted(employee)) {
    return {
      ...employee,
      accountEnabled: false,
      profileStatus: "departed",
      loginEnabled: false,
    };
  }
  const reviewedRoleKey =
    cleanText(employee.reviewedRoleKey) || cleanText(runtimeUser?.defaultRole);
  return {
    ...employee,
    userId: cleanText(employee.userId) || cleanText(runtimeUser?.userId),
    loginName: cleanText(employee.loginName) || cleanText(runtimeUser?.loginName),
    accountEnabled: isEmployeeAccountEnabled(employee) || Boolean(runtimeUser?.enabled),
    profileStatus:
      isEmployeeAccountEnabled(employee) || runtimeUser?.enabled
        ? "account_enabled"
        : cleanText(employee.profileStatus),
    reviewedRoleKey,
    reviewedRoleKeys: normalizeEmployeeAccountRoleKeys(
      runtimeUser?.roles ?? employee.reviewedRoleKeys ?? employee.roleKeys ?? employee.roleName,
      reviewedRoleKey,
      employee.roleName,
    ),
  };
}

function isEmployeeAccountEnabled(employee) {
  if (isEmployeeDeparted(employee)) return false;
  return (
    employee?.accountEnabled === true ||
    cleanText(employee?.profileStatus) === "account_enabled"
  );
}

function upsertMasterDataEmployeeUser(workspace, employee, options = {}) {
  const roleKey = normalizeEmployeeAccountRoleKey(options.roleKey, employee.roleName);
  const roleKeys = normalizeEmployeeAccountRoleKeys(
    options.roleKeys ?? options.existingUser?.roles ?? employee.reviewedRoleKeys ?? employee.roleKeys ?? employee.roleName,
    roleKey,
    employee.roleName,
  );
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
    roles: roleKeys,
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

async function persistAndCommitIdentityWorkspace(workspace, stagedWorkspace, options = {}) {
  await persistRuntimeIdentityState(stagedWorkspace, options);
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

function normalizeOptionalIsoDate(value, fieldName) {
  const text = cleanText(value);
  if (!text) return { value: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return {
      error: businessError(400, "MASTER_DATA_EMPLOYEE_PROFILE_DATE_INVALID", `${fieldName} 必须是 YYYY-MM-DD。`),
    };
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return {
      error: businessError(400, "MASTER_DATA_EMPLOYEE_PROFILE_DATE_INVALID", `${fieldName} 不是有效日期。`),
    };
  }
  return { value: text };
}

function shanghaiDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeNonNegativeMoney(value, fieldName) {
  if (value === undefined || value === null || value === "") return { value: 0 };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return {
      error: businessError(400, "MASTER_DATA_EMPLOYEE_PROFILE_WAGE_INVALID", `${fieldName} 必须是非负数。`),
    };
  }
  return { value: Math.round(number * 10000) / 10000 };
}

function employeeProfileAuditSnapshot(employee = {}) {
  return {
    employeeId: cleanText(employee.id),
    birthDate: cleanText(employee.birthDate),
    hireDate: cleanText(employee.hireDate),
    payrollPositionKey: cleanText(employee.payrollPositionKey),
    baseHourlyWage: nonNegativeNumber(employee.baseHourlyWage),
    positionAllowanceHourly: nonNegativeNumber(employee.positionAllowanceHourly),
    wageEffectiveFrom: cleanText(employee.wageEffectiveFrom),
    attendanceProvider: cleanText(employee.attendanceProvider),
    attendanceExternalId: cleanText(employee.attendanceExternalId),
  };
}

function calculateCompletedYears(value, now = new Date()) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date > now) return null;
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - date.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < date.getUTCDate())) years -= 1;
  return Math.max(0, years);
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function success(response) {
  return { statusCode: 200, response };
}

function notFound(code) {
  return { notFound: true, code };
}

function batchValidationError(employeeId, result = {}) {
  return businessError(
    409,
    "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_VALIDATION_FAILED",
    "Batch employee account enablement failed validation; no account was changed.",
    {
      employeeId: cleanText(employeeId),
      causeCode: cleanText(result.code) || "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_MEMBER_INVALID",
    },
  );
}

function businessError(statusCode, code, message, details = undefined) {
  return { error: true, statusCode, code, message, ...(details ? { details } : {}) };
}
