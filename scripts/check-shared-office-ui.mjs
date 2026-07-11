import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const appSource = read("src/App.jsx");
const navigationSource = read("src/app/navigation.js");
const mainSource = read("src/main.jsx");
const todoSource = read("src/features/todos/TodoPage.jsx");
const entrySource = read("src/features/orders/EntryPage.jsx");
const tokenSource = read("src/styles/tokens.css");

for (const componentName of [
  "WorkspaceNotice",
  "WorkspacePageHeader",
  "OperationalPanel",
  "PanelHeader",
  "DataState",
  "MetricStrip",
  "DataTable",
  "DetailPane",
  "FilterBar",
  "Segmented",
]) {
  assert.match(sharedUiSource, new RegExp(`export function ${componentName}\\(`));
}

assert.match(sharedUiSource, /aria-live="polite"/);
assert.match(sharedUiSource, /role="tablist"/);
assert.match(sharedUiSource, /aria-selected=\{value === item\}/);
assert.match(appSource, /<WorkspaceNotice>/);
assert.match(appSource, /<WorkspacePageHeader/);
assert.doesNotMatch(appSource, /function PageHead\(/);
assert.doesNotMatch(appSource, />\s*本地演示\s*</);
assert.match(navigationSource, /description:/);

for (const styleImport of [
  "./styles/tokens.css",
  "./styles/shell.css",
  "./styles/components.css",
  "./styles/features/todos.css",
  "./styles/features/orders-entry.css",
]) {
  assert.match(mainSource, new RegExp(styleImport.replaceAll(".", "\\.")));
}

for (const token of [
  "--erp-canvas",
  "--erp-surface",
  "--erp-text",
  "--erp-border",
  "--erp-accent",
  "--erp-success",
  "--erp-warning",
  "--erp-danger",
]) {
  assert.match(tokenSource, new RegExp(`${token}:`));
}

assert.match(todoSource, /todo-workbench/);
assert.match(todoSource, /<OperationalPanel/);
assert.match(todoSource, /<PanelHeader/);
assert.match(todoSource, /<DataState/);
assert.match(todoSource, /TODO_DETAIL_TABS/);
assert.match(todoSource, /operational-split-workbench/);
assert.match(todoSource, /ariaLabel="待办详情视图"/);
assert.match(entrySource, /entry-workbench/);
assert.match(entrySource, /<OperationalPanel/);
assert.match(entrySource, /<PanelHeader/);
assert.match(entrySource, /<DataState/);
assert.match(entrySource, /const currentStep =/);
assert.match(entrySource, /aria-current=\{step\.id === currentStep \? "step"/);
assert.match(entrySource, /function toFiniteNumber/);

console.log("Shared office UI checks passed: shell, operational states, layered styles, and data-driven Todo/Entry adoption are locked.");
