import assert from "node:assert/strict";
import {
  buildFreshReleaseUrl,
  establishLocalPreviewIdentity,
} from "../src/config/localPreviewIdentity.js";

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

console.log("Preview identity guard check passed: BFCache, controlled releases and local source-state changes all force a fresh canonical document.");
