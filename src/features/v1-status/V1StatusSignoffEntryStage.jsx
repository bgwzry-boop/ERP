export function V1StatusSignoffEntryStage({
  signoffBoundaryOptions,
  signoffStageCardRef,
  selectedSignoffBoundaryStageItem,
  signoffStageDraft,
  setSignoffStageDraft,
  selectedSignoffStatusOptions,
  signoffStagePersonInputRef,
  setSignoffBoundaryAttachmentFile,
  canUploadSignoffBoundaryAttachment,
  uploadAndFillSelectedSignoffBoundaryAttachment,
  signoffBoundaryAttachmentAction,
  canListSignoffBoundaryAttachments,
  listSelectedSignoffBoundaryAttachments,
  signoffBoundaryAttachmentListAction,
  selectedSignoffBoundaryAttachmentListResult,
  selectedSignoffBoundaryAttachmentListError,
  fillSignoffBoundaryNoteFromAttachment,
  canStageSignoffBoundaryRow,
  stageSelectedSignoffBoundaryRow,
  fieldEvidenceStageRowAction,
  canStageSignoffBoundaryRowAndReview,
  stageSelectedSignoffBoundaryRowAndReview,
  fieldEvidenceValidationAction,
  releaseCandidateRefreshPrecheckAction,
  releaseCandidateRefreshAction,
  canStageBoundaryRowAndPrecheck,
  stageSelectedBoundaryRowAndPrecheck,
  v1V2BoundaryPrecheckAction,
}) {
  return (
    <div className="v1-field-stage-grid">
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
  );
}
