import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const statementSource = read("src/features/statements/StatementPage.jsx");
const productionSource = read("src/features/production/ProductionPackingPage.jsx");
const rawMaterialSource = read("src/features/raw-materials/RawMaterialInboundPage.jsx");
const masterDataSource = read("src/features/master-data/MasterDataMaintenancePage.jsx");
const workshopSource = read("src/features/workshop/WorkshopMobilePage.jsx");
const driverSource = read("src/features/driver/DriverMobilePage.jsx");
const mainSource = read("src/main.jsx");
const componentStyles = read("src/styles/components.css");
const statementStyles = read("src/styles/features/statements.css");
const roleStyles = read("src/styles/features/role-tools.css");
const rawMaterialStyles = read("src/styles/features/raw-material.css");
const sharedStyles = read("src/styles/shared.css");

assert.match(sharedUiSource, /const RowElement = row\.onClick \? "button" : "div"/);

for (const [source, workbenchClass] of [
  [statementSource, "statement-workbench"],
  [productionSource, "production-packing-workbench"],
  [rawMaterialSource, "raw-material-workbench"],
  [workshopSource, "workshop-mobile-workbench"],
  [driverSource, "driver-mobile-workbench"],
]) {
  assert.match(source, /<OperationalPanel/);
  assert.match(source, /<DataState/);
  assert.match(source, new RegExp(workbenchClass));
  assert.match(source, /from "\.\.\/\.\.\/shared\/ui\/operational\.jsx"/);
}

for (const label of ["本期应收", "本期实收", "本期未收", "历史欠款", "累计欠款"]) {
  assert.match(statementSource, new RegExp(label));
}
assert.match(statementSource, /\?\? filtered\[0\] \?\? null/);
assert.match(statementSource, /客户对账筛选/);
assert.match(statementSource, /STATEMENT_DETAIL_TABS/);
assert.match(statementSource, /operational-statement-layout/);
assert.match(statementSource, /columns=\{\["明细\/产品", "规格", "交付", "计费数", "应收", "备注"\]\}/);

assert.match(productionSource, /机器计数只做凭证/);
assert.match(productionSource, /打包完成不扣库存/);
assert.match(productionSource, /生产与打包状态摘要/);

assert.match(rawMaterialSource, /\?\? visibleRecords\[0\] \?\? null/);
assert.match(rawMaterialSource, /OCR 仅预填/);
assert.match(rawMaterialSource, /打印标签只是待贴标/);
assert.match(rawMaterialSource, /原材料状态摘要/);
assert.match(rawMaterialSource, /RAW_MATERIAL_DETAIL_TABS/);
assert.match(rawMaterialSource, /operational-split-workbench/);
assert.match(rawMaterialSource, /columns=\{\["供应商\/单号", "原料\/规格", "卷\/重量", "状态", "下一步"\]\}/);
assert.match(rawMaterialSource, /selectRawMaterialInboundMetrics/);
assert.match(masterDataSource, /MASTER_DATA_DETAIL_TABS/);
assert.match(masterDataSource, /operational-split-workbench/);
assert.match(masterDataSource, /ariaLabel="基础资料详情视图"/);
assert.doesNotMatch(masterDataSource, /records\.find\(\(item\) => item\.id === selectedId\)/);

assert.match(workshopSource, /机器计数\/动作次数/);
assert.match(workshopSource, /报当日数量只记录跨日继续和剩余数量，不入库/);
assert.match(workshopSource, /ariaLabel="车间任务详情"/);
assert.match(workshopSource, /mobile-role-stage-actions/);
assert.match(driverSource, /visibleTasks\[0\] \?\?\s*null/);
assert.doesNotMatch(driverSource, /tasks\.find\(\(item\) => item\.fulfillmentId === selectedTaskId\)/);
assert.match(driverSource, /司机任务状态/);
assert.match(driverSource, /ariaLabel="司机任务详情"/);
assert.match(driverSource, /driver-load-stage/);
assert.match(driverSource, /driver-delivery-stage/);

assert.match(mainSource, /\.\/styles\/features\/statements\.css/);
assert.match(mainSource, /\.\/styles\/features\/role-tools\.css/);
assert.match(statementStyles, /statement-table \.data-row span:nth-child\(6\)/);
for (const selector of [".customer-row", ".statement-summary", ".statement-actions", ".export-history-row"]) {
  assert.equal(statementStyles.includes(selector), true, `statement feature styles should own ${selector}`);
  assert.equal(sharedStyles.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.doesNotMatch(statementStyles, /\.page-grid\.statement-layout|\.customer-list|\.statement-main/);
assert.doesNotMatch(sharedStyles, /\.page-grid\.statement-layout/);
assert.doesNotMatch(sharedStyles, /\.statement-filter-panel|\.statement-filter-summary/);
assert.match(componentStyles, /\.page-grid\.operational-statement-layout/);
assert.match(roleStyles, /production-schedule-queue-table/);
assert.match(roleStyles, /raw-material-inbound-table/);
assert.match(rawMaterialStyles, /supplier-statement-review-list/);
assert.doesNotMatch(sharedStyles, /\.raw-material-roll-row|\.supplier-statement-preview/);
assert.match(roleStyles, /master-data-maintenance-table/);
assert.match(roleStyles, /mobile-role-detail-tabs/);
assert.match(roleStyles, /driver-stage-action-bar/);

console.log("Office finance/role UI adoption checks passed: financial trust amounts, production counters, raw-material gates, and driver view isolation remain explicit.");
