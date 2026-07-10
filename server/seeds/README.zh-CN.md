# 后端种子数据目录

本目录用于把前端 P0 synthetic fixtures 接到后端骨架。当前只提供办公室端 synthetic seed，不代表真实客户数据。

## 当前文件

- `syntheticOfficeSeed.mjs`：从 `src/data/fixtures.js` 的 `createOfficeScenarioData(...)` 生成后端 seed workspace。

## 当前边界

- 数据仍是 synthetic fixtures，用来验证 API 路由、OpenAPI 合同和前端页面联动。
- 不包含真实脱敏订单、真实客户、真实库存或正式价格表。
- 后续 real-sample seed 应单独放文件，并通过环境变量或脚本选择，避免覆盖 synthetic fixtures。

## 下一步

1. 增加 20-50 条真实脱敏订单样例入口。
2. 将真实样例覆盖现货有货、缺货、定制印刷、快递快运、送货、自提、数量差异和收款差额。
3. 让后端 API 骨架支持 synthetic / real-sample 数据集切换。
