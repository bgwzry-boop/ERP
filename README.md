# 袋袋赢 ERP

包装工厂 ERP，覆盖原料收货与卷料库存、订单、生产交付、成品库存、财务以及基础资料。完整评审界面不代表所有业务已通过生产验收。

先读 [项目入口](00_项目入口.md)、[当前状态](01_当前状态与下一步.md) 和 [当前问题记录](02_问题或报错日志.md)。业务约束从 [AGENTS.md](AGENTS.md) 按领域进入；产品事实见 [中文需求](docs/product/requirements.zh-CN.md)。

## 本地开发与检查

```bash
npm ci
npx playwright install chromium
npm run review:dev
npm run review:check
```

4174 只运行 `docs/prototypes/raw-material-roll-inventory-review` 完整桌面/手机评审应用；显示 `本地修改稿 · 未部署`、基线提交及修改状态。由任务运行服务并在身份检查通过后打开应用内预览。根工作台 5173 仅供内部开发，裸入口重定向到 4174，不作为交付预览。

`npm test` 执行代码、业务合同和浏览器检查；`npm run build` 仅生成构建产物。测试、构建和本地预览均不是发布。

## 版本与发布

新修改从远端 `codex/staging-current` 开独立工作树。只有明确的集成/发布任务可部署，必须使用完整推送的不可变 40 位提交、目标专属发布锁，并核验前端与 API 身份完全一致。Staging 发布后必须让该基线分支非强制前移到实际部署提交。

[本轮审核整改](docs/reviews/2026-09-05-project-audit-remediation.md) 记录集成与修复证据。[历史对话](docs/conversation/README.md)、[历史状态](docs/history/audit-2026-09-05/PROJECT_STATUS.md) 只用于追溯；不能据历史百分比宣称当前生产就绪。
