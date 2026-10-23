import { normalizeCoreWorkspaceState } from "./coreWorkspaceReadRepository.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { normalizePrintJobRecord } from "./printJobRepository.mjs";
import { currentTodoReadSql, normalizeTodoLookupResult } from "./todoActionRepository.mjs";
import { mergePrintTodoCompletion } from "./fulfillmentPrintTodoCompletion.mjs";
import { hasTrustedCurrentFulfillmentLabel } from "./services/printJobBusinessProjectionService.mjs";
import { acceptsWorkspaceRecordVersion as acceptsCurrent } from "./workspaceRecordVersion.mjs";

const printActions = new Set([
  "print_fulfillment", "void_print_record", "confirm_fulfillment_print_from_driver",
  "record_stale_fulfillment_label_print", "sync_print_record_from_job",
]);
export const isFulfillmentPrintAction = action => printActions.has(action);

export async function readFulfillmentPrintCurrentState(queryJson, receipt) {
  const parameters = createPostgresParameterBinder();
  const fulfillmentId = parameters.text(receipt.fulfillment.fulfillmentId);
  const logIds = [receipt.operationLogId, receipt.printJobOperationLogId].filter(Boolean);
  if (!logIds.length) throw new Error("Print receipt is missing its audit identity");
  const logs = logIds.map(id => parameters.text(id)).join(", ");
  const todoReceipts = [...receipt.completedPrintTodos, ...receipt.recoveredPrintTodos];
  const todoIds = todoReceipts.map(item => item.todo.id);
  const receiptTodoWhere = todoIds.length ? `record.id IN (${todoIds.map(id => parameters.text(id)).join(", ")})` : "false";
  const todoWhere = `(${receiptTodoWhere}) OR (record.ref_type = 'fulfillment' AND record.ref_id = ${fulfillmentId})`;
  const orderLineId = `(SELECT order_line_id FROM fulfillment_records WHERE id = ${fulfillmentId})`;
  const rows = (table, predicate, expression = "to_jsonb(record)") => `(SELECT COALESCE(json_agg(${expression} ORDER BY record.id), '[]'::json) FROM ${table} record WHERE ${predicate})`;
  const printRecordRows = rows("print_records", `record.target_type = 'fulfillment' AND record.target_id = ${fulfillmentId}`,
    `to_jsonb(record) || jsonb_build_object('document_type', (
      SELECT job.document_type FROM print_jobs job WHERE job.print_record_id = record.id
      ORDER BY job.created_at DESC, job.id DESC LIMIT 1))`);
  const text = `SELECT json_build_object(
    'printState', json_build_object(
      'fulfillments', ${rows("fulfillment_records", `record.id = ${fulfillmentId}`)},
      'packages', ${rows("packages", `record.fulfillment_id = ${fulfillmentId}`)},
      'orderLines', ${rows("order_lines", `record.id = ${orderLineId}`)},
      'inventoryReservations', ${rows("inventory_reservations", `record.order_line_id = ${orderLineId}`)},
      'inventories', ${rows("inventory_items", `record.id IN (SELECT inventory_item_id FROM inventory_reservations WHERE order_line_id = ${orderLineId})`)},
      'printRecords', ${printRecordRows},
      'paperOutboundDocuments', ${rows("paper_outbound_documents", `record.fulfillment_id = ${fulfillmentId}`)},
      'warehouseOutboundExecutions', ${rows("warehouse_outbound_executions", `record.fulfillment_id = ${fulfillmentId}`)},
      'operationLogs', ${rows("operation_logs", `record.id IN (${logs})`)}
    ),
    'printJobs', ${rows("print_jobs", `record.target_type = 'fulfillment' AND record.target_id = ${fulfillmentId}`)},
    'todos', ${rows("todos", todoWhere, `(${currentTodoReadSql("record.id")})`)}
  ) AS result;`;
  const result = await queryJson(text, parameters.values);
  const state = normalizeCoreWorkspaceState(result?.printState);
  state.printJobs = (result?.printJobs ?? []).map(normalizePrintJobRecord);
  const todos = (result?.todos ?? []).map(normalizeTodoLookupResult);
  const operationLog = state.operationLogs.find(log => log.id === receipt.operationLogId);
  const jobLog = state.operationLogs.find(log => log.id === receipt.printJobOperationLogId);
  const sourceMatches = operationLog && (
    (operationLog.targetType === "fulfillment" && operationLog.targetId === receipt.fulfillment.fulfillmentId)
    || (operationLog.targetType === "print_record" && operationLog.targetId === receipt.printRecord?.printRecordId));
  if (state.fulfillments.length !== 1 || state.fulfillments[0].fulfillmentId !== receipt.fulfillment.fulfillmentId
    || !sourceMatches || (receipt.printJobOperationLogId && (jobLog?.targetType !== "print_job" || jobLog.targetId !== receipt.printJob?.printJobId))
    || state.printJobs.some(job => !job) || logIds.some(id => !state.operationLogs.some(log => log.id === id))
    || todoIds.some(id => !todos.some(todo => todo?.id === id))
    || (receipt.printRecord && !state.printRecords.some(record => record.id === receipt.printRecord.printRecordId))
    || (receipt.printJob && !state.printJobs.some(job => job?.printJobId === receipt.printJob.printJobId))) {
    throw new Error("Current fulfillment print state or original audit evidence is unavailable");
  }
  return { state, todos, todoReceipts, currentTodoReceipts: result.todos };
}

function recordId(record, key = "id") { return record?.[key] ?? record?.id; }
function mergeVersioned(rows, current, key = "id") {
  const id = recordId(current, key);
  const previous = rows.find(record => recordId(record, key) === id);
  if (!acceptsCurrent(previous, current)) return rows;
  return [current, ...rows.filter(record => recordId(record, key) !== id)];
}

export function mergeFulfillmentPrintCurrentState(workspace, snapshot) {
  if (!workspace) return;
  const { state, todos, todoReceipts, currentTodoReceipts } = snapshot;
  const fulfillment = state.fulfillments[0];
  const id = fulfillment.fulfillmentId;
  const previous = (workspace.fulfillments ?? []).find(record => (record.fulfillmentId ?? record.id) === id);
  const acceptParent = acceptsCurrent(previous, fulfillment);
  for (const record of state.packages) workspace.packages = mergeVersioned(workspace.packages ?? [], record, "packageId");
  for (const job of state.printJobs) workspace.printJobs = mergeVersioned(workspace.printJobs ?? [], job, "printJobId");
  if (acceptParent) {
    // Print records have no independent revision; their parent transaction owns
    // ordering. A delayed older parent read may never replace newer labels.
    const foreignRecords = (workspace.printRecords ?? []).filter(record => record.targetType !== "fulfillment" || record.targetId !== id);
    workspace.printRecords = [...state.printRecords, ...foreignRecords];
    for (const key of ["paperOutboundDocuments", "warehouseOutboundExecutions"]) {
      for (const record of state[key]) workspace[key] = mergeVersioned(workspace[key] ?? [], record);
    }
    const packages = (workspace.packages ?? []).filter(record => record.fulfillmentId === id);
    const paper = (workspace.paperOutboundDocuments ?? []).find(record => (record.paperOutboundDocumentId ?? record.id) === fulfillment.paperOutboundDocumentId);
    const paperPrint = paper && (workspace.printRecords ?? []).find(record => (record.printRecordId ?? record.id) === paper.printRecordId);
    const current = { ...fulfillment, packageRecords: packages,
      labelsPrinted: ["express_ltl", "快递快运"].includes(fulfillment.method) && hasTrustedCurrentFulfillmentLabel(workspace, fulfillment),
      printed: Boolean(paper && paper.status !== "已作废" && ["printed", "reprinted"].includes(paperPrint?.status)),
    };
    workspace.fulfillments = mergeVersioned(workspace.fulfillments ?? [], current);
  }
  mergePrintTodoCompletion(workspace, currentTodoReceipts, todos);
  mergePrintTodoCompletion(workspace, todoReceipts, todos);
  for (const log of state.operationLogs) workspace.operationLogs = [log, ...(workspace.operationLogs ?? []).filter(record => record.id !== log.id)];
}
