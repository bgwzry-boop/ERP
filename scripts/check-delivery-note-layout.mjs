// P2-07 出库单打印样式：照旧 ERP「三个单价」版式 + 办公室自己改的单据抬头。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DELIVERY_NOTE_COLUMNS, amountInChineseUppercase, deliveryNoteColumns, splitLegacyUnitPrices, validateCompanyPrintProfileInput } from "../shared/deliveryNoteLayout.js";
import { listFulfillmentPickerSuggestions } from "../server/services/fulfillmentPickerSuggestionService.mjs";
import { buildFulfillmentPrintTemplate } from "../src/domain/printTemplates.js";
import { buildFulfillmentNotePdf, isFulfillmentNoteTemplate } from "./fulfillment-note-pdf.mjs";
import { resolveFulfillmentPrintPricing } from "../server/services/fulfillmentPrintPricingService.mjs";
import { createLocalPrintDeviceRepository } from "../server/printDeviceRepository.mjs";
import { readCompanyPrintProfile, saveCompanyPrintProfile } from "../server/services/companyPrintProfileService.mjs";

// Columns in the order of the old printed sheet, plus 加扣单价.
assert.deepEqual(DELIVERY_NOTE_COLUMNS.map(column => column.label),
  ["序号", "产品名称", "规格", "颜色", "仓库", "单位", "数量", "袋子单价", "印刷单价", "长提单价", "加扣单价", "金额", "备注"]);
// 袋子单价 always; the other prices only when a line on this sheet uses them.
const labelsFor = items => deliveryNoteColumns(items).map(column => column.label).filter(label => label.endsWith("单价"));
assert.deepEqual(labelsFor([{ bagUnitPriceText: "0.47" }]), ["袋子单价"]);
assert.deepEqual(labelsFor([{ bagUnitPriceText: "0.47", snapUnitPriceText: "0.1" }, { bagUnitPriceText: "0.48" }]), ["袋子单价", "加扣单价"]);
assert.deepEqual(labelsFor([{ printingUnitPriceText: "0.2(双色)", handleUnitPriceText: "0.03" }]), ["袋子单价", "印刷单价", "长提单价"]);

// 大写金额 as on the old 合计 row.
for (const [amount, expected] of [[1043, "壹仟零肆拾叁元整"], [145.8, "壹佰肆拾伍元捌角"], [20.07, "贰拾元零柒分"], [100010000, "壹亿零壹万元整"], [0, "零元整"], [0.5, "伍角"]]) {
  assert.equal(amountInChineseUppercase(amount), expected, String(amount));
}

// Unit prices: the snapshot keeps handle / snap inside the bag price; the quote evidence splits them.
assert.deepEqual(splitLegacyUnitPrices({ bagPrice: 0.36, printPrice: 0.09 }), { bag: 0.36, print: 0.09, handle: 0, snap: 0 }, "manual price: no split");
assert.deepEqual(splitLegacyUnitPrices({ bagPrice: 0.6, printPrice: 0.1, sourceEvidence: { specialQuote: { handleUnitAddon: 0.05, snapButtonUnitAddon: 0.1 } } }), { bag: 0.45, print: 0.1, handle: 0.05, snap: 0.1 }, "special-size quote");
assert.deepEqual(splitLegacyUnitPrices({ bagPrice: 0.6, printPrice: 0, sourceEvidence: { quote: { basePrice: 0.47, handleAddon: 0.03, specialRequirementAddon: 0.1 } } }), { bag: 0.47, print: 0, handle: 0.03, snap: 0.1 }, "mini-program locked quote");
assert.deepEqual(splitLegacyUnitPrices({ bagPrice: 0.37, printPrice: 0, sourceEvidence: { kind: "erp_published_price", handleFallback: true } }), { bag: 0.34, print: 0, handle: 0.03, snap: 0 }, "published price with the extended-handle surcharge");
assert.equal(splitLegacyUnitPrices(null), null);

// The print pricing carries them from the price snapshot in force.
const workspace = {
  orderLines: [{ id: "OL-1", orderType: "custom_print", qty: 1000 }],
  priceSnapshots: [{ id: "PS-1", orderLineId: "OL-1", snapshotType: "order_confirm", versionNo: 1, bagPrice: 0.34, printPrice: 0.09, otherFee: 30, chargeableQty: 1000, finalAmount: 460, createdAt: "2026-11-01T00:00:00Z" }],
  statementLines: [], statements: [],
};
const { pricing } = resolveFulfillmentPrintPricing({ workspace, fulfillment: { id: "F-1", lineId: "OL-1", expectedQty: 1000, actualQty: 1000 }, orderLine: workspace.orderLines[0] });
assert.deepEqual(pricing.unitPrices, { bag: 0.34, print: 0.09, handle: 0, snap: 0 });

// Template: header from the office's setting, three copies, three price columns, uppercase total.
const companyProfile = { companyName: "合成包装厂", address: "合成路 1 号", phone: "0319-0000000", footerNote: "请当面点清数量。" };
const template = buildFulfillmentPrintTemplate({
  fulfillment: { id: "F-1", lineId: "OL-1", customerId: "C1", method: "送货", qty: 1000, zone: "南屋", customerSnapshot: { name: "合成客户", contactName: "王经理", contactPhone: "13800001234", address: "合成镇" } },
  orderLine: { id: "OL-1", product: "印刷袋", size: "30*40*10", color: "白色", orderType: "custom_print", qty: 1000, print: "是", printColor: "红/蓝", printSide: "双面" },
  printRecord: { printRecordId: "PR-F-1-1", createdAt: "2026-11-04T03:00:00Z" },
  documentType: "delivery_note",
  pricing,
  companyProfile,
});
assert.equal(template.title, "送货单");
assert.deepEqual(template.paper.copyNames, ["①白存根联", "②红客户联", "③黄回单联"]);
assert.equal(template.fields.companyName, "合成包装厂");
assert.equal(template.fields.footerNote, "请当面点清数量。");
assert.equal(template.fields.documentDateText, "2026-11-04");
assert.equal(template.fields.totalAmountUppercase, "肆佰陆拾元整");
const [item] = template.fields.lineItems;
// 几色写在印刷单价后面（单面双面机印同价，不写）；备注里不再重复。
assert.deepEqual([item.bagUnitPriceText, item.printingUnitPriceText, item.handleUnitPriceText, item.snapUnitPriceText, item.warehouse, item.unit, item.amount, item.remark], ["0.34", "0.09(双色)", "", "", "南屋", "个", 460, ""]);
assert.equal(template.fields.pickerName, "", "a delivery note printed before delivery has no receiver yet");
assert.equal(template.fields.pickerLabel, "收货人");
assert.equal(isFulfillmentNoteTemplate(template), true);
assert.equal(isFulfillmentNoteTemplate({ ...template, priceHidden: true }), false);

async function pdfText(bytes) {
  const document = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    pages.push((await (await document.getPage(index)).getTextContent()).items.map(row => row.str).join(""));
  }
  await document.destroy();
  return pages;
}

const [page] = await pdfText(await buildFulfillmentNotePdf(template));
assert.doesNotMatch(page, /长提单价|加扣单价/, "unused price columns are left out");
for (const value of ["0.09(双色)", "合成包装厂", "地址：合成路 1 号", "电话：0319-0000000", "No. PR-F-1-1", "日期：2026-11-04", "客户名称：合成客户", "联系人：王经理", "客户地址：合成镇",
  "序号", "产品名称", "袋子单价", "印刷单价", "印刷袋", "30*40*10", "白色", "南屋", "1000", "0.34", "460.00",
  "合计：肆佰陆拾元整", "¥460.00", "注：请当面点清数量。", "送货单位及经手人(签章)：", "收货单位及经手人(签章)：", "白", "存", "根", "黄", "回"]) {
  assert.ok(page.includes(value), `missing ${value}: ${page}`);
}
assert.doesNotMatch(page, /13800001234/, "the customer's full phone stays off the paper (tail only, as today)");

// Older orders whose price kept the handle / snap inside the bag price say so in 备注.
const remarkOf = (orderLine, unitPrices = { bag: 0.5, print: 0, handle: 0, snap: 0 }) => buildFulfillmentPrintTemplate({
  fulfillment: { id: "F-R", lineId: "OL-R", method: "自提", qty: 100 }, orderLine: { id: "OL-R", qty: 100, ...orderLine },
  printRecord: { printRecordId: "PR-R" }, documentType: "pickup_note", pricing: { ...pricing, unitPrices },
}).fields.lineItems[0].remark;
assert.equal(remarkOf({ orderType: "现货有货", handle: "加长提", specialRequirements: ["snap_button"] }), "加长提、加扣、现货");
assert.equal(remarkOf({ orderType: "现货有货", handle: "加长提" }, { bag: 0.47, print: 0, handle: 0.03, snap: 0 }), "现货", "a separate 长提单价 needs no remark");
assert.equal(remarkOf({ orderType: "custom_print", print: "是", printColor: "红+黑+白" }), "三色", "no separate print price: colours go to 备注");

// 提货人: customer A's goods picked up by B; printed on its own, not in 备注.
const pickupTemplate = buildFulfillmentPrintTemplate({
  fulfillment: { id: "F-P", lineId: "OL-1", method: "自提", qty: 1000, customerSnapshot: { name: "客户甲" } },
  orderLine: { id: "OL-1", product: "印刷袋", orderType: "custom_print", qty: 1000 },
  printRecord: { printRecordId: "PR-F-P-1", documentType: "pickup_note" }, documentType: "pickup_note", pricing, companyProfile, pickerName: "印刷工乙",
});
assert.deepEqual([pickupTemplate.title, pickupTemplate.fields.pickerLabel, pickupTemplate.fields.pickerName], ["自提单", "提货人", "印刷工乙"]);
const [pickupPage] = await pdfText(await buildFulfillmentNotePdf(pickupTemplate));
assert.ok(pickupPage.includes("客户名称：客户甲") && pickupPage.includes("提货人：印刷工乙"), pickupPage);
// The office picks from the people who picked up for this customer before (latest first), plus contacts marked 拿货人.
const suggestions = listFulfillmentPickerSuggestions({ customerId: "A", workspace: {
  fulfillments: [
    { customerId: "A", method: "自提", receiverName: "印刷工乙", updatedAt: "2026-11-01T08:00:00Z" },
    { customerId: "A", method: "自提", receiverName: "印刷工丙", updatedAt: "2026-11-03T08:00:00Z" },
    { customerId: "A", method: "自提", receiverName: "印刷工乙", updatedAt: "2026-10-01T08:00:00Z" },
    { customerId: "A", method: "送货", receiverName: "签收的店员" },
    { customerId: "B", method: "自提", receiverName: "别的客户的人" },
  ],
  customers: [{ id: "A", contacts: [{ contactName: "老张", role: "拿货人" }, { contactName: "老板", role: "老板" }] }],
} });
assert.deepEqual(suggestions.items.map(row => row.name), ["印刷工丙", "印刷工乙", "老张"]);

// P2-05 gift shows in the 备注 column and as a 说明 line under the table.
const giftTemplate = buildFulfillmentPrintTemplate({
  fulfillment: { id: "F-2", lineId: "OL-1", customerId: "C1", method: "送货", qty: 1010, customerSnapshot: { name: "合成客户" } },
  orderLine: { id: "OL-1", product: "印刷袋", size: "30*40*10", orderType: "custom_print", qty: 1000 },
  printRecord: { printRecordId: "PR-F-2-1" }, documentType: "delivery_note", companyProfile,
  pricing: { ...pricing, deliveredQty: 1010, chargeableQty: 1000, freeQty: 10, quantityNote: "多出 10 个赠送，不收费（按下单 1000 个计价）" },
});
assert.equal(giftTemplate.fields.lineItems[0].remark, "赠送10个");
const [giftPage] = await pdfText(await buildFulfillmentNotePdf(giftTemplate));
assert.ok(giftPage.includes("赠送10个"));
assert.ok(giftPage.includes("说明：多出 10 个赠送，不收费（按下单 1000 个计价）"));

// Many lines continue on further pages; the total stays on the last.
const many = { ...template, fields: { ...template.fields, lineItems: Array.from({ length: 25 }, (_, index) => ({ ...item, productName: `货品${index + 1}`, amount: 10 })) } };
const pages = await pdfText(await buildFulfillmentNotePdf(many));
assert.ok(pages.length >= 2);
assert.match(pages[0], /续下页/);
assert.match(pages.at(-1), /合计：贰佰伍拾元整/);
assert.ok(pages.join("").includes("货品25"));

// Characters the embedded font cannot draw fail closed instead of printing blanks.
await assert.rejects(() => buildFulfillmentNotePdf({ ...template, fields: { ...template.fields, customerName: "\u{2A6D6}客户" } }), /字体不支持/);
await assert.rejects(() => buildFulfillmentNotePdf({ ...template, fields: { ...template.fields, lineItems: [] } }));

// 单据抬头: the office edits it; stale edits are refused.
assert.equal(validateCompanyPrintProfileInput({ companyName: "" }), "请填写公司名称。");
const storageRoot = mkdtempSync(join(tmpdir(), "erp-company-profile-"));
try {
  const local = { printDeviceRepository: createLocalPrintDeviceRepository({ storageRoot }) };
  const before = await readCompanyPrintProfile(local);
  assert.equal(before.companyName, "河北禄兴包装制品有限公司");
  assert.equal(before.revision, 1);
  const saved = await saveCompanyPrintProfile({ workspace: local, operatorId: "U-OFFICE-A", body: { ...companyProfile, expectedRevision: 1, idempotencyKey: "company-profile-1" } });
  assert.equal(saved.companyPrintProfile.companyName, "合成包装厂");
  assert.equal(saved.companyPrintProfile.revision, 2);
  assert.equal((await readCompanyPrintProfile(local)).phone, "0319-0000000");
  const stale = await saveCompanyPrintProfile({ workspace: local, operatorId: "U-OFFICE-A", body: { ...companyProfile, companyName: "旧页面", expectedRevision: 1, idempotencyKey: "company-profile-2" } });
  assert.equal(stale.code, "COMPANY_PRINT_PROFILE_CHANGED");
  const invalid = await saveCompanyPrintProfile({ workspace: local, operatorId: "U-OFFICE-A", body: { companyName: " ", expectedRevision: 2, idempotencyKey: "company-profile-3" } });
  assert.equal(invalid.code, "COMPANY_PRINT_PROFILE_INVALID");
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

console.log("delivery note layout ok");
