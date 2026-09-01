import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const appSource = [read("src/App.jsx"), read("src/OfficeWorkbench.jsx")].join("\n");
const appShellViewsSource = read("src/app/AppShellViews.jsx");
const navigationSource = read("src/app/navigation.js");
const mainSource = read("src/main.jsx");
const todoSource = read("src/features/todos/TodoPage.jsx");
const entrySource = read("src/features/orders/EntryPage.jsx");
const tokenSource = read("src/styles/tokens.css");
const baseStyleSource = read("src/styles/base.css");
const sharedStyleSource = read("src/styles/shared.css");
const shellStyleSource = read("src/styles/shell.css");
const componentStyleSource = read("src/styles/components.css");

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
assert.match(appSource, /onOpenTodos=\{\(\) => setActivePage\("todos"\)\}/);
assert.doesNotMatch(appSource, /function PageHead\(/);
assert.doesNotMatch(appSource, />\s*本地演示\s*</);
assert.match(appShellViewsSource, /onClick=\{onOpenTodos\}/);
assert.match(appShellViewsSource, /aria-label="全局搜索"/);
assert.doesNotMatch(appShellViewsSource, /当前：2026-/);
assert.match(navigationSource, /description:/);

for (const styleImport of [
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/shared.css",
  "./styles/shell.css",
  "./styles/components.css",
]) {
  assert.match(mainSource, new RegExp(styleImport.replaceAll(".", "\\.")));
}
assert.doesNotMatch(mainSource, /styles\/features\/(todos|orders-entry)\.css/, "route-owned styles must not inflate the initial shell");
assert.match(appSource, /import\("\.\/styles\/features\/todos\.css"\)/, "Todo styles should load with the Todo route");
assert.match(appSource, /import\("\.\/styles\/features\/orders-entry\.css"\)/, "Entry styles should load with the Entry route");

const styleImportOrder = [
  './styles/tokens.css',
  './styles/base.css',
  './styles/shared.css',
  './styles/shell.css',
  './styles/components.css',
].map((styleImport) => mainSource.indexOf(`import "${styleImport}";`));
assert.deepEqual([...styleImportOrder].sort((left, right) => left - right), styleImportOrder, "base, shared, shell, and component styles should keep their cascade order");

for (const selector of [":root", "box-sizing: border-box", "body {"]) {
  assert.equal(baseStyleSource.includes(selector), true, `base styles should own ${selector}`);
}
for (const selector of [".app-shell", ".runtime-login-shell", ".sidebar", ".topbar", ".content"]) {
  assert.equal(shellStyleSource.includes(selector), true, `shell styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}
for (const deadSelector of [".page-head", ".head-actions", ".entry-box", ".table-tools", ".order-filter-panel"]) {
  assert.equal(new RegExp(`(^|\\n)\\s*${deadSelector.replace(".", "\\.")}(?=[\\s,{])`).test(sharedStyleSource), false, `shared styles should not retain unused ${deadSelector}`);
}
for (const deadSelector of [".tool-actions", ".mobile-work-head"]) {
  assert.equal(sharedStyleSource.includes(deadSelector), false, `shared styles should not retain unused ${deadSelector}`);
}
for (const selector of [".metric-strip", ".metric strong", ".segmented button.selected"]) {
  assert.equal(componentStyleSource.includes(selector), true, `component styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not duplicate ${selector}`);
}
assert.equal(mainSource.includes('import "./styles.css";'), false, "main should not import the retired root styles file");

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
assert.match(todoSource, /<FilterBar/);
assert.match(todoSource, /<DataState/);
assert.match(todoSource, /TODO_DETAIL_TABS/);
assert.match(todoSource, /operational-split-workbench/);
assert.match(todoSource, /ariaLabel="待办详情视图"/);
assert.match(todoSource, /公共待办筛选/);
assert.match(todoSource, /todo-detail-scroll/);
assert.doesNotMatch(todoSource, /<MetricStrip/);
assert.match(entrySource, /entry-workbench/);
assert.match(entrySource, /<OperationalPanel/);
assert.match(entrySource, /<DataState/);
assert.match(entrySource, /entry-review-panel/);
assert.match(entrySource, /entry-confirm-footer/);
assert.match(entrySource, /订单类型/);
assert.match(entrySource, /const currentStep =/);
assert.match(entrySource, /aria-current=\{step\.id === currentStep \? "step"/);
assert.match(entrySource, /function toFiniteNumber/);

console.log("Shared office UI checks passed: shell, operational states, layered styles, and data-driven Todo/Entry adoption are locked.");
