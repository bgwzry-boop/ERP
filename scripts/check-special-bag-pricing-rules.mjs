import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  calculateSpecialBagPricing,
  defaultMaterialPriceSnapshot,
  getPublicSpecialQuoteRules,
  specialBagPricingRules,
} from "../shared/pricing/specialBagPricing.js";

assert.equal(specialBagPricingRules.version, "BAG-SPECIAL-COST-20260722-V2");
assert.equal(specialBagPricingRules.defaults.bodyGsm, 78);
assert.equal(specialBagPricingRules.defaults.handleGsm, 60);
assert.equal(specialBagPricingRules.materialPricePolicy.source, "latest_confirmed_supplier_batch");
assert.equal(defaultMaterialPriceSnapshot.version, "MATERIAL-PRICE-SNAPSHOT-20260722-01");
assert.equal(defaultMaterialPriceSnapshot.body.yuanPerTon, 8900);
assert.equal(defaultMaterialPriceSnapshot.handle.yuanPerTon, 8900);

const regular = calculateSpecialBagPricing({ widthCm: 42, heightCm: 34, gussetCm: 11, quantity: 5_000, handleId: "regular" });
assert.equal(regular.bodyWidthMetres, 0.85);
assert.equal(regular.bodyLengthMetres, 0.55);
assert.equal(regular.baseUnitCostWithRegularHandle, 0.37);
assert.equal(regular.specialCustomizationUnitFee, 0.08);
assert.equal(regular.bagUnitPrice, 0.45);
assert.equal(regular.selectedBagUnitPrice, 0.45);

const extended = calculateSpecialBagPricing({ widthCm: 42, heightCm: 34, gussetCm: 11, quantity: 10_000, handleId: "extended" });
assert.equal(extended.specialCustomizationUnitFee, 0.06);
assert.equal(extended.handleUnitAddon, 0.01);
assert.equal(extended.selectedBagUnitPrice, 0.44);

const repriced = calculateSpecialBagPricing(
  { widthCm: 42, heightCm: 34, gussetCm: 11, quantity: 5_000, handleId: "regular" },
  specialBagPricingRules,
  {
    ...defaultMaterialPriceSnapshot,
    version: "ERP-BATCH-PRICE-TEST",
    source: "erp_supplier_batch",
    provisional: false,
    body: { ...defaultMaterialPriceSnapshot.body, supplierId: "SUP-A", batchId: "BODY-A", yuanPerTon: 10_000 },
  },
);
assert.equal(repriced.materialPriceVersion, "ERP-BATCH-PRICE-TEST");
assert.ok(repriced.bagUnitPrice > regular.bagUnitPrice, "an unplaced quote must follow the latest material batch price");

const publicRules = getPublicSpecialQuoteRules();
assert.equal(publicRules.version, specialBagPricingRules.version);
assert.equal(publicRules.extendedHandlePricing, "material_delta");
assert.equal(publicRules.extendedHandleUnitAddon, 0.01);
assert.equal(publicRules.quantityAddons.from5000, 0.08);
assert.equal(publicRules.quantityAddons.from10000, 0.06);
assert.doesNotMatch(JSON.stringify(publicRules), /8900|bodyGsm|handleGsm/);

const miniappSnapshot = JSON.parse(await readFile(
  new URL("../../下单小程序/server/src/modules/special-quotes/special-bag-pricing-rules.snapshot.json", import.meta.url),
  "utf8",
));
assert.deepEqual(miniappSnapshot, specialBagPricingRules, "miniapp snapshot must match the ERP canonical rule exactly");
const miniappMaterialSnapshot = JSON.parse(await readFile(
  new URL("../../下单小程序/server/src/modules/special-quotes/special-bag-material-price.snapshot.json", import.meta.url),
  "utf8",
));
assert.deepEqual(miniappMaterialSnapshot, defaultMaterialPriceSnapshot, "miniapp material snapshot must match the ERP published fallback exactly");

console.log("Special bag pricing checks passed: ERP quotation domain and miniapp snapshot share one versioned rule.");
