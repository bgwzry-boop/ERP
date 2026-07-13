export async function handleTodoWriteRoutes({
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
  handleTodoRoute,
  repairTodoReferenceRoute,
}) {
  const todoHandleMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/handle$/);
  const todoReferenceMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/reference$/);
  if (method !== "POST" || (!todoHandleMatch && !todoReferenceMatch)) return false;

  const requiredPermission = todoReferenceMatch
    ? writeActionPermissions.repairTodoReference
    : writeActionPermissions.handleTodo;
  if (!requireActionPermission(response, permissionContext, requiredPermission)) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
  const handler = todoReferenceMatch ? repairTodoReferenceRoute : handleTodoRoute;
  const match = todoReferenceMatch ?? todoHandleMatch;
  await handler({
    response,
    workspace,
    todoId: decodeURIComponent(match[1]),
    body,
    operatorId,
    operatorName: permissionContext?.user?.displayName ?? operatorId,
  });
  return true;
}
