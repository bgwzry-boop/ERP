import { V1StatusEvidenceEntryStage } from "./V1StatusEvidenceEntryStage.jsx";
import { V1StatusFieldCloseoutStage } from "./V1StatusFieldCloseoutStage.jsx";
import { V1StatusFieldProgressStage } from "./V1StatusFieldProgressStage.jsx";
import { V1StatusSignoffEntryStage } from "./V1StatusSignoffEntryStage.jsx";

const fieldEvidenceStages = [
  { key: "progress", label: "进度" },
  { key: "evidence", label: "证据回填" },
  { key: "signoff", label: "签字/边界" },
  { key: "closeout", label: "收尾检查" },
];

export function V1StatusFieldEvidenceWorkspace({
  activeStage,
  onStageChange,
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

  if (!fieldEvidenceProgress) {
    return null;
  }

  return (
    <section
      className="detail-section v1-workspace-panel v1-workspace-field v1-section-evidence"
      ref={fieldEvidenceProgressRef}
    >
      <h3>现场证据 / 签字进度</h3>
      <div className="v1-status-section-tabs" role="tablist" aria-label="现场证据工作阶段">
        {fieldEvidenceStages.map((stage) => (
          <button
            aria-selected={stage.key === activeStage}
            className={stage.key === activeStage ? "active" : ""}
            key={stage.key}
            onClick={() => onStageChange(stage.key)}
            role="tab"
            type="button"
          >
            {stage.label}
          </button>
        ))}
      </div>

      {activeStage === "progress" ? (
        <V1StatusFieldProgressStage
          fieldEvidenceProgress={fieldEvidenceProgress}
          fieldEvidenceGroupSummaries={fieldEvidenceGroupSummaries}
          buildFieldEvidenceGroupActions={buildFieldEvidenceGroupActions}
          missingEvidenceDisplayLabel={missingEvidenceDisplayLabel}
          selectedMissingEvidenceGroup={selectedMissingEvidenceGroup}
          clearMissingEvidenceGroupFilter={clearMissingEvidenceGroupFilter}
          canToggleMissingEvidenceItems={canToggleMissingEvidenceItems}
          setShowAllMissingEvidenceItems={setShowAllMissingEvidenceItems}
          showAllMissingEvidenceItems={showAllMissingEvidenceItems}
          visibleMissingEvidenceItems={visibleMissingEvidenceItems}
          selectMissingEvidenceForStage={selectMissingEvidenceForStage}
          selectSignoffBoundaryForStage={selectSignoffBoundaryForStage}
          onOpenSignoffStage={() => onStageChange("signoff")}
        />
      ) : null}

      {activeStage === "evidence" ? (
        <V1StatusEvidenceEntryStage
          missingEvidenceOptions={missingEvidenceOptions}
          evidenceStageCardRef={evidenceStageCardRef}
          selectedEvidenceStageItem={selectedEvidenceStageItem}
          evidenceStageDraft={evidenceStageDraft}
          setEvidenceStageDraft={setEvidenceStageDraft}
          v1EvidenceStageStatusOptions={v1EvidenceStageStatusOptions}
          evidenceStageRefInputRef={evidenceStageRefInputRef}
          setEvidenceAttachmentFile={setEvidenceAttachmentFile}
          canUploadAndStageEvidenceAttachment={canUploadAndStageEvidenceAttachment}
          uploadAndStageSelectedEvidenceAttachment={uploadAndStageSelectedEvidenceAttachment}
          fieldEvidenceAttachmentAction={fieldEvidenceAttachmentAction}
          canListEvidenceAttachments={canListEvidenceAttachments}
          listSelectedEvidenceAttachments={listSelectedEvidenceAttachments}
          fieldEvidenceAttachmentListAction={fieldEvidenceAttachmentListAction}
          selectedEvidenceAttachmentListResult={selectedEvidenceAttachmentListResult}
          selectedEvidenceAttachmentListError={selectedEvidenceAttachmentListError}
          fillEvidenceRefFromAttachment={fillEvidenceRefFromAttachment}
          canStageEvidenceRow={canStageEvidenceRow}
          stageSelectedEvidenceRow={stageSelectedEvidenceRow}
          fieldEvidenceStageRowAction={fieldEvidenceStageRowAction}
          canStageEvidenceRowAndReview={canStageEvidenceRowAndReview}
          stageSelectedEvidenceRowAndReview={stageSelectedEvidenceRowAndReview}
          fieldEvidenceValidationAction={fieldEvidenceValidationAction}
          releaseCandidateRefreshPrecheckAction={releaseCandidateRefreshPrecheckAction}
          releaseCandidateRefreshAction={releaseCandidateRefreshAction}
        />
      ) : null}

      {activeStage === "signoff" ? (
        <V1StatusSignoffEntryStage
          signoffBoundaryOptions={signoffBoundaryOptions}
          signoffStageCardRef={signoffStageCardRef}
          selectedSignoffBoundaryStageItem={selectedSignoffBoundaryStageItem}
          signoffStageDraft={signoffStageDraft}
          setSignoffStageDraft={setSignoffStageDraft}
          selectedSignoffStatusOptions={selectedSignoffStatusOptions}
          signoffStagePersonInputRef={signoffStagePersonInputRef}
          setSignoffBoundaryAttachmentFile={setSignoffBoundaryAttachmentFile}
          canUploadSignoffBoundaryAttachment={canUploadSignoffBoundaryAttachment}
          uploadAndFillSelectedSignoffBoundaryAttachment={uploadAndFillSelectedSignoffBoundaryAttachment}
          signoffBoundaryAttachmentAction={signoffBoundaryAttachmentAction}
          canListSignoffBoundaryAttachments={canListSignoffBoundaryAttachments}
          listSelectedSignoffBoundaryAttachments={listSelectedSignoffBoundaryAttachments}
          signoffBoundaryAttachmentListAction={signoffBoundaryAttachmentListAction}
          selectedSignoffBoundaryAttachmentListResult={selectedSignoffBoundaryAttachmentListResult}
          selectedSignoffBoundaryAttachmentListError={selectedSignoffBoundaryAttachmentListError}
          fillSignoffBoundaryNoteFromAttachment={fillSignoffBoundaryNoteFromAttachment}
          canStageSignoffBoundaryRow={canStageSignoffBoundaryRow}
          stageSelectedSignoffBoundaryRow={stageSelectedSignoffBoundaryRow}
          fieldEvidenceStageRowAction={fieldEvidenceStageRowAction}
          canStageSignoffBoundaryRowAndReview={canStageSignoffBoundaryRowAndReview}
          stageSelectedSignoffBoundaryRowAndReview={stageSelectedSignoffBoundaryRowAndReview}
          fieldEvidenceValidationAction={fieldEvidenceValidationAction}
          releaseCandidateRefreshPrecheckAction={releaseCandidateRefreshPrecheckAction}
          releaseCandidateRefreshAction={releaseCandidateRefreshAction}
          canStageBoundaryRowAndPrecheck={canStageBoundaryRowAndPrecheck}
          stageSelectedBoundaryRowAndPrecheck={stageSelectedBoundaryRowAndPrecheck}
          v1V2BoundaryPrecheckAction={v1V2BoundaryPrecheckAction}
        />
      ) : null}

      {activeStage === "closeout" ? (
        <V1StatusFieldCloseoutStage
          fieldEvidenceIntakeQuality={fieldEvidenceIntakeQuality}
          fieldEvidenceIntakeQualityRef={fieldEvidenceIntakeQualityRef}
          canGenerateFieldEvidenceDraft={canGenerateFieldEvidenceDraft}
          onGenerateFieldEvidenceDraft={onGenerateFieldEvidenceDraft}
          fieldEvidenceDraftAction={fieldEvidenceDraftAction}
          canValidateFieldEvidenceDraft={canValidateFieldEvidenceDraft}
          onValidateFieldEvidenceDraft={onValidateFieldEvidenceDraft}
          fieldEvidenceValidationAction={fieldEvidenceValidationAction}
          canPrecheckReleaseCandidateRefresh={canPrecheckReleaseCandidateRefresh}
          onPrecheckReleaseCandidateRefresh={onPrecheckReleaseCandidateRefresh}
          releaseCandidateRefreshPrecheckAction={releaseCandidateRefreshPrecheckAction}
          canRefreshReleaseCandidate={canRefreshReleaseCandidate}
          onRefreshReleaseCandidate={onRefreshReleaseCandidate}
          releaseCandidateRefreshAction={releaseCandidateRefreshAction}
          canRunFieldEvidenceCloseoutReview={canRunFieldEvidenceCloseoutReview}
          runFieldEvidenceCloseoutReview={runFieldEvidenceCloseoutReview}
          canRunV1CloseoutFullReview={canRunV1CloseoutFullReview}
          runV1CloseoutFullReview={runV1CloseoutFullReview}
          productionEnvPrecheckAction={productionEnvPrecheckAction}
          productionEnvFileAuditPrecheckAction={productionEnvFileAuditPrecheckAction}
          productionEnvFilePreviewPrecheckAction={productionEnvFilePreviewPrecheckAction}
          v1V2BoundaryPrecheckAction={v1V2BoundaryPrecheckAction}
          productionGoLivePrecheckAction={productionGoLivePrecheckAction}
          runtimeReadinessPrecheckAction={runtimeReadinessPrecheckAction}
          fieldEvidenceStageRowAction={fieldEvidenceStageRowAction}
          fieldEvidenceAttachmentAction={fieldEvidenceAttachmentAction}
          signoffBoundaryAttachmentAction={signoffBoundaryAttachmentAction}
          buildReleaseCandidateRefreshBlockerActions={buildReleaseCandidateRefreshBlockerActions}
          selectMissingEvidenceForStage={selectMissingEvidenceForStage}
          selectSignoffBoundaryForStage={selectSignoffBoundaryForStage}
          fieldEvidenceIntakeGuidance={fieldEvidenceIntakeGuidance}
          fieldEvidenceProgress={fieldEvidenceProgress}
        />
      ) : null}
    </section>
  );
}
