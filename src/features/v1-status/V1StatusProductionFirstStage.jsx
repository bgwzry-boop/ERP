import { StatusPill } from "../../components/ui.jsx";
import { renderV1ProductionEnvFileSourceStatusList } from "./V1StatusOverview.jsx";

export function V1StatusProductionFirstStage({
  productionFirstStageExecution,
  sectionRef,
  onRunProductionFirstStageExecution,
  productionFirstStageExecutionAction,
  onRunProductionPersistenceEvidence,
  productionPersistenceEvidenceAction,
  onPrecheckProductionFirstStageValuesDryRun,
  productionFirstStageValuesDryRunAction,
  onApplyProductionFirstStageValues,
  productionFirstStageValuesApplyAction,
  productionEnvValuesApplyGateStatus,
  productionEnvValuesFragmentSourceStatus,
  productionPersistenceEvidence,
  productionPersistenceEvidenceSummary,
  productionPersistenceEvidenceBlockers,
  productionPersistenceEvidenceGuidance,
  productionPersistenceEvidenceLatestBlockers,
  productionPersistenceEvidenceLiveResult,
  productionPersistenceEvidenceLiveSummary,
  productionEnvIntakeVerificationRef,
  productionEnvMinimumValuesFragmentTemplateRef,
  productionEnvFillTemplateRef,
  scrollV1StatusRefIntoView,
}) {
  const productionFirstStageExecutionRef = sectionRef;
  return (
    <>
          {productionFirstStageExecution ? (
            <section className="detail-section v1-workspace-panel v1-workspace-production v1-section-first_stage" ref={productionFirstStageExecutionRef}>
              <div className="v1-section-title-row">
                <h3>生产环境 / 持久化第一阶段</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onRunProductionPersistenceEvidence}
                    disabled={!onRunProductionPersistenceEvidence || productionPersistenceEvidenceAction.loading}
                  >
                    {productionPersistenceEvidenceAction.loading ? "留证中" : "持久化留证"}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onRunProductionFirstStageExecution}
                    disabled={!onRunProductionFirstStageExecution || productionFirstStageExecutionAction.loading}
                  >
                    {productionFirstStageExecutionAction.loading ? "执行中" : "执行第一阶段"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onPrecheckProductionFirstStageValuesDryRun}
                    disabled={!onPrecheckProductionFirstStageValuesDryRun || productionFirstStageValuesDryRunAction.loading}
                  >
                    {productionFirstStageValuesDryRunAction.loading ? "dry-run 中" : "真实值 dry-run"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onApplyProductionFirstStageValues}
                    disabled={!onApplyProductionFirstStageValues || productionFirstStageValuesApplyAction.loading}
                  >
                    {productionFirstStageValuesApplyAction.loading ? "合并中" : "正式合并真实值"}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvIntakeVerificationRef)}>
                    查看真实值校验
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef)}>
                    查看最小片段
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFillTemplateRef)}>
                    查看填写草稿
                  </button>
                </div>
              </div>
              <div className="v1-field-intake-summary">
                <span>执行步骤 <strong>{productionFirstStageExecution.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{productionFirstStageExecution.summary.blockingLabel}</strong></span>
                <span>错误 <strong>{productionFirstStageExecution.summary.errorLabel}</strong></span>
                <span>env 来源 <strong>{productionFirstStageExecution.execution.envFileSourceLabel || "未记录"}</strong></span>
                <span>intake 全量 <strong>{productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel || "未纳入"}</strong></span>
                <span>intake 最小补值 <strong>{productionFirstStageExecution.intakeCoverage.minimumBlockingLabel || "未纳入"}</strong></span>
                <span>intake 缺 <strong>{productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</strong></span>
                <span>values dry-run <strong>{productionFirstStageExecution.dryRunCoverage.statusLabel}</strong></span>
                <span>dry-run 最小补值 <strong>{productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel}</strong></span>
              </div>
              {productionEnvValuesFragmentSourceStatus ? (
                <div className="v1-production-first-stage-result v1-production-env-values-fragment-source-status">
                  <div>
                    <StatusPill
                      tone={
                        productionEnvValuesFragmentSourceStatus.ready
                          ? "success"
                          : productionEnvValuesFragmentSourceStatus.status === "multiple_configured"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {productionEnvValuesFragmentSourceStatus.statusLabel}
                    </StatusPill>
                    <strong>真实值片段来源</strong>
                  </div>
                  <p>{productionEnvValuesFragmentSourceStatus.nextAction}</p>
                  <div className="v1-action-meta">
                    <span>
                      主变量 <strong>{productionEnvValuesFragmentSourceStatus.summary.primaryEnvVariable || "ERP_V1_PRODUCTION_ENV_VALUES_FILE"}</strong>
                    </span>
                    <span>
                      fallback <strong>{productionEnvValuesFragmentSourceStatus.summary.fallbackEnvVariables.join(" / ") || "无"}</strong>
                    </span>
                    <span>
                      当前来源{" "}
                      <strong>
                        {productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariable
                          ? `${productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariableLabel || "变量"} ${productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariable}`
                          : "未配置"}
                      </strong>
                    </span>
                    <span>已配置来源 <strong>{productionEnvValuesFragmentSourceStatus.summary.configuredSourceVariableCount}</strong></span>
                    <span>最小阻塞补值 <strong>{productionEnvValuesFragmentSourceStatus.summary.minimumBlockingLabel || "未生成"}</strong></span>
                    <span>最小补值缺 <strong>{productionEnvValuesFragmentSourceStatus.summary.minimumBlockingMissingCount} 项</strong></span>
                    <span>全量清单 <strong>{productionEnvValuesFragmentSourceStatus.summary.fullIntakeConfiguredLabel || "未生成"}</strong></span>
                    <span>前端传路径 <strong>{productionEnvValuesFragmentSourceStatus.summary.acceptsFrontendPath ? "允许" : "不允许"}</strong></span>
                    <span>真实路径暴露 <strong>{productionEnvValuesFragmentSourceStatus.summary.pathValueExposed ? "是" : "否"}</strong></span>
                    <span>目标 setup <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                    <span>setup 报告 <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                    <span>目标 env 文件 <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupEnvFileCount} 个</strong></span>
                    <span>片段审计 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditReady ? "通过" : productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                    <span>审计阻塞 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditBlockingCount} 项</strong></span>
                    <span>审计警告 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditWarningCount} 项</strong></span>
                    <span>dry-run <strong>{productionEnvValuesFragmentSourceStatus.summary.dryRunExecuted ? "已执行" : "未执行"}</strong></span>
                    <span>目标 env 写入 <strong>{productionEnvValuesFragmentSourceStatus.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                  </div>
                  {renderV1ProductionEnvFileSourceStatusList(productionEnvValuesFragmentSourceStatus.serverConfigGuidance.sourceStatuses)}
                </div>
              ) : null}
              {productionEnvValuesApplyGateStatus ? (
                <div className="v1-production-first-stage-result v1-production-env-values-apply-gate-status">
                  <div>
                    <StatusPill
                      tone={
                        productionEnvValuesApplyGateStatus.ready
                          ? "success"
                          : productionEnvValuesApplyGateStatus.status === "multiple_configured"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {productionEnvValuesApplyGateStatus.statusLabel}
                    </StatusPill>
                    <strong>正式合并开关</strong>
                  </div>
                  <p>{productionEnvValuesApplyGateStatus.nextAction}</p>
                  <div className="v1-action-meta">
                    <span>
                      开关变量 <strong>{productionEnvValuesApplyGateStatus.summary.applyEnableEnvVariable}</strong>
                    </span>
                    <span>开关 <strong>{productionEnvValuesApplyGateStatus.summary.applyEnabled ? "已启用" : "未启用"}</strong></span>
                    <span>真实值片段 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                    <span>
                      当前来源{" "}
                      <strong>
                        {productionEnvValuesApplyGateStatus.summary.selectedEnvVariable
                          ? `${productionEnvValuesApplyGateStatus.summary.selectedEnvVariableLabel || "变量"} ${productionEnvValuesApplyGateStatus.summary.selectedEnvVariable}`
                          : "未配置"}
                      </strong>
                    </span>
                    <span>目标 env 可能写入 <strong>{productionEnvValuesApplyGateStatus.summary.targetEnvFileMayBeMutated ? "是" : "否"}</strong></span>
                    <span>最小阻塞补值 <strong>{productionEnvValuesApplyGateStatus.summary.minimumBlockingLabel || "未生成"}</strong></span>
                    <span>最小补值缺 <strong>{productionEnvValuesApplyGateStatus.summary.minimumBlockingMissingCount} 项</strong></span>
                    <span>全量清单 <strong>{productionEnvValuesApplyGateStatus.summary.fullIntakeConfiguredLabel || "未生成"}</strong></span>
                    <span>目标 setup <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                    <span>setup 报告 <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                    <span>目标 env 文件 <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupEnvFileCount} 个</strong></span>
                    <span>片段审计 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditReady ? "通过" : productionEnvValuesApplyGateStatus.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                    <span>审计阻塞 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditBlockingCount} 项</strong></span>
                    <span>审计警告 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditWarningCount} 项</strong></span>
                    <span>dry-run 证明 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofReady ? "通过" : productionEnvValuesApplyGateStatus.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                    <span>片段指纹 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                    <span>指纹摘要暴露 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                    <span>dry-run 时效 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofFresh ? "有效" : productionEnvValuesApplyGateStatus.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                    <span>dry-run 有效期 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours ? `${productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                    <span>dry-run 失效 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                    <span>dry-run 剩余 <strong>{Number.isFinite(productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours) ? `${productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                    <span>dry-run 最小补值 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                    <span>dry-run 缺 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingMissingCount} 项</strong></span>
                    <span>本次已合并 <strong>{productionEnvValuesApplyGateStatus.summary.applyExecuted ? "是" : "否"}</strong></span>
                    <span>目标 env 已写入 <strong>{productionEnvValuesApplyGateStatus.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                    <span>请求体 <strong>{productionEnvValuesApplyGateStatus.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                    <span>路径暴露 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFilePathExposed || productionEnvValuesApplyGateStatus.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                    <span>迁移 apply <strong>{productionEnvValuesApplyGateStatus.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                  </div>
                  {renderV1ProductionEnvFileSourceStatusList(productionEnvValuesApplyGateStatus.serverConfigGuidance.sourceStatuses)}
                </div>
              ) : null}
              {productionPersistenceEvidence ? (
                <div className="v1-production-first-stage-result v1-production-persistence-evidence-latest">
                  <div>
                    <StatusPill tone={productionPersistenceEvidence.ready ? "success" : productionPersistenceEvidence.status === "error" ? "danger" : "warning"}>
                      {productionPersistenceEvidence.statusLabel}
                    </StatusPill>
                    <strong>当前持久化留证 latest</strong>
                  </div>
                  <p>{productionPersistenceEvidence.nextAction || "按持久化留证阻塞项补齐真实 PostgreSQL、恢复验证库、对象存储或 production env 后重试。"}</p>
                  <div className="v1-action-meta">
                    <span>阶段 <strong>{productionPersistenceEvidenceSummary.passedLabel || "0/0"}</strong></span>
                    <span>阻塞 <strong>{productionPersistenceEvidenceSummary.blockingLabel || "0 项"}</strong></span>
                    <span>警告 <strong>{productionPersistenceEvidenceSummary.warningLabel || "0 项"}</strong></span>
                    <span>env 来源 <strong>{productionPersistenceEvidenceSummary.envFileSourceLabel || "未记录"}</strong></span>
                    <span>持久化 env <strong>{productionPersistenceEvidenceSummary.persistenceEnvReady ? "通过" : "未通过"}</strong></span>
                    <span>PostgreSQL <strong>{productionPersistenceEvidenceSummary.postgresReady ? "通过" : "未通过"}</strong></span>
                    <span>备份恢复 <strong>{productionPersistenceEvidenceSummary.postgresBackupRestoreReady ? "通过" : "未通过"}</strong></span>
                    <span>对象存储 <strong>{productionPersistenceEvidenceSummary.objectStorageReady ? "通过" : "未通过"}</strong></span>
                    <span>bucket 治理 <strong>{productionPersistenceEvidenceSummary.objectStorageGovernanceReady ? "通过" : "未通过"}</strong></span>
                    <span>迁移 apply <strong>{productionPersistenceEvidence.safeguards?.migrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                    <span>恢复重置 <strong>{productionPersistenceEvidence.safeguards?.postgresBackupRestoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                    <span>路径暴露 <strong>{productionPersistenceEvidence.safeguards?.envFilePathExposed ? "是" : "否"}</strong></span>
                  </div>
                  {productionPersistenceEvidenceLatestBlockers.length ? (
                    <div className="v1-blocker-preview-list">
                      {productionPersistenceEvidenceLatestBlockers.slice(0, 5).map((item) => (
                        <div className="v1-blocker-preview-row" key={`${item.key || item.label}-${item.status || "blocked"}`}>
                          <StatusPill tone={item.ready ? "success" : item.status === "warning" ? "warning" : "danger"}>
                            {item.statusLabel || (item.ready ? "已通过" : "阻塞")}
                          </StatusPill>
                          <span>{item.label}</span>
                          <small>{item.nextAction || item.detail}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {productionPersistenceEvidenceLiveResult || productionPersistenceEvidenceAction.error ? (
                <div className="v1-production-first-stage-result v1-production-persistence-evidence-live-result">
                  {productionPersistenceEvidenceLiveResult ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionPersistenceEvidenceLiveResult.ready
                              ? "success"
                              : productionPersistenceEvidenceLiveResult.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionPersistenceEvidenceLiveResult.statusLabel}
                        </StatusPill>
                        <strong>最近持久化留证</strong>
                      </div>
                      <p>{productionPersistenceEvidenceLiveResult.nextAction || productionPersistenceEvidenceLiveResult.nextActions?.[0]}</p>
                      <div className="v1-action-meta">
                        <span>阶段 <strong>{productionPersistenceEvidenceLiveSummary.passedLabel || "0/0"}</strong></span>
                        <span>阻塞 <strong>{productionPersistenceEvidenceLiveSummary.blockerLabel || "0 项"}</strong></span>
                        <span>警告 <strong>{productionPersistenceEvidenceLiveSummary.warningLabel || "0 项"}</strong></span>
                        <span>env 来源 <strong>{productionPersistenceEvidenceLiveSummary.envFileSourceLabel || "未记录"}</strong></span>
                        <span>持久化 env <strong>{productionPersistenceEvidenceLiveSummary.persistenceEnvReady ? "通过" : "未通过"}</strong></span>
                        <span>PostgreSQL <strong>{productionPersistenceEvidenceLiveSummary.postgresReady ? "通过" : "未通过"}</strong></span>
                        <span>备份恢复 <strong>{productionPersistenceEvidenceLiveSummary.postgresBackupRestoreReady ? "通过" : "未通过"}</strong></span>
                        <span>对象存储 <strong>{productionPersistenceEvidenceLiveSummary.objectStorageReady ? "通过" : "未通过"}</strong></span>
                        <span>bucket 治理 <strong>{productionPersistenceEvidenceLiveSummary.objectStorageGovernanceReady ? "通过" : "未通过"}</strong></span>
                        <span>前端路径 <strong>{productionPersistenceEvidenceLiveSummary.envFilePathAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>路径暴露 <strong>{productionPersistenceEvidenceLiveSummary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>迁移 apply <strong>{productionPersistenceEvidenceLiveSummary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                        <span>恢复重置 <strong>{productionPersistenceEvidenceLiveSummary.restoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                        <span>业务数据 <strong>{productionPersistenceEvidenceLiveSummary.businessDataMutated ? "已改动" : "未改动"}</strong></span>
                        <span>打印设备 <strong>{productionPersistenceEvidenceLiveSummary.physicalPrinterCalled ? "已调用" : "未调用"}</strong></span>
                        <span>司机状态 <strong>{productionPersistenceEvidenceLiveSummary.driverDeliveryStatusChanged ? "已改动" : "未改动"}</strong></span>
                      </div>
                      <div className="v1-field-intake-summary v1-production-first-stage-server-guidance">
                        <span>服务端输入 <strong>{productionPersistenceEvidenceGuidance.primaryInput || "production env setup latest"}</strong></span>
                        <span>前端路径 <strong>{productionPersistenceEvidenceGuidance.acceptsFrontendPath ? "允许" : "不允许"}</strong></span>
                        <span>默认迁移 apply <strong>{productionPersistenceEvidenceGuidance.applyMigrationsByDefault ? "是" : "否"}</strong></span>
                        <span>默认恢复重置 <strong>{productionPersistenceEvidenceGuidance.restoreResetAllowedByDefault ? "是" : "否"}</strong></span>
                        <span>业务写入 <strong>{productionPersistenceEvidenceGuidance.writesBusinessData ? "是" : "否"}</strong></span>
                      </div>
                      {productionPersistenceEvidenceGuidance.steps?.length ? (
                        <ul className="v1-compact-list">
                          {productionPersistenceEvidenceGuidance.steps.slice(0, 4).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                      {productionPersistenceEvidenceBlockers.length ? (
                        <div className="v1-blocker-preview-list">
                          {productionPersistenceEvidenceBlockers.slice(0, 5).map((item) => (
                            <div className="v1-blocker-preview-row" key={`${item.key || item.label}-${item.status || item.severity || "blocked"}`}>
                              <StatusPill tone={item.severity === "warning" ? "warning" : item.ready ? "success" : "danger"}>
                                {item.statusLabel || (item.ready ? "已通过" : "阻塞")}
                              </StatusPill>
                              <span>{item.label}</span>
                              <small>{item.nextAction || item.detail}</small>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div>
                        <StatusPill tone="danger">失败</StatusPill>
                        <strong>最近持久化留证</strong>
                      </div>
                      <p>{productionPersistenceEvidenceAction.error}</p>
                    </>
                  )}
                </div>
              ) : null}
              <div className="v1-production-first-stage-result">
                <div>
                  <StatusPill tone={productionFirstStageExecution.ready ? "success" : productionFirstStageExecution.status === "blocked" ? "danger" : "warning"}>
                    {productionFirstStageExecution.statusLabel}
                  </StatusPill>
                  <strong>{productionFirstStageExecution.summary.label}</strong>
                </div>
                <p>{productionFirstStageExecution.nextActions[0] || productionFirstStageExecution.dryRunCoverage.nextAction}</p>
                <div className="v1-action-meta">
                  <span>真实值 intake {productionFirstStageExecution.intakeCoverage.statusLabel}</span>
                  <span>全量清单 {productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel}</span>
                  <span>最小阻塞补值 {productionFirstStageExecution.intakeCoverage.minimumBlockingLabel}</span>
                  <span>最小补值缺 {productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</span>
                  <span>建议 / 可选补值 {productionFirstStageExecution.intakeCoverage.minimumWarningLabel}</span>
                  <span>intake CSV {productionFirstStageExecution.intakeCoverage.intakeCsvReady ? "ready" : "blocked"}</span>
                  <span>安全 env 文件 {productionFirstStageExecution.execution.envFileFromProductionSetup ? "来自 setup" : "未确认 setup 来源"}</span>
                  <span>迁移 apply {productionFirstStageExecution.execution.applyMigrations ? "已执行" : "未执行"}</span>
                  <span>恢复重置授权 {productionFirstStageExecution.execution.restoreResetExplicitlyAllowed ? "已显式授权" : "未授权"}</span>
                  <span>业务数据改动 {productionFirstStageExecution.safeguards?.businessDataMutated ? "是" : "否"}</span>
                </div>
              </div>
              <div className="v1-production-first-stage-result">
                <div>
                  <StatusPill tone={productionFirstStageExecution.dryRunCoverage.included ? productionFirstStageExecution.dryRunCoverage.minimumBlockingReady ? "success" : "warning" : "warning"}>
                    {productionFirstStageExecution.dryRunCoverage.statusLabel}
                  </StatusPill>
                  <strong>{productionFirstStageExecution.dryRunCoverage.included ? "真实值 dry-run 覆盖已纳入" : "真实值 dry-run 覆盖未纳入"}</strong>
                </div>
                <p>{productionFirstStageExecution.dryRunCoverage.nextAction}</p>
                <div className="v1-action-meta">
                  <span>预计 env 预检 {productionFirstStageExecution.dryRunCoverage.envPreflightLabel}</span>
                  <span>预计 intake {productionFirstStageExecution.dryRunCoverage.intakeLabel}</span>
                  <span>最小阻塞补值 {productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel}</span>
                  <span>建议 / 可选补值 {productionFirstStageExecution.dryRunCoverage.minimumWarningLabel}</span>
                </div>
              </div>
              {productionFirstStageExecutionAction.result || productionFirstStageExecutionAction.error ? (
                <div className="v1-production-first-stage-execution-live-result">
                  {productionFirstStageExecutionAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageExecutionAction.result.ready
                              ? "success"
                              : productionFirstStageExecutionAction.result.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionFirstStageExecutionAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近第一阶段执行</strong>
                      </div>
                      <p>{productionFirstStageExecutionAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>执行步骤 <strong>{productionFirstStageExecutionAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionFirstStageExecutionAction.result.summary.blockerLabel}</strong></span>
                        <span>错误 <strong>{productionFirstStageExecutionAction.result.summary.errorLabel}</strong></span>
                        <span>env 来源 <strong>{productionFirstStageExecutionAction.result.summary.envFileSourceLabel || "未记录"}</strong></span>
                        <span>intake 全量 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.fullIntakeConfiguredLabel}</strong></span>
                        <span>intake 最小补值 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.minimumBlockingLabel}</strong></span>
                        <span>intake 缺 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</strong></span>
                        <span>请求体 <strong>{productionFirstStageExecutionAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>前端路径 <strong>{productionFirstStageExecutionAction.result.summary.envFilePathAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageExecutionAction.result.summary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>runtime smoke <strong>{productionFirstStageExecutionAction.result.summary.runtimeSmokeUsesCurrentApi ? "当前 API" : "未确认"}</strong></span>
                        <span>API 地址输入 <strong>{productionFirstStageExecutionAction.result.summary.runtimeSmokeApiBaseUrlAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>迁移 apply <strong>{productionFirstStageExecutionAction.result.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                        <span>恢复重置 <strong>{productionFirstStageExecutionAction.result.summary.restoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                        <span>业务数据 <strong>{productionFirstStageExecutionAction.result.summary.businessDataMutated ? "已改动" : "未改动"}</strong></span>
                        <span>候选刷新 <strong>{productionFirstStageExecutionAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionFirstStageExecutionAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>{productionFirstStageExecutionAction.result.serverConfigGuidance.label || "第一阶段执行边界"}</strong>
                          <p>
                            输入 {productionFirstStageExecutionAction.result.serverConfigGuidance.primaryInput || "production env setup latest"}
                            ；前端传路径 {productionFirstStageExecutionAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}
                          </p>
                          <div className="v1-action-meta">
                            <span>默认迁移 apply {productionFirstStageExecutionAction.result.serverConfigGuidance.applyMigrationsByDefault ? "是" : "否"}</span>
                            <span>默认恢复重置 {productionFirstStageExecutionAction.result.serverConfigGuidance.restoreResetAllowedByDefault ? "允许" : "不允许"}</span>
                            <span>runtime smoke API {productionFirstStageExecutionAction.result.serverConfigGuidance.runtimeSmokeApiBaseUrlAcceptedFromFrontend ? "前端可传" : "当前请求"}</span>
                            <span>真实值片段输入 {productionFirstStageExecutionAction.result.serverConfigGuidance.productionEnvValuesFileAccepted ? "接受" : "不接受"}</span>
                            <span>路径暴露 {productionFirstStageExecutionAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          <ul>
                            {productionFirstStageExecutionAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageExecutionAction.result.blockingItems.length || productionFirstStageExecutionAction.result.blockingStages.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageExecutionAction.result.blockingItems, ...productionFirstStageExecutionAction.result.blockingStages].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageExecutionAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageValuesDryRunAction.result || productionFirstStageValuesDryRunAction.error ? (
                <div className="v1-production-first-stage-dry-run-live-result">
                  {productionFirstStageValuesDryRunAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageValuesDryRunAction.result.ready
                              ? "success"
                              : productionFirstStageValuesDryRunAction.result.status === "not_configured"
                                ? "warning"
                                : productionFirstStageValuesDryRunAction.result.status === "error"
                                  ? "danger"
                                  : "warning"
                          }
                        >
                          {productionFirstStageValuesDryRunAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近真实值 dry-run</strong>
                      </div>
                      <p>{productionFirstStageValuesDryRunAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>真实值片段 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>配置来源 <strong>{productionFirstStageValuesDryRunAction.result.summary.selectedEnvVariable || "未配置"}</strong></span>
                        <span>目标 setup <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                        <span>setup 报告 <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                        <span>目标 env 文件 <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupEnvFileCount} 个</strong></span>
                        <span>片段审计 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditReady ? "通过" : productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                        <span>审计阻塞 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditBlockingCount} 项</strong></span>
                        <span>最小补值 <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.minimumBlockingLabel}</strong></span>
                        <span>dry-run 证明 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofReady ? "通过" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                        <span>片段指纹 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                        <span>指纹摘要暴露 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                        <span>dry-run 时效 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofFresh ? "有效" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                        <span>dry-run 有效期 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMaxAgeHours ? `${productionFirstStageValuesDryRunAction.result.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                        <span>dry-run 失效 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                        <span>dry-run 剩余 <strong>{Number.isFinite(productionFirstStageValuesDryRunAction.result.summary.dryRunProofRemainingHours) ? `${productionFirstStageValuesDryRunAction.result.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                        <span>dry-run 最小补值 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                        <span>dry-run 缺 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMinimumBlockingMissingCount} 项</strong></span>
                        <span>预计 env <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.envPreflightLabel}</strong></span>
                        <span>预计 intake <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.intakeLabel}</strong></span>
                        <span>目标 env 写入 <strong>{productionFirstStageValuesDryRunAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionFirstStageValuesDryRunAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                      </div>
                      {productionFirstStageValuesDryRunAction.result.serverConfigGuidance?.primaryEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>真实值片段服务端配置</strong>
                          <p>
                            主变量 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.primaryEnvVariable}
                            {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.fallbackEnvVariables.length
                              ? `；fallback ${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.fallbackEnvVariables.join(" / ")}`
                              : ""}
                          </p>
                          <div className="v1-action-meta">
                            <span>
                              当前来源{" "}
                              {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariable
                                ? `${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariableLabel || "变量"} ${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>已配置来源 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>前端传路径 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                            <span>目标 setup {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupReady ? "已就绪" : "未就绪"}</span>
                            <span>setup 报告 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupReportAvailable ? "有" : "无"}</span>
                            <span>目标 env 文件 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupEnvFileCount || 0} 个</span>
                            <span>片段审计 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditReady ? "通过" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditExecuted ? "未通过" : "未执行"}</span>
                            <span>审计阻塞 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditBlockingCount || 0} 项</span>
                            <span>dry-run 证明 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofReady ? "通过" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofStatusLabel || "未生成"}</span>
                            <span>dry-run 时效 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofFresh ? "有效" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofFreshnessLabel || "未生成"}</span>
                            <span>dry-run 最小补值 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofMinimumBlockingLabel || "未生成"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionFirstStageValuesDryRunAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageValuesDryRunAction.result.blockingItems.length || productionFirstStageValuesDryRunAction.result.blockingStages.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageValuesDryRunAction.result.blockingItems, ...productionFirstStageValuesDryRunAction.result.blockingStages].slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageValuesDryRunAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageValuesApplyAction.result || productionFirstStageValuesApplyAction.error ? (
                <div className="v1-production-first-stage-apply-live-result">
                  {productionFirstStageValuesApplyAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageValuesApplyAction.result.ready
                              ? "success"
                              : productionFirstStageValuesApplyAction.result.status === "disabled" ||
                                  productionFirstStageValuesApplyAction.result.status === "not_configured"
                                ? "warning"
                                : productionFirstStageValuesApplyAction.result.status === "error"
                                  ? "danger"
                                  : productionFirstStageValuesApplyAction.result.summary.productionEnvFileMutated
                                    ? "warning"
                                    : "danger"
                          }
                        >
                          {productionFirstStageValuesApplyAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近正式合并真实值</strong>
                      </div>
                      <p>{productionFirstStageValuesApplyAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>正式开关 <strong>{productionFirstStageValuesApplyAction.result.summary.applyEnabled ? "已启用" : "未启用"}</strong></span>
                        <span>真实值片段 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>配置来源 <strong>{productionFirstStageValuesApplyAction.result.summary.selectedEnvVariable || "未配置"}</strong></span>
                        <span>写入变量 <strong>{productionFirstStageValuesApplyAction.result.summary.appliedVariableCount}</strong></span>
                        <span>目标 env 写入 <strong>{productionFirstStageValuesApplyAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>目标 env 变更 <strong>{productionFirstStageValuesApplyAction.result.summary.targetEnvChanged ? "是" : "否"}</strong></span>
                        <span>目标 setup <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                        <span>setup 报告 <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                        <span>目标 env 文件 <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupEnvFileCount} 个</strong></span>
                        <span>片段审计 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFileAuditReady ? "通过" : productionFirstStageValuesApplyAction.result.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                        <span>审计阻塞 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFileAuditBlockingCount} 项</strong></span>
                        <span>dry-run 证明 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofReady ? "通过" : productionFirstStageValuesApplyAction.result.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                        <span>片段指纹 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                        <span>指纹摘要暴露 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                        <span>dry-run 时效 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofFresh ? "有效" : productionFirstStageValuesApplyAction.result.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                        <span>dry-run 有效期 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofMaxAgeHours ? `${productionFirstStageValuesApplyAction.result.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                        <span>dry-run 失效 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                        <span>dry-run 剩余 <strong>{Number.isFinite(productionFirstStageValuesApplyAction.result.summary.dryRunProofRemainingHours) ? `${productionFirstStageValuesApplyAction.result.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                        <span>dry-run 最小补值 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                        <span>setup <strong>{productionFirstStageValuesApplyAction.result.summary.setupReady ? "通过" : "未通过"}</strong></span>
                        <span>env 预检 <strong>{productionFirstStageValuesApplyAction.result.summary.envPreflightLabel}</strong></span>
                        <span>intake 阻塞 <strong>{productionFirstStageValuesApplyAction.result.summary.intakeVerificationBlockingCount} 项</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFilePathExposed || productionFirstStageValuesApplyAction.result.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionFirstStageValuesApplyAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>迁移 apply <strong>{productionFirstStageValuesApplyAction.result.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                      </div>
                      {productionFirstStageValuesApplyAction.result.serverConfigGuidance?.applyEnableEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>正式合并服务端配置</strong>
                          <p>
                            开关 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.applyEnableEnvVariable}
                            ；真实值变量 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.primaryEnvVariable}
                          </p>
                          <div className="v1-action-meta">
                            <span>开关 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.applyEnabled ? "已启用" : "未启用"}</span>
                            <span>已配置来源 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>目标 setup {productionFirstStageValuesApplyAction.result.serverConfigGuidance.targetSetupReady ? "已就绪" : "未就绪"}</span>
                            <span>setup 报告 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.targetSetupReportAvailable ? "有" : "无"}</span>
                            <span>片段审计 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditReady ? "通过" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditExecuted ? "未通过" : "未执行"}</span>
                            <span>审计阻塞 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditBlockingCount || 0} 项</span>
                            <span>dry-run 证明 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofReady ? "通过" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofStatusLabel || "未生成"}</span>
                            <span>dry-run 时效 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofFresh ? "有效" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofFreshnessLabel || "未生成"}</span>
                            <span>dry-run 最小补值 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofMinimumBlockingLabel || "未生成"}</span>
                            <span>前端传路径 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionFirstStageValuesApplyAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionFirstStageValuesApplyAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageValuesApplyAction.result.blockingItems.length || productionFirstStageValuesApplyAction.result.blockingFindings.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageValuesApplyAction.result.blockingItems, ...productionFirstStageValuesApplyAction.result.blockingFindings].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageValuesApplyAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageExecution.blockingStages.length ? (
                <div className="v1-production-first-stage-blockers">
                  {productionFirstStageExecution.blockingStages.slice(0, 5).map((stage) => (
                    <div className="v1-production-env-gate-row" key={stage.key || stage.label}>
                      <div>
                        <StatusPill tone={stage.status === "blocked" || stage.status === "error" ? "danger" : "warning"}>
                          {stage.statusLabel}
                        </StatusPill>
                        <strong>{stage.label}</strong>
                      </div>
                      <p>{stage.detail || stage.evidence.summaryLabel}</p>
                      <div className="v1-production-env-gate-meta">
                        {stage.evidence.summaryLabel ? <span>{stage.evidence.summaryLabel}</span> : null}
                        {stage.evidence.blockingCount ? <span>阻塞 {stage.evidence.blockingCount} 项</span> : null}
                        {stage.evidence.warningCount ? <span>警告 {stage.evidence.warningCount} 项</span> : null}
                        <span>命令暴露 否</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
    </>
  );
}
