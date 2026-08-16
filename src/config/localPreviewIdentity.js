const APP_ID_META_NAME = "erp-app-id";
const RELEASE_COMMIT_META_NAME = "erp-release-commit";

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

function readDocumentMetaContent(metaName = "") {
  if (typeof document === "undefined") return "";
  return String(document.querySelector(`meta[name="${metaName}"]`)?.content ?? "").trim();
}

export function establishLocalPreviewIdentity(expectedAppId, options = {}) {
  if (typeof document !== "undefined") document.documentElement.dataset.erpAppId = expectedAppId;
  if (typeof window === "undefined" || typeof fetch !== "function") return () => {};

  const currentReleaseCommit = readDocumentMetaContent(RELEASE_COMMIT_META_NAME).toLowerCase();
  const intervalMs = Number(options.intervalMs) > 0
    ? Number(options.intervalMs)
    : import.meta.env.DEV ? 2_000 : 30_000;
  let stopped = false;
  let checking = false;

  const checkOriginIdentity = async () => {
    if (stopped || checking || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const response = await fetch(`/?erpIdentityCheck=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const html = await response.text();
      const actualAppId = readHtmlAppId(html);
      const actualReleaseCommit = readHtmlReleaseCommit(html);
      const appChanged = Boolean(actualAppId && actualAppId !== expectedAppId);
      const releaseChanged = Boolean(
        currentReleaseCommit &&
        actualReleaseCommit &&
        actualReleaseCommit !== currentReleaseCommit
      );
      if (appChanged || releaseChanged) window.location.reload();
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
  const stop = () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("pageshow", checkVisibleOrigin);
    window.removeEventListener("focus", checkVisibleOrigin);
    document.removeEventListener("visibilitychange", checkVisibleOrigin);
  };
  window.addEventListener("pageshow", checkVisibleOrigin);
  window.addEventListener("focus", checkVisibleOrigin);
  document.addEventListener("visibilitychange", checkVisibleOrigin);
  window.addEventListener("pagehide", stop, { once: true });
  void checkOriginIdentity();
  return stop;
}

export {
  APP_ID_META_NAME,
  RELEASE_COMMIT_META_NAME,
  readHtmlAppId,
  readHtmlMetaContent,
  readHtmlReleaseCommit,
};
