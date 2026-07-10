# 数据库迁移 runner 说明

最后更新：2026-07-08

## 定位

本文件说明当前第一批 PostgreSQL 迁移草案如何从 SQL 文件进入可执行流程。当前项目还没有正式共享数据库连接，因此默认仍可跑 dry-run；同时已提供 Docker 临时 PostgreSQL live 检查，用于确认迁移、第一批附件仓储 SQL、订单确认事务 SQL、订单确认库存占用 / 流水 SQL、库存占用释放事务 SQL、订单明细作废事务 SQL、订单明细改量事务 SQL、出库动作事务 SQL、完成出库库存扣减 / 占用释放 / 出库流水 SQL、出库取消 / 回滚释放 SQL、司机任务读取和派单路线 SQL、生产排产记录调序 / 跨机台移动 SQL、主数据导入复核仓储 SQL、付款记录仓储 SQL、收款登记事务 SQL、差额 / 核销结算事务 SQL、标记发送 / 发送回执 / 客户确认事务 SQL 和对账预览明细 / 导出文件仓储 SQL 能在真实 PostgreSQL 上执行。

## 相关文件

- `db/migrations/`：第一批迁移 SQL 草案。
- `scripts/dbMigrationUtils.mjs`：迁移文件读取、顺序校验、核心表覆盖校验、用户身份 / token 吊销、附件 / 订单 / 库存 / 待办关键列校验和 checksum 计算。
- `scripts/check-db-migrations.mjs`：只校验迁移文件，不连接数据库。
- `scripts/run-db-migrations.mjs`：迁移 dry-run / apply runner，支持 `--env-file <secure-env-file>`，按 `ERP_V1_DATABASE_URL` / `DATABASE_URL` / `PGURL` 优先级读取连接串。
- `scripts/check-db-migration-runner.mjs`：校验迁移 runner 的安全 env 文件读取、连接串来源优先级、dry-run 不连接数据库和输出脱敏。
- `scripts/check-postgres-live.mjs`：启动临时 Docker PostgreSQL，执行迁移并验证附件仓储 / 访问审计仓储 / 订单确认事务仓储 / 订单确认库存占用和流水 / 司机任务读取仓储 / 司机派单路线查回 / 生产排产记录调序与跨机台移动 / 主数据导入复核仓储 / 库存占用释放事务 / 订单明细作废事务 / 订单明细改量事务 / 出库动作事务仓储 / 完成出库库存扣减 / 占用释放 / 出库流水 / 出库取消 / 回滚释放 / 付款记录仓储 / 收款登记事务仓储 / 差额核销事务仓储 / 发送 / 回执 / 客户确认事务仓储 / 导出文件仓储 / API 附件路径 / API 订单确认路径 / API 司机任务列表与详情读取 / API 库存占用释放路径 / API 订单明细作废路径 / API 订单明细改量路径 / API 出库完成路径 / API 出库取消路径 / API 对账预览导出、导出下载、导出列表路径 / API 付款登记路径 / API 差额处理路径 / API 核销路径 / API 标记发送路径 / API 发送回执路径 / API 客户确认路径。

## 命令

| 命令 | 说明 |
|---|---|
| `npm run db:check` | 校验迁移文件顺序、核心表覆盖、附件 / 订单 / 库存 / 待办关键列和无破坏性 `DROP TABLE` |
| `npm run db:migrate-runner:check` | 校验迁移 runner 支持安全 env 文件、`ERP_V1_DATABASE_URL` 优先级、dry-run 隔离和连接错误脱敏 |
| `npm run db:migrate:dry` | 输出迁移执行计划和 checksum，不连接数据库 |
| `npm run db:postgres-live:check` | 使用临时 Docker `postgres:16-alpine` 执行迁移，并验证附件仓储、访问审计仓储、订单确认事务仓储、订单确认库存占用 / 流水、司机任务读取仓储、司机派单路线查回、生产排产记录调序与跨机台移动、主数据导入复核仓储、库存占用释放事务、订单明细作废事务、订单明细改量事务、出库动作事务仓储、完成出库库存扣减 / 占用释放 / 出库流水、出库取消 / 回滚释放、付款记录仓储、收款登记事务仓储、差额核销事务仓储、发送 / 回执 / 客户确认事务仓储、对账预览明细 / 导出文件仓储、API 附件路径、API 订单确认、API 司机任务列表与详情读取、API 库存占用释放、API 订单明细作废、API 订单明细改量、API 出库完成、API 出库取消、API 对账预览明细、导出下载、导出列表、付款登记、差额处理、核销、标记发送、发送回执和客户确认路径真实写入查询 |
| `node -- scripts/run-db-migrations.mjs --env-file <secure-env-file> --apply` | 从安全 env 文件读取 `ERP_V1_DATABASE_URL` / `DATABASE_URL` / `PGURL`，使用本机 `psql` 执行未执行过的迁移 |

## 执行机制

- 迁移按文件名前缀顺序执行，例如 `0001_*`、`0002_*`。
- 校验脚本会检查核心表是否存在，并额外检查用户身份 / token 吊销、附件正式化、订单确认、库存占用 / 流水、出库打印 / 异常、司机派单路线和待办所需关键列，例如 `password_hash`、`session_version`、`seed_session_revocations.jti`、`storage_provider`、`storage_key`、`content_digest`、`thumbnail_storage_key`、`signed_url_expires_at`、`owner_type`、`owner_id`、`reserved_qty`、`qty_before`、`qty_after`、`template_id`、`print_action`、`exception_type`、`route_date`、`route_batch_no`、`stop_sequence`、`dispatch_status`、`todo_id`、`ref_type` 和 `ref_id`。
- 真实执行时会先从安全 env 文件和当前环境叠加读取数据库连接；连接串优先级为 `ERP_V1_DATABASE_URL`、`DATABASE_URL`、`PGURL`，未替换模板占位值会视为未配置。
- 真实执行时会先创建 `schema_migrations` 表。
- 每个未执行迁移会包在一个事务内执行。
- 执行成功后写入 `schema_migrations(id, filename, checksum, applied_at)`。
- 如果同一个迁移 ID 已执行但当前 SQL checksum 变化，脚本会拒绝继续，避免历史迁移被静默改写。
- 当前 runner 依赖本机 `psql` 命令，不新增 npm 数据库依赖；如生产机 `psql` 不在默认 PATH，可用 `--psql-command <path>` 指定。
- runner 输出只显示连接串来源变量名和迁移 ID，不打印数据库 URL、密码、host 或原始 `psql` stderr。
- `db:postgres-live:check` 不依赖宿主机 `psql`，它使用 Docker 容器内的 `psql`。脚本结束后会删除临时容器和临时附件目录。
- live 检查会插入最小 seed 用户、客户、打印模板、标准色、库存项、订单、订单明细、出库记录、司机派单记录和对账单，满足 `attachments.uploaded_by`、`attachment_access_logs.operator_id`、`print_records.template_id`、`fulfillment_exceptions.fulfillment_id`、`driver_delivery_dispatches.fulfillment_id`、`driver_delivery_dispatches.driver_id`、`driver_delivery_dispatches.assigned_by`、`inventory_items.standard_color_id`、`inventory_reservations.inventory_item_id`、`inventory_ledger_entries.inventory_item_id`、`original_orders.customer_id`、`order_lines.order_id`、`fulfillment_records.order_line_id`、`payment_records.statement_id`、`payment_records.customer_id` 和 `payment_records.registered_by` 外键。
- live 检查会覆盖 `POST /api/attachments`、`GET /api/attachments`、附件内容读取、短期 access-url 生成、access-log 查询、`GET /api/driver/delivery-tasks`、`GET /api/driver/delivery-tasks/{fulfillmentId}`、`POST /api/order-drafts/{draftId}/confirm`、`POST /api/inventory/reservations/{reservationId}/release`、`POST /api/order-lines/{orderLineId}/void`、`POST /api/order-lines/{orderLineId}/quantity-adjustment`、`POST /api/fulfillments/{fulfillmentId}/complete`、`POST /api/fulfillments/{fulfillmentId}/cancel`、`POST /api/statements/{statementId}/preview`、`GET /api/statements/{statementId}/exports`、`GET /api/statements/{statementId}/exports/{downloadToken}`、`/mark-sent`、`/send-receipt`、`/customer-confirmation`、`/payments`、`/variance` 和 `/write-off` 在 PostgreSQL 仓储下的执行路径；司机任务读取会验证 `driver_delivery_dispatches` 的 `driver_id`、`route_date`、`route_batch_no`、`stop_sequence` 等路线字段可从直接仓储和 API 详情查回；订单确认会验证 `original_orders`、`order_lines`、`price_snapshots`、`fulfillment_records`、`inventory_reservations`、`inventory_ledger_entries`、缺货 `todos` 和 `operation_logs` 写入，并验证 `inventory_items.reserved_qty` 更新；库存占用释放会验证 `inventory_reservations.reserved_qty/status`、`inventory_items.reserved_qty`、释放流水和操作日志；订单明细作废会验证 `order_lines.line_status/void_reason`、`fulfillment_records.status`、`inventory_reservations.status/reserved_qty`、`inventory_items.reserved_qty`、库存释放流水、`order_line_change_records` 和操作日志；订单明细改量会验证 `order_lines.original_qty`、`fulfillment_records.expected_qty`、`inventory_reservations.reserved_qty/status`、`inventory_items.reserved_qty`、库存改量流水、`order_line_change_records` 和操作日志；出库动作会验证 `fulfillment_records` 状态更新、`print_records`、`fulfillment_exceptions`、异常 `todos` 和 `operation_logs` 写入；完成出库还会验证 `inventory_items.on_hand_qty / reserved_qty` 变化、`inventory_reservations` 标记 `已出库` 和 `inventory_ledger_entries.source_type=fulfillment_complete` 的出库流水；取消出库会验证 `fulfillment_records.status=已取消`、`inventory_reservations.reserved_qty/status`、`inventory_items.reserved_qty` 回滚、`inventory_ledger_entries.source_type=fulfillment_cancel` 和操作日志；导出预览会验证 `statement_lines`、`statement_export_files` 元数据和文件内容写入，导出列表只返回元数据和存储摘要，下载路由优先读取文件存储并保留数据库 workbook 兜底；标记发送会验证 `statements.last_sent_at` 更新、`statement_send_records` 插入和 `operation_logs` 插入，发送回执会验证 `statement_send_records.receipt_status / receipt_at / receipt_by / receipt_note` 更新和操作日志插入，客户确认会验证 `statements` 状态更新、发送回执升级为 `confirmed`、`statement_confirmation_records` 插入和操作日志插入；付款登记会验证 `statements` 更新、`payment_records` 插入、差额 `todos` 插入和 `operation_logs` 插入；差额处理会验证 `variance_records` 插入、对账单状态更新和操作日志；核销 / 确认欠款会验证对账单状态和操作日志。

## 当前边界

- 已有 Docker 临时 PostgreSQL live 检查，但还没有共享测试库 / 生产库凭证。
- 还没有回滚迁移；第一批迁移仍以 additive draft 为主，正式回滚策略需要选定后端栈后补。
- 除附件元数据、附件访问审计、订单确认核心记录、订单确认库存占用 / 流水 / 缺货待办、司机任务读取 / 派单路线查回、生产排产记录调序 / 跨机台移动、主数据导入复核、库存占用释放、订单明细作废、订单明细改量、出库动作第一轮、完成出库库存扣减 / 占用释放 / 出库流水、出库取消 / 回滚释放、付款记录、收款登记事务、差额处理事务、核销事务、标记发送 / 发送回执 / 客户确认事务和对账预览明细 / 导出文件事务外，大部分 API 写入动作还没有接到数据库事务。

## 下一步

1. 继续保留 `npm run db:postgres-live:check` 作为本地 PostgreSQL smoke gate。
2. 准备共享测试 / 生产 PostgreSQL，把 `ERP_V1_DATABASE_URL` 写入安全未跟踪 env 文件，先跑 env 文件审计和生产 env 预检，再跑 `node -- scripts/run-db-migrations.mjs --env-file <secure-env-file> --apply`。
3. 继续把办公室创建 / 编辑派单 API、无 reservation 旧单扣减策略、生产 / 打包库存流转和剩余待办写入 API 分批接到 PostgreSQL 事务。
4. 补正式回滚策略、数据备份和迁移发布流程。
