import { StatusPill } from "../../components/ui.jsx";
import { V1StatusFieldCloseoutReleaseResults } from "./V1StatusFieldCloseoutReleaseResults.jsx";
import { V1StatusFieldCloseoutStagingResults } from "./V1StatusFieldCloseoutStagingResults.jsx";

export function V1StatusFieldCloseoutStage({
  fieldEvidenceIntakeQuality,
  fieldEvidenceIntakeQualityRef,
  canGenerateFieldEvidenceDraft,
  onGenerateFieldEvidenceDraft,
  fieldEvidenceDraftAction,
  canValidateFieldEvidenceDraft,
  onValidateFieldEvidenceDraft,
  fieldEvidenceValidationAction,
  canPrecheckReleaseCandidateRefresh,
  onPrecheckReleaseCandidateRefresh,
  releaseCandidateRefreshPrecheckAction,
  canRefreshReleaseCandidate,
  onRefreshReleaseCandidate,
  releaseCandidateRefreshAction,
  canRunFieldEvidenceCloseoutReview,
  runFieldEvidenceCloseoutReview,
  canRunV1CloseoutFullReview,
  runV1CloseoutFullReview,
  productionEnvPrecheckAction,
  productionEnvFileAuditPrecheckAction,
  productionEnvFilePreviewPrecheckAction,
  v1V2BoundaryPrecheckAction,
  productionGoLivePrecheckAction,
  runtimeReadinessPrecheckAction,
  fieldEvidenceStageRowAction,
  fieldEvidenceAttachmentAction,
  signoffBoundaryAttachmentAction,
  buildReleaseCandidateRefreshBlockerActions,
  selectMissingEvidenceForStage,
  selectSignoffBoundaryForStage,
  fieldEvidenceIntakeGuidance,
  fieldEvidenceProgress,
}) {
  return (
    <>
      {fieldEvidenceIntakeQuality ? (
<div className="v1-field-intake-quality" ref={fieldEvidenceIntakeQualityRef}>
                  <div className="v1-field-intake-head">
                    <div>
                      <strong>回填质量检查</strong>
                      <span>阻塞 {fieldEvidenceIntakeQuality.summary.blockingIssueLabel}</span>
                    </div>
                    <div className="v1-field-intake-actions">
                      <button
                        className="ghost-button"
                        disabled={!canGenerateFieldEvidenceDraft}
                        onClick={onGenerateFieldEvidenceDraft}
                        type="button"
                      >
                        {fieldEvidenceDraftAction.loading ? "生成中" : "生成草稿"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canValidateFieldEvidenceDraft}
                        onClick={onValidateFieldEvidenceDraft}
                        type="button"
                      >
                        {fieldEvidenceValidationAction.loading ? "校验中" : "校验草稿"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canPrecheckReleaseCandidateRefresh}
                        onClick={onPrecheckReleaseCandidateRefresh}
                        type="button"
                      >
                        {releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canRefreshReleaseCandidate}
                        onClick={onRefreshReleaseCandidate}
                        type="button"
                      >
                        {releaseCandidateRefreshAction.loading ? "刷新中" : "刷新候选"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canRunFieldEvidenceCloseoutReview}
                        onClick={runFieldEvidenceCloseoutReview}
                        type="button"
                      >
                        {fieldEvidenceValidationAction.loading ||
                        releaseCandidateRefreshPrecheckAction.loading ||
                        releaseCandidateRefreshAction.loading
                          ? "复核中"
                          : "校验并预检刷新"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canRunV1CloseoutFullReview}
                        onClick={runV1CloseoutFullReview}
                        type="button"
                      >
                        {fieldEvidenceValidationAction.loading ||
                        productionEnvPrecheckAction.loading ||
                        productionEnvFileAuditPrecheckAction.loading ||
                        productionEnvFilePreviewPrecheckAction.loading ||
                        v1V2BoundaryPrecheckAction.loading ||
                        productionGoLivePrecheckAction.loading ||
                        releaseCandidateRefreshPrecheckAction.loading ||
                        runtimeReadinessPrecheckAction.loading ||
                        releaseCandidateRefreshAction.loading
                          ? "总复核中"
                          : "V1 收尾总复核"}
                      </button>
                    </div>
                  </div>
                  <div className="v1-field-intake-summary">
                    <span>证据 <strong>{fieldEvidenceIntakeQuality.summary.evidenceProgress}</strong></span>
                    <span>签字 <strong>{fieldEvidenceIntakeQuality.summary.signoffProgress}</strong></span>
                    <span>边界 <strong>{fieldEvidenceIntakeQuality.summary.boundaryLabel}</strong></span>
                    <span>草稿 <strong>{fieldEvidenceIntakeQuality.summary.draftManifestLabel}</strong></span>
                    <span>草稿匹配 <strong>{fieldEvidenceIntakeQuality.summary.draftFreshnessLabel}</strong></span>
                    <span>可生成草稿 <strong>{fieldEvidenceIntakeQuality.summary.canGenerateDraft ? "是" : "否"}</strong></span>
                    <span>可刷新候选 <strong>{fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate ? "是" : "否"}</strong></span>
                  </div>

                  <V1StatusFieldCloseoutStagingResults
                    fieldEvidenceAttachmentAction={fieldEvidenceAttachmentAction}
                    fieldEvidenceStageRowAction={fieldEvidenceStageRowAction}
                    selectMissingEvidenceForStage={selectMissingEvidenceForStage}
                    selectSignoffBoundaryForStage={selectSignoffBoundaryForStage}
                    signoffBoundaryAttachmentAction={signoffBoundaryAttachmentAction}
                  />
                  <V1StatusFieldCloseoutReleaseResults
                    buildReleaseCandidateRefreshBlockerActions={buildReleaseCandidateRefreshBlockerActions}
                    fieldEvidenceDraftAction={fieldEvidenceDraftAction}
                    fieldEvidenceValidationAction={fieldEvidenceValidationAction}
                    releaseCandidateRefreshAction={releaseCandidateRefreshAction}
                    releaseCandidateRefreshPrecheckAction={releaseCandidateRefreshPrecheckAction}
                  />
                  <div className="v1-field-intake-quality-list">
                    {fieldEvidenceIntakeQuality.checks.map((item) => (
                      <div className="v1-field-intake-quality-row" key={item.key}>
                        <div>
                          <StatusPill tone={item.ready ? "success" : item.blocking ? "danger" : "warning"}>
                            {item.statusLabel}
                          </StatusPill>
                          <strong>{item.label}</strong>
                        </div>
                        <p>{item.detail}</p>
                        <span>{item.nextAction}</span>
                      </div>
                    ))}
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceIntakeQuality.nextAction}</p>
                </div>
      ) : null}
      {fieldEvidenceIntakeGuidance ? (
                <div className="v1-field-intake-guidance">
                  <div className="v1-field-intake-head">
                    <strong>现场证据回填指引</strong>
                    <span>{fieldEvidenceIntakeGuidance.summary.commandCountLabel}</span>
                  </div>
                  <div className="v1-field-intake-summary">
                    <span>证据 <strong>{fieldEvidenceIntakeGuidance.summary.evidenceProgressLabel}</strong></span>
                    <span>签字 <strong>{fieldEvidenceIntakeGuidance.summary.signoffProgressLabel}</strong></span>
                    <span>边界 <strong>{fieldEvidenceIntakeGuidance.summary.boundaryLabel}</strong></span>
                    <span>草稿 <strong>{fieldEvidenceIntakeGuidance.summary.draftManifestLabel}</strong></span>
                    <span>草稿匹配 <strong>{fieldEvidenceIntakeGuidance.summary.draftFreshnessLabel}</strong></span>
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceIntakeGuidance.blockedReason}</p>
                  <div className="v1-field-intake-command-list">
                    {fieldEvidenceIntakeGuidance.commands.map((item, index) => (
                      <div className="v1-field-intake-command-row" key={item.key}>
                        <div>
                          <StatusPill tone={index === 0 ? "warning" : "blue"}>第 {index + 1} 步</StatusPill>
                          <strong>{item.label}</strong>
                        </div>
                        <p>{item.description}</p>
                        <code>{item.command}</code>
                      </div>
                    ))}
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceIntakeGuidance.nextAction}</p>
                </div>
              ) : null}
      <div className="v1-signoff-strip">
                {fieldEvidenceProgress.signoffs.map((signoff) => (
                  <span key={signoff.role} className={signoff.ready ? "ready" : ""}>
                    {signoff.role}<strong>{signoff.ready ? "已签字" : "待签字"}</strong>
                  </span>
                ))}
              </div>
      <p className="v1-field-evidence-boundary">
                V1/V2 边界：{fieldEvidenceProgress.boundary.label}，V1 {fieldEvidenceProgress.boundary.v1ItemCount} 项继续完成，V2 {fieldEvidenceProgress.boundary.v2ItemCount} 项延后。
              </p>
    </>
  );
}
