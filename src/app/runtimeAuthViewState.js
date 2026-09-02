import { requiresRuntimePasswordChange } from "../services/officeAuthService.js";

export function getRuntimeAuthBoundaryView({ authState, runtimeServerRequired } = {}) {
  if (!runtimeServerRequired) return "none";
  if (!authState?.authenticated) return "login";
  if (requiresRuntimePasswordChange(authState)) return "password_change";
  return "none";
}

export function shouldShowRuntimeAuthBoundary({
  authState,
  formalLoginRequired,
} = {}) {
  return getRuntimeAuthBoundaryView({
    authState,
    runtimeServerRequired: formalLoginRequired,
  }) !== "none";
}

export function getTopbarLogoutAction({
  authState,
  formalLoginRequired,
  logoutRuntimeUserSession,
} = {}) {
  return formalLoginRequired && authState?.authenticated
    ? logoutRuntimeUserSession
    : undefined;
}
