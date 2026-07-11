const runtimeSessionPrefix = "erp-runtime-session-v1.";

const roleEnvKeys = Object.freeze({
  operator: {
    operatorId: "ERP_V1_READINESS_OPERATOR_ID",
    bearerToken: "ERP_V1_READINESS_TOKEN",
    loginName: "ERP_V1_READINESS_LOGIN_NAME",
    password: "ERP_V1_READINESS_PASSWORD",
  },
  driver: {
    operatorId: "ERP_V1_READINESS_DRIVER_OPERATOR_ID",
    bearerToken: "ERP_V1_READINESS_DRIVER_TOKEN",
    loginName: "ERP_V1_READINESS_DRIVER_LOGIN_NAME",
    password: "ERP_V1_READINESS_DRIVER_PASSWORD",
  },
});

export function buildV1ReadinessAuthInput({ role = "operator", env = process.env, overrides = {} } = {}) {
  const keys = roleEnvKeys[role];
  if (!keys) throw new Error(`Unsupported V1 readiness auth role: ${role}`);
  return {
    role,
    operatorId: cleanText(overrides.operatorId ?? env[keys.operatorId]),
    bearerToken: cleanText(overrides.bearerToken ?? env[keys.bearerToken]),
    loginName: cleanText(overrides.loginName ?? env[keys.loginName]),
    password: String(overrides.password ?? env[keys.password] ?? ""),
    envKeys: keys,
  };
}

export async function authenticateV1ReadinessRole({
  apiBaseUrl,
  runtimeMode,
  health,
  authInput,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required for V1 readiness authentication.");
  const production = isProductionRuntime({ runtimeMode, health });
  const input = authInput ?? buildV1ReadinessAuthInput();
  const roleLabel = input.role === "driver" ? "driver" : "operator";

  if (input.bearerToken) {
    if (production && !input.bearerToken.startsWith(runtimeSessionPrefix)) {
      throw new Error(`Production V1 readiness ${roleLabel} token must be a formal runtime session.`);
    }
    return buildAuthResult({
      input,
      source: "runtime_token",
      accessToken: input.bearerToken,
      production,
    });
  }

  if (input.loginName || input.password) {
    if (!input.loginName || !input.password) {
      throw new Error(
        `V1 readiness ${roleLabel} login requires both ${input.envKeys.loginName} and ${input.envKeys.password}.`,
      );
    }
    const login = await requestRuntimeLogin({
      apiBaseUrl,
      loginName: input.loginName,
      password: input.password,
      fetchImpl,
      timeoutMs,
      roleLabel,
    });
    const accessToken = cleanText(login?.session?.accessToken);
    const sessionUserId = cleanText(login?.permissions?.user?.userId || login?.session?.userId);
    if (!accessToken || (production && !accessToken.startsWith(runtimeSessionPrefix))) {
      throw new Error(`V1 readiness ${roleLabel} login did not return a formal runtime session.`);
    }
    if (input.operatorId && sessionUserId && input.operatorId !== sessionUserId) {
      throw new Error(`V1 readiness ${roleLabel} login identity does not match the configured operator ID.`);
    }
    return buildAuthResult({ input, source: "formal_login", accessToken, sessionUserId, production });
  }

  if (production) {
    throw new Error(
      `Production V1 readiness ${roleLabel} authentication requires ${input.envKeys.bearerToken} or both ${input.envKeys.loginName} and ${input.envKeys.password}.`,
    );
  }

  const operatorId = input.operatorId || (input.role === "driver" ? "U-DRIVER-A" : "U-OFFICE-A");
  return {
    role: input.role,
    source: "legacy_identity_header",
    operatorId,
    headers: { "content-type": "application/json", "x-erp-user-id": operatorId },
    formalRuntimeSession: false,
    legacyIdentityHeaderUsed: true,
    production,
  };
}

export function isProductionRuntime({ runtimeMode, health } = {}) {
  const mode = cleanText(runtimeMode || health?.seed?.runtimeConfig?.mode).toLowerCase();
  return mode === "production" || health?.seed?.runtimeConfig?.production === true;
}

function buildAuthResult({ input, source, accessToken, sessionUserId = "", production }) {
  return {
    role: input.role,
    source,
    operatorId: sessionUserId || input.operatorId,
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    formalRuntimeSession: accessToken.startsWith(runtimeSessionPrefix),
    legacyIdentityHeaderUsed: false,
    production,
  };
}

async function requestRuntimeLogin({ apiBaseUrl, loginName, password, fetchImpl, timeoutMs, roleLabel }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${normalizeApiBaseUrl(apiBaseUrl)}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ loginName, password }),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`V1 readiness ${roleLabel} formal login returned HTTP ${response.status}.`);
    return json;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`V1 readiness ${roleLabel} formal login timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeApiBaseUrl(value) {
  const normalized = cleanText(value).replace(/\/+$/, "");
  if (!normalized) throw new Error("V1 readiness API base URL is required for formal login.");
  return normalized;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
