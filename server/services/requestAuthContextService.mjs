import {
  getSeedUser,
  runtimeSessionTokenPrefix,
  seedSessionTokenPrefix,
  verifyRuntimeSessionToken,
  verifySeedSessionToken,
} from "../authSeed.mjs";
import { getWorkspaceSecurityPolicy } from "../apiSecurityPolicy.mjs";
import { getEffectivePermissions } from "../seedData.mjs";

export function getRequestPermissionContext(request, authContext, workspace = {}) {
  const resolvedAuthContext = authContext ?? getRequestAuthContext(request, workspace);
  const effectivePermissions = getEffectivePermissions(resolvedAuthContext.userId, {
    runtimeUsers: workspace.users,
  });
  const actionPermissionOverride = request?.headers?.["x-erp-action-permissions"];
  const securityPolicy = getWorkspaceSecurityPolicy(workspace);

  if (actionPermissionOverride === undefined || !securityPolicy.allowActionPermissionOverride) {
    return effectivePermissions;
  }

  return {
    ...effectivePermissions,
    actionPermissions: parseActionPermissionOverride(actionPermissionOverride),
  };
}

export function getRequestAuthContext(request, workspace = {}) {
  const securityPolicy = getWorkspaceSecurityPolicy(workspace);
  const bearerToken = getBearerToken(request);
  if (bearerToken.startsWith(`${runtimeSessionTokenPrefix}.`)) {
    const verifiedSession = verifyRuntimeSessionToken(bearerToken, {
      runtimeUsers: workspace.users,
      revokedSessionIds: workspace.revokedSeedSessionJtis,
      authSecret: securityPolicy.authSecret,
    });
    if (verifiedSession.valid) {
      return {
        authenticated: true,
        source: "runtime_session",
        userId: verifiedSession.userId,
        session: verifiedSession.session,
      };
    }
    return {
      authenticated: false,
      source: "invalid_runtime_session",
      userId: "INVALID-RUNTIME-SESSION",
      authError: verifiedSession.reason,
    };
  }

  if (bearerToken.startsWith(`${seedSessionTokenPrefix}.`)) {
    const verifiedSession = verifySeedSessionToken(bearerToken, {
      runtimeUsers: workspace.users,
      revokedSessionIds: workspace.revokedSeedSessionJtis,
      authSecret: securityPolicy.authSecret,
    });
    if (verifiedSession.valid) {
      if (!securityPolicy.allowSeedUsers && getSeedUser(verifiedSession.userId)) {
        return {
          authenticated: false,
          source: "seed_session_disabled",
          userId: "SEED-SESSION-DISABLED",
          authError: "AUTH_SEED_USER_DISABLED",
        };
      }
      return {
        authenticated: true,
        source: "seed_session",
        userId: verifiedSession.userId,
        session: verifiedSession.session,
      };
    }
    return {
      authenticated: false,
      source: "invalid_seed_session",
      userId: "INVALID-SEED-SESSION",
      authError: verifiedSession.reason,
    };
  }

  const legacySeedBearerMatch = bearerToken.match(/^seed:(.+)$/i);
  if (securityPolicy.allowLegacyIdentityHeaders && legacySeedBearerMatch?.[1]) {
    return {
      authenticated: false,
      source: "legacy_seed_bearer",
      userId: legacySeedBearerMatch[1].trim(),
    };
  }

  const userIdHeader = getRequestHeaderValue(request, "x-erp-user-id");
  if (securityPolicy.allowLegacyIdentityHeaders && userIdHeader) {
    return {
      authenticated: false,
      source: "seed_user_header",
      userId: userIdHeader,
    };
  }

  if (!securityPolicy.allowDefaultSeedUser) {
    return {
      authenticated: false,
      source: "unauthenticated",
      userId: "UNAUTHENTICATED",
      authError: "AUTH_SESSION_REQUIRED",
    };
  }

  return {
    authenticated: false,
    source: "default_seed_user",
    userId: "U-OFFICE-A",
  };
}

export function getRequestHeaderValue(request, headerName) {
  const raw = request?.headers?.[String(headerName ?? "").toLowerCase()];
  if (Array.isArray(raw)) return raw.join(",").trim();
  return String(raw ?? "").trim();
}

export function parseActionPermissionOverride(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return [];
  return trimmed
    .split(",")
    .map((permissionKey) => permissionKey.trim())
    .filter(Boolean);
}

function getBearerToken(request) {
  const authorization = getRequestHeaderValue(request, "authorization");
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() ?? "";
}
