import {
  changeRuntimeUserPassword,
  clearStoredSeedSession,
  createLocalSeedAuthState,
  createServerRequiredAuthState,
  loginRuntimeUser,
  loginSeedUser,
  logoutRuntimeUser,
  readStoredSeedSession,
  revalidateRuntimeUserSession as requestRuntimeUserSessionRevalidation,
  writeStoredSeedSession,
} from "../services/officeAuthService.js";
import { getRuntimePasswordChangePresentation } from "./runtimeAuthPresentation.js";

export function createRuntimeAuthActions(dependencies = {}) {
  const {
    authState,
    runtimeLoginForm,
    runtimeLoginLoading,
    runtimePasswordChangeForm,
    runtimePasswordChangeLoading,
    runtimeServerRequired,
    runtimeLogin = loginRuntimeUser,
    runtimeLoginRequestRef = { current: 0 },
    runtimePasswordChange,
    revalidateRuntimeSession = requestRuntimeUserSessionRevalidation,
    setAuthState,
    setRuntimeLoginForm,
    setRuntimeLoginLoading,
    setRuntimePasswordChangeError,
    setRuntimePasswordChangeForm,
    setRuntimePasswordChangeLoading,
    setToast,
  } = dependencies;

  return {
    expireRuntimeUserSession,
    invalidateRuntimeUserSession,
    logoutRuntimeUserSession,
    revalidateRuntimeUserSession,
    submitRuntimeLogin,
    submitRuntimePasswordChange,
    switchSeedUser,
  };

  async function switchSeedUser(userId) {
    if (runtimeServerRequired) return;
    const localState = createLocalSeedAuthState(userId, "optimistic_switch");
    setAuthState(localState);
    setToast("");

    const nextAuthState = await loginSeedUser(userId);
    setAuthState(nextAuthState);
    setToast("");
  }

  async function submitRuntimeLogin(event) {
    event.preventDefault();
    if (runtimeLoginLoading) return;
    const requestId = nextRuntimeLoginRequestId(runtimeLoginRequestRef);
    const pendingAuthState = createServerRequiredAuthState("runtime_login_pending");
    // A manual login supersedes any unaccepted startup-restoration candidate.
    clearStoredSeedSession();
    setAuthState(pendingAuthState);
    setRuntimeLoginLoading(true);
    const nextAuthState = await runtimeLogin(runtimeLoginForm, { serverRequired: true });
    if (requestId !== runtimeLoginRequestRef.current) return;
    if (nextAuthState.authenticated) writeStoredSeedSession(nextAuthState.session);
    else clearStoredSeedSession();
    setAuthState((current) => (current === pendingAuthState ? nextAuthState : current));
    setRuntimeLoginLoading(false);
    if (nextAuthState.authenticated) {
      setRuntimeLoginForm((current) => ({ ...current, password: "" }));
      setToast(`已登录：${nextAuthState.permissions.user.displayName}。权限由后端正式账号返回。`);
    }
  }

  async function logoutRuntimeUserSession() {
    if (runtimeLoginLoading) return;
    nextRuntimeLoginRequestId(runtimeLoginRequestRef);
    setRuntimeLoginLoading(true);
    const result = await logoutRuntimeUser({ authState });
    setRuntimeLoginLoading(false);
    if (!result.loggedOut) {
      setToast(`退出登录失败：${result.error?.message ?? "请稍后重试。"}`);
      return;
    }

    setAuthState(createServerRequiredAuthState("runtime_session_logged_out"));
    setRuntimeLoginForm({ loginName: "", password: "" });
    setRuntimePasswordChangeError("");
    setRuntimePasswordChangeForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setToast(result.tokenRevoked ? "已退出登录，当前会话已在服务器吊销。" : "已退出登录，本地会话已清除。");
  }

  function expireRuntimeUserSession(decision = {}) {
    invalidateRuntimeUserSession(decision);
  }

  function invalidateRuntimeUserSession(decision = {}) {
    nextRuntimeLoginRequestId(runtimeLoginRequestRef);
    clearStoredSeedSession();
    setAuthState(createServerRequiredAuthState(
      decision.reason ?? "runtime_session_expired",
      decision.error ?? {
        code: "AUTH_TOKEN_EXPIRED",
        message: "当前登录会话已失效，请重新登录。",
      },
    ));
    setRuntimeLoginForm({ loginName: "", password: "" });
    setRuntimePasswordChangeError("");
    setRuntimePasswordChangeForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  async function revalidateRuntimeUserSession() {
    const expectedAuthState = authState;
    const expectedSession = authState?.session ?? null;
    const result = await revalidateRuntimeSession({ authState });
    if (result.valid) {
      if (!isCurrentRuntimeSession(expectedSession, result.session) || !isCurrentRuntimeSession(expectedSession, readStoredSeedSession())) {
        return { ...result, applied: false, stale: true };
      }
      writeStoredSeedSession(result.session);
      setAuthState((current) => (
        isCurrentRuntimeAuthState(expectedAuthState, expectedSession, current)
          ? result.authState
          : current
      ));
      return { ...result, applied: true };
    }
    if (result.invalidation) invalidateRuntimeUserSession(result.invalidation);
    return result;
  }

  async function submitRuntimePasswordChange(event) {
    event.preventDefault();
    if (runtimePasswordChangeLoading) return;
    const expectedSession = authState?.session ?? null;
    const { currentPassword, newPassword, confirmPassword } = runtimePasswordChangeForm;
    const presentation = getRuntimePasswordChangePresentation(authState?.permissions?.user);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setRuntimePasswordChangeError(`请填写${presentation.currentPasswordLabel}、新密码和确认密码。`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setRuntimePasswordChangeError("两次输入的新密码不一致。");
      return;
    }

    setRuntimePasswordChangeError("");
    setRuntimePasswordChangeLoading(true);
    const passwordChangeInput = { currentPassword, newPassword };
    const result = runtimePasswordChange
      ? await runtimePasswordChange(passwordChangeInput, { authState })
      : await changeRuntimeUserPassword(passwordChangeInput, { authState });
    setRuntimePasswordChangeLoading(false);
    if (!isCurrentRuntimeSession(expectedSession, readStoredSeedSession())) {
      return { ...result, applied: false, stale: true };
    }
    if (!result.changed) {
      setRuntimePasswordChangeError(result.error?.message ?? "修改密码失败，请稍后重试。");
      if (result.error?.passwordPolicy) {
        setAuthState((current) => ({ ...current, passwordPolicy: result.error.passwordPolicy }));
      }
      return result;
    }

    setAuthState((current) => {
      if (!isCurrentRuntimeSession(expectedSession, current?.session)) return current;
      return {
        ...current,
        source: "api_runtime",
        authenticated: true,
        permissions: result.permissions ?? current.permissions,
        passwordPolicy: null,
        reason: "runtime_password_changed",
      };
    });
    setRuntimePasswordChangeForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setToast("密码已修改，业务权限已恢复。");
    return { ...result, applied: true };
  }
}

function nextRuntimeLoginRequestId(requestRef) {
  const current = Number(requestRef?.current);
  const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
  requestRef.current = next;
  return next;
}

function isCurrentRuntimeSession(expectedSession, candidateSession) {
  const expectedToken = String(expectedSession?.accessToken ?? "");
  return (
    expectedSession?.sessionType === "runtime" &&
    candidateSession?.sessionType === "runtime" &&
    Boolean(expectedToken) &&
    candidateSession.accessToken === expectedToken
  );
}

function isCurrentRuntimeAuthState(expectedAuthState, expectedSession, candidateAuthState) {
  return (
    candidateAuthState === expectedAuthState &&
    isCurrentRuntimeSession(expectedSession, candidateAuthState?.session) &&
    isCurrentRuntimeSession(expectedSession, readStoredSeedSession())
  );
}
