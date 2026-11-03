// 大机器丝印价（负责人 2026-11-03 确认）。印刷费统一收费：自己的网店、客户订单、同行送来的外加工卷料都按这一套。
// 外加工印刷（同行送布料来）只收印刷费，已含制版费；本厂袋子另加袋子价。
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

// 手工丝印（负责人 2026-11-03）：单面 0.09、双面 0.13 元/个，几色翻几倍，版费另收（办公室报价时填「其他费」）。
// 印刷方式由客户定；没指定时 1000 个以下默认手工、1000 个及以上默认大机器（刚好 1000 个以后可让客户选）。
export const MANUAL_PRINT_UNIT_PRICES = Object.freeze({ single: 0.09, double: 0.13 });
export const MANUAL_PRINT_DEFAULT_BELOW_QTY = 1_000;

export function resolvePrintMethod(row = {}, orderedQty = row.qty) {
  const explicit = String(row.printMethod ?? "").trim();
  if (["manual", "手工", "手工丝印"].includes(explicit)) return "manual";
  if (["machine", "大机器", "机器"].includes(explicit)) return "machine";
  return Number(orderedQty) < MANUAL_PRINT_DEFAULT_BELOW_QTY ? "manual" : "machine";
}

function colorsOf(colorCount) {
  return Number.isSafeInteger(Number(colorCount)) && Number(colorCount) >= 1 ? Number(colorCount) : 1;
}

// Per-piece printing price for one order: method, quantity tier, colour count.
export function printUnitPriceFor({ orderedQty, colorCount = 1, method = "machine", printSide = "" } = {}) {
  const colors = colorsOf(colorCount);
  if (method === "manual") {
    const base = /双|double/u.test(String(printSide)) ? MANUAL_PRINT_UNIT_PRICES.double : MANUAL_PRINT_UNIT_PRICES.single;
    return Number(orderedQty) >= 1 ? Math.round(base * colors * 10_000) / 10_000 : 0;
  }
  return largeMachinePrintUnitPrice(orderedQty, colors);
}

// Large-machine price only (single = double sided).
export function largeMachinePrintUnitPrice(orderedQty, colorCount = 1) {
  const tier = largeMachinePrintTier(orderedQty);
  return tier ? Math.round(tier.unitPrice * colorsOf(colorCount) * 10_000) / 10_000 : 0;
}

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

export function quoteLargeMachinePrint({ orderedQty, colorCount, chargeableQty = orderedQty, method = "machine", printSide = "" } = {}) {
  const tier = largeMachinePrintTier(orderedQty);
  const colors = Number(colorCount);
  const billable = Number(chargeableQty);
  if (!tier || !Number.isSafeInteger(colors) || colors < 1 || colors > MAX_COLORS
    || !Number.isSafeInteger(billable) || billable < 0) return null;
  const manual = method === "manual";
  const unitPrice = printUnitPriceFor({ orderedQty, colorCount: colors, method, printSide });
  return {
    priceVersion: LARGE_MACHINE_PRINT_PRICE_VERSION,
    orderedQty: Number(orderedQty),
    method: manual ? "manual" : "machine",
    methodLabel: manual ? "手工丝印（版费另收）" : "大机器（含版费）",
    plateFeeIncluded: !manual,
    tierLabel: manual ? (/双|double/u.test(String(printSide)) ? "手工双面" : "手工单面") : tier.label,
    tierUnitPrice: manual ? unitPrice / colors : tier.unitPrice,
    colorCount: colors,
    unitPrice,
    chargeableQty: billable,
    amount: Math.round((unitPrice * billable + Number.EPSILON) * 100) / 100,
  };
}
