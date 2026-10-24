// The paper and its print request must be explicitly voided before an order changes.
const voidStatuses = new Set(["voided", "invalidated", "已作废", "已取消"]);
const terminalJobs = new Set(["preview_only", "printed", "failed", "canceled"]);
const idOf = row => row?.fulfillmentId ?? row?.id;
const lineOf = row => row?.orderLineId ?? row?.lineId ?? row?.order_line_id;
export function hasOrderActiveDocuments(workspace = {}, orderLineId) {
  const deliveries = (workspace.fulfillments ?? []).filter(row => lineOf(row) === orderLineId);
  const ids = new Set(deliveries.flatMap(row => [idOf(row), row.packingGroupAnchorId ?? row.packing_group_anchor_id]).filter(Boolean));
  const targetMatches = row => ((row.targetType ?? row.target_type) === "fulfillment" && ids.has(row.targetId ?? row.target_id))
    || ((row.targetType ?? row.target_type) === "order_line" && (row.targetId ?? row.target_id) === orderLineId);
  return (workspace.paperOutboundDocuments ?? []).some(row => ids.has(row.fulfillmentId ?? row.fulfillment_id) && !voidStatuses.has(row.status))
    || (workspace.printRecords ?? []).some(row => targetMatches(row) && !voidStatuses.has(row.status) && row.status !== "previewed")
    || (workspace.printJobs ?? []).some(row => targetMatches(row) && !terminalJobs.has(row.jobStatus ?? row.job_status));
}
export function assertOrderDocumentsVoided(workspace, orderLineId) {
  if (hasOrderActiveDocuments(workspace, orderLineId)) throw Object.assign(new Error("请先作废旧单据再改单；改单后重印。"), {statusCode:409, code:"ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT"});
}
export function orderMutationDocumentLocksSql(lineId) {
  const ids = `SELECT id FROM fulfillment_records WHERE order_line_id = ${lineId} UNION SELECT packing_group_anchor_id FROM fulfillment_records WHERE order_line_id = ${lineId} AND packing_group_anchor_id IS NOT NULL`;
  return `locked_mutation_papers AS MATERIALIZED (
    SELECT paper.* FROM paper_outbound_documents paper WHERE paper.fulfillment_id IN (${ids}) ORDER BY paper.id FOR UPDATE OF paper
  ), locked_mutation_prints AS MATERIALIZED (
    SELECT record.* FROM print_records record WHERE (record.target_type='fulfillment' AND record.target_id IN (${ids})) OR (record.target_type='order_line' AND record.target_id=${lineId}) ORDER BY record.id FOR UPDATE OF record
  ), locked_mutation_print_jobs AS MATERIALIZED (
    SELECT job.* FROM print_jobs job WHERE (job.target_type='fulfillment' AND job.target_id IN (${ids})) OR (job.target_type='order_line' AND job.target_id=${lineId}) ORDER BY job.id FOR UPDATE OF job
  ),`;
}
export function orderMutationDocumentGuardSql() {
  return `AND erp_require(
    NOT EXISTS(SELECT 1 FROM locked_mutation_papers WHERE status NOT IN ('voided','invalidated','已作废','已取消'))
    AND NOT EXISTS(SELECT 1 FROM locked_mutation_prints WHERE status NOT IN ('voided','invalidated','已作废','已取消','previewed'))
    AND NOT EXISTS(SELECT 1 FROM locked_mutation_print_jobs WHERE job_status NOT IN ('preview_only','printed','failed','canceled')),
    'ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT')`;
}
