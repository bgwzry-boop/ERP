// Base64-backed evidence uploads may carry a 50 MiB source file (~66.7 MiB encoded).
// Print artwork uses the dedicated binary/object-storage path and never relies on this ceiling.
export const defaultMaxJsonBodyBytes = 72 * 1024 * 1024;
// 2026-11-07 负责人实测：免登录可以，但公网任意匿名请求不能被当成办公室账号。
// 免签身份只在本机预览 / 测试断言里放行；线上域名一律要求签名会话。
export const defaultUnsignedIdentityHosts = ["127.0.0.1", "localhost", "[::1]", "::1"];
const strictCorsRequestHeaders = ["content-type", "authorization", "idempotency-key"];
const prototypeCorsRequestHeaders = [
  ...strictCorsRequestHeaders,
  "x-erp-user-id",
  "x-erp-action-permissions",
];

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
    fixedPreviewUserId: runtimeMode === "test"
      ? String(options.fixedPreviewUserId ?? env.ERP_STAGING_PREVIEW_USER_ID ?? "U-MANAGER-A").trim()
      : "",
    // Strict mode never accepts prototype identity sources, even if a caller passes
    // a permissive option while constructing the server.
    allowSeedUsers: !strictAuth && options.allowSeedUsers !== false,
    allowLegacyIdentityHeaders: !strictAuth && options.allowLegacyIdentityHeaders !== false,
    allowActionPermissionOverride: !strictAuth && options.allowActionPermissionOverride !== false,
    allowDefaultSeedUser: !strictAuth && options.allowDefaultSeedUser !== false,
    phoneRegistrationEnabled: parseBooleanFlag(
      options.phoneRegistrationEnabled ?? env.ERP_PHONE_REGISTRATION_ENABLED,
    ),
    corsAllowedOrigins: normalizeCorsAllowedOrigins(options.corsAllowedOrigins ?? env.ERP_CORS_ALLOWED_ORIGINS),
    maxJsonBodyBytes: resolveMaxJsonBodyBytes(options.maxJsonBodyBytes ?? env.ERP_API_MAX_JSON_BODY_BYTES),
    unsignedIdentityHosts: normalizeUnsignedIdentityHosts(
      options.unsignedIdentityHosts ?? env.ERP_UNSIGNED_IDENTITY_HOSTS,
    ),
  };
}

export function getWorkspaceSecurityPolicy(workspace = {}) {
  return (
    workspace.securityPolicy ?? {
      runtimeMode: "demo",
      strictAuth: false,
      authSecret: "",
      fixedPreviewUserId: "",
      allowSeedUsers: true,
      allowLegacyIdentityHeaders: true,
      allowActionPermissionOverride: true,
      allowDefaultSeedUser: true,
      phoneRegistrationEnabled: false,
      corsAllowedOrigins: [],
      maxJsonBodyBytes: defaultMaxJsonBodyBytes,
      unsignedIdentityHosts: defaultUnsignedIdentityHosts,
    }
  );
}

function normalizeUnsignedIdentityHosts(value) {
  const values = Array.isArray(value) ? value : [value];
  const hosts = values.flatMap((item) => String(item ?? "").split(/[;,\n]/))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length ? [...new Set(hosts)] : [...defaultUnsignedIdentityHosts];
}

// 免签身份（x-erp-user-id / 默认种子用户 / 权限覆盖头）只在两种情况下放行：
//   1) 请求没有 Host（单元测试里的合成 request）；
//   2) Host 命中本机白名单，且没有任何反向代理转发头。
// 线上经过 nginx 的请求一定带 x-forwarded-for / x-real-ip，因此即使伪造 Host 也进不来。
export function isUnsignedIdentityRequestAllowed(request, securityPolicy = {}) {
  const headers = request?.headers ?? {};
  const forwarded = headers["x-forwarded-for"] || headers["x-real-ip"] || headers["x-forwarded-host"];
  if (forwarded) return false;
  const rawHost = String(headers.host ?? headers[":authority"] ?? "").trim();
  if (!rawHost) return true;
  const host = rawHost.replace(/^\[([^\]]+)\](?::\d+)?$/, "[$1]").replace(/:(\d+)$/, "").toLowerCase();
  const allowed = Array.isArray(securityPolicy.unsignedIdentityHosts) && securityPolicy.unsignedIdentityHosts.length
    ? securityPolicy.unsignedIdentityHosts
    : defaultUnsignedIdentityHosts;
  return allowed.includes(host);
}

export function isCorsRequestAllowed(securityPolicy, origin) {
  if (!securityPolicy.strictAuth || !origin) return true;
  return securityPolicy.corsAllowedOrigins.includes(origin);
}

export function getCorsAllowedRequestHeaders(securityPolicy = {}) {
  return (securityPolicy.strictAuth ? strictCorsRequestHeaders : prototypeCorsRequestHeaders).join(", ");
}

export function isPublicApiRoute(method, pathname, securityPolicy = {}) {
  return (
    (method === "GET" && pathname === "/api/health") ||
    (method === "POST" && pathname === "/api/auth/login") ||
    (method === "POST" && pathname === "/api/auth/prototype-login" && securityPolicy.strictAuth !== true) ||
    (method === "POST" && securityPolicy.phoneRegistrationEnabled === true && [
      "/api/auth/phone-registration/request-code",
      "/api/auth/phone-registration/complete",
      "/api/auth/phone-login/request-code",
      "/api/auth/phone-login",
    ].includes(pathname))
  );
}

function parseBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeCorsAllowedOrigins(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((item) => String(item ?? "").split(/[;,\n]/)).map((item) => item.trim()).filter(Boolean))];
}

function resolveMaxJsonBodyBytes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultMaxJsonBodyBytes;
}
