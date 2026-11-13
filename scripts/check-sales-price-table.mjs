// 负责人 2026-11-12「销售价格」：2026-10-28 价目表原样录入、改价存新版本、开单按生效版本套价
// （加长提手按长度、礼品袋 1000 个起减 5 分、加扣子 +0.10 但小熊小狗不加、印刷按原规则）。本地模式，不碰数据库。
import assert from "node:assert/strict";
import {
  FACTORY_SALES_PRICE_LIST_20261028 as LIST,
  extendedHandleAddon,
  validateSalesPriceTableInput,
} from "../shared/pricing/factorySalesPriceList.js";
import { createLocalMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";
import { readSalesPrices, saveSalesPriceVersion } from "../server/services/salesPriceService.mjs";
import { getPublishedOrderPriceSource, resolvePublishedRow } from "../server/orderDraftPublishedPricing.mjs";

// 价目表原样
const find = (style, size) => LIST.items.find((item) => item.styleKey === style && item.sizeKey === size)?.bagPrice;
assert.equal(LIST.items.length, 33);
assert.equal(find("空白袋", "30*37*10"), 0.41, "裸布-竖中号 30×37×10 = 0.41");
assert.equal(find("空白袋", "29*32*14"), 0.52, "酒袋");
assert.equal(find("覆膜金银", "50*40*12"), 1.08);
assert.equal(find("福", "30*30"), 0.32, "30×30 只限福");
assert.equal(find("喜", "30*30"), undefined, "喜字没有 30×30");
assert.equal(find("小熊小狗", "40*35*12"), 0.71);
assert.deepEqual(LIST.rules.handleAddons.map((item) => [item.lengthCm, item.addon]), [[50, 0.03], [60, 0.13], [65, 0.14], [70, 0.14], [75, 0.15], [80, 0.15]]);
assert.equal(extendedHandleAddon(LIST.rules, "加长提").addon, 0.03, "没写长度按 50cm");
assert.equal(extendedHandleAddon(LIST.rules, "加长提60cm").addon, 0.13);
assert.equal(extendedHandleAddon(LIST.rules, "加长提 62cm").addon, 0.14, "不在表里的长度按不短于它的一档");
assert.equal(extendedHandleAddon(LIST.rules, "加长提90cm").addon, 0.15, "比最长档还长按最长档");
assert.equal(extendedHandleAddon(LIST.rules, "普通提").addon, 0);

// 校验
const body = (overrides = {}) => ({ items: LIST.items.map((item) => ({ ...item })), rules: structuredClone(LIST.rules), changeSummary: "按 2026-10-28 价目表建立", idempotencyKey: "sales-price-first-0001", ...overrides });
assert.throws(() => validateSalesPriceTableInput(body({ changeSummary: "" })), /改价说明/u);
assert.throws(() => validateSalesPriceTableInput(body({ items: [...LIST.items, LIST.items[0]] })), /重复/u);
assert.throws(() => validateSalesPriceTableInput(body({ items: [{ ...LIST.items[0], bagPrice: "0" }] })), /单价/u);
assert.throws(() => validateSalesPriceTableInput(body({ items: [{ ...LIST.items[0], bagPrice: "0.12345" }] })), /4 位小数/u);
assert.throws(() => validateSalesPriceTableInput(body({ items: [{ ...LIST.items[0], sizeKey: "大号" }] })), /宽\*高\*侧/u);
assert.throws(() => validateSalesPriceTableInput(body({ items: [{ ...LIST.items[0], styleKey: "覆膜袋" }] })), /不属于/u);

// 本地模式：建立 → 套价 → 改价 → 旧版本停用、新价生效、改价记录
const workspace = { masterDataImportTransactionRepository: createLocalMasterDataImportTransactionRepository({ storageRoot: "/nonexistent" }), users: [{ id: "U-MANAGER-A", displayName: "管理A" }] };
let now = new Date("2026-11-12T08:00:00.000Z");
const clock = () => now;
const empty = await readSalesPrices({ workspace, now: clock });
assert.equal(empty.salesPrices.current, null);
assert.throws(() => getPublishedOrderPriceSource(workspace, now), /通用价格尚未有效发布/u, "没有价格表时开单不能套价");

const first = await saveSalesPriceVersion({ workspace, body: { ...body(), expectedCurrentId: "" }, operatorId: "U-MANAGER-A", now: clock });
assert.equal(first.error, undefined, first.message);
assert.equal(first.salesPrices.current.versionNo, 1);
assert.equal(first.salesPrices.current.items.length, 33);
assert.equal(first.salesPrices.history[0].createdByName, "管理A");
const firstId = first.salesPrices.current.id;
const retry = await saveSalesPriceVersion({ workspace, body: { ...body(), expectedCurrentId: "" }, operatorId: "U-MANAGER-A", now: clock });
assert.equal(retry.code, "SALES_PRICE_CHANGED", "已经有价格表了，再按空表建立要拒绝");

now = new Date("2026-11-12T08:05:00.000Z");
const source = getPublishedOrderPriceSource(workspace, now);
const quote = (row) => resolvePublishedRow(source, { id: "L1", orderType: "stock_plain", style: "空白袋", handle: "普通提", qty: 500, ...row });
assert.equal(quote({ size: "30*37*10" }).bagPrice, 0.41);
assert.equal(quote({ size: "30*37*10" }).amount, 205);
assert.equal(quote({ size: "30*37*10", handle: "加长提" }).bagPrice, 0.44, "加长提没写长度 +0.03");
assert.equal(quote({ size: "30*37*10", handle: "加长提60cm" }).bagPrice, 0.54, "加长提 60cm +0.13");
assert.equal(quote({ size: "30*37*10", handle: "加长提80cm" }).bagPrice, 0.56, "加长提 80cm +0.15");
assert.equal(quote({ size: "30*37*10", style: "空白袋加扣" }).bagPrice, 0.51, "加扣子 +0.10");
assert.equal(quote({ size: "35*32*10", orderType: "stock_printed", style: "小熊小狗加扣" }).bagPrice, 0.59, "小熊小狗已含扣子，不再加");
assert.equal(quote({ size: "30*37*10", orderType: "stock_printed", style: "喜", qty: 999 }).bagPrice, 0.59);
assert.equal(quote({ size: "30*37*10", orderType: "stock_printed", style: "喜", qty: 1000 }).bagPrice, 0.54, "礼品袋 1000 个起减 5 分");
assert.equal(quote({ size: "30*30", orderType: "stock_printed", style: "福", qty: 200 }).bagPrice, 0.32, "30×30 福");
assert.throws(() => quote({ size: "30*30", orderType: "stock_printed", style: "喜", qty: 200 }), /通用价格/u, "喜字没有 30×30，不能乱套价");
assert.equal(quote({ size: "50*40*12", orderType: "stock_plain", style: "覆膜袋" }).bagPrice, 1.05);
assert.equal(quote({ size: "50*40*12", orderType: "stock_plain", style: "覆膜金银" }).bagPrice, 1.08);
const printed = quote({ size: "30*37*10", orderType: "custom_print", print: "是", printColor: "白", printContent: "鑫源超市", printSide: "双面", qty: 5000 });
assert.equal(printed.bagPrice, 0.41);
assert.equal(printed.printPrice, 0.08, "机印 5000–9999 个 0.08");

// 改价：裸布竖中号 0.41 → 0.42，60cm 提手 +0.13 → +0.12
now = new Date("2026-11-13T02:00:00.000Z");
const edited = body({ changeSummary: "裸布竖中号涨价", idempotencyKey: "sales-price-edit-0002" });
edited.items.find((item) => item.styleKey === "空白袋" && item.sizeKey === "30*37*10").bagPrice = "0.42";
edited.rules.handleAddons = edited.rules.handleAddons.map((item) => (item.lengthCm === 60 ? { ...item, addon: 0.12 } : item));
const stale = await saveSalesPriceVersion({ workspace, body: { ...edited, expectedCurrentId: "PT-OLD" }, operatorId: "U-MANAGER-A", now: clock });
assert.equal(stale.code, "SALES_PRICE_CHANGED", "页面是旧的要拒绝");
const unchanged = await saveSalesPriceVersion({ workspace, body: { ...body({ idempotencyKey: "sales-price-same-0003" }), expectedCurrentId: firstId }, operatorId: "U-MANAGER-A", now: clock });
assert.equal(unchanged.code, "SALES_PRICE_UNCHANGED");
const second = await saveSalesPriceVersion({ workspace, body: { ...edited, expectedCurrentId: firstId }, operatorId: "U-MANAGER-A", now: clock });
assert.equal(second.error, undefined, second.message);
assert.equal(second.salesPrices.current.versionNo, 2);
assert.deepEqual(second.saved.changes.map((change) => change.text), ["裸布-竖中号 30×37×10 0.41 → 0.42", "加长提手：50cm +0.03，60cm +0.13，65cm +0.14，70cm +0.14，75cm +0.15，80cm +0.15 → 50cm +0.03，60cm +0.12，65cm +0.14，70cm +0.14，75cm +0.15，80cm +0.15"]);
assert.equal(second.salesPrices.history.length, 2);
assert.equal(second.salesPrices.history[1].status, "superseded");
assert.equal(second.salesPrices.history[1].effectiveTo, now.toISOString());
now = new Date("2026-11-13T02:01:00.000Z");
const nextSource = getPublishedOrderPriceSource(workspace, now);
assert.equal(resolvePublishedRow(nextSource, { id: "L2", orderType: "stock_plain", style: "空白袋", handle: "加长提60cm", qty: 100, size: "30*37*10" }).bagPrice, 0.54, "新价 0.42 + 新提手 0.12");
assert.equal(resolvePublishedRow(source, { id: "L3", orderType: "stock_plain", style: "空白袋", handle: "普通提", qty: 100, size: "30*37*10" }).bagPrice, 0.41, "旧版本的报价源算出的还是旧价（已下的订单不变）");

console.log("sales price table ok: 10-28 价目表 33 个价、加长提手 6 档、礼品袋满 1000 减 0.05、加扣 +0.10（小熊小狗不加）、改价存新版本并停用旧版、页面过期拒绝、开单按生效版本套价");
