// 负责人 2026-11-08：订单统一写法——「【印刷内容】30*37*10cm 红印白 双面相同 5000个」。
import { isReplenishmentRow, isStockOrderType, normalizeOrderType, orderTypeLabel, stockSupplyRoute } from "../../../../shared/orderRouting.js";
const text = (value) => String(value ?? "").trim();
const NOT_PRINTED = new Set(["", "否", "无", "不印刷", "非印刷", "无印刷", "未印刷", "待确认"]);

function sizeText(size) {
  const value = text(size).replace(/[×xX＊]/gu, "*").replace(/\s+/gu, "");
  if (!value) return "";
  return /cm$/iu.test(value) ? value : `${value}cm`;
}

function colorText(color) {
  // 「红色」写成「红」，跟车间清单的写法一致。
  return text(color).replace(/色$/u, "");
}

export function printSideText(side) {
  const value = text(side);
  if (!value) return "";
  if (/不同/u.test(value)) return "双面不同";
  if (/待确认/u.test(value)) return "双面待确认";
  if (/双/u.test(value)) return "双面相同";
  if (/单/u.test(value)) return "单面印刷";
  return value;
}

export function isPrintedOrderLine(line = {}) {
  if (text(line.printContent)) return true;
  const print = text(line.print);
  return Boolean(print) && !NOT_PRINTED.has(print);
}

/** One-line order description in the owner's format. */
export function formatOrderLineText(line = {}) {
  const qty = Number(line.qty ?? line.quantity);
  const unit = text(line.unit) || "个";
  const qtyText = Number.isFinite(qty) && qty > 0 ? `${qty}${unit}` : "";
  const size = sizeText(line.size);
  const bag = colorText(line.color ?? line.bagColor);
  const printed = isPrintedOrderLine(line);
  let prefix = "";
  if (isReplenishmentRow(line)) prefix = "补库";
  else if (normalizeOrderType(line.orderType) === "custom_special") prefix = "特殊尺寸";
  else if (isStockOrderType(line.orderType)) {
    const route = stockSupplyRoute(line);
    if (route === "production") prefix = "通货排产";
    else if (route === "inventory") prefix = "现货";
    else prefix = normalizeOrderType(line.orderType) === "stock_printed" ? "印刷通货" : "标准通货";
  } else if (!printed) {
    const type = orderTypeLabel(line.orderType);
    prefix = type ? `${type}（印刷待核对）` : "类型待确认";
  }
  if (!printed) return [prefix, size, bag, qtyText].filter(Boolean).join(" ");
  const content = text(line.printContent);
  const head = `${content ? (content.startsWith("【") ? content : `【${content}】`) : ""}${size}`;
  const ink = colorText(line.printColor);
  const colors = bag && ink ? `${bag}印${ink}` : bag;
  return [prefix, head, colors, printSideText(line.printSide), qtyText].filter(Boolean).join(" ");
}
