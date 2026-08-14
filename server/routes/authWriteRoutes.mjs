export async function handleAuthWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  authContext,
  runtimeAuthCommandService,
  phoneIdentityCommandService,
  sendCommandResponse,
}) {
  if (method !== "POST") return false;

  const routes = {
    "/api/auth/login": () => runtimeAuthCommandService.login({ workspace, body }),
    "/api/auth/prototype-login": () => runtimeAuthCommandService.prototypeLogin({ workspace, body }),
    "/api/auth/change-password": () => runtimeAuthCommandService.changePassword({ workspace, body, authContext }),
    "/api/auth/logout": () => runtimeAuthCommandService.logout({ workspace, authContext }),
    "/api/auth/phone-registration/request-code": () =>
      phoneIdentityCommandService.requestRegistrationCode({ workspace, body }),
    "/api/auth/phone-registration/complete": () =>
      phoneIdentityCommandService.completeRegistration({ workspace, body }),
    "/api/auth/phone-login/request-code": () =>
      phoneIdentityCommandService.requestLoginCode({ workspace, body }),
    "/api/auth/phone-login": () =>
      phoneIdentityCommandService.loginWithPhoneCode({ workspace, body }),
  };
  const route = routes[url.pathname];
  if (!route) return false;

  const result = await route();
  sendCommandResponse(response, result, { useResultStatusCode: true });
  return true;
}
