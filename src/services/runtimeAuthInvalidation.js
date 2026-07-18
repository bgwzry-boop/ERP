export const runtimeAuthInvalidationEventName = "erp:runtime-auth-invalidated";

const runtimeAuthInvalidationDefinitions = {
  AUTH_TOKEN_REVOKED: {
    reason: "runtime_session_revoked",
    message: "当前登录已被撤销，请重新登录。",
  },
  AUTH_TOKEN_EXPIRED: {
    reason: "runtime_session_expired",
    message: "当前登录会话已失效，请重新登录。",
  },
  AUTH_TOKEN_INVALID: {
    reason: "runtime_session_invalid",
    message: "当前登录凭证无效，请重新登录。",
  },
  AUTH_USER_DISABLED: {
    reason: "runtime_user_disabled",
    message: "当前账号已停用，请联系管理员后重新登录。",
  },
};

export function getRuntimeAuthInvalidation({ authState, error, session, status } = {}) {
  const runtimeSession = authState?.session ?? session;
  const code = String(error?.code ?? "").trim();
  const definition = runtimeAuthInvalidationDefinitions[code];
  if (runtimeSession?.sessionType !== "runtime" || Number(status) !== 401 || !definition) return null;
  return {
    reason: definition.reason,
    error: {
      code,
      message: definition.message,
    },
  };
}

export async function notifyRuntimeAuthInvalidationForResponse(response, options = {}) {
  if (Number(response?.status) !== 401) return null;
  const error = await readResponseJsonClone(response);
  const invalidation = getRuntimeAuthInvalidation({ ...options, error, status: response.status });
  if (!invalidation) return null;
  dispatchRuntimeAuthInvalidation(invalidation);
  return invalidation;
}

export function dispatchRuntimeAuthInvalidation(invalidation) {
  const browser = globalThis.window;
  if (!browser?.dispatchEvent || typeof globalThis.CustomEvent !== "function") return false;
  browser.dispatchEvent(new globalThis.CustomEvent(runtimeAuthInvalidationEventName, { detail: invalidation }));
  return true;
}

export function subscribeRuntimeAuthInvalidation(handler) {
  const browser = globalThis.window;
  if (!browser?.addEventListener || typeof handler !== "function") return () => {};
  const listener = (event) => handler(event?.detail ?? {});
  browser.addEventListener(runtimeAuthInvalidationEventName, listener);
  return () => browser.removeEventListener(runtimeAuthInvalidationEventName, listener);
}

async function readResponseJsonClone(response) {
  if (typeof response?.clone !== "function") return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
