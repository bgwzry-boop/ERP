# 客户下单小程序接入 ERP 实施清单

## 1. 当前结论

下单小程序当前是交互原型、微信小程序页面骨架和 Mock API，不会写入 ERP。它适合作为已开放老客户的结构化下单入口；未开放客户继续通过微信群下单。

两种渠道最终都进入办公室 A/B 的公共待办和订单草稿，但必须分别保存来源、原始内容、提交身份、时间、外部编号和行级证据。系统不得因为客户、日期、规格或数量相似而静默合并跨渠道订单。

本方案不阻塞原材料一期的本地现场试跑。小程序正式开放属于后续独立上线范围。

### 2026-07-20 实施状态

- 已新增`db/migrations/0030_miniapp_order_intake.sql`，固化客户渠道绑定、短会话、来源信封、行级映射和非权威快照的数据边界。
- 已新增独立`server/miniapp/`服务骨架，完成签名短会话、绑定客户范围、服务端重新核价/查库存、请求摘要、幂等草稿接单和客户订单隔离。
- `scripts/check-miniapp-bff.mjs`已覆盖未绑定拒绝、跨客户404、客户端客户号/价格不可信、同键重放、同键异载荷409，以及“只建草稿、不建正式订单”。
- 已补参数化 PostgreSQL 仓库，把来源信封、明细、非权威快照、ERP 草稿和公共待办放入同一事务；生产运行时拒绝内存仓库。
- 已新增客户范围 ERP 投影：从`customers.price_table_id → active price_tables → price_table_items`生成小程序目录和服务端报价，从`standard_colors / size_specs`约束可选主数据，从`inventory_items`内部可用量只投影`库存充足 / 库存需确认 / 暂时缺货`。客户端提交的客户号、单价、金额和库存快照不会覆盖服务端结果；客户没有有效价表或价目时失败关闭。
- 已新增生产启动入口`npm run miniapp-api:production`及隔离 PostgreSQL 全链路检查`npm run miniapp-postgres-live:check`。当前 Docker 服务和真实 PostgreSQL 连接均未提供，因此 live 脚本尚未实际通过；正式微信凭据、已审核真实客户绑定、价表/颜色/库存主数据、稿件对象存储和未实现接口仍待接入。因此客户端继续保持`apiMode: mock`。

配套文件：

- [可交互架构图](../architecture/miniapp-erp-intake-architecture.html)
- [架构图源数据](../architecture/miniapp-erp-intake.architecture.json)
- [小程序 API 契约草案](../../../下单小程序/docs/miniapp-api-contract.zh-CN.md)
- [ERP 订单草稿与订单表](../../db/migrations/0003_orders_inventory_fulfillment.sql)
- [ERP 客户、规格、颜色与价格主数据](../../db/migrations/0002_customers_master_data.sql)

## 2. 系统边界

### 2.1 小程序客户端

只负责客户操作体验：快速复购、选品、填写数量与交付要求、上传印刷稿、查看预估结果和公开订单状态。

客户端不得成为以下事实的权威来源：

- 客户身份和 ERP 客户编号；
- 客户价格表、最终单价和成交金额；
- 精确库存、占用量、库位和库存可信度；
- 正式交期、生产任务、内部异常归责；
- 文件真实存储路径和对象存储凭据；
- ERP 权限、员工、机台、待办和审计信息。

### 2.2 Miniapp API / BFF

小程序不直接访问 ERP 办公室内部接口。独立 BFF 负责：

- 使用微信临时 code 建立短期会话；
- 把 OpenID / UnionID 映射到已审核 ERP 客户；
- 限制客户只能读取自己的目录、价格投影和订单；
- 对写请求执行字段白名单、幂等键和请求摘要校验；
- 申请短期文件上传凭证；
- 调用 ERP 接单适配器，而不是直接写订单表；
- 把内部状态映射为有限的客户可见状态。

### 2.3 ERP 接单适配器

接单适配器统一处理小程序和微信群两种来源，但不抹平来源差异：

1. 校验来源身份、外部提交号、幂等键和请求摘要。
2. 把客户端 ID 映射到 ERP 主数据，并保留客户当时看到的名称快照。
3. 由服务端重新计算价格、库存和交期，不信任客户端金额。
4. 原子写入来源信封、行级来源、报价/库存快照和订单草稿。
5. 在办公室公共待办创建“待复核”任务。
6. 只有办公室 A/B 完成复核，才调用正式订单命令服务。

## 3. 建议新增的数据结构

名称可在正式迁移设计时调整，以下结构表达必须保留的业务语义。

### 3.1 `customer_channel_bindings`

用于绑定微信身份与 ERP 客户，不允许客户端自行提交 `customer_id`。

建议字段：

| 字段 | 用途 |
| --- | --- |
| `id` | 绑定记录 ID |
| `channel` | `wechat_mini_program` 等固定渠道 |
| `external_subject_fingerprint` | 外部身份唯一指纹，用于唯一性检查 |
| `external_subject_ciphertext` | 受控保存的 OpenID / UnionID 映射信息 |
| `customer_id` | 绑定后的 ERP 客户 |
| `status` | `pending / active / revoked` |
| `verified_by / verified_at` | 审核绑定的操作人和时间 |
| `revoked_by / revoked_at / reason` | 撤销证据 |
| `revision` | 并发版本 |

### 3.2 `order_intake_submissions`

每次外部接单保存一个不可静默改写的来源信封。

建议字段：

| 字段 | 用途 |
| --- | --- |
| `id` | ERP 接单记录 ID |
| `source_channel` | `mini_program / wechat_group / manual` |
| `binding_id` | 小程序客户绑定；微信群来源可为空 |
| `external_submission_id` | 渠道侧稳定提交号 |
| `idempotency_scope / idempotency_key` | 防止重试重复建单 |
| `request_hash` | 同一幂等键下内容变化时拒绝写入 |
| `raw_payload_json` | 原始结构化提交或消息组快照 |
| `customer_id` | 服务端解析或绑定后的客户 |
| `status` | `received / rejected / draft_created / confirmed` |
| `draft_id` | 对应 ERP 订单草稿 |
| `received_at / processed_at` | 接收与处理时间 |
| `rejection_code / rejection_detail` | 失败原因 |
| `revision` | 并发版本 |

唯一性至少覆盖：

- `source_channel + binding_id + external_submission_id`；
- `idempotency_scope + idempotency_key`；
- 同一幂等键必须同时匹配相同 `request_hash`。

### 3.3 `order_intake_lines`

保存客户端行与 ERP 草稿行的一一映射，避免多规格订单失去来源。

建议字段包括：`submission_id`、`client_line_id`、`line_seq`、产品/规格/颜色/提手的外部 ID、映射后的 ERP 主数据 ID、客户可见名称快照、原始行 JSON、`draft_line_id` 和映射状态。

### 3.4 `order_intake_snapshots`

保存客户提交时看到的事实，不把它们误当成正式成交事实：

- `quote_snapshot_json`；
- `inventory_snapshot_json`；
- `price_version`；
- `authoritative=false`；
- 客户期望日期与时间；
- 地址和包装偏好快照；
- 服务端收到请求的时间。

正式订单确认时继续使用现有 `price_snapshots` 保存服务端最终价格，两类快照不得混为同一含义。

### 3.5 文件归属记录

印刷稿件至少保存：当前客户绑定、用途、文件摘要、对象键、MIME、字节数、扫描状态、上传时间、短期凭证到期时间、是否已被某个提交消费。一个稿件 token 不得跨客户或被多个正式订单静默重复消费。

## 4. 小程序字段到 ERP 的映射

| 小程序语义 | ERP 目标 | 处理规则 |
| --- | --- | --- |
| 微信客户身份 | `customer_channel_bindings → customers` | 服务端绑定，客户端不得指定其他客户 |
| `clientLineId` | `order_intake_lines.client_line_id` | 在一个提交内唯一，并映射到草稿行 |
| `productType` | 产品主数据 + `order_type` | 客户文案和内部编码分开保存 |
| `size / colorId / handleId` | 规格、颜色、提手主数据 | 保存稳定 ID，同时保存提交时名称快照 |
| `bagSeriesId` | 仅客户端选品元数据 | 不作为 ERP 正式订单必填业务分类 |
| `quantity` | 草稿行数量 | 服务端校验整数、最小量与业务范围 |
| `desiredDate / desiredTime` | 客户期望时间 | 不直接等同于工厂承诺交期 |
| `deliveryMethod / addressId` | 交付方式与地址快照 | 下单时冻结快照，不能只引用可变地址 |
| `packagingPreference` | 订单交付/包装要求 | 结构化保存，必要时进入生产与打包任务 |
| `artworkToken` | 文件归属记录 | 校验客户、用途、摘要、状态和消费关系 |
| 印刷内容、色数、面、位置 | 草稿行印刷结构 | 补齐现有订单行缺少的结构化字段 |
| `specialRequirements` | 特殊工艺明细 | 使用服务端允许值，禁止任意客户端枚举 |
| 客户预估金额 | 接单快照 | 只作审计，正式订单必须服务端重新核价 |
| 客户库存状态 | 接单快照 | 只保存简化状态，提交时再次核验 |

## 5. 状态与办公室流转

### 5.1 接单状态

建议流程：

`received → validating → draft_created → office_review → confirmed / returned / rejected`

- `draft_created` 只表示已形成 ERP 草稿，不代表工厂接受价格和交期。
- `confirmed` 必须由办公室复核命令产生，并受到幂等、版本和当前状态门禁保护。
- `returned` 保留原提交和退回原因，客户补充资料时创建新版本或明确关联的新提交，不能覆盖历史证据。

### 5.2 客户可见状态

客户只看到：`工厂确认中 / 待补充资料 / 备货中 / 生产中 / 待发货或待自提 / 运输中 / 已完成 / 已取消`。

公开状态是 ERP 内部节点的读取投影，不向客户返回内部责任人、机台、库位、成本、异常归责和操作日志。

### 5.3 跨渠道重复提示

系统可以按客户、相近时间、规格、数量和交付要求生成“疑似重复”提示，但不得自动合并。办公室必须看到两个来源信封和各自原始证据，并明确选择：保留两单、关联但不合并、取消其中一单或按正式变更流程处理。

## 6. 分阶段实施

### P0：客户测试前必须完成

1. 客户渠道绑定表与审核/撤销流程。
2. Miniapp API / BFF 的会话、客户范围授权和字段白名单。
3. 来源信封、行级来源、幂等键、请求哈希和原始提交持久化。
4. 服务端价格、库存和交期二次计算。
5. 接单适配器写入订单草稿与办公室公共待办。
6. 办公室复核后一次性创建正式订单，并防止重复确认。
7. 客户订单读取投影和内部状态到公开状态的映射。
8. 稿件短期上传凭证、私有对象存储、类型/摘要/归属/消费校验。

当前代码已完成第 2、3、5 项的独立 BFF / 事务边界，并完成第 4 项中的客户价表、基础印刷/提手规则与简化库存投影；第 1 项只有数据表和登录绑定读取，尚缺运营端审核/撤销页面与真实绑定数据。第 4 项的正式交期计算、第 6 至 8 项仍未完成。任何一项未完成时均不开放真实客户写入。

### P1：小范围老客户试用

1. 客户默认地址、交付方式、包装偏好和常用印刷设置。
2. 历史订单复购预览，并强制使用当前价格和库存重新核验。
3. 微信订阅消息授权、模板、失败记录和重试。
4. 公告版本、有效期和同版本只自动弹一次。
5. 疑似跨渠道重复提示与办公室人工处置。
6. 小米、华为真实手机上的字体、对比度、弱网、重复点击和中途恢复验证。

### P2：扩大开放范围

1. 特殊尺寸正式销售定价规则和核价结果回传。
2. 覆膜特殊尺寸能力。
3. 客户分组开放、灰度开关、回滚与服务监控。
4. 运营指标：提交成功率、人工退回率、重复提示率、核价耗时和客户补充资料耗时。

## 7. 验收门禁

客户测试前至少通过以下场景：

1. 同一客户重复点击提交，只产生一个接单记录和一个订单草稿。
2. 同一幂等键提交不同内容，服务端拒绝且不产生部分写入。
3. 未绑定客户不能下单；客户 A 不能读取或引用客户 B 的地址、订单和稿件。
4. 修改客户端金额、库存状态或价格版本不能改变服务端最终计算。
5. 一个多规格提交的每一行都能追溯到 `clientLineId` 和原始提交。
6. 微信群订单与小程序订单相似时只产生提示，不自动合并。
7. 办公室 A/B 同时复核时，第一个有效确认生效，过期版本必须刷新。
8. 稿件 token 跨客户、过期、类型不符、摘要不符或重复消费时失败关闭。
9. 客户状态投影不泄露内部库存量、成本、员工、机台、库位、待办或审计。
10. PostgreSQL 或对象存储不可用时，不得向客户或办公室声称提交成功。

## 8. 部署依赖

本地原型和接口设计不需要立即采购云资源；正式向客户开放时需要：

- 企业云账号与生产服务器；
- 域名、备案和 HTTPS；
- PostgreSQL；
- 私有对象存储；
- 正式微信小程序 AppID、服务器域名配置和订阅消息模板；
- 生产密钥管理、备份、监控、告警和恢复演练。

标签打印机不属于小程序接单链路，可以继续单独处理。

Miniapp BFF 生产启动至少需要：`MINIAPP_DATABASE_URL`（也可复用`ERP_V1_DATABASE_URL` / `DATABASE_URL` / `PGURL`之一）、`MINIAPP_SESSION_SECRET`、`MINIAPP_IDENTITY_PEPPER`、`WECHAT_MINIAPP_APP_ID`和`WECHAT_MINIAPP_APP_SECRET`。两个本地密钥字段至少 32 字节；真实值只放在受控、Git 忽略的生产环境文件中。
