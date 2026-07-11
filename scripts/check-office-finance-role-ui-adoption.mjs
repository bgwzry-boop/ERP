import assert from "node:assert/strict";
import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const sharedUiSource = read("src/shared/ui/operational.jsx");
const statementSource = read("src/features/statements/StatementPage.jsx");
const productionSource = read("src/features/production/ProductionPackingPage.jsx");
const rawMaterialSource = read("src/features/raw-materials/RawMaterialInboundPage.jsx");
const workshopSource = read("src/features/workshop/WorkshopMobilePage.jsx");
const driverSource = read("src/features/driver/DriverMobilePage.jsx");
const mainSource = read("src/main.jsx");
const statementStyles = read("src/styles/features/statements.css");
const roleStyles = read("src/styles/features/role-tools.css");

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

assert.match(productionSource, /机器计数只做凭证/);
assert.match(productionSource, /打包完成不扣库存/);
assert.match(productionSource, /生产与打包状态摘要/);

assert.match(rawMaterialSource, /\?\? visibleRecords\[0\] \?\? null/);
assert.match(rawMaterialSource, /OCR 仅预填/);
assert.match(rawMaterialSource, /打印标签只是待贴标/);
assert.match(rawMaterialSource, /原材料状态摘要/);

assert.match(workshopSource, /机器计数\/动作次数/);
assert.match(workshopSource, /报当日数量只记录跨日继续和剩余数量，不入库/);
assert.match(driverSource, /visibleTasks\[0\] \?\?\s*null/);
assert.doesNotMatch(driverSource, /tasks\.find\(\(item\) => item\.fulfillmentId === selectedTaskId\)/);
assert.match(driverSource, /司机任务状态/);

assert.match(mainSource, /\.\/styles\/features\/statements\.css/);
assert.match(mainSource, /\.\/styles\/features\/role-tools\.css/);
assert.match(statementStyles, /statement-table \.data-row span:nth-child\(7\)/);
assert.match(roleStyles, /production-schedule-queue-table/);
assert.match(roleStyles, /raw-material-inbound-table/);

console.log("Office finance/role UI adoption checks passed: financial trust amounts, production counters, raw-material gates, and driver view isolation remain explicit.");
