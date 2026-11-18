import { isDeepStrictEqual } from "node:util";
import { assertPublishedOrderPriceSnapshots } from "./orderDraftPublishedPricing.mjs";
import { normalizeOrderType, isReplenishmentRow, isStockOrderType } from "../shared/orderRouting.js";
import { isValidIncomingRollsLine } from "../shared/externalPrintQuantity.js";
import { allocatedPriceSnapshot } from "./orderStockAllocation.mjs";

const clean = value => String(value ?? "").trim();
const finite = value => typeof value === "number" && Number.isFinite(value);

// These snapshots are made by a server command, never accepted from a request
// body. An unknown bag price is not a free order or a print-only quotation.
export function assertOrderConfirmationPriceSources({ orderLines = [], priceSnapshots = [], miniappPriceSource, publishedPriceSource, officePriceQuote, priceAllocations = [] } = {}) {
  const allocatedIds = new Set();
  for (const { line, snapshot, allocations } of priceAllocations) {
    assertOrderConfirmationPriceSources({ orderLines: [line], priceSnapshots: [snapshot], miniappPriceSource, publishedPriceSource, officePriceQuote });
    const sourceId = line.orderLineId ?? line.id;
    const requested = Number(line.qty ?? line.originalQty);
    const first = allocations[0];
    if (!first || !isStockOrderType(line.orderType) || first.orderLineId !== sourceId || first.offset !== 0
      || first.qty !== first.stockQty || first.qty <= 0 || first.qty >= requested
      || ![1, 2].includes(allocations.length)) throw missingPrice(sourceId);
    for (const [index, allocation] of allocations.entries()) {
      const { orderLineId, qty, offset, requestedQty, stockQty, cancelledQty, sourceOrderLineId } = allocation;
      const actual = orderLines.find(row => (row.orderLineId ?? row.id) === orderLineId);
      const rows = priceSnapshots.filter(row => row.orderLineId === orderLineId);
      const expected = allocatedPriceSnapshot(snapshot, allocation);
      if (allocatedIds.has(orderLineId) || !actual || rows.length !== 1 || sourceOrderLineId !== sourceId
        || requestedQty !== requested || stockQty !== first.qty || allocation.sourceDraftLineId !== first.sourceDraftLineId
        || (actual.orderId ?? actual.orderNo) !== (line.orderId ?? line.orderNo) || actual.customerId !== line.customerId
        || Number(actual.qty ?? actual.originalQty) !== qty || !Number.isSafeInteger(qty)
        || normalizeOrderType(actual.orderType) !== normalizeOrderType(line.orderType)
        || (index === 1 && (offset !== first.qty || qty + offset !== requested || actual.splitFromOrderLineId !== sourceId))
        || (allocations.length === 2 ? cancelledQty !== 0 : cancelledQty !== requested - qty)
        || (miniappPriceSource && cancelledQty !== 0)
        || !["bagPrice", "printPrice", "chargeableQty", "otherFee", "adjustmentAmount", "finalAmount", "overrideReason", "sourceEvidence"]
          .every(key => isDeepStrictEqual(rows[0][key] ?? (key === "adjustmentAmount" ? 0 : ""), expected[key] ?? ""))) throw missingPrice(orderLineId);
      allocatedIds.add(orderLineId);
    }
  }
  if (priceSnapshots.some(row => row.sourceEvidence?.stockShortageAllocation && !allocatedIds.has(row.orderLineId))) throw missingPrice("");
  orderLines = orderLines.filter(line => !allocatedIds.has(line.orderLineId ?? line.id));
  priceSnapshots = priceSnapshots.filter(row => !allocatedIds.has(row.orderLineId));
  assertPublishedOrderPriceSnapshots(publishedPriceSource, orderLines, priceSnapshots);
  for (const line of orderLines) {
    const lineId = clean(line.orderLineId ?? line.id);
    const snapshots = priceSnapshots.filter(row => clean(row.orderLineId ?? row.order_line_id) === lineId);
    if (snapshots.length !== 1) throw missingPrice(lineId);
    const snapshot = snapshots[0];
    if (officePriceQuote) {
      const evidence = snapshot.sourceEvidence;
      const quoted = officePriceQuote.linePrices.find(row => row.draftLineId === evidence?.officeQuoteInput?.id);
      if (!quoted || evidence.officeQuoteId !== officePriceQuote.id || !isDeepStrictEqual(evidence, quoted.sourceEvidence)
        || !["bagPrice", "printPrice", "otherFee", "adjustmentAmount", "chargeableQty", "finalAmount", "overrideReason"].every(key => snapshot[key] === quoted[key])) throw missingPrice(lineId);
    } else if (["office_price_quote", "office_print_group_revision"].includes(snapshot.sourceEvidence?.kind)) throw missingPrice(lineId);
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
    // 按来料卷数下单的外加工：下单时 0 数量、0 金额，印完按实际数量定价（负责人 2026-11-03）。
    const pricedOnActualPrints = (snapshot.sourceEvidence ?? snapshot.source_evidence_json)?.pricedOnActualPrints === true
      && isValidIncomingRollsLine({ ...line, qty: line.qty ?? line.originalQty })
      && chargeableQty === 0 && finalAmount === 0 && printPrice === 0 && bagPrice === 0;
    if (pricedOnActualPrints) continue;
    // 负责人 2026-11-08：补库单（通货做好入本厂库存）不对外收费。
    const internalReplenishment = (snapshot.sourceEvidence ?? snapshot.source_evidence_json)?.kind === "internal_replenishment"
      && isReplenishmentRow(line) && isStockOrderType(line.orderType ?? line.order_type)
      && finalAmount === 0 && printPrice === 0 && bagPrice === 0 && otherFee === 0;
    if (internalReplenishment) continue;
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
