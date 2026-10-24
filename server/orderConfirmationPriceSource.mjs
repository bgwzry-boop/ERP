import { isDeepStrictEqual } from "node:util";
import { assertPublishedOrderPriceSnapshots } from "./orderDraftPublishedPricing.mjs";
import { normalizeOrderType } from "../shared/orderRouting.js";

const clean = value => String(value ?? "").trim();
const finite = value => typeof value === "number" && Number.isFinite(value);

// These snapshots are made by a server command, never accepted from a request
// body. An unknown bag price is not a free order or a print-only quotation.
export function assertOrderConfirmationPriceSources({ orderLines = [], priceSnapshots = [], miniappPriceSource, publishedPriceSource } = {}) {
  assertPublishedOrderPriceSnapshots(publishedPriceSource, orderLines, priceSnapshots);
  for (const line of orderLines) {
    const lineId = clean(line.orderLineId ?? line.id);
    const snapshots = priceSnapshots.filter(row => clean(row.orderLineId ?? row.order_line_id) === lineId);
    if (snapshots.length !== 1) throw missingPrice(lineId);
    const snapshot = snapshots[0];
    const bagPrice = snapshot.bagPrice ?? snapshot.bag_price ?? 0;
    const printPrice = snapshot.printPrice ?? snapshot.print_price ?? 0;
    const otherFee = snapshot.otherFee ?? snapshot.other_fee ?? 0;
    const finalAmount = snapshot.finalAmount ?? snapshot.final_amount ?? snapshot.amount;
    const chargeableQty = snapshot.chargeableQty ?? snapshot.chargeable_qty ?? line.originalQty ?? line.qty;
    if (![bagPrice, printPrice, otherFee, finalAmount].every(value => finite(value) && value >= 0)
      || !Number.isSafeInteger(chargeableQty) || chargeableQty < 0) throw missingPrice(lineId);
    if (miniappPriceSource) {
      const evidence = snapshot.sourceEvidence ?? snapshot.source_evidence_json;
      const sourceLine = miniappPriceSource.lines?.find(item => item.normalizedLine?.sourceLineId === evidence?.sourceLineId)?.normalizedLine;
      const quote = sourceLine?.quoteSnapshot;
      if (!quote || evidence.intakeId !== miniappPriceSource.id || !isDeepStrictEqual(evidence.quote, quote)
        || bagPrice !== quote.basePrice + quote.handleAddon + quote.specialRequirementAddon
        || printPrice !== quote.printFee || finalAmount !== quote.amount || chargeableQty !== sourceLine.quantity) throw missingPrice(lineId);
      continue;
    }
    // A previously authorized zero-billable gift retains its audit basis. This
    // must not turn missing prices for ordinary billable units into free goods.
    const explicitGift = chargeableQty === 0 && finalAmount === 0 && clean(snapshot.overrideReason ?? snapshot.override_reason);
    const hasRequiredPrice = normalizeOrderType(line.orderType ?? line.order_type) === "external_print"
      ? printPrice > 0 : bagPrice > 0;
    if (!hasRequiredPrice && !explicitGift) throw missingPrice(lineId);
    if (finalAmount === 0 && chargeableQty > 0) {
      const adjustment = snapshot.adjustmentAmount ?? snapshot.adjustment_amount ?? 0;
      const expected = Math.round(((bagPrice + printPrice) * chargeableQty + otherFee + adjustment + Number.EPSILON) * 100) / 100;
      if (!finite(adjustment) || expected !== 0
        || (adjustment !== 0 && !clean(snapshot.overrideReason ?? snapshot.override_reason))) throw missingPrice(lineId);
    }
  }
}

function missingPrice(orderLineId) {
  return Object.assign(new Error("缺少可核对的袋子价格或本单计价依据，请先核实报价后再确认；草稿已保留。"), {
    code: "ORDER_PRICE_SOURCE_REQUIRED", statusCode: 409, details: { orderLineId },
  });
}
