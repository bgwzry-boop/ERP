import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const orderPoolSource = read("src/features/orders/OrderPoolPage.jsx");
const inventorySource = read("src/features/inventory/InventoryPage.jsx");
const fulfillmentSource = read("src/features/fulfillment/FulfillmentPage.jsx");
const todoSource = read("src/features/todos/TodoPage.jsx");
const mainSource = read("src/main.jsx");
const componentStyles = read("src/styles/components.css");
const orderStyles = read("src/styles/features/orders-pool.css");
const inventoryStyles = read("src/styles/features/inventory.css");
const fulfillmentStyles = read("src/styles/features/fulfillment.css");
const todoStyles = read("src/styles/features/todos.css");
const sharedStyles = read("src/styles/shared.css");

assert.match(sharedUiSource, /export function FilterBar\(/);
assert.match(sharedUiSource, /operational-filter-fields/);
assert.match(sharedUiSource, /operational-filter-summary/);
assert.match(sharedUiSource, /data-row-id=\{row\.id\}/);

for (const [source, workbenchClass, panelClass] of [
  [orderPoolSource, "order-pool-workbench", "order-pool-list-panel"],
  [inventorySource, "inventory-workbench", "inventory-list-panel"],
  [fulfillmentSource, "fulfillment-workbench", "fulfillment-list-panel"],
  [todoSource, "todo-workbench", "todo-list-panel"],
]) {
  assert.match(source, /<OperationalPanel/);
  assert.match(source, /<DataState/);
  assert.match(source, new RegExp(workbenchClass));
  assert.match(source, new RegExp(panelClass));
}

assert.match(orderPoolSource, /<FilterBar/);
assert.match(orderPoolSource, /订单池筛选/);
assert.match(inventorySource, /<FilterBar/);
assert.match(inventorySource, /库存查询筛选/);
assert.match(fulfillmentSource, /<FilterBar/);
assert.match(fulfillmentSource, /出库交付筛选/);
assert.match(fulfillmentSource, /没有匹配的交付任务/);
assert.match(fulfillmentSource, /\?\? visibleFulfillments\[0\] \?\? null/);
assert.match(fulfillmentSource, /getFulfillmentAttentionScore/);
assert.match(fulfillmentSource, /ariaLabel="交付任务排序"/);
assert.match(fulfillmentSource, /关注优先/);
assert.match(todoSource, /<FilterBar/);
assert.match(todoSource, /公共待办筛选/);
assert.match(todoSource, /没有匹配的公共待办/);
assert.match(todoSource, /\?\? visibleTodos\[0\] \?\? null/);
assert.match(todoSource, /aria-label="待办状态快捷筛选"/);
assert.match(todoSource, /function todoMatchesView/);
assert.ok(
  fulfillmentSource.indexOf("if (!selected)") < fulfillmentSource.indexOf("findOrderLine(orderLines, selected.lineId)"),
  "Fulfillment must guard an empty filtered list before reading the selected line.",
);
assert.match(orderPoolSource, /\?\? filtered\[0\] \?\? null/);
assert.doesNotMatch(orderPoolSource, /\?\? filtered\[0\] \?\? orderLines\[0\]/);
assert.match(inventorySource, /hasVisibleInventory/);
assert.match(inventorySource, /没有匹配的库存键/);

for (const source of [orderPoolSource, inventorySource, fulfillmentSource, todoSource]) {
  assert.match(source, /operational-split-workbench/);
  assert.match(source, /operational-detail-tabs/);
}

assert.match(componentStyles, /\.page-grid\.operational-split-workbench/);
assert.match(componentStyles, /grid-template-columns: minmax\(0, 1fr\) clamp\(270px, 31%, 380px\)/);

for (const styleImport of [
  "./styles/features/orders-pool.css",
  "./styles/features/inventory.css",
  "./styles/features/fulfillment.css",
  "./styles/features/todos.css",
]) {
  assert.match(mainSource, new RegExp(styleImport.replaceAll(".", "\\.")));
}

assert.match(orderStyles, /@media \(max-width: 720px\)/);
assert.match(inventoryStyles, /@media \(max-width: 720px\)/);
assert.match(fulfillmentStyles, /@media \(max-width: 720px\)/);
assert.match(orderStyles, /span:nth-child\(7\)/);
assert.match(orderStyles, /\.order-status-tabs/);
assert.match(orderStyles, /\.order-detail-facts/);
assert.match(orderStyles, /\.order-pool-detail-scroll/);
assert.match(orderStyles, /\.order-pool-detail-actions\s*\{[\s\S]*?position: static;/);
assert.match(orderStyles, /\.order-pool-detail-actions \.primary-action:not\(:disabled\)\s*\{[\s\S]*?background: var\(--erp-accent\);/);
assert.match(inventoryStyles, /span:nth-child\(4\)/);
assert.match(inventoryStyles, /\.inventory-status-tabs/);
assert.match(inventoryStyles, /\.inventory-detail-facts/);
assert.match(inventoryStyles, /\.inventory-detail-scroll/);
assert.match(inventoryStyles, /\.inventory-detail-actions\s*\{[\s\S]*?position: static;/);
assert.match(fulfillmentStyles, /span:nth-child\(6\)/);
assert.match(fulfillmentStyles, /\.fulfillment-status-tabs/);
assert.match(fulfillmentStyles, /\.fulfillment-detail-facts/);
assert.match(fulfillmentStyles, /\.fulfillment-detail-scroll/);
assert.match(fulfillmentStyles, /\.fulfillment-detail-actions\s*\{[\s\S]*?position: static;/);
assert.match(todoStyles, /@media \(max-width: 720px\)/);
assert.match(todoStyles, /span:nth-child\(5\)/);
assert.match(todoStyles, /\.todo-status-tabs/);
assert.match(todoStyles, /\.todo-detail-facts/);
assert.match(todoStyles, /\.todo-detail-scroll/);
assert.match(todoStyles, /\.todo-detail-actions\s*\{[\s\S]*?position: static;/);
for (const selector of [".delivery-evidence-cards", ".delivery-evidence-card"]) {
  assert.equal(fulfillmentStyles.includes(selector), true, `fulfillment feature styles should own ${selector}`);
  assert.equal(sharedStyles.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.doesNotMatch(sharedStyles, /\.delivery-evidence-review/);
for (const selector of [".inventory-ledger-filters", ".inventory-ledger-row", ".inventory-ledger-source", ".ledger-message"]) {
  assert.equal(inventoryStyles.includes(selector), true, `inventory feature styles should own ${selector}`);
  assert.equal(sharedStyles.includes(selector), false, `shared styles should not retain ${selector}`);
}
for (const selector of [".inventory-correction-detail", ".inventory-correction-ledger", ".inventory-correction-audit-row", ".inventory-correction-queue-row", ".correction-draft"]) {
  assert.equal(inventoryStyles.includes(selector), true, `inventory correction styles should own ${selector}`);
  assert.equal(sharedStyles.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.doesNotMatch(sharedStyles, /\.inventory-filter-panel/);

console.log("Office operational UI adoption checks passed: Todo, Order Pool, Inventory, and Fulfillment share the operational shell with safe empty and responsive states.");
