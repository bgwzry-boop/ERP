import { autoQuantityDifference } from "../../shared/quantityTolerance.js";
const text = value => String(value ?? '').trim();
const integer = value => value !== null && value !== undefined && text(value) !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const conflict = () => Object.assign(new Error('赠送决定与本次实出数量不一致，请先核对原数量差异处理记录。'),{code:'FULFILLMENT_GIFT_QUANTITY_CONFLICT',statusCode:409});
export function resolveFulfillmentBillingQuantity({workspace,fulfillment,actualQty}) {
  const deliveredQty = Number(actualQty);
  if (!integer(actualQty)) throw conflict();
  const id = text(fulfillment.id ?? fulfillment.fulfillmentId);
  const resolutions = (workspace.fulfillmentQuantityVarianceResolutions ?? []).filter(item => text(item.fulfillmentId) === id)
    .sort((a,b)=>text(b.createdAt).localeCompare(text(a.createdAt)));
  const latest = resolutions[0];
  if (!latest) {
    // P2-05: a produced order within 1% of the plan — over: bill the plan, the rest is free.
    const lineId = text(fulfillment.lineId ?? fulfillment.orderLineId);
    const orderLine = (workspace.orderLines ?? []).find(row => text(row.id ?? row.orderLineId) === lineId);
    const auto = autoQuantityDifference({ orderLine, expectedQty: fulfillment.expectedQty ?? fulfillment.qty, actualQty: deliveredQty });
    if (auto) return {deliveredQty,chargeableQty:auto.chargeableQty,freeQty:auto.freeQty};
  }
  if (latest?.resolutionResult !== '赠送数量') return {deliveredQty,chargeableQty:deliveredQty,freeQty:0};
  if (!text(latest.businessDecisionId) || !integer(latest.expectedQty) || !integer(latest.actualQty) || Number(latest.actualQty) !== deliveredQty || Number(latest.expectedQty) > deliveredQty) throw conflict();
  const chargeableQty = Number(latest.expectedQty);
  return {deliveredQty,chargeableQty,freeQty:deliveredQty-chargeableQty};
}
