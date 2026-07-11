import assert from "node:assert/strict";
import { createLocalTodoActionRepository } from "../server/todoActionRepository.mjs";
import { createTodoCommandService } from "../server/services/todoCommandService.mjs";

const fixedNow = new Date("2026-07-11T08:30:00.000Z");
const workspace = {
  todos: [
    {
      id: "T-CMD-1",
      todoId: "T-CMD-1",
      type: "标签待打印",
      refType: "fulfillment",
      refId: "F-CMD-1",
      ref: "F-CMD-1",
      priority: "普通",
      urgency: "普通",
      status: "未处理",
      summary: "待处理",
      handled: false,
      createdAt: "2026-07-11T08:00:00.000Z",
      updatedAt: "2026-07-11T08:00:00.000Z",
    },
  ],
  todoEvents: [],
  operationLogs: [],
  todoActionRepository: createLocalTodoActionRepository(),
};
const service = createTodoCommandService({
  now: () => fixedNow,
  buildOperationLog(_workspace, input) {
    return {
      id: input.id,
      ...input,
      pageKey: "api",
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };
  },
});

const handled = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  operatorName: "认证办公室",
  body: {
    action: "mark_handled",
    operatorId: "U-SPOOFED",
    handlingResult: "已完成",
    idempotencyKey: "todo-command-handle-001",
  },
});
assert.equal(handled.todo.handled, true);
assert.equal(handled.todo.handledBy, "U-AUTH");
assert.equal(handled.todo.handledAt, fixedNow.toISOString());
assert.match(handled.operationLogId, /^LOG-TODO-[A-F0-9]{20}$/);
assert.equal(workspace.todoEvents[0].operatorId, "U-AUTH");
assert.equal(workspace.todoEvents[0].eventPayload.operatorName, "认证办公室");

const reopened = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: { action: "reopen", idempotencyKey: "todo-command-reopen-001" },
});
assert.equal(reopened.todo.handled, false);
assert.equal(reopened.todo.handledBy, "");
assert.equal(reopened.todo.status, "未处理");

const snoozed = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: { action: "snooze", reason: "稍后2小时", idempotencyKey: "todo-command-snooze-001" },
});
assert.equal(snoozed.todo.reminder, "2 小时后");
assert.equal(snoozed.todo.remindAt, "2026-07-11T10:30:00.000Z");

const copied = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: {
    action: "customer_notification_copied",
    operatorId: "U-SPOOFED",
    notificationContent: "请确认",
    idempotencyKey: "todo-command-copy-001",
  },
});
assert.equal(copied.todo.notificationCopiedBy, "U-AUTH");
assert.equal(copied.todo.notificationCopyText, "请确认");

const pending = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: {
    action: "batch_print_result_pending",
    reason: "不确定",
    printResultStatus: "unknown",
    totalLabelCount: 2,
    pendingLabelCount: 2,
    pendingPackageIds: ["PKG-1", "PKG-2"],
    printPackages: [{ packageId: "PKG-1", status: "unknown" }],
    idempotencyKey: "todo-command-print-001",
  },
});
assert.equal(pending.todo.priority, "异常");
assert.equal(pending.todo.printResultStatus, "unknown");
assert.deepEqual(pending.todo.pendingPackageIds, ["PKG-1", "PKG-2"]);

const sent = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: {
    action: "customer_notification_sent",
    operatorId: "U-SPOOFED",
    idempotencyKey: "todo-command-send-001",
  },
});
assert.equal(sent.todo.handled, true);
assert.equal(sent.todo.notifiedBy, "U-AUTH");

const unsupported = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: { action: "delete" },
});
assert.equal(unsupported.code, "VALIDATION_ERROR");
const missing = await service.handleTodo({
  workspace,
  todoId: "T-MISSING",
  operatorId: "U-AUTH",
  body: { action: "mark_viewed" },
});
assert.equal(missing.code, "TODO_NOT_FOUND");

console.log("Todo command service checks passed: actions, authenticated identity, timestamps, and event projection are isolated.");
