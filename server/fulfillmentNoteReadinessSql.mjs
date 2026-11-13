import { noteDocumentTypes, productionLineStages, shippedNoteStatuses, voidNoteStatuses } from "../shared/fulfillmentNoteReadiness.js";
import { orderTypeAliasesFor, REPLENISHMENT_FULFILLMENT } from "../shared/orderRouting.js";
import { invalidPackageStatuses } from "../shared/packageContents.js";

// Per-delivery evidence written by the single-task and mixed-package packing commands.
function packingReceiptSql(batch) {
  return `EXISTS (SELECT 1 FROM operation_logs log WHERE (
    log.action='replace_package_group' AND log.target_type='fulfillment'
    AND log.target_id=${batch}.packing_group_anchor_id AND ${batch}.packing_group_revision>0
    AND log.after_json->>'packingRevision'=${batch}.packing_group_revision::text
    AND (log.after_json->'fulfillmentIds') ? ${batch}.id
  ) OR (
    log.action='complete_packing_task' AND log.target_type='packing_task'
    AND COALESCE(log.after_json#>>'{fulfillment,fulfillmentId}',log.after_json#>>'{fulfillment,id}')=${batch}.id
    AND log.after_json#>>'{fulfillment,actualQty}'=${batch}.actual_qty::text
    AND log.after_json#>>'{packingTask,actualPackedQty}'=${batch}.actual_qty::text
    AND EXISTS (SELECT 1 FROM packing_tasks receipt_task WHERE receipt_task.id=log.target_id
      AND receipt_task.order_line_id=${batch}.order_line_id AND receipt_task.status='已完成'
      AND receipt_task.actual_packed_qty=${batch}.actual_qty)
  ))`;
}

// The print transaction and production/packing writers hold the same order-line and
// fulfillment resource locks. Re-read the evidence here after taking those locks.
export function fulfillmentNoteReadinessSql(printRecord, fulfillment, parameters, action, job) {
  if (!noteDocumentTypes.includes(printRecord?.documentType)) return "TRUE";
  const stockTypes = [...orderTypeAliasesFor("stock"), ...orderTypeAliasesFor("stock_printed")];
  const allTypes = [...stockTypes, ...["custom_print", "custom_special", "external_print"].flatMap(orderTypeAliasesFor)];
  const confirming = action === "confirm_fulfillment_print_from_driver";
  // A queued job is immutable evidence. Older jobs only recorded the validated reprint
  // action, so require a distinct preceding voided note of the same batch and kind.
  const priorBinding = () => confirming
    ? `EXISTS (SELECT 1 FROM print_jobs j JOIN print_records cur ON cur.id=j.print_record_id
        WHERE j.id=${parameters.text(job?.printJobId)} AND cur.id=${parameters.text(printRecord.printRecordId)}
          AND cur.target_type='fulfillment' AND cur.target_id=f.id AND cur.print_action='reprint' AND cur.status<>'voided'
          AND prior.id<>cur.id AND prior.created_at<=cur.created_at
          AND (NOT ((j.payload_json->'request') ? 'previousPrintRecordId') OR j.payload_json#>>'{request,previousPrintRecordId}'=prior.id))`
    : `prior.id = ${parameters.text(printRecord.previousPrintRecordId)}`;
  const isHistorical = printRecord.printAction === "reprint" ? `(
    (f.physical_outbound_at IS NOT NULL OR f.final_delivery_at IS NOT NULL OR f.delivered_at IS NOT NULL
      OR f.status = ANY(${parameters.textArray(shippedNoteStatuses)}))
    AND EXISTS (SELECT 1 FROM print_records prior
      WHERE ${priorBinding()} AND prior.target_type = 'fulfillment'
      AND prior.target_id = f.id AND prior.status = 'voided'
      AND COALESCE(NULLIF(prior.document_type,''), (SELECT j.document_type FROM print_jobs j WHERE j.print_record_id=prior.id ORDER BY j.created_at DESC,j.id DESC LIMIT 1)) = ${parameters.text(printRecord.documentType)})
  )` : "FALSE";
  const printedQuantityMatches = confirming
    ? `EXISTS (SELECT 1 FROM print_jobs j WHERE j.id=${parameters.text(job?.printJobId)}
         AND j.print_record_id=${parameters.text(printRecord.printRecordId)} AND j.target_type='fulfillment' AND j.target_id=f.id
         AND j.payload_json#>>'{printTemplate,fields,totalQuantity}'=f.actual_qty::text)` : "TRUE";
  return `EXISTS (
    SELECT 1 FROM locked_fulfillment f JOIN order_lines l ON l.id=f.order_line_id
    WHERE l.fulfillment_method <> ${parameters.text(REPLENISHMENT_FULFILLMENT)}
      AND l.line_status <> ALL(${parameters.textArray(voidNoteStatuses)})
      AND f.status <> ALL(${parameters.textArray(voidNoteStatuses)})
      AND (${isHistorical} OR (l.order_type = ANY(${parameters.textArray(allTypes)}) AND (
        (l.order_type = ANY(${parameters.textArray(stockTypes)}) AND l.order_type <> '现货缺货'
          AND l.line_status NOT LIKE '%缺货%' AND l.line_status <> ALL(${parameters.textArray(productionLineStages)})
          AND NOT ('库存不足' = ANY(l.exception_tags))
          AND NOT EXISTS (SELECT 1 FROM production_tasks t WHERE t.order_line_id=l.id AND t.task_status NOT IN ('已作废','已取消')))
        OR (
          f.actual_qty > 0 AND (${printedQuantityMatches}) AND f.actual_qty = ${parameters.nullableInteger(fulfillment.actualQty)}
          AND EXISTS (
            SELECT 1 FROM LATERAL (
              SELECT CASE WHEN count(*) FILTER (WHERE sibling.actual_qty IS NULL OR sibling.actual_qty<=0)=0
                THEN f.actual_qty + COALESCE(sum(sibling.actual_qty),0) END AS needed
              FROM fulfillment_records sibling
              WHERE sibling.order_line_id=l.id AND sibling.id<>f.id AND sibling.status <> ALL(${parameters.textArray(voidNoteStatuses)})
                AND (sibling.physical_outbound_at IS NOT NULL OR sibling.loaded_at IS NOT NULL OR sibling.final_delivery_at IS NOT NULL
                  OR sibling.delivered_at IS NOT NULL OR sibling.status='已完成' OR sibling.status ~ '已交付|已出库|已拉走|配送中|已签收'
                  OR EXISTS (SELECT 1 FROM paper_outbound_documents doc WHERE doc.fulfillment_id=sibling.id
                    AND doc.status <> ALL(${parameters.textArray(voidNoteStatuses)}))
                  OR ${packingReceiptSql("sibling")})
            ) counts, LATERAL (
              SELECT sum(r.qualified_qty) AS qty FROM production_tasks t JOIN workshop_reports r
                ON r.production_task_id=t.id AND r.order_line_id=t.order_line_id
              WHERE t.order_line_id=l.id AND t.task_status='已完成'
                AND t.task_type=CASE WHEN l.order_type = ANY(${parameters.textArray(orderTypeAliasesFor("external_print"))}) THEN '丝印' ELSE '制袋' END
                AND r.process_type=t.task_type AND r.completed_at IS NOT NULL AND r.qualified_qty>0
                AND r.evidence_json->>'reportKind' IS DISTINCT FROM 'daily_progress'
            ) produced, LATERAL (
              SELECT sum(t.actual_packed_qty) AS qty FROM packing_tasks t
              WHERE t.order_line_id=l.id AND t.status='已完成' AND t.actual_packed_qty>0
            ) packed
            WHERE packed.qty >= counts.needed AND produced.qty>0 AND (produced.qty>=counts.needed OR ${packingReceiptSql("f")})
          )
          AND (SELECT bool_and(item->>'orderLineId'=l.id AND (item->>'packedQty')::bigint>0)
                 AND sum((item->>'packedQty')::bigint)=f.actual_qty
               FROM packages p CROSS JOIN LATERAL jsonb_array_elements(
                 CASE WHEN jsonb_array_length(p.contents_json)>0 THEN p.contents_json ELSE
                   jsonb_build_array(jsonb_build_object('fulfillmentId',p.fulfillment_id,'orderLineId',p.order_line_id,'packedQty',p.packed_qty)) END) item
               WHERE p.fulfillment_id=COALESCE(NULLIF(f.packing_group_anchor_id,''),f.id)
                 AND p.status <> ALL(${parameters.textArray(invalidPackageStatuses)}) AND item->>'fulfillmentId'=f.id)
        )
      )))
  )`;
}
