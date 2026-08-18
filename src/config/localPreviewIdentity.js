const APP_ID_META_NAME = "erp-app-id";
const RELEASE_COMMIT_META_NAME = "erp-release-commit";
const PREVIEW_KIND_META_NAME = "erp-preview-kind";
const PREVIEW_STATE_META_NAME = "erp-preview-state";
const PREVIEW_BASE_COMMIT_META_NAME = "erp-preview-base-commit";
const PREVIEW_DIRTY_META_NAME = "erp-preview-dirty";

function readHtmlMetaContent(html = "", metaName = "") {
  const escapedName = String(metaName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameFirst = new RegExp(`<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']*)["']`, "i");
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escapedName}["']`, "i");
  return String(html).match(nameFirst)?.[1] || String(html).match(contentFirst)?.[1] || "";
}

function readHtmlAppId(html = "") {
  return readHtmlMetaContent(html, APP_ID_META_NAME);
}

function readHtmlReleaseCommit(html = "") {
  return readHtmlMetaContent(html, RELEASE_COMMIT_META_NAME).trim().toLowerCase();
}

function readHtmlPreviewState(html = "") {
  return readHtmlMetaContent(html, PREVIEW_STATE_META_NAME).trim().toLowerCase();
}

function readDocumentMetaContent(metaName = "") {
  if (typeof document === "undefined") return "";
  return String(document.querySelector(`meta[name="${metaName}"]`)?.content ?? "").trim();
}

function buildFreshReleaseUrl(locationHref = "", releaseCommit = "", now = Date.now()) {
  const nextUrl = new URL(String(locationHref || "/"), "http://127.0.0.1");
  const releaseToken = String(releaseCommit || now).trim().toLowerCase();
  nextUrl.searchParams.set("erpRelease", releaseToken);
  return nextUrl.toString();
}

export function establishLocalPreviewIdentity(expectedAppId, options = {}) {
  if (typeof document !== "undefined") {
    const declaredAppId = readDocumentMetaContent(APP_ID_META_NAME);
    if (declaredAppId && declaredAppId !== expectedAppId) {
      if (typeof window !== "undefined") {
        const nextUrl = buildFreshReleaseUrl(window.location.href, declaredAppId);
        window.location.replace(nextUrl);
      }
      return null;
    }
    document.documentElement.dataset.erpAppId = expectedAppId;
    const previewKind = readDocumentMetaContent(PREVIEW_KIND_META_NAME);
    if (previewKind) document.documentElement.dataset.erpPreviewKind = previewKind;
    const previewBaseCommit = readDocumentMetaContent(PREVIEW_BASE_COMMIT_META_NAME).toLowerCase();
    if (previewBaseCommit) document.documentElement.dataset.erpPreviewBaseCommit = previewBaseCommit;
    document.documentElement.dataset.erpPreviewDirty = readDocumentMetaContent(PREVIEW_DIRTY_META_NAME) || "false";
  }
  if (typeof window === "undefined" || typeof fetch !== "function") return () => {};

  const currentReleaseCommit = readDocumentMetaContent(RELEASE_COMMIT_META_NAME).toLowerCase();
  const currentPreviewState = readDocumentMetaContent(PREVIEW_STATE_META_NAME).toLowerCase();
  const intervalMs = Number(options.intervalMs) > 0
    ? Number(options.intervalMs)
    : import.meta.env.DEV ? 2_000 : 30_000;
  let stopped = false;
  let checking = false;
  let refreshing = false;

  const checkOriginIdentity = async () => {
    if (stopped || checking || refreshing || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const response = await fetch(`/?erpIdentityCheck=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          accept: "text/html",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
      });
      if (!response.ok) return;
      const html = await response.text();
      const actualAppId = readHtmlAppId(html);
      const actualReleaseCommit = readHtmlReleaseCommit(html);
      const actualPreviewState = readHtmlPreviewState(html);
      const appChanged = Boolean(actualAppId && actualAppId !== expectedAppId);
      const releaseChanged = Boolean(actualReleaseCommit && actualReleaseCommit !== currentReleaseCommit);
      const previewChanged = Boolean(actualPreviewState && actualPreviewState !== currentPreviewState);
      if (appChanged || releaseChanged || previewChanged) {
        refreshing = true;
        const nextUrl = buildFreshReleaseUrl(
          window.location.href,
          actualReleaseCommit || actualPreviewState || actualAppId,
        );
        window.location.replace(nextUrl);
      }
    } catch {
      // A local server can be briefly unavailable during restart. The next interval retries.
    } finally {
      checking = false;
    }
  };

  const checkVisibleOrigin = () => {
    if (document.visibilityState !== "hidden") void checkOriginIdentity();
  };
  const timer = window.setInterval(checkVisibleOrigin, intervalMs);
  const handlePageHide = (event) => {
    // A persisted page is entering the browser back/forward cache. Keep the
    // guard alive so pageshow can compare it with the uncached origin before
    // the operator continues in a restored, stale ERP document.
    if (!event.persisted) stop();
  };
  const stop = () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("pageshow", checkVisibleOrigin);
    window.removeEventListener("focus", checkVisibleOrigin);
    window.removeEventListener("pagehide", handlePageHide);
    document.removeEventListener("visibilitychange", checkVisibleOrigin);
  };
  window.addEventListener("pageshow", checkVisibleOrigin);
  window.addEventListener("focus", checkVisibleOrigin);
  document.addEventListener("visibilitychange", checkVisibleOrigin);
  window.addEventListener("pagehide", handlePageHide);
  void checkOriginIdentity();
  return stop;
}

export {
  APP_ID_META_NAME,
  RELEASE_COMMIT_META_NAME,
  PREVIEW_BASE_COMMIT_META_NAME,
  PREVIEW_DIRTY_META_NAME,
  PREVIEW_KIND_META_NAME,
  PREVIEW_STATE_META_NAME,
  buildFreshReleaseUrl,
  readHtmlAppId,
  readHtmlMetaContent,
  readHtmlPreviewState,
  readHtmlReleaseCommit,
};
