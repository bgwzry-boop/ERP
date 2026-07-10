import { getAuthApiBaseUrl, isOfficeApiServerRequired } from "./officeAuthService.js";

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
  const init = {
    method: options.method ?? "GET",
    headers: buildOfficeApiHeaders(options.authState, options.operatorId, options.headers, options),
  };
  if (options.body) init.body = JSON.stringify(options.body);
  return fetchImpl(`${getAuthApiBaseUrl(options)}${path}`, init);
}

export async function readOfficeApiJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function toOfficeApiError(json, status, fallbackMessage) {
  return {
    code: json?.code ?? `HTTP_${status}`,
    message: json?.message ?? fallbackMessage,
    requiredPermission: json?.requiredPermission,
  };
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
