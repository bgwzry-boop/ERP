import { StatusPill } from "../../components/ui.jsx";

export function V1StatusFieldProgressStage({
  fieldEvidenceProgress,
  fieldEvidenceGroupSummaries,
  buildFieldEvidenceGroupActions,
  missingEvidenceDisplayLabel,
  selectedMissingEvidenceGroup,
  clearMissingEvidenceGroupFilter,
  canToggleMissingEvidenceItems,
  setShowAllMissingEvidenceItems,
  showAllMissingEvidenceItems,
  visibleMissingEvidenceItems,
  selectMissingEvidenceForStage,
  selectSignoffBoundaryForStage,
  onOpenSignoffStage,
}) {
  return (
    <>
              <div className="v1-field-evidence-summary">
                <span>证据组 <strong>{fieldEvidenceProgress.summary.evidenceGroupsLabel}</strong></span>
                <span>证据 <strong>{fieldEvidenceProgress.summary.evidenceItemsLabel}</strong></span>
                <span>签字 <strong>{fieldEvidenceProgress.summary.signoffLabel}</strong></span>
                <span>V1/V2 边界 <strong>{fieldEvidenceProgress.boundary.label}</strong></span>
              </div>
              <div className="v1-field-evidence-list">
                {fieldEvidenceGroupSummaries.slice(0, 6).map((group) => {
                  const groupActions = buildFieldEvidenceGroupActions(group);
                  const previewItems = group.previewItems?.length
                    ? group.previewItems
                    : group.firstMissingItems || [];
                  const hiddenPreviewCount =
                    group.hiddenPreviewCount ||
                    Math.max(0, (group.missingCount || 0) - previewItems.length);
                  return (
                    <div className="v1-field-evidence-row" key={group.key}>
                      <div>
                        <StatusPill tone={group.ready ? "success" : "danger"}>
                          {group.ready ? "已满足" : "阻塞"}
                        </StatusPill>
                        <strong>{group.label}</strong>
                      </div>
                      <p>{group.firstMissingItem?.nextAction || group.nextAction}</p>
                      <div className="v1-field-evidence-meta">
                        <span>{group.ownerRole}</span>
                        <span>{group.progressLabel || `${group.completedRequired}/${group.requiredTotal}`} 已完成</span>
                        <span>缺 {group.missingLabel} 项</span>
                      </div>
                      {previewItems.length ? (
                        <div className="v1-field-evidence-group-preview">
                          <strong>本组待补</strong>
                          {previewItems.map((item) => (
                            <div className="v1-field-evidence-group-preview-row" key={`${group.key}:${item.key}`}>
                              <span>{item.label}</span>
                              <button
                                className="ghost-button"
                                onClick={() => selectMissingEvidenceForStage(item)}
                                type="button"
                              >
                                填到草稿
                              </button>
                            </div>
                          ))}
                          {hiddenPreviewCount > 0 ? (
                            <p>还有 {hiddenPreviewCount} 项，点只看本组后继续处理。</p>
                          ) : null}
                        </div>
                      ) : null}
                      {groupActions.length ? (
                        <div className="v1-field-evidence-group-actions">
                          {groupActions.map((action) => (
                            <button
                              className="ghost-button"
                              disabled={action.disabled}
                              key={action.key}
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
              {fieldEvidenceProgress.missingItems?.length ? (
                <div className="v1-field-evidence-missing">
                  <div className="v1-field-evidence-missing-head">
                    <div>
                      <strong>优先补证据</strong>
                      <span>显示 {missingEvidenceDisplayLabel}</span>
                    </div>
                    {selectedMissingEvidenceGroup ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={clearMissingEvidenceGroupFilter}
                      >
                        显示全部证据
                      </button>
                    ) : canToggleMissingEvidenceItems ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setShowAllMissingEvidenceItems((value) => !value)}
                      >
                        {showAllMissingEvidenceItems ? "收起证据" : "展开全部证据"}
                      </button>
                    ) : null}
                  </div>
                  <div className="v1-field-evidence-item-list">
                    {visibleMissingEvidenceItems.map((item) => (
                      <div className="v1-field-evidence-item" key={`${item.groupKey}:${item.key}`}>
                        <div>
                          <StatusPill tone={item.evidenceFilled ? "warning" : "danger"}>
                            {item.evidenceFilled ? "待确认" : "缺证据"}
                          </StatusPill>
                          <strong>{item.label}</strong>
                          <button
                            className="ghost-button v1-field-evidence-fill-button"
                            onClick={() => selectMissingEvidenceForStage(item)}
                            type="button"
                          >
                            填到草稿
                          </button>
                        </div>
                        <p>{item.nextAction}</p>
                        <div className="v1-field-evidence-meta">
                          <span>{item.groupLabel}</span>
                          <span>{item.ownerRole}</span>
                          <span>{item.progressLabel || item.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {fieldEvidenceProgress.signoffBoundarySummary ? (
                <div className="v1-signoff-boundary-summary">
                  <div className="v1-field-evidence-missing-head">
                    <div>
                      <strong>签字 / 边界收尾</strong>
                      <span>待办 {fieldEvidenceProgress.signoffBoundarySummary.actionLabel}</span>
                    </div>
                  </div>
                  <div className="v1-field-intake-summary">
                    <span>
                      签字 <strong>{fieldEvidenceProgress.signoffBoundarySummary.signoffProgressLabel}</strong>
                    </span>
                    <span>
                      缺签字 <strong>{fieldEvidenceProgress.signoffBoundarySummary.missingSignoffCount}</strong>
                    </span>
                    <span>
                      边界 <strong>{fieldEvidenceProgress.signoffBoundarySummary.boundaryLabel}</strong>
                    </span>
                    <span>
                      首批{" "}
                      <strong>
                        {fieldEvidenceProgress.signoffBoundarySummary.previewActions.length}/
                        {fieldEvidenceProgress.signoffBoundarySummary.actionCount}
                      </strong>
                    </span>
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceProgress.signoffBoundarySummary.nextAction}</p>
                  {fieldEvidenceProgress.signoffBoundarySummary.previewActions.length ? (
                    <div className="v1-signoff-boundary-list">
                      {fieldEvidenceProgress.signoffBoundarySummary.previewActions.map((item) => (
                        <div className="v1-signoff-boundary-row" key={`summary-${item.type}-${item.key}`}>
                          <div>
                            <StatusPill tone={item.type === "boundary" ? "warning" : "danger"}>
                              {item.type === "boundary" ? "边界确认" : "负责人签字"}
                            </StatusPill>
                            <strong>{item.label}</strong>
                            <button
                              className="ghost-button v1-field-evidence-fill-button"
                              onClick={() => selectSignoffBoundaryForStage(item)}
                              type="button"
                            >
                              填到草稿
                            </button>
                          </div>
                          <p>{item.nextAction}</p>
                          <div className="v1-field-evidence-meta">
                            <span>{item.progressLabel || item.status}</span>
                            <span>{item.personFilled ? "已填负责人" : item.type === "boundary" ? "缺确认人" : "缺签字人"}</span>
                            <span>{item.timeFilled ? "已填时间" : "缺时间"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {fieldEvidenceProgress.signoffBoundarySummary.hiddenActionCount > 0 ? (
                    <p className="v1-field-intake-note">
                      还有 {fieldEvidenceProgress.signoffBoundarySummary.hiddenActionCount} 项在签字/边界阶段继续处理。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {fieldEvidenceProgress.signoffBoundaryActions?.length ? (
                <div className="v1-signoff-boundary-actions">
                  <div className="v1-field-evidence-missing-head">
                    <div>
                      <strong>签字/边界待办</strong>
                      <span>显示 {fieldEvidenceProgress.summary.signoffBoundaryActionsLabel || `${fieldEvidenceProgress.signoffBoundaryActions.length}/${fieldEvidenceProgress.summary.signoffBoundaryActionCount}`}</span>
                    </div>
                    <button className="ghost-button" onClick={onOpenSignoffStage} type="button">
                      进入签字/边界
                    </button>
                  </div>
                  <p className="v1-field-intake-note">
                    共 {fieldEvidenceProgress.signoffBoundaryActions.length} 项，当前仅显示首批预览；进入签字/边界阶段可逐项处理。
                  </p>
                </div>
              ) : null}
    </>
  );
}
