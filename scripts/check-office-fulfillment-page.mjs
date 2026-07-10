import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fulfillmentPageSource = readFileSync(new URL("../src/features/fulfillment/FulfillmentPage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");

assert.match(fulfillmentPageSource, /export function FulfillmentPage/);
assert.match(fulfillmentPageSource, /送达证据复核/);
assert.match(fulfillmentPageSource, /证据复核通过/);
assert.match(fulfillmentPageSource, /退回重拍/);
assert.match(fulfillmentPageSource, /formatFulfillmentDispatchSummary/);
assert.match(officePageSource, /export \{ FulfillmentPage \} from "\.\.\/\.\.\/features\/fulfillment\/FulfillmentPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function FulfillmentPage/);

console.log("Office fulfillment page check passed: the feature is isolated and delivery-evidence review remains intact.");
