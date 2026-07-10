import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const permissionSource = readFileSync(new URL("../src/auth/seedPermissions.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assertIncludes(appSource, '{ key: "masterData", label: "基础资料"', "navigation should expose the master-data maintenance page");
assertIncludes(appSource, "<MasterDataMaintenancePage", "App should render the master-data maintenance page");
assertIncludes(appSource, "saveMasterDataMaintenanceDraft", "App should keep maintenance drafts in page state");
assertIncludes(appSource, "正式写入仍需走导入确认", "maintenance drafts must not imply direct database writes");

assertIncludes(officePageSource, "export function MasterDataMaintenancePage", "office pages should export MasterDataMaintenancePage");
assertIncludes(officePageSource, "客户档案", "master-data page should include customer maintenance");
assertIncludes(officePageSource, "价格表", "master-data page should include price maintenance");
assertIncludes(officePageSource, "规格库存", "master-data page should include inventory specification maintenance");
assertIncludes(officePageSource, "员工机台", "master-data page should include employee/machine maintenance");
assertIncludes(officePageSource, "维护草稿不直接写库", "page should clearly state maintenance drafts are non-writing");
assertIncludes(officePageSource, "保存维护草稿", "page should expose draft-save action");
assertIncludes(officePageSource, "打开导入模板", "page should link back to the import-template flow");

assertIncludes(permissionSource, "生成维护草稿", "permissions should guard maintenance draft creation");
assertIncludes(permissionSource, "master_data.import.plan.create", "maintenance draft action should reuse the review-plan permission");

assertIncludes(styleSource, ".master-data-maintenance-page", "styles should cover the maintenance page");
assertIncludes(styleSource, ".master-data-maintenance-table", "styles should cover the maintenance table");

console.log("master-data maintenance page check passed");

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}
