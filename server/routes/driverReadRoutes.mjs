export async function handleDriverReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  sendJson,
  listDriverDeliveryTasksRoute,
  getDriverDeliveryTaskRoute,
  getDriverV1ReadinessResponse,
}) {
  const permission = writeActionPermissions.viewDriverDeliveryTasks;
  const resolveOperatorId = () => getPermissionOperatorId(permissionContext, authContext, "U-DRIVER-A");

  if (url.pathname === "/api/driver/delivery-tasks") {
    if (!requireActionPermission(response, permissionContext, permission)) return true;
    await listDriverDeliveryTasksRoute({
      response,
      workspace,
      searchParams: url.searchParams,
      operatorId: resolveOperatorId(),
    });
    return true;
  }

  if (url.pathname === "/api/driver/v1-readiness") {
    if (!requireActionPermission(response, permissionContext, permission)) return true;
    sendJson(
      response,
      200,
      await getDriverV1ReadinessResponse({
        workspace,
        operatorId: resolveOperatorId(),
      }),
    );
    return true;
  }

  const detailMatch = url.pathname.match(/^\/api\/driver\/delivery-tasks\/([^/]+)$/);
  if (!detailMatch) return false;
  if (!requireActionPermission(response, permissionContext, permission)) return true;
  await getDriverDeliveryTaskRoute({
    response,
    workspace,
    fulfillmentId: decodeURIComponent(detailMatch[1]),
    operatorId: resolveOperatorId(),
  });
  return true;
}
