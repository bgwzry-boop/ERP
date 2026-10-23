const text = value => String(value ?? '').trim();
const number = value => value === null || value === undefined || String(value).trim() === '' ? null : Number(value);
export function captureStatementExportSnapshot(workspace, statementId) {
  const statement = (workspace.statements ?? []).find(row => text(row.id ?? row.statementId) === statementId);
  const header = decisionStatementSnapshot(statement);
  if (!header) return null;
  const lines = (workspace.statementLines ?? []).filter(row => text(row.statementId ?? row.statement_id) === statementId).map(row => ({
    id: text(row.statementLineId ?? row.id), orderLineId: text(row.orderLineId ?? row.order_line_id),
    fulfillmentId: text(row.fulfillmentId ?? row.fulfillment_id),
    deliveredQty: number(row.deliveredQty ?? row.delivered_qty), chargeableQty: number(row.chargeableQty ?? row.chargeable_qty),
    freeQty: number(row.freeQty ?? row.free_qty), amount: number(row.amount),
    adjustmentAmount: number(row.adjustmentAmount ?? row.adjustment_amount), finalAmount: number(row.finalAmount ?? row.final_amount),
  })).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { header, lines };
}
export function buildStatementExportSnapshotGuard(snapshot, parameters) {
  if (!snapshot?.header) return 'FALSE';
  return `(SELECT jsonb_build_object('id',s.id,'revision',s.revision,'status',s.status,'receivable',s.receivable_amount,'received',s.received_amount,'variance',s.variance_amount) FROM locked_statement s) = ${parameters.json(snapshot.header)}::jsonb
    AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'orderLineId',order_line_id,'fulfillmentId',COALESCE(fulfillment_id,''),'deliveredQty',delivered_qty,'chargeableQty',chargeable_qty,'freeQty',free_qty,'amount',amount,'adjustmentAmount',adjustment_amount,'finalAmount',final_amount) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM statement_lines WHERE statement_id=${parameters.text(snapshot.header.id)}) = ${parameters.json(snapshot.lines)}::jsonb`;
}

// A financial directive must commit against the same statement facts it validated.
function decisionStatementSnapshot(statement) {
  const revision = Number(statement?.revision);
  if (!statement || !Number.isInteger(revision) || revision < 1) return null;
  return {
    id: String(statement.id ?? statement.statementId ?? "").trim(),
    revision,
    status: String(statement.status ?? "").trim(),
    receivable: amount(statement.receivable),
    received: amount(statement.received),
    variance: amount(statement.variance),
  };
}

function amount(value) {
  if (value === null || value === undefined || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
