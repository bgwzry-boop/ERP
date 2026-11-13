// 负责人 2026-11-12「作废重打」：一张已经打出来的送货单 / 自提单有错（数量、单价、地址提货人等文字，或者整张不要了），
// 一次事务里：作废这张单、改这次交付的数量 / 状态 / 地址、按差额退回或补扣库存、改对账单这一行和合计、
// 必要时补一个订单价格快照，记操作日志。改完再按正常流程重打（重打不再扣库存）。
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { buildPostgresIdempotencyRequest } from "./idempotency.mjs";

const clean = (value) => String(value ?? "").trim();
const conflict = (message = "单子刚被别人改过，请刷新后再改。") => Object.assign(new Error(message), { statusCode: 409, code: "NOTE_CORRECTION_CHANGED" });

export function createLocalNoteCorrectionMethods() {
  return {
    async recordNoteCorrection({ workspace, plan }) {
      const fulfillment = (workspace.fulfillments ?? []).find((row) => (row.fulfillmentId ?? row.id) === plan.fulfillment.id);
      if (!fulfillment || Number(fulfillment.revision ?? 1) !== plan.fulfillment.expectedRevision) throw conflict();
      const printRecord = (workspace.printRecords ?? []).find((row) => (row.printRecordId ?? row.id) === plan.printRecord.id);
      if (!printRecord || !["printed", "reprinted"].includes(clean(printRecord.status))) throw conflict();
      for (const adjustment of plan.inventoryAdjustments) {
        const item = (workspace.inventories ?? []).find((row) => row.id === adjustment.inventoryItemId);
        if (!item || Number(item.inStock ?? item.onHandQty ?? 0) !== adjustment.expectedOnHand) throw conflict("库存刚有变化，请刷新后再改。");
        const net = -(workspace.inventoryLedgers ?? []).filter((entry) => entry.inventoryItemId === adjustment.inventoryItemId && clean(entry.sourceId) === plan.fulfillment.id
          && NET_DEDUCTION_SOURCE_TYPES.includes(clean(entry.sourceType))).reduce((sum, entry) => sum + Number(entry.qtyChange), 0);
        if (Math.max(0, net) !== Number(adjustment.expectedNetDeducted ?? 0) || net - adjustment.onHandQtyChange < 0) throw conflict("库存流水刚有变化，请刷新后再改。");
      }
      if (plan.statementLine) {
        const line = (workspace.statementLines ?? []).find((row) => (row.statementLineId ?? row.id) === plan.statementLine.id);
        if (!line || Number(line.finalAmount ?? line.amount) !== plan.statementLine.expectedFinalAmount || Number(line.deliveredQty) !== plan.statementLine.expectedDeliveredQty) throw conflict("对账单刚有变化，请刷新后再改。");
      }
      Object.assign(printRecord, { status: "voided", voidReason: plan.printRecord.voidReason, updatedAt: plan.now });
      if (plan.paper) {
        const paper = (workspace.paperOutboundDocuments ?? []).find((row) => (row.paperOutboundDocumentId ?? row.id) === plan.paper.id);
        if (paper) Object.assign(paper, { status: "已作废", voidedBy: plan.operatorId, voidedAt: plan.now, voidReason: plan.printRecord.voidReason, revision: Number(paper.revision ?? 1) + 1, updatedAt: plan.now });
      }
      Object.assign(fulfillment, {
        actualQty: plan.fulfillment.actualQty, status: plan.fulfillment.status, customerSnapshot: plan.fulfillment.customerSnapshot,
        printed: false, revision: Number(fulfillment.revision ?? 1) + 1, updatedAt: plan.now,
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
      return { fulfillmentId: plan.fulfillment.id, operationLogId: plan.operationLog.id };
    },
  };
}

// 和改单服务里算「净扣」用的同一组来源（扣库存的各种来源 + 改单补扣 / 退回）。
export const NET_DEDUCTION_SOURCE_TYPES = ["fulfillment_note_print", "warehouse_physical_outbound", "warehouse_physical_outbound_legacy", "fulfillment_complete",
  "fulfillment_complete_legacy", "fulfillment_pickup", "fulfillment_pickup_legacy", "fulfillment_note_correction", "fulfillment_note_correction_return"];

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
  return {
    text: `
WITH locked_fulfillment AS MATERIALIZED (
  SELECT id, revision FROM fulfillment_records WHERE id = ${fulfillmentId} FOR UPDATE
),
locked_print AS MATERIALIZED (
  SELECT id, status FROM print_records WHERE id = ${p.text(plan.printRecord.id)} FOR UPDATE
),
locked_items AS MATERIALIZED (
  SELECT item.id, item.on_hand_qty, x.change, x.expected, x.expected_net
  FROM inventory_items item JOIN jsonb_to_recordset(${inventory}) AS x(id text, change integer, expected integer, expected_net integer) ON x.id = item.id
  ORDER BY item.id FOR UPDATE OF item
),
-- 这次交付在每个库存项上实际净扣了多少（锁住库存项后从流水现算）：退回不能超过净扣数，也必须和页面读到的一致。
item_net_deducted AS MATERIALIZED (
  SELECT locked_items.id, COALESCE(-SUM(ledger.qty_change), 0)::integer AS net
  FROM locked_items LEFT JOIN inventory_ledger_entries ledger ON ledger.inventory_item_id = locked_items.id AND ledger.source_id = ${fulfillmentId}
    AND ledger.source_type IN (${NET_DEDUCTION_SOURCE_TYPES.map((type) => p.text(type)).join(", ")})
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
    AND (SELECT count(*) FROM locked_items) = jsonb_array_length(${inventory})
    AND NOT EXISTS (SELECT 1 FROM locked_items WHERE on_hand_qty <> expected OR on_hand_qty + change < 0)
    AND NOT EXISTS (SELECT 1 FROM locked_items JOIN item_net_deducted net ON net.id = locked_items.id
      WHERE GREATEST(net.net, 0) <> locked_items.expected_net OR net.net - locked_items.change < 0)
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
  'operationLogId', (SELECT id FROM logged)
) AS result;`.trim(),
    values: p.values,
  };
}

export function createPostgresNoteCorrectionMethods({ idempotentTransactionJson }) {
  return {
    async recordNoteCorrection({ plan, idempotencyKey, idempotencyPayload }) {
      let raw;
      try {
        raw = await idempotentTransactionJson(buildPostgresIdempotencyRequest({
          scope: "fulfillment.correct_note",
          idempotencyKey,
          payload: idempotencyPayload,
          operatorId: plan.operatorId,
          targetType: "fulfillment",
          targetId: plan.fulfillment.id,
          resourceLocks: [`fulfillment:${plan.fulfillment.id}`, ...(plan.statement ? [`statement:${plan.statement.id}`] : []),
            ...plan.inventoryAdjustments.map((item) => `inventory:${item.inventoryItemId}`)],
          query: buildNoteCorrectionQuery(plan),
        }));
      } catch (error) {
        if (String(error?.message ?? "").includes("NOTE_CORRECTION_CHANGED")) throw conflict();
        throw error;
      }
      const row = Array.isArray(raw) ? raw[0] : raw;
      if (!row?.fulfillmentId) throw conflict();
      return { fulfillmentId: row.fulfillmentId, operationLogId: clean(row.operationLogId) };
    },
  };
}
