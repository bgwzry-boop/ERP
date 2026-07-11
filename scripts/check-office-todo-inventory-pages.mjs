import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const todoPageSource = readFileSync(new URL("../src/features/todos/TodoPage.jsx", import.meta.url), "utf8");
const inventoryPageSource = readFileSync(new URL("../src/features/inventory/InventoryPage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");

assert.match(todoPageSource, /export function TodoPage/);
assert.match(todoPageSource, /公共待办池/);
assert.match(todoPageSource, /客户通知/);
assert.match(todoPageSource, /批量打印标签/);
assert.match(todoPageSource, /getPrintBatchRecordsForTodo/);

assert.match(inventoryPageSource, /export function InventoryPage/);
assert.match(inventoryPageSource, /title="暂无库存记录"/);
assert.match(inventoryPageSource, /detail="请先导入并审核库存基础数据。"/);
assert.match(inventoryPageSource, /库存流水/);
assert.match(inventoryPageSource, /库存修正确认队列/);
assert.match(inventoryPageSource, /近似颜色\/尺寸只作参考；不能一键替代/);
assert.match(inventoryPageSource, /正式承诺客户前仍需重新校验/);
assert.equal((inventoryPageSource.match(/<span>差异原因<\/span>/g) ?? []).length, 1);

assert.match(officePageSource, /export \{ TodoPage \} from "\.\.\/\.\.\/features\/todos\/TodoPage\.jsx";/);
assert.match(officePageSource, /export \{ InventoryPage \} from "\.\.\/\.\.\/features\/inventory\/InventoryPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function TodoPage/);
assert.doesNotMatch(officePageSource, /function InventoryPage/);
assert.doesNotMatch(officePageSource, /function InventoryCorrectionDetail/);

console.log("Office todo/inventory pages check passed: both features are isolated and inventory safety states remain visible.");
