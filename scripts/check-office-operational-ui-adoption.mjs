import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const orderPoolSource = read("src/features/orders/OrderPoolPage.jsx");
const inventorySource = read("src/features/inventory/InventoryPage.jsx");
const fulfillmentSource = read("src/features/fulfillment/FulfillmentPage.jsx");
const mainSource = read("src/main.jsx");
const componentStyles = read("src/styles/components.css");
const orderStyles = read("src/styles/features/orders-pool.css");
const inventoryStyles = read("src/styles/features/inventory.css");
const fulfillmentStyles = read("src/styles/features/fulfillment.css");

assert.match(sharedUiSource, /export function FilterBar\(/);
assert.match(sharedUiSource, /operational-filter-fields/);
assert.match(sharedUiSource, /operational-filter-summary/);
assert.match(sharedUiSource, /data-row-id=\{row\.id\}/);

for (const [source, workbenchClass, panelClass] of [
  [orderPoolSource, "order-pool-workbench", "order-pool-list-panel"],
  [inventorySource, "inventory-workbench", "inventory-list-panel"],
  [fulfillmentSource, "fulfillment-workbench", "fulfillment-list-panel"],
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
assert.match(fulfillmentSource, /<PanelHeader/);
assert.match(fulfillmentSource, /当前交付方式没有任务/);
assert.match(fulfillmentSource, /\?\? visibleFulfillments\[0\] \?\? null/);
assert.match(fulfillmentSource, /getFulfillmentAttentionScore/);
assert.match(fulfillmentSource, /aria-pressed=\{priorityMode === "attention"\}/);
assert.ok(
  fulfillmentSource.indexOf("if (!selected)") < fulfillmentSource.indexOf("findOrderLine(orderLines, selected.lineId)"),
  "Fulfillment must guard an empty filtered list before reading the selected line.",
);
assert.match(orderPoolSource, /\?\? filtered\[0\] \?\? null/);
assert.doesNotMatch(orderPoolSource, /\?\? filtered\[0\] \?\? orderLines\[0\]/);
assert.match(inventorySource, /hasVisibleInventory/);
assert.match(inventorySource, /没有匹配的库存键/);

for (const source of [orderPoolSource, inventorySource, fulfillmentSource]) {
  assert.match(source, /operational-split-workbench/);
  assert.match(source, /operational-detail-tabs/);
}

assert.match(componentStyles, /\.page-grid\.operational-split-workbench/);
assert.match(componentStyles, /grid-template-columns: minmax\(0, 1fr\) clamp\(270px, 31%, 380px\)/);

for (const styleImport of [
  "./styles/features/orders-pool.css",
  "./styles/features/inventory.css",
  "./styles/features/fulfillment.css",
]) {
  assert.match(mainSource, new RegExp(styleImport.replaceAll(".", "\\.")));
}

assert.match(orderStyles, /@media \(max-width: 720px\)/);
assert.match(inventoryStyles, /@media \(max-width: 720px\)/);
assert.match(fulfillmentStyles, /@media \(max-width: 720px\)/);
assert.match(orderStyles, /span:nth-child\(8\)/);
assert.match(inventoryStyles, /span:nth-child\(8\)/);
assert.match(fulfillmentStyles, /span:nth-child\(7\)/);

console.log("Office operational UI adoption checks passed: Order Pool, Inventory, and Fulfillment share the operational shell with safe empty and mobile states.");
