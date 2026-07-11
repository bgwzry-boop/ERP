import { StatusPill } from "../../components/ui.jsx";
import { renderV1ProductionEnvFileSourceStatusList } from "./V1StatusOverview.jsx";

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

                  {fieldEvidenceStageRowAction.result || fieldEvidenceStageRowAction.error ? (
                    <div className="v1-field-stage-result">
                      {fieldEvidenceStageRowAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={fieldEvidenceStageRowAction.result.ready ? "success" : "warning"}>
                              {fieldEvidenceStageRowAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近草稿行保存</strong>
                          </div>
                          <p>{fieldEvidenceStageRowAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>行 <strong>{fieldEvidenceStageRowAction.result.summary.rowLabel}</strong></span>
                            <span>证据 <strong>{fieldEvidenceStageRowAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{fieldEvidenceStageRowAction.result.summary.signoffProgress}</strong></span>
                            <span>边界 <strong>{fieldEvidenceStageRowAction.result.summary.boundaryLabel}</strong></span>
                            <span>CSV <strong>{fieldEvidenceStageRowAction.result.summary.csvUpdated ? "已更新" : "未更新"}</strong></span>
                            <span>候选刷新 <strong>{fieldEvidenceStageRowAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {fieldEvidenceStageRowAction.result.evidenceCloseout ? (
                            <div className="v1-field-stage-closeout">
                              <div className="v1-field-stage-title">
                                <strong>现场证据剩余</strong>
                                <span>{fieldEvidenceStageRowAction.result.evidenceCloseout.actionLabel}</span>
                              </div>
                              <p>{fieldEvidenceStageRowAction.result.evidenceCloseout.nextAction}</p>
                              <div className="v1-field-intake-summary">
                                <span>证据 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.evidenceProgress}</strong></span>
                                <span>缺证据 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.missingEvidenceRows}</strong></span>
                                <span>已填引用 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.filledEvidenceRows}</strong></span>
                                <span>无效行 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.invalidEvidenceRows}</strong></span>
                              </div>
                              {fieldEvidenceStageRowAction.result.evidenceCloseout.actions.length ? (
                                <div className="v1-field-stage-closeout-list">
                                  {fieldEvidenceStageRowAction.result.evidenceCloseout.actions.map((item) => (
                                    <div className="v1-field-stage-closeout-row" key={`${item.groupKey}:${item.key}`}>
                                      <div>
                                        <StatusPill tone={item.evidenceFilled ? "warning" : "danger"}>
                                          {item.evidenceFilled ? "待确认状态" : "缺现场证据"}
                                        </StatusPill>
                                        <strong>{item.label}</strong>
                                        <span>{item.groupLabel || item.ownerRole || item.progressLabel}</span>
                                        <button
                                          className="ghost-button v1-field-evidence-fill-button"
                                          onClick={() => selectMissingEvidenceForStage(item)}
                                          type="button"
                                        >
                                          填到草稿
                                        </button>
                                      </div>
                                      <p>{item.nextAction}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {fieldEvidenceStageRowAction.result.closeout ? (
                            <div className="v1-field-stage-closeout">
                              <div className="v1-field-stage-title">
                                <strong>签字 / 边界剩余</strong>
                                <span>
                                  {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.actionLabel ||
                                    fieldEvidenceStageRowAction.result.closeout.actionLabel}
                                </span>
                              </div>
                              <p>
                                {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.nextAction ||
                                  fieldEvidenceStageRowAction.result.closeout.nextAction}
                              </p>
                              <div className="v1-field-intake-summary">
                                <span>
                                  签字{" "}
                                  <strong>
                                    {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.signoffProgressLabel ||
                                      fieldEvidenceStageRowAction.result.closeout.signoffProgress}
                                  </strong>
                                </span>
                                <span>
                                  缺签字{" "}
                                  <strong>
                                    {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.missingSignoffCount ??
                                      fieldEvidenceStageRowAction.result.closeout.missingSignoffRows}
                                  </strong>
                                </span>
                                <span>无效行 <strong>{fieldEvidenceStageRowAction.result.closeout.invalidSignoffRows}</strong></span>
                                <span>
                                  边界{" "}
                                  <strong>
                                    {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.boundaryLabel ||
                                      fieldEvidenceStageRowAction.result.closeout.boundaryLabel}
                                  </strong>
                                </span>
                                {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary ? (
                                  <span>
                                    首批{" "}
                                    <strong>
                                      {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary.previewActions.length}/
                                      {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary.actionCount}
                                    </strong>
                                  </span>
                                ) : null}
                              </div>
                              {fieldEvidenceStageRowAction.result.closeout.actions.length ? (
                                <div className="v1-field-stage-closeout-list">
                                  {fieldEvidenceStageRowAction.result.closeout.actions.map((item) => (
                                    <div className="v1-field-stage-closeout-row" key={`${item.type}:${item.key}`}>
                                      <div>
                                        <StatusPill tone={item.type === "boundary" ? "warning" : "danger"}>
                                          {item.type === "boundary" ? "边界确认" : "负责人签字"}
                                        </StatusPill>
                                        <strong>{item.label}</strong>
                                        <span>{item.progressLabel || item.status}</span>
                                        <button
                                          className="ghost-button v1-field-evidence-fill-button"
                                          onClick={() => selectSignoffBoundaryForStage(item)}
                                          type="button"
                                        >
                                          填到草稿
                                        </button>
                                      </div>
                                      <p>{item.nextAction}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{fieldEvidenceStageRowAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {fieldEvidenceAttachmentAction.result || fieldEvidenceAttachmentAction.error ? (
                    <div className="v1-field-stage-result">
                      {fieldEvidenceAttachmentAction.result ? (
                        <>
                          <div>
                            <StatusPill tone="warning">附件已登记</StatusPill>
                            <strong>最近证据附件</strong>
                          </div>
                          <div className="v1-field-intake-summary">
                            <span>附件 <strong>{fieldEvidenceAttachmentAction.result.attachmentId}</strong></span>
                            <span>文件 <strong>{fieldEvidenceAttachmentAction.result.fileName || "未命名"}</strong></span>
                            <span>草稿引用 <strong>{fieldEvidenceAttachmentAction.result.attachmentId ? "可写入" : "不可写入"}</strong></span>
                          </div>
                        </>
                      ) : (
                        <p>{fieldEvidenceAttachmentAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {signoffBoundaryAttachmentAction.result || signoffBoundaryAttachmentAction.error ? (
                    <div className="v1-field-stage-result">
                      {signoffBoundaryAttachmentAction.result ? (
                        <>
                          <div>
                            <StatusPill tone="warning">附件已登记</StatusPill>
                            <strong>最近签字 / 边界附件</strong>
                          </div>
                          <div className="v1-field-intake-summary">
                            <span>附件 <strong>{signoffBoundaryAttachmentAction.result.attachmentId}</strong></span>
                            <span>文件 <strong>{signoffBoundaryAttachmentAction.result.fileName || "未命名"}</strong></span>
                            <span>备注引用 <strong>{signoffBoundaryAttachmentAction.result.attachmentId ? "可填入" : "不可填入"}</strong></span>
                          </div>
                        </>
                      ) : (
                        <p>{signoffBoundaryAttachmentAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {fieldEvidenceDraftAction.result || fieldEvidenceDraftAction.error ? (
                    <div className="v1-field-intake-draft-result">
                      {fieldEvidenceDraftAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={fieldEvidenceDraftAction.result.output?.draftWritten ? "warning" : "danger"}>
                              {fieldEvidenceDraftAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近草稿生成</strong>
                          </div>
                          <p>{fieldEvidenceDraftAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>应用 <strong>{fieldEvidenceDraftAction.result.summary.appliedLabel}</strong></span>
                            <span>无效 <strong>{fieldEvidenceDraftAction.result.summary.invalidLabel}</strong></span>
                            <span>证据 <strong>{fieldEvidenceDraftAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{fieldEvidenceDraftAction.result.summary.signoffProgress}</strong></span>
                            <span>候选刷新 <strong>{fieldEvidenceDraftAction.result.output.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {fieldEvidenceDraftAction.result.invalidRows.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {fieldEvidenceDraftAction.result.invalidRows.slice(0, 3).map((row) => (
                                <p key={`${row.type}-${row.row}-${row.groupKey}-${row.itemKey}`}>
                                  第 {row.row} 行：{row.fixHint || row.reason}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{fieldEvidenceDraftAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {fieldEvidenceValidationAction.result || fieldEvidenceValidationAction.error ? (
                    <div className="v1-field-intake-validation-result">
                      {fieldEvidenceValidationAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={fieldEvidenceValidationAction.result.ready ? "success" : fieldEvidenceValidationAction.result.schemaValid ? "warning" : "danger"}>
                              {fieldEvidenceValidationAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近草稿校验</strong>
                          </div>
                          <p>{fieldEvidenceValidationAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>证据 <strong>{fieldEvidenceValidationAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{fieldEvidenceValidationAction.result.summary.signoffProgress}</strong></span>
                            <span>证据组 <strong>{fieldEvidenceValidationAction.result.summary.evidenceGroupsReadyLabel}</strong></span>
                            <span>阻塞 <strong>{fieldEvidenceValidationAction.result.summary.blockingIssueLabel}</strong></span>
                            <span>候选刷新 <strong>{fieldEvidenceValidationAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {fieldEvidenceValidationAction.result.blockers.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {fieldEvidenceValidationAction.result.blockers.slice(0, 3).map((item, index) => (
                                <p key={`${item.type}-${item.groupLabel}-${item.label}-${index}`}>
                                  {item.groupLabel ? `${item.groupLabel} / ` : ""}{item.label || item.type}：{item.nextAction || item.reason}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{fieldEvidenceValidationAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {releaseCandidateRefreshPrecheckAction.result || releaseCandidateRefreshPrecheckAction.error ? (
                    <div className="v1-field-intake-refresh-precheck-result">
                      {releaseCandidateRefreshPrecheckAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={releaseCandidateRefreshPrecheckAction.result.ready ? "success" : "warning"}>
                              {releaseCandidateRefreshPrecheckAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近刷新预检</strong>
                          </div>
                          <p>{releaseCandidateRefreshPrecheckAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>证据 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.signoffProgress}</strong></span>
                            <span>生产 env <strong>{releaseCandidateRefreshPrecheckAction.result.summary.productionEnvPreflightLabel}</strong></span>
                            <span>组合门禁 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveReadinessLabel}</strong></span>
                            {releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveFirstBlockedStageLabel ? (
                              <span>首个阻塞 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveFirstBlockedStageLabel}</strong></span>
                            ) : null}
                            <span>边界 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.boundaryLabel}</strong></span>
                            <span>阻塞 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.blockerLabel}</strong></span>
                            <span>候选刷新 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(
                            releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveSourceStatuses,
                          )}
                          {releaseCandidateRefreshPrecheckAction.result.blockers.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {releaseCandidateRefreshPrecheckAction.result.blockers.map((item) => {
                                const blockerActions = buildReleaseCandidateRefreshBlockerActions(item);
                                return (
                                  <div className="v1-refresh-precheck-blocker-row" key={item.key}>
                                    <div>
                                      <StatusPill tone="danger">阻塞</StatusPill>
                                      <strong>{item.label}</strong>
                                    </div>
                                    <p>{item.nextAction || item.detail}</p>
                                    {blockerActions.length ? (
                                      <div className="v1-refresh-precheck-actions">
                                        {blockerActions.map((action) => (
                                          <button
                                            className="ghost-button"
                                            disabled={action.disabled}
                                            key={`${item.key}-${action.key}`}
                                            onClick={action.onClick}
                                            type="button"
                                          >
                                            {action.label}
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{releaseCandidateRefreshPrecheckAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {releaseCandidateRefreshAction.result || releaseCandidateRefreshAction.error ? (
                    <div className="v1-field-intake-refresh-precheck-result">
                      {releaseCandidateRefreshAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={releaseCandidateRefreshAction.result.ready ? "success" : "warning"}>
                              {releaseCandidateRefreshAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近候选刷新</strong>
                          </div>
                          <p>{releaseCandidateRefreshAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>发布候选 <strong>{releaseCandidateRefreshAction.result.summary.releaseGateLabel || releaseCandidateRefreshAction.result.summary.label}</strong></span>
                            <span>证据 <strong>{releaseCandidateRefreshAction.result.summary.evidenceProgress || releaseCandidateRefreshAction.result.summary.fieldEvidenceLabel}</strong></span>
                            <span>签字 <strong>{releaseCandidateRefreshAction.result.summary.signoffProgress || "待复核"}</strong></span>
                            <span>生产 env <strong>{releaseCandidateRefreshAction.result.summary.productionEnvPreflightLabel || "待复核"}</strong></span>
                            <span>组合门禁 <strong>{releaseCandidateRefreshAction.result.summary.productionGoLiveReadinessLabel || "待复核"}</strong></span>
                            {releaseCandidateRefreshAction.result.summary.productionGoLiveFirstBlockedStageLabel ? (
                              <span>首个阻塞 <strong>{releaseCandidateRefreshAction.result.summary.productionGoLiveFirstBlockedStageLabel}</strong></span>
                            ) : null}
                            <span>阻塞 <strong>{releaseCandidateRefreshAction.result.summary.blockerLabel}</strong></span>
                            <span>候选刷新 <strong>{releaseCandidateRefreshAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                            <span>套件刷新 <strong>{releaseCandidateRefreshAction.result.summary.goLiveSuiteRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(
                            releaseCandidateRefreshAction.result.summary.productionGoLiveSourceStatuses,
                          )}
                          {releaseCandidateRefreshAction.result.blockers.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {releaseCandidateRefreshAction.result.blockers.slice(0, 3).map((item) => (
                                <p key={item.key}>
                                  {item.label}：{item.nextAction || item.detail}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{releaseCandidateRefreshAction.error}</p>
                      )}
                    </div>
                  ) : null}
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
