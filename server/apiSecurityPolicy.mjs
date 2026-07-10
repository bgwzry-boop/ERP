export const defaultMaxJsonBodyBytes = 24 * 1024 * 1024;

export function buildApiSecurityPolicy(options = {}, env = process.env) {
  const authMode = String(options.authMode ?? env.ERP_AUTH_MODE ?? "").trim().toLowerCase();
  const runtimeMode = String(options.runtimeMode ?? env.ERP_RUNTIME_MODE ?? "").trim().toLowerCase();
  const strictAuth =
    runtimeMode === "production" ||
    options.strictAuth === true ||
    ["strict", "production", "required"].includes(authMode) ||
    String(env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const authSecret = String(options.authSecret ?? env.ERP_AUTH_SECRET ?? "").trim();
  if (strictAuth && !authSecret) {
    throw new Error("ERP_AUTH_SECRET must be configured when strict production authentication is enabled.");
  }

  return {
    runtimeMode: runtimeMode || "demo",
    strictAuth,
    authSecret,
    // Strict mode never accepts prototype identity sources, even if a caller passes
    // a permissive option while constructing the server.
    allowSeedUsers: !strictAuth && options.allowSeedUsers !== false,
    allowLegacyIdentityHeaders: !strictAuth && options.allowLegacyIdentityHeaders !== false,
    allowActionPermissionOverride: !strictAuth && options.allowActionPermissionOverride !== false,
    allowDefaultSeedUser: !strictAuth && options.allowDefaultSeedUser !== false,
    corsAllowedOrigins: normalizeCorsAllowedOrigins(options.corsAllowedOrigins ?? env.ERP_CORS_ALLOWED_ORIGINS),
    maxJsonBodyBytes: resolveMaxJsonBodyBytes(options.maxJsonBodyBytes ?? env.ERP_API_MAX_JSON_BODY_BYTES),
  };
}

export function getWorkspaceSecurityPolicy(workspace = {}) {
  return (
    workspace.securityPolicy ?? {
      runtimeMode: "demo",
      strictAuth: false,
      authSecret: "",
      allowSeedUsers: true,
      allowLegacyIdentityHeaders: true,
      allowActionPermissionOverride: true,
      allowDefaultSeedUser: true,
      corsAllowedOrigins: [],
      maxJsonBodyBytes: defaultMaxJsonBodyBytes,
    }
  );
}

export function isCorsRequestAllowed(securityPolicy, origin) {
  if (!securityPolicy.strictAuth || !origin) return true;
  return securityPolicy.corsAllowedOrigins.includes(origin);
}

export function isPublicApiRoute(method, pathname, securityPolicy = {}) {
  return (
    (method === "GET" && pathname === "/api/health") ||
    (method === "POST" && pathname === "/api/auth/login") ||
    (method === "POST" && pathname === "/api/auth/prototype-login" && securityPolicy.strictAuth !== true)
  );
}

function normalizeCorsAllowedOrigins(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((item) => String(item ?? "").split(/[;,\n]/)).map((item) => item.trim()).filter(Boolean))];
}

function resolveMaxJsonBodyBytes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultMaxJsonBodyBytes;
}
