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
  statementCommunicationCommandService,
  statementFinancialCommandService,
  sendCommandResponse,
}) {
  if (method !== "POST") return false;

  const match = url.pathname.match(/^\/api\/statements\/([^/]+)\/(preview|mark-sent|send-receipt|customer-confirmation|payments|variance|write-off)$/);
  if (!match) return false;

  const statementId = decodeURIComponent(match[1]);
  const action = match[2];
  const routes = {
    preview: {
      permission: writeActionPermissions.previewStatement,
      run: (operatorId) => statementCommunicationCommandService.previewStatement({ workspace, statementId, body, operatorId }),
    },
    "mark-sent": {
      permission: writeActionPermissions.markStatementSent,
      run: (operatorId) => statementCommunicationCommandService.markStatementSent({ workspace, statementId, body, operatorId }),
    },
    "send-receipt": {
      permission: writeActionPermissions.markStatementSent,
      run: (operatorId) => statementCommunicationCommandService.markStatementSendReceipt({ workspace, statementId, body, operatorId }),
    },
    "customer-confirmation": {
      permission: writeActionPermissions.markStatementSent,
      run: (operatorId) => statementCommunicationCommandService.recordStatementCustomerConfirmation({ workspace, statementId, body, operatorId }),
    },
    payments: {
      permission: writeActionPermissions.recordStatementPayment,
      run: (operatorId) => statementFinancialCommandService.recordPayment({ workspace, statementId, body, operatorId }),
    },
    variance: {
      permission: writeActionPermissions.handleStatementVariance,
      run: (operatorId) => statementFinancialCommandService.handleVariance({
        workspace,
        statementId,
        body,
        operatorId,
        actionPermissions: permissionContext?.actionPermissions ?? [],
      }),
    },
    "write-off": {
      permission: writeActionPermissions.writeOffStatement,
      run: (operatorId) => statementFinancialCommandService.writeOffStatement({
        workspace,
        statementId,
        body,
        operatorId,
        actionPermissions: permissionContext?.actionPermissions ?? [],
      }),
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
  const result = await route.run(operatorId);
  sendCommandResponse(response, result);
  return true;
}
