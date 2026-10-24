import { createLocalWorkspaceReceiptStore } from "./localWorkspaceReceiptStore.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { buildPostgresIdempotencyRequest, readPostgresIdempotencyReplay } from "./idempotency.mjs";
import { readPrintGroup, groupLineId } from "./orderPrintGroupCorrection.mjs";
import { assertOrderProductionNotExecuted, applyPendingOrderProductionMutation, orderMutationProductionLocksSql, orderMutationProductionGuardSql, orderMutationProductionUpdatesSql } from "./orderMutationProductionGuard.mjs";
import { assertOrderDocumentsVoided, orderMutationDocumentLocksSql, orderMutationDocumentGuardSql } from "./orderMutationDocumentGuard.mjs";
import { assertOrderMutationDeliveryNotExecuted, orderDeliveryNotExecutedSql } from "./orderMutationDeliveryGuard.mjs";

const scope="order.print_group.correct";
const fail=(code,message)=>{throw Object.assign(new Error(message),{code,statusCode:409});};
const prefixSql=(sql,index)=>sql.replace(/\b(locked_mutation_\w+|updated_mutation_\w+)\b/g,`g${index}_$1`);
export function createPrintGroupCorrectionTransactionMethods({queryJson,idempotentTransactionJson}={}) {
  const receipts=createLocalWorkspaceReceiptStore();
  return {
    async loadPrintGroupAuxiliaryFacts(){
      return queryJson ? queryJson("SELECT json_build_object('rawMaterialInbounds',(SELECT COALESCE(json_agg(payload_json),'[]'::json) FROM raw_material_inbounds),'printJobs',(SELECT COALESCE(json_agg(to_jsonb(job)),'[]'::json) FROM print_jobs job)) AS result") : null;
    },
    async findPrintGroupCorrectionReplay(input){
      return queryJson ? readPostgresIdempotencyReplay({queryJson,scope,idempotencyKey:input.idempotencyKey,payload:input.idempotencyPayload}) : receipts.read(input);
    },
    async correctPrintGroup(input){
      if(!queryJson){
        const replay=receipts.read(input);if(replay)return replay;
        const view=readPrintGroup(input.workspace,input.members[0].after.id).view;
        if(view.groupRevision!==input.groupRevision)fail("PRINT_GROUP_REVISION_CONFLICT","整组成员或价格已变化，未保存更正。");
        for(const member of input.members){assertOrderProductionNotExecuted({workspace:input.workspace,orderLine:member.after});assertOrderMutationDeliveryNotExecuted({workspace:input.workspace,orderLine:member.after});assertOrderDocumentsVoided(input.workspace,member.after.id);}
        for(const adjustment of input.inventoryAdjustments){const item=input.workspace.inventories.find(row=>row.id===adjustment.inventoryItemId);if(!item||Number(item.revision??1)!==adjustment.expectedRevision||Number(item.reserved)!==adjustment.expectedReservedQty)fail("ERP_INVENTORY_CONCURRENCY_CONFLICT","库存占用已变化，未保存整组更正。");}
        for(const reservation of input.inventoryReservations){const current=input.workspace.inventoryReservations.find(row=>(row.id??row.reservationId)===reservation.id);if(!current||Number(current.revision??1)!==reservation.expectedRevision||Number(current.reservedQty??current.qty)!==reservation.expectedReservedQty||current.status!==reservation.expectedStatus)fail("ERP_RESERVATION_CONCURRENCY_CONFLICT","订单占用已变化，未保存整组更正。");}
        // Work on cloned collections and publish once; a later member failure
        // cannot leave earlier members changed in local review/test storage.
        const staged={...input.workspace};for(const [key,value]of Object.entries(staged))if(Array.isArray(value))staged[key]=structuredClone(value);
        applyPrintGroupCorrection(staged,input);
        for(const [key,value]of Object.entries(staged))if(Array.isArray(value))input.workspace[key]=value;
        receipts.save(input,input.response);return structuredClone(input.response);
      }
      const query=buildPrintGroupCorrectionTransactionQuery(input);
      query.orderLineLockIds=input.members.map(row=>row.after.id).sort();
      const saved=await idempotentTransactionJson(buildPostgresIdempotencyRequest({scope,idempotencyKey:input.idempotencyKey,payload:input.idempotencyPayload,operatorId:input.operationLog.operatorId,targetType:"printing_price_group",targetId:input.groupId,
        resourceLocks:[`printing-price-group:${input.groupId}`,...input.members.map(row=>`order-line:${row.after.id}`),...input.expectedDeliveries.map(row=>`fulfillment:${row.id}`),...input.packingGroupAnchorIds.map(id=>`packing-group:${id}`),...input.inventoryAdjustments.map(row=>`inventory:${row.inventoryItemId}`),...input.inventoryReservations.map(row=>`reservation:${row.id}`)],query}));
      if(saved?.correctionId!==input.response.correctionId){
        // A concurrent retry may return the already committed original receipt.
        // Never apply freshly generated IDs over that authoritative result.
        return saved;
      }
      applyPrintGroupCorrection(input.workspace,input);
      return saved;
    },
  };
}

export function applyPrintGroupCorrection(workspace,input){
  const byId=new Map(input.members.map(row=>[row.after.id,row]));
  workspace.orderLines=(workspace.orderLines??[]).map(row=>byId.get(groupLineId(row))?.after??row);
  workspace.fulfillments=(workspace.fulfillments??[]).map(row=>{
    const member=byId.get(groupLineId(row));if(!member||["已取消","已作废"].includes(row.status))return row;
    const qty=member.change.action==="keep"?Number(row.expectedQty??row.qty):member.change.newQty;
    return {...row,qty,expectedQty:qty,actualQty:null,actual_qty:null,status:member.change.action==="void"?"已取消":["已备货","待库房备货"].includes(row.status)?"待出库":row.status,revision:Number(row.revision??1)+1};
  });
  for(const member of input.members){
    const productionQty=new Map((workspace.productionTasks??[]).map(row=>[row.productionTaskId??row.id,row.plannedQty]));
    const packingQty=new Map((workspace.packingTasks??[]).map(row=>[row.packingTaskId??row.id,row.plannedQty]));
    applyPendingOrderProductionMutation(workspace,member.after,member.change.action==="void"?"void":"quantity");
    if(member.change.action==="keep"){
      workspace.productionTasks=(workspace.productionTasks??[]).map(row=>groupLineId(row)===member.after.id?{...row,plannedQty:productionQty.get(row.productionTaskId??row.id)}:row);
      workspace.packingTasks=(workspace.packingTasks??[]).map(row=>groupLineId(row)===member.after.id?{...row,plannedQty:packingQty.get(row.packingTaskId??row.id)}:row);
    }
  }
  const reservations=new Map(input.inventoryReservations.map(row=>[row.id,row]));
  workspace.inventoryReservations=(workspace.inventoryReservations??[]).map(row=>reservations.get(row.id??row.reservationId)??row);
  workspace.inventories=(workspace.inventories??[]).map(row=>{const delta=input.inventoryAdjustments.find(item=>item.inventoryItemId===row.id);return delta?{...row,reserved:Number(row.reserved)+delta.reservedQtyChange,revision:Number(row.revision??1)+1}:row;});
  workspace.priceSnapshots=[...(workspace.priceSnapshots??[]),...input.members.map(row=>row.snapshot)];
  workspace.inventoryLedgers=[...(workspace.inventoryLedgers??[]),...input.inventoryLedgerEntries];
  workspace.orderLineChangeRecords=[...(workspace.orderLineChangeRecords??[]),...input.members.map(row=>row.changeRecord)];
  workspace.operationLogs=[...(workspace.operationLogs??[]),input.operationLog];
}

// One SQL statement: all members, all snapshots and shared inventory are
// guarded and written inside one existing idempotent Postgres transaction.
export function buildPrintGroupCorrectionTransactionQuery(input){
  const p=createPostgresParameterBinder(),operator=p.text(input.operationLog.operatorId),at=p.timestamp(input.createdAt),reason=p.text(input.operationLog.reason);
  const rows=input.members.map(row=>({id:row.after.id,revision:row.expectedRevision,previous_qty:Number(row.before.originalQty??row.before.qty),new_qty:row.change.newQty,physical_qty:row.after.originalQty,status:row.after.status,action:row.change.action,price_id:row.expectedPriceSnapshot.priceSnapshotId??row.expectedPriceSnapshot.id,expected_price:row.expectedPriceSnapshot,snapshot:row.snapshot,change_record:row.changeRecord}));
  const memberSource=`jsonb_to_recordset(${p.json(rows)}) AS member(id text,revision integer,previous_qty integer,new_qty integer,physical_qty integer,status text,action text,price_id text,expected_price jsonb,snapshot jsonb,change_record jsonb)`;
  const memberLocks=input.members.map((row,i)=>prefixSql(orderMutationProductionLocksSql(p.text(row.after.id))+orderMutationDocumentLocksSql(p.text(row.after.id)),i)).join("\n");
  const memberGuards=input.members.map((row,i)=>prefixSql(orderMutationProductionGuardSql(p.text(row.after.id))+orderMutationDocumentGuardSql(),i)).join("\n");
  const memberUpdates=input.members.map((row,i)=>prefixSql(orderMutationProductionUpdatesSql(p.text(row.after.id),row.change.action==="void"?"void":"quantity",row.change.action==="void"?"NULL::integer":row.change.action==="keep"?"task.planned_qty":p.integer(row.after.originalQty)),i)).join("\n");
  const reservations=input.inventoryReservations.map(row=>({id:row.id,revision:row.expectedRevision,previous_qty:row.expectedReservedQty,previous_status:row.expectedStatus,new_qty:row.reservedQty,status:row.status}));
  const items=input.inventoryAdjustments.map(row=>({id:row.inventoryItemId,revision:row.expectedRevision,previous_qty:row.expectedReservedQty,delta:row.reservedQtyChange}));
  const log=input.operationLog;
  return {values:p.values,text:`BEGIN;
WITH members AS MATERIALIZED (SELECT * FROM ${memberSource}),
locked_group_lines AS MATERIALIZED (SELECT line.* FROM order_lines line JOIN members ON members.id=line.id ORDER BY line.id FOR UPDATE OF line),
locked_group_prices AS MATERIALIZED (SELECT price.* FROM price_snapshots price JOIN members ON members.id=price.order_line_id ORDER BY price.id FOR UPDATE OF price),
locked_group_deliveries AS MATERIALIZED (SELECT delivery.* FROM fulfillment_records delivery JOIN members ON members.id=delivery.order_line_id ORDER BY delivery.id FOR UPDATE OF delivery),
expected_deliveries AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${p.json(input.expectedDeliveries)}) AS fact(id text,revision integer,qty integer,status text,anchor text)),
expected_reservations AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${p.json(input.expectedReservations)}) AS fact(id text,revision integer,qty integer,status text)),
expected_tasks AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${p.json(input.expectedTasks)}) AS fact(id text,revision integer,qty integer,status text)),
expected_packing_tasks AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${p.json(input.expectedPackingTasks)}) AS fact(id text,revision integer,qty integer,status text)),
${memberLocks}
reservation_changes AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${p.json(reservations)}) AS reservation(id text,revision integer,previous_qty integer,previous_status text,new_qty integer,status text)),
locked_group_reservations AS MATERIALIZED (SELECT reservation.* FROM inventory_reservations reservation JOIN reservation_changes c ON c.id=reservation.id ORDER BY reservation.id FOR UPDATE OF reservation),
item_changes AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${p.json(items)}) AS item(id text,revision integer,previous_qty integer,delta integer)),
locked_group_items AS MATERIALIZED (SELECT item.* FROM inventory_items item JOIN item_changes c ON c.id=item.id ORDER BY item.id FOR UPDATE OF item),
write_guard AS MATERIALIZED (
 SELECT erp_require((SELECT count(*) FROM locked_group_lines)=(SELECT count(*) FROM members)
   AND NOT EXISTS(SELECT 1 FROM locked_group_lines line JOIN members m ON m.id=line.id WHERE line.revision<>m.revision OR line.original_qty<>m.previous_qty OR line.line_status IN ('已关闭','已作废','已取消','已交付','已完成') OR line.voided_at IS NOT NULL),'ERP_ORDER_LINE_CONCURRENCY_CONFLICT')
 AND erp_require(NOT EXISTS(SELECT 1 FROM members m LEFT JOIN LATERAL (SELECT price.* FROM locked_group_prices price WHERE price.order_line_id=m.id ORDER BY price.created_at DESC,price.version_no DESC LIMIT 1) latest ON true WHERE latest.id IS DISTINCT FROM m.price_id OR latest.bag_price<>(m.expected_price->>'bagPrice')::numeric OR latest.print_price<>(m.expected_price->>'printPrice')::numeric OR latest.other_fee<>(m.expected_price->>'otherFee')::numeric OR latest.adjustment_amount<>(m.expected_price->>'adjustmentAmount')::numeric OR latest.chargeable_qty<>(m.expected_price->>'chargeableQty')::integer OR latest.final_amount<>(m.expected_price->>'finalAmount')::numeric OR latest.source_evidence_json IS DISTINCT FROM m.expected_price->'sourceEvidence'),'ERP_ORDER_PRICE_SOURCE_CONFLICT')
 AND erp_require((SELECT count(*) FROM order_lines line JOIN LATERAL (SELECT price.source_evidence_json FROM price_snapshots price WHERE price.order_line_id=line.id ORDER BY price.created_at DESC,price.version_no DESC LIMIT 1) price ON true WHERE line.line_status NOT IN ('已关闭','已作废','已取消','已交付','已完成') AND line.voided_at IS NULL AND price.source_evidence_json->'officePricingGroup'->>'groupId'=${p.text(input.groupId)})=(SELECT count(*) FROM members),'ERP_PRINT_GROUP_MEMBERS_CONFLICT')
 AND erp_require(NOT EXISTS(SELECT 1 FROM statement_lines statement JOIN members m ON m.id=statement.order_line_id),'ERP_ORDER_LINE_HAS_STATEMENT')
 AND erp_require(NOT EXISTS(SELECT 1 FROM locked_group_prices price WHERE price.source_evidence_json ? 'intakeId' OR price.source_evidence_json->>'kind' LIKE '%miniapp%' OR COALESCE((price.source_evidence_json->>'lockedPrice')::boolean,false)),'ERP_PRINT_GROUP_PRICE_LOCKED')
 AND erp_require(NOT EXISTS(SELECT 1 FROM locked_group_deliveries delivery WHERE NOT (${orderDeliveryNotExecutedSql("delivery")})),'ERP_ORDER_DELIVERY_ALREADY_EXECUTED')
 AND erp_require((SELECT count(*) FROM locked_group_deliveries)=(SELECT count(*) FROM expected_deliveries) AND NOT EXISTS(SELECT 1 FROM locked_group_deliveries delivery LEFT JOIN expected_deliveries e ON e.id=delivery.id WHERE e.id IS NULL OR delivery.revision IS DISTINCT FROM e.revision OR delivery.expected_qty IS DISTINCT FROM e.qty OR delivery.status IS DISTINCT FROM e.status OR delivery.packing_group_anchor_id IS DISTINCT FROM e.anchor),'ERP_FULFILLMENT_CONCURRENCY_CONFLICT')
 AND erp_require(NOT EXISTS(SELECT 1 FROM members m WHERE m.action='reduce' AND ((SELECT count(*) FROM locked_group_deliveries d WHERE d.order_line_id=m.id AND d.status NOT IN ('已取消','已作废'))>1 OR EXISTS(SELECT 1 FROM locked_group_deliveries d WHERE d.order_line_id=m.id AND d.status NOT IN ('已取消','已作废') AND d.expected_qty<>m.previous_qty))),'ERP_FULFILLMENT_CONCURRENCY_CONFLICT')
 AND erp_require((SELECT count(*) FROM inventory_reservations r JOIN members m ON m.id=r.order_line_id)=(SELECT count(*) FROM expected_reservations) AND NOT EXISTS(SELECT 1 FROM inventory_reservations r JOIN members m ON m.id=r.order_line_id LEFT JOIN expected_reservations e ON e.id=r.id WHERE e.id IS NULL OR r.revision IS DISTINCT FROM e.revision OR r.reserved_qty IS DISTINCT FROM e.qty OR r.status IS DISTINCT FROM e.status),'ERP_RESERVATION_CONCURRENCY_CONFLICT')
 AND erp_require((SELECT count(*) FROM production_tasks t JOIN members m ON m.id=t.order_line_id)=(SELECT count(*) FROM expected_tasks) AND NOT EXISTS(SELECT 1 FROM production_tasks t JOIN members m ON m.id=t.order_line_id LEFT JOIN expected_tasks e ON e.id=t.id WHERE e.id IS NULL OR t.revision IS DISTINCT FROM e.revision OR t.planned_qty IS DISTINCT FROM e.qty OR t.task_status IS DISTINCT FROM e.status),'ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT')
 AND erp_require((SELECT count(*) FROM packing_tasks t JOIN members m ON m.id=t.order_line_id)=(SELECT count(*) FROM expected_packing_tasks) AND NOT EXISTS(SELECT 1 FROM packing_tasks t JOIN members m ON m.id=t.order_line_id LEFT JOIN expected_packing_tasks e ON e.id=t.id WHERE e.id IS NULL OR t.revision IS DISTINCT FROM e.revision OR t.planned_qty IS DISTINCT FROM e.qty OR t.status IS DISTINCT FROM e.status),'ERP_PACKING_TASK_CONCURRENCY_CONFLICT')
 ${memberGuards}
 AND erp_require((SELECT count(*) FROM locked_group_reservations)=(SELECT count(*) FROM reservation_changes) AND NOT EXISTS(SELECT 1 FROM locked_group_reservations r JOIN reservation_changes c ON c.id=r.id WHERE r.revision<>c.revision OR r.reserved_qty<>c.previous_qty OR r.status<>c.previous_status),'ERP_RESERVATION_CONCURRENCY_CONFLICT')
 AND erp_require((SELECT count(*) FROM locked_group_items)=(SELECT count(*) FROM item_changes) AND NOT EXISTS(SELECT 1 FROM locked_group_items item JOIN item_changes c ON c.id=item.id WHERE item.revision<>c.revision OR item.reserved_qty<>c.previous_qty OR item.reserved_qty+c.delta<0),'ERP_INVENTORY_CONCURRENCY_CONFLICT') AS ok
),
${memberUpdates}
updated_group_lines AS (
 UPDATE order_lines line SET original_qty=m.physical_qty,line_status=m.status,revision=line.revision+1,updated_at=${at},closed_at=CASE WHEN m.action='void' THEN ${at} ELSE line.closed_at END,voided_at=CASE WHEN m.action='void' THEN ${at} ELSE line.voided_at END,voided_by=CASE WHEN m.action='void' THEN ${operator} ELSE line.voided_by END,void_reason=CASE WHEN m.action='void' THEN ${reason} ELSE line.void_reason END
 FROM members m,write_guard guard WHERE line.id=m.id AND guard.ok RETURNING line.id
),
updated_group_deliveries AS (UPDATE fulfillment_records delivery SET expected_qty=CASE WHEN m.action='keep' THEN delivery.expected_qty ELSE m.new_qty END,actual_qty=NULL,status=CASE WHEN m.action='void' THEN '已取消' WHEN delivery.status IN ('已备货','待库房备货') THEN '待出库' ELSE delivery.status END,revision=delivery.revision+1,updated_at=${at} FROM members m,write_guard guard WHERE delivery.order_line_id=m.id AND delivery.status NOT IN ('已取消','已作废') AND guard.ok RETURNING delivery.id),
updated_group_reservations AS (UPDATE inventory_reservations r SET reserved_qty=c.new_qty,status=c.status,revision=r.revision+1,updated_at=${at} FROM reservation_changes c,write_guard guard WHERE r.id=c.id AND guard.ok RETURNING r.id),
updated_group_items AS (UPDATE inventory_items item SET reserved_qty=item.reserved_qty+c.delta,revision=item.revision+1,updated_at=${at} FROM item_changes c,write_guard guard WHERE item.id=c.id AND guard.ok RETURNING item.id),
inserted_group_prices AS (INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,print_price,other_fee,adjustment_amount,chargeable_qty,final_amount,override_reason,source_evidence_json,created_by,created_at)
 SELECT snapshot->>'id',id,'print_group_correction',(snapshot->>'versionNo')::integer,(snapshot->>'bagPrice')::numeric,(snapshot->>'printPrice')::numeric,(snapshot->>'otherFee')::numeric,(snapshot->>'adjustmentAmount')::numeric,(snapshot->>'chargeableQty')::integer,(snapshot->>'finalAmount')::numeric,snapshot->>'overrideReason',snapshot->'sourceEvidence',${operator},${at} FROM members,write_guard guard WHERE guard.ok RETURNING id),
inserted_group_changes AS (INSERT INTO order_line_change_records(id,order_line_id,changed_fields,before_json,after_json,reason,document_reprint_required,changed_by,created_at)
 SELECT change_record->>'id',id,ARRAY['original_qty','line_status','price_snapshot','printing_group'],change_record->'before',change_record->'after',${reason},false,${operator},${at} FROM members,write_guard guard WHERE guard.ok RETURNING id),
inserted_group_ledgers AS (INSERT INTO inventory_ledger_entries(id,inventory_item_id,change_type,qty_before,qty_change,qty_after,source_type,source_id,operator_id,confirmed_by,occurred_at,created_at,reason)
 SELECT ledger->>'id',ledger->>'inventoryItemId',ledger->>'changeType',(ledger->>'qtyBefore')::integer,(ledger->>'qtyChange')::integer,(ledger->>'qtyAfter')::integer,ledger->>'sourceType',ledger->>'sourceId',${operator},${operator},${at},${at},${reason} FROM jsonb_array_elements(${p.json(input.inventoryLedgerEntries)}) ledger,write_guard guard WHERE guard.ok RETURNING id),
inserted_group_log AS (INSERT INTO operation_logs(id,target_type,target_id,action,before_json,after_json,reason,operator_id,occurred_at,created_at)
 SELECT ${p.text(log.id)},'printing_price_group',${p.text(input.groupId)},'correct_print_group',${p.json(log.before)},${p.json(log.after)},${reason},${operator},${at},${at} FROM write_guard guard WHERE guard.ok RETURNING id)
SELECT ${p.json(input.response)} AS result FROM write_guard guard WHERE guard.ok AND erp_require((SELECT count(*) FROM updated_group_lines)=(SELECT count(*) FROM members) AND (SELECT count(*) FROM inserted_group_prices)=(SELECT count(*) FROM members) AND (SELECT count(*) FROM inserted_group_changes)=(SELECT count(*) FROM members) AND (SELECT count(*) FROM inserted_group_log)=1,'ERP_PRINT_GROUP_WRITE_INCOMPLETE');
COMMIT;`};
}
