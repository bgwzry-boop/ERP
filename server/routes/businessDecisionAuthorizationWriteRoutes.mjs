export async function handleBusinessDecisionAuthorizationWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  requireActionPermission,
  getPermissionOperatorId,
  businessDecisionAuthorizationCommandService,
  sendCommandResponse,
} = {}) {
  if (method !== "POST") return false;
  const create = url.pathname === "/api/business-decision-authorizations";
  const match = url.pathname.match(/^\/api\/business-decision-authorizations\/([^/]+)\/(update|deactivate)$/);
  if (!create && !match) return false;
  if (!requireActionPermission(response, permissionContext, "business_decision.authorization.manage")) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A");
  let result;
  if (create) {
    result = await businessDecisionAuthorizationCommandService.createAuthorization({ workspace, body, operatorId });
  } else if (match[2] === "update") {
    result = await businessDecisionAuthorizationCommandService.updateAuthorization({
      workspace,
      authorizationId: decodeURIComponent(match[1]),
      body,
      operatorId,
    });
  } else {
    result = await businessDecisionAuthorizationCommandService.deactivateAuthorization({
      workspace,
      authorizationId: decodeURIComponent(match[1]),
      body,
      operatorId,
    });
  }
  sendCommandResponse(response, result, { includeErrorDetails: true, useResultStatusCode: true });
  return true;
}
