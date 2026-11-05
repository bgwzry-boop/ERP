// 备货小票（负责人 2026-11-05，过渡期）：现货单（空白袋、印花袋；自提和送货）录完后，办公室先用标签打印机
// 打一张 80mm 小票交库房。小票不带价钱，写客户、交付方式、每样货的规格/颜色/提手/款式/数量。
// 库房照小票取货备货，备好后当面告诉办公室；少货也由库房当面说，办公室跟客户确认后改数量，再打正式三联单。
// 定制印刷的单子不出小票。等以后库存完全数据化就不用打小票了。
import { isStockOrderType } from "../../shared/orderRouting.js";

export const PICKING_SLIP_PAGE = Object.freeze({ widthMm: 80, heightMm: 100, itemsPerPage: 6 });

const clean = value => String(value ?? "").trim();
const isPlaceholder = value => !value || ["待确认", "非印刷", "-"].includes(value);
const TERMINAL_STATUSES = new Set(["已作废", "已取消", "已交付", "已完成", "closed", "voided", "canceled"]);

function methodLabel(value) {
  const text = clean(value);
  if (["送货", "delivery"].includes(text)) return "送货";
  if (["自提", "pickup"].includes(text)) return "自提";
  if (["快递快运", "express_ltl"].includes(text)) return "快递快运";
  return text || "待确认";
}

/**
 * The slip for one customer's stock lines. `orderLines` are order-pool / workspace lines;
 * only stock lines (空白袋、印花袋) that are not closed are listed. Returns null when nothing
 * is left to pick.
 */
export function buildStockPickingSlip({ orderLines = [], customerName = "", orderNo = "", pickerName = "", printedAt = new Date() } = {}) {
  const items = orderLines
    .filter(line => line && isStockOrderType(line.orderType ?? line.order_type))
    .filter(line => !TERMINAL_STATUSES.has(clean(line.lineStatus ?? line.status)))
    .map(line => {
      const handle = clean(line.handle ?? line.handleType);
      const handleColor = clean(line.handleColor);
      return {
        orderLineId: clean(line.id ?? line.orderLineId),
        product: clean(line.product ?? line.productName) || "空白袋",
        size: clean(line.size),
        color: isPlaceholder(clean(line.color ?? line.bagColor)) ? "" : clean(line.color ?? line.bagColor),
        handle: [isPlaceholder(handle) ? "" : handle, handleColor ? `${handleColor}提` : ""].filter(Boolean).join(" "),
        style: isPlaceholder(clean(line.style)) ? "" : clean(line.style),
        qty: Number(line.qty ?? line.originalQty ?? 0) || 0,
        zone: clean(line.zone ?? line.inventoryZone),
        method: methodLabel(line.fulfillment ?? line.fulfillmentMethod ?? line.method),
        note: clean(line.remark ?? line.note),
      };
    })
    .filter(item => item.qty > 0);
  if (!items.length) return null;
  const methods = [...new Set(items.map(item => item.method))];
  const orderNos = [...new Set(orderLines.map(line => clean(line.orderNo ?? line.orderId)).filter(Boolean))];
  const time = printedAt instanceof Date ? printedAt : new Date(printedAt);
  const beijing = Number.isFinite(time.getTime()) ? new Date(time.getTime() + 8 * 3600 * 1000).toISOString() : "";
  return {
    customerName: clean(customerName) || clean(orderLines.find(line => clean(line.customerName))?.customerName) || "（未填客户）",
    pickerName: clean(pickerName),
    method: methods.length === 1 ? methods[0] : methods.join(" / "),
    orderNo: clean(orderNo) || orderNos.join("、"),
    printedAtText: beijing ? `${beijing.slice(0, 10)} ${beijing.slice(11, 16)}` : "",
    items,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0),
  };
}

const escapeHtml = value => clean(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/**
 * One slip per customer order from a set of order lines (a split confirmation can create
 * several orders at once). Lines are grouped by customer and order number.
 */
export function buildStockPickingSlips({ orderLines = [], customerNames = new Map(), pickerName = "", printedAt = new Date() } = {}) {
  const groups = new Map();
  for (const line of orderLines) {
    const key = `${clean(line.customerId ?? line.customerName)}|${clean(line.orderNo ?? line.orderId)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  return [...groups.values()]
    .map(lines => buildStockPickingSlip({ orderLines: lines, customerName: clean(lines[0].customerName) || customerNames.get(clean(lines[0].customerId)) || "", pickerName, printedAt }))
    .filter(Boolean);
}

/** A complete HTML document, one 80×100mm page per six items, for the browser print dialog. */
export function buildStockPickingSlipHtml(slipOrSlips) {
  const slips = (Array.isArray(slipOrSlips) ? slipOrSlips : [slipOrSlips]).filter(slip => slip?.items?.length);
  if (!slips.length) return "";
  const { widthMm, heightMm } = PICKING_SLIP_PAGE;
  const pageHtml = slips.map(slipPagesHtml).join("");
  return documentHtml(pageHtml, widthMm, heightMm);
}

function slipPagesHtml(slip) {
  const { itemsPerPage } = PICKING_SLIP_PAGE;
  const pages = [];
  for (let index = 0; index < slip.items.length; index += itemsPerPage) pages.push(slip.items.slice(index, index + itemsPerPage));
  return pages.map((items, pageIndex) => {
    const rows = items.map((item, rowIndex) => {
      const number = pageIndex * itemsPerPage + rowIndex + 1;
      const spec = [item.size, item.color].filter(Boolean).map(escapeHtml).join("\u3000");
      const detail = [item.handle, item.style !== item.product ? item.style : "", item.product, item.zone ? `库位 ${item.zone}` : "", item.note].filter(Boolean).map(escapeHtml).join(" · ");
      return `<li><span class="no">${number}</span><div class="goods"><b>${spec || escapeHtml(item.product)}</b><small>${detail}</small></div><span class="qty">${item.qty}<i>个</i></span><span class="tick"></span></li>`;
    }).join("");
    const last = pageIndex === pages.length - 1;
    return `<section class="page">
  <header><h1>备货小票</h1><span class="method">${escapeHtml(slip.method)}</span></header>
  <p class="customer">${escapeHtml(slip.customerName)}</p>
  <p class="meta">${slip.pickerName ? `提货人：${escapeHtml(slip.pickerName)}\u3000` : ""}${slip.orderNo ? `单号：${escapeHtml(slip.orderNo)}` : ""}</p>
  <ol>${rows}</ol>
  <footer>${last ? `<span>共 ${slip.items.length} 样，合计 <b>${slip.totalQty}</b> 个</span>` : "<span>（续下页）</span>"}<span>${pages.length > 1 ? `${pageIndex + 1}/${pages.length}\u3000` : ""}${escapeHtml(slip.printedAtText)}</span></footer>
  ${last ? `<p class="hint">配好后告诉办公室；少货当面说明。本单不作出库凭证。</p>` : ""}
</section>`;
  }).join("");
}

function documentHtml(pageHtml, widthMm, heightMm) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>备货小票</title><style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: ${widthMm}mm; height: ${heightMm}mm; padding: 3mm 4mm 2.5mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
header { display: flex; justify-content: space-between; align-items: center; border-bottom: 0.6mm solid #000; padding-bottom: 1mm; }
h1 { margin: 0; font-size: 5mm; letter-spacing: 0.6mm; }
.method { border: 0.4mm solid #000; border-radius: 1mm; padding: 0.3mm 2mm; font-size: 3.6mm; font-weight: 700; }
.customer { margin: 1.5mm 0 0; font-size: 5mm; font-weight: 700; line-height: 1.25; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.meta { margin: 0.6mm 0 1mm; font-size: 2.9mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
ol { list-style: none; margin: 0; padding: 0; flex: 1; border-top: 0.3mm solid #000; }
li { display: grid; grid-template-columns: 4mm 1fr auto 4mm; gap: 1.5mm; align-items: center; padding: 1.1mm 0; border-bottom: 0.25mm dashed #000; }
.no { font-size: 3mm; text-align: center; }
.goods { min-width: 0; display: grid; }
.goods b { font-size: 3.8mm; line-height: 1.25; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.goods small { font-size: 2.8mm; line-height: 1.3; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.qty { font-size: 4.6mm; font-weight: 700; white-space: nowrap; }
.qty i { font-style: normal; font-size: 2.8mm; font-weight: 400; margin-left: 0.4mm; }
.tick { width: 3.6mm; height: 3.6mm; border: 0.35mm solid #000; }
footer { display: flex; justify-content: space-between; font-size: 3mm; padding-top: 1mm; border-top: 0.3mm solid #000; }
footer b { font-size: 3.6mm; }
.hint { margin: 0.6mm 0 0; font-size: 2.6mm; }
</style></head><body>${pageHtml}</body></html>`;
}
