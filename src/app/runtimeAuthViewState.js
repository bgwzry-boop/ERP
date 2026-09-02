export function shouldShowRuntimeAuthBoundary({
  authState,
  currentUser,
  formalLoginRequired,
} = {}) {
  return Boolean(formalLoginRequired && (
    !authState?.authenticated
    || authState?.permissions?.passwordChangeRequired === true
    || currentUser?.mustChangePassword === true
  ));
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
