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
  getStatementExportStorageDiagnosticsRoute,
  getStatementExportV1ReadinessRoute,
  listStatementExportsRoute,
  downloadStatementExportRoute,
}) {
  const requirePreviewPermission = () =>
    requireActionPermission(response, permissionContext, writeActionPermissions.previewStatement);

  if (url.pathname === "/api/statements/export-storage-diagnostics") {
    if (!requirePreviewPermission()) return true;
    await getStatementExportStorageDiagnosticsRoute({ response, workspace });
    return true;
  }

  if (url.pathname === "/api/statements/export-v1-readiness") {
    if (!requirePreviewPermission()) return true;
    await getStatementExportV1ReadinessRoute({
      response,
      workspace,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const exportListMatch = url.pathname.match(/^\/api\/statements\/([^/]+)\/exports$/);
  if (exportListMatch) {
    if (!requirePreviewPermission()) return true;
    await listStatementExportsRoute({ response, workspace, statementId: decodeURIComponent(exportListMatch[1]) });
    return true;
  }

  const exportDownloadMatch = url.pathname.match(/^\/api\/statements\/([^/]+)\/exports\/([^/]+)$/);
  if (exportDownloadMatch) {
    if (!requirePreviewPermission()) return true;
    await downloadStatementExportRoute({
      response,
      workspace,
      statementId: decodeURIComponent(exportDownloadMatch[1]),
      downloadToken: decodeURIComponent(exportDownloadMatch[2]),
    });
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
