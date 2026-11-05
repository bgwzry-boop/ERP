// 备货小票（负责人 2026-11-05，过渡期）：现货单录完先打 80mm 小票给库房配货；定制印刷不出小票；不带价钱。
import assert from "node:assert/strict";
import { PICKING_SLIP_PAGE, buildStockPickingSlip, buildStockPickingSlipHtml, buildStockPickingSlips, selectConfirmedStockLines } from "../src/domain/stockPickingSlip.js";

const base = { orderNo: "ORD-1105-008", customerId: "C1", customerName: "客户甲", fulfillment: "自提", handle: "普通提", style: "空白袋", product: "无纺布袋", amount: 120, bagPrice: 0.6 };
const lines = [
  { ...base, id: "L1", orderType: "现货有货", size: "50*40*12-横", color: "玫红", qty: 200 },
  { ...base, id: "L2", orderType: "stock", size: "45*37*10-横", color: "粉色", handle: "加长提", handleColor: "白", qty: 200, zone: "B区" },
  { ...base, id: "L3", orderType: "stock_printed", size: "35*41*12", color: "红色", style: "福", product: "福字袋", qty: 250 },
  { ...base, id: "L4", orderType: "custom_print", size: "30*40*10", color: "白色", qty: 1000 },
  { ...base, id: "L5", orderType: "现货有货", size: "25*32*10", color: "待确认", qty: 100, lineStatus: "已作废" },
  { ...base, id: "L6", orderType: "现货有货", size: "25*32*10", color: "橘色", qty: 0 },
];
const slip = buildStockPickingSlip({ orderLines: lines, printedAt: new Date("2026-11-05T03:20:00Z") });
assert.deepEqual(slip.items.map(item => item.orderLineId), ["L1", "L2", "L3"], "only open stock lines with a quantity; custom print and voided lines are left out");
assert.equal(slip.customerName, "客户甲");
assert.equal(slip.method, "自提");
assert.equal(slip.orderNo, "ORD-1105-008");
assert.equal(slip.printedAtText, "2026-11-05 11:20", "Beijing time");
assert.equal(slip.totalQty, 650);
assert.equal(slip.items[1].handle, "加长提 白提");
assert.equal(slip.items[1].zone, "B区");
assert.equal(buildStockPickingSlip({ orderLines: [lines[3]] }), null, "a custom-print-only order has no slip");

const html = buildStockPickingSlipHtml(slip);
assert.match(html, /@page \{ size: 80mm 100mm; margin: 0; \}/);
for (const value of ["备货小票", "客户甲", "自提", "50*40*12-横", "玫红", "200", "库位 B区", "福字袋", "合计 <b>650</b> 个", "本单不作出库凭证"]) assert.ok(html.includes(value), value);
assert.doesNotMatch(html.split("<body>")[1], /¥|单价|金额|0\.6|120/, "no prices on the slip");
assert.doesNotMatch(html, /待确认/, "placeholders are not printed");

// Many items continue on further 80×100mm pages.
const many = buildStockPickingSlip({ orderLines: Array.from({ length: 13 }, (_, index) => ({ ...lines[0], id: `M${index}`, qty: 10 })) });
const manyHtml = buildStockPickingSlipHtml(many);
assert.equal((manyHtml.match(/<section class="page">/g) ?? []).length, Math.ceil(13 / PICKING_SLIP_PAGE.itemsPerPage));
assert.match(manyHtml, /续下页/);
assert.match(manyHtml, /3\/3/);

// A split confirmation can create orders for several customers: one slip each, printed together.
const slips = buildStockPickingSlips({ orderLines: [lines[0], { ...lines[1], customerId: "C2", customerName: "", orderNo: "ORD-1105-009" }], customerNames: new Map([["C2", "客户乙"]]) });
assert.deepEqual(slips.map(item => item.customerName), ["客户甲", "客户乙"]);
const both = buildStockPickingSlipHtml(slips);
assert.ok(both.includes("客户甲") && both.includes("客户乙"));
assert.equal(buildStockPickingSlipHtml([]), "");

// Text from orders is escaped.
assert.match(buildStockPickingSlipHtml(buildStockPickingSlip({ orderLines: [{ ...lines[0], customerName: "<b>A&B</b>" }] })), /&lt;b&gt;A&amp;B&lt;\/b&gt;/);

// Right after confirming: 3 stock rows of 100 were entered, the customer chose 「有什么发什么，缺的取消」
// and the server kept only the one in stock. The slip must list 100, never the 300 draft rows.
const draftRows = ["D1", "D2", "D3"].map((id, index) => ({ ...base, id, orderType: "现货有货", size: `4${index}*30*10`, color: "白色", qty: 100 }));
const confirmedLineIds = ["OL-1"];
const stalePool = [lines[0]];
const pending = selectConfirmedStockLines({ poolLines: stalePool, confirmedLineIds });
assert.deepEqual(pending, { pending: true, lines: [] }, "before the pool shows the confirmed line nothing is printed, and draft rows are not a fallback");
const keptLine = { ...draftRows[0], id: "OL-1", orderNo: "ORD-1105-010" };
const cancelledShort = { ...draftRows[1], id: "OL-X", orderNo: "ORD-1105-010", cancellationStatus: "客户选择：有什么发什么，缺的取消", excludedFromConfirmation: true };
const fresh = selectConfirmedStockLines({ poolLines: [keptLine, cancelledShort, ...draftRows], confirmedLineIds });
assert.equal(fresh.pending, false);
assert.deepEqual(fresh.lines.map(line => line.id), ["OL-1"], "only the lines the confirmation names");
const freshSlip = buildStockPickingSlips({ orderLines: fresh.lines })[0];
assert.equal(freshSlip.totalQty, 100);
// A cancelled line that is somehow named is still left out.
assert.deepEqual(selectConfirmedStockLines({ poolLines: [keptLine, cancelledShort], confirmedLineIds: ["OL-1", "OL-X"] }).lines.map(line => line.id), ["OL-1"]);
assert.equal(buildStockPickingSlip({ orderLines: [cancelledShort] }), null, "a cancelled short line never reaches a slip");
assert.deepEqual(selectConfirmedStockLines({ poolLines: [keptLine], confirmedLineIds: [] }), { pending: false, lines: [] });

console.log("stock picking slip ok");
