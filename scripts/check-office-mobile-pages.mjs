import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workshopPageSource = readFileSync(new URL("../src/features/workshop/WorkshopMobilePage.jsx", import.meta.url), "utf8");
const driverPageSource = readFileSync(new URL("../src/features/driver/DriverMobilePage.jsx", import.meta.url), "utf8");
const driverTaskListSource = readFileSync(new URL("../src/features/driver/DriverTaskList.jsx", import.meta.url), "utf8");
const driverRouteStageSource = readFileSync(new URL("../src/features/driver/DriverRouteStage.jsx", import.meta.url), "utf8");
const driverLoadStageSource = readFileSync(new URL("../src/features/driver/DriverLoadStage.jsx", import.meta.url), "utf8");
const driverDeviceStageSource = readFileSync(new URL("../src/features/driver/DriverDeviceStage.jsx", import.meta.url), "utf8");
const driverDeliveryStageSource = readFileSync(new URL("../src/features/driver/DriverDeliveryStage.jsx", import.meta.url), "utf8");
const warehousePageSource = readFileSync(new URL("../src/features/warehouse/WarehouseMobilePage.jsx", import.meta.url), "utf8");
const officeMobilePageSource = readFileSync(new URL("../src/features/office-mobile/OfficeMobilePage.jsx", import.meta.url), "utf8");
const decisionMobilePageSource = readFileSync(new URL("../src/features/decisions/DecisionMobilePage.jsx", import.meta.url), "utf8");
const maintenanceMobilePageSource = readFileSync(new URL("../src/features/maintenance/MaintenanceMobilePage.jsx", import.meta.url), "utf8");
const desktopRequiredMobilePageSource = readFileSync(new URL("../src/features/mobile/DesktopRequiredMobilePage.jsx", import.meta.url), "utf8");
const driverFeatureSources = [
  driverPageSource,
  driverTaskListSource,
  driverRouteStageSource,
  driverLoadStageSource,
  driverDeviceStageSource,
  driverDeliveryStageSource,
].join("\n");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sharedStyleSource = readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const shellStyleSource = readFileSync(new URL("../src/styles/shell.css", import.meta.url), "utf8");
const driverStyleSource = readFileSync(new URL("../src/styles/features/driver.css", import.meta.url), "utf8");
const warehouseStyleSource = readFileSync(new URL("../src/styles/features/warehouse.css", import.meta.url), "utf8");
const mobileRoleStyleSource = readFileSync(new URL("../src/styles/features/mobile-roles.css", import.meta.url), "utf8");

assert.match(workshopPageSource, /export function WorkshopMobilePage/);
for (const contract of ["生产任务", "生产报工", "打包任务", "机器计数\/动作次数", "报当日数量", "不入库", "上传成品图", "提交打包完成"]) {
  assert.equal(workshopPageSource.includes(contract), true, `workshop mobile page should retain ${contract}`);
}
assert.match(workshopPageSource, /roleKeys\.has\("workshop"\)/);
assert.match(workshopPageSource, /roleKeys\.has\("packing"\)/);
assert.match(workshopPageSource, /modeItems\.length > 1/);
assert.match(workshopPageSource, /productionPackingPresentation\.js/);
assert.match(workshopPageSource, /ariaLabel="车间任务详情"/);
assert.match(workshopPageSource, /\["操作", "任务", "成品图", "记录"\]/);
assert.match(workshopPageSource, /detailView === "操作"/);
assert.match(workshopPageSource, /buildPackingCompletionSummary/);
assert.match(workshopPageSource, /确认提交打包完成/);
assert.match(workshopPageSource, /packingCompletionConfirmed: true/);
assert.match(workshopPageSource, /restorePackingCompletionTriggerFocusRef/);
assert.match(workshopPageSource, /handlePackingCompletionConfirmationKeyDown/);
assert.match(workshopPageSource, /aria-live="assertive"/);
assert.match(workshopPageSource, /!packingCompletionConfirmation \? \(/);
assert.match(workshopPageSource, /buildProductionReportSummary/);
assert.match(workshopPageSource, /确认完成生产报工/);
assert.match(workshopPageSource, /productionReportConfirmed: true/);
assert.match(workshopPageSource, /restoreProductionReportTriggerKindRef/);
assert.match(workshopPageSource, /handleProductionReportConfirmationKeyDown/);
assert.match(workshopPageSource, /!productionReportConfirmation \? \(/);
assert.match(workshopPageSource, /生产异常/);
assert.match(workshopPageSource, /报异常并继续/);
assert.match(workshopPageSource, /报异常并暂停/);
assert.match(workshopPageSource, /submitProductionException/);

assert.match(driverPageSource, /export function DriverMobilePage/);
for (const contract of ["原生扫码", "相机扫码", "读取定位", "打开导航", "水印照片", "确认已装车", "提交送达", "送货异常", "回单进入办公室复核"]) {
  assert.equal(driverFeatureSources.includes(contract), true, `driver mobile feature should retain ${contract}`);
}
for (const component of ["DriverTaskList", "DriverRouteStage", "DriverLoadStage", "DriverDeviceStage", "DriverDeliveryStage"]) {
  assert.match(driverPageSource, new RegExp(`import \\{ ${component} \\} from`));
}
assert.match(driverPageSource, /getDriverDeviceReadiness/);
assert.match(driverPageSource, /getDriverNativeCapabilityDiagnostics/);
assert.match(driverPageSource, /buildDriverNativeIntegrationKit/);
assert.match(driverPageSource, /ariaLabel="司机任务详情"/);
assert.match(driverPageSource, /\["路线", "装车", "送达", "设备", "记录"\]/);
assert.match(driverPageSource, /getDriverDefaultDetailView/);
assert.match(driverPageSource, /status === "待送货"\) return "装车"/);
assert.match(driverPageSource, /status === "配送中"\) return "送达"/);
assert.match(driverLoadStageSource, /packageCameraVideoRef/);
assert.match(driverDeliveryStageSource, /deliveryCompletionConfirmation/);
assert.match(warehousePageSource, /export function WarehouseMobilePage/);
for (const contract of ["任务可见", "备货", "纸单核对", "实物出库", "等待当前纸质出库单", "回录库房结果", "当前任务", "待处理", "全部功能"]) {
  assert.equal(warehousePageSource.includes(contract), true, `warehouse mobile page should retain ${contract}`);
}
assert.match(warehousePageSource, /paperOutboundStatus === "已交库房"/);
assert.match(warehousePageSource, /!item\.physicalOutboundAt/);
assert.match(mainSource, /import "\.\/styles\/features\/warehouse\.css";/);
assert.match(warehouseStyleSource, /\.warehouse-mobile-page/);
for (const contract of ["随手处理", "工单待办", "异常提醒", "原料拍单", "卷标打印", "办公室共享任务"]) {
  assert.equal(officeMobilePageSource.includes(contract), true, `office mobile companion should retain ${contract}`);
}
for (const contract of ["主要决策人", "辅助决策人", "订单优先级", "生产排期", "抹零核销", "重大异常", "确认并生成待办", "正式账号登录后提交", "决定历史", "BusinessDecisionHistoryPanel", "recordOfficeBusinessDecision"]) {
  assert.equal(decisionMobilePageSource.includes(contract), true, `decision mobile page should retain ${contract}`);
}
for (const contract of ["设备任务", "设备报修", "日常巡检", "预防维护", "检查发现", "采取措施", "办公室共享待办", "最终确认：提交设备已恢复", "updateMaintenanceTask", "createMaintenanceEvidenceAttachmentInput", "正式账号登录后提交"]) {
  assert.equal(maintenanceMobilePageSource.includes(contract), true, `maintenance mobile page should retain ${contract}`);
}
assert.doesNotMatch(maintenanceMobilePageSource, /尚未写入服务器/);
for (const contract of ["请使用老板电脑", "请使用财务工作台", "请使用部署电脑", "不会显示压缩后的办公室菜单"]) {
  assert.equal(desktopRequiredMobilePageSource.includes(contract), true, `desktop-required mobile boundary should retain ${contract}`);
}
assert.match(mainSource, /import "\.\/styles\/features\/mobile-roles\.css";/);
assert.match(mobileRoleStyleSource, /\.office-mobile-task-card/);
assert.match(mobileRoleStyleSource, /\.decision-mobile-card/);
assert.match(mobileRoleStyleSource, /\.maintenance-mobile-card/);
assert.match(mainSource, /import "\.\/styles\/features\/driver\.css";/);
assert.equal(
  mainSource.indexOf('import "./styles/features/role-tools.css";') < mainSource.indexOf('import "./styles/features/driver.css";'),
  true,
  "driver styles should load after the shared role-tool workbench layer",
);
for (const selector of [
  ".driver-route-section",
  ".driver-device-grid",
  ".driver-native-diagnostics",
  ".driver-field-test-row",
  ".driver-load-package",
  ".delivery-photo-camera-actions",
  ".photo-proof-preview",
  ".watermark-preview",
  ".driver-proof-form",
]) {
  assert.equal(driverStyleSource.includes(selector), true, `driver feature styles should own ${selector}`);
  assert.equal(sharedStyleSource.includes(selector), false, `shared styles should not retain ${selector}`);
}

assert.match(officePageSource, /export \{ WorkshopMobilePage \} from "\.\.\/\.\.\/features\/workshop\/WorkshopMobilePage\.jsx";/);
assert.match(officePageSource, /export \{ DriverMobilePage \} from "\.\.\/\.\.\/features\/driver\/DriverMobilePage\.jsx";/);
assert.match(officePageSource, /export \{ WarehouseMobilePage \} from "\.\.\/\.\.\/features\/warehouse\/WarehouseMobilePage\.jsx";/);
assert.doesNotMatch(officePageSource, /function WorkshopMobilePage/);
assert.doesNotMatch(officePageSource, /function DriverMobilePage/);
assert.doesNotMatch(officePageSource, /useState|useEffect|useRef/);
assert.match(shellStyleSource, /\.app-shell-mobile-role button,[\s\S]*?min-height: 44px;/);
assert.match(shellStyleSource, /\.app-shell-mobile-role \.mobile-task-row \{[\s\S]*?min-height: 76px;/);

console.log("Office mobile pages check passed: workshop and driver features, styles, device contracts, and inventory safeguards remain isolated.");
