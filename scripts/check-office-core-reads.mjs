import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeCoreReadActions } from "../src/app/useOfficeCoreReads.js";

function createState(initialValue) {
  let value = initialValue;
  return {
    get value() {
      return value;
    },
    set(nextValue) {
      value = typeof nextValue === "function" ? nextValue(value) : nextValue;
    },
  };
}

function createDependencies(api, options = {}) {
  const state = {
    todos: createState([]),
    selectedTodoId: createState("OLD-TODO"),
    todoMeta: createState({ source: "local", loading: false }),
    orderLines: createState([]),
    selectedOrderId: createState("OLD-ORDER"),
    orderPoolMeta: createState({ source: "local", loading: false }),
    inventoryRecords: createState([]),
    selectedStockId: createState("STOCK-LOCAL"),
    inventoryMeta: createState({ source: "local", loading: false }),
    fulfillments: createState([]),
    fulfillmentMeta: createState({ source: "local", loading: false, error: "" }),
    selectedFulfillmentId: createState("OLD-FULFILLMENT"),
  };
  const dependencies = {
    api,
    authState: { authenticated: true },
    currentUserId: "U-OFFICE-A",
    serverRequired: options.serverRequired ?? (() => false),
    todosRef: { current: [{ id: "TODO-LOCAL" }] },
    orderLinesRef: { current: [{ id: "ORDER-LOCAL" }] },
    inventoryRecordsRef: { current: [{ id: "STOCK-LOCAL" }] },
    selectedStockIdRef: { current: "STOCK-LOCAL" },
    fulfillmentsRef: { current: [{ id: "FULFILLMENT-LOCAL" }] },
    setTodos: state.todos.set,
    setSelectedTodoId: state.selectedTodoId.set,
    setTodoMeta: state.todoMeta.set,
    setOrderLines: state.orderLines.set,
    setSelectedOrderId: state.selectedOrderId.set,
    setOrderPoolMeta: state.orderPoolMeta.set,
    setInventoryRecords: state.inventoryRecords.set,
    setSelectedStockId: state.selectedStockId.set,
    setInventoryMeta: state.inventoryMeta.set,
    setFulfillments: state.fulfillments.set,
    setFulfillmentMeta: state.fulfillmentMeta.set,
    setSelectedFulfillmentId: state.selectedFulfillmentId.set,
  };
  return { actions: createOfficeCoreReadActions(dependencies), state };
}

const api = {
  async listOfficeTodos() {
    return { source: "api", items: [{ id: "TODO-API", handled: false }], total: 1 };
  },
  async listOfficeOrderLines() {
    return {
      source: "api_error",
      blocked: true,
      error: { message: "权限不足", requiredPermission: "order.view" },
    };
  },
  async listOfficeInventoryItems() {
    return { source: "api", items: [], total: 0 };
  },
  async listOfficeFulfillments() {
    return { source: "local", items: [{ id: "FULFILLMENT-FALLBACK" }], total: 1 };
  },
};

const todoCase = createDependencies(api);
const todoResult = await todoCase.actions.refreshTodos({ showToast: true });
assert.deepEqual(todoCase.state.todos.value.map((item) => item.id), ["TODO-API"]);
assert.equal(todoCase.state.selectedTodoId.value, "TODO-API");
assert.equal(todoCase.state.todoMeta.value.source, "api");
assert.equal(todoCase.state.todoMeta.value.loading, false);
assert.match(todoResult.feedback, /后端公共待办/);

const orderCase = createDependencies(api);
const blockedOrderResult = await orderCase.actions.refreshOrderPool({ showToast: true });
assert.equal(blockedOrderResult.blocked, true);
assert.equal(orderCase.state.orderLines.value.length, 0);
assert.equal(orderCase.state.orderPoolMeta.value.error, "权限不足");
assert.match(blockedOrderResult.feedback, /缺少权限 order\.view/);

const inventoryCase = createDependencies(api);
const inventoryResult = await inventoryCase.actions.refreshInventoryRecords();
assert.equal(inventoryResult.selectedStockId, "");
assert.deepEqual(inventoryCase.state.inventoryRecords.value, []);
assert.equal(inventoryCase.state.selectedStockId.value, "");

const productionFulfillmentCase = createDependencies(api, { serverRequired: () => true });
const fulfillmentResult = await productionFulfillmentCase.actions.refreshFulfillments({ showToast: true });
assert.equal(fulfillmentResult.source, "api_error");
assert.equal(productionFulfillmentCase.state.fulfillments.value.length, 0);
assert.equal(productionFulfillmentCase.state.fulfillmentMeta.value.source, "api_error");
assert.match(productionFulfillmentCase.state.fulfillmentMeta.value.error, /生产模式要求从后端读取出库交付/);
assert.match(fulfillmentResult.feedback, /生产模式要求从后端读取出库交付/);

const formalOptions = [];
const formalFallbackApi = {
  async listOfficeTodos(_input, options) {
    formalOptions.push(options);
    return { source: "local_fallback", items: [{ id: "TODO-FALLBACK" }] };
  },
  async listOfficeOrderLines(_input, options) {
    formalOptions.push(options);
    return { source: "local_fallback", items: [{ id: "ORDER-FALLBACK" }] };
  },
  async listOfficeInventoryItems(_input, options) {
    formalOptions.push(options);
    return { source: "local_fallback", items: [{ id: "STOCK-FALLBACK" }] };
  },
  async listOfficeFulfillments(_input, options) {
    formalOptions.push(options);
    return { source: "local_fallback", items: [{ id: "FULFILLMENT-FALLBACK" }] };
  },
};
for (const actionName of ["refreshTodos", "refreshOrderPool", "refreshInventoryRecords", "refreshFulfillments"]) {
  const formalCase = createDependencies(formalFallbackApi, { serverRequired: () => true });
  const result = await formalCase.actions[actionName]({ showToast: true });
  assert.equal(result.blocked, true, `${actionName} must block a formal local fallback`);
  assert.equal(result.source, "api_error");
}
assert.equal(formalOptions.every((options) => options?.serverRequired === true), true);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
const sharedUiSource = readFileSync(new URL("../src/shared/ui/operational.jsx", import.meta.url), "utf8");
const shellStylesSource = readFileSync(new URL("../src/styles/shell.css", import.meta.url), "utf8");
for (const apiName of ["listOfficeTodos", "listOfficeOrderLines", "listOfficeInventoryItems", "listOfficeFulfillments"]) {
  assert.equal(appSource.includes(apiName), false, `App should not directly orchestrate ${apiName}`);
}
assert.match(workspaceSource, /useOfficeCoreReads/);
assert.match(workspaceSource, /\.\.\.coreReads/);
assert.match(appSource, /renderedPage === "fulfillment"/);
assert.match(appSource, /<WorkspaceNotice>/);
assert.match(appSource, /<WorkspacePageHeader/);
assert.equal(appSource.indexOf("<WorkspaceNotice>") < appSource.indexOf("<WorkspacePageHeader"), true);
assert.match(sharedUiSource, /className="ghost-button" onClick=\{onRefresh\}/);
assert.match(shellStylesSource, /\.workspace-notice\s*\{[^}]*pointer-events:\s*none/s);
assert.doesNotMatch(shellStylesSource, /\.workspace-notice\s*\{[^}]*position:\s*absolute/s);

console.log("Office core reads check passed: API success, denial, authoritative empty states, and production fallback blocking are covered.");
