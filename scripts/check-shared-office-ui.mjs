import { createInboundReviewGuard } from "../docs/prototypes/raw-material-roll-inventory-review/src/inboundReviewGuard.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import { toFiniteNumber } from "../src/features/orders/entryPageModel.js";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const appSource = [
  read("src/App.jsx"),
  read("src/app/OfficeWorkbenchShell.jsx"),
  read("src/app/OfficeWorkspacePages.jsx"),
  read("src/app/workspacePageComponents.jsx"),
  read("src/app/pageRegistry.js"),
  read("src/app/useOfficeActivePageEffects.js"),
].join("\n");
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
assert.match(appSource, /import\("\.\.\/styles\/features\/todos\.css"\)/, "Todo styles should load with the Todo route");
assert.match(appSource, /import\("\.\.\/styles\/features\/orders-entry\.css"\)/, "Entry styles should load with the Entry route");

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
assert.equal(toFiniteNumber("12.5"), 12.5);
assert.equal(toFiniteNumber("not-a-number"), 0);

{
  const guard = createInboundReviewGuard();
  const releaseDirty = guard.register(() => true);
  const releaseClean = guard.register(() => false);
  assert.equal(guard.isDirty(), true, "any dirty provider makes the guard dirty");
  assert.equal(guard.shouldSwitch({ nextId: "B", currentId: "A", confirm: () => false }), false, "dirty review must block switching when cancel is chosen");
  assert.equal(guard.shouldSwitch({ nextId: "B", currentId: "A", confirm: () => true }), true, "confirming discards must allow switching");
  assert.equal(guard.shouldSwitch({ nextId: "A", currentId: "A", confirm: () => false }), true, "same receipt never prompts");
  releaseDirty();
  assert.equal(guard.isDirty(), false, "removing the dirty provider must restore a clean state (no singleton stomping)");
  const releaseBroken = guard.register(() => { throw new Error("provider failed"); });
  assert.equal(guard.isDirty(), true, "a failing provider must fail closed, not silently allow switching");
  releaseBroken();
  releaseClean();
  assert.equal(guard.isDirty(), false);

  const receivingData = read("docs/prototypes/raw-material-roll-inventory-review/src/useReceivingData.js");
  assert.match(receivingData, /reviewGuard\.shouldSwitch/u, "receipt selection must consult its own review guard");
  assert.match(receivingData, /createInboundReviewGuard\(\)/u, "each receiving data instance owns its guard");
  assert.ok(!/import \{ inboundReviewGuard \}/u.test(receivingData), "no global singleton import in receiving data");
  const receivingWorkspace = read("docs/prototypes/raw-material-roll-inventory-review/src/FormalReceivingWorkspace.jsx");
  assert.match(receivingWorkspace, /formal\.receiving\?\.reviewGuard\?\.register/u, "receiving workspace must register on the instance guard");
}

console.log("Shared office UI checks passed: shell, operational states, layered styles, and data-driven Todo/Entry adoption are locked.");
