export async function handleAttachmentWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  requireAttachmentCreatePermission,
  createAttachmentRoute,
}) {
  if (method !== "POST" || url.pathname !== "/api/attachments") return false;
  if (!requireAttachmentCreatePermission(response, permissionContext, body)) return true;
  await createAttachmentRoute({ response, workspace, body });
  return true;
}
