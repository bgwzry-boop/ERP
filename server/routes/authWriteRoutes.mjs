export async function handleAuthWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  authContext,
  loginSeedAuth,
  loginPrototypeSeedAuth,
  changeRuntimeUserPasswordRoute,
  logoutSeedAuth,
}) {
  if (method !== "POST") return false;

  const routes = {
    "/api/auth/login": () => loginSeedAuth({ response, workspace, body }),
    "/api/auth/prototype-login": () => loginPrototypeSeedAuth({ response, workspace, body }),
    "/api/auth/change-password": () => changeRuntimeUserPasswordRoute({ response, workspace, body, authContext }),
    "/api/auth/logout": () => logoutSeedAuth({ response, workspace, authContext }),
  };
  const route = routes[url.pathname];
  if (!route) return false;

  await route();
  return true;
}
