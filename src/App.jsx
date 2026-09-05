import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { RuntimeAuthBoundary } from "./app/RuntimeAuthBoundary.jsx";
import { createRuntimeAuthActions } from "./app/createRuntimeAuthActions.js";
import { shouldShowRuntimeAuthBoundary } from "./app/runtimeAuthViewState.js";
import { useRuntimeAuthInitialization } from "./app/useRuntimeAuthInitialization.js";
import {
  useRuntimeAuthInvalidation,
  useRuntimeSessionExpiry,
  useRuntimeSessionRevalidation,
} from "./app/useRuntimeSessionExpiry.js";
import { DataState } from "./shared/ui/operational.jsx";
import {
  createInitialAuthState,
  isOfficeApiServerRequired,
  isOfficeSharedDataServerRequired,
} from "./services/officeAuthService.js";

const OfficeWorkbench = lazy(() => import("./OfficeWorkbench.jsx").then((module) => ({
  default: module.OfficeWorkbench,
})));

export function App({ signedPreviewUserId = "" } = {}) {
  const signedPreviewAuthOptions = useMemo(() => {
    const normalizedPreviewUserId = String(signedPreviewUserId ?? "").trim();
    if (!normalizedPreviewUserId) return null;
    return Object.freeze({
      defaultUserId: normalizedPreviewUserId,
      serverRequired: false,
      stagingAuthBypass: true,
    });
  }, [signedPreviewUserId]);
  const formalLoginRequired = isOfficeApiServerRequired(signedPreviewAuthOptions ?? undefined);
  const runtimeServerRequired = isOfficeSharedDataServerRequired();
  const [authState, setAuthState] = useState(() => createInitialAuthState(signedPreviewAuthOptions ?? undefined));
  const [runtimeNotice, setRuntimeNotice] = useState("");
  const [runtimeLoginForm, setRuntimeLoginForm] = useState({ loginName: "", password: "" });
  const [runtimeLoginLoading, setRuntimeLoginLoading] = useState(false);
  const runtimeLoginRequestRef = useRef(0);
  const [runtimePasswordChangeForm, setRuntimePasswordChangeForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [runtimePasswordChangeError, setRuntimePasswordChangeError] = useState("");
  const [runtimePasswordChangeLoading, setRuntimePasswordChangeLoading] = useState(false);
  const currentUser = authState.permissions.user;

  useRuntimeAuthInitialization({
    authOptions: signedPreviewAuthOptions,
    authState,
    serverRequired: formalLoginRequired,
    setAuthState,
    setToast: setRuntimeNotice,
  });

  const {
    expireRuntimeUserSession,
    invalidateRuntimeUserSession,
    logoutRuntimeUserSession,
    revalidateRuntimeUserSession,
    submitRuntimeLogin,
    submitRuntimePasswordChange,
    switchSeedUser,
  } = createRuntimeAuthActions({
    authState,
    runtimeLoginForm,
    runtimeLoginLoading,
    runtimePasswordChangeForm,
    runtimePasswordChangeLoading,
    runtimeServerRequired: formalLoginRequired,
    runtimeLoginRequestRef,
    setAuthState,
    setRuntimeLoginForm,
    setRuntimeLoginLoading,
    setRuntimePasswordChangeError,
    setRuntimePasswordChangeForm,
    setRuntimePasswordChangeLoading,
    setToast: setRuntimeNotice,
  });

  useRuntimeSessionExpiry({ authState, enabled: formalLoginRequired, onExpire: expireRuntimeUserSession });
  useRuntimeAuthInvalidation({ enabled: formalLoginRequired, onInvalidate: invalidateRuntimeUserSession });
  useRuntimeSessionRevalidation({ authState, enabled: formalLoginRequired, onRevalidate: revalidateRuntimeUserSession });

  if (shouldShowRuntimeAuthBoundary({ authState, formalLoginRequired })) {
    return (
      <RuntimeAuthBoundary
        authState={authState}
        passwordChange={{
          error: runtimePasswordChangeError,
          form: runtimePasswordChangeForm,
          loading: runtimePasswordChangeLoading,
          onChange: (field, value) => {
            setRuntimePasswordChangeError("");
            setRuntimePasswordChangeForm((current) => ({ ...current, [field]: value }));
          },
          onSubmit: submitRuntimePasswordChange,
        }}
        runtimeLogin={{
          form: runtimeLoginForm,
          loading: runtimeLoginLoading,
          onChange: (field, value) => setRuntimeLoginForm((current) => ({ ...current, [field]: value })),
          onSubmit: submitRuntimeLogin,
        }}
        runtimeServerRequired={formalLoginRequired}
        user={currentUser}
      />
    );
  }

  return (
    <Suspense fallback={<DataState title="业务工作台加载中" />}>
      <OfficeWorkbench
        authState={authState}
        formalLoginRequired={formalLoginRequired}
        fixedPreviewMode={Boolean(signedPreviewAuthOptions)}
        logoutRuntimeUserSession={logoutRuntimeUserSession}
        runtimeLoginLoading={runtimeLoginLoading}
        runtimeNotice={runtimeNotice}
        runtimeServerRequired={runtimeServerRequired}
        switchSeedUser={switchSeedUser}
      />
    </Suspense>
  );
}
