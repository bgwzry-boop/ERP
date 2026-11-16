// This selects a test surface for the existing signed preview operator. It
// grants no role or permission; every read/write still uses the original session.
export function getFixedPreviewFieldAccess({
  signedPreviewMode = false,
  authState,
  environment = import.meta.env ?? {},
  hostname = globalThis.location?.hostname ?? "",
} = {}) {
  const denied = { enabled: false, production: false, packing: false };
  const target = String(environment.VITE_ERP_RELEASE_TARGET ?? "").trim();
  const staging = target === "staging";
  const local = !target && environment.DEV === true
    && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
  if ((!staging && !local) || signedPreviewMode !== true
    || authState?.authenticated !== true || authState.source !== "api_seed"
    || authState.session?.sessionType !== "seed" || typeof authState.session.accessToken !== "string" || !authState.session.accessToken.trim()
    || authState.session.userId !== "U-MANAGER-A"
    || authState.permissions?.user?.userId !== "U-MANAGER-A") return denied;
  const permissions = new Set(authState.permissions.actionPermissions ?? []);
  const production = permissions.has("production.read") && permissions.has("production.report.complete");
  const packing = permissions.has("packing.read") && permissions.has("packing.complete");
  return { enabled: production || packing, production, packing };
}
