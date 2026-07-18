export async function handleAttachmentReadRoutes({
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
  sendBusinessError,
  sendInlineFile,
  paginate,
  attachmentFileAccessService,
  runAttachmentStorageDiagnostics,
  buildAttachmentV1Readiness,
}) {
  const directRoutes = {
    "/api/attachments": {
      run: async () => {
        const result = await attachmentFileAccessService.listAttachments({
          workspace,
          filters: {
            ownerType: url.searchParams.get("ownerType"),
            ownerId: url.searchParams.get("ownerId"),
            purpose: url.searchParams.get("purpose"),
            fileType: url.searchParams.get("fileType"),
            keyword: url.searchParams.get("keyword"),
          },
        });
        sendJson(response, 200, paginate(result.items, url.searchParams));
      },
    },
    "/api/attachments/storage-diagnostics": {
      run: async () => sendJson(response, 200, await runAttachmentStorageDiagnostics(workspace.attachmentObjectStorage)),
    },
    "/api/attachments/v1-readiness": {
      run: async () =>
        sendJson(
          response,
          200,
          await buildAttachmentV1Readiness({
          workspace,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
          }),
        ),
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
    const result = await attachmentFileAccessService.createAccessUrl({
      workspace,
      attachmentId: decodeURIComponent(accessUrlMatch[1]),
      ttlSeconds: url.searchParams.get("ttlSeconds"),
      operatorId: authContext.userId,
    });
    if (result.notFound) sendNotFound(response, result.code);
    else sendJson(response, 200, result.response);
    return true;
  }

  const accessLogsMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/access-logs$/);
  if (accessLogsMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.viewAttachment)) return true;
    const result = await attachmentFileAccessService.listAccessLogs({
      workspace,
      attachmentId: decodeURIComponent(accessLogsMatch[1]),
      limit: url.searchParams.get("limit"),
    });
    if (result.notFound) sendNotFound(response, result.code);
    else sendJson(response, 200, result.response);
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
  const result = await attachmentFileAccessService.getContent({
    workspace,
    attachmentId,
    operatorId: authContext.userId,
    accessMode: signedAccess.valid ? "signed_url" : "permission",
  });
  if (result.notFound) sendNotFound(response, result.code);
  else sendInlineFile(response, 200, result.file.body, result.file.options);
  return true;
}
