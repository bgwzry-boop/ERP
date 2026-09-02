import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entryPageSource = readFileSync(new URL("../src/features/orders/EntryPage.jsx", import.meta.url), "utf8");
const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
const orderPoolPageSource = readFileSync(new URL("../src/features/orders/OrderPoolPage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const entryStyleSource = readFileSync(new URL("../src/styles/features/orders-entry.css", import.meta.url), "utf8");
const roleToolStyleSource = readFileSync(new URL("../src/styles/features/role-tools.css", import.meta.url), "utf8");

assert.match(entryPageSource, /export function EntryPage/);
assert.match(entryPageSource, /识别入队/);
assert.match(entryPageSource, /entry-capture-more/);
assert.match(entryPageSource, /更多操作/);
assert.match(entryPageSource, /草稿队列/);
assert.match(entryPageSource, /item\.kind === "order_draft"/);
assert.match(entryPageSource, /function EntryDraftTable/);
assert.match(entryPageSource, /印刷颜色/);
assert.match(entryPageSource, /提手颜色/);
assert.match(entryPageSource, /缺字段检查/);
assert.match(entryPageSource, /window\.confirm\("确认删除当前明细行/);
assert.match(entryPageSource, /onEntryTextChange\(event\.target\.value\)/);
assert.match(appSource, /onEntryTextChange=\{updateOrderEntryText\}/);
assert.match(entryPageSource, /aria-label="订单汇总与确认"/);
assert.match(entryPageSource, /window\.confirm\("确认客户已经恢复订购该明细/);
assert.match(entryPageSource, /onRestoreCancelledLine\(selected\.id\)/);
assert.match(entryPageSource, />恢复订购<\/button>/);
assert.match(entryPageSource, /onQueueCancellationLink/);
assert.match(entryPageSource, /确认将这条取消消息关联到当前选中明细/);
assert.match(entryPageSource, />关联到当前行<\/button>/);
assert.match(entryPageSource, /selected\?\.customerId === cancellationCustomerId/);
assert.match(entryPageSource, /new Set\(draftRows\.map/);
assert.match(entryPageSource, /data-draft-id=\{row\.id\}/);
assert.match(entryPageSource, /aria-controls=\{getEntryDraftRowDomId\(issue\.rowIndex\)\}/);
assert.match(entryPageSource, /onFocus=\{\(\) => onSelect\(row\.id\)\}/);
assert.match(entryPageSource, /entry-select-arrow/);
assert.match(entryPageSource, /scrollIntoView/);
assert.match(entryPageSource, /本次订单客户/);
assert.match(entryPageSource, /整张草稿归属一个客户/);
assert.match(entryPageSource, /不同客户必须拆成独立草稿/);
assert.match(entryPageSource, /拆单预览/);
assert.match(entryPageSource, /splitPlanHash/);
assert.match(entryPageSource, /确认生成.*张订单/);
assert.doesNotMatch(entryPageSource, /const columns = \["序号", "客户"/);
assert.doesNotMatch(mainSource, /styles\/features\/orders-entry\.css/, "order-entry styles should not load with the shell");
assert.match(appSource, /import\("\.\.\/styles\/features\/orders-entry\.css"\)/, "order-entry styles should load with the entry route");
for (const selector of [".entry-actions button", ".entry-table .data-row", ".entry-edit-row", "::-webkit-inner-spin-button"]) {
  assert.equal(entryStyleSource.includes(selector), true, `order-entry feature styles should own ${selector}`);
}
assert.match(entryStyleSource, /@media \(max-width: 1040px\)[\s\S]*?\.entry-confirm-footer \{[\s\S]*?position: fixed;/);
assert.match(entryStyleSource, /@media \(max-width: 720px\)[\s\S]*?\.entry-workbench \{[\s\S]*?padding-bottom: 148px;/);
assert.match(entryStyleSource, /\.entry-table \.entry-edit-row:focus-within/);
for (const selector of [".entry-actions", ".entry-table", ".entry-edit-row"]) {
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.match(roleToolStyleSource, /\.toolbar-focus-hint/);
assert.doesNotMatch(sharedStyleSource, /\.toolbar-focus-hint/);
for (const deadSelector of [".footer-actions", ".filter-summary", ".panel-warning", ".entry-detail-grid"]) {
  assert.equal(sharedStyleSource.includes(deadSelector), false, `shared styles should not retain unused ${deadSelector}`);
}
assert.match(sharedStyleSource, /\.filter-grid/);
assert.match(sharedStyleSource, /\.data-row\.active/);
assert.match(orderPoolPageSource, /export function OrderPoolPage/);
assert.match(orderPoolPageSource, /getOrderLineMutationBlocker/);
assert.match(orderPoolPageSource, /定位出库/);
assert.match(orderPoolPageSource, /定位对账/);
assert.match(orderPoolPageSource, /订单状态快捷筛选/);
assert.match(orderPoolPageSource, /aria-label="订单池关键词"/);
assert.match(orderPoolPageSource, /function orderMatchesQuery/);
assert.match(orderPoolPageSource, /className="order-pool-detail-overview"/);
assert.match(orderPoolPageSource, /className="order-pool-detail-scroll"/);
assert.match(orderPoolPageSource, /aria-label="复制订单摘要"/);
assert.doesNotMatch(orderPoolPageSource, /<MetricStrip/);
assert.match(officePageSource, /export \{ EntryPage \} from "\.\.\/\.\.\/features\/orders\/EntryPage\.jsx";/);
assert.match(officePageSource, /export \{ OrderPoolPage \} from "\.\.\/\.\.\/features\/orders\/OrderPoolPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function EntryPage/);
assert.doesNotMatch(officePageSource, /function OrderPoolPage/);

console.log("Office order pages check passed: entry/order-pool behavior and styles are isolated with shared table safeguards intact.");
