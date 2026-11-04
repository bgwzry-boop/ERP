// P2-05 多做少做（负责人 2026-11-04）：只管生产出来的单子（定制印刷、特殊尺寸、外加工印刷）。
// 实际数量和下单数量差在 1% 以内算正常，系统自动处理，不用办公室确认：
// - 少了：按实际数量开票、计价（下单 5000 出 4999 → 按 4999）；
// - 多了：按下单数量开票，多出来的写明赠送、不收费（下单 5000 出 5010 → 按 5000，10 个赠送）。
// 超过 1% 照旧由办公室确认（数量差异流程）。现货单不适用。
import { normalizeOrderType } from "./orderRouting.js";

export const AUTO_QUANTITY_TOLERANCE_RATE = 0.01;
const PRODUCTION_MADE_TYPES = new Set(["custom_print", "custom_special", "external_print"]);

export function isProductionMadeOrderLine(orderLine) {
  if (!orderLine) return false;
  if (String(orderLine.qtyBasis ?? orderLine.qty_basis ?? "") === "incoming_rolls") return false;
  return PRODUCTION_MADE_TYPES.has(normalizeOrderType(orderLine.orderType ?? orderLine.order_type));
}

/** The largest difference handled automatically for this planned quantity (5000 → 50). */
export function autoQuantityToleranceFor(expectedQty) {
  const expected = Number(expectedQty);
  return Number.isSafeInteger(expected) && expected > 0 ? Math.floor(expected * AUTO_QUANTITY_TOLERANCE_RATE) : 0;
}

/**
 * The automatic handling of a difference, or null when there is none or the office must decide.
 * { kind: "short" | "over", diffQty, deliveredQty, chargeableQty, freeQty, note }
 */
export function autoQuantityDifference({ orderLine, expectedQty, actualQty }) {
  const expected = Number(expectedQty);
  const actual = Number(actualQty);
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(actual) || expected <= 0 || actual <= 0 || actual === expected) return null;
  if (!isProductionMadeOrderLine(orderLine)) return null;
  const diffQty = Math.abs(actual - expected);
  if (diffQty > autoQuantityToleranceFor(expected)) return null;
  if (actual < expected) {
    return { kind: "short", diffQty, deliveredQty: actual, chargeableQty: actual, freeQty: 0,
      note: `比下单少 ${diffQty} 个，按实际 ${actual} 个计价` };
  }
  return { kind: "over", diffQty, deliveredQty: actual, chargeableQty: expected, freeQty: diffQty,
    note: `多出 ${diffQty} 个赠送，不收费（按下单 ${expected} 个计价）` };
}
