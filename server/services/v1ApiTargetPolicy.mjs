const defaultApiPort = 8787;

export function resolveConfiguredOrLoopbackV1ApiBaseUrl({
  request,
  configuredApiBaseUrl = "",
  fallbackPort = defaultApiPort,
} = {}) {
  const configured = text(configuredApiBaseUrl);
  if (configured) return normalizeConfiguredV1ApiBaseUrl(configured);
  return resolveLoopbackV1ApiBaseUrl(request, { fallbackPort });
}

export function resolveLoopbackV1ApiBaseUrl(request, { fallbackPort = defaultApiPort } = {}) {
  const socketPort = validPort(request?.socket?.localPort || request?.connection?.localPort);
  const port = socketPort || validPort(fallbackPort) || defaultApiPort;
  return `http://127.0.0.1:${port}/api`;
}

export function normalizeConfiguredV1ApiBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(text(value));
  } catch {
    throw new Error("Configured V1 API base URL must be an absolute HTTP(S) URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Configured V1 API base URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Configured V1 API base URL must not contain credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Configured V1 API base URL must not contain a query or fragment.");
  }
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (pathname !== "/api" && !pathname.endsWith("/api")) {
    throw new Error("Configured V1 API base URL path must end with /api.");
  }
  return `${parsed.origin}${pathname}`;
}

function validPort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) return 0;
  return parsed;
}

function text(value) {
  return String(value ?? "").trim();
}
