import { calculateLinePricing, p0BagPriceRows } from "../domain/priceTable.js";
import { isStockOrderType, normalizeOrderType, inferOrderType, isReplenishmentRow, REPLENISHMENT_INVENTORY_TEXT } from "../../shared/orderRouting.js";

import { availableFinishedGoodsQty, hasUnverifiedFinishedGoods, isEligibleFinishedGoods, matchesFinishedGoods } from "../../shared/finishedGoodsAvailability.js";

export function enrichDraftRow(row, inventories = []) {
  const sizeParts = String(row.size ?? "").split(/[*×x]/).map(Number);
  const standardSize = p0BagPriceRows.some(item => {
    const parts = item.size.split("*").map(Number);
    return sizeParts.length >= 2 && sizeParts.length <= 3 && sizeParts.every((value, index) => value === parts[index]);
  });
  row = { ...row, orderType: inferOrderType(row, { standardSize }) };
  const amount = estimateAmount(row);
  const inventory = estimateInventory(row, inventories);
  const confidence = getConfidence(row, inventory);
  return { ...row, amount, inventory, confidence };
}

export function estimateAmount(rowOrQty, print = "否") {
  const row = typeof rowOrQty === "object" && rowOrQty !== null ? rowOrQty : { qty: rowOrQty, print };
  return calculateLinePricing(row).amount;
}

function estimateInventory(row, inventories) {
  // 补库单：不占现货，做好后入库。
  if (isReplenishmentRow(row)) return isStockOrderType(normalizeOrderType(row?.orderType)) ? REPLENISHMENT_INVENTORY_TEXT : "补库只能下通货（纯色或丝印通货），定制单请按客户下单";
  if (!row.customerId || row.size === "待确认" || row.color === "待确认" || !row.qty) return "待确认";
  const orderType = normalizeOrderType(row?.orderType);
  if (orderType && !isStockOrderType(orderType)) return orderType === "external_print" ? "外加工，不走通货库存" : "订单生产，不走通货库存";

  const stock = inventories.filter(item => matchesFinishedGoods(item, row));
  const available = stock.filter(isEligibleFinishedGoods).reduce((qty, item) => qty + availableFinishedGoodsQty(item), 0);
  if (available >= row.qty) return "可用";
  if (!available && stock.some(hasUnverifiedFinishedGoods)) return "需复核";
  if (!stock.length) return "缺货";
  return `缺货 ${row.qty - available}`;
}

function getConfidence(row, inventory) {
  if (!row.customerId || row.size === "待确认" || row.color === "待确认" || !row.qty) return "low";
  if (row.latest === "待确认" || inventory === "待确认" || inventory === "需复核" || inventory.startsWith("缺货")) return "medium";
  return "high";
}
