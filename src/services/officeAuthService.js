import {
  defaultSeedUserId,
  getSeedPermissionContext,
} from "../auth/seedPermissions.js";
import { createDisabledPermissionContext } from "../../shared/auth/roleCatalog.js";
import {
  getRuntimeAuthInvalidation,
  notifyRuntimeAuthInvalidationForResponse,
} from "./runtimeAuthInvalidation.js";

export const seedAuthStorageKey = "erp.authSession.v1";
const legacySeedAuthStorageKey = "erp.seedAuthSession.v1";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";

export function isOfficeApiServerRequired(options = {}) {
  const stagingAuthBypass =
    options.stagingAuthBypass === true ||
    String(import.meta.env?.VITE_ERP_STAGING_AUTH_BYPASS ?? "").trim().toLowerCase() === "true";
  if (stagingAuthBypass) return false;
  const runtimeMode = String(
    options.runtimeMode ?? import.meta.env?.VITE_ERP_RUNTIME_MODE ?? import.meta.env?.VITE_ERP_OPERATION_MODE ?? "",
  )
    .trim()
    .toLowerCase();
  if (import.meta.env?.PROD === true || ["production", "strict", "server_required"].includes(runtimeMode)) return true;
  if (options.serverRequired === true) return true;
  if (options.serverRequired === false) return false;
  return false;
}

export function isOfficeSharedDataServerRequired(options = {}) {
  const runtimeMode = String(
    options.runtimeMode ?? import.meta.env?.VITE_ERP_RUNTIME_MODE ?? import.meta.env?.VITE_ERP_OPERATION_MODE ?? "",
  )
    .trim()
    .toLowerCase();
  if (import.meta.env?.PROD === true || ["production", "strict", "server_required"].includes(runtimeMode)) return true;
  if (options.serverRequired === true) return true;
  if (options.serverRequired === false) return false;
  return false;
}

export function createInitialAuthState(options = {}) {
  return isOfficeApiServerRequired(options)
    ? createServerRequiredAuthState("initial_login_required")
    : createLocalSeedAuthState(resolveLocalPreviewUserId(options), "initial_load");
}

export function createServerRequiredAuthState(reason = "login_required", error = null) {
  return {
    source: "server_required",
    authenticated: false,
    session: null,
    permissions: createDisabledPermissionContext(),
    reason,
    ...(error
      ? {
          error: {
            code: error?.code ?? "AUTH_CLIENT_ERROR",
            message: error?.message ?? String(error),
          },
        }
      : {}),
  };
}

export function createLocalSeedAuthState(userId = defaultSeedUserId, reason = "local_seed") {
  return {
    source: "local_seed",
    authenticated: false,
    session: null,
    permissions: getSeedPermissionContext(userId),
    reason,
  };
}

export async function initializeSeedAuth(options = {}) {
  const storage = options.storage ?? getBrowserStorage();
  const storedSession = readStoredSeedSession(storage);
  const stagingPreviewUserId = resolveLocalPreviewUserId(options);
  const stagingAuthBypassEnabled = isStagingAuthBypassEnabled(options);
  if (!storedSession?.accessToken) {
    if (stagingAuthBypassEnabled) {
      return loginSeedUser(stagingPreviewUserId, options);
    }
    return isOfficeApiServerRequired(options)
      ? createServerRequiredAuthState("no_stored_session")
      : createLocalSeedAuthState(stagingPreviewUserId, "no_stored_session");
  }

  if (
    stagingAuthBypassEnabled
    && (
      String(storedSession.userId ?? "").trim() !== stagingPreviewUserId
      || storedSession.sessionType === "runtime"
    )
  ) {
    clearStoredSeedSession(storage);
    return loginSeedUser(stagingPreviewUserId, options);
  }

  try {
    const response = await requestAuthApi("/auth/me", {
      ...options,
      headers: {
        authorization: `Bearer ${storedSession.accessToken}`,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      if (isOfficeApiServerRequired(options)) {
        return createServerRequiredAuthState(json?.code ?? "stored_session_invalid", json);
      }
      if (stagingAuthBypassEnabled) {
        clearStoredSeedSession(storage);
        return loginSeedUser(stagingPreviewUserId, options);
      }
      return withAuthError(
        createLocalSeedAuthState(storedSession.userId ?? defaultSeedUserId, json?.code ?? "stored_session_invalid"),
        json,
      );
    }

    if (
      stagingAuthBypassEnabled
      && (
        json?.session?.sessionType === "runtime"
        || String(json?.session?.userId ?? json?.permissions?.user?.userId ?? "").trim() !== stagingPreviewUserId
      )
    ) {
      clearStoredSeedSession(storage);
      return loginSeedUser(stagingPreviewUserId, options);
    }

    if (
      storedSession.sessionType === "runtime"
      && (json?.authenticated !== true || !isValidRuntimeAuthResponse(json, storedSession.userId))
    ) {
      if (stagingAuthBypassEnabled) {
        clearStoredSeedSession(storage);
        return loginSeedUser(stagingPreviewUserId, options);
      }
      return createServerRequiredAuthState("stored_session_response_invalid", {
        code: "AUTH_RESTORE_RESPONSE_INVALID",
        message: "正式登录会话恢复响应无效，请重新登录。",
      });
    }

    return createApiSeedAuthState(json, "restored_seed_session");
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return createServerRequiredAuthState("api_unavailable", error);
    }
    return withAuthError(
      createLocalSeedAuthState(storedSession.userId ?? defaultSeedUserId, "api_unavailable"),
      error,
    );
  }
}

function resolveLocalPreviewUserId(options = {}) {
  return String(
    options.defaultUserId ??
      import.meta.env?.VITE_ERP_STAGING_PREVIEW_USER_ID ??
      defaultSeedUserId,
  ).trim() || defaultSeedUserId;
}

function isStagingAuthBypassEnabled(options = {}) {
  return (
    options.stagingAuthBypass === true ||
    String(import.meta.env?.VITE_ERP_STAGING_AUTH_BYPASS ?? "").trim().toLowerCase() === "true"
  );
}

export async function loginSeedUser(userId = defaultSeedUserId, options = {}) {
  const storage = options.storage ?? getBrowserStorage();
  if (isOfficeApiServerRequired(options)) {
    clearStoredSeedSession(storage);
    return createServerRequiredAuthState("prototype_login_disabled", {
      code: "AUTH_PROTOTYPE_LOGIN_DISABLED",
      message: "生产模式只能使用正式账号登录。",
    });
  }
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) {
    clearStoredSeedSession(storage);
    return createLocalSeedAuthState(userId, "missing_seed_user");
  }

  try {
    const response = await requestAuthApi("/auth/prototype-login", {
      ...options,
      method: "POST",
      body: {
        userId: normalizedUserId,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      clearStoredSeedSession(storage);
      return withAuthError(createLocalSeedAuthState(userId, json?.code ?? "login_failed"), json);
    }

    writeStoredSeedSession(json.session, storage);
    return createApiSeedAuthState(json, "login_seed_session");
  } catch (error) {
    clearStoredSeedSession(storage);
    return withAuthError(createLocalSeedAuthState(userId, "api_unavailable"), error);
  }
}

export async function loginRuntimeUser({ loginName, userId, password } = {}, options = {}) {
  const normalizedLoginName = String(loginName ?? "").trim();
  const normalizedUserId = String(userId ?? "").trim();
  if ((!normalizedLoginName && !normalizedUserId) || !String(password ?? "")) {
    return createServerRequiredAuthState("missing_credentials", {
      code: "AUTH_CREDENTIALS_REQUIRED",
      message: "请输入登录名或用户编号，以及密码。",
    });
  }

  try {
    const response = await requestAuthApi("/auth/login", {
      ...options,
      method: "POST",
      body: {
        loginName: normalizedLoginName,
        userId: normalizedUserId,
        password,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return createServerRequiredAuthState(json?.code ?? "login_failed", json);
    }

    if (!isValidRuntimeAuthResponse(json, normalizedUserId)) {
      return createServerRequiredAuthState("login_response_invalid", {
        code: "AUTH_LOGIN_RESPONSE_INVALID",
        message: "正式登录响应无效，请稍后重试。",
      });
    }

    return {
      ...createApiSeedAuthState(json, "login_runtime_session"),
      source: "api_runtime",
    };
  } catch (error) {
    return createServerRequiredAuthState("api_unavailable", error);
  }
}

export async function revalidateRuntimeUserSession(options = {}) {
  const storage = options.storage ?? getBrowserStorage();
  const authState = options.authState ?? null;
  const session = options.session ?? authState?.session ?? readStoredSeedSession(storage);
  if (session?.sessionType !== "runtime" || !session.accessToken) {
    return {
      valid: false,
      retryable: false,
      error: {
        code: "AUTH_RUNTIME_SESSION_REQUIRED",
        message: "当前没有可复核的正式登录会话。",
      },
    };
  }

  try {
    const response = await requestAuthApi("/auth/me", {
      ...options,
      authState,
      session,
      headers: {
        ...(options.headers ?? {}),
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      const error = {
        code: json?.code ?? "AUTH_REVALIDATION_FAILED",
        message: json?.message ?? "正式登录会话复核失败。",
      };
      return {
        valid: false,
        retryable: response.status >= 500,
        error,
        invalidation: getRuntimeAuthInvalidation({ authState, session, status: response.status, error }),
      };
    }
    if (json?.authenticated !== true || !isValidRuntimeAuthResponse(json, session.userId)) {
      const error = {
        code: "AUTH_REVALIDATION_RESPONSE_INVALID",
        message: "正式登录会话复核响应无效，请重新登录。",
      };
      return {
        valid: false,
        retryable: false,
        error,
        invalidation: {
          reason: "runtime_session_response_invalid",
          error,
        },
      };
    }

    return {
      valid: true,
      session: json.session,
      authState: {
        ...createApiSeedAuthState(json, "runtime_session_revalidated"),
        source: "api_runtime",
      },
    };
  } catch (error) {
    return {
      valid: false,
      retryable: true,
      error: {
        code: "AUTH_CLIENT_ERROR",
        message: error?.message ?? String(error),
      },
    };
  }
}

export function requiresRuntimePasswordChange(authState = {}) {
  const permissionContext = authState?.permissions ?? {};
  return (
    authState?.authenticated === true &&
    authState?.session?.sessionType === "runtime" &&
    (permissionContext.passwordChangeRequired === true || permissionContext.user?.mustChangePassword === true)
  );
}

export async function changeRuntimeUserPassword({ currentPassword, newPassword, changeNote } = {}, options = {}) {
  const storage = options.storage ?? getBrowserStorage();
  const authState = options.authState ?? null;
  const session = options.session ?? authState?.session ?? readStoredSeedSession(storage);
  if (!session?.accessToken) {
    return {
      source: "api_runtime",
      changed: false,
      error: {
        code: "AUTH_SESSION_REQUIRED",
        message: "需要先登录后才能修改密码。",
      },
    };
  }

  try {
    const response = await requestAuthApi("/auth/change-password", {
      ...options,
      method: "POST",
      headers: {
        ...(options.headers ?? {}),
        authorization: `Bearer ${session.accessToken}`,
      },
      body: {
        currentPassword,
        newPassword,
        changeNote,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_runtime",
        changed: false,
        error: {
          code: json?.code ?? "PASSWORD_CHANGE_FAILED",
          message: json?.message ?? "修改密码失败。",
          passwordPolicy: normalizePasswordPolicy(json?.passwordPolicy),
        },
      };
    }
    if (json?.changed !== true || !isValidRuntimePermissionContext(json?.permissions, session.userId)) {
      return {
        source: "api_runtime",
        changed: false,
        error: {
          code: "PASSWORD_CHANGE_RESPONSE_INVALID",
          message: "修改密码响应无效，请重新登录后确认密码状态。",
        },
      };
    }
    return {
      source: "api_runtime",
      changed: true,
      user: json.user ?? null,
      permissions: normalizePermissionContext(json.permissions),
      employeeAccountReview: json?.employeeAccountReview ?? null,
      operationLogId: json?.operationLogId,
    };
  } catch (error) {
    return {
      source: "api_runtime",
      changed: false,
      error: {
        code: "AUTH_CLIENT_ERROR",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function logoutRuntimeUser(options = {}) {
  const storage = options.storage ?? getBrowserStorage();
  const authState = options.authState ?? null;
  const session = options.session ?? authState?.session ?? readStoredSeedSession(storage);
  if (!session?.accessToken) {
    clearStoredSeedSession(storage);
    return {
      source: "api_runtime",
      loggedOut: true,
      tokenRevoked: false,
      localSessionCleared: true,
    };
  }

  try {
    const response = await requestAuthApi("/auth/logout", {
      ...options,
      method: "POST",
      headers: {
        ...(options.headers ?? {}),
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      if (canDiscardRejectedSession(response.status, json?.code)) {
        clearStoredSeedSession(storage);
        return {
          source: "api_runtime",
          loggedOut: true,
          tokenRevoked: false,
          localSessionCleared: true,
        };
      }
      return {
        source: "api_runtime",
        loggedOut: false,
        error: {
          code: json?.code ?? "LOGOUT_FAILED",
          message: json?.message ?? "退出登录失败。",
        },
      };
    }

    if (json?.loggedOut !== true) {
      return {
        source: "api_runtime",
        loggedOut: false,
        error: {
          code: "LOGOUT_RESPONSE_INVALID",
          message: "退出登录响应无效，请稍后重试。",
        },
      };
    }

    clearStoredSeedSession(storage);
    return {
      source: "api_runtime",
      loggedOut: true,
      tokenRevoked: json?.tokenRevoked === true,
      localSessionCleared: true,
    };
  } catch (error) {
    return {
      source: "api_runtime",
      loggedOut: false,
      error: {
        code: "AUTH_CLIENT_ERROR",
        message: error?.message ?? String(error),
      },
    };
  }
}

// Kept for existing callers while formal-account UI migrates to the explicit name.
export async function changeSeedUserPassword(input = {}, options = {}) {
  return changeRuntimeUserPassword(input, options);
}

function normalizePasswordPolicy(policy) {
  if (!policy || typeof policy !== "object") return null;
  return {
    minLength: Number(policy.minLength) || 0,
    requireLetter: policy.requireLetter === true,
    requireNumber: policy.requireNumber === true,
    allowWhitespace: policy.allowWhitespace === true,
    disallowAccountIdentifiers: policy.disallowAccountIdentifiers === true,
    description: String(policy.description ?? "").trim(),
  };
}

function canDiscardRejectedSession(status, code) {
  if (status !== 401) return false;
  return ["AUTH_SESSION_REQUIRED", "AUTH_TOKEN_REVOKED", "AUTH_TOKEN_EXPIRED", "AUTH_TOKEN_INVALID", "AUTH_USER_DISABLED"].includes(String(code ?? "").trim());
}

export function readStoredSeedSession(storage = getBrowserStorage()) {
  if (!storage) return null;
  try {
    return JSON.parse(storage.getItem(seedAuthStorageKey) ?? "null");
  } catch {
    return null;
  }
}

export function writeStoredSeedSession(session, storage = getBrowserStorage()) {
  if (!storage || !session?.accessToken) return;
  storage.setItem(seedAuthStorageKey, JSON.stringify(session));
}

export function clearStoredSeedSession(storage = getBrowserStorage()) {
  storage?.removeItem(seedAuthStorageKey);
}

export function getAuthApiBaseUrl(options = {}) {
  const envBaseUrl = import.meta.env?.VITE_ERP_API_BASE_URL;
  return String(options.apiBaseUrl ?? envBaseUrl ?? defaultApiBaseUrl).replace(/\/+$/, "");
}

function createApiSeedAuthState(json, reason) {
  return {
    source: json?.session?.sessionType === "runtime" ? "api_runtime" : "api_seed",
    authenticated: true,
    session: json.session,
    permissions: normalizePermissionContext(json.permissions),
    passwordPolicy: normalizePasswordPolicy(json.passwordPolicy),
    reason,
  };
}

async function requestAuthApi(path, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    "content-type": "application/json",
    ...(options.headers ?? {}),
  };
  const response = await fetchImpl(`${getAuthApiBaseUrl(options)}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  await notifyRuntimeAuthInvalidationForResponse(response, {
    authState: options.authState,
    session: options.session,
  });
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizePermissionContext(permissions) {
  const fallback = createDisabledPermissionContext(permissions?.user?.userId ?? "UNKNOWN_API_USER");
  return {
    ...fallback,
    ...permissions,
    user: {
      ...fallback.user,
      ...(permissions?.user ?? {}),
    },
    roles: [...(permissions?.roles ?? fallback.roles ?? [])],
    grants: [...(permissions?.grants ?? fallback.grants ?? [])],
    buttonPermissions: [...(permissions?.buttonPermissions ?? fallback.buttonPermissions ?? [])],
    actionPermissions: [...(permissions?.actionPermissions ?? fallback.actionPermissions ?? [])],
  };
}

function isValidRuntimeAuthResponse(json, expectedUserId = "") {
  const session = json?.session;
  const sessionUserId = normalizeUserId(session?.userId);
  const expected = normalizeUserId(expectedUserId);
  return (
    session?.sessionType === "runtime" &&
    Boolean(String(session?.accessToken ?? "").trim()) &&
    Boolean(sessionUserId) &&
    (!expected || sessionUserId === expected) &&
    isValidRuntimePermissionContext(json?.permissions, sessionUserId)
  );
}

function isValidRuntimePermissionContext(permissions, expectedUserId = "") {
  if (!permissions || typeof permissions !== "object" || !permissions.user || typeof permissions.user !== "object") return false;
  const permissionUserId = normalizeUserId(permissions.user.userId);
  const expected = normalizeUserId(expectedUserId);
  return (
    Boolean(permissionUserId) &&
    (!expected || permissionUserId === expected) &&
    ["roles", "buttonPermissions", "actionPermissions"].every((field) => Array.isArray(permissions[field])) &&
    (permissions.grants === undefined || Array.isArray(permissions.grants))
  );
}

function normalizeUserId(value) {
  return String(value ?? "").trim();
}

function withAuthError(authState, error) {
  return {
    ...authState,
    error: {
      code: error?.code ?? "AUTH_CLIENT_ERROR",
      message: error?.message ?? String(error),
    },
  };
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  try {
    window.localStorage?.removeItem(legacySeedAuthStorageKey);
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}
