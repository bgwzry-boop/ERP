import { useEffect } from "react";

export function createRawMaterialInboundAutoRefresh({
  activePage,
  refreshRawMaterialInbounds,
  refreshRawMaterialSupplierStatementReviews,
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  intervalMs = 15_000,
} = {}) {
  if (activePage !== "rawMaterials" && activePage !== "rawMaterialScanner") return undefined;

  let refreshPending = false;
  const syncRawMaterialInbounds = () => {
    if (refreshPending) return;
    refreshPending = true;
    void refreshRawMaterialInbounds({ showToast: false }).finally(() => {
      refreshPending = false;
    });
  };
  const syncWhenVisible = () => {
    if (documentRef.visibilityState === "visible") syncRawMaterialInbounds();
  };

  syncRawMaterialInbounds();
  if (activePage === "rawMaterials") {
    void refreshRawMaterialSupplierStatementReviews({ showToast: false });
  }
  windowRef.addEventListener("focus", syncRawMaterialInbounds);
  documentRef.addEventListener("visibilitychange", syncWhenVisible);
  const syncTimer = windowRef.setInterval(syncRawMaterialInbounds, intervalMs);

  return () => {
    windowRef.clearInterval(syncTimer);
    windowRef.removeEventListener("focus", syncRawMaterialInbounds);
    documentRef.removeEventListener("visibilitychange", syncWhenVisible);
  };
}

export function useRawMaterialInboundAutoRefresh(options = {}) {
  const {
    activePage,
    documentRef = globalThis.document,
    intervalMs = 15_000,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
    windowRef = globalThis.window,
  } = options;
  useEffect(() => createRawMaterialInboundAutoRefresh({
    activePage,
    documentRef,
    intervalMs,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
    windowRef,
  }), [
    activePage,
    documentRef,
    intervalMs,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
    windowRef,
  ]);
}
