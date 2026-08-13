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
  const [rootIndex, rootPackage, rootVite, reviewIndex, reviewPackage, reviewVite] = await Promise.all([
    read(new URL("index.html", rootUrl)),
    read(new URL("package.json", rootUrl)),
    read(new URL("vite.config.mjs", rootUrl)),
    read(new URL("index.html", reviewUrl)),
    read(new URL("package.json", reviewUrl)),
    read(new URL("vite.config.mjs", reviewUrl)),
  ]);

  const checks = [
    [rootIndex.includes(`content="${ROOT_WORKBENCH_APP_ID}"`), "root workbench app identity is missing"],
    [reviewIndex.includes(`content="${COMPLETE_REVIEW_APP_ID}"`), "complete review app identity is missing"],
    [rootPackage.includes(`--port ${ROOT_WORKBENCH_PORT} --strictPort`), "root dev command must be fixed to port 5173"],
    [reviewPackage.includes(`--port ${COMPLETE_REVIEW_PORT} --strictPort`), "complete review dev command must be fixed to port 4174"],
    [rootVite.includes("ERP_COMPLETE_REVIEW_PORT_RESERVED"), "root Vite config must reject the reserved review port"],
    [reviewVite.includes("ERP_COMPLETE_REVIEW_PORT_REQUIRED"), "review Vite config must reject any non-4174 port"],
  ];
  const failed = checks.filter(([passed]) => !passed).map(([, message]) => message);
  if (failed.length) throw new Error(`Complete review preview identity is invalid: ${failed.join("; ")}`);

  return { appId: COMPLETE_REVIEW_APP_ID, port: COMPLETE_REVIEW_PORT, rootWorkbenchPort: ROOT_WORKBENCH_PORT };
}

export function readMetaAppId(html = "") {
  const nameFirst = String(html).match(/<meta[^>]+name=["']erp-app-id["'][^>]+content=["']([^"']+)["']/i);
  const contentFirst = String(html).match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']erp-app-id["']/i);
  return nameFirst?.[1] || contentFirst?.[1] || "";
}
