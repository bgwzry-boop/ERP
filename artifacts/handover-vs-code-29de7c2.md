# 交接书对照代码核对（基线 29de7c2）

核对日期：2026-10-23。  
只读。没有改业务功能，没有合并，没有部署。  
对照材料：交接书《ERP 项目全景说明与交接书》v1.0，以及同份摘录 `extract_9917.txt`。  
核对对象：当前仓库提交 `29de7c2ed38aaa9d678773379c85ac81fcb69d5f`（分支 `codex/staging-current`）。  
本地整改提交 `c3d509947bdc55458972d6424a8578b4d00fc33a` 不在本仓库，本报告没有核到它。

## 1. 总判断

线上测试站和这本仓库的基线都是 `29de7c2`，书上的版本号、发布锁和应用身份对得上。  
原料这边，整卷出库、出到机台不算可用、机边剩料不能退回可用，这三条约定在本提交里已经挡住；旧问题“标签重打后直接变可用”在本提交里没有复现。  
书上当作现行规则的订单分流、实出必须整笔成功、实包核对，本提交还没有守住；测试站仍是测试身份，未登录就能读到原料入库列表。

## 2. 书与代码对不上的条目

| 书上说法 | 实际 | 严重度 |
| --- | --- | --- |
| 订单分流的代码在 `shared/orderRouting.js`（证据 S16）。`shared/` 是商品分流的事实来源。 | 这个文件不存在。分流写在 `src/domain/officeRules.js` 的 `getDraftStatus`、`getDraftOrderType`，以及 `src/lib/orderParser.js` 的 `estimateInventory`。 | 高 |
| 不能只按“印不印刷”分流。没有印刷的特殊尺寸也要生产。有固定图案的标准通货，有库存就可以出库。 | `estimateInventory` 遇到“要印刷、品名不含喜/福”时，直接写成“需复核”，不查库存。`buildProductionTasks` 只要 `print === "是"` 就建丝印任务。空白且没库存的行变成“缺货待处理”，不会建生产任务。 | 高 |
| 实出 10 个时，只有 6 个有效占用，不能扣 6 个后仍报成功。 | `buildInventoryMovements` 按较小的数量扣在库，同时把整笔占用标成“已出库”。它不返回错误。调用方只在 `inventoryMovements.error` 时才拒绝。 | 高 |
| 漏扫、重复、串单、没有实际包裹，都不能完成装车。 | `validateDriverPackageCheck` 只检查本单清单有没有漏项。清单是空的就通过。别人的包号被丢掉，不报错。重复包号先被去重。 | 高 |
| 包裹记录必须是实际装了什么。5000 个装成五包，应有五个包码。 | 确认订单时，`confirmDraftOrder` 按数量写成“3包 / 2包 / 1件散装”。打包时如果没交每包明细，`buildPackageRecordsForPacking` 会把总数平均拆开。 | 高 |
| 评审免密，仍换成后台签发的测试会话。正式生产才保留账号登录。 | 正式生产模式确实会要求登录（`buildApiSecurityPolicy` 的 `strictAuth`）。当前测试站是测试模式。未登录时可以落到默认办公室账号，也可以用请求头改权限。2026-10-23 未登录读取原料入库列表，返回 200。 | 高 |
| 原料经手人员使用扫码枪、PDA 或手机。 | 长期规则写在 `AGENTS.md`：不采用共用 PDA，现场用本人手机。书上的岗位表和这条规则不一致。 | 中 |
| 现行原料规则是整卷，剩料不回可用。 | 执行代码已经按这条挡住。但 `AGENTS.md`、`docs/product/requirements.zh-CN.md` 仍写着拆卷领料，以及余料复核后转回“可用”。这是书、文档、代码三处口径不一致。 | 中 |
| 证据 S08 到 S13 写在仓库路径 `docs/development/*20261023.json`。 | 本提交没有这些文件。它们属于书上的本地整改资料，不能在这个基线上打开。 | 中 |
| 当前代码能力表把“核包、实包、库存守恒”写成已有能力，把不足整笔拒绝写成必须守住的规则。 | 相关函数在，但守不住书上的结果。不足扣减、空包清单、按数量猜包数，见第 5 节。书把补强记在未发布的本地提交上，那部分见第 6 节。 | 高 |

对得上、不要误判成缺口的几项：

- 健康检查与书一致。`https://erp-staging.luxingpack.com/api/health` 返回目标 `staging`，版本 `staging-20261023-version-governance-r2`，提交 `29de7c2ed38aaa9d678773379c85ac81fcb69d5f`，锁摘要 `6f7d3ddf4d6fe49dbe3366d8c3ea47858ad408435336c3ae78d913acca4e5aa0`。`deploy/release-policy.json` 的基线分支是 `codex/staging-current`，应用身份是 `bagwin-complete-review-4174`。
- 厂内标准色 35 个，`shared/factoryStandardColors.js` 的 `FACTORY_STANDARD_COLORS`。明确不存在的是云雅绿、天池蓝、梦幻紫。本白等历史叫法仍是别名。
- 一张送货单最多 4 页。服务端 `normalizeDeliveryNotePages` 超过 4 页会拒绝，错误码 `RAW_MATERIAL_DELIVERY_NOTE_PAGE_LIMIT_EXCEEDED`。
- 测试站完整菜单不是生产放行。健康检查里首发范围是 `none`，写入策略是 `unrestricted`，运行模式是 `test`。生产或 strict 启动才强制 `ERP_FIRST_RELEASE_SCOPE=raw_material`，见 `requireProductionFirstReleaseScope`。

## 3. 书说「有」，但缺入口或缺防线

1. 订单分流  
   书把分流写成已有代码，并指向 `shared/orderRouting.js`。文件没有。现有判断主要看是否印刷。印刷通货有库存时仍会排丝印。空白特殊尺寸缺货时不会排产。  
   证据：`getDraftStatus`、`getDraftOrderType`、`estimateInventory`、`server/services/orderDraftCommandService.mjs` 的 `buildProductionTasks`。

2. 占用和实出必须一起成功  
   书把“少占用不能扣一部分还报成功”写成现行数据规则。本提交的 `buildInventoryMovements` 没有整笔拒绝。实出比占用少时，在库少扣，占用整笔释放。实出比占用多时，多出来的数量被丢掉，仍然成功。没有占用时，默认返回 `skipped_no_reservation`，也不报错。  
   证据：`server/services/fulfillmentActionCommandService.mjs`。库房实出和司机完成送货只在 `inventoryMovements.error` 时失败。

3. 司机逐包核对  
   书的模块表把“核包”写成当前代码能力。函数在，但不拒绝空清单、串单包号和重复包号。  
   证据：`validateDriverPackageCheck`。装车另有前提：必须已经有库房实出时间，错误码 `DRIVER_DELIVERY_WAREHOUSE_OUTBOUND_REQUIRED`。

4. 实包，而不是按计划数量猜包  
   书要求一单一包一码。确认订单和待打包展示会按数量猜包数。服务端在没有逐包数量时会平均拆分。  
   证据：`src/state/officeOrderActions.js` 的 `confirmDraftOrder`；`inferPackageCountFromQty`（`src/state/officeProductionPackingState.js`、`src/features/production/productionPackingPresentation.js`）；`server/services/packingCommandService.mjs` 的 `distributeIntegerQuantity`。

5. 测试站权限  
   书说评审免密，但仍是后台签发的测试会话。测试模式下，`strictAuth` 为假时允许种子用户、旧身份头 `x-erp-user-id`、权限头 `x-erp-action-permissions`，以及默认用户 `U-OFFICE-A`。`server/apiServer.mjs` 只在 `strictAuth` 时拒绝未登录请求。  
   2026-10-23 只读访问测试站 `GET /api/raw-material-inbounds?limit=1`，没有登录，返回 200，正文是入库单据列表。这里不抄单据内容。

6. 打印预览和关提醒  
   当前打印弹窗走 `printFulfillmentDocument`。预览文案写明不会推进交付。服务端 `preview_only` 不推进交付，见 `printJobBusinessProjectionService.mjs`。  
   缺的防线是待办。`todoCommandService.mjs` 的 `batch_print_confirm` 和 `mark_handled` 按操作人提交的文字把待办标成已处理，不核对打印机是否真的打出。  
   另外，旧函数 `confirmOfficeModal` 对非预览打印仍写“已模拟打印成功”，并调用 `confirmFulfillmentPrint` 把 `printed` 设为真。当前打印弹窗不再走这个函数，但这份旧逻辑还在。

## 4. 书说「缺口」，代码确实仍缺

这些和书上的“下一步缺口”一致。线上给人用的是完整评审壳 `docs/prototypes/raw-material-roll-inventory-review`，不是根目录那套旧页面。

- 订单改量和作废。评审订单池 `OrderPoolWorkspace` 只有“进入生产任务 / 进入出库交付”和刷新。没有“调整数量”“作废”。根目录 `src/features/orders/OrderPoolPage.jsx` 仍有这两个按钮，但测试站外壳没有挂上它。
- 临时留货的完整界面。创建、释放写在 `src/features/inventory/InventoryPage.jsx`。评审库存页用的是 `FinishedGoodsInventoryWorkspace`，没有挂这套留货操作。
- 差额、减免、转欠款、核销入口。评审页 `customer-statements` 是只读列表，说明文字提到 `StatementPage`，但没有挂上 `src/features/statements/StatementPage.jsx`。
- 混装逐项录入。评审壳没有混装明细编辑。打包在缺少逐包内容时会平均拆数量。
- 售后。`ProductionExceptionPanel.jsx` 有处理方向“转售后/质量问题”。没有客诉单、补发、换货和费用结案。
- 工资仍是一人试点，不能当成全厂工资验收。服务在 `server/services/attendancePayrollService.mjs`。正式全月、真实考勤来源和岗位费率批准，书上列为独立验收，本提交没有现场证据。
- 真机出纸、贴卷、扫码、司机弱网、窄屏幕和服务端分页。这些是现场或后续入口，不是本提交里已经验收的能力。
- 采购决定只是部分能力。书上写的完整采购管理和恢复入口，本提交没有独立闭环页面。

工资页本身已挂进评审壳：`BusinessWorkspace` 在 `payroll-attendance` 使用 `PayrollAttendancePage`。缺的是全厂验收，不是这个页面完全不存在。

## 5. 明确的代码问题（原料试点优先）

### 先看原料试点

1. 测试站权限过宽。严重度：高。  
   原料入库列表未登录即可读到。测试模式允许默认办公室身份和权限头。生产模式的 `strictAuth` 没有套在当前测试站上。  
   证据：`server/apiSecurityPolicy.mjs`、`server/services/requestAuthContextService.mjs`、`server/apiServer.mjs`。线上健康检查 `seed.runtimeConfig.mode=test`。

2. 整卷和剩料的执行口已经挡住。严重度：当前库存行为是安全的；文档和死代码是中。  
   `applyRawMaterialTraceabilityAction` 一进来就拒绝 `return_leftover` 和 `review_leftover`，错误码 `RAW_MATERIAL_LEFTOVER_RETURN_TO_AVAILABLE_DISABLED`。  
   领料先走 `assertWholeRollIssue`。机台必须是 1 到 9 号机。重量不等于整卷时拒绝，错误码 `RAW_MATERIAL_PARTIAL_ISSUE_DISABLED`。  
   后面仍留着旧逻辑：拆卷后把剩余重量写成“可用”；余料复核把 `inventoryStatus` 写成“可用”。这些代码现在走不到。若有人删掉前面的拒绝，旧行为会回来。  
   证据：`server/rawMaterialTraceabilityActionService.mjs`、`src/domain/rawMaterialWholeRollPolicy.js`。  
   文档仍把旧行为写成现行规则：`docs/product/requirements.zh-CN.md` 写有 `RMI-SPLIT-*` 和“复核余料可用”。

3. “标签重打后回到可用”在本提交没有复现。  
   `reprint_label` 遇到库存状态“可用”会拒绝，错误码 `RAW_MATERIAL_AVAILABLE_ROLL_LABEL_CHANGE_BLOCKED`。允许重打时，结果是“已打印待贴标 / 待贴标”，不是“可用”。  
   证据：`server/services/rawMaterialInboundCommandService.mjs`。

4. 送货单 4 页上限在服务端有。不要把它再列成缺口。  
   证据：`normalizeDeliveryNotePages`，错误码 `RAW_MATERIAL_DELIVERY_NOTE_PAGE_LIMIT_EXCEEDED`。

### 原料之后，仍会错账错货的问题

5. 占用释放和实扣不一致。严重度：高。  
   占用 10、实出 4：在库扣 4，占用释放 10，没发出的 6 会变回可卖。  
   占用 6、实出 10：在库只扣 6，多出的 4 不报错，交付仍可成功。  
   没有占用：默认 `skipped_no_reservation`，不扣库存。  
   司机完成时，如果已经有 `physicalOutboundAt`，库存动作用 `already_physical_outbound` 跳过，避免送货再扣一次。  
   证据：`buildInventoryMovements`，以及司机完成一段里的 `already_physical_outbound`。

6. 订单分流仍主要看印刷标记。严重度：高。  
   印刷通货有库存，仍会建丝印任务，机器写成 `PRINT-01`。  
   特殊尺寸空白如果库存不够，停在“缺货待处理”，没有生产任务。  
   外加工只在品名包含“同行”时认出，见 `getDraftOrderType`。  
   证据：`src/domain/officeRules.js`、`src/lib/orderParser.js`、`buildProductionTasks`、`buildInventoryReservations`。

7. 打包和司机实包对不上现场。严重度：高。  
   订单确认按数量猜“3包 / 2包 / 1件散装”。  
   页面另有一套猜法：1800 以上 4 包，1000 以上 3 包，500 以上 2 包。  
   服务端没有逐包明细时平均拆开。  
   司机核对放过空清单、重复号和串单号。  
   证据：`confirmDraftOrder`、`inferPackageCountFromQty`、`buildPackageRecordsForPacking`、`validateDriverPackageCheck`。

8. 打印预览本身不会冒充已打；待办关闭和旧函数仍有缺口。严重度：中。  
   现行预览路径有文字和后端限制，见第 3 节第 6 条。  
   `batch_print_confirm` 可以在没有打印机回执时关掉提醒。  
   `applyPrintRecordProjection` 对不在安全名单里的状态会把 `printed` 设为真。预览、已提交、失败、取消在安全名单里。  
   `confirmOfficeModal` 仍保留“已模拟打印成功”。当前打印弹窗不走它。  
   证据：`src/app/useOfficePrintWrites.js`、`src/app/useOfficeInteractionController.js`、`src/state/officeProductionPackingState.js`、`src/state/officeModalActions.js`、`src/state/officeFulfillmentActions.js`、`server/services/todoCommandService.mjs`。

9. 给人用的评审入口缺按钮，根目录旧页面还有按钮。严重度：中。  
   测试站订单池不能改量、作废。对账页不能核销。库存页没有留货操作。根目录对应页面里这些动作还在。两套入口容易让人以为“按钮已经有了”。  
   证据：`docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx`；对比 `OrderPoolPage.jsx`、`StatementPage.jsx`、`InventoryPage.jsx`。

## 6. 只能在本机 c3d50994 验证的项

本仓库没有提交 `c3d509947bdc55458972d6424a8578b4d00fc33a`，也没有分支 `codex/p1-integration-20261023`。下面各项只是书上的声明，本报告没有核到。

- 本地整改最终提交 `c3d50994`，以及书上的验证快照 `7e1ca4fb`。
- 本机目录 `/Users/xu/Documents/ERP` 和 `/Users/xu/.codex/worktrees/p1-integration-20261023/ERP`。
- 497 条旧提交核对、611 条总账，以及 59 项未提交材料。
- 证据文件 S08 到 S13 这六份 `20261023` JSON。
- 书上的通过数：常规检查 157 组、数据库专项 18 组、浏览器核心 10 加完整评审 13、发布检查 21/21。这些数绑定本地整改快照，不能写成 `29de7c2` 已复测。
- 整改分支上的数据库迁移 `0052`。本提交迁移只到 `db/migrations/0047_employee_payroll_position_key.sql`。
- 命令 `npm run p1-postgres:check`。本提交 `package.json` 只有 `db:postgres-live:check`，没有 `p1-postgres:check`。
- 书上的“本地加强”是否真的补上：锁后再查数量、实出不足整笔拒绝、照片版本绑定、不重复生成成品或包裹、价格和包裹快照冻结、作废回执不恢复旧状态、可信打印完成才关提醒、水印和签字绑定当前版本、累计 20 改成 50 仍是 50、差额保存后旧批准失效。

本提交里已经能看到的邻近行为，不能当成上面这份本地补强已发布。例如：预览路径本身不推进交付；余料回可用和拆卷在本提交已被拒绝；对账命令文件 `statementFinancialCommandService.mjs` 存在。它们不能代替对 `c3d50994` 的核对。

## 7. 建议下一步（不自动开修）

1. 先由负责人决定要不要收紧测试站登录。未登录能读原料单据，是当前线上最直接的问题。这是发布和配置决定，不是本报告能改的。
2. 原料试点继续沿用本提交已经挡住的三条：整卷出库、出到机台不算可用、机边剩料不回可用。不要为了旧文档把拆卷或余料回库加回来。
3. 另开文档任务，改掉仍写“拆卷、余料复核后可用”的 `AGENTS.md` 和 `docs/product/requirements.zh-CN.md`。死代码先标清，再决定删不删。
4. 订单分流、占用整笔拒绝、实包和司机核包，放在原料现场验收之后。它们会错货、错库存，但不是当前整卷试点的第一刀。
5. 评审入口的改量、作废、留货、差额核销，按书上的缺口做，不要把根目录旧页面当成测试站已经接上。
6. 任何发布仍走规定的发布入口。不要把本报告、本地 `4174` 或未入库的 `c3d50994` 当成新版本。要核对本机整改，必须在那份工作树上单独看。
