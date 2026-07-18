import { requiresRuntimePasswordChange } from "../services/officeAuthService.js";
import { RuntimeLoginScreen, RuntimePasswordChangeScreen } from "./AppShellViews.jsx";

export function RuntimeAuthBoundary({ authState, passwordChange, runtimeLogin, runtimeServerRequired, user }) {
  if (runtimeServerRequired && !authState.authenticated) {
    return <RuntimeLoginScreen error={authState.error?.message ?? ""} {...runtimeLogin} />;
  }
  if (runtimeServerRequired && requiresRuntimePasswordChange(authState)) {
    return <RuntimePasswordChangeScreen passwordPolicy={authState.passwordPolicy} user={user} {...passwordChange} />;
  }
  return null;
}
