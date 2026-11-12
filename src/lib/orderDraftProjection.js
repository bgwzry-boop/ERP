import { calculateLinePricing, p0BagPriceRows } from "../domain/priceTable.js";
import { isStockOrderType, normalizeOrderType, inferOrderType, isReplenishmentRow, REPLENISHMENT_INVENTORY_TEXT } from "../../shared/orderRouting.js";

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

  const stock = inventories.find(
    (item) =>
      item.size === row.size &&
      item.color === row.color &&
      item.handle === row.handle &&
      item.style === row.style &&
      !String(item.state ?? "").includes("待处理"),
  );

  if (!stock) return "缺货";
  const available = stock.inStock - stock.reserved - stock.locked - stock.pending;
  if (available >= row.qty && !stock.estimated) return "可用";
  if (available >= row.qty && stock.estimated) return "需复核";
  return `缺货 ${row.qty - Math.max(0, available)}`;
}

function getConfidence(row, inventory) {
  if (!row.customerId || row.size === "待确认" || row.color === "待确认" || !row.qty) return "low";
  if (row.latest === "待确认" || inventory === "待确认" || inventory === "需复核" || inventory.startsWith("缺货")) return "medium";
  return "high";
}
