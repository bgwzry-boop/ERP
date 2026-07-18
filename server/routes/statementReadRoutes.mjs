export async function handleStatementReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  sendJson,
  sendNotFound,
  getStatementCustomers,
  filterByKeyword,
  filterByValue,
  paginate,
  statementExportFileService,
  runStatementExportStorageDiagnostics,
  buildStatementExportV1Readiness,
  sendCommandResponse,
  sendFile,
}) {
  const requirePreviewPermission = () =>
    requireActionPermission(response, permissionContext, writeActionPermissions.previewStatement);

  if (url.pathname === "/api/statements/export-storage-diagnostics") {
    if (!requirePreviewPermission()) return true;
    sendJson(response, 200, await runStatementExportStorageDiagnostics(workspace.statementExportObjectStorage));
    return true;
  }

  if (url.pathname === "/api/statements/export-v1-readiness") {
    if (!requirePreviewPermission()) return true;
    sendJson(
      response,
      200,
      await buildStatementExportV1Readiness({
        workspace,
        operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
      }),
    );
    return true;
  }

  const exportListMatch = url.pathname.match(/^\/api\/statements\/([^/]+)\/exports$/);
  if (exportListMatch) {
    if (!requirePreviewPermission()) return true;
    const result = await statementExportFileService.listExports({
      workspace,
      statementId: decodeURIComponent(exportListMatch[1]),
    });
    sendCommandResponse(response, result);
    return true;
  }

  const exportDownloadMatch = url.pathname.match(/^\/api\/statements\/([^/]+)\/exports\/([^/]+)$/);
  if (exportDownloadMatch) {
    if (!requirePreviewPermission()) return true;
    const result = await statementExportFileService.getExportDownload({
      workspace,
      statementId: decodeURIComponent(exportDownloadMatch[1]),
      downloadToken: decodeURIComponent(exportDownloadMatch[2]),
    });
    if (result.notFound) sendNotFound(response, result.code);
    else sendFile(response, 200, result.response.body, result.response.options);
    return true;
  }

  if (url.pathname === "/api/statements/customers") {
    let items = getStatementCustomers(workspace);
    items = filterByKeyword(items, url.searchParams.get("keyword"), ["customerId", "customerName", "statementId"]);
    items = filterByValue(items, url.searchParams.get("status"), "status");
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  const statementMatch = url.pathname.match(/^\/api\/statements\/([^/]+)$/);
  if (!statementMatch) return false;

  const item = workspace.statements.find((row) => row.id === decodeURIComponent(statementMatch[1]));
  if (item) sendJson(response, 200, item);
  else sendNotFound(response, "STATEMENT_NOT_FOUND");
  return true;
}
