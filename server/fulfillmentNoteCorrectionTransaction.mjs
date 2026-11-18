// 负责人 2026-11-12「作废重打」：一张已经打出来的送货单 / 自提单有错（数量、单价、地址提货人等文字，或者整张不要了），
// 一次事务里：作废这张单、改这次交付的数量 / 状态 / 地址、按差额退回或补扣库存、改对账单这一行和合计、
// 必要时补一个订单价格快照，记操作日志。改完再按正常流程重打（重打不再扣库存）。
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { buildIdempotencyConflictError, buildIdempotencyRequestHash, buildPostgresIdempotencyRequest, normalizeIdempotencyKey, readPostgresIdempotencyReplay } from "./idempotency.mjs";

const clean = (value) => String(value ?? "").trim();
const conflict = (message = "单子刚被别人改过，请刷新后再改。") => Object.assign(new Error(message), { statusCode: 409, code: "NOTE_CORRECTION_CHANGED" });
const correctionScope = "fulfillment.correct_note";
const paperIdOf = (row) => clean(row?.paperOutboundDocumentId ?? row?.id);
const orderLineIdOf = (row) => clean(row?.orderLineId ?? row?.lineId);

function correctionReceipt(row) {
  if (!row?.fulfillmentId) throw conflict();
  return { fulfillmentId: row.fulfillmentId, operationLogId: clean(row.operationLogId), ...(row.summary ? row.summary : {}) };
}

function localCorrectionReplay(workspace, key, payload) {
  if (!key) return null;
  const existing = (workspace.operationIdempotencyRecords ?? []).find((row) => row.scope === correctionScope && row.idempotencyKey === key);
  if (!existing) return null;
  if (existing.requestHash !== buildIdempotencyRequestHash(payload)) throw buildIdempotencyConflictError();
  return structuredClone(existing.response);
}

export function createLocalNoteCorrectionMethods() {
  return {
    findNoteCorrectionReplay({ workspace, idempotencyKey, idempotencyPayload }) {
      return localCorrectionReplay(workspace, normalizeIdempotencyKey(idempotencyKey), idempotencyPayload);
    },
    async recordNoteCorrection({ workspace, plan, idempotencyKey, idempotencyPayload }) {
      const key = normalizeIdempotencyKey(idempotencyKey);
      const replay = localCorrectionReplay(workspace, key, idempotencyPayload);
      if (replay) return { fulfillmentId: replay.fulfillmentId, operationLogId: replay.operationLogId, summary: replay };
      const fulfillment = (workspace.fulfillments ?? []).find((row) => (row.fulfillmentId ?? row.id) === plan.fulfillment.id);
      if (!fulfillment || Number(fulfillment.revision ?? 1) !== plan.fulfillment.expectedRevision) throw conflict();
      const printRecord = (workspace.printRecords ?? []).find((row) => (row.printRecordId ?? row.id) === plan.printRecord.id);
      if (!printRecord || !["printed", "reprinted"].includes(clean(printRecord.status))) throw conflict();
      const paper = (workspace.paperOutboundDocuments ?? []).find((row) => paperIdOf(row) === plan.paper?.id);
      if (plan.paper && (!paper || Number(paper.revision ?? 1) !== plan.paper.revision || paper.status === "已作废")) throw conflict();
      if (plan.approvedAdjustment) assertLocalApprovedAdjustment(workspace, fulfillment, paper, plan);
      for (const adjustment of plan.inventoryAdjustments) {
        const item = (workspace.inventories ?? []).find((row) => row.id === adjustment.inventoryItemId);
        if (!item || Number(item.inStock ?? item.onHandQty ?? 0) !== adjustment.expectedOnHand) throw conflict("库存刚有变化，请刷新后再改。");
        if (plan.approvedAdjustment && adjustment.onHandQtyChange < 0 && noteCorrectionAvailableStock(item) < -adjustment.onHandQtyChange) {
          throw conflict("可用库存刚有变化，请刷新后再改。");
        }
        const net = -(workspace.inventoryLedgers ?? []).filter((entry) => entry.inventoryItemId === adjustment.inventoryItemId && clean(entry.sourceId) === plan.fulfillment.id
          && NET_DEDUCTION_SOURCE_TYPES.includes(clean(entry.sourceType))).reduce((sum, entry) => sum + Number(entry.qtyChange), 0);
        if (Math.max(0, net) !== Number(adjustment.expectedNetDeducted ?? 0) || net - adjustment.onHandQtyChange < 0) throw conflict("库存流水刚有变化，请刷新后再改。");
      }
      if (plan.statementLine) {
        const line = (workspace.statementLines ?? []).find((row) => (row.statementLineId ?? row.id) === plan.statementLine.id);
        if (!line || Number(line.finalAmount ?? line.amount) !== plan.statementLine.expectedFinalAmount || Number(line.deliveredQty) !== plan.statementLine.expectedDeliveredQty) throw conflict("对账单刚有变化，请刷新后再改。");
      }
      Object.assign(printRecord, { status: "voided", voidReason: plan.printRecord.voidReason, updatedAt: plan.now });
      if (paper) Object.assign(paper, { status: "已作废", voidedBy: plan.operatorId, voidedAt: plan.now, voidReason: plan.printRecord.voidReason, revision: Number(paper.revision ?? 1) + 1, updatedAt: plan.now });
      Object.assign(fulfillment, {
        actualQty: plan.fulfillment.actualQty, status: plan.fulfillment.status, customerSnapshot: plan.fulfillment.customerSnapshot,
        printed: false, revision: Number(fulfillment.revision ?? 1) + 1, updatedAt: plan.now,
        ...(plan.approvedAdjustment ? { paperOutboundStatus: "待重打纸单", paperOutboundDocumentId: "" } : {}),
      });
      for (const adjustment of plan.inventoryAdjustments) {
        const item = (workspace.inventories ?? []).find((row) => row.id === adjustment.inventoryItemId);
        const next = Number(item.inStock ?? item.onHandQty ?? 0) + adjustment.onHandQtyChange;
        Object.assign(item, { inStock: next, onHandQty: next, onHand: next });
      }
      (workspace.inventoryLedgers ??= []).push(...plan.inventoryLedgerEntries.map((entry) => ({ ...entry, id: entry.ledgerId, occurredAt: plan.now, createdAt: plan.now })));
      if (plan.statementLine) {
        const lines = (workspace.statementLines ??= []);
        const index = lines.findIndex((row) => (row.statementLineId ?? row.id) === plan.statementLine.id);
        if (plan.statementLine.remove) lines.splice(index, 1);
        else Object.assign(lines[index], { deliveredQty: plan.statementLine.deliveredQty, chargeableQty: plan.statementLine.chargeableQty, freeQty: plan.statementLine.freeQty,
          amount: plan.statementLine.amount, finalAmount: plan.statementLine.finalAmount, revision: Number(lines[index].revision ?? 1) + 1 });
      }
      if (plan.statement) {
        const statement = (workspace.statements ?? []).find((row) => (row.statementId ?? row.id) === plan.statement.id);
        Object.assign(statement, { receivable: plan.statement.receivable, receivableAmount: plan.statement.receivable, variance: plan.statement.variance, varianceAmount: plan.statement.variance,
          ...(plan.statement.correctedAfterSend ? { correctedAfterSendAt: plan.now } : {}), revision: Number(statement.revision ?? 1) + 1,
          lineIds: plan.statement.lineIds ?? statement.lineIds });
      }
      if (plan.priceSnapshot) (workspace.priceSnapshots ??= []).push({ ...plan.priceSnapshot, createdAt: plan.now });
      (workspace.operationLogs ??= []).push(plan.operationLog);
      const result = { fulfillmentId: plan.fulfillment.id, operationLogId: plan.operationLog.id, summary: plan.summary };
      if (key) (workspace.operationIdempotencyRecords ??= []).push({
        scope: correctionScope, idempotencyKey: key, requestHash: buildIdempotencyRequestHash(idempotencyPayload), response: correctionReceipt(result),
      });
      return result;
    },
  };
}

// 和改单服务里算「净扣」用的同一组来源（扣库存的各种来源 + 改单补扣 / 退回）。
export const NET_DEDUCTION_SOURCE_TYPES = ["fulfillment_note_print", "warehouse_physical_outbound", "warehouse_physical_outbound_legacy", "fulfillment_complete",
  "fulfillment_complete_legacy", "fulfillment_pickup", "fulfillment_pickup_legacy", "fulfillment_note_correction", "fulfillment_note_correction_return"];

export function netDeductedFulfillmentQuantity(workspace, fulfillmentId) {
  return -(workspace.inventoryLedgers ?? []).filter(entry =>
    entry.sourceId === fulfillmentId && NET_DEDUCTION_SOURCE_TYPES.includes(entry.sourceType)
  ).reduce((sum, entry) => sum + Number(entry.qtyChange), 0);
}

export function netDeductedFulfillmentQuantitySql(fulfillmentIdSql, parameters) {
  return `(SELECT COALESCE(-SUM(ledger.qty_change),0) FROM inventory_ledger_entries AS ledger
    WHERE ledger.source_id=${fulfillmentIdSql} AND ledger.source_type=ANY(${parameters.textArray(NET_DEDUCTION_SOURCE_TYPES)}))`;
}

export function netDeductedStockByItem(workspace, fulfillmentId, sourceTypes = NET_DEDUCTION_SOURCE_TYPES) {
  const result = new Map();
  for (const row of workspace.inventoryLedgers ?? []) {
    const itemId = clean(row.inventoryItemId ?? row.inventory_item_id);
    if (clean(row.sourceId ?? row.source_id) !== fulfillmentId || !itemId || !sourceTypes.includes(clean(row.sourceType ?? row.source_type))) continue;
    result.set(itemId, (result.get(itemId) ?? 0) - Number(row.qtyChange ?? row.qty_change));
  }
  return result;
}

export function operationalPaperNetDeduction(workspace, fulfillment) {
  if (!fulfillment?.stockDeductedAt || fulfillment.physicalOutboundAt || fulfillment.loadedAt || fulfillment.finalDeliveryAt || fulfillment.deliveredAt
    || ["已取消", "已作废", "已交付", "已提货", "已拉走", "已完成"].includes(fulfillment.status)) return 0;
  const id = clean(fulfillment.fulfillmentId ?? fulfillment.id);
  return netDeductedFulfillmentQuantity(workspace, id);
}

export function noteCorrectionAvailableStock(item) {
  return Math.max(0, Number(item?.inStock ?? item?.onHandQty ?? item?.onHand ?? 0) - Number(item?.reservedQty ?? item?.reserved ?? 0)
    - Number(item?.waitingPickupLockedQty ?? item?.locked ?? 0) - Number(item?.pendingHandlingQty ?? item?.pending ?? 0));
}

function assertLocalApprovedAdjustment(workspace, fulfillment, paper, plan) {
  const id = plan.fulfillment.id;
  const adjustment = plan.approvedAdjustment;
  const net = [...netDeductedStockByItem(workspace, id).values()];
  const latest = (workspace.fulfillmentQuantityVarianceResolutions ?? []).filter((row) => row.fulfillmentId === id)
    .sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)) || clean(b.id).localeCompare(clean(a.id)))[0];
  const decision = (workspace.businessDecisionRecords ?? []).find((row) => row.id === adjustment.decisionId);
  if (!paper || (workspace.paperOutboundDocuments ?? []).some((row) => row.fulfillmentId === id && Number(row.documentVersion) > plan.paper.version)
    || (fulfillment.paperOutboundDocumentId && fulfillment.paperOutboundDocumentId !== plan.paper.id)
    || (workspace.warehouseOutboundExecutions ?? []).some((row) => row.fulfillmentId === id && row.result === "实物已出库")
    || !fulfillment.stockDeductedAt || fulfillment.physicalOutboundAt || fulfillment.finalDeliveryAt || fulfillment.deliveredAt || fulfillment.loadedAt
    || (adjustment.packingGroupAnchorId && (workspace.fulfillments ?? []).some((row) => row.packingGroupAnchorId === adjustment.packingGroupAnchorId
      && (row.physicalOutboundAt || row.finalDeliveryAt || row.deliveredAt || row.loadedAt)))
    || (workspace.statementLines ?? []).some((row) => row.fulfillmentId === id)
    || (workspace.fulfillments ?? []).some((row) => orderLineIdOf(row) === adjustment.orderLineId
      && (row.fulfillmentId ?? row.id) !== id && !["已取消", "已作废"].includes(row.status))
    || net.some((qty) => qty < 0) || net.reduce((sum, qty) => sum + qty, 0) !== adjustment.expectedNetDeducted
    || (workspace.fulfillmentExceptions ?? []).some((row) => row.fulfillmentId === id && row.exceptionType === "quantity_mismatch"
      && !["已解决", "已作废"].includes(row.status))
    || Number(fulfillment.expectedQty ?? fulfillment.qty) !== adjustment.expectedQty
    || Number(fulfillment.actualQty ?? fulfillment.expectedQty ?? fulfillment.qty) !== adjustment.newQty
    || (adjustment.resolutionId && (clean(latest?.id ?? latest?.quantityVarianceResolutionId) !== adjustment.resolutionId
      || latest?.businessDecisionId !== adjustment.decisionId || decision?.status !== "active"
      || Number(latest?.actualQty) !== adjustment.newQty || Number(latest?.expectedQty) !== adjustment.expectedQty
      || !(adjustment.newQty > adjustment.expectedQty ? ["赠送数量"] : ["按实际数量出库", "赠送数量"]).includes(latest?.resolutionResult)
      || decision?.businessId !== id || decision?.decisionScope !== "fulfillment_quantity_variance"))) throw conflict();
}

export function buildNoteCorrectionQuery(plan) {
  const p = createPostgresParameterBinder();
  const now = p.timestamp(plan.now);
  const fulfillmentId = p.text(plan.fulfillment.id);
  const inventory = p.json(plan.inventoryAdjustments.map((item) => ({ id: item.inventoryItemId, change: item.onHandQtyChange, expected: item.expectedOnHand,
    expected_net: item.expectedNetDeducted ?? 0 })));
  const ledgers = p.json(plan.inventoryLedgerEntries.map((entry) => ({ id: entry.ledgerId, item: entry.inventoryItemId, change_type: entry.changeType, before: entry.qtyBefore,
    change: entry.qtyChange, after: entry.qtyAfter, source_type: entry.sourceType, source_id: entry.sourceId, reason: entry.reason, remark: entry.remark })));
  const line = plan.statementLine;
  const statement = plan.statement;
  const snapshot = plan.priceSnapshot;
  const log = plan.operationLog;
  const checkedDeductionSources = p.textArray(NET_DEDUCTION_SOURCE_TYPES);
  const preDepartureGuard = buildPreDepartureGuard(plan, { p, fulfillmentId, checkedDeductionSources });
  return {
    orderLineLockIds: plan.approvedAdjustment?.orderLineId ? [plan.approvedAdjustment.orderLineId] : [],
    text: `
WITH locked_fulfillment AS MATERIALIZED (
  SELECT * FROM fulfillment_records WHERE id = ${fulfillmentId} FOR UPDATE
),
locked_print AS MATERIALIZED (
  SELECT id, status FROM print_records WHERE id = ${p.text(plan.printRecord.id)} FOR UPDATE
),
locked_paper AS MATERIALIZED (
  SELECT id, revision, status, document_version FROM paper_outbound_documents
  WHERE id = ${p.text(plan.paper?.id ?? "")} AND fulfillment_id = ${fulfillmentId} AND print_record_id = ${p.text(plan.printRecord.id)}
  FOR UPDATE
),
locked_items AS MATERIALIZED (
  SELECT item.id, item.on_hand_qty, item.reserved_qty, item.waiting_pickup_locked_qty, item.pending_handling_qty, x.change, x.expected, x.expected_net
  FROM inventory_items item JOIN jsonb_to_recordset(${inventory}) AS x(id text, change integer, expected integer, expected_net integer) ON x.id = item.id
  ORDER BY item.id FOR UPDATE OF item
),
-- 这次交付在每个库存项上实际净扣了多少（锁住库存项后从流水现算）：退回不能超过净扣数，也必须和页面读到的一致。
item_net_deducted AS MATERIALIZED (
  SELECT locked_items.id, COALESCE(-SUM(ledger.qty_change), 0)::integer AS net
  FROM locked_items LEFT JOIN inventory_ledger_entries ledger ON ledger.inventory_item_id = locked_items.id AND ledger.source_id = ${fulfillmentId}
    AND ledger.source_type = ANY(${checkedDeductionSources})
  GROUP BY locked_items.id
),
locked_line AS MATERIALIZED (
  SELECT id, delivered_qty, final_amount FROM statement_lines WHERE id = ${p.text(line?.id ?? "")} FOR UPDATE
),
locked_statement AS MATERIALIZED (
  SELECT id, revision, status, received_amount FROM statements WHERE id = ${p.text(statement?.id ?? "")} FOR UPDATE
),
guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM locked_fulfillment WHERE revision = ${p.integer(plan.fulfillment.expectedRevision)})
    AND EXISTS (SELECT 1 FROM locked_print WHERE status IN ('printed', 'reprinted'))
    ${plan.paper ? `AND EXISTS (SELECT 1 FROM locked_paper WHERE revision = ${p.integer(plan.paper.revision)} AND status <> '已作废')` : ""}
    AND (SELECT count(*) FROM locked_items) = jsonb_array_length(${inventory})
    AND NOT EXISTS (SELECT 1 FROM locked_items WHERE on_hand_qty <> expected OR on_hand_qty + change < 0)
    AND NOT EXISTS (SELECT 1 FROM locked_items JOIN item_net_deducted net ON net.id = locked_items.id
      WHERE GREATEST(net.net, 0) <> locked_items.expected_net OR net.net - locked_items.change < 0)
    ${preDepartureGuard}
    AND (${line ? `EXISTS (SELECT 1 FROM locked_line WHERE delivered_qty = ${p.integer(line.expectedDeliveredQty)} AND final_amount = ${p.number(line.expectedFinalAmount)})` : "TRUE"})
    AND (${statement ? `EXISTS (SELECT 1 FROM locked_statement WHERE revision = ${p.integer(statement.expectedRevision)} AND received_amount = 0
      AND status NOT IN ('已核销', '已结清', '已确认欠款', '已作废', '作废'))` : "TRUE"}),
    'NOTE_CORRECTION_CHANGED') AS ok
),
voided_print AS (
  UPDATE print_records SET status = 'voided', void_reason = ${p.text(plan.printRecord.voidReason)}
  FROM guard WHERE guard.ok AND print_records.id = ${p.text(plan.printRecord.id)} RETURNING print_records.id
),
voided_paper AS (
  UPDATE paper_outbound_documents SET status = '已作废', voided_by = ${p.nullableText(plan.operatorId)}, voided_at = ${now},
    void_reason = ${p.text(plan.printRecord.voidReason)}, revision = paper_outbound_documents.revision + 1, updated_at = ${now}
  FROM guard WHERE guard.ok AND paper_outbound_documents.id = ${p.text(plan.paper?.id ?? "")} AND paper_outbound_documents.status <> '已作废'
  RETURNING paper_outbound_documents.id
),
updated_fulfillment AS (
  UPDATE fulfillment_records SET actual_qty = ${p.integer(plan.fulfillment.actualQty)}, status = ${p.text(plan.fulfillment.status)},
    ${plan.approvedAdjustment ? "paper_outbound_status = '待重打纸单', paper_outbound_document_id = NULL," : ""}
    customer_snapshot = ${p.json(plan.fulfillment.customerSnapshot)}, revision = fulfillment_records.revision + 1, updated_at = ${now}
  FROM guard WHERE guard.ok AND fulfillment_records.id = ${fulfillmentId}
  RETURNING fulfillment_records.id, fulfillment_records.revision
),
updated_items AS (
  UPDATE inventory_items SET on_hand_qty = inventory_items.on_hand_qty + locked_items.change, revision = inventory_items.revision + 1, updated_at = ${now}
  FROM locked_items, guard WHERE guard.ok AND inventory_items.id = locked_items.id
  RETURNING inventory_items.id
),
inserted_ledgers AS (
  INSERT INTO inventory_ledger_entries (id, inventory_item_id, change_type, qty_before, qty_change, qty_after, source_type, source_id, operator_id, confirmed_by, occurred_at, created_at, reason, remark)
  SELECT x.id, x.item, x.change_type, x.before, x.change, x.after, x.source_type, x.source_id, ${p.nullableText(plan.operatorId)}, ${p.nullableText(plan.operatorId)}, ${now}, ${now}, x.reason, x.remark
  FROM guard, jsonb_to_recordset(${ledgers}) AS x(id text, item text, change_type text, before integer, change integer, after integer, source_type text, source_id text, reason text, remark text)
  WHERE guard.ok RETURNING id
),
${line?.remove ? `changed_line AS (
  DELETE FROM statement_lines USING guard WHERE guard.ok AND statement_lines.id = ${p.text(line.id)} RETURNING statement_lines.id
),` : `changed_line AS (
  UPDATE statement_lines SET delivered_qty = ${p.integer(line?.deliveredQty ?? 0)}, chargeable_qty = ${p.integer(line?.chargeableQty ?? 0)}, free_qty = ${p.integer(line?.freeQty ?? 0)},
    amount = ${p.number(line?.amount ?? 0)}, final_amount = ${p.number(line?.finalAmount ?? 0)}, revision = statement_lines.revision + 1
  FROM guard WHERE guard.ok AND statement_lines.id = ${p.text(line?.id ?? "")}
  RETURNING statement_lines.id
),`}
updated_statement AS (
  UPDATE statements SET receivable_amount = ${p.number(statement?.receivable ?? 0)}, variance_amount = ${p.number(statement?.variance ?? 0)},
    corrected_after_send_at = ${statement?.correctedAfterSend ? now : "statements.corrected_after_send_at"},
    revision = statements.revision + 1, updated_at = ${now}
  FROM guard WHERE guard.ok AND statements.id = ${p.text(statement?.id ?? "")}
  RETURNING statements.id
),
inserted_snapshot AS (
  INSERT INTO price_snapshots (id, order_line_id, snapshot_type, version_no, bag_price, print_price, other_fee, adjustment_amount, chargeable_qty, final_amount, override_reason, created_by, created_at)
  SELECT ${p.text(snapshot?.id ?? "")}, ${p.text(snapshot?.orderLineId ?? "")}, 'note_correction', ${p.integer(snapshot?.versionNo ?? 1)}, ${p.number(snapshot?.bagPrice ?? 0)},
    ${p.number(snapshot?.printPrice ?? 0)}, 0, 0, ${p.integer(snapshot?.chargeableQty ?? 0)}, ${p.number(snapshot?.finalAmount ?? 0)}, ${p.text(snapshot?.overrideReason ?? "")},
    ${p.nullableText(plan.operatorId)}, ${now}
  FROM guard WHERE guard.ok AND ${snapshot ? "TRUE" : "FALSE"}
  RETURNING id
),
logged AS (
  INSERT INTO operation_logs (id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at)
  SELECT ${p.text(log.id)}, 'fulfillment', ${fulfillmentId}, 'correct_fulfillment_note', ${p.json(log.before)}::jsonb, ${p.json(log.after)}::jsonb,
    ${p.text(log.reason)}, ${p.nullableText(plan.operatorId)}, 'outbound-delivery', ${now}, ${now}
  FROM updated_fulfillment RETURNING id
)
SELECT json_build_object(
  'fulfillmentId', (SELECT id FROM updated_fulfillment),
  'printRecordVoided', (SELECT count(*) FROM voided_print),
  'paperVoided', (SELECT count(*) FROM voided_paper),
  'inventoryUpdated', (SELECT count(*) FROM updated_items),
  'ledgers', (SELECT count(*) FROM inserted_ledgers),
  'statementLineChanged', (SELECT count(*) FROM changed_line),
  'statementUpdated', (SELECT count(*) FROM updated_statement),
  'priceSnapshot', (SELECT count(*) FROM inserted_snapshot),
  'summary', ${p.json(plan.summary)},
  'operationLogId', (SELECT id FROM logged)
) AS result;`.trim(),
    values: p.values,
  };
}

function buildPreDepartureGuard(plan, { p, fulfillmentId, checkedDeductionSources }) {
  const adjustment = plan.approvedAdjustment;
  if (!adjustment) return "";
  const orderLine = p.text(adjustment.orderLineId);
  const expectedQty = p.integer(adjustment.expectedQty);
  const newQty = p.integer(adjustment.newQty);
  const resolutionId = p.text(adjustment.resolutionId);
  const decisionId = p.text(adjustment.decisionId);
  return `AND EXISTS (
      SELECT 1 FROM locked_fulfillment f JOIN locked_paper p ON f.paper_outbound_document_id IS NULL OR f.paper_outbound_document_id = p.id
      WHERE f.order_line_id = ${orderLine} AND f.expected_qty = ${expectedQty} AND COALESCE(f.actual_qty, f.expected_qty) = ${newQty}
        AND f.stock_deducted_at IS NOT NULL AND f.physical_outbound_at IS NULL AND f.final_delivery_at IS NULL AND f.delivered_at IS NULL AND f.loaded_at IS NULL
        AND f.status NOT IN ('已取消','已作废','待补货','数量差异待处理','无法出库','送货异常','已交付','已提货','已拉走','已完成','在途','配送中','已装车')
        AND p.document_version = ${p.integer(plan.paper.version)}
    )
    AND NOT EXISTS (SELECT 1 FROM warehouse_outbound_executions x WHERE x.fulfillment_id = ${fulfillmentId} AND x.result = '实物已出库')
    AND NOT EXISTS (SELECT 1 FROM paper_outbound_documents d WHERE d.fulfillment_id = ${fulfillmentId} AND d.document_version > ${p.integer(plan.paper.version)})
    AND NOT EXISTS (SELECT 1 FROM fulfillment_records f WHERE f.order_line_id = ${orderLine} AND f.id <> ${fulfillmentId} AND f.status NOT IN ('已取消', '已作废'))
    ${adjustment.packingGroupAnchorId ? `AND NOT EXISTS (SELECT 1 FROM fulfillment_records f WHERE f.packing_group_anchor_id = ${p.text(adjustment.packingGroupAnchorId)}
      AND (f.physical_outbound_at IS NOT NULL OR f.loaded_at IS NOT NULL OR f.final_delivery_at IS NOT NULL OR f.delivered_at IS NOT NULL))` : ""}
    AND NOT EXISTS (SELECT 1 FROM statement_lines sl WHERE sl.fulfillment_id = ${fulfillmentId})
    AND NOT EXISTS (SELECT 1 FROM fulfillment_exceptions e WHERE e.fulfillment_id = ${fulfillmentId} AND e.exception_type = 'quantity_mismatch' AND e.status NOT IN ('已解决','已作废'))
    AND NOT EXISTS (
      SELECT 1 FROM locked_items WHERE change < 0 AND on_hand_qty - reserved_qty - waiting_pickup_locked_qty - pending_handling_qty < -change
    )
    AND (SELECT COALESCE(-SUM(l.qty_change), 0) FROM inventory_ledger_entries l WHERE l.source_id = ${fulfillmentId}
      AND l.source_type = ANY(${checkedDeductionSources})) = ${p.integer(adjustment.expectedNetDeducted)}
    AND ${adjustment.resolutionId ? `EXISTS (
      SELECT 1 FROM fulfillment_quantity_variance_resolutions r JOIN business_decision_records d ON d.id = r.business_decision_id
      WHERE r.id = ${resolutionId} AND r.fulfillment_id = ${fulfillmentId} AND r.expected_qty = ${expectedQty} AND r.actual_qty = ${newQty}
        AND r.resolution_result ${adjustment.newQty > adjustment.expectedQty ? "= '赠送数量'" : "IN ('按实际数量出库','赠送数量')"}
        AND d.id = ${decisionId} AND d.business_type = 'fulfillment' AND d.business_id = ${fulfillmentId}
        AND d.decision_scope = 'fulfillment_quantity_variance' AND d.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM fulfillment_quantity_variance_resolutions newer WHERE newer.fulfillment_id = r.fulfillment_id
          AND (newer.created_at, newer.id) > (r.created_at, r.id))
      FOR SHARE OF r, d
    )` : `${newQty} = ${expectedQty} AND ${resolutionId} = '' AND ${decisionId} = ''`}`;
}

export function createPostgresNoteCorrectionMethods({ idempotentTransactionJson, queryJson }) {
  return {
    async findNoteCorrectionReplay({ idempotencyKey, idempotencyPayload }) {
      const stored = await readPostgresIdempotencyReplay({ queryJson, scope: correctionScope, idempotencyKey, payload: idempotencyPayload });
      return stored ? correctionReceipt(stored) : null;
    },
    async recordNoteCorrection({ plan, idempotencyKey, idempotencyPayload }) {
      let raw;
      try {
        raw = await idempotentTransactionJson(buildPostgresIdempotencyRequest({
          scope: correctionScope,
          idempotencyKey,
          payload: idempotencyPayload,
          operatorId: plan.operatorId,
          targetType: "fulfillment",
          targetId: plan.fulfillment.id,
          resourceLocks: [`fulfillment:${plan.fulfillment.id}`, ...(plan.statement ? [`statement:${plan.statement.id}`] : []),
            ...(plan.paper ? [`paper-outbound:${plan.paper.id}`] : []),
            ...(plan.approvedAdjustment?.orderLineId ? [`order-line:${plan.approvedAdjustment.orderLineId}`] : []),
            ...(plan.approvedAdjustment?.packingGroupAnchorId ? [`packing-group:${plan.approvedAdjustment.packingGroupAnchorId}`] : []),
            ...plan.inventoryAdjustments.map((item) => `inventory:${item.inventoryItemId}`)],
          query: buildNoteCorrectionQuery(plan),
        }));
      } catch (error) {
        if (String(error?.message ?? "").includes("NOTE_CORRECTION_CHANGED")) throw conflict();
        throw error;
      }
      const row = Array.isArray(raw) ? raw[0] : raw;
      if (!row?.fulfillmentId) throw conflict();
      return { fulfillmentId: row.fulfillmentId, operationLogId: clean(row.operationLogId), summary: row.summary };
    },
  };
}
