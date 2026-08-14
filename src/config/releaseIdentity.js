import { normalizeReleaseIdentity } from "../../shared/releaseIdentity.js";

export const releaseIdentity = normalizeReleaseIdentity({
  commit: import.meta.env.VITE_ERP_RELEASE_COMMIT,
  target: import.meta.env.VITE_ERP_RELEASE_TARGET,
  version: import.meta.env.VITE_ERP_RELEASE_VERSION,
  lockDigest: import.meta.env.VITE_ERP_RELEASE_LOCK_DIGEST,
  builtAt: import.meta.env.VITE_ERP_RELEASE_BUILT_AT,
});

export function exposeReleaseIdentity(identity = releaseIdentity, root = document.documentElement) {
  root.dataset.erpReleaseReady = String(identity.ready);
  root.dataset.erpReleaseTarget = identity.target;
  root.dataset.erpReleaseVersion = identity.version;
  root.dataset.erpReleaseCommit = identity.commit;
  root.dataset.erpReleaseLock = identity.lockDigest;
  globalThis.__ERP_RELEASE__ = identity;
  return identity;
}
