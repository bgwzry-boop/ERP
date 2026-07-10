# 打印驱动联调说明

最后更新：2026-07-09

## 目标

本说明用于把 ERP 打包 / 标签 / 出库打印链路交给真实打印环境联调。

当前 P0 已有：

- 打印作业队列：`GET /api/print-jobs`。
- 手动派发：`POST /api/print-jobs/{printJobId}/dispatch`。
- 服务账号状态轮询：`POST /api/print-jobs/{printJobId}/poll-status`。
- non-printing spool 诊断：`GET /api/print-driver/spool-diagnostics`。
- non-printing CUPS 队列预检：`GET /api/print-driver/cups-diagnostics`。
- 现场 CUPS 队列预检 runner：`scripts/run-cups-queue-preflight.mjs`，可在现场机器上直接跑真实 `lpstat` 类状态命令。
- V1 上线就绪门禁：`GET /api/print-driver/v1-readiness`，包含 CUPS 队列预检作为第 9 项阻塞门禁。
- V1 门禁命令行 runner：`scripts/run-print-v1-readiness-check.mjs`，可对运行中 API 输出脱敏 readiness 报告和退出码。
- 打印阶段执行器：`scripts/run-v1-print-chain-execution.mjs`，可按顺序执行 CUPS 队列 non-printing 预检、保存 API 打印 readiness、再生成打印阶段 closeout。
- 打印阶段 closeout runner：`scripts/run-v1-print-chain-closeout.mjs`，读取已保存的打印 readiness JSON 和已填写的 `print_hardware` 现场证据组，生成真实打印链路阶段签收结论。
- ERP V1 总门禁 runner：`scripts/run-v1-readiness-check.mjs`，可同时检查 API、OpenAPI、权限、附件存储和打印门禁。
- 办公室设备模式维护：`POST /api/print-devices/{printDeviceId}/driver-mode` 只保存 `settings.driverMode`。
- 打印设备现场 QA 证据：`POST /api/print-devices/{printDeviceId}/field-tests` 保存 6 项检查和 5 项证据摘要。
- 命令桥 wrapper：`scripts/print-command-bridge.mjs`，默认 `spool_only`，可选 `cups_lp`。
- 后端适配器：`server/printDriverAdapter.mjs`。
- 前端联调包：`buildOfficePrintDriverIntegrationKit(...)`，版本 `p0-print-driver-integration-kit-v1.1`。

该联调包是交接合同，不是物理打印通过证明。真实上线仍要做 CUPS / 标签机 / 针式机驱动、纸张对位、条码扫码、作废重打和现场 QA。

## 推荐环境变量

真实打印环境只在后端配置，前端只展示脱敏状态。

| 变量 | 示例 / 说明 |
| --- | --- |
| `ERP_SYSTEM_PRINTER_ENABLED` | `true`，确认真实打印环境可用后再开启。 |
| `ERP_SYSTEM_PRINTER_ADAPTER` | `command_bridge`。 |
| `ERP_SYSTEM_PRINTER_COMMAND` | 后端本机绝对命令，例如 Node / shell wrapper；不得返回给前端。 |
| `ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON` | `["--print-job-id","{printJobId}","--print-device-id","{printDeviceId}","--print-device-name","{printDeviceName}"]`。 |
| `ERP_SYSTEM_PRINTER_ALLOWLIST` | 允许派发的打印机 ID / 名称，必须限制目标设备。 |
| `ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR` | 后端本地 spool 状态目录；不得返回给前端。 |
| `ERP_PRINT_COMMAND_BRIDGE_MODE` | 默认 `spool_only`；真实 CUPS 提交时显式设为 `cups_lp`。 |
| `ERP_PRINT_COMMAND_BRIDGE_CUPS_COMMAND` | CUPS 命令，通常为 `lp`；只在 `cups_lp` 模式下使用。 |
| `ERP_PRINT_COMMAND_BRIDGE_CUPS_ARGS_JSON` | CUPS 参数模板，默认等价于 `["-d","{cupsPrinterName}","-t","{jobTitle}","{printFile}"]`。 |
| `ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER` | 可选固定 CUPS 打印机名；也可由设备名 / 设备设置推导。 |
| `ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST` | CUPS 打印机名白名单；`cups_lp` 模式必填。 |
| `ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND` | CUPS 队列预检命令，默认 `lpstat`；只用于 non-printing 预检。 |
| `ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON` | CUPS 队列预检参数模板，默认等价于 `["-p","{cupsPrinterName}"]`。 |
| `ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS` | CUPS 队列预检超时，默认 5000ms，上限 60000ms。 |

## 命令桥提交载荷

`command_bridge` 通过 stdin 接收 JSON，最小字段如下：

```json
{
  "printJobId": "PJ-...",
  "printDeviceId": "PRN-...",
  "printDeviceName": "Label Printer",
  "driverName": "203dpi Driver",
  "connectionUri": "system://label-printer",
  "documentType": "express_ltl_label",
  "targetType": "fulfillment",
  "targetId": "FUL-...",
  "payloadSnapshot": "{ templateId, documentNo, packageIds, labelTextHash }",
  "printDeviceSnapshot": "{ printDeviceId, name, driverName, connectionUri, settings }"
}
```

当前 `spool_only` wrapper 会创建 `PCB-{printJobId}-{digest}` 外部作业号，并把 spool 文件写入本地生命周期目录。

## CUPS lp 提交模式

`scripts/print-command-bridge.mjs` 默认不调用真实打印机。只有显式选择 `cups_lp` 时，才会调用 CUPS：

```bash
ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp
ERP_PRINT_COMMAND_BRIDGE_CUPS_COMMAND=lp
ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST="标签机A,epson_lq_615kii_notes"
```

`cups_lp` 的边界：

- 必须有 CUPS 打印机白名单，未配置白名单直接失败。
- 只用无 shell 的 `spawnSync` 调用 CUPS 命令。
- 会先写本地 bridge 记录，再生成受控纯文本打印文件。
- CUPS 命令接收成功后，bridge 记录进入 `sent`，ERP 打印作业也只算 `sent`。
- stdout 只返回 `externalJobId / bridgeJobId / status / mode / cupsJobId` 等脱敏字段。
- `sent` 不等于出纸完成；必须等 spool `completed`、驱动回调、人工确认或现场 QA 后才能进入 `printed`。

自动化校验使用 `scripts/fake-cups-lp.mjs`，不会调用本机真实 `lp`。

## EPSON LQ-615KII 针式单据打印机档案

现场针式出库 / 自提 / 送货单打印机按 `EPSON LQ-615KII` 建档，ERP 内部设备 ID 使用 `PRN-DOT-A`，显示名使用 `EPSON LQ-615KII 针式单据打印机`。官方资料显示该机型为 24 针击打式点阵、82 列（10cpi）、平推机型，支持 `ESC/P-K`、`IBM2390+`、`OKI5530SC` 控制码，接口为 USB2.0 全速和 IEEE-1284 双向并口；连续纸宽度 101.6-254mm，单页纸宽度 90-257mm，纸厚 0.065-0.32mm，复写能力 1+3。

系统默认档案仅作为初始资料和模板假设：

- 当前 ERP 默认设备：`PRN-DOT-A`。
- 建议 CUPS 队列名：`epson_lq_615kii_notes`，避免中文队列名在脚本、shell、日志和远程运维中出现编码问题。
- 现场打印主机：Windows 11。
- 驱动口径：优先记录现场操作系统安装后的真实驱动名；Windows 官方驱动口径可记录为 `Epson LQ-610KII/615KII`，CUPS / Linux / macOS 只能按现场队列和样张验收确认，不应仅凭型号写死。
- 连接方式：优先记录现场实际使用的 USB2.0 或 IEEE-1284 并口 / 转接线；不要从型号自动推断。
- 模板默认纸张：现场已补充为 `二联二等分连续针式纸`；当前仍按 `241x140mm` 做 P0 模板假设，真实上线前必须量纸宽、纸高、孔距、页顶、左边距和撕纸位置。
- 样张口径：2026-07-09 已收到现有成品袋给客户用的 `送货单` 照片样张，字段包含客户、地址 / 电话、联系人、日期、单号、明细、规格、颜色、单位、数量、袋子单价、印刷单价、长提单价、金额、备注、合计和送 / 收货签字；该样张不是原材料厂家随货单。
- 现场 QA：至少保留出库 / 自提 / 送货单样张、二联复写清晰度、纸张对位、作废重打、spool / 驱动回写和操作员签认。当前暂无线下对位问题反馈，不代表上线已通过。

Windows 11 查看真实系统打印机名称 / 驱动 / 端口：

1. 打开 `设置 -> 蓝牙和设备 -> 打印机和扫描仪`。
2. 选择 `EPSON LQ-615KII` 或现场显示的同类打印机。
3. 打开 `打印机属性`，不要只看 `打印首选项`。
4. `常规` 页记录打印机名称；`端口` 页记录 USB / LPT / WSD / 共享端口；`高级` 页记录驱动程序名称。
5. 也可以在 Windows PowerShell 里运行：

```powershell
Get-Printer | Format-Table Name,DriverName,PortName,Shared,ShareName
```

如现场人员不方便复制文字，直接拍这几页属性或 PowerShell 输出即可。

示例 CUPS 配置值可按现场实际队列改写：

```bash
ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST="标签机A,epson_lq_615kii_notes"
ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER=epson_lq_615kii_notes
```

## CUPS 队列预检

`GET /api/print-driver/cups-diagnostics` 用于上线前检查 CUPS 队列是否能被当前后端进程访问：

- 需要 `fulfillment.print` 权限。
- 只运行队列状态命令，例如 `lpstat -p {cupsPrinterName}`。
- 不读取订单 payload，不生成打印文件，不提交真实打印作业。
- CUPS 打印机名仍必须命中白名单。
- 响应只返回 `ready`、队列命令是否可运行、stdout/stderr 字节数和脱敏阻塞原因。
- 响应不得暴露命令路径、参数、stdout/stderr 内容、spool 路径或 payload。

命令桥也支持直接运行：

```bash
node scripts/print-command-bridge.mjs \
  --action cups-preflight \
  --mode cups_lp \
  --cups-printer "标签机A" \
  --cups-allowlist "标签机A,epson_lq_615kii_notes"
```

自动化校验使用 `scripts/fake-cups-lpstat.mjs`，不会查询本机真实 CUPS 队列。该预检通过只能证明队列状态命令可用，不等于纸张已经打出，也不能替代纸张对位、条码扫描、作废重打和现场 QA。

办公室 `打包/标签 > 打印驱动诊断` 会显示同一预检结果。字段只展示是否配置打印机名、是否命中白名单、状态命令是否可运行、stdout/stderr 字节数和安全护栏，不展示命令路径、参数或 stdout/stderr 内容。

## 现场 CUPS 队列预检 runner

如果要先不启动 ERP API、只确认当前机器能否访问真实 CUPS 队列，可以运行：

```bash
node scripts/run-cups-queue-preflight.mjs \
  --printer "标签机A" \
  --allowlist "标签机A,epson_lq_615kii_notes"
```

默认状态命令等价于：

```bash
lpstat -p "{cupsPrinterName}"
```

如果现场使用自定义命令或参数模板：

```bash
node scripts/run-cups-queue-preflight.mjs \
  --printer "标签机A" \
  --allowlist "标签机A,epson_lq_615kii_notes" \
  --status-command lpstat \
  --status-args-json '["-p","{cupsPrinterName}"]' \
  --json
```

退出码：

| 退出码 | 含义 |
| ---: | --- |
| `0` | 队列预检 ready。 |
| `1` | runner 或命令桥无法返回报告。 |
| `2` | 预检可运行，但队列、白名单或状态命令仍 blocked。 |

该 runner 直接复用命令桥 `cups-preflight`，仍然不读取订单 payload、不生成打印文件、不提交真实打印作业、不输出命令路径、不输出 stdout/stderr 内容、不输出 spool 路径。自动化校验命令为：

```bash
npm run cups-queue-preflight:check
```

自动化使用 `scripts/fake-cups-lpstat.mjs`，不会访问本机真实 CUPS。现场要证明真实 CUPS 队列可访问，必须在打印机器上用真实 `lpstat`、真实队列名和白名单运行本 runner。

## 状态回读口径

ERP 打印作业状态只接受脱敏状态摘要，不读取命令路径、stdout/stderr 或完整打印内容。

| spool / bridge 状态 | ERP 打印作业状态 | 说明 |
| --- | --- | --- |
| `queued` / `pending` / `processing` / `submitted` / `accepted` | `sent` | 命令桥已接单，但不能证明纸张已打出。 |
| `completed` / `complete` / `printed` / `done` / `success` / `succeeded` | `printed` | 只有明确完成状态才回写已打印。 |
| `failed` / `error` / `errored` | `failed` | 回写失败并保留脱敏错误码 / 信息。 |
| `canceled` / `cancelled` | `canceled` | 回写取消。 |

## spool 诊断接口

`GET /api/print-driver/spool-diagnostics` 用于上线前检查 ERP 侧 command_bridge 状态回读链路：

- 需要 `fulfillment.print` 权限。
- 只写诊断 spool 文件，不创建业务打印作业。
- 不调用 `ERP_SYSTEM_PRINTER_COMMAND`，不触发真实打印机。
- 检查 `queued` 是否能回读为 `sent`，`completed` 是否能回读为 `printed`。
- 检查诊断文件是否能清理。
- 响应不得暴露真实命令路径、命令参数、spool 路径或完整打印 payload。

该接口通过只能说明 ERP 与 spool 状态目录之间的写入 / 回读 / 清理正常，不能替代打印机物理出纸、纸张对位、条码扫描、驱动状态协议或现场 QA。

## 办公室设备模式维护

办公室 `打包/标签` 页的 `打印设备验收` 面板可以维护设备驱动模式：

- 当前只开放 `preview_only` 和 `system_printer` 两种目标模式。
- 保存调用 `POST /api/print-devices/{printDeviceId}/driver-mode`，需要 `fulfillment.print` 权限。
- 专用接口只更新 `settings.driverMode`、`updatedBy`、`updatedAt`，不能覆盖纸张、DPI、可打印单据类型等设备资料。
- 保存失败、API 不可用或权限不足时必须阻塞，不能在前端本地假保存。
- 保存成功只表示 ERP 设备资料允许进入对应驱动路径；现场 QA 记录仍需单独保存。
- 切到 `system_printer` 后，V1 门禁仍会继续检查系统打印配置、spool 回读、标签机 / 针式机现场 QA。

该入口用于把已准备接入的设备从演示模式推进到真实系统打印配置，不代表真实硬件已经出纸或现场验收通过。

## V1 上线就绪门禁

`GET /api/print-driver/v1-readiness` 是办公室判断打印链路是否可进入 V1 上线验收的总入口：

- 需要 `fulfillment.print` 权限。
- 汇总系统打印配置、本机环境预检、spool 诊断、CUPS 队列预检、V1 必需设备资料、设备驱动模式和最新现场 QA 记录。
- CUPS 队列预检必须通过；未通过时第 9 项 `cups-queue-preflight` 会阻塞 V1 打印上线。
- V1 必需设备当前按两类检查：快递/快运标签机、针式出库/自提/送货单打印机。
- 现场已知针式单据打印机型号为 `EPSON LQ-615KII`，内部设备 ID 为 `PRN-DOT-A`，建议队列名为 `epson_lq_615kii_notes`。设备资料、CUPS 队列预检、出库 / 自提 / 送货单样张和现场 QA 应优先围绕该设备登记 / 验收；型号和建议队列名都不是现场真实队列证明，仍需现场确认系统打印机名称 / CUPS 队列名、驱动名称、连接方式、纸张尺寸和对位参数。
- 设备必须设置为 `system_printer`，默认 `preview_only` 只能演示，不能算上线 ready。
- 最新现场 QA 记录必须通过 6 项：样张打印、纸张对位、条码扫码、驱动回写、内容清晰、作废重打。
- 最新现场 QA 记录还必须补齐 5 项证据摘要：样张 / 纸张证据、扫码证据、驱动或 spool 回写证据、作废重打证据、现场签认。
- 默认本地环境应返回 `blocked / ready=false`；只有真实配置和现场 QA 记录齐全时才允许返回 `ready=true`。

该门禁仍不替代现场验收。它只是把“哪些条件还没满足”聚合成一个可追踪报告，防止把页面可见或单个接口通过误判成真实打印可上线。

## V1 门禁命令行 runner

上线前或现场联调时，可以用 runner 直接检查运行中的 ERP API：

```bash
node scripts/run-print-v1-readiness-check.mjs \
  --api-base-url http://127.0.0.1:8787/api \
  --operator-id U-OFFICE-A
```

机器可读输出：

```bash
node scripts/run-print-v1-readiness-check.mjs \
  --api-base-url http://127.0.0.1:8787/api \
  --operator-id U-OFFICE-A \
  --json
```

退出码：

| 退出码 | 含义 |
| ---: | --- |
| `0` | API 可读，V1 打印门禁 ready。 |
| `1` | API 不可达、权限 / 读取失败或响应解析失败。 |
| `2` | API 可读，但 V1 打印门禁仍 blocked。 |

runner 只读取 `GET /api/print-driver/cups-diagnostics` 和 `GET /api/print-driver/v1-readiness`。它不会直接调用物理打印，也不会暴露命令路径、参数、stdout/stderr 内容、spool 路径或 payload。实际是否运行真实 CUPS `lpstat` 取决于当前后端配置；本地自动化校验仍使用 fake CUPS 状态命令。

本地自动化：

```bash
npm run print-v1-readiness:check
```

该校验会启动临时 API，覆盖默认 blocked、配置完整 ready、CUPS 预检、脱敏输出和退出码。

## 打印阶段 closeout

现场推荐先使用打印阶段执行器，一次性串联 CUPS 队列 non-printing 预检、运行中 API 打印 readiness 保存和打印 closeout：

```bash
node -- scripts/run-v1-print-chain-execution.mjs \
  --api-base-url https://<erp-host>/api \
  --operator-id <office-user> \
  --cups-printer "标签机A" \
  --cups-allowlist "标签机A,epson_lq_615kii_notes" \
  --field-evidence-manifest <filled-field-evidence-manifest>
```

如果现场使用自定义 `lpstat` 路径或参数模板：

```bash
node -- scripts/run-v1-print-chain-execution.mjs \
  --api-base-url https://<erp-host>/api \
  --operator-id <office-user> \
  --cups-printer "标签机A" \
  --cups-allowlist "标签机A,epson_lq_615kii_notes" \
  --cups-status-command lpstat \
  --cups-status-args-json '["-p","{cupsPrinterName}"]' \
  --field-evidence-manifest <filled-field-evidence-manifest>
```

该执行器默认写出：

- `.erp-local-storage/v1-cups-queue-preflight/latest.json`
- `.erp-local-storage/v1-print-readiness/latest.json`
- `.erp-local-storage/v1-print-chain-closeout/latest.json` / `latest.md`
- `.erp-local-storage/v1-print-chain-execution/latest.json` / `latest.md`

执行器本身仍然不提交物理打印、不生成样张、不修改现场证据 manifest、不改业务数据；它只减少“现场漏跑 CUPS / readiness / closeout 或漏存 latest”的风险。真实标签机 / 针式机出纸、纸张对位、条码扫码、spool 或驱动回写、作废重打必须先完成并回填到 `print_hardware` 现场证据。

本地自动化：

```bash
npm run v1-print-chain-execution:check
```

如需排查，也可以继续按下面的分步方式执行。

真实打印链路签收前，先保存一份运行中 API 的打印 readiness JSON：

```bash
mkdir -p .erp-local-storage/v1-print-readiness
node scripts/run-print-v1-readiness-check.mjs \
  --api-base-url https://<erp-host>/api \
  --operator-id <office-user> \
  --json > .erp-local-storage/v1-print-readiness/latest.json
```

现场负责人完成真实标签机 / 针式机样张、纸张对位、条码扫码、spool 或驱动回写、作废重打后，把对应证据引用填入现场证据 manifest 的 `print_hardware` 组，再运行：

```bash
node scripts/run-v1-print-chain-closeout.mjs \
  --print-readiness-json .erp-local-storage/v1-print-readiness/latest.json \
  --field-evidence-manifest <filled-field-evidence-manifest>
```

该 closeout 只读取已保存的 readiness 报告和现场证据 manifest，不调用 API、CUPS、打印机或外部服务。默认会检查 readiness 是否 ready、CUPS 非打印预检是否 ready、`print_hardware` 7 项证据是否 `passed` / `accepted` 且有 evidenceRef、真实出纸 / 扫码 / 对位 / 作废重打证明是否覆盖，以及报告脱敏和非打印护栏是否完整。它只代表打印阶段是否可交给办公室 / 仓库负责人签收，不代表 V1 全部完成。

本地自动化：

```bash
npm run v1-print-chain-closeout:check
```

## ERP V1 总门禁 runner

如果要把打印门禁和其它 V1 上线前置项一起检查，使用总 runner：

```bash
node scripts/run-v1-readiness-check.mjs \
  --api-base-url http://127.0.0.1:8787/api \
  --operator-id U-OFFICE-A
```

机器可读输出：

```bash
node scripts/run-v1-readiness-check.mjs \
  --api-base-url http://127.0.0.1:8787/api \
  --operator-id U-OFFICE-A \
  --json
```

总 runner 当前检查：

- API 健康检查。
- OpenAPI 合同状态。
- 当前账号是否具备 `attachment.view` 和 `fulfillment.print`。
- 附件对象存储运行时诊断。
- 打印 spool 状态回读诊断。
- CUPS 队列预检。
- 打印 V1 上线门禁。

退出码：

| 退出码 | 含义 |
| ---: | --- |
| `0` | API 可读，V1 总门禁 ready。 |
| `1` | API 不可达、读取失败或响应解析失败。 |
| `2` | API 可读，但权限、附件、打印或 OpenAPI 等门禁仍 blocked。 |

本地自动化：

```bash
npm run v1-readiness:check
```

该校验会启动临时 API，覆盖默认 blocked、配置完整 ready、权限不足 blocked、脱敏输出和退出码。总 runner 只合并上线前证据，不触发物理打印，也不等于真实对象存储、司机真机或生产部署已经验收通过。

## 验收边界

- 命令桥 `spool_only` 提交成功只代表作业被本机 wrapper 接收。
- 命令桥 `cups_lp` 提交成功只代表 CUPS / `lp` 接收作业，不代表纸张已经打出。
- spool `completed` 是本地桥状态证据，不等于打印机硬件状态协议。
- 物理通过必须另有打印设备现场 QA：样张、纸张对位、条码扫码、驱动回写、内容清晰、作废重打。
- 前端和 API 不能暴露真实命令路径、原始参数、spool 路径、stdout/stderr 或完整打印 payload。

## 本地验证命令

```bash
npm run print-driver-config-api:check
npm run print-command-bridge:check
npm run cups-queue-preflight:check
npm run print-job-command-bridge-status:check
npm run print-driver-adapter:check
npm run print-v1-readiness:check
npm run api:check
npm run build
```
