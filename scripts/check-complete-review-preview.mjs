import {
  COMPLETE_REVIEW_APP_ID,
  assertCompleteReviewStaticIdentity,
  readMetaAppId,
} from "./completeReviewPreviewIdentity.mjs";

const frontendBaseUrl = String(process.env.ERP_COMPLETE_REVIEW_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const apiHealthUrl = String(process.env.ERP_COMPLETE_REVIEW_API_HEALTH_URL || "http://127.0.0.1:8787/api/health");

async function fetchText(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}identityCheck=${Date.now()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

await assertCompleteReviewStaticIdentity();

const [html, navigationSource, appSource, apiResponse] = await Promise.all([
  fetchText(`${frontendBaseUrl}/`),
  fetchText(`${frontendBaseUrl}/src/navigation.js`),
  fetchText(`${frontendBaseUrl}/src/App.jsx`),
  fetch(apiHealthUrl, { cache: "no-store", headers: { "cache-control": "no-cache" } }),
]);

const actualAppId = readMetaAppId(html);
if (actualAppId !== COMPLETE_REVIEW_APP_ID) {
  throw new Error(`Wrong app on ${frontendBaseUrl}: expected ${COMPLETE_REVIEW_APP_ID}, received ${actualAppId || "no app identity"}`);
}
if (!html.includes("袋袋赢 ERP 完整评审稿")) throw new Error("Complete review title is missing");

for (const marker of [
  "工作台",
  "订单管理",
  "原料管理",
  "生产交付",
  "库存管理",
  "财务管理",
  "基础资料",
  "系统管理",
  "payroll-attendance",
]) {
  if (!navigationSource.includes(marker)) throw new Error(`Complete review navigation marker is missing: ${marker}`);
}
if (!appSource.includes("pc-business-tree")) throw new Error("Complete review desktop shell marker is missing");

if (!apiResponse.ok) throw new Error(`${apiHealthUrl} returned HTTP ${apiResponse.status}`);
const apiHealth = await apiResponse.json();
if (apiHealth?.status !== "ok") throw new Error(`ERP API health is not ok: ${JSON.stringify(apiHealth)}`);

console.log(`PASS complete review live preview: ${COMPLETE_REVIEW_APP_ID}; navigation verified; API ${apiHealth.status}`);
