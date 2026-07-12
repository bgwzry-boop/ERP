import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../src/app/createOfficeMasterDataActions.js", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/app/navigation.js", import.meta.url), "utf8");
const featureSource = readFileSync(new URL("../src/features/master-data/MasterDataMaintenancePage.jsx", import.meta.url), "utf8");
const permissionSource = readFileSync(new URL("../src/auth/seedPermissions.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles/features/role-tools.css", import.meta.url), "utf8");

assertIncludes(navigationSource, 'key: "masterData"', "navigation should expose the master-data maintenance page");
assertIncludes(navigationSource, 'label: "基础资料"', "navigation should label the master-data maintenance page");
assertIncludes(appSource, "<MasterDataMaintenancePage", "App should render the master-data maintenance page");
assertIncludes(appSource, "saveMasterDataMaintenanceDraft", "App should wire the maintenance draft controller action");
assertIncludes(controllerSource, "function saveMasterDataMaintenanceDraft", "master-data controller should own maintenance drafts");
assertIncludes(controllerSource, "正式写入仍需走导入确认", "maintenance drafts must not imply direct database writes");

assertIncludes(officePageSource, "MasterDataMaintenancePage", "office pages should export MasterDataMaintenancePage");
assertIncludes(featureSource, "export function MasterDataMaintenancePage", "master-data feature should own the page");
assertIncludes(featureSource, "客户档案", "master-data page should include customer maintenance");
assertIncludes(featureSource, "价格表", "master-data page should include price maintenance");
assertIncludes(featureSource, "规格库存", "master-data page should include inventory specification maintenance");
assertIncludes(featureSource, "员工机台", "master-data page should include employee/machine maintenance");
assertIncludes(featureSource, "维护草稿不直接写库", "page should clearly state maintenance drafts are non-writing");
assertIncludes(featureSource, "保存维护草稿", "page should expose draft-save action");
assertIncludes(featureSource, "打开导入模板", "page should link back to the import-template flow");

assertIncludes(permissionSource, "生成维护草稿", "permissions should guard maintenance draft creation");
assertIncludes(permissionSource, "master_data.import.plan.create", "maintenance draft action should reuse the review-plan permission");

assertIncludes(styleSource, ".master-data-maintenance-table", "styles should cover the maintenance table");

console.log("master-data maintenance page check passed");

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}
