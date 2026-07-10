# V1 / V2 范围差异

最后更新：2026-07-05

## 结论

当前系统还没有完成可上线 V1。P0 原型主流程已能演示，V1 重点应继续放在真实数据、真实设备、真实持久化、权限审计和现场 QA；V2 再做自动化、优化算法、深度经营分析和更复杂的移动 / 企微能力。

## 版本口径

| 版本 | 目标 | 不做什么 |
| --- | --- | --- |
| V1 | 单工厂核心 ERP 闭环可用：录单、库存、出库交付、打印、打包、司机、对账收款、基础资料、安全审计和现场验收。 | 不追求自动读客户群、不自动回复客户、不做复杂排产优化、不做完整工资 / 原材料 / 成本财务闭环。 |
| V2 | 在 V1 稳定后提高效率：自动化识别、企微接入、路线 / 排产优化、客户画像、成本毛利、售后责任和更多管理报表。 | 不替代 V1 的人工确认、安全权限、审计日志和异常回退机制。 |

## 模块差异

| 模块 | V1 范围 | V2 范围 |
| --- | --- | --- |
| 订单录入 | 人工粘贴识别、规则解析、人工修正、正式保存前库存 / 价格复核。 | 客户群 / 图片 / OCR / AI 自动识别，简单高可信订单可推荐自动成单。 |
| 库存 | 精确库存键、占用、出库扣减、库存流水、修正审批、初始库存导入。 | 更完整库位、补货预测、慢动销分析、多仓策略和扫码盘点优化。 |
| 出库 / 打包 / 标签 | 自提、送货、快递快运主流程，标签 / 单据模板，作废重打，真实打印现场 QA。 | 更多客户打包偏好、批量优化、承运商接口和更细的包裹追踪。 |
| 打印设备 | 配置、队列、命令桥、spool 回读、CUPS 队列预检、设备 QA 记录，真实标签机 / 针式机验收。 | 厂商 SDK 深度状态、自动补打策略、多设备负载和耗材统计。 |
| 司机端 | 装车核包、送达水印证据、原生扫码 / 导航桥接、真机现场验收。 | 路线优化、司机绩效、实时位置、更多原生能力和异常自动分派。 |
| 对账 / 收款 | 客户优先对账、Excel 导出、发送归档、收款差额、付款凭证和附件审计。 | 企微回执自动抓取、付款截图 OCR、客户自助确认和更深财务报表。 |
| 基础资料 | `.xlsx` 模板、上传预检查、确认队列、确认计划、执行记录、权限和审计边界。 | 主数据维护后台、批量合并、历史版本对比、自动清洗和更多外部系统同步。 |
| 生产 / 排产 | 任务池、报工、打包完成、机器计数口径正确、基础看板、人工排产、手工调序、跨机台移动 / 插队、移动原因、影响预览、操作留痕、车间手机端成品图拍照/选择上传、办公室复核 / 退回重拍 / 待通知客户待办。 | 排产优化、自动插单建议、产能预测、换模优化、大屏深度联动、客户消息自动发送、图片质量自动识别。 |
| 原材料 / 成本 | V1 已推进到原材料入库 API / 持久化、整卷/整件机边领料、机边领料生产任务匹配校验、按重量拆卷部分领料、确认消耗、按重量部分消耗、余料退回和余料复核转可用第一版、原材料成本分摊草稿、成本确认、损耗校准、订单毛利快照和毛利快照财务复核 / 内部毛利报表第一版、月结 Excel 预检、白侯纸管扣项 `3.5 元/件` 结构化规则、人工复核草稿、正式对账确认留痕、财务应付草稿和付款确认第一版；`机边领料` 只允许已贴标可用卷/件生成 `RMI-ISS-*`，整卷/整件进入 `机边领用`，按重量拆卷生成 `RMI-SPLIT-*`、保留原卷剩余可用重量并创建机边子卷，不生成成品数量；`确认消耗` 生成 `RMI-CONS-*`，整卷/整件进入 `已消耗`，按重量部分消耗保留机边剩余重量并标记 `部分消耗/机边`；`生成成本草稿` 仅由财务 / 管理对已确认消耗且已匹配生产任务的记录生成 `RMCA-*`，`确认成本草稿` 生成 `RMCC-*` 并把成本状态推进到 `已复核/待损耗校准`，按入库单价快照和消耗重量 / 件数形成 `confirmed_material_cost_snapshot` 原材料成本快照；`校准损耗` 生成 `RMCL-*`，记录预计合格产量、实际合格产量、损耗数量和损耗率，把成本状态推进到 `已校准/待毛利确认` / `损耗已校准待毛利确认`，形成 `loss_calibrated_material_cost_snapshot`；`生成毛利快照` 生成 `RMMG-*`，按订单行销售金额和已校准材料成本计算材料成本、毛利额和毛利率，把成本状态推进到 `毛利快照待复核`；`复核毛利快照` 要求订单销售金额完整，生成 `RMMR-*` 内部毛利报表并推进到 `毛利已复核/报表可用` / `已财务复核/报表可用`，但仍不写客户对账、不登记收款、不确认最终客户结算；`余料退回` 生成 `RMI-RET-*` 并进入 `余料待复核`，`复核余料可用` 生成 `RMI-LREV-*` 并转回 `可用`；确认对账生成 `RMSRC-*`，财务 / 管理可从已确认对账生成 `RMSP-*` 应付草稿，并在全额付款时确认 `RMSPAY-*`，但仍不做多笔 / 部分付款或完整应付账龄。 | 更完整的原材料批次、真实机边扫码/领料现场确认、部分件数拆件规则、多供应商扣项规则维护后台、多笔 / 部分付款、应付账龄、毛利经营分析深化、跨批次 / 多订单深度归因和最终财务结算联动。 |
| 售后 / 责任 / 工资 | V1 记录关键异常线索，不自动扣款，不做完整工资结算。 | 售后闭环、责任分摊、绩效 / 扣款审批、考勤导入和工资草稿。 |
| 企微 / 自动化 | V1 人工复制、人工发送、人工确认；系统只提供待办、话术、成品图提示、复制记录和人工通知确认留档。 | 会话存档、识别、自动回复辅助、白名单试点、风控和 kill switch。 |

## V1 当前必须继续补的能力

1. 生产级持久化：当前默认本地运行实例的系统 V1 持久化门禁仍为 `1/7 通过`，因为默认服务还没有用生产级 PostgreSQL / 对象存储 profile 启动；代码层面已补统一 V1 持久化 profile、主数据导入复核 PostgreSQL 仓储和 `npm run v1-production-profile-live:check` 组合 live 校验。组合校验在临时 PostgreSQL + S3 兼容对象存储下能让系统持久化和附件留档通过，并在无现场证据时把顶层 readiness 从本地默认 `5/11` 推进到 `7/11`；同一脚本随后注入自动化打印 / 司机 QA 证据，可证明代码门禁在生产 profile 形态下达到 `11/11 通过`。本轮还补了 V1 生产环境变量预检、V1 现场验收报告留档工具、V1 现场证据 manifest 模板 / 校验器和 V1 发布候选聚合检查；当前本地发布候选结果仍为 `0/4 发布门禁通过，blocked`，其中生产环境变量预检 `2/9`、现场证据 manifest `0/34 证据 / 0/6 签字`、runtime readiness `5/11`、现场报告 `5/11`。发布候选检查会把生产环境变量预检、现场证据 manifest、运行时 readiness、现场验收报告和 V1/V2 差异合并为一份 READY/BLOCKED 报告；现场证据 manifest 会把真实 PostgreSQL、对象存储、CUPS / 打印机、司机真机、业务试运行和签字变成可填写、可校验的交付物，并作为第 4 个发布门禁阻止缺证据时误报 READY。V1 必须继续用真实 PostgreSQL / 对象存储、真实 CUPS / 打印设备和真实司机手机跑通同一总门禁，或由业务方明确接受本地持久化的备份、并发、磁盘、权限和灾备风险。
2. 主数据正式导入：继续补生产级用户表、强制改密、更多外部 Excel 样本兼容、失败行修正再导入和真实数据现场验收。
3. 真实打印：标签机、针式机、CUPS / 厂商 SDK、纸张对位、条码扫描和打印状态回写。
4. 司机真机：Android / iOS 原生壳、扫码 SDK、导航 SDK、权限、物理标签和现场 QA。
5. 对象存储：付款凭证、客户确认、成品图、送达 / 签收照片等附件已需要运行时预检、V1 留档门禁和 HTTP 级 S3 兼容 live 检查；后续继续接真实 OSS/S3/COS bucket live 验证、凭证管理、备份巡检和现场验收。
6. 生产环境：数据库凭证、部署配置、备份、权限审计、日志和多账号并发验证。

## 本轮已推进的 V1 边界

ERP 现在已补 V1 总 readiness 命令行 runner：`scripts/run-v1-readiness-check.mjs` 可以对运行中 ERP API 一次性读取健康检查、OpenAPI 合同、系统持久化门禁、办公室验收账号权限、司机验收账号权限、附件对象存储诊断、附件 V1 留档门禁、打印 spool 诊断、CUPS 队列预检、打印 V1 上线门禁和司机端 V1 真机门禁，总门禁当前为 11 项，输出脱敏文本或 JSON 报告，并用退出码区分 `ready`、`API/读取错误` 和 `blocked`。当前本地实时结果是 `5/11 通过`，其中系统持久化、附件 V1 留档、打印 spool、CUPS、打印 V1、司机真机仍 blocked。runner 支持独立 `--driver-operator-id`，默认办公室账号检查附件 / 打印，司机账号检查司机端，避免为了总门禁扩大办公室权限；`npm run v1-readiness:check` 已覆盖默认阻塞态、配置完整 ready 态、权限阻塞、脱敏和退出码。该 runner 属于 V1 运维验收能力，不是 V2 自动化；但它仍不替代生产级数据库 / 对象存储、真实打印出纸、司机真机、生产部署或现场 QA。

ERP 现在已补 V1 发布候选聚合检查：`scripts/run-v1-release-candidate-check.mjs` 会把生产环境变量预检、现场证据 manifest、运行中 API readiness、现场验收报告和 V1/V2 范围差异合成一份 release-candidate Markdown / JSON 报告，并维护 `latest.md` / `latest.json`。该工具用于回答“现在 V1 是否完成”和“计划 V2 与 V1 有什么不同”：V1 是人工可控核心闭环 + 生产持久化 + 真实设备 / 真机验收，V2 是自动化识别、企微、路线 / 排产优化、成本毛利、售后工资和更多经营分析。该检查属于 V1 发布沟通和交接能力，不是 V2 自动化；READY 仍需负责人复核真实环境和现场证据，BLOCKED 不能被描述为 V1 已完成。

ERP 现在已补 V1 完成度快照：`scripts/run-v1-completion-snapshot.mjs` 会把 release-candidate、现场任务板、模块完成度和 V1/V2 范围差异合成 `.erp-local-storage/v1-completion-snapshot/latest.md` / `latest.json`。该快照用于向业务说明当前 V1 到底完成到哪里、哪些阻塞还在、V2 与 V1 有哪些计划差异；本轮实跑仍为 `BLOCKED`，需求确认 `85-90%`、P0 原型 / 代码 `97-98%`、V1 真实上线就绪 `80-83%`、发布候选 `0/4`、现场任务 `52`。它属于 V1 状态沟通和交接能力，不是 V2 自动化，也不替代发布候选 READY、现场证据 manifest ready、岗位任务清零和负责人签字。

ERP 现在已补 V1 现场角色任务清单：`scripts/run-v1-onsite-task-board.mjs` 会从 release-candidate JSON 和现场证据 manifest 生成 `.erp-local-storage/v1-onsite-task-board/`，把发布阻塞项、未完成证据、负责人签字和 V1/V2 边界确认拆给技术/管理、办公室、仓库/出库、车间、司机和财务。该工具属于 V1 现场执行分工和交接辅助，不是 V2 自动化，也不提高真实上线完成度；最终仍以 release-candidate READY、现场证据 manifest ready、负责人签字和 V1/V2 边界确认作为完成标准。

ERP 现在已补 V1 上线交接包生成器：`scripts/run-v1-go-live-handoff-pack.mjs` 会把当前发布候选报告、现场证据 manifest 校验状态、生产 env 模板、发布前 runbook、现场证据填写说明和 V1/V2 范围差异复制到 `.erp-local-storage/v1-go-live-handoff/`。该工具默认只写脱敏现场证据 manifest，不复制真实 env 文件，也不输出原始 `evidenceRef`；它属于 V1 现场部署和负责人复核辅助，不是 V2 自动化，也不改变发布候选 blocked 结论。

ERP 现在已补 V1 生产环境变量模板和发布前执行清单：`docs/development/v1-production.env.example` 只包含注释占位值，覆盖 PostgreSQL profile、对象存储、对账导出留档、打印 command_bridge、CUPS 队列预检、readiness 账号、现场报告和 release-candidate 输出；`docs/development/v1-go-live-runbook.zh-CN.md` 给出从预检、迁移、runtime readiness、现场报告到 release-candidate 的执行顺序，并再次明确 V1/V2 边界。该能力属于 V1 部署准备，不是 V2 自动化；模板通过校验只代表配置项齐全，不代表真实环境已配置。

ERP 现在已补 V1 现场证据 manifest 模板和校验器：`docs/development/v1-field-evidence-manifest.template.json` 默认列出 34 个必填现场证据项、6 个角色签字和 V1/V2 边界确认，全部为 `pending`；`scripts/validate-v1-field-evidence-manifest.mjs` 会在证据未填满、签字未完成或边界未确认时返回 blocked，并且不打印原始 evidenceRef。该能力属于 V1 现场验收和上线审批前置，不是 V2 自动化；它把线下证据收集变成可校验交付物，但不替代真实设备、真机、对象存储、业务试运行和负责人签字。

ERP 现在已补 V1 生产环境变量预检：`scripts/run-v1-production-env-preflight.mjs` 可以在启动真实 API 前检查 PostgreSQL profile、对象存储、打印命令桥、CUPS 预检、readiness 验收账号、现场报告输出目录和本地持久化接受开关；支持 `--env-file` / `--json`，并用退出码区分 ready / runner error / blocked。该工具只输出变量名、计数、状态和下一步，不输出连接串、endpoint、bucket、密钥、命令路径、命令参数、spool 路径或 payload。它属于 V1 部署防漏配置能力，不是 V2 自动化；通过预检后仍必须启动 API 并跑总 readiness、对象存储 live、打印现场 QA、司机真机 QA 和现场签字。

ERP 现在已补 V1 现场验收报告留档工具：`scripts/run-v1-field-acceptance-report.mjs` 复用总 readiness runner，把 11 项门禁、分模块状态、阻塞项、现场必须留档证据、安全护栏和下一步写成 Markdown / JSON，并维护 `latest.md` / `latest.json`。blocked 时默认仍退出 `2`，避免把报告生成误解为验收通过；需要阶段性存档时可显式使用 `--allow-blocked-exit-zero`。该工具属于 V1 现场交接和审计留档能力，不是 V2 自动化；当前本地报告仍为 `5/11 通过，blocked`。

ERP 现在已补统一 V1 持久化 profile：`createApiServer(...)` 可用 `v1PersistenceProfile` / `persistenceProfile`，部署环境可用 `ERP_V1_PERSISTENCE_PROFILE=postgres`、`ERP_V1_FILE_STORAGE_PROFILE=object_storage` 和 `ERP_V1_DATABASE_URL`，让已支持仓储默认走 PostgreSQL、文件留档默认走对象存储；显式仓储对象或单仓储 `mode` 仍优先。主数据导入复核仓储也已纳入该 profile，并已用 Docker PostgreSQL live 检查验证建表、写入、查询和 API 启动。`/api/health` 和 `/api/system/v1-readiness` 只输出脱敏 profile 摘要，不输出连接串、路径、endpoint 或密钥。该能力属于 V1 部署和上线门禁硬化，不是 V2 自动化；它降低配置遗漏风险，但不会把真实对象存储、现场打印或司机真机证据自动算通过。

ERP 现在已补统一 V1 生产 profile 组合 live 校验：`scripts/check-v1-production-profile-live.mjs` 会同时启动临时 PostgreSQL、应用迁移、启动本地 S3 兼容对象存储端点，并用 `repositoryMode=postgres + fileStorageMode=object_storage` 启动 ERP API。该检查先确认系统持久化门禁和附件 V1 留档门禁在生产 profile 下能通过，顶层 readiness runner 在无现场证据时应为 `7/11 通过`，只剩打印 spool、CUPS、打印 V1 和司机真机门禁 blocked；随后脚本用 non-printing command_bridge / fake CUPS 和通过 API 写入的打印设备 QA、司机原生真机 QA 自动化证据，验证同一生产 profile 形态下总门禁可达 `11/11 通过`。该能力属于 V1 部署形态和代码门禁验收，不是 V2；真实生产凭证、真实 OSS/S3/COS bucket、真实打印机、真实司机手机和现场 QA 仍必须单独完成。

系统现在已补 V1 持久化门禁：`GET /api/system/v1-readiness` 只读汇总 28 个核心仓储的运行时模式，默认把 `local_memory` / `local_json` / `local_fs` 判为 V1 阻塞，除非服务端显式接受本地持久化用于 V1。该接口不输出业务数据、连接串、本地路径或密钥；它把“当前是否仍靠本地内存 / 本地文件运行”从人工判断变成可执行门禁。生产级持久化属于 V1 必做项，不应后移到 V2。

司机端现在已补 V1 真机上线就绪门禁：`GET /api/driver/v1-readiness` 复用 `delivery.view` 权限，只读聚合司机送货任务读取、最新司机手机现场验收记录、6 项现场检查、原生扫码桥接、原生导航桥接和纸质包裹标签原生扫码样本。普通浏览器的 `原生 0/2` 会明确返回 blocked，纸质标签样本必须是 `native_sdk` 且匹配包裹才算通过。该能力属于 V1 现场验收门禁，不是 V2 路线优化或司机绩效；真实 Android / iOS 原生壳、真机权限、真实标签扫码、地图 App 打开、水印拍照和现场签认仍必须线下完成。

打印链路现在已补现场 CUPS 队列 non-printing 预检 runner：`scripts/run-cups-queue-preflight.mjs` 可以在打印机器上直接复用命令桥 `cups-preflight`，用真实 `lpstat -p {cupsPrinterName}` 类状态命令检查 CUPS 队列是否可访问、是否命中白名单、状态命令是否可运行，并用退出码区分 ready / runner error / blocked。该能力属于 V1 现场验收前置工具，不读取订单 payload、不生成打印文件、不提交真实打印作业、不暴露命令路径或 stdout/stderr 内容。它把“真实 CUPS 队列是否能被当前机器访问”从文档步骤变成可执行检查，但仍不替代物理样张、纸张对位、条码扫码、作废重打、厂商 SDK 状态和现场签认。

打印链路现在已补 V1 readiness 命令行 runner：`scripts/run-print-v1-readiness-check.mjs` 可以对运行中 ERP API 读取 CUPS 队列诊断和 V1 打印上线门禁，输出脱敏文本或 JSON 报告，并用退出码区分 `ready`、`API/读取错误` 和 `blocked`。这让现场联调或部署前检查不只依赖人工打开页面，也不需要手动拼多个 API 请求；`npm run print-v1-readiness:check` 已覆盖默认阻塞态、配置完整 ready 态、CUPS 预检、输出脱敏和退出码。该 runner 属于 V1 运维验收能力，不是 V2 自动化；但它仍不替代真实 `lpstat`、真实标签机 / 针式机出纸、纸张对位、条码扫码、厂商 SDK 状态和现场操作员验收。

打印链路现在已补第一版 non-printing CUPS 队列预检，并已接入办公室诊断 UI 和 V1 打印上线门禁：`GET /api/print-driver/cups-diagnostics` 会在有打印权限账号下通过命令桥运行 CUPS 队列状态命令，例如 `lpstat -p {cupsPrinterName}`；`GET /api/print-driver/v1-readiness` 会把该结果作为 `cups-queue-preflight` 阻塞项。该接口要求 CUPS 打印机名命中白名单，不读取订单 payload、不生成打印文件、不提交真实打印作业，也不暴露命令路径、参数、stdout/stderr 内容、spool 路径或 payload。该能力用于上线前发现 CUPS 队列不存在、不可访问或状态命令不可运行的问题，属于 V1 真实打印链路硬化；真实出纸、纸张对位、条码扫码、作废重打、厂商 SDK 状态和现场操作员验收仍是 V1 后续工作，不应挪到 V2。

打印命令桥现在已补第一版可选 CUPS `lp` 提交边界：`scripts/print-command-bridge.mjs` 默认仍是安全的 `spool_only`，只有显式设置 `cups_lp` 模式、CUPS 命令、CUPS 打印机白名单和打印机名后才会调用 `lp` 或指定 CUPS 命令。CUPS 接收成功后，bridge 记录和 ERP 打印作业只进入 `sent`，不直接算 `printed`；已打印仍需要 spool `completed`、驱动回调、人工确认或现场 QA 证据。该能力属于 V1 真实打印链路硬化，不应被放到 V2；V2 只承接厂商 SDK 深度状态、自动补打策略、多设备负载和耗材统计等增强。

打印链路现在已补第一版 V1 上线就绪门禁：`GET /api/print-driver/v1-readiness` 会汇总系统打印配置、本机预检、spool 状态回读、CUPS 队列预检、V1 必需打印设备资料、设备驱动模式和最新现场 QA 记录。默认本地环境会明确返回 `blocked / ready=false`，避免把 `preview_only` 设备、缺 QA 记录、未配置 spool 回读或 CUPS 队列不可访问的环境误判为可上线；自动校验会在临时配置完整环境中确认门禁能返回 `ready=true`。该门禁用于办公室判断“当前系统证据是否满足 V1 打印上线条件”，不调用真实打印命令、不触发物理打印、不暴露命令路径、参数、spool 路径、stdout/stderr 内容或 payload。真实 CUPS / 标签机 / 针式机出纸、纸张对位、条码扫码、厂商 SDK、物理打印状态协议和现场操作员验收仍是 V1 后续硬化，不应被归入 V2。

打印命令桥现在已补第一版 V1 non-printing spool 状态回读诊断：`GET /api/print-driver/spool-diagnostics` 会在有打印权限账号下写入诊断 spool 状态文件，验证 `queued` 可回读为 `sent`，验证 `completed` 可回读为 `printed`，并清理诊断文件。该能力用于上线前发现 spool 目录不可写、状态文件格式不兼容或 poll 解析不可用等问题；它不创建业务打印作业、不调用系统打印命令、不触发物理打印，也不暴露命令路径、参数、spool 路径或 payload。真实 CUPS / 标签机 / 针式机、纸张对位、条码扫码、厂商 SDK、物理打印状态协议和现场 QA 仍是 V1 后续硬化，不应被归入 V2。

附件对象存储现在已补第一版 V1 运行时预检和留档门禁：`GET /api/attachments/storage-diagnostics` 会写入小型诊断对象、读回内容、校验 sha256 摘要并尝试清理；`GET /api/attachments/v1-readiness` 会进一步判断当前存储是否可作为 V1 生产附件留档。默认本地 `local_fs` 只能证明读写可用，不能自动算 V1 ready；只有真实对象存储诊断通过，或现场明确批准本地文件留档方案，门禁才会通过。这两个接口都不登记业务附件、不暴露密钥；真实 OSS/S3/COS bucket、凭证生命周期、网络策略、备份巡检、病毒扫描、断点续传和现场附件流程仍属于后续 V1 硬化。

附件对象存储现在还补了 HTTP 级 S3 兼容 live 检查：`scripts/check-attachment-object-storage-live.mjs` 会启动本地 S3 兼容 HTTP 端点和 `object_storage` 模式 ERP API，覆盖业务附件上传、权限读取、对象存储签名 URL 直连读取、访问审计、storage diagnostics、V1 留档门禁、诊断对象清理、SigV4 请求头存在和密钥脱敏。该能力属于 V1 部署形态和协议边界硬化，不是 V2 自动化；它证明代码路径能对接 HTTP 对象存储，但仍不替代真实 OSS/S3/COS bucket 的凭证、网络、生命周期、备份、病毒扫描、断点续传和现场验收。

附件上传现在已补第一版 V1 安全门：前端和后端都会按用途校验文件类型、MIME 和大小，付款截图必须是图片，送达水印 / 签收照片 / 定制成品图必须是图片，客户确认附件允许图片或 PDF，避免现场把错误文件或过大文件当成有效证据留档。该能力只做基础安全和业务口径拦截，仍不替代真实对象存储 live、病毒扫描、图片清晰度 / 内容质量识别、断点续传或真机拍照现场验收；这些属于后续 V1 硬化或 V2 自动化增强。

定制印刷成品图现在已推进到 V1 人工质量门：车间手机端可拍照/选择图片并上传成品图附件，办公室确认后才进入 `待通知客户` 公共待办，退回则进入 `成品图需重拍` 待办。`待通知客户` 已补可复制客户话术、成品图提示和人工确认已通知；复制只记录准备状态，确认才关闭待办。该动作只做质量复核和客户通知提醒，不入库、不占用、不生成打包任务、不自动给客户发消息。V2 仍保留自动图片质量识别、客户消息自动发送、企微 / 客户群自动化和更深现场拍照验收。

办公室排产现在已推进到 V1 人工可控边界：可发布排产，可按机台查看队列，可同机台调序，可跨机台移动 / 插队，可选择调整原因，并在移动前预览源机台重排和目标机台顺延影响；后端通过 `sequenceRemark` 和操作日志留痕，且这些动作都明确不入库、不占用、不生成打包任务。V2 仍保留自动插单建议、排产优化、产能预测、换模优化和大屏深度联动。
