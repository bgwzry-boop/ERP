import { getAuthApiBaseUrl, isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  createOfficeRequestAbort,
  createOfficeRequestAbortError,
  isOfficeRequestAbort,
} from "./officeRequestAbort.js";
import { notifyRuntimeAuthInvalidationForResponse } from "./runtimeAuthInvalidation.js";

export {
  createOfficeRequestAbortError as createOfficeApiAbortError,
  DEFAULT_OFFICE_REQUEST_TIMEOUT_MS as DEFAULT_OFFICE_API_TIMEOUT_MS,
  isOfficeRequestAbort as isOfficeApiRequestAbort,
} from "./officeRequestAbort.js";

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
  if (options.rawBody !== undefined) init.body = options.rawBody;
  else if (options.body) init.body = JSON.stringify(options.body);
  const requestAbort = createOfficeRequestAbort({ signal: options.signal, timeoutMs: options.timeoutMs });
  init.signal = requestAbort.signal;
  try {
    const fetchedResponse = await fetchImpl(`${getAuthApiBaseUrl(options)}${path}`, init);
    const response = bindOfficeResponseBody(fetchedResponse, requestAbort);
    await notifyRuntimeAuthInvalidationForResponse(response, { authState: options.authState });
    if (requestAbort.signal.aborted) throw createOfficeRequestAbortError(requestAbort.reason);
    return response;
  } catch (error) {
    requestAbort.dispose();
    if (requestAbort.signal.aborted) throw createOfficeRequestAbortError(requestAbort.reason, error);
    throw error;
  }
}

// Fetch resolves at headers. Keep timeout/cancellation attached to the actual
// body stream until EOF, cancellation or failure, including Response.clone().
function bindOfficeResponseBody(response, requestAbort) {
  if (!response.body?.getReader) {
    requestAbort.dispose();
    return response;
  }
  const reader = response.body.getReader();
  const signal = requestAbort.signal;
  let onAbort;
  const dispose = () => {
    signal.removeEventListener("abort", onAbort);
    requestAbort.dispose();
  };
  const body = new ReadableStream({
    start(controller) {
      onAbort = () => {
        controller.error(createOfficeRequestAbortError(requestAbort.reason));
        dispose();
        void reader.cancel().catch(() => {});
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    },
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          dispose();
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        dispose();
        controller.error(signal.aborted ? createOfficeRequestAbortError(requestAbort.reason, error) : error);
      }
    },
    cancel(reason) {
      dispose();
      return reader.cancel(reason);
    },
  });
  const guardedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  for (const key of ["url", "redirected", "type"]) {
    Object.defineProperty(guardedResponse, key, { value: response[key] });
  }
  return guardedResponse;
}

export function toOfficeApiTransportError(error, fallbackMessage = "请求失败。") {
  if (error?.code === "REQUEST_TIMEOUT") {
    return { code: "REQUEST_TIMEOUT", message: error.message || "请求超时，请检查网络后重试。" };
  }
  if (error?.code === "REQUEST_ABORTED") {
    return { code: "REQUEST_ABORTED", message: error.message || "请求已取消。" };
  }
  return { code: "REQUEST_UNAVAILABLE", message: error?.message || fallbackMessage };
}

export function createOfficeIdempotencyKey() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `erp-${uuid}`;
  return `erp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function readOfficeApiJson(response, fallback = null) {
  try {
    return await response.json();
  } catch (error) {
    if (isOfficeRequestAbort(error)) throw error;
    return fallback;
  }
}

export function toOfficeApiError(json, status, fallbackMessage, options = {}) {
  const payload = json?.error ?? json ?? {};
  const rawMessage = payload.message;
  const message = typeof options.sanitizeMessage === "function"
    ? options.sanitizeMessage({ json: payload, status, fallbackMessage, message: rawMessage })
    : rawMessage ?? fallbackMessage;
  const error = {
    code: payload.code ?? `HTTP_${status}`,
    message: message || fallbackMessage,
    requiredPermission: payload.requiredPermission,
    currentRevision: payload.currentRevision ?? payload.details?.currentRevision,
    status,
  };
  if (payload.details !== undefined) error.details = payload.details;
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
