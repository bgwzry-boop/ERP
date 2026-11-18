import { enrichDraftRow } from "../src/lib/orderDraftProjection.js";
import { isReplenishmentRow, isStockOrderType } from "../shared/orderRouting.js";
import { getDraftOrderType, getDraftStatus, getFulfillmentGoodsDisplay } from "../src/domain/officeRules.js";
import { availableFinishedGoodsQty, hasUnverifiedFinishedGoods, isEligibleFinishedGoods, matchesFinishedGoods } from "../shared/finishedGoodsAvailability.js";

const clean = value => String(value ?? "").trim();
const itemId = item => item.id ?? item.inventoryItemId;

/** One allocation plan for the entire draft, before any lines are grouped into separate orders. */
export function planDraftStockAllocations(lines, inventory = [], holdsById = new Map(), { allowPartial = true } = {}) {
  const eligible = inventory.filter(item => itemId(item) && isEligibleFinishedGoods(item));
  const remaining = new Map(eligible.map(item => [itemId(item), availableFinishedGoodsQty(item)]));
  const plans = new Map();
  for (const line of lines) {
    const row = enrichDraftRow(line, []);
    if (!isStockOrderType(row.orderType) || isReplenishmentRow(row) || !row.customerId
      || !row.size || row.size === "待确认" || !row.color || row.color === "待确认"
      || !Number.isSafeInteger(row.qty) || row.qty <= 0) continue;
    const hold = holdsById.get(row.sourceHoldId);
    if (hold) {
      plans.set(row.id, { inventory: "可用", stockQty: row.qty, shortageQty: 0, allocations: [{ inventoryItemId: hold.inventoryItemId, qty: row.qty }] });
      continue;
    }
    const candidates = eligible.filter(item => matchesFinishedGoods(item, row)).sort((a, b) => {
      const availableA = remaining.get(itemId(a)) ?? 0;
      const availableB = remaining.get(itemId(b)) ?? 0;
      return Number(availableB >= row.qty) - Number(availableA >= row.qty)
        || clean(a.createdAt).localeCompare(clean(b.createdAt)) || String(itemId(a)).localeCompare(String(itemId(b)));
    });
    const availableQty = candidates.reduce((sum, item) => sum + (remaining.get(itemId(item)) ?? 0), 0);
    let left = allowPartial || availableQty >= row.qty ? row.qty : 0;
    const allocations = [];
    for (const item of candidates) {
      if (!left) break;
      const id = itemId(item);
      const qty = Math.min(left, remaining.get(id) ?? 0);
      if (!qty) continue;
      allocations.push({ inventoryItemId: id, qty });
      remaining.set(id, remaining.get(id) - qty);
      left -= qty;
    }
    const stockQty = allocations.reduce((sum, row) => sum + row.qty, 0);
    const shortageQty = row.qty - stockQty;
    const review = stockQty === 0 && availableQty === 0 && inventory.some(item => matchesFinishedGoods(item, row)
      && hasUnverifiedFinishedGoods(item));
    plans.set(row.id, { inventory: review ? "需复核" : shortageQty ? `缺货 ${shortageQty}` : "可用", stockQty, shortageQty, allocations,
      recognizedAvailableQty: Math.min(row.qty, availableQty) });
  }
  return plans;
}

export function stockAllocationCheck(plan) {
  if (!plan) return {};
  return { inventory: plan.inventory, stockQty: plan.stockQty, shortageQty: plan.shortageQty,
    stockAllocations: plan.allocations, recognizedAvailableQty: plan.recognizedAvailableQty ?? plan.stockQty };
}

export function allocatedPriceSnapshot(snapshot, allocation) {
  const { requestedQty, offset, qty } = allocation;
  // Round cumulative shares, then take the difference so the last batch also
  // receives any rounding cent. Never reprice a batch at its smaller tier.
  const shareMoney = value => {
    const cents = Math.round(Number(value ?? 0) * 100);
    return (Math.round(cents * (offset + qty) / requestedQty) - Math.round(cents * offset / requestedQty)) / 100;
  };
  const count = Number(snapshot.chargeableQty);
  return {
    ...snapshot,
    orderLineId: allocation.orderLineId,
    priceSnapshotId: `PS-${allocation.orderLineId}`,
    chargeableQty: Math.floor(count * (offset + qty) / requestedQty) - Math.floor(count * offset / requestedQty),
    otherFee: shareMoney(snapshot.otherFee),
    adjustmentAmount: shareMoney(snapshot.adjustmentAmount),
    finalAmount: shareMoney(snapshot.finalAmount),
    sourceEvidence: { ...snapshot.sourceEvidence, stockShortageAllocation: allocation },
  };
}

export function materializeStockAllocation(confirmation, plans, choice, snapshots) {
  const orderLines = [], fulfillmentRecords = [], priceSnapshots = [], priceAllocations = [];
  const allocationsByOrderLine = new Map();
  const sourceDraftLineIds = new Map();
  for (const [index, line] of confirmation.newLines.entries()) {
    const checked = confirmation.checkedRows[index];
    sourceDraftLineIds.set(line.id, checked.id);
    const plan = plans.get(checked.id);
    const fulfillment = confirmation.newFulfillments.find(row => row.lineId === line.id);
    const snapshot = snapshots[index];
    if (plan?.inventory !== "需复核" && plan?.stockQty > 0 && plan.shortageQty > 0
      && ["split_produce", "ship_available"].includes(choice)) {
      const parts = [{ qty: plan.stockQty, production: false, id: line.id }];
      if (choice === "split_produce") parts.push({ qty: plan.shortageQty, production: true, id: `${line.id}-R1` });
      let offset = 0;
      const allocations = [];
      for (const part of parts) {
        const allocation = { sourceDraftLineId: checked.id, orderLineId: part.id, sourceOrderLineId: line.id,
          requestedQty: checked.qty, stockQty: plan.stockQty, cancelledQty: choice === "ship_available" ? plan.shortageQty : 0,
          offset, qty: part.qty };
        const price = allocatedPriceSnapshot(snapshot, allocation);
        const inventory = part.production ? `缺货 ${part.qty}` : "可用";
        const status = getDraftStatus({ ...checked, inventory });
        const exceptions = (line.exceptions ?? []).filter(tag => tag !== "库存不足");
        if (part.production) exceptions.push("库存不足");
        const orderPart = { ...line, id: part.id, qty: part.qty, amount: price.finalAmount, inventory, status, exceptions,
          orderType: getDraftOrderType({ ...checked, inventory }), ...(part.production ? { splitFromOrderLineId: line.id } : {}) };
        orderLines.push(orderPart);
        if (fulfillment) fulfillmentRecords.push({ ...fulfillment, id: part.production ? `${fulfillment.id}-R1` : fulfillment.id,
          lineId: part.id, qty: part.qty, status: part.production ? "待生产" : fulfillment.method === "快递快运" ? "待打印标签" : "待出库",
          goods: getFulfillmentGoodsDisplay(fulfillment, orderPart) });
        priceSnapshots.push(price);
        allocations.push(allocation);
        offset += part.qty;
      }
      allocationsByOrderLine.set(line.id, plan.allocations);
      priceAllocations.push({ line, snapshot, allocations });
      continue;
    }
    orderLines.push(line);
    if (fulfillment) fulfillmentRecords.push(fulfillment);
    priceSnapshots.push(snapshot);
    if (plan?.stockQty > 0 && !plan.shortageQty) allocationsByOrderLine.set(line.id, plan.allocations);
  }
  return { orderLines, fulfillmentRecords, priceSnapshots, priceAllocations, allocationsByOrderLine, sourceDraftLineIds };
}
