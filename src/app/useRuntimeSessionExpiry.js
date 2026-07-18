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

    let timeoutId = null;
    const scheduleNextCheck = () => {
      const decision = getRuntimeSessionExpiryDecision(authState);
      if (decision.kind === "expire") {
        onExpire(decision);
        return;
      }
      if (decision.kind === "schedule") {
        timeoutId = setTimeout(scheduleNextCheck, decision.delayMs);
      }
    };

    scheduleNextCheck();
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [authState, enabled, onExpire]);
}

export function useRuntimeAuthInvalidation({ enabled, onInvalidate }) {
  useEffect(() => {
    if (enabled !== true || typeof onInvalidate !== "function") return undefined;
    return subscribeRuntimeAuthInvalidation(onInvalidate);
  }, [enabled, onInvalidate]);
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
    const browser = globalThis.window;
    const documentRef = globalThis.document;
    if (!browser?.addEventListener || !documentRef?.addEventListener) return undefined;

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
    const intervalId = setInterval(() => {
      void revalidate();
    }, runtimeSessionRevalidationIntervalMs);
    documentRef.addEventListener("visibilitychange", handleVisibilityChange);
    browser.addEventListener("focus", handleFocus);
    return () => {
      disposed = true;
      clearInterval(intervalId);
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      browser.removeEventListener("focus", handleFocus);
    };
  }, [authState, enabled, onRevalidate]);
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
