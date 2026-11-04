// P2-07 出库单打印样式（负责人 2026-11-04）：照旧 ERP（goInventoryLite「三个单价」模板）的送货单排版。
// 从旧系统搬过来的：列（序号、产品名称、规格、颜色、仓库、单位、数量、袋子单价、印刷单价、长提单价、金额、备注）、
// 抬头（公司 logo/名称/地址/电话、单号、日期、客户名称/联系人/地址/电话）、合计行的大写金额、底部注意事项和
// 双方签章、三联（白存根/红客户/黄回单）、241mm 针式连续纸。
// 和现在冲突的按现在的来：金额仍按价格快照和分批计费（多出赠送不收钱），长提加价现在并在袋子单价里，
// 能拆出来才单独填长提单价；打印机用「打印与设备」里登记的；单号用现在的出库单号。

export const DELIVERY_NOTE_PAPER = Object.freeze({
  name: "241mm 针式连续三联纸（二等分）",
  widthMm: 241,
  heightMm: 140,
  copyNames: Object.freeze(["①白存根联", "②红客户联", "③黄回单联"]),
});

// Column order follows the printed sheet; relative widths come from the old sale-bill grid
// (产品名称 156、规格 107、仓库 48、颜色 53、数量 61、三个单价 64/65/64、单位 52、金额 87、备注 156).
export const DELIVERY_NOTE_COLUMNS = Object.freeze([
  Object.freeze({ key: "lineNo", label: "序号", width: 30, align: "center" }),
  Object.freeze({ key: "productName", label: "产品名称", width: 120, align: "left" }),
  Object.freeze({ key: "size", label: "规格", width: 95, align: "left" }),
  Object.freeze({ key: "color", label: "颜色", width: 53, align: "center" }),
  Object.freeze({ key: "warehouse", label: "仓库", width: 48, align: "center" }),
  Object.freeze({ key: "unit", label: "单位", width: 36, align: "center" }),
  Object.freeze({ key: "quantityText", label: "数量", width: 61, align: "right" }),
  Object.freeze({ key: "bagUnitPriceText", label: "袋子单价", width: 64, align: "right" }),
  Object.freeze({ key: "printingUnitPriceText", label: "印刷单价", width: 64, align: "right" }),
  Object.freeze({ key: "handleUnitPriceText", label: "长提单价", width: 64, align: "right" }),
  Object.freeze({ key: "amountText", label: "金额", width: 80, align: "right" }),
  Object.freeze({ key: "remark", label: "备注", width: 110, align: "left" }),
]);

export const DEFAULT_COMPANY_PRINT_PROFILE = Object.freeze({
  companyName: "河北禄兴包装制品有限公司",
  address: "河北省邢台市宁晋县河渠镇大召村",
  phone: "17367893639",
  footerNote: "以上货品请核对数量，如有质量问题，请在三个工作日内通知本公司，逾期恕不负责。",
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
    address: pick("address", 120),
    phone: pick("phone", 40),
    footerNote: pick("footerNote", 200),
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
  if (clean(value.address).length > 120) return "地址不能超过 120 个字。";
  if (clean(value.phone).length > 40) return "电话不能超过 40 个字。";
  if (clean(value.footerNote).length > 200) return "单据底部说明不能超过 200 个字。";
  return "";
}

/**
 * The three unit prices of the old sheet from a price snapshot. The extended-handle surcharge is
 * folded into the bag price today; it is shown separately only where the quote kept it apart.
 */
export function splitLegacyUnitPrices(priceSnapshot) {
  if (!priceSnapshot) return null;
  const bagPrice = Number(priceSnapshot.bagPrice ?? priceSnapshot.bag_price);
  const printPrice = Number(priceSnapshot.printPrice ?? priceSnapshot.print_price);
  if (!Number.isFinite(bagPrice) || !Number.isFinite(printPrice)) return null;
  const evidence = priceSnapshot.sourceEvidence ?? priceSnapshot.source_evidence_json ?? {};
  const handleAddon = Number(evidence?.specialQuote?.handleUnitAddon);
  const handle = Number.isFinite(handleAddon) && handleAddon > 0 && handleAddon <= bagPrice ? handleAddon : 0;
  const round = value => Math.round((value + Number.EPSILON) * 10000) / 10000;
  return { bag: round(bagPrice - handle), print: round(printPrice), handle: round(handle) };
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
