import assert from "node:assert/strict";
import { createLocalTodoActionRepository } from "../server/todoActionRepository.mjs";
import { createTodoCommandService } from "../server/services/todoCommandService.mjs";
import { getAllowedTodoReferenceTypes, getTodoReferenceTypeLabel, listTodoReferenceCandidates, normalizeTodoReferenceForWrite, resolveTodoReference } from "../server/services/todoReferenceService.mjs";

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
    {
      id: "T-CMD-REPAIR",
      todoId: "T-CMD-REPAIR",
      type: "订单异常",
      customerId: "C-REPAIR",
      refType: "order_line",
      refId: "ORD-MISSING",
      ref: "ORD-MISSING",
      status: "未处理",
      handled: false,
      createdAt: "2026-07-11T08:00:00.000Z",
      updatedAt: "2026-07-11T08:00:00.000Z",
    },
    {
      id: "T-CMD-DRAFT",
      type: "订单草稿待确认",
      customerId: "C-REPAIR",
      refType: "order_draft",
      refId: "DRAFT-MISSING",
      status: "未处理",
      handled: false,
      updatedAt: "2026-07-11T08:00:00.000Z",
    },
    {
      id: "T-CMD-CANDIDATE",
      type: "待打印标签",
      customerId: "C-REPAIR",
      refType: "fulfillment",
      refId: "F-MISSING",
      status: "未处理",
      handled: false,
      updatedAt: "2026-07-11T08:00:00.000Z",
    },
    {
      id: "T-CMD-FULFILLMENT-REPAIR",
      type: "出库交付待补建",
      customerId: "C-REPAIR",
      refType: "order_line",
      refId: "ORD-FULFILLMENT-REPAIR-01",
      ref: "ORD-FULFILLMENT-REPAIR-01",
      status: "未处理",
      handled: false,
      summary: "已打包但缺少出库交付记录",
      createdAt: "2026-07-11T08:00:00.000Z",
      updatedAt: "2026-07-11T08:00:00.000Z",
    },
  ],
  customers: [{ id: "C-REPAIR", name: "修复测试客户", contact: "测试联系人" }],
  orderLines: [
    { id: "ORD-REPAIR-01", orderNo: "ORD-REPAIR", customerId: "C-REPAIR", status: "待生产" },
    {
      id: "ORD-FULFILLMENT-REPAIR-01",
      orderNo: "ORD-FULFILLMENT-REPAIR",
      customerId: "C-REPAIR",
      product: "活动袋",
      size: "35*27",
      color: "白色",
      qty: 80,
      fulfillment: "快递快运",
      status: "待打印标签",
      latest: "2026-07-11T10:00:00.000Z",
    },
  ],
  fulfillments: [{ id: "F-REPAIR-01", lineId: "ORD-REPAIR-01", status: "待打印标签" }],
  packingTasks: [{
    id: "PKT-FULFILLMENT-REPAIR-01",
    packingTaskId: "PKT-FULFILLMENT-REPAIR-01",
    orderLineId: "ORD-FULFILLMENT-REPAIR-01",
    actualPackedQty: 80,
    status: "已完成",
  }],
  packages: [
    { id: "PKG-FULFILLMENT-REPAIR-01", packageId: "PKG-FULFILLMENT-REPAIR-01", orderLineId: "ORD-FULFILLMENT-REPAIR-01", packageSeq: 1, packageCount: 2, packedQty: 40, fulfillmentId: "", status: "待打印标签" },
    { id: "PKG-FULFILLMENT-REPAIR-02", packageId: "PKG-FULFILLMENT-REPAIR-02", orderLineId: "ORD-FULFILLMENT-REPAIR-01", packageSeq: 2, packageCount: 2, packedQty: 40, fulfillmentId: "", status: "待打印标签" },
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

const customerPending = await service.handleTodo({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: {
    action: "customer_pending",
    handlingResult: "客户待确认",
    idempotencyKey: "todo-command-customer-pending-001",
  },
});
assert.equal(customerPending.todo.handled, false);
assert.equal(customerPending.todo.status, "未处理");
assert.equal(customerPending.todo.reminder, "等待客户回复");
assert.equal(customerPending.todo.lastAction, "客户待确认");

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

const invalidRepair = await service.repairTodoReference({
  workspace,
  todoId: "T-CMD-REPAIR",
  operatorId: "U-AUTH",
  body: { refType: "order_line", refId: "ORD-NOT-FOUND", reason: "核对原始消息" },
});
assert.equal(invalidRepair.code, "TODO_REFERENCE_TARGET_NOT_FOUND");
const incompatibleRepair = await service.repairTodoReference({
  workspace,
  todoId: "T-CMD-DRAFT",
  operatorId: "U-AUTH",
  body: { refType: "order_line", refId: "ORD-REPAIR-01", reason: "错误类型回归" },
});
assert.equal(incompatibleRepair.code, "TODO_REFERENCE_TYPE_INCOMPATIBLE");
const repaired = await service.repairTodoReference({
  workspace,
  todoId: "T-CMD-REPAIR",
  operatorId: "U-AUTH",
  operatorName: "认证办公室",
  body: { refType: "order_line", refId: "ORD-REPAIR-01", reason: "核对原始消息", idempotencyKey: "todo-repair-001" },
});
assert.equal(repaired.todo.refId, "ORD-REPAIR-01");
assert.equal(repaired.todo.referenceRepair.beforeRefId, "ORD-MISSING");
assert.equal(repaired.todo.referenceRepair.operatorId, "U-AUTH");
assert.equal(workspace.todoEvents[0].eventType, "repair_todo_reference");
assert.equal(workspace.operationLogs[0].action, "repair_todo_reference");
assert.equal((await service.repairTodoReference({
  workspace,
  todoId: "T-CMD-REPAIR",
  operatorId: "U-AUTH",
  body: { refType: "order_line", refId: "ORD-REPAIR-01", reason: "重复修复" },
})).code, "TODO_REFERENCE_STILL_VALID");
assert.equal((await service.repairTodoReference({
  workspace,
  todoId: "T-CMD-1",
  operatorId: "U-AUTH",
  body: { refType: "order_line", refId: "ORD-REPAIR-01", reason: "已处理待办" },
})).code, "TODO_ALREADY_HANDLED");

const fulfillmentRepair = await service.repairMissingFulfillment({
  workspace,
  todoId: "T-CMD-FULFILLMENT-REPAIR",
  operatorId: "U-AUTH",
  operatorName: "认证办公室",
  body: {
    reason: "根据打包完成记录补建",
    idempotencyKey: "todo-fulfillment-repair-001",
  },
});
assert.equal(fulfillmentRepair.todo.handled, true);
assert.equal(fulfillmentRepair.fulfillment.status, "待打印标签");
assert.equal(fulfillmentRepair.fulfillment.actualQty, 80);
assert.equal(fulfillmentRepair.labelTodo.type, "待打印标签");
assert.equal(fulfillmentRepair.labelTodo.refId, fulfillmentRepair.fulfillment.fulfillmentId);
assert.equal(fulfillmentRepair.packages.length, 2);
assert.ok(fulfillmentRepair.packages.every((record) => record.fulfillmentId === fulfillmentRepair.fulfillment.fulfillmentId));
assert.equal(workspace.fulfillments.some((record) => record.id === fulfillmentRepair.fulfillment.fulfillmentId), true);
assert.equal(workspace.todos.some((todo) => todo.id === fulfillmentRepair.labelTodo.id && !todo.handled), true);
assert.equal(workspace.operationLogs[0].action, "repair_missing_fulfillment");
const fulfillmentRepairReplay = await service.repairMissingFulfillment({
  workspace,
  todoId: "T-CMD-FULFILLMENT-REPAIR",
  operatorId: "U-AUTH",
  operatorName: "认证办公室",
  body: {
    reason: "根据打包完成记录补建",
    idempotencyKey: "todo-fulfillment-repair-001",
  },
});
assert.equal(fulfillmentRepairReplay.fulfillment.fulfillmentId, fulfillmentRepair.fulfillment.fulfillmentId);
assert.equal(workspace.fulfillments.filter((record) => record.lineId === "ORD-FULFILLMENT-REPAIR-01").length, 1);

const referenceWorkspace = {
  orderDrafts: [{ id: "DRAFT-VALID-1" }],
  orderLines: [{ id: "ORD-VALID-1-01", orderNo: "ORD-VALID-1" }],
  fulfillments: [{ id: "F-VALID-1", lineId: "ORD-VALID-1-01" }],
  statements: [{ id: "ST-VALID-1", lineIds: ["ORD-VALID-1-01"] }],
};
assert.equal(resolveTodoReference(referenceWorkspace, { type: "订单草稿待确认", ref: "DRAFT-VALID-1" }).referenceStatus, "valid");
assert.equal(resolveTodoReference(referenceWorkspace, { type: "快递待确认", ref: "ORD-VALID-1" }).resolvedRefId, "F-VALID-1");
assert.equal(resolveTodoReference(referenceWorkspace, { refType: "statement", refId: "ST-MISSING" }).referenceStatus, "missing");
assert.equal(resolveTodoReference(referenceWorkspace, { refType: "external_review", refId: "EXT-1" }).referenceStatus, "unverifiable");
assert.equal(resolveTodoReference(referenceWorkspace, { type: "订单草稿待确认", refType: "fulfillment", refId: "F-VALID-1" }).referenceReason, "引用类型与当前待办业务不兼容");
assert.deepEqual(
  normalizeTodoReferenceForWrite(referenceWorkspace, { type: "待打印标签", ref: "F-VALID-1" }),
  { type: "待打印标签", ref: "F-VALID-1", refType: "fulfillment", refId: "F-VALID-1" },
);
assert.deepEqual(
  normalizeTodoReferenceForWrite(referenceWorkspace, { type: "出库交付待补建", refType: "order_line", refId: "ORD-VALID-1-01" }),
  { type: "出库交付待补建", ref: "ORD-VALID-1-01", refType: "order_line", refId: "ORD-VALID-1-01" },
);
assert.throws(
  () => normalizeTodoReferenceForWrite(referenceWorkspace, { type: "订单草稿待确认", refType: "fulfillment", refId: "F-VALID-1" }),
  (error) => error.code === "TODO_REFERENCE_TYPE_INCOMPATIBLE",
);
assert.throws(
  () => normalizeTodoReferenceForWrite(referenceWorkspace, { type: "待打印标签", refType: "fulfillment", refId: "F-MISSING" }),
  (error) => error.code === "TODO_REFERENCE_TARGET_NOT_FOUND",
);
assert.throws(
  () => normalizeTodoReferenceForWrite(referenceWorkspace, { type: "待核对", refType: "external_review", refId: "EXT-1" }),
  (error) => error.code === "TODO_REFERENCE_TYPE_UNSUPPORTED",
);
assert.deepEqual(getAllowedTodoReferenceTypes({ type: "缺货待处理" }), ["order_line", "inventory_item"]);
assert.equal(getTodoReferenceTypeLabel("order_line"), "订单行");
assert.deepEqual(listTodoReferenceCandidates(workspace, workspace.todos.find((todo) => todo.id === "T-CMD-CANDIDATE")), [{
  refType: "fulfillment",
  refId: "F-REPAIR-01",
  label: "出库交付 · F-REPAIR-01 · 待打印标签",
}, {
  refType: "fulfillment",
  refId: "F-REPAIR-ORD-FULFILLMENT-REPAIR-01",
  label: "出库交付 · F-REPAIR-ORD-FULFILLMENT-REPAIR-01 · 待打印标签",
}]);
assert.deepEqual(listTodoReferenceCandidates(workspace, workspace.todos.find((todo) => todo.id === "T-CMD-DRAFT")), []);
assert.deepEqual(getAllowedTodoReferenceTypes({ type: "订单草稿待确认" }), ["order_draft"]);
assert.deepEqual(getAllowedTodoReferenceTypes({ type: "待打印标签" }), ["fulfillment"]);
assert.deepEqual(getAllowedTodoReferenceTypes({ type: "出库交付待补建", refType: "order_line" }), ["order_line"]);
assert.deepEqual(getAllowedTodoReferenceTypes({ type: "待生成对账" }), ["statement"]);
assert.deepEqual(getAllowedTodoReferenceTypes({ type: "生产异常" }), ["production_task"]);
assert.deepEqual(listTodoReferenceCandidates(referenceWorkspace, { type: "待生成对账", refType: "statement", refId: "ST-MISSING" }), [{
  refType: "statement",
  refId: "ST-VALID-1",
  label: "对账单 · ST-VALID-1",
}]);

console.log("Todo command service checks passed: actions, references, fulfillment repair, replay, audit, and invalid targets are isolated.");
