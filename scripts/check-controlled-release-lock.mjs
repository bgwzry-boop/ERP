#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildControlledReleaseLockReport,
  verifyControlledReleaseLock,
} from "./controlled-release-lock-lib.mjs";
import { buildControlledReleasePostdeployReport } from "./run-controlled-release-postdeploy-check.mjs";
import { appendStagingCurrentRefCheck } from "./run-controlled-release-postdeploy-check.mjs";
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
    if (new URL(url).pathname.endsWith("/api/health")) {
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

const stagingLock = buildControlledReleaseLockReport({
  target: "staging",
  expectedCommit: commit,
  version: "staging-r2",
  gitState: cleanGitState,
});
const stagingVerification = verifyControlledReleaseLock({
  lock: stagingLock.lock,
  expectedCommit: commit,
  expectedTarget: "staging",
});
const otherCommit = "abcdef1234567890abcdef1234567890abcdef12";
const capturedRequests = [];
function responseFor(release, url, overrides = {}) {
  if (new URL(url).pathname.endsWith("/api/health")) {
    return {
      ok: true,
      json: async () => ({
        status: "ok",
        release: { ready: true, ...release, lockDigest: release.digest, ...overrides },
        secret: "must-not-leak",
      }),
    };
  }
  return {
    ok: true,
    text: async () => (release.target === "staging" ? '<meta name="erp-app-id" content="bagwin-complete-review-4174">\n' : "") + ["target", "version", "commit", "lock"].map((key) =>
      `<meta name="erp-release-${key}" content="${key === "lock" ? release.digest : release[key]}">`,
    ).join("\n"),
  };
}
const stagingReady = await buildControlledReleasePostdeployReport({
  baseUrl: "https://erp.example.test/?old=cache#material-receiving",
  lockVerification: stagingVerification,
  fetchImpl: async (url, options) => {
    capturedRequests.push({ url: new URL(url), options });
    return responseFor(stagingVerification.release, url);
  },
});
assert.equal(stagingReady.ready, true, "matching frontend and API pass the target identity check");
assert.equal(capturedRequests.length, 2);
for (const { url, options } of capturedRequests) {
  assert.notEqual(url.search, "", "every live identity request must bust caches");
  assert.equal(url.searchParams.has("old"), false, "caller query cannot select an old response");
  assert.equal(url.hash, "");
  assert.equal(options.cache, "no-store");
  assert.match(new Headers(options.headers).get("cache-control"), /no-cache|no-store/);
  assert.ok(options.signal instanceof AbortSignal, "live identity requests need a bounded timeout");
}
for (const overrides of [
  { commit: otherCommit },
  { target: "tencent-production" },
  { version: "staging-old" },
  { lockDigest: "0".repeat(64) },
  { ready: false },
]) {
  const mismatch = await buildControlledReleasePostdeployReport({
    baseUrl: "https://erp.example.test/",
    lockVerification: stagingVerification,
    fetchImpl: async (url) => responseFor(stagingVerification.release, url, overrides),
  });
  assert.equal(mismatch.ready, false, `API disagreement must block: ${JSON.stringify(overrides)}`);
  assert.doesNotMatch(JSON.stringify(mismatch), /must-not-leak|erp\.example/);
}
const staleFrontend = await buildControlledReleasePostdeployReport({
  baseUrl: "https://erp.example.test/",
  lockVerification: stagingVerification,
  fetchImpl: async (url) => responseFor({ ...stagingVerification.release, commit: otherCommit }, url, { commit }),
});
assert.equal(staleFrontend.ready, false, "a current API must not hide a stale frontend");
for (const appId of ["", "bagwin-legacy-workbench"]) {
  const wrongApp = await buildControlledReleasePostdeployReport({
    baseUrl: "https://erp.example.test/",
    lockVerification: stagingVerification,
    fetchImpl: async (url) => {
      const response = responseFor(stagingVerification.release, url);
      if (!new URL(url).pathname.endsWith("/api/health")) {
        const html = await response.text();
        response.text = async () => html.replace('<meta name="erp-app-id" content="bagwin-complete-review-4174">', appId ? `<meta name="erp-app-id" content="${appId}">` : "");
      }
      return response;
    },
  });
  assert.equal(wrongApp.ready, false, "same release metadata cannot make a legacy or unidentified frontend valid staging");
  assert.equal(wrongApp.checks.find((item) => item.key === "page-app-id")?.ready, false);
}
const cannotSkipStagingApi = await buildControlledReleasePostdeployReport({
  baseUrl: "https://erp.example.test/",
  lockVerification: stagingVerification,
  requireApi: false,
  fetchImpl: async (url) => responseFor(stagingVerification.release, url, { commit: otherCommit }),
});
assert.equal(cannotSkipStagingApi.ready, false, "a caller cannot opt staging out of its mandatory API identity check");
assert.equal(cannotSkipStagingApi.safeguards.apiRequired, true);
const networkFailure = await buildControlledReleasePostdeployReport({
  baseUrl: "https://erp.example.test/",
  lockVerification: stagingVerification,
  fetchImpl: async () => { throw new Error("must-not-leak private network detail"); },
});
assert.equal(networkFailure.ready, false, "unreadable live state must fail closed");
assert.doesNotMatch(JSON.stringify(networkFailure), /must-not-leak|private network/);
let staticRequests = 0;
const staticOnly = await buildControlledReleasePostdeployReport({
  baseUrl: "https://erp.example.test/",
  lockVerification: verified,
  fetchImpl: async (url) => {
    staticRequests += 1;
    assert.equal(new URL(url).pathname.includes("api/health"), false, "static review targets must not depend on API availability");
    return responseFor(verified.release, url);
  },
});
assert.equal(staticOnly.ready, true);
assert.equal(staticRequests, 1);

const stagingPostdeployBase = {
  ...postdeploy,
  release: { ...postdeploy.release, target: "staging" },
};
const stagingPostdeployReady = appendStagingCurrentRefCheck(stagingPostdeployBase, {
  target: "staging",
  expectedCommit: commit,
  currentRefCommit: commit,
});
assert.equal(stagingPostdeployReady.ready, true);
assert.equal(stagingPostdeployReady.checks.at(-1)?.key, "staging-current-ref");
const stagingPostdeployBlocked = appendStagingCurrentRefCheck(stagingPostdeployBase, {
  target: "staging",
  expectedCommit: commit,
  currentRefCommit: "abcdef1234567890abcdef1234567890abcdef12",
});
assert.equal(stagingPostdeployBlocked.ready, false);
assert.equal(stagingPostdeployBlocked.checks.at(-1)?.status, "blocked");

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
