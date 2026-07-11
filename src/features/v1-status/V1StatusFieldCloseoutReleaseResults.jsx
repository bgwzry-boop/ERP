import { StatusPill } from "../../components/ui.jsx";
import { renderV1ProductionEnvFileSourceStatusList } from "./V1StatusOverview.jsx";

export function V1StatusFieldCloseoutReleaseResults({
  buildReleaseCandidateRefreshBlockerActions,
  fieldEvidenceDraftAction,
  fieldEvidenceValidationAction,
  releaseCandidateRefreshAction,
  releaseCandidateRefreshPrecheckAction,
}) {
  return (
    <>
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
    </>
  );
}
