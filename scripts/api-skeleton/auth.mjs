export async function checkAuthSkeleton({ baseUrl, getJson, postJson }) {
  const anonymousMe = await getJson(baseUrl, "/api/auth/me", { expectedStatus: 401 });
  if (anonymousMe.code !== "AUTH_SESSION_REQUIRED") {
    throw new Error("/api/auth/me did not require a signed seed session token");
  }

  const failedLogin = await postJson(
    baseUrl,
    "/api/auth/login",
    { loginName: "finance.a", password: "invalid-seed-credential" },
    { expectedStatus: 401 },
  );
  if (failedLogin.code !== "AUTHENTICATION_FAILED") {
    throw new Error("/api/auth/login did not reject an invalid seed password");
  }

  const stagingLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName: process.env.ERP_STAGING_TEST_LOGIN,
    password: process.env.ERP_STAGING_TEST_PASSWORD,
  });
  if (
    stagingLogin.session?.tokenType !== "Bearer" ||
    !stagingLogin.session?.accessToken?.startsWith("seed-session.") ||
    stagingLogin.permissions?.user?.userId !== "U-STAGING-TEST"
  ) {
    throw new Error("/api/auth/login returned an unexpected seed session payload");
  }

  const prototypeLogin = await postJson(baseUrl, "/api/auth/prototype-login", { userId: "U-MANAGER-A" });
  if (
    prototypeLogin.session?.tokenType !== "Bearer" ||
    !prototypeLogin.session?.accessToken?.startsWith("seed-session.") ||
    prototypeLogin.permissions?.user?.userId !== "U-MANAGER-A"
  ) {
    throw new Error("/api/auth/prototype-login returned an unexpected local prototype session payload");
  }

  const financeMe = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${stagingLogin.session.accessToken}` },
  });
  if (
    financeMe.authenticated !== true ||
    financeMe.session?.userId !== "U-STAGING-TEST" ||
    !financeMe.permissions?.actionPermissions?.includes("statement.payment.record")
  ) {
    throw new Error("/api/auth/me did not return the logged-in staging test context");
  }

  const logout = await postJson(
    baseUrl,
    "/api/auth/logout",
    {},
    { headers: { authorization: `Bearer ${stagingLogin.session.accessToken}` } },
  );
  if (logout.loggedOut !== true || logout.sessionUserId !== "U-STAGING-TEST" || logout.tokenRevoked !== true) {
    throw new Error("/api/auth/logout returned an unexpected payload");
  }
  const financeMeAfterLogout = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${stagingLogin.session.accessToken}` },
    expectedStatus: 401,
  });
  if (financeMeAfterLogout.code !== "AUTH_TOKEN_REVOKED") {
    throw new Error("/api/auth/logout did not revoke the current seed session token");
  }
}
