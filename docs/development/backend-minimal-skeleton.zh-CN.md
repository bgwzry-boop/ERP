# 后端最小骨架说明

最后更新：2026-07-14

## 2026-07-12 存储 live precheck 边界

系统持久化与附件留档的当前运行时预检已集中到 `server/services/v1StorageLivePrecheckService.mjs`。该服务只读取注入的 readiness 结果并生成固定、脱敏的 API 投影；它不会刷新 release candidate、写业务数据、执行设备动作，也不会返回连接串、本地路径、诊断 storage key、摘要或原始异常。`server/apiServer.mjs` 只负责授权后的 handler 装配，运行时总门禁复用同一个 criterion 清洗函数。

直接回归入口为 `npm run v1-storage-live-precheck-service:check`，覆盖持久化 ready / blocked、附件留档 ready / blocked、异常固定映射和敏感错误不回显；该专项已纳入 `npm test`。

司机真机当前运行时预检也已集中到 `server/services/v1DriverLivePrecheckService.mjs`。它从安全配置选择司机验收账号，调用只读 readiness，并只输出任务计数、真机检查摘要、原生能力摘要和扫码样本存在性；原始任务、扫码文本、照片、位置、原生 payload 和底层异常均不进入响应。直接回归入口为 `npm run v1-driver-live-precheck-service:check`，且已纳入 `npm test`。

当前运行时 11 项总门禁的本机 API 探测、办公室 / 司机正式身份、readiness 来源聚合和脱敏投影已集中到 `server/services/v1RuntimeLivePrecheckService.mjs`。服务器自调用地址只取 Node socket 的本地端口并固定 `127.0.0.1`，请求 `Host`、`x-forwarded-proto` 和前端传入 API 地址均不参与探测目标；OpenAPI 通过三个布尔护栏固定该约束。直接回归入口为 `npm run v1-runtime-live-precheck-service:check`，且已纳入 `npm test`。

后台 API 目标统一由 `server/services/v1ApiTargetPolicy.mjs` 解析。runtime 自检只能使用 loopback；第一阶段执行和 release candidate 刷新可优先使用服务器安全 env 中的 `ERP_V1_RELEASE_API_BASE_URL`，未配置时回退当前 socket loopback。显式地址必须是 HTTP(S) 绝对 URL、不得含用户名 / 密码、query 或 fragment，且路径必须以 `/api` 结尾。浏览器 Host、转发协议和请求体地址不参与决策。直接回归入口为 `npm run v1-api-target-policy:check`，且已纳入 `npm test`。

## 定位

这是从前端本地 mock 过渡到真实后端前的最小 Node.js API 骨架。当前目标不是替代正式后端；大多数写入仍不写正式数据库。附件是第一条过渡边界：默认通过 `local_fs` 对象存储接口写本地文件，通过本地 JSON 索引保存摘要，也可以通过显式配置切到 PostgreSQL 附件元数据仓储和 S3 兼容对象存储签名边界；`npm run attachment-storage-live:check` 现在会启动本地 S3 兼容 HTTP 端点和 `object_storage` 模式 ERP API，验证附件上传、读取、签名 URL、storage diagnostics、V1 留档门禁、清理和脱敏。`npm run v1-production-env-template:check` 现在覆盖 V1 生产环境模板和发布前执行清单，确保模板包含预检变量、发布候选命令和 V1/V2 边界，且不包含真实敏感值。`npm run v1-field-evidence:check` 现在覆盖 V1 现场证据清单模板、填写校验器、默认 blocked、完整证据 ready、缺分组 invalid 和 evidenceRef 脱敏；真实运行时可用 `scripts/validate-v1-field-evidence-manifest.mjs --manifest <filled-manifest>` 校验生产持久化、对象存储、打印硬件、司机真机、业务试运行、运维、签字和 V1/V2 边界证据。`npm run v1-production-env-preflight:check` 现在覆盖生产环境变量预检，确保 PostgreSQL profile、对象存储、打印命令桥、CUPS 预检和验收报告配置在启动前就能被发现缺漏，并会把未替换的 `<REPLACE_WITH_...>` / `<OPTIONAL_...>` 模板占位值按未配置处理。`npm run v1-release-candidate:check` 现在覆盖 V1 发布候选聚合检查：它把生产环境预检、现场证据 manifest、运行时 readiness、现场验收报告和 V1/V2 差异合成一份脱敏 Markdown / JSON 报告，用于判断当前是 READY 还是 BLOCKED；没有填满证据的 manifest 时，发布候选不会通过。`npm run v1-production-profile-live:check` 进一步把 PostgreSQL repository profile 和 object-storage file profile 放在同一个临时 API 环境中验证：第一阶段确认系统持久化和附件 V1 留档能通过，且无现场证据时顶层 runner 正确停在 `7/11`；第二阶段用 non-printing command_bridge / fake CUPS、最小 PostgreSQL 送货任务、打印设备 QA 和司机原生真机 QA 自动化证据验证顶层 runner 可达 `11/11`，并检查证据写入 PostgreSQL。该 `11/11` 仍是自动化兼容证据，不是真实硬件 / 真机验收。`npm run v1-field-acceptance-report:check` 现在覆盖 V1 现场验收报告留档工具；真实运行时可用 `scripts/run-v1-field-acceptance-report.mjs` 把当前总门禁写成脱敏 Markdown / JSON 报告，但生成报告不代表验收通过。订单确认已进入第一条订单事务边界：保存并确认会在 PostgreSQL 模式下同步写 `original_orders`、`order_lines`、`price_snapshots`、`fulfillment_records`、`inventory_reservations`、`inventory_ledger_entries`、缺货 `todos` 和 `operation_logs`，并更新 `inventory_items.reserved_qty`。订单池读取已有第一轮仓储边界：本地模式保持 workspace 投影，PostgreSQL 模式从正式订单、明细、最新价格、出库、库存占用和对账状态组合列表 / 详情读模型。订单明细作废已有第一轮事务边界：未生产、未交付的正式明细作废时，会关闭 `order_lines`、取消未交付 `fulfillment_records`、释放该明细生效中的库存占用、写库存释放流水、写 `order_line_change_records` 和操作日志。订单明细改量已有第一轮事务边界：未生产、未交付的正式明细减量时释放多余占用，增量时重查可用库存并补占用，同时同步未交付出库任务数量、写库存流水、订单变更记录和操作日志。库存占用释放已有独立事务边界：释放全部或部分 reservation 会更新 `inventory_reservations.reserved_qty/status`、扣减 `inventory_items.reserved_qty`、写释放流水和操作日志。出库 / 交付动作也已有第一轮事务边界：打印、完成、确认快运拉走、取消出库和异常上报会更新 `fulfillment_records`，并按动作写 `print_records`、`fulfillment_exceptions`、`todos` 和 `operation_logs`；完成自提 / 送货或确认快运拉走且存在生效库存占用时，还会在同一事务内更新 `inventory_reservations`、扣减 `inventory_items.on_hand_qty`、释放 `inventory_items.reserved_qty` 并写 `inventory_ledger_entries` 出库流水；取消未交付出库任务时会释放该明细仍生效的库存占用、扣减 `inventory_items.reserved_qty` 并写 `source_type=fulfillment_cancel` 的库存流水。对账付款记录是另一条窄边界：付款登记可写入 `payment_records`，并且当前付款登记路由已能通过 PostgreSQL 事务同步更新 `statements`、写付款记录、差额待办和操作日志；差额处理、核销、标记已发送、发送回执和客户确认也已有独立的 PostgreSQL 事务边界。对账预览生成时已能在同一事务内写 `statement_lines`、`statement_export_files` 和 `operation_logs`。它用于验证 API 合同、固定基础路由形态，并让后续迁移脚本、真实种子数据和写入动作有落点。

V1 现场交接现在还有七个本地执行辅助边界：`npm run v1-go-live-suite:check` 覆盖 `scripts/run-v1-go-live-suite.mjs`，该脚本读取 release-candidate 和现场证据 manifest，一次性生成 `.erp-local-storage/v1-go-live-suite/` 下的现场任务、完成度快照、V1/V2 差异摘要、负责人摘要、现场证据采集包和上线交接包；如果现场负责人已经填写 `evidence-items.csv` 和 `signoff-boundary.csv`，suite 可先用 `--field-evidence-intake-csv` 与 `--field-evidence-signoff-boundary-csv` 生成新的 draft manifest，并基于 draft 生成下游材料，但不会覆盖源 manifest，未刷新 release-candidate 时也会提示旧门禁口径风险；suite 还可显式传入生产第一阶段执行、真实打印链路 closeout、司机真机 closeout JSON / Markdown，并把它们透传给上线交接包；最终发布判断需同时传 `--refresh-release-candidate`，让 release-candidate 门禁重新读取 draft manifest。`npm run v1-completion-snapshot:check` 覆盖 `scripts/run-v1-completion-snapshot.mjs`，该脚本把当前 release-candidate、现场任务板、模块完成度和 V1/V2 范围差异合成 `.erp-local-storage/v1-completion-snapshot/` 下的脱敏完成度快照；`npm run v1-v2-scope-brief:check` 覆盖 `scripts/run-v1-v2-scope-brief.mjs`，该脚本把 V1/V2 范围文档和完成度快照整理成 `.erp-local-storage/v1-v2-scope-brief/` 下的负责人差异摘要；`npm run v1-owner-decision-brief:check` 覆盖 `scripts/run-v1-owner-decision-brief.mjs`，该脚本把完成度快照整理成 `.erp-local-storage/v1-owner-decision-brief/` 下的负责人决策摘要，直接回答是否可以宣布 V1 完成、已完成 / 未完成项、下一步和 V2 差异；`npm run v1-onsite-task-board:check` 覆盖 `scripts/run-v1-onsite-task-board.mjs`，该脚本把当前 release blocker、现场证据、签字和 V1/V2 边界确认拆成技术/管理、办公室、仓库/出库、车间、司机、财务的脱敏任务清单，输出到 `.erp-local-storage/v1-onsite-task-board/`，并额外生成 `.erp-local-storage/v1-onsite-task-board/roles/*.latest.md` 岗位独立文件；`npm run v1-field-evidence-intake:check` 覆盖 `scripts/run-v1-field-evidence-intake-pack.mjs`，该脚本把现场证据 manifest 拆成 `.erp-local-storage/v1-field-evidence-intake/` 下的 6 个证据组采集单、`evidence-items.csv`、`signoff-boundary.csv`、签字和 V1/V2 边界确认单；`npm run v1-go-live-handoff:check` 覆盖 `scripts/run-v1-go-live-handoff-pack.mjs`，该脚本把当前发布候选、完成度快照、负责人决策摘要、生成后的 V1/V2 差异摘要、现场证据采集包、现场证据 manifest、生产 env 模板、发布前 runbook、现场证据填写说明、V1/V2 源范围文档、生产第一阶段执行、打印 closeout 和司机真机 closeout 打到 `.erp-local-storage/v1-go-live-handoff/`，并在存在岗位清单、负责人摘要、V1/V2 差异摘要、证据采集包或阶段 closeout 时复制到交接包子目录，其中证据采集包会包含 `signoff-boundary.csv`。它们默认不复制真实 env 文件，不输出原始 `evidenceRef`、签字人或真实 env 值；它们用于现场执行和负责人复核，不代表发布候选已经 READY。

司机送货任务已有第一轮 API 边界：`GET /api/driver/delivery-tasks` 和详情路由从出库 / 交付记录生成司机任务读模型，装车确认、送达完成和异常上报复用出库动作事务更新 fulfillment 状态、操作日志和异常待办。司机任务读取已有第一轮仓储边界：本地模式保持 workspace 投影，PostgreSQL 模式从送货类 `fulfillment_records`、订单明细、客户、默认联系人 / 地址、包裹、有效打印记录、库存来源、送达证据和办公室复核字段组合列表 / 详情。司机派单 / 路线顺序已有表、读取和办公室写入边界：`driver_delivery_dispatches` 保存 fulfillment、司机、路线日期、趟次、站点顺序、派单状态、计划发车、派单人和备注；司机任务读取会 join 最新有效派单记录，列表优先按 `route_date / route_batch_no / stop_sequence` 排序，没有派单顺序时回退到状态 / 最晚时间；`POST /api/fulfillments/{fulfillmentId}/dispatch` 通过 `server/driverDeliveryDispatchRepository.mjs` upsert 派单记录并写操作日志，只允许有 `fulfillment.dispatch.update` 的办公室 / 管理账号编辑。送达完成要求水印照片证据，且现在可传 `watermarkedPhotoAttachmentId`；签收照片可选传 `signaturePhotoAttachmentId`。司机端证据上传复用附件 API，owner 为 fulfillment，purpose 为 `delivery_watermark_photo` / `signature_photo`，司机角色只持有窄权限 `attachment.delivery_evidence.create`。送达完成还会保存 `watermarkId`、水印文字、拍摄时间、地址、定位备注 / 可选 GPS 坐标和司机信息；同一份水印元数据会写入水印照片附件 `metadata` 和司机任务 read model。前端当前会在提交前生成带底部水印条的 JPEG 并作为普通附件上传，后端合同不依赖 Canvas 细节，只保存附件和 metadata。办公室证据复核已有第一轮 API：`POST /api/fulfillments/{fulfillmentId}/delivery-evidence-review` 要求 `delivery.evidence.review`，支持 `已复核` 和 `需重拍`，并写操作日志 / 退回待办。交付证据 / 复核扩展字段已进入 `fulfillment_records` PostgreSQL 迁移和 fulfillment action 事务边界，并由 live PostgreSQL 校验覆盖。当前仍未接真实内置拍照、导航和路线优化。

司机任务的本地/API fallback投影已统一到`server/services/driverDeliveryTaskProjectionService.mjs`：工厂货品简称、包裹归属/拆量、有效打印单号、路线、状态和下一步只保留一套实现。包裹已绑定其他履约时，即使订单行相同也不能进入当前任务；无显式包裹标签时显示`第 N/M 包`。PostgreSQL SQL投影仍由读取仓储负责并经过相同公开合同归一化。直接回归入口为`npm run driver-delivery-task-projection:check`，并已纳入司机API和全量测试。

公开`GET /api/health`已统一到`server/services/systemHealthProjectionService.mjs`：只输出固定白名单中的OpenAPI计数、公开业务计数、runtime安全配置、38项仓储/存储/adapter kind、production env应用状态和V1持久化profile。未知嵌套字段默认删除，kind与标识符做格式归一化，自由文本统一隐藏连接串、Token、服务地址和本机路径；服务只做纯投影，不读取环境变量、文件、数据库或网络。直接回归入口为`npm run system-health-projection-service:check`，并已纳入API安全和全量测试。

生产排产队列已有第一版正式记录边界：`server/services/productionMachineQueueReadService.mjs` 统一读取已发布或跨日继续的未完成任务，应用人工顺序、筛选、逐机台序号和数量汇总，并明确机器计数不影响库存；HTTP读取和排产写服务复用同一投影。`production_schedule_records` 保存同机台队列调序记录和跨机台移动历史，`server/productionScheduleRecordRepository.mjs` 支持本地 / PostgreSQL 模式，`POST /api/production-schedules/machine-queue/resequence` 通过该仓储 upsert 同机台队列顺序并写操作日志；`POST /api/production-schedules/machine-queue/move` 会更新 `production_tasks.machine_id`，把源机台记录标为 `moved`，在目标机台写入 `active` 队列记录，并写 `machine_reassignment` 操作日志。两个动作都继续不创建库存、占用、打包任务、报工或计费数量。该边界只覆盖队列顺序和第一版换机台记录持久化，不等同完整插单策略、换模工单、班次或产能排程引擎。

打印驱动已有第一版 non-printing 诊断边界：`server/services/printDriverDiagnosticsService.mjs`统一读取脱敏配置、spool诊断、CUPS诊断并组合V1打印就绪结果；HTTP路由只负责权限、认证操作人和响应适配，缺失适配器时返回安全阻塞投影。`GET /api/print-driver/spool-diagnostics` 复用 `fulfillment.print` 权限，通过 `server/printDriverAdapter.mjs` 的 `runSpoolDiagnostics(...)` 写入诊断 spool 状态文件、验证 `queued -> sent` 和 `completed -> printed` 回读、并清理诊断文件；`GET /api/print-driver/cups-diagnostics` 通过 `runCupsDiagnostics(...)` 运行 CUPS 队列状态预检，例如 `lpstat -p {cupsPrinterName}`，检查队列命令是否可运行。两条诊断都不创建业务打印作业、不触发真实打印机，不暴露命令路径、参数、stdout/stderr 内容、spool 路径或 payload；spool 诊断只证明 ERP 侧 command_bridge 状态回读链路可用，CUPS 队列预检只证明队列状态命令可访问，二者都不等同真实 CUPS / 标签机 / 针式机现场验收。`GET /api/print-driver/v1-readiness`把配置、预检、spool回读、标签机 / 针式机资料、驱动模式和现场QA记录聚合为V1上线就绪门禁；默认本地环境返回`blocked / ready=false`，只有配置完整、设备切到`system_printer`且最新现场QA全通过时才返回`ready=true`。

生产持久化留证运行态边界已集中到`server/services/v1ProductionPersistenceEvidenceLiveRunService.mjs`。该服务只调用注入的固定无参数命令，把报告交给既有生产状态脱敏器，并统一生成成功/阻塞/失败响应、阻塞摘要和服务端配置指引；HTTP请求体中的路径、连接串或env值不会进入命令或响应。该入口默认不执行迁移apply、不授权恢复验证库重置、不写业务数据、不触发打印，也不刷新release candidate或go-live suite。直接回归入口为`npm run v1-production-persistence-evidence-live-run-service:check`，并已纳入V1状态API和全量测试。

生产第一阶段执行运行态边界已集中到`server/services/v1ProductionFirstStageExecutionLiveRunService.mjs`。该服务从组合根注入安全API目标解析器，只把解析后的服务端目标传给固定第一阶段命令；请求体、Host和转发头不能选择或获得目标地址。成功、阻塞和失败均使用既有生产状态脱敏器与统一阻塞清洗器，默认不合并真实值、不执行迁移apply或恢复库重置、不写业务数据、不触发打印，也不刷新release candidate或go-live suite。直接回归入口为`npm run v1-production-first-stage-execution-live-run-service:check`，并已纳入V1状态API和全量测试。

生产真实值dry-run运行态预检已集中到`server/services/v1ProductionFirstStageValuesDryRunLivePrecheckService.mjs`。该服务只接受服务端配置的唯一片段文件，并在固定dry-run命令前完成片段审计、setup目标和当前文件绑定proof检查；请求体和查询参数不能选择或获得文件、路径、连接串或真实值。成功、阻塞和失败均返回脱敏投影，不合并真实值、不执行迁移apply或恢复库重置、不写业务数据、不触发打印，也不刷新release candidate或go-live suite。直接回归入口为`npm run v1-production-first-stage-values-dry-run-live-precheck-service:check`，并已纳入V1状态API和全量测试。

生产真实值共享安全状态已集中到`server/services/v1ProductionEnvValuesSafetyStatusService.mjs`。该服务统一服务端真实值来源、片段审计、production env setup目标、dry-run文件绑定proof和来源状态投影，并供上线状态、dry-run预检与正式合并复用；来自审计/setup依赖的label、detail和nextAction全部经过连接串、Token、命令值和路径敏感清洗。直接回归入口为`npm run v1-production-env-values-safety-status-service:check`，并已纳入V1状态API和全量测试。

生产真实值正式合并拆为两个可独立验证的边界：`server/services/v1ProductionEnvValuesApplyService.mjs`只负责服务端开关、唯一片段、setup目标、片段审计、当前文件绑定dry-run proof和固定合并命令的顺序；`server/services/v1ProductionEnvValuesApplyStatusService.mjs`只负责10态门禁、live-run响应、服务端配置指引和完整敏感状态二次清洗，不持有合并命令。执行服务继续以相同四方法门面兼容API调用方。请求体不能选择文件、值或执行顺序，阻塞路径不写生产env、不执行迁移、不写业务数据、不触发打印或发布刷新。直接回归入口为`npm run v1-production-env-values-apply-service:check`和`npm run v1-production-env-values-apply-status-service:check`，并已纳入V1状态API和全量测试。

V1上线状态响应组合已集中到`server/services/v1GoLiveStatusResponseService.mjs`。该只读服务接收服务端产物读取器、D49构建器及production真实值来源/正式合并门禁投影，统一完成产物汇总、脱敏投影、完成审计和安全护栏；`apiServer.mjs`只负责依赖装配与一行委托。直接回归入口为`npm run v1-go-live-status-response-service:check`，并已纳入V1状态API和全量测试。

V1上线状态产物读取已集中到`server/services/v1GoLiveStatusArtifactReaderService.mjs`。该只读服务统一19类产物路径、主/备用文件优先级、JSON/文本读取以及缺失、读取失败、JSON损坏分类；候选文件损坏且没有有效备用时保留损坏证据，不再误报为缺失。文件系统路径只在服务端使用，不进入状态响应。直接回归入口为`npm run v1-go-live-status-artifact-reader-service:check`，并已纳入V1状态API和全量测试。

相关文件：

- `server/apiServer.mjs`：1,412行Node HTTP API组合入口，只负责启动、认证/授权服务装配、依赖注入及`routeGet / routeWrite`分发；不再定义业务、V1状态或文件响应包装函数。
- `server/routes/systemReadRoutes.mjs` / `server/routes/systemWriteRoutes.mjs`：系统V1 HTTP控制器；直接拥有readiness/status读取和21条现场证据、production env、持久化、司机、V1/V2及release refresh动作的权限、精确输入和响应映射，不读取前端路径/真实值，也不实现门禁、命令或脱敏细节。
- `server/services/persistentWorkspaceHydrationService.mjs`：统一核心集合、订单草稿、司机派单、原材料、正式身份、打印和附件的启动持久化读回；production缺失/空集合保持权威空状态，不向原材料仓储传seed，也不执行打印演示回填。
- `server/services/demoWorkspaceSeedService.mjs`：统一非生产环境的生产/打包任务与打印作业演示种子；production在任务生成前直接返回空，并在打印设备读取、仓储写入和日志构造前再次失败关闭。
- `server/services/v1LocalCommandRunnerService.mjs`：统一七个V1固定本地脚本的路径、参数、scope、退出码、超时和JSON进程合同；API只注入命名方法，不直接持有`spawn`或通用脚本入口。
- `server/services/rawMaterialCommandService.mjs`：统一原材料入库动作、供应商月结草稿/复核/确认、应付草稿和付款确认的操作人、仓储参数、错误投影与操作日志；同ID日志重放在当前投影中去重。
- `server/services/requestAuthContextService.mjs`：统一runtime/seed Bearer验签、旧身份Header、默认演示身份和有效权限覆盖；未传预解析认证时仍强制使用当前workspace安全策略。
- `server/writeActionPermissions.mjs`：冻结的服务端动作权限目录，统一路由所引用的权限名称，避免组合根或路由临时改写。
- `server/services/requestAuthorizationService.mjs`：统一单项/多项失败关闭授权、附件用途专属权限回退和审计操作人优先级；认证解析与授权判定分层测试。
- `server/routes/masterDataReadRoutes.mjs`、`driverReadRoutes.mjs`、`printReadRoutes.mjs`、`statementReadRoutes.mjs`、`attachmentReadRoutes.mjs`：分别拥有基础资料失败行下载、司机任务、打印设备QA、对账导出和附件列表/诊断/访问/内容的HTTP读取与文件响应映射；权限、分页、领域404、签名访问和脱敏合同由直接路由回归锁定，`apiServer.mjs`只装配依赖且不再定义`*Route`包装函数。
- `server/routes/masterDataWriteRoutes.mjs`：基础资料导入与员工账号8条写命令的HTTP控制器；直接调用命令服务并统一适配动态状态码和员工可信错误详情，组合根只注入依赖。
- `server/routes/inventoryWriteRoutes.mjs`：库存修正创建/附件/确认及占用释放的HTTP控制器；错误统一适配，修正确认继续复用权威数量快照、流水和待办投影，库存意图子路由保持独立。
- `server/routes/fulfillmentWriteRoutes.mjs`：履约异常、派单、打印、备货/完成/拉走、取消、交付证据复核和打印记录作废九条路径的HTTP控制器；直接调用动作/打印命令服务，并按路径静态选择标准响应或完整记录及404合同，库存扣减、打印和证据事务仍由命令服务与仓储负责。
- `server/routes/driverWriteRoutes.mjs`：司机手机端装车确认、设备QA、完成送达和异常上报四条路径的HTTP控制器；直接调用履约动作/设备QA命令服务并统一适配标准结果，任务访问、交付证据、库存扣减和现场验收规则仍由命令服务与仓储负责。
- `server/routes/printWriteRoutes.mjs`：打印批次、设备、驱动模式、设备QA及作业状态/派发/回读/轮询/重试十条路径的HTTP控制器；直接调用批次/设备/作业生命周期服务，显式保留原始JSON与完整记录响应、作业404、回调身份和QA非打印边界，物理打印只由作业派发命令内的驱动适配器触发。
- `server/routes/productionWriteRoutes.mjs`：排产发布、完工/日报报工、成品图上传/复核、机台队列重排/换机及打包完成八条路径的HTTP控制器；直接调用排产、报工、成品图和打包命令服务，标准结果统一适配，成品图保留任务、订单行、图片和待办专用响应投影。
- `server/routes/statementWriteRoutes.mjs`：预览、标记发送、发送回执、客户确认、收款、差额处理和核销七条路径的HTTP控制器；直接调用对账沟通/财务命令服务，统一使用标准命令结果适配，金额、附件、导出和事务规则留在领域服务与仓储。
- `server/routes/attachmentWriteRoutes.mjs`：附件创建HTTP控制器；权限通过后解析认证操作人，直接调用附件命令服务并只返回脱敏附件摘要，客户端上传人、存储键和对象存储细节不能进入公开响应。
- `server/routes/todoWriteRoutes.mjs`：待办处理、引用修复及历史缺履约补建HTTP控制器；直接调用待办命令服务，普通待办与履约补建使用各自权威读投影，引用校验、幂等、并发、事件和日志留在服务与仓储。
- `server/services/attachmentCreateService.mjs`：附件创建命令边界；认证操作人强制覆盖客户端上传人，校验、摘要、内容指纹、对象存储、去重、幂等和操作日志由同一服务链路提交。
- `server/services/driverDeviceFieldTestCommandService.mjs`：统一司机设备QA记录归一化、当前司机任务访问、权威任务与原生扫码/导航证据验收、仓储/日志写入和写后任务投影；保存记录不改变送货状态、不调用原生桥。
- `server/attachmentRepository.mjs`：附件摘要仓储边界，默认本地 JSON，显式配置时可生成 PostgreSQL 附件表写入 / 查询 SQL。
- `server/attachmentObjectStorage.mjs`：附件内容对象存储边界，默认 `local_fs` 写入 `.erp-local-storage/attachments/`；`object_storage` 配置完整时走 S3 兼容 AWS Signature V4 PUT / GET / DELETE 和直连签名 URL。
- `server/services/attachmentFileAccessService.mjs`：附件列表、短期访问地址、内容读取和访问审计编排；公开投影只返回存储状态，不返回服务器原始存储键。
- `server/services/printDriverDiagnosticsService.mjs`：打印驱动脱敏配置、spool/CUPS非打印诊断、安全fallback和V1打印就绪组合边界；不创建业务打印作业或触发物理打印。
- `server/services/v1ProductionPersistenceEvidenceLiveRunService.mjs`：生产持久化留证固定命令、脱敏结果投影、阻塞摘要、配置指引和固定失败合同；不接受前端路径或真实值，不写业务数据。
- `server/services/v1ProductionFirstStageExecutionLiveRunService.mjs`：生产第一阶段固定命令、安全API目标解析、脱敏结果投影、阻塞摘要、配置指引和固定失败合同；不接受前端目标、路径或真实值，不隐式执行生产写操作。
- `server/services/v1ProductionFirstStageValuesDryRunLivePrecheckService.mjs`：生产真实值dry-run的服务端来源、审计/setup/proof门禁、固定命令和脱敏失败合同；不接受前端路径或真实值，不执行正式合并或迁移。
- `server/services/v1ProductionEnvValuesSafetyStatusService.mjs`：生产真实值来源、审计/setup/proof共享状态与完整敏感文本清洗；供上线状态、dry-run和正式合并复用，不暴露路径、值或指纹摘要。
- `server/services/v1ProductionEnvValuesApplyService.mjs`：生产真实值正式合并写入状态机；按服务端开关、唯一片段、setup、审计和proof顺序调用受控命令，并以兼容门面委派状态投影。
- `server/services/v1ProductionEnvValuesApplyStatusService.mjs`：生产真实值正式合并10态门禁、live-run响应、服务端配置指引和二次敏感状态清洗；不持有或调用合并命令。
- `server/services/v1GoLiveStatusResponseService.mjs`：V1上线状态的产物汇总、投影脱敏、D49/production门禁组合与只读安全护栏；不读取文件、不写业务或发布产物。
- `server/services/v1GoLiveStatusArtifactReaderService.mjs`：V1上线状态19类产物的服务端路径解析、主/备用优先级和读取错误分类；不组合业务投影、不写文件、不暴露路径。
- `server/orderConfirmationTransactionRepository.mjs`：订单确认事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内写正式原始订单、订单明细、价格快照、出库任务、库存占用、库存流水、缺货待办和操作日志，并更新库存 reserved 数量。
- `server/orderPoolReadRepository.mjs`：订单池读取仓储边界，默认读当前 API workspace，显式 PostgreSQL 模式从 `original_orders`、`order_lines`、最新 `price_snapshots`、`fulfillment_records`、`inventory_reservations` 和对账状态生成订单池列表 / 详情读模型。
- `server/orderLineVoidTransactionRepository.mjs`：订单明细作废事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内关闭订单明细、取消未交付出库任务、释放库存占用、写库存流水、订单变更记录和操作日志。
- `server/orderLineQuantityAdjustmentTransactionRepository.mjs`：订单明细改量事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内更新订单数量、未交付出库任务数量、库存占用增减、库存流水、订单变更记录和操作日志。
- `server/fulfillmentActionTransactionRepository.mjs`：出库 / 交付动作事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内更新出库记录，并按动作写打印记录、异常记录、公共待办、操作日志、完成出库库存扣减、占用释放、出库库存流水和取消出库释放流水。
- `server/printDriverAdapter.mjs`：打印驱动适配器边界，默认 guarded，不触发真实系统打印；显式配置 `command_bridge` 后可调用受控本地命令，并提供 non-printing spool 状态回读诊断和 CUPS 队列状态预检。
- `server/printDeviceRepository.mjs`：打印设备资料仓储边界，保存标签机 / 针式机等设备能力、支持单据类型和驱动模式。
- `server/printerDeviceFieldTestRepository.mjs`：打印设备现场 QA 记录仓储边界，保存样张、对位、扫码、驱动回调、清晰度和作废重打等验收结果。
- `src/domain/printTemplates.js`：出库 / 交付打印模板数据生成，当前覆盖快递快运标签、自提针式单和送货针式单。
- `scripts/print-command-bridge.mjs`：`command_bridge` 本地命令 wrapper，默认 `spool_only`，把打印作业写入 `.erp-local-storage/print-command-bridge/queued/`；可选 `cups_lp` 会在显式配置 CUPS 命令和白名单后提交到 `lp`，但成功仍只代表 `sent`；`--action cups-preflight` 只运行 CUPS 队列状态预检，不读取 payload、不生成打印文件。
- `server/inventoryReservationReleaseTransactionRepository.mjs`：库存占用释放事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内更新占用记录、库存 reserved 数量、释放流水和操作日志。
- `server/paymentRecordRepository.mjs`：对账付款记录仓储边界，默认写当前 API workspace，显式 PostgreSQL 模式写入 / 查询 `payment_records`。
- `server/statementPaymentTransactionRepository.mjs`：收款登记事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内更新 `statements`、写 `payment_records`、可选写 `todos`，并写 `operation_logs`。
- `server/statementSettlementTransactionRepository.mjs`：差额处理 / 核销事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内更新 `statements`、写 `variance_records`、可选写 `todos`，并写 `operation_logs`。
- `server/statementSendTransactionRepository.mjs`：标记已发送 / 发送回执 / 客户确认事务边界，默认写当前 API workspace，显式 PostgreSQL 模式在一个事务内更新 `statements`、写或更新 `statement_send_records`、写 `statement_confirmation_records`，并写 `operation_logs`。
- `server/statementExportRepository.mjs`：对账预览 / 导出仓储边界，默认写当前 API workspace，显式 PostgreSQL 模式同事务替换 `statement_lines`、写 `statement_export_files` 元数据和 `.xlsx` base64 兜底内容，并写 `operation_logs`。
- `server/statementExportObjectStorage.mjs`：对账导出文件对象存储边界，默认 `local_fs` 写入 `.erp-local-storage/statement-exports/`；显式对象存储模式复用 S3 兼容 PUT / GET 签名，并保留数据库内容作为下载兜底。
- `server/authSeed.mjs`：办公室、库房、财务、管理、司机等 seed 账号的登录、签名 token、角色和有效权限合成。
- `server/services/runtimeAuthCommandService.mjs`：正式 / seed 登录、失败锁定、密码摘要升级 / 过期、首次改密、当前会话和 logout 撤销命令；有状态写入先持久化 staged identity workspace，再提交进程内投影。
- `server/services/masterDataEmployeeAccountCommandService.mjs`：正式账号启用/批量启用、临时密码、撤销和员工车间/机台调配命令；调配只接受服务端配置的车间/机台，固定机台要求两项显式匹配，杂工只存车间，暂未分配清空两项，审计操作人取认证上下文、时间取服务端时钟，浏览器`changedAt`不进入合同。
- `server/routes/authReadRoutes.mjs` / `server/routes/authWriteRoutes.mjs`：登录、原型登录、改密、当前会话和退出的HTTP控制器；直接调用统一认证命令服务，并由标准结果适配器保留命令状态码和响应体。
- `server/services/v1FieldEvidenceProjectionService.mjs`：V1 现场证据 / 签字 CSV 汇总、缺项待办、manifest 草稿摘要新鲜度、回填指导和质量门禁投影；只返回脱敏计数和操作摘要，不返回原始证据编号、签字人、摘要、本地路径或原始 CSV。
- `server/services/v1ProductionStatusProjectionService.mjs`：V1 生产 env 门禁 / setup / intake、生产持久化留证、第一阶段执行、修正清单、安全 env 模板和待办容量证据投影；容量证据会独立复核scope、72小时新鲜度、非本机HTTPS目标、正式runtime会话、GET-only硬上限和无副作用护栏，只返回白名单指标与下一步；自由文本与命令统一隐藏连接串、服务地址、bucket 值、token、敏感赋值、CLI 参数值、本机路径和目标签名。
- `server/services/v1ReleaseStatusProjectionService.mjs`：V1 完成度摘要、发布候选、负责人决策、模块完成度 / 差异和顶层阻塞投影；只返回脱敏文字、状态与有界计数。
- `server/services/v1FieldCoordinationProjectionService.mjs`：V1 解除阻塞计划、角色任务分类 / 汇总和 V1/V2 边界投影；保留结构化任务真值，并对所有阶段、角色、动作和边界说明脱敏。
- `server/services/v1CompletionAuditProjectionService.mjs`：V1 七项完成审计、运行门禁阻塞和现场验收报告投影；只有上游 ready 与七项标准全部通过时才允许完成声明。
- `server/services/v1StatusTextSanitizer.mjs`：跨 V1 状态域复用的短文本与敏感状态文本脱敏，统一处理证据 / 签字字段名、连接串、服务地址、bucket / token / CLI 值、本地路径和待填写占位符，不拥有业务门禁规则。
- `server/driverDeliveryTaskReadRepository.mjs`：司机送货任务读取仓储边界，默认读当前 workspace，显式 PostgreSQL 模式从送货出库记录、订单、客户、包裹、打印记录、库存来源、送达证据和 `driver_delivery_dispatches` 组合任务列表 / 详情，并按路线日期 / 趟次 / 站点顺序排序。
- `server/services/driverDeliveryTaskProjectionService.mjs`：司机任务本地读取与API写后响应共享的货品简称、包裹归属/拆量、有效打印、路线和状态只读投影；不执行派单、装车、送达或异常写入。
- `server/services/masterDataEmployeeAccountCommandService.mjs`：员工账号启用、批量复核、临时密码、撤销和手动机台调配命令，同时提供同一员工/账号口径的复核列表投影；列表不写身份状态，命令持久化失败仍整批回滚。
- `server/services/systemHealthProjectionService.mjs`：公开health固定白名单投影，统一runtime、仓储/存储kind、production env应用和V1持久化profile的安全摘要；未知字段不透传，自由文本做敏感值脱敏。
- `server/driverDeliveryDispatchRepository.mjs`：司机派单写入仓储边界，默认写当前 API workspace，显式 PostgreSQL 模式 upsert `driver_delivery_dispatches` 并写 `operation_logs`。
- `server/productionScheduleRecordRepository.mjs`：生产排产记录仓储边界，默认写当前 API workspace，显式 PostgreSQL 模式 upsert `production_schedule_records`、移动生产任务机台并写 `operation_logs`。
- `src/services/driverMobileApiClient.js`：司机手机端送货任务 API client，覆盖任务列表、装车确认、送达完成和异常上报。
- `src/services/driverWatermarkImageClient.js`：司机送达照片前端水印工具，生成水印文字行、导出带水印 JPEG，并提供 metadata-only 兜底。
- `server/seedData.mjs`：后端 seed 入口。
- `server/seeds/syntheticOfficeSeed.mjs`：把现有 P0 fixtures 适配为后端种子响应。
- `server/seeds/README.zh-CN.md`：seed 数据目录说明。
- `server/openapiValidation.mjs`：复用 Ruby YAML 解析校验 OpenAPI `$ref`。
- `scripts/check-api-skeleton.mjs`：启动临时 server 并校验核心路由。
- `scripts/validate-openapi.mjs`：单独校验 OpenAPI 草案。
- `scripts/check-db-migrations.mjs`：校验第一批迁移草案是否覆盖核心表。
- `scripts/check-attachment-repository.mjs`：校验附件本地 JSON 仓储和 PostgreSQL SQL 边界。
- `scripts/check-attachment-object-storage.mjs`：校验附件 `local_fs` 对象存储接口、data URL 兼容读取、诊断对象清理、S3 兼容 PUT / GET / DELETE 签名、签名 URL 和 token 校验。
- `scripts/check-attachment-object-storage-live.mjs`：启动本地 S3 兼容 HTTP 端点和 `object_storage` 模式 ERP API，校验业务附件上传 / 读取、对象存储签名 URL、附件 storage diagnostics、V1 留档门禁、诊断对象清理、SigV4 请求头和密钥脱敏。
- `scripts/check-object-storage-minio-live.mjs`：启动临时真实 MinIO 容器并创建附件 / 对账导出两个 bucket，校验两类文件写入、读回、删除、附件签名 URL、生产 V1 留档 readiness 和诊断对象清理；公开镜像可由 `ERP_MINIO_DOCKER_IMAGE` 固定替换，失败或 Docker 不可用时直接阻断。
- `scripts/assert-v1-production-release-gate.mjs`：最终生产放行断言，要求新鲜 release candidate `4/4`、现场证据至少 `34/34`、签字至少 `6/6`、V1/V2 边界确认、go-live suite ready 和全部脱敏护栏；成功只写 commit 与三份来源文件 SHA-256，不复制证据编号、签字人或 env 值。
- `.github/workflows/v1-production-release-gate.yml`：手工触发、受保护 Environment 审批、自托管生产 runner 执行的最终 V1 放行 CI；普通 push / PR 不会触发，真实 secrets 只解码到忽略目录并在结束时删除。
- `scripts/check-v1-production-profile-live.mjs`：启动临时 PostgreSQL、应用迁移、启动本地 S3 兼容 HTTP 端点，并用统一 V1 profile 启动 ERP API，校验系统持久化门禁、附件 V1 留档门禁、无现场证据时顶层 V1 runner `7/11` 阻塞边界，以及自动化打印 / 司机 QA 证据下 `11/11` 正向边界。
- `scripts/run-v1-production-env-file-audit.mjs`：在预检前审计真实 env 文件是否安全未跟踪、不是模板、没有未替换占位值，并保持不输出任何 env 值。
- `scripts/check-v1-production-env-file-audit.mjs`：校验 env 文件安全审计的通过、模板拒绝、占位符拒绝、warning、退出码和脱敏。
- `scripts/run-v1-production-env-preflight.mjs`：部署前检查 V1 生产环境变量是否齐全，输出脱敏文本 / JSON，blocked 默认退出 2。
- `scripts/check-v1-production-env-preflight.mjs`：校验生产环境变量预检的 blocked / ready / env-file / invalid JSON / warning / 退出码和脱敏。
- `scripts/generate-v1-production-env-template.mjs`：生成 V1 生产环境变量模板和发布前执行清单，默认输出模板，可写入 `docs/development/v1-production.env.example` 与 `docs/development/v1-go-live-runbook.zh-CN.md`。
- `scripts/check-v1-production-env-template.mjs`：校验 V1 生产环境模板与生成器同步、必需变量覆盖、runbook 命令和脱敏。
- `scripts/generate-v1-field-evidence-manifest.mjs`：生成 V1 现场证据 JSON 模板和中文填写清单，默认所有必填证据 pending。
- `scripts/validate-v1-field-evidence-manifest.mjs`：校验已填写 V1 现场证据 manifest，blocked 默认退出 2，invalid 退出 1，ready 退出 0。
- `scripts/check-v1-field-evidence-manifest.mjs`：校验现场证据模板 / 清单与生成器同步、默认 blocked、完整证据 ready、缺分组 invalid 和 evidenceRef 脱敏。
- `scripts/run-v1-release-candidate-check.mjs`：运行生产 env 文件安全审计、生产环境变量预检、现场证据 manifest、运行时 V1 readiness 和现场验收报告，生成 release-candidate Markdown / JSON，包含 V1 范围和计划 V2 差异；blocked 默认退出 2。
- `scripts/check-v1-release-candidate-check.mjs`：校验发布候选检查的 blocked / ready / env-file / unsafe env-file 阻塞 / blocked 留档、现场证据 manifest、V1/V2 范围、报告文件和脱敏。
- `scripts/run-v1-go-live-suite.mjs`：读取 release-candidate JSON 和现场证据 manifest，一次性生成现场任务、完成度快照、V1/V2 差异摘要、负责人摘要、现场证据采集包和上线交接包，并写入 `.erp-local-storage/v1-go-live-suite/`；可选读取现场 `evidence-items.csv`，先生成 draft manifest 再基于 draft 生成下游材料。
- `scripts/check-v1-go-live-suite.mjs`：校验 go-live suite 的 blocked 编排、V1/V2 差异摘要、现场 CSV 草稿回填、刷新发布候选、下游产物生成、负责人摘要复制进交接包、缺发布候选报错和脱敏。
- `scripts/run-v1-v2-scope-brief.mjs`：读取 V1/V2 范围文档和可选 V1 完成度快照，生成负责人可读的 V1/V2 差异摘要，明确 V2 延后项不等于 V1 阻塞项后移。
- `scripts/check-v1-v2-scope-brief.mjs`：校验 V1/V2 差异摘要的 blocked / ready、缺源文档、文本输出、V2 分类、文件生成和脱敏。
- `scripts/run-v1-owner-decision-brief.mjs`：读取 V1 完成度快照，生成负责人决策摘要，直接回答是否可以宣布 V1 完成、已完成 / 未完成项、下一步和 V2 差异；默认不输出原始 evidenceRef、签字人、真实 env 值或密钥。
- `scripts/check-v1-owner-decision-brief.mjs`：校验负责人决策摘要的 blocked / ready 场景、文件生成、缺快照报错、V2 差异和脱敏。
- `scripts/run-v1-onsite-task-board.mjs`：读取 release-candidate JSON 和现场证据 manifest，生成按角色分组的 V1 现场任务清单，默认脱敏 evidenceRef、签字人和真实 env 值。
- `scripts/check-v1-onsite-task-board.mjs`：校验现场任务清单的角色分组、release blocker、现场证据任务、签字任务、V1/V2 边界任务、文件生成、缺发布候选报错和脱敏。
- `scripts/run-v1-field-evidence-intake-pack.mjs`：读取现场证据 manifest，生成现场证据采集包，包含总览、机器索引、CSV、签字 / V1-V2 边界确认单和 6 个证据组采集单；默认不输出原始 evidenceRef。
- `scripts/check-v1-field-evidence-intake-pack.mjs`：校验证据采集包的 blocked / ready 场景、分组文件、CSV、可选报告、缺输入报错和脱敏。
- `scripts/run-v1-go-live-handoff-pack.mjs`：生成 V1 上线交接包，汇总发布候选、完成度快照、负责人决策摘要、生成后的 V1/V2 差异摘要、现场证据、env 模板、runbook、现场证据清单、V1/V2 源范围文档和待办容量证据；待办容量JSON/Markdown由请求数、吞吐、P50/P95、错误率及安全布尔字段白名单重建，不复制源payload、身份、API地址或源Markdown。默认写脱敏现场证据 manifest。
- `scripts/check-v1-go-live-handoff-pack.mjs`：校验交接包 blocked 场景、负责人摘要复制、V1/V2 差异摘要复制、默认脱敏、可选原始证据、必需文档和缺发布候选报错。
- `scripts/run-v1-field-acceptance-report.mjs`：读取运行中 ERP API 的 V1 总 readiness 结果，生成脱敏 Markdown / JSON 现场验收报告；blocked 默认退出 2，可显式留档。
- `scripts/check-v1-field-acceptance-report.mjs`：校验现场验收报告的 blocked / ready / blocked 留档、文件生成、退出码和脱敏。
- `scripts/check-payment-record-repository.mjs`：校验付款记录本地仓储和 PostgreSQL `payment_records` SQL 边界。
- `scripts/check-statement-payment-transaction-repository.mjs`：校验收款登记本地 workspace 变更和 PostgreSQL 事务 SQL 边界。
- `scripts/check-statement-settlement-transaction-repository.mjs`：校验差额处理 / 核销本地 workspace 变更和 PostgreSQL 事务 SQL 边界。
- `scripts/check-statement-send-transaction-repository.mjs`：校验标记已发送、登记发送回执和客户确认的本地 workspace 变更和 PostgreSQL 事务 SQL 边界。
- `scripts/check-order-confirmation-transaction-repository.mjs`：校验订单确认本地 workspace 变更和 PostgreSQL `original_orders + order_lines + price_snapshots + fulfillment_records + inventory_reservations + inventory_ledger_entries + todos + operation_logs` 事务 SQL 边界。
- `scripts/check-order-pool-read-repository.mjs`：校验订单池本地列表 / 详情标准化和 PostgreSQL `original_orders + order_lines + price_snapshots + fulfillment_records + inventory_reservations + statements` 读取 SQL 边界。
- `scripts/check-order-line-void-transaction-repository.mjs`：校验订单明细作废本地 workspace 变更和 PostgreSQL `order_lines + fulfillment_records + inventory_reservations + inventory_items + inventory_ledger_entries + order_line_change_records + operation_logs` 事务 SQL 边界。
- `scripts/check-order-line-quantity-adjustment-transaction-repository.mjs`：校验订单明细改量本地 workspace 变更和 PostgreSQL `order_lines + fulfillment_records + inventory_reservations + inventory_items + inventory_ledger_entries + order_line_change_records + operation_logs` 事务 SQL 边界。
- `scripts/check-fulfillment-action-transaction-repository.mjs`：校验出库动作本地 workspace 变更和 PostgreSQL `fulfillment_records + print_records + fulfillment_exceptions + todos + operation_logs + inventory_reservations + inventory_items + inventory_ledger_entries` 事务 SQL 边界。
- `scripts/check-driver-delivery-dispatch-repository.mjs`：校验司机派单本地 upsert 和 PostgreSQL `driver_delivery_dispatches + operation_logs` SQL 边界。
- `scripts/check-production-schedule-record-repository.mjs`：校验生产排产记录本地 upsert / 筛选，以及 PostgreSQL `production_schedule_records + production_tasks + operation_logs` 调序 / 跨机台移动事务边界。
- `scripts/check-fulfillment-print-template.mjs`：校验快递快运标签隐藏金额，以及自提 / 送货针式单显示明细、金额、联次和工厂短写。
- `scripts/check-print-command-bridge.mjs`：校验本地打印命令 wrapper 的 spool 写入、ID 防串单、路径限制、非法 JSON 拒绝、适配器调用和响应脱敏。
- `scripts/check-frontend-driver-mobile-api-client.mjs`：校验司机端 API client、司机任务本地 fallback、工厂短写、水印照片拦截、水印元数据、前端像素水印工具兜底、权限拒绝和异常上报映射。
- `scripts/check-inventory-reservation-release-transaction-repository.mjs`：校验库存占用释放本地 workspace 变更和 PostgreSQL `inventory_reservations + inventory_items + inventory_ledger_entries + operation_logs` 事务 SQL 边界。
- `scripts/run-db-migrations.mjs`：迁移 dry-run / apply runner，支持从安全 env 文件读取 `ERP_V1_DATABASE_URL` / `DATABASE_URL` / `PGURL`。
- `scripts/check-db-migration-runner.mjs`：校验迁移 runner 的安全 env 文件读取、连接串来源优先级、dry-run 隔离和输出脱敏。
- `scripts/check-postgres-live.mjs`：Docker 临时 PostgreSQL live 检查，覆盖迁移、附件仓储、访问审计仓储、订单确认事务仓储、订单池读取仓储、司机任务读取仓储、司机派单路线查回、订单确认库存占用 / 流水、库存占用释放事务、订单明细作废事务、订单明细改量事务、出库动作事务仓储、完成出库库存扣减 / 占用释放 / 出库流水、出库取消 / 回滚释放、付款记录仓储、收款登记事务仓储、差额 / 核销事务仓储、发送 / 回执 / 客户确认事务仓储、导出文件仓储、API 附件路径、API 订单确认路径、API 订单池列表 / 详情读取、API 司机任务列表 / 详情读取、API 库存占用释放路径、API 订单明细作废路径、API 订单明细改量路径、API 出库完成路径、API 出库取消路径、API 对账预览 / 导出下载 / 导出列表路径、API 付款登记路径、API 差额 / 核销路径、API 标记发送路径、API 发送回执路径和 API 客户确认路径真实写入查询。
- `scripts/run-v1-production-postgres-preflight.mjs`：生产 PostgreSQL 只读预检，用安全 env 连接真实库，检查迁移记录、核心表、关键列、核心权限和临时表写入回滚探针；不打印连接串、密码、host 或原始 psql 错误。
- `scripts/run-v1-production-object-storage-preflight.mjs`：生产对象存储 live 预检，用安全 env 对附件对象存储和对账导出对象存储执行诊断对象写入、读回、签名 URL 读回和删除；不打印 endpoint、bucket、access key、secret、对象 key、签名 URL 或 payload。
- `scripts/run-v1-production-persistence-evidence.mjs`：生产持久化首阶段留证汇总，用安全 env 汇总 env 文件安全审计、生产持久化 env 子集、迁移计划、PostgreSQL 预检和对象存储 live 预检；默认写 `.erp-local-storage/v1-production-persistence-evidence/` 脱敏 JSON / Markdown，且不执行迁移 `--apply`。
- `scripts/run-v1-production-runtime-smoke.mjs`：生产 API 运行态 smoke，用同一份安全 env 临时启动 API，读回 `/api/health` 和 `/api/system/v1-readiness`，确认当前运行态显示 PostgreSQL repository profile、附件对象存储、对账导出对象存储和系统 V1 持久化门禁；默认写 `.erp-local-storage/v1-production-runtime-smoke/` 脱敏 JSON / Markdown，检查结束会停止该 API。
- `scripts/run-v1-todo-load-precheck.mjs`：长驻API待办只读容量预检查，必须显式确认并使用服务端验证的正式runtime会话；按硬上限受控并发读取`GET /api/todos`，输出吞吐、P50/P95、错误率、服务端排序/提醒合同及快照变化，且不保存业务响应、待办编号、身份、凭据、env路径或API地址。
- `scripts/v1TodoLoadPrecheckService.mjs`：待办容量预检查纯执行边界，负责API目标校验、正式认证、服务端会话复核、并发worker、超时、阈值、合同校验及脱敏报告。
- `scripts/check-v1-todo-load-precheck.mjs`：校验显式确认、请求/并发上限、正式token/登录、seed拒绝、权限/合同/延迟/错误率阻塞、快照告警、CLI、文件权限和脱敏。
- `scripts/run-v1-production-first-stage-closeout.mjs`：生产环境 / 持久化第一阶段 closeout，读取持久化留证、runtime smoke、todo-load precheck 和已填写的现场证据 manifest，检查三份自动化证据 ready、非本机HTTPS生产目标、正式runtime会话、时效、安全护栏，以及 `production_persistence` / `object_storage` 两组必填证据；缺失/过期/本机/非正式/指标阻塞报告均失败关闭。默认写 `.erp-local-storage/v1-production-first-stage-closeout/` 脱敏 JSON / Markdown；不连接外部服务，也不声明 V1 全部完成。
- `scripts/run-v1-production-first-stage-execution.mjs`：生产环境 / 持久化第一阶段执行器，按顺序串联可选生产 env 真实值白名单合并、env 文件审计、生产 env 真实值 intake 校验、生产 env 变量预检、数据库迁移 dry-run 或显式 `--apply-migrations`、持久化留证、runtime smoke、第一阶段现场证据建议和 closeout；通过`--todo-load-precheck-json`把独立显式生成的脱敏容量报告交给closeout，执行器本身不会自动发负载。支持 `--production-env-values-file <secure-values-env-fragment>` 先把独立真实值片段按 intake 白名单合并到目标安全 env，支持 `--production-env-values-dry-run` 只做真实值片段白名单合并 dry-run 且不写目标 env / 不继续后续阶段，dry-run 会输出预计生产 env 变量预检、全量 intake 覆盖、最小 blocking 补值覆盖和建议 / 可选补值覆盖；setup / handoff 会生成只含当前最小 blocking 路径的 `production-env-minimum-values-fragment.template.env.example` 和全量 `production-env-values-fragment.template.env.example`，支持 `--field-evidence-manifest <filled-manifest>` 传给 closeout，默认写 `.erp-local-storage/v1-production-first-stage-execution/` 脱敏 JSON / Markdown，默认不执行生产迁移。
- `scripts/run-v1-print-chain-closeout.mjs`：打印链路阶段 closeout，读取已保存的打印 readiness JSON 和已填写的 `print_hardware` 现场证据组，检查 CUPS 非打印预检、标签 / 针式样张、纸张对位、条码扫码、spool / 驱动回写、作废重打和安全护栏；默认写 `.erp-local-storage/v1-print-chain-closeout/` 脱敏 JSON / Markdown，不调用 API、CUPS 或打印机。
- `scripts/run-v1-driver-real-device-closeout.mjs`：司机真机阶段 closeout，读取已保存的司机 readiness JSON 或完整 V1 readiness JSON 中的 `driverReadiness`，以及已填写的 `driver_native_device` 现场证据组，检查真实手机登录、水印拍照、纸质标签原生扫码、定位 / 导航、弱网上传兜底和只读护栏；默认写 `.erp-local-storage/v1-driver-real-device-closeout/` 脱敏 JSON / Markdown，不请求摄像头或定位、不打开导航、不改司机送货状态。
- `scripts/check-v1-production-object-storage-preflight.mjs`：校验生产对象存储 live 预检的空 env blocked、fake S3 探针、对账导出 fallback、CLI JSON、诊断清理和脱敏。
- `scripts/check-v1-production-first-stage-execution.mjs`：校验第一阶段执行器的计划模式、ready 执行、首个阻塞停止、显式迁移执行、文件输出、CLI 和脱敏。
- `scripts/check-v1-print-chain-closeout.mjs`：校验打印链路阶段 closeout 的缺证据 blocked、ready closeout、现场证据缺项、过期 readiness、护栏失败、文件输出、CLI 和脱敏。
- `scripts/check-v1-driver-real-device-closeout.mjs`：校验司机真机阶段 closeout 的缺证据 blocked、ready closeout、完整 readiness 嵌套读取、现场证据缺项、过期 readiness、普通浏览器 / 护栏失败、文件输出、CLI 和脱敏。
- `scripts/dbMigrationUtils.mjs`：迁移读取、校验和 checksum 共用工具。
- `scripts/check-seed-data.mjs`：校验 synthetic seed 是否能生成后端 workspace。
- `db/migrations/`：第一批 PostgreSQL 迁移草案。
- `docs/development/database-migration-runner.zh-CN.md`：迁移 runner 说明。

## 命令

| 命令 | 说明 |
|---|---|
| `npm run api:dev` | 启动本地 API 骨架，默认 `http://127.0.0.1:8787` |
| `npm run api:check` | 临时启动 server，检查健康检查、OpenAPI 状态、seed 登录 / 当前会话、工作台、订单、库存、出库、对账、待办、权限路由，以及第一批内存写入接口 |
| `npm run api:validate-openapi` | 校验 `docs/development/erp-api-openapi-draft.yaml` 的路径、schema、tag 和 `$ref` |
| `npm run attachment-repository:check` | 校验附件本地 JSON 仓储持久化和 PostgreSQL `attachments` / `attachment_links` SQL 边界 |
| `npm run attachment-storage:check` | 校验附件对象存储接口的本地写入 / 读取 / 删除、内容摘要、S3 兼容 PUT / GET / DELETE 签名、签名 URL、token 过期 / 无效拒绝和 provider factory 默认值 |
| `npm run attachment-storage-live:check` | 启动本地 S3 兼容 HTTP 端点和 ERP API `object_storage` 模式，校验附件上传 / 读取、签名 URL、storage diagnostics、V1 留档门禁、清理和脱敏 |
| `npm run object-storage:minio-live:check` | 启动临时真实 MinIO 容器与两个 bucket，校验附件 / 对账导出读写删、附件签名 URL、生产留档 readiness、诊断清理和容器清理 |
| `npm run v1-production-release-gate:check` | 校验最终生产放行断言和 GitHub workflow：阻断态、缺签字、过期报告、不安全输出、不可变 commit、受保护 runner / secrets、全量基础设施 / E2E 和失败清理 |
| `npm run v1-production-env-template:check` | 校验 V1 生产环境变量模板和发布前执行清单：生成器同步、预检变量覆盖、release-candidate 命令、V1/V2 边界和敏感值脱敏 |
| `npm run v1-production-env-file-audit:check` | 校验 V1 生产 env 文件安全审计：安全未跟踪 env 文件通过、模板文件拒绝、未替换占位符拒绝、重复变量 / 权限 warning、退出码和敏感值脱敏 |
| `npm run v1-field-evidence:check` | 校验 V1 现场证据 manifest 模板 / 清单、填写校验器、默认 blocked、完整证据 ready、缺分组 invalid 和 evidenceRef 脱敏 |
| `npm run v1-production-env-preflight:check` | 校验 V1 生产环境变量预检：空环境 blocked、完整环境 ready、env-file、非法 JSON、warning、退出码和敏感值脱敏 |
| `npm run v1-production-postgres-preflight:check` | 校验 V1 生产 PostgreSQL 只读预检：空 env blocked、fake PostgreSQL ready、迁移 / 核心表 / 关键列 / 权限 / 临时写入探针和敏感值脱敏 |
| `npm run v1-production-persistence-evidence:check` | 校验 V1 生产持久化首阶段留证：env 文件门禁、生产持久化 env 子集、迁移计划、fake PostgreSQL、fake 对象存储、文件输出、CLI 和脱敏 |
| `npm run v1-production-runtime-smoke:check` | 校验 V1 生产 API 运行态 smoke：env 文件门禁、安全 env 启动 API、生产 profile 读回、本地运行态 blocked、文件输出、CLI、进程停止和脱敏 |
| `npm run v1-production-first-stage-closeout:check` | 校验 V1 生产环境 / 持久化第一阶段 closeout：缺证据 blocked、自动化 + 现场证据 ready closeout、过期证据、护栏失败、文件输出、CLI 和脱敏 |
| `npm run v1-production-first-stage-execution:check` | 校验 V1 生产环境 / 持久化第一阶段执行器：计划模式、可选真实值白名单合并、ready 执行、首个阻塞停止、显式迁移执行、文件输出、CLI 和脱敏 |
| `npm run v1-print-chain-closeout:check` | 校验 V1 打印链路阶段 closeout：缺 readiness / 现场证据 blocked、ready closeout、过期 readiness、非打印护栏、敏感值脱敏和文件输出 |
| `npm run v1-release-candidate:check` | 校验 V1 发布候选聚合检查：生产环境预检、现场证据 manifest、运行时 readiness、现场验收报告、V1/V2 差异、blocked 留档和脱敏 |
| `npm run v1-go-live-suite:check` | 校验 V1 go-live suite：从发布候选和现场证据 manifest 编排现场任务、完成度、V1/V2 差异摘要、负责人摘要、证据采集包和交接包，覆盖现场 CSV 草稿回填、阶段 closeout 透传、刷新发布候选、缺发布候选报错和脱敏 |
| `npm run v1-onsite-task-board:check` | 校验 V1 现场角色任务清单：角色分组、发布阻塞项、现场证据任务、签字任务、V1/V2 边界任务、文件生成、缺发布候选报错和脱敏 |
| `npm run v1-completion-snapshot:check` | 校验 V1 完成度快照：完成度解析、发布门禁、岗位阻塞、V2 差异、文件生成、缺发布候选报错和脱敏 |
| `npm run v1-v2-scope-brief:check` | 校验 V1/V2 差异摘要：blocked / ready、缺源文档、文本输出、V2 分类、文件生成和脱敏 |
| `npm run v1-owner-decision-brief:check` | 校验 V1 负责人决策摘要：blocked / ready 摘要、文件生成、缺完成度快照报错、V2 差异和脱敏 |
| `npm run v1-field-evidence-intake:check` | 校验 V1 现场证据采集包：blocked / ready 采集包、分组采集单、CSV、可选报告、缺输入报错和脱敏 |
| `npm run v1-go-live-handoff:check` | 校验 V1 上线交接包：blocked 交接包、生产第一阶段 / 待办容量白名单快照 / 打印 / 司机阶段 closeout 收集、负责人摘要和 V1/V2 差异摘要复制、默认脱敏、可选原始现场证据、必需文档和缺发布候选报错 |
| `npm run v1-production-profile-live:check` | 启动临时 PostgreSQL + S3 兼容对象存储 + 统一 V1 profile API，校验生产 profile 下系统持久化与附件留档 ready、无现场证据时顶层门禁 `7/11` 阻塞、自动化打印 / 司机 QA 证据下顶层门禁 `11/11` 正向通过 |
| `npm run v1-field-acceptance-report:check` | 校验 V1 现场验收报告在 blocked、ready 和 blocked 留档场景下都能生成脱敏 Markdown / JSON，并保持退出码语义 |
| `npm run payment-repository:check` | 校验付款记录本地仓储和 PostgreSQL `payment_records` SQL 边界 |
| `npm run statement-payment-transaction:check` | 校验收款登记本地 workspace 变更和 PostgreSQL `statements + payment_records + todos + operation_logs` 事务 SQL 边界 |
| `npm run statement-settlement-transaction:check` | 校验差额处理 / 核销本地 workspace 变更和 PostgreSQL `statements + variance_records + todos + operation_logs` 事务 SQL 边界 |
| `npm run statement-send-transaction:check` | 校验标记已发送、登记发送回执、客户确认的本地 workspace 变更和 PostgreSQL `statements + statement_send_records + statement_confirmation_records + operation_logs` 事务 SQL 边界 |
| `npm run statement-export-repository:check` | 校验对账预览本地 workspace 变更和 PostgreSQL `statement_lines + statement_export_files + operation_logs` SQL 边界 |
| `npm run statement-export-storage:check` | 校验对账导出文件本地留档、S3 兼容 PUT / GET 签名和对象存储缺配置失败 |
| `npm run order-confirmation-transaction:check` | 校验订单确认本地 workspace 变更和 PostgreSQL `original_orders + order_lines + price_snapshots + fulfillment_records + inventory_reservations + inventory_ledger_entries + todos + operation_logs` 事务 SQL 边界 |
| `npm run order-pool-read:check` | 校验订单池本地列表 / 详情标准化和 PostgreSQL `original_orders + order_lines + price_snapshots + fulfillment_records + inventory_reservations + statements` 读取 SQL 边界 |
| `npm run order-line-void-transaction:check` | 校验订单明细作废本地 workspace 变更和 PostgreSQL `order_lines + fulfillment_records + inventory_reservations + inventory_items + inventory_ledger_entries + order_line_change_records + operation_logs` 事务 SQL 边界 |
| `npm run order-line-quantity-adjustment-transaction:check` | 校验订单明细改量本地 workspace 变更和 PostgreSQL `order_lines + fulfillment_records + inventory_reservations + inventory_items + inventory_ledger_entries + order_line_change_records + operation_logs` 事务 SQL 边界 |
| `npm run fulfillment-action-transaction:check` | 校验出库动作本地 workspace 变更和 PostgreSQL `fulfillment_records + print_records + fulfillment_exceptions + todos + operation_logs + inventory_reservations + inventory_items + inventory_ledger_entries` 事务 SQL 边界 |
| `npm run print-template:check` | 校验快递快运标签、自提单、送货单模板字段和金额显示 / 隐藏规则 |
| `npm run print-command-bridge:check` | 校验本地 `spool_only` / `cups_lp` 打印命令 wrapper、CUPS 队列预检、`command_bridge` 适配器调用和敏感信息不外泄 |
| `npm run driver-delivery-dispatch:check` | 校验司机派单本地 upsert 和 PostgreSQL `driver_delivery_dispatches + operation_logs` 写入 SQL 边界 |
| `npm run production-schedule-record:check` | 校验生产排产记录本地 upsert / 筛选和 PostgreSQL `production_schedule_records + production_tasks + operation_logs` 调序 / 跨机台移动事务边界 |
| `npm run driver-delivery-task-read:check` | 校验司机送货任务本地投影和 PostgreSQL `fulfillment_records + order_lines + customers + packages + print_records + inventory_reservations + driver_delivery_dispatches` 读取 SQL 边界，以及路线日期 / 趟次 / 站点顺序排序 |
| `npm run driver-delivery-task-projection:check` | 校验API/本地共享的司机货品简称、包裹跨履约隔离、拆量、有效打印、路线、状态和只读职责 |
| `npm run system-health-projection-service:check` | 校验公开health固定白名单、38项kind、D50探针合同、未知字段删除、连接串/Token/路径脱敏和纯投影职责 |
| `npm run driver-mobile-api:check` | 校验司机送货任务 API client、司机本地 fallback、装车 / 送达 / 异常动作、水印照片必填拦截、水印元数据透传和前端像素水印工具兜底 |
| `npm run inventory-reservation-release:check` | 校验库存占用释放本地 workspace 变更和 PostgreSQL `inventory_reservations + inventory_items + inventory_ledger_entries + operation_logs` 事务 SQL 边界 |
| `npm run db:check` | 校验 `db/migrations/` 文件顺序、核心表覆盖和无破坏性 `DROP TABLE` |
| `npm run db:migrate-runner:check` | 校验迁移 runner 支持安全 env 文件、`ERP_V1_DATABASE_URL` 优先级、dry-run 隔离和连接错误脱敏 |
| `npm run db:migrate:dry` | 输出迁移计划和 checksum，不连接数据库 |
| `npm run db:postgres-live:check` | 启动 Docker 临时 PostgreSQL，执行迁移并验证附件仓储 / 访问审计仓储 / 订单确认事务仓储 / 订单池读取仓储 / 司机任务读取仓储 / 司机派单路线查回 / 订单确认库存占用和流水 / 库存占用释放事务 / 订单明细作废事务 / 订单明细改量事务 / 出库动作事务仓储 / 完成出库库存扣减 / 占用释放 / 出库流水 / 出库取消 / 回滚释放 / 付款记录仓储 / 收款登记事务仓储 / 差额核销事务仓储 / 发送 / 回执事务仓储 / 对账预览导出仓储 / API 附件、订单确认、订单池列表与详情读取、司机任务列表与详情读取、库存占用释放、订单明细作废、订单明细改量、出库完成、出库取消、对账预览明细、导出下载、导出列表、付款登记、差额处理、核销、标记发送和发送回执路径真实写入查询 |
| `node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest>` | 串联第一阶段生产 env / 持久化执行顺序；默认复用 production env setup 报告中的安全 env 文件，做安全审计、真实值 intake 校验、变量预检、迁移计划、live 留证、runtime smoke 和 closeout，不执行迁移 `--apply`，并要求生产持久化 / 对象存储现场证据组已填；需要绕开 setup 报告时才显式传 `--env-file <secure-env-file>` |
| `node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>` | 只对独立真实值 env 片段执行白名单合并 dry-run，输出预计生产 env 变量预检、全量 intake 覆盖、最小 blocking 补值覆盖和建议 / 可选补值覆盖结果；不写目标 env，不继续 env 审计、迁移、持久化留证、runtime smoke 或 closeout |
| `node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>` | 先把独立真实值 env 片段按 `production-env-real-value-intake.csv` 白名单合并到 production env setup 安全草稿，再继续第一阶段审计、校验、预检和留证；该片段可先由 `production-env-minimum-values-fragment.template.env.example` 复制填写最小 blocking 路径，也可由全量 `production-env-values-fragment.template.env.example` 复制填写，要求 setup 报告只解析到一个目标 env 文件 |
| `node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest> --apply-migrations` | 在确认备份窗口和负责人后，显式执行生产迁移，再继续持久化留证、runtime smoke 和 closeout；生产迁移前仍必须保留备份 / 恢复验证证据 |
| `node -- scripts/run-db-migrations.mjs --env-file <secure-env-file> --apply` | 从安全 env 文件读取 `ERP_V1_DATABASE_URL` / `DATABASE_URL` / `PGURL`，通过本机 `psql` 执行未应用迁移，并写入 `schema_migrations` |
| `node -- scripts/run-v1-production-postgres-preflight.mjs --use-production-env-setup-env-file` | 复用 production env setup 安全 env 文件，连接真实生产 PostgreSQL 做只读结构 / 权限预检和临时表写入回滚探针，输出可留档的脱敏报告；需要绕开 setup 报告时才显式传 `--env-file <secure-env-file>` |
| `node -- scripts/run-v1-production-object-storage-preflight.mjs --use-production-env-setup-env-file` | 复用 production env setup 安全 env 文件，连接真实对象存储做附件写入 / 读回 / 签名 URL / 删除和对账导出写入 / 读回 / 删除 live 预检，输出可留档的脱敏报告；需要绕开 setup 报告时才显式传 `--env-file <secure-env-file>` |
| `node -- scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file` | 汇总生产 env 文件安全、生产持久化 env 子集、迁移计划、PostgreSQL 预检和对象存储 live 预检，写出首阶段脱敏留证包；不执行迁移 `--apply`；需要绕开 setup 报告时才显式传 `--env-file <secure-env-file>` |
| `node -- scripts/run-v1-production-runtime-smoke.mjs --use-production-env-setup-env-file` | 用 production env setup 安全 env 临时启动 API，或配合 `--api-base-url` 检查长驻 API，读回 health / 系统持久化 readiness，确认当前运行态进入 PostgreSQL / 对象存储 profile；只执行 GET 探针，临时模式结束后停止 API；需要绕开 setup 报告时才显式传 `--env-file <secure-env-file>` |
| `node -- scripts/run-v1-todo-load-precheck.mjs --confirm-read-load --use-production-env-setup-env-file --api-base-url https://<erp-host>/api` | 对已长驻生产API执行显式确认、硬上限、正式会话下的待办GET容量预检查；默认100请求/10并发，输出脱敏吞吐、P50/P95、错误率和服务端合同证据，不调用业务写接口 |
| `node scripts/run-v1-production-first-stage-closeout.mjs --field-evidence-manifest <filled-field-evidence-manifest>` | 读取持久化留证、runtime smoke 和现场证据 manifest，检查第一阶段是否 ready、证据是否过期、护栏是否完整，以及生产持久化 / 对象存储现场证据是否完整，并写出负责人签收用的脱敏 closeout |
| `node scripts/run-v1-print-chain-closeout.mjs --print-readiness-json .erp-local-storage/v1-print-readiness/latest.json --field-evidence-manifest <filled-field-evidence-manifest>` | 汇总打印 readiness 和 `print_hardware` 现场证据，检查真实打印链路是否可签收；不调用 API、CUPS 或打印机 |
| `node scripts/run-v1-driver-real-device-closeout.mjs --driver-readiness-json .erp-local-storage/v1-driver-readiness/latest.json --field-evidence-manifest <filled-field-evidence-manifest>` | 汇总司机 readiness 和 `driver_native_device` 现场证据，检查真实司机手机是否可签收；不请求摄像头 / 定位、不打开导航、不改送货状态 |
| `npm run v1-production-object-storage-preflight:check` | 校验生产对象存储 live 预检脚本的 blocked / ready、fake S3 读写删、对账导出 fallback、CLI JSON、诊断对象清理和敏感值脱敏 |
| `npm run seed:check` | 校验 synthetic seed 的客户、订单、库存、待办、出库、对账、克隆隔离和 seed 权限矩阵 |
| `npm run attachment-repository:check` | 校验附件摘要本地 JSON / PostgreSQL SQL 边界，以及附件访问审计本地 JSON / PostgreSQL SQL 边界 |

## 打印命令桥配置

`scripts/print-command-bridge.mjs` 是当前 `command_bridge` 的本地命令目标。默认 `spool_only` 只把作业写入 `.erp-local-storage/print-command-bridge/queued/*.json` 并返回 `externalJobId`；这表示本地桥接已收单，不表示真实打印机已经出纸。显式 `cups_lp` 会调用 CUPS `lp` 或指定命令，CUPS 接收成功仍只把作业推进到 `sent`，不直接标记 `printed`。

最小本地配置示例：

```bash
ERP_SYSTEM_PRINTER_ENABLED=true
ERP_SYSTEM_PRINTER_ADAPTER=command_bridge
ERP_SYSTEM_PRINTER_COMMAND=node
ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON='["scripts/print-command-bridge.mjs","--print-job-id","{printJobId}","--print-device-id","{printDeviceId}","--print-device-name","{printDeviceName}"]'
ERP_SYSTEM_PRINTER_ALLOWLIST=PRN-LABEL-A,标签机A
```

后续如要接 CUPS、标签机、针式机或厂商 SDK，应新增明确模式和状态回读 / 回调，不要把 `spool_only` 的成功当成 `printed`。

## 出库单据模板

`POST /api/fulfillments/{fulfillmentId}/print` 当前按出库交付方式推导单据类型：快递快运为 `express_ltl_label`，自提为 `pickup_note`，送货为 `delivery_note`。快递快运标签继续隐藏金额；自提 / 送货针式单模板使用 241mm 连续二联纸结构，返回明细行、数量 / 包裹、价格快照、合计金额、联次和签收标签。

当前模板仍是浏览器预览和打印作业 payload，不是已经通过真实针式机出纸。正式上线前还需要现场纸张宽高、二联位置、字体密度、撕纸位置和物理重打 QA。

## 附件对象存储配置

默认不需要配置对象存储，系统使用 `ERP_ATTACHMENT_OBJECT_STORAGE=local_fs` 或默认值，把附件内容写到 `.erp-local-storage/attachments/`。

如需启用 S3 兼容对象存储，至少需要：

| 变量 | 说明 |
|---|---|
| `ERP_ATTACHMENT_OBJECT_STORAGE=object_storage` | 启用对象存储模式 |
| `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT` | S3 兼容 endpoint，例如 MinIO / OSS / COS / S3 endpoint |
| `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET` | bucket 名 |
| `ERP_ATTACHMENT_OBJECT_STORAGE_REGION` | region，未填时默认为 `us-east-1` |
| `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID` | access key |
| `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY` | secret key |
| `ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN` | 可选临时凭证 token |
| `ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX` | 可选 key 前缀，默认 `attachments` |
| `ERP_ATTACHMENT_OBJECT_STORAGE_FORCE_PATH_STYLE` | 可选，默认 `true`，适合多数 S3 兼容 endpoint / MinIO |

配置完整时，附件上传会生成 `storageProvider=object_storage`、`storageKey` 和 `contentDigest`；`GET /api/attachments/{attachmentId}/access-url` 会返回直连对象存储的短期签名 GET URL。配置缺失时，对象存储模式会显式返回未配置占位，不会假装写入成功。

附件上传会先按业务用途做基础 V1 校验：付款截图只允许图片且不超过 8MB；送达水印、签收照片和定制成品图只允许图片且不超过 12MB；客户确认附件允许图片或 PDF 且不超过 12MB；其它附件默认限制为图片、PDF、表格或文档且不超过 15MB。该校验不替代真实对象存储 live 验证、病毒扫描、图片质量算法或断点续传。

附件对象存储可通过 `GET /api/attachments/storage-diagnostics` 做 V1 运行时基础预检。接口复用 `attachment.view` 权限，会写入小型诊断对象、读回内容、校验 sha256 摘要并尝试清理；响应包含 `storageKind`、`configured`、`missingConfigFields`、`writeOk`、`readOk`、`digestOk`、`cleanupOk` 和 `secretFieldsExposed=false`。`GET /api/attachments/v1-readiness` 是更高一层的 V1 留档上线门禁：默认本地 `local_fs` 只能证明读写可用，不自动算生产留档 ready；只有真实 `object_storage` 诊断通过，或服务端显式配置本地文件留档已被 V1 接受，门禁才会通过。两个接口都不会登记业务附件，也不暴露 access key、secret、authorization 或 session token；它们仍不替代真实 OSS/S3/COS bucket 凭证管理、网络策略、生命周期规则、病毒扫描、断点续传、备份巡检和现场附件验收。

## 对账导出文件存储配置

默认不需要配置对象存储，系统使用 `ERP_STATEMENT_EXPORT_OBJECT_STORAGE=local_fs` 或默认值，把对账导出 Excel 写到 `.erp-local-storage/statement-exports/`。下载路由会优先读取该文件存储；数据库 `content_text` 仍作为兼容兜底。

如需启用 S3 兼容对象存储，至少需要：

| 变量 | 说明 |
|---|---|
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE=object_storage` | 启用对账导出对象存储模式 |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT` | S3 兼容 endpoint；未填时可继续使用附件对象存储的 endpoint 配置 |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET` | bucket 名；未填时可继续使用附件对象存储的 bucket 配置 |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION` | region，未填时默认为底层对象存储默认值 |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID` | access key |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY` | secret key |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SESSION_TOKEN` | 可选临时凭证 token |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX` | 可选 key 前缀，默认 `statement-exports` |
| `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_FORCE_PATH_STYLE` | 可选，默认沿用底层对象存储默认值 |

导出记录列表只返回 `storageProvider`、是否已保存对象 key、`contentDigest` 和 `contentLength`，不返回底层 `storageKey` 或文件内容。

## V1 持久化 profile 配置

生产或现场联调可以用统一 profile 给已支持的核心仓储设置默认持久化模式，避免逐个遗漏 `*_STORE=postgres`：

| 变量 / 选项 | 说明 |
|---|---|
| `ERP_V1_PERSISTENCE_PROFILE=postgres` | 对未显式配置的已支持仓储默认使用 PostgreSQL |
| `ERP_V1_DATABASE_URL` | 统一 PostgreSQL 连接串；仍可用各业务域专用 database URL 覆盖 |
| `ERP_V1_FILE_STORAGE_PROFILE=object_storage` | 对附件和对账导出文件留档默认使用对象存储 |
| `v1PersistenceProfile` / `persistenceProfile` | `createApiServer(...)` 的代码级配置入口，可传 `repositoryMode`、`fileStorageMode`、`databaseUrl`、`queryJson` 和共享对象存储选项 |

显式传入的仓储对象或单仓储 `mode` 不会被 profile 覆盖，便于测试、灰度和单项回退。`GET /api/health` 与 `GET /api/system/v1-readiness` 只输出脱敏 profile 摘要，例如启用模式、默认应用 / 跳过数量、是否配置数据库，不输出连接串、本地路径、endpoint、bucket 密钥或 token。

该 profile 只是降低部署配置遗漏风险，不是 readiness 绕过。当前已支持的仓储包括主数据导入复核仓储；启用 `ERP_V1_PERSISTENCE_PROFILE=postgres` 后，未被显式覆盖的 26 个仓储会默认使用 PostgreSQL。系统持久化门禁仍会按运行时实际仓储类型判断，如果当前实例没有真实启用 PostgreSQL / 对象存储，仍会显示为未完成。

## 当前认证路由

| 路由 | 说明 |
|---|---|
| `POST /api/auth/login` | production 使用正式导入员工账号生成 runtime bearer token；demo/test 可兼容 seed 登录 |
| `POST /api/auth/change-password` | 正式员工校验当前密码后修改密码，同步员工状态和操作日志 |
| `GET /api/auth/me` | 校验 runtime / 允许的 seed bearer token，并返回当前会话和有效权限 |
| `POST /api/auth/logout` | 持久化 session JTI 撤销记录；重复撤销保持稳定，不接受仅前端丢 token 作为生产退出事实 |

## 当前只读路由

| 路由 | 说明 |
|---|---|
| `GET /api/health` | 健康检查，返回 OpenAPI 和种子数据计数 |
| `GET /api/openapi/status` | OpenAPI 校验状态 |
| `GET /api/auth/me` | 当前已验签 runtime / seed 登录会话和权限 |
| `GET /api/office/workspace` | 仅 demo/test 可用的旧办公室白名单摘要；production 禁用，且不返回用户密码、认证 secret、仓库或文件存储内部对象 |
| `GET /api/order-lines` | 订单池明细列表，默认读 workspace；PostgreSQL 模式读正式订单表并返回兼容字段和 OpenAPI 字段 |
| `GET /api/order-lines/{id}` | 单条订单明细详情，返回订单、价格、库存、出库、对账、附件和操作日志摘要 |
| `GET /api/inventory/items` | 库存种子列表 |
| `GET /api/fulfillments` | 出库 / 交付种子列表 |
| `GET /api/fulfillments/{id}` | 单条出库 / 交付种子 |
| `GET /api/driver/delivery-tasks` | 司机送货任务列表，按权限返回待送货 / 配送中 / 已完成 / 异常统计 |
| `GET /api/driver/delivery-tasks/{fulfillmentId}` | 单条司机送货任务详情 |
| `GET /api/statements/customers` | 对账客户种子列表 |
| `GET /api/statements/{id}` | 单条对账种子 |
| `GET /api/attachments` | 按 ownerType / ownerId / purpose / fileType 查询附件摘要，默认从本地 JSON 仓储返回，可显式切 PostgreSQL 仓储 |
| `GET /api/attachments/{attachmentId}/access-url` | 生成短期附件访问地址，P0 为 API proxy token，正式环境可替换为对象存储签名 URL |
| `GET /api/attachments/{attachmentId}/access-logs` | 查询该附件访问地址签发和内容读取审计摘要，默认来自本地 JSON 访问审计仓储，可显式切 PostgreSQL 仓储 |
| `GET /api/attachments/{attachmentId}/content` | 按附件 ID 读取内容，当前优先从本地文件返回 |
| `GET /api/todos` | 公共待办种子列表 |
| `GET /api/permissions/effective` | 当前 seed 账号有效权限 |
| `GET /api/operation-logs` | 查询当前 server 进程内的关键操作日志 |

## 当前内存写入路由

| 路由 | 动作权限 | 说明 |
|---|---|---|
| `POST /api/order-drafts/recognize` | `order.draft.recognize` | 识别客户原文并保存进内存草稿 |
| `PATCH /api/order-drafts/{draftId}` | `order.draft.save` | 保存草稿编辑结果，必要时生成草稿待办 |
| `POST /api/order-drafts/{draftId}/confirm` | `order.confirm` | 重校验后生成正式订单明细、出库任务、库存占用和缺货待办；PostgreSQL 模式通过订单确认事务仓储同步写原始订单、明细、价格快照、出库任务、库存占用、库存流水、缺货待办和操作日志，并更新库存 reserved 数量 |
| `POST /api/order-lines/{orderLineId}/void` | `order.void` | 作废未生产 / 未交付正式明细；PostgreSQL 模式通过订单明细作废事务仓储同步关闭明细、取消未交付出库任务、释放占用、写库存流水、订单变更记录和操作日志 |
| `POST /api/order-lines/{orderLineId}/quantity-adjustment` | `order.quantity.adjust` | 调整未生产 / 未交付正式明细数量；减量释放多余占用，增量检查可用库存并补占用，PostgreSQL 模式通过订单明细改量事务仓储同步订单数量、出库任务数量、占用、库存流水、订单变更记录和操作日志 |
| `POST /api/inventory/reservations/{reservationId}/release` | `inventory.reservation.release` | 释放全部或部分库存占用；PostgreSQL 模式通过库存占用释放事务仓储同步更新 reservation、库存 reserved 数量、释放流水和操作日志 |
| `POST /api/fulfillments/{fulfillmentId}/exception` | `fulfillment.exception.create` | 上报数量不符 / 无法出库，并生成办公室待办；PostgreSQL 模式通过出库动作事务仓储同步更新出库记录、保存异常记录、待办和操作日志 |
| `POST /api/fulfillments/{fulfillmentId}/print` | `fulfillment.print` | 模拟打印并更新快递快运待拉走状态；PostgreSQL 模式通过出库动作事务仓储同步更新出库记录、保存打印记录和操作日志 |
| `POST /api/fulfillments/{fulfillmentId}/complete` | `fulfillment.complete` | 模拟自提 / 送货完成；PostgreSQL 模式通过出库动作事务仓储同步更新出库记录和操作日志，有生效库存占用时同步扣减在库、释放占用并写出库流水 |
| `POST /api/fulfillments/{fulfillmentId}/pickup-confirm` | `fulfillment.pickup.confirm` | 模拟快递 / 快运已拉走；PostgreSQL 模式通过出库动作事务仓储同步更新出库记录和操作日志，有生效库存占用时同步扣减在库、释放占用并写出库流水 |
| `POST /api/fulfillments/{fulfillmentId}/cancel` | `fulfillment.cancel` | 取消未交付出库任务；PostgreSQL 模式通过出库动作事务仓储同步更新出库记录、释放该明细仍生效的库存占用、写 `fulfillment_cancel` 库存流水和操作日志；不关闭订单明细 |
| `POST /api/driver/delivery-tasks/{fulfillmentId}/load-confirm` | `delivery.load_confirm` | 司机确认已装车，把待送货任务推进到配送中并记录司机操作 |
| `POST /api/driver/delivery-tasks/{fulfillmentId}/complete` | `delivery.complete` | 司机提交送达，要求水印照片证据，并保存水印编号、时间、地址、定位和司机快照；完成后复用出库动作事务进入已交付和对账候选 |
| `POST /api/driver/delivery-tasks/{fulfillmentId}/exception` | `delivery.exception.create` | 司机上报装车 / 送货异常，生成办公室送货异常待办 |
| `POST /api/statements/{statementId}/mark-sent` | `statement.send` | 标记对账单已发送；PostgreSQL 模式通过发送事务仓储同步更新对账单、保存 send record 和操作日志 |
| `POST /api/statements/{statementId}/send-receipt` | `statement.send` | 登记发送记录的客户回执状态，例如已送达、已读、已确认或未回复；PostgreSQL 模式通过发送事务仓储更新 `statement_send_records.receipt_*` 字段并写操作日志 |
| `POST /api/statements/{statementId}/payments` | `statement.payment.record` | 登记实收；PostgreSQL 模式通过收款登记事务仓储同步更新对账单、保存 payment record、少付生成差额待办和操作日志 |
| `POST /api/statements/{statementId}/variance` | `statement.variance.handle` | 记录差额处理结果；PostgreSQL 模式通过结算事务仓储同步更新对账单、保存 variance record、按需生成后续待办和操作日志 |
| `POST /api/statements/{statementId}/write-off` | `statement.write_off` | 按现有差额规则确认欠款 / 核销；PostgreSQL 模式通过结算事务仓储同步更新对账单和操作日志 |
| `POST /api/attachments` | `attachment.create` | 登记附件摘要，P0 默认写入本地文件和本地 JSON 仓储；显式 PostgreSQL 仓储时写入附件元数据表 |
| `POST /api/todos/{todoId}/handle` | `todo.handle` | 处理、稍后提醒、重新打开或标记查看待办 |

## 当前响应适配边界

- `server/services/workspaceRecordService.mjs`统一跨模块工作区编号、记录查找、打印仓储回退、操作日志、待办引用构造、客户快照和交付记录组装，订单/库存/生产/交付/对账/附件/打印服务不再依赖`apiServer.mjs`内部记录函数。工作区已有打印记录优先，未命中才访问仓储，空ID不发起仓储调用；待办构造复用引用存在性/类型校验并失败关闭。`scripts/check-workspace-record-service.mjs`直接覆盖21个冻结方法，并已纳入异步启动及全量测试。
- `server/services/orderWorkflowProjectionService.mjs`统一订单明细/价格快照、精确库存匹配/校验、库存占用/履约摘要及交付方式/印刷面映射，订单确认、正式改量、库存释放和交付命令不再依赖`apiServer.mjs`内部投影。服务冻结10个方法且不写业务事务；`scripts/check-order-workflow-projection-service.mjs`直接覆盖价格输入归一、缺货量、状态映射、履约摘要和无效依赖，并已纳入订单及全量测试。
- `server/services/productionTaskProjectionService.mjs`统一生产任务创建、工序/默认机台推导、完成态、发布状态和任务摘要，排产、日报/完工报工及成品图写后响应不再依赖`apiServer.mjs`内部任务函数。服务冻结7个方法、使用受控时钟且不写生产/库存/打包事务；`scripts/check-production-task-projection-service.mjs`直接覆盖任务别名、默认机台、完成态、发布状态、成品图摘要和无效依赖，并已纳入生产及全量测试。
- `server/services/inventoryReservationPolicyService.mjs`、`statementPolicyService.mjs`和`deliveryEvidencePolicyService.mjs`分别统一占用可释放状态、对账API状态/差额结果/发送回执以及司机水印证据/复核状态/时间归一；三个服务均冻结方法且不写业务状态。打包整数拆量由`packingCommandService.mjs`持有默认实现，命令服务仍允许测试替身覆盖，但API组合根不再定义或注入这些领域规则；`scripts/check-domain-policy-services.mjs`直接覆盖规则别名、回退、冻结性和薄组合根归属，并已纳入API及全量测试。
- `server/services/httpResponseService.mjs`统一JSON、附件下载、内联文件、CORS、404和业务错误输出；严格模式只回显白名单来源，下载文件名使用UTF-8编码并公开必要响应头。通用404不再误写seed专属文案，详情对象不能覆盖服务端权威`code/message`，非法详情直接忽略。`scripts/check-http-response-service.mjs`直接覆盖204、本地/严格CORS、UTF-8/base64/Buffer/Uint8Array/ArrayBuffer和恶意错误详情，并已纳入`api-security:check`及全量测试。
- `server/services/commandResultHttpAdapterService.mjs`以42行冻结服务统一标准命令结果的响应体/完整记录两种成功载荷、固定或结果状态码、404回退、权威业务错误和可信详情公开；调用点静态选择策略，非法结果或依赖立即失败，自定义投影和文件响应继续显式处理。`scripts/check-command-result-http-adapter-service.mjs`以88行直接回归覆盖两种载荷、状态码、404优先级、详情开关、非法输入和薄API装配，并已纳入API及全量测试。
- `scripts/helpers/apiIntegrationTestHarness.mjs`统一高价值API集成脚本的临时服务器启停、地址解析、JSON/文本/二进制请求和状态诊断；HTTP错误保留方法、路径、期望/实际状态及截断响应，非法JSON带原始失败原因，关闭操作可重复执行。`scripts/check-api-integration-test-harness.mjs`直接覆盖GET/POST/PATCH、请求头、空响应、错误状态、非法JSON、附件元数据、二进制和幂等关闭；核心API骨架、安全边界、D49基础资料导入和异步启动链已迁移，D49生命周期/岗位就绪及正式持久化空状态断言保持不变，工具检查纳入`api:check`及全量测试。
- `server/routes/orderWriteRoutes.mjs`直接拥有订单识别、独立队列、保存、缺货取消恢复/跨草稿关联、拆单预览/确认、正式确认、作废和改量十个“路径与权限到命令服务再到标准结果适配”的HTTP控制器映射；`apiServer.mjs`只注入订单草稿/订单明细命令服务和`sendCommandResponse`，不再保留无状态命令包装函数。`scripts/check-order-write-routes.mjs`以117行直接回归锁定权限、认证操作人、命令输入、结果适配、拒绝/未知路由和薄组合根装配。
- 订单确认在生产 Web 运行模式（`VITE_ERP_RUNTIME_MODE=production`、`strict` 或 `server_required`）下只接受后端事务结果；确认成功后前端刷新订单池、库存、交付和待办读投影，失败时不得本地创建订单、占用、交付或待办。非严格原型模式才保留离线本地确认降级。
- `GET /api/fulfillments` 列表已返回 `customerId`、`orderLineId`、`package/packageCount`、`inventorySource/zone`，供确认后的交付投影刷新；不返回客户地址、价格、附件内容或敏感仓储信息。
- 第一批写入接口已做一层 OpenAPI 响应字段适配，避免直接暴露前端 fixture 的内部字段名。
- 当前已适配订单确认摘要、价格快照、库存校验、占用摘要、出库任务摘要、打印记录、出库动作结果、对账核销金额字段和待办返回结构。
- `GET /api/fulfillments` 现在返回合同中的 `metrics` 和高密度列表字段。
- `GET /api/driver/delivery-tasks` 现在走司机任务读取仓储，返回司机端合同中的 `metrics`、任务行摘要、工厂货品短写、联系人 / 地址 / 单据状态、送达证据 / 复核字段和下一步提示。
- `scripts/check-api-skeleton.mjs` 已断言这些响应字段，并覆盖打印、快运拉走确认、对账核销、附件本地文件写入、附件摘要仓储写入、按业务 owner 查询附件、短期 access-url 签发、访问日志写入和查询、无权限头 token 读取内容、过期 token 拒绝，以及 API server 重启后的附件内容读取 / 列表 / 访问日志查询。
- `scripts/check-postgres-live.mjs` 已用真实 Docker PostgreSQL 覆盖迁移执行、附件元数据仓储、附件访问审计仓储、订单确认事务仓储、订单确认库存占用 / 流水、司机任务读取仓储、司机派单路线查回、库存占用释放事务仓储、订单明细作废事务仓储、订单明细改量事务仓储、出库动作事务仓储、完成出库库存扣减 / 占用释放 / 出库流水、付款记录仓储、收款登记事务仓储、差额 / 核销事务仓储、发送 / 回执事务仓储，以及 API server 切到 PostgreSQL 仓储后的附件创建 / 查询 / 读取 / 访问审计路径、订单确认路径、司机任务列表 / 详情读取、库存占用释放路径、订单明细作废路径、订单明细改量路径、出库完成路径、付款登记路径、差额处理路径、核销路径、标记发送路径和发送回执路径。
- 这仍不是完整 schema validator；深层字段格式、所有读接口详情、附件 / 打印独立接口和真实数据库错误仍需后续补齐。

## 当前权限边界

- 浏览器端会话 token 仅存 `sessionStorage`，不再写入 `localStorage`；认证初始化会清理旧 `erp.seedAuthSession.v1` 本地持久化键。该措施不替代 HttpOnly Cookie、refresh token、服务端会话撤销或生产身份提供方。
- 生产启动必须使用 `ERP_AUTH_MODE=strict`（或 `NODE_ENV=production`）和非空 `ERP_AUTH_SECRET`；缺少密钥时 API 拒绝启动。严格模式下，除 `GET /api/health` 和 `POST /api/auth/login` 外，业务接口必须携带已验签的 Bearer session。
- 严格模式禁用 seed 账号登录、`Authorization: Bearer seed:<userId>`、`x-erp-user-id`、`x-erp-action-permissions` 和未传身份时默认 `U-OFFICE-A` 的兼容行为。前述机制仅能在非严格的本地原型 / 回归模式使用。
- 严格模式只对 `ERP_CORS_ALLOWED_ORIGINS` 中的来源返回 CORS 许可；JSON body 默认最多 `24 MiB`，可用 `ERP_API_MAX_JSON_BODY_BYTES` 调整。附件用途本身的大小校验仍是第二道业务限制。
- `scripts/check-api-security-boundary.mjs` 覆盖严格模式密钥必填、伪造 Header 拒绝、seed 身份禁用、CORS 白名单和 JSON 超限返回 `413 REQUEST_BODY_TOO_LARGE`。
- `POST /api/auth/login` 在 production 只接受已启用的正式导入员工账号，返回独立 `erp-runtime-session-v1`；非严格 demo/test 仍兼容 `office.a`、`warehouse.a` 等 seed 登录。签名 token 默认 8 小时有效。
- `GET /api/auth/me` 接受已验签的 runtime session；非严格 demo/test 也接受 seed session。未登录、错误密码、类型与账号不匹配或无效 token 返回 `401`。
- `GET /api/permissions/effective` 返回当前 seed 账号的有效权限；未传账号时默认 `U-OFFICE-A`。
- 正式运行时员工与 seed token 已分离，运行时员工不能再用 `seed-session` 代表；`x-erp-user-id` 和 `Authorization: Bearer seed:<userId>` 只保留为非严格本地骨架兼容方式。
- `server/authSeed.mjs` 目前提供办公室、库房 / 出库、财务 / 对账、管理和司机 seed 账号，并按角色合成 `buttonPermissions`、`actionPermissions` 和 `grants`。
- 司机 seed 账号只具备司机送货任务相关权限：`delivery.view`、`delivery.load_confirm`、`delivery.complete`、`delivery.exception.create`；默认不具备打印、改订单、改库存、改价格或对账权限。
- 第一批内存写入路由已按 `actionPermissions` 做动作级拦截；缺权限时返回 `403 PERMISSION_DENIED` 和 `requiredPermission`。
- `scripts/check-api-skeleton.mjs` 已校验默认办公室账号正向流程、未登录查当前会话失败、错误密码失败、财务账号 seed token 登录、财务账号不能录单、库房账号不能登记收款、未知账号为空权限。
- 正式导入员工账号、密码状态、session 版本和 token 撤销已可通过 `runtimeIdentityRepository` 持久化到 PostgreSQL；角色权限仍由共享角色目录合成。真实生产账号导入、密钥轮换和现场账号验收仍未完成。
- 正式员工新发 / 改密密码使用 `runtime-password-v2`：16-byte 随机盐、Node `scrypt` 32-byte 摘要，并以服务端认证 secret 作为 pepper。旧 `runtime-password-v1` 只用于兼容校验，成功登录后自动替换为 v2；API、readiness 和操作日志均不返回 passwordHash。
- `x-erp-action-permissions` 请求头只用于非严格模式的本地骨架校验和负向测试。例如传 `none` 可模拟当前账号没有任何写入动作权限。

## 当前边界

- 订单确认 PostgreSQL 事务仓储已使用共享 `pg` pool client，不再调用同步 `psql`。事务在一个借用连接中执行并在失败时回滚；当前 SQL 生成仍是过渡实现，后续仓储迁移必须同时改为参数化 `text + values` 查询。
- 系统 V1 当前已有只读 readiness 门禁：`GET /api/system/v1-readiness` 汇总 31 个持久化对象的运行时模式，并报告 8 类正式人员岗位账号覆盖。默认 `local_memory` / `local_json` / `local_fs` 会阻塞 V1 生产上线；production 还要求办公室、库房、财务、车间、打包、司机、管理、技术运维各有已复核、已完成首次改密、未锁定、未过期的 v2 正式账号，车间账号必须绑定默认机器。接口只输出仓储类型、计数和阻塞类别，不输出业务数据、账号 ID、密码摘要、连接串、本地路径或密钥。
- 大多数写入路由只修改当前 Node 进程内存，不持久化，server 重启后恢复 seed。
- 附件是当前例外：文件内容已通过 `workspace.attachmentObjectStorage` 写入 `.erp-local-storage/attachments/`，附件摘要和 owner 关联默认写入 `.erp-local-storage/metadata/attachment-records.json`，server 重启后同一个 `attachmentId` 可继续通过内容接口读取文件。设置 `ERP_ATTACHMENT_STORE=postgres` 并提供 `DATABASE_URL` 或 `ERP_ATTACHMENT_DATABASE_URL` 时，附件摘要和 owner 关联会走 PostgreSQL `attachments` / `attachment_links` 仓储。当前没有 live PostgreSQL 连接时只校验 SQL 边界。
- 附件上传已有第一版用途级类型 / 大小校验；前端用于提前提示操作员，后端仍是最终拦截点并会按 MIME / 文件名重新推断 `fileType`。
- 附件内容对象存储当前默认 `ERP_ATTACHMENT_OBJECT_STORAGE=local_fs`，统一处理 `putObject`、`readObject`、内容摘要、安全 storage key、data URL fallback、短期 access URL 和 token 校验。`ERP_ATTACHMENT_OBJECT_STORAGE=object_storage` 配置完整时会使用 S3 兼容 AWS Signature V4 签发 PUT / GET 请求和直连签名 URL；配置缺失时显式返回未配置占位。
- 附件访问 URL 也是本地过渡能力：`GET /api/attachments/{attachmentId}/access-url` 会在 `attachment.view` 权限通过后由独立文件访问服务调用对象存储接口签发短期访问地址。`local_fs` 下返回 API proxy token；`object_storage` 下返回对象存储直连签名 GET URL。公开响应只返回`storageKeyStored`，不返回原始存储键。
- 附件访问审计当前已有独立服务和仓储边界：文件访问服务统一写操作日志和访问审计，默认仓储写入 `.erp-local-storage/metadata/attachment-access-logs.json`，server 重启后仍可通过 `GET /api/attachments/{attachmentId}/access-logs` 查询；设置 `ERP_ATTACHMENT_ACCESS_AUDIT_STORE=postgres` 或 `ERP_ATTACHMENT_STORE=postgres` 时会生成 PostgreSQL `attachment_access_logs` 写入和查询 SQL。仓储内部保留原始键用于取证，API访问日志只返回`storageKeyStored`。
- 订单确认当前已有第一条核心事务边界：设置 `ERP_ORDER_CONFIRMATION_TRANSACTION_STORE=postgres` 或 `ERP_ORDER_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_ORDER_DATABASE_URL` 时，`POST /api/order-drafts/{draftId}/confirm` 会在同一个 PostgreSQL 事务内写入 `original_orders`、`order_lines`、`price_snapshots`、`fulfillment_records`、`inventory_reservations`、`inventory_ledger_entries`、缺货 `todos` 和 `operation_logs`，并更新 `inventory_items.reserved_qty`。生产和打包库存流转仍是后续事务边界。
- 订单池读取当前已有第一轮仓储边界：设置 `ERP_ORDER_POOL_READ_STORE=postgres` 或 `ERP_ORDER_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_ORDER_DATABASE_URL` 时，`GET /api/order-lines` 和 `GET /api/order-lines/{id}` 会从正式订单表、最新价格快照、出库记录、库存占用和对账状态生成读模型。本地模式继续读 workspace，保证 P0 原型无需数据库也可运行。
- 订单明细作废当前已有第一轮事务边界：设置 `ERP_ORDER_LINE_VOID_TRANSACTION_STORE=postgres` 或 `ERP_ORDER_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_ORDER_DATABASE_URL` 时，`POST /api/order-lines/{orderLineId}/void` 会在同一个 PostgreSQL 事务内关闭 `order_lines`、取消未交付 `fulfillment_records`、释放该明细仍生效的 `inventory_reservations`、扣减 `inventory_items.reserved_qty`、写 `inventory_ledger_entries` 释放流水、写 `order_line_change_records` 和 `operation_logs`。
- 订单明细改量当前已有第一轮事务边界：设置 `ERP_ORDER_LINE_QUANTITY_ADJUSTMENT_TRANSACTION_STORE=postgres` 或 `ERP_ORDER_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_ORDER_DATABASE_URL` 时，`POST /api/order-lines/{orderLineId}/quantity-adjustment` 会在同一个 PostgreSQL 事务内更新 `order_lines.original_qty`、同步未交付 `fulfillment_records.expected_qty`、更新 `inventory_reservations.reserved_qty/status`、调整 `inventory_items.reserved_qty`、写 `inventory_ledger_entries` 改量流水、写 `order_line_change_records` 和 `operation_logs`。
- 库存占用释放当前已有第一轮事务边界：设置 `ERP_INVENTORY_RESERVATION_RELEASE_TRANSACTION_STORE=postgres` 或 `ERP_INVENTORY_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_INVENTORY_DATABASE_URL` 时，`POST /api/inventory/reservations/{reservationId}/release` 会在同一个 PostgreSQL 事务内更新 `inventory_reservations.reserved_qty/status`、扣减 `inventory_items.reserved_qty`、写 `inventory_ledger_entries` 释放流水并写 `operation_logs`。部分释放后的 reservation 会继续被完成出库按剩余占用处理。
- 出库动作当前已有第一轮事务边界：设置 `ERP_FULFILLMENT_ACTION_TRANSACTION_STORE=postgres` 或 `ERP_FULFILLMENT_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_FULFILLMENT_DATABASE_URL` 时，`POST /api/fulfillments/{fulfillmentId}/print`、`/complete`、`/pickup-confirm`、`/cancel` 和 `/exception` 会在同一个 PostgreSQL 事务内更新 `fulfillment_records`，并按动作写 `print_records`、`fulfillment_exceptions`、`todos`、`operation_logs`、`inventory_reservations`、`inventory_items` 和 `inventory_ledger_entries`。`/complete` 与 `/pickup-confirm` 在最终状态为 `已交付` 且订单明细存在生效 `inventory_reservations` 时，会同步把 reservation 标记 `已出库`、扣减 `inventory_items.on_hand_qty`、释放 `inventory_items.reserved_qty` 并写出库扣减流水；`/cancel` 只允许未交付任务，取消后不关闭订单明细，但会把仍生效的 reservation 释放为 0、扣减 `inventory_items.reserved_qty` 并写 `fulfillment_cancel` 流水。送达证据复核 API 复用该事务边界写 workspace 投影、待办和操作日志；PostgreSQL 表已保存水印 / 签收证据、复核状态、复核人和退回原因字段。无 reservation 旧单扣减策略、生产和打包库存流转仍是后续事务边界。
- 付款记录当前已有独立仓储边界：默认写当前 API workspace；设置 `ERP_PAYMENT_RECORD_STORE=postgres` 或 `ERP_STATEMENT_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_PAYMENT_DATABASE_URL` 时，可写入 PostgreSQL `payment_records`。
- 收款登记当前已有第一条事务边界：设置 `ERP_STATEMENT_PAYMENT_TRANSACTION_STORE=postgres` 或 `ERP_STATEMENT_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_STATEMENT_DATABASE_URL` 时，`POST /api/statements/{statementId}/payments` 会在同一个 PostgreSQL 事务内更新 `statements`、写 `payment_records`、少付时写 `todos`，并写 `operation_logs`。
- 差额处理 / 核销当前已有结算事务边界：设置 `ERP_STATEMENT_SETTLEMENT_TRANSACTION_STORE=postgres` 或 `ERP_STATEMENT_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_STATEMENT_DATABASE_URL` 时，`POST /api/statements/{statementId}/variance` 会在同一个 PostgreSQL 事务内更新 `statements`、写 `variance_records`、按需写 `todos`，并写 `operation_logs`；`POST /api/statements/{statementId}/write-off` 会同步更新 `statements` 和 `operation_logs`。
- 标记已发送 / 发送回执 / 客户确认当前已有发送事务边界：设置 `ERP_STATEMENT_SEND_TRANSACTION_STORE=postgres` 或 `ERP_STATEMENT_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_STATEMENT_DATABASE_URL` 时，`POST /api/statements/{statementId}/mark-sent` 会在同一个 PostgreSQL 事务内更新 `statements` 状态 / `last_sent_at`、写 `statement_send_records`，并写 `operation_logs`；如果已有客户发送版导出 token，会写入 `statement_send_records.export_file_id`。`POST /api/statements/{statementId}/send-receipt` 会更新发送记录 `receipt_status / receipt_at / receipt_by / receipt_note` 并写操作日志；`POST /api/statements/{statementId}/customer-confirmation` 会更新对账单状态、把发送回执升级为 `confirmed`，写 `statement_confirmation_records` 和操作日志。
- 对账预览 / 导出文件当前已有独立文件服务和仓储边界：`server/services/statementExportFileService.mjs`负责XLSX构建、安全命名、对象存储写读、脱敏摘要、列表和令牌下载；HTTP只映射not-found和文件响应。设置 `ERP_STATEMENT_EXPORT_STORE=postgres` 或 `ERP_STATEMENT_STORE=postgres` 并提供 `DATABASE_URL` / `ERP_STATEMENT_DATABASE_URL` 时，`POST /api/statements/{statementId}/preview` 会把生成的对账明细写入 `statement_lines`，把导出元数据和 `.xlsx` base64 兜底内容写入 `statement_export_files`，并写入 `operation_logs`；`GET /api/statements/{statementId}/exports` 返回不含内容和底层存储键的元数据列表，`GET /api/statements/{statementId}/exports/{downloadToken}` 优先从对象存储读取文件，必要时从数据库兜底内容下载。命令响应会把持久化数值合并回原始展示行，避免仓储规范化丢失品名、规格和计费数量。
- 写入路由当前只做轻量业务校验、seed 登录 / 多账号动作权限拦截和第一轮响应字段适配；订单确认、订单确认库存占用、订单池读取、订单明细作废、订单明细改量、库存占用释放、出库动作、完成出库库存扣减、出库取消 / 回滚释放和对账关键动作已有第一批数据库边界，无 reservation 旧单扣减策略、生产 / 打包库存流转等剩余数据库事务、正式登录鉴权和权限落库仍待接入。
- 大部分业务路由仍不接正式数据库；`db/migrations/` 是 PostgreSQL 第一批迁移草案，当前已支持 dry-run，真实执行需要 `DATABASE_URL` 和本机 `psql`。
- 默认数据经 `server/seeds/syntheticOfficeSeed.mjs` 来自 `src/data/fixtures.js`，仍是 P0 synthetic fixtures；V8.244新增`officeSeedLoader`仅供demo/test显式加载私有、匿名、覆盖完整的real-sample JSON，production拒绝该源且真实样例尚未提供。
- OpenAPI 校验依赖本地 Ruby 的 YAML 标准库，和前几轮校验口径一致。
- 后续真实后端应复用 `docs/development/erp-erd-draft.zh-CN.md` 的表结构和 `docs/development/erp-api-openapi-draft.yaml` 的接口合同。
- 正式员工批量复核启用使用`POST /api/master-data/employee-account-reviews/batch-enable`。请求必须显式`confirmed=true`并提供1-100个唯一员工ID；命令先在克隆身份工作区验证全部目标，再一次持久化并逐账号写`master_data_employee_account_enabled`操作日志。缺失员工、岗位/机台/身份冲突或持久化失败均整批不提交；已启用账号只返回skipped，不重复持久化或写日志。该命令不批量发放密码，首次改密和D49正式岗位门禁保持独立。

## 下一步

1. 先处理系统 V1 持久化门禁：production 必须切换全部核心仓储到 PostgreSQL / 对象存储；本地持久化风险接受只允许 demo / test，不能用于生产放行。
2. 确认正式后端技术栈和数据库，建议从 Node.js + PostgreSQL 方向评估。
3. 准备 PostgreSQL 连接，把 `ERP_V1_DATABASE_URL` 写入安全未跟踪 env 文件，执行 `node -- scripts/run-db-migrations.mjs --env-file <secure-env-file> --apply`，确认空库建表。
4. 用 `ERP_ATTACHMENT_STORE=postgres DATABASE_URL=... npm run api:dev` 做附件创建、列表、短期访问 URL、内容读取和访问审计的 live database 检查。
5. 用真实 OSS/S3/COS bucket 做对象存储 live PUT / GET / 签名 URL 验证，再接持久缩略图、对象生命周期规则和对象存储事件回写。
6. 增加 real-sample fixtures 入口，支持 synthetic / real-sample 切换。
7. 按 8 岗位导入真实员工账号，完成首次改密、车间机器绑定、密钥轮换和现场账号验收；权限额外授权仍需继续落库和审计。
