import assert from "node:assert/strict";

import {
  createMiniappCatalogPolicy,
  miniappCatalogPolicyCounts,
} from "../server/miniapp/miniappCatalogPolicy.mjs";

const catalog = createMiniappCatalogPolicy({
  priceTable: { id: "PRICE-TABLE-A", bizNo: "PT-A", versionNo: 3 },
  priceItems: [
    { id: "PRICE-PLAIN-3037", size: "30×38×10", handleType: "regular", styleKey: "stock_plain", bagPrice: 0.34 },
    { id: "PRICE-FU-3037", size: "30×37×10", handleType: "regular", styleKey: "fu", bagPrice: 0.42 },
    { id: "PRICE-LAMINATED-4030", size: "40×30×10", handleType: "regular", styleKey: "laminated_plain", bagPrice: 0.77 },
  ],
  colors: [],
});

assert.equal(catalog.priceVersion, "PT-A-v3");
assert.equal(catalog.productGroups.length, miniappCatalogPolicyCounts.productGroups);
assert.equal(catalog.productTypes.length, miniappCatalogPolicyCounts.productTypes);
assert.equal(catalog.productTypes.find((item) => item.id === "stock_printed").shortName, "印刷通货袋");
assert.equal(catalog.regularSizes.length, miniappCatalogPolicyCounts.regularSizes);
assert.equal(catalog.laminatedSizes.length, miniappCatalogPolicyCounts.laminatedSizes);
assert.equal(catalog.printedPatterns.length, miniappCatalogPolicyCounts.printedPatterns);
assert.equal(catalog.colors.regular.length, miniappCatalogPolicyCounts.regularColors);
assert.equal(catalog.colors.fashion.length, miniappCatalogPolicyCounts.fashionColors);
assert.equal(catalog.colors.counts.regular, 21);
assert.equal(catalog.colors.counts.fashion, 29);
assert.equal(catalog.colorCardColors.length, 50);
assert.ok(catalog.singleColorCardColors.every((item) => !/[袋提]/.test(item.name)));
assert.equal(catalog.specialQuotePresetColors.length, 8);
assert.ok(catalog.specialQuotePresetColors.some((item) => item.name === "墨绿"));
assert.equal(catalog.specialQuoteRules.version, "BAG-SPECIAL-COST-20260722-V2");
assert.equal(catalog.specialQuoteRules.materialPricePolicy, "latest_confirmed_supplier_batch_until_order");
assert.equal(catalog.specialQuoteRules.quantityAddons.from10000, 0.06);
assert.equal(catalog.specialQuoteRules.extendedHandlePricing, "material_delta");
assert.equal(catalog.specialQuoteRules.extendedHandlePriceLabel, "按用料计算");
assert.equal(catalog.specialQuoteRules.extendedHandleUnitAddon, 0.01);
assert.doesNotMatch(JSON.stringify(catalog.specialQuoteRules), /8900|bodyGsm|handleGsm/);

const vertical3037 = catalog.regularSizes.find((item) => item.id === "30x37x10");
assert.equal(vertical3037.label, "30×37×10");
assert.equal(vertical3037.styleLabel, "竖款中号");
assert.equal(vertical3037.price, 0.34, "30×38 ERP alias must project to customer-facing 30×37×10");
assert.equal(vertical3037.priceConfigured, true);
assert.equal(catalog.regularSizes.find((item) => item.id === "25x32x10").priceConfigured, false);
assert.equal(catalog.laminatedSizes.find((item) => item.id === "l40x30x10").price, 0.77);
assert.equal(catalog.printedPatterns.find((item) => item.id === "fu").sizes.find((item) => item.id === "fu30x37x10").price, 0.42);

const angola = catalog.colors.fashion.find((item) => item.id === "angola-coffee");
assert.equal(angola.bagColor, "安哥拉红");
assert.equal(angola.handleColor, "咖色");
assert.equal(angola.photoHandleId, "extended");
assert.equal(angola.fixedColorCombination, true);
const ivoryKhaki = catalog.colors.fashion.find((item) => item.id === "ivory-khaki");
assert.equal(ivoryKhaki.bagColor, "米白");
assert.equal(ivoryKhaki.handleColor, "卡其");
assert.equal(catalog.colors.regular.find((item) => item.id === "red").verticalImageSize, "30×37×10");

const redOnly = createMiniappCatalogPolicy({
  priceTable: { id: "PRICE-TABLE-B", bizNo: "PT-B", versionNo: 1 },
  priceItems: [{ id: "PRICE-RED", size: "30×37×10", styleKey: "stock_plain", bagPrice: 0.34 }],
  colors: [{ id: "red", colorKey: "red", name: "红色" }],
});
assert.deepEqual(redOnly.colors.regular.map((item) => item.id), ["red"], "ERP enabled colors must constrain customer choices");

console.log("Miniapp catalog policy checks passed: product taxonomy, confirmed sizes, 50-color cards, combination-color semantics, and ERP price aliases are stable.");
