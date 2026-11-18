export async function handleSystemReadRoutes({
  url,
  response,
  workspace,
  openapi,
  permissionContext,
  authContext,
  sendJson,
  getPermissionOperatorId,
  buildSystemV1Readiness,
  v1GoLiveStatusResponseService,
  filterByValue,
}) {
  if (url.pathname === "/api/system/v1-readiness") {
    sendJson(
      response,
      200,
      buildSystemV1Readiness({
        workspace,
        operatorId: getPermissionOperatorId(permissionContext, authContext, "SYSTEM"),
      }),
    );
    return true;
  }

  if (url.pathname === "/api/system/v1-go-live-status") {
    sendJson(
      response,
      200,
      v1GoLiveStatusResponseService.build({
        workspace,
        operatorId: getPermissionOperatorId(permissionContext, authContext, "SYSTEM"),
      }),
    );
    return true;
  }

  if (url.pathname === "/api/permissions/effective") {
    sendJson(response, 200, permissionContext);
    return true;
  }

  if (url.pathname === "/api/operation-logs") {
    let items = workspace.operationLogs;
    items = filterByValue(items, url.searchParams.get("targetType"), "targetType");
    items = filterByValue(items, url.searchParams.get("targetId"), "targetId");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const canSeePayroll = permissionContext?.actionPermissions?.includes("payroll.preview") === true;
    const visibleItems = items.slice(0, limit).map(row => {
      if (canSeePayroll || row.targetType !== "master_data_employee_profile") return row;
      // Profile change snapshots include historical pay and the attendance
      // provider identity. Keep the audit event visible without those facts.
      const { before: _before, after: _after, reason: _reason, ...event } = row;
      return { ...event, reason: "员工档案已更新，详细信息需工资查看权限。" };
    });
    sendJson(response, 200, { items: visibleItems, total: items.length });
    return true;
  }

  if (url.pathname !== "/api/openapi/status") return false;
  sendJson(response, openapi.valid ? 200 : 500, openapi);
  return true;
}
