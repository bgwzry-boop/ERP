import { useEffect, useRef, useState } from "react";
import { DetailPane, InfoGrid, StatusPill } from "../../components/ui.jsx";
import {
  V1StatusGateModulePanel,
  V1StatusHeader,
  V1StatusUnavailable,
  renderV1ProductionEnvFileSourceStatusList,
} from "./V1StatusOverview.jsx";
import {
  buildProductionEnvVariableCheckOverlayForPage,
  buildProductionEnvVariableChecksForPage,
  buildV1StatusSummaryForPage,
  formatV1StatusSnapshotTime,
  getProductionEnvTemplateSectionLabel,
  getProductionEnvVariableCheckCountLabelForPage,
  getProductionEnvVariableCheckOverlayItemForPage,
  getV1PhaseTaskTone,
  normalizeV1PhaseGroupForPage,
  normalizeV1PhaseTaskForPage,
  v1BoundaryStageStatusOptions,
  v1EvidenceStageStatusOptions,
  v1ModuleCompletionRows,
  v1SignoffStageStatusOptions,
  v1StatusSnapshotMaxAgeMs,
  v1UnblockPlan,
  v2DifferenceItems,
} from "./v1StatusPresentation.js";


export function V1StatusPage({
  fieldEvidenceDraftAction = {},
  fieldEvidenceValidationAction = {},
  fieldEvidenceStageRowAction = {},
  fieldEvidenceAttachmentAction = {},
  fieldEvidenceAttachmentListAction = {},
  signoffBoundaryAttachmentAction = {},
  signoffBoundaryAttachmentListAction = {},
  productionEnvPrecheckAction = {},
  productionEnvSetupAction = {},
  productionEnvIntakePrecheckAction = {},
  productionEnvFileAuditPrecheckAction = {},
  productionEnvFilePreviewPrecheckAction = {},
  productionGoLivePrecheckAction = {},
  productionPersistenceEvidenceAction = {},
  productionFirstStageExecutionAction = {},
  productionFirstStageValuesDryRunAction = {},
  productionFirstStageValuesApplyAction = {},
  persistencePrecheckAction = {},
  attachmentRetentionPrecheckAction = {},
  printSpoolPrecheckAction = {},
  printCupsPrecheckAction = {},
  printReadinessPrecheckAction = {},
  driverReadinessPrecheckAction = {},
  runtimeReadinessPrecheckAction = {},
  v1V2BoundaryPrecheckAction = {},
  v1V2ScopeBriefRefreshAction = {},
  releaseCandidateRefreshPrecheckAction = {},
  releaseCandidateRefreshAction = {},
  goLiveStatus = null,
  goLiveMeta = {},
  onGenerateFieldEvidenceDraft,
  onStageFieldEvidenceRow,
  onUploadFieldEvidenceAttachment,
  onListFieldEvidenceAttachments,
  onUploadSignoffBoundaryAttachment,
  onListSignoffBoundaryAttachments,
  onPrecheckProductionEnv,
  onRunProductionEnvSetup,
  onPrecheckProductionEnvIntake,
  onPrecheckProductionEnvFileAudit,
  onPrecheckProductionEnvFilePreview,
  onPrecheckProductionGoLive,
  onRunProductionPersistenceEvidence,
  onRunProductionFirstStageExecution,
  onPrecheckProductionFirstStageValuesDryRun,
  onApplyProductionFirstStageValues,
  onPrecheckV1Persistence,
  onPrecheckV1AttachmentRetention,
  onPrecheckV1PrintSpool,
  onPrecheckV1PrintCups,
  onPrecheckV1PrintReadiness,
  onPrecheckV1DriverReadiness,
  onPrecheckRuntimeReadiness,
  onPrecheckV1V2Boundary,
  onRefreshV1V2ScopeBrief,
  onPrecheckReleaseCandidateRefresh,
  onRefreshReleaseCandidate,
  onValidateFieldEvidenceDraft,
}) {
  const [selectedModuleName, setSelectedModuleName] = useState("原材料 / 成本 / 毛利");
  const [selectedPhaseKey, setSelectedPhaseKey] = useState("production_environment");
  const [evidenceStageDraft, setEvidenceStageDraft] = useState({
    selectionKey: "",
    onsiteStatus: "passed",
    onsiteEvidenceRef: "",
    onsiteNotes: "",
  });
  const [evidenceAttachmentFile, setEvidenceAttachmentFile] = useState(null);
  const [signoffBoundaryAttachmentFile, setSignoffBoundaryAttachmentFile] = useState(null);
  const [showAllMissingEvidenceItems, setShowAllMissingEvidenceItems] = useState(false);
  const [selectedMissingEvidenceGroupKey, setSelectedMissingEvidenceGroupKey] = useState("");
  const [showAllV1MustContinueItems, setShowAllV1MustContinueItems] = useState(false);
  const [showAllV2BoundaryDifferences, setShowAllV2BoundaryDifferences] = useState(false);
  const [showAllV1V2ModuleDifferences, setShowAllV1V2ModuleDifferences] = useState(false);
  const [showAllProductionEnvFixItems, setShowAllProductionEnvFixItems] = useState(false);
  const [showAllProductionEnvTemplateLines, setShowAllProductionEnvTemplateLines] = useState(false);
  const [showAllProductionEnvMinimumTemplateLines, setShowAllProductionEnvMinimumTemplateLines] = useState(false);
  const [focusedProductionEnvTemplateLineIndex, setFocusedProductionEnvTemplateLineIndex] = useState(null);
  const [signoffStageDraft, setSignoffStageDraft] = useState({
    selectionKey: "",
    onsiteStatus: "signed",
    person: "",
    time: "",
    onsiteNotes: "",
  });
  const evidenceStageCardRef = useRef(null);
  const evidenceStageRefInputRef = useRef(null);
  const signoffStageCardRef = useRef(null);
  const signoffStagePersonInputRef = useRef(null);
  const fieldEvidenceIntakeQualityRef = useRef(null);
  const fieldEvidenceProgressRef = useRef(null);
  const fieldAcceptanceReportRef = useRef(null);
  const runtimeReadinessSectionRef = useRef(null);
  const v1V2BoundaryBriefRef = useRef(null);
  const productionEnvGateRef = useRef(null);
  const productionEnvIntakeVerificationRef = useRef(null);
  const productionFirstStageExecutionRef = useRef(null);
  const productionEnvFixChecklistRef = useRef(null);
  const productionEnvMinimumValuesFragmentTemplateRef = useRef(null);
  const productionEnvFillTemplateRef = useRef(null);
  const productionEnvTemplatePreviewRef = useRef(null);
  const statusSummary = buildV1StatusSummaryForPage(goLiveStatus);
  const moduleCompletionRows = goLiveStatus?.moduleCompletionRows?.length
    ? goLiveStatus.moduleCompletionRows
    : v1ModuleCompletionRows;
  const unblockPlan = goLiveStatus?.unblockPlan?.phases?.length
    ? goLiveStatus.unblockPlan
    : v1UnblockPlan;
  const v2DifferenceItemsForPage = goLiveStatus?.v2DifferenceItems?.length
    ? goLiveStatus.v2DifferenceItems
    : v2DifferenceItems;
  const productionEnvFixChecklist = goLiveStatus?.productionEnvFixChecklist?.items?.length
    ? goLiveStatus.productionEnvFixChecklist
    : null;
  const fieldEvidenceProgress = goLiveStatus?.fieldEvidenceProgress?.available
    ? goLiveStatus.fieldEvidenceProgress
    : null;
  const fieldEvidenceIntakeGuidance = goLiveStatus?.fieldEvidenceIntakeGuidance?.available
    ? goLiveStatus.fieldEvidenceIntakeGuidance
    : null;
  const fieldEvidenceIntakeQuality = goLiveStatus?.fieldEvidenceIntakeQuality?.available
    ? goLiveStatus.fieldEvidenceIntakeQuality
    : null;
  const roleTaskBoard = goLiveStatus?.roleTaskBoard?.available
    ? goLiveStatus.roleTaskBoard
    : null;
  const v1V2BoundaryBrief = goLiveStatus?.v1V2BoundaryBrief?.available
    ? goLiveStatus.v1V2BoundaryBrief
    : null;
  const v1MustContinueItemsForPage = v1V2BoundaryBrief
    ? (showAllV1MustContinueItems ? v1V2BoundaryBrief.v1MustContinue : v1V2BoundaryBrief.v1MustContinue.slice(0, 4))
    : [];
  const v2BoundaryDifferencesForPage = v1V2BoundaryBrief
    ? (showAllV2BoundaryDifferences ? v1V2BoundaryBrief.v2Differences : v1V2BoundaryBrief.v2Differences.slice(0, 5))
    : [];
  const v1V2ModuleDifferencesForPage = v1V2BoundaryBrief
    ? (showAllV1V2ModuleDifferences ? v1V2BoundaryBrief.moduleDifferences : v1V2BoundaryBrief.moduleDifferences.slice(0, 5))
    : [];
  const ownerDecisionBrief = goLiveStatus?.ownerDecisionBrief?.available
    ? goLiveStatus.ownerDecisionBrief
    : null;
  const completionAudit = goLiveStatus?.completionAudit?.available
    ? goLiveStatus.completionAudit
    : null;
  const runtimeReadinessBlockers = goLiveStatus?.runtimeReadinessBlockers?.available
    ? goLiveStatus.runtimeReadinessBlockers
    : null;
  const fieldAcceptanceReport = goLiveStatus?.fieldAcceptanceReport?.available
    ? goLiveStatus.fieldAcceptanceReport
    : null;
  const productionEnvGate = goLiveStatus?.productionEnvGate?.available
    ? goLiveStatus.productionEnvGate
    : null;
  const productionEnvIntakeVerification = goLiveStatus?.productionEnvIntakeVerification?.available
    ? goLiveStatus.productionEnvIntakeVerification
    : null;
  const productionEnvMinimumBlockingItems = productionEnvIntakeVerification?.minimumBlockingItems ?? [];
  const productionFirstStageExecution = goLiveStatus?.productionFirstStageExecution?.available
    ? goLiveStatus.productionFirstStageExecution
    : null;
  const productionPersistenceEvidence = goLiveStatus?.productionPersistenceEvidence?.available
    ? goLiveStatus.productionPersistenceEvidence
    : null;
  const productionPersistenceEvidenceSummary = productionPersistenceEvidence?.summary ?? {};
  const productionPersistenceEvidenceLatestBlockers = productionPersistenceEvidence?.blockingStages ?? [];
  const productionPersistenceEvidenceLiveResult = productionPersistenceEvidenceAction?.result ?? null;
  const productionPersistenceEvidenceLiveSummary = productionPersistenceEvidenceLiveResult?.summary ?? {};
  const productionPersistenceEvidenceGuidance = productionPersistenceEvidenceLiveResult?.serverConfigGuidance ?? {};
  const productionPersistenceEvidenceBlockers = [
    ...(productionPersistenceEvidenceLiveResult?.blockingItems ?? []),
    ...(productionPersistenceEvidenceLiveResult?.blockingStages ?? []),
  ];
  const productionEnvFillTemplate = goLiveStatus?.productionEnvFillTemplate?.available
    ? goLiveStatus.productionEnvFillTemplate
    : null;
  const productionEnvMinimumValuesFragmentTemplate = goLiveStatus?.productionEnvMinimumValuesFragmentTemplate?.available
    ? goLiveStatus.productionEnvMinimumValuesFragmentTemplate
    : null;
  const productionEnvValuesFragmentSourceStatus = goLiveStatus?.productionEnvValuesFragmentSourceStatus?.available
    ? goLiveStatus.productionEnvValuesFragmentSourceStatus
    : null;
  const productionEnvValuesApplyGateStatus = goLiveStatus?.productionEnvValuesApplyGateStatus?.available
    ? goLiveStatus.productionEnvValuesApplyGateStatus
    : null;
  const productionEnvFixItemsForPage = productionEnvFixChecklist
    ? (showAllProductionEnvFixItems
        ? productionEnvFixChecklist.items
        : productionEnvFixChecklist.items.slice(0, 6))
    : [];
  const productionEnvVariableCheckOverlay = buildProductionEnvVariableCheckOverlayForPage(
    productionEnvFixChecklist?.items ?? [],
    [
      { sourceLabel: "安全 env 文件应用预检", result: productionEnvFilePreviewPrecheckAction.result },
      { sourceLabel: "当前 env 预检", result: productionEnvPrecheckAction.result },
    ],
  );
  const productionEnvTemplatePreviewLines = productionEnvFillTemplate?.previewLines ?? [];
  const productionEnvTemplateSectionIndexByLabel = new Map();
  productionEnvTemplatePreviewLines.forEach((line, index) => {
    const sectionLabel = getProductionEnvTemplateSectionLabel(line);
    if (sectionLabel && !productionEnvTemplateSectionIndexByLabel.has(sectionLabel)) {
      productionEnvTemplateSectionIndexByLabel.set(sectionLabel, index);
    }
  });
  const productionEnvTemplateLinesForPage = productionEnvFillTemplate
    ? (showAllProductionEnvTemplateLines
        ? productionEnvTemplatePreviewLines
        : productionEnvTemplatePreviewLines.slice(0, 36))
    : [];
  const productionEnvMinimumTemplatePreviewLines = productionEnvMinimumValuesFragmentTemplate?.previewLines ?? [];
  const productionEnvMinimumTemplateLinesForPage = productionEnvMinimumValuesFragmentTemplate
    ? (showAllProductionEnvMinimumTemplateLines
        ? productionEnvMinimumTemplatePreviewLines
        : productionEnvMinimumTemplatePreviewLines.slice(0, 34))
    : [];
  const focusProductionEnvTemplateSection = (item) => {
    const sectionIndex = productionEnvTemplateSectionIndexByLabel.get(item.label);
    if (!Number.isFinite(sectionIndex)) return;
    setShowAllProductionEnvTemplateLines(true);
    setFocusedProductionEnvTemplateLineIndex(sectionIndex);
    window.setTimeout(() => {
      const target = productionEnvTemplatePreviewRef.current?.querySelector(`[data-env-line-index="${sectionIndex}"]`);
      target?.scrollIntoView({ block: "center", inline: "nearest" });
    }, 0);
  };
  const selectedModule = moduleCompletionRows.find((item) => item.module === selectedModuleName) ?? moduleCompletionRows[0];
  const selectedPhase = unblockPlan.phases.find((item) => item.key === selectedPhaseKey) ?? unblockPlan.phases[0];
  const lastSuccessfulTimestamp = Date.parse(String(goLiveMeta.lastSuccessfulAt ?? ""));
  const hasV1StatusSnapshot = Boolean(goLiveStatus);
  const v1StatusSnapshotExpired =
    hasV1StatusSnapshot &&
    (!Number.isFinite(lastSuccessfulTimestamp) || Date.now() - lastSuccessfulTimestamp > v1StatusSnapshotMaxAgeMs);
  const statusSourceLabel = !hasV1StatusSnapshot
    ? (goLiveMeta.loading ? "后端状态读取中" : "状态未读取")
    : v1StatusSnapshotExpired
      ? "后端快照已过期"
      : goLiveMeta.error
        ? "后端快照（未刷新）"
        : goLiveStatus.sourceLabel || "后端 go-live 产物";
  const statusSourceDetail = goLiveMeta.loading
    ? "刷新中"
    : !hasV1StatusSnapshot
      ? goLiveMeta.error || "尚未取得后端 V1 状态。"
      : v1StatusSnapshotExpired
        ? `最近成功读取：${formatV1StatusSnapshotTime(goLiveMeta.lastSuccessfulAt)}，已超过 15 分钟。`
        : goLiveMeta.error
          ? `API 不可用；显示最近成功快照：${formatV1StatusSnapshotTime(goLiveMeta.lastSuccessfulAt)}。`
          : `后端已同步：${formatV1StatusSnapshotTime(goLiveMeta.lastSuccessfulAt)}`;
  const selectedPhaseRoles = selectedPhase.roleItems?.length
    ? selectedPhase.roleItems
    : String(selectedPhase.roles ?? "").split("、").map((role) => role.trim()).filter(Boolean);
  const selectedPhaseGroups = Array.isArray(selectedPhase.groups)
    ? selectedPhase.groups.map(normalizeV1PhaseGroupForPage).filter((group) => group.group)
    : [];
  const selectedPhaseTasks = Array.isArray(selectedPhase.firstTasks)
    ? selectedPhase.firstTasks.map(normalizeV1PhaseTaskForPage).filter((task) => task.title)
    : [];
  const canGenerateFieldEvidenceDraft =
    Boolean(onGenerateFieldEvidenceDraft) &&
    fieldEvidenceIntakeQuality?.summary?.canGenerateDraft === true &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canValidateFieldEvidenceDraft =
    Boolean(onValidateFieldEvidenceDraft) &&
    fieldEvidenceIntakeQuality?.summary?.draftManifestStatus === "available" &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canPrecheckReleaseCandidateRefresh =
    Boolean(onPrecheckReleaseCandidateRefresh) &&
    Boolean(fieldEvidenceIntakeQuality) &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canRefreshReleaseCandidate =
    Boolean(onRefreshReleaseCandidate) &&
    Boolean(fieldEvidenceIntakeQuality) &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canRunFieldEvidenceCloseoutReview =
    canValidateFieldEvidenceDraft &&
    canPrecheckReleaseCandidateRefresh;
  const canRunV1CloseoutFullReview =
    canPrecheckReleaseCandidateRefresh &&
    Boolean(onValidateFieldEvidenceDraft) &&
    Boolean(onPrecheckProductionEnv) &&
    Boolean(onPrecheckProductionEnvFileAudit) &&
    Boolean(onPrecheckProductionEnvFilePreview) &&
    Boolean(onPrecheckV1V2Boundary) &&
    Boolean(onPrecheckProductionGoLive) &&
    Boolean(onPrecheckRuntimeReadiness) &&
    !productionEnvPrecheckAction.loading &&
    !productionEnvFileAuditPrecheckAction.loading &&
    !productionEnvFilePreviewPrecheckAction.loading &&
    !v1V2BoundaryPrecheckAction.loading &&
    !productionGoLivePrecheckAction.loading &&
    !runtimeReadinessPrecheckAction.loading;
  const canShowProductionEnvFrontDoorReview =
    Boolean(onPrecheckProductionEnvFileAudit) &&
    Boolean(onPrecheckProductionEnvFilePreview) &&
    Boolean(onPrecheckProductionEnv);
  const productionEnvFrontDoorReviewLoading =
    productionEnvFileAuditPrecheckAction.loading ||
    productionEnvFilePreviewPrecheckAction.loading ||
    productionEnvPrecheckAction.loading;
  const canRunProductionEnvFrontDoorReview =
    canShowProductionEnvFrontDoorReview &&
    !productionEnvFrontDoorReviewLoading;
  const canReviewFieldEvidenceAfterStage =
    Boolean(onValidateFieldEvidenceDraft) &&
    Boolean(onPrecheckReleaseCandidateRefresh) &&
    Boolean(fieldEvidenceIntakeQuality) &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const missingEvidenceOptions = fieldEvidenceProgress?.missingItems || [];
  const missingEvidenceDisplayLimit = 12;
  const fieldEvidenceGroupSummaries = fieldEvidenceProgress?.groupSummaries?.length
    ? fieldEvidenceProgress.groupSummaries
    : buildFieldEvidenceGroupSummaries(
        fieldEvidenceProgress?.groups || [],
        missingEvidenceOptions,
      );
  const selectedMissingEvidenceGroup =
    fieldEvidenceGroupSummaries.find((group) => group.key === selectedMissingEvidenceGroupKey) || null;
  const scopedMissingEvidenceOptions = selectedMissingEvidenceGroup
    ? missingEvidenceOptions.filter((item) => item.groupKey === selectedMissingEvidenceGroup.key)
    : missingEvidenceOptions;
  const visibleMissingEvidenceItems = showAllMissingEvidenceItems
    ? scopedMissingEvidenceOptions
    : scopedMissingEvidenceOptions.slice(0, missingEvidenceDisplayLimit);
  const missingEvidenceTotalCount =
    selectedMissingEvidenceGroup
      ? scopedMissingEvidenceOptions.length
      : fieldEvidenceProgress?.summary?.missingEvidenceItemCount || missingEvidenceOptions.length;
  const missingEvidenceDisplayCountLabel = `${visibleMissingEvidenceItems.length}/${missingEvidenceTotalCount}`;
  const missingEvidenceDisplayLabel = selectedMissingEvidenceGroup
    ? `${selectedMissingEvidenceGroup.label} ${missingEvidenceDisplayCountLabel}`
    : missingEvidenceDisplayCountLabel;
  const canToggleMissingEvidenceItems = scopedMissingEvidenceOptions.length > missingEvidenceDisplayLimit;
  const signoffBoundaryOptions = fieldEvidenceProgress?.signoffBoundaryActions || [];
  const roleTaskCategorySummaries = roleTaskBoard
    ? buildRoleTaskCategorySummaries(roleTaskBoard)
    : [];
  const selectedEvidenceStageItem =
    missingEvidenceOptions.find((item) => `${item.groupKey}:${item.key}` === evidenceStageDraft.selectionKey) ||
    missingEvidenceOptions[0] ||
    null;
  const selectedEvidenceAttachmentOwnerId = selectedEvidenceStageItem
    ? `${selectedEvidenceStageItem.groupKey || "field_evidence"}:${selectedEvidenceStageItem.key || "evidence_item"}`
    : "";
  const selectedEvidenceAttachmentListResult =
    fieldEvidenceAttachmentListAction.result?.ownerId === selectedEvidenceAttachmentOwnerId
      ? fieldEvidenceAttachmentListAction.result
      : null;
  const selectedEvidenceAttachmentListError =
    fieldEvidenceAttachmentListAction.ownerId === selectedEvidenceAttachmentOwnerId
      ? fieldEvidenceAttachmentListAction.error
      : "";
  const selectedSignoffBoundaryStageItem =
    signoffBoundaryOptions.find((item) => `${item.type}:${item.key}` === signoffStageDraft.selectionKey) ||
    signoffBoundaryOptions[0] ||
    null;
  const selectedSignoffBoundaryAttachmentOwnerId = selectedSignoffBoundaryStageItem
    ? `${selectedSignoffBoundaryStageItem.type || "signoff"}:${selectedSignoffBoundaryStageItem.key || "owner"}`
    : "";
  const selectedSignoffBoundaryAttachmentListResult =
    signoffBoundaryAttachmentListAction.result?.ownerId === selectedSignoffBoundaryAttachmentOwnerId
      ? signoffBoundaryAttachmentListAction.result
      : null;
  const selectedSignoffBoundaryAttachmentListError =
    signoffBoundaryAttachmentListAction.ownerId === selectedSignoffBoundaryAttachmentOwnerId
      ? signoffBoundaryAttachmentListAction.error
      : "";
  const selectedSignoffStatusOptions =
    selectedSignoffBoundaryStageItem?.type === "boundary"
      ? v1BoundaryStageStatusOptions
      : v1SignoffStageStatusOptions;
  const evidenceStageRequiresRef = ["passed", "accepted"].includes(evidenceStageDraft.onsiteStatus);
  const signoffStageRequiresPersonTime =
    selectedSignoffBoundaryStageItem?.type === "boundary"
      ? signoffStageDraft.onsiteStatus === "confirmed"
      : ["signed", "accepted"].includes(signoffStageDraft.onsiteStatus);
  const canStageEvidenceRow =
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedEvidenceStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !fieldEvidenceAttachmentAction.loading &&
    (!evidenceStageRequiresRef || evidenceStageDraft.onsiteEvidenceRef.trim());
  const canStageEvidenceRowAndReview =
    canStageEvidenceRow &&
    canReviewFieldEvidenceAfterStage;
  const canUploadAndStageEvidenceAttachment =
    Boolean(onUploadFieldEvidenceAttachment) &&
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedEvidenceStageItem) &&
    Boolean(evidenceAttachmentFile) &&
    !fieldEvidenceAttachmentAction.loading &&
    !fieldEvidenceAttachmentListAction.loading &&
    !fieldEvidenceStageRowAction.loading;
  const canListEvidenceAttachments =
    Boolean(onListFieldEvidenceAttachments) &&
    Boolean(selectedEvidenceStageItem) &&
    !fieldEvidenceAttachmentAction.loading &&
    !fieldEvidenceAttachmentListAction.loading &&
    !fieldEvidenceStageRowAction.loading;
  const canStageSignoffBoundaryRow =
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading &&
    (!signoffStageRequiresPersonTime || (signoffStageDraft.person.trim() && signoffStageDraft.time.trim()));
  const canStageSignoffBoundaryRowAndReview =
    canStageSignoffBoundaryRow &&
    canReviewFieldEvidenceAfterStage;
  const canStageBoundaryRowAndPrecheck =
    canStageSignoffBoundaryRow &&
    selectedSignoffBoundaryStageItem?.type === "boundary" &&
    Boolean(onPrecheckV1V2Boundary) &&
    !v1V2BoundaryPrecheckAction.loading;
  const canUploadSignoffBoundaryAttachment =
    Boolean(onUploadSignoffBoundaryAttachment) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    Boolean(signoffBoundaryAttachmentFile) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading;
  const canListSignoffBoundaryAttachments =
    Boolean(onListSignoffBoundaryAttachments) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading;

  useEffect(() => {
    if (!missingEvidenceOptions.length) return;
    const stillExists = missingEvidenceOptions.some((item) => `${item.groupKey}:${item.key}` === evidenceStageDraft.selectionKey);
    if (!stillExists) {
      const first = missingEvidenceOptions[0];
      setEvidenceStageDraft((current) => ({
        ...current,
        selectionKey: `${first.groupKey}:${first.key}`,
      }));
    }
  }, [missingEvidenceOptions, evidenceStageDraft.selectionKey]);

  useEffect(() => {
    if (!selectedMissingEvidenceGroupKey) return;
    const stillExists = fieldEvidenceGroupSummaries.some((group) => group.key === selectedMissingEvidenceGroupKey);
    if (!stillExists) {
      setSelectedMissingEvidenceGroupKey("");
    }
  }, [fieldEvidenceGroupSummaries, selectedMissingEvidenceGroupKey]);

  useEffect(() => {
    if (!signoffBoundaryOptions.length) return;
    const stillExists = signoffBoundaryOptions.some((item) => `${item.type}:${item.key}` === signoffStageDraft.selectionKey);
    if (!stillExists) {
      const first = signoffBoundaryOptions[0];
      setSignoffStageDraft((current) => ({
        ...current,
        selectionKey: `${first.type}:${first.key}`,
        onsiteStatus: first.type === "boundary" ? "confirmed" : "signed",
      }));
    }
  }, [signoffBoundaryOptions, signoffStageDraft.selectionKey]);

  if (!hasV1StatusSnapshot) {
    return (
      <V1StatusUnavailable
        loading={goLiveMeta.loading}
        statusSourceLabel={statusSourceLabel}
        statusSourceDetail={statusSourceDetail}
      />
    );
  }

  function stageSelectedEvidenceRow() {
    if (!canStageEvidenceRow || !selectedEvidenceStageItem) return;
    onStageFieldEvidenceRow({
      rowType: "evidence",
      groupKey: selectedEvidenceStageItem.groupKey,
      itemKey: selectedEvidenceStageItem.key,
      onsiteStatus: evidenceStageDraft.onsiteStatus,
      onsiteEvidenceRef: evidenceStageDraft.onsiteEvidenceRef,
      onsiteNotes: evidenceStageDraft.onsiteNotes,
    });
  }

  async function stageSelectedEvidenceRowAndReview() {
    if (!canStageEvidenceRowAndReview || !selectedEvidenceStageItem) return;
    const result = await onStageFieldEvidenceRow({
      rowType: "evidence",
      groupKey: selectedEvidenceStageItem.groupKey,
      itemKey: selectedEvidenceStageItem.key,
      onsiteStatus: evidenceStageDraft.onsiteStatus,
      onsiteEvidenceRef: evidenceStageDraft.onsiteEvidenceRef,
      onsiteNotes: evidenceStageDraft.onsiteNotes,
    });
    if (!result?.stageResult || result?.blocked) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function uploadAndStageSelectedEvidenceAttachment() {
    if (!canUploadAndStageEvidenceAttachment || !selectedEvidenceStageItem) return;
    const uploadResult = await onUploadFieldEvidenceAttachment({
      evidenceItem: selectedEvidenceStageItem,
      file: evidenceAttachmentFile,
      remark: evidenceStageDraft.onsiteNotes,
    });
    const attachmentId = uploadResult?.attachment?.attachmentId || "";
    if (!attachmentId || uploadResult?.blocked) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: current.onsiteNotes || uploadResult.attachment.fileName || "",
    }));
    await onStageFieldEvidenceRow({
      rowType: "evidence",
      groupKey: selectedEvidenceStageItem.groupKey,
      itemKey: selectedEvidenceStageItem.key,
      onsiteStatus: evidenceStageDraft.onsiteStatus,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: evidenceStageDraft.onsiteNotes || uploadResult.attachment.fileName || "",
    });
  }

  async function listSelectedEvidenceAttachments() {
    if (!canListEvidenceAttachments || !selectedEvidenceStageItem) return;
    await onListFieldEvidenceAttachments({
      evidenceItem: selectedEvidenceStageItem,
    });
  }

  function selectMissingEvidenceForStage(item) {
    if (!item?.groupKey || !item?.key) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      selectionKey: `${item.groupKey}:${item.key}`,
      onsiteStatus: current.onsiteStatus || "passed",
      onsiteEvidenceRef: "",
      onsiteNotes: "",
    }));
    setEvidenceAttachmentFile(null);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      evidenceStageCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      evidenceStageRefInputRef.current?.focus();
    });
  }

  function selectSignoffBoundaryForStage(item) {
    if (!item?.type || !item?.key) return;
    setSignoffStageDraft({
      selectionKey: `${item.type}:${item.key}`,
      onsiteStatus: item.type === "boundary" ? "confirmed" : "signed",
      person: "",
      time: "",
      onsiteNotes: "",
    });
    setSignoffBoundaryAttachmentFile(null);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      signoffStageCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      signoffStagePersonInputRef.current?.focus();
    });
  }

  function fillEvidenceRefFromAttachment(attachment) {
    const attachmentId = attachment?.attachmentId || "";
    if (!/^ATT-/.test(attachmentId)) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: current.onsiteNotes || attachment.fileName || "",
    }));
  }

  async function uploadAndFillSelectedSignoffBoundaryAttachment() {
    if (!canUploadSignoffBoundaryAttachment || !selectedSignoffBoundaryStageItem) return;
    const uploadResult = await onUploadSignoffBoundaryAttachment({
      signoffItem: selectedSignoffBoundaryStageItem,
      file: signoffBoundaryAttachmentFile,
      remark: signoffStageDraft.onsiteNotes,
    });
    const attachment = uploadResult?.attachment;
    if (!attachment?.attachmentId || uploadResult?.blocked) return;
    fillSignoffBoundaryNoteFromAttachment(attachment);
  }

  async function listSelectedSignoffBoundaryAttachments() {
    if (!canListSignoffBoundaryAttachments || !selectedSignoffBoundaryStageItem) return;
    await onListSignoffBoundaryAttachments({
      signoffItem: selectedSignoffBoundaryStageItem,
    });
  }

  async function runFieldEvidenceCloseoutReview() {
    if (!canRunFieldEvidenceCloseoutReview) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function runV1CloseoutFullReview() {
    if (!canRunV1CloseoutFullReview) return;
    await onPrecheckProductionEnvFileAudit();
    await onPrecheckProductionEnvFilePreview();
    await onPrecheckProductionEnv();
    await onPrecheckProductionGoLive();
    if (canValidateFieldEvidenceDraft) await onValidateFieldEvidenceDraft();
    await onPrecheckV1V2Boundary();
    await onPrecheckReleaseCandidateRefresh();
    await onPrecheckRuntimeReadiness();
  }

  async function runProductionEnvFrontDoorReview({ includeCombo = false } = {}) {
    if (!canRunProductionEnvFrontDoorReview) return;
    await onPrecheckProductionEnvFileAudit();
    await onPrecheckProductionEnvFilePreview();
    await onPrecheckProductionEnv();
    if (includeCombo && onPrecheckProductionGoLive && !productionGoLivePrecheckAction.loading) {
      await onPrecheckProductionGoLive();
    }
  }

  function fillSignoffBoundaryNoteFromAttachment(attachment) {
    const attachmentId = attachment?.attachmentId || "";
    if (!/^ATT-/.test(attachmentId)) return;
    const fileName = attachment.fileName || "签字附件";
    const attachmentNote = `附件:${attachmentId} ${fileName}`;
    setSignoffStageDraft((current) => ({
      ...current,
      onsiteNotes: current.onsiteNotes.includes(attachmentId)
        ? current.onsiteNotes
        : current.onsiteNotes
          ? `${current.onsiteNotes}；${attachmentNote}`
        : attachmentNote,
    }));
  }

  function buildSelectedSignoffBoundaryStageRow() {
    if (!selectedSignoffBoundaryStageItem) return null;
    const isBoundary = selectedSignoffBoundaryStageItem.type === "boundary";
    return {
      rowType: selectedSignoffBoundaryStageItem.type,
      role: selectedSignoffBoundaryStageItem.key,
      onsiteStatus: signoffStageDraft.onsiteStatus,
      onsiteSigner: isBoundary ? "" : signoffStageDraft.person,
      onsiteSignedAt: isBoundary ? "" : signoffStageDraft.time,
      onsiteConfirmedBy: isBoundary ? signoffStageDraft.person : "",
      onsiteConfirmedAt: isBoundary ? signoffStageDraft.time : "",
      onsiteNotes: signoffStageDraft.onsiteNotes,
    };
  }

  function stageSelectedSignoffBoundaryRow() {
    if (!canStageSignoffBoundaryRow || !selectedSignoffBoundaryStageItem) return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    onStageFieldEvidenceRow(row);
  }

  async function stageSelectedSignoffBoundaryRowAndReview() {
    if (!canStageSignoffBoundaryRowAndReview || !selectedSignoffBoundaryStageItem) return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    const result = await onStageFieldEvidenceRow(row);
    if (!result?.stageResult || result?.blocked) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function stageSelectedBoundaryRowAndPrecheck() {
    if (!canStageBoundaryRowAndPrecheck || selectedSignoffBoundaryStageItem?.type !== "boundary") return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    const result = await onStageFieldEvidenceRow(row);
    if (!result?.stageResult || result?.blocked) return;
    await onPrecheckV1V2Boundary();
  }

  function scrollV1StatusRefIntoView(targetRef) {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function focusProductionEnvFixChecklistFromBlocker() {
    setShowAllProductionEnvFixItems(true);
    scrollV1StatusRefIntoView(productionEnvFixChecklistRef);
  }

  function focusV1V2BoundaryBriefFromBlocker() {
    setShowAllV1MustContinueItems(true);
    scrollV1StatusRefIntoView(v1V2BoundaryBriefRef);
  }

  function focusProductionEnvFillTemplateFromPhase() {
    setShowAllProductionEnvTemplateLines(true);
    scrollV1StatusRefIntoView(productionEnvFillTemplateRef);
  }

  function focusProductionEnvMinimumValuesTemplateFromPhase() {
    setShowAllProductionEnvMinimumTemplateLines(true);
    scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef);
  }

  function findProductionEnvFixItemForGate(item = {}) {
    const key = item.key || "";
    const label = item.label || "";
    const variableLabel = item.variableLabel || "";
    return productionEnvFixChecklist?.items?.find((fixItem) => {
      const fixKey = fixItem.key || "";
      const fixLabel = fixItem.label || "";
      return (key && fixKey === key) ||
        (label && fixLabel === label) ||
        (variableLabel && fixItem.variableLabel === variableLabel);
    }) || null;
  }

  function focusProductionEnvFixItemFromGate(item = {}) {
    setShowAllProductionEnvFixItems(true);
    scrollV1StatusRefIntoView(productionEnvFixChecklistRef);
    const fixItem = findProductionEnvFixItemForGate(item);
    if (fixItem && productionEnvTemplateSectionIndexByLabel.has(fixItem.label)) {
      setFocusedProductionEnvTemplateLineIndex(productionEnvTemplateSectionIndexByLabel.get(fixItem.label));
    }
  }

  function buildProductionEnvGateActions(item = {}) {
    const key = item.key || "";
    const haystack = [
      key,
      item.label,
      item.ownerRole,
      item.nextAction,
      item.variableLabel,
    ].filter(Boolean).join(" ");
    const actions = [];
    const fixItem = findProductionEnvFixItemForGate(item);
    const knownProductionEnvGateKeys = new Set([
      "v1-persistence-profile",
      "attachment-object-storage-env",
      "statement-export-object-storage-env",
      "system-printer-command-bridge-env",
      "cups-preflight-env",
      "v1-readiness-identity-env",
      "v1-field-acceptance-report-env",
      "local-v1-acceptance-bypass-env",
      "preflight-redaction-safeguard",
    ]);
    const hasKnownProductionEnvGateKey = knownProductionEnvGateKeys.has(key);

    if (fixItem) {
      addPhaseAction(actions, {
        key: "open-env-fix",
        label: "查看修正项",
        onClick: () => focusProductionEnvFixItemFromGate(item),
      });
      if (productionEnvTemplateSectionIndexByLabel.has(fixItem.label)) {
        addPhaseAction(actions, {
          key: "open-env-template-section",
          label: "定位草稿段",
          onClick: () => focusProductionEnvTemplateSection(fixItem),
        });
      }
    }

    if (onPrecheckProductionEnv) {
      addPhaseAction(actions, {
        key: "run-production-env-precheck",
        label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
        onClick: onPrecheckProductionEnv,
        disabled: productionEnvPrecheckAction.loading,
      });
    }

    if ((key === "v1-persistence-profile" || (!hasKnownProductionEnvGateKey && (haystack.includes("持久化") || haystack.includes("PostgreSQL")))) && onPrecheckV1Persistence) {
      addPhaseAction(actions, {
        key: "run-persistence-precheck",
        label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
        onClick: onPrecheckV1Persistence,
        disabled: persistencePrecheckAction.loading,
      });
    }

    if ((key === "attachment-object-storage-env" || (!hasKnownProductionEnvGateKey && haystack.includes("附件对象存储"))) && onPrecheckV1AttachmentRetention) {
      addPhaseAction(actions, {
        key: "run-attachment-retention",
        label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
        onClick: onPrecheckV1AttachmentRetention,
        disabled: attachmentRetentionPrecheckAction.loading,
      });
    }

    if ((key === "system-printer-command-bridge-env" || (!hasKnownProductionEnvGateKey && haystack.includes("command_bridge"))) && onPrecheckV1PrintSpool) {
      addPhaseAction(actions, {
        key: "run-print-spool",
        label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
        onClick: onPrecheckV1PrintSpool,
        disabled: printSpoolPrecheckAction.loading,
      });
    }

    if ((key === "cups-preflight-env" || (!hasKnownProductionEnvGateKey && haystack.includes("CUPS"))) && onPrecheckV1PrintCups) {
      addPhaseAction(actions, {
        key: "run-print-cups",
        label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
        onClick: onPrecheckV1PrintCups,
        disabled: printCupsPrecheckAction.loading,
      });
    }

    if ((key === "system-printer-command-bridge-env" || key === "cups-preflight-env" || (!hasKnownProductionEnvGateKey && haystack.includes("打印"))) && onPrecheckV1PrintReadiness) {
      addPhaseAction(actions, {
        key: "run-print-readiness",
        label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
        onClick: onPrecheckV1PrintReadiness,
        disabled: printReadinessPrecheckAction.loading,
      });
    }

    if (onPrecheckProductionGoLive) {
      addPhaseAction(actions, {
        key: "run-production-go-live",
        label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
        onClick: onPrecheckProductionGoLive,
        disabled: productionGoLivePrecheckAction.loading,
      });
    }

    return actions;
  }

  function focusRuntimeReadinessFromPhase() {
    scrollV1StatusRefIntoView(runtimeReadinessSectionRef);
  }

  function focusFieldEvidenceProgressFromPhase() {
    setShowAllMissingEvidenceItems(true);
    scrollV1StatusRefIntoView(fieldEvidenceProgressRef);
  }

  function focusFieldAcceptanceReportFromPhase() {
    scrollV1StatusRefIntoView(fieldAcceptanceReportRef);
  }

  function findMatchingMissingEvidenceOptionByText(patterns = []) {
    const normalizedPatterns = patterns.filter(Boolean);
    if (!normalizedPatterns.length) return null;
    return missingEvidenceOptions.find((item) => {
      const haystack = [
        item.label,
        item.groupLabel,
        item.group,
        item.ownerRole,
        item.progressLabel,
        item.nextAction,
      ].filter(Boolean).join(" ");
      return normalizedPatterns.some((pattern) => haystack.includes(pattern));
    }) || null;
  }

  function findMissingEvidenceOptionByText(patterns = []) {
    return findMatchingMissingEvidenceOptionByText(patterns) || missingEvidenceOptions[0] || null;
  }

  function findSignoffBoundaryOptionByText(patterns = []) {
    const normalizedPatterns = patterns.filter(Boolean);
    return signoffBoundaryOptions.find((item) => {
      const haystack = [
        item.label,
        item.key,
        item.role,
        item.type,
        item.progressLabel,
        item.nextAction,
      ].filter(Boolean).join(" ");
      return normalizedPatterns.some((pattern) => haystack.includes(pattern));
    }) || null;
  }

  function addPhaseAction(actions, action) {
    if (!action || actions.some((item) => item.key === action.key)) return;
    actions.push(action);
  }

  function buildFieldEvidenceGroupSummaries(groups = [], missingItems = []) {
    const missingByGroup = new Map();
    missingItems.forEach((item) => {
      const groupKey = item.groupKey || "ungrouped";
      if (!missingByGroup.has(groupKey)) {
        missingByGroup.set(groupKey, []);
      }
      missingByGroup.get(groupKey).push(item);
    });
    return groups.map((group) => {
      const groupMissingItems = missingByGroup.get(group.key) || [];
      const missingCount = groupMissingItems.length || group.blockedRequired || 0;
      return {
        ...group,
        missingItems: groupMissingItems,
        missingCount,
        missingLabel: group.requiredTotal > 0 ? `${missingCount}/${group.requiredTotal}` : `${missingCount}`,
        firstMissingItem: groupMissingItems[0] || null,
        firstMissingItems: groupMissingItems.slice(0, 3),
        previewItems: groupMissingItems.slice(0, 3),
        hiddenPreviewCount: Math.max(0, groupMissingItems.length - 3),
      };
    }).filter((group) => group.key);
  }

  function focusMissingEvidenceGroup(group = {}) {
    if (!group.key) return;
    setSelectedMissingEvidenceGroupKey(group.key);
    setShowAllMissingEvidenceItems(true);
    scrollV1StatusRefIntoView(fieldEvidenceProgressRef);
  }

  function clearMissingEvidenceGroupFilter() {
    setSelectedMissingEvidenceGroupKey("");
    setShowAllMissingEvidenceItems(false);
    scrollV1StatusRefIntoView(fieldEvidenceProgressRef);
  }

  function buildFieldEvidenceGroupActions(group = {}) {
    const actions = [];
    const groupKey = group.key || "";
    const firstMissingItem = group.firstMissingItem || null;
    const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
    const firstOwnerSignoffItem = findSignoffBoundaryOptionByText(["技术", "管理", "办公室", "财务"]) ||
      signoffBoundaryOptions.find((option) => option.type !== "boundary") ||
      null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;

    if (firstMissingItem) {
      addPhaseAction(actions, {
        key: `fill-first-${groupKey}`,
        label: "填本组第一条",
        onClick: () => selectMissingEvidenceForStage(firstMissingItem),
      });
    }

    if (groupKey === "production_persistence") {
      if (onPrecheckV1Persistence) {
        addPhaseAction(actions, {
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (groupKey === "object_storage") {
      if (onPrecheckV1AttachmentRetention) {
        addPhaseAction(actions, {
          key: "run-attachment-retention",
          label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
          onClick: onPrecheckV1AttachmentRetention,
          disabled: attachmentRetentionPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
    }

    if (groupKey === "print_hardware") {
      if (onPrecheckV1PrintSpool) {
        addPhaseAction(actions, {
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintCups) {
        addPhaseAction(actions, {
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintReadiness) {
        addPhaseAction(actions, {
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
    }

    if (groupKey === "driver_native_device") {
      if (onPrecheckV1DriverReadiness) {
        addPhaseAction(actions, {
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      if (driverSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (groupKey === "business_workflow_pilot") {
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (groupKey === "security_operations") {
      if (firstOwnerSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstOwnerSignoffItem),
        });
      }
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (group.missingCount > 0) {
      addPhaseAction(actions, {
        key: `filter-evidence-${groupKey}`,
        label: selectedMissingEvidenceGroupKey === groupKey ? "正在看本组" : "只看本组",
        onClick: () => focusMissingEvidenceGroup(group),
        disabled: selectedMissingEvidenceGroupKey === groupKey,
      });
    }

    return actions;
  }

  function buildSelectedPhaseQuickActions() {
    const phaseKey = selectedPhase.key || "";
    const knownPhaseKeys = new Set([
      "production_environment",
      "print_hardware",
      "driver_device",
      "business_pilot",
      "security_and_signoff",
      "remaining",
    ]);
    const hasKnownPhaseKey = knownPhaseKeys.has(phaseKey);
    const phaseHeadlineText = [
      phaseKey,
      selectedPhase.label,
      selectedPhase.nextStep,
    ].filter(Boolean).join(" ");
    const actions = [];
    const isProductionPhase = phaseKey === "production_environment" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("生产环境") || phaseHeadlineText.includes("持久化") || phaseHeadlineText.includes("PostgreSQL")));
    const isPrintPhase = phaseKey === "print_hardware" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("打印") || phaseHeadlineText.includes("CUPS") || phaseHeadlineText.includes("spool") || phaseHeadlineText.includes("标签")));
    const isDriverPhase = phaseKey === "driver_device" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("司机") || phaseHeadlineText.includes("真机") || phaseHeadlineText.includes("原生")));
    const isBusinessPhase = phaseKey === "business_pilot" || phaseKey === "remaining" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("业务试跑") || phaseHeadlineText.includes("业务试运行") || phaseHeadlineText.includes("真实订单") || phaseHeadlineText.includes("客户订单")));
    const isSecurityPhase = phaseKey === "security_and_signoff" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("签字") || phaseHeadlineText.includes("边界") || phaseHeadlineText.includes("安全运维") || phaseHeadlineText.includes("审计")));

    if (isProductionPhase) {
      addPhaseAction(actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      addPhaseAction(actions, {
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
      addPhaseAction(actions, {
        key: "open-env-template",
        label: "查看安全 env 草稿",
        onClick: focusProductionEnvFillTemplateFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-minimum-env-template",
        label: "查看最小片段",
        onClick: focusProductionEnvMinimumValuesTemplateFromPhase,
        disabled: !productionEnvMinimumValuesFragmentTemplate,
      });
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckV1Persistence) {
        addPhaseAction(actions, {
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (isPrintPhase) {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckV1PrintSpool) {
        addPhaseAction(actions, {
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintCups) {
        addPhaseAction(actions, {
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintReadiness) {
        addPhaseAction(actions, {
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
      const printEvidenceItem = findMissingEvidenceOptionByText(["打印", "标签", "CUPS", "样张", "纸张", "条码"]);
      if (printEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (isDriverPhase) {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckV1DriverReadiness) {
        addPhaseAction(actions, {
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      const driverEvidenceItem = findMissingEvidenceOptionByText(["司机", "真机", "原生", "定位", "水印", "导航", "扫码"]);
      if (driverEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-driver-evidence",
          label: "填司机证据",
          onClick: () => selectMissingEvidenceForStage(driverEvidenceItem),
        });
      }
      const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
      if (driverSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (isBusinessPhase) {
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      const businessEvidenceItem = findMissingEvidenceOptionByText(["真实业务", "真实订单", "客户订单", "出库", "交付", "异常待办", "订单录入"]);
      if (businessEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-business-evidence",
          label: "填业务试跑证据",
          onClick: () => selectMissingEvidenceForStage(businessEvidenceItem),
        });
      }
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (isSecurityPhase) {
      const firstSignoffItem = findSignoffBoundaryOptionByText(["办公室", "技术", "管理", "财务"]) ||
        signoffBoundaryOptions.find((option) => option.type !== "boundary") ||
        null;
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addPhaseAction(actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (!actions.length) {
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    return actions;
  }

  function buildCompletionAuditActions(criterion = {}) {
    const actions = [];
    const key = criterion.key || "";

    if (key === "release_candidate") {
      addPhaseAction(actions, {
        key: "open-intake-quality",
        label: "回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
      if (onRefreshReleaseCandidate) {
        addPhaseAction(actions, {
          key: "run-refresh-candidate",
          label: releaseCandidateRefreshAction.loading ? "刷新中" : "刷新候选",
          onClick: onRefreshReleaseCandidate,
          disabled: releaseCandidateRefreshAction.loading,
        });
      }
    }

    if (key === "production_env") {
      addPhaseAction(actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      if (canShowProductionEnvFrontDoorReview) {
        addPhaseAction(actions, {
          key: "run-production-env-front-door",
          label: productionEnvFrontDoorReviewLoading ? "连续预检中" : "env 连续预检",
          onClick: () => runProductionEnvFrontDoorReview({ includeCombo: true }),
          disabled: !canRunProductionEnvFrontDoorReview || productionGoLivePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (key === "runtime_readiness") {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckRuntimeReadiness) {
        addPhaseAction(actions, {
          key: "run-runtime-readiness",
          label: runtimeReadinessPrecheckAction.loading ? "预检中" : "当前运行时预检",
          onClick: onPrecheckRuntimeReadiness,
          disabled: runtimeReadinessPrecheckAction.loading,
        });
      }
    }

    if (key === "field_acceptance") {
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (key === "field_evidence") {
      const firstEvidenceItem = missingEvidenceOptions[0] || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstEvidenceItem),
        });
      }
      if (canRunFieldEvidenceCloseoutReview) {
        addPhaseAction(actions, {
          key: "run-field-evidence-closeout",
          label: fieldEvidenceValidationAction.loading || releaseCandidateRefreshPrecheckAction.loading ? "复核中" : "校验并预检刷新",
          onClick: runFieldEvidenceCloseoutReview,
          disabled: fieldEvidenceValidationAction.loading || releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (key === "owner_signoff") {
      const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "签字 / 边界进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
    }

    if (key === "v1_v2_boundary") {
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      addPhaseAction(actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    return actions;
  }

  function buildRoleTaskQuickActions(task = {}) {
    const actions = [];
    const taskType = task.type || "";
    const haystack = [
      task.id,
      task.type,
      task.group,
      task.title,
      task.action,
      task.primaryRole,
      ...(Array.isArray(task.roles) ? task.roles : []),
    ].filter(Boolean).join(" ");
    const addRoleAction = (action) => addPhaseAction(actions, action);

    if (taskType === "发布门禁" || haystack.includes("生产环境变量")) {
      if (haystack.includes("生产环境变量") || haystack.includes("env") || haystack.includes("环境变量")) {
        addRoleAction({
          key: "open-production-gate",
          label: "生产配置门禁",
          onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
        });
        addRoleAction({
          key: "open-env-fix",
          label: "查看 env 修正项",
          onClick: focusProductionEnvFixChecklistFromBlocker,
        });
        if (onPrecheckProductionEnv) {
          addRoleAction({
            key: "run-production-env-precheck",
            label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
            onClick: onPrecheckProductionEnv,
            disabled: productionEnvPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("运行时 V1") || haystack.includes("readiness") || haystack.includes("门禁")) {
        addRoleAction({
          key: "open-runtime-readiness",
          label: "运行时门禁",
          onClick: focusRuntimeReadinessFromPhase,
        });
      }
      if (haystack.includes("持久化") || haystack.includes("PostgreSQL")) {
        if (onPrecheckV1Persistence) {
          addRoleAction({
            key: "run-persistence-precheck",
            label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
            onClick: onPrecheckV1Persistence,
            disabled: persistencePrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("附件") || haystack.includes("对象存储")) {
        if (onPrecheckV1AttachmentRetention) {
          addRoleAction({
            key: "run-attachment-retention",
            label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
            onClick: onPrecheckV1AttachmentRetention,
            disabled: attachmentRetentionPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("spool")) {
        if (onPrecheckV1PrintSpool) {
          addRoleAction({
            key: "run-print-spool",
            label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
            onClick: onPrecheckV1PrintSpool,
            disabled: printSpoolPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("CUPS")) {
        if (onPrecheckV1PrintCups) {
          addRoleAction({
            key: "run-print-cups",
            label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
            onClick: onPrecheckV1PrintCups,
            disabled: printCupsPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("打印 V1") || haystack.includes("打印门禁")) {
        if (onPrecheckV1PrintReadiness) {
          addRoleAction({
            key: "run-print-readiness",
            label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
            onClick: onPrecheckV1PrintReadiness,
            disabled: printReadinessPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("司机") || haystack.includes("真机") || haystack.includes("原生")) {
        if (onPrecheckV1DriverReadiness) {
          addRoleAction({
            key: "run-driver-readiness",
            label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
            onClick: onPrecheckV1DriverReadiness,
            disabled: driverReadinessPrecheckAction.loading,
          });
        }
      }
    }

    if (taskType === "现场证据") {
      const evidenceItem = findMatchingMissingEvidenceOptionByText([task.title, task.group, task.action]);
      if (evidenceItem) {
        addRoleAction({
          key: "fill-evidence",
          label: "填证据草稿",
          onClick: () => selectMissingEvidenceForStage(evidenceItem),
        });
      }
      addRoleAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (taskType.includes("签字") || haystack.includes("负责人签字")) {
      const signoffItem = findSignoffBoundaryOptionByText([task.title, task.primaryRole, task.group]);
      if (signoffItem) {
        addRoleAction({
          key: "fill-signoff",
          label: "填签字草稿",
          onClick: () => selectSignoffBoundaryForStage(signoffItem),
        });
      }
      addRoleAction({
        key: "open-field-evidence",
        label: "签字进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (taskType.includes("边界") || haystack.includes("V1/V2 边界")) {
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      if (boundaryItem) {
        addRoleAction({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addRoleAction({
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addRoleAction({
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (!actions.length) {
      addRoleAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addRoleAction({
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    return actions;
  }

  function buildRoleTaskCategorySummaries(board = {}) {
    const summary = board.summary || {};
    const sourceCategories = Array.isArray(board.categorySummaries) ? board.categorySummaries : [];
    const sourceByKey = new Map(sourceCategories.map((item) => [item.key, item]));
    const firstEvidenceItem = missingEvidenceOptions[0] || null;
    const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
    const categories = [
      {
        key: "release",
        title: sourceByKey.get("release")?.title || "发布门禁",
        tone: "danger",
        count: Number(sourceByKey.get("release")?.count ?? summary.releaseTaskCount) || 0,
        description: sourceByKey.get("release")?.nextAction || "先处理生产 env、runtime readiness、持久化、对象存储、打印和司机真机门禁。",
        firstTasks: sourceByKey.get("release")?.firstTasks || [],
        actions: [],
      },
      {
        key: "evidence",
        title: sourceByKey.get("evidence")?.title || "现场证据",
        tone: "blue",
        count: Number(sourceByKey.get("evidence")?.count ?? summary.evidenceTaskCount) || 0,
        description: sourceByKey.get("evidence")?.nextAction || "按证据组补真实 PostgreSQL、对象存储、打印、司机真机和业务试跑留档。",
        firstTasks: sourceByKey.get("evidence")?.firstTasks || [],
        actions: [],
      },
      {
        key: "signoff",
        title: sourceByKey.get("signoff")?.title || "负责人签字",
        tone: "warning",
        count: Number(sourceByKey.get("signoff")?.count ?? summary.signoffTaskCount) || 0,
        description: sourceByKey.get("signoff")?.nextAction || "完成办公室、仓库/出库、车间、司机、财务、技术/管理负责人确认。",
        firstTasks: sourceByKey.get("signoff")?.firstTasks || [],
        actions: [],
      },
      {
        key: "boundary",
        title: sourceByKey.get("boundary")?.title || "V1/V2 边界",
        tone: "warning",
        count: Number(sourceByKey.get("boundary")?.count ?? summary.boundaryTaskCount) || 0,
        description: sourceByKey.get("boundary")?.nextAction || "确认哪些必须留在 V1 完成，哪些进入计划 V2，避免把上线门禁后移。",
        firstTasks: sourceByKey.get("boundary")?.firstTasks || [],
        actions: [],
      },
    ];
    const releaseCategory = categories.find((item) => item.key === "release");
    const evidenceCategory = categories.find((item) => item.key === "evidence");
    const signoffCategory = categories.find((item) => item.key === "signoff");
    const boundaryCategory = categories.find((item) => item.key === "boundary");

    if (releaseCategory) {
      addPhaseAction(releaseCategory.actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      addPhaseAction(releaseCategory.actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckProductionEnv) {
        addPhaseAction(releaseCategory.actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(releaseCategory.actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (evidenceCategory) {
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstEvidenceItem) {
        addPhaseAction(evidenceCategory.actions, {
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstEvidenceItem),
        });
      }
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-intake-quality",
        label: "回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
    }

    if (signoffCategory) {
      addPhaseAction(signoffCategory.actions, {
        key: "open-signoff-progress",
        label: "签字进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(signoffCategory.actions, {
          key: "fill-first-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
    }

    if (boundaryCategory) {
      if (boundaryItem) {
        addPhaseAction(boundaryCategory.actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addPhaseAction(boundaryCategory.actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(boundaryCategory.actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    return categories.map((category) => ({
      ...category,
      countLabel: `${category.count} 项`,
      statusLabel: sourceByKey.get(category.key)?.statusLabel || (category.count > 0 ? "待处理" : "已清空"),
      firstTasks: category.firstTasks.slice(0, 3),
    }));
  }

  function buildRuntimeReadinessBlockerActions(item = {}) {
    const key = item.key || "";
    const haystack = [
      key,
      item.label,
      item.group,
      item.ownerRole,
      item.detail,
      item.nextAction,
    ].filter(Boolean).join(" ");
    const actions = [];
    const addRuntimeAction = (action) => addPhaseAction(actions, action);
    const printEvidenceItem = findMatchingMissingEvidenceOptionByText(["打印", "标签", "CUPS", "spool", "样张", "纸张", "条码"]);
    const knownRuntimeBlockerKeys = new Set([
      "system-v1-persistence",
      "attachment-v1-readiness",
      "print-spool-diagnostics",
      "print-cups-diagnostics",
      "print-v1-readiness",
      "driver-v1-readiness",
    ]);
    const hasKnownRuntimeBlockerKey = knownRuntimeBlockerKeys.has(key);

    if (key === "system-v1-persistence" || (!hasKnownRuntimeBlockerKey && (haystack.includes("持久化") || haystack.includes("PostgreSQL")))) {
      if (onPrecheckV1Persistence) {
        addRuntimeAction({
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      const persistenceEvidenceItem = findMatchingMissingEvidenceOptionByText(["PostgreSQL", "生产持久化", "生产库", "迁移", "备份", "恢复"]);
      if (persistenceEvidenceItem) {
        addRuntimeAction({
          key: "fill-persistence-evidence",
          label: "填持久化证据",
          onClick: () => selectMissingEvidenceForStage(persistenceEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
    }

    if (key === "attachment-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("附件") || haystack.includes("对象存储")))) {
      if (onPrecheckV1AttachmentRetention) {
        addRuntimeAction({
          key: "run-attachment-retention-precheck",
          label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
          onClick: onPrecheckV1AttachmentRetention,
          disabled: attachmentRetentionPrecheckAction.loading,
        });
      }
      const attachmentEvidenceItem = findMatchingMissingEvidenceOptionByText(["对象存储", "附件", "bucket", "短期访问", "访问审计", "对账导出"]);
      if (attachmentEvidenceItem) {
        addRuntimeAction({
          key: "fill-attachment-evidence",
          label: "填对象存储证据",
          onClick: () => selectMissingEvidenceForStage(attachmentEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
    }

    if (key === "print-spool-diagnostics" || (!hasKnownRuntimeBlockerKey && haystack.includes("spool"))) {
      if (onPrecheckV1PrintSpool) {
        addRuntimeAction({
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (key === "print-cups-diagnostics" || (!hasKnownRuntimeBlockerKey && haystack.includes("CUPS"))) {
      if (onPrecheckV1PrintCups) {
        addRuntimeAction({
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (key === "print-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("打印 V1") || haystack.includes("打印门禁")))) {
      if (onPrecheckV1PrintReadiness) {
        addRuntimeAction({
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    if (key === "driver-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("司机") || haystack.includes("真机") || haystack.includes("原生")))) {
      if (onPrecheckV1DriverReadiness) {
        addRuntimeAction({
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      const driverEvidenceItem = findMatchingMissingEvidenceOptionByText(["司机", "真机", "原生", "定位", "水印", "导航", "扫码"]);
      if (driverEvidenceItem) {
        addRuntimeAction({
          key: "fill-driver-evidence",
          label: "填司机证据",
          onClick: () => selectMissingEvidenceForStage(driverEvidenceItem),
        });
      }
      const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
      if (driverSignoffItem) {
        addRuntimeAction({
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (!actions.length && onPrecheckRuntimeReadiness) {
      addRuntimeAction({
        key: "run-runtime-readiness",
        label: runtimeReadinessPrecheckAction.loading ? "预检中" : "当前预检",
        onClick: onPrecheckRuntimeReadiness,
        disabled: runtimeReadinessPrecheckAction.loading,
      });
      addRuntimeAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    return actions;
  }

  function buildReleaseCandidateRefreshBlockerActions(item = {}) {
    const key = item.key || "";
    const firstProductionGoLiveBlockedStageKey =
      releaseCandidateRefreshPrecheckAction.result?.summary?.productionGoLiveFirstBlockedStageKey ||
      releaseCandidateRefreshAction.result?.summary?.productionGoLiveFirstBlockedStageKey ||
      "";
    const firstProductionGoLiveBlockedStageLabel =
      releaseCandidateRefreshPrecheckAction.result?.summary?.productionGoLiveFirstBlockedStageLabel ||
      releaseCandidateRefreshAction.result?.summary?.productionGoLiveFirstBlockedStageLabel ||
      "";
    const firstMissingEvidenceItem = missingEvidenceOptions[0] || null;
    const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
    const actions = [];

    if (key === "field-evidence-draft-missing" || key === "field-evidence-draft-invalid") {
      actions.push({
        key: "open-field-evidence-quality",
        label: "到回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
    }

    if (key === "field-evidence-draft-blocked") {
      if (firstMissingEvidenceItem) {
        actions.push({
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstMissingEvidenceItem),
        });
      }
      if (firstSignoffItem) {
        actions.push({
          key: "fill-first-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
      if (boundaryItem) {
        actions.push({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
    }

    if (key === "signoff-incomplete" && firstSignoffItem) {
      actions.push({
        key: "fill-signoff",
        label: "填负责人签字",
        onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
      });
    }

    if (key === "v1-v2-boundary-pending") {
      if (boundaryItem) {
        actions.push({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      actions.push({
        key: "open-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
    }

    if (key === "production-env-preflight-blocked") {
      actions.push({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
      if (onPrecheckProductionEnv) {
        actions.push({
          key: "run-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
    }

    if (key === "production-go-live-combo-blocked") {
      const firstBlockedStageIsEnvFileAudit =
        firstProductionGoLiveBlockedStageKey === "production-env-file-audit" ||
        firstProductionGoLiveBlockedStageLabel.includes("生产 env 文件安全审计") ||
        String(item.detail || "").includes("生产 env 文件安全审计");
      if (firstBlockedStageIsEnvFileAudit && canShowProductionEnvFrontDoorReview) {
        actions.push({
          key: "run-env-front-door-review",
          label: productionEnvFrontDoorReviewLoading || productionGoLivePrecheckAction.loading ? "连续预检中" : "env 连续预检",
          onClick: () => runProductionEnvFrontDoorReview({ includeCombo: true }),
          disabled: productionEnvFrontDoorReviewLoading || productionGoLivePrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnvFileAudit) {
        actions.push({
          key: "run-env-file-audit",
          label: productionEnvFileAuditPrecheckAction.loading ? "审计中" : "env 文件审计",
          onClick: onPrecheckProductionEnvFileAudit,
          disabled: productionEnvFileAuditPrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnvFilePreview) {
        actions.push({
          key: "run-env-file-preview",
          label: productionEnvFilePreviewPrecheckAction.loading ? "预检中" : "文件应用预检",
          onClick: onPrecheckProductionEnvFilePreview,
          disabled: productionEnvFilePreviewPrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnv) {
        actions.push({
          key: "run-current-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      actions.push({
        key: "open-production-gate",
        label: "查看生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      if (onPrecheckProductionGoLive) {
        actions.push({
          key: "run-combo-precheck",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    return actions;
  }

  return (
    <section className="v1-status-page">
      <V1StatusHeader
        ready={goLiveStatus?.ready}
        statusSummary={statusSummary}
        snapshotExpired={v1StatusSnapshotExpired}
        statusSourceLabel={statusSourceLabel}
        statusSourceDetail={statusSourceDetail}
      />

      <section className="page-grid two-col">
        <V1StatusGateModulePanel
          statusSummary={statusSummary}
          unblockPlan={unblockPlan}
          selectedPhase={selectedPhase}
          setSelectedPhaseKey={setSelectedPhaseKey}
          moduleCompletionRows={moduleCompletionRows}
          selectedModule={selectedModule}
          setSelectedModuleName={setSelectedModuleName}
        />

        <DetailPane title={selectedModule.module} subtitle="模块完成度详情">
          <InfoGrid
            rows={[
              ["需求确认", selectedModule.requirements],
              ["P0/代码", selectedModule.p0Code],
              ["V1 上线就绪", selectedModule.v1Readiness],
              ["完成标准", "发布门禁 + 现场证据 + 签字"],
              ["当前阶段", `${selectedPhase.label} / ${selectedPhase.taskCount} 项`],
            ]}
          />
          {ownerDecisionBrief ? (
            <section className="detail-section">
              <h3>负责人决策摘要</h3>
              <div className="v1-owner-decision-head">
                <StatusPill tone={ownerDecisionBrief.canDeclareV1Complete ? "success" : "danger"}>
                  {ownerDecisionBrief.decision.label || "不能宣布 V1 已完成"}
                </StatusPill>
                <p>{ownerDecisionBrief.conclusion}</p>
              </div>
              <div className="v1-owner-decision-summary">
                <span>发布门禁 <strong>{ownerDecisionBrief.completion.releaseGate}</strong></span>
                <span>运行时 <strong>{ownerDecisionBrief.completion.runtimeReadiness}</strong></span>
                <span>现场任务 <strong>{ownerDecisionBrief.completion.onsiteTaskLabel}</strong></span>
                <span>现场证据 <strong>{ownerDecisionBrief.completion.fieldEvidence}</strong></span>
              </div>
              <div className="v1-owner-decision-grid">
                <div className="v1-owner-decision-column">
                  <strong>已完成基础</strong>
                  <div className="v1-owner-decision-list">
                    {ownerDecisionBrief.doneHighlights.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                </div>
                <div className="v1-owner-decision-column">
                  <strong>还没完成</strong>
                  <div className="v1-owner-decision-list">
                    {ownerDecisionBrief.unfinishedItems.slice(0, 5).map((item) => (
                      <p key={`${item.type}-${item.label}`}>
                        <b>{item.label}</b>：{item.detail}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              {ownerDecisionBrief.releaseGates.length ? (
                <div className="v1-owner-decision-gates">
                  {ownerDecisionBrief.releaseGates.map((gate) => (
                    <div className="v1-owner-decision-gate" key={gate.label}>
                      <StatusPill tone={gate.status === "blocked" ? "danger" : "warning"}>{gate.summary}</StatusPill>
                      <div>
                        <strong>{gate.label}</strong>
                        <p>{gate.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {(ownerDecisionBrief.nextActions.length || ownerDecisionBrief.topBlockers.length) ? (
                <div className="v1-owner-action-plan">
                  {ownerDecisionBrief.nextActions.length ? (
                    <div className="v1-owner-action-column">
                      <strong>优先动作 <span>{ownerDecisionBrief.summary.nextActionLabel}</span></strong>
                      <div className="v1-owner-action-list">
                        {ownerDecisionBrief.nextActions.map((action) => (
                          <p key={action}>{action}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {ownerDecisionBrief.topBlockers.length ? (
                    <div className="v1-owner-action-column">
                      <strong>首批阻塞 <span>{ownerDecisionBrief.summary.topBlockerLabel}</span></strong>
                      <div className="v1-owner-blocker-list">
                        {ownerDecisionBrief.topBlockers.map((blocker) => (
                          <div className="v1-owner-blocker-row" key={`${blocker.gate}-${blocker.label}`}>
                            <StatusPill tone="danger">{blocker.gate || "阻塞"}</StatusPill>
                            <div>
                              <strong>{blocker.label}</strong>
                              <p>{blocker.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="v1-owner-decision-question">
                <strong>负责人需要判断</strong>
                <p>{ownerDecisionBrief.decision.ownerQuestion}</p>
                <p>{ownerDecisionBrief.decision.recommendation}</p>
              </div>
            </section>
          ) : null}
          {completionAudit ? (
            <section className="detail-section">
              <h3>V1 完成审计</h3>
              <div className="v1-owner-decision-head">
                <StatusPill tone={completionAudit.canDeclareV1Complete ? "success" : "danger"}>
                  {completionAudit.canDeclareV1Complete ? "可以宣布完成" : "不能宣布完成"}
                </StatusPill>
                <p>{completionAudit.summary.label}</p>
              </div>
              <div className="v1-owner-decision-summary">
                <span>完成标准 <strong>{completionAudit.summary.passedCriteriaCount}/{completionAudit.summary.criteriaCount}</strong></span>
                <span>阻塞 <strong>{completionAudit.summary.blockingCriteriaLabel}</strong></span>
                <span>现场任务 <strong>{completionAudit.summary.onsiteTaskLabel}</strong></span>
                <span>V2 差异 <strong>{completionAudit.summary.v2DifferenceLabel}</strong></span>
              </div>
              <div className="v1-owner-decision-gates">
                {completionAudit.criteria.map((criterion) => {
                  const criterionActions = buildCompletionAuditActions(criterion);
                  return (
                    <div className="v1-owner-decision-gate" key={criterion.key}>
                      <StatusPill tone={criterion.ready ? "success" : "danger"}>{criterion.statusLabel}</StatusPill>
                      <div>
                        <strong>{criterion.label}</strong>
                        <p>当前：{criterion.evidenceLabel}</p>
                        {criterion.proofRequirements?.length ? (
                          <div className="v1-completion-proof-list">
                            <span>需证明</span>
                            {criterion.proofRequirements.map((proof) => (
                              <b key={proof}>{proof}</b>
                            ))}
                          </div>
                        ) : null}
                        {criterion.proofGaps?.length ? (
                          <div className="v1-completion-gap-list">
                            <span>{criterion.proofGapCountLabel ? `还缺 ${criterion.proofGapCountLabel}` : "还缺"}</span>
                            {criterion.proofGaps.map((gap) => (
                              <b key={gap}>{gap}</b>
                            ))}
                          </div>
                        ) : null}
                        <p>{criterion.ready ? criterion.current : criterion.nextAction}</p>
                        {criterionActions.length ? (
                          <div className="v1-refresh-precheck-actions">
                            {criterionActions.map((action) => (
                              <button
                                className="ghost-button"
                                disabled={action.disabled}
                                key={`${criterion.key}-${action.key}`}
                                onClick={action.onClick}
                                type="button"
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="v1-owner-decision-question">
                <strong>V1/V2 边界</strong>
                <p>{completionAudit.v2Boundary.label}</p>
                <p>{completionAudit.v2Boundary.nextAction}</p>
              </div>
            </section>
          ) : null}
          <section className="detail-section">
            <h3>当前解除阻塞阶段</h3>
            <div className="v1-phase-detail">
              <p>{selectedPhase.nextStep}</p>
              <div className="v1-phase-meta">
                <span>发布门禁 {selectedPhase.releaseTaskCount}</span>
                <span>现场证据 {selectedPhase.evidenceTaskCount}</span>
                <span>签字/边界 {selectedPhase.signBoundaryCount}</span>
                {selectedPhase.groupLabel ? <span>分组 {selectedPhase.groupLabel}</span> : null}
                {selectedPhase.firstTaskLabel ? <span>首批任务 {selectedPhase.firstTaskLabel}</span> : null}
              </div>
              <div className="v1-role-strip">
                {selectedPhaseRoles.map((role) => <span key={role}>{role}</span>)}
              </div>
              {selectedPhaseGroups.length ? (
                <div className="v1-phase-group-list">
                  {selectedPhaseGroups.map((group) => (
                    <span className="v1-phase-group" key={group.key}>
                      <strong>{group.group}</strong>
                      {group.countLabel ? <em>{group.countLabel}</em> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="v1-phase-quick-actions">
                {buildSelectedPhaseQuickActions().map((action) => (
                  <button
                    className="ghost-button"
                    disabled={action.disabled}
                    key={`${selectedPhase.key}-${action.key}`}
                    onClick={action.onClick}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="v1-action-list">
              {selectedPhaseTasks.map((task) => (
                <div className="v1-action-row" key={`${selectedPhase.key}-${task.key}`}>
                  <StatusPill tone={getV1PhaseTaskTone(task)}>{task.type || "待办"}</StatusPill>
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.group} / {task.roleLabel}：{task.action}</p>
                    <div className="v1-action-meta">
                      <span>{task.statusLabel}</span>
                      {task.primaryRole ? <span>{task.primaryRole}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {productionEnvGate ? (
            <section className="detail-section" ref={productionEnvGateRef}>
              <div className="v1-section-title-row">
                <h3>生产配置门禁</h3>
                <div className="v1-section-title-actions">
                  <button className="ghost-button" type="button" onClick={() => runProductionEnvFrontDoorReview()} disabled={!canShowProductionEnvFrontDoorReview || !canRunProductionEnvFrontDoorReview}>
                    {productionEnvFrontDoorReviewLoading ? "连续预检中" : "env 连续预检"}
                  </button>
                  <button className="primary-button" type="button" onClick={onRunProductionEnvSetup} disabled={!onRunProductionEnvSetup || productionEnvSetupAction.loading}>
                    {productionEnvSetupAction.loading ? "准备中" : "生成/复核安全草稿"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnvFileAudit} disabled={!onPrecheckProductionEnvFileAudit || productionEnvFileAuditPrecheckAction.loading}>
                    {productionEnvFileAuditPrecheckAction.loading ? "审计中" : "env 文件审计"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnvFilePreview} disabled={!onPrecheckProductionEnvFilePreview || productionEnvFilePreviewPrecheckAction.loading}>
                    {productionEnvFilePreviewPrecheckAction.loading ? "预检中" : "文件应用预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnv} disabled={!onPrecheckProductionEnv || productionEnvPrecheckAction.loading}>
                    {productionEnvPrecheckAction.loading ? "预检中" : "当前预检"}
                  </button>
                  <button className="primary-button" type="button" onClick={onPrecheckProductionGoLive} disabled={!onPrecheckProductionGoLive || productionGoLivePrecheckAction.loading}>
                    {productionGoLivePrecheckAction.loading ? "预检中" : "组合预检"}
                  </button>
                </div>
              </div>
              <div className="v1-production-env-gate-summary">
                <span>通过 <strong>{productionEnvGate.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{productionEnvGate.summary.blockingLabel}</strong></span>
                <span>警告 <strong>{productionEnvGate.summary.warningLabel}</strong></span>
                <span>env 文件审计 <strong>{productionEnvGate.summary.auditStatusLabel}</strong></span>
              </div>
              {productionEnvSetupAction.result || productionEnvSetupAction.error ? (
                <div className="v1-production-env-setup-live-result">
                  {productionEnvSetupAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvSetupAction.result.ready ? "success" : productionEnvSetupAction.result.status === "error" ? "danger" : productionEnvSetupAction.result.status === "prepared" ? "warning" : "danger"}>
                          {productionEnvSetupAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近安全草稿 setup</strong>
                      </div>
                      <p>{productionEnvSetupAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>setup <strong>{productionEnvSetupAction.result.summary.setupReady ? "已准备" : "未就绪"}</strong></span>
                        <span>审计 <strong>{productionEnvSetupAction.result.summary.auditReady ? "通过" : "未通过"}</strong></span>
                        <span>env 预检 <strong>{productionEnvSetupAction.result.summary.envPreflightLabel || "0/0"}</strong></span>
                        <span>剩余修正 <strong>{productionEnvSetupAction.result.summary.remainingFixItemCount || 0} 项</strong></span>
                        <span>目标 env 写入 <strong>{productionEnvSetupAction.result.summary.targetEnvFileWritten ? "是" : "否"}</strong></span>
                        <span>真实值写入 <strong>{productionEnvSetupAction.result.summary.productionEnvRealValuesWritten ? "是" : "否"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvSetupAction.result.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionEnvSetupAction.result.summary.requestBodyIgnored ? "已忽略" : "未忽略"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvSetupAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvSetupAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>服务端 setup 指引</strong>
                          <div className="v1-action-meta">
                            <span>目标来源 {productionEnvSetupAction.result.serverConfigGuidance.targetSource || "server-default"}</span>
                            <span>前端目标路径 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendTargetPath ? "允许" : "不允许"}</span>
                            <span>前端导入路径 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendImportPath ? "允许" : "不允许"}</span>
                            <span>前端 env 值 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendEnvValues ? "允许" : "不允许"}</span>
                            <span>force 覆盖 {productionEnvSetupAction.result.serverConfigGuidance.forceOverwriteEnabled ? "允许" : "不允许"}</span>
                          </div>
                          <ul>
                            {productionEnvSetupAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {productionEnvSetupAction.result.remainingFixItems.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvSetupAction.result.remainingFixItems.slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.missingVariables.join(" / ")}
                            </p>
                          ))}
                        </div>
                      ) : productionEnvSetupAction.result.setupFindings.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvSetupAction.result.setupFindings.slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvSetupAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvFileAuditPrecheckAction.result || productionEnvFileAuditPrecheckAction.error ? (
                <div className="v1-production-env-file-audit-live-result">
                  {productionEnvFileAuditPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvFileAuditPrecheckAction.result.ready ? "success" : productionEnvFileAuditPrecheckAction.result.status === "not_configured" ? "warning" : "danger"}>
                          {productionEnvFileAuditPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 文件审计</strong>
                      </div>
                      <p>{productionEnvFileAuditPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>服务端路径 <strong>{productionEnvFileAuditPrecheckAction.result.summary.envFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>审计文件 <strong>{productionEnvFileAuditPrecheckAction.result.summary.fileCount} 个</strong></span>
                        <span>阻塞 <strong>{productionEnvFileAuditPrecheckAction.result.summary.blockingLabel}</strong></span>
                        <span>警告 <strong>{productionEnvFileAuditPrecheckAction.result.summary.warningLabel}</strong></span>
                        <span>跨文件重复 <strong>{productionEnvFileAuditPrecheckAction.result.summary.crossFileDuplicateVariableCount || 0} 个</strong></span>
                        <span>
                          当前来源{" "}
                          <strong>
                            {productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariable
                              ? `${productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariableLabel || "变量"} ${productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariable}`
                              : "未配置"}
                          </strong>
                        </span>
                        <span>前端路径输入 <strong>{productionEnvFileAuditPrecheckAction.result.summary.envFilePathAccepted ? "允许" : "不允许"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvFileAuditPrecheckAction.result.safeguards?.envFilePathExposed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance?.primaryEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>服务端配置指引</strong>
                          <p>
                            主变量 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.primaryEnvVariable}
                            {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackEnvVariables.length
                              ? `；fallback ${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackEnvVariables.join(" / ")}`
                              : ""}
                          </p>
                          <div className="v1-action-meta">
                            <span>
                              当前来源{" "}
                              {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariable
                                ? `${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariableLabel || "变量"} ${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>fallback 使用 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackSourceUsed ? "是" : "否"}</span>
                            <span>已配置来源 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>被忽略 fallback {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.ignoredConfiguredFallbackVariableCount || 0} 个</span>
                            <span>重启 API {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.restartRequired ? "需要" : "不需要"}</span>
                            <span>前端传路径 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {productionEnvFileAuditPrecheckAction.result.files.length ? (
                        <div className="v1-production-env-file-audit-files">
                          {productionEnvFileAuditPrecheckAction.result.files.slice(0, 3).map((item) => (
                            <span key={item.key}>
                              {item.label}：变量 {item.variableCount} 个 / 占位 {item.placeholderAssignmentCount} 个 / 权限 {item.fileMode || "未知"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(productionEnvFileAuditPrecheckAction.result.blockingFindings.length || productionEnvFileAuditPrecheckAction.result.warningFindings.length) ? (
                        <div className="v1-production-env-file-audit-blockers">
                          {[...productionEnvFileAuditPrecheckAction.result.blockingFindings, ...productionEnvFileAuditPrecheckAction.result.warningFindings].slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvFileAuditPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvFilePreviewPrecheckAction.result || productionEnvFilePreviewPrecheckAction.error ? (
                <div className="v1-production-env-file-preview-live-result">
                  {productionEnvFilePreviewPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvFilePreviewPrecheckAction.result.ready ? "success" : productionEnvFilePreviewPrecheckAction.result.status === "not_configured" ? "warning" : "danger"}>
                          {productionEnvFilePreviewPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 文件应用预检</strong>
                      </div>
                      <p>{productionEnvFilePreviewPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>服务端路径 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.envFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>内存应用 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.appliedInMemory ? "是" : "否"}</strong></span>
                        <span>当前进程改写 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.processEnvMutated ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>审计 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.envFileAuditStatusLabel || "未执行"}</strong></span>
                        <span>当前阶段 <strong>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel || productionEnvFilePreviewPrecheckAction.result.summary.currentStageLabel || "未识别"}</strong></span>
                        <span>
                          配置源{" "}
                          <strong>
                            {productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariable
                              ? `${productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariableLabel || "变量"} ${productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariable}`
                              : "未配置"}
                          </strong>
                        </span>
                      </div>
                      {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel ? (
                        <div className="v1-production-env-file-preview-stage">
                          <div>
                            <StatusPill tone={productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatus === "ready" ? "success" : productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatus === "not_configured" ? "warning" : "danger"}>
                              {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatusLabel || "待处理"}
                            </StatusPill>
                            <strong>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel}</strong>
                            {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.nextStageLabel ? (
                              <span>下一阶段：{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.nextStageLabel}</span>
                            ) : null}
                          </div>
                          <div className="v1-action-meta">
                            <span>
                              配置源{" "}
                              {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariable
                                ? `${productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariableLabel || "变量"} ${productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>fallback 使用 {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.fallbackSourceUsed ? "是" : "否"}</span>
                            <span>已配置来源 {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.configuredSourceVariableCount || 0} 个</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.sourceStatuses)}
                          {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.detail ? (
                            <p>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.detail}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {productionEnvFilePreviewPrecheckAction.result.blockingChecks.length ? (
                        <div className="v1-production-env-file-preview-blockers">
                          {productionEnvFilePreviewPrecheckAction.result.blockingChecks.slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvFilePreviewPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvPrecheckAction.result || productionEnvPrecheckAction.error ? (
                <div className="v1-production-env-live-result">
                  {productionEnvPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvPrecheckAction.result.ready ? "success" : "warning"}>
                          {productionEnvPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 预检</strong>
                      </div>
                      <p>{productionEnvPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前进程 <strong>{productionEnvPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{productionEnvPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>警告 <strong>{productionEnvPrecheckAction.result.summary.warningLabel}</strong></span>
                        <span>env 路径输入 <strong>{productionEnvPrecheckAction.result.summary.envFilePathAccepted ? "允许" : "不允许"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvPrecheckAction.result.blockingChecks.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvPrecheckAction.result.blockingChecks.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionGoLivePrecheckAction.result || productionGoLivePrecheckAction.error ? (
                <div className="v1-production-go-live-live-result">
                  {productionGoLivePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionGoLivePrecheckAction.result.ready ? "success" : productionGoLivePrecheckAction.result.status === "error" ? "danger" : "warning"}>
                          {productionGoLivePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近生产上线组合预检</strong>
                      </div>
                      <p>{productionGoLivePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>阶段 <strong>{productionGoLivePrecheckAction.result.summary.readinessLabel}</strong></span>
                        <span>阻塞 <strong>{productionGoLivePrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>env 文件 <strong>{productionGoLivePrecheckAction.result.summary.configuredEnvFileCount} 个</strong></span>
                        <span>当前实例 <strong>{productionGoLivePrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>应用 env <strong>{productionGoLivePrecheckAction.result.summary.productionEnvAppliedToProcess ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{productionGoLivePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {renderV1ProductionEnvFileSourceStatusList(productionGoLivePrecheckAction.result.summary.sourceStatuses)}
                      {productionGoLivePrecheckAction.result.fieldEvidenceCoverage.items.length ? (
                        <div className="v1-production-go-live-evidence-coverage">
                          <div>
                            <strong>现场证据覆盖</strong>
                            <span>
                              报告可支持 <strong>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.reportSupportedLabel}</strong>
                            </span>
                            <span>
                              仍需补证 <strong>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.stillNeedsFieldEvidenceLabel}</strong>
                            </span>
                          </div>
                          <p>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.nextAction}</p>
                          {productionGoLivePrecheckAction.result.fieldEvidenceCoverage.items.slice(0, 5).map((item) => (
                            <div className="v1-production-go-live-evidence-row" key={`${item.groupKey}-${item.itemKey}`}>
                              <StatusPill
                                tone={
                                  item.status === "report_supported"
                                    ? "success"
                                    : item.status === "needs_onsite_ref"
                                      ? "warning"
                                      : "danger"
                                }
                              >
                                {item.statusLabel}
                              </StatusPill>
                              <div>
                                <strong>{item.groupLabel} / {item.itemLabel}</strong>
                                <p>{item.nextAction}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {productionGoLivePrecheckAction.result.stages.length ? (
                        <div className="v1-production-go-live-stages">
                          {productionGoLivePrecheckAction.result.stages.map((stage) => (
                            <div className="v1-production-go-live-stage" key={stage.key || stage.label}>
                              <StatusPill tone={stage.ready ? "success" : "warning"}>
                                {stage.ready ? "通过" : "阻塞"}
                              </StatusPill>
                              <div>
                                <strong>{stage.label}</strong>
                                <p>{stage.summary.label || stage.nextActions[0] || "等待预检结果"}</p>
                                {stage.blockingItems.length ? (
                                  <div className="v1-production-go-live-blockers">
                                    {stage.blockingItems.slice(0, 3).map((item) => (
                                      <span key={item.key || item.label}>{item.label}：{item.detail}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {productionGoLivePrecheckAction.result.unblockChecklist.length ? (
                        <div className="v1-production-go-live-unblock-list">
                          <strong>解除阻塞清单</strong>
                          {productionGoLivePrecheckAction.result.unblockChecklist.slice(0, 4).map((item) => (
                            <div className="v1-production-go-live-unblock-row" key={item.key || item.label}>
                              <div>
                                <StatusPill tone={item.ready ? "success" : "warning"}>
                                  {item.ready ? "已通过" : "待处理"}
                                </StatusPill>
                                <strong>{item.stageOrder ? `${item.stageOrder}. ${item.label}` : item.label}</strong>
                                <span>{item.ownerRole}</span>
                              </div>
                              <p>{item.nextAction}</p>
                              {item.verificationSteps.length || item.evidenceToKeep.length ? (
                                <div className="v1-production-go-live-unblock-meta">
                                  {item.verificationSteps[0] ? <span>复核：{item.verificationSteps[0]}</span> : null}
                                  {item.evidenceToKeep[0] ? <span>留证：{item.evidenceToKeep[0]}</span> : null}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionGoLivePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-production-env-audit">
                <StatusPill tone={productionEnvGate.audit.included ? productionEnvGate.audit.ready ? "success" : "warning" : "warning"}>
                  {productionEnvGate.audit.statusLabel}
                </StatusPill>
                <div>
                  <strong>env 文件审计</strong>
                  <p>{productionEnvGate.audit.summary.label || "填写安全 env 文件后重新执行 env 文件安全审计。"}</p>
                </div>
              </div>
              <div className="v1-production-env-gate-list">
                {(productionEnvGate.blockingChecks.length ? productionEnvGate.blockingChecks : productionEnvGate.checks).slice(0, 5).map((item) => {
                  const gateActions = buildProductionEnvGateActions(item);
                  return (
                    <div className="v1-production-env-gate-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction}</p>
                      <div className="v1-production-env-gate-meta">
                        <span>{item.ownerRole}</span>
                        <span>{item.configuredVariableCount}/{item.totalVariableCount} 已配置</span>
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                      </div>
                      {gateActions.length ? (
                        <div className="v1-production-env-gate-actions">
                          {gateActions.map((action) => (
                            <button
                              className="ghost-button"
                              disabled={action.disabled}
                              key={`${item.key || item.label}-${action.key}`}
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
              <p className="v1-production-env-gate-note">{productionEnvGate.nextAction}</p>
            </section>
          ) : null}
          {productionEnvIntakeVerification ? (
            <section className="detail-section" ref={productionEnvIntakeVerificationRef}>
              <div className="v1-section-title-row">
                <h3>生产 env 真实值校验</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onPrecheckProductionEnvIntake}
                    disabled={!onPrecheckProductionEnvIntake || productionEnvIntakePrecheckAction.loading}
                  >
                    {productionEnvIntakePrecheckAction.loading ? "校验中" : "重新校验真实值"}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFixChecklistRef)}>
                    查看修正清单
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef)}>
                    查看最小片段
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFillTemplateRef)}>
                    查看填写草稿
                  </button>
                </div>
              </div>
              <div className="v1-field-intake-summary">
                <span>真实值清单 <strong>{productionEnvIntakeVerification.summary.configuredLabel}</strong></span>
                <span>最小阻塞补值 <strong>{productionEnvIntakeVerification.summary.minimumBlockingLabel}</strong></span>
                <span>建议 / 可选补值 <strong>{productionEnvIntakeVerification.summary.minimumWarningLabel}</strong></span>
                <span>缺失 <strong>{productionEnvIntakeVerification.summary.missingRowCount} 行</strong></span>
                <span>阻塞 <strong>{productionEnvIntakeVerification.summary.blockingLabel}</strong></span>
                <span>警告 <strong>{productionEnvIntakeVerification.summary.warningLabel}</strong></span>
                <span>任选组 <strong>{productionEnvIntakeVerification.summary.alternativeGroupBlockingCount}/{productionEnvIntakeVerification.summary.alternativeGroupCount} 阻塞</strong></span>
                <span>安全审计 <strong>{productionEnvIntakeVerification.summary.auditReady ? "通过" : "未通过"}</strong></span>
                <span>清单 CSV <strong>{productionEnvIntakeVerification.summary.intakeCsvReady ? "可读" : "未就绪"}</strong></span>
              </div>
              <div className="v1-production-env-intake-priority">
                <strong>优先补值路径</strong>
                <p>
                  先按最小 blocking 片段补齐 {productionEnvIntakeVerification.summary.minimumBlockingMissingCount} 项：
                  {productionEnvIntakeVerification.summary.minimumBlockingVariableRowCount} 个变量行
                  {productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount
                    ? ` + ${productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount} 个任选组`
                    : ""}
                  。补完后先跑真实值 dry-run，通过后再正式合并真实值。
                </p>
                <div className="v1-action-meta">
                  <span>全量清单 {productionEnvIntakeVerification.summary.fullIntakeConfiguredLabel}</span>
                  <span>最小补值缺 {productionEnvIntakeVerification.summary.minimumBlockingMissingCount} 项</span>
                  <span>建议 / 可选缺 {productionEnvIntakeVerification.summary.minimumWarningMissingCount} 项</span>
                  <span>模板 {productionEnvMinimumValuesFragmentTemplate ? "已生成" : "未生成"}</span>
                  <span>仍不接收浏览器 env 值</span>
                </div>
              </div>
              {productionEnvMinimumBlockingItems.length ? (
                <div className="v1-production-env-intake-blockers">
                  <strong>最小补值清单</strong>
                  <p>
                    先补下面 {productionEnvMinimumBlockingItems.length} 项；真实值只填安全 env 文件，页面只显示变量名和值类型。
                  </p>
                  {productionEnvMinimumBlockingItems.map((item) => (
                    <div className="v1-production-env-gate-row" key={item.key || item.variableLabel || item.label}>
                      <div>
                        <StatusPill tone="danger">待补</StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction || item.detail || "补齐安全 env 文件后重新校验真实值。"}</p>
                      <div className="v1-production-env-gate-meta">
                        {item.ownerRole ? <span>{item.ownerRole}</span> : null}
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {item.sourceSystem ? <span>{item.sourceSystem}</span> : null}
                        {item.expectedValueType ? <span>{item.expectedValueType}</span> : null}
                        <span>已配置 {item.configured || item.configuredKeyCount > 0 ? "是" : "否"}</span>
                        <span>已验收 {item.verifiedMarked ? "是" : "否"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="v1-production-env-intake-result">
                <div>
                  <StatusPill tone={productionEnvIntakeVerification.ready ? "success" : productionEnvIntakeVerification.status === "blocked" ? "danger" : "warning"}>
                    {productionEnvIntakeVerification.statusLabel}
                  </StatusPill>
                  <strong>{productionEnvIntakeVerification.summary.label}</strong>
                </div>
                <p>{productionEnvIntakeVerification.nextActions[0] || "按真实值清单补齐安全 env 文件，再重新运行生产 env 真实值校验。"}</p>
                <div className="v1-action-meta">
                  <span>env 路径暴露 {productionEnvIntakeVerification.safeguards?.envFilePathIncluded ? "是" : "否"}</span>
                  <span>真实值暴露 {productionEnvIntakeVerification.safeguards?.envValuesIncluded ? "是" : "否"}</span>
                  <span>secret 暴露 {productionEnvIntakeVerification.safeguards?.secretFieldsIncluded ? "是" : "否"}</span>
                  <span>原始证据号暴露 {productionEnvIntakeVerification.safeguards?.rawProofRefIncluded ? "是" : "否"}</span>
                </div>
              </div>
              {productionEnvIntakePrecheckAction.result || productionEnvIntakePrecheckAction.error ? (
                <div className="v1-production-env-intake-live-result">
                  {productionEnvIntakePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionEnvIntakePrecheckAction.result.ready
                              ? "success"
                              : productionEnvIntakePrecheckAction.result.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionEnvIntakePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近真实值校验</strong>
                      </div>
                      <p>{productionEnvIntakePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>真实值清单 <strong>{productionEnvIntakePrecheckAction.result.summary.configuredLabel}</strong></span>
                        <span>最小补值 <strong>{productionEnvIntakePrecheckAction.result.summary.minimumBlockingLabel}</strong></span>
                        <span>建议 / 可选 <strong>{productionEnvIntakePrecheckAction.result.summary.minimumWarningLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvIntakePrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>setup 安全文件 <strong>{productionEnvIntakePrecheckAction.result.summary.envFileFromProductionSetup ? "已复用" : "未就绪"}</strong></span>
                        <span>清单 CSV <strong>{productionEnvIntakePrecheckAction.result.summary.intakeCsvReady ? "可读" : "未就绪"}</strong></span>
                        <span>请求体 <strong>{productionEnvIntakePrecheckAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvIntakePrecheckAction.result.summary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>写 env <strong>{productionEnvIntakePrecheckAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvIntakePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvIntakePrecheckAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>{productionEnvIntakePrecheckAction.result.serverConfigGuidance.label || "真实值校验边界"}</strong>
                          <p>
                            输入 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.primaryInput || "production env setup latest"}
                            ；前端传路径 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}
                          </p>
                          <div className="v1-action-meta">
                            <span>setup 报告 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.setupReportAvailable ? "存在" : "缺失"}</span>
                            <span>setup ready {productionEnvIntakePrecheckAction.result.serverConfigGuidance.setupReady ? "是" : "否"}</span>
                            <span>env 文件数 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.envFileCount}</span>
                            <span>路径暴露 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          <ul>
                            {productionEnvIntakePrecheckAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionEnvIntakePrecheckAction.result.blockingItems.length || productionEnvIntakePrecheckAction.result.blockingFindings.length) ? (
                        <div className="v1-production-env-intake-blockers">
                          {[...productionEnvIntakePrecheckAction.result.blockingItems, ...productionEnvIntakePrecheckAction.result.blockingFindings].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvIntakePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {(productionEnvIntakeVerification.blockingFindings.length || productionEnvIntakeVerification.warningFindings.length) ? (
                <div className="v1-production-env-intake-blockers">
                  {[...productionEnvIntakeVerification.blockingFindings, ...productionEnvIntakeVerification.warningFindings].slice(0, 6).map((item) => (
                    <div className="v1-production-env-gate-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction || item.detail}</p>
                      <div className="v1-production-env-gate-meta">
                        {item.ownerRole ? <span>{item.ownerRole}</span> : null}
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {item.sourceSystem ? <span>{item.sourceSystem}</span> : null}
                        {item.expectedValueType ? <span>{item.expectedValueType}</span> : null}
                        <span>已配置 {item.configured || item.configuredKeyCount > 0 ? "是" : "否"}</span>
                        <span>已验收 {item.verifiedMarked ? "是" : "否"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {productionFirstStageExecution ? (
            <section className="detail-section" ref={productionFirstStageExecutionRef}>
              <div className="v1-section-title-row">
                <h3>生产环境 / 持久化第一阶段</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onRunProductionPersistenceEvidence}
                    disabled={!onRunProductionPersistenceEvidence || productionPersistenceEvidenceAction.loading}
                  >
                    {productionPersistenceEvidenceAction.loading ? "留证中" : "持久化留证"}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onRunProductionFirstStageExecution}
                    disabled={!onRunProductionFirstStageExecution || productionFirstStageExecutionAction.loading}
                  >
                    {productionFirstStageExecutionAction.loading ? "执行中" : "执行第一阶段"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onPrecheckProductionFirstStageValuesDryRun}
                    disabled={!onPrecheckProductionFirstStageValuesDryRun || productionFirstStageValuesDryRunAction.loading}
                  >
                    {productionFirstStageValuesDryRunAction.loading ? "dry-run 中" : "真实值 dry-run"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onApplyProductionFirstStageValues}
                    disabled={!onApplyProductionFirstStageValues || productionFirstStageValuesApplyAction.loading}
                  >
                    {productionFirstStageValuesApplyAction.loading ? "合并中" : "正式合并真实值"}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvIntakeVerificationRef)}>
                    查看真实值校验
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef)}>
                    查看最小片段
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFillTemplateRef)}>
                    查看填写草稿
                  </button>
                </div>
              </div>
              <div className="v1-field-intake-summary">
                <span>执行步骤 <strong>{productionFirstStageExecution.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{productionFirstStageExecution.summary.blockingLabel}</strong></span>
                <span>错误 <strong>{productionFirstStageExecution.summary.errorLabel}</strong></span>
                <span>env 来源 <strong>{productionFirstStageExecution.execution.envFileSourceLabel || "未记录"}</strong></span>
                <span>intake 全量 <strong>{productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel || "未纳入"}</strong></span>
                <span>intake 最小补值 <strong>{productionFirstStageExecution.intakeCoverage.minimumBlockingLabel || "未纳入"}</strong></span>
                <span>intake 缺 <strong>{productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</strong></span>
                <span>values dry-run <strong>{productionFirstStageExecution.dryRunCoverage.statusLabel}</strong></span>
                <span>dry-run 最小补值 <strong>{productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel}</strong></span>
              </div>
              {productionEnvValuesFragmentSourceStatus ? (
                <div className="v1-production-first-stage-result v1-production-env-values-fragment-source-status">
                  <div>
                    <StatusPill
                      tone={
                        productionEnvValuesFragmentSourceStatus.ready
                          ? "success"
                          : productionEnvValuesFragmentSourceStatus.status === "multiple_configured"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {productionEnvValuesFragmentSourceStatus.statusLabel}
                    </StatusPill>
                    <strong>真实值片段来源</strong>
                  </div>
                  <p>{productionEnvValuesFragmentSourceStatus.nextAction}</p>
                  <div className="v1-action-meta">
                    <span>
                      主变量 <strong>{productionEnvValuesFragmentSourceStatus.summary.primaryEnvVariable || "ERP_V1_PRODUCTION_ENV_VALUES_FILE"}</strong>
                    </span>
                    <span>
                      fallback <strong>{productionEnvValuesFragmentSourceStatus.summary.fallbackEnvVariables.join(" / ") || "无"}</strong>
                    </span>
                    <span>
                      当前来源{" "}
                      <strong>
                        {productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariable
                          ? `${productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariableLabel || "变量"} ${productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariable}`
                          : "未配置"}
                      </strong>
                    </span>
                    <span>已配置来源 <strong>{productionEnvValuesFragmentSourceStatus.summary.configuredSourceVariableCount}</strong></span>
                    <span>最小阻塞补值 <strong>{productionEnvValuesFragmentSourceStatus.summary.minimumBlockingLabel || "未生成"}</strong></span>
                    <span>最小补值缺 <strong>{productionEnvValuesFragmentSourceStatus.summary.minimumBlockingMissingCount} 项</strong></span>
                    <span>全量清单 <strong>{productionEnvValuesFragmentSourceStatus.summary.fullIntakeConfiguredLabel || "未生成"}</strong></span>
                    <span>前端传路径 <strong>{productionEnvValuesFragmentSourceStatus.summary.acceptsFrontendPath ? "允许" : "不允许"}</strong></span>
                    <span>真实路径暴露 <strong>{productionEnvValuesFragmentSourceStatus.summary.pathValueExposed ? "是" : "否"}</strong></span>
                    <span>目标 setup <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                    <span>setup 报告 <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                    <span>目标 env 文件 <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupEnvFileCount} 个</strong></span>
                    <span>片段审计 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditReady ? "通过" : productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                    <span>审计阻塞 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditBlockingCount} 项</strong></span>
                    <span>审计警告 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditWarningCount} 项</strong></span>
                    <span>dry-run <strong>{productionEnvValuesFragmentSourceStatus.summary.dryRunExecuted ? "已执行" : "未执行"}</strong></span>
                    <span>目标 env 写入 <strong>{productionEnvValuesFragmentSourceStatus.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                  </div>
                  {renderV1ProductionEnvFileSourceStatusList(productionEnvValuesFragmentSourceStatus.serverConfigGuidance.sourceStatuses)}
                </div>
              ) : null}
              {productionEnvValuesApplyGateStatus ? (
                <div className="v1-production-first-stage-result v1-production-env-values-apply-gate-status">
                  <div>
                    <StatusPill
                      tone={
                        productionEnvValuesApplyGateStatus.ready
                          ? "success"
                          : productionEnvValuesApplyGateStatus.status === "multiple_configured"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {productionEnvValuesApplyGateStatus.statusLabel}
                    </StatusPill>
                    <strong>正式合并开关</strong>
                  </div>
                  <p>{productionEnvValuesApplyGateStatus.nextAction}</p>
                  <div className="v1-action-meta">
                    <span>
                      开关变量 <strong>{productionEnvValuesApplyGateStatus.summary.applyEnableEnvVariable}</strong>
                    </span>
                    <span>开关 <strong>{productionEnvValuesApplyGateStatus.summary.applyEnabled ? "已启用" : "未启用"}</strong></span>
                    <span>真实值片段 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                    <span>
                      当前来源{" "}
                      <strong>
                        {productionEnvValuesApplyGateStatus.summary.selectedEnvVariable
                          ? `${productionEnvValuesApplyGateStatus.summary.selectedEnvVariableLabel || "变量"} ${productionEnvValuesApplyGateStatus.summary.selectedEnvVariable}`
                          : "未配置"}
                      </strong>
                    </span>
                    <span>目标 env 可能写入 <strong>{productionEnvValuesApplyGateStatus.summary.targetEnvFileMayBeMutated ? "是" : "否"}</strong></span>
                    <span>最小阻塞补值 <strong>{productionEnvValuesApplyGateStatus.summary.minimumBlockingLabel || "未生成"}</strong></span>
                    <span>最小补值缺 <strong>{productionEnvValuesApplyGateStatus.summary.minimumBlockingMissingCount} 项</strong></span>
                    <span>全量清单 <strong>{productionEnvValuesApplyGateStatus.summary.fullIntakeConfiguredLabel || "未生成"}</strong></span>
                    <span>目标 setup <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                    <span>setup 报告 <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                    <span>目标 env 文件 <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupEnvFileCount} 个</strong></span>
                    <span>片段审计 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditReady ? "通过" : productionEnvValuesApplyGateStatus.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                    <span>审计阻塞 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditBlockingCount} 项</strong></span>
                    <span>审计警告 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditWarningCount} 项</strong></span>
                    <span>dry-run 证明 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofReady ? "通过" : productionEnvValuesApplyGateStatus.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                    <span>片段指纹 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                    <span>指纹摘要暴露 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                    <span>dry-run 时效 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofFresh ? "有效" : productionEnvValuesApplyGateStatus.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                    <span>dry-run 有效期 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours ? `${productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                    <span>dry-run 失效 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                    <span>dry-run 剩余 <strong>{Number.isFinite(productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours) ? `${productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                    <span>dry-run 最小补值 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                    <span>dry-run 缺 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingMissingCount} 项</strong></span>
                    <span>本次已合并 <strong>{productionEnvValuesApplyGateStatus.summary.applyExecuted ? "是" : "否"}</strong></span>
                    <span>目标 env 已写入 <strong>{productionEnvValuesApplyGateStatus.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                    <span>请求体 <strong>{productionEnvValuesApplyGateStatus.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                    <span>路径暴露 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFilePathExposed || productionEnvValuesApplyGateStatus.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                    <span>迁移 apply <strong>{productionEnvValuesApplyGateStatus.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                  </div>
                  {renderV1ProductionEnvFileSourceStatusList(productionEnvValuesApplyGateStatus.serverConfigGuidance.sourceStatuses)}
                </div>
              ) : null}
              {productionPersistenceEvidence ? (
                <div className="v1-production-first-stage-result v1-production-persistence-evidence-latest">
                  <div>
                    <StatusPill tone={productionPersistenceEvidence.ready ? "success" : productionPersistenceEvidence.status === "error" ? "danger" : "warning"}>
                      {productionPersistenceEvidence.statusLabel}
                    </StatusPill>
                    <strong>当前持久化留证 latest</strong>
                  </div>
                  <p>{productionPersistenceEvidence.nextAction || "按持久化留证阻塞项补齐真实 PostgreSQL、恢复验证库、对象存储或 production env 后重试。"}</p>
                  <div className="v1-action-meta">
                    <span>阶段 <strong>{productionPersistenceEvidenceSummary.passedLabel || "0/0"}</strong></span>
                    <span>阻塞 <strong>{productionPersistenceEvidenceSummary.blockingLabel || "0 项"}</strong></span>
                    <span>警告 <strong>{productionPersistenceEvidenceSummary.warningLabel || "0 项"}</strong></span>
                    <span>env 来源 <strong>{productionPersistenceEvidenceSummary.envFileSourceLabel || "未记录"}</strong></span>
                    <span>持久化 env <strong>{productionPersistenceEvidenceSummary.persistenceEnvReady ? "通过" : "未通过"}</strong></span>
                    <span>PostgreSQL <strong>{productionPersistenceEvidenceSummary.postgresReady ? "通过" : "未通过"}</strong></span>
                    <span>备份恢复 <strong>{productionPersistenceEvidenceSummary.postgresBackupRestoreReady ? "通过" : "未通过"}</strong></span>
                    <span>对象存储 <strong>{productionPersistenceEvidenceSummary.objectStorageReady ? "通过" : "未通过"}</strong></span>
                    <span>bucket 治理 <strong>{productionPersistenceEvidenceSummary.objectStorageGovernanceReady ? "通过" : "未通过"}</strong></span>
                    <span>迁移 apply <strong>{productionPersistenceEvidence.safeguards?.migrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                    <span>恢复重置 <strong>{productionPersistenceEvidence.safeguards?.postgresBackupRestoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                    <span>路径暴露 <strong>{productionPersistenceEvidence.safeguards?.envFilePathExposed ? "是" : "否"}</strong></span>
                  </div>
                  {productionPersistenceEvidenceLatestBlockers.length ? (
                    <div className="v1-blocker-preview-list">
                      {productionPersistenceEvidenceLatestBlockers.slice(0, 5).map((item) => (
                        <div className="v1-blocker-preview-row" key={`${item.key || item.label}-${item.status || "blocked"}`}>
                          <StatusPill tone={item.ready ? "success" : item.status === "warning" ? "warning" : "danger"}>
                            {item.statusLabel || (item.ready ? "已通过" : "阻塞")}
                          </StatusPill>
                          <span>{item.label}</span>
                          <small>{item.nextAction || item.detail}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {productionPersistenceEvidenceLiveResult || productionPersistenceEvidenceAction.error ? (
                <div className="v1-production-first-stage-result v1-production-persistence-evidence-live-result">
                  {productionPersistenceEvidenceLiveResult ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionPersistenceEvidenceLiveResult.ready
                              ? "success"
                              : productionPersistenceEvidenceLiveResult.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionPersistenceEvidenceLiveResult.statusLabel}
                        </StatusPill>
                        <strong>最近持久化留证</strong>
                      </div>
                      <p>{productionPersistenceEvidenceLiveResult.nextAction || productionPersistenceEvidenceLiveResult.nextActions?.[0]}</p>
                      <div className="v1-action-meta">
                        <span>阶段 <strong>{productionPersistenceEvidenceLiveSummary.passedLabel || "0/0"}</strong></span>
                        <span>阻塞 <strong>{productionPersistenceEvidenceLiveSummary.blockerLabel || "0 项"}</strong></span>
                        <span>警告 <strong>{productionPersistenceEvidenceLiveSummary.warningLabel || "0 项"}</strong></span>
                        <span>env 来源 <strong>{productionPersistenceEvidenceLiveSummary.envFileSourceLabel || "未记录"}</strong></span>
                        <span>持久化 env <strong>{productionPersistenceEvidenceLiveSummary.persistenceEnvReady ? "通过" : "未通过"}</strong></span>
                        <span>PostgreSQL <strong>{productionPersistenceEvidenceLiveSummary.postgresReady ? "通过" : "未通过"}</strong></span>
                        <span>备份恢复 <strong>{productionPersistenceEvidenceLiveSummary.postgresBackupRestoreReady ? "通过" : "未通过"}</strong></span>
                        <span>对象存储 <strong>{productionPersistenceEvidenceLiveSummary.objectStorageReady ? "通过" : "未通过"}</strong></span>
                        <span>bucket 治理 <strong>{productionPersistenceEvidenceLiveSummary.objectStorageGovernanceReady ? "通过" : "未通过"}</strong></span>
                        <span>前端路径 <strong>{productionPersistenceEvidenceLiveSummary.envFilePathAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>路径暴露 <strong>{productionPersistenceEvidenceLiveSummary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>迁移 apply <strong>{productionPersistenceEvidenceLiveSummary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                        <span>恢复重置 <strong>{productionPersistenceEvidenceLiveSummary.restoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                        <span>业务数据 <strong>{productionPersistenceEvidenceLiveSummary.businessDataMutated ? "已改动" : "未改动"}</strong></span>
                        <span>打印设备 <strong>{productionPersistenceEvidenceLiveSummary.physicalPrinterCalled ? "已调用" : "未调用"}</strong></span>
                        <span>司机状态 <strong>{productionPersistenceEvidenceLiveSummary.driverDeliveryStatusChanged ? "已改动" : "未改动"}</strong></span>
                      </div>
                      <div className="v1-field-intake-summary v1-production-first-stage-server-guidance">
                        <span>服务端输入 <strong>{productionPersistenceEvidenceGuidance.primaryInput || "production env setup latest"}</strong></span>
                        <span>前端路径 <strong>{productionPersistenceEvidenceGuidance.acceptsFrontendPath ? "允许" : "不允许"}</strong></span>
                        <span>默认迁移 apply <strong>{productionPersistenceEvidenceGuidance.applyMigrationsByDefault ? "是" : "否"}</strong></span>
                        <span>默认恢复重置 <strong>{productionPersistenceEvidenceGuidance.restoreResetAllowedByDefault ? "是" : "否"}</strong></span>
                        <span>业务写入 <strong>{productionPersistenceEvidenceGuidance.writesBusinessData ? "是" : "否"}</strong></span>
                      </div>
                      {productionPersistenceEvidenceGuidance.steps?.length ? (
                        <ul className="v1-compact-list">
                          {productionPersistenceEvidenceGuidance.steps.slice(0, 4).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                      {productionPersistenceEvidenceBlockers.length ? (
                        <div className="v1-blocker-preview-list">
                          {productionPersistenceEvidenceBlockers.slice(0, 5).map((item) => (
                            <div className="v1-blocker-preview-row" key={`${item.key || item.label}-${item.status || item.severity || "blocked"}`}>
                              <StatusPill tone={item.severity === "warning" ? "warning" : item.ready ? "success" : "danger"}>
                                {item.statusLabel || (item.ready ? "已通过" : "阻塞")}
                              </StatusPill>
                              <span>{item.label}</span>
                              <small>{item.nextAction || item.detail}</small>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div>
                        <StatusPill tone="danger">失败</StatusPill>
                        <strong>最近持久化留证</strong>
                      </div>
                      <p>{productionPersistenceEvidenceAction.error}</p>
                    </>
                  )}
                </div>
              ) : null}
              <div className="v1-production-first-stage-result">
                <div>
                  <StatusPill tone={productionFirstStageExecution.ready ? "success" : productionFirstStageExecution.status === "blocked" ? "danger" : "warning"}>
                    {productionFirstStageExecution.statusLabel}
                  </StatusPill>
                  <strong>{productionFirstStageExecution.summary.label}</strong>
                </div>
                <p>{productionFirstStageExecution.nextActions[0] || productionFirstStageExecution.dryRunCoverage.nextAction}</p>
                <div className="v1-action-meta">
                  <span>真实值 intake {productionFirstStageExecution.intakeCoverage.statusLabel}</span>
                  <span>全量清单 {productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel}</span>
                  <span>最小阻塞补值 {productionFirstStageExecution.intakeCoverage.minimumBlockingLabel}</span>
                  <span>最小补值缺 {productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</span>
                  <span>建议 / 可选补值 {productionFirstStageExecution.intakeCoverage.minimumWarningLabel}</span>
                  <span>intake CSV {productionFirstStageExecution.intakeCoverage.intakeCsvReady ? "ready" : "blocked"}</span>
                  <span>安全 env 文件 {productionFirstStageExecution.execution.envFileFromProductionSetup ? "来自 setup" : "未确认 setup 来源"}</span>
                  <span>迁移 apply {productionFirstStageExecution.execution.applyMigrations ? "已执行" : "未执行"}</span>
                  <span>恢复重置授权 {productionFirstStageExecution.execution.restoreResetExplicitlyAllowed ? "已显式授权" : "未授权"}</span>
                  <span>业务数据改动 {productionFirstStageExecution.safeguards?.businessDataMutated ? "是" : "否"}</span>
                </div>
              </div>
              <div className="v1-production-first-stage-result">
                <div>
                  <StatusPill tone={productionFirstStageExecution.dryRunCoverage.included ? productionFirstStageExecution.dryRunCoverage.minimumBlockingReady ? "success" : "warning" : "warning"}>
                    {productionFirstStageExecution.dryRunCoverage.statusLabel}
                  </StatusPill>
                  <strong>{productionFirstStageExecution.dryRunCoverage.included ? "真实值 dry-run 覆盖已纳入" : "真实值 dry-run 覆盖未纳入"}</strong>
                </div>
                <p>{productionFirstStageExecution.dryRunCoverage.nextAction}</p>
                <div className="v1-action-meta">
                  <span>预计 env 预检 {productionFirstStageExecution.dryRunCoverage.envPreflightLabel}</span>
                  <span>预计 intake {productionFirstStageExecution.dryRunCoverage.intakeLabel}</span>
                  <span>最小阻塞补值 {productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel}</span>
                  <span>建议 / 可选补值 {productionFirstStageExecution.dryRunCoverage.minimumWarningLabel}</span>
                </div>
              </div>
              {productionFirstStageExecutionAction.result || productionFirstStageExecutionAction.error ? (
                <div className="v1-production-first-stage-execution-live-result">
                  {productionFirstStageExecutionAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageExecutionAction.result.ready
                              ? "success"
                              : productionFirstStageExecutionAction.result.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionFirstStageExecutionAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近第一阶段执行</strong>
                      </div>
                      <p>{productionFirstStageExecutionAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>执行步骤 <strong>{productionFirstStageExecutionAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionFirstStageExecutionAction.result.summary.blockerLabel}</strong></span>
                        <span>错误 <strong>{productionFirstStageExecutionAction.result.summary.errorLabel}</strong></span>
                        <span>env 来源 <strong>{productionFirstStageExecutionAction.result.summary.envFileSourceLabel || "未记录"}</strong></span>
                        <span>intake 全量 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.fullIntakeConfiguredLabel}</strong></span>
                        <span>intake 最小补值 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.minimumBlockingLabel}</strong></span>
                        <span>intake 缺 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</strong></span>
                        <span>请求体 <strong>{productionFirstStageExecutionAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>前端路径 <strong>{productionFirstStageExecutionAction.result.summary.envFilePathAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageExecutionAction.result.summary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>runtime smoke <strong>{productionFirstStageExecutionAction.result.summary.runtimeSmokeUsesCurrentApi ? "当前 API" : "未确认"}</strong></span>
                        <span>API 地址输入 <strong>{productionFirstStageExecutionAction.result.summary.runtimeSmokeApiBaseUrlAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>迁移 apply <strong>{productionFirstStageExecutionAction.result.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                        <span>恢复重置 <strong>{productionFirstStageExecutionAction.result.summary.restoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                        <span>业务数据 <strong>{productionFirstStageExecutionAction.result.summary.businessDataMutated ? "已改动" : "未改动"}</strong></span>
                        <span>候选刷新 <strong>{productionFirstStageExecutionAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionFirstStageExecutionAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>{productionFirstStageExecutionAction.result.serverConfigGuidance.label || "第一阶段执行边界"}</strong>
                          <p>
                            输入 {productionFirstStageExecutionAction.result.serverConfigGuidance.primaryInput || "production env setup latest"}
                            ；前端传路径 {productionFirstStageExecutionAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}
                          </p>
                          <div className="v1-action-meta">
                            <span>默认迁移 apply {productionFirstStageExecutionAction.result.serverConfigGuidance.applyMigrationsByDefault ? "是" : "否"}</span>
                            <span>默认恢复重置 {productionFirstStageExecutionAction.result.serverConfigGuidance.restoreResetAllowedByDefault ? "允许" : "不允许"}</span>
                            <span>runtime smoke API {productionFirstStageExecutionAction.result.serverConfigGuidance.runtimeSmokeApiBaseUrlAcceptedFromFrontend ? "前端可传" : "当前请求"}</span>
                            <span>真实值片段输入 {productionFirstStageExecutionAction.result.serverConfigGuidance.productionEnvValuesFileAccepted ? "接受" : "不接受"}</span>
                            <span>路径暴露 {productionFirstStageExecutionAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          <ul>
                            {productionFirstStageExecutionAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageExecutionAction.result.blockingItems.length || productionFirstStageExecutionAction.result.blockingStages.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageExecutionAction.result.blockingItems, ...productionFirstStageExecutionAction.result.blockingStages].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageExecutionAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageValuesDryRunAction.result || productionFirstStageValuesDryRunAction.error ? (
                <div className="v1-production-first-stage-dry-run-live-result">
                  {productionFirstStageValuesDryRunAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageValuesDryRunAction.result.ready
                              ? "success"
                              : productionFirstStageValuesDryRunAction.result.status === "not_configured"
                                ? "warning"
                                : productionFirstStageValuesDryRunAction.result.status === "error"
                                  ? "danger"
                                  : "warning"
                          }
                        >
                          {productionFirstStageValuesDryRunAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近真实值 dry-run</strong>
                      </div>
                      <p>{productionFirstStageValuesDryRunAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>真实值片段 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>配置来源 <strong>{productionFirstStageValuesDryRunAction.result.summary.selectedEnvVariable || "未配置"}</strong></span>
                        <span>目标 setup <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                        <span>setup 报告 <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                        <span>目标 env 文件 <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupEnvFileCount} 个</strong></span>
                        <span>片段审计 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditReady ? "通过" : productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                        <span>审计阻塞 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditBlockingCount} 项</strong></span>
                        <span>最小补值 <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.minimumBlockingLabel}</strong></span>
                        <span>dry-run 证明 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofReady ? "通过" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                        <span>片段指纹 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                        <span>指纹摘要暴露 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                        <span>dry-run 时效 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofFresh ? "有效" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                        <span>dry-run 有效期 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMaxAgeHours ? `${productionFirstStageValuesDryRunAction.result.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                        <span>dry-run 失效 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                        <span>dry-run 剩余 <strong>{Number.isFinite(productionFirstStageValuesDryRunAction.result.summary.dryRunProofRemainingHours) ? `${productionFirstStageValuesDryRunAction.result.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                        <span>dry-run 最小补值 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                        <span>dry-run 缺 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMinimumBlockingMissingCount} 项</strong></span>
                        <span>预计 env <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.envPreflightLabel}</strong></span>
                        <span>预计 intake <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.intakeLabel}</strong></span>
                        <span>目标 env 写入 <strong>{productionFirstStageValuesDryRunAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionFirstStageValuesDryRunAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                      </div>
                      {productionFirstStageValuesDryRunAction.result.serverConfigGuidance?.primaryEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>真实值片段服务端配置</strong>
                          <p>
                            主变量 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.primaryEnvVariable}
                            {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.fallbackEnvVariables.length
                              ? `；fallback ${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.fallbackEnvVariables.join(" / ")}`
                              : ""}
                          </p>
                          <div className="v1-action-meta">
                            <span>
                              当前来源{" "}
                              {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariable
                                ? `${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariableLabel || "变量"} ${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>已配置来源 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>前端传路径 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                            <span>目标 setup {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupReady ? "已就绪" : "未就绪"}</span>
                            <span>setup 报告 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupReportAvailable ? "有" : "无"}</span>
                            <span>目标 env 文件 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupEnvFileCount || 0} 个</span>
                            <span>片段审计 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditReady ? "通过" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditExecuted ? "未通过" : "未执行"}</span>
                            <span>审计阻塞 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditBlockingCount || 0} 项</span>
                            <span>dry-run 证明 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofReady ? "通过" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofStatusLabel || "未生成"}</span>
                            <span>dry-run 时效 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofFresh ? "有效" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofFreshnessLabel || "未生成"}</span>
                            <span>dry-run 最小补值 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofMinimumBlockingLabel || "未生成"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionFirstStageValuesDryRunAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageValuesDryRunAction.result.blockingItems.length || productionFirstStageValuesDryRunAction.result.blockingStages.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageValuesDryRunAction.result.blockingItems, ...productionFirstStageValuesDryRunAction.result.blockingStages].slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageValuesDryRunAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageValuesApplyAction.result || productionFirstStageValuesApplyAction.error ? (
                <div className="v1-production-first-stage-apply-live-result">
                  {productionFirstStageValuesApplyAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageValuesApplyAction.result.ready
                              ? "success"
                              : productionFirstStageValuesApplyAction.result.status === "disabled" ||
                                  productionFirstStageValuesApplyAction.result.status === "not_configured"
                                ? "warning"
                                : productionFirstStageValuesApplyAction.result.status === "error"
                                  ? "danger"
                                  : productionFirstStageValuesApplyAction.result.summary.productionEnvFileMutated
                                    ? "warning"
                                    : "danger"
                          }
                        >
                          {productionFirstStageValuesApplyAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近正式合并真实值</strong>
                      </div>
                      <p>{productionFirstStageValuesApplyAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>正式开关 <strong>{productionFirstStageValuesApplyAction.result.summary.applyEnabled ? "已启用" : "未启用"}</strong></span>
                        <span>真实值片段 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>配置来源 <strong>{productionFirstStageValuesApplyAction.result.summary.selectedEnvVariable || "未配置"}</strong></span>
                        <span>写入变量 <strong>{productionFirstStageValuesApplyAction.result.summary.appliedVariableCount}</strong></span>
                        <span>目标 env 写入 <strong>{productionFirstStageValuesApplyAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>目标 env 变更 <strong>{productionFirstStageValuesApplyAction.result.summary.targetEnvChanged ? "是" : "否"}</strong></span>
                        <span>目标 setup <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                        <span>setup 报告 <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                        <span>目标 env 文件 <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupEnvFileCount} 个</strong></span>
                        <span>片段审计 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFileAuditReady ? "通过" : productionFirstStageValuesApplyAction.result.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                        <span>审计阻塞 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFileAuditBlockingCount} 项</strong></span>
                        <span>dry-run 证明 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofReady ? "通过" : productionFirstStageValuesApplyAction.result.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                        <span>片段指纹 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                        <span>指纹摘要暴露 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                        <span>dry-run 时效 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofFresh ? "有效" : productionFirstStageValuesApplyAction.result.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                        <span>dry-run 有效期 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofMaxAgeHours ? `${productionFirstStageValuesApplyAction.result.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                        <span>dry-run 失效 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                        <span>dry-run 剩余 <strong>{Number.isFinite(productionFirstStageValuesApplyAction.result.summary.dryRunProofRemainingHours) ? `${productionFirstStageValuesApplyAction.result.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                        <span>dry-run 最小补值 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                        <span>setup <strong>{productionFirstStageValuesApplyAction.result.summary.setupReady ? "通过" : "未通过"}</strong></span>
                        <span>env 预检 <strong>{productionFirstStageValuesApplyAction.result.summary.envPreflightLabel}</strong></span>
                        <span>intake 阻塞 <strong>{productionFirstStageValuesApplyAction.result.summary.intakeVerificationBlockingCount} 项</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFilePathExposed || productionFirstStageValuesApplyAction.result.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionFirstStageValuesApplyAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>迁移 apply <strong>{productionFirstStageValuesApplyAction.result.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                      </div>
                      {productionFirstStageValuesApplyAction.result.serverConfigGuidance?.applyEnableEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>正式合并服务端配置</strong>
                          <p>
                            开关 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.applyEnableEnvVariable}
                            ；真实值变量 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.primaryEnvVariable}
                          </p>
                          <div className="v1-action-meta">
                            <span>开关 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.applyEnabled ? "已启用" : "未启用"}</span>
                            <span>已配置来源 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>目标 setup {productionFirstStageValuesApplyAction.result.serverConfigGuidance.targetSetupReady ? "已就绪" : "未就绪"}</span>
                            <span>setup 报告 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.targetSetupReportAvailable ? "有" : "无"}</span>
                            <span>片段审计 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditReady ? "通过" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditExecuted ? "未通过" : "未执行"}</span>
                            <span>审计阻塞 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditBlockingCount || 0} 项</span>
                            <span>dry-run 证明 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofReady ? "通过" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofStatusLabel || "未生成"}</span>
                            <span>dry-run 时效 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofFresh ? "有效" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofFreshnessLabel || "未生成"}</span>
                            <span>dry-run 最小补值 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofMinimumBlockingLabel || "未生成"}</span>
                            <span>前端传路径 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionFirstStageValuesApplyAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionFirstStageValuesApplyAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageValuesApplyAction.result.blockingItems.length || productionFirstStageValuesApplyAction.result.blockingFindings.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageValuesApplyAction.result.blockingItems, ...productionFirstStageValuesApplyAction.result.blockingFindings].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageValuesApplyAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageExecution.blockingStages.length ? (
                <div className="v1-production-first-stage-blockers">
                  {productionFirstStageExecution.blockingStages.slice(0, 5).map((stage) => (
                    <div className="v1-production-env-gate-row" key={stage.key || stage.label}>
                      <div>
                        <StatusPill tone={stage.status === "blocked" || stage.status === "error" ? "danger" : "warning"}>
                          {stage.statusLabel}
                        </StatusPill>
                        <strong>{stage.label}</strong>
                      </div>
                      <p>{stage.detail || stage.evidence.summaryLabel}</p>
                      <div className="v1-production-env-gate-meta">
                        {stage.evidence.summaryLabel ? <span>{stage.evidence.summaryLabel}</span> : null}
                        {stage.evidence.blockingCount ? <span>阻塞 {stage.evidence.blockingCount} 项</span> : null}
                        {stage.evidence.warningCount ? <span>警告 {stage.evidence.warningCount} 项</span> : null}
                        <span>命令暴露 否</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {runtimeReadinessBlockers ? (
            <section className="detail-section" ref={runtimeReadinessSectionRef}>
              <div className="v1-section-title-row">
                <h3>运行时门禁阻塞</h3>
                <div className="v1-section-title-actions">
                  <button className="ghost-button" type="button" onClick={onPrecheckV1Persistence} disabled={!onPrecheckV1Persistence || persistencePrecheckAction.loading}>
                    {persistencePrecheckAction.loading ? "预检中" : "持久化预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1AttachmentRetention} disabled={!onPrecheckV1AttachmentRetention || attachmentRetentionPrecheckAction.loading}>
                    {attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1PrintSpool} disabled={!onPrecheckV1PrintSpool || printSpoolPrecheckAction.loading}>
                    {printSpoolPrecheckAction.loading ? "预检中" : "spool 预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1PrintCups} disabled={!onPrecheckV1PrintCups || printCupsPrecheckAction.loading}>
                    {printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1PrintReadiness} disabled={!onPrecheckV1PrintReadiness || printReadinessPrecheckAction.loading}>
                    {printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1DriverReadiness} disabled={!onPrecheckV1DriverReadiness || driverReadinessPrecheckAction.loading}>
                    {driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckRuntimeReadiness} disabled={!onPrecheckRuntimeReadiness || runtimeReadinessPrecheckAction.loading}>
                    {runtimeReadinessPrecheckAction.loading ? "预检中" : "当前预检"}
                  </button>
                </div>
              </div>
              <div className="v1-runtime-readiness-summary">
                <span>通过 <strong>{runtimeReadinessBlockers.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{runtimeReadinessBlockers.summary.blockingLabel}</strong></span>
                <span>显示 <strong>{runtimeReadinessBlockers.summary.shownBlockingLabel}</strong></span>
              </div>
              {runtimeReadinessPrecheckAction.result || runtimeReadinessPrecheckAction.error ? (
                <div className="v1-runtime-readiness-live-result">
                  {runtimeReadinessPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={runtimeReadinessPrecheckAction.result.ready ? "success" : "warning"}>
                          {runtimeReadinessPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近运行时预检</strong>
                      </div>
                      <p>{runtimeReadinessPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{runtimeReadinessPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{runtimeReadinessPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{runtimeReadinessPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>不出纸 <strong>{runtimeReadinessPrecheckAction.result.summary.nonPrinting ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{runtimeReadinessPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {runtimeReadinessPrecheckAction.result.blockingCriteria.length ? (
                        <div className="v1-runtime-readiness-live-blockers">
                          {runtimeReadinessPrecheckAction.result.blockingCriteria.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{runtimeReadinessPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {attachmentRetentionPrecheckAction.result || attachmentRetentionPrecheckAction.error ? (
                <div className="v1-attachment-retention-live-result">
                  {attachmentRetentionPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={attachmentRetentionPrecheckAction.result.ready ? "success" : "warning"}>
                          {attachmentRetentionPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近附件留档预检</strong>
                      </div>
                      <p>{attachmentRetentionPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{attachmentRetentionPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{attachmentRetentionPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>存储 <strong>{attachmentRetentionPrecheckAction.result.summary.storageKindLabel}</strong></span>
                        <span>对象存储 <strong>{attachmentRetentionPrecheckAction.result.summary.objectStorageLive ? "是" : "否"}</strong></span>
                        <span>诊断读写 <strong>{attachmentRetentionPrecheckAction.result.summary.diagnosticReady ? "是" : "否"}</strong></span>
                        <span>清理 <strong>{attachmentRetentionPrecheckAction.result.summary.diagnosticObjectCleanedUp ? "是" : "否"}</strong></span>
                        <span>本地批准 <strong>{attachmentRetentionPrecheckAction.result.summary.localFsAcceptedForV1 ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{attachmentRetentionPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {attachmentRetentionPrecheckAction.result.blockingCriteria.length ? (
                        <div className="v1-attachment-retention-live-blockers">
                          {attachmentRetentionPrecheckAction.result.blockingCriteria.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>写入 {attachmentRetentionPrecheckAction.result.diagnostics.writeOk ? "是" : "否"}</span>
                        <span>读回 {attachmentRetentionPrecheckAction.result.diagnostics.readOk ? "是" : "否"}</span>
                        <span>摘要 {attachmentRetentionPrecheckAction.result.diagnostics.digestOk ? "是" : "否"}</span>
                        <span>缺配置 {attachmentRetentionPrecheckAction.result.diagnostics.missingConfigFields.length} 项</span>
                      </div>
                    </>
                  ) : (
                    <p>{attachmentRetentionPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {printSpoolPrecheckAction.result || printSpoolPrecheckAction.error ? (
                <div className="v1-print-spool-live-result">
                  {printSpoolPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={printSpoolPrecheckAction.result.ready ? "success" : "warning"}>
                          {printSpoolPrecheckAction.result.ready ? "已通过" : "仍未通过"}
                        </StatusPill>
                        <strong>最近 spool 预检</strong>
                      </div>
                      <p>只检查命令桥 spool 写入、状态回读和清理；不创建业务打印作业，不调用物理打印机。</p>
                      <div className="v1-field-intake-summary">
                        <span>不出纸 <strong>{printSpoolPrecheckAction.result.safeguards.nonPrinting ? "是" : "否"}</strong></span>
                        <span>写入 <strong>{printSpoolPrecheckAction.result.writeOk ? "是" : "否"}</strong></span>
                        <span>待打回读 <strong>{printSpoolPrecheckAction.result.pendingPollOk ? "是" : "否"}</strong></span>
                        <span>完成回读 <strong>{printSpoolPrecheckAction.result.completedPollOk ? "是" : "否"}</strong></span>
                        <span>清理 <strong>{printSpoolPrecheckAction.result.cleanupOk ? "是" : "否"}</strong></span>
                        <span>物理打印 <strong>{printSpoolPrecheckAction.result.safeguards.physicalPrinterCalled ? "是" : "否"}</strong></span>
                      </div>
                      {printSpoolPrecheckAction.result.blockers.length ? (
                        <div className="v1-print-spool-live-blockers">
                          {printSpoolPrecheckAction.result.blockers.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>模式 {printSpoolPrecheckAction.result.mode || "unknown"}</span>
                        <span>存储 {printSpoolPrecheckAction.result.storageKind || "unknown"}</span>
                        <span>缺配置 {printSpoolPrecheckAction.result.missingConfigFields.length} 项</span>
                      </div>
                    </>
                  ) : (
                    <p>{printSpoolPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {printCupsPrecheckAction.result || printCupsPrecheckAction.error ? (
                <div className="v1-print-cups-live-result">
                  {printCupsPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={printCupsPrecheckAction.result.ready ? "success" : "warning"}>
                          {printCupsPrecheckAction.result.ready ? "已通过" : "仍未通过"}
                        </StatusPill>
                        <strong>最近 CUPS 预检</strong>
                      </div>
                      <p>只检查 CUPS 队列状态命令和白名单；不生成打印文件，不调用物理打印机。</p>
                      <div className="v1-field-intake-summary">
                        <span>不出纸 <strong>{printCupsPrecheckAction.result.safeguards.nonPrinting ? "是" : "否"}</strong></span>
                        <span>队列配置 <strong>{printCupsPrecheckAction.result.cupsPrinterConfigured ? "是" : "否"}</strong></span>
                        <span>白名单 <strong>{printCupsPrecheckAction.result.cupsPrinterAllowed ? "是" : "否"}</strong></span>
                        <span>状态命令 <strong>{printCupsPrecheckAction.result.cupsStatusCommandConfigured ? "是" : "否"}</strong></span>
                        <span>命令可执行 <strong>{printCupsPrecheckAction.result.cupsStatusCommandRunnable ? "是" : "否"}</strong></span>
                        <span>物理打印 <strong>{printCupsPrecheckAction.result.safeguards.physicalPrinterCalled ? "是" : "否"}</strong></span>
                      </div>
                      {printCupsPrecheckAction.result.blockers.length ? (
                        <div className="v1-print-cups-live-blockers">
                          {printCupsPrecheckAction.result.blockers.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>模式 {printCupsPrecheckAction.result.preflightResult?.mode || "unknown"}</span>
                        <span>适配器 {printCupsPrecheckAction.result.configuration.systemPrinterAdapterKind || "unknown"}</span>
                        <span>允许设备 {printCupsPrecheckAction.result.configuration.allowedPrinterCount}</span>
                        <span>stdout 暴露 {printCupsPrecheckAction.result.safeguards.stdoutExposed ? "是" : "否"}</span>
                        <span>stderr 暴露 {printCupsPrecheckAction.result.safeguards.stderrExposed ? "是" : "否"}</span>
                      </div>
                    </>
                  ) : (
                    <p>{printCupsPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {printReadinessPrecheckAction.result || printReadinessPrecheckAction.error ? (
                <div className="v1-print-readiness-live-result">
                  {printReadinessPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={printReadinessPrecheckAction.result.ready ? "success" : "warning"}>
                          {printReadinessPrecheckAction.result.ready ? "已通过" : "仍未通过"}
                        </StatusPill>
                        <strong>最近打印门禁预检</strong>
                      </div>
                      <p>只读取当前 V1 打印上线门禁、spool / CUPS 诊断和设备 QA 摘要；不生成打印文件，不调用物理打印机。</p>
                      <div className="v1-field-intake-summary">
                        <span>通过 <strong>{printReadinessPrecheckAction.result.summary.label}</strong></span>
                        <span>阻塞 <strong>{printReadinessPrecheckAction.result.summary.blockingCount} 项</strong></span>
                        <span>门禁项 <strong>{printReadinessPrecheckAction.result.criteria.length}</strong></span>
                        <span>必需设备 <strong>{printReadinessPrecheckAction.result.deviceReadiness.filter((item) => item.ready).length}/{printReadinessPrecheckAction.result.deviceReadiness.length}</strong></span>
                        <span>spool <strong>{printReadinessPrecheckAction.result.spoolDiagnostics.ready ? "通过" : "阻塞"}</strong></span>
                        <span>CUPS <strong>{printReadinessPrecheckAction.result.cupsDiagnostics.ready ? "通过" : "阻塞"}</strong></span>
                        <span>不出纸 <strong>{printReadinessPrecheckAction.result.safeguards.nonPrinting ? "是" : "否"}</strong></span>
                        <span>物理打印 <strong>{printReadinessPrecheckAction.result.safeguards.physicalPrinterCalled ? "是" : "否"}</strong></span>
                      </div>
                      {printReadinessPrecheckAction.result.criteria.filter((item) => item.blocking && item.status !== "passed").length ? (
                        <div className="v1-print-readiness-live-blockers">
                          {printReadinessPrecheckAction.result.criteria
                            .filter((item) => item.blocking && item.status !== "passed")
                            .slice(0, 4)
                            .map((item) => (
                              <p key={item.key || item.label}>
                                {item.label}：{item.detail}
                              </p>
                            ))}
                        </div>
                      ) : null}
                      {printReadinessPrecheckAction.result.remainingV1Risks.length ? (
                        <div className="v1-print-readiness-live-blockers">
                          {printReadinessPrecheckAction.result.remainingV1Risks.slice(0, 2).map((risk) => (
                            <p key={risk}>剩余风险：{risk}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>单据类型 {printReadinessPrecheckAction.result.requiredDocumentTypes.length}</span>
                        <span>命令值暴露 {printReadinessPrecheckAction.result.safeguards.commandValueExposed ? "是" : "否"}</span>
                        <span>参数暴露 {printReadinessPrecheckAction.result.safeguards.commandArgsExposed ? "是" : "否"}</span>
                        <span>spool 路径暴露 {printReadinessPrecheckAction.result.safeguards.spoolPathExposed ? "是" : "否"}</span>
                        <span>payload 暴露 {printReadinessPrecheckAction.result.safeguards.payloadExposed ? "是" : "否"}</span>
                      </div>
                    </>
                  ) : (
                    <p>{printReadinessPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {driverReadinessPrecheckAction.result || driverReadinessPrecheckAction.error ? (
                <div className="v1-driver-readiness-live-result">
                  {driverReadinessPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={driverReadinessPrecheckAction.result.ready ? "success" : "warning"}>
                          {driverReadinessPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近司机真机预检</strong>
                      </div>
                      <p>只读取司机端 V1 真机门禁、现场验收摘要、原生桥接和纸质包裹标签扫码样本；不改送货状态，不调用摄像头、扫码或导航。</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{driverReadinessPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{driverReadinessPrecheckAction.result.summary.readinessLabel}</strong></span>
                        <span>阻塞 <strong>{driverReadinessPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>任务读取 <strong>{driverReadinessPrecheckAction.result.summary.deliveryTaskCount} 条</strong></span>
                        <span>现场验收 <strong>{driverReadinessPrecheckAction.result.summary.fieldTestRecordAvailable ? driverReadinessPrecheckAction.result.summary.fieldTestLabel : "未记录"}</strong></span>
                        <span>原生能力 <strong>{driverReadinessPrecheckAction.result.summary.nativeSupportedLabel}</strong></span>
                        <span>标签扫码 <strong>{driverReadinessPrecheckAction.result.summary.packageLabelScanMatched ? "已匹配" : "未匹配"}</strong></span>
                        <span>原生扫码 <strong>{driverReadinessPrecheckAction.result.summary.packageLabelScanNative ? "是" : "否"}</strong></span>
                      </div>
                      {driverReadinessPrecheckAction.result.blockingCriteria.length ? (
                        <div className="v1-driver-readiness-live-blockers">
                          {driverReadinessPrecheckAction.result.blockingCriteria.slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {driverReadinessPrecheckAction.result.remainingV1Risks.length ? (
                        <div className="v1-driver-readiness-live-blockers">
                          {driverReadinessPrecheckAction.result.remainingV1Risks.slice(0, 2).map((risk) => (
                            <p key={risk}>剩余风险：{risk}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>司机验收账号 {driverReadinessPrecheckAction.result.driverOperatorId || "未返回"}</span>
                        <span>送货状态变更 {driverReadinessPrecheckAction.result.safeguards.deliveryTaskStatusChanged ? "是" : "否"}</span>
                        <span>调用摄像头 {driverReadinessPrecheckAction.result.safeguards.cameraPermissionRequested ? "是" : "否"}</span>
                        <span>调用导航 {driverReadinessPrecheckAction.result.safeguards.navigationAppOpened ? "是" : "否"}</span>
                        <span>调用原生桥 {driverReadinessPrecheckAction.result.safeguards.nativeBridgeInvoked ? "是" : "否"}</span>
                        <span>payload 暴露 {driverReadinessPrecheckAction.result.safeguards.payloadExposed ? "是" : "否"}</span>
                      </div>
                    </>
                  ) : (
                    <p>{driverReadinessPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {persistencePrecheckAction.result || persistencePrecheckAction.error ? (
                <div className="v1-persistence-live-result">
                  {persistencePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={persistencePrecheckAction.result.ready ? "success" : "warning"}>
                          {persistencePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近持久化预检</strong>
                      </div>
                      <p>{persistencePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{persistencePrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{persistencePrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>仓储组 <strong>{persistencePrecheckAction.result.summary.repositoryGroupLabel}</strong></span>
                        <span>生产仓储 <strong>{persistencePrecheckAction.result.summary.repositoryLabel}</strong></span>
                        <span>本地仓储 <strong>{persistencePrecheckAction.result.summary.localRepositoryLabel}</strong></span>
                        <span>本地接受 <strong>{persistencePrecheckAction.result.summary.localPersistenceAcceptedForV1 ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{persistencePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {persistencePrecheckAction.result.repositoryGroups.length ? (
                        <div className="v1-persistence-group-list">
                          {persistencePrecheckAction.result.repositoryGroups.slice(0, 5).map((group) => (
                            <div className="v1-persistence-group-row" key={group.key || group.label}>
                              <div>
                                <StatusPill tone={group.ready ? "success" : "danger"}>{group.statusLabel}</StatusPill>
                                <strong>{group.label}</strong>
                              </div>
                              <p>{group.nextAction}</p>
                              <div className="v1-runtime-readiness-meta">
                                <span>生产仓储 {group.repositoryLabel}</span>
                                <span>本地 {group.localRepositoryLabel}</span>
                                <span>内存 {group.localMemoryCount} / JSON {group.localJsonCount} / 文件 {group.localFsCount}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{persistencePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-runtime-readiness-list">
                {runtimeReadinessBlockers.blockers.map((item) => {
                  const blockerActions = buildRuntimeReadinessBlockerActions(item);
                  return (
                    <div className="v1-runtime-readiness-row" key={item.key}>
                      <div>
                        <StatusPill tone={item.ready ? "success" : "danger"}>{item.statusLabel}</StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.detail}</p>
                      <div className="v1-runtime-readiness-meta">
                        <span>{item.group}</span>
                        <span>{item.ownerRole}</span>
                        <span>{item.nextAction}</span>
                      </div>
                      {blockerActions.length ? (
                        <div className="v1-runtime-readiness-actions">
                          {blockerActions.map((action) => (
                            <button
                              className="ghost-button"
                              type="button"
                              key={action.key}
                              onClick={action.onClick}
                              disabled={action.disabled}
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
              <p className="v1-runtime-readiness-note">{runtimeReadinessBlockers.nextAction}</p>
            </section>
          ) : null}
          {fieldAcceptanceReport ? (
            <section className="detail-section" ref={fieldAcceptanceReportRef}>
              <h3>现场验收报告</h3>
              <div className="v1-field-acceptance-summary">
                <span>通过 <strong>{fieldAcceptanceReport.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{fieldAcceptanceReport.summary.blockingLabel}</strong></span>
                <span>显示 <strong>{fieldAcceptanceReport.summary.shownBlockingLabel}</strong></span>
              </div>
              <p className="v1-field-acceptance-conclusion">{fieldAcceptanceReport.conclusion}</p>
              <div className="v1-field-acceptance-module-list">
                {fieldAcceptanceReport.modules.map((item) => (
                  <div className="v1-field-acceptance-module-row" key={item.key}>
                    <div>
                      <StatusPill tone={item.ready ? "success" : "danger"}>{item.statusLabel}</StatusPill>
                      <strong>{item.label}</strong>
                    </div>
                    <p>{item.detail}</p>
                    {item.evidence.length ? (
                      <div className="v1-field-acceptance-evidence">
                        {item.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="v1-field-acceptance-blocker-list">
                {fieldAcceptanceReport.blockingCriteria.map((item) => (
                  <div className="v1-field-acceptance-blocker-row" key={item.key}>
                    <div>
                      <StatusPill tone={item.blocking ? "danger" : "warning"}>{item.statusLabel}</StatusPill>
                      <strong>{item.label}</strong>
                    </div>
                    <p>{item.detail}</p>
                    <div className="v1-field-acceptance-meta">
                      <span>{item.nextAction}</span>
                    </div>
                  </div>
                ))}
              </div>
              {fieldAcceptanceReport.requiredFieldEvidence.length ? (
                <div className="v1-field-acceptance-required">
                  <strong>现场必须留档</strong>
                  <div className="v1-field-acceptance-required-list">
                    {fieldAcceptanceReport.requiredFieldEvidence.map((item) => (
                      <div className="v1-field-acceptance-required-row" key={item.key}>
                        <span>{item.label}<strong>{item.requiredLabel}</strong></span>
                        {item.required.slice(0, 2).map((text) => <p key={text}>{text}</p>)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          {roleTaskBoard ? (
            <section className="detail-section">
              <h3>角色现场任务</h3>
              <div className="v1-role-task-summary">
                <span>任务 <strong>{roleTaskBoard.summary.taskCountLabel}</strong></span>
                <span>角色 <strong>{roleTaskBoard.summary.roleCountLabel}</strong></span>
                <span>发布门禁 <strong>{roleTaskBoard.summary.releaseTaskCount} 项</strong></span>
                <span>现场证据 <strong>{roleTaskBoard.summary.evidenceTaskCount} 项</strong></span>
                <span>签字/边界 <strong>{roleTaskBoard.summary.signoffTaskCount + roleTaskBoard.summary.boundaryTaskCount} 项</strong></span>
              </div>
              {roleTaskCategorySummaries.length ? (
                <div className="v1-role-category-grid">
                  {roleTaskCategorySummaries.map((category) => (
                    <div className="v1-role-category-card" data-role-task-category={category.key} key={category.key}>
                      <div className="v1-role-category-head">
                        <div>
                          <StatusPill tone={category.tone}>{category.title}</StatusPill>
                          <strong>{category.countLabel}</strong>
                        </div>
                        <span>{category.statusLabel}</span>
                      </div>
                      <p>{category.description}</p>
                      {category.firstTasks.length ? (
                        <div className="v1-role-category-preview">
                          {category.firstTasks.slice(0, 2).map((task) => (
                            <span key={`${category.key}-${task.id}`}>{task.title}</span>
                          ))}
                        </div>
                      ) : null}
                      {category.actions.length ? (
                        <div className="v1-role-category-actions">
                          {category.actions.map((action) => (
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
                  ))}
                </div>
              ) : null}
              {roleTaskBoard.firstActions?.length ? (
                <div className="v1-role-first-actions">
                  <div className="v1-role-first-actions-head">
                    <strong>首批现场动作</strong>
                    <span>显示 {roleTaskBoard.firstActions.length}/{roleTaskBoard.summary.taskCount}</span>
                  </div>
                  <div className="v1-role-first-action-list">
                    {roleTaskBoard.firstActions.map((task) => {
                      const taskActions = buildRoleTaskQuickActions(task);
                      return (
                        <div className="v1-role-first-action-row" key={task.id}>
                          <div>
                            <StatusPill tone={task.type === "发布门禁" ? "danger" : task.type.includes("签字") || task.type.includes("边界") ? "warning" : "blue"}>
                              {task.type || "待办"}
                            </StatusPill>
                            <strong>{task.title}</strong>
                          </div>
                          <p>{task.group} / {task.action}</p>
                          <div className="v1-role-task-meta">
                            <span>{task.priority || "P0"}</span>
                            <span>{task.primaryRole || task.roles?.[0] || "待分派"}</span>
                            <span>{task.status || "pending"}</span>
                          </div>
                          {taskActions.length ? (
                            <div className="v1-role-first-action-buttons">
                              {taskActions.map((action) => (
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
                </div>
              ) : null}
              <div className="v1-role-task-list">
                {roleTaskBoard.roles.map((role) => (
                  <div className="v1-role-task-row" key={role.role}>
                    <div className="v1-role-task-head">
                      <strong>{role.role}</strong>
                      <span>显示 {role.tasks.length}/{role.taskCount} 项</span>
                    </div>
                    <div className="v1-role-task-meta">
                      <span>门禁 {role.releaseTaskCount}</span>
                      <span>证据 {role.evidenceTaskCount}</span>
                      <span>签字 {role.signoffTaskCount}</span>
                      <span>边界 {role.boundaryTaskCount}</span>
                    </div>
                    <div className="v1-role-task-items">
                      {role.tasks.slice(0, 4).map((task) => (
                        <div className="v1-role-task-item" key={`${role.role}-${task.id}`}>
                          <StatusPill tone={task.type === "发布门禁" ? "danger" : task.type.includes("签字") ? "warning" : "blue"}>
                            {task.type || "待办"}
                          </StatusPill>
                          <div>
                            <strong>{task.title}</strong>
                            <p>{task.group} / {task.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {role.taskCount > role.tasks.length ? (
                      <p className="v1-role-task-more">
                        还有 {role.taskCount - role.tasks.length} 项在交接包角色任务文件中，先处理上方首批现场动作和本角色预览。
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {fieldEvidenceProgress ? (
            <section className="detail-section" ref={fieldEvidenceProgressRef}>
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
          {v1V2BoundaryBrief ? (
            <section className="detail-section" ref={v1V2BoundaryBriefRef}>
              <div className="v1-section-title-row">
                <h3>V1/V2 边界</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onRefreshV1V2ScopeBrief}
                    disabled={!onRefreshV1V2ScopeBrief || v1V2ScopeBriefRefreshAction.loading || v1V2BoundaryPrecheckAction.loading}
                  >
                    {v1V2ScopeBriefRefreshAction.loading ? "刷新中" : "刷新差异"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onPrecheckV1V2Boundary}
                    disabled={!onPrecheckV1V2Boundary || v1V2BoundaryPrecheckAction.loading || v1V2ScopeBriefRefreshAction.loading}
                  >
                    {v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检"}
                  </button>
                </div>
              </div>
              <p className="v1-v2-boundary-conclusion">{v1V2BoundaryBrief.conclusion}</p>
              <div className="v1-v2-boundary-summary">
                <span>V1 必做 <strong>{v1V2BoundaryBrief.summary.v1MustContinueLabel}</strong></span>
                <span>V2 分类 <strong>{v1V2BoundaryBrief.summary.v2CategoryLabel}</strong></span>
                <span>V2 差异 <strong>{v1V2BoundaryBrief.summary.v2DifferenceLabel}</strong></span>
                <span>模块 <strong>{v1V2BoundaryBrief.summary.moduleDifferenceLabel}</strong></span>
              </div>
              {v1V2ScopeBriefRefreshAction.result || v1V2ScopeBriefRefreshAction.error ? (
                <div className="v1-v2-boundary-precheck-result">
                  {v1V2ScopeBriefRefreshAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={v1V2ScopeBriefRefreshAction.result.ready ? "success" : "warning"}>
                          {v1V2ScopeBriefRefreshAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近差异刷新</strong>
                      </div>
                      <p>{v1V2ScopeBriefRefreshAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>V1 必做 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v1MustContinueLabel}</strong></span>
                        <span>V2 分类 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v2CategoryLabel}</strong></span>
                        <span>V2 差异 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v2DifferenceLabel}</strong></span>
                        <span>模块 <strong>{v1V2ScopeBriefRefreshAction.result.summary.moduleDifferenceLabel}</strong></span>
                        <span>摘要刷新 <strong>{v1V2ScopeBriefRefreshAction.result.summary.scopeBriefRefreshed ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{v1V2ScopeBriefRefreshAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                    </>
                  ) : (
                    <p>{v1V2ScopeBriefRefreshAction.error}</p>
                  )}
                </div>
              ) : null}
              {v1V2BoundaryPrecheckAction.result || v1V2BoundaryPrecheckAction.error ? (
                <div className="v1-v2-boundary-precheck-result">
                  {v1V2BoundaryPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={v1V2BoundaryPrecheckAction.result.ready ? "success" : "warning"}>
                          {v1V2BoundaryPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近边界预检</strong>
                      </div>
                      <p>{v1V2BoundaryPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>边界 <strong>{v1V2BoundaryPrecheckAction.result.summary.boundaryLabel}</strong></span>
                        <span>V1 必做 <strong>{v1V2BoundaryPrecheckAction.result.summary.v1MustContinueLabel}</strong></span>
                        <span>V2 差异 <strong>{v1V2BoundaryPrecheckAction.result.summary.v2DifferenceLabel}</strong></span>
                        <span>阻塞 <strong>{v1V2BoundaryPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>候选刷新 <strong>{v1V2BoundaryPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {v1V2BoundaryPrecheckAction.result.blockers.length ? (
                        <div className="v1-v2-boundary-precheck-blockers">
                          {v1V2BoundaryPrecheckAction.result.blockers.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{v1V2BoundaryPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-v2-boundary-grid">
                <div className="v1-v2-boundary-column">
                  <div className="v1-v2-list-head">
                    <strong>V1 必须继续完成</strong>
                    <span>{v1MustContinueItemsForPage.length}/{v1V2BoundaryBrief.v1MustContinue.length}</span>
                  </div>
                  <div className="v1-v2-boundary-list">
                    {v1MustContinueItemsForPage.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                  {v1V2BoundaryBrief.v1MustContinue.length > 4 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV1MustContinueItems((value) => !value)}>
                      {showAllV1MustContinueItems ? "收起 V1 必做" : "展开全部 V1 必做"}
                    </button>
                  ) : null}
                </div>
                <div className="v1-v2-boundary-column">
                  <div className="v1-v2-list-head">
                    <strong>计划 V2</strong>
                    <span>{v2BoundaryDifferencesForPage.length}/{v1V2BoundaryBrief.v2Differences.length}</span>
                  </div>
                  <div className="v1-v2-category-list">
                    {v1V2BoundaryBrief.v2Categories.map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <div className="v1-v2-boundary-list">
                    {v2BoundaryDifferencesForPage.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                  {v1V2BoundaryBrief.v2Differences.length > 5 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV2BoundaryDifferences((value) => !value)}>
                      {showAllV2BoundaryDifferences ? "收起 V2 差异" : "展开全部 V2 差异"}
                    </button>
                  ) : null}
                </div>
              </div>
              {v1V2BoundaryBrief.moduleDifferences.length ? (
                <div className="v1-v2-module-list">
                  <div className="v1-v2-list-head">
                    <strong>模块差异</strong>
                    <span>{v1V2ModuleDifferencesForPage.length}/{v1V2BoundaryBrief.moduleDifferences.length}</span>
                  </div>
                  {v1V2ModuleDifferencesForPage.map((item) => (
                    <div className="v1-v2-module-row" key={item.module}>
                      <strong>{item.module}</strong>
                      <span>V1：{item.v1}</span>
                      <span>V2：{item.v2}</span>
                    </div>
                  ))}
                  {v1V2BoundaryBrief.moduleDifferences.length > 5 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV1V2ModuleDifferences((value) => !value)}>
                      {showAllV1V2ModuleDifferences ? "收起模块差异" : "展开全部模块差异"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="v1-v2-owner-review">
                <strong>负责人复核</strong>
                <p>{v1V2BoundaryBrief.ownerReview.question}</p>
                <p>{v1V2BoundaryBrief.ownerReview.approvalRule}</p>
              </div>
            </section>
          ) : null}
          {productionEnvFixChecklist ? (
            <section className="detail-section" ref={productionEnvFixChecklistRef}>
              <h3>生产环境修正清单</h3>
              <div className="v1-env-fix-summary">
                <span>清单 <strong>{productionEnvFixChecklist.summary.itemCount} 项</strong></span>
                <span>阻塞 <strong>{productionEnvFixChecklist.summary.blockingCount} 项</strong></span>
                <span>警告 <strong>{productionEnvFixChecklist.summary.warningCount} 项</strong></span>
                <span>变量 <strong>{productionEnvFixChecklist.summary.configuredLabel}</strong></span>
              </div>
              <div className="v1-env-fix-list">
                <div className="v1-env-list-head">
                  <strong>修正项</strong>
                  <span>{productionEnvFixItemsForPage.length}/{productionEnvFixChecklist.items.length}</span>
                </div>
                {productionEnvFixItemsForPage.map((item) => {
                  const liveVariableCheckItem = getProductionEnvVariableCheckOverlayItemForPage(productionEnvVariableCheckOverlay, item);
                  const variableChecks = buildProductionEnvVariableChecksForPage(item, liveVariableCheckItem);
                  const variableCheckSourceLabel = liveVariableCheckItem?.sourceLabel || "交接包快照";
                  const variableCheckCountLabel = getProductionEnvVariableCheckCountLabelForPage(liveVariableCheckItem || item);
                  return (
                    <div className="v1-env-fix-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                        {productionEnvTemplateSectionIndexByLabel.has(item.label) ? (
                          <button className="ghost-button v1-env-template-locate-button" type="button" onClick={() => focusProductionEnvTemplateSection(item)}>
                            定位草稿段
                          </button>
                        ) : null}
                      </div>
                      <p>{item.nextAction}</p>
                      <div className="v1-env-fix-meta">
                        <span>{item.ownerRole}</span>
                        <span>{item.configuredVariableCount}/{item.totalVariableCount} 已配置</span>
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {!productionEnvTemplateSectionIndexByLabel.has(item.label) ? <span>无 env 草稿段</span> : null}
                      </div>
                      <div className="v1-env-variable-checks">
                        <div className="v1-env-variable-check-head">
                          <strong>变量检查</strong>
                          <span className={`v1-env-variable-check-source ${liveVariableCheckItem ? "live" : ""}`}>
                            {liveVariableCheckItem ? `最近预检：${variableCheckSourceLabel} ${variableCheckCountLabel}` : `来源：${variableCheckSourceLabel} ${variableCheckCountLabel}`}
                          </span>
                        </div>
                        <div className="v1-env-variable-check-list">
                          {variableChecks.length ? variableChecks.map((variable) => (
                            <span className={`v1-env-variable-chip ${variable.status}`} key={`${item.key || item.label}-${variable.name}`}>
                              <strong>{variable.statusLabel}</strong>
                              {variable.name}
                            </span>
                          )) : (
                            <span className="v1-env-variable-chip none">
                              <strong>无需填写</strong>
                              当前项没有待填写变量
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {productionEnvFixChecklist.items.length > 6 ? (
                  <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvFixItems((value) => !value)}>
                    {showAllProductionEnvFixItems ? "收起 env 修正项" : "展开全部 env 修正项"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
          {productionEnvMinimumValuesFragmentTemplate ? (
            <section className="detail-section v1-production-env-minimum-values-template" ref={productionEnvMinimumValuesFragmentTemplateRef}>
              <h3>最小真实值片段模板</h3>
              <div className="v1-env-template-summary">
                <span>变量 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.variableCount}</strong></span>
                <span>待填写 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.placeholderCount}</strong></span>
                <span>目标 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.targetLabel || "最小补值"}</strong></span>
                <span>阻塞段 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.blockingSectionCount}</strong></span>
                <span>写 env <strong>{productionEnvMinimumValuesFragmentTemplate.safeguards?.productionEnvFileMutated ? "是" : "否"}</strong></span>
                <span>浏览器值 <strong>{productionEnvMinimumValuesFragmentTemplate.safeguards?.browserEnvValuesAccepted ? "接收" : "不接收"}</strong></span>
              </div>
              <p className="v1-production-env-gate-note">
                只展示模板和占位符；真实 PostgreSQL、对象存储、打印命令、spool 路径和 token 仍必须填到安全未跟踪片段后再 dry-run。
              </p>
              <div className="v1-env-list-head">
                <strong>脱敏预览</strong>
                <span>{productionEnvMinimumTemplateLinesForPage.length}/{productionEnvMinimumTemplatePreviewLines.length}</span>
              </div>
              <pre className="v1-env-template-preview">
                {productionEnvMinimumTemplateLinesForPage.map((line, index) => {
                  const sectionLabel = getProductionEnvTemplateSectionLabel(line);
                  return (
                    <span
                      className={[
                        "v1-env-template-line",
                        sectionLabel ? "section" : "",
                      ].filter(Boolean).join(" ")}
                      key={`minimum-${index}-${line}`}
                    >
                      {line}
                    </span>
                  );
                })}
              </pre>
              {productionEnvMinimumTemplatePreviewLines.length > 34 ? (
                <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvMinimumTemplateLines((value) => !value)}>
                  {showAllProductionEnvMinimumTemplateLines ? "收起最小片段" : "展开完整最小片段"}
                </button>
              ) : null}
            </section>
          ) : null}
          {productionEnvFillTemplate ? (
            <section className="detail-section" ref={productionEnvFillTemplateRef}>
              <h3>安全 env 填写草稿</h3>
              <div className="v1-env-template-summary">
                <span>变量 <strong>{productionEnvFillTemplate.summary.variableCount}</strong></span>
                <span>待填写 <strong>{productionEnvFillTemplate.summary.placeholderCount}</strong></span>
                <span>阻塞段 <strong>{productionEnvFillTemplate.summary.blockingSectionCount}</strong></span>
                <span>警告段 <strong>{productionEnvFillTemplate.summary.warningSectionCount}</strong></span>
              </div>
              <div className="v1-env-list-head">
                <strong>脱敏预览</strong>
                <span>{productionEnvTemplateLinesForPage.length}/{productionEnvTemplatePreviewLines.length}</span>
              </div>
              <pre className="v1-env-template-preview" ref={productionEnvTemplatePreviewRef}>
                {productionEnvTemplateLinesForPage.map((line, index) => {
                  const sectionLabel = getProductionEnvTemplateSectionLabel(line);
                  const envLineIndex = index;
                  const isFocusedLine = focusedProductionEnvTemplateLineIndex === envLineIndex;
                  return (
                    <span
                      className={[
                        "v1-env-template-line",
                        sectionLabel ? "section" : "",
                        isFocusedLine ? "focused" : "",
                      ].filter(Boolean).join(" ")}
                      data-env-line-index={envLineIndex}
                      key={`${envLineIndex}-${index}-${line}`}
                    >
                      {line}
                    </span>
                  );
                })}
              </pre>
              {productionEnvTemplatePreviewLines.length > 36 ? (
                <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvTemplateLines((value) => !value)}>
                  {showAllProductionEnvTemplateLines ? "收起 env 草稿" : "展开完整 env 草稿"}
                </button>
              ) : null}
            </section>
          ) : null}
          <section className="detail-section">
            <h3>角色压力</h3>
            <div className="v1-role-buckets">
              {unblockPlan.roleBuckets.map(([role, count]) => (
                <span key={role}>{role}<strong>{count}</strong></span>
              ))}
            </div>
          </section>
          <section className="detail-section">
            <h3>主要未完成</h3>
            <p>{selectedModule.remaining}</p>
          </section>
          <section className="detail-section">
            <h3>当前最小阻塞</h3>
            <ul className="v1-blocker-list">
              {statusSummary.blockers.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section className="detail-section">
            <h3>计划 V2 差异</h3>
            <div className="v2-difference-list">
              {v2DifferenceItemsForPage.map(([label, text]) => (
                <div className="v2-difference-row" key={label}>
                  <strong>{label}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </section>
        </DetailPane>
      </section>
    </section>
  );
}
