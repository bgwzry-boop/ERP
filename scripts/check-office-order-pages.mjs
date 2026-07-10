import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entryPageSource = readFileSync(new URL("../src/features/orders/EntryPage.jsx", import.meta.url), "utf8");
const orderPoolPageSource = readFileSync(new URL("../src/features/orders/OrderPoolPage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");

assert.match(entryPageSource, /export function EntryPage/);
assert.match(entryPageSource, /function EntryDraftTable/);
assert.match(entryPageSource, /印刷颜色/);
assert.match(entryPageSource, /提手颜色/);
assert.match(entryPageSource, /缺字段检查/);
assert.match(orderPoolPageSource, /export function OrderPoolPage/);
assert.match(orderPoolPageSource, /getOrderLineMutationBlocker/);
assert.match(orderPoolPageSource, /定位出库/);
assert.match(orderPoolPageSource, /定位对账/);
assert.match(officePageSource, /export \{ EntryPage \} from "\.\.\/\.\.\/features\/orders\/EntryPage\.jsx";/);
assert.match(officePageSource, /export \{ OrderPoolPage \} from "\.\.\/\.\.\/features\/orders\/OrderPoolPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function EntryPage/);
assert.doesNotMatch(officePageSource, /function OrderPoolPage/);

console.log("Office order pages check passed: entry and order-pool features are isolated with editing and mutation safeguards intact.");
