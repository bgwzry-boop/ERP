# 前端 UI 审查（2026-11-07）· 覆盖台账 / 发现 / 修复记录

状态：**进行中（首批）**。仅本分支改动，未合并、未部署。生产未授权。

## 0. 治理与基线（已执行）

| 项 | 结果 |
|---|---|
| 阅读 `AGENTS.md`、受控发布规则、产品文档 | 已完成 |
| 原主目录 `npm run release:check` | **通过 21/21** |
| canonical `/Users/xu/Documents/ERP` | `3fe8c97fc25b6c1c5e2623e1191af27e382a3a51`，干净 |
| 本次工作树 / 分支 | `/tmp/wtui` · `codex/ui-audit-20261107`（从 canonical 新建） |
| 4174 预览 | **本分支已启动**（PID 见 §1；app-id、API 已验证） |

## 1. 运行环境（已解除阻塞）

原 4174 占用方为 PR#66 旧快照（Codex 已核实并正常 SIGTERM，未改任何文件）。
现在运行的是**本分支**：

- 工作树 `/tmp/wtui`，分支 `codex/ui-audit-20261107`
- 启动方式 `npm run review:dev`（4174 严格端口），API 在 8787
- 已验证：`http://127.0.0.1:4174/` 200、`erp-app-id=bagwin-complete-review-4174`、
  `/api/health` status=ok（release.ready=false，属本地未部署，符合预期）
- 本地页脚标记「本地修改稿 · 未部署 · e49cad3b + 未提交改动」

## 1.1 首批截图（24 张，真实渲染）

- 视口：桌面 1440×900、桌面 1280×800、手机 390×844
- 页面：公共待办、订单录入、订单池、收货录入、卷料库存、对账收款、原料成本、客户档案
- **采集脚本缺陷（已确认）**：把 `/api/auth/prototype-login` 也 abort 了，导致未认证空态；
  且手机档只改 viewport、没有真实 iPhone UA + isMobile + hasTouch。
  这两点使上述手机/空态截图**不能**作为当前真实环境证据，需按正确脚本重采。
- 目录：`/tmp/audit-shots/`（本地产物，未入库）
- 已逐张目视检查：订单录入 1440、收货录入 1440、收货录入 390

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

## 5. 发现（基于首批截图）

> 均为**本分支**真实渲染，写入被拦截。尚未做交互复现的项标注「待交互确认」。

### P2-1 手机 390 顶部搜索框被裁切

- 证据：`/tmp/audit-shots/phone390-material-receiving.png`
- 现象：搜索输入框右侧超出视口，placeholder「搜索 客户 / 订单 / 尺寸 / 颜色 / 单据」在「尺寸」处被截断，
  输入区与右侧账号区挤在同一行
- 代码位置：`src/GlobalSearch.jsx:62`（`.global-search`），顶栏栅格在窄屏未收缩
- 业务影响：手机端主要检索入口显示不完整，用户不知道能搜颜色/单据
- 状态：待交互确认 + 待修（小改：窄屏让搜索独占一行或收缩账号区）

### ~~P2-2 收货页空列表与「共 1 张」自相矛盾~~ → 环境无效，作废

**更正**：我的采集脚本把 `/api/auth/prototype-login` 也 abort 了，页面从未完成签名预览身份交换，
所以看到的是未认证的空态/错误态。Codex 在同一 4174、同一源码上的独立采集是健康有数据的。
本项在认证后未复现，**作废，不改代码**。

- 证据：`/tmp/audit-shots/desktop1440-material-receiving.png`
- 现象：队列为空并显示「选择一张单据开始核对」，但页脚显示「共 1 张」「1 / —」，
  状态页签计数全部是「—」
- 代码位置：`src/ReceiptWorkspace.jsx:86`（页脚直接取 `total`），计数与列表未同源
- 业务影响：工作人员无法判断到底是「没有单据」还是「读取未完成」，可能反复刷新
- 状态：需先确认是加载竞态还是数据不一致；**不在未复现前改**

### ~~P2-3 订单录入读取失败态出现两个「重新读取」~~ → 环境无效，作废

同上：未认证导致的读取失败态，不是真实页面行为。**作废，不改代码。**

- 证据：`/tmp/audit-shots/desktop1440-order-entry.png`
- 现象：顶部右侧一个「重新读取」，下方错误卡片又有一个「重新读取」；主操作不唯一
- 业务影响：错误恢复入口重复，用户不确定该点哪个；两个按钮行为是否一致未验证
- 状态：待确认两个入口是否绑定同一 action；若一致，保留一个

### 观察项（暂不定级）

- 右上 provenance 条「本地修改稿 · 未部署」常驻，与页面标题争夺视觉层级（本地预览特性，staging 不出现）
- 收货页首屏左栏占比偏窄（约 1/3），逐卷核对区较宽，符合既有设计决定

## 5.1 P1（独立复现，真实环境）

**P1-1 订单录入未保存内容在离开时静默丢失**

- 证据（Codex 独立采集，允许 prototype-login、零业务写入）：
  `independent-report.json` 的 `dirtyChecks`：
  - 菜单路径：无任何 dialog，URL 变 `#order-pool`，返回后输入变成旧示例文本，`preserved:false`
  - hash 路径：同样无 dialog、同样丢失
  - `blockedWrites: []`、`errors: []`
  - 截图 `order-dirty-menu-after.png`、`order-dirty-hash-after.png`
- 复现条件：订单录入原文填 `3037 红 500 个 黄松`（不点识别），从侧栏点「订单池」或直接改 hash
- 影响：客户原话直接丢失且无提示；返回后被旧草稿覆盖，用户会以为系统改了自己的输入

**我的修复尝试与结果（未提交）**

在 `App.jsx` 的 `navigate` 与 `hashchange` 加了 `confirmInApp` 守卫，并在编辑器注册里补
`dirty` 状态与「确认离开后不自动灌默认草稿」的开关。实测结果：

- 干净状态点「订单池」正常跳转
- 有未保存原文时点「订单池」：**不跳转、也不弹确认框**，页面卡在原页
- 无 pageerror、无 console error、无原生 confirm
- 结论：`confirmInApp` 在这个预览壳里没有给出可解析的对话框（Host 注册/渲染存疑），
  await 永久挂起，会把导航锁死

因此**已全部还原**（`App.jsx`、`useFormalDesktopWorkspace.js`、`OrderPricingEntryWorkspace.jsx`
回到 `e49cad3b` 状态），不提交半成品守卫。下一步先单独验证 `ConfirmDialogHost` 在
4174 预览壳里的挂载情况，再重做守卫。

## 6. 修复批次

**第一批：未提交修复。** 先复现再改；P2-1 与 P2-3 属小改候选，P2-2 需要先判定加载竞态。
每个修复都要在相同视口出「修复前/修复后」两张图再提交。

## 7. 发布前检查清单（STAGING）

> 发布等待 Codex 终审 + 干净合并候选（代码+UI）验证，本文件不授权发布。

- [ ] Codex 对 13 个代码 PR + 本 UI PR 终审通过
- [ ] 干净候选分支合并全部已批准 PR，冲突按业务语义解决（#67∩#70 同文件、#67∩#69 计价夹具）
- [ ] 候选分支跑 `release:check`、`npm test`、`pretest`、`core`、`review:check`
- [ ] 前端/API 同一 40 位 commit + 同一 `erp-controlled-release-lock-v1`
- [ ] `controlled-release:deploy` → 验证 staging 服务端 identity → `controlled-release:finalize`
- [ ] finalize 后 canonical/main 与 staging 一致，`codex/staging-current` 非强制推进
- [ ] 生产发布需**另行授权**
