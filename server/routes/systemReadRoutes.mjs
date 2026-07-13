export async function handleSystemReadRoutes({
  url,
  response,
  workspace,
  openapi,
  permissionContext,
  authContext,
  sendJson,
  getPermissionOperatorId,
  getSystemV1ReadinessResponse,
  getSystemV1GoLiveStatusResponse,
  filterByValue,
}) {
  if (url.pathname === "/api/system/v1-readiness") {
    sendJson(
      response,
      200,
      getSystemV1ReadinessResponse({
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
      getSystemV1GoLiveStatusResponse({
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
    sendJson(response, 200, { items: items.slice(0, limit), total: items.length });
    return true;
  }

  if (url.pathname !== "/api/openapi/status") return false;
  sendJson(response, openapi.valid ? 200 : 500, openapi);
  return true;
}
