export async function handleStatementWriteRoutes({
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
  previewStatementRoute,
  markStatementSentRoute,
  markStatementSendReceiptRoute,
  recordStatementCustomerConfirmationRoute,
  recordStatementPaymentRoute,
  handleStatementVarianceRoute,
  writeOffStatementRoute,
}) {
  if (method !== "POST") return false;

  const match = url.pathname.match(/^\/api\/statements\/([^/]+)\/(preview|mark-sent|send-receipt|customer-confirmation|payments|variance|write-off)$/);
  if (!match) return false;

  const statementId = decodeURIComponent(match[1]);
  const action = match[2];
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
  const routeInput = { response, workspace, statementId, body, operatorId };
  const routes = {
    preview: { permission: writeActionPermissions.previewStatement, run: () => previewStatementRoute(routeInput) },
    "mark-sent": { permission: writeActionPermissions.markStatementSent, run: () => markStatementSentRoute(routeInput) },
    "send-receipt": { permission: writeActionPermissions.markStatementSent, run: () => markStatementSendReceiptRoute(routeInput) },
    "customer-confirmation": {
      permission: writeActionPermissions.markStatementSent,
      run: () => recordStatementCustomerConfirmationRoute(routeInput),
    },
    payments: { permission: writeActionPermissions.recordStatementPayment, run: () => recordStatementPaymentRoute(routeInput) },
    variance: { permission: writeActionPermissions.handleStatementVariance, run: () => handleStatementVarianceRoute(routeInput) },
    "write-off": { permission: writeActionPermissions.writeOffStatement, run: () => writeOffStatementRoute(routeInput) },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  await route.run();
  return true;
}
