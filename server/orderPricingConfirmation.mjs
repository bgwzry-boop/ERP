import {orderDeliveryNotExecutedSql} from "./orderMutationDeliveryGuard.mjs";
import {orderMutationDocumentLocksSql,orderMutationDocumentGuardSql} from "./orderMutationDocumentGuard.mjs";
import { isDeepStrictEqual } from "node:util";
import { assertPublishedOrderPriceSource } from "./orderDraftPublishedPricing.mjs";
import {
  localOrderPricingMaterialFacts,
  buildOrderPricingMaterialFactsGuard,
} from "./orderPricingMaterialSource.mjs";
import {
  assertUnstartedPrintingSupplement,
  printingMaterialConsumptionAbsentSql,
  orderPricingError,
} from "./orderPrintingPriceGroups.mjs";

export function assertLocalOfficePricingQuote(workspace, draft, quote) {
  const persisted = draft.recognitionContext?.officePriceQuote;
  if (!isDeepStrictEqual(persisted ?? null, quote ?? null))
    throw orderPricingError(
      "ORDER_PRICE_QUOTE_CHANGED",
      "正式报价已变化，请重新核价；草稿已保留。",
    );
  if (!quote) return;
  assertPublishedOrderPriceSource(workspace, quote.baseSource);
  for (const source of quote.materialSources) {
    if (
      !isDeepStrictEqual(
        localOrderPricingMaterialFacts(workspace, source.input),
        source.facts.materials,
      )
    )
      throw orderPricingError(
        "ERP_ORDER_PRICE_SOURCE_CONFLICT",
        "材料价格依据已变化，请重新生成报价。",
      );
    if (
      source.facts.publishedRelease &&
      !(workspace.officePricingPublishedReleases ?? []).some(
        (release) =>
          release.id === source.facts.publishedRelease.id &&
          release.status === "published" &&
          release.revision === source.facts.publishedRelease.revision &&
          isDeepStrictEqual(
            release.specialSizePricing,
            source.facts.publishedRelease.specialSizePricing,
          ),
      )
    )
      throw orderPricingError(
        "ERP_ORDER_PRICE_SOURCE_CONFLICT",
        "正式材料快照已变化，请重新生成报价。",
      );
  }
  for (const revision of quote.relatedRevisions) {
    const line = workspace.orderLines.find(
      (line) => (line.id ?? line.orderLineId) === revision.orderLineId,
    );
    const current = [...workspace.priceSnapshots]
      .filter((price) => price.orderLineId === revision.orderLineId)
      .sort(latestPriceOrder)[0];
    const tasks = (workspace.productionTasks ?? [])
      .filter(
        (task) =>
          (task.orderLineId ?? task.lineId) === revision.orderLineId &&
          /丝印|印刷/u.test(task.taskType),
      )
      .map((task) => ({
        id: task.id ?? task.productionTaskId,
        revision: task.revision,
        status: task.taskStatus ?? task.status,
      }));
    if (
      !line ||
      Number(line.revision) !== revision.expectedRevision ||
      !isDeepStrictEqual(current, revision.priorPrice) ||
      !isDeepStrictEqual(tasks, revision.productionTasks)
    )
      throw orderPricingError(
        "ORDER_PRINT_SUPPLEMENT_CHANGED",
        "关联原单、价格或生产进度已变化，请刷新后重新合组报价。",
      );
    assertUnstartedPrintingSupplement(
      workspace,
      [
        {
          ...line,
          printContent:
            current.sourceEvidence?.officeQuoteInput?.printContent ||
            line.printContent,
        },
      ],
      draft.customerId,
    );
  }
}
export const latestPriceOrder = (a, b) =>
  String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) ||
  Number(b.versionNo ?? 1) - Number(a.versionNo ?? 1) ||
  String(b.id ?? b.priceSnapshotId).localeCompare(
    String(a.id ?? a.priceSnapshotId),
  );

// The draft owns the quote. Clients supply only its id and explicit affected-line
// acknowledgements. All price/material/production evidence is checked again in
// the same database transaction as confirmation and prior-line revision writes.
export function buildOfficePricingConfirmationCtes(
  quote,
  parameters,
  lineJson,
) {
  const revisions = quote?.relatedRevisions ?? [];
  const ids = revisions.map((row) => row.orderLineId);
  const idSql = ids.length
    ? ids.map((id) => parameters.text(id)).join(",")
    : "''";
  const documentPrefix = (sql,index) => sql.replace(/\blocked_mutation_\w+\b/g, `supplement${index}_$&`);
  const documentLocks = revisions.map((row,index) => documentPrefix(orderMutationDocumentLocksSql(parameters.text(row.orderLineId)), index)).join("\n");
  const documentGuards = revisions.map((_row,index) => documentPrefix(orderMutationDocumentGuardSql(),index)).join("\n");
  const checks =
    revisions
      .map(
        (row) => `EXISTS (SELECT 1 FROM locked_pricing_related_lines l
    WHERE l.id=${parameters.text(row.orderLineId)} AND l.revision=${parameters.integer(row.expectedRevision)}
      AND l.customer_id=${parameters.text(quote.linePrices[0].sourceEvidence.officeQuoteInput.customerId)}
      AND l.line_status !~ '已交付|已完成|已关闭|已作废|取消'
      AND (SELECT p.id FROM locked_pricing_related_prices p WHERE p.order_line_id=l.id ORDER BY p.created_at DESC,p.version_no DESC,p.id DESC LIMIT 1)=${parameters.text(row.priorPrice.priceSnapshotId ?? row.priorPrice.id)}
      AND NOT EXISTS(SELECT 1 FROM locked_pricing_related_prices p WHERE p.order_line_id=l.id AND p.source_evidence_json ? 'intakeId')
      AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'revision',t.revision,'status',t.task_status) ORDER BY t.id),'[]'::jsonb) FROM locked_pricing_related_tasks t WHERE t.order_line_id=l.id)=${parameters.json([...row.productionTasks].sort((a, b) => a.id.localeCompare(b.id)))}
      AND NOT EXISTS(SELECT 1 FROM locked_pricing_related_tasks t WHERE t.order_line_id=l.id AND t.task_status NOT IN ('待排产','丝印已排产','待开始','未开始'))
      AND NOT EXISTS(SELECT 1 FROM workshop_reports r WHERE r.order_line_id=l.id AND (r.process_type ~ '丝印|印刷' OR r.production_task_id IN (SELECT t.id FROM locked_pricing_related_tasks t WHERE t.order_line_id=l.id)))
      AND ${printingMaterialConsumptionAbsentSql('SELECT id FROM locked_pricing_related_tasks WHERE order_line_id=l.id')}
      AND NOT EXISTS(SELECT 1 FROM statement_lines s WHERE s.order_line_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM locked_pricing_related_fulfillments f WHERE f.order_line_id=l.id AND (f.status ~ '配送中|已交付|已拉走|已自提' OR NOT (${orderDeliveryNotExecutedSql('f')})))
  )`,
      )
      .join(" AND ") || "true";
  return `locked_pricing_related_lines AS MATERIALIZED (SELECT * FROM order_lines WHERE id IN (${idSql}) ORDER BY id FOR UPDATE),
locked_pricing_raw_inbounds AS MATERIALIZED (SELECT * FROM raw_material_inbounds WHERE ${quote?.materialSources?.length ? "true" : "false"} ORDER BY id FOR SHARE),
locked_pricing_price_releases AS MATERIALIZED (SELECT * FROM miniapp_price_releases WHERE ${quote?.materialSources?.some((source) => source.facts.publishedRelease) ? "true" : "false"} ORDER BY id FOR SHARE),
locked_pricing_related_tasks AS MATERIALIZED (SELECT * FROM production_tasks WHERE order_line_id IN (${idSql}) AND task_type ~ '丝印|印刷' ORDER BY id FOR UPDATE),
locked_pricing_related_prices AS MATERIALIZED (SELECT * FROM price_snapshots WHERE order_line_id IN (${idSql}) ORDER BY id FOR SHARE),
locked_pricing_related_fulfillments AS MATERIALIZED (SELECT * FROM fulfillment_records WHERE order_line_id IN (${idSql}) ORDER BY id FOR UPDATE),
${documentLocks}
office_pricing_write_guard AS MATERIALIZED (
 SELECT erp_require(COALESCE((SELECT recognition_summary->'recognitionContext'->'officePriceQuote' FROM locked_order_draft),'null'::jsonb) IS NOT DISTINCT FROM ${parameters.json(quote ?? null)}
   AND ${buildOrderPricingMaterialFactsGuard(quote?.materialSources, parameters)} AND (${checks}), 'ERP_ORDER_PRICING_QUOTE_CONFLICT')
   ${documentGuards} AS ok
),
updated_pricing_related_lines AS (
 UPDATE order_lines l SET revision=l.revision+1, updated_at=now(), exception_tags=array(SELECT DISTINCT unnest(l.exception_tags || ARRAY['补单合组价格修订']))
 FROM office_pricing_write_guard g WHERE l.id IN (${idSql}) AND g.ok
 RETURNING ${lineJson("l")} AS result
),
inserted_pricing_related_changes AS (
 ${
   revisions.length
     ? `INSERT INTO order_line_change_records(id,order_line_id,changed_fields,before_json,after_json,reason,document_reprint_required,changed_by,created_at)
 VALUES ${revisions.map((row) => `(${parameters.text(`CHG-${quote.id}-${row.orderLineId}`)},${parameters.text(row.orderLineId)},ARRAY['printPrice','finalAmount','priceSnapshotId'],${parameters.json(row.priorPrice)},${parameters.json(row.nextPrice)},${parameters.text(quote.supplementation.reason)},true,${parameters.text(quote.operatorId)},${parameters.timestamp(quote.createdAt)})`).join(",")}
 RETURNING id`
     : "SELECT NULL::text AS id WHERE false"
 }
)`;
}
