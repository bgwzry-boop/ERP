// 负责人 2026-11-12「作废重打」：送货单 / 自提单打出来以后发现有错，作废这一张，按改对的内容重打。
// 四种情况（可以同时改）：
//   1. 数量错了：这次交付的数量改成实际的；扣过库存的按差额退回或补扣；已入对账单的这一行金额按原单价跟着改。
//   2. 单价错了：只改这一单的单价（不改价格表）；已入对账单的这一行金额跟着改，订单补一个价格快照。
//   3. 地址、提货人等文字错了：只换纸上的字，数量金额、库存、对账单不动。
//   4. 整张不要了：扣过的库存全部退回，对账单删掉这一行，这次交付改成已取消。
// 已经收过款、结清或作废的对账单不能改；对账单已经发给客户的，改完提示要重新发。
// 改数量 / 单价只支持这个订单只发了这一批的情况（分批发货的订单金额是按批分摊的，改一批会打乱后面几批）。
import { randomUUID } from "node:crypto";
import { closedStatementPaymentStatuses } from "../../shared/statementPaymentPolicy.js";

const clean = (value) => String(value ?? "").trim();
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const price4 = (value) => Math.round((Number(value) + Number.EPSILON) * 10_000) / 10_000;
const businessError = (statusCode, code, message) => ({ error: true, statusCode, code, message });
const NOTE_TYPES = new Set(["delivery_note", "pickup_note", "outbound_note"]);
// 这些来源的库存流水是「这次交付出库扣掉的」。
const DEDUCTION_SOURCES = new Set(["fulfillment_note_print", "warehouse_physical_outbound", "warehouse_physical_outbound_legacy", "fulfillment_complete",
  "fulfillment_complete_legacy", "fulfillment_pickup", "fulfillment_pickup_legacy", "fulfillment_note_correction"]);
const CLOSED_FULFILLMENT = new Set(["已取消", "已作废"]);

const idOf = (row) => clean(row?.fulfillmentId ?? row?.id);
const printRecordIdOf = (row) => clean(row?.printRecordId ?? row?.id);
const documentTypeOf = (row) => clean(row?.documentType ?? row?.document_type);

export function createFulfillmentNoteCorrectionService({ findInventoryItem, now = () => new Date() } = {}) {
  if (typeof findInventoryItem !== "function") throw new TypeError("findInventoryItem must be a function");
  return { correctFulfillmentNote, planFulfillmentNoteCorrection };

  /** 只算要改什么，不写库（页面预览「这次会怎么改」也用它）。 */
  function planFulfillmentNoteCorrection({ workspace, fulfillmentId, body = {}, operatorId }) {
    const fulfillment = (workspace.fulfillments ?? []).find((row) => idOf(row) === clean(fulfillmentId));
    if (!fulfillment) return { notFound: true, code: "FULFILLMENT_NOT_FOUND" };
    if (CLOSED_FULFILLMENT.has(clean(fulfillment.status))) return businessError(409, "NOTE_CORRECTION_FULFILLMENT_CLOSED", "这次交付已经取消，不能再改单。");
    if (body.expectedRevision != null && Number(body.expectedRevision) !== Number(fulfillment.revision ?? 1)) {
      return businessError(409, "NOTE_CORRECTION_CHANGED", "单子刚被别人改过，请刷新后再改。");
    }
    const reason = clean(body.reason);
    if (!reason) return businessError(422, "NOTE_CORRECTION_REASON_REQUIRED", "请写一句为什么作废重打，比如「数量写错了，实际 4800 个」。");
    if (reason.length > 200) return businessError(422, "NOTE_CORRECTION_REASON_INVALID", "作废原因最多 200 个字。");
    const printRecord = [...(workspace.printRecords ?? [])]
      .filter((row) => clean(row.targetType) === "fulfillment" && clean(row.targetId) === idOf(fulfillment)
        && NOTE_TYPES.has(documentTypeOf(row)) && ["printed", "reprinted"].includes(clean(row.status)))
      .sort((a, b) => clean(b.printedAt ?? b.createdAt).localeCompare(clean(a.printedAt ?? a.createdAt)))[0];
    if (!printRecord) return businessError(409, "NOTE_CORRECTION_NO_PRINTED_NOTE", "这次交付还没有打出来的送货单 / 自提单，不用作废，直接改了再打。");

    const voidWhole = body.voidWhole === true;
    const oldQty = Number(fulfillment.actualQty ?? fulfillment.expectedQty ?? fulfillment.qty ?? 0);
    const correctedQty = body.correctedQty == null || clean(body.correctedQty) === "" ? null : Number(body.correctedQty);
    if (correctedQty !== null && (!Number.isSafeInteger(correctedQty) || correctedQty < 1 || correctedQty > 10_000_000)) {
      return businessError(422, "NOTE_CORRECTION_QTY_INVALID", "改后的数量要填正整数。");
    }
    const correctedUnitPrice = body.correctedUnitPrice == null || clean(body.correctedUnitPrice) === "" ? null : Number(body.correctedUnitPrice);
    if (correctedUnitPrice !== null && (!/^\d+(?:\.\d{1,4})?$/u.test(clean(body.correctedUnitPrice)) || correctedUnitPrice <= 0 || correctedUnitPrice > 1000)) {
      return businessError(422, "NOTE_CORRECTION_PRICE_INVALID", "改后的单价要填大于 0 的数字，最多 4 位小数。");
    }
    const address = body.address == null ? null : clean(body.address);
    if (address !== null && address.length > 120) return businessError(422, "NOTE_CORRECTION_ADDRESS_INVALID", "地址最多 120 个字。");
    const newQty = voidWhole ? 0 : correctedQty ?? oldQty;
    const qtyChanged = !voidWhole && newQty !== oldQty;

    // 对账单
    const statementLines = (workspace.statementLines ?? []).filter((row) => clean(row.fulfillmentId ?? row.fulfillment_id) === idOf(fulfillment));
    if (statementLines.length > 1) return businessError(409, "NOTE_CORRECTION_STATEMENT_AMBIGUOUS", "这次交付关联了多条对账明细，请先核对。");
    const statementLine = statementLines[0] ?? null;
    const statement = statementLine ? (workspace.statements ?? []).find((row) => clean(row.statementId ?? row.id) === clean(statementLine.statementId ?? statementLine.statement_id)) : null;
    if (statementLine && !statement) return businessError(409, "NOTE_CORRECTION_STATEMENT_MISSING", "对账明细找不到所属对账单，请先核对。");
    if (statement && (closedStatementPaymentStatuses.includes(clean(statement.status)) || Number(statement.received ?? statement.receivedAmount ?? 0) > 0)) {
      return businessError(409, "NOTE_CORRECTION_STATEMENT_SETTLED", "这张对账单已经收过款或结清了，不能直接改单，请找财务按差额处理。");
    }
    const oldUnit = statementLine && Number(statementLine.chargeableQty) > 0 ? Number(statementLine.amount) / Number(statementLine.chargeableQty) : null;
    const priceChanged = correctedUnitPrice !== null && (oldUnit === null || price4(oldUnit) !== price4(correctedUnitPrice));
    if (!voidWhole && (qtyChanged || priceChanged) && !statementLine) {
      return businessError(409, "NOTE_CORRECTION_NOT_BILLED_YET", "这次交付还没送到 / 拉走、没入对账单：改数量请在订单里改量，改单价请在订单里改价，然后作废重打。");
    }
    const orderLineId = clean(fulfillment.orderLineId ?? fulfillment.lineId);
    if ((qtyChanged || priceChanged) && !voidWhole) {
      const batches = (workspace.fulfillments ?? []).filter((row) => clean(row.orderLineId ?? row.lineId) === orderLineId && !CLOSED_FULFILLMENT.has(clean(row.status)));
      const lines = (workspace.statementLines ?? []).filter((row) => clean(row.orderLineId ?? row.order_line_id) === orderLineId);
      if (batches.length > 1 || lines.length > 1) {
        return businessError(409, "NOTE_CORRECTION_SPLIT_ORDER", "这个订单分了几批发货，金额是按批分摊的，改一批的数量 / 单价会打乱其它批，请找技术处理。");
      }
    }
    const textChanged = address !== null && address !== clean(fulfillment.customerSnapshot?.address);
    if (!voidWhole && !qtyChanged && !priceChanged && !textChanged && !clean(body.pickerName)) {
      return businessError(422, "NOTE_CORRECTION_NOTHING_CHANGED", "没有要改的内容。只是重新打一张，请用「重打」。");
    }

    // 库存：这次交付已经扣掉的（按库存项汇总），改数量按差额退 / 补，整张作废全部退回。
    const deductedByItem = new Map();
    for (const entry of workspace.inventoryLedgers ?? []) {
      if (clean(entry.sourceId) !== idOf(fulfillment)) continue;
      const counts = DEDUCTION_SOURCES.has(clean(entry.sourceType)) || clean(entry.sourceType) === "fulfillment_note_correction_return";
      if (!counts) continue;
      deductedByItem.set(entry.inventoryItemId, (deductedByItem.get(entry.inventoryItemId) ?? 0) - Number(entry.qtyChange));
    }
    const deductedItems = [...deductedByItem].filter(([, qty]) => qty > 0).sort((a, b) => b[1] - a[1]);
    const inventoryAdjustments = [];
    const inventoryLedgerEntries = [];
    const stockNotes = [];
    const pushLedger = (itemId, change, label) => {
      const item = findInventoryItem(workspace, itemId);
      const before = Number(item?.inStock ?? item?.onHandQty ?? item?.onHand ?? 0);
      const existing = inventoryAdjustments.find((row) => row.inventoryItemId === itemId);
      const projected = existing ? existing.expectedOnHand + existing.onHandQtyChange : before;
      if (existing) existing.onHandQtyChange += change; else inventoryAdjustments.push({ inventoryItemId: itemId, onHandQtyChange: change, expectedOnHand: before });
      inventoryLedgerEntries.push({
        ledgerId: `LEDGER-${idOf(fulfillment)}-FIX-${randomUUID().slice(0, 8)}`, inventoryItemId: itemId,
        changeType: change > 0 ? "改单退回库存" : "改单补扣库存", qtyBefore: projected, qtyChange: change, qtyAfter: projected + change,
        sourceType: change > 0 ? "fulfillment_note_correction_return" : "fulfillment_note_correction", sourceId: idOf(fulfillment),
        reason: reason, remark: label,
      });
    };
    if (voidWhole) {
      for (const [itemId, qty] of deductedItems) pushLedger(itemId, qty, `整张作废，退回 ${qty}`);
    } else if (qtyChanged && deductedItems.length) {
      const [itemId] = deductedItems[0];
      const diff = oldQty - newQty;
      if (diff > 0) pushLedger(itemId, diff, `数量 ${oldQty} 改成 ${newQty}，退回 ${diff}`);
      else {
        const item = findInventoryItem(workspace, itemId);
        const onHand = Number(item?.inStock ?? item?.onHandQty ?? item?.onHand ?? 0);
        const take = Math.min(onHand, -diff);
        if (take > 0) pushLedger(itemId, -take, `数量 ${oldQty} 改成 ${newQty}，补扣 ${take}`);
        if (take < -diff) stockNotes.push(`线上库存不够，少扣了 ${-diff - take} 个，请盘点修正`);
      }
    }

    // 对账单这一行和合计
    let linePlan = null;
    let statementPlan = null;
    let priceSnapshot = null;
    if (statementLine && (voidWhole || qtyChanged || priceChanged)) {
      const freeQty = voidWhole ? 0 : Math.min(Number(statementLine.freeQty ?? 0), newQty);
      const chargeableQty = voidWhole ? 0 : newQty - freeQty;
      const unit = correctedUnitPrice ?? oldUnit ?? 0;
      const amount = voidWhole ? 0 : money(unit * chargeableQty);
      const adjustment = Number(statementLine.adjustmentAmount ?? 0);
      const finalAmount = voidWhole ? 0 : money(amount + adjustment);
      const oldFinal = Number(statementLine.finalAmount ?? statementLine.amount ?? 0);
      linePlan = {
        id: clean(statementLine.statementLineId ?? statementLine.id), remove: voidWhole,
        deliveredQty: newQty, chargeableQty, freeQty, amount, finalAmount,
        expectedDeliveredQty: Number(statementLine.deliveredQty), expectedFinalAmount: oldFinal,
      };
      const receivable = money(Number(statement.receivable ?? statement.receivableAmount ?? 0) - oldFinal + finalAmount);
      const received = Number(statement.received ?? statement.receivedAmount ?? 0);
      statementPlan = {
        id: clean(statement.statementId ?? statement.id), expectedRevision: Number(statement.revision ?? 1), receivable, variance: money(Math.max(0, receivable - received)),
        correctedAfterSend: Boolean(statement.lastSentAt) || clean(statement.status).includes("已发送")
          || (workspace.statementSendRecords ?? []).some((row) => clean(row.statementId ?? row.statement_id) === clean(statement.statementId ?? statement.id)),
        lineIds: voidWhole && !(workspace.statementLines ?? []).some((row) => row !== statementLine && clean(row.statementId ?? row.statement_id) === clean(statement.statementId ?? statement.id)
          && clean(row.orderLineId ?? row.order_line_id) === orderLineId) ? (statement.lineIds ?? []).filter((id) => id !== orderLineId) : undefined,
      };
      if (!voidWhole) {
        // 订单补一个价格快照，让以后的金额核对（按订单价格分摊）和这次改的一致。
        const versions = (workspace.priceSnapshots ?? []).filter((row) => clean(row.orderLineId ?? row.order_line_id) === orderLineId && clean(row.snapshotType ?? row.snapshot_type) === "note_correction")
          .map((row) => Number(row.versionNo ?? row.version_no ?? 0));
        const latest = [...(workspace.priceSnapshots ?? [])].filter((row) => clean(row.orderLineId ?? row.order_line_id) === orderLineId)
          .sort((a, b) => clean(b.createdAt ?? b.created_at).localeCompare(clean(a.createdAt ?? a.created_at)))[0];
        const printPrice = Math.min(Number(latest?.printPrice ?? latest?.print_price ?? 0), unit);
        priceSnapshot = {
          id: `PRICE-FIX-${idOf(fulfillment)}-${randomUUID().slice(0, 8)}`, orderLineId, snapshotType: "note_correction",
          versionNo: (versions.length ? Math.max(...versions) : 0) + 1, bagPrice: price4(unit - printPrice), printPrice: price4(printPrice),
          chargeableQty, finalAmount: amount, overrideReason: `作废重打：${reason}`,
        };
      }
    }

    const occurredAt = now().toISOString();
    const customerSnapshot = { ...(fulfillment.customerSnapshot ?? {}), ...(textChanged ? { address } : {}) };
    const changes = [
      voidWhole ? "整张作废" : null,
      qtyChanged ? `数量 ${oldQty} → ${newQty}` : null,
      priceChanged ? `单价 ${oldUnit === null ? "—" : price4(oldUnit)} → ${price4(correctedUnitPrice)}` : null,
      textChanged ? `地址改为「${address}」` : null,
      clean(body.pickerName) ? `提货人改为「${clean(body.pickerName)}」` : null,
      ...stockNotes,
    ].filter(Boolean);
    const paper = (workspace.paperOutboundDocuments ?? []).find((row) => clean(row.printRecordId ?? row.print_record_id) === printRecordIdOf(printRecord) && clean(row.status) !== "已作废");
    return {
      plan: {
        now: occurredAt, operatorId,
        fulfillment: { id: idOf(fulfillment), expectedRevision: Number(fulfillment.revision ?? 1), actualQty: newQty, status: voidWhole ? "已取消" : clean(fulfillment.status), customerSnapshot },
        printRecord: { id: printRecordIdOf(printRecord), documentType: documentTypeOf(printRecord), voidReason: `作废重打：${reason}` },
        paper: paper ? { id: clean(paper.paperOutboundDocumentId ?? paper.id) } : null,
        inventoryAdjustments, inventoryLedgerEntries,
        statementLine: linePlan, statement: statementPlan, priceSnapshot,
        operationLog: { id: `LOG-NOTE-FIX-${randomUUID()}`, targetType: "fulfillment", targetId: idOf(fulfillment), action: "correct_fulfillment_note", operatorId,
          before: { actualQty: oldQty, status: clean(fulfillment.status), printRecordId: printRecordIdOf(printRecord), statementLineAmount: statementLine ? Number(statementLine.finalAmount ?? statementLine.amount) : null },
          after: { actualQty: newQty, changes }, reason, occurredAt, createdAt: occurredAt, pageKey: "outbound-delivery" },
      },
      summary: { changes, voidWhole, reprint: !voidWhole, previousPrintRecordId: printRecordIdOf(printRecord), documentType: documentTypeOf(printRecord),
        statementNeedsResend: Boolean(statementPlan?.correctedAfterSend) },
    };
  }

  async function correctFulfillmentNote({ workspace, fulfillmentId, body = {}, operatorId }) {
    const planned = planFulfillmentNoteCorrection({ workspace, fulfillmentId, body, operatorId });
    if (planned.error || planned.notFound) return planned;
    const idempotencyKey = clean(body.idempotencyKey);
    if (idempotencyKey.length < 8) return businessError(422, "IDEMPOTENCY_KEY_INVALID", "缺少本次提交标识，请重新提交。");
    const repository = workspace.fulfillmentActionTransactionRepository;
    if (typeof repository?.recordNoteCorrection !== "function") return businessError(503, "NOTE_CORRECTION_UNAVAILABLE", "暂时不能作废重打，请稍后再试。");
    try {
      const saved = await repository.recordNoteCorrection({
        workspace, plan: planned.plan, idempotencyKey,
        idempotencyPayload: { fulfillmentId: clean(fulfillmentId), voidWhole: body.voidWhole === true, correctedQty: body.correctedQty ?? null, correctedUnitPrice: body.correctedUnitPrice ?? null,
          address: body.address ?? null, pickerName: body.pickerName ?? null, reason: clean(body.reason), operatorId },
      });
      return { statusCode: 200, response: { fulfillmentId: saved.fulfillmentId, operationLogId: saved.operationLogId, ...planned.summary } };
    } catch (error) {
      if (error?.code === "NOTE_CORRECTION_CHANGED" || error?.statusCode === 409) return businessError(409, "NOTE_CORRECTION_CHANGED", error.message || "单子刚被别人改过，请刷新后再改。");
      throw error;
    }
  }
}
