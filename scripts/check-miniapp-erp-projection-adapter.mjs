import assert from "node:assert/strict";

import {
  buildMiniappCatalogMasterQuery,
  buildMiniappCustomerScopeQuery,
  buildMiniappInventoryMatchQuery,
  buildMiniappSpecialMaterialPriceQuery,
  createPostgresMiniappErpProjectionAdapter,
  normalizeMiniappSize,
  previewSpecialBagQuote,
  resolveMiniappSpecialMaterialPriceSnapshot,
} from "../server/miniapp/miniappErpProjectionAdapter.mjs";

const customerId = "CUSTOMER-A";
const scope = {
  customer: {
    id: customerId,
    name: "张三服饰",
    companyName: "张三服饰",
    contactName: "张老板",
    phone: "13800001234",
    mobileMasked: "138 **** 1234",
    addressId: "ADDR-A",
    address: "义乌市测试路 1 号",
    deliveryMethod: "到厂自提",
    packagingPreference: "独立扎包",
  },
  pendingCount: 1,
  pendingReply: "提交后工厂将尽快确认",
  reorder: null,
  announcement: null,
};
const master = {
  priceTable: { id: "PRICE-TABLE-A", bizNo: "PT-A", name: "客户 A 价表", versionNo: 7 },
  priceItems: [
    { id: "PRICE-PLAIN-3037", size: "30×37×10", styleKey: "stock_plain", handleType: "regular", bagPrice: 0.34, printPrice: 0.09, otherFee: 0, minQty: 1 },
    { id: "PRICE-FU-3037", size: "30×37×10", styleKey: "fu", handleType: "regular", bagPrice: 0.42, printPrice: 0, otherFee: 0, minQty: 1 },
  ],
  colors: [],
  sizes: [],
};

assert.equal(normalizeMiniappSize("30×38"), "30*37*10");
assert.equal(normalizeMiniappSize("30 × 37 × 10"), "30*37*10");

const scopeQuery = buildMiniappCustomerScopeQuery(customerId);
assert.match(scopeQuery.text, /customer\.id = \$1::text/);
assert.doesNotMatch(scopeQuery.text, /CUSTOMER-A/);
assert.deepEqual(scopeQuery.values, [customerId]);

const catalogQuery = buildMiniappCatalogMasterQuery(customerId);
assert.match(catalogQuery.text, /price_table_items/);
assert.match(catalogQuery.text, /price_table\.status = 'active'/);
assert.match(catalogQuery.text, /price_table\.effective_from/);
assert.deepEqual(catalogQuery.values, [customerId]);

const inventoryQuery = buildMiniappInventoryMatchQuery({
  productType: "stock_plain",
  size: "30×38×10",
  colorId: "red",
  color: "红色",
  handleId: "regular",
  handle: "普通提",
});
assert.match(inventoryQuery.text, /inventory_items/);
assert.match(inventoryQuery.text, /on_hand_qty - item\.reserved_qty/);
assert.doesNotMatch(inventoryQuery.text, /30×38×10|CUSTOMER-A|红色|普通提/);
assert.ok(inventoryQuery.values.includes("30*37*10"));

const materialQuery = buildMiniappSpecialMaterialPriceQuery({ heightCm: 34, gussetCm: 11 });
assert.match(materialQuery.text, /FROM raw_material_inbounds/);
assert.match(materialQuery.text, /inventory_status IN \('可用', '机边领用', '已消耗'\)/);
assert.ok(materialQuery.values.includes(85), "body material query must use the exact calculated roll width");
assert.ok(materialQuery.values.includes(78));
assert.ok(materialQuery.values.includes(5));
assert.ok(materialQuery.values.includes(60));

const erpMaterialSnapshot = resolveMiniappSpecialMaterialPriceSnapshot({
  body: { supplier_name: "布料供应商", batch_id: "BODY-001", updated_at: "2026-07-22T01:00:00Z", yuan_per_kg: 9.2 },
  handle: { supplier_name: "提手供应商", batch_id: "HANDLE-001", updated_at: "2026-07-22T02:00:00Z", yuan_per_kg: 9.5 },
});
assert.equal(erpMaterialSnapshot.version, "ERP-MATERIAL-BODY-001-HANDLE-001");
assert.equal(erpMaterialSnapshot.body.yuanPerTon, 9200);
assert.equal(erpMaterialSnapshot.handle.yuanPerTon, 9500);
assert.equal(erpMaterialSnapshot.provisional, false);

let inventoryResult = { matched: true, availableQty: 800 };
const queryCalls = [];
const adapter = createPostgresMiniappErpProjectionAdapter({
  queryJson: async (text, values) => {
    queryCalls.push({ text, values });
    if (/FROM customers AS customer\s+LEFT JOIN LATERAL/.test(text)) return scope;
    if (/JOIN price_tables AS price_table/.test(text)) return master;
    if (/FROM inventory_items AS item/.test(text)) return inventoryResult;
    if (/FROM raw_material_inbounds AS inbound/.test(text)) return { body: null, handle: null };
    throw new Error("unexpected query");
  },
});

const context = { bindingId: "BIND-A", customerId };
assert.equal((await adapter.getBootstrap(context)).customer.id, customerId);
assert.equal((await adapter.getCustomerDefaults(context)).deliveryMethod, "到厂自提");
assert.equal((await adapter.getCustomerDefaults(context)).companyName, "张三服饰");
assert.equal((await adapter.getCustomerDefaults(context)).mobileMasked, "138 **** 1234");
const catalog = await adapter.getCatalog(context);
assert.equal(catalog.priceVersion, "PT-A-v7");
assert.equal(catalog.regularSizes.find((item) => item.id === "30x37x10").price, 0.34);

const plainLine = {
  productType: "stock_plain",
  size: "30×37×10",
  colorId: "red",
  color: "红色",
  handleId: "regular",
  handle: "普通提",
  quantity: 500,
};
const plainQuote = await adapter.previewQuote(context, { ...plainLine, unitPrice: 0.01 });
assert.equal(plainQuote.basePrice, 0.34);
assert.equal(plainQuote.unitPrice, 0.34, "client-submitted unit price must never affect the ERP projection");
assert.equal(plainQuote.amount, 170);
assert.equal(plainQuote.priceVersion, "PT-A-v7");
assert.equal(plainQuote.authoritative, false);

const extendedQuote = await adapter.previewQuote(context, { ...plainLine, handleId: "extended", handle: "加长提" });
assert.equal(extendedQuote.handleAddon, 0.03);
assert.equal(extendedQuote.unitPrice, 0.37);

const genericHandleAdapter = createPostgresMiniappErpProjectionAdapter({
  queryJson: async () => ({
    ...master,
    priceItems: [{ ...master.priceItems[0], handleType: "" }],
  }),
});
assert.equal(
  (await genericHandleAdapter.previewQuote(context, { ...plainLine, handleId: "extended", handle: "加长提" })).unitPrice,
  0.37,
  "a generic/base price must still receive the confirmed extended-handle addon",
);

const printedQuote = await adapter.previewQuote(context, {
  ...plainLine,
  productType: "custom_print",
  quantity: 3000,
  artworkToken: "FILE-TOKEN",
  printColorCount: 2,
  printColors: ["黑色", "红色"],
  printSideMode: "single",
  specialRequirements: ["snap_button"],
});
assert.equal(printedQuote.printColorCount, 2);
assert.equal(printedQuote.printFeePerColor, 0.09);
assert.equal(printedQuote.specialRequirementAddon, 0.1);
assert.equal(printedQuote.unitPrice, 0.62);
assert.equal(printedQuote.amount, 1860);
assert.deepEqual(printedQuote.excludedFees, ["运费", "税费"]);
assert.equal(printedQuote.plateFeeIncluded, true);

const specialQuote = previewSpecialBagQuote({
  materialType: "nonwoven",
  widthCm: 42,
  heightCm: 34,
  gussetCm: 11,
  quantity: 5000,
  bagColor: "红色",
  handleColor: "黑色",
  handleId: "extended",
  specialRequirements: ["extended_handle", "snap_button"],
  printingMode: "screen",
  printSide: "single",
}, { regularSizes: [], specialRequirementRules: { snapButtonAddon: 0.1 } });
assert.equal(specialQuote.priceVersion, "BAG-SPECIAL-COST-20260722-V2");
assert.equal(specialQuote.materialPriceVersion, "MATERIAL-PRICE-SNAPSHOT-20260722-01");
assert.equal(specialQuote.priceLocked, false);
assert.equal(specialQuote.bagUnitPrice, 0.45);
assert.equal(specialQuote.handleUnitAddon, 0.01);
assert.equal(specialQuote.estimatedAmount, 3200);
assert.deepEqual(specialQuote.excludedFees, ["运费", "税费"]);
assert.equal(specialQuote.plateFeeIncluded, true);
assert.doesNotMatch(JSON.stringify(specialQuote), /8900|bodyMaterialUnitCost|handleMaterialUnitCost/);

const available = await adapter.checkInventory(context, plainLine);
assert.deepEqual(available, { status: "available", label: "库存充足", note: "库存变化较快，提交时将再次核验" });
assert.equal(Object.hasOwn(available, "availableQty"), false, "exact ERP stock quantity must not cross the BFF boundary");
inventoryResult = { matched: true, availableQty: 100 };
assert.equal((await adapter.checkInventory(context, plainLine)).status, "confirm");
inventoryResult = { matched: true, availableQty: 0 };
assert.equal((await adapter.checkInventory(context, plainLine)).status, "unavailable");
inventoryResult = { matched: false, availableQty: 0 };
assert.equal((await adapter.checkInventory(context, plainLine)).status, "confirm");
assert.ok(queryCalls.every((call) => !call.text.includes(customerId)));

const missingPriceAdapter = createPostgresMiniappErpProjectionAdapter({ queryJson: async () => ({ priceTable: null, priceItems: [] }) });
await assert.rejects(
  () => missingPriceAdapter.previewQuote(context, plainLine),
  (error) => error.statusCode === 409 && error.code === "CUSTOMER_PRICE_TABLE_NOT_CONFIGURED",
);

const incompletePriceAdapter = createPostgresMiniappErpProjectionAdapter({
  queryJson: async () => ({ priceTable: master.priceTable, priceItems: [], colors: [], sizes: [] }),
});
await assert.rejects(
  () => incompletePriceAdapter.getCatalog(context),
  (error) => error.statusCode === 409 && error.code === "CUSTOMER_PRICE_ITEMS_NOT_READY",
);

console.log("Miniapp ERP projection checks passed: customer price scoping, server-side quote precedence, simplified stock status, and fail-closed missing-price behavior are enforced.");
