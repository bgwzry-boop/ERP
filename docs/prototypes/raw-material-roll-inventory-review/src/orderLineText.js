// 负责人 2026-11-08：订单统一写法——「【印刷内容】30*37*10cm 红印白 双面相同 5000个」。
// 现货（不印刷）写「现货 45*37*10cm 本白 2000个」。工作台、订单跟踪、发货安排、对账都用这一句。
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
  if (!isPrintedOrderLine(line)) {
    return ["现货", size, bag, qtyText].filter(Boolean).join(" ");
  }
  const content = text(line.printContent);
  const head = `${content ? (content.startsWith("【") ? content : `【${content}】`) : ""}${size}`;
  const ink = colorText(line.printColor);
  const colors = bag && ink ? `${bag}印${ink}` : bag;
  return [head, colors, printSideText(line.printSide), qtyText].filter(Boolean).join(" ");
}
