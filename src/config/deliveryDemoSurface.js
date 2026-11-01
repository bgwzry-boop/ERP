export const DELIVERY_DEMO_BANNER_ID = "erp-internal-workbench-delivery-guard";
export const DELIVERY_DEMO_BANNER_TEXT = "内部工作台 · 非测试站壳 · 禁止当交付演示";
export const STAGING_DELIVERY_ORIGIN = "https://erp-staging.luxingpack.com";
export const COMPLETE_REVIEW_DELIVERY_PORT = 4174;
export const ROOT_WORKBENCH_PORT = 5173;
export const INTERNAL_WORKBENCH_MARKER = "internalWorkbench=1";

const LOCAL_REVIEW_HOSTS = new Set(["127.0.0.1", "localhost"]);
const TITLE_PREFIX = "内部工作台 · 禁止当交付演示";

function portOf(url) {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

export function classifyDeliveryDemoUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { allowed: false, reason: "empty" };
  if (raw.includes(INTERNAL_WORKBENCH_MARKER)) return { allowed: false, reason: "internal-workbench" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reason: "unparseable" };
  }
  if (url.searchParams.get("internalWorkbench") === "1") return { allowed: false, reason: "internal-workbench" };
  if (url.origin === STAGING_DELIVERY_ORIGIN) return { allowed: true, reason: "staging" };
  const port = portOf(url);
  if (port === ROOT_WORKBENCH_PORT) return { allowed: false, reason: "root-workbench-port" };
  if (LOCAL_REVIEW_HOSTS.has(url.hostname) && port === COMPLETE_REVIEW_DELIVERY_PORT) {
    return { allowed: true, reason: "complete-review" };
  }
  return { allowed: false, reason: "unknown-surface" };
}

export function isAllowedOwnerDeliveryUrl(value) {
  return classifyDeliveryDemoUrl(value).allowed === true;
}

export function assertOwnerDeliveryUrl(value) {
  const verdict = classifyDeliveryDemoUrl(value);
  if (verdict.allowed) return verdict;
  const error = new Error(`拒绝把该地址当作交付演示（${verdict.reason}）：${value}`);
  error.code = "ERP_DELIVERY_DEMO_SURFACE_FORBIDDEN";
  throw error;
}

export function locationUsesInternalWorkbench(locationLike) {
  const href = typeof locationLike === "string" ? locationLike : locationLike?.href;
  const search = typeof locationLike === "string" ? "" : locationLike?.search;
  if (String(href || "").includes(INTERNAL_WORKBENCH_MARKER) || String(search || "").includes(INTERNAL_WORKBENCH_MARKER)) {
    return true;
  }
  try {
    return new URL(String(href || ""), "http://127.0.0.1").searchParams.get("internalWorkbench") === "1";
  } catch {
    return false;
  }
}

export function mountInternalWorkbenchDeliveryGuard(doc = globalThis.document, win = globalThis.window) {
  if (!doc?.body || !win) return false;
  if (!locationUsesInternalWorkbench(win.location)) return false;
  doc.documentElement.dataset.erpDeliverySurface = "internal-workbench";
  if (doc.title && !String(doc.title).startsWith(TITLE_PREFIX)) {
    doc.title = `${TITLE_PREFIX} · ${doc.title}`;
  }
  if (doc.getElementById(DELIVERY_DEMO_BANNER_ID)) return true;
  const banner = doc.createElement("div");
  banner.id = DELIVERY_DEMO_BANNER_ID;
  banner.setAttribute("role", "status");
  banner.setAttribute("data-delivery-surface", "forbidden");
  banner.textContent = DELIVERY_DEMO_BANNER_TEXT;
  doc.body.prepend(banner);
  return true;
}

export function installInternalWorkbenchDeliveryGuard(doc = globalThis.document, win = globalThis.window) {
  const apply = () => mountInternalWorkbenchDeliveryGuard(doc, win);
  apply();
  win?.addEventListener?.("pageshow", apply);
  return apply;
}
