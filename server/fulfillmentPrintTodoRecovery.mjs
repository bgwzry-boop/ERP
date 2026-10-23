import { createHash } from "node:crypto";
import { todoEventJsonExpression, todoJsonExpression } from "./todoActionRepository.mjs";
import { mergePrintTodoCompletion } from "./fulfillmentPrintTodoCompletion.mjs";

function recoveryReceipt(input) {
  const source = input.labelPrintInvalidation;
  if (!source) return null;
  const fulfillmentId = input.fulfillment?.fulfillmentId ?? input.fulfillment?.id;
  const recordId = input.printRecord?.printRecordId ?? input.printRecord?.id;
  const before = input.operationLog?.before;
  const oldPackages = before?.packages ?? [];
  if (input.operationLog?.action !== "void_print_record"
    || !source.fulfillmentId || source.fulfillmentId !== fulfillmentId || source.printRecordId !== recordId
    || input.fulfillment?.status !== "待打印标签" || input.printRecord?.status !== "voided"
    || input.printRecord?.targetType !== "fulfillment" || input.printRecord?.targetId !== fulfillmentId
    || !["printed", "reprinted"].includes(before?.printRecord?.status)
    || (before?.printRecord?.printRecordId ?? before?.printRecord?.id) !== recordId
    || !input.packages?.length || oldPackages.length !== input.packages.length
    || input.packages.some(item => {
      const previous = oldPackages.find(old => (old.packageId ?? old.id) === (item.packageId ?? item.id));
      return !previous || (previous.fulfillmentId ?? previous.fulfillment_id) !== fulfillmentId
        || (previous.labelPrintRecordId ?? previous.label_print_record_id) !== recordId
        || item.labelPrintRecordId !== "" || item.status !== "待打印标签"
        || item.revision !== Number(previous.revision) + 1;
    })) throw new Error("Current label invalidation evidence is required to recover a print todo");
  const digest = createHash("sha256").update(`${fulfillmentId}\x1f${recordId}`).digest("hex");
  const id = `T-LABEL-VOID-${digest}`;
  const timestamp = input.operationLog.occurredAt;
  const todo = {
    id, todoId: id, bizNo: id, type: "待打印标签", refType: "fulfillment", refId: fulfillmentId, ref: fulfillmentId,
    customerId: input.fulfillment.customerId, status: "未处理", handled: false, priority: "普通",
    summary: `标签已作废，${input.packages.length} 包需要重新打印。`,
    lastAction: "标签作废后待重打", createdBy: input.operationLog.operatorId, createdAt: timestamp, updatedAt: timestamp,
  };
  const todoEvent = {
    eventId: `TE-LABEL-VOID-${digest}`, todoId: id, eventType: "label_voided_reprint_required",
    eventPayload: { todo, fulfillmentId, printRecordId: recordId, operationLogId: input.operationLog.id },
    operatorId: input.operationLog.operatorId, occurredAt: timestamp, createdAt: timestamp,
  };
  return { todo, todoEvent };
}

export function recoverLocalPrintTodo(input, workspace) {
  const receipt = recoveryReceipt(input);
  if (!receipt) return [];
  if ((workspace.todos ?? []).some(todo => todo.id === receipt.todo.id)
    || (workspace.todoEvents ?? []).some(event => event.eventId === receipt.todoEvent.eventId)) {
    throw new Error("Label void recovery identity already exists");
  }
  mergePrintTodoCompletion(workspace, [receipt]);
  return [receipt];
}

export function buildPrintTodoRecoveryCtes(input, parameters) {
  const receipt = recoveryReceipt(input);
  if (!receipt) return `print_todo_recovery_guard AS MATERIALIZED (SELECT true AS ok),
    recovered_label_todo AS (SELECT NULL::jsonb AS result WHERE false),
    inserted_label_recovery_event AS (SELECT NULL::jsonb AS result WHERE false)`;
  const { todo, todoEvent } = receipt;
  const id = parameters.text(todo.id), fulfillmentId = parameters.text(todo.refId);
  const recordId = parameters.text(input.labelPrintInvalidation.printRecordId);
  const operator = parameters.text(todo.createdBy), timestamp = parameters.timestamp(todo.createdAt);
  return `print_todo_recovery_guard AS MATERIALIZED (
      SELECT erp_require(
        EXISTS (SELECT 1 FROM updated_fulfillment WHERE result->>'fulfillmentId' = ${fulfillmentId})
        AND EXISTS (SELECT 1 FROM inserted_print_record WHERE result->>'printRecordId' = ${recordId} AND result->>'status' = 'voided')
        AND (SELECT count(*) FROM updated_packages WHERE result->>'status' = '待打印标签'
          AND COALESCE(result->>'labelPrintRecordId', '') = '') = ${parameters.integer(input.packages.length)},
        'ERP_PRINT_TODO_RECOVERY_SOURCE_CONFLICT') AS ok
    ), recovered_label_todo AS (
      INSERT INTO todos (id, biz_no, type, ref_type, ref_id, priority, status, summary, created_by, created_at, updated_at)
      SELECT ${id}, ${id}, '待打印标签', 'fulfillment', ${fulfillmentId}, '普通', '未处理',
        ${parameters.text(todo.summary)}, ${operator}, ${timestamp}, ${timestamp}
      FROM print_todo_recovery_guard WHERE ok
      RETURNING (${todoJsonExpression("todos")})::jsonb AS result
    ), inserted_label_recovery_event AS (
      INSERT INTO todo_events (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
      SELECT ${parameters.text(todoEvent.eventId)}, ${id}, 'label_voided_reprint_required',
        ${parameters.json(todoEvent.eventPayload)}, ${operator}, ${timestamp}, ${timestamp}
      FROM recovered_label_todo
      RETURNING (${todoEventJsonExpression("todo_events")})::jsonb AS result
    )`;
}

export const printTodoRecoveryResultSql = `(SELECT COALESCE(json_agg(json_build_object('todo', recovered.result, 'todoEvent', event.result)), '[]'::json)
  FROM recovered_label_todo recovered JOIN inserted_label_recovery_event event ON event.result->>'todoId' = recovered.result->>'id')`;
