export const BAG_PRICE_TABLE_VERSION = "bag-price-2026-07-03";
export const PRINT_PRICE_TABLE_VERSION = "silk-print-price-2026-07-03";
export const P0_PRICE_SNAPSHOT_VERSION = "P0-PRICE-20260703";
export const EXTENDED_HANDLE_ADDON = 0.03;

const regularBagPrices = new Map([
  ["26*27*10", 0.28],
  ["25*23*8", 0.29],
  ["25*32*10", 0.29],
  ["30*36*8", 0.35],
  ["30*38*10", 0.34],
  ["30*37*10", 0.34],
  ["35*41*12", 0.48],
  ["35*27*10", 0.3],
  ["40*30*10", 0.36],
  ["40*32*10", 0.37],
  ["45*37*10", 0.47],
  ["50*40*12", 0.6],
]);

const laminatedBagPrices = new Map([
  ["30*27*10", { normal: 0.6, metallic: 0.63 }],
  ["32*25*10", { normal: 0.45, metallic: 0.49 }],
  ["40*30*10", { normal: 0.58, metallic: 0.62 }],
  ["45*35*10", { normal: 0.72, metallic: 0.76 }],
  ["50*40*12", { normal: 1, metallic: 1.03 }],
]);

const bearDogBagPrices = new Map([
  ["25*23*8", 0.45],
  ["30*27*10", 0.51],
  ["35*32*10", 0.57],
  ["40*35*12", 0.69],
  ["50*40*12", 0.8],
]);

const giftBagPrices = new Map([
  ["25*30*10", 0.51],
  ["30*37*10", 0.56],
  ["35*41*12", 0.76],
]);

const fuOnlyGiftPrices = new Map([
  ["30*30", 0.53],
  ["30*30*10", 0.53],
]);

export const p0BagPriceRows = [
  ...Array.from(regularBagPrices, ([size, normalPrice]) => ({
    priceType: "regular",
    style: "空白袋",
    size,
    normalPrice,
    extendedHandlePrice: roundMoney(normalPrice + EXTENDED_HANDLE_ADDON),
  })),
  ...Array.from(laminatedBagPrices, ([size, prices]) => ({
    priceType: "laminated",
    style: "覆膜",
    size,
    normalPrice: prices.normal,
    metallicPrice: prices.metallic,
  })),
  ...Array.from(bearDogBagPrices, ([size, normalPrice]) => ({
    priceType: "bear_dog",
    style: "小熊小狗",
    size,
    normalPrice,
  })),
  ...Array.from(giftBagPrices, ([size, normalPrice]) => ({
    priceType: "gift_gold_print",
    style: "喜/福",
    size,
    normalPrice,
    discountFromQty: 1000,
    discountUnitPrice: roundMoney(normalPrice - 0.05),
  })),
  ...Array.from(fuOnlyGiftPrices, ([size, normalPrice]) => ({
    priceType: "gift_gold_print",
    style: "福",
    size,
    normalPrice,
    fuOnly: true,
  })),
];

export function calculateLinePricing(input = {}) {
  const qty = toFiniteNumber(input.chargeableQty ?? input.qty, 0);
  const bagPrice = getBagUnitPrice(input);
  const printPrice = getPrintUnitPrice(input);
  const unitPrice = roundMoney(bagPrice + printPrice);
  return {
    bagPrice,
    printPrice,
    unitPrice,
    amount: roundMoney(unitPrice * qty),
    chargeableQty: qty,
    priceVersion: P0_PRICE_SNAPSHOT_VERSION,
    bagPriceVersion: BAG_PRICE_TABLE_VERSION,
    printPriceVersion: PRINT_PRICE_TABLE_VERSION,
  };
}

export function getBagUnitPrice(input = {}) {
  const style = normalizePriceStyle(input.style ?? input.product ?? input.orderType);
  if (style === "外加工") return 0;

  const basePrice = getBagBaseUnitPrice({ ...input, style });
  if (style !== "空白袋") return basePrice;
  if (!isExtendedHandle(input.handle)) return basePrice;
  return roundMoney(basePrice + EXTENDED_HANDLE_ADDON);
}

export function getBagBaseUnitPrice(input = {}) {
  const style = normalizePriceStyle(input.style ?? input.product ?? input.orderType);
  const size = normalizeSize(input.size);

  if (style === "覆膜金银") return laminatedBagPrices.get(size)?.metallic ?? 0;
  if (style === "覆膜") return laminatedBagPrices.get(size)?.normal ?? 0;
  if (style === "小熊") return bearDogBagPrices.get(size) ?? 0;
  if (style === "喜") return giftPriceForSize(size, input.qty);
  if (style === "福") return giftPriceForSize(size, input.qty, { includeFuOnly: true });
  if (style === "外加工") return 0;
  return regularBagPrices.get(size) ?? 0;
}

export function getPrintUnitPrice(input = {}) {
  if (!isPrintEnabled(input.print ?? input.printFlag ?? input.orderType)) return 0;
  const style = normalizePriceStyle(input.style ?? input.product ?? input.orderType);
  if (style === "小熊" || style === "喜" || style === "福" || style === "覆膜" || style === "覆膜金银") return 0;

  const qty = toFiniteNumber(input.chargeableQty ?? input.qty, 0);
  if (qty >= 10000) return 0.06;
  if (qty >= 5000) return 0.08;
  if (qty >= 3000) return 0.09;
  return String(input.printSide ?? "").includes("双") ? 0.13 : 0.09;
}

export function normalizePriceStyle(value = "") {
  const text = String(value ?? "");
  if (text.includes("同行") || text.includes("来料") || text.includes("外加工")) return "外加工";
  if (text.includes("金银")) return "覆膜金银";
  if (text.includes("覆膜")) return "覆膜";
  if (text.includes("小熊") || text.includes("小狗")) return "小熊";
  if (text.includes("喜")) return "喜";
  if (text.includes("福")) return "福";
  return "空白袋";
}

export function normalizeSize(value = "") {
  const parts = String(value ?? "")
    .replace(/cm/gi, "")
    .replace(/[xX×]/g, "*")
    .match(/\d+(?:\.\d+)?/g);
  if (!parts?.length) return "";
  return parts.join("*");
}

export function isPrintEnabled(value) {
  const text = String(value ?? "");
  return text === "是" || text === "true" || text.includes("印");
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function giftPriceForSize(size, qty, { includeFuOnly = false } = {}) {
  const basePrice = giftBagPrices.get(size) ?? (includeFuOnly ? fuOnlyGiftPrices.get(size) : undefined);
  if (!Number.isFinite(basePrice)) return 0;
  return toFiniteNumber(qty, 0) >= 1000 ? roundMoney(basePrice - 0.05) : basePrice;
}

function isExtendedHandle(value = "") {
  const text = String(value ?? "");
  return text.includes("加长") || text.includes("长提");
}

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
