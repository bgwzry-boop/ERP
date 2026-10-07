import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fulfillmentPageSource = readFileSync(new URL("../src/features/fulfillment/FulfillmentPage.jsx", import.meta.url), "utf8");
const pageRegistrySource = readFileSync(new URL("../src/app/pageRegistry.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");

assert.match(fulfillmentPageSource, /export function FulfillmentPage/);
assert.match(fulfillmentPageSource, /ariaLabel="出库交付筛选"/);
assert.match(fulfillmentPageSource, /aria-label="出库交付关键词"/);
assert.match(fulfillmentPageSource, /aria-label="交付状态快捷筛选"/);
assert.match(fulfillmentPageSource, /function fulfillmentMatchesQuery/);
assert.match(fulfillmentPageSource, /function fulfillmentMatchesView/);
assert.match(fulfillmentPageSource, /className="fulfillment-detail-scroll"/);
assert.match(fulfillmentPageSource, /className="fulfillment-detail-overview"/);
assert.match(fulfillmentPageSource, /className="[^"]*fulfillment-detail-actions[^"]*"/);
assert.doesNotMatch(fulfillmentPageSource, /<MetricStrip/);
assert.match(fulfillmentPageSource, /送达证据复核/);
assert.match(fulfillmentPageSource, /证据复核通过/);
assert.match(fulfillmentPageSource, /退回重拍/);
assert.match(fulfillmentPageSource, /formatFulfillmentDispatchSummary/);
assert.match(fulfillmentPageSource, /待纸单/, "paper-led fulfillment states must be visible in the desktop workbench");
assert.match(fulfillmentPageSource, /纸质出库单/, "the detail pane must expose paper document state");
for (const label of ["确认数量差异处理", "纸单数量 / 实际数量", "处理结果", "处理说明", "业务决定人", "系统操作人", "决定渠道 / 时间", "决定内容", "授权依据", "预计影响"]) {
  assert.equal(fulfillmentPageSource.includes(label), true, `fulfillment variance confirmation should retain ${label}`);
}
assert.match(fulfillmentPageSource, /formatBusinessDecisionChannelAndTime/);
assert.match(officePageSource, /export \{ FulfillmentPage \} from "\.\.\/\.\.\/features\/fulfillment\/FulfillmentPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function FulfillmentPage/);
assert.match(pageRegistrySource, /fulfillment: \(props\) => createElement\(FulfillmentPage, props\.fulfillment\)/);
assert.match(appSource, /renderRegisteredPage\(renderedPage/);
assert.doesNotMatch(appSource, /<FulfillmentPage/);

console.log("Office fulfillment page check passed: the feature is isolated and delivery-evidence review remains intact.");
