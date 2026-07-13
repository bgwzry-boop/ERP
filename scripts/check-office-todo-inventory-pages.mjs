import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const todoPageSource = readFileSync(new URL("../src/features/todos/TodoPage.jsx", import.meta.url), "utf8");
const inventoryPageSource = readFileSync(new URL("../src/features/inventory/InventoryPage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const todoStyleSource = readFileSync(new URL("../src/styles/features/todos.css", import.meta.url), "utf8");

assert.match(todoPageSource, /export function TodoPage/);
assert.match(todoPageSource, /公共待办池/);
assert.match(todoPageSource, /客户通知/);
assert.match(todoPageSource, /批量打印标签/);
assert.match(todoPageSource, /getPrintBatchRecordsForTodo/);
assert.match(todoPageSource, /业务引用/);
assert.match(todoPageSource, /referenceStatus === "missing"/);
assert.match(todoPageSource, /重新关联业务/);
assert.match(todoPageSource, /验证并重新关联/);
assert.match(todoPageSource, /referenceCandidates/);
assert.match(todoStyleSource, /\.todo-reference-repair/);
assert.match(mainSource, /import "\.\/styles\/features\/todos\.css";/);
assert.equal(
  mainSource.indexOf('import "./styles/components.css";') < mainSource.indexOf('import "./styles/features/todos.css";'),
  true,
  "todo styles should load after shared components",
);
for (const selector of [".todo-list", ".todo-bulk-row", ".todo-row", ".todo-main", ".todo-side", ".todo-notification-card"]) {
  assert.equal(todoStyleSource.includes(selector), true, `todo feature styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.doesNotMatch(sharedStyleSource, /\.todo-head/);
assert.match(sharedStyleSource, /\.data-row\.active/);

assert.match(inventoryPageSource, /export function InventoryPage/);
assert.match(inventoryPageSource, /title="暂无库存记录"/);
assert.match(inventoryPageSource, /detail="请先导入并审核库存基础数据。"/);
assert.match(inventoryPageSource, /库存流水/);
assert.match(inventoryPageSource, /库存修正确认队列/);
assert.match(inventoryPageSource, /库存意图与临时留货/);
assert.match(inventoryPageSource, /询库存不占用；客户明确要求留货后才创建临时占用/);
assert.match(inventoryPageSource, /创建留货/);
assert.match(inventoryPageSource, /19:30后留货，确认未来到期时间/);
assert.match(inventoryPageSource, /19:30后新留货必须人工确认未来到期时间/);
assert.doesNotMatch(inventoryPageSource, /setHoldExpiryDrafts\(\(current\).*event\.currentTarget/);
assert.match(inventoryPageSource, /授权延长原因/);
assert.match(inventoryPageSource, /确认释放临时留货/);
assert.match(inventoryPageSource, /近似颜色\/尺寸只作参考；不能一键替代/);
assert.match(inventoryPageSource, /正式承诺客户前仍需重新校验/);
assert.equal((inventoryPageSource.match(/<span>差异原因<\/span>/g) ?? []).length, 1);

assert.match(officePageSource, /export \{ TodoPage \} from "\.\.\/\.\.\/features\/todos\/TodoPage\.jsx";/);
assert.match(officePageSource, /export \{ InventoryPage \} from "\.\.\/\.\.\/features\/inventory\/InventoryPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function TodoPage/);
assert.doesNotMatch(officePageSource, /function InventoryPage/);
assert.doesNotMatch(officePageSource, /function InventoryCorrectionDetail/);

console.log("Office todo/inventory pages check passed: Todo behavior/styles and Inventory behavior remain isolated with safety states visible.");
