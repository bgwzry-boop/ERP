import { StatusPill } from "../../components/ui.jsx";

export function V1StatusFieldCloseoutStagingResults({
  fieldEvidenceAttachmentAction,
  fieldEvidenceStageRowAction,
  selectMissingEvidenceForStage,
  selectSignoffBoundaryForStage,
  signoffBoundaryAttachmentAction,
}) {
  return (
    <>
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
    </>
  );
}
