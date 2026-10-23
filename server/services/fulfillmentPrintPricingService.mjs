import { allocateFulfillmentAmount } from "../../shared/fulfillmentAmountAllocation.mjs";
import { captureFulfillmentBillingSnapshot, selectFulfillmentPriceSnapshot } from "./fulfillmentBillingSnapshotService.mjs";

const text = value => String(value ?? "").trim();
const invalid = message => Object.assign(new Error(message), { code: "FULFILLMENT_PRINT_PRICE_REQUIRED", statusCode: 409 });
const validNumber = value => ["number", "string"].includes(typeof value) && text(value) !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;

export function captureLegacyPrintOrderPrice(orderLine) {
  return { id: text(orderLine?.id ?? orderLine?.orderLineId), qty: orderLine?.qty ?? orderLine?.originalQty ?? null, amount: orderLine?.amount ?? orderLine?.finalAmount ?? null };
}

export function resolveFulfillmentPrintPricing({ workspace, fulfillment, orderLine }) {
  const orderLineId = text(fulfillment.orderLineId ?? fulfillment.lineId);
  if (!orderLine || text(orderLine.id ?? orderLine.orderLineId) !== orderLineId) throw invalid("缺少关联订单，不能确定本次纸单金额。");
  const deliveredQty = Number(fulfillment.actualQty ?? fulfillment.expectedQty ?? fulfillment.qty);
  if (!Number.isSafeInteger(deliveredQty) || deliveredQty < 0) throw invalid("本次交付数量未确认，不能生成纸单金额。");
  const billingSnapshot = captureFulfillmentBillingSnapshot(workspace, orderLineId);
  const fulfillmentId = text(fulfillment.fulfillmentId ?? fulfillment.id);
  const recorded = (workspace.statementLines ?? []).filter(line => text(line.fulfillmentId ?? line.fulfillment_id) === fulfillmentId);
  if (recorded.length > 1) throw invalid("本次交付关联多条入账记录，请先核对。");
  if (recorded.length) {
    const line = recorded[0];
    const chargeableQty = Number(line.chargeableQty ?? line.chargeable_qty);
    const freeQty = Number(line.freeQty ?? line.free_qty);
    const originalQty = Number(line.deliveredQty ?? line.delivered_qty);
    const amount = line.finalAmount ?? line.final_amount;
    if (text(line.orderLineId ?? line.order_line_id) !== orderLineId || originalQty !== deliveredQty || !Number.isSafeInteger(chargeableQty) || !Number.isSafeInteger(freeQty) || chargeableQty < 0 || freeQty < 0 || chargeableQty + freeQty !== deliveredQty || !validNumber(amount)) throw invalid("本次交付数量与原入账凭据不一致，请先核对。");
    return { billingSnapshot, pricing: { deliveredQty, chargeableQty, freeQty, amount: Number(amount), unitPrice: null, phase: "recorded", source: "recorded_statement", statementLineId: text(line.id ?? line.statementLineId) } };
  }
  if (!billingSnapshot.lines.length && (workspace.statements ?? []).some(statement => (statement.lineIds ?? []).includes(orderLineId))) throw invalid("历史账单缺少分批入账明细，不能确定本次纸单金额。");
  const price = selectFulfillmentPriceSnapshot(billingSnapshot);
  const strict = workspace.fulfillmentActionTransactionRepository?.kind === "postgres" || workspace.runtimeConfig?.production === true || workspace.runtimeConfig?.mode === "production";
  if (!price && strict) throw invalid("缺少正式订单价格快照，不能生成纸单金额。");
  const legacyOrderPrice = price ? null : captureLegacyPrintOrderPrice(orderLine);
  const totalAmount = price ? price.finalAmount : legacyOrderPrice.amount;
  const totalQty = price ? price.chargeableQty : legacyOrderPrice.qty;
  const allocation = allocateFulfillmentAmount({ totalAmount, totalChargeableQty: totalQty, chargeableQty: deliveredQty, priorLines: billingSnapshot.lines });
  return { billingSnapshot, legacyOrderPrice, pricing: { deliveredQty, chargeableQty: deliveredQty, freeQty: 0, amount: allocation.amount, unitPrice: Number(totalAmount) / Number(totalQty), phase: "planned", source: price ? "price_snapshot" : "local_order_reference", priceSnapshotId: price?.id || "", priorChargeableQty: allocation.priorChargeableQty, priorAmount: allocation.priorAmount } };
}
