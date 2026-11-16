import assert from "node:assert/strict";
import { getFixedPreviewFieldAccess } from "../src/app/fixedPreviewFieldAccess.js";
import { resolveOfficeWorkbenchNavigation } from "../src/app/useOfficeWorkbenchNavigation.js";
import { buildProductionTaskListQueryForPage } from "../src/state/officeProductionPackingState.js";

const authState = {
  authenticated: true, source: "api_seed",
  session: { sessionType: "seed", accessToken: "signed-fixture", userId: "U-MANAGER-A" },
  permissions: { user: { userId: "U-MANAGER-A", defaultRole: "management" }, roles: ["office", "management"],
    actionPermissions: ["raw_material.read", "production.read", "production.report.complete", "packing.read", "packing.complete"] },
};
const base = { signedPreviewMode: true, authState, environment: { VITE_ERP_RELEASE_TARGET: "staging", PROD: true }, hostname: "staging.invalid" };
const before = structuredClone(authState);
assert.deepEqual(getFixedPreviewFieldAccess(base), { enabled: true, production: true, packing: true });
assert.equal(getFixedPreviewFieldAccess({ ...base, environment: { DEV: true }, hostname: "127.0.0.1" }).enabled, true);
const rejected = [
  { signedPreviewMode: false }, { authState: { ...authState, authenticated: false } },
  { authState: { ...authState, source: "local_seed" } }, { authState: { ...authState, source: "api_runtime" } },
  ...[{ sessionType: "runtime" }, { accessToken: "" }, { accessToken: "   " }, { accessToken: {} }, { userId: "U-WORKSHOP-A" }].map(patch => ({ authState: { ...authState, session: { ...authState.session, ...patch } } })),
  { authState: { ...authState, permissions: { ...authState.permissions, user: { userId: "OTHER" } } } },
  ...["tencent-production", "production", "review-site", "unknown", ""].map(target => ({ environment: { VITE_ERP_RELEASE_TARGET: target, PROD: true } })),
  { environment: { VITE_ERP_RELEASE_TARGET: "tencent-production", DEV: true }, hostname: "127.0.0.1" },
  { environment: { DEV: true }, hostname: "public.invalid" },
];
for (const override of rejected) assert.equal(getFixedPreviewFieldAccess({ ...base, ...override }).enabled, false, JSON.stringify(override));
for (const actions of [[], ["production.read"], ["production.report.complete"], ["packing.read"], ["packing.complete"]]) {
  assert.equal(getFixedPreviewFieldAccess({ ...base, authState: { ...authState, permissions: { ...authState.permissions, actionPermissions: actions } } }).enabled, false);
}
for (const [kind, actions] of [["production", ["production.read", "production.report.complete"]], ["packing", ["packing.read", "packing.complete"]]]) {
  const access = getFixedPreviewFieldAccess({ ...base, authState: { ...authState, permissions: { ...authState.permissions, actionPermissions: actions } } });
  assert.equal(access.enabled, true); assert.equal(access[kind], true);
  assert.equal(access[kind === "production" ? "packing" : "production"], false);
}
const fieldPreviewAccess = getFixedPreviewFieldAccess(base);
assert.equal(resolveOfficeWorkbenchNavigation({ activePage: "workshopMobile", mobileViewport: true,
  permissionContext: authState.permissions, signedPreviewMode: true, fieldPreviewAccess }).renderedPage, "workshopMobile");
assert.equal(resolveOfficeWorkbenchNavigation({ activePage: "workshopMobile", mobileViewport: true,
  permissionContext: authState.permissions, signedPreviewMode: false }).renderedPage, "desktopRequiredMobile");
assert.equal(resolveOfficeWorkbenchNavigation({ activePage: "workshopMobile", mobileViewport: true,
  permissionContext: authState.permissions, signedPreviewMode: true,
  fieldPreviewAccess: getFixedPreviewFieldAccess({ ...base, environment: { VITE_ERP_RELEASE_TARGET: "tencent-production" } }) }).renderedPage, "desktopRequiredMobile");
assert.deepEqual(buildProductionTaskListQueryForPage("workshopMobile", { defaultRole: "workshop", defaultMachineId: "BAG-07" }, "WORKER"),
  { pageSize: 200, status: "open", visibility: "workshop_mobile", machineId: "BAG-07" });
assert.deepEqual(authState, before, "preview surface selection must never rewrite identity or roles");
console.log("PASS fixed-preview field guard: signed staging/local only, exact identity, read/write permissions, normal management and production stay closed, worker machine scope unchanged.");
