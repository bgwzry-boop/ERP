const fullCommitPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;

export const ERP_RELEASE_TARGETS = Object.freeze([
  "review-site",
  "staging",
  "tencent-production",
]);

export function normalizeReleaseIdentity(value = {}) {
  const commitCandidate = String(value.commit ?? "").trim().toLowerCase();
  const targetCandidate = String(value.target ?? "").trim().toLowerCase();
  const digestCandidate = String(value.lockDigest ?? "").trim().toLowerCase();
  const commit = fullCommitPattern.test(commitCandidate) ? commitCandidate : "";
  const target = ERP_RELEASE_TARGETS.includes(targetCandidate) ? targetCandidate : "unknown";
  const lockDigest = digestPattern.test(digestCandidate) ? digestCandidate : "";
  const version = safeReleaseLabel(value.version);
  const builtAt = safeTimestamp(value.builtAt);

  return Object.freeze({
    ready: Boolean(commit && target !== "unknown" && version && lockDigest),
    commit,
    shortCommit: commit.slice(0, 12),
    target,
    version,
    lockDigest,
    builtAt,
  });
}

export function releaseIdentityFromEnvironment(env = {}, prefix = "ERP_RELEASE_") {
  return normalizeReleaseIdentity({
    commit: env[`${prefix}COMMIT`],
    target: env[`${prefix}TARGET`],
    version: env[`${prefix}VERSION`],
    lockDigest: env[`${prefix}LOCK_DIGEST`],
    builtAt: env[`${prefix}BUILT_AT`],
  });
}

function safeReleaseLabel(value) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(text) ? text : "";
}

function safeTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text || !Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString();
}
