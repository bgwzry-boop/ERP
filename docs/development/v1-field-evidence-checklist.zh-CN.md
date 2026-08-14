# ERP V1 现场证据清单

最后更新：2026-07-04

## 使用方式

1. 复制 `docs/development/v1-field-evidence-manifest.template.json` 到安全的、不会提交真实敏感信息的位置。
2. 生成 `.erp-local-storage/v1-field-evidence-intake/` 采集包，先阅读 `intake-rules.zh-CN.md`，再填写 `evidence-items.csv` 和 `signoff-boundary.csv`。
3. 只在证据字段填证据编号、工单号、截图文件名、报告路径或现场签字单编号；不要填数据库连接串、对象存储密钥、命令路径、spool 路径或客户隐私原文。
4. 每个必填项必须改成 `passed` 或 `accepted` 并填写证据编号；所有负责人签字、V1/V2 边界确认完成后再跑校验和 release candidate。

```bash
node scripts/run-v1-field-evidence-intake-pack.mjs --manifest <current-manifest> --output-dir .erp-local-storage/v1-field-evidence-intake
node scripts/apply-v1-field-evidence-intake.mjs --manifest <current-manifest> --csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv --output .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json
node scripts/validate-v1-field-evidence-manifest.mjs --manifest .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json
node scripts/run-v1-release-candidate-check.mjs --use-production-env-setup-env-file --field-evidence-manifest .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json --api-base-url https://<erp-host>/api
node scripts/run-v1-go-live-suite.mjs --refresh-release-candidate --use-production-env-setup-env-file --field-evidence-manifest <current-manifest> --field-evidence-intake-csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --field-evidence-signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv --field-evidence-draft-output .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json --output-root .erp-local-storage/v1-go-live-suite --sync-canonical-latest
```

## 现场证据项

### 生产持久化

负责人：技术 / 管理

| 证据项 | 必填 | 状态 | evidenceRef | 备注 |
| --- | --- | --- | --- | --- |
| PostgreSQL 迁移已在生产库执行 | 是 | pending | 待填 |  |
| 生产库备份策略和负责人已确认 | 是 | pending | 待填 |  |
| 恢复演练或恢复样本已留档 | 是 | pending | 待填 |  |
| 生产库账号、最小权限和连接池配置已确认 | 是 | pending | 待填 |  |
| V1 生产环境变量预检已达到 10/10 | 是 | pending | 待填 |  |

### 对象存储 / 附件留档

负责人：技术 / 财务

| 证据项 | 必填 | 状态 | evidenceRef | 备注 |
| --- | --- | --- | --- | --- |
| 附件 bucket 权限、生命周期和备份策略已确认 | 是 | pending | 待填 |  |
| 附件上传、读回和内容摘要一致性已通过 | 是 | pending | 待填 |  |
| 附件短期访问地址可读取且过期策略已验证 | 是 | pending | 待填 |  |
| 附件访问审计已写入并可查询 | 是 | pending | 待填 |  |
| 对账导出文件已写入对象存储并可重新下载 | 是 | pending | 待填 |  |

### 打印硬件 / CUPS / 标签

负责人：办公室 / 仓库

| 证据项 | 必填 | 状态 | evidenceRef | 备注 |
| --- | --- | --- | --- | --- |
| 真实 CUPS 队列 non-printing 预检已通过 | 是 | pending | 待填 |  |
| 标签机真实样张已出纸并留档 | 是 | pending | 待填 |  |
| 针式单据真实样张已出纸并留档 | 是 | pending | 待填 |  |
| 标签纸 / 针式纸对位和尺寸已确认 | 是 | pending | 待填 |  |
| 打印条码可被扫码设备读取并匹配包裹 | 是 | pending | 待填 |  |
| spool 状态或驱动回写已确认 | 是 | pending | 待填 |  |
| 作废重打流程已用真实设备验证 | 是 | pending | 待填 |  |

### 司机真机 / 原生壳

负责人：司机 / 技术

| 证据项 | 必填 | 状态 | evidenceRef | 备注 |
| --- | --- | --- | --- | --- |
| 真实 Android / iOS 手机已安装并登录 | 是 | pending | 待填 |  |
| 相机权限、拍照和水印信息已通过 | 是 | pending | 待填 |  |
| 纸质包裹标签原生扫码已匹配任务 | 是 | pending | 待填 |  |
| 定位权限和送达位置记录已通过 | 是 | pending | 待填 |  |
| 地图导航桥接可打开并到达正确地址 | 是 | pending | 待填 |  |
| 弱网或失败上传兜底流程已确认 | 是 | pending | 待填 |  |

### 真实业务试运行

负责人：办公室 / 仓库 / 财务

| 证据项 | 必填 | 状态 | evidenceRef | 备注 |
| --- | --- | --- | --- | --- |
| 真实客户订单录入、识别和确认已通过 | 是 | pending | 待填 |  |
| 真实库存占用、释放和缺货提示已通过 | 是 | pending | 待填 |  |
| 真实出库、交付、异常和重打流程已通过 | 是 | pending | 待填 |  |
| 真实生产 / 打包任务和成品图复核已通过 | 是 | pending | 待填 |  |
| 真实对账、收款、差额和核销流程已通过 | 是 | pending | 待填 |  |
| 异常待办责任人、提醒和处理闭环已确认 | 是 | pending | 待填 |  |

### 工资 / 考勤真实闭环

负责人：财务 / 管理

| 证据项 | 必填 | 状态 | evidenceRef | 备注 |
| --- | --- | --- | --- | --- |
| 全部在职员工档案、计薪基础和得力身份映射已通过严格预检 | 是 | pending | 待填 |  |
| 得力初始化、首次只读同步和稳定员工映射已核对 | 是 | pending | 待填 |  |
| 完整自然月考勤已导入且未匹配身份和异常均已清零 | 是 | pending | 待填 |  |
| 首月正式计薪规则已由负责人审批并发布生效版本 | 是 | pending | 待填 |  |
| 首期工资草稿、会计复核、管理锁定、不可变导出和发薪确认已闭环 | 是 | pending | 待填 |  |
| 正式员工账号只能查看本人打卡、工时、月度预估和历史工资 | 是 | pending | 待填 |  |

### 账号 / 权限 / 运维

负责人：技术 / 管理

| 证据项 | 必填 | 状态 | evidenceRef | 备注 |
| --- | --- | --- | --- | --- |
| 生产用户、岗位、角色和禁用名单已确认 | 是 | pending | 待填 |  |
| 初始密码、强制改密、重置和撤销流程已确认 | 是 | pending | 待填 |  |
| 操作日志和访问审计留存策略已确认 | 是 | pending | 待填 |  |
| 备份巡检、容量监控和告警负责人已确认 | 是 | pending | 待填 |  |
| 回滚窗口、回滚负责人和沟通路径已确认 | 是 | pending | 待填 |  |

## 负责人签字

| 角色 | 必填 | 状态 | 签字人 | 签字时间 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 办公室 | 是 | pending | 待填 | 待填 |  |
| 仓库/出库 | 是 | pending | 待填 | 待填 |  |
| 车间 | 是 | pending | 待填 | 待填 |  |
| 司机 | 是 | pending | 待填 | 待填 |  |
| 财务 | 是 | pending | 待填 | 待填 |  |
| 技术/管理 | 是 | pending | 待填 | 待填 |  |

## V1 / V2 边界确认

- V1：
  - 核心 ERP 闭环、人工确认、生产级持久化、真实打印、司机真机、对象存储和现场 QA。
  - 正式员工档案、得力考勤身份与完整自然月工资闭环，以及员工本人考勤和历史工资查询。
  - 客户通知、成品图确认、异常处理和对账发送仍以人工确认闭环为主。
- V2：
  - 企业微信自动发送、自动回执抓取、AI/OCR、路线优化、自动排产、原材料成本毛利、售后责任与绩效扣款和 BI 深化。
- 边界确认状态：`pending`，需要改为 `confirmed` 并填写确认人和确认时间。

## 禁止误判

- 清单生成不等于验收通过；模板里所有证据默认都是 `pending`。
- 自动化 `11/11`、fake CUPS 和本地对象存储不能替代真实生产环境、真实打印机和司机真机。
- 校验器默认 blocked 时退出码为 `2`，用于阻止误上线。
