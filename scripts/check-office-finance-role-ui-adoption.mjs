import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const statementSource = read("src/features/statements/StatementPage.jsx");
const productionSource = read("src/features/production/ProductionPackingPage.jsx");
const productionPresentationSource = read("src/features/production/productionPackingPresentation.js");
const rawMaterialSource = read("src/features/raw-materials/RawMaterialInboundPage.jsx");
const rawMaterialWorkbenchSource = read("src/features/raw-materials/RawMaterialInboundWorkbench.jsx");
const masterDataSource = read("src/features/master-data/MasterDataMaintenancePage.jsx");
const masterDataWorkbenchSource = read("src/features/master-data/MasterDataMaintenanceWorkbench.jsx");
const workshopSource = read("src/features/workshop/WorkshopMobilePage.jsx");
const driverPageSource = read("src/features/driver/DriverMobilePage.jsx");
const driverSource = [
  driverPageSource,
  read("src/features/driver/DriverTaskList.jsx"),
  read("src/features/driver/DriverRouteStage.jsx"),
  read("src/features/driver/DriverLoadStage.jsx"),
  read("src/features/driver/DriverDeviceStage.jsx"),
  read("src/features/driver/DriverDeliveryStage.jsx"),
].join("\n");
const appSource = read("src/App.jsx");
const mainSource = read("src/main.jsx");
const componentStyles = read("src/styles/components.css");
const statementStyles = read("src/styles/features/statements.css");
const roleStyles = read("src/styles/features/role-tools.css");
const rawMaterialStyles = read("src/styles/features/raw-material.css");
const masterDataStyles = read("src/styles/features/master-data.css");
const sharedStyles = read("src/styles/shared.css");

assert.match(sharedUiSource, /const hasInteractiveCells = row\.interactive === true/);
assert.match(sharedUiSource, /const RowElement = row\.onClick && !hasInteractiveCells \? "button" : "div"/);
assert.match(sharedUiSource, /role=\{hasInteractiveCells && row\.onClick \? "button" : undefined\}/);
assert.match(sharedUiSource, /tabIndex=\{hasInteractiveCells && row\.onClick \? 0 : undefined\}/);

for (const [source, workbenchClass] of [
  [statementSource, "statement-workbench"],
  [productionSource, "production-packing-workbench"],
  [`${rawMaterialSource}\n${rawMaterialWorkbenchSource}`, "raw-material-workbench"],
  [`${masterDataSource}\n${masterDataWorkbenchSource}`, "master-data-workbench"],
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
assert.match(statementSource, /STATEMENT_ACTIONS_BY_TAB/);
assert.match(statementSource, /operational-statement-layout/);
assert.match(statementSource, /statement-detail-scroll/);
assert.match(statementSource, /statement-facts/);
assert.match(statementSource, /对账快捷范围/);
assert.match(statementSource, /columns=\{\["明细\/产品", "规格", "交付", "计费数", "应收", "备注"\]\}/);

assert.match(productionSource, /机器计数只做凭证/);
assert.match(productionSource, /打包完成不扣库存/);
assert.match(productionSource, /生产与打包状态摘要/);
assert.match(productionSource, /PACKING_TASK_FILTERS/);
assert.match(productionPresentationSource, /PRINT_WORKSPACE_TABS/);
assert.match(productionSource, /production-detail-scroll/);
assert.match(productionSource, /buildPrintWorkspaceItems/);

assert.match(rawMaterialSource, /\?\? visibleRecords\[0\] \?\? null/);
assert.match(rawMaterialSource, /OCR 仅预填/);
assert.match(rawMaterialSource, /RawMaterialInboundListPane/);
assert.match(rawMaterialSource, /RAW_MATERIAL_DETAIL_TABS/);
assert.match(rawMaterialSource, /operational-split-workbench/);
assert.match(rawMaterialSource, /打印标签只是待贴标/);
assert.match(rawMaterialWorkbenchSource, /原材料状态摘要/);
assert.match(rawMaterialWorkbenchSource, /columns=\{\["供应商 \/ 单号", "原料 \/ 规格", "卷 \/ 重量", "状态", "下一步"\]\}/);
assert.match(rawMaterialWorkbenchSource, /selectRawMaterialInboundMetrics/);
assert.match(masterDataSource, /MASTER_DATA_DETAIL_TABS/);
assert.match(masterDataSource, /operational-split-workbench/);
assert.match(masterDataSource, /ariaLabel="基础资料详情视图"/);
assert.match(masterDataSource, /master-data-detail-scroll/);
assert.match(masterDataWorkbenchSource, /基础资料工作台/);
assert.match(masterDataWorkbenchSource, /selected\.sourceType === "seed" \? "演示账号只读"/);
assert.match(masterDataSource, /演示账号不可调配/);
assert.match(masterDataWorkbenchSource, /role\.blockers \?\? \[\]/);
assert.match(masterDataStyles, /\.master-data-detail-scroll\s*\{[^}]*overflow:\s*auto/s);
assert.doesNotMatch(masterDataSource, /records\.find\(\(item\) => item\.id === selectedId\)/);

assert.match(workshopSource, /机器计数\/动作次数/);
assert.match(workshopSource, /报当日数量只记录跨日继续和剩余数量，不入库/);
assert.match(workshopSource, /ariaLabel="车间任务详情"/);
assert.match(workshopSource, /mobile-role-stage-actions/);
assert.match(driverPageSource, /visibleTasks\[0\] \?\?\s*null/);
assert.doesNotMatch(driverPageSource, /tasks\.find\(\(item\) => item\.fulfillmentId === selectedTaskId\)/);
assert.match(driverPageSource, /司机任务状态/);
assert.match(driverPageSource, /ariaLabel="司机任务详情"/);
assert.match(driverSource, /driver-load-stage/);
assert.match(driverSource, /driver-delivery-stage/);

assert.doesNotMatch(mainSource, /styles\/features\/(statements|role-tools)\.css/, "financial and role-tool styles should not load with the shell");
assert.match(appSource, /import\("\.\/styles\/features\/statements\.css"\)/, "statement styles should load with the statement route");
assert.match(appSource, /import\("\.\/styles\/features\/role-tools\.css"\)/, "role-tool styles should load with their mobile routes");
assert.match(statementStyles, /statement-table \.data-row span:nth-child\(6\)/);
assert.match(statementStyles, /\.statement-actions\s*\{[\s\S]*?position: static;/);
assert.match(statementStyles, /\.statement-facts/);
assert.match(statementStyles, /\.statement-detail-scroll/);
for (const selector of [".customer-row", ".statement-summary", ".statement-actions", ".statement-quick-filters", ".export-history-row"]) {
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
