import { readFile } from "node:fs/promises";

export const COMPLETE_REVIEW_APP_ID = "bagwin-complete-review-4174";
export const ROOT_WORKBENCH_APP_ID = "bagwin-formal-workbench-root";
export const COMPLETE_REVIEW_PORT = 4174;
export const ROOT_WORKBENCH_PORT = 5173;

const rootUrl = new URL("../", import.meta.url);
const reviewUrl = new URL("../docs/prototypes/raw-material-roll-inventory-review/", import.meta.url);

async function read(url) {
  return readFile(url, "utf8");
}

export async function assertCompleteReviewStaticIdentity() {
  const [rootIndex, rootPackage, rootVite, reviewIndex, reviewPackage, reviewVite, reviewEntry, reviewLegacyEntry] = await Promise.all([
    read(new URL("index.html", rootUrl)),
    read(new URL("package.json", rootUrl)),
    read(new URL("vite.config.mjs", rootUrl)),
    read(new URL("index.html", reviewUrl)),
    read(new URL("package.json", reviewUrl)),
    read(new URL("vite.config.mjs", reviewUrl)),
    read(new URL("src/complete-review-entry.jsx", reviewUrl)),
    read(new URL("src/main.jsx", reviewUrl)),
  ]);

  const checks = [
    [rootIndex.includes(`content="${ROOT_WORKBENCH_APP_ID}"`), "root workbench app identity is missing"],
    [reviewIndex.includes(`content="${COMPLETE_REVIEW_APP_ID}"`), "complete review app identity is missing"],
    [rootPackage.includes(`--port ${ROOT_WORKBENCH_PORT} --strictPort`), "root dev command must be fixed to port 5173"],
    [reviewPackage.includes(`--port ${COMPLETE_REVIEW_PORT} --strictPort`), "complete review dev command must be fixed to port 4174"],
    [rootVite.includes("ERP_COMPLETE_REVIEW_PORT_RESERVED"), "root Vite config must reject the reserved review port"],
    [rootVite.includes("ERP_INTERNAL_WORKBENCH_EXPLICIT_ACCESS_REQUIRED"), "bare root workbench navigation must redirect to the complete review app"],
    [rootVite.includes('searchParams.get("internalWorkbench") === "1"'), "internal root workbench access must require an explicit query marker"],
    [reviewVite.includes("ERP_COMPLETE_REVIEW_PORT_REQUIRED"), "review Vite config must reject any non-4174 port"],
    [reviewIndex.includes('/src/complete-review-entry.jsx'), "complete review HTML must use its namespaced bootstrap entry"],
    [reviewVite.includes('./src/complete-review-entry.jsx'), "complete review warmup must use its namespaced bootstrap entry"],
    [reviewVite.includes('no-store, no-cache, must-revalidate, max-age=0'), "complete review bootstrap responses must disable browser caching"],
    [reviewVite.includes('x-erp-app-id'), "complete review bootstrap responses must expose their app identity"],
    [reviewVite.includes('erp-preview-kind'), "local review HTML must declare that it is an unreleased preview"],
    [reviewVite.includes('erp-preview-state'), "local review HTML must carry a process/source identity token"],
    [reviewVite.includes('x-erp-preview-state'), "local review bootstrap responses must expose their source identity"],
    [reviewEntry.includes(`establishLocalPreviewIdentity("${COMPLETE_REVIEW_APP_ID}")`), "complete review bootstrap must fail closed on the review identity"],
    [reviewEntry.includes('本地修改稿 · 未部署'), "local review must visibly distinguish itself from a deployed release"],
    [reviewEntry.includes('declaredViewportFamily !== expectedViewportFamily'), "stale viewport-family URL markers must be corrected before rendering"],
    [reviewEntry.includes('detectCompleteReviewRuntimeFamily(window)'), "complete review routing must use real runtime-family detection"],
    [!reviewEntry.includes('matchMedia("(max-width: 767px)")'), "desktop review routing must never be selected by width alone"],
    [reviewLegacyEntry.includes('import "./complete-review-entry.jsx"'), "the legacy shared module URL must recover into the namespaced review bootstrap"],
  ];
  const failed = checks.filter(([passed]) => !passed).map(([, message]) => message);
  if (failed.length) throw new Error(`Complete review preview identity is invalid: ${failed.join("; ")}`);

  return {
    appId: COMPLETE_REVIEW_APP_ID,
    port: COMPLETE_REVIEW_PORT,
    rootWorkbenchPort: ROOT_WORKBENCH_PORT,
  };
}

export function readMetaAppId(html = "") {
  const nameFirst = String(html).match(/<meta[^>]+name=["']erp-app-id["'][^>]+content=["']([^"']+)["']/i);
  const contentFirst = String(html).match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']erp-app-id["']/i);
  return nameFirst?.[1] || contentFirst?.[1] || "";
}
