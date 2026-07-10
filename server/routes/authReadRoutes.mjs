export async function handleAuthReadRoutes({ url, response, permissionContext, authContext, getCurrentAuthSession }) {
  if (url.pathname !== "/api/auth/me") return false;
  await getCurrentAuthSession({ response, permissionContext, authContext });
  return true;
}
