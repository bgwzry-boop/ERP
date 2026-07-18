# 后端种子数据目录

本目录用于把前端 P0 synthetic fixtures 接到后端骨架。默认使用办公室端 synthetic seed，不代表真实客户数据；已提供私有 real-sample JSON 的受控加载入口。

## 当前文件

- `syntheticOfficeSeed.mjs`：从 `src/data/fixtures.js` 的 `createOfficeScenarioData(...)` 生成后端 seed workspace。
- `officeSeedLoader.mjs`：选择 `synthetic` 或私有 `real_sample` 数据集，并校验样例来源、匿名化、覆盖范围、文件权限和开发环境边界。
- `realSampleOfficeSeedIntake.mjs`：生成不可覆盖的私有空模板，并对填写后的真实样例做脱敏汇总预检；不启动 API、不写业务数据、不输出路径或来源消息。

## 当前边界

- 数据默认仍是 synthetic fixtures，用来验证 API 路由、OpenAPI 合同和前端页面联动。
- real-sample 文件不提交 Git。仅允许放在仓库外，或放在已忽略的 `.erp-local-storage/real-samples/` 下，且文件权限必须为 `0600`。
- 开发或测试环境显式设置 `ERP_OFFICE_SEED_SOURCE=real_sample` 和 `ERP_REAL_SAMPLE_SEED_FILE=<private-json>` 才会加载真实样例；未设置时始终保持 synthetic。production 模式禁止 real-sample seed。
- real-sample JSON 必须使用 `erp-real-sample-office-seed-v1`，保留 20-50 个已确认匿名案例及其来源消息，覆盖现货有货/缺货、定制印刷、快递快运、送货、自提、数量差异和收款差额；文件会阻断手机号、身份证号、邮箱和原型客户名。
- 模板只能经显式确认写入`.erp-local-storage/real-samples/`，且不会覆盖已有文件；预检默认以阻塞退出码返回，只输出案例数、消息数、覆盖项和工作区记录计数。

## 下一步

1. 显式生成私有空模板，收集并复核 20-50 条真实脱敏订单 / 会话，再运行离线预检。
2. 用该 JSON 在 demo/test 环境执行订单、库存、交付和对账主流程回归。
3. 不把 real-sample 作为 production 数据导入或正式上线依据。
