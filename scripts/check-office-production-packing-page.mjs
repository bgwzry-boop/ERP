import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("../src/features/production/ProductionPackingPage.jsx", import.meta.url), "utf8");
const presentationSource = readFileSync(new URL("../src/features/production/productionPackingPresentation.js", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");

assert.match(pageSource, /export function ProductionPackingPage/);
for (const contract of ["生产任务", "打包任务", "机台排产队列", "机器计数/动作次数", "成品图", "打印设备验收", "V1 打印上线门禁", "打印作业池"]) {
  assert.equal(pageSource.includes(contract), true, `production/packing page should retain ${contract}`);
}
assert.match(pageSource, /PrinterDeviceQaPanel/);
assert.match(pageSource, /PrintDriverV1ReadinessPanel/);
assert.match(pageSource, /PrintDriverDiagnosticsPanel/);
assert.match(pageSource, /const PRODUCTION_WORKBENCH_TABS/);
assert.match(pageSource, /activeWorkbenchTab === "print" \? null/);
assert.match(pageSource, /activeWorkbenchTab === "print" \? \(/);
assert.match(pageSource, /aria-controls="production-workbench-panel"/);
assert.match(pageSource, /role="tabpanel"/);
assert.doesNotMatch(pageSource, /setActiveDetail/);

for (const helper of ["isProductionReportCandidate", "buildPackingTaskRows", "getProductionFinishedGoodsPhoto", "getProductionPackingTaskListStatusText"]) {
  assert.equal(presentationSource.includes(`export function ${helper}`), true, `production presentation should export ${helper}`);
}
assert.match(presentationSource, /machineCount.*动作次数，不入库/s);
assert.match(officePageSource, /export \{ ProductionPackingPage \} from "\.\.\/\.\.\/features\/production\/ProductionPackingPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function ProductionPackingPage/);
assert.doesNotMatch(officePageSource, /function PrinterDeviceQaPanel/);

console.log("Office production/packing page check passed: page ownership, independent print workspace, tab semantics, and machine-count safety labels remain intact.");
