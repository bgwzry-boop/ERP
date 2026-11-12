// P2-07 出库单打印样式（负责人 2026-11-04）：照旧 ERP（goInventoryLite「三个单价」模板）的送货单排版。
// 从旧系统搬过来的：列（序号、产品名称、规格、颜色、数量、袋子/印刷/长提单价、金额、备注）、
// 抬头（公司 logo/名称/地址/电话、单号、日期、客户名称/联系人/地址/电话）、合计行的大写金额、底部注意事项和
// 双方签章、三联（白存根/红客户/黄回单）、241mm 针式连续纸。
// 和现在冲突的按现在的来：金额仍按价格快照和分批计费（多出赠送不收钱），长提加价现在并在袋子单价里，
// 能拆出来才单独填长提单价；打印机用「打印与设备」里登记的；单号用现在的出库单号。

export const DELIVERY_NOTE_PAPER = Object.freeze({
  name: "241mm 针式连续三联纸（二等分）",
  widthMm: 241,
  heightMm: 139.7, // 11 英寸连续纸二等分
  copyNames: Object.freeze(["①白存根联", "②红客户联", "③黄回单联"]),
});

// 负责人 2026-11-04 定稿（方案二）：序号、产品名称、规格、颜色、实发数量、计价数量、单价（元/个）、金额、备注。
// - 不印仓库、单位（都是「个」，写在单价标题里）。
// - 实发、计价分两列：多做的赠送（下单 1000 实发 1010 只收 1000）一行就看清，不写进备注。
// - 单价合在一个大标题「单价（元/个）」下，分袋子、印刷、长提、加扣小格；袋子每张都有，其余用到才出现，
//   用不到的列不占位置，免得字被挤小。印刷格写几色：0.2(双色)。
const column = (key, label, width, align, group = "") => Object.freeze({ key, label, width, align, group });
export const DELIVERY_NOTE_PRICE_GROUP = "单价（元/个）";
export const DELIVERY_NOTE_PRICE_COLUMNS = Object.freeze([
  column("bagUnitPriceText", "袋子", 56, "right", DELIVERY_NOTE_PRICE_GROUP),
  column("printingUnitPriceText", "印刷", 78, "right", DELIVERY_NOTE_PRICE_GROUP),
  column("handleUnitPriceText", "长提", 50, "right", DELIVERY_NOTE_PRICE_GROUP),
  column("snapUnitPriceText", "加扣", 50, "right", DELIVERY_NOTE_PRICE_GROUP),
]);
const LEADING_COLUMNS = Object.freeze([
  column("lineNo", "序号", 34, "center"),
  column("productName", "产品名称", 105, "left"),
  column("size", "规格", 95, "left"),
  column("color", "颜色", 55, "center"),
  column("deliveredQtyText", "实发数量", 66, "right"),
  column("chargeableQtyText", "计价数量", 66, "right"),
]);
const TRAILING_COLUMNS = Object.freeze([
  column("amountText", "金额", 78, "right"),
  column("remark", "备注", 80, "left"),
]);
/** Every column the sheet can carry, in printed order. */
export const DELIVERY_NOTE_COLUMNS = Object.freeze([...LEADING_COLUMNS, ...DELIVERY_NOTE_PRICE_COLUMNS, ...TRAILING_COLUMNS]);

/** The columns this sheet prints: 袋子 always, 印刷 / 长提 / 加扣 only when a line uses them. */
export function deliveryNoteColumns(lineItems = []) {
  const used = DELIVERY_NOTE_PRICE_COLUMNS.filter((priceColumn, index) => index === 0
    || lineItems.some(item => String(item?.[priceColumn.key] ?? "").trim() !== ""));
  return [...LEADING_COLUMNS, ...used, ...TRAILING_COLUMNS];
}

export const DEFAULT_COMPANY_PRINT_PROFILE = Object.freeze({
  companyName: "河北禄兴包装制品有限公司",
  contactName: "",
  address: "河北邢台宁晋河渠镇大召村",
  phone: "17367893639",
  footerNote: "以上货品请核对数量，如有质量问题，请在三个工作日内通知本公司，逾期恕不负责。",
  // 负责人 2026-11-08：送货单 / 自提单打出来就扣成品库存。默认关，负责人在「打印与设备 → 单据抬头」里打开。
  deductStockAtNotePrint: false,
});

export const DELIVERY_NOTE_SIGNATURES = Object.freeze({
  sender: "送货单位及经手人(签章)：",
  receiver: "收货单位及经手人(签章)：",
});

const clean = value => String(value ?? "").trim();

export function normalizeCompanyPrintProfile(value = {}) {
  const pick = (key, max) => clean(value?.[key]).slice(0, max);
  return {
    companyName: pick("companyName", 60) || DEFAULT_COMPANY_PRINT_PROFILE.companyName,
    contactName: pick("contactName", 20),
    address: pick("address", 120),
    phone: pick("phone", 40),
    footerNote: pick("footerNote", 200),
    deductStockAtNotePrint: value?.deductStockAtNotePrint === true || value?.deductStockAtNotePrint === "true",
    revision: Number.isSafeInteger(Number(value?.revision)) && Number(value?.revision) > 0 ? Number(value.revision) : 1,
    updatedAt: clean(value?.updatedAt),
    updatedBy: clean(value?.updatedBy),
  };
}

/** Validation for what the office types in; returns an error message or "". */
export function validateCompanyPrintProfileInput(value = {}) {
  const name = clean(value.companyName);
  if (!name) return "请填写公司名称。";
  if (name.length > 60) return "公司名称不能超过 60 个字。";
  if (clean(value.contactName).length > 20) return "联系人不能超过 20 个字。";
  if (clean(value.address).length > 120) return "工厂地址不能超过 120 个字。";
  if (clean(value.phone).length > 40) return "电话不能超过 40 个字。";
  if (clean(value.footerNote).length > 200) return "单据底部说明不能超过 200 个字。";
  return "";
}

/**
 * 袋子 / 印刷 / 长提 / 加扣 unit prices from a price snapshot. The snapshot keeps the handle and
 * snap surcharges inside the bag price; the quote evidence says how much of it they were:
 * office published prices (handleFallback → 0.03), mini-program locked quotes (handleAddon,
 * specialRequirementAddon) and special-size quotes (handleUnitAddon, snapButtonUnitAddon).
 * Manually entered prices carry no split and print as one bag price.
 */
export function splitLegacyUnitPrices(priceSnapshot) {
  if (!priceSnapshot) return null;
  const bagPrice = Number(priceSnapshot.bagPrice ?? priceSnapshot.bag_price);
  const printPrice = Number(priceSnapshot.printPrice ?? priceSnapshot.print_price);
  if (!Number.isFinite(bagPrice) || !Number.isFinite(printPrice)) return null;
  const evidence = priceSnapshot.sourceEvidence ?? priceSnapshot.source_evidence_json ?? {};
  const positive = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);
  let handle = 0;
  let snap = 0;
  if (evidence?.specialQuote) {
    handle = positive(evidence.specialQuote.handleUnitAddon);
    snap = positive(evidence.specialQuote.snapButtonUnitAddon);
  } else if (evidence?.quote && Object.hasOwn(evidence.quote, "basePrice")) {
    handle = positive(evidence.quote.handleAddon);
    snap = positive(evidence.quote.specialRequirementAddon);
  } else if (evidence?.kind === "erp_published_price") {
    // 负责人 2026-11-12：加长提手按长度加价、加扣子 +0.10；旧快照没有这两项时，加长提仍按 0.03。
    if (evidence.handleFallback === true) handle = Object.hasOwn(evidence, "handleAddon") ? positive(evidence.handleAddon) : 0.03;
    snap = positive(evidence.snapAddon);
  }
  const round = value => Math.round((value + Number.EPSILON) * 10000) / 10000;
  if (handle + snap > bagPrice) { handle = 0; snap = 0; }
  return { bag: round(bagPrice - handle - snap), print: round(printPrice), handle: round(handle), snap: round(snap) };
}

export function formatLegacyUnitPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return String(Math.round(number * 10000) / 10000);
}

const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const SMALL_UNITS = ["", "拾", "佰", "仟"];
const BIG_UNITS = ["", "万", "亿", "兆"];

function integerToChinese(value) {
  if (value === 0) return DIGITS[0];
  const groups = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 10000)) groups.push(rest % 10000);
  let text = "";
  let pendingZero = false;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) { pendingZero = text !== ""; continue; }
    if (text && (pendingZero || group < 1000)) text += DIGITS[0];
    pendingZero = false;
    let groupText = "";
    let zero = false;
    for (let position = 3; position >= 0; position -= 1) {
      const digit = Math.floor(group / 10 ** position) % 10;
      if (digit === 0) { zero = groupText !== ""; continue; }
      if (zero) groupText += DIGITS[0];
      zero = false;
      groupText += DIGITS[digit] + SMALL_UNITS[position];
    }
    text += groupText + BIG_UNITS[index];
  }
  return text;
}

/** ¥1,043.00 → 壹仟零肆拾叁元整 (the 大写 on the 合计 row). */
export function amountInChineseUppercase(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number) || number < 0 || number >= 1e16) return "";
  const cents = Math.round(number * 100);
  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor(cents / 10) % 10;
  const fen = cents % 10;
  if (!jiao && !fen) return `${integerToChinese(yuan)}元整`;
  let text = yuan ? `${integerToChinese(yuan)}元` : "";
  if (jiao) text += `${DIGITS[jiao]}角`;
  else if (yuan) text += DIGITS[0];
  if (fen) text += `${DIGITS[fen]}分`;
  return text;
}
