export async function handleAuthReadRoutes({
  url,
  response,
  permissionContext,
  authContext,
  runtimeAuthCommandService,
  sendCommandResponse,
}) {
  if (url.pathname !== "/api/auth/me") return false;
  const result = await runtimeAuthCommandService.getCurrentSession({
    permissionContext,
    authContext,
  });
  sendCommandResponse(response, result, { useResultStatusCode: true });
  return true;
}
