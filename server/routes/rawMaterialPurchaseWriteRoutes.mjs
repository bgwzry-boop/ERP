export async function handleRawMaterialPurchaseWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireAnyActionPermission,
  getPermissionOperatorId,
  sendJson,
  sendBusinessError,
  rawMaterialPurchaseCommandService,
}) {
  if (method !== "POST") return false;

  if (url.pathname === "/api/raw-material-purchase-requests") {
    if (!requirePurchaseDecisionPermission(response, permissionContext, writeActionPermissions, requireAnyActionPermission)) return true;
    const result = await rawMaterialPurchaseCommandService.createPurchaseRequest({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
      actionPermissions: permissionContext?.actionPermissions ?? [],
    });
    sendCommandResult({ response, result, sendJson, sendBusinessError });
    return true;
  }

  const statusMatch = url.pathname.match(/^\/api\/raw-material-purchase-requests\/([^/]+)\/status$/);
  if (!statusMatch) return false;
  if (!requirePurchaseDecisionPermission(response, permissionContext, writeActionPermissions, requireAnyActionPermission)) return true;
  const result = await rawMaterialPurchaseCommandService.updatePurchaseRequestStatus({
    workspace,
    requestId: decodeURIComponent(statusMatch[1]),
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    actionPermissions: permissionContext?.actionPermissions ?? [],
  });
  sendCommandResult({ response, result, sendJson, sendBusinessError });
  return true;
}

function requirePurchaseDecisionPermission(response, permissionContext, permissions, requireAnyActionPermission) {
  return requireAnyActionPermission(response, permissionContext, [
    permissions.recordDelegatedRawMaterialPurchase,
    permissions.actRawMaterialPurchaseDirectly,
  ]);
}

function sendCommandResult({ response, result, sendJson, sendBusinessError }) {
  if (result?.error) {
    sendBusinessError(response, result.statusCode, result.code, result.message, result.details);
    return;
  }
  sendJson(response, 200, result);
}
