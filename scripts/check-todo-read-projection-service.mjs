import assert from "node:assert/strict";
import { createTodoReadProjectionService } from "../server/services/todoReadProjectionService.mjs";

const now = new Date("2026-07-13T02:00:00.000Z");
const workspace = {
  customers: [
    { id: "C-1", name: "测试客户一" },
    { id: "C-2", name: "测试客户二" },
  ],
  orderDrafts: [{ id: "DRAFT-1" }],
  orderLines: [{ id: "ORD-1", customerId: "C-2" }],
  fulfillments: [],
  statements: [{ id: "ST-1", customerId: "C-1" }],
  inventories: [],
  inventoryCorrectionDrafts: [],
  productionTasks: [],
  todos: [
    {
      id: "T-URGENT",
      type: "订单草稿待确认",
      customerId: "C-1",
      refType: "order_draft",
      refId: "DRAFT-1",
      summary: "急单待确认",
      urgency: "急",
      latest: "今天 19:00",
      createdAt: "2026-07-13T01:31:00.000Z",
    },
    {
      todo_id: "T-EXCEPTION",
      type: "缺货待处理",
      customer_id: "C-2",
      ref_type: "order_line",
      ref_id: "ORD-MISSING",
      summary: "库存不足",
      priority: "exception",
      created_at: "invalid-created-at",
      printed_label_count: "not-a-number",
      pending_label_count: 2.9,
      total_label_count: -4,
    },
    {
      id: "T-EXPIRED-SNOOZE",
      type: "待生成对账",
      customerId: "C-1",
      refType: "statement",
      refId: "ST-1",
      reminder: "稍后提醒",
      remindAt: "2026-07-13T01:59:00.000Z",
      createdAt: "2026-07-11T02:00:00.000Z",
    },
    {
      id: "T-ACTIVE-SNOOZE",
      type: "待生成对账",
      customerId: "C-1",
      refType: "statement",
      refId: "ST-1",
      remindAt: "2026-07-13T02:30:00.000Z",
      createdAt: "2026-07-13T01:00:00.000Z",
    },
    {
      id: "T-HANDLED",
      type: "订单异常",
      customerId: "C-2",
      refType: "order_line",
      refId: "ORD-1",
      status: "handled",
      createdAt: "2026-07-12T02:00:00.000Z",
    },
  ],
};

const service = createTodoReadProjectionService();

const exception = service.projectTodo({ workspace, todo: workspace.todos[1], now });
assert.equal(exception.todoId, "T-EXCEPTION");
assert.equal(exception.customerName, "测试客户二");
assert.equal(exception.priority, "exception");
assert.equal(exception.referenceStatus, "missing");
assert.equal(exception.resolvedRefTypeLabel, "订单行");
assert.equal(exception.printedLabelCount, 0);
assert.equal(exception.pendingLabelCount, 2);
assert.equal(exception.totalLabelCount, 0);
assert.equal(exception.createdAt, now.toISOString());
assert.equal(JSON.stringify(exception).includes("NaN"), false);

const expiredSnooze = service.projectTodo({ workspace, todo: workspace.todos[2], now });
assert.equal(expiredSnooze.activeSnooze, false);
assert.equal(expiredSnooze.reminderLevel, "follow_up");
assert.equal(expiredSnooze.status, "open");

const activeSnooze = service.projectTodo({ workspace, todo: workspace.todos[3], now });
assert.equal(activeSnooze.activeSnooze, true);
assert.equal(activeSnooze.status, "snoozed");

const priorityList = service.listTodos({
  workspace,
  searchParams: new URLSearchParams("status=all&priority=exception&page=invalid&pageSize=999"),
  now,
});
assert.equal(priorityList.total, 1);
assert.equal(priorityList.items[0].todoId, "T-EXCEPTION");
assert.equal(priorityList.page, 1);
assert.equal(priorityList.pageSize, 200);
assert.equal(priorityList.items[0].serverSortIndex, 0);

const keywordList = service.listTodos({
  workspace,
  searchParams: new URLSearchParams(`status=all&keyword=${encodeURIComponent("测试客户一")}`),
  now,
});
assert.deepEqual(keywordList.items.map((item) => item.todoId), [
  "T-URGENT",
  "T-EXPIRED-SNOOZE",
  "T-ACTIVE-SNOOZE",
]);

const handledList = service.listTodos({
  workspace,
  searchParams: new URLSearchParams("status=handled"),
  now,
});
assert.deepEqual(handledList.items.map((item) => item.todoId), ["T-HANDLED"]);

assert.deepEqual(service.summarizeTodo(workspace.todos[1]), {
  todoId: "T-EXCEPTION",
  type: "缺货待处理",
  customerId: "C-2",
  refType: "order_line",
  refId: "ORD-MISSING",
  handled: false,
  summary: "库存不足",
  latestNeededAt: "",
  urgency: "exception",
  impact: "",
  notificationCopyText: "",
  notificationChannel: "",
  notificationStatus: "",
  photoPrompt: "",
});

console.log("todo read projection service checks passed");
