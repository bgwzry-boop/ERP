# Git 基线纳管计划

最后更新：2026-07-10

## 目的

当前工作区的 API、脚本、迁移和大量前端模块此前尚未纳入 Git 跟踪，无法形成可靠的交付、审查或回滚基线。本计划定义可审查的分组和每组验证，并记录从暂存到本地提交的实际执行状态；远端推送与恢复验证仍需在受控仓库中完成。

已确认 `.gitignore` 会排除 `node_modules/`、`dist/`、`.erp-local-storage/`、`screenshots/` 和 `.env*`。不得用无差别 `git add -A` 代替以下分组。

## 当前执行状态

- 2026-07-10：已按以下四组复核 `367` 个文件，包含运行与数据层、前端领域代码、开发/产品/交接文档及 CI；未追踪源文件为 `0`。
- 已执行忽略规则与敏感模式复核、`git diff --cached --check`、`npm ci`、`npm test` 和 OpenAPI 校验；内容不包含 `.erp-local-storage/`、`screenshots/`、`dist/`、`node_modules/` 或真实 `.env*` 文件，依赖审计为 `0` 个漏洞。
- 已创建本地基线提交 `72f25c4`（`chore: establish audited ERP implementation baseline`）。当前未配置 Git 远端，尚未完成本机外备份或全新 clone 恢复验证；不得把“已提交”表述为生产上线或现场验收完成。

## 分组

1. **运行与数据层**：`db/`、`server/`、`scripts/`、`package.json`、`package-lock.json`、`eslint.config.mjs`、`vite.config.mjs`。
   验证：`npm test`、`npm run api:validate-openapi`、`git diff --check`。

2. **前端领域代码**：`src/auth/`、`src/components/`、`src/domain/`、`src/pages/`、`src/services/`、`src/state/`，连同已跟踪的 `src/App.jsx`、`src/data/fixtures.js`、`src/lib/orderParser.js`、`src/styles.css`。
   验证：`npm test`、浏览器首屏和订单录入页重载、控制台错误检查。

3. **开发与产品文档**：`docs/development/`、`docs/product/assets/price-size-table-2026-07-03.png`，以及根目录的项目状态、决策、路线图和交接文档。
   验证：链接检查、`git diff --check`，并确认不包含真实环境值、对象存储地址、token、截图产物或 `.erp-local-storage` 内容。

4. **自动化**：`.github/workflows/ci.yml`。
   验证：确认工作流仅使用只读权限，执行 `npm ci && npm test`，不访问生产环境或真实设备。

## 暂存前检查

```sh
git status --short
git check-ignore -v .erp-local-storage dist node_modules .env .env.local
git diff --check
npm test
```

## 提交建议

- 首个本地基线提交已完成；配置受控远端后，应先复核分支和提交范围，再推送并进行全新 clone 恢复验证。
- 后续每个提交只包含一个可复核主题；提交前重新检查暂存区，而不是依赖工作区状态。
- 真实 PostgreSQL、对象存储、打印机、手机设备和现场证据仍不可提交为“已验证”结论，除非对应 live / 现场证据确实存在。
