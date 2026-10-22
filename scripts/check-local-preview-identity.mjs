import assert from "node:assert/strict";
import {
  buildFreshReleaseUrl,
  establishLocalPreviewIdentity,
} from "../src/config/localPreviewIdentity.js";
import {
  createLocalReviewProvenance,
  disableCompleteReviewBootstrapCachingPlugin,
} from "../docs/prototypes/raw-material-roll-inventory-review/vite.config.mjs";

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function releaseHtml(commit) {
  return `<!doctype html><html><head>
    <meta name="erp-app-id" content="bagwin-complete-review-4174">
    <meta name="erp-release-commit" content="${commit}">
  </head></html>`;
}

function previewHtml(state) {
  return `<!doctype html><html><head>
    <meta name="erp-app-id" content="bagwin-complete-review-4174">
    <meta name="erp-preview-kind" content="local-unreleased">
    <meta name="erp-preview-state" content="${state}">
  </head></html>`;
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

const oldCommit = "1".repeat(40);
const newCommit = "2".repeat(40);
const documentEvents = createEventTarget();
const windowEvents = createEventTarget();
const fetchCalls = [];
const replacementUrls = [];
let servedCommit = oldCommit;
let servedPreviewState = "";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

globalThis.document = {
  ...documentEvents,
  visibilityState: "visible",
  documentElement: { dataset: {} },
  querySelector(selector) {
    if (selector.includes("erp-release-commit")) return { content: oldCommit };
    if (selector.includes("erp-preview-state")) return null;
    if (selector.includes("erp-app-id")) return { content: "bagwin-complete-review-4174" };
    return null;
  },
};
globalThis.window = {
  ...windowEvents,
  location: {
    href: "https://erp-staging.luxingpack.com/#roll-inventory",
    replace(url) {
      replacementUrls.push(url);
    },
  },
  setInterval() {
    return 17;
  },
  clearInterval() {},
};
globalThis.fetch = async (url, options) => {
  fetchCalls.push({ url, options });
  return {
    ok: true,
    async text() {
      return servedPreviewState ? previewHtml(servedPreviewState) : releaseHtml(servedCommit);
    },
  };
};

try {
  const stop = establishLocalPreviewIdentity("bagwin-complete-review-4174", { intervalMs: 60_000 });
  await flushPromises();

  assert.equal(replacementUrls.length, 0, "the current release must remain in place");
  assert.equal(fetchCalls[0]?.options?.cache, "no-store");
  assert.equal(fetchCalls[0]?.options?.credentials, "same-origin");
  assert.equal(fetchCalls[0]?.options?.headers?.["cache-control"], "no-cache");

  windowEvents.dispatch("pagehide", { persisted: true });
  assert.equal(windowEvents.listenerCount("pageshow"), 1, "BFCache pagehide must not disable the release guard");

  servedCommit = newCommit;
  windowEvents.dispatch("pageshow", { persisted: true });
  await flushPromises();

  assert.equal(replacementUrls.length, 1, "a restored stale page must navigate to the current release");
  const replacement = new URL(replacementUrls[0]);
  assert.equal(replacement.searchParams.get("erpRelease"), newCommit);
  assert.equal(replacement.hash, "#roll-inventory", "the selected ERP workbench must survive the refresh");

  stop();
  assert.equal(windowEvents.listenerCount("pageshow"), 0);
  assert.equal(windowEvents.listenerCount("pagehide"), 0);

  const localUrl = buildFreshReleaseUrl("http://127.0.0.1:4174/?fresh=old#people-machines", newCommit);
  assert.equal(new URL(localUrl).searchParams.get("erpRelease"), newCommit);
  assert.equal(new URL(localUrl).hash, "#people-machines");

  const wrongBootstrap = establishLocalPreviewIdentity("bagwin-formal-workbench-root", { intervalMs: 60_000 });
  assert.equal(wrongBootstrap, null, "a module for another ERP app must be blocked before it renders");
  assert.equal(replacementUrls.length, 2, "a mismatched bootstrap must immediately request a fresh document");
  assert.equal(
    new URL(replacementUrls[1]).searchParams.get("erpRelease"),
    "bagwin-complete-review-4174",
    "the document-declared app identity must own the cache-busting reload",
  );

  replacementUrls.length = 0;
  fetchCalls.length = 0;
  servedPreviewState = "local-state-two";
  globalThis.document.querySelector = (selector) => {
    if (selector.includes("erp-preview-state")) return { content: "local-state-one" };
    if (selector.includes("erp-release-commit")) return null;
    if (selector.includes("erp-preview-kind")) return { content: "local-unreleased" };
    if (selector.includes("erp-preview-base-commit")) return { content: oldCommit };
    if (selector.includes("erp-preview-dirty")) return { content: "true" };
    if (selector.includes("erp-app-id")) return { content: "bagwin-complete-review-4174" };
    return null;
  };
  const stopLocal = establishLocalPreviewIdentity("bagwin-complete-review-4174", { intervalMs: 60_000 });
  await flushPromises();
  assert.equal(replacementUrls.length, 1, "a stale local source state must force a whole-document refresh");
  assert.equal(new URL(replacementUrls[0]).searchParams.get("erpRelease"), "local-state-two");
  assert.equal(globalThis.document.documentElement.dataset.erpPreviewKind, "local-unreleased");
  assert.equal(globalThis.document.documentElement.dataset.erpPreviewDirty, "true");
  stopLocal();
} finally {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
}

let clock = 1_000;
let gitHead = oldCommit;
let gitStatus = "";
let failingCommand = "";
let reads = 0;
const provenance = createLocalReviewProvenance({
  now: () => clock,
  refreshMs: 500,
  readGit(args, fallback) {
    reads += 1;
    if (args[0] === failingCommand) return fallback;
    return args[0] === "rev-parse" ? gitHead : gitStatus;
  },
});
assert.equal(provenance.baseCommit, oldCommit);
assert.equal(provenance.dirty, false);
const initialState = provenance.state();
assert.match(initialState, /^[a-f0-9]{64}$/);
const initialReads = reads;
provenance.state();
assert.equal(reads, initialReads, "multiple identity fields in the same response share the short Git snapshot");

gitHead = newCommit;
clock += 499;
assert.equal(provenance.baseCommit, oldCommit, "the bounded cache may serve the preceding snapshot before expiry");
clock += 1;
assert.equal(provenance.baseCommit, newCommit, "a running preview must observe a main-worktree fast-forward without restart");
assert.equal(provenance.dirty, false);
const advancedCommitState = provenance.state();
assert.notEqual(advancedCommitState, initialState, "changing HEAD must invalidate the browser's whole-document identity");

gitStatus = " M src/App.jsx";
clock += 500;
assert.equal(provenance.dirty, true, "uncommitted edits after server startup must appear in the preview identity");
const dirtyState = provenance.state();
assert.notEqual(dirtyState, advancedCommitState);
gitStatus = "";
clock += 500;
assert.equal(provenance.dirty, false, "committing or clearing local changes must update the same running identity");
assert.equal(provenance.state(), advancedCommitState, "unchanged commit and clean source produce the same identity without watcher events");
provenance.advance();
assert.notEqual(provenance.state(), advancedCommitState, "content watcher events still invalidate state immediately");

const plugin = disableCompleteReviewBootstrapCachingPlugin({ provenance });
let middleware;
plugin.configureServer({
  watcher: { on() {} },
  middlewares: { use(callback) { middleware = callback; } },
});
gitHead = oldCommit;
gitStatus = "?? new-local-file.txt";
clock += 500;
const metadata = Object.fromEntries(plugin.transformIndexHtml().map((tag) => [tag.attrs.name, tag.attrs.content]));
assert.equal(metadata["erp-preview-base-commit"], oldCommit, "fresh HTML must carry current Git facts rather than captured startup values");
assert.equal(metadata["erp-preview-dirty"], "true");
const headers = new Map();
let continued = false;
const response = { setHeader(name, value) { headers.set(name, value); }, writeHead() {} };
middleware({ url: "/?erpRelease=old#roll-inventory" }, response, () => { continued = true; });
response.writeHead(200);
assert.equal(continued, true);
assert.equal(headers.get("x-erp-preview-base-commit"), metadata["erp-preview-base-commit"]);
assert.equal(headers.get("x-erp-preview-dirty"), metadata["erp-preview-dirty"]);
assert.equal(headers.get("x-erp-preview-state"), metadata["erp-preview-state"]);
assert.match(headers.get("cache-control"), /no-store/);

gitStatus = "";
failingCommand = "status";
clock += 500;
assert.equal(provenance.baseCommit, oldCommit);
assert.equal(provenance.dirty, true, "failed git status cannot be reported as a clean worktree");
failingCommand = "rev-parse";
clock += 500;
assert.equal(provenance.baseCommit, "unknown", "unreadable HEAD must not retain the preceding known commit");
assert.equal(provenance.dirty, true, "unknown source identity must fail closed even when status is empty");
failingCommand = "";
clock += 500;
assert.equal(provenance.baseCommit, oldCommit);
assert.equal(provenance.dirty, false, "a later successful read can recover without restarting the server");

console.log("Preview identity guard check passed: BFCache, controlled releases, live Git provenance and local source-state changes all force a fresh canonical document.");
