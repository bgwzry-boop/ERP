import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";

export async function checkTodoApi(runtime, { baseUrl, headers, postJson }) {
  const { queryJson, runPsql } = runtime;
  const todoActionBody = {
    action: "customer_notification_sent",
    operatorId: "U-SPOOFED",
    operatorName: "伪造操作人",
    notificationContent: "PostgreSQL 待办持久化验证",
    handlingResult: "已人工通知客户",
    idempotencyKey: "todo-action-live-api-001",
  };
  const todoAction = await postJson(
    baseUrl,
    "/api/todos/T-LIVE-IDEMPOTENCY-001/handle",
    todoActionBody,
    { headers },
  );
  postgresAssertions.assertTodoAction({ todoAction });
  const replayedTodoAction = await postJson(
    baseUrl,
    "/api/todos/T-LIVE-IDEMPOTENCY-001/handle",
    todoActionBody,
    { headers },
  );
  assert.equal(replayedTodoAction.operationLogId, todoAction.operationLogId);
  const persistedTodoAction = queryJson(
    "SELECT json_build_object('status', status, 'handledBy', handled_by) AS result FROM todos WHERE id = 'T-LIVE-IDEMPOTENCY-001';",
  );
  assert.equal(persistedTodoAction.status, "已处理");
  assert.equal(persistedTodoAction.handledBy, "U-OFFICE-A");
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM todo_events WHERE todo_id = 'T-LIVE-IDEMPOTENCY-001';", { capture: true }).trim()),
    1,
  );
  const invalidTodoReferenceRepair = await postJson(
    baseUrl,
    "/api/todos/T-LIVE-IDEMPOTENCY-002/reference",
    { refType: "order_line", refId: "ORD-NOT-FOUND", reason: "PostgreSQL 无效引用验证" },
    { expectedStatus: 422, headers },
  );
  assert.equal(invalidTodoReferenceRepair.code, "TODO_REFERENCE_TARGET_NOT_FOUND");
  const todoReferenceRepair = await postJson(
    baseUrl,
    "/api/todos/T-LIVE-IDEMPOTENCY-002/reference",
    {
      refType: "order_line",
      refId: "ORD-0629-001-01",
      reason: "PostgreSQL 人工核对原始待办",
      idempotencyKey: "todo-reference-repair-live-api-001",
    },
    { headers },
  );
  postgresAssertions.assertTodoReferenceRepair({ todoReferenceRepair });
  const persistedTodoReference = queryJson(
    "SELECT json_build_object('refType', ref_type, 'refId', ref_id) AS result FROM todos WHERE id = 'T-LIVE-IDEMPOTENCY-002';",
  );
  assert.equal(persistedTodoReference.refType, "order_line");
  assert.equal(persistedTodoReference.refId, "ORD-0629-001-01");
  const customerPendingAction = await postJson(
    baseUrl,
    "/api/todos/T-LIVE-IDEMPOTENCY-002/handle",
    {
      action: "customer_pending",
      handlingResult: "客户待确认",
      idempotencyKey: "todo-customer-pending-live-api-001",
    },
    { headers },
  );
  postgresAssertions.assertCustomerPendingAction({ customerPendingAction });
  const persistedCustomerPending = queryJson(
    `SELECT json_build_object(
      'status', todo_record.status,
      'handledBy', todo_record.handled_by,
      'reminder', (
        SELECT event_payload->'todo'->>'reminder'
        FROM todo_events
        WHERE todo_id = todo_record.id
        ORDER BY occurred_at DESC, created_at DESC, id DESC
        LIMIT 1
      )
    ) AS result
    FROM todos AS todo_record
    WHERE todo_record.id = 'T-LIVE-IDEMPOTENCY-002';`,
  );
  postgresAssertions.assertPersistedCustomerPending({ persistedCustomerPending });
}
