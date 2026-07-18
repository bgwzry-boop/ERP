export async function handleMaintenanceTaskReadRoutes({
  method,
  url,
  response,
  workspace,
  permissionContext,
  requireActionPermission,
  sendJson,
} = {}) {
  if (method !== "GET" || url.pathname !== "/api/maintenance/tasks") return false;
  if (!requireActionPermission(response, permissionContext, "maintenance.task.read")) return true;
  const items = await workspace.maintenanceTaskRepository.listTasks({
    workspace,
    filters: {
      status: url.searchParams.get("status") ?? "all",
      taskType: url.searchParams.get("taskType") ?? "",
      machineId: url.searchParams.get("machineId") ?? "",
      assignedEmployeeId: url.searchParams.get("assignedEmployeeId") ?? "",
    },
  });
  sendJson(response, 200, { items, total: items.length, readOnly: true });
  return true;
}

export async function handleMaintenanceTaskWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  requireActionPermission,
  getPermissionOperatorId,
  maintenanceTaskCommandService,
  sendCommandResponse,
} = {}) {
  if (method !== "POST") return false;
  const create = url.pathname === "/api/maintenance/tasks";
  const updateMatch = url.pathname.match(/^\/api\/maintenance\/tasks\/([^/]+)\/update$/);
  if (!create && !updateMatch) return false;
  const permission = create ? "maintenance.task.create" : "maintenance.task.update";
  if (!requireActionPermission(response, permissionContext, permission)) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "");
  const result = create
    ? await maintenanceTaskCommandService.createTask({ workspace, body, operatorId })
    : await maintenanceTaskCommandService.updateTask({
      workspace,
      taskId: decodeURIComponent(updateMatch[1]),
      body,
      operatorId,
    });
  sendCommandResponse(response, result, { includeErrorDetails: true, useResultStatusCode: true });
  return true;
}
