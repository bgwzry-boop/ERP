const APP_ID_META_NAME = "erp-app-id";

function readHtmlAppId(html = "") {
  const escapedName = APP_ID_META_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameFirst = new RegExp(`<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']+)["']`, "i");
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedName}["']`, "i");
  return String(html).match(nameFirst)?.[1] || String(html).match(contentFirst)?.[1] || "";
}

export function establishLocalPreviewIdentity(expectedAppId, options = {}) {
  if (typeof document !== "undefined") document.documentElement.dataset.erpAppId = expectedAppId;
  if (!import.meta.env.DEV || typeof window === "undefined" || typeof fetch !== "function") return () => {};

  const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 2_000;
  let stopped = false;
  let checking = false;

  const checkOriginIdentity = async () => {
    if (stopped || checking || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const response = await fetch(`/?erpIdentityCheck=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const actualAppId = readHtmlAppId(await response.text());
      if (actualAppId && actualAppId !== expectedAppId) window.location.reload();
    } catch {
      // A local server can be briefly unavailable during restart. The next interval retries.
    } finally {
      checking = false;
    }
  };

  const timer = window.setInterval(checkOriginIdentity, intervalMs);
  const stop = () => {
    stopped = true;
    window.clearInterval(timer);
  };
  window.addEventListener("pagehide", stop, { once: true });
  return stop;
}

export { APP_ID_META_NAME, readHtmlAppId };
