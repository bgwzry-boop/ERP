export async function handleStatementWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  writeActionPermissions,
  requireActionPermission,
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
  const routes = {
    preview: { permission: writeActionPermissions.previewStatement, run: previewStatementRoute },
    "mark-sent": { permission: writeActionPermissions.markStatementSent, run: markStatementSentRoute },
    "send-receipt": { permission: writeActionPermissions.markStatementSent, run: markStatementSendReceiptRoute },
    "customer-confirmation": { permission: writeActionPermissions.markStatementSent, run: recordStatementCustomerConfirmationRoute },
    payments: { permission: writeActionPermissions.recordStatementPayment, run: recordStatementPaymentRoute },
    variance: { permission: writeActionPermissions.handleStatementVariance, run: handleStatementVarianceRoute },
    "write-off": { permission: writeActionPermissions.writeOffStatement, run: writeOffStatementRoute },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  await route.run({ response, workspace, statementId, body });
  return true;
}
