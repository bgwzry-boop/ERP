import { createHash } from "node:crypto";
import { currentTodoReadSql, normalizeTodoLookupResult, todoEventJsonExpression, todoJsonExpression } from "./todoActionRepository.mjs";

function completionEvidence(input) {
  const evidence = input.labelPrintCompletion;
  if (!evidence) return null;
  const fulfillmentId = input.fulfillment?.fulfillmentId ?? input.fulfillment?.id;
  const printRecordId = input.printRecord?.printRecordId ?? input.printRecord?.id;
  if (input.operationLog?.action !== "confirm_fulfillment_print_from_driver"
    || evidence.fulfillmentId !== fulfillmentId || evidence.printRecordId !== printRecordId
    || !evidence.printJobId || evidence.jobStatus !== "printed"
    || input.printRecord?.targetType !== "fulfillment" || input.printRecord?.targetId !== fulfillmentId
    || (input.printJob && (input.printJob.printJobId !== evidence.printJobId || input.printJob.printRecordId !== printRecordId
      || input.printJob.targetType !== "fulfillment" || input.printJob.targetId !== fulfillmentId || input.printJob.jobStatus !== "printed"))
    || !["express_ltl_label","package_label"].includes(input.printRecord?.documentType)
    || !["printed", "reprinted"].includes(input.printRecord?.status)
    || !input.packages?.length || input.packages.some(record => record.labelPrintRecordId !== printRecordId || record.status !== "已打印标签")) {
    throw new Error("Current trusted label print evidence is required to complete print todos");
  }
  return evidence;
}

export function buildPrintTodoCompletionCtes(input, parameters) {
  const evidence = completionEvidence(input);
  if (!evidence) return `
    print_todo_source_guard AS MATERIALIZED (SELECT true AS ok),
    completed_label_todos AS (SELECT NULL::jsonb AS result, NULL::jsonb AS before WHERE false),
    inserted_label_todo_events AS (SELECT NULL::jsonb AS result WHERE false)`;
  const fulfillmentId = parameters.text(evidence.fulfillmentId);
  const printRecordId = parameters.text(evidence.printRecordId);
  const printJobId = parameters.text(evidence.printJobId);
  const operator = parameters.text(input.operationLog.operatorId);
  const timestamp = parameters.timestamp(input.operationLog.occurredAt);
  const logId = parameters.text(input.operationLog.id);
  const sourceExists = input.printJob
    ? `EXISTS (SELECT 1 FROM written_print_job WHERE result->>'printJobId' = ${printJobId} AND result->>'printRecordId' = ${printRecordId} AND result->>'targetType' = 'fulfillment' AND result->>'targetId' = ${fulfillmentId} AND result->>'jobStatus' = 'printed')`
    : `EXISTS (SELECT 1 FROM print_jobs WHERE id = ${printJobId} AND print_record_id = ${printRecordId} AND target_type = 'fulfillment' AND target_id = ${fulfillmentId} AND job_status = 'printed')`;
  return `
    print_todo_source_guard AS MATERIALIZED (
      SELECT erp_require(${sourceExists}, 'ERP_PRINT_TODO_SOURCE_CONFLICT') AS ok
    ),
    locked_label_todos AS MATERIALIZED (
      SELECT candidate.*, (${currentTodoReadSql("candidate.id")}) AS source_snapshot
      FROM todos candidate
      WHERE candidate.type = '待打印标签' AND candidate.ref_type = 'fulfillment'
        AND candidate.ref_id = ${fulfillmentId} AND candidate.status <> '已处理'
      ORDER BY candidate.id FOR UPDATE
    ),
    completed_label_todos AS (
      UPDATE todos SET status = '已处理', handled_by = ${operator}, handled_at = ${timestamp},
        handling_result = '当前标签已由可信打印结果确认',
        updated_at = GREATEST(todos.updated_at + INTERVAL '1 millisecond', ${timestamp})
      FROM locked_label_todos locked, print_todo_source_guard guard
      WHERE todos.id = locked.id AND guard.ok AND EXISTS (SELECT 1 FROM updated_fulfillment)
      RETURNING (${todoJsonExpression("todos")})::jsonb AS result, locked.source_snapshot::jsonb AS before
    ),
    inserted_label_todo_events AS (
      INSERT INTO todo_events (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
      SELECT 'TE-PRINT-' || md5(${logId} || chr(31) || (result->>'id')), result->>'id', 'trusted_label_print_completed',
        jsonb_build_object('todo', COALESCE(before #> '{todoEvent,eventPayload,todo}', '{}'::jsonb) || result || jsonb_build_object('lastAction', '可信标签打印完成'),
          'before', before->'todo', 'fulfillmentId', ${fulfillmentId}, 'printRecordId', ${printRecordId},
          'printJobId', ${printJobId}, 'operationLogId', ${logId}),
        ${operator}, ${timestamp}, ${timestamp}
      FROM completed_label_todos
      RETURNING (${todoEventJsonExpression("todo_events")})::jsonb AS result
    )`;
}

export const printTodoCompletionResultSql = `(SELECT COALESCE(json_agg(json_build_object('todo', completed.result, 'todoEvent', event.result) ORDER BY completed.result->>'id'), '[]'::json)
  FROM completed_label_todos completed JOIN inserted_label_todo_events event ON event.result->>'todoId' = completed.result->>'id')`;

export function completeLocalPrintTodos(input, workspace) {
  const evidence = completionEvidence(input);
  if (!evidence) return [];
  const result = [];
  const timestamp = input.operationLog.occurredAt;
  for (const before of workspace.todos ?? []) {
    if (before.type !== "待打印标签" || before.refType !== "fulfillment" || before.refId !== evidence.fulfillmentId
      || before.handled === true || before.status === "已处理") continue;
    const todo = { ...before, status: "已处理", handled: true, handledBy: input.operationLog.operatorId,
      handledAt: timestamp, handlingResult: "当前标签已由可信打印结果确认", lastAction: "可信标签打印完成",
      updatedAt: new Date(Math.max(Date.parse(before.updatedAt) + 1 || 0, Date.parse(timestamp))).toISOString() };
    const eventId = `TE-PRINT-${createHash("md5").update(`${input.operationLog.id}\x1f${todo.id}`).digest("hex")}`;
    if ((workspace.todoEvents ?? []).some(event => event.eventId === eventId)) throw new Error("Print todo audit identity already exists");
    const todoEvent = { eventId, todoId: todo.id, eventType: "trusted_label_print_completed",
      eventPayload: { todo, before, fulfillmentId: evidence.fulfillmentId, printRecordId: evidence.printRecordId,
        printJobId: evidence.printJobId, operationLogId: input.operationLog.id },
      operatorId: input.operationLog.operatorId, occurredAt: timestamp, createdAt: timestamp };
    result.push({ todo, todoEvent });
  }
  mergePrintTodoCompletion(workspace, result);
  return result;
}

export function mergePrintTodoCompletion(workspace, receipts, currentTodos) {
  for (const receipt of receipts ?? []) {
    const todo = currentTodos ? currentTodos.find(record => record.id === receipt.todo?.id) : normalizeTodoLookupResult(receipt);
    if (!todo) throw new Error("Print todo completion is missing its current todo");
    const before = (workspace.todos ?? []).find(record => record.id === todo.id);
    if (!before || !(Date.parse(before.updatedAt) > Date.parse(todo.updatedAt))) {
      workspace.todos = [todo, ...(workspace.todos ?? []).filter(record => record.id !== todo.id)];
    }
    if (receipt.todoEvent) workspace.todoEvents = [receipt.todoEvent, ...(workspace.todoEvents ?? []).filter(event => event.eventId !== receipt.todoEvent.eventId)];
  }
}
