import { createHash } from "node:crypto";
import { isStockOrderType } from "../../shared/orderRouting.js";

const clean = value => String(value ?? "").trim();
export function matchesProductionInventory(item, line) {
  return item.size === line.size && item.color === (line.color ?? line.bagColor)
    && (item.handle ?? item.handleType) === (line.handle ?? line.handleType) && item.style === line.style
    && !/待处理|报废/.test(String(item.state ?? item.inventoryState ?? ""));
}

// First production is the source of stock, not a fictitious opening stock count.
// Reuse the maintained colour identity; never create a colour from an order string.
export function resolveProductionInventory(workspace, line, requestedId) {
  const rows = workspace.inventories ?? [];
  if (clean(requestedId)) {
    const item = rows.find(row => (row.id ?? row.inventoryItemId) === requestedId);
    if (!item) return { code: "INVENTORY_ITEM_NOT_FOUND", statusCode: 404, message: "所选成品库存不存在，请刷新核对。" };
    if (!matchesProductionInventory(item, line)) return { code: "PRODUCTION_INVENTORY_BINDING_MISMATCH", statusCode: 409, message: "报工入库的规格、颜色、提手和款式须与订单一致。" };
    return { inventoryItem: item };
  }
  const matches = rows.filter(item => matchesProductionInventory(item, line));
  if (matches.length === 1) return { inventoryItem: matches[0] };
  if (matches.length > 1) return { code: "PRODUCTION_INVENTORY_SELECTION_REQUIRED", statusCode: 409, message: "同款成品有多个库存位置，请明确本批入库位置后再报工。" };
  if (!isStockOrderType(line.orderType)) return { code: "INVENTORY_ITEM_NOT_FOUND", statusCode: 404, message: "成品库存不存在，请核对入库资料。" };
  const size = clean(line.size), color = clean(line.color ?? line.bagColor);
  const handle = clean(line.handle ?? line.handleType), style = clean(line.style);
  if (![size, color, handle, style].every(value => value && !/待确认|待维护/.test(value))) {
    return { code: "PRODUCTION_INVENTORY_SPEC_REQUIRED", statusCode: 409, message: "首批成品入库前须确认规格、颜色、提手和款式。" };
  }
  const colors = (workspace.standardColors ?? []).filter(row => row.name === color && row.enabled !== false);
  if (colors.length !== 1) return { code: "PRODUCTION_INVENTORY_COLOR_REQUIRED", statusCode: 409, message: "首批成品须匹配唯一有效厂内标准色，请先核对颜色资料。" };
  const standardColorId = colors[0].id ?? colors[0].standardColorId;
  const zone = "未分区", state = "可用";
  const inventoryKey = [size, color, handle, style, zone, state].join("|");
  const id = `INV-PROD-${createHash("sha256").update(JSON.stringify([size, standardColorId, handle, style, zone, state])).digest("hex").slice(0, 24)}`;
  const inventoryItem = { id, inventoryItemId: id, inventoryKey, size, color, standardColorId, handle, handleType: handle,
    style, zone, state, inventoryState: state, trustLevel: "生产报工", inStock: 0, reserved: 0, locked: 0, pending: 0, revision: 1 };
  return { inventoryItem, newInventoryItem: inventoryItem };
}
