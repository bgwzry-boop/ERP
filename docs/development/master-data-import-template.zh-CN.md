# 基础资料导入模板说明

最后更新：2026-07-13

## 当前范围

员工 / 机台维护页默认只展示正式导入账号；内置 seed 员工必须通过明确标注的 `seed演示` 页签查看。seed 数据只用于原型演示，不得计入八岗位覆盖、正式账号数量或上线门禁。正式账号为空时，页面应引导完成模板导入、管理复核、账号启用、首次改密和车间默认机台绑定。

本轮已完成第一版基础资料 Excel 导入模板生成能力、生产数据Sheet与演示资料隔离、上传预检查入口、第一轮外部 Excel 兼容、Excel 日期序列号归一化、导入确认队列草稿、导入确认计划草稿、确认计划 API / 本地持久化边界、执行记录边界、第一版正式事务 writer 边界、正式导入页面入口、失败行下载链路、失败行修正草稿再导入入口、失败行页面内联字段修正入口、员工账号复核启用入口、员工临时密码发放、动态员工登录、首次登录强制改密 API 边界、管理员重置 / 撤销密码、运行期账号 / token 吊销持久化边界、导入员工账号锁定和密码过期策略第一版。模板格式为真实 `.xlsx` Office Open XML，版本为 `p0-master-data-import-template-v1`；预检查版本为 `p0-master-data-import-precheck-v1`；确认队列草稿版本为 `p0-master-data-import-review-v1`；确认计划版本为 `p0-master-data-import-confirmation-plan-v1`；执行记录版本为 `p0-master-data-import-execution-v1`。

当前实现负责生成可填写模板、页面下载入口、上传读取模板、生成预检查结果，在预检查无阻断时生成待确认导入草稿，从草稿生成审计 / 事务保护计划，并允许管理账号从已保存计划生成 `MDE-*` 执行记录或正式导入；确认草稿、确认计划和执行记录都会优先通过 API 保存，API 会写本地 JSON 和操作日志。预检查读取器已支持外部工具另存时常见的压缩 ZIP、local header 尺寸为 0 / data descriptor、sharedStrings 富文本、公式缓存值、单引号 XML 属性、带属性的 `<v>` 值标签、缺省单元格坐标的顺序列和 workbook relationship target 归一化；`生效日期`、`盘点日期` 会把 Excel serial number 或常见日期文本归一化为 `YYYY-MM-DD`，但数量、单价、库存、机台计数等数字字段不会被当成日期。预检查后的 Excel 行数据会作为 `stagedRows` 进入草稿和计划，执行记录会生成导入 payload 与失败行报告。执行接口默认不写正式数据；管理账号在页面点击 `正式导入` 时会显式传入 `officialImportEnabled=true` 和本地事务 writer，API 仍支持 PostgreSQL writer 配置，且 PostgreSQL writer 已纳入 Docker live 冒烟验证。执行记录生成失败行时，可通过页面或 `GET /api/master-data/import-executions/{executionId}/failed-rows` 下载 CSV，也可先点击 `修正字段` 展开失败行内联编辑，再点击 `生成修正草稿` 调用 `POST /api/master-data/import-executions/{executionId}/failed-rows/correction-draft`；只有实际编辑过的行会作为 `rowCorrections` 计入 `correctedRowCount`，未编辑行仍计入 `unresolvedRowCount`。草稿仍是新的 `MDI-*` 非写入确认草稿，并回到现有生成计划 / 正式导入路径。正式导入员工后，管理账号可通过 `员工账号复核` 区把导入员工从 `pending_admin_review` 复核启用为 `account_enabled`，再发放本次可见临时密码；员工可用该临时密码进入独立的 `erp-runtime-session-v1` 正式会话，首次登录时业务权限为空，必须调用改密接口后才恢复对应角色权限；正式员工不再由 `seed-session` 表示。管理员可在同一区域重发临时密码或撤销密码，旧密码和旧 session 会失效；`runtimeIdentityRepository` 会持久化导入员工运行期账号和已吊销 token，默认本地 JSON 可重启恢复，生产 profile 可写入 PostgreSQL `users` / `seed_session_revocations`。V1 改密策略已固定为至少 10 位、包含字母和数字、不含空白字符、不能包含登录名 / 用户 ID / 员工 ID；连续 5 次失败登录会锁定 15 分钟，正式密码 90 天过期后会进入 `password_expired` 待改密状态。后续仍必须补更多真实 Excel 样本兼容、真实生产部署和真实数据导入现场验收。

## 页面入口

- 后续模块里的 `客户`、`价格表`、`排产` 等灰色入口现在会打开 `基础资料导入模板` 弹窗。
- 弹窗可下载 `全量基础资料`、`客户档案`、`价格表`、`初始库存`、`员工机台` 等模板组合。
- 每个单模块模板可独立上传预检查；价格表和初始库存仍必须带配套的`尺寸颜色款式` sheet，避免绕过规格键校验。
- 正式业务Sheet默认没有演示行；参考资料位于独立`示例-*`页，不参与预检查。复制示例时必须替换`示例-请替换`和全部演示值。
- 弹窗可上传填写后的 `.xlsx` 做预检查，显示状态、数据行、阻断项、需确认项、sheet 行数和前几条问题。
- D49员工机台专用模板填写后，可先运行`node scripts/run-d49-employee-workbook-precheck.mjs --file <filled-workbook.xlsx> --json`做离线只读预检查；只有`uploadAllowed=true`才进入网页上传，但网页仍会重新执行服务端权威预检查。
- 预检查无阻断时可点击 `加入确认队列`，生成当前会话内的 `MDI-*` 待确认草稿；草稿明确不写正式客户、价格、规格、库存、员工或机台数据。
- 确认队列草稿可点击 `生成计划`，生成 `MDP-*` 导入确认计划；计划列出目标表、写入模式、操作日志草稿、事务保护项和失败行下载要求。
- `生成计划` 优先调用 `POST /api/master-data/import-confirmation-plans`，办公室 / 管理账号有权限，库房账号会被拒绝；API 不可用时才保留为本地草稿。
- 管理账号可从已保存计划生成 `MDE-*` 执行记录；默认请求只保存导入 payload、阻断原因、失败行 CSV 和审计信息，不执行正式写库。
- 管理账号可点击 `正式导入`，页面会显式传 `officialImportEnabled=true` 和本地事务 writer；成功返回 `committed`，引用错误会整批回滚并记录失败。API 仍保留 PostgreSQL writer 配置入口。
- 有失败行的执行记录可点击 `下载失败行` 下载 CSV；该动作不写库，办公室 / 管理账号可下载，库房账号无权下载。
- 有失败行的执行记录可点击 `修正字段` 展开内联编辑区，按行修改字段或重置修改；再点击 `生成修正草稿` 时，已编辑行进入 `correctedRowCount`，未编辑行仍保持 `unresolvedRowCount`。草稿会显示来源执行记录，后续继续走 `生成计划` 和 `正式导入`。
- 正式导入员工资料后，管理账号可点击 `刷新复核` 查看待复核员工，并点击 `复核启用` 启用内部账号资料；办公室 / 库房账号无权复核启用。
- `基础资料 > 员工机台` 同步显示8岗位正式账号上线就绪矩阵，岗位阻塞来自服务端运行期身份门禁；seed账号不计入，摘要不返回账号标识或密码信息。
- 灰色模块仍表示独立维护页面未完成，只是先提供资料整理模板入口。

## 模板组合

| 模板 | 导入 Sheet | 用途 |
| --- | ---: | --- |
| 全量基础资料 | 5 | 一次整理客户、价格、规格、库存、员工机台。 |
| 客户档案 | 1 | 客户主体、联系人、地址、客户群、结算和风险状态。 |
| 价格表 | 2 | 价格表和尺寸颜色款式一起维护，避免价格找不到规格。 |
| 初始库存 | 2 | 初始库存和尺寸颜色款式一起维护，避免库存键不标准。 |
| 员工机台 | 1 | 员工、岗位、工资基础字段、车间机台和粗略产能。 |

每个模板另带`导入说明`和对应的`示例-*`参考页；页面数量只统计参与预检查和正式导入的业务 Sheet。

## Sheet 字段

| Sheet | 必填字段 | 说明 |
| --- | --- | --- |
| 客户档案 | 客户名称、联系人姓名、手机号 | 客户、联系人、地址、结算周期、默认价格表、客户群和备注。 |
| 价格表 | 价格表名称、价格类型、尺寸、单价、生效日期 | 袋子价格、印刷价格和客户专属价格版本；导入后应进入待审核。 |
| 尺寸颜色款式 | 标准尺寸、标准颜色、提手类型、成品款式 | 统一客户叫法、实际生产尺寸、颜色别名、提手和款式。 |
| 初始库存 | 尺寸、颜色、提手类型、成品款式、库区、库存状态、在库数量 | 按精确库存键导入库存，不直接冲掉历史流水。 |
| 员工机台 | 员工编号、员工姓名、角色；车间岗条件必填默认车间、默认机台 | 员工、岗位、工资基础值、机台和粗略日产能。 |

### D49 员工岗位填写规则

- V1正式岗位固定为：`办公室`、`库房 / 出库`、`财务 / 对账`、`车间报工`、`打包`、`司机`、`管理`、`技术运维`。
- 模板`角色`列提供上述8岗位的阻断式下拉；上传预检查和正式导入payload仍是最终权威校验，不能只依赖Excel界面限制。
- 已支持常用别名，例如`文员/录单/客服`、`仓库/出库`、`对账/收款`、`制袋/丝印/操作工`、`杂工`、`送货`、`主管/负责人`、`系统运维/运维`；前后端使用同一映射。
- 未知或拼错的角色会在上传预检查阶段直接阻断，不再静默归入车间岗位。
- `员工编号`、`员工姓名`、`角色`对所有员工必填；员工编号使用1-32位字母、数字、下划线或短横线且首位为字母/数字，按大小写不敏感唯一，是账号复核、改密和审计的稳定主键，系统不再按姓名 / 岗位自动生成。该规则在预检查、payload、本地事务和PostgreSQL中一致执行。`默认车间`、`默认机台`只对车间岗位条件必填；其他岗位应留空，不得为了通过导入填写虚假车间占位。
- 预检查、确认队列和确认计划会显示本次文件的岗位覆盖率及未覆盖岗位，例如`1/8`；覆盖不全只提示，允许按批次导入，最终D49仍以已启用且完成首次改密的正式账号`8/8`为准。
- 密码有效期不在Excel中手工填写。管理员启用账号并发临时密码后，员工首次正式改密时由系统生成90天有效期。
- 离线预检查报告只显示Sheet、行号、字段、通用问题和岗位覆盖，不显示员工姓名、员工编号原值、工作簿路径、密码或`stagedRows`；填写后的真实工作簿仍是受控业务文件，不得提交Git。

## 导入原则

- 先整表预检查，再由有权限人员确认导入。
- 客户、价格、库存、员工、机台都不能静默覆盖正式数据。
- 价格导入默认应进入 `待审核`，不直接影响订单计价。
- 库存导入必须写库存修正 / 初始盘点流水，不允许只改库存总数。
- 尺寸、颜色、提手、款式要先标准化，再用于订单识别、库存键和价格匹配。
- 历史订单、价格快照、库存流水不受后续主数据修改影响。

## 已有预检查

- 必填字段：检查客户名称、联系人、手机号、价格表名称、尺寸、单价、库存数量、员工姓名等必填项。
- 空表 / 示例：业务Sheet至少填写1行；未替换的`示例-请替换`标记直接阻断，演示资料不能进入确认队列。
- 字段结构：检查本次上传的业务 sheet 和字段是否缺失；单模块模板不要求无关sheet，价格/库存仍要求配套规格sheet。
- 重复数据：检查客户名称、价格项、规格键、库存键和员工编号等重复；重复员工编号在预检查和执行payload两层阻断，不静默合并。
- 价格风险：检查单价、阶梯起量、加长提加价，并提示明显偏高价格和非待审核状态。
- 库存风险：检查在库数量、占用、锁定、待处理数量，阻断占用合计大于在库数量。
- 规格匹配：价格表和初始库存中的尺寸 / 颜色 / 提手 / 款式必须能在 `尺寸颜色款式` sheet 找到。
- 员工机台：检查基础时薪、岗位补贴和粗略日产量等数字字段；同时阻断未知岗位，以及车间岗位缺默认车间或默认机台。
- 外部 Excel 兼容：读取器可处理外部另存后的压缩 ZIP、sharedStrings / 富文本、公式缓存值和部分单元格坐标省略场景；日期字段支持 Excel serial number 和常见文本格式归一化。
- 预检查通过后会保留 `stagedRows` 行数据，供后续确认计划、执行 payload 和正式写入器使用。

## 已有确认队列草稿

- `src/domain/masterDataImportReviewQueue.js` 生成 `p0-master-data-import-review-v1` 草稿。
- 草稿 ID 使用 `MDI-日期-哈希`，保留文件名、预检查版本、模板版本、sheet 摘要、问题数量、操作人和下一步提示。
- 草稿保留经过预检查的 `stagedRows`，避免后续执行记录没有真实 Excel 行数据可处理。
- 有阻断项的预检查不能加入队列；只有需确认项时状态为 `待人工确认`；无问题时状态为 `待确认导入`。
- 草稿设置 `officialImportEnabled: false`，表示当前仍不是正式导入，不能替代权限、审计和 PostgreSQL 事务落库。

## 已有确认计划草稿

- `src/domain/masterDataImportConfirmationPlan.js` 生成 `p0-master-data-import-confirmation-plan-v1` 计划。
- 计划只能从无阻断项的确认队列草稿生成，计划 ID 使用 `MDP-日期-哈希`。
- 计划会按 sheet 生成目标写入批次：客户、价格表、尺寸颜色款式、初始库存、员工机台分别映射到对应目标表和写入模式。
- 计划保留 `stagedRows`，并在摘要里记录 `stagedRowCount`。
- 计划包含操作日志草稿、事务策略、回滚要求、失败行下载要求和安全保护项，但仍设置 `officialImportEnabled: false`。

## 已有确认计划 API

- `server/masterDataImportReviewRepository.mjs` 默认用本地 JSON 保存确认队列草稿、确认计划、执行记录和相关操作日志。
- `GET /api/master-data/import-review-drafts` 可按 `draftId`、`status`、`sourceExecutionId` 查询确认草稿列表，包括失败行修正草稿。
- `POST /api/master-data/import-confirmation-plans` 从无阻断草稿生成确认计划，并写 `master_data_import_confirmation_plan_created` 操作日志。
- `GET /api/master-data/import-confirmation-plans` 可按 `draftId`、`planId`、`status` 查询确认计划列表。
- `master_data.import.plan.create` 权限目前开放给办公室和管理角色；库房 / 出库角色不能生成确认计划。
- API 响应仍强制 `officialImportEnabled: false` 和 `officialWriteScope: none`，表示这里只是导入前审计 / 事务计划保存，不是正式导入执行。

## 已有执行记录 API

- `src/domain/masterDataImportExecution.js` 生成 `p0-master-data-import-execution-v1` 执行记录。
- `src/domain/masterDataImportExecutionPayload.js` 生成 `p0-master-data-import-execution-payload-v1`，把客户、规格颜色、价格表、初始库存、员工和机台行映射成正式目标记录。
- `POST /api/master-data/import-executions` 必须传已保存的 `planId`，服务端会重新读取 `MDP-*` 计划，不接受前端直接传入的旧计划作为写入依据。
- `GET /api/master-data/import-executions` 可按 `draftId`、`planId`、`executionId`、`status` 查询执行记录列表。
- `GET /api/master-data/import-executions/{executionId}/failed-rows` 可下载执行记录生成的失败行 CSV；无失败行时返回业务错误。
- `POST /api/master-data/import-executions/{executionId}/failed-rows/correction-draft` 可从失败行生成新的 `MDI-*` 修正草稿；该接口保留来源执行记录、来源计划、失败原因、修正摘要和 `master_data_import_review_draft` 操作日志，不自动写正式主数据。
- `master_data.import.execute` 权限目前只开放给管理角色；办公室可以整理资料和生成计划，但不能请求执行记录。
- `master_data.import.plan.create` 权限可下载失败行和生成修正草稿，因为这些动作只用于修正资料、不执行正式写入；库房 / 出库角色仍无权下载或生成修正草稿。
- 默认执行记录仍保持 `officialWriteAttempted: false` 和 `officialWriteScope: none`，不会写正式主数据。管理账号显式传 `officialImportEnabled=true` 且 writer kind 为 `local_transaction` 或 `postgres` 时，执行记录可进入正式事务 writer；成功返回 `committed`，失败会记录回滚 / 失败状态。如果旧计划缺少 `stagedRows`，状态为 `缺少导入行数据`；如果存在未来暂未支持的行，状态为 `已生成失败行` 并返回 CSV 内容；5 类业务 Sheet 填写真实行并通过预检查后均可生成目标记录。

## 已有员工账号复核

- 员工导入后仍默认 `accountEnabled=false` / `pending_admin_review`，不会在导入时自动开通登录。
- `GET /api/master-data/employee-account-reviews` 查询待复核 / 已启用员工账号资料。
- `POST /api/master-data/employee-account-reviews/{employeeId}/enable` 由管理账号复核启用，写入 `account_enabled`、内部 user 投影和 `master_data_employee_account_review` 操作日志。
- `POST /api/master-data/employee-account-reviews/{employeeId}/password` 由管理账号发放或重发临时密码，要求员工账号已启用；服务端只保存运行期密码哈希，响应中的临时密码仅本次可见，并写入 `master_data_employee_account_password` 操作日志。
- `POST /api/auth/change-password` 由已登录的导入员工提交当前临时密码和新密码；临时密码登录期间 `mustChangePassword=true`，业务权限为空，改密成功后 `passwordStatus=active`、`mustChangePassword=false`，旧临时密码失效，并写入密码变更操作日志。V1 新密码规则为至少 10 位、包含字母和数字、不含空白字符、不能包含登录名 / 用户 ID / 员工 ID；策略错误会返回 `passwordPolicy`。
- 导入员工连续 5 次登录失败会返回 `AUTH_ACCOUNT_LOCKED` 并锁定 15 分钟；锁定期间正确密码也不能登录。正式密码改密后写入 90 天 `passwordExpiresAt`；过期后登录会进入 `passwordStatus=password_expired`、`mustChangePassword=true`，业务权限为空，必须先改密。
- `POST /api/master-data/employee-account-reviews/{employeeId}/password/revoke` 由管理账号撤销导入员工运行期密码；撤销后 `loginEnabled=false`、`passwordStatus=password_revoked`，旧密码和旧 session 失效，并写入密码撤销操作日志。重发临时密码也会让该员工旧 session 失效。
- `master_data.employee_account.review` 权限目前只开放给管理角色；办公室 / 库房账号无权查看或启用导入员工账号。
- `master_data.employee_account.password.issue` 权限目前只开放给管理角色；办公室 / 库房账号无权发放或撤销密码。
- 当前动态登录已具备第一版运行期账号 / token 吊销持久化边界、V1 密码策略、账号锁定 / 密码过期策略和管理端重发 / 撤销入口，但尚不等同于完整生产级身份系统；真实生产部署、现场账号验收、更多真实 Excel 样本兼容和真实数据导入现场验收仍是后续工作。

## 已验证

- `npm run master-data-template:check`：读取生成的 `.xlsx` ZIP 结构，确认 `导入说明`、`客户档案`、`价格表`、`尺寸颜色款式`、`初始库存`、`员工机台` sheet、关键字段和样例数据存在。
- `npm run master-data-precheck:check`：验证系统生成模板可通过预检查，故意错误模板会产生阻断和需确认问题，并覆盖外部另存工作簿样本（压缩 ZIP、sharedStrings 富文本、省略单元格坐标、公式缓存值、Excel 日期序列号）。
- 同一`master-data-precheck:check`还覆盖D49离线CLI的有效分批文件、空白模板、误用全量模板、重复编号去值报告和缺文件失败合同。
- `npm run master-data-review:check`：验证通过、需人工确认和阻断三类预检查结果能生成正确的确认队列草稿状态。
- `npm run master-data-confirmation-plan:check`：验证确认计划能从无阻断草稿生成，并阻止阻断草稿生成计划。
- `npm run master-data-execution-payload:check`：验证 staged 行能生成客户、价格、规格、库存、员工、机台、默认绑定和产能基准目标记录。
- `npm run master-data-transaction:check`：验证本地事务 writer 提交、引用错误整批回滚和 PostgreSQL 事务 SQL 边界。
- `npm run master-data-import-api:check`：验证确认计划 API、执行记录 API、权限拦截、阻断草稿拒绝、前端 API client、失败行 CSV 下载、失败行修正草稿生成、内联修正字段传入 `rowCorrections`、修正草稿列表、草稿级操作日志、员工账号复核启用、临时密码发放、临时密码登录权限收敛、首次登录改密、连续错误登录锁定、重发临时密码清除锁定并让旧 session 失效、撤销密码后旧密码 / 旧 session 失效、动态员工登录、操作日志和本地 JSON 重启读回。
- `npm run runtime-identity:check`：验证导入员工运行期账号和 token 黑名单可重启恢复，覆盖改密后旧密码失败 / 新密码成功、连续错误登录锁定持久化、正式密码过期后收回业务权限、过期后改密恢复权限、logout 后 token 跨重启仍返回 `AUTH_TOKEN_REVOKED`，并确认持久化文件不含明文密码。
- `npm run db:check` / `npm run db:migrate:dry`：验证员工、机台、默认绑定和产能基准迁移纳入迁移集合。
- `npm run db:postgres-live:check`：验证主数据导入 PostgreSQL writer 能在 Docker 临时 PostgreSQL 中写入并读回核心客户、价格、规格、库存、员工、机台和操作日志记录。
- `npm run api:validate-openapi`：验证 `MasterData` OpenAPI 路由和 schema 引用有效。
- `npm run auth:check` / `npm run api:check`：验证权限服务和 API 骨架仍通过。
- `npm run build`：确认 React 页面和模板生成代码能通过前端构建。
- `git diff --check`：确认没有空白错误。
- 内置浏览器固定桌面和手机视口检查模板弹窗、确认队列和确认计划区无页面级横向溢出，截图见 `screenshots/p0-master-data-confirmation-plan-1280.png` 和 `screenshots/p0-master-data-confirmation-plan-390.png`。
- 内置浏览器固定 `1280x720` 和 `390x844` 视口检查 `员工账号复核` 区可见、ERP 页面错误为 0，body/modal/员工复核区无横向溢出，截图见 `screenshots/p0-master-data-employee-review-1280.png` 和 `screenshots/p0-master-data-employee-review-390.png`。
- 内置浏览器固定 `1280x720` 和 `390x844` 视口实点 `复核启用 -> 发临时密码`，确认临时密码条可见、ERP 页面错误为 0，body/modal/员工复核行/密码条无横向溢出，截图见 `screenshots/p0-master-data-employee-password-1280.png` 和 `screenshots/p0-master-data-employee-password-390.png`。

## 后续工作

- 继续扩大真实 Excel 样本兼容矩阵，尤其是客户历史表、WPS / Excel / Numbers 另存文件和混合格式日期。
- 继续加固 PostgreSQL 仓储 / 事务边界，扩大外部 Excel 样本、失败场景和真实数据导入验收覆盖。
- 增加真实生产身份部署验收、真实账号迁移 / 运维流程和更多真实 Excel 样本兼容。
- 增加员工账号批量复核启用和特殊权限复核。
- 增加真实样本回归和现场导入验收记录。
