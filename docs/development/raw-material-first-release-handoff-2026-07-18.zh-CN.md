# 原材料首发模式代码交接（2026-07-18）

> 后续实施状态（2026-07-18）：本交接第3至第5节的服务端首发白名单、健康投影、生产双侧配置和专项自动化已经完成并验证。本文继续保留为实施口径与验收依据；当前结果和既有工作区阻塞记录见`01_当前状态与下一步.md`与`02_问题或报错日志.md`。

## 1. 本次任务的最终口径

整套 ERP 继续作为同一套系统部署，订单、生产、成品、财务等模块的代码和数据结构都保留，不拆项目，也不删除后续模块。

首批实际使用范围只开放原材料链路：

1. 办公室人员上传送货单照片或 PDF。
2. 系统 OCR 识别送货单。
3. 办公室人员逐行人工核对。
4. 按实际卷数建卷，每卷生成一个独立卷码和标签。
5. 打印标签，人工把标签与实物一对一核对并贴到布卷。
6. 核对正确的卷进入可用库存；不一致的卷单独进入异常处理，不阻塞正确卷。
7. 杂工使用手机、PDA 或扫码枪扫描卷码，选择目标机台或区域，确认出库到机边。
8. 首发阶段的扫码出库不要求关联订单或生产任务。
9. 月底上传供应商 Excel 对账单，与已核对的入库记录自动匹配，再由办公室人工确认差异和对账结果。

必须保留的业务边界：

- 入库依靠人工一对一核对贴标，不使用手机逐卷扫码作为入库门禁。
- 手机扫码属于领料出库。
- 标签卷码携带或可查询颜色、规格、宽幅、重量、供应商和入库来源，工人不再手抄这些信息。
- 其他 ERP 模块只是首发阶段不开放使用，并非从项目中删除。

## 2. 当前代码状态

### 2.1 已完成的首发前端与原材料流程

以下能力已经存在于当前工作区：

- 生产前端构建开关：`VITE_RAW_MATERIAL_FIRST_RELEASE=true`。
- 办公室端首发模式只展示原材料工作台。
- 现场端有独立的原材料扫码出库页，不是把桌面页面缩进手机屏幕。
- 原材料送货单 OCR、逐行复核、建卷、标签预览/打印、人工贴标确认、卷级异常、扫码出库和供应商月结复核的前后端基础链路已存在。
- 每卷标签包含可扫描的 Code 39 卷码。
- 扫码出库可以只记录目标机台/区域，不伪造订单或生产任务关联。
- 其他模块代码仍保留在同一项目中。

关键文件：

- `src/config/rawMaterialFirstRelease.js`
- `src/app/navigation.js`
- `src/App.jsx`
- `src/features/raw-materials/RawMaterialInboundPage.jsx`
- `src/features/raw-materials/RawMaterialInboundWorkbench.jsx`
- `src/features/raw-materials/RawMaterialMobileReceiving.jsx`
- `src/features/raw-materials/RawMaterialScannerPage.jsx`
- `src/features/raw-materials/RawMaterialLabelPrintSheet.jsx`
- `src/domain/rawMaterialLabelBarcode.js`
- `src/domain/rawMaterialScanOutbound.js`
- `src/services/officeRawMaterialApiClient.js`
- `server/routes/rawMaterialReadRoutes.mjs`
- `server/routes/rawMaterialWriteRoutes.mjs`
- `deploy/production/frontend-build.env.example`
- `scripts/check-raw-material-first-release.mjs`

### 2.2 本轮尚未落地的关键项

前端菜单隐藏已经有了，但后端还没有“原材料首发模式”的业务写入白名单。

这意味着：如果某个已授权用户绕过前端，直接调用订单、生产、成品、财务等写接口，当前后端仍可能执行这些写入。下一次代码对话应优先补上这道服务端门禁。

本交接对话没有继续修改后端门禁代码；不要把下述方案误认为已经实现。

## 3. 下一次代码对话的 P0 实施任务

### 3.1 新增纯服务：首发范围解析和写入判定

建议新增：

`server/services/firstReleaseScopeService.mjs`

建议导出：

```js
export const RAW_MATERIAL_FIRST_RELEASE_SCOPE = "raw_material_only";
export function resolveFirstReleaseScope(options = {}, env = process.env) {}
export function evaluateFirstReleaseWrite({ scope, method, pathname }) {}
export function buildFirstReleaseBlockedResponse(scope) {}
```

配置优先级建议为：

1. `createApiServer({ firstReleaseScope })`
2. `ERP_FIRST_RELEASE_SCOPE`
3. 可选兼容布尔值 `ERP_RAW_MATERIAL_FIRST_RELEASE=true`
4. 默认关闭，避免改变现有测试和开发模式的行为

可接受的原材料范围输入可以统一归一化为 `raw_material_only`，例如：

- `raw_material`
- `raw_material_only`
- `raw-material`

### 3.2 门禁放置位置

修改 `server/apiServer.mjs`：

1. 在运行配置和安全策略装配完成后解析首发范围。
2. 将脱敏后的范围状态保存为 `workspace.firstReleaseScope`。
3. 在请求已经完成 CORS、OPTIONS、登录态检查之后，在读取 POST/PATCH 请求体和进入 `routeWrite` 之前执行首发范围判定。
4. 被阻止的请求直接返回 HTTP 403，不进入业务路由，也不产生任何业务写入。

这样既不会绕过现有登录和权限检查，也能防止前端隐藏菜单被直接 API 调用绕过。

### 3.3 首发模式允许的写接口

认证和系统运维不属于业务模块，应继续允许：

- `/api/auth/*`
- `/api/system/*`

原材料首发业务允许：

- `POST /api/raw-material-inbounds/recognize-delivery-note`
- `POST /api/raw-material-inbounds/:id/review`
- `POST /api/raw-material-inbounds/:id/print-labels`
- `POST /api/raw-material-inbounds/:id/print_labels`
- `POST /api/raw-material-inbounds/:id/attach-confirm`
- `POST /api/raw-material-inbounds/:id/attach_confirm`
- `POST /api/raw-material-inbounds/:id/void-label`
- `POST /api/raw-material-inbounds/:id/void_label`
- `POST /api/raw-material-inbounds/:id/reprint-label`
- `POST /api/raw-material-inbounds/:id/reprint_label`
- `POST /api/raw-material-inbounds/:id/issue-to-machine`
- `POST /api/raw-material-inbounds/:id/issue_to_machine`
- `POST /api/raw-material-inbounds/:id/exception`
- `POST /api/raw-material-supplier-statement-reviews`
- `POST /api/raw-material-supplier-statement-reviews/:id/confirm-review`
- `POST /api/raw-material-supplier-statement-reviews/:id/confirm-statement`

GET 读取接口先保持可用；生产前端已经隐藏非首发模块。此次门禁的核心目标是阻止未开放模块产生业务写入，不要因为首发门禁破坏现有应用启动所需的读取投影。

### 3.4 首发模式应明确禁止的写接口

除上一节白名单外，其他业务 POST/PATCH 一律阻止，包括订单、生产、成品库存、成品出库、客户对账收款、采购、维护、业务决策、打印管理等写接口。

虽然下面这些接口路径以 `raw-material` 开头，但也不属于本次首发范围，应阻止：

- 原材料采购请求
- 实际消耗确认
- 余料退回和余料复核
- 成本草稿和损耗复核
- 毛利快照生成和复核
- 供应商应付生成
- 供应商付款确认

原因是当前首发目标明确只有“送货单入库、卷级贴标、扫码出库、月底供应商对账”，不能因为路由名称属于原材料就默认全部放行。

### 3.5 拒绝响应契约

建议统一返回：

```json
{
  "code": "FIRST_RELEASE_SCOPE_BLOCKED",
  "message": "当前正式系统处于原材料首发模式，此业务写接口暂未开放。",
  "releaseScope": "raw_material_only",
  "allowedBusinessDomain": "raw_material"
}
```

要求：

- HTTP 状态为 403。
- 不返回请求体、文件路径、密钥、数据库连接串或其他敏感配置。
- 不伪装成成功，也不要只依赖前端 toast 阻止操作。

### 3.6 健康检查与生产配置

建议在 `server/services/systemHealthProjectionService.mjs` 的 `/api/health` 脱敏投影中增加：

```json
{
  "enabled": true,
  "scope": "raw_material_only",
  "writePolicy": "allowlist",
  "allowedBusinessDomains": ["raw_material"]
}
```

不要暴露原始环境变量内容。

在 `deploy/production/erp-service.env.example` 增加非密钥接线：

```dotenv
# 整套 ERP 部署，但首发阶段只允许原材料业务写入。
ERP_FIRST_RELEASE_SCOPE=raw_material
```

`deploy/production/frontend-build.env.example` 已有：

```dotenv
VITE_RAW_MATERIAL_FIRST_RELEASE=true
```

同时更新 `scripts/run-v1-production-deployment-manifest.mjs`，让部署清单同时检查前端开关和后端范围，防止只开其中一侧。

## 4. 必须补的自动化检查

建议新增：

`scripts/check-first-release-scope-service.mjs`

至少覆盖：

1. 默认不开启首发门禁。
2. 选项和环境变量都能解析，显式选项优先。
3. GET 请求不被这道写门禁阻止。
4. `/api/auth/*` 和 `/api/system/*` 写入继续通过范围门禁。
5. 上述原材料首发白名单全部允许。
6. 订单或生产写接口返回 403 和 `FIRST_RELEASE_SCOPE_BLOCKED`。
7. 原材料采购、消耗、余料、成本、毛利、应付和付款写接口也被阻止。
8. 被拒绝的业务处理函数没有执行，工作区状态没有变化。
9. 拒绝响应不包含路径、密钥、连接串或请求体内容。
10. `/api/health` 能安全显示当前首发范围。

将新检查接入现有 `raw-material-inbound-api:check`，或建立独立 npm script 后加入 core 检查清单；修改前先确认 `scripts/check-group-manifest.mjs` 的约束，避免破坏分组计数。

现有 `scripts/check-raw-material-first-release.mjs` 也应补一条生产后端环境示例断言，确认 `ERP_FIRST_RELEASE_SCOPE=raw_material` 存在。

## 5. 推荐执行顺序和命令

先读取项目规则和当前改动，不要覆盖用户工作区：

```bash
cd /Users/xu/Documents/ERP
sed -n '1,260p' AGENTS.md
git status --short
git diff -- server/apiServer.mjs server/routes/rawMaterialWriteRoutes.mjs deploy/production/erp-service.env.example deploy/production/frontend-build.env.example package.json
```

实施完成后先跑定向检查：

```bash
cd /Users/xu/Documents/ERP
node scripts/check-first-release-scope-service.mjs
node scripts/check-system-health-projection-service.mjs
node scripts/check-raw-material-first-release.mjs
npm run raw-material-inbound-api:check
npm run v1-production-deployment-manifest:check
```

再跑工程级检查：

```bash
cd /Users/xu/Documents/ERP
npm run lint
npm run build
npm run check:core
```

如果 core 因为本任务之外的既有脏改动失败，必须区分“本次修改导致”与“原有失败”，不得为了让检查变绿而回滚或重写其他人的文件。

最后按 `AGENTS.md` 要求自行启动本地服务并在应用内浏览器验证，不要让用户手动启动：

```bash
cd /Users/xu/Documents/ERP
npm run api:demo
```

另开终端启动前端首发构建环境：

```bash
cd /Users/xu/Documents/ERP
VITE_ERP_RUNTIME_MODE=demo VITE_ERP_API_BASE_URL=http://127.0.0.1:8787/api VITE_RAW_MATERIAL_FIRST_RELEASE=true npm run dev -- --host 127.0.0.1
```

浏览器至少验证：

- 办公室桌面端只出现原材料首发入口。
- 手机宽度进入独立原材料扫码页，没有桌面左栏挤进手机。
- 原材料列表和详情能读取。
- 送货单 OCR 请求能够通过首发范围门禁；缺少真实 OCR 密钥时应显示真实配置错误，不能被误报为模块禁用。
- 直接调用一个订单写接口返回 403 和 `FIRST_RELEASE_SCOPE_BLOCKED`。
- 直接调用原材料成本或付款写接口同样返回 403。
- 登录和 `/api/health` 正常。

## 6. 工作区安全说明

当前分支：`codex/p0-office-hardening`。

当前工作区有大量已修改和未跟踪文件，这些改动属于用户和此前任务，不能执行：

- `git reset --hard`
- `git checkout -- .`
- 批量清理未跟踪文件
- 为了本任务回滚其他模块
- 未经用户明确要求进行提交、推送或部署

所有手工代码编辑使用 `apply_patch`。只修改本任务直接涉及的文件，并在交付时列出实际修改范围。

特别注意：`server/apiServer.mjs`、`package.json`、`AGENTS.md`、生产环境示例和多个原材料文件已经有未提交改动；编辑前必须先看当前内容和局部 diff，不能按旧基线整文件覆盖。

## 7. 仍需现场条件才能完成的事项

本次代码门禁完成后，也不等于已经具备正式上线的全部现场条件。至少还需分别确认：

- 正式 PostgreSQL 和对象存储配置。
- 腾讯云 OCR 正式密钥、额度和真实送货单识别验收。
- 正式员工账号、权限和设备绑定。
- 标签打印机型号、纸张尺寸、驱动或厂商 SDK。
- 手机蓝牙可信打印的设备回执、失败显示和安全重试。目前页面打印能力不能代替真实设备验收。
- HTTPS、备份、恢复演练和生产环境门禁。

这些事项不应阻止本次先把“原材料首发后端白名单”实现和验证好，但在没有现场证据时不能声称已经正式上线。

## 8. 可直接复制到新代码对话的任务说明

```text
继续 /Users/xu/Documents/ERP 的原材料首发模式任务。先完整读取 AGENTS.md 和 docs/development/raw-material-first-release-handoff-2026-07-18.zh-CN.md，再检查当前 git status 和相关文件局部 diff。

目标：整套 ERP 保持同一套部署和完整代码，但首发阶段只允许“送货单 OCR -> 人工逐行核对 -> 按卷建档和打印标签 -> 人工一对一贴标确认 -> 卷级可用库存/异常 -> 杂工扫码到机台且暂不关联订单 -> 月底供应商 Excel 对账”这一串业务实际写入。前端已有首发隐藏，重点补服务端业务写入白名单、生产环境开关、健康状态和自动化检查。

登录、健康检查和系统运维继续可用；GET 读取不因这道写门禁被破坏。只放行交接文档列出的原材料首发写接口。订单、生产、成品、财务、采购，以及原材料消耗/余料/成本/毛利/应付/付款等写接口必须返回 403 FIRST_RELEASE_SCOPE_BLOCKED，并且不能产生状态变化。

使用 apply_patch，保护当前大量脏改动，不回滚、不提交、不推送、不部署。完成后运行交接文档列出的定向检查、lint、build、check:core；自行启动 API 和前端，并用应用内浏览器验证桌面、手机和 API 门禁。最后明确报告已完成、验证结果和仍需现场条件完成的事项。
```
