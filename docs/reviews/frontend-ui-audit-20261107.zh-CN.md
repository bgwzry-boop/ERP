# 前端 UI 审查台账（2026-11-07）

状态：**部分完成**。桌面 20 页已真实截图并逐张目视；手机 8 角色**未完成**（原因见 §4）。
本分支只放台账与证据，不改产品代码。未合并、未部署。

## 1. 环境与来源

| 项 | 值 |
|---|---|
| 评审服务 | `http://127.0.0.1:4174/`，`npm run review:dev`，launcher PID 94582 / cwd `/tmp/wtui` |
| 被测源码 | PR #82 head `228d105f26ae65f75b9c3ec0491d8d0696a2d6f6`（+ 本地未提交=0） |
| 身份 | 评审壳签名预览身份（`/api/auth/prototype-login` 放行，其它写请求全部拦截） |
| 视口 | 桌面 1440×900、1280×800；手机真实 iPhone UA + isMobile + hasTouch + DPR3 |
| 写入 | **0**（路由层 abort，非 GET 且非 prototype-login） |
| pageerror | 0 |

## 2. 桌面 20 页（1440 + 1280，全部目视）

> **更正（本轮）**：上一版 `contact-1440/1280.png` 有 3 页标错——`raw-material-cost`、
> `payroll-attendance`、`launch-status` 实际都渲染成「卷料库存」。原因：冷启动深链在真实身份
> 就绪前被默认 office 权限判定为不可见，于是回落默认页；截图脚本只看 hash 不看选中态与标题。
>
> 现在改为：等「管理A」出现 → **点击导航** → 断言 `aria-current`、页面标题与 URL 一致 → 再截图。
> 新证据：`contact-ok-1440.png`、`contact-ok-1280.png`，单图 `shots/ok-1440-*.png`。

| # | 页面 | 1440 | 1280 | 目视结论 |
|---|---|---|---|---|
| 1 | 公共待办 shared-todos | 有数据 | 有数据 | 表格+详情正常，无溢出 |
| 2 | 订单录入 order-entry | 有数据 | 有数据 | 默认草稿填充；P1 守卫见 PR#82 |
| 3 | 订单池 order-pool | 有数据 | 有数据 | 表格列完整 |
| 4 | 收货录入 material-receiving | 有数据 | 有数据 | 队列+核对待选区正常 |
| 5 | 卷料库存 roll-inventory | 空态 | 空态 | 「尚无可用于库卷料」空态合理；图例不裁切 |
| 6 | 生产任务 production-tasks | 有数据 | 有数据 | 正常 |
| 7 | 打包/标签 packing-labels | 有数据 | 有数据 | 正常 |
| 8 | 打印与设备 print-devices | 有数据 | 有数据 | 正常 |
| 9 | 换模工单 mold-changes | 表单 | 表单 | 正常 |
| 10 | 出库交付 outbound-delivery | 有数据 | 有数据 | 正常 |
| 11 | 无纺布袋 inventory-query | 有数据 | 有数据 | 重置按钮横排、图例完整（PR#84 修复） |
| 12 | 覆膜袋 laminated-inventory | 空态 | 空态 | 空态文案合理 |
| 13 | 对账收款 customer-statements | 有数据 | 有数据 | 「本期未收」列（PR#84） |
| 14 | 供应商月结 supplier-month-end | 有数据 | 有数据 | 正常 |
| 15 | 原料成本 raw-material-cost | 有数据 | 有数据 | 成本/工资入口卡片，正常 |
| 16 | 工资核算 payroll-attendance | 有数据 | 有数据 | 工资核算表单，正常 |
| 17 | 客户档案 customer-records | 有数据 | 有数据 | 列表+详情正常 |
| 18 | 成品资料 general-prices | **近空白** | 近空白 | **P3 待查**：主区疑似无数据，未确认是空态还是读取失败 |
| 19 | 员工机台 people-machines | 空态 | 空态 | 合理 |
| 20 | 上线状态 launch-status | 有数据 | 有数据 | 上线状态信息面板，正常 |

**采集方法**：每页点击导航后校验 `aria-current`、标题、URL 三者一致才截图，避免再出现"hash 对、内容错"。

**视觉结论**：深色导航、橙色主操作、字号层级在 1440/1280 一致；未发现新的裁切或溢出。
逐项可疑点只有 `general-prices` 近空白，需后续确认（不作为已确认缺陷）。

## 3. 交互（已执行，安全）

| 动作 | 页面 | 结果 |
|---|---|---|
| 搜索输入 | 对账收款 | 列表过滤正常，无跳页 |
| 筛选切换 | 对账收款 | 列表与计数一致 |
| 打开详情/取消 | 客户档案 | 选中与详情联动 |
| 键盘 Tab 焦点 | 顶栏→侧栏 | 焦点顺序可预期，无陷阱 |
| 离开守卫（取消/接受/交错） | 订单录入 | 见 PR#82 的 7 例浏览器回归 |

## 4. 手机 8 角色（**未完成**）

真实路由表（`src/app/navigation.js:252-282`）：

| 角色 | 手机首页 | 说明 |
|---|---|---|
| office | rawMaterials | 评审壳默认固定身份即此页 |
| warehouse | warehouseMobile | 需角色上下文 |
| driver | driverMobile | 需角色上下文 |
| workshop（袋加工） | workshopMobile | 需角色上下文 |
| workshop + `defaultMachineId=PRINT-*`（丝印） | workshopMobile | 标题按机台判定 |
| packing | workshopMobile | 需角色上下文 |
| maintenance | maintenanceMobile | 需角色上下文 |
| decision_maker | decisionMobile | 需角色上下文 |
| management / finance / technical_operations | desktopRequiredMobilePage | **桌面必需**，是预期边界 |

**为什么未完成**：评审壳 `FormalMobileEntry` 使用签名固定身份（U-MANAGER-A），
没有注入角色上下文的入口；要出 8 个角色页需要挂载 `src/app` 的真实组件并提供数据/权限 fixture，
属于新的测试夹具工程，本轮没做。**没有**为了截图去改真实账号或服务端鉴权。

已捕获：office（rawMaterials）在真实 iPhone UA 下的一屏（PR#82 证据目录）。
其余 7 个角色：**未采集**，不做任何通过结论。

## 5. 明确未覆盖

- 端到端业务写入（下单/入库/收款/打印）**未测**，不是通过
- 设备验收（真机、扫码、打印机）**未做**
- 8 角色手机矩阵（上表 7 行）
- `general-prices` 近空白原因

## 6. 与代码 PR 的关系

本台账不改变任何代码。相关修复在：
- PR #82：订单录入离开守卫（`228d105f…`）
- PR #84：1280 重置按钮/图例裁切/本期未收（`876bffdc…`）

发布仍等根终审 + 干净候选 + 受控 staging 部署；生产未授权。
