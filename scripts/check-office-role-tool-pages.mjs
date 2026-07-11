import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rawMaterialPageSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundPage.jsx", import.meta.url), "utf8");
const masterDataPageSource = readFileSync(new URL("../src/features/master-data/MasterDataMaintenancePage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(rawMaterialPageSource, /export function RawMaterialInboundPage/);
for (const contract of ["复核送货单", "打印卷标", "确认贴标入库", "机边领料", "余料退回", "供应商对账"]) {
  assert.equal(rawMaterialPageSource.includes(contract), true, `raw-material page should retain ${contract}`);
}
assert.match(rawMaterialPageSource, /precheckRawMaterialSupplierStatementWorkbook/);
assert.match(rawMaterialPageSource, /canIssueRawMaterialRoll/);
assert.match(rawMaterialPageSource, /canReviewRawMaterialLeftoverRoll/);
assert.match(stylesSource, /\.raw-material-roll-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);

assert.match(masterDataPageSource, /export function MasterDataMaintenancePage/);
for (const contract of ["客户档案", "价格表", "规格库存", "员工机台", "维护草稿不直接写库", "导入模板"]) {
  assert.equal(masterDataPageSource.includes(contract), true, `master-data page should retain ${contract}`);
}
assert.match(masterDataPageSource, /getEmployeePasswordStatusLabel/);
assert.match(masterDataPageSource, /生成维护草稿/);

assert.match(officePageSource, /export \{ RawMaterialInboundPage \} from "\.\.\/\.\.\/features\/raw-materials\/RawMaterialInboundPage\.jsx";/);
assert.match(officePageSource, /export \{ MasterDataMaintenancePage \} from "\.\.\/\.\.\/features\/master-data\/MasterDataMaintenancePage\.jsx";/);
assert.doesNotMatch(officePageSource, /function RawMaterialInboundPage/);
assert.doesNotMatch(officePageSource, /function MasterDataMaintenancePage/);
assert.doesNotMatch(officePageSource, /function buildRawMaterialIssueOptions/);
assert.doesNotMatch(officePageSource, /function buildMasterDataMaintenanceRecords/);

console.log("Office role-tool pages check passed: raw-material and master-data features are isolated with workflow safeguards intact.");
