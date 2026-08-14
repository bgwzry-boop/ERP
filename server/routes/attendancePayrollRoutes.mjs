export async function handleAttendancePayrollReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  attendancePayrollService,
  sendJson,
  sendNotFound,
}) {
  if (url.pathname === "/api/attendance/me") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.viewOwnAttendance)) return true;
    const runtimeUser = findRuntimeUser(workspace, authContext?.userId);
    sendJson(response, 200, attendancePayrollService.buildOwnAttendance({
      workspace,
      authContext: { ...authContext, user: runtimeUser },
      month: url.searchParams.get("month"),
    }));
    return true;
  }

  if (url.pathname === "/api/payroll/workbench") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.previewPayroll)) return true;
    sendJson(response, 200, attendancePayrollService.buildPayrollWorkbench({
      workspace,
      month: url.searchParams.get("month"),
    }));
    return true;
  }

  if (url.pathname === "/api/payroll/readiness") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.previewPayroll)) return true;
    sendJson(response, 200, attendancePayrollService.buildPayrollReadiness({
      workspace,
      month: url.searchParams.get("month"),
    }));
    return true;
  }

  const employeeAttendanceMatch = url.pathname.match(/^\/api\/attendance\/employees\/([^/]+)$/);
  if (employeeAttendanceMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.previewPayroll)) return true;
    sendJson(response, 200, attendancePayrollService.buildEmployeeAttendance({
      workspace,
      employeeId: decodeURIComponent(employeeAttendanceMatch[1]),
      month: url.searchParams.get("month"),
    }));
    return true;
  }

  if (url.pathname === "/api/payroll/policy-versions") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.previewPayroll)) return true;
    sendJson(response, 200, {
      policyVersions: workspace.payrollPolicyVersions ?? [],
    });
    return true;
  }

  const payrollHistoryMatch = url.pathname.match(/^\/api\/payroll\/employees\/([^/]+)\/history$/);
  if (payrollHistoryMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.previewPayroll)) return true;
    sendJson(response, 200, attendancePayrollService.buildPayrollHistory({
      workspace,
      employeeId: decodeURIComponent(payrollHistoryMatch[1]),
      limit: url.searchParams.get("limit"),
    }));
    return true;
  }

  const payrollRunMatch = url.pathname.match(/^\/api\/payroll\/runs\/([^/]+)$/);
  if (payrollRunMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.previewPayroll)) return true;
    const payrollRunId = decodeURIComponent(payrollRunMatch[1]);
    const payrollRun = (workspace.payrollRuns ?? []).find((run) => run.id === payrollRunId);
    if (!payrollRun) {
      sendNotFound(response, "PAYROLL_RUN_NOT_FOUND");
      return true;
    }
    sendJson(response, 200, {
      payrollRun,
      payrollLines: (workspace.payrollLines ?? []).filter((line) => line.payrollRunId === payrollRunId),
    });
    return true;
  }
  return false;
}

export async function handleAttendancePayrollWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  attendancePayrollService,
  sendJson,
}) {
  if (!["POST", "PATCH"].includes(method)) return false;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A");

  if (url.pathname === "/api/attendance/sync-precheck") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.syncAttendance)) return true;
    sendJson(response, 200, await attendancePayrollService.precheckAttendanceSync({ workspace, body, operatorId }));
    return true;
  }

  if (url.pathname === "/api/attendance/sync") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.syncAttendance)) return true;
    sendJson(response, 200, await attendancePayrollService.syncAttendance({ workspace, body, operatorId }));
    return true;
  }

  const attendanceReviewMatch = url.pathname.match(
    /^\/api\/attendance\/employees\/([^/]+)\/days\/(\d{4}-\d{2}-\d{2})\/review$/,
  );
  if (attendanceReviewMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewAttendance)) return true;
    sendJson(response, 200, await attendancePayrollService.reviewAttendanceDay({
      workspace,
      employeeId: decodeURIComponent(attendanceReviewMatch[1]),
      workDate: attendanceReviewMatch[2],
      body,
      operatorId,
    }));
    return true;
  }

  if (url.pathname === "/api/payroll/policy-versions") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.managePayrollPolicy)) return true;
    sendJson(response, 200, await attendancePayrollService.savePayrollPolicyVersion({ workspace, body, operatorId }));
    return true;
  }

  if (url.pathname === "/api/payroll/drafts") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewPayroll)) return true;
    sendJson(response, 200, await attendancePayrollService.generatePayrollDraft({ workspace, body, operatorId }));
    return true;
  }

  const payrollExportMatch = url.pathname.match(/^\/api\/payroll\/runs\/([^/]+)\/export$/);
  if (payrollExportMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.exportPayroll)) return true;
    sendJson(response, 200, await attendancePayrollService.createPayrollExport({
      workspace,
      payrollRunId: decodeURIComponent(payrollExportMatch[1]),
      body,
      operatorId,
    }));
    return true;
  }

  const payrollAdjustmentMatch = url.pathname.match(
    /^\/api\/payroll\/runs\/([^/]+)\/lines\/([^/]+)\/adjustment$/,
  );
  if (payrollAdjustmentMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewPayroll)) return true;
    sendJson(response, 200, await attendancePayrollService.updatePayrollLineAdjustment({
      workspace,
      payrollRunId: decodeURIComponent(payrollAdjustmentMatch[1]),
      employeeId: decodeURIComponent(payrollAdjustmentMatch[2]),
      body,
      operatorId,
    }));
    return true;
  }

  const payrollActionMatch = url.pathname.match(/^\/api\/payroll\/runs\/([^/]+)\/(review|lock|payment)$/);
  if (payrollActionMatch) {
    const action = payrollActionMatch[2];
    const permission = action === "review"
      ? writeActionPermissions.reviewPayroll
      : action === "lock"
        ? writeActionPermissions.lockPayroll
        : writeActionPermissions.confirmPayrollPayment;
    if (!requireActionPermission(response, permissionContext, permission)) return true;
    sendJson(response, 200, await attendancePayrollService.transitionPayrollRun({
      workspace,
      payrollRunId: decodeURIComponent(payrollActionMatch[1]),
      action,
      body,
      operatorId,
    }));
    return true;
  }
  return false;
}

function findRuntimeUser(workspace, userId) {
  const safeUserId = String(userId ?? "").trim();
  return (workspace.users ?? []).find((user) =>
    String(user?.userId ?? user?.id ?? "").trim() === safeUserId,
  ) ?? null;
}
