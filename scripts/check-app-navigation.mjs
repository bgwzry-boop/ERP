import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allNavigationItems,
  desktopRequiredMobilePage,
  getDefaultNavigationPage,
  getMobileViewportPage,
  getNavigationGroupForPage,
  getVisibleNavigationGroups,
  getVisiblePrimaryNavigationItems,
  getVisibleRoleNavigationItems,
  getVisibleSecondaryNavigationItems,
  isDedicatedMobileRolePage,
  isNavigationPageVisible,
  laterNavigationItems,
  primaryNavigationGroups,
  primaryNavigationItems,
  roleNavigationItems,
  toolNavigationGroup,
} from "../src/app/navigation.js";
import { getRolePermissionSet } from "../shared/auth/roleCatalog.js";

assert.deepEqual(
  primaryNavigationItems.map((item) => item.key),
  ["todos", "entry", "orders", "inventory", "fulfillment", "statements"],
);
assert.equal(new Set(allNavigationItems.map((item) => item.key)).size, allNavigationItems.length);
assert.deepEqual(laterNavigationItems.map((item) => item.label), ["排产"]);
assert.deepEqual(primaryNavigationGroups.map((group) => group.key), ["workspace", "orders", "stockDelivery", "accounts"]);
assert.deepEqual(primaryNavigationGroups.map((group) => group.itemKeys), [
  ["todos"],
  ["entry", "orders"],
  ["inventory", "fulfillment"],
  ["statements"],
]);
assert.equal(toolNavigationGroup.label, "更多工作台");
assert.deepEqual(toolNavigationGroup.itemKeys, ["packing", "rawMaterials", "masterData", "payroll", "v1Status"]);
assert.deepEqual(roleNavigationItems.map((item) => item.key), ["attendanceMobile", "officeMobile", "decisionMobile", "maintenanceMobile", "rawMaterialScanner", "warehouseMobile", "workshopMobile", "driverMobile"]);

assert.deepEqual(visiblePrimaryKeys("office"), ["todos", "entry", "orders", "inventory", "fulfillment", "statements"]);
assert.deepEqual(visiblePrimaryKeys("management"), ["todos", "entry", "orders", "inventory", "fulfillment", "statements"]);
assert.deepEqual(visiblePrimaryKeys("finance"), ["todos", "orders", "statements"]);
assert.deepEqual(visiblePrimaryKeys("driver"), []);
assert.deepEqual(visiblePrimaryKeys("workshop"), []);
assert.deepEqual(visiblePrimaryKeys("packing"), []);
assert.deepEqual(visiblePrimaryKeys("warehouse"), []);
assert.deepEqual(visibleGroupKeys("office"), ["workspace", "orders", "stockDelivery", "accounts", "moreWorkbenches"]);
assert.equal(getNavigationGroupForPage("entry", contextFor("office"))?.key, "orders");
assert.equal(getNavigationGroupForPage("fulfillment", contextFor("office"))?.key, "stockDelivery");

assert.deepEqual(
  visibleKeys("office"),
  ["packing", "rawMaterials", "masterData"],
);
assert.deepEqual(visibleKeys("management"), ["packing", "rawMaterials", "masterData", "payroll", "v1Status"]);
assert.deepEqual(visibleKeys("finance"), ["rawMaterials", "payroll"]);
assert.deepEqual(visibleKeys("technical_operations"), ["v1Status"]);
assert.deepEqual(visibleKeys("driver"), []);
assert.deepEqual(visibleKeys("workshop"), []);
assert.deepEqual(visibleKeys("packing"), []);
assert.deepEqual(visibleKeys("warehouse"), []);
assert.deepEqual(visibleRoleKeys("driver"), ["attendanceMobile", "driverMobile"]);
assert.deepEqual(visibleRoleKeys("office"), ["attendanceMobile", "officeMobile"]);
assert.deepEqual(visibleRoleKeys("decision_maker"), ["decisionMobile"]);
assert.deepEqual(visibleRoleKeys("maintenance"), ["attendanceMobile", "maintenanceMobile"]);
assert.deepEqual(visibleRoleKeys("workshop"), ["attendanceMobile", "rawMaterialScanner", "workshopMobile"]);
assert.deepEqual(visibleRoleKeys("packing"), ["attendanceMobile", "rawMaterialScanner", "workshopMobile"]);
assert.deepEqual(visibleRoleKeys("warehouse"), ["attendanceMobile", "warehouseMobile"]);
assert.equal(isNavigationPageVisible("statements", contextFor("driver")), false);
assert.equal(isNavigationPageVisible("v1Status", contextFor("office")), false);
assert.equal(isNavigationPageVisible("v1Status", contextFor("technical_operations")), true);
assert.equal(isNavigationPageVisible("rawMaterialScanner", contextFor("warehouse")), false);
assert.equal(isNavigationPageVisible("warehouseMobile", contextFor("warehouse")), true);
assert.equal(getDefaultNavigationPage(contextFor("office")), "todos");
assert.equal(getDefaultNavigationPage(contextFor("finance")), "statements");
assert.equal(getDefaultNavigationPage(contextFor("technical_operations")), "v1Status");
assert.equal(getDefaultNavigationPage(contextFor("decision_maker")), "decisionMobile");
assert.equal(getDefaultNavigationPage(contextFor("maintenance")), "maintenanceMobile");
assert.equal(getDefaultNavigationPage(contextFor("driver")), "driverMobile");
assert.equal(getDefaultNavigationPage(contextFor("workshop")), "workshopMobile");
assert.equal(getDefaultNavigationPage(contextFor("packing")), "workshopMobile");
assert.equal(getDefaultNavigationPage(contextFor("warehouse")), "warehouseMobile");
assert.equal(isDedicatedMobileRolePage("driverMobile"), true);
assert.equal(isDedicatedMobileRolePage("workshopMobile"), true);
assert.equal(isDedicatedMobileRolePage("rawMaterialScanner"), true);
assert.equal(isDedicatedMobileRolePage("warehouseMobile"), true);
assert.equal(isDedicatedMobileRolePage("officeMobile"), true);
assert.equal(isDedicatedMobileRolePage("decisionMobile"), true);
assert.equal(isDedicatedMobileRolePage("maintenanceMobile"), true);
assert.equal(isDedicatedMobileRolePage("attendanceMobile"), true);
assert.equal(isDedicatedMobileRolePage("desktopRequiredMobile"), true);
assert.equal(isDedicatedMobileRolePage("todos"), false);
assert.equal(getMobileViewportPage("todos", contextFor("office")), "rawMaterials");
assert.equal(getMobileViewportPage("orders", contextFor("office")), "rawMaterials");
assert.equal(getMobileViewportPage("rawMaterials", contextFor("office")), "rawMaterials");
assert.equal(getMobileViewportPage("inventory", contextFor("management")), desktopRequiredMobilePage.key);
assert.equal(getMobileViewportPage("statements", contextFor("finance")), desktopRequiredMobilePage.key);
assert.equal(getMobileViewportPage("v1Status", contextFor("technical_operations")), desktopRequiredMobilePage.key);
assert.equal(getMobileViewportPage("packing", contextFor("driver")), "driverMobile");
assert.equal(getMobileViewportPage("packing", contextFor("warehouse")), "warehouseMobile");
assert.equal(getMobileViewportPage("packing", contextFor("workshop")), "workshopMobile");
assert.equal(getMobileViewportPage("rawMaterialScanner", contextFor("packing")), "rawMaterialScanner");
assert.equal(getMobileViewportPage("attendanceMobile", contextFor("packing")), "attendanceMobile");

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const navigationComponentSource = readFileSync(new URL("../src/app/AppNavigation.jsx", import.meta.url), "utf8");
const mobileRoleHeaderSource = readFileSync(new URL("../src/app/MobileRoleShellHeader.jsx", import.meta.url), "utf8");
assert.match(appSource, /<AppNavigation/);
assert.match(appSource, /<MobileRoleShellHeader/);
assert.match(appSource, /getDefaultNavigationPage\(permissionContext\)/);
assert.match(appSource, /roleFocusedShellPage = dedicatedMobileRolePage \|\| renderedPage === roleBoundaryPage\.key/);
assert.match(navigationComponentSource, /更多工作台/);
assert.match(navigationComponentSource, /aria-label="主导航"/);
assert.match(navigationComponentSource, /aria-current=/);
assert.match(navigationComponentSource, /aria-expanded=/);
assert.match(navigationComponentSource, /disabled key=\{item\.label\}/);
assert.match(mobileRoleHeaderSource, /成品库房任务/);
assert.match(mobileRoleHeaderSource, /办公室手机/);
assert.match(mobileRoleHeaderSource, /经营决策/);
assert.match(mobileRoleHeaderSource, /设备机修/);
assert.match(mobileRoleHeaderSource, /电脑端岗位/);

console.log("App navigation check passed: desktop pages, role surfaces, defaults, and future placeholders follow the terminal boundary.");

function visibleKeys(roleKey) {
  return getVisibleSecondaryNavigationItems(contextFor(roleKey)).map((item) => item.key);
}

function visiblePrimaryKeys(roleKey) {
  return getVisiblePrimaryNavigationItems(contextFor(roleKey)).map((item) => item.key);
}

function visibleRoleKeys(roleKey) {
  return getVisibleRoleNavigationItems(contextFor(roleKey)).map((item) => item.key);
}

function visibleGroupKeys(roleKey) {
  return getVisibleNavigationGroups(contextFor(roleKey)).map((group) => group.key);
}

function contextFor(roleKey) {
  return {
    ...getRolePermissionSet([roleKey]),
    user: { defaultRole: roleKey },
  };
}
