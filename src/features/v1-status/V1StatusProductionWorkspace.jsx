import { V1StatusProductionEnvDraftStage } from "./V1StatusProductionEnvDraftStage.jsx";
import { V1StatusProductionEnvFixStage } from "./V1StatusProductionEnvFixStage.jsx";
import { V1StatusProductionEnvMinimumStage } from "./V1StatusProductionEnvMinimumStage.jsx";
import { V1StatusProductionFirstStage } from "./V1StatusProductionFirstStage.jsx";
import { V1StatusProductionGateStage } from "./V1StatusProductionGateStage.jsx";
import { V1StatusProductionIntakeStage } from "./V1StatusProductionIntakeStage.jsx";

export function V1StatusProductionWorkspace({ data, actions, handlers, refs, viewState }) {
  const {
    productionEnvGate,
    productionEnvIntakeVerification,
    productionEnvMinimumBlockingItems,
    productionEnvMinimumValuesFragmentTemplate,
    productionFirstStageExecution,
    productionEnvValuesApplyGateStatus,
    productionEnvValuesFragmentSourceStatus,
    productionPersistenceEvidence,
    productionPersistenceEvidenceSummary,
    productionPersistenceEvidenceBlockers,
    productionPersistenceEvidenceGuidance,
    productionPersistenceEvidenceLatestBlockers,
    productionPersistenceEvidenceLiveResult,
    productionPersistenceEvidenceLiveSummary,
    productionEnvFixChecklist,
    productionEnvFixItemsForPage,
    productionEnvVariableCheckOverlay,
    productionEnvTemplateSectionIndexByLabel,
    productionEnvMinimumTemplateLinesForPage,
    productionEnvMinimumTemplatePreviewLines,
    productionEnvFillTemplate,
    productionEnvTemplateLinesForPage,
    productionEnvTemplatePreviewLines,
    focusedProductionEnvTemplateLineIndex,
  } = data;
  const {
    productionEnvFileAuditPrecheckAction,
    productionEnvFilePreviewPrecheckAction,
    productionEnvSetupAction,
    productionEnvPrecheckAction,
    productionGoLivePrecheckAction,
    productionEnvIntakePrecheckAction,
    productionFirstStageExecutionAction,
    productionPersistenceEvidenceAction,
    productionFirstStageValuesDryRunAction,
    productionFirstStageValuesApplyAction,
  } = actions;
  const {
    onPrecheckProductionEnvFileAudit,
    onPrecheckProductionEnvFilePreview,
    canShowProductionEnvFrontDoorReview,
    canRunProductionEnvFrontDoorReview,
    runProductionEnvFrontDoorReview,
    productionEnvFrontDoorReviewLoading,
    onRunProductionEnvSetup,
    onPrecheckProductionEnv,
    onPrecheckProductionGoLive,
    buildProductionEnvGateActions,
    onPrecheckProductionEnvIntake,
    scrollV1StatusRefIntoView,
    onRunProductionFirstStageExecution,
    onRunProductionPersistenceEvidence,
    onPrecheckProductionFirstStageValuesDryRun,
    onApplyProductionFirstStageValues,
    focusProductionEnvTemplateSection,
  } = handlers;
  const {
    productionEnvGateRef,
    productionEnvIntakeVerificationRef,
    productionFirstStageExecutionRef,
    productionEnvFixChecklistRef,
    productionEnvMinimumValuesFragmentTemplateRef,
    productionEnvFillTemplateRef,
    productionEnvTemplatePreviewRef,
  } = refs;
  const {
    showAllProductionEnvFixItems,
    setShowAllProductionEnvFixItems,
    showAllProductionEnvMinimumTemplateLines,
    setShowAllProductionEnvMinimumTemplateLines,
    showAllProductionEnvTemplateLines,
    setShowAllProductionEnvTemplateLines,
  } = viewState;

  return (
    <>
      <V1StatusProductionGateStage
        productionEnvGate={productionEnvGate}
        sectionRef={productionEnvGateRef}
        onPrecheckProductionEnvFileAudit={onPrecheckProductionEnvFileAudit}
        productionEnvFileAuditPrecheckAction={productionEnvFileAuditPrecheckAction}
        onPrecheckProductionEnvFilePreview={onPrecheckProductionEnvFilePreview}
        productionEnvFilePreviewPrecheckAction={productionEnvFilePreviewPrecheckAction}
        canShowProductionEnvFrontDoorReview={canShowProductionEnvFrontDoorReview}
        canRunProductionEnvFrontDoorReview={canRunProductionEnvFrontDoorReview}
        runProductionEnvFrontDoorReview={runProductionEnvFrontDoorReview}
        productionEnvFrontDoorReviewLoading={productionEnvFrontDoorReviewLoading}
        onRunProductionEnvSetup={onRunProductionEnvSetup}
        productionEnvSetupAction={productionEnvSetupAction}
        onPrecheckProductionEnv={onPrecheckProductionEnv}
        productionEnvPrecheckAction={productionEnvPrecheckAction}
        onPrecheckProductionGoLive={onPrecheckProductionGoLive}
        productionGoLivePrecheckAction={productionGoLivePrecheckAction}
        buildProductionEnvGateActions={buildProductionEnvGateActions}
      />
      <V1StatusProductionIntakeStage
        productionEnvIntakeVerification={productionEnvIntakeVerification}
        sectionRef={productionEnvIntakeVerificationRef}
        onPrecheckProductionEnvIntake={onPrecheckProductionEnvIntake}
        productionEnvIntakePrecheckAction={productionEnvIntakePrecheckAction}
        productionEnvMinimumBlockingItems={productionEnvMinimumBlockingItems}
        productionEnvMinimumValuesFragmentTemplate={productionEnvMinimumValuesFragmentTemplate}
        productionEnvFixChecklistRef={productionEnvFixChecklistRef}
        productionEnvMinimumValuesFragmentTemplateRef={productionEnvMinimumValuesFragmentTemplateRef}
        productionEnvFillTemplateRef={productionEnvFillTemplateRef}
        scrollV1StatusRefIntoView={scrollV1StatusRefIntoView}
      />
      <V1StatusProductionFirstStage
        productionFirstStageExecution={productionFirstStageExecution}
        sectionRef={productionFirstStageExecutionRef}
        onRunProductionFirstStageExecution={onRunProductionFirstStageExecution}
        productionFirstStageExecutionAction={productionFirstStageExecutionAction}
        onRunProductionPersistenceEvidence={onRunProductionPersistenceEvidence}
        productionPersistenceEvidenceAction={productionPersistenceEvidenceAction}
        onPrecheckProductionFirstStageValuesDryRun={onPrecheckProductionFirstStageValuesDryRun}
        productionFirstStageValuesDryRunAction={productionFirstStageValuesDryRunAction}
        onApplyProductionFirstStageValues={onApplyProductionFirstStageValues}
        productionFirstStageValuesApplyAction={productionFirstStageValuesApplyAction}
        productionEnvValuesApplyGateStatus={productionEnvValuesApplyGateStatus}
        productionEnvValuesFragmentSourceStatus={productionEnvValuesFragmentSourceStatus}
        productionPersistenceEvidence={productionPersistenceEvidence}
        productionPersistenceEvidenceSummary={productionPersistenceEvidenceSummary}
        productionPersistenceEvidenceBlockers={productionPersistenceEvidenceBlockers}
        productionPersistenceEvidenceGuidance={productionPersistenceEvidenceGuidance}
        productionPersistenceEvidenceLatestBlockers={productionPersistenceEvidenceLatestBlockers}
        productionPersistenceEvidenceLiveResult={productionPersistenceEvidenceLiveResult}
        productionPersistenceEvidenceLiveSummary={productionPersistenceEvidenceLiveSummary}
        productionEnvIntakeVerificationRef={productionEnvIntakeVerificationRef}
        productionEnvMinimumValuesFragmentTemplateRef={productionEnvMinimumValuesFragmentTemplateRef}
        productionEnvFillTemplateRef={productionEnvFillTemplateRef}
        scrollV1StatusRefIntoView={scrollV1StatusRefIntoView}
      />
      <V1StatusProductionEnvFixStage
        productionEnvFixChecklist={productionEnvFixChecklist}
        sectionRef={productionEnvFixChecklistRef}
        productionEnvFixItemsForPage={productionEnvFixItemsForPage}
        productionEnvVariableCheckOverlay={productionEnvVariableCheckOverlay}
        showAllProductionEnvFixItems={showAllProductionEnvFixItems}
        setShowAllProductionEnvFixItems={setShowAllProductionEnvFixItems}
        productionEnvTemplateSectionIndexByLabel={productionEnvTemplateSectionIndexByLabel}
        focusProductionEnvTemplateSection={focusProductionEnvTemplateSection}
      />
      <V1StatusProductionEnvMinimumStage
        productionEnvMinimumValuesFragmentTemplate={productionEnvMinimumValuesFragmentTemplate}
        sectionRef={productionEnvMinimumValuesFragmentTemplateRef}
        productionEnvMinimumTemplateLinesForPage={productionEnvMinimumTemplateLinesForPage}
        productionEnvMinimumTemplatePreviewLines={productionEnvMinimumTemplatePreviewLines}
        showAllProductionEnvMinimumTemplateLines={showAllProductionEnvMinimumTemplateLines}
        setShowAllProductionEnvMinimumTemplateLines={setShowAllProductionEnvMinimumTemplateLines}
      />
      <V1StatusProductionEnvDraftStage
        productionEnvFillTemplate={productionEnvFillTemplate}
        sectionRef={productionEnvFillTemplateRef}
        productionEnvTemplateLinesForPage={productionEnvTemplateLinesForPage}
        productionEnvTemplatePreviewLines={productionEnvTemplatePreviewLines}
        productionEnvTemplatePreviewRef={productionEnvTemplatePreviewRef}
        focusedProductionEnvTemplateLineIndex={focusedProductionEnvTemplateLineIndex}
        showAllProductionEnvTemplateLines={showAllProductionEnvTemplateLines}
        setShowAllProductionEnvTemplateLines={setShowAllProductionEnvTemplateLines}
      />
    </>
  );
}
