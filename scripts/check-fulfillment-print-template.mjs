import assert from "node:assert/strict";
import { customers, initialFulfillments, initialOrderLines } from "../src/data/fixtures.js";
import {
  buildFulfillmentPrintTemplate,
  getPackageCount,
  getPhoneTail,
} from "../src/domain/printTemplates.js";

const fulfillment = initialFulfillments.find((item) => item.id === "F003");
assert(fulfillment, "seed fulfillment F003 should exist");
const orderLine = initialOrderLines.find((item) => item.id === fulfillment.lineId);
const customer = customers.find((item) => item.id === fulfillment.customerId);

assert(orderLine, "seed order line for F003 should exist");
assert(customer, "seed customer for F003 should exist");
assert.equal(getPackageCount("3包"), 3);
assert.equal(getPackageCount("1件散装"), 1);
assert.equal(getPhoneTail("177****1160"), "1160");

const template = buildFulfillmentPrintTemplate({
  fulfillment,
  orderLine,
  customer,
  printRecord: {
    printRecordId: "PR-F003",
    templateId: "tpl-p0-express-ltl-label",
    batchNo: "PB-F003",
    status: "printed",
    printAction: "first_print",
  },
});

assert.equal(template.documentType, "express_ltl_label");
assert.equal(template.templateVersion, "p0-express-ltl-label-v1");
assert.equal(template.priceHidden, true);
assert.equal(template.paper.widthMm, 80);
assert.equal(template.paper.heightMm, 50);
assert.equal(template.paper.copies, 3);
assert.equal(template.fields.customerName, "白鲸自营店");
assert.equal(template.fields.phoneTail, "1160");
assert.equal(template.fields.quantityText, "1500个");
assert.equal(template.fields.packageText, "3包");
assert.match(template.fields.goodsSummary, /白鲸活动袋/);
assert.match(template.fields.goodsSummary, /白印黑/);
assert.match(template.fields.goodsSummary, /白袋黑提/);
assert.match(template.fields.goodsSummary, /单面/);
assert.match(template.fields.barcodeText, /F003/);

const forbiddenMoneyKeyPattern = /(^|_)(amount|receivable|unitprice|unit_price|price)(_|$)/i;
for (const key of collectObjectKeys(template)) {
  assert(!forbiddenMoneyKeyPattern.test(key) || key === "priceHidden", `print label contains forbidden money key: ${key}`);
}
const serialized = JSON.stringify(template);
assert(!serialized.includes("¥"), "print label should not contain money symbols");
assert(!serialized.includes("应收"), "print label should not contain receivable copy");
assert(!serialized.includes("单价"), "print label should not contain unit-price copy");

const pickupFulfillment = initialFulfillments.find((item) => item.id === "F001");
const pickupOrderLine = initialOrderLines.find((item) => item.id === pickupFulfillment.lineId);
const pickupCustomer = customers.find((item) => item.id === pickupFulfillment.customerId);
const pickupTemplate = buildFulfillmentPrintTemplate({
  fulfillment: pickupFulfillment,
  orderLine: pickupOrderLine,
  customer: pickupCustomer,
  printRecord: {
    printRecordId: "PR-F001",
    templateId: "tpl-p0-pickup-note",
    batchNo: "PB-F001",
    status: "printed",
    printAction: "first_print",
  },
});
assert.equal(pickupTemplate.documentType, "pickup_note");
assert.equal(pickupTemplate.templateVersion, "p0-pickup_note-dot-matrix-v1");
assert.equal(pickupTemplate.title, "自提单");
assert.equal(pickupTemplate.priceHidden, false);
assert.equal(pickupTemplate.paper.widthMm, 241);
assert.equal(pickupTemplate.paper.copies, 2);
assert.deepEqual(pickupTemplate.paper.copyNames, ["客户联", "工厂留底联"]);
assert.equal(pickupTemplate.fields.receiverSignatureLabel, "提货人签收");
assert.equal(pickupTemplate.fields.lineItems?.[0]?.orderLineNo, "ORD-0629-001-01");
assert.equal(pickupTemplate.fields.lineItems?.[0]?.amountText, "¥180");
assert.equal(pickupTemplate.fields.lineItems?.[0]?.unitPriceText, "¥0.36");
assert.equal(Object.hasOwn(pickupTemplate.fields.lineItems?.[0] ?? {}, "printUnitPriceText"), false);
assert.match(JSON.stringify(pickupTemplate), /正式单据显示价格/);

const deliveryFulfillment = initialFulfillments.find((item) => item.id === "F008");
const deliveryOrderLine = initialOrderLines.find((item) => item.id === deliveryFulfillment.lineId);
const deliveryCustomer = customers.find((item) => item.id === deliveryFulfillment.customerId);
const deliveryTemplate = buildFulfillmentPrintTemplate({
  fulfillment: deliveryFulfillment,
  orderLine: deliveryOrderLine,
  customer: deliveryCustomer,
  printRecord: {
    printRecordId: "PR-F008",
    templateId: "tpl-p0-delivery-note",
    batchNo: "PB-F008",
    status: "printed",
    printAction: "first_print",
  },
});
assert.equal(deliveryTemplate.documentType, "delivery_note");
assert.equal(deliveryTemplate.title, "送货单");
assert.equal(deliveryTemplate.priceHidden, false);
assert.equal(deliveryTemplate.fields.receiverSignatureLabel, "客户签收");
assert.match(deliveryTemplate.fields.lineItems?.[0]?.goodsSummary, /黄印黑/);
assert.match(deliveryTemplate.fields.lineItems?.[0]?.goodsSummary, /黄袋红提/);
assert.equal(deliveryTemplate.fields.lineItems?.[0]?.printUnitPriceText, "按价格快照");
assert.equal(deliveryTemplate.fields.totalAmountText, "¥1,380");
assert.match(deliveryTemplate.fields.priceStatementText, /价格快照/);

console.log("Fulfillment print template check passed.");

function collectObjectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectObjectKeys(child, keys);
  }
  return keys;
}
