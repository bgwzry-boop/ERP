export function V1StatusEvidenceEntryStage({
  missingEvidenceOptions,
  evidenceStageCardRef,
  selectedEvidenceStageItem,
  evidenceStageDraft,
  setEvidenceStageDraft,
  v1EvidenceStageStatusOptions,
  evidenceStageRefInputRef,
  setEvidenceAttachmentFile,
  canUploadAndStageEvidenceAttachment,
  uploadAndStageSelectedEvidenceAttachment,
  fieldEvidenceAttachmentAction,
  canListEvidenceAttachments,
  listSelectedEvidenceAttachments,
  fieldEvidenceAttachmentListAction,
  selectedEvidenceAttachmentListResult,
  selectedEvidenceAttachmentListError,
  fillEvidenceRefFromAttachment,
  canStageEvidenceRow,
  stageSelectedEvidenceRow,
  fieldEvidenceStageRowAction,
  canStageEvidenceRowAndReview,
  stageSelectedEvidenceRowAndReview,
  fieldEvidenceValidationAction,
  releaseCandidateRefreshPrecheckAction,
  releaseCandidateRefreshAction,
}) {
  return (
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
    </div>
  );
}
