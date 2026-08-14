import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fulfillmentMethodLabel,
  getBusinessTypeTagValue,
  getFulfillmentMethodLabel,
  getFulfillmentMethodValue,
  getOperationalStateTagValue,
  getRequirementTagValue,
  getSemanticTagDefinition,
  getStructuredRequirementTagValues,
  labelOf,
  semanticTagCatalog,
} from "../src/shared/labels.js";

assert.deepEqual(fulfillmentMethodLabel, {
  pickup: "自提",
  delivery: "送货",
  express_ltl: "快递快运",
});
assert.equal(labelOf(fulfillmentMethodLabel, "delivery"), "送货");
assert.equal(labelOf(fulfillmentMethodLabel, "unknown"), "待确认");
assert.equal(getFulfillmentMethodLabel("pickup"), "自提");
assert.equal(getFulfillmentMethodLabel("快递快运"), "快递快运");
assert.equal(getFulfillmentMethodValue("送货"), "delivery");
assert.equal(getFulfillmentMethodValue("express_ltl"), "express_ltl");

assert.equal(semanticTagCatalog.business.custom.label, "定制单");
assert.equal(semanticTagCatalog.requirement["extended-handle"].label, "加长提");
assert.equal(semanticTagCatalog.state.blocked.label, "异常暂停");
assert.equal(semanticTagCatalog.owner["lane-3"].label, "制3-01");
assert.deepEqual(getSemanticTagDefinition("state", "running"), {
  kind: "state",
  value: "running",
  label: "生产中",
  known: true,
});
assert.deepEqual(getSemanticTagDefinition("business", "unrecognized"), {
  kind: "business",
  value: "unknown",
  label: "待确认",
  known: false,
});
assert.equal(getBusinessTypeTagValue("定制印刷"), "custom");
assert.equal(getBusinessTypeTagValue("外加工印刷"), "outsourced");
assert.equal(getBusinessTypeTagValue("纯色通货"), "stock");
assert.equal(getBusinessTypeTagValue("纯色通货袋"), "stock");
assert.equal(getBusinessTypeTagValue("印刷通货袋"), "printed");
assert.equal(getBusinessTypeTagValue("临时类型"), "unknown");
assert.equal(getOperationalStateTagValue("制袋中"), "running");
assert.equal(getOperationalStateTagValue("跨日继续"), "carry");
assert.equal(getOperationalStateTagValue("异常暂停"), "blocked");
assert.equal(getOperationalStateTagValue("临时状态"), "unknown");
assert.equal(getRequirementTagValue("双面"), "double-sided");
assert.deepEqual(
  getStructuredRequirementTagValues({
    handle: "加长提",
    printSide: "双面",
    materialSource: "customer_supplied",
    priority: "加急",
    printColors: ["红", "白"],
  }),
  ["extended-handle", "supplied-material", "double-sided", "urgent", "dual-color"],
);
assert.deepEqual(
  getStructuredRequirementTagValues({ note: "客户说加长提并加急" }),
  [],
  "semantic requirements must come from structured fields instead of prose parsing",
);

const operationalUiSource = readFileSync(new URL("../src/shared/ui/operational.jsx", import.meta.url), "utf8");
const semanticTagStyles = readFileSync(new URL("../src/styles/semantic-tags.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const orderPoolSource = readFileSync(new URL("../src/features/orders/OrderPoolPage.jsx", import.meta.url), "utf8");
const workshopMobileSource = readFileSync(new URL("../src/features/workshop/WorkshopMobilePage.jsx", import.meta.url), "utf8");
const televisionSource = readFileSync(new URL("../docs/prototypes/production-tv-flow-atlas/app.js", import.meta.url), "utf8");

assert.match(operationalUiSource, /export function SemanticTag\(/);
assert.match(operationalUiSource, /data-kind=\{definition\.kind\}/);
assert.match(operationalUiSource, /definition\.known \? label \?\? definition\.label : definition\.label/);
assert.match(operationalUiSource, /export function StatusPill\(/);
assert.match(operationalUiSource, /legacyStatusToneValues/);
assert.match(mainSource, /import "\.\/styles\/semantic-tags\.css";/);
assert.match(semanticTagStyles, /\[data-kind="business"\]\[data-value="custom"\]/);
assert.match(semanticTagStyles, /\[data-kind="state"\]\[data-value="blocked"\]/);
assert.match(semanticTagStyles, /\[data-kind="owner"\]::before/);
assert.doesNotMatch(semanticTagStyles, /#[0-9a-f]{3,8}\b/i);
assert.match(orderPoolSource, /<SemanticTag kind="business"/);
assert.match(orderPoolSource, /getOperationalStateTagValue/);
assert.match(workshopMobileSource, /function WorkshopTaskTagGroup/);
assert.match(workshopMobileSource, /getStructuredRequirementTagValues/);
assert.match(televisionSource, /data-kind="business"/);
assert.match(televisionSource, /semanticTagContract/);

console.log("Shared label check passed: fulfillment and four-class semantic tags use stable values, neutral fallbacks, shared styles, and first-wave cross-surface adoption.");
