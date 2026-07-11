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
}) {
  const todoHandleMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/handle$/);
  if (method !== "POST" || !todoHandleMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.handleTodo)) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
  await handleTodoRoute({
    response,
    workspace,
    todoId: decodeURIComponent(todoHandleMatch[1]),
    body,
    operatorId,
    operatorName: permissionContext?.user?.displayName ?? operatorId,
  });
  return true;
}
