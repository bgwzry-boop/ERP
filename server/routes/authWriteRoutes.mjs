export async function handleAuthWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  authContext,
  runtimeAuthCommandService,
  sendCommandResponse,
}) {
  if (method !== "POST") return false;

  const routes = {
    "/api/auth/login": () => runtimeAuthCommandService.login({ workspace, body }),
    "/api/auth/prototype-login": () => runtimeAuthCommandService.prototypeLogin({ workspace, body }),
    "/api/auth/change-password": () => runtimeAuthCommandService.changePassword({ workspace, body, authContext }),
    "/api/auth/logout": () => runtimeAuthCommandService.logout({ workspace, authContext }),
  };
  const route = routes[url.pathname];
  if (!route) return false;

  const result = await route();
  sendCommandResponse(response, result, { useResultStatusCode: true });
  return true;
}
