import { useEffect } from "react";
import { subscribeRuntimeAuthInvalidation } from "../services/runtimeAuthInvalidation.js";

const maxBrowserTimeoutMs = 2_147_000_000;
const runtimeSessionRevalidationIntervalMs = 60_000;

export function getRuntimeSessionExpiryDecision(authState = {}, nowMs = Date.now()) {
  const session = authState?.session ?? {};
  if (authState?.authenticated !== true || session.sessionType !== "runtime") {
    return { kind: "inactive" };
  }

  const expiresAtMs = Date.parse(String(session.expiresAt ?? ""));
  if (!Number.isFinite(expiresAtMs)) {
    return createExpiryDecision("runtime_session_expiry_invalid", "AUTH_SESSION_EXPIRY_INVALID");
  }
  if (expiresAtMs <= nowMs) {
    return createExpiryDecision("runtime_session_expired", "AUTH_TOKEN_EXPIRED");
  }

  return {
    kind: "schedule",
    delayMs: Math.max(1, Math.min(Math.ceil(expiresAtMs - nowMs), maxBrowserTimeoutMs)),
  };
}

export function useRuntimeSessionExpiry({ authState, enabled, onExpire }) {
  useEffect(() => {
    if (enabled !== true || typeof onExpire !== "function") return undefined;
    return startRuntimeSessionExpiryMonitor({ authState, onExpire });
  }, [authState, enabled, onExpire]);
}

export function startRuntimeSessionExpiryMonitor({
  authState,
  onExpire,
  now = Date.now,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (typeof onExpire !== "function") return undefined;
  let disposed = false;
  let timeoutId = null;
  const scheduleNextCheck = () => {
    if (disposed) return;
    const decision = getRuntimeSessionExpiryDecision(authState, now());
    if (decision.kind === "expire") {
      onExpire(decision);
      return;
    }
    if (decision.kind === "schedule") {
      timeoutId = setTimeoutImpl(scheduleNextCheck, decision.delayMs);
    }
  };
  scheduleNextCheck();
  return () => {
    disposed = true;
    if (timeoutId !== null) clearTimeoutImpl(timeoutId);
  };
}

export function useRuntimeAuthInvalidation({ enabled, onInvalidate }) {
  useEffect(() => {
    if (enabled !== true || typeof onInvalidate !== "function") return undefined;
    return startRuntimeAuthInvalidationMonitor({ onInvalidate });
  }, [enabled, onInvalidate]);
}

export function startRuntimeAuthInvalidationMonitor({
  onInvalidate,
  subscribe = subscribeRuntimeAuthInvalidation,
} = {}) {
  if (typeof onInvalidate !== "function" || typeof subscribe !== "function") return undefined;
  return subscribe(onInvalidate);
}

export function shouldRevalidateRuntimeSession(authState = {}, visibilityState = "visible") {
  return (
    authState?.authenticated === true &&
    authState?.session?.sessionType === "runtime" &&
    visibilityState !== "hidden"
  );
}

export function useRuntimeSessionRevalidation({ authState, enabled, onRevalidate }) {
  useEffect(() => {
    if (enabled !== true || typeof onRevalidate !== "function") return undefined;
    return startRuntimeSessionRevalidationMonitor({ authState, onRevalidate });
  }, [authState, enabled, onRevalidate]);
}

export function startRuntimeSessionRevalidationMonitor({
  authState,
  onRevalidate,
  browser = globalThis.window,
  documentRef = globalThis.document,
  intervalMs = runtimeSessionRevalidationIntervalMs,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  if (
    typeof onRevalidate !== "function"
    || !browser?.addEventListener
    || !documentRef?.addEventListener
  ) return undefined;

  let disposed = false;
  let inFlight = false;
  const revalidate = async () => {
    if (disposed || inFlight || !shouldRevalidateRuntimeSession(authState, documentRef.visibilityState)) return;
    inFlight = true;
    try {
      await onRevalidate();
    } finally {
      inFlight = false;
    }
  };
  const handleVisibilityChange = () => {
    void revalidate();
  };
  const handleFocus = () => {
    void revalidate();
  };
  const intervalId = setIntervalImpl(() => {
    void revalidate();
  }, intervalMs);
  documentRef.addEventListener("visibilitychange", handleVisibilityChange);
  browser.addEventListener("focus", handleFocus);
  return () => {
    disposed = true;
    clearIntervalImpl(intervalId);
    documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
    browser.removeEventListener("focus", handleFocus);
  };
}

function createExpiryDecision(reason, code) {
  return {
    kind: "expire",
    reason,
    error: {
      code,
      message: "当前登录会话已失效，请重新登录。",
    },
  };
}
