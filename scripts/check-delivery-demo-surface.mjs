import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPLETE_REVIEW_DELIVERY_PORT,
  DELIVERY_DEMO_BANNER_ID,
  DELIVERY_DEMO_BANNER_TEXT,
  INTERNAL_WORKBENCH_MARKER,
  ROOT_WORKBENCH_PORT,
  STAGING_DELIVERY_ORIGIN,
  assertOwnerDeliveryUrl,
  classifyDeliveryDemoUrl,
  installInternalWorkbenchDeliveryGuard,
} from "../src/config/deliveryDemoSurface.js";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const releasePolicy = JSON.parse(read("deploy/release-policy.json"));
const agents = read("AGENTS.md");
const decisions = read("DECISIONS.md");
const chineseStatus = read("01_当前状态与下一步.md");
const projectStatus = read("PROJECT_STATUS.md");
const mainSource = read("src/main.jsx");
const shellCss = read("src/styles/shell.css");
const viteSource = read("vite.config.mjs");
const surfaceSource = read("src/config/deliveryDemoSurface.js");
const inboundSource = read("src/features/raw-materials/OfficeInboundFlow.jsx");

assert.equal(STAGING_DELIVERY_ORIGIN, new URL(releasePolicy.stagingUrl).origin);
assert.equal(releasePolicy.previewAppId, "bagwin-complete-review-4174");
assert.equal(COMPLETE_REVIEW_DELIVERY_PORT, 4174);
assert.equal(ROOT_WORKBENCH_PORT, 5173);

for (const source of [agents, decisions, chineseStatus, projectStatus]) {
  assert.match(source, /2026-11-01/);
  assert.ok(source.includes(DELIVERY_DEMO_BANNER_TEXT), "owner-facing docs must keep the internal-workbench delivery banner");
  assert.ok(source.includes(INTERNAL_WORKBENCH_MARKER), "owner-facing docs must keep the forbidden internal-workbench marker");
  assert.ok(source.includes("4174"), "owner-facing docs must keep the complete-review port");
}

assert.match(agents, /Walkthrough screenshots, videos, and PR demo evidence/);
assert.ok(agents.includes(STAGING_DELIVERY_ORIGIN));
assert.match(agents, /npm run review:dev/);
assert.match(agents, /must not attach those frames as walkthrough artifacts/);
assert.match(agents, /FormalReceiving/);

assert.match(mainSource, /installInternalWorkbenchDeliveryGuard\(\)/);
assert.match(shellCss, new RegExp(`#${DELIVERY_DEMO_BANNER_ID}`));
assert.match(shellCss, /pointer-events:\s*none/);
assert.match(shellCss, /data-erp-delivery-surface="internal-workbench"/);
assert.doesNotMatch(surfaceSource, /<button|dismiss|关闭/);
assert.match(surfaceSource, /textContent = DELIVERY_DEMO_BANNER_TEXT/);

assert.match(viteSource, /ERP_INTERNAL_WORKBENCH_EXPLICIT_ACCESS_REQUIRED/);
assert.match(viteSource, /searchParams\.get\("internalWorkbench"\) === "1"/);
assert.match(viteSource, /http:\/\/127\.0\.0\.1:4174\/\?source=review-guard/);
assert.match(inboundSource, /export function OfficeInboundFlow/);

const allowed = [
  "https://erp-staging.luxingpack.com/?erpViewport=desktop#material-receiving",
  "https://erp-staging.luxingpack.com/",
  "http://127.0.0.1:4174/#material-receiving",
  "http://localhost:4174/?erpViewport=desktop#material-receiving",
  "http://127.0.0.1:4174/?source=review-guard",
];
for (const url of allowed) {
  assert.equal(classifyDeliveryDemoUrl(url).allowed, true, url);
  assert.equal(assertOwnerDeliveryUrl(url).allowed, true, url);
}

const forbidden = [
  "http://127.0.0.1:5173/?internalWorkbench=1",
  "http://localhost:5173/?internalWorkbench=1",
  "http://127.0.0.1:5173/",
  "http://127.0.0.1:4174/?internalWorkbench=1#material-receiving",
  "https://erp-staging.luxingpack.com/?internalWorkbench=1",
  "/?internalWorkbench=1",
  "",
];
for (const url of forbidden) {
  const verdict = classifyDeliveryDemoUrl(url);
  assert.equal(verdict.allowed, false, `${url} -> ${verdict.reason}`);
  assert.throws(() => assertOwnerDeliveryUrl(url), /ERP_DELIVERY_DEMO_SURFACE_FORBIDDEN|拒绝把该地址当作交付演示/);
}
assert.equal(classifyDeliveryDemoUrl("http://127.0.0.1:5173/?internalWorkbench=1").reason, "internal-workbench");

function createDocument() {
  const nodes = new Map();
  return {
    title: "ERP Production Board",
    documentElement: { dataset: {} },
    body: {
      prepend(node) {
        nodes.set(node.id, node);
      },
    },
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
    createElement() {
      return {
        id: "",
        textContent: "",
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
    },
    nodes,
  };
}

const internalDocument = createDocument();
let pageShowListener = null;
const internalWindow = {
  location: {
    href: "http://127.0.0.1:5173/?internalWorkbench=1",
    search: "?internalWorkbench=1",
  },
  addEventListener(type, listener) {
    if (type === "pageshow") pageShowListener = listener;
  },
};
installInternalWorkbenchDeliveryGuard(internalDocument, internalWindow);
assert.equal(typeof pageShowListener, "function");
assert.equal(internalDocument.documentElement.dataset.erpDeliverySurface, "internal-workbench");
assert.equal(internalDocument.title, `内部工作台 · 禁止当交付演示 · ERP Production Board`);
const banner = internalDocument.getElementById(DELIVERY_DEMO_BANNER_ID);
assert.equal(banner.textContent, DELIVERY_DEMO_BANNER_TEXT);
assert.equal(banner.attributes.role, "status");
assert.equal(banner.attributes["data-delivery-surface"], "forbidden");
assert.equal(internalDocument.nodes.size, 1);
pageShowListener();
installInternalWorkbenchDeliveryGuard(internalDocument, internalWindow);
assert.equal(internalDocument.nodes.size, 1, "the delivery banner is not dismissible and must not be duplicated");

const plainDocument = createDocument();
installInternalWorkbenchDeliveryGuard(plainDocument, {
  location: { href: "http://127.0.0.1:4174/#material-receiving", search: "" },
  addEventListener() {},
});
assert.equal(plainDocument.nodes.size, 0);
assert.equal(plainDocument.documentElement.dataset.erpDeliverySurface, undefined);

console.log("PASS delivery demo surface: staging and 4174 only; internalWorkbench=1 stays marked and is rejected as owner evidence");
