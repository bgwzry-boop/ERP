import assert from "node:assert/strict";
import {
  buildGetTodoActionStateQuery,
  buildRepairMissingFulfillmentTransactionQuery,
  buildRecordTodoActionTransactionQuery,
  createLocalTodoActionRepository,
  createPostgresTodoActionRepository,
} from "../server/todoActionRepository.mjs";

const before = buildTodo({ updatedAt: "2026-07-11T08:00:00.000Z" });
const after = buildTodo({
  status: "已处理",
  handled: true,
  handledBy: "U-AUTH",
  handledAt: "2026-07-11T08:30:00.000Z",
  handlingResult: "已完成",
  updatedAt: "2026-07-11T08:30:00.000Z",
  notificationStatus: "已通知客户",
});
const todoEvent = {
  eventId: "TE-LOG-TODO-1",
  todoId: "T-REPO-1",
  eventType: "handle_todo:mark_handled",
  eventPayload: { action: "mark_handled", todo: after },
  operatorId: "U-AUTH",
  occurredAt: "2026-07-11T08:30:00.000Z",
  createdAt: "2026-07-11T08:30:00.000Z",
};
const operationLog = {
  id: "LOG-TODO-1",
  targetType: "todo",
  targetId: "T-REPO-1",
  action: "handle_todo:mark_handled",
  before,
  after,
  reason: "已完成",
  operatorId: "U-AUTH",
  pageKey: "api",
  occurredAt: "2026-07-11T08:30:00.000Z",
  createdAt: "2026-07-11T08:30:00.000Z",
};

const localWorkspace = { todos: [before], todoEvents: [], operationLogs: [] };
const localRepository = createLocalTodoActionRepository();
assert.equal((await localRepository.getTodo({ workspace: localWorkspace, todoId: "T-REPO-1" })).status, "未处理");
const localResult = await localRepository.recordTodoAction({
  workspace: localWorkspace,
  action: "mark_handled",
  before,
  expectedUpdatedAt: before.updatedAt,
  todo: after,
  todoEvent,
  operationLog,
  idempotencyKey: "todo-action-local-001",
  idempotencyPayload: { action: "mark_handled", todoId: "T-REPO-1" },
});
assert.equal(localResult.todo.notificationStatus, "已通知客户");
assert.equal(localWorkspace.todoEvents.length, 1);
assert.equal(localWorkspace.operationLogs.length, 1);

const localReplay = await localRepository.recordTodoAction({
  workspace: localWorkspace,
  action: "mark_handled",
  before,
  expectedUpdatedAt: before.updatedAt,
  todo: { ...after, handlingResult: "不应覆盖首次结果" },
  todoEvent: { ...todoEvent, eventId: "TE-LOCAL-REPLAY-NOT-SAVED" },
  operationLog: { ...operationLog, id: "LOG-LOCAL-REPLAY-NOT-SAVED" },
  idempotencyKey: "todo-action-local-001",
  idempotencyPayload: { action: "mark_handled", todoId: "T-REPO-1" },
});
assert.equal(localReplay.todo.handlingResult, after.handlingResult);
assert.equal(localWorkspace.todoEvents.length, 1);
assert.equal(localWorkspace.operationLogs.length, 1);

await assert.rejects(
  localRepository.recordTodoAction({
    workspace: localWorkspace,
    action: "mark_handled",
    before,
    expectedUpdatedAt: before.updatedAt,
    todo: after,
    todoEvent,
    operationLog,
    idempotencyKey: "todo-action-local-001",
    idempotencyPayload: { action: "mark_handled", todoId: "T-REPO-CHANGED" },
  }),
  (error) => error?.statusCode === 409 && error?.code === "IDEMPOTENCY_KEY_REUSED",
);

await assert.rejects(
  localRepository.recordTodoAction({
    workspace: localWorkspace,
    action: "snooze",
    before,
    expectedUpdatedAt: before.updatedAt,
    todo: { ...after, status: "未处理", handled: false, updatedAt: "2026-07-11T08:31:00.000Z" },
    todoEvent: { ...todoEvent, eventId: "TE-LOCAL-STALE-NOT-SAVED", eventType: "handle_todo:snooze" },
    operationLog: { ...operationLog, id: "LOG-LOCAL-STALE-NOT-SAVED", action: "handle_todo:snooze" },
    idempotencyKey: "todo-action-local-stale-001",
    idempotencyPayload: { action: "snooze", todoId: "T-REPO-1" },
  }),
  (error) => error?.statusCode === 409 && error?.code === "BUSINESS_WRITE_CONFLICT",
);
assert.equal(localWorkspace.todoEvents.length, 1);
assert.equal(localWorkspace.operationLogs.length, 1);

const queryCalls = [];
const idempotentCalls = [];
const postgresWorkspace = { todos: [before], todoEvents: [], operationLogs: [] };
const postgresRepository = createPostgresTodoActionRepository({
  queryJson(text, values) {
    queryCalls.push({ text, values });
    return { todo: before, todoEvent: null };
  },
  idempotentTransactionJson(request) {
    idempotentCalls.push(request);
    return {
      todo: after,
      todoEventId: todoEvent.eventId,
      operationLogId: operationLog.id,
    };
  },
});

const current = await postgresRepository.getTodo({ todoId: "T-REPO-1" });
assert.equal(current.id, "T-REPO-1");
const transaction = await postgresRepository.recordTodoAction({
  workspace: postgresWorkspace,
  action: "mark_handled",
  before,
  expectedUpdatedAt: before.updatedAt,
  todo: after,
  todoEvent,
  operationLog,
  idempotencyKey: "todo-action-repo-001",
  idempotencyPayload: { action: "mark_handled", todoId: "T-REPO-1" },
});
assert.equal(transaction.todo.notificationStatus, "已通知客户");
assert.equal(transaction.operationLogId, "LOG-TODO-1");
assert.equal(idempotentCalls[0].scope, "todo.action.mark_handled");
assert.equal(idempotentCalls[0].targetId, "T-REPO-1");
assert.ok(idempotentCalls[0].resourceLocks.includes("todo:T-REPO-1"));
assert.match(idempotentCalls[0].text, /FOR UPDATE/);
assert.match(idempotentCalls[0].text, /ERP_TODO_CONCURRENCY_CONFLICT/);
assert.match(idempotentCalls[0].text, /INSERT INTO todo_events/);
assert.match(idempotentCalls[0].text, /INSERT INTO operation_logs/);
assert.ok(idempotentCalls[0].values.includes("2026-07-11T08:00:00.000Z"));

await postgresRepository.recordTodoAction({
  workspace: postgresWorkspace,
  action: "mark_handled",
  before,
  todo: after,
  todoEvent: { ...todoEvent, eventId: "TE-REPLAY-NOT-SAVED" },
  operationLog: { ...operationLog, id: "LOG-REPLAY-NOT-SAVED" },
  idempotencyKey: "todo-action-repo-001",
  idempotencyPayload: { action: "mark_handled", todoId: "T-REPO-1" },
});
assert.equal(postgresWorkspace.todoEvents.length, 1);
assert.equal(postgresWorkspace.todoEvents[0].eventId, "TE-LOG-TODO-1");
assert.equal(postgresWorkspace.operationLogs.length, 1);
assert.equal(postgresWorkspace.operationLogs[0].id, "LOG-TODO-1");

const getQuery = buildGetTodoActionStateQuery("T-REPO-1");
assert.match(getQuery.text, /LEFT JOIN LATERAL/);
assert.match(getQuery.text, /FROM todo_events/);
assert.deepEqual(getQuery.values, ["T-REPO-1"]);
const writeQuery = buildRecordTodoActionTransactionQuery({
  before,
  expectedUpdatedAt: before.updatedAt,
  todo: after,
  todoEvent,
  operationLog,
});
assert.match(writeQuery.text, /^BEGIN;/);
assert.match(writeQuery.text, /date_trunc\('milliseconds'/);
assert.match(writeQuery.text, /ref_type =/);
assert.match(writeQuery.text, /ref_id =/);
assert.match(writeQuery.text, /COMMIT;$/);
assert.ok(writeQuery.values.length > 20);

const repairBefore = buildTodo({
  id: "T-REPAIR-FULFILLMENT-1",
  todoId: "T-REPAIR-FULFILLMENT-1",
  bizNo: "T-REPAIR-FULFILLMENT-1",
  type: "出库交付待补建",
  refType: "order_line",
  refId: "OL-REPAIR-FULFILLMENT-1",
  ref: "OL-REPAIR-FULFILLMENT-1",
});
const repairCompleted = {
  ...repairBefore,
  status: "已处理",
  handled: true,
  handledBy: "U-AUTH",
  handledAt: "2026-07-11T08:30:00.000Z",
  handlingResult: "已补建出库交付 F-REPAIR-OL-REPAIR-FULFILLMENT-1",
  updatedAt: "2026-07-11T08:30:00.000Z",
};
const repairLabelTodo = buildTodo({
  id: "T-LABEL-T-REPAIR-FULFILLMENT-1",
  todoId: "T-LABEL-T-REPAIR-FULFILLMENT-1",
  bizNo: "T-LABEL-T-REPAIR-FULFILLMENT-1",
  type: "待打印标签",
  refId: "F-REPAIR-OL-REPAIR-FULFILLMENT-1",
  ref: "F-REPAIR-OL-REPAIR-FULFILLMENT-1",
  createdAt: "2026-07-11T08:30:00.000Z",
  updatedAt: "2026-07-11T08:30:00.000Z",
});
const repairFulfillment = {
  fulfillmentId: "F-REPAIR-OL-REPAIR-FULFILLMENT-1",
  bizNo: "F-REPAIR-OL-REPAIR-FULFILLMENT-1",
  orderLineId: "OL-REPAIR-FULFILLMENT-1",
  customerId: "C-REPAIR",
  customerSnapshot: { name: "修复客户" },
  method: "快递快运",
  expectedQty: 80,
  actualQty: 80,
  status: "待打印标签",
  latestNeededAt: "2026-07-11T09:00:00.000Z",
  createdBy: "U-AUTH",
  createdAt: "2026-07-11T08:30:00.000Z",
  updatedAt: "2026-07-11T08:30:00.000Z",
};
const repairPackages = [1, 2].map((packageSeq) => ({
  packageId: `PKG-REPAIR-${packageSeq}`,
  orderLineId: "OL-REPAIR-FULFILLMENT-1",
  packageSeq,
  packageCount: 2,
  packedQty: 40,
  status: "待打印标签",
}));
const repairQuery = buildRepairMissingFulfillmentTransactionQuery({
  beforeTodo: repairBefore,
  expectedUpdatedAt: repairBefore.updatedAt,
  completedTodo: repairCompleted,
  labelTodo: repairLabelTodo,
  fulfillment: repairFulfillment,
  packages: repairPackages,
  packingTask: { packingTaskId: "PKT-REPAIR-1", actualPackedQty: 80 },
  oldTodoEvent: { ...todoEvent, eventId: "TE-REPAIR-OLD", todoId: repairBefore.id, eventType: "fulfillment_repair_completed" },
  newTodoEvent: { ...todoEvent, eventId: "TE-REPAIR-NEW", todoId: repairLabelTodo.id, eventType: "todo_source:fulfillment_repaired" },
  operationLog: { ...operationLog, id: "LOG-REPAIR-FULFILLMENT-1", targetId: repairBefore.id, action: "repair_missing_fulfillment" },
});
assert.match(repairQuery.text, /locked_packages AS MATERIALIZED/);
assert.match(repairQuery.text, /ERP_TODO_FULFILLMENT_REPAIR_CONFLICT/);
assert.match(repairQuery.text, /INSERT INTO fulfillment_records/);
assert.match(repairQuery.text, /UPDATE packages/);
assert.match(repairQuery.text, /inserted_label_todo/);
assert.ok(repairQuery.values.includes("fulfillment_repair_completed"));
assert.match(repairQuery.text, /COMMIT;$/);
assert.ok(repairQuery.values.includes("F-REPAIR-OL-REPAIR-FULFILLMENT-1"));

console.log("Todo action repository checks passed: local concurrency/idempotency, PostgreSQL locks, events, logs, and atomic fulfillment repair are covered.");

function buildTodo(overrides = {}) {
  return {
    id: "T-REPO-1",
    todoId: "T-REPO-1",
    bizNo: "T-REPO-1",
    type: "标签待打印",
    refType: "fulfillment",
    refId: "F-REPO-1",
    ref: "F-REPO-1",
    priority: "普通",
    urgency: "普通",
    status: "未处理",
    summary: "待处理",
    dueAt: "2026-07-11T09:00:00.000Z",
    remindAt: "",
    handled: false,
    handledBy: "",
    handledAt: "",
    handlingResult: "",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-11T08:00:00.000Z",
    updatedAt: "2026-07-11T08:00:00.000Z",
    ...overrides,
  };
}
