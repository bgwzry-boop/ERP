import { useEffect, useRef } from "react";
import {
  clearStoredSeedSession,
  initializeSeedAuth,
  readStoredSeedSession,
  writeStoredSeedSession,
} from "../services/officeAuthService.js";

export function useRuntimeAuthInitialization({ authOptions, authState, serverRequired, setAuthState, setToast }) {
  const currentAuthStateRef = useRef(authState);
  const setToastRef = useRef(setToast);
  currentAuthStateRef.current = authState;
  setToastRef.current = setToast;

  useEffect(() => {
    let cancelled = false;
    const expectedAuthState = currentAuthStateRef.current;
    const expectedSession = readStoredSeedSession();
    initializeSeedAuth({ ...(authOptions ?? {}), serverRequired }).then((nextAuthState) => {
      if (cancelled) return;
      const applied = applyRuntimeAuthInitializationResult({
        expectedAuthState,
        expectedSession,
        nextAuthState,
        getCurrentAuthState: () => currentAuthStateRef.current,
        readSession: readStoredSeedSession,
        writeSession: writeStoredSeedSession,
        clearSession: clearStoredSeedSession,
        setAuthState,
      });
      if (applied && nextAuthState.authenticated) {
        setToastRef.current?.(`已恢复后端登录会话：${nextAuthState.permissions.user.displayName}。`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authOptions, serverRequired, setAuthState]);
}

export function applyRuntimeAuthInitializationResult({
  expectedAuthState,
  expectedSession,
  nextAuthState,
  getCurrentAuthState,
  readSession,
  writeSession,
  clearSession,
  setAuthState,
} = {}) {
  const currentAuthState = getCurrentAuthState?.();
  const currentSession = readSession?.();
  if (
    currentAuthState !== expectedAuthState ||
    !isSameSession(expectedSession, currentSession) ||
    !isCompatibleInitializationResult(expectedSession, nextAuthState)
  ) {
    return false;
  }

  if (nextAuthState?.authenticated === true && hasSessionToken(nextAuthState.session)) {
    writeSession?.(nextAuthState.session);
  } else {
    clearSession?.();
  }
  setAuthState?.((current) => (current === expectedAuthState ? nextAuthState : current));
  return true;
}

function isCompatibleInitializationResult(expectedSession, nextAuthState) {
  if (
    !hasSessionToken(expectedSession) &&
    nextAuthState?.authenticated === true &&
    nextAuthState?.source === "api_seed" &&
    nextAuthState?.reason === "login_seed_session" &&
    hasSessionToken(nextAuthState.session)
  ) {
    return true;
  }
  if (nextAuthState?.authenticated !== true) return !hasSessionToken(nextAuthState?.session);
  return isSameSession(expectedSession, nextAuthState.session);
}

function isSameSession(first, second) {
  const firstToken = sessionToken(first);
  const secondToken = sessionToken(second);
  if (!firstToken || !secondToken) return !firstToken && !secondToken;
  return firstToken === secondToken && sessionType(first) === sessionType(second);
}

function hasSessionToken(session) {
  return Boolean(sessionToken(session));
}

function sessionToken(session) {
  return String(session?.accessToken ?? "");
}

function sessionType(session) {
  return String(session?.sessionType ?? "");
}
