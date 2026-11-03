import { normalizeOrderType } from "./orderRouting.js";

// 负责人 2026-11-03：同行可能只说「送来 10 卷料印」，不说印多少个。这种外加工行按来料卷数下单：
// 下单时数量为 0，印完才知道数量；单价档位和收费都按实际印好的数量。
export const INCOMING_ROLLS_QTY_BASIS = "incoming_rolls";

export function isIncomingRollsLine(row = {}) {
  return normalizeOrderType(row.orderType) === "external_print"
    && String(row.qtyBasis ?? row.qty_basis ?? "").trim() === INCOMING_ROLLS_QTY_BASIS;
}

export function incomingRollCountOf(row = {}) {
  const count = Number(row.incomingRollCount ?? row.incoming_roll_count);
  return Number.isSafeInteger(count) && count >= 1 && count <= 9999 ? count : 0;
}

// A line ordered by incoming rolls is valid with quantity 0 as long as the roll count is known.
export function isValidIncomingRollsLine(row = {}) {
  return isIncomingRollsLine(row) && incomingRollCountOf(row) > 0
    && (row.qty === undefined || row.qty === null || row.qty === "" || Number(row.qty) === 0);
}

export function incomingRollsLabel(row = {}) {
  const count = incomingRollCountOf(row);
  return count ? `按来料 ${count} 卷印，数量待印完` : "";
}
