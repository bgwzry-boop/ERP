# 前端 UI 审查（2026-11-07）· 覆盖台账 / 发现 / 修复记录

状态：**进行中（首批）**。仅本分支改动，未合并、未部署。生产未授权。

## 0. 治理与基线（已执行）

| 项 | 结果 |
|---|---|
| 阅读 `AGENTS.md`、受控发布规则、产品文档 | 已完成 |
| 原主目录 `npm run release:check` | **通过 21/21** |
| canonical `/Users/xu/Documents/ERP` | `3fe8c97fc25b6c1c5e2623e1191af27e382a3a51`，干净 |
| 本次工作树 / 分支 | `/tmp/wtui` · `codex/ui-audit-20261107`（从 canonical 新建） |
| 4174 预览 | **被占用，非本分支**（见阻塞项 B1） |

## 1. 阻塞项

**B1 · 本地 4174 被旧的 PR#66 快照占用，无法启动本分支评审服务**

- 监听进程工作目录：`/private/tmp/erp-staging-pr66-20261107/docs/prototypes/raw-material-roll-inventory-review`
- 该实例 `erp-release-commit` 为空（本地修改稿），**不是** canonical，也不是本审计分支
- `docs/prototypes/raw-material-roll-inventory-review/vite.config` 强制端口 4174（`strictPort`），
  因此本分支无法另起端口
- 按规则：未核实所有权前不得 kill/替换 4174。**未执行 kill**
- 影响：本分支的实时截图/交互证据暂时无法采集；下文覆盖台账中「证据」为待补

## 2. 覆盖台账（来源：真实 `pcNavGroups` 注册表）

注册表：`docs/prototypes/raw-material-roll-inventory-review/src/navigation.js`（8 组 / 20 个视图）。
桌面视口 1440 / 1280，手机 390；角色：`office`（默认评审身份）、`management`、`finance`、
`warehouse`、`workshop`（按角色权限过滤实测）。

| # | 页面（id/中文） | 角色 | 视口 | 状态 | 动作 | 证据 | 结论 |
|---|---|---|---|---|---|---|---|
| 1 | shared-todos 公共待办 | office/management | 1440/1280/390 | 待采集 | 列表/分页/搜索/详情 | 待补 | 待审 |
| 2 | order-entry 订单录入 | office/management | 同上 | 待采集 | 短写识别/清空/保存/报价/确认锁 | 待补 | 待审 |
| 3 | order-pool 订单池 | office/management/finance | 同上 | 待采集 | 列表/详情/操作 | 待补 | 待审 |
| 4 | material-receiving 收货录入 | office/management | 同上 | 待采集 | 队列/逐卷/改卷/取消切换/接受 | 待补 | 待审 |
| 5 | roll-inventory 卷料库存 | office/management | 同上 | 待采集 | 台账/选中卷操作/领料 | 待补 | 待审 |
| 6 | production-tasks 生产任务 | 相关角色 | 同上 | 待采集 | 列表/流程 | 待补 | 待审 |
| 7 | packing-labels 打包/标签 | warehouse 等 | 同上 | 待采集 | 混装/定制/打印 | 待补 | 待审 |
| 8 | print-devices 打印与设备 | management | 同上 | 待采集 | 设备/测试 | 待补 | 待审 |
| 9 | mold-changes 换模工单 | 相关角色 | 同上 | 待采集 | 列表/操作 | 待补 | 待审 |
| 10 | outbound-delivery 出库交付 | warehouse 等 | 同上 | 待采集 | 出库/交付 | 待补 | 待审 |
| 11 | inventory-query 无纺布袋 | office/management | 同上 | 待采集 | 查询/筛选 | 待补 | 待审 |
| 12 | laminated-inventory 覆膜袋 | office/management | 同上 | 待采集 | 查询/筛选 | 待补 | 待审 |
| 13 | customer-statements 对账收款 | finance/management | 同上 | 待采集 | 对账/收款 | 待补 | 待审 |
| 14 | supplier-month-end 供应商月结 | finance/management | 同上 | 待采集 | 月结 | 待补 | 待审 |
| 15 | raw-material-cost 原料成本 | finance/management | 同上 | 待采集 | 成本/损耗/毛利 | 待补 | 待审 |
| 16 | payroll-attendance 工资核算 | finance/management | 同上 | 待采集 | 核算 | 待补 | 待审 |
| 17 | customer-records 客户档案 | office/management | 同上 | 待采集 | 增改查 | 待补 | 待审 |
| 18 | general-prices 成品资料 | office/management | 同上 | 待采集 | 资料/价格 | 待补 | 待审 |
| 19 | people-machines 员工机台 | management | 同上 | 待采集 | 员工/机台 | 待补 | 待审 |
| 20 | launch-status 上线状态 | management | 同上 | 待采集 | 只读 | 待补 | 待审 |

> 说明：本表由真实注册表生成，不是按截图猜的页面清单。当前**没有任何一行**完成实测，
> 因此本文件**不构成**完整 UI 审查结论。

## 3. 待审清单（每页必查）

- 1440 / 1280 / 390 三档：溢出、横向滚动、表格/表单可读性
- 按钮/可点区域 ≥ 44px（手机）、主操作位置与重复入口
- 空态 / 加载 / 读取失败 / 筛选无结果 四态区分
- 保存中 / 冲突 / 未保存切换守卫
- 键盘可达与焦点顺序、对比度、字号层级
- 跨页关键动作：订单录入→报价→确认；收货→逐卷→入库/退货；库存→领料

## 4. 已有 UI PR 覆盖判定（待逐条核对后回填）

| PR | 主题 | 判定 |
|---|---|---|
| #74 | 待核对 | 未开始 |
| #76 | 待核对 | 未开始 |
| #77 | 未知哈希路由 | 未开始 |
| #78 | 待核对 | 未开始 |
| #79 | 收货未保存守卫实例化 | 未开始 |

## 5. 发现（P1/P2）

暂无——未取得本分支真实截图前不记录发现，避免把旧快照的问题算到当前代码上。

## 6. 修复批次

暂无。修复前必须先在**本分支**可运行实例上复现。

## 7. 发布前检查清单（STAGING）

> 发布等待 Codex 终审 + 干净合并候选（代码+UI）验证，本文件不授权发布。

- [ ] Codex 对 13 个代码 PR + 本 UI PR 终审通过
- [ ] 干净候选分支合并全部已批准 PR，冲突按业务语义解决（#67∩#70 同文件、#67∩#69 计价夹具）
- [ ] 候选分支跑 `release:check`、`npm test`、`pretest`、`core`、`review:check`
- [ ] 前端/API 同一 40 位 commit + 同一 `erp-controlled-release-lock-v1`
- [ ] `controlled-release:deploy` → 验证 staging 服务端 identity → `controlled-release:finalize`
- [ ] finalize 后 canonical/main 与 staging 一致，`codex/staging-current` 非强制推进
- [ ] 生产发布需**另行授权**
