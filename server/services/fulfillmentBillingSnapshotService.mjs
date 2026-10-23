const text=value=>String(value??'').trim();
const numeric=value=>value===null||value===undefined||value===''?null:Number(value);
export function selectFulfillmentPriceSnapshot(snapshot) {
  return [...snapshot.prices].sort((a,b)=>Number(b.createdAtMs)-Number(a.createdAtMs)||Number(b.snapshotType==='quantity_adjustment')-Number(a.snapshotType==='quantity_adjustment')||Number(b.versionNo)-Number(a.versionNo))[0];
}
export function captureFulfillmentBillingSnapshot(workspace,orderLineId) {
  const same=row=>text(row.orderLineId??row.order_line_id)===orderLineId;
  const prices=(workspace.priceSnapshots??[]).filter(same).map(row=>({id:text(row.id??row.priceSnapshotId),versionNo:numeric(row.versionNo??row.version_no),snapshotType:text(row.snapshotType??row.snapshot_type),createdAtMs:Number.isFinite(Date.parse(row.createdAt??row.created_at))?Date.parse(row.createdAt??row.created_at):null,chargeableQty:numeric(row.chargeableQty??row.chargeable_qty),finalAmount:numeric(row.finalAmount??row.final_amount)})).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const lines=(workspace.statementLines??[]).filter(same).map(row=>({id:text(row.id??row.statementLineId),fulfillmentId:text(row.fulfillmentId??row.fulfillment_id),deliveredQty:numeric(row.deliveredQty??row.delivered_qty),freeQty:numeric(row.freeQty??row.free_qty),chargeableQty:numeric(row.chargeableQty??row.chargeable_qty),finalAmount:numeric(row.finalAmount??row.final_amount)})).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {orderLineId,prices,lines};
}
export function buildFulfillmentBillingSnapshotGuard(snapshot,parameters) {
  if(!snapshot)return 'TRUE';
  return `(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'versionNo',version_no,'snapshotType',snapshot_type,'createdAtMs',floor(extract(epoch from created_at)*1000),'chargeableQty',chargeable_qty,'finalAmount',final_amount) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM price_snapshots WHERE order_line_id=${parameters.text(snapshot.orderLineId)}) = ${parameters.json(snapshot.prices)}::jsonb
  AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'fulfillmentId',COALESCE(fulfillment_id,''),'deliveredQty',delivered_qty,'freeQty',free_qty,'chargeableQty',chargeable_qty,'finalAmount',final_amount) ORDER BY id COLLATE "C"),'[]'::jsonb) FROM statement_lines WHERE order_line_id=${parameters.text(snapshot.orderLineId)}) = ${parameters.json(snapshot.lines)}::jsonb`;
}
