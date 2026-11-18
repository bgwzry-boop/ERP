const clean = value => String(value ?? "").trim();

export function matchesFinishedGoods(item, line) {
  return clean(item.size) === clean(line.size) && clean(item.color) === clean(line.color)
    && clean(item.handle ?? item.handleType) === clean(line.handle ?? line.handleType)
    && clean(item.style) === clean(line.style);
}

export function availableFinishedGoodsQty(item) {
  return Math.max(0, Number(item.inStock ?? item.onHandQty ?? item.onHand ?? 0)
    - Number(item.reserved ?? item.reservedQty ?? 0)
    - Number(item.locked ?? item.waitingPickupLockedQty ?? 0)
    - Number(item.pending ?? item.pendingHandlingQty ?? 0));
}

export function isEligibleFinishedGoods(item) {
  const state = clean(item.state ?? item.inventoryState);
  return !/待处理|报废|估算|待复核/.test(state) && item.estimated !== true
    && !["estimated", "pending_review"].includes(item.trustLevel);
}

export function hasUnverifiedFinishedGoods(item) {
  const state = clean(item.state ?? item.inventoryState);
  return !isEligibleFinishedGoods(item) && !/待处理|报废/.test(state) && availableFinishedGoodsQty(item) > 0;
}
