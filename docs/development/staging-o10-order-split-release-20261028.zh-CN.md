# 2026-10-28 测试站候选：油墨色合组、抹零结清与订单拆分

本文件只准备 staging 发布。不切换正式生产。是否发布完成，以同一把锁、线上前端、`/api/health`、canonical 和干净主目录的最终核对为准。

## 当前线上

- 地址：`https://erp-staging.luxingpack.com/`
- 版本：`staging-20261024-p1-r4`
- 提交：`080863ebc62b1a32ff989d54eb1b427548511894`
- 锁摘要：`155e642ce68169c4e82ac96297ebad4f58ce21754a2eb003c39e71c75c402acb`

## 候选

- 集成分支：`codex/fix-custom-packing-release-20261028`
- 本轮基于用户指定的 `c35f94444ac0ac533f80f1254d6c9252772f23aa`（来源分支 `cursor/integrate-o10-order-split-bdd1`），只补打包入口与相应回归，不改抹零结清规则。
- 基线祖先：上述线上提交
- 来源：`cursor/o10-ink-color-and-leftover-reject-2df9` @ `bc4f476825caf88162846967c8cf9e68bd7309ca`，以及 `codex/order-entry-split-20261025` @ `c4d36e96d17d03995919d85c1598f88f52d1bec7`
- 建议版本名：`staging-20261028-o10-split-r3`
- `12399af94cafec1d2f32bf4273572d77852bfb1e` 不是发布候选。它的完整检查在第 64/159 项 `api:check` 失败：收款综合用例仍按旧规则要求保留未结差额。
- r2 的 159 项检查通过，但后续真实浏览器发现定制单打包入口被混装限制一起隐藏、桌面测试仍在使用旧单明细入口，因此未部署 r2。本轮 r3 修好后重新验证并生成新 tip；不部署 `12399af9` 或 `c35f9444` 本身。
- 要部署的提交是本修复推送后的分支 tip。不要把本说明里的文字当成那次提交号。

合入内容：

1. 印刷合组要求同尺寸、完全相同内容、同一油墨色和印刷面条件。袋身色不同仍可合。例：白袋印红与黑袋印红各 1000，按 2000 合组。
2. 原料整卷进出。余料回可用被拒绝。
3. 办公室把账单金额减实付登记为抹零，账期立即结清，并通知老板、财务、管理待阅。例：应收 10850、实收 10500、抹零 350。两列分开，年底分别汇总。应收不被改写。
4. 通货可以混装。定制单拒绝混装，但保留独立单明细打包入口：实物逐包数量、人工核对、书面依据、提交前摘要，以及回执未知时的同编号重试。继续使用原有可信打印流程，不把定制单伪造成混装包组。
5. 订单录入可以拆行，并按客户或交付拆成正式多号。

## 在能登录测试服务器的机器上发布

主目录保持干净的 `codex/staging-current`，origin 使用不带访问令牌的 `https://github.com/bgwzry-boop/ERP`。先确认线上仍是上面的基线，再发布候选。传输脚本用上一版 staging 已审核的那份，不要单独运行历史一次性切换脚本。

```bash
git fetch origin codex/fix-custom-packing-release-20261028
git rev-parse origin/codex/fix-custom-packing-release-20261028
npm run release:check

npm run controlled-release:prepare -- \
  --target staging \
  --expected-commit <上面的完整 tip> \
  --version staging-20261028-o10-split-r3 \
  --output .erp-local-storage/releases/staging.lock.json

npm run controlled-release:deploy -- \
  --lock .erp-local-storage/releases/staging.lock.json \
  --expected-target staging \
  --expected-commit <同一完整 tip> \
  --base-url https://erp-staging.luxingpack.com/ \
  --main-dir /Users/xu/Documents/ERP \
  --transport-script <上一版 staging 已审核的传输脚本>
```

`controlled-release:deploy` 会先做门禁，再传输，再 `controlled-release:finalize`。finalize 验明前端和 API 之后，才非强制推进 `codex/staging-current`。不要在服务器实际跑上这个提交之前把 PR 合并进 canonical。

本云端工作区的 origin 带访问令牌，`release:check` 会把仓库来源判为不匹配。这不代表线上基线变了。发布必须在 Roy 本机完成。

## r3 验证范围

- `npm test`：完整检查新增 `single-packing:check`；核心定制生产→单独打包→可信打印→快运→对账不跳步，抹零结清继续保留。
- 桌面混装实测改为真正的 `/packing-groups/{id}/replace`：提交前不写入，逐包人工核对、独立包码、冷读取与刷新后不重复写入；不使用过时的单明细字段测试通货混装。
- 独立打包组件隔离浏览器覆盖：390px 手机与桌面无溢出、权限与任务隔离、输入保留、摘要焦点与返回、丢失回执/重挂载/409 仍沿用同一请求，未收到完整回执不报成功。
- 服务器部署只读验收与完整数据库指纹比对；不创建/删除业务记录，不调用 OCR，不动正式生产。canonical 仅允许在服务器实际运行新 tip 并通过锁身份核验后，由受控 finalize 非强制前移。
