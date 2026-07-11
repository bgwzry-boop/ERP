import { StatusPill } from "../../components/ui.jsx";
import { V1StatusProductionFirstStageActionResults } from "./V1StatusProductionFirstStageActionResults.jsx";
import { V1StatusProductionFirstStageReadiness } from "./V1StatusProductionFirstStageReadiness.jsx";

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
              <V1StatusProductionFirstStageReadiness
                productionEnvValuesApplyGateStatus={productionEnvValuesApplyGateStatus}
                productionEnvValuesFragmentSourceStatus={productionEnvValuesFragmentSourceStatus}
                productionFirstStageExecution={productionFirstStageExecution}
                productionPersistenceEvidence={productionPersistenceEvidence}
                productionPersistenceEvidenceAction={productionPersistenceEvidenceAction}
                productionPersistenceEvidenceBlockers={productionPersistenceEvidenceBlockers}
                productionPersistenceEvidenceGuidance={productionPersistenceEvidenceGuidance}
                productionPersistenceEvidenceLatestBlockers={productionPersistenceEvidenceLatestBlockers}
                productionPersistenceEvidenceLiveResult={productionPersistenceEvidenceLiveResult}
                productionPersistenceEvidenceLiveSummary={productionPersistenceEvidenceLiveSummary}
                productionPersistenceEvidenceSummary={productionPersistenceEvidenceSummary}
              />
              <V1StatusProductionFirstStageActionResults
                productionFirstStageExecutionAction={productionFirstStageExecutionAction}
                productionFirstStageValuesApplyAction={productionFirstStageValuesApplyAction}
                productionFirstStageValuesDryRunAction={productionFirstStageValuesDryRunAction}
              />
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
