# 计划书规则对照代码审计（2026-10-24）

只读审计。核对对象是远端 `codex/staging-current` 的 tip，不是测试站或生产是否已经在跑这份代码。

| 项 | 值 |
| --- | --- |
| 审计提交 | `080863ebc62b1a32ff989d54eb1b427548511894`（2026-10-24 19:34 +0800，`docs(release): record startup and export integrity verification fixes`） |
| 对照起点 | `955bb605`（`fix(staging): keep receiving facts and actions visible in detail pane`） |
| 区间 | `955bb605..080863eb` 共 136 个提交：10-22 共 3 个，10-23 共 89 个，10-24 共 44 个 |
| 权威 | 附件简报的 10-24 口述，以及《ERP业务问题与解决方案汇编》v1.0。同日书面清单 `docs/development/erp-unresolved-and-decisions-20261024.zh-CN.md`（提交 `a04e1f3`，后续有增补）单独标出，因为它和口述并不处处相同 |
| 未做 | 没有改业务逻辑、界面、测试或配置。没有重跑测试，没有请求 staging `/api/health`，因此**不宣称已上线或已现场验收**。同日清单自己也写「本地验证通过，未部署」 |

汇编阅读快照是 `c3d509947bdc55458972d6424a8578b4d00fc33a`（10-23）。本报告以 tip `080863eb` 的源码为准。

## A. 今日/近期 GPT 更新摘要（按主题）

10-23 是大批「497 条旧决定」整改与收口（库存守恒、交付证据、财务闭期、原料颜色/整卷、发布身份）。10-24 在这之上继续改金额、合组、包裹、对账和发布文档。按主题归并 10-24 的 44 个提交：

1. **印刷合组计价与整组更正**（约 11:27–12:25）  
   `c06b609` 办公室报价与补单改为服务端权威；`bf05570` 合组必须有明确印刷内容；`25cb488` 整组更正按冻结价原子保存；`5ec2a28` / `c408c70` / `e51faa5` 补单重定价避开真实开印、作废历史和旧纸单。书面清单把这项记为 P1-06 / O10，「颜色不拆阶梯」。

2. **订单改量、锁价与留货**  
   `7efe4a5` 拒绝不安全财务改写并保留不确定写入；`450b11a` / `92ed149` 改单与纸单、实耗串行；`d68b678` / `27fadd6` 留货交接与过期刷新；`c8e7519` 办公室确认改用已发布 ERP 价；`3f70647` 覆膜金银必须显式标价；`d8be296` 拒绝无价确认和过早的对外「已完成」。

3. **包裹、出库纸单与快递实拉时间**  
   `1a35494` 持久化混装包并按组装载；`8e72fb6` 现有打印动作接到实物包挂牌；`9613513` 实出绑定批准数量和当前纸单；`242d805` / `8dad133` 承运交接按实际拉走时间入账，在确切回执前保持待确认。

4. **对账金额与受限结清**  
   `9a41c97` 对账列表显示服务端金额，缺额阻断；`e0a0224` 接入结清，办公室只能做受限的足额结清。书面清单记为 P1-08 / F03 / F09：「差额仍单独审批」。

5. **工资与考勤边界**  
   `a2ff5b9` 普通工时排除工厂午休并保留已复核分钟；`1efd62c` 丝印按实际休息，不固定扣午休；`a2867c5` 收紧工资与本人考勤权限测试。

6. **导出、启动与发布文档**  
   `1499103` / `8ce8006` 导出前核对保留的工作簿字节和旧库文本长度；`978217d` 演示打印任务只挂到已有目标；`fae8e7a` / `080863e` / `b4f4b42` 记录受控推广和 6 组本地整改边界。这些文档反复写「未部署」。

7. **98 条规则台账**  
   `a04e1f3` 写入 `docs/development/erp-business-rules-98-triage-20261024.json` 与 `docs/development/erp-unresolved-and-decisions-20261024.zh-CN.md`。O16 仍标「待整改」。O10、M21、F03/F09 被写成「本地已接、未部署」。

## B. 与计划书冲突或不符合

严重度顺序：冲突 > 假完成 > 未实现。每条都给路径或符号。没有一条被当成现场验收通过。

### B1. 冲突：O10 口述要求印刷颜色相同，代码故意把不同印色合进同一阶梯

**规则（10-24 口述）。** 合组必须同时满足：相同尺寸、印刷内容完全一致、印刷颜色相同。袋身色不同仍可合。单面与双面不可合。双面正反图案不同不可合。跨订单只允许同客户且同批补单。

**代码。** `printingGroupIdentity`（`server/orderPrintingPriceGroups.mjs`）的身份只有 `customerId`、`size`、`content`（`printContent`）、`side`（单面/双面）。注释写明颜色故意不进入身份，同一内容同一尺寸的印色和袋身色合为一批。`sharedPrintingUnitPrice` 只按数量和单/双面取 0.06 / 0.08 / 0.09 / 0.13。

**测试把冲突写成通过条件。** `scripts/check-office-order-pricing.mjs` 的 `officePricingWorkspace` 第一行印色来自 `scripts/check-order-confirmation-price-source.mjs` 的 `printColor: "黑色"`；同测再推入 `printColor: "红色"`、`bagColor: "白色"` 的第二行，并断言 `groups.length === 1`、`memberCount === 2`、两行印刷单价都是 `0.06`。这正好是口述要拆开的「黑印 vs 红印」。

**同日书面反而把这当成完成。** `docs/development/erp-unresolved-and-decisions-20261024.zh-CN.md` P1-06 写：「同客户、明确同内容、同尺寸和印刷面合组，颜色不拆阶梯……本地专项、完整数据库及实际 4174 电脑入口验证通过，未部署。」这与汇编 O10「袋身色/印色不同不单独拆阶梯」一致，与 10-24 口述不一致。按口述验收时，这份「已接齐」是假完成。

**另外两处没有达到口述。**

- 双面正反图案：身份里没有独立的正面/背面字段，只看一整段 `printContent` 和「是否双面」。背面若写在别的字段，会被当成同一内容。
- 同批补单：`server/orderDraftPricingQuote.mjs` 要求客户端 `confirmedSameBatch === true`，外加自由文本 `batchReference` 和 `reason`，再调用 `assertUnstartedPrintingSupplement`。服务端能挡住已开印、已交付、已对账和不同客户，但「同批」本身是操作员勾选和填写，不是已发布印刷批次的标识。

袋身色不同仍可合、单双面分开、空内容不猜测合组，这三点和口述一致，不能抵消印色冲突。

**严重度：冲突（并构成相对口述的假完成）。**

### B2. 冲突：原料余料可以退回并复核成可用库存

**规则（10-24 口述，汇编 M14 相同）。** 只有院子里还没出库的整卷才可用。禁止拆卷，禁止余料退回可用。领料是 1–9 号机整卷转机边。

**代码仍提供两条写动作。**

- `return_leftover`：`server/rawMaterialTraceabilityActionService.mjs` 把机边卷改成 `inventoryStatus: "余料待复核"`。
- `review_leftover`：同一文件把待复核余料改成 `inventoryStatus: "可用"`、`labelStatus: "已贴标/可用库存"`，地点默认「原料库-余料可用区」。错误文案写明 “reviewed back to available inventory”。
- 路由仍注册这两个动作：`server/routes/rawMaterialWriteRoutes.mjs` 的 `returnRawMaterialLeftover` / `reviewRawMaterialLeftover`。
- `server/services/rawMaterialInboundCommandService.mjs` 的 `getRawMaterialActionReason` 对 `review_leftover` 的说明是「余料复核通过后转回可用原材料库存」。

整卷领料本身是挡住的：`src/domain/rawMaterialWholeRollPolicy.js` 的 `assertWholeRollIssue` 在重量不一致时返回 `RAW_MATERIAL_PARTIAL_ISSUE_DISABLED`；`server/rawMaterialTraceabilityActionService.mjs` 另有 `RAW_MATERIAL_PARTIAL_QUANTITY_ISSUE_NOT_SUPPORTED`。机台标签是「1号机」到「9号机」。这些不能把余料回库说成已禁用。

**严重度：冲突。**

### B3. 冲突：F03 少付差额不是「立刻生效 + 强制待阅」

**规则（10-24 口述）。** 办公室可以登记少付；登记立刻生效；必须通知老板、财务、管理待阅；操作人、金额、原因、时间留痕；少付和实收分开记。

**代码。** `server/services/statementFinancialCommandService.mjs` 的 `recordPayment` 记一笔实收，差额留下并可能生成待办。`handleVariance` / `writeOffStatement` 才处理差额，核销种类分为足额、转欠款、授权抹零，并要求经营决定证据。`src/features/statements/StatementPage.jsx` 与 `src/state/officeStatementActions.js` 的提示是「少付进入差额待确认」，不是少付登记后立即核销。

检索 `src/features/statements` 没有老板/财务/管理的「待阅」入口。现有待办类型是「收款差额待确认」（`handleVariance` 一段），不能代替强制待阅。

**和同日书面也不一样。** P1-08 写的是：办公室只能凭双证据结清足额款；「差额仍单独审批」。代码贴近这份书面，不贴近口述。因此不能把 P1-08 的「本地已接」当成口述 F03 已完成；通知入口这项计划书缺口仍然在。

操作人、金额和时间留在付款记录和操作日志里，这一点有留痕，但留痕不等于少付已生效，也不等于已通知待阅。

**严重度：冲突。** 通知入口：**未实现**。

### B4. 冲突：工作台没有按岗位分开落地

**规则。** 老板看经营，办公室看订单待办，财务看账款。不是同一个公共大屏。

**4174 完整评审壳（当前桌面入口）。** `docs/prototypes/raw-material-roll-inventory-review/src/navigation.js` 的 `getDefaultWorkspaceView`：只要看得到「卷料库存」，办公室和管理都进卷料库存；只有「财务且不是办公室」才进「供应商月结」。没有「经营」页。财务默认也不是「对账收款」。

**根应用。** `src/app/navigation.js` 的 `getDefaultNavigationPage`：办公室和管理的 `defaultRole` 都返回 `todos`（公共待办）；财务返回 `statements`（对账收款）。老板与办公室共用同一待办首页。`经营决策` 只给 `decision_maker` 的手机页，不是老板桌面经营台。

**严重度：冲突。** 财务在根应用进对账，这一点单独看是对齐的，但不能抵消老板/办公室同一首页。

### B5. 不符合：客户档案列表就是对账余额，不是纯主数据

**规则。** 客户档案只放主数据。对账在财务。详情可以看洞察，并跳到对账。

**代码。** `buildCustomerRows`（`docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx`）用对账单填充客户行，列是「客户 / 客户编号 / 结算周期 / 当前应收 / 状态」，来源标注「正式订单与对账 API」。详情事实也包含「当前应收」。客户详情里没有独立的洞察区，也没有「打开对账收款」按钮。这个按钮出现在出库交付详情的「对账关联」，不在客户档案。

**严重度：不符合（部分）。** 档案页没有收款核销按钮，所以不是把对账工作台搬进来了；但列表主列已经是应收，不符合「只主数据」。

### B6. 假完成风险：M21 混装在同一页里既「已接通」又「暂未接入」

**计划书缺口。** 汇编 M21：混装逐项、更正重印、旧码失效未完成。桌面文案曾经明确写只支持单明细。

**同日书面。** P1-07 写「同订单混装包、更正重印、真实逐包扫码及可信挂牌已连通」，并声明未部署。

**代码同时存在两套说法。**

- `src/features/packing/MixedPackageWorkbench.jsx` 已挂到 4174 出库详情：`PhysicalPackagesPanel`（`BusinessWorkspaces.jsx`）按钮「登记 / 更正实物包裹」。
- 同一详情里的 `DesktopFulfillmentOperations`（`docs/prototypes/raw-material-roll-inventory-review/src/DesktopFulfillmentOperations.jsx`）在「登记实际包裹」下仍写死：「当前仅支持单明细独立装包，混装登记暂未接入。」提交走 `completeOfficePackingTask`，包结构是 `{ packedQty }`，没有逐项尺寸和颜色。
- `scripts/check-desktop-fulfillment-operations.mjs` 仍断言页面包含「混装登记暂未接入」。

服务端 `server/services/packageGroupService.mjs` 有混装地址校验。这不能把仍对操作员显示「暂未接入」的那条主办理路径说成混装已交付。书面「已连通」若被读成计划书缺口已关闭，属于假完成；代码本身留下了互相矛盾的入口。

**严重度：假完成（入口矛盾）。** 不把未部署的本地测试当成上线。

### B7. 未实现：O16 丝印原子认领，以及口述的丝印/制袋状态链

**规则。** 丝印：未领池 → 自己领取后「已被领取」→ 准备印刷 → 上传效果图后才是「丝印中」→ 上传数量后结束。制袋：首件拍照开始，数量报工结束。计划书把 O16 标为缺口。

**代码。** `server/services/productionSchedulingCommandService.mjs` 是办公室发布机台队列，没有工人原子认领命令。全库 `src/` 与 `server/` 没有「已被领取」「准备印刷」「试印并拍照」「首件拍照」这些状态词。`src/features/workshop/WorkshopMobilePage.jsx` 是通用「报当日数量 / 报工完成」，说明文字是「丝印完成交给制袋，制袋完成才进入库存和后续打包」。这是工序交接，不是口述的状态链。

**书面没有假装做完。** P2-02 仍写「当前：待整改」。这一点不是假完成，缺口还在。生产大屏和图谱里的「印1-01」是原型文案（`docs/prototypes/production-tv-flow-atlas/app.js`），不是认领命令。

**严重度：未实现。**

### B8. 未实现：菜单仍叫「成品资料」，不是价格中心

**规则。** 原「成品资料」应成为全厂价目：袋子、丝印工艺、可外售辅料；草稿到发布；能导出价格表图；ERP 价是权威。

**代码。** `navigation.js` 与 `navViewMap` 的 id `general-prices` 标签仍是「成品资料」。`FinishedGoodsMasterWorkspace` 的主按钮文案是「评审页不执行价格发布或修改。」列表是通货定义加通货单价，不是工艺费和辅料价目。丝印阶梯写死在 `sharedPrintingUnitPrice`，不是可发布的价格中心版本。仓库内没有「导出价格表图」的实现符号。

办公室确认改用已发布袋价（`c8e7519`，`server` 侧发布价夹具）只说明袋价发布链在服务端有进展，不能把菜单或价目范围说成价格中心已完成。

**严重度：未实现（菜单名与范围）。** 计划书标出的改名缺口没有被假完成。

### B9. 未实现：请假/倒班到期不会自动恢复原岗位

**规则。** 休息或倒班可以临时改派，到期自动恢复原岗位。

**代码。** 检索「临时改派、原岗位、到期恢复、assignmentExpires」没有员工机台实现。`machine_reassignment` 只出现在生产队列换机（`server/services/productionSchedulingCommandService.mjs`），那是任务换机，不是员工岗位到期恢复。`员工机台` 有档案维护和岗位卡片授权（`PeopleMachinesWorkspace`、`server/services/masterDataSubaccountCommandService.mjs`），没有带截止日期的改派记录。

同日清单没有把这项写成已完成。

**严重度：未实现。**

### B10. 未实现：成品库存不是「大库 → 品类 → 款式 → 尺寸」四级点进

**规则。** 四级点进：大库、品类、款式、尺寸。

**代码。** 4174 把成品库存拆成左栏两项：「无纺布袋」「覆膜袋」（`navigation.js`）。`FinishedGoodsInventoryWorkspace` 是一张表：通货类型、规格、颜色/图案、库位、在库、库存结构，再用类型筛选。没有逐级点进的大库、款式、尺寸层级。`src` 里也没有对应的四级钻取符号。

**严重度：未实现。**

### B11. 不符合：订单池按录入时间倒序，生产队列不是交期倒计时

**规则。** 订单池用录入顺序。生产任务用倒计时。路径分三类：纯色通货、丝印通货、丝印定制，不能只按印或不印。

**代码。**

- 订单池：`server/orderPoolReadRepository.mjs` 的列表是 `ORDER BY line.created_at DESC, line.id DESC`。这是后录入在前，不是先录入在前，也不是交期倒计时。
- 生产队列：`sortQueueItems`（`server/services/productionMachineQueueReadService.mjs`）先比机台，再比手工序号、是否跨日继续，然后比 `queueSortAt || createdAt`。没有交期剩余时间排序。
- 三类：`shared/orderRouting.js` 的 `orderTypeLabel` 有「现货通货 / 印刷通货 / 定制印刷」。订单池筛选项包括这三类和外加工（`src/features/orders/OrderPoolPage.jsx`）。但 `inferOrderType` 在没有显式类型时，仍会因为 `print === "是"` 返回 `custom_print`。这和「不能只按印不印」冲突，只发生在类型缺失时。

**严重度：不符合（排序）；类型为部分实现，缺类型时的 print 回退是冲突点。**

### B12. 部分不符合：供应商月结的差额、抹零、欠款分列和单价更正

**规则（口述 + M17）。** 上传厂家出库表，比对已核对入库；差异分行；打款凭证；允许抹零；欠款分列；入库、月结、应付、付款互相独立。送货单价默认等于账单价，少数改价必须留痕。

**已有的独立状态。** `server/rawMaterialSupplierStatementReviewRepository.mjs`：确认对账、生成应付草稿、确认付款是分开的。`applySupplierPaymentConfirmation` 要求先有应付草稿，且 `paidAmount` 与应付差额超过 0.01 就拒绝。菜单上「供应商月结」在财务，不在收货录入（`navigation.js`）。导入器 `src/domain/rawMaterialSupplierStatementImport.js` 会解析单价，并汇总匹配、候选、未匹配和调整行。

**没对上的。**

- 抹零：付款金额必须等于应付，没有抹零字段。
- 打款凭证：`paymentVoucherNo` 是编号字符串，本审计没有看到必须上传凭证附件的门禁。
- 欠款分列：供应商月结读模型没有与本期进料分开的历史欠款列。
- 送货单价默认等于账单价、改价留痕：导入保存厂家表上的 `unitPrice`，没有「默认改写已核入库单价、例外必须留痕」的命令。

**严重度：部分不符合。** 独立状态没有被假完成成「一键合并」；抹零和单价默认规则没有实现。同日清单把 M17 标成「已有基础、待现场验收」，这个说法过宽，因为抹零和默认单价不在代码里。

### B13. 部分不符合：工资接入没有「API 或导出表二选一」，也没有全员账号报工门禁

**规则。** 得力先用着。考勤要么走 API，要么走导出表，只能选一种。全员用 ERP 账号报工。工资菜单权限单独。

**代码。**

- 工资菜单：`navigation.js` 的 `payroll-attendance` 只给 `management` / `finance`，权限 `payroll.preview`。导出另要 `payroll.export`（`src/features/payroll/PayrollAttendancePage.jsx`）。办公室默认进不了工资。这一点对齐。
- 得力：同步按钮在来源 `configured` 时可用，文案是「先只读预检，再同步真实打卡机数据」。适配器键仍是既有 deli 路径，本审计没有看到与「导出表导入打卡」互斥的开关。
- 《26年工资 (2).xlsx》出现在工资页，用作岗位时薪/日薪构成（`PayrollAttendancePage.jsx`），不是打卡导出表的二选一入口。
- 报工：`WorkshopMobilePage` 用当前登录账号提交，没有「全员必须先有 ERP 账号，否则不能报工」的全厂门禁。汇编 F21 仍把范围写成单人试点。

10-24 的午休改动（`a2ff5b9`、`1efd62c`）是计薪规则修正，不是本条口述的接入方式。书面称本地验证通过、未部署。本审计不把它当成工资已上线。

**严重度：部分不符合。** 菜单权限不是假完成。接入方式仍缺。

### B14. F02 只对齐了底线，正式「免注册测试 / 分岗后自动授权」不能写成已验收

**规则。** 测试环境可以不注册就登录。正式环境：手机号注册，办公室分岗，然后自动打开该岗位权限。注册本身不给业务权。

**代码。** `server/services/phoneIdentityCommandService.mjs` 注册成功时 `roles: []`、`registrationStatus: "pending_assignment"`，操作日志写 `businessPermissionsGranted: false`，但同时 `loginEnabled: true` 并发会话。`assignRegistration` 在确认后写入 `roles`，返回 `getEffectivePermissions`。环境开关在 `server/apiSecurityPolicy.mjs` 的 `ERP_PHONE_REGISTRATION_ENABLED`。测试站免密身份是评审壳的预览会话（见 `AGENTS.md` 的固定预览身份），不是这条手机注册链。

注册不发业务权限，这一条对齐。正式短信、办公室分岗界面是否就是员工每天用的入口，本审计没有现场证据，不能写成已上线。汇编 F02 标的「两条路径待确认」仍然有效：管理员子账号在 `masterDataSubaccountCommandService.mjs`，手机注册是另一条可选实现。

**严重度：部分实现，不是冲突，也不是假完成。**

## C. 已对齐的要点

这些只说明源码里有对应门禁或结构，不表示已经部署或车间验收。

- **O10 的一部分。** 袋身色不参与合组身份；单面/双面分开；`printContent` 为空时按行计价，不用商品名猜测（`printingContent`，以及 `check-office-order-pricing.mjs` 里「白印黑 / LOGO袋」拆成两组的断言）。跨客户因为身份含 `customerId` 不会合成一组。
- **打印不等于入库。** `print_labels` 把待补标卷改成「不可用 / 已打印待贴标」，不直接写成可用。`evaluateRawMaterialOneClickInbound` 要求卷数、已打印数、待贴确认数一致且没有异常卷（`src/domain/rawMaterialWholeRollPolicy.js`）。
- **整卷领料到 1–9 号机。** `assertWholeRollIssue` 与 `RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS`。部分数量领料会被拒绝。
- **订单显式三类。** `orderTypeLabel` 区分现货通货、印刷通货、定制印刷。订单池筛选项没有退回到只有「印 / 不印」两档。
- **客户少付和实收在数据上分开。** 实收走 `recordPayment`，差额走 `variance` / `writeOffStatement`，不是把少付金额加进实收字段。差在「何时生效、通知谁」。
- **财务根首页是对账。** 仅当 `defaultRole === "finance"` 时，`getDefaultNavigationPage` 返回 `statements`。
- **供应商三段状态没有合成一个按钮。** 月结确认、应付草稿、付款确认在 `rawMaterialSupplierStatementReviewRepository.mjs` 分函数，付款前必须已有应付草稿。
- **工资菜单与办公室分开，导出另要 `payroll.export`。**
- **手机注册当时不写业务岗位。** `businessPermissionsGranted: false`。
- **O16 没有被文档改成已完成。** P2-02 仍是待整改。
- **价格权威的袋价方向。** `c8e7519` 让办公室确认使用已发布 ERP 价，而不是浏览器自报价。这只覆盖袋价确认，不覆盖价格中心改名。

## D. 建议 Roy 先看的 5 条

1. **印色合组（B1）。** 打开 `server/orderPrintingPriceGroups.mjs` 的 `printingGroupIdentity` 和 `scripts/check-office-order-pricing.mjs` 里黑印+红印被合成 10000 档、单价 0.06 的断言。先决定口述「印色必须相同」是否推翻同日 P1-06「颜色不拆阶梯」。在决定前，不要把 O10 当成做完。
2. **余料回可用（B2）。** `review_leftover` 会把卷写成 `inventoryStatus: "可用"`。若 10-24「禁止余料退回可用」仍然有效，这是当前会改库存的冲突，优先于文案问题。
3. **少付通知（B3）。** 代码和 P1-08 都是「差额待审批」。口述是「办公室登记后立刻生效，并强制老板/财务/管理待阅」。两份 10-24 口径相反，需要人拍板，不能靠再加一个待办类型蒙混。
4. **混装入口自相矛盾（B6）。** 出库详情同时挂着 `MixedPackageWorkbench` 和「混装登记暂未接入」。看单时不要只看 P1-07 的「已连通」。
5. **首页和价格中心名字（B4、B8）。** 4174 默认把办公室和老板带进卷料库存；菜单仍写「成品资料」，按钮写明评审页不发布价格。这两项用户一打开就能看见，和「分岗工作台 / 价格中心」直接不符。

## 假完成核对（计划书已标缺口）

| 缺口 | tip 上的实际情况 | 是否被写成已完成 |
| --- | --- | --- |
| O16 丝印原子认领 | 无认领命令 | 否。P2-02 仍待整改 |
| O10 跨行/跨订单合组 | 有合组，但印色不拆；同批靠勾选 | 书面 P1-06 称本轮范围已接齐。相对口述是假完成 |
| F03 通知入口 | 无待阅入口 | 不能把 P1-08 当成通知已做 |
| F09 差额/减免桌面入口 | `StatementPage` 有差额决定和核销；办公室足额结清被限制 | 书面称新壳已接。本审计只确认符号在，未重跑、未当验收 |
| M21 混装包 | 服务和一块面板有；主办理区仍写未接入 | 书面「已连通」与界面文案冲突 |
| 菜单「价格中心」 | 仍叫成品资料 | 没有假改名 |
| 临时改派自动恢复 | 无此记录与定时恢复 | 没有假完成 |
