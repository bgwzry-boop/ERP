export async function handleBusinessDecisionWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  requireActionPermission,
  getPermissionOperatorId,
  businessDecisionDirectiveCommandService,
  sendCommandResponse,
} = {}) {
  if (method !== "POST" || url.pathname !== "/api/business-decisions") return false;
  if (!requireActionPermission(response, permissionContext, "business_decision.act_directly")) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "");
  const result = await businessDecisionDirectiveCommandService.recordDecisionDirective({
    workspace,
    body,
    operatorId,
    actionPermissions: permissionContext?.actionPermissions ?? [],
  });
  sendCommandResponse(response, result, { includeErrorDetails: true, useResultStatusCode: true });
  return true;
}
