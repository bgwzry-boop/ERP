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
  todoCommandService,
  todoReadProjectionService,
  fulfillmentReadProjectionService,
  sendJson,
  sendNotFound,
  sendBusinessError,
}) {
  const todoHandleMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/handle$/);
  const todoReferenceMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/reference$/);
  const todoFulfillmentRepairMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/fulfillment-repair$/);
  if (method !== "POST" || (!todoHandleMatch && !todoReferenceMatch && !todoFulfillmentRepairMatch)) return false;

  const requiredPermission = todoFulfillmentRepairMatch
    ? writeActionPermissions.repairMissingFulfillment
    : todoReferenceMatch
      ? writeActionPermissions.repairTodoReference
      : writeActionPermissions.handleTodo;
  if (!requireActionPermission(response, permissionContext, requiredPermission)) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
  const route = todoFulfillmentRepairMatch
    ? { mode: "fulfillment", run: todoCommandService.repairMissingFulfillment }
    : todoReferenceMatch
      ? { mode: "todo", run: todoCommandService.repairTodoReference }
      : { mode: "todo", run: todoCommandService.handleTodo };
  const match = todoFulfillmentRepairMatch ?? todoReferenceMatch ?? todoHandleMatch;
  const result = await route.run({
    workspace,
    todoId: decodeURIComponent(match[1]),
    body,
    operatorId,
    operatorName: permissionContext?.user?.displayName ?? operatorId,
  });
  if (result.notFound) sendNotFound(response, result.code);
  else if (result.error) sendBusinessError(response, result.statusCode, result.code, result.message);
  else if (route.mode === "fulfillment") sendFulfillmentRepairResult(result);
  else sendTodoResult(result);
  return true;

  function sendTodoResult(result) {
    sendJson(response, 200, {
      todo: todoReadProjectionService.projectTodo({ workspace, todo: result.todo }),
      operationLogId: result.operationLogId,
    });
  }

  function sendFulfillmentRepairResult(result) {
    sendJson(response, 200, {
      todo: todoReadProjectionService.projectTodo({ workspace, todo: result.todo }),
      labelTodo: todoReadProjectionService.projectTodo({ workspace, todo: result.labelTodo }),
      fulfillment: fulfillmentReadProjectionService.projectFulfillment({ workspace, fulfillment: result.fulfillment }),
      packageIds: result.packages.map((record) => record.packageId ?? record.id),
      operationLogId: result.operationLogId,
    });
  }
}
