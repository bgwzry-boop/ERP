// 大机器丝印价（负责人 2026-11-03 确认）。外加工印刷（同行送布料来、只收印刷费，已含制版费）按此计价：
//   - 档位按「下单数量」定：2000 个以下 0.15 元；2000–4999 个 0.09 元；5000–9999 个 0.08 元；1 万个及以上 0.06 元。
//     例如下单 5000 个、实际只印好 4960 个，单价仍按 5000 个那档。
//   - 几色就翻几倍；单面、双面同价。
//   - 应收 = 单价 × 实际印好的数量（印坏的不收）；确认下单时先按下单数量预估。
export const LARGE_MACHINE_PRINT_PRICE_VERSION = "large-machine-print-2026-11-03";

export const LARGE_MACHINE_PRINT_TIERS = Object.freeze([
  Object.freeze({ minQty: 10_000, unitPrice: 0.06, label: "1 万个及以上" }),
  Object.freeze({ minQty: 5_000, unitPrice: 0.08, label: "5000–9999 个" }),
  Object.freeze({ minQty: 2_000, unitPrice: 0.09, label: "2000–4999 个" }),
  Object.freeze({ minQty: 1, unitPrice: 0.15, label: "2000 个以下" }),
]);

const PLACEHOLDERS = new Set(["", "待确认", "非印刷", "无印刷", "无", "不印刷", "未印刷"]);
const MAX_COLORS = 8;

export function largeMachinePrintTier(orderedQty) {
  const qty = Number(orderedQty);
  if (!Number.isSafeInteger(qty) || qty < 1) return null;
  return LARGE_MACHINE_PRINT_TIERS.find((tier) => qty >= tier.minQty) ?? null;
}

// An explicit colour count wins; otherwise count the colours written in 印刷颜色 ("红/蓝" = 2).
export function resolvePrintColorCount(row = {}) {
  const explicit = Number(row.printColorCount);
  if (Number.isSafeInteger(explicit) && explicit >= 1 && explicit <= MAX_COLORS) return explicit;
  const text = String(row.printColor ?? "").normalize("NFKC").trim();
  if (PLACEHOLDERS.has(text)) return 0;
  const colors = new Set(text.split(/[、,，/／+＋和与及&\s]+/u).map((part) => part.replace(/色$/u, "").trim()).filter((part) => part && !PLACEHOLDERS.has(part)));
  return colors.size >= 1 && colors.size <= MAX_COLORS ? colors.size : 0;
}

export function quoteLargeMachinePrint({ orderedQty, colorCount, chargeableQty = orderedQty } = {}) {
  const tier = largeMachinePrintTier(orderedQty);
  const colors = Number(colorCount);
  const billable = Number(chargeableQty);
  if (!tier || !Number.isSafeInteger(colors) || colors < 1 || colors > MAX_COLORS
    || !Number.isSafeInteger(billable) || billable < 0) return null;
  const unitPrice = Math.round(tier.unitPrice * colors * 10_000) / 10_000;
  return {
    priceVersion: LARGE_MACHINE_PRINT_PRICE_VERSION,
    orderedQty: Number(orderedQty),
    tierLabel: tier.label,
    tierUnitPrice: tier.unitPrice,
    colorCount: colors,
    unitPrice,
    chargeableQty: billable,
    amount: Math.round((unitPrice * billable + Number.EPSILON) * 100) / 100,
  };
}
