import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("../src/features/production/ProductionPackingPage.jsx", import.meta.url), "utf8");
const printDevicePanelSource = readFileSync(new URL("../src/features/production/ProductionPrintDevicePanels.jsx", import.meta.url), "utf8");
const printReadinessPanelSource = readFileSync(new URL("../src/features/production/ProductionPrintReadinessPanel.jsx", import.meta.url), "utf8");
const printDiagnosticsPanelSource = readFileSync(new URL("../src/features/production/ProductionPrintDiagnosticsPanel.jsx", import.meta.url), "utf8");
const featureSource = `${pageSource}\n${printDevicePanelSource}\n${printReadinessPanelSource}\n${printDiagnosticsPanelSource}`;
const presentationSource = readFileSync(new URL("../src/features/production/productionPackingPresentation.js", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const driverStyleSource = readFileSync(new URL("../src/styles/features/driver.css", import.meta.url), "utf8");
const productionPrintStyleSource = readFileSync(new URL("../src/styles/features/production-print.css", import.meta.url), "utf8");

assert.match(pageSource, /export function ProductionPackingPage/);
for (const contract of ["生产任务", "打包任务", "机台排产队列", "机器计数/动作次数", "成品图", "打印设备验收", "V1 打印上线门禁", "打印作业池"]) {
  assert.equal(featureSource.includes(contract), true, `production/packing feature should retain ${contract}`);
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
assert.match(pageSource, /from "\.\/ProductionPrintDevicePanels\.jsx"/);
assert.match(printDevicePanelSource, /export function PrinterDeviceQaPanel/);
assert.match(printDevicePanelSource, /export function PrintJobQueuePanel/);
assert.doesNotMatch(pageSource, /function PrinterDeviceQaPanel/);
assert.doesNotMatch(pageSource, /function PrintJobQueuePanel/);
assert.match(pageSource, /from "\.\/ProductionPrintReadinessPanel\.jsx"/);
assert.match(printReadinessPanelSource, /export function PrintDriverV1ReadinessPanel/);
assert.match(printReadinessPanelSource, /门禁检查不触发实体打印/);
assert.match(printReadinessPanelSource, /真实出纸、纸张对位和扫码仍按现场 QA 记录保留/);
assert.doesNotMatch(pageSource, /function PrintDriverV1ReadinessPanel/);
assert.match(pageSource, /from "\.\/ProductionPrintDiagnosticsPanel\.jsx"/);
assert.match(printDiagnosticsPanelSource, /export function PrintDriverDiagnosticsPanel/);
assert.match(printDiagnosticsPanelSource, /不读取 payload、不生成打印文件、不提交实体打印、不暴露命令或输出内容/);
assert.match(printDiagnosticsPanelSource, /提交成功不等于纸张已打出/);
assert.doesNotMatch(pageSource, /function PrintDriverDiagnosticsPanel/);
assert.match(mainSource, /import "\.\/styles\/features\/production-print\.css";/);
assert.match(mainSource, /import "\.\/styles\/features\/driver\.css";/);
assert.equal(
  mainSource.indexOf('import "./styles/features/role-tools.css";') < mainSource.indexOf('import "./styles/features/driver.css";') &&
    mainSource.indexOf('import "./styles/features/driver.css";') < mainSource.indexOf('import "./styles/features/production-print.css";'),
  true,
  "production/print styles should load after shared role-tool and driver field-test base styles",
);
assert.match(printDevicePanelSource, /driver-field-test-form printer-device-qa-form/);
assert.match(driverStyleSource, /\.driver-field-test-row/);
for (const selector of [".production-schedule-queue-table", ".printer-device-qa-section", ".print-driver-diagnostics-section", ".print-job-queue-section", ".queue-move-controls"]) {
  assert.equal(productionPrintStyleSource.includes(selector), true, `production/print feature styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}

for (const helper of ["isProductionReportCandidate", "buildPackingTaskRows", "getProductionFinishedGoodsPhoto", "getProductionPackingTaskListStatusText"]) {
  assert.equal(presentationSource.includes(`export function ${helper}`), true, `production presentation should export ${helper}`);
}
assert.match(presentationSource, /machineCount.*动作次数，不入库/s);
assert.match(officePageSource, /export \{ ProductionPackingPage \} from "\.\.\/\.\.\/features\/production\/ProductionPackingPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function ProductionPackingPage/);
assert.doesNotMatch(officePageSource, /function PrinterDeviceQaPanel/);

console.log("Office production/packing page check passed: page ownership, independent print workspace, tab semantics, and machine-count safety labels remain intact.");
