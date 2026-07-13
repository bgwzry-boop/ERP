# Git 发布基线整理方案

最后更新：2026-07-13（V8.119）

## 当前结论

当前分支为 `codex/p0-office-hardening`，HEAD 为 `801f97118cc9`。仓库没有配置受控 Git 远程，工作区也不是干净候选，因此不能进行正式发布或全新 clone 恢复验证。

V8.83 新增只读审计器：

```sh
npm run git-baseline-scope:check
node scripts/run-git-baseline-scope-audit.mjs --json --write
```

审计器会把 `git status` 中折叠显示的未跟踪目录展开到文件级，并阻断未归类、重复、`.erp-local-storage/`、`dist/`、`node_modules/`、`screenshots/`、真实 `.env*` 和密钥文件。V8.84进一步扫描已跟踪文件的新增行和未跟踪文本文件，阻断私钥头、真实格式AWS/GitHub/Slack令牌及生产代码中的带密码PostgreSQL URL；报告只保留相对文件、规则和位置，不输出匹配内容。它不会执行 `git add`、`git commit` 或 `git push`。

当前文件级结果以最新审计报告为准：`.erp-local-storage/git-baseline-scope-audit/latest.json`。V8.119新增待办引用投影并同步状态文档后为224个文件，其中未跟踪80个、暂存0个；5组全部归类，远端0、敏感路径/内容命中0。真实人员草稿位于Git忽略的受控目录，动态生成器和交付XLSX位于仓库外，均不进入发布基线。最终数字必须在暂存前重新生成。

## 所有权分组

| 顺序 | 分组 | 当前内容 | 提交边界 |
| --- | --- | --- | --- |
| 1 | 数据库、后端与共享领域 | 迁移、订单/库存/身份领域、command service、repository、API组合入口 | 先确认迁移、事务、权限、幂等、PostgreSQL live一致，不能遗漏 `0019` / `0020`。 |
| 2 | 前端业务、交互与样式 | 订单/库存/基础资料、生产/V1拆分、CSS分层、旧 `src/styles.css` 删除 | 新样式文件必须与旧入口删除同批，避免部署后无样式；桌面/手机回归同批。 |
| 3 | 业务与结构回归脚本 | 订单、库存、生产、V1、PostgreSQL及结构检查 | 与对应业务提交紧邻；不得单独提交会引用尚未纳管源码的测试。 |
| 4 | 测试编排与发布审计工具 | manifest runner、当前文档门禁、Git基线审计、`package.json` | runner、自检、package脚本和文档必须同批，保持公开命令兼容。 |
| 5 | 产品、项目与发布治理文档 | 需求、状态、路线、决策、整改方案、历史归档和培训图 | 最后按已验证代码真值更新；不得先写“已完成”再补代码或证据。 |

当前文件可能跨越多个业务轮次，因此不能机械地对整个工作区执行一次提交。`server/apiServer.mjs`、`src/App.jsx`、`package.json` 等共享入口需要按已验证主题检查 diff；若无法可靠按 hunk 拆分，应先固定一个完整、全量通过的候选提交，再从该提交开始恢复小提交纪律。

## 暂存顺序

1. 重新运行范围审计，要求 `unclassified=0`、`duplicate=0`、`forbidden=0`、`sensitive=0`。
2. 先暂存数据库/后端/共享领域及其对应回归，确认 `0019` 与库存意图代码同批、`0020`与员工身份规则/事务代码同批。
3. 暂存前端/UI和对应结构回归，确认新CSS全部纳管、旧根CSS删除同步发生。
4. 暂存runner、发布审计工具和 `package.json`，核对测试组数量与顺序。
5. 最后暂存当前文档和完整历史归档，复核运行数字仍为发布 `0/4`、证据 `0/34`、签字 `0/6`。
6. 每组暂存后都运行 `git diff --cached --check` 和 `git diff --cached --name-status`，人工复核后才提交。

不得使用无差别 `git add -A` 绕过分组复核。当前未收到用户提交授权，本轮保持暂存区为0。

## 验证矩阵

| 分组 | 最低验证 |
| --- | --- |
| 后端/数据库 | `npm run check:core`、`npm run db:postgres-live:check`、`npm run api:validate-openapi` |
| 前端/UI | `npm test`、`npm run e2e:core`、目标页面桌面/手机浏览器验收 |
| 回归/工具 | `npm run check-group-runner:check`、`npm run git-baseline-scope:check`、dry-run清单数量复核 |
| 文档 | `npm run current-project-docs:check`、链接/数字复核、`git diff --check` |
| 完整候选 | `npm test`、PostgreSQL live、E2E、OpenAPI、依赖审计、前端/API 200 |

## 发布退出条件

只有同时满足以下条件，Git基线问题才可关闭：

- 所有改动文件有唯一所有权，禁止/敏感路径为0。
- 暂存内容经过人工范围复核并形成明确提交，不包含真实env、密钥或现场原始证据。
- 配置受控远程并完成推送，远端不是临时个人目录。
- 生产部署使用固定commit，不使用未提交工作区。
- 在全新目录从该远程clone、detached checkout固定commit后，安装、构建、迁移计划和runtime smoke通过。
- 远程恢复通过仍只代表发布基线可恢复，不能替代D49-D53真实环境、设备、业务试跑、现场证据和签字。
