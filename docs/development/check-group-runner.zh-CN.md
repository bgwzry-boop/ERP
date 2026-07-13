# 测试分组执行器

最后更新：2026-07-13

## 目的

`pretest`、`test` 和 `check:core` 不再把上百个 `npm run` 写成单行 shell 链。测试顺序集中维护在 `scripts/check-group-manifest.mjs`，由 `scripts/run-check-group.mjs` 顺序执行。

这次调整不减少测试覆盖：

- `pretest`：6项订单识别、草稿队列和库存意图前置检查。
- `core`：95项核心前后端、仓储、构建、发布、当前文档和Git基线范围门禁检查，其中包含runner自检。
- `test`：27项外层检查加完整 `core`，合计122项。
- `batch-a`：7项运行模式、角色权限、API安全、认证和持久化profile检查。
- `batch-b`：18项幂等、事务、仓储和PostgreSQL live检查。

## 使用

```bash
npm test
npm run check:core
npm run batch-a:check
npm run batch-b:check
npm run check:core -- --dry-run
npm run check:core -- --dry-run --json
```

正常执行会输出当前分组、序号、总数和脚本名。任一脚本失败时立即停止，并明确报告失败位置和退出原因。

`--dry-run` 只展开清单，不执行检查；`--json` 可输出机器可读结果。未知分组固定返回退出码2。

## 修改规则

1. 先确认新增检查属于 `pretest`、`test` 外层还是 `core`。
2. 在 `package.json` 保留可单独执行的脚本名。
3. 在 `check-group-manifest.mjs` 中按业务依赖顺序增加该脚本。
4. 更新 `check-check-group-runner.mjs` 的数量或边界断言。
5. 先运行 `npm run check-group-runner:check` 和dry-run，再运行完整 `npm test`。

不要在分组清单中引用 `pretest`、`test` 或 `check:core` 自身；跨分组复用使用 `@core`，runner会阻断未知分组和循环引用。

## 当前边界

顶层生命周期和Batch A/B已收口。部分领域脚本内部的短组合命令仍保留原状，后续只迁移确实影响维护和失败定位的组合，不能一次性机械替换。
