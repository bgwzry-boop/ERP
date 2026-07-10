import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allNavigationItems,
  getVisibleSecondaryNavigationItems,
  isNavigationPageVisible,
  laterNavigationItems,
  primaryNavigationItems,
} from "../src/app/navigation.js";
import { getRolePermissionSet } from "../shared/auth/roleCatalog.js";

assert.deepEqual(
  primaryNavigationItems.map((item) => item.key),
  ["todos", "entry", "orders", "inventory", "fulfillment", "statements"],
);
assert.equal(new Set(allNavigationItems.map((item) => item.key)).size, allNavigationItems.length);
assert.deepEqual(laterNavigationItems.map((item) => item.label), ["排产"]);

assert.deepEqual(
  visibleKeys("office"),
  ["packing", "rawMaterials", "masterData", "workshopMobile"],
);
assert.deepEqual(visibleKeys("technical_operations"), ["v1Status"]);
assert.deepEqual(visibleKeys("driver"), ["driverMobile"]);
assert.deepEqual(visibleKeys("workshop"), ["workshopMobile"]);
assert.deepEqual(visibleKeys("packing"), ["packing", "rawMaterials", "workshopMobile"]);
assert.equal(isNavigationPageVisible("statements", contextFor("driver")), true);
assert.equal(isNavigationPageVisible("v1Status", contextFor("office")), false);
assert.equal(isNavigationPageVisible("v1Status", contextFor("technical_operations")), true);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const navigationComponentSource = readFileSync(new URL("../src/app/AppNavigation.jsx", import.meta.url), "utf8");
assert.match(appSource, /<AppNavigation/);
assert.match(navigationComponentSource, /角色工具/);
assert.match(navigationComponentSource, /aria-label="主导航"/);

console.log("App navigation check passed: six core pages stay primary and role tools are permission-scoped.");

function visibleKeys(roleKey) {
  return getVisibleSecondaryNavigationItems(contextFor(roleKey)).map((item) => item.key);
}

function contextFor(roleKey) {
  return getRolePermissionSet([roleKey]);
}
