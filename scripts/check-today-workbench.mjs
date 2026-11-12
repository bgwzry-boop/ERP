// 负责人 2026-11-08：菜单调整和工作台「今天」。
import assert from "node:assert/strict";
import { pcNavGroups, navViewMap } from "../docs/prototypes/raw-material-roll-inventory-review/src/navigation.js";
import { completedBusinessWorkspaceIds } from "../docs/prototypes/raw-material-roll-inventory-review/src/workspaceCoverage.js";
import { formatOrderLineText, printSideText } from "../docs/prototypes/raw-material-roll-inventory-review/src/orderLineText.js";
import { buildTodayItems, todayStatus } from "../docs/prototypes/raw-material-roll-inventory-review/src/todayItems.js";
import { createLocalOrderPoolReadRepository, buildListOrderLinesSql, buildFindOrderLineDetailSql } from "../server/orderPoolReadRepository.mjs";
import { mapApiOrderLineToLocal } from "../src/services/officeOrderPoolApiClient.js";

const menu = Object.fromEntries(pcNavGroups.map((group) => [group.label, group.items.map((item) => item.label)]));
assert.deepEqual(menu["工作台"], ["今天", "公共待办"]);
assert.deepEqual(menu["订单管理"], ["开单", "订单跟踪", "发货安排"], "发货安排 moves into 订单管理: the office arranges shipping");
assert.deepEqual(menu["生产车间"], ["生产任务", "打包/标签", "打印与设备", "换模工单"]);
assert.equal(menu["生产交付"], undefined);
assert.equal(navViewMap.today, "今天");
assert.ok(completedBusinessWorkspaceIds.includes("today"));

// 订单统一写法
assert.equal(formatOrderLineText({ printContent: "鑫源超市", size: "30*37*10", color: "红色", print: "是", printColor: "白", printSide: "双面", qty: 5000 }), "【鑫源超市】30*37*10cm 红印白 双面相同 5000个");
assert.equal(formatOrderLineText({ printContent: "【高佳】", size: "25×32×10", color: "天兰", print: "是", printColor: "白", printSide: "双面不同", qty: 3000 }), "【高佳】25*32*10cm 天兰印白 双面不同 3000个");
assert.equal(formatOrderLineText({ product: "空白袋", size: "45*37*10", color: "本白", print: "否", qty: 2000 }), "现货 45*37*10cm 本白 2000个");
assert.equal(printSideText("单面"), "单面印刷");
assert.equal(printSideText("双面待确认"), "双面待确认");

// 今天要办的事
const items = buildTodayItems({
  customers: [{ id: "C1", name: "松源百货商行" }, { id: "C2", name: "元宝批发部" }],
  orderLines: [
    { id: "L1", customerId: "C1", printContent: "鑫源超市", size: "30*37*10", color: "红色", print: "是", printColor: "白", printSide: "双面", qty: 5000, inventory: "缺货", status: "待排产" },
    { id: "L2", customerId: "C2", size: "40*30*10", color: "本白", print: "否", qty: 3000, inventory: "有货", status: "待出库" },
    { id: "L3", customerId: "C1", size: "30*38*10", color: "红色", print: "否", qty: 10, inventory: "缺货", status: "已交付" },
  ],
  fulfillments: [
    { id: "F1", lineId: "L2", status: "待出库", packageCount: 8 },
    { id: "F2", lineId: "L2", status: "待出库", paperOutboundDocument: { status: "已交库房" } },
    { id: "F3", lineId: "L2", status: "已交付" },
  ],
  rawMaterialInbounds: [
    { id: "R1", supplierName: "人意无纺布", status: "已识别待复核", rollCount: 16, totalWeightKg: 1570.3, receivedAt: "2026-11-01T00:00:00Z" },
    { id: "R2", supplierName: "河北北陈无纺布有限公司", status: "已复核待打印标签", rollCount: 14, totalWeightKg: 1151.4 },
    { id: "R3", supplierName: "宏尚", status: "已贴标/可用库存", rollCount: 5 },
    { id: "R4", supplierName: "腾胜", status: "已作废", rollCount: 5 },
  ],
});
assert.deepEqual(items.map((item) => [item.group, item.title, item.note, item.action.label]), [
  ["shortage", "松源百货商行", "库存不足", "看订单"],
  ["note", "元宝批发部", "已打包 8 包", "去打单"],
  ["receiving", "人意无纺布", "待核对", "去核对"],
  ["receiving", "河北北陈无纺布有限公司", "待打卷标", "打卷标"],
]);
assert.equal(items[0].text, "【鑫源超市】30*37*10cm 红印白 双面相同 5000个");
assert.equal(items[1].action.navId, "outbound-delivery");
assert.equal(items[2].text, "送货单 16卷 1570.3kg · 11月1日到");
// 「今天」没读完 / 读失败不能说"今天没有要办的事"
assert.equal(todayStatus([], { loading: true, hasLoaded: false }).state, "loading");
assert.equal(todayStatus([], { hasLoaded: false }).state, "loading", "还没开始读也不能当成没事");
assert.equal(todayStatus([], { blockingError: true, hasLoaded: false }).state, "failed");
assert.equal(todayStatus([], { hasLoaded: true }).state, "empty");
assert.equal(todayStatus([{ id: 1 }], { blockingError: true }).state, "items");

// 印刷内容走完整链路：价格快照里的开单报价 → 订单池接口 → 前端映射 → 订单写法
const repository = createLocalOrderPoolReadRepository();
const workspace = {
  customers: [{ id: "C-1", name: "松源百货商行" }],
  orderLines: [{ id: "ORD-9-01", orderId: "ORD-9", customerId: "C-1", printFlag: true, size: "30*37*10", bagColor: "红色", printColor: "白", printSide: "双面相同", qty: 5000, lineStatus: "待排产" }],
  priceSnapshots: [
    { id: "P-old", orderLineId: "ORD-9-01", createdAt: "2026-11-01T00:00:00Z", versionNo: 1, sourceEvidence: { officeQuoteInput: { printContent: "旧内容" } } },
    { id: "P-new", orderLineId: "ORD-9-01", createdAt: "2026-11-02T00:00:00Z", versionNo: 2, sourceEvidence: { officeQuoteInput: { printContent: "鑫源超市" } } },
  ],
};
const listed = repository.listOrderLines({ workspace, query: {} }).items[0];
assert.equal(listed.printContent, "鑫源超市", "订单池接口要带出最新报价里的印刷内容");
const mapped = mapApiOrderLineToLocal(JSON.parse(JSON.stringify(listed)));
assert.equal(mapped.printContent, "鑫源超市", "前端映射不能丢印刷内容");
assert.equal(formatOrderLineText(mapped), "【鑫源超市】30*37*10cm 红印白 双面相同 5000个");
assert.equal(repository.getOrderLineDetail({ workspace, orderLineId: "ORD-9-01" }).orderLine?.printContent ?? repository.getOrderLineDetail({ workspace, orderLineId: "ORD-9-01" }).printContent, "鑫源超市");
assert.equal(mapApiOrderLineToLocal({ id: "ORD-9-02", printFlag: false, printContent: "不该出现" }).printContent, "", "不印刷的单不显示印刷内容");
for (const sql of [buildListOrderLinesSql({}).text ?? String(buildListOrderLinesSql({})), String(buildFindOrderLineDetailSql({ orderLineId: "x" }).text ?? buildFindOrderLineDetailSql({ orderLineId: "x" }))]) {
  assert.match(sql, /officeQuoteInput'->>'printContent' AS print_content/u, "数据库读取要取出印刷内容");
}

console.log("today workbench ok: menu regrouped (今天 / 开单 · 订单跟踪 · 发货安排 / 生产车间), owner order wording, today's to-do list built from shortages, unprinted notes and unfinished receipts.");
