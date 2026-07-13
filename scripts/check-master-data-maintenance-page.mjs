import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../src/app/createOfficeMasterDataActions.js", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/app/navigation.js", import.meta.url), "utf8");
const featureSource = readFileSync(new URL("../src/features/master-data/MasterDataMaintenancePage.jsx", import.meta.url), "utf8");
const permissionSource = readFileSync(new URL("../src/auth/seedPermissions.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles/features/role-tools.css", import.meta.url), "utf8");
const masterDataStyleSource = readFileSync(new URL("../src/styles/features/master-data.css", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

assertIncludes(navigationSource, 'key: "masterData"', "navigation should expose the master-data maintenance page");
assertIncludes(navigationSource, 'label: "基础资料"', "navigation should label the master-data maintenance page");
assertIncludes(appSource, "<MasterDataMaintenancePage", "App should render the master-data maintenance page");
assertIncludes(appSource, "saveMasterDataMaintenanceDraft", "App should wire the maintenance draft controller action");
assertIncludes(appSource, "updateMasterDataEmployeeAssignment", "App should wire the employee assignment action");
assertIncludes(controllerSource, "function saveMasterDataMaintenanceDraft", "master-data controller should own maintenance drafts");
assertIncludes(controllerSource, "正式写入仍需走导入确认", "maintenance drafts must not imply direct database writes");

assertIncludes(officePageSource, "MasterDataMaintenancePage", "office pages should export MasterDataMaintenancePage");
assertIncludes(featureSource, "export function MasterDataMaintenancePage", "master-data feature should own the page");
assertIncludes(featureSource, "客户档案", "master-data page should include customer maintenance");
assertIncludes(featureSource, "价格表", "master-data page should include price maintenance");
assertIncludes(featureSource, "规格库存", "master-data page should include inventory specification maintenance");
assertIncludes(featureSource, "员工机台", "master-data page should include employee/machine maintenance");
assertIncludes(featureSource, "车间 / 机台调配", "employee maintenance should expose manual assignment controls");
assertIncludes(featureSource, "杂工 / 流动", "employee maintenance should support workshop-only general workers");
assertIncludes(featureSource, "暂未分配", "employee maintenance should support clearing an assignment explicitly");
assertIncludes(featureSource, "保存调配", "employee maintenance should expose a direct assignment save action");
assertIncludes(featureSource, "正式员工岗位上线就绪", "employee maintenance should expose authoritative eight-role readiness");
assertIncludes(featureSource, "尚未导入正式账号", "missing formal roles should remain explicit");
assertIncludes(featureSource, "员工账号来源", "employee maintenance should separate formal and seed views");
assertIncludes(featureSource, "seed演示", "seed accounts should be isolated behind an explicit view");
assertIncludes(featureSource, "尚未导入正式员工账号", "formal employee view should have an explicit empty state");
assertIncludes(featureSource, "维护草稿不直接写库", "page should clearly state maintenance drafts are non-writing");
assertIncludes(featureSource, "保存维护草稿", "page should expose draft-save action");
assertIncludes(featureSource, "打开导入模板", "page should link back to the import-template flow");

assertIncludes(permissionSource, "生成维护草稿", "permissions should guard maintenance draft creation");
assertIncludes(permissionSource, "保存员工调配", "permissions should guard employee assignment writes");
assertIncludes(permissionSource, "master_data.import.plan.create", "maintenance draft action should reuse the review-plan permission");

assertIncludes(styleSource, ".master-data-maintenance-table", "styles should cover the maintenance table");
assertIncludes(styleSource, ".master-data-role-readiness", "styles should cover the employee role readiness matrix");
assertIncludes(mainSource, 'import "./styles/features/master-data.css";', "main should import master-data overlay styles");
assert.equal(
  mainSource.indexOf('import "./styles/features/role-tools.css";') < mainSource.indexOf('import "./styles/features/master-data.css";'),
  true,
  "master-data overlays should load after the role-tool workbench layer",
);
for (const selector of [
  ".master-data-template-modal",
  ".master-data-precheck-panel",
  ".master-data-review-panel",
  ".master-data-confirmation-panel",
  ".master-data-execution-panel",
  ".master-data-employee-review-panel",
  ".master-data-employee-credential",
]) {
  assertIncludes(masterDataStyleSource, selector, `master-data styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.match(masterDataStyleSource, /\.master-data-template-modal\s*\{[^}]*overflow-y:\s*auto;/s);
assert.match(masterDataStyleSource, /\.master-data-template-fields\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*visible;/s);
assert.match(masterDataStyleSource, /\.master-data-template-field-row small\s*\{[^}]*overflow:\s*visible;[^}]*white-space:\s*normal;/s);
assert.match(masterDataStyleSource, /\.master-data-template-modal > \.modal-actions\s*\{[^}]*position:\s*sticky;/s);

console.log("master-data maintenance page check passed");

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}
