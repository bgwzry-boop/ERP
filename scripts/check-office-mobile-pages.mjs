import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workshopPageSource = readFileSync(new URL("../src/features/workshop/WorkshopMobilePage.jsx", import.meta.url), "utf8");
const driverPageSource = readFileSync(new URL("../src/features/driver/DriverMobilePage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");

assert.match(workshopPageSource, /export function WorkshopMobilePage/);
for (const contract of ["移动任务池", "生产报工", "打包任务", "机器计数\/动作次数", "报当日数量", "不入库", "上传成品图", "提交打包完成"]) {
  assert.equal(workshopPageSource.includes(contract), true, `workshop mobile page should retain ${contract}`);
}
assert.match(workshopPageSource, /productionPackingPresentation\.js/);

assert.match(driverPageSource, /export function DriverMobilePage/);
for (const contract of ["原生扫码", "相机扫码", "读取定位", "打开导航", "水印照片", "确认已装车", "提交送达", "送货异常", "回单进入办公室复核"]) {
  assert.equal(driverPageSource.includes(contract), true, `driver mobile page should retain ${contract}`);
}
assert.match(driverPageSource, /getDriverDeviceReadiness/);
assert.match(driverPageSource, /getDriverNativeCapabilityDiagnostics/);
assert.match(driverPageSource, /buildDriverNativeIntegrationKit/);

assert.match(officePageSource, /export \{ WorkshopMobilePage \} from "\.\.\/\.\.\/features\/workshop\/WorkshopMobilePage\.jsx";/);
assert.match(officePageSource, /export \{ DriverMobilePage \} from "\.\.\/\.\.\/features\/driver\/DriverMobilePage\.jsx";/);
assert.doesNotMatch(officePageSource, /function WorkshopMobilePage/);
assert.doesNotMatch(officePageSource, /function DriverMobilePage/);
assert.doesNotMatch(officePageSource, /useState|useEffect|useRef/);

console.log("Office mobile pages check passed: workshop and driver features are isolated with device and inventory safeguards intact.");
