export const MINIAPP_INTERNAL_ONLY_MESSAGE = "ERP Miniapp skeleton is internal-only; public customer traffic must use the separate Miniapp BFF. Use bagwin-erp-integration:production for signed ERP intake.";

export function assertMiniappInternalRuntime(options = {}) {
  if (options.runtimeMode === "production") {
    const error = new Error(MINIAPP_INTERNAL_ONLY_MESSAGE);
    error.code = "MINIAPP_PUBLIC_BFF_NOT_SUPPORTED";
    throw error;
  }
}
