# 司机端原生壳桥接联调说明

最后更新：2026-07-08

## 目的

本文档说明 P0 司机端 Web 页面与 Android / iOS 原生壳之间的两个桥接合同：

- 原生扫码：调用手机原生扫码 SDK 扫包裹标签。
- 原生导航：调用手机原生地图 SDK 或系统地图打开配送地址。

该桥接合同只证明 Web 与原生壳之间能传递请求和结果；真实验收仍要用司机手机、真实权限、真实纸质包裹标签和真实地图打开结果做现场 QA。

## 统一接入方式

Web 会按以下顺序检测桥接能力：

1. `window.erpDriverNative`
2. `window.DriverNativeBridge`
3. `window.ErpDriverNative`
4. `window.AndroidDriverNative`
5. `window.webkit.messageHandlers.erpDriver`

Android 可以优先实现 `ErpDriverNative` 或 `AndroidDriverNative`，方法参数使用 JSON 字符串。

iOS WebKit 可以实现 `window.webkit.messageHandlers.erpDriver.postMessage(payload)`。

直接 JS bridge 可以实现 `window.erpDriverNative`，方法参数使用对象。

## 原生扫码

版本：`p0-driver-native-bridge-v1`

消息类型：`driver.packageLabel.scan`

Web 调用方法：

```js
window.erpDriverNative.scanPackageLabel(payload)
ErpDriverNative.scanPackageLabel(JSON.stringify(payload))
window.webkit.messageHandlers.erpDriver.postMessage(payload)
```

请求示例：

```json
{
  "type": "driver.packageLabel.scan",
  "version": "p0-driver-native-bridge-v1",
  "requestId": "DNPS-20260702093000-F008",
  "fulfillmentId": "F008",
  "orderLineId": "ORD-0629-022-01",
  "operatorId": "U-DRIVER-A",
  "expectedPackageIds": ["PKG-F008-1", "PKG-F008-2"],
  "checkedAt": "2026-07-02T09:30:00.000Z"
}
```

原生返回结果可以走三种路径之一：

- 直接方法返回对象或 JSON 字符串。
- 触发浏览器事件 `erp-driver-native-package-scan`。
- 调用 `window.__erpDriverNativeBridge.receivePackageScanResult(payload)`。

成功结果示例：

```json
{
  "requestId": "DNPS-20260702093000-F008",
  "status": "scanned",
  "scannedText": "PKG-F008-1",
  "checkedAt": "2026-07-02T09:30:02.000Z"
}
```

异常结果示例：

```json
{
  "requestId": "DNPS-20260702093000-F008",
  "status": "failed",
  "errorCode": "NATIVE_SCAN_FAILED",
  "message": "扫码 SDK 打开失败",
  "checkedAt": "2026-07-02T09:30:02.000Z"
}
```

## 原生导航

版本：`p0-driver-native-navigation-bridge-v1`

消息类型：`driver.navigation.open`

Web 调用方法：

```js
window.erpDriverNative.openNavigation(payload)
ErpDriverNative.openNavigation(JSON.stringify(payload))
window.webkit.messageHandlers.erpDriver.postMessage(payload)
```

请求示例：

```json
{
  "type": "driver.navigation.open",
  "version": "p0-driver-native-navigation-bridge-v1",
  "requestId": "DNN-20260702093000-F008",
  "fulfillmentId": "F008",
  "orderLineId": "ORD-0629-022-01",
  "operatorId": "U-DRIVER-A",
  "customerName": "李四电商",
  "contactName": "李四",
  "contactPhone": "139****6221",
  "address": "厚街仓库 A 区",
  "addressArea": "厚街",
  "navigationUrl": "https://uri.amap.com/search?keyword=...",
  "geoPoint": "22.920000,113.680000",
  "routeDate": "2026-07-02",
  "routeNo": "虎门线-A",
  "routeSequence": 2,
  "plannedDepartureAt": "2026-07-02T08:30:00.000Z",
  "checkedAt": "2026-07-02T09:30:00.000Z"
}
```

原生返回结果可以走三种路径之一：

- 直接方法返回对象、布尔值或 JSON 字符串。
- 触发浏览器事件 `erp-driver-native-navigation`。
- 调用 `window.__erpDriverNativeBridge.receiveNavigationResult(payload)`。

成功结果示例：

```json
{
  "requestId": "DNN-20260702093000-F008",
  "status": "opened",
  "mapApp": "amap",
  "checkedAt": "2026-07-02T09:30:02.000Z"
}
```

异常结果示例：

```json
{
  "requestId": "DNN-20260702093000-F008",
  "status": "failed",
  "errorCode": "NATIVE_NAVIGATION_FAILED",
  "message": "地图打开失败",
  "checkedAt": "2026-07-02T09:30:02.000Z"
}
```

## Web 端验收记录

司机端页面会显示 `原生桥接` 和 `原生壳联调` 两块信息。保存 `现场验收` 时，Web 会把当时的桥接状态保存到 `nativeBridgeDiagnostics`，并随 `DQA-*` 现场验收记录持久化。

普通浏览器下应显示 `原生 0/2`。这表示还没有接入原生壳，不是错误。

真实原生壳接入后，至少需要验证：

- 页面 `原生桥接` 显示 `原生能力可用`。
- `原生扫码` 能返回真实纸质包裹标签内容。
- `原生导航` 能打开地图并返回 `opened`。
- 保存现场验收后，`原生快照` 与扫码样本都能读回。

V1 上线前还应运行 `GET /api/driver/v1-readiness` 或 `scripts/run-v1-readiness-check.mjs`。司机端门禁要求送货任务可读、最新现场验收记录存在、6 项现场检查全通过、原生扫码 / 原生导航 2/2 可用，并且纸质包裹标签扫码样本使用 `native_sdk` 且匹配包裹；普通浏览器的 `原生 0/2` 会保持 blocked。

## V1 阶段执行器

司机真机阶段现在可以用执行器串联留证：

```bash
node -- scripts/run-v1-driver-real-device-execution.mjs \
  --api-base-url https://<erp-host>/api \
  --driver-operator-id <driver-user> \
  --field-evidence-manifest <filled-field-evidence-manifest>
```

执行器会读取运行中 API 的 `/api/driver/v1-readiness`，保存 `.erp-local-storage/v1-driver-readiness/latest.json`，再调用 `scripts/run-v1-driver-real-device-closeout.mjs` 读取该 readiness 和 `driver_native_device` 现场证据组，输出 `.erp-local-storage/v1-driver-real-device-execution/latest.json` / `.md`。

该执行器只做只读 readiness 和 closeout：

- 不请求相机权限或定位权限。
- 不打开地图导航。
- 不调用原生扫码 / 导航桥。
- 不上传照片。
- 不修改现场证据 manifest。
- 不改变司机送货任务状态。
- 不声明 V1 完成。

真实司机手机登录、相机水印照片、纸质包裹标签原生扫码、定位、地图导航、弱网上传兜底和司机签认仍必须在现场完成，并回填 `driver_native_device` 证据。
