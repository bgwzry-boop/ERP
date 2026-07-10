import {
  defaultSeedUserId,
  getSeedPermissionContext,
} from "../auth/seedPermissions.js";
import { createDisabledPermissionContext } from "../../shared/auth/roleCatalog.js";

export const seedAuthStorageKey = "erp.authSession.v1";
const legacySeedAuthStorageKey = "erp.seedAuthSession.v1";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";

export function isOfficeApiServerRequired(options = {}) {
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
    : createLocalSeedAuthState(options.defaultUserId ?? defaultSeedUserId, "initial_load");
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
  if (!storedSession?.accessToken) {
    return isOfficeApiServerRequired(options)
      ? createServerRequiredAuthState("no_stored_session")
      : createLocalSeedAuthState(options.defaultUserId ?? defaultSeedUserId, "no_stored_session");
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
      clearStoredSeedSession(storage);
      if (isOfficeApiServerRequired(options)) {
        return createServerRequiredAuthState(json?.code ?? "stored_session_invalid", json);
      }
      return withAuthError(
        createLocalSeedAuthState(storedSession.userId ?? defaultSeedUserId, json?.code ?? "stored_session_invalid"),
        json,
      );
    }

    writeStoredSeedSession(json.session, storage);
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
  const storage = options.storage ?? getBrowserStorage();
  const normalizedLoginName = String(loginName ?? "").trim();
  const normalizedUserId = String(userId ?? "").trim();
  if ((!normalizedLoginName && !normalizedUserId) || !String(password ?? "")) {
    clearStoredSeedSession(storage);
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
      clearStoredSeedSession(storage);
      return createServerRequiredAuthState(json?.code ?? "login_failed", json);
    }

    writeStoredSeedSession(json.session, storage);
    return {
      ...createApiSeedAuthState(json, "login_runtime_session"),
      source: "api_runtime",
    };
  } catch (error) {
    clearStoredSeedSession(storage);
    return createServerRequiredAuthState("api_unavailable", error);
  }
}

export async function changeSeedUserPassword({ currentPassword, newPassword, changeNote } = {}, options = {}) {
  const storage = options.storage ?? getBrowserStorage();
  const authState = options.authState ?? null;
  const session = options.session ?? authState?.session ?? readStoredSeedSession(storage);
  if (!session?.accessToken) {
    return {
      source: "api_seed",
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
        source: "api_seed",
        changed: false,
        error: {
          code: json?.code ?? "PASSWORD_CHANGE_FAILED",
          message: json?.message ?? "修改密码失败。",
          passwordPolicy: normalizePasswordPolicy(json?.passwordPolicy),
        },
      };
    }
    if (json?.permissions) {
      return {
        source: "api_seed",
        changed: json.changed === true,
        user: json.user,
        permissions: normalizePermissionContext(json.permissions),
        employeeAccountReview: json.employeeAccountReview ?? null,
        operationLogId: json.operationLogId,
      };
    }
    return {
      source: "api_seed",
      changed: json?.changed === true,
      user: json?.user ?? null,
      employeeAccountReview: json?.employeeAccountReview ?? null,
      operationLogId: json?.operationLogId,
    };
  } catch (error) {
    return {
      source: "api_seed",
      changed: false,
      error: {
        code: "AUTH_CLIENT_ERROR",
        message: error?.message ?? String(error),
      },
    };
  }
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
    source: "api_seed",
    authenticated: true,
    session: json.session,
    permissions: normalizePermissionContext(json.permissions),
    reason,
  };
}

async function requestAuthApi(path, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    "content-type": "application/json",
    ...(options.headers ?? {}),
  };
  return fetchImpl(`${getAuthApiBaseUrl(options)}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizePermissionContext(permissions) {
  const fallback = getSeedPermissionContext(permissions?.user?.userId ?? defaultSeedUserId);
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
