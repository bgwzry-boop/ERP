import { useEffect, useRef, useState } from "react";
import { readStoredSeedSession, writeStoredSeedSession } from "../services/officeAuthService.js";
import { signedPreviewAuthInvalidationEventName, subscribeRuntimeAuthInvalidation } from "../services/runtimeAuthInvalidation.js";
import { initializeRuntimeAuthSnapshot } from "./useRuntimeAuthInitialization.js";

// A renewed credential for the same fixed identity does not create a new editor.
// Real account switches retain the existing token-based isolation boundary.
export function getAuthWorkspaceIdentity(authState) {
  return authState?.signedPreviewContinuityId || authState?.session?.accessToken || "";
}

export function useSignedPreviewSessionRenewal({ authState, authOptions, setAuthState }) {
  const current = useRef(authState);
  current.current = authState;
  const monitor = useRef(null);
  const [status, setStatus] = useState({ blocked: false });
  useEffect(() => {
    monitor.current = startSignedPreviewSessionMonitor({
      authState, authOptions, getCurrentAuthState: () => current.current,
      setAuthState, onStatus: setStatus,
    });
    return () => { monitor.current?.dispose(); monitor.current = null; };
  }, [authState, authOptions, setAuthState]);
  return { ...status, retry: () => monitor.current?.renew() };
}

export function startSignedPreviewSessionMonitor({
  authState, authOptions, getCurrentAuthState = () => authState, setAuthState,
  onStatus = () => {}, readSession = readStoredSeedSession, writeSession = writeStoredSeedSession,
  exchange = (options, previousAccessToken) => initializeRuntimeAuthSnapshot({ ...options, previousAccessToken }, null),
  subscribe = (handler) => subscribeRuntimeAuthInvalidation(handler, signedPreviewAuthInvalidationEventName),
  browser = globalThis.window, documentRef = globalThis.document, now = Date.now,
  setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
} = {}) {
  const expectedId = String(authOptions?.defaultUserId || "").trim();
  const session = authState?.session;
  const enabled = authOptions?.stagingAuthBypass === true && expectedId
    && authState?.authenticated === true && session?.sessionType === "seed"
    && session?.userId === expectedId && authState?.permissions?.user?.userId === expectedId;
  onStatus({ blocked: false });
  if (!enabled) return { dispose() {}, renew: async () => false };
  let disposed = false;
  let pending = null;
  let timer = null;
  let terminal = false;
  const isCurrent = () => !disposed && getCurrentAuthState() === authState
    && readSession()?.accessToken === session.accessToken;

  async function renew() {
    if (pending) return pending;
    if (!isCurrent() || terminal) return false;
    onStatus({ blocked: true, pending: true, message: "登录已过期，正在重新验证测试身份。当前填写内容会保留，本次业务操作不会自动重发。" });
    pending = (async () => {
      try {
        const next = await exchange(authOptions, session.accessToken);
        if (!isCurrent() || terminal) return false;
        if (["AUTH_TOKEN_REVOKED", "AUTH_USER_DISABLED", "AUTH_TOKEN_INVALID", "AUTH_SEED_USER_DISABLED"].includes(next?.error?.code)) {
          terminal = true;
          onStatus({ blocked: true, pending: false, canRetry: false, message: "当前测试身份已失效，无法自动续签。填写内容仍保留，请联系管理员核对身份。" });
          return false;
        }
        if (next?.authenticated !== true || next.session?.sessionType !== "seed"
          || !next.session.accessToken || next.session.userId !== expectedId
          || next.permissions?.user?.userId !== expectedId
          || !(Date.parse(next.session.expiresAt) > now())) {
          throw new Error("测试身份暂时无法验证，请重试。当前填写内容仍保留。");
        }
        const accepted = { ...next, signedPreviewContinuityId: getAuthWorkspaceIdentity(authState) };
        writeSession(accepted.session);
        setAuthState((current) => current === authState ? accepted : current);
        onStatus({ blocked: false, message: "测试身份已重新验证；请核对刚才操作的结果后再继续。" });
        return true;
      } catch {
        if (isCurrent()) onStatus({ blocked: true, pending: false, message: "测试身份暂时无法验证，请重试。当前填写内容仍保留，业务操作未自动重发。" });
        return false;
      } finally { pending = null; }
    })();
    return pending;
  }
  const checkExpiry = () => {
    if (disposed) return;
    if (timer !== null) clearTimeoutImpl(timer);
    const remaining = Date.parse(session.expiresAt) - now();
    if (!Number.isFinite(remaining) || remaining <= 0) void renew();
    else timer = setTimeoutImpl(checkExpiry, Math.min(remaining, 2_147_000_000));
  };
  const handleVisibility = () => { if (documentRef?.visibilityState !== "hidden") checkExpiry(); };
  const unsubscribe = subscribe((event) => {
    if (event?.accessToken !== session.accessToken) return;
    if (event?.error?.code === "AUTH_TOKEN_EXPIRED") void renew();
    else {
      terminal = true;
      onStatus({ blocked: true, pending: false, canRetry: false, message: "当前测试身份已失效，无法自动续签。填写内容仍保留，请联系管理员核对身份。" });
    }
  });
  browser?.addEventListener?.("focus", checkExpiry);
  documentRef?.addEventListener?.("visibilitychange", handleVisibility);
  checkExpiry();
  return {
    renew,
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeoutImpl(timer);
      unsubscribe?.();
      browser?.removeEventListener?.("focus", checkExpiry);
      documentRef?.removeEventListener?.("visibilitychange", handleVisibility);
    },
  };
}
