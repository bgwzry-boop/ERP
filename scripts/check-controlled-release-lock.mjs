#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildControlledReleaseLockReport,
  verifyControlledReleaseLock,
} from "./controlled-release-lock-lib.mjs";
import { buildControlledReleasePostdeployReport } from "./run-controlled-release-postdeploy-check.mjs";
import { normalizeReleaseIdentity, releaseIdentityFromEnvironment } from "../shared/releaseIdentity.js";

const commit = "1234567890abcdef1234567890abcdef12345678";
const identity = releaseIdentityFromEnvironment({
  ERP_RELEASE_TARGET: "staging",
  ERP_RELEASE_VERSION: "staging-r1",
  ERP_RELEASE_COMMIT: commit,
  ERP_RELEASE_LOCK_DIGEST: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
});
assert.equal(identity.ready, true);
assert.equal(identity.shortCommit, commit.slice(0, 12));
assert.equal(normalizeReleaseIdentity({ commit, target: "staging" }).ready, false);
const cleanGitState = {
  repository: true,
  clean: true,
  commit,
  branch: "codex/release-candidate",
  upstream: "origin/codex/release-candidate",
  upstreamCommit: commit,
  remoteCount: 1,
};

const ready = buildControlledReleaseLockReport({
  target: "review-site",
  expectedCommit: commit,
  version: "review-2026.08.09-r1",
  createdAt: "2026-08-09T10:00:00+08:00",
  gitState: cleanGitState,
});
assert.equal(ready.ready, true);
assert.equal(ready.summary.passedCount, 8);
assert.equal(ready.lock.commit, commit);
assert.equal(ready.lock.target, "review-site");
assert.match(ready.lock.digest, /^[a-f0-9]{64}$/);

const verified = verifyControlledReleaseLock({
  lock: ready.lock,
  expectedCommit: commit,
  expectedTarget: "review-site",
  gitState: cleanGitState,
});
assert.equal(verified.ready, true);
assert.equal(verified.summary.passedCount, 7);

const postdeploy = await buildControlledReleasePostdeployReport({
  baseUrl: "https://erp.example.test/",
  lockVerification: verified,
  fetchImpl: async (url) => {
    if (String(url).endsWith("/api/health")) {
      return {
        ok: true,
        json: async () => ({
          status: "ok",
          release: {
            ready: true,
            target: verified.release.target,
            version: verified.release.version,
            commit: verified.release.commit,
            lockDigest: verified.release.digest,
          },
          sensitiveBusinessData: "must-not-leak",
        }),
      };
    }
    return {
      ok: true,
      text: async () => `<!doctype html><html><head>
        <meta name="erp-release-target" content="${verified.release.target}">
        <meta name="erp-release-version" content="${verified.release.version}">
        <meta name="erp-release-commit" content="${verified.release.commit}">
        <meta name="erp-release-lock" content="${verified.release.digest}">
      </head></html>`,
    };
  },
});
assert.equal(postdeploy.ready, true);
assert.equal(postdeploy.summary.passedCount, 6);
assert.doesNotMatch(JSON.stringify(postdeploy), /erp\.example\.test|must-not-leak/);

const dirty = buildControlledReleaseLockReport({
  target: "staging",
  expectedCommit: commit,
  gitState: { ...cleanGitState, clean: false },
});
assert.equal(dirty.ready, false);
assert.equal(dirty.lock, null);
assert.equal(dirty.checks.find((item) => item.key === "clean-worktree")?.status, "blocked");

const unpushed = buildControlledReleaseLockReport({
  target: "tencent-production",
  expectedCommit: commit,
  gitState: { ...cleanGitState, upstreamCommit: "abcdef1234567890abcdef1234567890abcdef12" },
});
assert.equal(unpushed.ready, false);
assert.equal(unpushed.checks.find((item) => item.key === "pushed")?.status, "blocked");

const tampered = verifyControlledReleaseLock({
  lock: { ...ready.lock, target: "staging" },
  expectedCommit: commit,
  expectedTarget: "review-site",
});
assert.equal(tampered.ready, false);
assert.equal(tampered.checks.find((item) => item.key === "digest")?.status, "blocked");
assert.equal(tampered.checks.find((item) => item.key === "target")?.status, "blocked");

assert.throws(
  () => buildControlledReleaseLockReport({ target: "other", expectedCommit: commit, gitState: cleanGitState }),
  /Release target/,
);
assert.throws(
  () => buildControlledReleaseLockReport({ target: "review-site", expectedCommit: "1234", gitState: cleanGitState }),
  /40-character/,
);

console.log("Controlled release lock checks passed.");
