import { StatusPill } from "../../components/ui.jsx";
import { renderV1ProductionEnvFileSourceStatusList } from "./V1StatusOverview.jsx";

export function V1StatusFieldEvidenceWorkspace({
  data,
  capabilities,
  actions,
  handlers,
  drafts,
  refs,
  options,
}) {
  const {
    fieldEvidenceGroupSummaries,
    fieldEvidenceIntakeGuidance,
    fieldEvidenceIntakeQuality,
    fieldEvidenceProgress,
    missingEvidenceDisplayLabel,
    missingEvidenceOptions,
    selectedEvidenceAttachmentListError,
    selectedEvidenceAttachmentListResult,
    selectedEvidenceStageItem,
    selectedMissingEvidenceGroup,
    selectedSignoffBoundaryAttachmentListError,
    selectedSignoffBoundaryAttachmentListResult,
    selectedSignoffBoundaryStageItem,
    signoffBoundaryOptions,
    visibleMissingEvidenceItems,
  } = data;
  const {
    canGenerateFieldEvidenceDraft,
    canListEvidenceAttachments,
    canListSignoffBoundaryAttachments,
    canPrecheckReleaseCandidateRefresh,
    canRefreshReleaseCandidate,
    canRunFieldEvidenceCloseoutReview,
    canRunV1CloseoutFullReview,
    canStageBoundaryRowAndPrecheck,
    canStageEvidenceRow,
    canStageEvidenceRowAndReview,
    canStageSignoffBoundaryRow,
    canStageSignoffBoundaryRowAndReview,
    canToggleMissingEvidenceItems,
    canUploadAndStageEvidenceAttachment,
    canUploadSignoffBoundaryAttachment,
    canValidateFieldEvidenceDraft,
  } = capabilities;
  const {
    fieldEvidenceAttachmentAction,
    fieldEvidenceAttachmentListAction,
    fieldEvidenceDraftAction,
    fieldEvidenceStageRowAction,
    fieldEvidenceValidationAction,
    productionEnvFileAuditPrecheckAction,
    productionEnvFilePreviewPrecheckAction,
    productionEnvPrecheckAction,
    productionGoLivePrecheckAction,
    releaseCandidateRefreshAction,
    releaseCandidateRefreshPrecheckAction,
    runtimeReadinessPrecheckAction,
    signoffBoundaryAttachmentAction,
    signoffBoundaryAttachmentListAction,
    v1V2BoundaryPrecheckAction,
  } = actions;
  const {
    buildFieldEvidenceGroupActions,
    buildReleaseCandidateRefreshBlockerActions,
    clearMissingEvidenceGroupFilter,
    fillEvidenceRefFromAttachment,
    fillSignoffBoundaryNoteFromAttachment,
    listSelectedEvidenceAttachments,
    listSelectedSignoffBoundaryAttachments,
    onGenerateFieldEvidenceDraft,
    onPrecheckReleaseCandidateRefresh,
    onRefreshReleaseCandidate,
    onValidateFieldEvidenceDraft,
    runFieldEvidenceCloseoutReview,
    runV1CloseoutFullReview,
    selectMissingEvidenceForStage,
    selectSignoffBoundaryForStage,
    stageSelectedBoundaryRowAndPrecheck,
    stageSelectedEvidenceRow,
    stageSelectedEvidenceRowAndReview,
    stageSelectedSignoffBoundaryRow,
    stageSelectedSignoffBoundaryRowAndReview,
    uploadAndFillSelectedSignoffBoundaryAttachment,
    uploadAndStageSelectedEvidenceAttachment,
  } = handlers;
  const {
    evidenceStageDraft,
    setEvidenceAttachmentFile,
    setEvidenceStageDraft,
    setShowAllMissingEvidenceItems,
    setSignoffBoundaryAttachmentFile,
    setSignoffStageDraft,
    showAllMissingEvidenceItems,
    signoffStageDraft,
  } = drafts;
  const {
    evidenceStageCardRef,
    evidenceStageRefInputRef,
    fieldEvidenceIntakeQualityRef,
    fieldEvidenceProgressRef,
    signoffStageCardRef,
    signoffStagePersonInputRef,
  } = refs;
  const {
    selectedSignoffStatusOptions,
    v1EvidenceStageStatusOptions,
  } = options;

  return (
    <>
          {fieldEvidenceProgress ? (
            <section className="detail-section v1-workspace-panel v1-workspace-field v1-section-evidence" ref={fieldEvidenceProgressRef}>
              <h3>现场证据 / 签字进度</h3>
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
                      还有 {fieldEvidenceProgress.signoffBoundarySummary.hiddenActionCount} 项在下方签字/边界待办中继续处理。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {fieldEvidenceProgress.signoffBoundaryActions?.length ? (
                <div className="v1-signoff-boundary-actions">
                  <div className="v1-field-evidence-missing-head">
                    <strong>签字/边界待办</strong>
                    <span>显示 {fieldEvidenceProgress.summary.signoffBoundaryActionsLabel || `${fieldEvidenceProgress.signoffBoundaryActions.length}/${fieldEvidenceProgress.summary.signoffBoundaryActionCount}`}</span>
                  </div>
                  <div className="v1-signoff-boundary-list">
                    {fieldEvidenceProgress.signoffBoundaryActions.map((item) => (
                      <div className="v1-signoff-boundary-row" key={`${item.type}-${item.key}`}>
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
                </div>
              ) : null}
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
                  {missingEvidenceOptions.length || signoffBoundaryOptions.length ? (
                    <div className="v1-field-stage-grid">
                      {missingEvidenceOptions.length ? (
                        <div className="v1-field-stage-card" ref={evidenceStageCardRef}>
                          <div className="v1-field-stage-title">
                            <strong>现场证据草稿</strong>
                            <span>{selectedEvidenceStageItem?.groupLabel || "待选择"}</span>
                          </div>
                          <select
                            value={evidenceStageDraft.selectionKey || (selectedEvidenceStageItem ? `${selectedEvidenceStageItem.groupKey}:${selectedEvidenceStageItem.key}` : "")}
                            onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, selectionKey: event.target.value }))}
                          >
                            {missingEvidenceOptions.map((item) => (
                              <option key={`${item.groupKey}:${item.key}`} value={`${item.groupKey}:${item.key}`}>
                                {item.groupLabel} / {item.label}
                              </option>
                            ))}
                          </select>
                          <div className="v1-field-stage-row">
                            <select
                              value={evidenceStageDraft.onsiteStatus}
                              onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, onsiteStatus: event.target.value }))}
                            >
                              {v1EvidenceStageStatusOptions.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            <input
                              ref={evidenceStageRefInputRef}
                              value={evidenceStageDraft.onsiteEvidenceRef}
                              onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, onsiteEvidenceRef: event.target.value }))}
                              placeholder="证据编号 / 文件名"
                            />
                          </div>
                          <input
                            value={evidenceStageDraft.onsiteNotes}
                            onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, onsiteNotes: event.target.value }))}
                            placeholder="备注"
                          />
                          <div className="v1-field-stage-upload">
                            <input
                              type="file"
                              accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
                              onChange={(event) => setEvidenceAttachmentFile(event.target.files?.[0] ?? null)}
                            />
                            <button
                              className="ghost-button"
                              disabled={!canUploadAndStageEvidenceAttachment}
                              onClick={uploadAndStageSelectedEvidenceAttachment}
                              type="button"
                            >
                              {fieldEvidenceAttachmentAction.loading ? "上传中" : "上传并保存证据"}
                            </button>
                          </div>
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canListEvidenceAttachments}
                              onClick={listSelectedEvidenceAttachments}
                              type="button"
                            >
                              {fieldEvidenceAttachmentListAction.loading ? "查询中" : "查询已登记附件"}
                            </button>
                          </div>
                          {selectedEvidenceAttachmentListResult || selectedEvidenceAttachmentListError ? (
                            <div className="v1-field-attachment-list">
                              {selectedEvidenceAttachmentListResult ? (
                                <>
                                  <div className="v1-field-stage-title">
                                    <strong>已登记证据附件</strong>
                                    <span>{selectedEvidenceAttachmentListResult.items.length}/{selectedEvidenceAttachmentListResult.total}</span>
                                  </div>
                                  {selectedEvidenceAttachmentListResult.items.length ? (
                                    selectedEvidenceAttachmentListResult.items.map((item) => (
                                      <div className="v1-field-attachment-row" key={item.attachmentId}>
                                        <div>
                                          <strong>{item.attachmentId}</strong>
                                          <span>{item.fileName || "未命名附件"}</span>
                                        </div>
                                        <button
                                          className="ghost-button"
                                          onClick={() => fillEvidenceRefFromAttachment(item)}
                                          type="button"
                                        >
                                          填入引用
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p>当前证据项还没有后端 ATT 附件。</p>
                                  )}
                                </>
                              ) : (
                                <p>{selectedEvidenceAttachmentListError}</p>
                              )}
                            </div>
                          ) : null}
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canStageEvidenceRow}
                              onClick={stageSelectedEvidenceRow}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ? "保存中" : "保存证据草稿"}
                            </button>
                            <button
                              className="ghost-button"
                              disabled={!canStageEvidenceRowAndReview}
                              onClick={stageSelectedEvidenceRowAndReview}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ||
                              fieldEvidenceValidationAction.loading ||
                              releaseCandidateRefreshPrecheckAction.loading ||
                              releaseCandidateRefreshAction.loading
                                ? "保存复核中"
                                : "保存并复核证据"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {signoffBoundaryOptions.length ? (
                        <div className="v1-field-stage-card" ref={signoffStageCardRef}>
                          <div className="v1-field-stage-title">
                            <strong>签字 / 边界草稿</strong>
                            <span>{selectedSignoffBoundaryStageItem?.type === "boundary" ? "边界确认" : "负责人签字"}</span>
                          </div>
                          <select
                            value={signoffStageDraft.selectionKey || (selectedSignoffBoundaryStageItem ? `${selectedSignoffBoundaryStageItem.type}:${selectedSignoffBoundaryStageItem.key}` : "")}
                            onChange={(event) => {
                              const next = signoffBoundaryOptions.find((item) => `${item.type}:${item.key}` === event.target.value);
                              setSignoffStageDraft((current) => ({
                                ...current,
                                selectionKey: event.target.value,
                                onsiteStatus: next?.type === "boundary" ? "confirmed" : "signed",
                              }));
                            }}
                          >
                            {signoffBoundaryOptions.map((item) => (
                              <option key={`${item.type}:${item.key}`} value={`${item.type}:${item.key}`}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          <div className="v1-field-stage-row">
                            <select
                              value={signoffStageDraft.onsiteStatus}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, onsiteStatus: event.target.value }))}
                            >
                              {selectedSignoffStatusOptions.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            <input
                              ref={signoffStagePersonInputRef}
                              value={signoffStageDraft.person}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, person: event.target.value }))}
                              placeholder={selectedSignoffBoundaryStageItem?.type === "boundary" ? "确认人" : "签字人"}
                            />
                          </div>
                          <div className="v1-field-stage-row">
                            <input
                              type="datetime-local"
                              value={signoffStageDraft.time}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, time: event.target.value }))}
                            />
                            <input
                              value={signoffStageDraft.onsiteNotes}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, onsiteNotes: event.target.value }))}
                              placeholder="备注"
                            />
                          </div>
                          <div className="v1-field-stage-upload">
                            <input
                              type="file"
                              accept="image/*,application/pdf,.pdf,.doc,.docx,.txt"
                              onChange={(event) => setSignoffBoundaryAttachmentFile(event.target.files?.[0] ?? null)}
                            />
                            <button
                              className="ghost-button"
                              disabled={!canUploadSignoffBoundaryAttachment}
                              onClick={uploadAndFillSelectedSignoffBoundaryAttachment}
                              type="button"
                            >
                              {signoffBoundaryAttachmentAction.loading ? "上传中" : "上传并填入备注"}
                            </button>
                          </div>
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canListSignoffBoundaryAttachments}
                              onClick={listSelectedSignoffBoundaryAttachments}
                              type="button"
                            >
                              {signoffBoundaryAttachmentListAction.loading ? "查询中" : "查询已登记签字附件"}
                            </button>
                          </div>
                          {selectedSignoffBoundaryAttachmentListResult || selectedSignoffBoundaryAttachmentListError ? (
                            <div className="v1-field-attachment-list">
                              {selectedSignoffBoundaryAttachmentListResult ? (
                                <>
                                  <div className="v1-field-stage-title">
                                    <strong>已登记签字 / 边界附件</strong>
                                    <span>{selectedSignoffBoundaryAttachmentListResult.items.length}/{selectedSignoffBoundaryAttachmentListResult.total}</span>
                                  </div>
                                  {selectedSignoffBoundaryAttachmentListResult.items.length ? (
                                    selectedSignoffBoundaryAttachmentListResult.items.map((item) => (
                                      <div className="v1-field-attachment-row" key={item.attachmentId}>
                                        <div>
                                          <strong>{item.attachmentId}</strong>
                                          <span>{item.fileName || "未命名附件"}</span>
                                        </div>
                                        <button
                                          className="ghost-button"
                                          onClick={() => fillSignoffBoundaryNoteFromAttachment(item)}
                                          type="button"
                                        >
                                          填入备注
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p>当前签字 / 边界项还没有后端 ATT 附件。</p>
                                  )}
                                </>
                              ) : (
                                <p>{selectedSignoffBoundaryAttachmentListError}</p>
                              )}
                            </div>
                          ) : null}
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canStageSignoffBoundaryRow}
                              onClick={stageSelectedSignoffBoundaryRow}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ? "保存中" : "保存签字草稿"}
                            </button>
                            <button
                              className="ghost-button"
                              disabled={!canStageSignoffBoundaryRowAndReview}
                              onClick={stageSelectedSignoffBoundaryRowAndReview}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ||
                              fieldEvidenceValidationAction.loading ||
                              releaseCandidateRefreshPrecheckAction.loading ||
                              releaseCandidateRefreshAction.loading
                                ? "保存复核中"
                                : selectedSignoffBoundaryStageItem?.type === "boundary"
                                  ? "保存并复核边界"
                                  : "保存并复核签字"}
                            </button>
                            {selectedSignoffBoundaryStageItem?.type === "boundary" ? (
                              <button
                                className="ghost-button"
                                disabled={!canStageBoundaryRowAndPrecheck}
                                onClick={stageSelectedBoundaryRowAndPrecheck}
                                type="button"
                              >
                                {fieldEvidenceStageRowAction.loading || v1V2BoundaryPrecheckAction.loading
                                  ? "保存预检中"
                                  : "保存并预检边界"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
            </section>
          ) : null}
    </>
  );
}
