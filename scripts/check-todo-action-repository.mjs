import assert from "node:assert/strict";
import {
  buildGetTodoActionStateQuery,
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
  todo: after,
  todoEvent,
  operationLog,
});
assert.equal(localResult.todo.notificationStatus, "已通知客户");
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
assert.match(writeQuery.text, /COMMIT;$/);
assert.ok(writeQuery.values.length > 20);

console.log("Todo action repository checks passed: local projection, row lock, optimistic guard, events, logs, and replay are covered.");

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
