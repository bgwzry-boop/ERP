import { getAuthApiBaseUrl, isOfficeApiServerRequired } from "./officeAuthService.js";
import { notifyRuntimeAuthInvalidationForResponse } from "./runtimeAuthInvalidation.js";

export function buildOfficeApiHeaders(authState, operatorId, extraHeaders = {}, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...extraHeaders,
  };
  if (authState?.session?.accessToken) {
    headers.authorization = `Bearer ${authState.session.accessToken}`;
    return headers;
  }
  if (operatorId && !isOfficeApiServerRequired(options)) {
    headers["x-erp-user-id"] = operatorId;
  }
  return headers;
}

export async function requestOfficeApi(path, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = String(options.method ?? "GET").toUpperCase();
  const headers = buildOfficeApiHeaders(options.authState, options.operatorId, options.headers, options);
  if (method !== "GET" && method !== "HEAD" && !headers["idempotency-key"] && !headers["Idempotency-Key"]) {
    headers["idempotency-key"] = options.idempotencyKey ?? createOfficeIdempotencyKey();
  }
  const init = {
    method,
    headers,
  };
  if (options.body) init.body = JSON.stringify(options.body);
  const response = await fetchImpl(`${getAuthApiBaseUrl(options)}${path}`, init);
  await notifyRuntimeAuthInvalidationForResponse(response, { authState: options.authState });
  return response;
}

export function createOfficeIdempotencyKey() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `erp-${uuid}`;
  return `erp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function readOfficeApiJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function toOfficeApiError(json, status, fallbackMessage) {
  const error = {
    code: json?.code ?? `HTTP_${status}`,
    message: json?.message ?? fallbackMessage,
    requiredPermission: json?.requiredPermission,
    currentRevision: json?.currentRevision,
    status,
  };
  if (json?.details !== undefined) error.details = json.details;
  return error;
}

export function buildOfficeServerRequiredWriteError(code, error, extra = {}) {
  return {
    source: "api_error",
    blocked: true,
    ...extra,
    error: {
      code,
      message: `生产模式要求后端事务，未执行本地降级：${error?.message ?? String(error)}`,
    },
  };
}
