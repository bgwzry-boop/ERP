import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rawMaterialPageSource = [
  readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundReceivingSections.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundSupportingSections.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/RawMaterialSupplierStatementReview.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/features/raw-materials/rawMaterialInboundWorkflow.js", import.meta.url), "utf8"),
].join("\n");
const rawMaterialWorkbenchSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundWorkbench.jsx", import.meta.url), "utf8");
const masterDataPageSource = readFileSync(new URL("../src/features/master-data/MasterDataMaintenancePage.jsx", import.meta.url), "utf8");
const masterDataWorkbenchSource = readFileSync(new URL("../src/features/master-data/MasterDataMaintenanceWorkbench.jsx", import.meta.url), "utf8");
const masterDataListStateSource = readFileSync(new URL("../src/domain/masterDataMaintenanceListState.js", import.meta.url), "utf8");
const masterDataRecordSource = readFileSync(new URL("../src/domain/masterDataMaintenanceRecords.js", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const rawMaterialStylesSource = [
  readFileSync(new URL("../src/styles/features/raw-material.css", import.meta.url), "utf8"),
  readFileSync(new URL("../src/styles/features/raw-material-color-mapping.css", import.meta.url), "utf8"),
].join("\n");
const masterDataStylesSource = readFileSync(new URL("../src/styles/features/master-data.css", import.meta.url), "utf8");

assert.match(rawMaterialPageSource, /export function RawMaterialInboundPage/);
for (const contract of ["复核送货单", "打印卷标", "确认贴标入库", "机边领料", "余料退回", "供应商对账"]) {
  assert.equal(rawMaterialPageSource.includes(contract), true, `raw-material page should retain ${contract}`);
}
assert.match(rawMaterialPageSource, /precheckRawMaterialSupplierStatementWorkbook/);
assert.match(rawMaterialPageSource, /canIssueRawMaterialRoll/);
assert.match(rawMaterialPageSource, /canReviewRawMaterialLeftoverRoll/);
assert.match(rawMaterialPageSource, /RAW_MATERIAL_DETAIL_TABS/);
assert.match(rawMaterialPageSource, /selectRawMaterialInboundMetrics/);
assert.match(rawMaterialPageSource, /raw-material-detail-scroll/);
assert.match(rawMaterialWorkbenchSource, /RAW_MATERIAL_INBOUND_TABS/);
assert.match(rawMaterialWorkbenchSource, /columns=\{\["供应商 \/ 单号", "原料 \/ 规格", "卷 \/ 重量", "状态", "下一步"\]\}/);
assert.match(rawMaterialWorkbenchSource, /buildRawMaterialInboundViewItems\(inbounds\)/);
assert.match(rawMaterialStylesSource, /\.raw-material-roll-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
assert.match(rawMaterialStylesSource, /\.raw-material-detail-scroll\s*\{[^}]*overflow:\s*auto/s);
assert.match(rawMaterialStylesSource, /\.raw-material-workbench\s*\{[^}]*minmax\(420px,\s*1fr\)/s);

assert.match(masterDataPageSource, /export function MasterDataMaintenancePage/);
for (const contract of ["客户档案", "价格表", "规格库存", "员工机台", "维护草稿不直接写库", "导入模板"]) {
  assert.equal(`${masterDataPageSource}\n${masterDataWorkbenchSource}\n${masterDataListStateSource}`.includes(contract), true, `master-data workbench should retain ${contract}`);
}
assert.match(masterDataRecordSource, /getEmployeePasswordStatusLabel/);
assert.match(masterDataPageSource, /buildMasterDataMaintenanceRecords/);
assert.match(masterDataPageSource, /生成维护草稿/);
assert.match(masterDataPageSource, /MASTER_DATA_DETAIL_TABS/);
assert.match(masterDataPageSource, /MasterDataMaintenanceListPane/);
assert.match(masterDataPageSource, /master-data-detail-scroll/);
assert.match(masterDataPageSource, /工作安排模式/);
assert.match(masterDataWorkbenchSource, /<OperationalPanel/);
assert.match(masterDataWorkbenchSource, /<FilterBar/);
assert.match(masterDataWorkbenchSource, /基础资料关键事实/);
assert.match(masterDataWorkbenchSource, /selected\.sourceType === "seed" \? "演示账号只读"/);
assert.match(masterDataListStateSource, /buildMasterDataMaintenanceViewItems/);
assert.match(masterDataStylesSource, /\.master-data-workbench\s*\{[^}]*minmax\(360px,\s*390px\)/s);
assert.match(masterDataPageSource, /\?\? visibleRecords\[0\] \?\? null/);

assert.match(officePageSource, /export \{ RawMaterialInboundPage \} from "\.\.\/\.\.\/features\/raw-materials\/RawMaterialInboundPage\.jsx";/);
assert.doesNotMatch(officePageSource, /export \{ MasterDataMaintenancePage \}/, "master-data must stay lazy-loaded outside the shared office page chunk");
assert.doesNotMatch(officePageSource, /function RawMaterialInboundPage/);
assert.doesNotMatch(officePageSource, /function MasterDataMaintenancePage/);
assert.doesNotMatch(officePageSource, /function buildRawMaterialIssueOptions/);
assert.doesNotMatch(officePageSource, /function buildMasterDataMaintenanceRecords/);

console.log("Office role-tool pages check passed: raw-material and master-data features are isolated with workflow safeguards intact.");
