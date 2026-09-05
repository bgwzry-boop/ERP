import { RuntimeLoginScreen, RuntimePasswordChangeScreen } from "./AppShellViews.jsx";
import { getRuntimeAuthBoundaryView } from "./runtimeAuthViewState.js";

export function RuntimeAuthBoundary({ authState, passwordChange, runtimeLogin, runtimeServerRequired, user }) {
  const view = getRuntimeAuthBoundaryView({ authState, runtimeServerRequired });
  if (view === "login") {
    return <RuntimeLoginScreen error={authState.error?.message ?? ""} {...runtimeLogin} />;
  }
  if (view === "password_change") {
    return <RuntimePasswordChangeScreen passwordPolicy={authState.passwordPolicy} user={user} {...passwordChange} />;
  }
  return null;
}
