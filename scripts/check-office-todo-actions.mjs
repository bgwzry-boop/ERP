import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeTodoActions } from "../src/app/createOfficeTodoActions.js";
import { getTodoActions, getTodoHandlingRule, getTodoTone } from "../src/domain/officeRules.js";

const baseTodos = [
  {
    id: "T-CONTROLLER-001",
    type: "订单草稿待确认",
    customerId: "C001",
    ref: "ORD-001-01",
    summary: "等待处理",
    handled: false,
  },
  {
    id: "T-CONTROLLER-PRINT",
    type: "待打印标签",
    customerId: "C001",
    ref: "ORD-PRINT-01",
    summary: "快运 2 包",
    handled: false,
  },
];

function createHarness({ allowLocalFallback = false, api = {}, copyResult = true, todoItems = baseTodos } = {}) {
  let todos = todoItems.map((item) => ({ ...item }));
  let selectedTodoId = todos[0].id;
  let todoView = "未处理";
  let activePage = "todos";
  let refreshCount = 0;
  let fulfillmentRefreshCount = 0;
  const modals = [];
  const toasts = [];
  const focusCalls = { drafts: [], fulfillments: [], inventories: [], statements: [] };
  const controller = createOfficeTodoActions({
    allowLocalFallback,
    api,
    authState: { authenticated: true },
    copyTextToClipboard: async () => copyResult,
    currentUser: { displayName: "办公室A" },
    currentUserId: "U-OFFICE-A",
    findCustomer: () => ({ id: "C001", name: "测试客户", contact: "联系人" }),
    focusFulfillmentByRef: async (ref) => {
      focusCalls.fulfillments.push(ref);
      return { id: "F-FOCUS-1", lineId: ref };
    },
    focusInventoryByRef: async (ref, todo) => {
      focusCalls.inventories.push({ ref, todoId: todo.id });
      return { id: "INV-FOCUS-1" };
    },
    focusOrderDraftByRef: async (ref) => {
      focusCalls.drafts.push(ref);
      return { draftId: ref };
    },
    focusOrderLine: () => {},
    focusStatementByRef: async (ref) => {
      focusCalls.statements.push(ref);
      return { id: "ST-FOCUS-1", ref };
    },
    getTodoCustomerNotificationDraft: () => ({
      channel: "微信 / 企业微信人工发送",
      copyText: "请确认订单信息",
    }),
    guardUiAction: () => true,
    isPrintTodo: (todo) => todo.type.includes("打印") || todo.type.includes("标签"),
    openModal: (modal) => modals.push(modal),
    refreshFulfillments: async () => {
      fulfillmentRefreshCount += 1;
      return { source: "api", items: [] };
    },
    refreshTodos: async () => {
      refreshCount += 1;
      return { source: "api", items: todos };
    },
    selectedTodoId,
    setActivePage: (value) => {
      activePage = value;
    },
    setSelectedTodoId: (value) => {
      selectedTodoId = value;
    },
    setTodos: (updater) => {
      todos = typeof updater === "function" ? updater(todos) : updater;
    },
    setTodoView: (value) => {
      todoView = value;
    },
    setToast: (message) => toasts.push(message),
    sortTodos: (items) => items,
    todos,
  });
  return {
    controller,
    getActivePage: () => activePage,
    getModals: () => modals,
    getRefreshCount: () => refreshCount,
    getFocusCalls: () => focusCalls,
    getFulfillmentRefreshCount: () => fulfillmentRefreshCount,
    getSelectedTodoId: () => selectedTodoId,
    getTodos: () => todos,
    getTodoView: () => todoView,
    toasts,
  };
}

{
  const repairTodo = {
    id: "T-FULFILLMENT-REPAIR",
    type: "出库交付待补建",
    customerId: "C001",
    ref: "ORD-REPAIR-01",
    refId: "ORD-REPAIR-01",
    refType: "order_line",
    referenceStatus: "valid",
    updatedAt: "2026-07-11T08:00:00.000Z",
    handled: false,
  };
  let repairInput = null;
  let repairOptions = null;
  const harness = createHarness({
    todoItems: [repairTodo],
    api: {
      repairOfficeTodoFulfillment: async (input, options) => {
        repairInput = input;
        repairOptions = options;
        return {
          source: "api",
          todo: { ...repairTodo, handled: true },
          labelTodo: { id: "T-LABEL-REPAIR", type: "待打印标签", ref: "F-REPAIR-1", handled: false },
          fulfillment: { fulfillmentId: "F-REPAIR-1" },
          packageIds: ["PKG-REPAIR-1", "PKG-REPAIR-2"],
        };
      },
    },
  });
  assert.deepEqual(getTodoActions(repairTodo), [
    { label: "补建出库交付", variant: "primary" },
    { label: "打开订单池", variant: "secondary" },
  ]);
  await harness.controller.handleTodo("补建出库交付");
  assert.equal(repairInput.operatorId, "U-OFFICE-A");
  assert.match(repairInput.idempotencyKey, /^fulfillment-repair:/);
  assert.equal(repairOptions.serverRequired, true);
  assert.equal(harness.getRefreshCount(), 1);
  assert.equal(harness.getFulfillmentRefreshCount(), 1);
  assert.equal(harness.getSelectedTodoId(), "T-LABEL-REPAIR");
  assert.match(harness.toasts.at(-1), /2 个包裹已回填/);
}

{
  const missingReferenceTodo = { ...baseTodos[0], referenceStatus: "missing", referenceReason: "引用目标不存在" };
  const harness = createHarness({ todoItems: [missingReferenceTodo] });
  await harness.controller.handleTodo("打开订单录入");
  assert.deepEqual(harness.getFocusCalls().drafts, []);
  assert.match(harness.toasts.at(-1), /不可直接使用/);
  assert.deepEqual(getTodoActions(missingReferenceTodo), [{ label: "处理完成", variant: "secondary" }]);
  assert.match(getTodoHandlingRule(missingReferenceTodo), /引用失效/);
  assert.equal(getTodoTone(missingReferenceTodo), "danger");
}

{
  const unverifiableTodo = { ...baseTodos[0], referenceStatus: "unverifiable", referenceReason: "外部引用暂不可校验" };
  const harness = createHarness({ todoItems: [unverifiableTodo] });
  await harness.controller.handleTodo("打开订单录入");
  assert.deepEqual(harness.getFocusCalls().drafts, []);
  assert.match(harness.toasts.at(-1), /不可直接使用/);
  assert.deepEqual(getTodoActions(unverifiableTodo), [{ label: "处理完成", variant: "secondary" }]);
  assert.match(getTodoHandlingRule(unverifiableTodo), /引用待核/);
  assert.equal(getTodoTone(unverifiableTodo), "warning");
}

{
  const missingReferenceTodo = { ...baseTodos[0], referenceStatus: "missing", referenceReason: "引用目标不存在" };
  let repairInput = null;
  let repairOptions = null;
  const harness = createHarness({
    todoItems: [missingReferenceTodo],
    api: {
      repairOfficeTodoReference: async (input, options) => {
        repairInput = input;
        repairOptions = options;
        return { source: "api", todo: { ...missingReferenceTodo, ref: input.refId, refId: input.refId, refType: input.refType, referenceStatus: "valid" } };
      },
    },
  });
  await harness.controller.repairTodoReference("T-CONTROLLER-001", { refType: "order_line", refId: "ORD-VALID-01", reason: "核对原始消息" });
  assert.equal(repairInput.operatorId, "U-OFFICE-A");
  assert.equal(repairOptions.serverRequired, true);
  assert.equal(harness.getTodos()[0].referenceStatus, "valid");
  assert.equal(harness.getRefreshCount(), 1);
  assert.match(harness.toasts.at(-1), /已重新关联/);
}

{
  const missingReferenceTodo = { ...baseTodos[0], referenceStatus: "missing" };
  const harness = createHarness({
    allowLocalFallback: true,
    todoItems: [missingReferenceTodo],
    api: { repairOfficeTodoReference: async () => ({ source: "local_fallback" }) },
  });
  await harness.controller.repairTodoReference("T-CONTROLLER-001", { refType: "order_line", refId: "ORD-VALID-01", reason: "核对原始消息" });
  assert.equal(harness.getTodos()[0].referenceStatus, "missing");
  assert.equal(harness.getRefreshCount(), 0);
  assert.match(harness.toasts.at(-1), /后端拒绝重新关联/);
}

{
  const harness = createHarness();
  await harness.controller.handleTodo("打开订单录入");
  assert.deepEqual(harness.getFocusCalls().drafts, ["ORD-001-01"]);
}

{
  const harness = createHarness();
  await harness.controller.handleTodo("打开库存查询");
  assert.deepEqual(harness.getFocusCalls().inventories, [{ ref: "ORD-001-01", todoId: "T-CONTROLLER-001" }]);
}

{
  const harness = createHarness();
  await harness.controller.handleTodo("打印预览", "T-CONTROLLER-PRINT");
  assert.equal(harness.getModals()[0]?.type, "print");
  assert.equal(harness.getModals()[0]?.fulfillmentId, "F-FOCUS-1");
}

{
  const harness = createHarness();
  await harness.controller.handleTodo("未接入动作");
  assert.match(harness.toasts.at(-1), /本次未执行/);
  assert.doesNotMatch(harness.toasts.at(-1), /模拟执行/);
}

{
  const optionsSeen = [];
  const harness = createHarness({
    api: {
      handleOfficeTodoAction: async (_input, options) => {
        optionsSeen.push(options);
        return { source: "local_fallback" };
      },
    },
  });
  await harness.controller.handleTodo("处理完成");
  assert.equal(optionsSeen[0]?.serverRequired, true);
  assert.equal(harness.getTodos()[0].handled, false, "formal fallback must not handle a todo locally");
  assert.equal(harness.getRefreshCount(), 0);
  assert.match(harness.toasts.at(-1), /后端拒绝处理待办/);
}

{
  const harness = createHarness({
    api: {
      handleOfficeTodoAction: async () => ({ source: "api", todo: { id: "T-CONTROLLER-001", handled: true } }),
    },
  });
  await harness.controller.handleTodo("处理完成");
  assert.equal(harness.getTodos()[0].handled, true);
  assert.equal(harness.getRefreshCount(), 1, "API-confirmed todo writes should refresh the committed read model");
  assert.equal(harness.getSelectedTodoId(), "T-CONTROLLER-PRINT");
}

{
  const harness = createHarness({
    api: {
      handleOfficeTodoAction: async () => ({ source: "local_fallback" }),
    },
  });
  await harness.controller.handleTodo("客户待确认");
  assert.equal(harness.getTodos()[0].reminder, undefined, "formal fallback must not persist customer-pending locally");
  assert.match(harness.toasts.at(-1), /后端拒绝标记客户待确认/);
}

{
  let pendingInput = null;
  const harness = createHarness({
    api: {
      handleOfficeTodoAction: async (input) => {
        pendingInput = input;
        return { source: "api", todo: { id: input.todoId, handled: false, reminder: "等待客户回复" } };
      },
    },
  });
  await harness.controller.handleTodo("客户待确认");
  assert.equal(pendingInput.action, "客户待确认");
  assert.equal(harness.getTodos()[0].handled, false);
  assert.equal(harness.getTodos()[0].reminder, "等待客户回复");
  assert.equal(harness.getRefreshCount(), 1);
}

{
  const harness = createHarness({
    api: {
      handleOfficeTodoAction: async () => ({ source: "api" }),
    },
  });
  await harness.controller.handleTodo("稍后2小时");
  assert.equal(harness.getTodos()[0].reminder, "2 小时后");
  assert.equal(harness.getRefreshCount(), 1);
}

{
  const harness = createHarness();
  await harness.controller.handleTodo("打印标签", "T-CONTROLLER-PRINT");
  const modal = harness.getModals()[0];
  assert.equal(modal.type, "batchPrintResult");
  assert.equal(modal.totalTasks, 1);
  assert.equal(modal.totalLabels, 2);
}

{
  const harness = createHarness({
    allowLocalFallback: true,
    api: {
      handleOfficeTodoAction: async (_input, options) => {
        assert.equal(options.serverRequired, false);
        return { source: "local_fallback" };
      },
    },
  });
  await harness.controller.handleTodo("重新打开");
  assert.equal(harness.getTodoView(), "未处理");
  assert.equal(harness.getRefreshCount(), 0, "demo fallback should not pretend to refresh an API read model");
}

const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
const todoServiceSource = readFileSync(new URL("../server/services/todoCommandService.mjs", import.meta.url), "utf8");
assert.match(appSource, /createOfficeTodoActions\(\{/);
assert.match(appSource, /allowLocalFallback: !runtimeServerRequired/);
assert.doesNotMatch(appSource, /async function handleTodo\(/);
assert.match(todoServiceSource, /"customer_pending"/);
assert.match(todoServiceSource, /reminder: "等待客户回复"/);

console.log("Office todo actions check passed: todo writes are isolated, formal fallback is blocked, customer-pending is persisted, and API commits refresh the read model.");
