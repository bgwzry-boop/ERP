# ERP V1 生产放行工作流

## 作用

`.github/workflows/v1-production-release-gate.yml` 是 V1 小范围真实上线的最终 CI 放行入口。它与普通 PR CI 分开：普通 CI 证明代码、迁移、临时 PostgreSQL / MinIO 和浏览器闭环可复现；生产放行工作流连接真实生产 API，并要求真实 production env、现场证据、负责人签字和 V1/V2 边界全部通过。

该工作流只允许手工触发，不响应 `push` 或 `pull_request`，且必须运行在受保护的自托管生产门禁 runner 上。

## GitHub 配置

1. 创建 GitHub Environment：`v1-production-release`。
2. 给该 Environment 配置 required reviewers，至少包含技术/管理负责人；未审批前不得向 job 注入 secrets。
3. 准备 Linux 自托管 runner，并添加标签：`self-hosted`、`linux`、`erp-production-gate`。
4. runner 必须能访问真实生产 ERP HTTPS API，并具备 Node.js action、Docker、Ruby、Chromium 系统依赖和临时文件清理能力。
5. Environment variables：
   - `ERP_V1_RELEASE_OPERATOR_ID`：正式办公室/管理验收账号 ID。
   - `ERP_V1_RELEASE_DRIVER_OPERATOR_ID`：正式司机验收账号 ID。
6. Environment secrets：
   - `ERP_V1_PRODUCTION_ENV_FILE_B64`：已审计、未跟踪、权限 `0600` 的 production env 文件完整内容做 base64 后的值。
   - `ERP_V1_FIELD_EVIDENCE_MANIFEST_B64`：当前已填写现场证据 manifest 完整 JSON 做 base64 后的值。

不要把解码后的 env、manifest、token、连接串、bucket 密钥或真实签字内容写入 GitHub variables、workflow inputs、仓库文件或命令参数。工作流只把两份 secret 解码到 `$RUNNER_TEMP/erp-v1-production-release-input/<run-id>/`，不纳入 artifact，结束时无条件删除。

## 触发输入

- `commit`：完整、小写、40 位不可变 Git SHA；工作流会 checkout 并再次比对 `HEAD`。
- `production_api_base_url`：真实生产 HTTPS API，必须以 `/api` 结尾。
- `confirmation`：固定填写 `RELEASE-V1-SMALL-SCOPE`。

## 阻断顺序

1. 不可变 commit、手工确认、生产 API HTTPS、正式验收账号和干净 checkout。
2. `npm ci`、全量测试、全依赖 high 级漏洞审计和 OpenAPI。
3. 临时 PostgreSQL 迁移 / 实库回归、真实 MinIO 双 bucket 回归、核心 Playwright E2E。
4. production env 文件安全审计与生产变量预检。
5. 现场证据 manifest：至少 `34/34`，负责人签字至少 `6/6`，V1/V2 边界已确认，证据引用无疑似敏感值。
6. 真实生产 API release candidate：`4/4`，运行时 readiness 与现场验收报告均 ready。
7. go-live suite 可宣布 V1 完成，所有生成步骤 ready。
8. 最终生成 `erp-v1-production-release-attestation-v1`，记录 commit 和三份输入报告 SHA-256，不复制证据编号、签字人或环境真实值。

任一步失败都会让 workflow 失败。禁止添加 `continue-on-error`、`--allow-blocked-exit-zero`，也禁止把普通自动化 fixture 当作生产现场证据。

## 放行产物

workflow artifact `v1-production-release-gate-<run-id>` 默认保留 30 天，包含脱敏 release candidate、go-live suite 和最终 attestation。artifact 不包含 production env 原文、现场 manifest 原文、证据编号或签字人。

工作流通过表示具备进入负责人最终 go/no-go 复核的技术条件，不自动执行部署、数据库迁移写入、打印、司机送达或扩大使用范围。最终仍按批准的灰度窗口执行小范围真实订单。
