# ERP 模块完成度统计

最后更新：2026-07-11

## 统计口径

本统计按当前代码、开发计划、验证记录和需求确认表估算，不是正式上线承诺。

- `需求确认度`：业务规则、字段、权限、状态、验收场景是否已明确。
- `P0 原型 / 代码完成度`：当前 React 原型、API client、Node API skeleton、PostgreSQL 仓储边界和浏览器验证覆盖程度。
- `V1 上线就绪度`：真实设备、真实数据、真实对象存储、原生 App、生产环境、权限审计和现场 QA 的完成程度。

主要依据：

- `docs/product/module-confirmation-progress.zh-CN.md`
- `docs/development/code-development-plan.zh-CN.md`
- `PROJECT_STATUS.md`
- `01_当前状态与下一步.md`
- `02_问题或报错日志.md`

## 最新代码审查修复

本轮完成 D25-1 V1 状态模块首轮拆分：页面静态基线、阶段归一、快照新鲜度和生产 env 变量检查迁入纯展示模型，顶部快照 / 门禁 / 模块列表迁入独立总览组件；22 个 V1 HTTP action 迁入显式 action factory，normalizer 文件不再直接请求 API。原页面 / client 公共导入保持兼容。新增直接测试覆盖静态门禁真值、env 映射、幂等、权限拒绝、ready=false 和离线 fail-closed；全量测试、构建和管理 / 技术 / 办公室桌面手机回归通过。下一轮 D25-2 迁移打印 / 交付 API service；真实基础设施、设备、业务试跑、证据 `0/34`、签字 `0/6` 和门禁 `0/4` 均未变化。

本轮完成 D24 对账和角色工具 UI 整改：对账、生产 / 打包、原材料、车间、司机统一使用共享操作面板、标题、指标、筛选、空状态和详情骨架；对账五项金额、机器计数安全边界、原料 OCR / 一卷一标 / 贴标扫码门禁和司机送达证据规则保持不变。对账、原料和司机筛选不再跨结果集回退旧详情。浏览器验收发现并修复司机空状态 `null.items` 白屏，并增加回归断言。新增 `office-finance-role-ui:check` 并纳入全量测试；`npm test`、构建和 `1280x720 / 390x844` 回归通过。下一轮 D25 拆 V1 状态页 / client 并启动打印 / 交付 API service 迁移；真实基础设施、设备、业务试跑、证据 `0/34`、签字 `0/6` 和门禁 `0/4` 均未变化。

本轮完成 D23 订单池、库存和出库交付 UI 整改：共享层新增筛选条，三个页面统一操作面板、空 / 错误状态和详情骨架；出库页补齐空列表及空页签保护，不再读取未定义选中项或跨页签显示旧记录。移动端订单池显示订单 / 客户 / 品名 / 状态 / 异常，库存显示尺寸 / 颜色 / 款式 / 状态 / 可用 / 可信，出库显示方式 / 客户 / 货品 / 数量 / 状态，完整信息保留详情。新增 `office-operational-ui:check` 并纳入全量测试；筛选交互、`npm test`、构建和 `1280x720 / 390x844` 浏览器回归通过。D24 仍需迁移对账和角色工具；真实基础设施、设备、业务试跑、证据 `0/34`、签字 `0/6` 和门禁 `0/4` 均未变化。

本轮完成 D22 共享 UI 与首批页面整改：新增统一的工作区通知、页面头、面板、指标条、空 / 错误状态、详情面板、状态标签和分段切换组件，并新增 tokens / shell / components / Todo / Entry 分层样式。公共待办与订单录入完成接入，移除无动作的“本地演示”按钮，页面描述统一进入导航元数据；`App.jsx` 降至 `7,217` 行。新增 `shared-office-ui:check` 并纳入全量测试；`npm test`、构建和 `1280x720 / 390x844` 浏览器回归通过，无页面横向溢出或控制台错误 / 警告。D23 仍需迁移订单池、库存和出库，旧 CSS 与大文件拆分仍未完成；真实基础设施、设备、业务试跑、证据 `0/34`、签字 `0/6` 和门禁 `0/4` 均未变化。

本轮完成 D21 全局交互控制器整改：`useOfficeInteractionController.js` 统一管理 toast、业务弹窗、订单动作弹窗、附件预览、基础资料模板面板、权限动作守卫和领域弹窗提交分发；`App.jsx` 从 `7,504` 行降至 `7,248` 行，不再包含领域 `confirmModal`、订单动作提交和权限守卫实现，也不再直接执行实收 / 差额弹窗写 API。冲突提示统一要求刷新重试，权限拒绝和无反馈 blocked 结果不会静默。新增专项并纳入 `npm test`；全量、构建、桌面弹窗、`1280px / 390px` 无溢出和干净会话零控制台错误通过。B1.5 尚未完成，真实基础设施、设备、业务试跑、证据 `0/34`、签字 `0/6` 和门禁 `0/4` 均未变化。

本轮完成 D20 打印写动作和打印状态可信度整改：打印作业派发 / 重试、设备模式 / QA、单张 / 批量结果和作废重打已迁入 `useOfficePrintWrites.js`，`App.jsx` 降至 `7,504` 行且不再直接调用打印写 API。打印记录新增 `submitted / reprint_submitted`，预览、queued、sent 均不推进交付；只有可信 driver / spool `printed` 回读才同步打印记录和快递交付，提前确认拉走固定返回 `409`。PostgreSQL live 同时修复并覆盖打印作业日志与交付投影日志 ID 碰撞。全量 `npm test`、批次 B、PostgreSQL 16 live、API/OpenAPI、构建和桌面 / 390px 浏览器回归通过。该变化不提高 V1 真实上线完成度：真实打印机、CUPS、标签扫码、司机真机、生产基础设施、证据 `0/34`、签字 `0/6` 和门禁 `0/4` 仍未完成。

本轮完成 R2 的本地代码准备：生产部署已锁定 Node 24，新增 systemd API / health timer、nginx TLS 和同源 API 配置、`SIGTERM/SIGINT` 优雅停机、共享 PostgreSQL pool 关闭、8 项服务健康探针、15 项部署清单、按完整 commit 的 9 阶段全新目录恢复检查，以及启停/日志/告警/备份/回滚手册。全量 `npm test`、批次 B PostgreSQL 16 live 和 production profile live 通过。代码 / 原型百分比和 V1 `80-83%` 暂不提高：当前实际部署清单仍因没有受控 Git 远端停在 `14/15`，真实 PostgreSQL、恢复验证库、对象存储、另一台主机恢复、告警、回滚、设备、现场证据和签字均未完成。

本轮完成批次 B3 R1.1-R1.5：正式订单确认与草稿状态、库存占用、库存流水和日志已在单一 PostgreSQL 事务提交；核心启动快照覆盖 26 个业务集合，production 空库无 seed，重启可续编，双会话旧版本只允许一个成功，旧草稿确认整单回滚。稀疏订单 / 交付编号和持久化对账金额也已补回归。当前统一 profile 为 31 个 PostgreSQL 仓储默认项、2 个对象存储、33 个持久化对象。`npm test`、批次 B、PostgreSQL 16 live、production profile live 和 OpenAPI 通过。代码 / 原型百分比暂不提高，V1 真实上线仍为 `80-83%`，因为真实生产资源、恢复、打印 / 手机、业务试跑、证据 `0/34`、签字 `0/6` 和发布门禁 `0/4` 尚未完成。

本轮完成批次 B1-B2 首轮写安全整改：production 业务写统一要求 `Idempotency-Key`，PostgreSQL 持久化请求摘要与提交响应；订单 / 库存、交付、收款核销、原材料、打印和司机派单增加事务锁与版本冲突控制。`npm test` 和 PostgreSQL 16 容器 live 通过，live 实际验证同键重放、同键不同请求拒绝和并发重复抑制。该阶段当时遗留的 B3 事实源缺口已由上条 R1.1-R1.5 关闭；真实生产基础设施、设备、业务试跑、证据和签字仍未完成。

本轮移除前端生产构建中的原型账号口令：浏览器登录不再携带 seed password，而是在非严格本地原型模式向 `/api/auth/prototype-login` 仅提交选中用户 ID；严格认证模式始终拒绝此端点，真实账号仍使用用户名 / 密码登录。OpenAPI、原型成功路径、严格拒绝路径与构建产物口令扫描均已通过。这是认证暴露面修复，不改变真实生产身份、部署和 V1 上线结论。

本轮完成前端 API client 重复代码收敛：`officeApiClientCore.js` 统一 API base URL、Bearer / 操作人请求头、JSON 读取、标准错误和严格模式写入阻断；库存、主数据导入、生产 / 打包、打印、订单、交付、待办、对账、原材料、附件、司机 / 移动端和上线状态均已迁移。领域模块仍掌握 URL、payload、响应映射、附件访问 URL 处理与降级策略；核心和全部受影响客户端回归通过，静态扫描不再发现本地 `request*Api` 封装。新增 ESLint 后，`npm test` 已将 lint、全部前端 API client、API 安全、数据库仓储和构建纳入同一入口，当前 lint 为 `0` 错误、未使用变量警告待后续治理。这是可维护性修复，不改变模块完成度或上线结论。

本轮完成全部已识别 PostgreSQL 仓储的 SQL 参数化：主数据复核/导入、生产排产/打包、原材料入库/供应商月结、对账导出、打印、附件、身份、库存、订单和司机路径均通过 `{ text, values }` 将业务数据与 SQL 文本分离；付款记录兼容 SQL 构建器也复用既有参数化 query。专项回归覆盖包含英文单引号的业务值不进入 SQL 文本；`npm run check:core` / `npm test` 已纳入主数据导入、排产、生产打包、原材料入库以及已有仓储专项。静态扫描 `server/*Repository.mjs` 的 `sqlLiteral(...)` 和同步 `psql` 均为 `0`；真实 PostgreSQL 容器联调因本机 Docker 不可用而未执行。该修复显著降低数据层风险，但不改变 P0 / V1 完成度结论。

本轮已收口前端业务写操作的生产降级风险：订单、订单池、库存修正草稿、出库 / 交付、公共待办、对账、附件上传、打印批次、主数据确认计划 / 导入执行、生产 / 打包、打印设备现场验收和司机送货在严格运行模式下发生网络异常时都会阻断，页面不会再把本地模拟投影当作真实成功。只读列表和历史导出读取属于非业务写路径，仍保留明确的原型 / 读取降级；V1 状态动作的降级路径本来就会阻断。这项修复提高的是生产数据一致性，不代表 V1 上线完成。完整代码审计见 `code-audit-2026-07-10.zh-CN.md`。

本轮完成最后一批 PostgreSQL async pool 迁移：附件元数据、打印设备、打印作业和打印设备现场测试均已接入共享 `pg` pool；打印就绪聚合保留启动时加载的 workspace 只读投影，避免异步读破坏打印门禁。累计 29 个已识别高风险仓储不再使用同步 `psql`，`server/*Repository.mjs` 已无 `spawnSync` 数据库访问。该变化降低 Node 事件循环阻塞和连接串进入子进程参数的风险，但不代表已完成 legacy SQL 参数化或真实生产 PostgreSQL 验证。

## 总体完成度

本轮增加 API 异步启动加载边界：启动入口和所有请求均等待持久化状态加载完成。付款记录已改为参数化连接池查询；对账导出、打印批次、附件访问审计、附件元数据、打印设备 / 作业、打印设备现场测试、司机派单 / 任务读取、运行时身份、生产排产、司机设备现场测试、订单池读取、库存台账读取、主数据导入事务 / 复核、原材料供应商月结复核、生产 / 打包事务 / 读取和原材料入库动作已改为共享 `pg` pool。累计 29 个已识别高风险仓储不再使用同步 `psql`，待迁移仓储为 `0` 个。该项降低阻塞、连接串进程参数暴露和异步初始化竞态，但 legacy SQL 参数化、真实 PostgreSQL、对象存储和现场验收仍未完成；总体完成度不变。

本轮完成对账收款、差额 / 核销和发送 / 回执 / 客户确认事务的 PostgreSQL 连接池迁移。订单确认、订单改量、订单作废、库存占用释放、出库 / 交付和 3 个对账事务共 8 个高风险仓储不再使用同步 `psql`，待迁移仓储降至 `21` 个。该项改善后端并发和连接串暴露面，但 SQL 参数化、真实 PostgreSQL 集成、对象存储、设备和现场验收仍未完成；完成度保持 P0 / 代码 `97-98%`、V1 上线就绪 `80-83%`。

本轮开始迁移 PostgreSQL 同步 CLI 仓储：订单确认主事务已改用共享 `pg` pool，并有事务回滚/连接释放回归；其余 28 个仓储和既有字符串 SQL 仍是后续技术债。该变化改善生产后端可用性和安全性，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、对象存储、设备、现场证据和签字仍未完成。

浏览器 bearer token 已从长期 `localStorage` 改为当前标签页 `sessionStorage`，并清理旧 seed token 本地键；正式导入员工现使用独立 runtime session，账号 / 撤销可写 PostgreSQL，seed token 不再能代表运行时员工。正式密码已升级为随机盐 scrypt v2，旧摘要成功登录后自动迁移，production readiness 已增加 8 岗位正式账号覆盖门禁。这仍不是 HttpOnly Cookie、refresh token 或外部身份提供方。完成度不变：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实员工导入、首次改密、设备、现场证据和签字仍未完成。

本轮把订单确认从“API 成功后仍本地再确认”收口为生产模式后端单一事实来源：严格运行模式下 API 失败不创建本地订单、库存占用、出库任务或待办；成功后刷新订单、库存、交付和待办投影。交付列表合同已补客户、订单明细、包裹和库存来源字段。该变化降低订单主链路分叉风险，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；其他写操作的生产降级收口、真实身份、PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮先处理审查发现的 API 上线边界：严格模式要求 `ERP_AUTH_SECRET`，关闭 `x-erp-user-id`、`x-erp-action-permissions`、legacy seed bearer 和默认办公室身份，业务路由需要有效 session；跨域改为白名单，JSON 请求默认上限 `24 MiB`，两个 closeout CLI 产物路径已脱敏。已通过严格模式专项和默认原型回归。这是安全与可控性修复，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实运行时账号 / 权限持久化、PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值 dry-run 证明继续收紧为“同一真实值片段指纹必须匹配”。`run-v1-production-env-intake-apply` 的 dry-run / apply 报告会记录脱敏片段指纹，`run-v1-production-env-values-dry-run-proof-check` 会在正式合并前重新计算当前片段指纹并比对；旧报告缺指纹、指纹无效或当前片段内容与 dry-run 片段不同都会阻断，且报告不输出真实值、真实路径或指纹摘要。该变化只关闭“用 A 片段 dry-run 后误拿 B 片段正式合并”的风险，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值正式合并的 CLI 主路径也补上 dry-run 证明门禁：新增 `run-v1-production-env-values-dry-run-proof-check`，并让第一阶段执行器在正式 `--production-env-values-file` 合并前先校验最近 dry-run 报告 ready、预计生产 env 预检 ready、最小 blocking 补值覆盖 ready、intake 阻塞为 0、默认 24 小时内有效、目标来源一致，以及真实值片段 / 目标安全 env 文件没有在 dry-run 后修改。发布 runbook 生成器和 checked-in runbook 已同步说明该门禁。该变化只关闭“命令行正式合并绕过最近 dry-run 证明”的风险，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮继续把 production env setup 安全 env 复用的新鲜度校验扩到所有重复解析入口：生产 env intake 校验、真实值白名单合并、生产持久化留证、runtime smoke、第一阶段执行器和 go-live suite refresh 现在都复用共享 resolver；直接入口和 suite 遇到旧 setup 报告会统一阻断。回扫确认旧的 setup 解析错误文案只剩共享 resolver 一处。当前本地真实 setup 可复用，但真实值 intake 仍为 `0/22`、最小阻塞补值 `0/11`、生产持久化留证 `3/8`。该变化只降低“不同入口对旧 setup 报告判断不一致”的风险，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮补了 production env setup 安全 env 复用链路的新鲜度防护：共享 setup 解析器现在要求 setup 报告包含有效 `checkedAt`，并校验安全 env 文件没有在 setup 报告生成后被修改；如果安全 env 文件较新，会阻断生产 env 预检、PostgreSQL / 对象存储预检、上线组合预检和 release candidate 等主链路复用旧报告，要求重新运行 setup。该变化只降低“编辑 env 后仍拿旧 setup 报告当作当前证据”的误判风险，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化第一阶段证据建议里的缺报告下一步继续对齐到 production env setup 安全 env 复用口径：缺少生产持久化留证时，`run-v1-production-first-stage-evidence-suggestions` 现在优先提示 `node -- scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file`，只有绕开 setup 报告时才改用显式 `--env-file <secure-env-file>`；`run-v1-production-persistence-evidence --help` 也把 setup-env 作为第一推荐。该变化只减少第一阶段现场缺报告时的命令误用风险，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值白名单合并的目标 env 解析继续对齐到 production env setup：`run-v1-production-env-intake-apply` 现在支持 `--use-production-env-setup-env-file` / `--production-env-setup-json`，单独 dry-run 或正式合并可复用 setup 报告里的目标安全 env 文件；第一阶段执行器在 setup 模式下调用 apply 子步骤也走同一路径。setup 报告、runbook、最小 / 全量真实值片段模板、handoff 和 suite 中的单独 apply dry-run 命令已改为 setup-env 主路径，显式 `--target-env-file` 只作为绕开 setup 报告的备用。canonical go-live suite 已刷新到 `2026-07-10T00:56:14.020Z`。这只减少生产 env 11 项真实值 dry-run / 合并时的目标路径转抄风险，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮继续补齐上线交接包里的 production env setup 路径脱敏：`production-env-setup.latest.json`、`production-env-setup.latest.md`、`handoff-manifest.json` 和 `handoff-summary.zh-CN.md` 现在都把安全 env 文件路径显示为 `env 文件 1（路径已脱敏）`，并保留 `pathRedacted=true` / `envFilePathExposed=false`；canonical go-live suite 已刷新到 `2026-07-10T00:38:26.529Z`，扫描确认 canonical handoff 和 suite handoff 不再包含 `secure-prod.env` 或 `.erp-local-storage/v1-production-env/secure-prod.env`。这只修复生产 env 交接材料中的 setup 报告路径暴露缺口，不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮继续补强生产 env 交接脱敏：release candidate 汇总报告现在不会把嵌套 env 文件审计里的安全 env 文件路径写入发布候选、handoff 或 go-live suite，只显示 `env 文件 1` 和 `pathRedacted=true`。这减少了生产 env 交接材料中的路径暴露风险，但不改变完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮复核“现有模块还有哪些未完成”时同步补齐了 release candidate、现场证据清单、runbook、handoff 和 go-live suite refresh 的 production env setup 安全 env 复用口径。release candidate runner 已支持 `--use-production-env-setup-env-file`，现场证据清单和生产 env runbook 生成产物已刷新，显式 `--env-file` 只保留为绕过 setup 报告的备用路径。当前最新 suite 仍显示：P0 / 代码 `97-98%`，V1 上线就绪 `80-83%`，生产上线阶段 `1/5`，发布门禁 `0/4`，生产 env 最小真实值 `0/11`，现场证据 `0/34`，负责人签字 `0/6`，现场任务 `53`。因此模块完成度百分比不变：代码原型接近完成，但 V1 真实上线仍卡在真实生产资源、硬件、现场证据和负责人签收。

本轮把生产 env 真实值 intake 校验从“显式传 `--env-file` 为主”推进到“默认复用 production env setup 安全 env 文件”。`run-v1-production-env-intake-verify` 已支持 `--use-production-env-setup-env-file` / `--production-env-setup-json`，并校验 setup 报告 scope、ready、git ignore / 未跟踪、可选 `0600` 和文件存在；输出只保留 `production_env_setup`、`生产 env setup 安全文件`、`envFileFromProductionSetup=true` 等脱敏来源字段，不暴露安全 env 文件路径或真实变量值。runbook、生成器、生产上线阶段清单、生产上线组合预检指导、handoff 缺失提示和真实值执行计划已同步为 setup-env 主路径，显式 `--env-file` 只保留为绕过 setup 报告的备用路径。已刷新真实 intake verify 和 canonical go-live suite；真实状态仍是 setup `prepared`、生产 env 真实值 intake `0/22`、最小阻塞补值 `0/11`、阻塞 `11`、警告 `8`、生产上线阶段 `1/5`、发布门禁 `0/4`、现场证据 `0/34`、负责人签字 `0/6`、现场任务 `53`。该变化只降低 intake 校验手工转抄 env 路径和路径泄露风险，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把 V1 发布前 runbook 的第一阶段 / runtime smoke 显式 env 文件命令继续降级为“备用路径”：`--use-production-env-setup-env-file` 是推荐主流程，`--env-file <secure-env-file>` 只在需要绕开 production env setup 报告时使用。生成器、checked-in runbook、canonical handoff runbook 和模板检查断言已同步；旧完成度说明里“命令文档统一使用 --env-file”的表述也已改为当前 setup-env 口径。已刷新 canonical go-live suite；真实状态仍是 setup `prepared`、生产 env 预检 `2/10`、真实值 intake `0/22`、最小阻塞补值 `0/11`、生产上线阶段 `1/5`、发布门禁 `0/4`、现场证据 `0/34`、负责人签字 `0/6`、现场任务 `53`。该变化只降低现场按 runbook 执行第一阶段时误用手工 env 路径的风险，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 第一阶段真实值片段命令从“主流程仍要求手工传 `--env-file`”对齐到“默认复用 production env setup 安全 env 文件”。setup 报告、最小真实值片段模板、全量真实值片段模板、上线交接包和 suite handoff 副本现在都默认使用 `--use-production-env-setup-env-file` 运行 first-stage dry-run / 正式合并，显式 `--env-file <secure-env-file>` 只保留为绕过 setup 报告的备用路径。已刷新 production env setup latest 和 canonical go-live suite；真实状态仍是 setup `prepared`、生产 env 预检 `2/10`、真实值 intake `0/22`、最小阻塞补值 `0/11`、生产上线阶段 `1/5`、发布门禁 `0/4`、现场证据 `0/34`、负责人签字 `0/6`、现场任务 `53`。该变化只降低第一阶段补真实值后的命令误用风险，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 API runtime smoke 从“需要人工传 `--env-file` 路径”推进到“可直接复用 production env setup 安全 env 文件”。`run-v1-production-runtime-smoke` 已支持 `--use-production-env-setup-env-file`，并在 JSON / Markdown、handoff 摘要和 manifest 中显示脱敏 env 来源；runbook 和第一阶段证据建议也改为优先推荐 setup 复用。真实 latest 已刷新为 `blocked / 1/4`：env 文件审计通过且来源为 `生产 env setup 安全文件`，但生产持久化 env 子集仍缺真实 PostgreSQL、附件对象存储和对账导出对象存储变量，临时 API 仍无法通过 `/health`。该变化只降低生产环境 / 持久化第一阶段的操作误差，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、生产 API profile、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化的底层留证从“源目录可查”推进到“最终 handoff / suite 直接可查”。交接包现在包含 `production-persistence-evidence.latest.md/json` 和 `production-runtime-smoke.latest.md/json`，可直接看到生产 env 文件审计、持久化 env 子集、PostgreSQL live 预检、备份恢复、对象存储 live 预检、bucket 治理、API runtime smoke 和运行态 profile 的阶段状态。真实刷新结果仍 blocked：持久化留证 `3/8` 通过，runtime smoke `1/4` 通过；当前仍缺真实 PostgreSQL、恢复验证库、附件 / 对账对象存储真实值和可启动的生产 API profile。该变化只提高交接可追踪性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实生产 env、持久化外部资源、现场证据、负责人签字和 V1/V2 边界确认仍未完成。

本轮把真实打印链路从“只有 closeout 进入最终交接包”补成“完整执行链路进入 handoff / suite”。上线交接包现在包含 `print-chain-execution.latest.md/json`，可直接看到 CUPS 队列 non-printing 预检、API 打印 readiness 保存和打印 closeout 的顺序、阻塞、下一步和脱敏护栏；go-live suite 同步透传并刷新 canonical latest。真实最新执行结果仍为 `blocked`：`0/3` 步骤通过，CUPS printer allowlist 未配置，打印 readiness `3/9`，打印 closeout `4/8`，`print_hardware` 现场证据 `0/7`。该变化只提高打印阶段交接可追踪性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 CUPS / 打印机队列、标签 / 针式机出纸、纸张对位、条码扫码、spool / 驱动回写、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 第一轮真实值补填继续收窄成独立最小补值验收清单。除全量 `production-env-real-value-intake.zh-CN.md` / `.csv` 和 `production-env-minimum-values-fragment.template.env.example` 外，setup 与上线交接包现在也生成 `production-env-minimum-real-value-intake.zh-CN.md` / `.csv`，只包含当前 11 项最小 blocking 真实值路径，并排除 warning / optional fallback、安全字面值和任选组非首选别名；setup 侧最小片段口径也已和 handoff 对齐，明确排除 safe literal 行。该变化只降低现场第一次分派真实 PostgreSQL、恢复验证库、对象存储、打印桥和 CUPS 值的操作摩擦，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值 dry-run 证明时效继续补成可直接执行判断的字段：除已有 `dryRunProofFresh`、`dryRunProofFreshnessLabel`、`dryRunProofMaxAgeHours`、`dryRunProofAgeHours` 外，状态 API、live-run、办公室 `上线状态`、OpenAPI 和 handoff 现在也显示 / 保留 `dryRunProofExpiresAt`、`dryRunProofRemainingHours`。页面显示 `dry-run 失效` 和 `dry-run 剩余`，缺少证明时保持空失效时间 / null 剩余小时，目标 env 仍不可写。该变化只提升现场正式合并前判断 dry-run 证明是否快过期的可见性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值 dry-run 证明继续收紧为“ready + 匹配当前最小补值路径 + 在有效期内”。默认有效期为 24 小时，可通过 `ERP_V1_PRODUCTION_ENV_VALUES_DRY_RUN_MAX_AGE_HOURS` 调整；设为 `0` 只关闭时效窗口，不关闭当前最小补值路径匹配。状态 API、live-run、办公室 `上线状态`、OpenAPI、handoff 和 go-live suite 已显示 / 保留脱敏时效字段：`dryRunProofFresh`、`dryRunProofFreshnessLabel`、`dryRunProofMaxAgeHours`、`dryRunProofAgeHours`、`dryRunProofCheckedAtIncluded`。当前 canonical latest 仍未纳入真实值 dry-run，页面显示 `dry-run 证明缺少检查时间` 和 `24 小时`，正式合并仍不可写目标 env。该变化只提高上线门禁安全性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值 dry-run 证明从“看最小补值是否 `11/11`”收紧到“必须匹配当前最小阻塞补值路径”。intake verify、intake apply dry-run、生产环境 / 持久化第一阶段执行器、上线交接包和状态 API 现在都会携带只含变量名和任选组名的目标签名；正式合并真实值要求 dry-run ready、生产 env 预检 ready 且签名匹配当前 11 项最小补值，否则按 stale / mismatched 阻断并保持目标 env 不可写。最小真实值片段排除 safe literal 行，当前仍只需 11 项真实值。该变化只提高生产 env 合并门禁准确性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把离线交接从“知道生产 env 第一轮缺哪 11 项”推进到“打开 handoff 就能看到真实值片段 dry-run / 正式合并命令”。`handoff-summary.zh-CN.md` 新增 `生产 env 真实值片段执行计划`，推荐使用 `production-env-minimum-values-fragment.template.env.example` 复制为安全未跟踪片段，先跑 `--production-env-values-dry-run`，确认无阻塞后再正式合并并继续第一阶段，同时给出 intake 校验和 suite 刷新命令；manifest 保留脱敏 `productionEnvValueExecutionPlan`，明确不包含真实值、真实文件路径或浏览器提交值。该变化只提高离线交接可执行性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值校验的 11 项最小阻塞补值从状态页继续同步到离线交接包和 go-live suite：`handoff-summary.zh-CN.md` 新增 `最小补值清单` 表格，manifest 保留脱敏 `minimumBlockingItems`，`production-go-live-stage-checklist` 在 `生产 env 真实值 intake 校验` 阶段列出同一组 11 项。已刷新 canonical latest，当前 suite 仍 `blocked_go_live_suite_written`，生产上线阶段 `1/5`、发布门禁 `0/4`、现场证据 `0/34`、负责人签字 `0/6`、现场任务 `53`。该变化只提高离线交接可执行性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值校验里的 `0/11` 最小阻塞补值继续细化为 11 项可分派清单：状态 API、client 和办公室 `上线状态` 页面现在直接展示 `minimumBlockingItems`，包含 1 个 PostgreSQL 任选组和 10 个变量行，并显示负责人、变量/组选项、来源系统、值类型、配置/验收状态和下一步。页面继续不接收或展示真实 env 值、连接串、bucket、secret、命令值、spool 路径、文件路径和证据编号。该变化不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把第一阶段真实值 intake 覆盖从执行报告继续接到状态 API 和办公室 `上线状态` 页面：常驻 first-stage 卡片和执行结果现在直接显示全量清单 `0/22`、最小 blocking 补值 `0/11`、最小补值缺 `11`、建议 / 可选补值 `0/8` 和 intake CSV ready；dry-run 字段也改成 `dry-run 最小补值`，避免和当前 first-stage intake 阻塞混淆。已通过状态页/API、API 骨架、OpenAPI、构建、diff 和内置浏览器 581px 检查；状态页可见 intake 覆盖字段，无横向溢出，控制台错误 0。该变化不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化第一阶段执行报告补成更清楚的真实 env 缺项视图：第一阶段 latest 现在不仅显示 `1/8` 和 `生产 env 真实值 intake 校验` 阻塞，还在 summary、阶段 evidence 和 Markdown 中显示全量真实值清单 `0/22`、最小 blocking 补值 `0/11`、建议 / 可选补值 `0/8`、缺失行 `22`、阻塞 `11`、警告 `8`、env 文件审计 ready、intake CSV ready。已通过第一阶段执行专项、go-live suite 和 diff 检查，并刷新 `.erp-local-storage/v1-production-first-stage-execution/latest.*`。该变化只让第一阶段交接更容易判断“现在差哪些真实值、第一轮先补多少”，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`；真实 PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把对象存储 key prefix 脱敏护栏上卷到生产持久化留证汇总：`production-object-storage-preflight` 阶段 evidence 现在显示 `keyPrefixExposed=false`，总 `safeguards` 显示 `objectStorageKeyPrefixExposed=false`，Markdown 报告显示 `Object-storage key prefix exposed: no`。已通过持久化留证专项、第一阶段执行和 go-live suite 检查，并刷新生产持久化留证 latest。该变化只让第一阶段留证能直接证明 key prefix 未泄露，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，刷新后的持久化留证仍 `blocked / 2/8` 且 `envFileCount=0`；真实安全生产 env 文件、PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把对象存储 key prefix 护栏继续补到生产对象存储 live 预检：附件和对账导出对象存储在执行真实诊断对象写入 / 读回 / 删除前，会先阻断 URL、绝对路径、`../`、反斜杠、空路径段或带空白的 key prefix；非法时只显示 `keyPrefixValid=false` 和变量名，不调用远端对象存储，也不泄露真实 prefix / 对象 key。已通过对象存储 live 预检专项、持久化留证、第一阶段执行和 go-live suite 检查，并刷新生产持久化留证 latest。该变化降低真实 OSS/S3/COS live 预检误写路径风险，但不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，刷新后的持久化留证仍 `blocked / 2/8` 且 `envFileCount=0`；真实安全生产 env 文件、PostgreSQL、恢复验证库、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮收紧了生产 env 对象存储 key prefix 预检：附件和对账导出对象存储现在会阻断 URL、绝对路径、`../`、反斜杠、空路径段或带空白的 key prefix，只接受相对对象 key 前缀；报告只显示 `keyPrefixValid` 和变量名，不泄露真实 prefix。已通过生产 env 预检、setup、第一阶段执行、持久化留证、go-live suite 和 diff 检查，并刷新 production env setup latest。该变化降低真实 OSS/S3/COS 接入后的路径误配风险，但不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产 env 预检仍 `2/10`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储真实值、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把办公室端 `执行第一阶段` live-run 的 runtime smoke 来源补到当前长驻 API。服务端现在把当前请求推导出的 API 地址传给第一阶段执行器供 runtime smoke 内部探针使用，但继续忽略请求体，不接受浏览器传入 API 地址、env 路径、真实值片段或 env 值；页面显示 `runtime smoke 当前 API`、`API 地址输入 不接受`、`runtime smoke API 当前请求`。当前运行中 API 读回仍 `blocked / 1/8`，首个阻塞仍是 `生产 env 真实值 intake 校验`，伪造 API 地址、路径和 fake token 未泄露。已通过状态页/API 专项、OpenAPI、API 骨架、构建、diff、直接 API 和 581px / 390px 浏览器验证。该变化只让真实 env 配好后的第一阶段 runtime smoke 更明确证明当前长驻 API，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把第一阶段真实值 dry-run live-precheck 的结果补成正式合并前置证明视图。`POST /api/system/v1-production-first-stage-values-dry-run/live-precheck` 现在在响应摘要、服务端配置提示、安全护栏和顶层 proof 对象中返回脱敏 `dryRunProofStatus`、`dryRunProofReady`、`dryRunProofMinimumBlockingLabel` 和缺项数；办公室端 `最近真实值 dry-run` 结果卡同步显示 `dry-run 证明`、`dry-run 最小补值`、`dry-run 缺`。当前运行中 API 读回仍是 `not_configured / not_included / 0/0`，不写目标 env，伪造路径和 fake secret 未泄露。已通过状态页/API 专项、API 骨架、OpenAPI、构建、diff、直接 API 和 581px / 390px 浏览器验证。该变化只降低 dry-run 后能否进入正式合并门禁的判断误差，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值正式合并门禁从“开关 + 唯一真实值片段 + 片段审计 + 目标 setup ready”继续收紧到“还必须有最近第一阶段真实值 dry-run 证明 ready”。`GET /api/system/v1-go-live-status` 和 `正式合并真实值` live-run 现在返回脱敏 `dryRunProofStatus`、`dryRunProofReady`、`dryRunProofMinimumBlockingLabel` 和缺项数；页面显示 `dry-run 证明`、`dry-run 最小补值`、`dry-run 缺`。当前运行中 API 读回仍是 `disabled`、`dryRunProofStatus=not_included`、`targetEnvFileMayBeMutated=false`，伪造路径和 fake secret 未泄露。已通过状态页/API 专项检查、API 骨架、OpenAPI、构建、diff、直接 API、伪造请求体和默认宽度 / 390px 浏览器验证。该变化只降低跳过 dry-run 后直接写目标 env 的风险，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值片段文件安全审计接入上线状态页和第一阶段执行入口。`GET /api/system/v1-go-live-status` 现在在 `真实值片段来源` 和 `正式合并开关` 中返回脱敏 `valuesFileAuditStatus`、是否 ready、阻塞数和警告数；`真实值 dry-run` 与 `正式合并真实值` 在片段文件未通过审计时会先返回 `audit_blocked`，不会调用 dry-run / apply 执行器，也不会写目标 env。页面显示 `片段审计`、`审计阻塞`、`审计警告`，并继续不暴露真实片段路径、env 值、连接串、bucket、secret、命令值、spool 路径、token 或伪造请求体内容。已通过状态页/API 专项检查、临时不安全 `.env.example` 片段阻断回归、API 骨架、OpenAPI、构建、diff、直接 API 和 581px / 390px 浏览器验证。该变化只降低真实值 dry-run / 正式合并前误用不安全片段的风险，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把 production env setup 安全草稿生成/复核接到办公室端 `上线状态 > 生产配置门禁`。`POST /api/system/v1-production-env-setup/live-run` 现在由 `system.v1_production_env_setup.run` 权限控制，只按服务端默认规则生成或复核安全 env 草稿；接口忽略请求体，不接受前端目标路径、导入路径或 env 值，不使用 force 覆盖，不写真实生产值、不执行迁移、不刷新候选或 suite。页面执行结果为 `prepared`、`setupReady=true`、生产 env 预检 `2/10`、剩余修正 `8 项`，并明确 `请求体 已忽略`、`路径暴露 否`、`真实值写入 否`。该变化只减少现场从状态页进入安全 setup 的摩擦，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化第一阶段的真实值 dry-run 补上 production env setup 目标安全 env 门禁。`POST /api/system/v1-production-first-stage-values-dry-run/live-precheck` 现在会在调用第一阶段 dry-run 执行器前读取脱敏 `targetSetupStatus`；如果服务端真实值片段唯一配置但 production env setup 目标安全 env 文件未 ready，会返回 `target_not_ready` 并停止，不写目标 env、不执行迁移、不刷新候选。办公室端 `上线状态` 的 `最近真实值 dry-run` 和服务端配置提示现在显示 `目标 setup`、`setup 报告`、`目标 env 文件`。当前运行中 API 读回仍 `not_configured`，但已返回 `targetSetupStatus=configured`、`targetSetupReady=true`、`targetSetupEnvFileCount=1`、`productionEnvFileMutated=false`、`requestBodyIgnored=true`，伪造路径和 fake secret 未泄露。该变化只降低真实值 dry-run 前误用未就绪目标 env 的风险，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值正式合并门禁从“开关 + 真实值片段来源”继续收紧到“开关 + 唯一真实值片段来源 + production env setup 目标安全 env 文件 ready”。`GET /api/system/v1-go-live-status` 和 `POST /api/system/v1-production-first-stage-values-apply/live-run` 现在都会返回脱敏 `targetSetupStatus`；办公室端 `上线状态` 在 `正式合并开关` 和 `最近正式合并真实值` 中显示 `目标 setup`、`setup 报告`、`目标 env 文件`，并新增 `target_not_ready` 阻断口径，目标 setup 未 ready 时不会调用合并器、不会写目标 env。当前运行中 API 读回仍 `disabled`，`targetSetupStatus=configured`、`targetSetupReady=true`、`targetSetupEnvFileCount=1`、`targetEnvFileMayBeMutated=false`、`productionEnvFileMutated=false`；伪造路径和 fake secret 未泄露。该变化只降低正式合并真实值前误写安全 env 草稿的风险，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值正式合并开关状态提前接到上线状态 API 和办公室端 `上线状态` 页面。原先页面已有 `正式合并真实值` 受控按钮，但服务端开关 `ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED` 是否启用、真实值片段来源是否唯一配置，主要要点击后看结果卡。现在 `GET /api/system/v1-go-live-status` 返回脱敏 `productionEnvValuesApplyGateStatus`，页面在 `生产环境 / 持久化第一阶段` 常驻显示 `正式合并开关`、开关变量、开关启用状态、真实值片段配置状态、当前来源、`目标 env 可能写入`、`本次已合并`、`目标 env 已写入`、`请求体 已忽略`、`路径暴露 否`、`迁移 apply 未执行` 和服务端来源状态。该变化只提升正式合并前的安全状态可见性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。本轮内置浏览器控制通道连续超时，未补新的桌面 / 390px 截图证据，视觉验收需后续补跑。

本轮把生产 env 真实值片段来源状态提前接到上线状态 API 和办公室端 `上线状态` 页面。原先页面能展示最小真实值片段模板，也能点击 `真实值 dry-run` 后看到服务端配置指引，但负责人必须先点一次 dry-run 才知道当前 API 进程是否已经配置 `ERP_V1_PRODUCTION_ENV_VALUES_FILE` / 最小片段 fallback / 兼容片段 fallback。现在 `GET /api/system/v1-go-live-status` 返回脱敏 `productionEnvValuesFragmentSourceStatus`，页面在 `生产环境 / 持久化第一阶段` 常驻显示 `真实值片段来源`、主变量、fallback、当前来源、已配置来源数、`前端传路径 不允许`、`真实路径暴露 否`、`dry-run 未执行`、`目标 env 写入 否` 和三行服务端来源状态。该变化只提升执行真实值 dry-run 前的配置来源可见性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 最小真实值片段模板接到上线状态 API 和办公室端 `上线状态` 页面。原先交接包已有 `production-env-minimum-values-fragment.template.env.example`，页面也提示先按最小 blocking 片段补 11 项，但页面没有直接展示该片段内容。现在 `GET /api/system/v1-go-live-status` 返回脱敏 `productionEnvMinimumValuesFragmentTemplate`，页面新增 `最小真实值片段模板`，显示 11 个变量、目标 `0/11`、阻塞段 5、`写 env 否`、`浏览器值 不接收` 和脱敏预览；生产环境阶段、真实值校验和第一阶段区块都可直接跳到该模板。该变化只提升生产 env 第一轮真实值补填可见性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值 intake 快照继续接成上线状态页的实时只读校验入口。办公室 / 管理账号在 `上线状态 > 生产 env 真实值校验` 里可点击 `重新校验真实值`，后端只复用服务端 production env setup latest 的安全 env 文件和固定 intake CSV，不接受前端路径或 env 值；结果卡显示 `最近真实值校验`、真实值清单 `0/22`、最小补值 `0/11`、建议 / 可选 `0/8`、阻塞 `11 项`，并明确 `请求体 已忽略`、`路径暴露 否`、`写 env 否`、`候选刷新 否`。该变化只提升办公室复核当前真实值 intake 状态的可操作性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值校验里的“最小补值路径”直接放到上线状态页。办公室 / 管理账号在 `上线状态 > 生产 env 真实值校验` 里现在可直接看到 `最小阻塞补值 0/11`、`建议 / 可选补值 0/8` 和 `优先补值路径`：先按最小 blocking 片段补 11 项（10 个变量行 + 1 个任选组），补完后先跑 `真实值 dry-run`，通过后再正式合并真实值；页面同时明确 `仍不接收浏览器 env 值`。该变化只提升生产 env 第一轮补值顺序的可见性，不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化第一阶段执行接到上线状态页的受控 live-run。办公室 / 管理账号现在可在 `上线状态 > 生产环境 / 持久化第一阶段` 点击 `执行第一阶段`；后端由 `system.v1_production_first_stage_execution.run` 权限控制，只复用服务端 production env setup latest 的安全 env 文件，忽略请求体，不接受前端路径 / env 值 / 真实值片段，默认不执行迁移 apply、不允许恢复验证库重置、不正式合并真实值、不刷新 release candidate / go-live suite、不调用打印机 / 司机真机、不写业务数据。桌面和 390px 浏览器验证均确认结果卡片显示 `最近第一阶段执行`、`1/8`、阻塞 `生产 env 真实值 intake 校验`，且无横向溢出和敏感路径 / fake secret 泄露。该变化提升正式合并真实值后的受控执行能力，但不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化第一阶段的真实值正式合并入口接到上线状态页。办公室 / 管理账号现在可在 `上线状态 > 生产环境 / 持久化第一阶段` 点击 `正式合并真实值`；后端由 `system.v1_production_first_stage_values_apply.run` 权限和 `ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED=true` 服务端开关共同控制，默认返回 `disabled`，不接受前端路径或 env 值，不写目标 env，不执行迁移、不刷新 release candidate / go-live suite、不写业务数据。桌面和 390px 浏览器验证均确认结果卡片显示 `未启用`、`请求体 已忽略`、`路径暴露 否`、`目标 env 写入 否`。该变化提升真实值 dry-run 通过后的受控执行能力，但不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化第一阶段的真实值片段 dry-run 接到上线状态页的受控 live precheck。办公室 / 管理账号现在可在 `上线状态 > 生产环境 / 持久化第一阶段` 点击 `真实值 dry-run`，后端只读取服务端配置的安全真实值片段路径，不接受前端路径或 env 值；未配置时显示 `未配置`、`请求体 已忽略`、`路径暴露 否` 和 `ERP_V1_PRODUCTION_ENV_VALUES_FILE` 配置指引。该变化提升第一阶段现场执行可操作性和脱敏可见性，但不改变总体完成度：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产环境 / 持久化第一阶段执行结果补到上线状态 API 和办公室端 `上线状态` 页面。现在状态页可直接看到第一阶段 `1/8`、阻塞在 `生产 env 真实值 intake 校验`、真实值 dry-run 覆盖 `未纳入`，以及下一步应先运行 `--production-env-values-dry-run`。同时已刷新第一阶段执行产物和 go-live suite canonical latest；当前总体百分比不变：P0 / 代码仍 `97-98%`，V1 真实上线就绪仍 `80-83%`，生产上线阶段仍 `1/5`，发布门禁 `0/4`，现场证据 `0/34`，负责人签字 `0/6`，现场 / 部署任务 `53`。

本轮把第一阶段执行器的生产 env 真实值片段 dry-run 覆盖结果继续接入上线交接包 / go-live suite 摘要。`run-v1-go-live-handoff-pack` 会保留 `productionFirstStageExecution.summary.productionEnvValuesDryRunCoverage`：当 first-stage latest 是 `--production-env-values-dry-run` 产物时，`handoff-summary.zh-CN.md` 的“生产环境 / 持久化第一阶段执行”会显示预计 env 预检、全量 intake、最小 blocking 补值和 warning / optional 补值覆盖；当当前 latest 不是 values dry-run 产物时，handoff 明确显示“真实值 dry-run 覆盖：未纳入”，避免静默空白。该变化只降低现场打开交接目录时的误读风险，不提高完成度百分比；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把第一阶段执行器的生产 env 真实值片段 dry-run 覆盖结果补到顶层摘要。`run-v1-production-first-stage-execution --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run` 现在除 stage evidence / Markdown 明细外，还会在 `summary.productionEnvValuesDryRunCoverage` 和 Markdown 顶部显示预计生产 env 预检、全量 intake、最小 blocking 补值和 warning / optional 补值覆盖。该变化只减少 handoff / suite 或现场自动化只读顶层 summary 时的误判风险，不提高完成度百分比；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把第一阶段执行器的生产 env 真实值片段 dry-run 报告补到“上层直接可判断最小阻塞补值”。`run-v1-production-first-stage-execution --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run` 现在从下层 intake-apply dry-run 提取 `minimumBlockingCoverage` / `minimumWarningCoverage`，并在第一阶段 stage evidence 和 Markdown 中显示最小 blocking 补值 `11/11`、建议 / 可选补值缺口和 ready 状态。该变化只降低现场看上层报告时的误判风险，不提高完成度百分比；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值合并 dry-run 从“单独显示最小 blocking 补值覆盖”继续补到“同时显示建议 / 可选补值覆盖”。`run-v1-production-env-intake-apply --dry-run` 现在输出 `minimumBlockingCoverage` 和 `minimumWarningCoverage`，现场只填写最小片段时可直接判断当前最短阻塞路径是否已 `11/11` 补齐；使用全量片段时也能单独看到 warning / optional 路径是否仍缺项。safe literal 写错会计入最小补值缺项。该变化只降低真实 env 正式合并前的判断误差，不提高完成度百分比；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值片段模板从单一全量模板拆成“最小 blocking 补值片段”和“全量白名单片段”。`run-v1-production-env-setup` 与 `run-v1-go-live-handoff-pack` 现在都会生成 `production-env-minimum-values-fragment.template.env.example`：只含当前最小 blocking 补值路径，排除 warning / optional fallback 和非首选任选别名；全量 `production-env-values-fragment.template.env.example` 仍保留完整白名单变量，供后续一次性补齐 warning 或独立 fallback。该变化只减少第一轮生产 env 真实值填写误差，不提高完成度百分比；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值片段 dry-run 接入第一阶段执行器：现场可直接运行 `run-v1-production-first-stage-execution --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run`，只做白名单合并 dry-run，输出预计生产 env 变量预检和 intake 覆盖结果，不写目标 env，也不继续后续第一阶段。已刷新 production env setup、go-live handoff 和 go-live suite canonical latest。该变化只减少正式合并真实值前的误操作风险，不提高完成度百分比；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和负责人签字仍未完成。

本轮把生产 env 真实值 intake 的展示口径补细：报告现在同时显示全量清单和最小补值路径，避免把 `0/22` 误解成当前必须一次性填写 22 个真实值。当前 canonical latest 为全量清单 `0/22`，最小阻塞补值 `0/11`（10 个变量行 + 1 个任选其一变量组），建议 / 可选补值 `0/8`（7 个变量行 + 1 个任选其一变量组）；生产上线组合预检仍 `1/5`，首个阻塞仍是 `生产 env 真实值 intake 校验`，发布门禁 `0/4`、现场证据 `0/34`、签字 `0/6`、现场任务 `53`。该变化只提高生产 env 补值优先级可读性，不提高完成度百分比。

本轮把生产 env 真实值 intake 的对账导出对象存储口径与生产预检规则对齐：对账导出可以复用完整附件对象存储 fallback，独立 `ERP_STATEMENT_EXPORT_OBJECT_STORAGE_*` bucket 只在财务需要独立留档时再配置。`run-v1-production-env-setup` 现在把未开始配置独立对账 bucket 的 4 行标成 `optional_fallback`；`run-v1-production-env-intake-verify` 在附件 fallback 完整后会把这些行视为不必填，只有独立 bucket 部分配置时才阻塞。当前 canonical latest 仍 blocked：生产上线组合预检 `1/5`，首个阻塞仍是 `生产 env 真实值 intake 校验`，真实值 intake `0/22` 已配置、11 项阻塞、8 项警告；发布门禁 `0/4`、现场证据 `0/34`、签字 `0/6`、现场任务 `53`。该变化只修正重复 blocker，不提高完成度百分比。

本轮把生产上线组合预检从四阶段更新为五阶段：`run-v1-production-go-live-precheck` 现在在 env 文件安全审计之后、生产 env 变量预检之前先跑 `生产 env 真实值 intake 校验`；go-live suite 离线阶段清单、状态 API 和前端 fallback 已同步为 `1/5` / `0/5` 口径。当前 canonical latest 仍为 blocked：生产上线组合预检 `1/5`，首个阻塞是 `生产 env 真实值 intake 校验`，真实值 intake `0/22` 已配置、15 项阻塞、4 项警告；发布门禁 `0/4`、现场证据 `0/34`、签字 `0/6`、现场任务 `53`。该变化提高了上线缺口定位准确性，但不提高完成度百分比。

本轮把生产 env 真实值片段模板补到 setup / handoff 产物中：`run-v1-production-env-setup` 和 `run-v1-go-live-handoff-pack` 现在都会生成 `production-env-values-fragment.template.env.example`，该文件只含注释占位、任选其一提示和安全字面值，现场可复制成安全未跟踪 env 片段，填入真实值后交给第一阶段执行器的 `--production-env-values-file <secure-values-env-fragment>`。该变化减少从真实值 intake 清单到安全片段的手工转抄错误，但不提高完成度百分比：默认安全 env 草稿仍未配置真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实订单、现场证据和签字。

本轮把生产 env 真实值白名单合并入口接入生产环境 / 持久化第一阶段执行器：`run-v1-production-first-stage-execution` 现在可传 `--production-env-values-file <secure-values-env-fragment>`，在 env 文件审计前先把独立安全真实值片段按 intake 白名单合并到唯一目标安全 env 草稿，并刷新 setup / intake verify latest，再继续真实值校验、变量预检、迁移计划、持久化留证、runtime smoke、证据建议和 closeout。未传该参数时仍保持原 8 步；传入后为 9 步。该变化降低现场漏跑 `run-v1-production-env-intake-apply` 或跑错目标 env 的风险，但不提高完成度百分比：默认安全 env 草稿仍未配置真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实订单、现场证据和签字。

本轮新增生产 env 真实值白名单合并入口：`run-v1-production-env-intake-apply` 会读取安全未跟踪的真实值 env 片段，只把 `production-env-real-value-intake.csv` 中列出的变量合并进目标安全 env 草稿，并在成功后刷新 setup / intake verify latest；清单外变量、任选别名冲突、safe literal 不匹配或 env 安全审计失败都会阻断。该变化降低现场把真实值从片段合并到统一 env 草稿时的漏项、错项和误写 secret 风险，但不提高完成度百分比：默认安全 env 草稿仍未配置真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实订单、现场证据和签字。

本轮把生产 env 真实值 intake 校验纳入生产环境 / 持久化第一阶段执行器：`run-v1-production-first-stage-execution` 现在按 8 步顺序执行，第二步先跑 `run-v1-production-env-intake-verify`，再进入生产 env 变量预检。当前真实 latest 已刷新为 `1/8`：env 文件安全审计通过，阻塞停在 `生产 env 真实值 intake 校验`，仍为 15 项阻塞、4 项警告、0/22 已配置；未继续执行生产 env 变量预检、迁移、持久化 live 留证、runtime smoke 或 closeout。该变化提高第一阶段执行顺序和留证口径的准确性，但不提高完成度百分比；真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和签字仍未完成。

本轮新增生产 env 真实值 intake 校验器：`run-v1-production-env-intake-verify` 会把安全 env 文件和 `production-env-real-value-intake.csv` 对照，检查必填变量、任选其一别名组、别名冲突、安全固定值和 `filled` / `verified` / `evidenceRef` 回填状态，并输出脱敏 `latest.json` / `latest.md`。当前默认实际结果仍为 `blocked`：env 文件安全审计通过、intake CSV 可读，22 行真实值清单 0 行已配置，15 项阻塞、4 项警告；阻塞集中在 PostgreSQL 生产库任选组、恢复验证库、对象存储、打印 command_bridge 和 CUPS 队列。该变化提高了真实值填写后的验收可操作性，但不提高完成度百分比：真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和签字仍未完成。

本轮新增生产 env 真实值填写 / 验收清单：`run-v1-production-env-setup` 和 `run-v1-go-live-handoff-pack` 会生成 `production-env-real-value-intake.zh-CN.md` / `.csv`，把缺失变量按负责人、替代组、来源系统、值类型、填写 / 验收 / 证据编号拆成可跟进表格；`ERP_V1_DATABASE_URL / DATABASE_URL / PGURL` 和 `ERP_V1_READINESS_API_BASE_URL / VITE_ERP_API_BASE_URL` 被明确标为“任选其一”。该变化降低现场把别名全部当必填或多处填不同真实值的风险，但不提高完成度百分比：生产 env 变量预检仍 `2/10`，发布门禁仍 `0/4`，现场证据仍 `0/34`，签字仍 `0/6`，真实 PostgreSQL、对象存储、打印 / CUPS、司机真机和真实订单试跑仍未完成。

本轮修复了生产 env 修正清单 / 填写模板在格式错误场景下的交接缺口：无效 PostgreSQL 连接串现在会进入 `v1-persistence-profile` 的 fix checklist，setup 和 handoff 生成的 `production-env-fill-template.env.example` 只输出真实 env 变量名，不会把 `valid PostgreSQL connection string`、`http/https URL`、`positive integer` 等说明变成假占位变量。已刷新生产 env setup、go-live suite 和 handoff latest。该变化提升现场填 env 的准确性，但不提高完成度百分比：真实 PostgreSQL、恢复验证库、对象存储、打印 / CUPS、司机真机、业务试跑、现场证据和签字仍未完成。

本轮增强了生产 env 预检的真实值格式护栏：不再只看变量是否存在，还会阻断非 PostgreSQL 连接串、恢复验证库与生产库同 host/port/database、对象存储 endpoint 非 http/https、bucket 写成 URL / 路径、CUPS timeout 非正整数等常见误填；readiness / 现场验收 API URL 格式错误会作为 warning。该变化能让现场填入真实值后更早发现错误，但不提高完成度百分比：真实 PostgreSQL、对象存储、打印 / CUPS、司机真机、真实业务试跑、现场证据和签字仍未完成。

本轮把生产 env 文件的“审计 / 预览来源”和“上线应用来源”拆清楚：文件应用预检仍可用 `ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS` 做 audit-only 预览兜底，但生产 go-live 和 release candidate refresh 只接受 `ERP_V1_PRODUCTION_ENV_FILE` / `ERP_V1_ENV_FILE`。若只配置 audit-only 变量，页面会显示已配置但被忽略，不会让上线门禁通过。本轮不提高完成度百分比：生产 env 预检仍未通过，第一阶段执行最新为 `1/8` 并停在真实值 intake 校验，发布门禁仍 `0/4`，现场证据仍 `0/34`、签字仍 `0/6`。

本轮刷新了生产 env setup、生产环境 / 持久化第一阶段执行、release candidate 和 go-live suite latest，并修正了 `run-v1-production-env-setup` 报告里的 API 启动命令清单。现在 setup 报告会把真正应用生产 env 的命令列为 `ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> npm run api:dev`，把 `ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS=<secure-env-file> npm run api:dev` 单独标为只读审计 / 预览，避免现场只配置 audit-only 变量导致 API 没有应用生产 env。本轮不提高完成度百分比：生产 env 安全草稿仍 `prepared`，第一阶段执行最新为 `1/8` 并停在真实值 intake 校验，发布门禁仍 `0/4`，现场证据仍 `0/34`、签字仍 `0/6`。

本轮收紧了 PostgreSQL 恢复验证库重置授权：生产 env 预检现在只接受 `ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false` 作为常态安全配置，长期写 `true` 会被 `postgres-restore-validation-env` 阶段阻塞；恢复验证库重置需要在计划内恢复演练命令或第一阶段执行器上显式传 `--allow-restore-reset`。该变化降低“恢复验证授权长期留在生产 env”带来的误操作风险，但不提高 V1 上线百分比；真实 PostgreSQL、恢复验证库、对象存储、打印 / CUPS、司机真机、现场证据、负责人签字和真实订单试跑仍是上线缺口。

本轮补齐了生产 runtime smoke 的交接说明和检查断言：V1 发布 runbook 现在明确 `run-v1-production-runtime-smoke` 在临时 API 模式下会通过 `ERP_V1_PRODUCTION_ENV_FILE` 走 API 启动 env 加载器，并要求 `/api/health.seed.productionEnvFileApplication.applied=true`；检查已有长驻生产 API 时，也必须由真实服务 health 报告已应用安全生产 env 文件。该变化只让第一阶段生产 env / 持久化留证口径更严谨，不提高 V1 上线百分比；真实 PostgreSQL、恢复验证库、对象存储、打印 / CUPS、司机真机、现场证据、负责人签字和真实订单试跑仍是上线缺口。

本轮补齐了生产上线组合预检的一个严谨性缺口：`当前 API 生产 profile 确认` 现在不只看本地持久化旁路、PostgreSQL 仓储和对象存储 live，也会检查当前长驻 API 是否在启动时通过 `ERP_V1_PRODUCTION_ENV_FILE` / `ERP_V1_ENV_FILE` 应用了已审计安全 env 文件。该变化让“env 文件审计通过”和“当前 API 真正使用同一份 env”形成门禁闭环，但不提高 V1 上线百分比；真实 PostgreSQL、恢复验证库、对象存储、打印 / CUPS、司机真机、现场证据、负责人签字和真实订单试跑仍是上线缺口。

本轮补齐了一个部署链路缺口：API 启动现在可通过 `ERP_V1_PRODUCTION_ENV_FILE` 真正应用同一份已审计安全 env 文件，`ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS` 保持只读审计 / 预览用途。该变化让“安全 env 文件已审计”能落到长驻 API 进程，但不提高 V1 上线百分比；真实 PostgreSQL、恢复验证库、对象存储、打印 / CUPS、司机真机、现场证据、负责人签字和真实订单试跑仍是上线缺口。

| 口径 | 完成度 | 说明 |
| --- | ---: | --- |
| 需求确认度 | 85-90% | 主流程、状态、权限、字段大多已定，剩余主要是真实模板、真实主数据、设备和少量阈值。 |
| P0 可演示原型 | 97-98% | 办公室主流程较完整，移动端、打印、司机端、API / PostgreSQL 边界持续推进，主数据导入模板、上传预检查、第一轮外部 Excel 兼容、Excel 日期序列号归一化、确认队列草稿、确认计划、执行记录 API、本地持久化、导入 payload、员工机台主数据迁移草案、事务 writer 第一版、正式导入 UI、失败行下载、失败行修正草稿再导入入口、失败行页面内联字段修正、员工账号复核启用、临时密码发放、动态员工登录、首次登录强制改密 API 边界、管理员重置 / 撤销导入员工密码、运行期 session 失效边界、运行期账号 / token 吊销持久化仓储、生产跨日报数、办公室发布排产、车间任务池按已发布排产 / 当前机台过滤、第一版机台排产队列、同机台队列调序第一版、跨机台移动 / 插入队列 API 与前端操作闭环、移动原因 / 影响预览 / 留痕备注、正式排产记录 PostgreSQL 边界、定制印刷成品图上传 / 复核 / 待通知客户待办、附件对象存储诊断预检、附件 V1 留档门禁、HTTP 级对象存储 live 兼容检查、系统 V1 持久化门禁、统一 V1 持久化 profile、统一 V1 生产 profile 组合 live 校验（基线 `7/11`、自动化证据 `11/11`）、V1 生产环境变量模板 / 清单、V1 生产 env 文件安全审计、V1 生产环境变量预检、V1 生产 env 真实值 intake 校验、V1 现场验收报告留档工具、V1 现场证据 manifest 模板 / 校验器、V1 发布候选聚合检查、V1 现场角色任务清单生成器、V1 上线交接包生成器、打印命令桥 spool 状态回读诊断、上线状态页 spool 明细预检、可选 CUPS `cups_lp` 提交边界、non-printing CUPS 队列预检、办公室 CUPS 队列预检诊断面板、9 项 V1 打印上线就绪门禁、司机端 V1 真机 readiness 门禁、ERP 总 readiness runner 11 项门禁、生产报工产能校准样本、本地回滚校验和 PostgreSQL live 写入验证已有。 |
| V1 真实上线就绪 | 80-83% | 真实上线口径仍严格按发布门禁和现场证据判断，当前本地默认总门禁仍为 `5/11 通过`，生产上线组合预检为 `1/5`，发布候选仍为 `0/4 发布门禁通过，blocked`，现场证据仍为 `0/34`、签字仍为 `0/6`。代码层面已补统一 V1 persistence profile、31 个 PostgreSQL 仓储默认项、2 个对象存储默认项、33 个系统持久化对象；正式确认 / 草稿同事务、核心启动快照、空库无 seed、重启和双会话已通过 PostgreSQL 16 live。但这些仍是本地自动化证据，不替代真实生产 PostgreSQL / OSS/S3/COS、备份恢复、真实打印设备出纸、真实手机 / 原生壳、真实业务试跑、现场 QA、负责人签字和 V1/V2 边界确认。 |

最新门禁口径：`runtimeIdentityRepository`、`rawMaterialInboundRepository` 和 `rawMaterialSupplierStatementReviewRepository` 已纳入系统 V1 持久化门禁。生产 profile 现在是 `29` 个 PostgreSQL 仓储默认项 + `2` 个对象存储默认项，`/api/system/v1-readiness` 会检查 `31` 个持久化对象，并明确要求导入员工运行期身份仓储、原材料入库仓储、原材料供应商月结复核草稿仓储在生产 profile 下为 `postgres`。这让 V1 readiness 更严格，不单独代表真实上线完成。

本轮生产 env setup 已把修正清单和安全填写骨架直接输出到 `.erp-local-storage/v1-production-env-setup/`：`production-env-fix-checklist.zh-CN.md`、`production-env-fix-checklist.csv` 和 `production-env-fill-template.env.example`。该产物能让现场技术负责人不等 handoff / suite 就看到 10 项 env 修正、6 项 blocking、2 项 warning 和注释占位的变量骨架；真实值仍只允许写入未跟踪安全 env 文件。当前 latest suite 已刷新，生产 env 变量预检仍 `2/10`、生产上线阶段仍 `1/5`、发布门禁仍 `0/4`、现场证据仍 `0/34`、签字仍 `0/6`，所以本轮不提高模块百分比。

本轮 latest suite 已通过 `--use-production-env-setup-env-file` 把安全 env 草稿接入 release candidate 刷新链路。生产上线组合预检阶段为 `1/5`，因为生产 env 文件安全审计已通过；首个阻塞为 `生产 env 真实值 intake 校验`。release candidate 仍为 `0/4`，生产 env 变量预检仍 `2/10`，现场任务 `53` 项，现场证据 `0/34`，签字 `0/6`。该变化不提高模块百分比，只说明“env 文件安全草稿可审计”已经打通；真实 PostgreSQL、PostgreSQL 恢复验证库、真实 OSS/S3/COS、打印 / CUPS、司机真机、真实订单试跑和负责人签字仍是 V1 上线缺口。

本轮第一阶段执行器也已通过 `--use-production-env-setup-env-file` 复用同一份安全 env 草稿。真实本地执行最新结果为 `1/8`：env 文件安全审计通过，生产 env 真实值 intake 校验仍有 15 项阻塞、4 项警告并停止，未执行生产 env 变量预检、迁移、持久化 live 留证、runtime smoke、证据建议或 closeout。该变化只减少现场转抄 env 文件路径的错误风险并提前暴露真实值清单缺口，不提高模块百分比；真实生产变量和现场证据仍必须补齐。

本轮已收紧生产 PostgreSQL 备份 / 恢复验证的恢复库隔离门禁。`scripts/run-v1-production-postgres-backup-restore-check.mjs` 不再只比较连接串原文，而是解析 PostgreSQL URL 或 `host/port/dbname` 连接串；如果恢复验证库和生产源库指向同一 host/port/database，即使用了不同用户名、密码或 query 参数，也会阻断恢复验证库重置。无法安全解析的连接串也会 blocked。该补充只降低恢复演练误重置生产库的风险，不改变模块完成度百分比；真实生产库、真实恢复验证库、恢复演练现场证据、负责人签字、对象存储、真实打印、司机真机和业务试跑仍需现场完成。

本轮已把第一阶段现场证据建议接入上线交接包和 go-live suite。`.erp-local-storage/v1-production-first-stage-evidence-suggestions/latest.*` 和 `suggested-evidence-items.csv` 存在时，handoff 会复制为 `production-first-stage-evidence-suggestions.latest.md/json` 和 `production-first-stage-evidence-suggestions.csv`，suite 也会在摘要和输出文件中展示。该补充只让 `production_persistence` / `object_storage` 的建议回填在最终交接包里可见，不自动写入正式证据、不刷新 release candidate、不签字、不改变本表完成度百分比；真实生产报告、现场证据、负责人签字、真实打印、司机真机和业务试跑仍需现场完成。

本轮新增 `scripts/run-v1-production-first-stage-evidence-suggestions.mjs`，用于把生产持久化留证、生产 runtime smoke 和现场证据 intake CSV 对齐成第一阶段 `production_persistence` / `object_storage` 证据建议包。它默认输出 `.erp-local-storage/v1-production-first-stage-evidence-suggestions/suggested-evidence-items.csv`、`latest.json` 和 `latest.md`，只建议自动化报告可支撑的项，保留已有现场填写，不覆盖源 CSV / manifest，不刷新 release candidate / go-live suite，也不声明 V1 完成。当前本地默认缺少持久化留证 latest 和 runtime smoke latest，因此 dry-run 结果仍是 `0` 项自动 accepted、`10` 项第一阶段证据需人工处理。该补充只减少第一阶段证据整理和回填遗漏风险，不改变模块完成度百分比；真实生产报告、备份负责人、bucket 备份 / 控制台证据、访问审计、现场证据、负责人签字、真实打印、司机真机和业务试跑仍需现场完成。

本轮新增 `scripts/run-v1-production-env-setup.mjs`，用于把生产环境第一步从“手工复制模板到安全 env 文件”推进到“生成或复核安全 env 草稿 -> env 文件审计 -> 生产 env 变量预检”的可执行链路。准备器默认写 `.erp-local-storage/v1-production-env/secure-prod.env`，要求目标路径被 git 忽略或在工作区外，权限收窄到 `0600`，不覆盖已有文件，真实 PostgreSQL / 对象存储 / 打印 / CUPS / token / 现场 manifest 值留空，只保留少量安全默认值，并输出 `.erp-local-storage/v1-production-env-setup/latest.*` 脱敏报告。该补充只减少生产 env 文件准备误操作，不改变模块完成度百分比；真实 PostgreSQL、对象存储、生产迁移、生产 API、现场证据、负责人签字、真实打印、司机真机和业务试跑仍需现场完成。

本轮已把上述生产 env 准备报告接入 `scripts/run-v1-go-live-handoff-pack.mjs` 和 `scripts/run-v1-go-live-suite.mjs`。上线交接包现在会在存在 `.erp-local-storage/v1-production-env-setup/latest.*` 时复制为 `production-env-setup.latest.md/json`，并在摘要、manifest、文件索引和安全说明中展示准备器状态、`setupReady`、env 文件审计摘要、生产 env 预检剩余修正项和下一步；go-live suite 也会把它透传到交接包并在顶层摘要显示 `生产 env 准备`。该补充只解决“准备报告不在统一交接目录里”的问题，不改变模块完成度百分比；最新实际 suite 仍 blocked，真实生产 env、PostgreSQL、对象存储、生产 API、现场证据、签字、真实打印、司机真机和真实业务试跑仍需现场完成。

本轮已把对象存储第一阶段证据拆清楚：`scripts/run-v1-production-object-storage-preflight.mjs` 只负责真实 bucket 的诊断对象写入、读回、短期签名 URL 读回、对账导出写入和清理；新增 `scripts/run-v1-production-object-storage-governance-check.mjs` 只读检查附件 / 对账导出 bucket 的版本控制、生命周期、服务端加密和 bucket policy 可读性。`scripts/run-v1-production-persistence-evidence.mjs` 现在把 live preflight 和独立 governance-check 作为两个阶段汇总，避免把写读删探针误当成完整 bucket 治理。该补充只把对象存储权限 / 生命周期 / 加密 / 备份策略的一部分从人工口头确认推进到可执行脱敏读回，不改变模块完成度百分比；真实 bucket 控制台截图、备份策略负责人确认、访问审计查询、真实附件上传、真实对账导出样本、现场证据和负责人签字仍需现场完成。

本轮新增 `scripts/run-v1-driver-real-device-execution.mjs`，用于把司机真机阶段从“手工保存 driver readiness，再手工跑 closeout”推进到“运行中 API 司机 readiness 保存 -> 司机真机 closeout”的顺序执行器。执行器默认写 `.erp-local-storage/v1-driver-readiness/latest.json`、`.erp-local-storage/v1-driver-real-device-closeout/latest.*` 和 `.erp-local-storage/v1-driver-real-device-execution/latest.*`；它不请求摄像头 / 定位权限、不打开导航、不调用原生桥、不上传照片、不改司机送货状态，也不声明 V1 完成。该补充只降低司机真机阶段现场漏跑 / 漏留证风险，不改变模块完成度百分比；真实司机手机、原生扫码、定位、导航、水印照片、弱网上传兜底、现场证据和负责人签字仍需现场完成。

本轮已把司机真机阶段 execution latest 接入 `scripts/run-v1-go-live-handoff-pack.mjs` 和 `scripts/run-v1-go-live-suite.mjs`。上线交接包现在会在存在 `.erp-local-storage/v1-driver-real-device-execution/latest.*` 时复制为 `driver-real-device-execution.latest.md/json`，并在摘要、manifest、阶段报告、详细章节、文件索引和安全说明中展示执行器 ready / blocked、步骤、阻塞和下一步；go-live suite 也可显式传入 `--driver-real-device-execution-json` / `--driver-real-device-execution-markdown` 并随 canonical latest 同步。该补充只解决“司机真机执行链路没有进入统一交接目录”的问题，不改变模块完成度百分比；真实司机手机、原生扫码、定位 / 导航、水印照片、弱网上传、现场证据和负责人签字仍需现场完成。

本轮 `scripts/run-v1-production-first-stage-execution.mjs` 已补现场证据 manifest 来源链路：命令行 `--field-evidence-manifest` 仍优先；未传时会从后加载的安全 env 文件 `ERP_V1_FIELD_EVIDENCE_MANIFEST`、当前进程 env、默认模板依次解析。`scripts/generate-v1-production-env-template.mjs` 和 `docs/development/v1-go-live-runbook.zh-CN.md` 已同步显式传入 manifest，并写明也可由安全 env 文件提供。该补充只降低第一阶段现场执行时漏传 manifest、误回退到 pending 模板的风险，不改变模块完成度百分比；真实 PostgreSQL / OSS/S3/COS 配置、现场证据、负责人签字、真实打印、司机真机和业务试跑仍未完成。

本轮继续补强 `scripts/run-v1-production-first-stage-execution.mjs` 的 manifest 来源可见性：执行报告现在只显示来源类别、是否已配置和是否仍为默认模板，不显示真实 manifest 路径或值；当仍使用 checked-in pending 模板时，plan-only 和 blocked 下一步会明确提示第一阶段 closeout 必然 blocked，并要求配置 `ERP_V1_FIELD_EVIDENCE_MANIFEST` 或传 `--field-evidence-manifest` 后重跑。该补充只减少现场把默认模板误认为真实证据的风险，不改变模块完成度百分比。

本轮 `scripts/run-v1-production-first-stage-execution.mjs` 已把第一阶段现场证据建议纳入顺序执行，当前完整第一阶段为 8 步：env 文件审计、生产 env 真实值 intake 校验、生产 env 变量预检、迁移计划 / 显式迁移、持久化留证、runtime smoke、现场证据建议、第一阶段 closeout。证据建议步骤会调用 `run-v1-production-first-stage-evidence-suggestions`，基于最新持久化留证和 runtime smoke 生成 `suggested-evidence-items.csv`，只建议 `production_persistence` / `object_storage` 里自动化报告可支撑的回填项；`review_required` 算执行步骤通过，但仍必须现场负责人复核，不会自动应用证据、不会自动签字、不会刷新 release candidate。该补充只降低第一阶段证据建议漏跑风险，不改变模块完成度百分比；真实现场证据和负责人签字仍需现场完成。

本轮 `scripts/run-v1-production-first-stage-closeout.mjs` 已把第一阶段签收口径从“两份自动化报告 ready 即可 closeout”收紧为“自动化报告 ready + `production_persistence` / `object_storage` 两组现场证据完整”。closeout 现在支持 `--field-evidence-manifest <filled-manifest>`，默认模板仍会 blocked；它会检查生产库迁移、备份策略、恢复演练、账号权限、生产 env 预检、bucket 策略、附件读回、签名 URL、访问审计和对账导出等证据均为 `passed/accepted + evidenceRef`，并继续检查 evidenceRef 不泄露连接串、密钥、命令路径或 spool 路径。`scripts/run-v1-production-first-stage-execution.mjs` 也已透传该 manifest 参数。该补充只降低“连通性探针 ready 被误认为第一阶段可签收”的风险，不改变模块完成度百分比；真实 PostgreSQL / OSS/S3/COS 配置、真实备份 / 恢复演练、真实 bucket 策略、真实附件 / 对账导出样本和负责人签字仍需现场完成。

本轮新增 `scripts/run-v1-production-postgres-preflight.mjs`，用于真实生产 PostgreSQL 的只读结构 / 权限预检。该脚本通过安全 env 读取数据库连接，检查 `psql` 可用性、生产库连接、`schema_migrations` 与本地迁移 checksum、核心表、关键列、核心表 SELECT / INSERT / UPDATE 权限，并用临时表执行写入 / 读取 / 回滚探针；输出不包含连接串、密码、host 或原始 psql 错误。组合预检的 `PostgreSQL 迁移已在生产库执行` 和 `生产库账号、最小权限和连接池配置已确认` 证据项已提示运行该脚本。该补充只把“生产库迁移 / 权限”从口头证明推进到可执行脱敏预检，不改变模块完成度百分比；V1 仍需要真实生产库实际执行、备份策略、恢复演练、对象存储、真实打印、司机真机、业务试跑、34 项现场证据和 6 个负责人签字。

本轮新增 `scripts/run-v1-production-postgres-backup-restore-check.mjs`，用于把生产 PostgreSQL 备份 / 恢复抽样从人工留证推进到可执行脱敏验证。脚本只读生产源库，要求专用恢复验证库 `ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL`，且必须显式允许重置后才会对验证库 public schema 执行恢复；它生成 schema-only dump 和 `schema_migrations` data-only 抽样，恢复后校验核心表与迁移记录，并删除本地 dump 文件。`scripts/run-v1-production-persistence-evidence.mjs` 已把该检查纳入生产持久化首阶段证据包，第一阶段执行器可透传 `--pg-dump-command`。该补充只补备份 / 恢复验证工具，不改变模块完成度百分比；真实生产库、真实恢复验证库、备份计划、恢复演练工单 / 截图、现场证据和负责人签字仍需现场完成。

本轮 `scripts/run-db-migrations.mjs` 已支持 `--env-file <secure-env-file>` 和 `ERP_V1_DATABASE_URL` 优先级，生产迁移执行不再需要把真实连接串转抄到命令行。runner 仍默认 dry-run，只有 `--apply` 才连接数据库；执行时按 `ERP_V1_DATABASE_URL`、`DATABASE_URL`、`PGURL` 读取连接，支持 `--psql-command <path>`，输出只显示连接来源变量名、env 文件数量和迁移 ID，不打印数据库 URL、密码、host 或原始 psql stderr。新增 `scripts/check-db-migration-runner.mjs` / `npm run db:migrate-runner:check` 覆盖 env 文件读取、来源优先级、dry-run 隔离和脱敏。该补充只把“安全 env -> 执行迁移 -> PostgreSQL 预检”串成同一条可操作链路，不改变模块完成度百分比；V1 仍需要真实生产库实际执行、备份策略、恢复演练、对象存储、真实打印、司机真机、业务试跑、34 项现场证据和 6 个负责人签字。

本轮新增 `scripts/run-v1-production-object-storage-preflight.mjs`，用于真实生产对象存储 live 预检。脚本通过安全 env 读取附件对象存储和对账导出对象存储配置，对附件对象存储执行诊断对象写入、读回、摘要一致性校验、短期签名 URL 读回和删除；对对账导出对象存储执行诊断导出文件写入、读回、摘要一致性校验和删除；对账导出可使用完整附件对象存储 fallback。输出不包含 endpoint、bucket、access key、secret、session token、对象 key、签名 URL 或 payload。组合预检的对象存储现场证据提示已指向该脚本。该补充只把“对象存储变量已填”推进到“可执行写读删 live 探针”，不改变模块完成度百分比；V1 仍需要真实 bucket 权限 / 生命周期 / 备份策略复核、真实附件上传 / 访问审计 / 客户对账导出样本、真实打印、司机真机、业务试跑、34 项现场证据和 6 个负责人签字。

本轮新增 `scripts/run-v1-production-persistence-evidence.mjs`，用于把真实生产环境 / 持久化首阶段证明汇总成一份脱敏留证包。脚本通过安全 env 汇总 env 文件安全审计、生产持久化 env 子集、迁移计划、生产 PostgreSQL 预检和生产对象存储 live 预检，并默认写出 `.erp-local-storage/v1-production-persistence-evidence/latest.json` / `latest.md`；它不执行迁移 `--apply`，不改业务数据，不输出 env 值、数据库 URL、endpoint、bucket、密钥、对象 key、签名 URL、命令值或 payload。该补充只把第一阶段证明从分散脚本推进到同一份现场交接留证，不改变模块完成度百分比；V1 仍需要真实 PostgreSQL / OSS/S3/COS 配置、生产迁移实际执行、备份 / 恢复演练、bucket 策略 / 生命周期复核、真实 API 启动、真实打印、司机真机、业务试跑、34 项现场证据和 6 个负责人签字。

本轮新增 `scripts/run-v1-production-runtime-smoke.mjs`，用于把“安全生产 env 已能启动 API 并读回当前运行态”变成可执行脱敏证据。脚本用同一份安全 env 临时启动 API，读取 `/api/health` 和 `/api/system/v1-readiness`，确认当前运行态显示 PostgreSQL repository profile、附件对象存储、对账导出对象存储和系统 V1 持久化门禁；默认写出 `.erp-local-storage/v1-production-runtime-smoke/latest.json` / `latest.md`，检查结束会停止该 API。该补充只证明第一阶段运行态 profile 已可读，不改变模块完成度百分比；真实长驻 API、生产进程守护 / 反向代理 / 监控、真实打印、司机真机、业务试跑、现场证据和负责人签字仍未完成。

本轮继续补强 `scripts/run-v1-production-runtime-smoke.mjs`：新增 `--api-base-url <production-api-base-url>`，用于检查已经长驻运行的生产 API，而不是只能临时启动本地 API。该模式仍用安全 env 文件做审计和生产持久化 env 子集检查，只读访问长驻服务的 `/api/health` 与 `/api/system/v1-readiness`，并在报告中标明 `external_service` / `externalApiProbed` / `apiProcessSpawned=false`。第一阶段执行器可透传该参数，closeout 也接受“长驻 API 只读探测”的 runtime 护栏。该补充只降低生产服务留证缺口，不改变模块完成度百分比；真实进程守护、反向代理、监控、备份恢复和现场签字仍要现场证明。

本轮新增 `scripts/run-v1-production-first-stage-closeout.mjs`，用于把“生产持久化首阶段留证”和“生产 API runtime smoke”两份 latest 汇总成第一阶段签收结论。脚本读取 `.erp-local-storage/v1-production-persistence-evidence/latest.json` 和 `.erp-local-storage/v1-production-runtime-smoke/latest.json`，检查两份证据是否 ready、是否在默认 72 小时内、脱敏 / 非业务写入 / 诊断清理 / 临时 API 停止等安全护栏是否完整，并默认写出 `.erp-local-storage/v1-production-first-stage-closeout/latest.json` / `latest.md`。当前 closeout 已进一步要求现场证据 manifest 中 `production_persistence` 和 `object_storage` 两组必填证据完成后才 ready。该补充只让第一阶段有可签收 / 不可签收的明确结论，不改变模块完成度百分比；真实打印、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认仍未完成。

本轮新增 `scripts/run-v1-production-first-stage-execution.mjs`，用于把第一阶段从“多个脚本需要现场手工按顺序跑”推进到“一个顺序执行器可串联 env 文件审计、生产 env 预检、迁移计划 / 显式迁移执行、持久化留证、runtime smoke 和 closeout”。执行器默认不执行生产迁移 `--apply`，只做非业务写入的安全审计、预检、诊断和 closeout；只有现场确认备份窗口和负责人后显式传 `--apply-migrations`，才会调用生产迁移 runner。报告默认写 `.erp-local-storage/v1-production-first-stage-execution/`，输出不包含真实 env 路径、env 值、数据库 URL、对象存储 endpoint / bucket / secret、命令值、对象 key、签名 URL、现场 manifest 路径或 payload；当前 runbook 默认使用 `node -- scripts/... --use-production-env-setup-env-file` 复用 production env setup 报告中的安全 env 文件，显式 `--env-file <secure-env-file>` 只保留为绕开 setup 报告的备用路径。执行器现在支持 `--field-evidence-manifest <filled-manifest>` 并传给 closeout。该补充只减少第一阶段现场漏跑 / 顺序错 / 误迁移风险，不改变模块完成度百分比；V1 仍需要真实 PostgreSQL / OSS/S3/COS 配置、生产 API 长驻、真实打印、司机真机、业务试跑、34 项现场证据、6 个负责人签字和 V1/V2 边界确认。

本轮已把生产环境 / 持久化第一阶段执行结果、真实打印链路 closeout 和司机真机 closeout 接入 `run-v1-go-live-handoff-pack.mjs` 和 `run-v1-go-live-suite.mjs`。上线交接包会在存在 `v1-production-first-stage-execution/latest.*`、`v1-print-chain-closeout/latest.*`、`v1-driver-real-device-closeout/latest.*` 时复制为 `production-first-stage-execution.latest.*`、`print-chain-closeout.latest.*`、`driver-real-device-closeout.latest.*`，并在摘要、manifest、`阶段 Closeout 报告` 和文件索引中展示各阶段 ready / blocked 结论；go-live suite 也可显式传入三类阶段产物并随 canonical latest 同步。该补充只解决“阶段 closeout 结果不在统一交接目录里”的问题，不改变模块完成度百分比；V1 仍需要真实 PostgreSQL / OSS/S3/COS 配置、生产 API 长驻、真实打印、司机真机、业务试跑、34 项现场证据、6 个负责人签字和 V1/V2 边界确认。

本轮新增 `scripts/run-v1-print-chain-execution.mjs`，用于把真实打印链路的执行顺序固定为“真实 CUPS 队列 non-printing 预检 -> 运行中 API 打印 readiness 读取 / 保存 -> 打印阶段 closeout”。执行器默认留存 CUPS 预检、打印 readiness、print-chain closeout 和 print-chain execution 的 latest JSON / Markdown；它不提交物理打印、不生成样张、不修改现场证据 manifest、不改业务数据，只减少现场漏跑 / 漏留证风险。该补充不改变模块完成度百分比；真实标签机 / 针式机出纸、纸张对位、条码扫码、spool 或驱动回写、作废重打仍必须由现场证据和负责人签字证明。

本轮新增 `scripts/run-v1-print-chain-closeout.mjs`，用于把真实打印阶段从“readiness 报告和 `print_hardware` 现场证据分散存在”推进到“一份可签收 / 不可签收的脱敏 closeout 结论”。脚本读取已保存的打印 readiness JSON 和已填写的现场证据 manifest，检查打印门禁 ready、CUPS 非打印预检 ready、`print_hardware` 7 项证据均为 `passed` / `accepted` 且有证据引用、真实样张 / 纸张对位 / 条码扫码 / spool 或驱动回写 / 作废重打覆盖完整，并检查命令、路径、spool、payload 和 evidenceRef 脱敏护栏；它不调用 API、CUPS、打印机或外部服务。该补充只让打印链路有阶段签收工具，不改变模块完成度百分比；当前默认仍 blocked，因为本地没有已保存的真实打印 readiness `latest.json`，且 checked-in 现场证据模板的 `print_hardware` 仍为 `0/7`。

本轮 `scripts/run-v1-go-live-suite.mjs` 也补齐了 `--print-chain-closeout-json` / `--print-chain-closeout-markdown` 和 `--driver-real-device-closeout-json` / `--driver-real-device-closeout-markdown` 参数，能把非默认路径的打印、司机 closeout 明确传入最终交接包；如果只使用默认 latest 路径，suite 仍会自动发现。该补充只降低现场交接漏报告风险，不改变完成度百分比；真实出纸、扫码、定位 / 导航、真机上传和现场签收仍必须单独完成。

本轮 `上线状态 / V1 完成审计` 已补 `还缺` 显示数量 / 总数量。每条完成标准仍最多展示前 4 个缺口以保持页面密度，但现在会明确显示 `还缺 4/7`、`还缺 4/6`、`还缺 1/1`，避免把截断后的 4 条误解成总缺口。该补充解决的是“缺口列表为了密度被截断后，总缺口数量不可见”的问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / V1 完成审计` 已补 7 条完成标准的 `还缺` 当前缺口。每条标准现在不仅写明需要什么证明材料，还会直接列出当前仍缺的证明缺口，例如发布候选门禁、生产 env / 持久化 / 对象存储 / 打印配置、运行时 blocker、现场验收 blocker、现场证据组缺口、负责人签字缺口和 V1/V2 边界确认缺口。该补充解决的是“完成审计已经说明证明口径，但负责人仍要去多个区块找当前缺哪项”的问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / V1 完成审计` 已补 7 条完成标准的 `需证明` 清单。每条标准现在都写明要靠什么真实材料证明完成，例如发布候选 `4/4`、生产 env 文件安全审计和组合预检、运行时 `11/11`、现场验收报告、34 项现场证据、6 个负责人签字、V1/V2 边界确认人和确认时间。该补充解决的是“完成审计只告诉负责人未完成，但没有明确完成证明材料”的口径问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / V1 完成审计` 已补 7 条完成标准的直接处理入口。审计行现在分别连接到发布候选、生产 env、运行时、现场验收、现场证据、负责人签字和 V1/V2 边界的现有受控动作，避免负责人只看到“未完成”但不知道下一步点哪里。该补充不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / 回填质量检查` 的 release candidate `刷新预检` 和 blocked `刷新候选` 结果已补服务端 env 来源状态展示。两个结果卡片现在会逐行显示 `ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS`、`ERP_V1_PRODUCTION_ENV_FILE`、`ERP_V1_ENV_FILE` 的状态和已识别文件数量；当前本地默认三项均为 `未配置`。该补充解决的是“刷新入口已经指出第一阶段卡在生产 env 文件安全审计，但还要切回组合预检或单项预检才知道服务端主变量 / fallback 状态”的排查问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / 生产上线组合预检` 已补服务端 env 来源状态展示。组合预检结果现在会逐行显示 `ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS`、`ERP_V1_PRODUCTION_ENV_FILE`、`ERP_V1_ENV_FILE` 的状态和已识别文件数量；当前本地默认三项均为 `未配置`。该补充解决的是“组合预检已经指出第一阶段卡在生产 env 文件安全审计，但还要切回单项预检才知道服务端主变量 / fallback 状态”的排查问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / 文件应用预检` 已补服务端 env 来源状态展示。阶段诊断现在会逐行显示 `ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS`、`ERP_V1_PRODUCTION_ENV_FILE`、`ERP_V1_ENV_FILE` 的状态和已识别文件数量；当前本地默认三项均为 `未配置`。该补充解决的是“文件应用预检知道服务端路径未配置，但不直接告诉现场当前 API 进程识别了哪些主变量 / fallback”的排查问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / env 文件审计` 已补服务端 env 来源状态展示。服务端配置指引现在会逐行显示 `ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS`、`ERP_V1_PRODUCTION_ENV_FILE`、`ERP_V1_ENV_FILE` 的状态和已识别文件数量；当前本地默认三项均为 `未配置`。该补充解决的是“知道应该配置哪些变量，但不知道当前 API 进程有没有识别主变量或 fallback”的排查问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / release candidate 刷新预检` 已把首个生产 env 阻塞变成连续预检链路。当前首个阻塞为 `生产 env 文件安全审计` 时，组合门禁 blocker 行会直接提供 `env 连续预检`，顺序跑 `env 文件审计 -> 文件应用预检 -> 当前 env 预检 -> 生产上线组合预检`，并保留单项 `env 文件审计`、`文件应用预检`、`当前 env 预检`、`查看生产配置门禁` 和 `组合预检`。该补充解决的是“知道第一步卡在哪，但仍要分散点击多个预检，容易漏掉当前 env 变量预检”的操作摩擦，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / release candidate 刷新预检` 已把首个阻塞阶段变成直达动作。当前首个阻塞为 `生产 env 文件安全审计` 时，组合门禁 blocker 行不再只给 `查看生产配置门禁 / 组合预检`，而是直接显示 `env 文件审计` 和 `文件应用预检`，点击即可看到最近 env 文件审计和服务端配置指引。该补充解决的是“知道第一步卡在哪，但还要跳转再找入口”的操作摩擦，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / release candidate 刷新预检` 已补 `首个阻塞` 阶段。刷新预检和刷新 blocked 响应会把当前生产上线组合门禁的第一处阻塞透出为 `productionGoLiveFirstBlockedStageKey=production-env-file-audit`、`productionGoLiveFirstBlockedStageLabel=生产 env 文件安全审计`，页面摘要显示 `首个阻塞 生产 env 文件安全审计`，组合门禁 blocker 详情也会写明首个阶段。该补充解决的是“只看到 `组合门禁 0/4`，但不知道先处理哪个生产阶段”的执行定位问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / V1 收尾总复核` 已解除对“已有可校验现场证据草稿”的硬依赖。总复核现在即使现场证据草稿还没生成，也能继续执行生产 env 文件审计、文件应用预检、当前生产 env、组合门禁、V1/V2 边界、release candidate 刷新预检和运行时总门禁；只有草稿可校验时才额外执行草稿校验。该补充避免负责人因为草稿缺失而看不到其它上线门禁阻塞，但不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / V1 收尾总复核` 已补齐生产 env 前置预检链路。总复核现在会先执行 `env 文件审计`、`文件应用预检`、`当前生产 env 预检`，再执行 `生产上线组合预检`、现场证据草稿校验、V1/V2 边界预检、release candidate 刷新预检和当前运行时总门禁预检；按钮 loading 状态也覆盖这三个生产 env 前置动作。该补充解决负责人点一次总复核仍可能漏看首个 `生产 env 文件安全审计` / `生产 env 变量预检` 阻塞的问题，但不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / 文件应用预检` 已补 `阶段诊断`。服务端安全 env 文件应用预检现在会在 API 和页面里区分 `服务端路径配置`、`env 文件安全审计`、`生产 env 变量预检`、`运行时 readiness / release candidate`：未配置路径时显示下一阶段为 env 文件安全审计；路径已配置但审计失败时停在审计阶段；审计通过但生产 env 变量预检失败时显示 `变量预检阻塞`；全部 ready 后引导继续运行时 readiness / release candidate。该补充保持只读和脱敏，不接受前端路径、不暴露真实路径 / env 值、不改写 `process.env`。最新 go-live suite 已重新生成，时间为 `2026-07-07T03:32:07.472Z`，结论仍为 blocked：发布候选 `0/4`、生产上线阶段 `0/4`、V1 上线就绪 `80-83%`、现场证据 `0/34`、签字 `0/6`、现场任务 `52` 个、V2 差异 `17` 项。该补充降低生产 env 文件应用预检误判风险，但不改变任何模块 V1 上线就绪百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 `上线状态 / env 文件审计` 已补 `服务端配置指引`。未配置服务端安全 env 文件路径时，页面会直接展示主变量 `ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS`、fallback 变量 `ERP_V1_PRODUCTION_ENV_FILE` / `ERP_V1_ENV_FILE`、是否需要重启 API、配置步骤和复核动作，并明确 `前端传路径 不允许`、`真实路径暴露 否`；输出不包含真实 env 文件路径、env 值、连接串、secret、命令值、原始行或文件内容。最新 go-live suite 已重新生成，时间为 `2026-07-07T03:16:55.677Z`，结论仍为 blocked：发布候选 `0/4`、生产上线阶段 `0/4`、V1 上线就绪 `80-83%`、现场证据 `0/34`、签字 `0/6`、现场任务 `52` 个、V2 差异 `17` 项。该补充降低第一阶段服务端 env 文件路径配置误解，但不改变任何模块 V1 上线就绪百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮生产 env 文件安全审计已补 `跨文件重复变量` warning。多个 `--env-file` 之间出现同名变量时，审计会输出 `cross-file-duplicate-variables` 和 `crossFileDuplicateVariableCount`，`上线状态` 页也会在最近 env 文件审计结果里显示 `跨文件重复 X 个`；输出只包含变量名和计数，不包含 env 值、连接串、secret、命令值、原始行、注释、真实路径或文件内容。最新 go-live suite 已重新生成，时间为 `2026-07-07T03:07:16.422Z`，结论仍为 blocked：发布候选 `0/4`、生产上线阶段 `0/4`、V1 上线就绪 `80-83%`、现场证据 `0/34`、签字 `0/6`、现场任务 `52` 个、V2 差异 `17` 项。该补充降低多 env 文件覆盖误操作风险，但不改变任何模块 V1 上线就绪百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮现场证据草稿已补 `输入快照 / 新鲜度` 门禁。生成草稿时会写入两份 CSV 的脱敏快照，状态 API、草稿校验、release-candidate 刷新预检和 `上线状态` 页都会显示 / 判断 `草稿匹配`；如果现场改了 `evidence-items.csv` 或 `signoff-boundary.csv` 但没有重新生成草稿，系统会显示 `已过期 / 需重生成` 并阻止刷新候选。最新 go-live suite 已重新生成，时间为 `2026-07-07T02:57:41.412Z`，结论仍为 blocked：发布候选 `0/4`、生产上线阶段 `0/4`、V1 上线就绪 `80-83%`、现场证据 `0/34`、签字 `0/6`、现场任务 `52` 个、V2 差异 `17` 项。该补充降低旧草稿误用风险，但不改变任何模块 V1 上线就绪百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮 V1 go-live suite / 上线交接包已补离线 `生产上线组合预检阶段清单`。suite 会生成 `production-go-live-stage-checklist.json` / `.zh-CN.md`，handoff 会复制 `production-go-live-stage-checklist.latest.json` / `.zh-CN.md`，离线交接时也能看到生产 env 文件安全审计、生产 env 变量预检、当前 API V1 readiness、当前 API 生产 profile 确认四阶段的负责人、下一步、复核步骤和留证要求。本轮还修正了 `envFileAudit.status=not_applicable` 但旧字段 `ready=true` 被误算通过的风险；当前最新真实 suite 生成时间为 `2026-07-07T02:33:59Z`，生产上线阶段严格显示 `0/4 通过`，首个待处理阶段为 `生产 env 文件安全审计`。该补充只提高离线交接和门禁判断准确性，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮生产上线组合预检已补 `解除阻塞清单`。组合预检现在不只显示 4 个阶段是否通过，还会为 env 文件审计、生产 env 预检、当前 API V1 readiness、当前 API 生产 profile 确认分别输出负责角色、下一步、复核命令和现场留证要求；`上线状态` 页点击 `组合预检` 后可看到 4 条清单和 `复核` / `留证` 提示。该补充解决的是“怎么逐阶段收尾”的执行清晰度问题，不改变任何模块完成度百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮生产 env 修正清单已补 `填写提示` 和 `复核步骤`，并同步到上线交接包的 Markdown、CSV 和安全 env 填写草稿。最新 go-live suite 已重新生成，时间为 `2026-07-06T16:25:59Z`，结论仍为 blocked：发布候选 `0/4`、V1 上线就绪 `80-83%`、现场证据 `0/34`、签字 `0/6`、现场任务 `52` 个、V2 差异 `17` 项。该补充降低第一阶段生产 env 配置分派、填写和复核误操作风险，但不改变任何模块 V1 上线就绪百分比；V1 仍按真实 PostgreSQL / 对象存储、真实打印 / CUPS、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界确认判断为未完成。

本轮已重新刷新 V1 go-live suite 和顶层 latest 产物，当前完成度 / V2 差异口径生成时间为 `2026-07-06T16:17:50Z`。最新 suite 仍为 blocked：发布候选 `0/4`、V1 上线就绪 `80-83%`、现场证据 `0/34`、签字 `0/6`、现场任务 `52` 个、V2 差异 `17` 项。同步校验也已加强：`npm run v1-go-live-suite:check` 现在会确认顶层 latest 产物与本轮 suite 输出一致，并继续保护现场填写 CSV / draft manifest 不被覆盖。该补充只保证完成度统计和 V2 差异不是旧产物，不改变任何模块 V1 上线就绪百分比；V1 仍按真实发布门禁和现场证据判断为 blocked。

本轮 `上线状态` 又把保存签字 / 边界草稿后的 `签字 / 边界剩余` 反馈接入统一 `signoffBoundarySummary`。`POST /api/system/v1-field-evidence-intake/stage-row` 的保存结果现在和顶部签字 / 边界摘要共用同一套脱敏进度、缺签字、边界状态、首批动作和下一步口径；页面保存后结果优先显示该摘要，API client、OpenAPI 和专项脚本已同步。该补充只提升保存后继续收尾的可读性和一致性，不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `签字 / 边界收尾` 摘要下沉到后端状态接口。`GET /api/system/v1-go-live-status` 现在返回脱敏 `fieldEvidenceProgress.signoffBoundarySummary`，包含签字进度、缺签字数量、边界状态、待办口径、前 3 条签字 / 边界待办和下一步；页面新增紧凑摘要区，当前显示 `签字 0/6`、`缺签字 6`、`边界 待确认`、`待办 7/7`、首批 `3/7`，并可从首批待办直接 `填到草稿`。该补充让 6 个负责人签字和 1 个 V1/V2 边界确认的收尾状态从“只看完整列表”变成 API / 页面 / 后续交接可复用的统一脱敏数据，但不改变真实上线就绪百分比；浏览器已验证桌面 1440px 和移动 390px 下摘要区、3 条首批待办和 3 个草稿按钮正常显示，页面整体无横向溢出。V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `现场证据 / 签字进度` 的证据组待补预览下沉到后端状态接口。`GET /api/system/v1-go-live-status` 现在返回脱敏 `fieldEvidenceProgress.groupSummaries` 和 `summary.groupSummaryCount=6`，6 个证据组各自带负责人、进度、缺失数量、下一步和前 3 条待补证据；页面优先使用接口数据，旧 payload 缺字段时再用 `groups + missingItems` 兜底。该补充让 34 项现场证据的组摘要从“前端展示辅助”变成 API / 页面 / 后续交接可复用的统一脱敏数据，但不改变真实上线就绪百分比；浏览器已验证桌面 1440px 和移动 390px 下 6 个证据组、18 条组内预览、6 个 `只看本组` 正常显示且无横向溢出。V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `角色现场任务` 分类收尾入口下沉到后端状态接口。`GET /api/system/v1-go-live-status` 现在返回脱敏 `roleTaskBoard.categorySummaries` 和 `summary.categoryCount=4`，按发布门禁、现场证据、负责人签字、V1/V2 边界四类输出数量、状态、下一步和每类前 3 条任务；页面优先使用该接口数据，并在分类卡片展示前 2 条任务预览。该补充让 52 项现场任务的分类口径从“前端展示辅助”变成 API / 页面 / 后续交接可复用的统一脱敏数据，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `角色现场任务` 从“首批现场动作 + 安全处理入口”推进到“分类收尾入口”。页面在角色任务汇总下按 `发布门禁`、`现场证据`、`负责人签字`、`V1/V2 边界` 四类显示待处理数量和动作入口，其中当前分别为 `11`、`34`、`6`、`1` 项；分类动作可直接进入生产配置门禁、运行时门禁、当前 env 预检、组合预检、现场证据进度、第一条证据草稿、现场验收报告、回填质量检查、签字草稿、边界确认、V1/V2 边界和边界预检。该补充让 52 项现场任务不只按前 10 条或角色预览执行，而是能按真实收尾类别分工推进，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `角色现场任务` 从“各角色固定预览前几条”推进到“首批现场动作 + 安全处理入口”。页面显示当前任务板前 10 条首批动作，覆盖生产 env、运行时 readiness、现场证据、签字和边界等优先事项，并按任务内容提供生产配置门禁、env 修正项、当前 env 预检、运行时门禁、持久化 / 附件 / spool / CUPS / 打印 / 司机真机预检、填证据草稿、填签字草稿或填边界确认等入口。角色卡片也会显示 `X/Y` 预览数量和隐藏任务提示。该补充让现场按 52 项 blocker 分工执行更直接，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `现场证据 / 签字进度` 从“证据组级入口”推进到“组内待补预览 + 只看本组筛选”。6 个证据组现在各自预览前 3 条缺失证据，预览行可直接 `填到草稿`；组内剩余待补项会提示数量，点击 `只看本组` 后 `优先补证据` 只显示该组缺证据，例如 `打印硬件 / CUPS / 标签 7/7`，并可用 `显示全部证据` 回到默认 `12/34`。该补充让办公室 / 管理用户按生产持久化、对象存储、打印、司机真机、业务试跑、账号权限等组别补 34 项现场证据更直接，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `现场证据 / 签字进度` 从“6 个证据组展示进度 + 34 条缺证据列表”推进到“每个证据组自带收尾入口”。`生产持久化`、`对象存储 / 附件留档`、`打印硬件 / CUPS / 标签`、`司机真机 / 原生壳`、`真实业务试运行`、`账号 / 权限 / 运维` 六组现在都能直接 `填本组第一条`，并按组提供持久化、当前 env、组合、附件留档、spool、CUPS、打印门禁、司机真机、现场验收报告、刷新预检、负责人签字、边界确认或边界预检等入口。该补充让现场处理 `现场证据 0/34` 更接近按岗位 / 场景闭环，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `生产配置门禁` 从“顶部总按钮 + 行说明”推进到“每条生产 env blocker 自带处理入口”。5 条可见门禁行现在分别提供 env 修正项、脱敏 env 草稿段定位、当前 env 预检、持久化预检、附件留档预检、spool / CUPS / 打印门禁预检或组合预检；并按稳定 production env gate key 匹配动作，避免对账导出对象存储行被 fallback 文案误判成附件留档行。该补充让技术 / 管理负责人处理 `生产 env 2/9` 背后的首批配置阻塞更直接，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `运行时门禁阻塞` 从“顶部总按钮 + 行说明”推进到“每条 blocker 自带处理入口”。6 条 blocker 现在分别提供对应只读预检、现场证据草稿、env 修正项、现场验收报告或司机签字入口；并按稳定 blocker key 匹配动作，避免持久化行被文案中的“对象存储 profile”误判成附件留档行。该补充让技术 / 管理负责人处理 `runtime readiness 5/11` 背后的 6 项阻塞更直接，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `最小解除阻塞路径` 从“阶段说明 + 首批任务”推进到“每个阶段自带处理入口”。生产环境、真实打印、司机真机、真实业务试跑、安全签字边界和其它剩余阶段都能直接跳到对应预检、现场证据草稿、负责人签字或 V1/V2 边界区；同时修正了生产配置门禁、生产环境修正清单、安全 env 草稿的定位，避免同名入口跳错。该补充让现场按 52 项 blocker 顺序执行更直接，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `最近刷新预检` 的 blocker 从“只说明不能刷新”推进到“可直接跳转处理”。当前刷新预检显示 5 条阻塞、10 个动作按钮：证据阻塞可 `填第一条证据`，签字阻塞可 `填负责人签字`，边界阻塞可 `填边界确认` / `查看 V1/V2 边界`，env 阻塞可 `查看 env 修正项` / `当前 env 预检`，组合门禁阻塞可 `查看生产配置门禁` / `组合预检`。该补充提高现场按 blocker 收尾的可操作性，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把生产环境修正清单的 `变量检查` 和实时 env 预检结果联动：未执行实时检查前显示 `来源：交接包快照`；执行 `生产配置门禁 / 当前预检` 后，9 条 env 修正项显示 `最近预检：当前 env 预检` 和当前 `已配置/总变量` 计数；如果 `文件应用预检` 仅返回安全 env 文件未配置的兜底检查，则不会覆盖 9 条修正项，避免误判进度。该补充让技术 / 管理负责人能区分“交接包生成时状态”和“当前 API 实例状态”，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把生产环境修正清单从“变量名摘要 + 定位草稿段”推进到“每项变量检查”。页面会把每个 env blocker 的 required / missing / placeholder 拆成 `待补`、`占位`、`规则`、`已配置`、`无需填写` 状态 chip；展开后 9 条 env 修正项均有变量检查，当前显示缺失变量 chip `26` 个、规则 chip `3` 个、无需填写 chip `2` 个。该补充让技术 / 管理负责人能直接判断每个 blocker 是还缺真实变量、只是模板占位、还是二选一规则，不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 `V1 收尾总复核` 和 release-candidate `刷新预检` 接入当前生产上线组合门禁：总复核会执行生产上线组合预检，刷新预检也会返回 `组合门禁 0/4`、阻塞数和 `当前生产上线组合预检未通过`，避免把只覆盖现场证据 / 签字 / env / 边界的预检误当成生产 ready。已通过 API、OpenAPI、构建和浏览器桌面 / 390px 验证。该补充让 V1 上线判断更严格，但不提高真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把 V1/V2 差异展示从“摘要前几条”推进到“可展开完整清单”：页面默认显示 `V1 必做 4/6`、`V2 差异 5/17`、`模块差异 5/11`，可展开查看 `V1 必做 6/6`、`V2 差异 17/17`、`模块差异 11/11`。该补充让负责人和使用者能直接看清计划 V2 版本与 V1 的不同，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把生产环境修正清单和安全 env 填写草稿从“固定截断预览”推进到“可展开完整脱敏清单”：页面默认显示 env 修正项 `6/9`、env 草稿 `36/61`，可展开查看 env 修正项 `9/9`、env 草稿 `61/61`。状态 API 返回当前交接包内全部脱敏 env 草稿预览行，真实连接串、对象存储密钥、命令值、token 和路径类值仍替换为 `<待填写>`，并继续声明不包含密钥值和产物路径。该补充让技术 / 管理负责人能直接在页面按 PostgreSQL、对象存储、打印 command_bridge、CUPS、readiness 账号和现场验收报告留档分派处理，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又把生产环境修正项和安全 env 填写草稿做了定位联动：有对应模板段的修正项显示 `定位草稿段`，点击后会展开完整 env 草稿、滚动并高亮对应 `# BLOCKING | ... | 项目` 或 `# WARNING | ... | 项目` 段；没有模板段的通过项显示 `无 env 草稿段`。浏览器验证点击 `附件对象存储环境变量` 后，高亮 `# BLOCKING | 技术/管理 | 附件对象存储环境变量`，桌面和 390px 均无横向溢出，控制台错误 0。该补充进一步降低现场按 blocker 填 env 时漏段 / 填错段的风险，但不改变真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮新增 `scripts/run-v1-production-go-live-precheck.mjs`，把生产 env 文件审计、生产 env 变量预检、当前 API V1 readiness 和当前 API 生产 profile 确认合并成只读生产上线组合预检。它专门阻止把实验室本地接受旁路下的 `11/11` 误判为生产 ready：只要当前 API 仍启用本地持久化接受、本地附件留档接受、本地仓储或非 live 对象存储，组合预检就保持 blocked。已通过 `npm run v1-production-go-live-precheck:check`。该能力提升 V1 发布门禁严谨度，但不直接提高真实上线就绪百分比；真实 PostgreSQL / OSS/S3/COS、真实打印设备、司机真机、业务试跑、现场证据、负责人签字和 V1/V2 边界仍要完成。

本轮 `上线状态` 又修正了保存草稿后收尾区计数显示：保存结果只渲染前 5 条 `填到草稿` 时，标题计数现在显示 `5/33`、`5/7` 这种“已显示 / 总剩余”口径，而不是让现场误以为所有剩余待办都已显示。浏览器验证中临时保存一条证据后，保存结果未泄露临时 `ATT-*` 原文、控制台错误 0、页面无横向溢出；测试编号已清理，最终仍为发布门禁 `0/4`、现场证据 `0/34`、签字 `0/6`。该修复提升 V1 收尾操作显示准确性，但不提升真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又修复了保存草稿后收尾 actions 为空的问题：保存现场证据、签字或 V1/V2 边界草稿后，后端现在会从刚生成的 draft manifest 完整校验结果里生成脱敏 `现场证据剩余` / `签字 / 边界剩余` actions，保存结果区可直接继续点击 `填到草稿`。浏览器验证中两个收尾区块各显示 5 个 `填到草稿`，控制台错误 0、无横向溢出、保存结果未显示测试证据编号原文，测试编号已清理。该修复提升 V1 收尾操作闭环，但不提升真实上线就绪百分比；V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了保存草稿后的现场证据剩余汇总：保存现场证据、签字或 V1/V2 边界草稿后，页面会直接显示 `现场证据剩余`，包含证据进度、缺证据、已填引用、无效行、下一步和前几条待补证据。该信息来自后端脱敏 `evidenceCloseout`，不回显原始证据编号、备注、CSV、manifest、路径或密钥，也不会自动补证据、刷新 release candidate / go-live suite。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了保存草稿后的签字 / 边界剩余汇总：保存现场证据、签字或 V1/V2 边界草稿后，页面会直接显示 `签字 / 边界剩余`，包含签字进度、缺签字、无效行、边界状态、下一步和前几条待办。该信息来自后端脱敏 `closeout`，不回显签字人 / 确认人原文、时间、备注、CSV、manifest、路径或密钥，也不会自动补签字、确认边界、刷新 release candidate / go-live suite。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了签字 / 边界待办直接带入草稿：`签字/边界待办` 的每条可见待办新增 `填到草稿`，可把对应签字或 V1/V2 边界行选入 `签字 / 边界草稿`，普通签字默认 `signed`，边界默认 `confirmed`，并清空上一项遗留的签字人 / 确认人、时间、备注和已选附件，降低现场错填签字 / 边界资料的风险。该动作只更新页面草稿选择，不写 CSV、不保存签字 / 边界、不上传附件、不确认 V1/V2 边界、不刷新 release candidate / go-live suite，也不修改生产 env、打印、司机或业务数据。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了缺失证据直接带入草稿：`优先补证据` 的每条可见缺失证据新增 `填到草稿`，可把对应证据项选入 `现场证据草稿`，并清空上一项遗留的证据编号、备注和已选文件，降低现场错填证据引用的风险。该动作只更新页面草稿选择，不写 CSV、不保存证据、不上传附件、不确认签字 / 边界、不刷新 release candidate / go-live suite，也不修改生产 env、打印、司机或业务数据。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了缺失证据全量查看：`优先补证据` 默认仍保持 12 项紧凑视图，但办公室 / 管理用户可展开查看全部 34 项缺失现场证据，不再需要打开 CSV 才能看到后续证据项。该动作只展示脱敏证据项、分组、负责人和下一步，不写证据、不确认签字 / 边界、不刷新 release candidate / go-live suite，也不修改生产 env、打印、司机或业务数据。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了 V1 收尾总复核动作：办公室 / 管理用户可在 `回填质量检查` 点击 `V1 收尾总复核`，系统会顺序执行现有现场证据草稿校验、V1/V2 边界预检、release-candidate 刷新预检和运行时 readiness 预检。该动作只读诊断，不保存现场证据 / 签字 / 边界草稿，不上传或复用附件，不确认边界，不刷新 release candidate / go-live suite，也不修改生产 env、打印、司机、现场任务或业务数据。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了 V1/V2 边界确认保存后的专门预检动作：办公室 / 管理用户在 `签字 / 边界草稿` 选中边界确认行时，可点击 `保存并预检边界`，系统先保存边界草稿行，保存成功后马上执行边界预检；同时把边界行的组合复核文案改为 `保存并复核边界`，避免和普通签字混淆。该动作不跳过确认人 / 确认时间，不自动确认边界，不刷新 release candidate / go-live suite，也不修改生产 env、证据、签字、打印、司机或业务数据。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了受控 V1/V2 差异摘要刷新动作：办公室 / 管理用户可在 `V1/V2 边界` 点击 `刷新差异`，系统只用服务端 artifact root 和当前完成度快照重新生成 V1/V2 scope brief。当前返回 `blocked_scope_brief_refreshed`，V1 必做 `6 项`、V2 分类 `7 类`、V2 差异 `17 项`、模块差异 `11 个模块`；该动作忽略浏览器请求体，不接受前端 token、路径、命令参数或伪造差异，也不确认边界、不刷新 release candidate / go-live suite、不修改现场证据 / 签字 / 生产 env / 打印 / 司机 / 业务数据。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了受控刷新候选动作：办公室 / 管理用户可在 `回填质量检查` 点击 `刷新候选`，系统先执行同一套刷新预检，当前未 ready 时返回 `409 / blocked_by_precheck`，不会实际执行 go-live suite；只有证据、签字、生产 env、V1/V2 边界等门禁 ready 后，才会用服务端配置和固定参数刷新 release candidate / go-live suite。该动作忽略浏览器请求体，不接受前端 env 路径、token、命令参数或假值，也不返回 stdout/stderr、路径、env 值、命令值、原始证据、签字/备注或密钥。它补齐了从预检到受控刷新之间的代码闭环，但当前直接刷新仍是 `暂不能刷新`：证据 `0/34`、签字 `0/6`、生产 env `2/9`、阻塞 `4 项`、候选和套件均未刷新。因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了保存并复核动作：办公室 / 管理用户可在 `现场证据草稿` 点击 `保存并复核证据`，或在 `签字 / 边界草稿` 点击 `保存并复核签字`。系统先走现有受控草稿保存，保存成功后再自动执行草稿校验和刷新预检；原单独保存动作仍保留。该组合动作只减少现场保存后再找校验按钮的操作成本，不代表真实证据、真实签字、生产环境、打印设备、司机真机或业务试跑已经完成；因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了现场证据收尾复核动作：办公室 / 管理用户可在 `回填质量检查` 点击 `校验并预检刷新`，页面会依次执行现有 `校验草稿` 和 `刷新预检`，用于保存现场证据 / 签字草稿后快速确认草稿有效性和后续发布候选刷新阻塞。该动作只读诊断，不写采集 CSV、不改 manifest、不刷新 release candidate / go-live suite，也不代表真实现场证据或签字已经完成；因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了负责人签字 / V1-V2 边界附件登记和复用动作：办公室 / 管理用户可在 `回填质量检查 / 签字 / 边界草稿` 上传签字扫描件或边界确认单，并按当前签字 / 边界行查询后端 `ATT-*` 附件列表。该列表按 `v1_signoff_boundary + type:key` 精确过滤，本地降级和 `LOCAL-ATT-*` 不可复用；上传或点击 `填入备注` 只把附件编号写入备注输入框，仍需签字人 / 确认人和时间齐全，并通过 `保存签字草稿` 校验后才进入 `signoff-boundary.csv` / draft manifest。该动作只降低签字 / 边界留档附件找编号和重复上传成本，不代表真实签字、边界确认或现场证据已完成；因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了现场证据附件查询 / 复用动作：办公室 / 管理用户可在 `回填质量检查 / 现场证据草稿` 查询当前证据项的后端 `ATT-*` 附件列表，并点击 `填入引用` 把已登记附件编号带入证据编号输入框。列表按 `v1_field_evidence + 证据组:证据项` 精确过滤，本地降级和 `LOCAL-ATT-*` 不可复用，且复用本身不写 CSV，仍需通过 `保存证据草稿` 校验后才进入 draft manifest。该动作只降低找附件编号和重复上传成本，不代表真实证据、签字或边界已完成；因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了现场证据附件上传绑定动作：办公室 / 管理用户可在 `回填质量检查 / 现场证据草稿` 选择文件并点击 `上传并保存证据`，系统先通过后端附件 API 登记 `v1_field_evidence` 附件，再把返回的 `ATT-*` 写入该证据项的现场证据引用。页面和逻辑明确拒绝本地降级 `LOCAL-ATT-*`，避免把未进入后端留档体系的本地附件误当成 V1 验收证据。该动作仍只写草稿 CSV 和 draft manifest，不刷新 release candidate / go-live suite，也不代表真实现场材料已经补齐；因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`运行时 5/11`、`生产 env 2/9`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了现场证据 / 签字 / V1-V2 边界单行草稿保存动作：办公室 / 管理用户可在 `回填质量检查` 直接填写 `现场证据草稿` 或 `签字 / 边界草稿`，由 `POST /api/system/v1-field-evidence-intake/stage-row` 只写入采集包 CSV onsite 字段并重新生成 draft manifest。当前保存动作仍要求真实证据编号、签字人 / 时间或确认人 / 时间，且不回显原始证据编号、签字人、备注、CSV、草稿 manifest、路径或密钥。该动作只降低现场手工编辑 CSV 的成本，不代表真实证据、签字或边界已完成；因此总体完成度暂不因本轮代码上调，V1 仍按 `发布门禁 0/4`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 判断为 blocked。

本轮 `上线状态` 又补了当前生产 env 文件应用预检动作：办公室 / 管理用户可在 `生产配置门禁` 点击 `文件应用预检`，由 `POST /api/system/v1-production-env-file-preview/live-precheck` 检查服务端配置的安全 env 文件如果叠加到内存副本后是否满足生产 env 预检。当前默认结果为 `未配置 / not_configured`、服务端路径 `未配置`、内存应用 `否`、当前进程改写 `否`、通过 `0/9`、阻塞 `1 项`、审计 `未配置`；专项自动化也覆盖服务端配置安全未跟踪 `0600` env 文件时返回 `ready / 9/9` 且不泄露路径和值。该动作只读，忽略请求体，不接受前端传入 env 文件路径或 env 值，不修改 `process.env`，不刷新 release candidate / go-live suite，不返回真实 env 文件路径、原始 env 文件、原始预检、连接串、env 值、secret、命令值、本地路径或前端伪造值；它只帮助现场技术负责人提前判断安全 env 文件内容是否能通过变量门禁，不代表当前 API 已应用生产 env、真实部署已完成或 V1 已完成。

本轮 `上线状态` 又补了当前生产 env 文件安全审计明细预检动作：办公室 / 管理用户可在 `生产配置门禁` 点击 `env 文件审计`，由 `POST /api/system/v1-production-env-file-audit/live-precheck` 检查当前 API 实例是否配置了服务端安全 env 文件审计路径。当前默认结果为 `未配置 / not_configured`、服务端路径 `未配置`、审计文件 `0 个`、阻塞 `1 项`、警告 `0 项`、前端路径输入 `不允许`、路径暴露 `否`；专项自动化也覆盖服务端配置安全未跟踪 `0600` env 文件时返回 `passed` 且不泄露路径和值。该动作只读，忽略请求体，不接受前端传入 env 文件路径，不刷新 release candidate / go-live suite，不返回真实 env 文件路径、原始 env 文件、原始行、连接串、env 值、secret、命令值、本地路径或前端伪造值；它只帮助现场技术负责人拆解生产 env 文件审计子门禁，不代表真实生产 env 文件、变量预检、真实部署或 V1 已完成。

本轮 `上线状态` 又补了当前司机端 V1 真机门禁明细预检动作：办公室 / 管理用户可在 `运行时门禁阻塞` 点击 `司机真机预检`，由 `POST /api/system/v1-driver-readiness/live-precheck` 使用服务端司机验收账号检查当前 API 实例的司机端 V1 readiness。当前结果为 `仍未通过 / blocked`、通过 `1/6`、阻塞 `5 项`、送货任务读取 `3 条`、现场验收 `否`、原生能力 `0/2`、标签扫码 `否`、原生扫码 `否`；阻塞项集中在司机真机现场验收、原生扫码桥、原生导航桥和纸质包裹标签原生扫码样本。该动作只读，忽略请求体，不修改送货状态，不请求摄像头，不打开导航，不调用原生桥，不刷新 release candidate / go-live suite，不返回原始司机 readiness、送货任务 payload、现场验收 payload、扫码文本、照片、定位、本地路径或密钥；它只帮助现场技术负责人拆解第六个运行时阻塞，不代表真实 Android / iOS 原生壳、真机权限、纸质标签扫码、地图 App、现场水印照片或司机现场 QA 已通过，也不代表 V1 完成。

本轮 `上线状态` 又补了当前 V1 打印上线门禁明细预检动作：办公室 / 管理用户可在 `运行时门禁阻塞` 点击 `打印门禁预检`，由既有 `GET /api/print-driver/v1-readiness` 检查当前 API 实例的 9 项打印门禁、必需设备组、spool / CUPS 子诊断和安全护栏。当前结果为 `仍未通过 / blocked`、通过 `3/9`、阻塞 `6 项`、必需设备 `0/2`、spool `阻塞`、CUPS `阻塞`、不出纸 `是`、物理打印 `否`；阻塞项集中在系统打印配置、spool 状态回读、CUPS 队列预检和标签机现场 QA。该动作只读，不新增后端路由，不生成打印文件，不提交打印作业，不调用物理打印机，不返回真实命令值、命令参数、spool 路径、payload、本地路径或密钥；它只帮助现场技术负责人拆解第五个运行时阻塞，不代表真实 `lpstat`、CUPS 队列、标签机或针式机已现场通过，也不代表 V1 完成。

本轮 `上线状态` 又补了当前 CUPS 队列明细预检动作：办公室 / 管理用户可在 `运行时门禁阻塞` 点击 `CUPS 预检`，由既有 `GET /api/print-driver/cups-diagnostics` 检查当前 API 实例的 CUPS 队列配置、白名单、状态命令和命令可执行状态。当前结果为 `仍未通过 / not_configured`、不出纸 `是`、队列配置 `否`、白名单 `否`、状态命令 `否`、命令可执行 `否`、物理打印 `否`、stdout 暴露 `否`、stderr 暴露 `否`；阻塞项集中在系统打印开关、命令桥类型和打印命令配置。该动作只读，不新增后端路由，不生成打印文件，不提交打印作业，不调用物理打印机，不返回真实命令值、stdout/stderr 内容、payload、本地路径或密钥；它只帮助现场技术负责人拆解第四个运行时阻塞，不代表真实 `lpstat`、CUPS 队列、标签机或针式机已现场通过，也不代表 V1 完成。

本轮 `上线状态` 又补了当前打印 spool 状态回读明细预检动作：办公室 / 管理用户可在 `运行时门禁阻塞` 点击 `spool 预检`，由既有 `GET /api/print-driver/spool-diagnostics` 检查当前 API 实例的 command-bridge spool 写入、待打回读、完成回读和清理。当前结果为 `仍未通过 / not_configured`、不出纸 `是`、写入 `否`、待打回读 `否`、完成回读 `否`、清理 `否`、物理打印 `否`；阻塞项集中在系统打印开关、命令桥类型和打印命令配置。该动作只读，不新增后端路由，不创建业务打印作业，不调用物理打印机，不返回真实命令值、spool 路径、payload、诊断作业 ID、本地路径或密钥；它只帮助现场技术负责人拆解第三个运行时阻塞，不代表真实 CUPS / 标签机 / 针式机已出纸，也不代表 V1 完成。

本轮 `上线状态` 又补了当前附件 V1 留档明细预检动作：办公室 / 管理用户可在 `运行时门禁阻塞` 点击 `附件留档预检`，由 `POST /api/system/v1-attachment-retention/live-precheck` 检查当前 API 实例的附件 V1 readiness / storage diagnostics。当前结果为 `仍未通过`、通过 `4/5`、存储 `本地文件`、对象存储 `否`、诊断读写 `是`、清理 `是`、本地批准 `否`、候选刷新 `否`。该动作只读，忽略请求体，不登记业务附件，不刷新 release candidate / go-live suite，不返回诊断对象 ID、storage key、摘要值、本地路径、真实 env 值、命令值、密钥或原始附件 readiness 报告；它只帮助现场技术负责人拆解第二个运行时阻塞，不代表真实 OSS/S3/COS bucket 已配置，也不代表 V1 完成。

本轮 `上线状态` 又补了当前系统 V1 持久化明细预检动作：办公室 / 管理用户可在 `运行时门禁阻塞` 点击 `持久化预检`，由 `POST /api/system/v1-persistence/live-precheck` 检查当前 API 实例的系统 V1 readiness。加入订单草稿仓储后，当前本地结果为 `仍未通过`、通过 `1/7`、仓储组 `5 组`、生产仓储 `0/32`、本地仓储 `32 个`、本地接受 `否`、候选刷新 `否`。该动作只读，忽略请求体，不刷新 release candidate / go-live suite，不返回业务数据、连接串、本地路径、真实 env 值、命令值、密钥或原始 readiness 报告；它只帮助现场技术负责人拆解第一个运行时阻塞，不代表真实 PostgreSQL / 对象存储已配置，也不代表 V1 完成。

本轮 `上线状态` 又补了 V1/V2 边界确认预检动作：办公室 / 管理用户可在 `V1/V2 边界` 点击 `边界预检`，由 `POST /api/system/v1-v2-boundary/precheck` 检查当前 V1/V2 差异摘要和签字 / 边界 CSV。当前结果为 `待确认`、边界 `待确认`、V1 必做 `6 项`、V2 差异 `17 项`、阻塞 `2 项`、候选刷新 `否`。该动作只读，不接受确认人 / 确认时间写入，不刷新 release candidate / go-live suite，不返回原始证据、签字人、确认人、备注、路径、真实 env 值或命令值；它只帮助负责人区分 V1 必须继续完成项和计划 V2 差异，不代表 V1 完成或边界已确认。

本轮 `上线状态` 又补了当前运行时 V1 总门禁预检动作：办公室 / 管理用户可在 `运行时门禁阻塞` 点击 `当前预检`，由 `POST /api/system/v1-runtime-readiness/live-precheck` 检查当前 API 实例 11 项 readiness。当前结果为 `仍未通过`、通过 `5/11`、阻塞 `6 项`、当前实例 `是`、不出纸 `是`、候选刷新 `否`。该动作只读，不接受前端 API base URL 或 bearer token，不刷新 release candidate / go-live suite，不返回 API URL、token、真实 env 值、命令值、spool 路径、本地路径或业务 payload；它只帮助区分当前运行时门禁和 release candidate / 现场报告快照，不代表 V1 完成。

本轮 `上线状态` 又补了当前运行环境生产 env 预检动作：办公室 / 管理用户可在 `生产配置门禁` 点击 `当前预检`，由 `POST /api/system/v1-production-env/live-precheck` 检查当前 API 进程实际 env。当前结果为 `仍未通过`、通过 `2/9`、阻塞 `5 项`、警告 `2 项`、`env 路径输入 不允许`、候选刷新 `否`。该动作只读，不接收 env 文件路径或 env 值，不刷新 release candidate / go-live suite，不返回真实 env 值、命令值、密钥或路径；它只帮助区分当前运行环境和 release candidate 快照，不代表 V1 完成。

本页完成度现在可通过 `node scripts/run-v1-completion-snapshot.mjs --json` 汇总到 `.erp-local-storage/v1-completion-snapshot/latest.md` / `latest.json`，并自动纳入 V1 上线交接包；办公室端 `上线状态` 页面已接入 `GET /api/system/v1-go-live-status`，优先读取后端 go-live 产物展示同一口径，并展示 go-live suite 的 52 项最小解除阻塞路径。该路径现在不仅显示阶段摘要，还在当前阶段展示结构化分组和首批任务状态，例如生产环境阶段显示 `分组 5 类`、`首批任务 4/16`、`生产环境变量预检 5 项` 和 `待处理 / 技术/管理`，方便现场按阶段和分组执行。该接口现在也会读取脱敏 `ownerDecisionBrief`，页面新增 `负责人决策摘要`，直接显示当前负责人结论 `不能宣布 V1 已完成`、发布门禁 `0/4`、运行时 `5/11`、现场任务 `52 项`、现场证据 `0/34` / 签字 `0/6`、未完成证明、负责人复核问题、8 条优先动作和前 5/10 条首批阻塞，避免把 P0 / 代码 `97-98%` 误解成可上线完成，并让负责人直接看到先补生产 env、现场证据、runtime readiness、现场验收报告和现场任务清单；该摘要不返回原始负责人文件、路径、原始证据、签字人、真实 env 值或命令值。该接口还会从现场证据采集包读取脱敏 `fieldEvidenceProgress`，在页面展示证据组 `0/6`、证据 `0/34`、签字 `0/6`、V1/V2 边界待确认、负责人角色和下一步，便于负责人直接看到 V1 卡在真实现场材料而不是页面代码；同时会从 release-candidate 读取生产环境修正清单，在页面展示 9 项待补配置、5 项 blocking、负责人角色、缺失变量名和下一步，便于先处理 PostgreSQL / 对象存储 / 打印 command_bridge / CUPS 等部署阻塞；还会读取上线交接包的生产 env 安全填写草稿，页面展示 29 个变量骨架、阻塞段 / 警告段统计和 `<待填写>` 脱敏预览，方便现场技术负责人填写安全未跟踪 env 文件。该 API、快照和页面都只用于状态沟通和执行辅助，不替代发布候选 READY、现场证据 manifest ready、岗位任务清零、负责人签字和 V1/V2 边界确认。

本轮 `上线状态` 又补了 release candidate 刷新前置预检动作：办公室 / 管理用户可在 `回填质量检查` 点击 `刷新预检`，由 `POST /api/system/v1-release-candidate/refresh-precheck` 聚合当前现场证据草稿校验、生产 env 门禁、负责人签字和 V1/V2 边界。当前结果为 `暂不能刷新`、证据 `0/34`、签字 `0/6`、生产 env `2/9`、边界 `待确认`、阻塞 `4 项`、候选刷新 `否`，阻塞集中在现场证据草稿校验未通过、生产环境变量预检未通过、负责人签字未完成和 V1/V2 边界未确认。该动作只读，不修改草稿，不刷新 release candidate / go-live suite，不返回原始 CSV、证据编号、签字人、确认人、备注、草稿内容、路径、真实 env 值或命令值；它只减少现场误刷新候选版本的风险，不代表 V1 上线完成。

本轮 `上线状态` 又补了现场证据草稿受控校验动作：办公室 / 管理用户可在 `回填质量检查` 点击 `校验草稿`，由 `POST /api/system/v1-field-evidence-intake/validate-draft-manifest` 读取当前 draft manifest 并返回脱敏校验结果。当前空草稿结果为 `校验未通过`、证据 `0/34`、签字 `0/6`、证据组 `0/6`、阻塞 `41 项`、候选刷新 `否`；页面会显示前三条阻塞预览和下一步，说明草稿格式可读但现场证据、签字和 V1/V2 边界未完成。该动作只读，不覆盖源 manifest，不修改草稿，不刷新 release candidate / go-live suite，不返回原始 CSV、证据编号、签字人、确认人、备注、草稿内容、路径或真实值；它只减少现场负责人校验本地草稿的成本，不代表 V1 上线完成。

本轮 `上线状态` 还补了现场证据草稿受控生成动作：办公室 / 管理用户可在 `回填质量检查` 点击 `生成草稿`，由 `POST /api/system/v1-field-evidence-intake/draft-manifest` 从当前采集包生成 draft manifest 草稿。当前空采集包结果为应用 `0` 行、无效 `0` 行、证据 `0/34`、签字 `0/6`、候选刷新 `否`；草稿存在后，回填质量阻塞从 `4 项` 降为 `3 项`，但剩余真实证据、签字和 V1/V2 边界仍未完成。该动作不覆盖源 manifest，不刷新 release candidate / go-live suite，不返回原始 CSV、证据编号、签字人、确认人、备注、草稿内容、路径或真实值；它只减少现场负责人跑本地命令的成本，不代表 V1 上线完成。

本轮 `上线状态` 又补了现场验收报告展示：API 读取脱敏 `fieldAcceptanceReport` 后，页面显示 `现场验收报告`、`通过 5/11`、`阻塞 6 项`、`显示 6/6`，并把生产持久化、附件留档、打印 V1 上线门禁、司机端 V1 真机门禁等模块 / 阻塞项和 `现场必须留档` 证据组列出来。该能力用于解释当前 5/11 现场验收为什么仍不能宣布 V1 完成，不返回原始报告、产物路径、本地路径、原始证据编号、打印命令、spool 路径、司机 payload、真实 env 值或密钥，也不改变 `发布门禁 0/4`、`runtime readiness 5/11`、`现场证据 0/34`、`签字 0/6` 的 blocked 结论。

本轮 `上线状态` 还补了现场证据回填质量检查：API 读取现场证据 CSV、签字 / 边界 CSV、规则文件和 draft manifest 状态后只返回脱敏 `fieldEvidenceIntakeQuality`，页面显示 `回填质量检查`、证据 `0/34`、签字 `0/6`、边界 `待确认`、草稿 `未生成`、`可生成草稿 是`、`可刷新候选 否` 和阻塞 `4 项`。该能力用于区分“采集包和 CSV 已在，但现场材料没有填完 / 草稿没生成 / 不能刷新候选”，不返回原始 CSV、证据编号、签字人、确认人、备注、草稿 manifest、路径或真实值，也不改变 `现场证据 0/34`、`签字 0/6`、`发布门禁 0/4` 的 blocked 结论。

本轮 `上线状态` 又补了现场证据回填指引：API 读取现场证据采集包相关文件状态后只返回脱敏 `fieldEvidenceIntakeGuidance`，页面显示 `现场证据回填指引`、`证据 0/34`、`签字 0/6`、`边界 待确认`、`草稿 未生成` 和三条占位命令模板：生成 draft manifest、校验 draft、刷新 go-live suite / release candidate。该能力用于减少现场填完 CSV 后不知道下一步怎么跑的风险，不返回原始 CSV、证据编号、签字人、确认人、时间、备注、规则原文、草稿 manifest、路径或真实值，也不改变 `现场证据 0/34`、`签字 0/6`、`发布门禁 0/4` 的 blocked 结论。

本轮 `上线状态` 又补了现场证据缺失明细：API 读取 `evidence-items.csv` 后只返回脱敏 `missingItems`，页面显示 `优先补证据` 和 `12/34` 缺失项预览，包含 `PostgreSQL 迁移已在生产库执行`、`标签机真实样张已出纸并留档` 等具体待补项。该能力用于指导现场执行，不返回原始证据编号、备注、CSV 内容或本地路径，也不改变 `现场证据 0/34`、`签字 0/6`、`发布门禁 0/4` 的 blocked 结论。

本轮 `上线状态` 还补了签字 / 边界待办明细：API 读取 `signoff-boundary.csv` 后只返回脱敏 `signoffBoundaryActions`，页面显示 `签字/边界待办` 和 `7/7` 待办项，明确 6 个负责人签字均缺签字人 / 缺时间，V1/V2 边界确认缺确认人 / 缺时间。该能力用于指导负责人复核和签字，不返回签字人、确认人、时间原文、备注或 CSV 内容，也不改变 `签字 0/6` 和 `V1/V2 边界待确认` 的 blocked 结论。

本轮 `上线状态` 还补了角色现场任务板：API 读取 `v1-onsite-task-board/latest.json` 后只返回脱敏 `roleTaskBoard`，页面显示 `角色现场任务`，把 52 项真实现场 / 部署任务拆给技术/管理、办公室、仓库/出库、车间、司机、财务 6 个角色，并展示各角色门禁 / 证据 / 签字 / 边界数量和优先动作预览。该能力用于现场执行分工，不返回原始任务板、原始证据编号、签字字段名、备注、路径或密钥，也不改变 `52` 项任务仍未完成的 blocked 结论。

本轮 `上线状态` 还补了 V1/V2 边界摘要：API 读取 `v1-v2-scope-brief/latest.json` 后只返回脱敏 `v1V2BoundaryBrief`，页面新增 `V1/V2 边界`，同时显示 V1 必须继续完成 `6` 项、V2 分类 `7` 类、V2 差异 `17` 项、模块差异 `11` 个和负责人复核规则。该能力用于防止把生产配置、真实设备、现场证据、负责人签字和 V1/V2 边界确认误后移到 V2；它不返回原始产物路径、原始证据编号、签字人 / 确认人、备注、路径或密钥，也不改变 `发布门禁 0/4`、`现场证据 0/34`、`签字 0/6`、`V1/V2 边界待确认` 的 blocked 结论。

本轮 `上线状态` 还补了运行时 V1 readiness 阻塞明细：API 读取 release-candidate `blockingItems` 后只返回脱敏 `runtimeReadinessBlockers`，页面新增 `运行时门禁阻塞`，把当前 `5/11` 通过背后的 6 个阻塞项列清楚：系统 V1 持久化门禁、附件 V1 留档门禁、打印 spool 状态回读、CUPS 队列预检、打印 V1 上线门禁、司机端 V1 真机门禁。该能力用于指导技术/管理先补真实 PostgreSQL / 对象存储、打印链路和司机真机门禁；它不返回原始运行时报告、产物路径、真实 env 值、命令值、密钥、证据编号、签字字段或本地路径，也不改变 `runtime readiness 5/11`、`发布门禁 0/4`、`现场证据 0/34`、`签字 0/6` 的 blocked 结论。

本轮 `上线状态` 还补了生产配置门禁汇总：API 读取 release-candidate `envPreflight` / `envFileAudit` 后只返回脱敏 `productionEnvGate`，页面新增 `生产配置门禁`，集中显示当前 `2/9` 通过、`5` 项阻塞、`2` 项警告、`env 文件审计：未执行`，并预览统一 V1 持久化 profile、附件对象存储、对账导出对象存储、系统打印 command_bridge、CUPS 队列预检这 5 个第一阶段阻塞。该能力用于指导现场先处理真实生产 env、PostgreSQL、对象存储、打印命令桥和 CUPS 配置；它不返回原始预检报告、原始 env 文件、env 文件路径、真实 env 值、命令值、密钥、原始行内容、产物路径或本地路径，也不改变 `发布门禁 0/4`、`runtime readiness 5/11`、`现场证据 0/34`、`签字 0/6` 的 blocked 结论。

## 分模块完成度

| 模块 | 需求确认度 | P0 原型 / 代码完成度 | V1 上线就绪度 | 当前状态 | 主要未完成项 |
| --- | ---: | ---: | ---: | --- | --- |
| 公共待办 | 98% | 91% | 62% | 列表、详情、稍后、处理、已处理、低风险批量动作、后端列表读取和 `待通知客户` 复制话术 / 人工确认已通知闭环已完成，并有浏览器验证。 | 后台提醒配置、真实多账号并发、生产待办数量压力验证、自动客户消息回调。 |
| 订单录入 / 识别 | 93% | 88% | 55% | 粘贴识别、表格编辑、拆行、定制印刷简写、库存 / 价格校验已有。 | 真实样本文本库、置信度评分、客户常用话术和 OCR / AI 后续接入。 |
| 订单池 / 订单管理 | 90% | 85% | 55% | 筛选、详情、作废、改量、跨模块定位、金额重算和 API 边界已有。 | 全部订单视图、真实大数据量性能、更多正式调整 / 售后联动。 |
| 库存查询 / 修正 / 流水 | 93% | 82% | 55% | 库存键、缺货、修正草稿、流水读取、PostgreSQL 边界已有。 | 实际库区命名、安全库存初始值、调整阈值、盘点现场流程。 |
| 出库 / 交付 | 97% | 85% | 55% | 自提、送货、快递快运、数量不符、无法出库、完成交付、作废重打生命周期已有。 | 针式单据打印机型号和基础规格已知为 `EPSON LQ-615KII`，默认设备 `PRN-DOT-A`；现场主机为 Windows 11，纸张为 `二联二等分` 连续针式纸，现有成品袋送货单照片样张已收到；仍需 Win11 系统打印机名称 / 驱动 / 端口、实测纸张尺寸、真实出纸对位、真实标签纸、库房手机端现场试用和多批次交付校准。 |
| 对账 / 收款 | 94% | 85% | 59% | 对账、收款、差额、核销、发送、回执、客户确认、附件、真实 `.xlsx` 导出、付款截图 / 客户确认附件类型和大小校验、附件对象存储运行时预检、附件 V1 留档门禁、HTTP 级对象存储 live 兼容检查和统一生产 profile 组合 live 校验已有；已修复 PostgreSQL 附件摘要对非默认对象存储 key 前缀的兼容问题。 | 客户最终确认 Excel 样式、真实 OSS/S3/COS bucket、真实微信 / 企业微信回调、自动聊天记录抓取、PDF / Office 在线预览。 |
| 打包 / 标签 | 92-94% | 85% | 54% | 包裹、标签、打印批次、包裹级打印确认、作废重打、机台排产队列移动 / 插队入口、移动原因、影响预览、备注留痕、车间端定制印刷成品图上传入口、办公室复核入口、待通知客户人工确认闭环、成品图上传类型 / 大小校验、附件对象存储运行时预检、附件 V1 留档门禁和 HTTP 级对象存储 live 兼容检查已有。 | 真实标签打印机、标签纸尺寸和防水/耐脏标签耗材测试、真实打印质量 QA、客户打包偏好沉淀、真机相机权限 / 现场照片质量验收、真实 OSS/S3/COS bucket、自动客户发送、完整排班/插单现场协同。 |
| 打印设备 / 打印作业 | 95% | 89% | 53% | 打印作业队列、驱动配置、`command_bridge`、spool 回读、状态轮询、non-printing spool 状态回读诊断、可选 CUPS `cups_lp` 提交模式、non-printing CUPS 队列预检、现场真实 CUPS 队列预检 runner、办公室端 CUPS 队列预检诊断面板、V1 上线就绪门禁、办公室端可见门禁面板、打印 V1 readiness 命令行 runner、ERP V1 总 readiness runner、打印联调包、设备现场 QA 记录、现场 QA 结构化证据摘要和办公室设备驱动模式维护入口已有；门禁能同时覆盖默认 blocked 和配置完整 ready 两种自动校验，runner 能对运行中 API 输出脱敏报告并用退出码区分 ready / API 错误 / blocked，现场 CUPS runner 可在打印机器上直接用真实 `lpstat` 类状态命令检查队列且不出纸；ERP 总 runner 还能合并 API、OpenAPI、权限、附件存储和打印门禁；办公室页面已能直接看到 9 项门禁、剩余风险，并可通过专用 `driver-mode` 接口把已准备好的设备从 `preview_only` 保存为 `system_printer`，且不会误覆盖纸张、DPI 或支持单据类型；现场 QA 现在要求 6 项检查和 5 项证据摘要同时完整才算设备 ready；`cups_lp` 提交成功仍只算 `sent`，CUPS 队列预检只证明状态命令可用，二者都不直接算 `printed`。 | 针式单据打印机型号和基础规格已知为 `EPSON LQ-615KII`，建议队列名 `epson_lq_615kii_notes`；现场主机为 Windows 11，纸张为 `二联二等分` 连续针式纸，现有成品袋送货单照片样张已收到；仍需真实标签机 / 该针式机硬件出纸、Win11 系统打印机名称 / 驱动 / 端口、厂商 SDK、物理打印状态协议、生产打印环境配置、现场真实队列预检、纸张对位、条码扫码和真实硬件现场 QA。 |
| 生产 / 车间报工 | 90-93% | 91% | 63% | 生产报工、跨日报数、办公室发布排产、第一版机台排产队列、同机台队列调序、跨机台移动 / 插入队列 API 与前端移动 / 插队入口、移动原因 / 影响预览 / 留痕备注、正式排产记录表边界、车间手机端定制印刷成品图拍照/选择上传、成品图上传类型 / 大小校验、附件对象存储运行时预检、附件 V1 留档门禁、办公室复核 / 退回重拍 / 待通知客户待办、客户通知话术复制 / 人工确认已通知、打包完成、生产 / 打包 API client、PostgreSQL 事务边界、日报数读取汇总、按已发布排产 / 当前机台 / 跨日未完成过滤车间任务池和生产报工产能校准样本已有；机器计数仍只作动作证据，发布排产、队列调序、移动机台、日报数、成品图上传 / 复核和客户通知确认均不入库不占用不生成打包。 | 完整排产执行、自动插单策略 / 换模工单、代班 / 倒班引擎、车间端稳定试用、真机相机权限 / 真实成品图质量验收、生产汇总单导入 / 对账、客户消息自动发送和真实现场机台产能校准验收。 |
| 排产 / 生产看板 | 93% | 79% | 47% | 排产和看板业务规则确认度高，已有原型和需求基础；办公室已能从 `打包/标签` 页发布待排产生产任务，生成 `publishedScheduleId` 后车间同机台任务池可见，并能通过 `GET /api/production-schedules/machine-queue` 和页面 `机台排产队列` 查看按机台分组的队列；同机台 `上移 / 下移` 已接后端调序记录、操作日志和 `production_schedule_records` PostgreSQL 表边界，跨机台移动 / 插入目标队列已接 `POST /api/production-schedules/machine-queue/move`、生产任务机台更新、源记录 `moved`、目标记录 `active`、页面 `目标机台 / 位置 / 原因 / 移动/插队`、影响预览和备注留痕。 | 完整自动插单策略、换模工单、车间端 / 大屏联动、产能估算、代班 / 倒班规则和真实看板验证。 |
| 司机端送货 | 97% | 80% | 42% | 装车核包、水印证据、送达复核、现场验收、送达 / 签收照片类型和大小校验、附件对象存储运行时预检、附件 V1 留档门禁、原生扫码 / 原生导航桥接合同和联调包、`GET /api/driver/v1-readiness` 司机端 V1 真机门禁、总 readiness runner 独立司机验收账号检查、`上线状态` 页 `司机真机预检` 明细诊断已有；门禁要求送货任务可读、最新现场验收记录、6 项现场检查全通过、原生扫码 / 原生导航 2/2 可用、纸质包裹标签原生扫码样本匹配，默认普通浏览器会 blocked。 | 真实 Android / iOS 原生壳、真机权限、物理标签扫码、地图 SDK、路线优化、现场水印照片质量验收和司机手机现场 QA。 |
| 客户 / 价格表 / 基础资料 | 90-93% | 98% | 70% | 需求、字段、权限、seed、部分价格快照能力、第一版 `.xlsx` 导入模板、上传预检查、外部 Excel 第一层兼容、Excel 日期序列号归一化、导入确认队列草稿、导入确认计划、确认计划 API、执行记录 API、权限拦截、操作日志、本地 JSON 持久化、主数据复核 PostgreSQL 仓储、导入 payload、员工机台主数据迁移草案、显式事务 writer、正式导入 UI、失败行 CSV 下载、失败行修正草稿再导入入口、失败行页面内联字段修正、独立基础资料维护页、`MDM-*` 非写入维护草稿、员工账号复核启用、临时密码发放、动态员工登录、首次登录强制改密 API 边界、V1 密码策略、连续失败登录锁定、90 天正式密码过期、管理端重发 / 撤销密码可视化入口、管理员重置 / 撤销导入员工密码、运行期 session 失效边界、运行期账号 / token 吊销持久化仓储、本地回滚校验、PostgreSQL Docker live 写入验证和统一生产 profile 组合 live 校验已有。 | 更多真实 Excel 样本兼容、真实数据导入现场验收、生产身份部署和真实账号运维验收。 |
| 原材料 / 成本 / 毛利 | 98% | 87% | 60% | 成本公式、材料毛利口径、原材料标签 / 领料规则确认较多；已用真实布料/无纺布原材料送货单/销货单样张确认原材料厂家随货单据拍照、OCR 预填、客服/办公室复核、一卷一标、贴标后手机扫码/上传签单信息才算可用入库的第一版闭环，且已明确该单据不关联我厂成品袋出库/客户送货单；已确认编号分两层：供应商原始单号有则录、无则空，用于外部对账，ERP 原材料入库单号和卷/件号必须生成，用于内部查询、贴标、库存、领料和成本追溯；原材料标签机尚未采购，因原材料会放在院子里，标签采购和模板必须按防水、耐潮、耐脏、室外短期可读约束；已补 `原材料` 主导航、原材料入库前端页面、后端 API client、`rawMaterialInboundRepository`、`raw_material_inbounds` PostgreSQL payload 表、OpenAPI、权限和 V1 持久化门禁，页面优先显示 `后端 API 已同步`，动作覆盖待复核、打印卷标、部分贴标、卷/件级贴标确认、异常标记、供应商对账摘要、成本字段权限隐藏和“打印不等于可用库存”的后端可验证闭环；已补第一版 `机边领料`，只有已贴标扫码并处于 `可用` 的卷/件能生成 `RMI-ISS-*` 记录，整卷/整件进入 `机边领用`，按重量拆卷部分领料会生成 `RMI-SPLIT-*`、保留原卷剩余可用重量并创建机边子卷，记录机台、可选生产任务、用途、领料人和时间，并已补第一版生产任务匹配校验：任务不存在、机台不一致、袋体原料颜色与订单袋色明显不一致会阻断，未填任务时明确标记未关联，办公室无权限，库房 / 打包或杂工 / 管理可执行，部分件数拆件仍会阻断；该动作不生成成品数量、不把机台计数当合格产量，也不做成本分摊或毛利计算；已补第一版 `确认消耗` 和 `余料退回`，只有 `机边领用` 的卷/件能生成 `RMI-CONS-*` 或 `RMI-RET-*`，整卷/整件消耗进入 `已消耗`，按重量部分消耗保留机边剩余重量并标记 `部分消耗/机边`，余料退回进入 `余料待复核` 且不自动恢复可用库存，三者仍不生成成品数量、成本分摊或毛利；已补第一版 `复核余料可用`，仅 `余料待复核` 卷/件可生成 `RMI-LREV-*`，记录复核重量/件数和库位后转回 `可用`，但仍不生成成品数量、成本分摊或毛利；已补第一版 `生成成本草稿`、`确认成本草稿`、`校准损耗`、`生成毛利快照` 和 `复核毛利快照`，仅财务 / 管理可对已确认消耗且已匹配生产任务的记录生成 `RMCA-*` 草稿，复核后生成 `RMCC-*` 成本确认记录，再生成 `RMCL-*` 损耗校准记录、`RMMG-*` 订单毛利快照和 `RMMR-*` 内部毛利报表；报表要求订单销售金额完整，复核后把相关成本草稿、成本确认、损耗校准、领料、消耗、毛利快照和入库摘要推进到 `毛利已复核/报表可用` / `已财务复核/报表可用`，并固定 `reviewed_margin_report_snapshot`，但仍不写客户对账、不登记收款或最终客户结算、不把机台计数当合格产量；已补第一版供应商月结 Excel 导入预检适配器和办公室上传入口，支持白侯 `重1-重5` 拆卷、白侯纸管 / 退货 / 欠款 footer 调整项、北陈 `批号` 强匹配、北陈分段退货和通用字段归一化；白侯纸管扣项已补默认 `3.5 元/件` 结构化规则，预检结果保留调整类型、规则、件数、计算金额、供应商原金额、是否本期计入，并对混合退货 / 纸管 footer 加人工拆分 warning；已补供应商月结复核草稿仓储、API、页面列表和 V1 持久化门禁，预检结果可保存并标记人工复核；已补正式对账确认留痕、财务应付草稿和供应商付款确认第一版，只有 `已人工复核/一致` 草稿可生成 `RMSRC-*` 对账确认号，只有财务 / 管理账号能从已确认对账生成 `RMSP-*` 应付草稿并确认 `RMSPAY-*` 付款，付款金额 V1 第一版必须等于应付草稿金额；本期调整项计入草稿金额，历史欠款只作参考；无供应商单号时只产生候选匹配，不自动确认成本或付款。 | 真实 OCR 接入、真实防水标签纸/标签机、真实批次、手机扫码贴标/签单上传现场验收、真实机边扫码/领料现场确认、更多供应商对账 Excel 样张、完整供应商扣项规则维护后台、多笔/部分付款和应付账龄、毛利经营分析深化、最终财务结算联动。 |
| 售后 / 责任 / 绩效扣款 | 91% | 30% | 18% | 售后、责任线索、不自动扣款的业务规则已确认。 | 售后页面、责任分摊、绩效扣款权限、报表和工资模块联动。 |
| 工资 / 考勤 / 人事 | 65% | 20% | 10% | 工资结构、打卡导入方向、异常处理方向已确认。 | 现有工资表、得力打卡机导出格式、岗位补贴表、绩效 / 扣款表、工资草稿页面。 |
| 自动化 / 企微 / 客户群 | 82% | 15% | 5% | V1 明确冻结为人工，自动化作为后续版本方向。 | 企业微信会话存档、客户授权、发送代理、风控、试点客户和自动化安全策略。 |

## 当前判断

办公室六个核心页最接近 P0 完成：

1. 公共待办
2. 订单录入 / 识别
3. 订单池
4. 库存查询
5. 出库 / 交付
6. 对账 / 收款

这些模块已经能支撑主要演示和业务流程验收，但距离真实上线还差真实数据、真实设备、生产环境和现场 QA。

## 推荐下一步优先级

| 优先级 | 方向 | 原因 |
| --- | --- | --- |
| P0-A | 生产级持久化 / 部署门禁 | 当前默认本地总 readiness 仍为 `5/11 通过`；统一 V1 profile 已覆盖 31 个 PostgreSQL 仓储默认项和 2 个对象存储默认项，系统持久化 readiness 检查 33 个持久化对象。正式订单确认 / 草稿同事务、核心启动快照、空库无 seed、旧版本回滚、API 重启和双会话已通过 PostgreSQL 16 live。下一步直接使用真实 PostgreSQL / 恢复验证库 / OSS/S3/COS 完成迁移、备份恢复、对象存储治理和远端恢复，再进入真实 CUPS / 打印机与司机手机验收。 |
| P0-A | 真实打印设备链路 | 出库、标签、打包、交付都依赖打印，当前最大上线风险在物理打印和状态回读。 |
| P0-A | 司机端真机 / 原生壳验证 | Web 端合同已基本成型，但真实扫码、导航、权限和水印拍照必须用司机手机验收。 |
| P0-A | 生产 / 打包真实任务池 | 办公室订单到出库已经较顺，下一块瓶颈是车间报工、打包和包裹闭环。 |
| P0-B | 主数据确认导入 / 落库 | 模板、预检查、第一轮外部 Excel 兼容、日期序列号归一化、确认队列草稿、确认计划 API、执行记录 API、导入 payload、员工机台表草案、显式事务 writer、正式导入 UI、失败行下载、失败行修正草稿再导入入口、失败行页面内联字段修正、独立基础资料维护页、`MDM-*` 非写入维护草稿、员工账号复核启用、临时密码发放、动态员工登录、首次登录强制改密 API 边界、V1 密码策略、连续失败登录锁定、90 天正式密码过期、管理端重发 / 撤销密码可视化入口、管理员重置 / 撤销导入员工密码、运行期身份持久化、本地回滚校验和 PostgreSQL live 写入验证已能形成第一版安全写入边界；下一步要补更多真实 Excel 样本兼容、真实数据导入验收和生产身份部署验收。 |
| P0-B | 原材料入库贴标 / 供应商对账原型 | 已有真实布料原材料送货单/销货单样张和第一版流程确认，且已补原材料入库前端页面、后端 API、local_json / PostgreSQL payload 持久化、卷/件级贴标状态、供应商对账摘要、供应商月结 Excel 导入预检、白侯纸管扣项 `3.5 元/件` 结构化规则、人工复核草稿、正式对账确认留痕、财务应付草稿、供应商付款确认第一版、原材料成本分摊草稿、成本确认、损耗校准、订单毛利快照和毛利快照财务复核 / 内部毛利报表第一版以及 V1 持久化门禁；下一步应接真实 OCR、真实标签纸 / 标签机、手机扫码签单现场验收、更多供应商对账样张、完整扣项规则维护、真实机边扫码/领料现场确认、多笔/部分付款、毛利经营分析深化和最终财务结算联动，而不是直接跳到完整自动毛利，也不能套用成品袋出库送货单流程。 |
| P0-B | 客户确认 Excel 版式和真实对象存储 | 对账已经能导出 `.xlsx`，对象存储协议检查已覆盖本地 HTTP 兼容端点，但客户最终样式和真实 OSS/S3/COS 留档还没完成。 |

## 更新规则

- 每完成一轮代码更新，若模块状态变化明显，同步更新本表。
- 百分比只在有代码、测试、浏览器截图、API / PostgreSQL 校验或真实设备验证支撑时上调。
- 原型完成度不等于上线就绪度；真实设备和现场 QA 未完成时，上线就绪度不能用页面完成度替代。
