# 2026-10-28 测试站候选：油墨色合组、抹零结清与订单拆分

本文件只准备 staging 发布。不切换正式生产。是否发布完成，以同一把锁、线上前端、`/api/health`、canonical 和干净主目录的最终核对为准。

## 当前线上

- 地址：`https://erp-staging.luxingpack.com/`
- 版本：`staging-20261024-p1-r4`
- 提交：`080863ebc62b1a32ff989d54eb1b427548511894`
- 锁摘要：`155e642ce68169c4e82ac96297ebad4f58ce21754a2eb003c39e71c75c402acb`

## 候选

- 分支：`cursor/integrate-o10-order-split-bdd1`
- 基线祖先：上述线上提交
- 来源：`cursor/o10-ink-color-and-leftover-reject-2df9` @ `bc4f476825caf88162846967c8cf9e68bd7309ca`，以及 `codex/order-entry-split-20261025` @ `c4d36e96d17d03995919d85c1598f88f52d1bec7`
- 建议版本名：`staging-20261028-o10-split-r1`
- 要部署的提交是该分支推送后的 tip。不要把本说明文件里的文字当成提交号。

合入内容：

1. 印刷合组要求同尺寸、完全相同内容、同一油墨色和印刷面条件。袋身色不同仍可合。例：白袋印红与黑袋印红各 1000，按 2000 合组。
2. 原料整卷进出。余料回可用被拒绝。
3. 办公室把账单金额减实付登记为抹零，账期立即结清，并通知老板、财务、管理待阅。例：应收 10850、实收 10500、抹零 350。两列分开，年底分别汇总。应收不被改写。
4. 通货可以混装。定制单拒绝混装。
5. 订单录入可以拆行，并按客户或交付拆成正式多号。

## 在能登录测试服务器的机器上发布

主目录保持干净的 `codex/staging-current`，origin 使用不带访问令牌的 `https://github.com/bgwzry-boop/ERP`。先确认线上仍是上面的基线，再发布候选。传输脚本用上一版 staging 已审核的那份，不要单独运行历史一次性切换脚本。

```bash
git fetch origin cursor/integrate-o10-order-split-bdd1
git rev-parse origin/cursor/integrate-o10-order-split-bdd1
npm run release:check

npm run controlled-release:prepare -- \
  --target staging \
  --expected-commit <上面的完整 tip> \
  --version staging-20261028-o10-split-r1 \
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
