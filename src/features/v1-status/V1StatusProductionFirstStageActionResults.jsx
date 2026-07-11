import { StatusPill } from "../../components/ui.jsx";
import { renderV1ProductionEnvFileSourceStatusList } from "./V1StatusOverview.jsx";

export function V1StatusProductionFirstStageActionResults({
  productionFirstStageExecutionAction,
  productionFirstStageValuesApplyAction,
  productionFirstStageValuesDryRunAction,
}) {
  return (
    <>
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
    </>
  );
}
