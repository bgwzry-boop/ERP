import { StatusPill } from "../../components/ui.jsx";
import { renderV1ProductionEnvFileSourceStatusList } from "./V1StatusOverview.jsx";

export function V1StatusProductionFirstStageReadiness({
  productionEnvValuesApplyGateStatus,
  productionEnvValuesFragmentSourceStatus,
  productionFirstStageExecution,
  productionPersistenceEvidence,
  productionPersistenceEvidenceAction,
  productionPersistenceEvidenceBlockers,
  productionPersistenceEvidenceGuidance,
  productionPersistenceEvidenceLatestBlockers,
  productionPersistenceEvidenceLiveResult,
  productionPersistenceEvidenceLiveSummary,
  productionPersistenceEvidenceSummary,
}) {
  return (
    <>
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
    </>
  );
}
