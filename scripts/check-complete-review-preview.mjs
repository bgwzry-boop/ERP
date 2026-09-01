import {
  COMPLETE_REVIEW_APP_ID,
  assertCompleteReviewStaticIdentity,
  readMetaAppId,
} from "./completeReviewPreviewIdentity.mjs";

const frontendBaseUrl = String(process.env.ERP_COMPLETE_REVIEW_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const apiHealthUrl = String(process.env.ERP_COMPLETE_REVIEW_API_HEALTH_URL || "http://127.0.0.1:8787/api/health");

async function fetchResource(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}identityCheck=${Date.now()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { response, text: await response.text() };
}

async function fetchText(url) {
  return (await fetchResource(url)).text;
}

function assertBootstrapHeaders(resource, label) {
  const cacheControl = String(resource.response.headers.get("cache-control") || "").toLowerCase();
  const appId = String(resource.response.headers.get("x-erp-app-id") || "");
  if (!cacheControl.includes("no-store")) throw new Error(`${label} must disable browser caching`);
  if (appId !== COMPLETE_REVIEW_APP_ID) throw new Error(`${label} must expose the complete review app identity`);
  const previewKind = String(resource.response.headers.get("x-erp-preview-kind") || "");
  const previewState = String(resource.response.headers.get("x-erp-preview-state") || "");
  if (previewKind !== "local-unreleased") throw new Error(`${label} must identify itself as a local unreleased preview`);
  if (!/^[a-f0-9]{64}$/.test(previewState)) throw new Error(`${label} must expose one complete local source-state digest`);
}

await assertCompleteReviewStaticIdentity();

const [htmlResource, navigationSource, appSource, legacyEntryResource, reviewEntryResource, apiResponse] = await Promise.all([
  fetchResource(`${frontendBaseUrl}/`),
  fetchText(`${frontendBaseUrl}/src/navigation.js`),
  fetchText(`${frontendBaseUrl}/src/App.jsx`),
  fetchResource(`${frontendBaseUrl}/src/main.jsx`),
  fetchResource(`${frontendBaseUrl}/src/complete-review-entry.jsx`),
  fetch(apiHealthUrl, { cache: "no-store", headers: { "cache-control": "no-cache" } }),
]);
const html = htmlResource.text;

assertBootstrapHeaders(htmlResource, "complete review HTML");
assertBootstrapHeaders(legacyEntryResource, "legacy compatibility bootstrap");
assertBootstrapHeaders(reviewEntryResource, "namespaced review bootstrap");

const actualAppId = readMetaAppId(html);
if (actualAppId !== COMPLETE_REVIEW_APP_ID) {
  throw new Error(`Wrong app on ${frontendBaseUrl}: expected ${COMPLETE_REVIEW_APP_ID}, received ${actualAppId || "no app identity"}`);
}
if (!html.includes("袋袋赢 ERP 完整评审稿")) throw new Error("Complete review title is missing");
if (!html.includes('/src/complete-review-entry.jsx')) throw new Error("Complete review HTML is not using its namespaced bootstrap entry");
if (!html.includes('name="erp-preview-kind" content="local-unreleased"')) throw new Error("Complete review HTML lacks its local unreleased marker");
if (!/name="erp-preview-state" content="[a-f0-9]{64}"/.test(html)) throw new Error("Complete review HTML lacks its local source-state digest");
if (!legacyEntryResource.text.includes("complete-review-entry.jsx")) throw new Error("Legacy shared bootstrap does not recover into the review entry");
if (!reviewEntryResource.text.includes(`establishLocalPreviewIdentity(\"${COMPLETE_REVIEW_APP_ID}\")`)) throw new Error("Namespaced review bootstrap lacks its fail-closed identity guard");

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
if (!appSource.includes("RawMaterialSupplierColorMappingDialog")) throw new Error("Complete review supplier color maintenance entry is missing");
if (!appSource.includes("master_data.raw_material_color.manage")) throw new Error("Complete review supplier color maintenance permission guard is missing");

if (!apiResponse.ok) throw new Error(`${apiHealthUrl} returned HTTP ${apiResponse.status}`);
const apiHealth = await apiResponse.json();
if (apiHealth?.status !== "ok") throw new Error(`ERP API health is not ok: ${JSON.stringify(apiHealth)}`);

console.log(`PASS complete review live preview: ${COMPLETE_REVIEW_APP_ID}; navigation verified; API ${apiHealth.status}`);
