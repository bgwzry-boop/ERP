export async function handleAttachmentReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  sendBusinessError,
  listAttachmentsRoute,
  getAttachmentStorageDiagnosticsRoute,
  getAttachmentV1ReadinessRoute,
  createAttachmentAccessUrlRoute,
  listAttachmentAccessLogsRoute,
  getAttachmentContentRoute,
}) {
  const directRoutes = {
    "/api/attachments": {
      run: () => listAttachmentsRoute({ response, workspace, searchParams: url.searchParams }),
    },
    "/api/attachments/storage-diagnostics": {
      run: () => getAttachmentStorageDiagnosticsRoute({ response, workspace }),
    },
    "/api/attachments/v1-readiness": {
      run: () =>
        getAttachmentV1ReadinessRoute({
          response,
          workspace,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
        }),
    },
  };
  const directRoute = directRoutes[url.pathname];
  if (directRoute) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.viewAttachment)) return true;
    await directRoute.run();
    return true;
  }

  const accessUrlMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/access-url$/);
  if (accessUrlMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.viewAttachment)) return true;
    await createAttachmentAccessUrlRoute({
      response,
      workspace,
      attachmentId: decodeURIComponent(accessUrlMatch[1]),
      searchParams: url.searchParams,
      authContext,
    });
    return true;
  }

  const accessLogsMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/access-logs$/);
  if (accessLogsMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.viewAttachment)) return true;
    await listAttachmentAccessLogsRoute({
      response,
      workspace,
      attachmentId: decodeURIComponent(accessLogsMatch[1]),
      searchParams: url.searchParams,
    });
    return true;
  }

  const contentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/content$/);
  if (!contentMatch) return false;

  const attachmentId = decodeURIComponent(contentMatch[1]);
  const signedAccess = workspace.attachmentObjectStorage.validateAccessToken({
    attachmentId,
    accessToken: url.searchParams.get("accessToken"),
    expiresAt: url.searchParams.get("expiresAt"),
  });
  if (!signedAccess.valid) {
    if (signedAccess.present) {
      sendBusinessError(response, 403, "ATTACHMENT_ACCESS_TOKEN_INVALID", signedAccess.message);
      return true;
    }
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.viewAttachment)) return true;
  }
  await getAttachmentContentRoute({
    response,
    workspace,
    attachmentId,
    authContext,
    accessMode: signedAccess.valid ? "signed_url" : "permission",
  });
  return true;
}
