export async function handleTodoWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  writeActionPermissions,
  requireActionPermission,
  handleTodoRoute,
}) {
  const todoHandleMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/handle$/);
  if (method !== "POST" || !todoHandleMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.handleTodo)) return true;
  handleTodoRoute({ response, workspace, todoId: decodeURIComponent(todoHandleMatch[1]), body });
  return true;
}
