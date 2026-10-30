import {useEffect, useMemo, useRef} from "react";
import {createOfficeRawMaterialActions} from "./createOfficeRawMaterialActions.js";

const stateSetters = [
  "setRawMaterialInboundMeta", "setRawMaterialInbounds",
  "setRawMaterialSupplierStatementReviewMeta", "setRawMaterialSupplierStatementReviews",
  "setSelectedRawMaterialInboundId",
];

// Equivalent auth-object refreshes preserve a pending command. A different
// identity, effective permission set, page or selection retires its callbacks.
export function useOfficeRawMaterialActions(options) {
  const {authState, currentUserId, activePage, renderedPage, selectedRawMaterialInboundId, allowLocalFallback} = options;
  const permissions = authState?.permissions;
  const key = JSON.stringify([
    currentUserId, authState?.authenticated, authState?.source,
    authState?.session?.accessToken,
    [...(permissions?.actionPermissions || [])].sort(),
    [...(permissions?.buttonPermissions || [])].sort(),
    [...(permissions?.roles || [])].sort(), permissions?.user?.enabled,
    activePage, renderedPage, selectedRawMaterialInboundId, allowLocalFallback,
  ]);
  const session = useMemo(() => ({live:true}), [key]);
  const active = useRef(session);
  active.current = session;
  useEffect(() => {
    session.live = true;
    return () => { session.live = false; };
  }, [session]);
  const isCurrent = () => session.live && active.current === session;
  const guarded = {...options, isCurrent};
  // Toast is an imperative message callback, not a React state setter.
  guarded.setToast = message => { if (isCurrent()) options.setToast(message); };
  for (const name of stateSetters) {
    guarded[name] = value => {
      if (!isCurrent()) return;
      // React may evaluate a queued updater after the account/page changed.
      options[name](current => isCurrent()
        ? typeof value === "function" ? value(current) : value
        : current);
    };
  }
  return createOfficeRawMaterialActions(guarded);
}
