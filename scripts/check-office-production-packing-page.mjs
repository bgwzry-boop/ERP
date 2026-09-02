import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPrintWorkspaceItems } from "../src/features/production/productionPackingPresentation.js";

const pageSource = readFileSync(new URL("../src/features/production/ProductionPackingPage.jsx", import.meta.url), "utf8");
const taskPaneSource = readFileSync(new URL("../src/features/production/ProductionPackingTaskPane.jsx", import.meta.url), "utf8");
const detailPaneSource = readFileSync(new URL("../src/features/production/ProductionPackingDetailPane.jsx", import.meta.url), "utf8");
const detailSectionsSource = readFileSync(new URL("../src/features/production/ProductionPackingDetailSections.jsx", import.meta.url), "utf8");
const taskListSource = readFileSync(new URL("../src/features/production/ProductionPackingTaskLists.jsx", import.meta.url), "utf8");
const scheduleConfirmationSource = readFileSync(new URL("../src/features/production/ProductionScheduleActionConfirmationDialog.jsx", import.meta.url), "utf8");
const scheduleQueueSource = readFileSync(new URL("../src/features/production/ProductionScheduleQueueSection.jsx", import.meta.url), "utf8");
const printWorkspaceSource = readFileSync(new URL("../src/features/production/ProductionPrintWorkspaceDetail.jsx", import.meta.url), "utf8");
const exceptionPanelSource = readFileSync(new URL("../src/features/production/ProductionExceptionPanel.jsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/features/production/ProductionPackingNavigation.jsx", import.meta.url), "utf8");
const printDevicePanelSource = readFileSync(new URL("../src/features/production/ProductionPrintDevicePanels.jsx", import.meta.url), "utf8");
const printReadinessPanelSource = readFileSync(new URL("../src/features/production/ProductionPrintReadinessPanel.jsx", import.meta.url), "utf8");
const printDiagnosticsPanelSource = readFileSync(new URL("../src/features/production/ProductionPrintDiagnosticsPanel.jsx", import.meta.url), "utf8");
const featureSource = `${pageSource}\n${taskPaneSource}\n${detailPaneSource}\n${detailSectionsSource}\n${taskListSource}\n${scheduleConfirmationSource}\n${scheduleQueueSource}\n${printWorkspaceSource}\n${exceptionPanelSource}\n${printDevicePanelSource}\n${printReadinessPanelSource}\n${printDiagnosticsPanelSource}`;
const exceptionFeatureSource = `${pageSource}\n${detailPaneSource}\n${exceptionPanelSource}`;
const presentationSource = readFileSync(new URL("../src/features/production/productionPackingPresentation.js", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const driverStyleSource = readFileSync(new URL("../src/styles/features/driver.css", import.meta.url), "utf8");
const roleToolStyleSource = readFileSync(new URL("../src/styles/features/role-tools.css", import.meta.url), "utf8");
const productionPrintStyleSource = readFileSync(new URL("../src/styles/features/production-print.css", import.meta.url), "utf8");

assert.match(pageSource, /export function ProductionPackingPage/);
for (const contract of ["生产任务", "打包任务", "机台排产队列", "机器计数/动作次数", "成品图", "打印设备验收", "V1 打印上线门禁", "打印作业池"]) {
  assert.equal(featureSource.includes(contract), true, `production/packing feature should retain ${contract}`);
}
assert.match(detailPaneSource, /ProductionPrintWorkspaceDetail/);
assert.match(printWorkspaceSource, /PrinterDeviceQaPanel/);
assert.match(printWorkspaceSource, /PrintDriverV1ReadinessPanel/);
assert.match(printWorkspaceSource, /PrintDriverDiagnosticsPanel/);
assert.match(pageSource, /const PRODUCTION_WORKBENCH_TABS/);
assert.match(taskPaneSource, /const PACKING_TASK_FILTERS/);
assert.match(presentationSource, /export const PRINT_WORKSPACE_TABS/);
assert.match(presentationSource, /export function buildPrintWorkspaceItems/);
assert.match(navigationSource, /export function PackingTaskFilterTabs/);
assert.match(navigationSource, /export function PrintWorkspaceNavigation/);
assert.match(taskListSource, /from "\.\/ProductionPackingNavigation\.jsx"/);
assert.match(pageSource, /from "\.\/ProductionPackingTaskPane\.jsx"/);
assert.match(taskPaneSource, /from "\.\/ProductionPackingTaskLists\.jsx"/);
assert.match(pageSource, /from "\.\/ProductionPackingDetailPane\.jsx"/);
assert.match(detailPaneSource, /from "\.\/ProductionPackingDetailSections\.jsx"/);
assert.match(pageSource, /ProductionPackingTaskPane/);
assert.match(pageSource, /ProductionPackingDetailPane/);
assert.match(taskPaneSource, /ProductionPackingTaskCards/);
assert.match(taskPaneSource, /ProductionPackingTaskTables/);
assert.match(taskPaneSource, /ProductionScheduleQueueSection/);
assert.match(detailPaneSource, /ProductionTaskReportInputs/);
assert.match(detailPaneSource, /ProductionFinishedGoodsPhotoSection/);
assert.match(detailPaneSource, /ProductionPackingDetailHeader/);
assert.match(detailPaneSource, /ProductionReportConfirmationPanel/);
assert.match(detailPaneSource, /ProductionScheduleDecisionSection/);
assert.match(detailPaneSource, /PackingCompletionSection/);
assert.ok(pageSource.split("\n").length <= 900, "production/packing main page should remain a compact composition layer");
assert.match(pageSource, /const detailMode = activeWorkbenchTab === "packing" \? "packing" : "production"/);
assert.match(detailPaneSource, /className="production-detail-scroll"/);
assert.match(pageSource, /buildPackingCompletionSummary/);
assert.match(detailSectionsSource, /确认提交打包完成/);
assert.match(pageSource, /packingCompletionConfirmed: true/);
assert.match(pageSource, /restorePackingCompletionTriggerFocusRef/);
assert.match(pageSource, /handlePackingCompletionConfirmationKeyDown/);
assert.match(detailSectionsSource, /aria-live="assertive"/);
assert.match(detailSectionsSource, /!confirmation \? \(/);
for (const label of ["确认排产经营决定", "原排产", "变更后", "业务决定人", "系统操作人", "决定渠道 / 时间", "决定证据内容", "授权依据", "预计影响"]) {
  assert.equal(scheduleConfirmationSource.includes(label), true, `schedule confirmation should retain ${label}`);
}
assert.match(scheduleConfirmationSource, /formatBusinessDecisionChannelAndTime/);
assert.match(pageSource, /ProductionScheduleActionConfirmationDialog/);
assert.match(pageSource, /buildProductionReportSummary/);
assert.match(detailSectionsSource, /确认完成生产报工/);
assert.match(pageSource, /productionReportConfirmed: true/);
assert.match(pageSource, /restoreProductionReportTriggerKindRef/);
assert.match(pageSource, /handleProductionReportConfirmationKeyDown/);
assert.match(detailPaneSource, /!productionReportConfirmation \? \(/);
assert.match(detailPaneSource, /ProductionExceptionPanel/);
assert.match(exceptionPanelSource, /export function ProductionExceptionPanel/);
assert.match(exceptionFeatureSource, /生产异常/);
assert.match(exceptionFeatureSource, /报异常并继续/);
assert.match(exceptionFeatureSource, /报异常并暂停/);
assert.match(exceptionFeatureSource, /上报会创建生产异常待办/);
assert.match(exceptionFeatureSource, /不会写库存、占用、打包或对账/);
assert.match(pageSource, /submitProductionException/);
assert.match(exceptionFeatureSource, /生产管理处理/);
assert.match(pageSource, /处理生产异常/);
assert.match(exceptionFeatureSource, /确认异常处理/);
assert.match(pageSource, /productionExceptionResolutionConfirmation/);
assert.match(pageSource, /resolutionConfirmed: true/);
assert.match(pageSource, /buildProductionExceptionResolutionEffects/);
assert.match(exceptionFeatureSource, /继续生产才会解除报工阻断/);
assert.match(printWorkspaceSource, /className="production-detail-scroll production-print-detail-scroll"/);
assert.match(printWorkspaceSource, /hidden=\{activePrintWorkspaceTab !== "qa"\}/);
assert.match(printWorkspaceSource, /hidden=\{activePrintWorkspaceTab !== "readiness"\}/);
assert.match(printWorkspaceSource, /hidden=\{activePrintWorkspaceTab !== "diagnostics"\}/);
assert.match(printWorkspaceSource, /hidden=\{activePrintWorkspaceTab !== "jobs"\}/);
assert.match(pageSource, /activeWorkbenchTab === "print" \? null/);
assert.match(detailPaneSource, /activeWorkbenchTab === "print" \? \(/);
assert.match(pageSource, /aria-controls="production-workbench-panel"/);
assert.match(pageSource, /role="tabpanel"/);
assert.doesNotMatch(pageSource, /setActiveDetail/);
assert.match(printWorkspaceSource, /from "\.\/ProductionPrintDevicePanels\.jsx"/);
assert.match(printDevicePanelSource, /export function PrinterDeviceQaPanel/);
assert.match(printDevicePanelSource, /export function PrintJobQueuePanel/);
assert.doesNotMatch(pageSource, /function PrinterDeviceQaPanel/);
assert.doesNotMatch(pageSource, /function PrintJobQueuePanel/);
assert.match(printWorkspaceSource, /from "\.\/ProductionPrintReadinessPanel\.jsx"/);
assert.match(printReadinessPanelSource, /export function PrintDriverV1ReadinessPanel/);
assert.match(printReadinessPanelSource, /门禁检查不触发实体打印/);
assert.match(printReadinessPanelSource, /真实出纸、纸张对位和扫码仍按现场 QA 记录保留/);
assert.doesNotMatch(pageSource, /function PrintDriverV1ReadinessPanel/);
assert.match(printWorkspaceSource, /from "\.\/ProductionPrintDiagnosticsPanel\.jsx"/);
assert.match(printDiagnosticsPanelSource, /export function PrintDriverDiagnosticsPanel/);
assert.match(printDiagnosticsPanelSource, /不读取 payload、不生成打印文件、不提交实体打印、不暴露命令或输出内容/);
assert.match(printDiagnosticsPanelSource, /提交成功不等于纸张已打出/);
assert.doesNotMatch(pageSource, /function PrintDriverDiagnosticsPanel/);
assert.doesNotMatch(mainSource, /styles\/features\/(production-print|driver|role-tools)\.css/, "production and field-tool styles should not load with the shell");
assert.match(appSource, /import\("\.\.\/styles\/features\/production-print\.css"\)/, "production/print styles should load with the production route");
assert.match(appSource, /import\("\.\.\/styles\/features\/driver\.css"\)/, "driver styles should load with the driver route");
assert.match(printDevicePanelSource, /driver-field-test-form printer-device-qa-form/);
assert.match(driverStyleSource, /\.driver-field-test-row/);
for (const selector of [".production-schedule-queue-table", ".printer-device-qa-section", ".print-driver-diagnostics-section", ".print-job-queue-section", ".queue-move-controls"]) {
  assert.equal(productionPrintStyleSource.includes(selector), true, `production/print feature styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}
for (const selector of [".production-print-nav-item", ".production-detail-scroll", ".production-print-overview", ".production-mode-print"]) {
  assert.equal(roleToolStyleSource.includes(selector), true, `role-tool styles should own ${selector}`);
}
assert.match(roleToolStyleSource, /\.production-packing-detail-pane\s*\{[\s\S]*?overflow: hidden;/);
assert.match(roleToolStyleSource, /\.production-exception-report \.danger-action/);

for (const helper of ["isProductionReportCandidate", "buildPackingTaskRows", "getProductionFinishedGoodsPhoto", "getProductionPackingTaskListStatusText"]) {
  assert.equal(presentationSource.includes(`export function ${helper}`), true, `production presentation should export ${helper}`);
}
assert.match(presentationSource, /machineCount.*动作次数，不入库/s);
assert.match(officePageSource, /export \{ ProductionPackingPage \} from "\.\.\/\.\.\/features\/production\/ProductionPackingPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function ProductionPackingPage/);
assert.doesNotMatch(officePageSource, /function PrinterDeviceQaPanel/);
assert.doesNotMatch(pageSource, /function PrintWorkspaceNavigation/);
assert.doesNotMatch(pageSource, /function ProductionExceptionPanel/);

const printWorkspaceItems = buildPrintWorkspaceItems({
  printerDeviceQa: { checks: Array.from({ length: 6 }, (_, index) => ({ status: index < 2 ? "passed" : "pending" })) },
  printDriverReadiness: { readiness: { ready: false, summary: { blockingCount: 7 } } },
  printDriverConfig: { config: { realDispatchAvailable: false, commandBridgeStatusReadbackAvailable: false } },
  printJobQueue: { items: [{ jobStatus: "failed" }, { jobStatus: "queued" }] },
});
assert.deepEqual(printWorkspaceItems.map((item) => item.value), ["qa", "readiness", "diagnostics", "jobs"]);
assert.equal(printWorkspaceItems.find((item) => item.value === "qa")?.meta, "2/6 通过");
assert.equal(printWorkspaceItems.find((item) => item.value === "readiness")?.meta, "7 项阻塞");
assert.equal(printWorkspaceItems.find((item) => item.value === "jobs")?.status, "存在失败");

console.log("Office production/packing page check passed: page ownership, independent print workspace, tab semantics, and machine-count safety labels remain intact.");
