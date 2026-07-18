import { useRef, useState } from "react";
import { DetailPane } from "../../components/ui.jsx";
import {
  V1StatusGateModulePanel,
  V1StatusHeader,
  V1StatusSectionTabs,
  V1StatusUnavailable,
  V1StatusWorkspaceTabs,
} from "./V1StatusOverview.jsx";
import { V1StatusDecisionWorkspace } from "./V1StatusDecisionWorkspace.jsx";
import { V1StatusBoundaryWorkspace } from "./V1StatusBoundaryWorkspace.jsx";
import { V1StatusFieldEvidenceWorkspace } from "./V1StatusFieldEvidenceWorkspace.jsx";
import { V1StatusFieldAcceptanceWorkspace } from "./V1StatusFieldAcceptanceWorkspace.jsx";
import { V1StatusModuleWorkspace } from "./V1StatusModuleWorkspace.jsx";
import { V1StatusProductionWorkspace } from "./V1StatusProductionWorkspace.jsx";
import { createV1StatusBlockerActionBuilders } from "./createV1StatusBlockerActionBuilders.js";
import { createV1StatusFieldRoleActionBuilders } from "./createV1StatusFieldRoleActionBuilders.js";
import { createV1StatusPhaseActionBuilders } from "./createV1StatusPhaseActionBuilders.js";
import { V1StatusRoleTaskWorkspace } from "./V1StatusRoleTaskWorkspace.jsx";
import { V1StatusRuntimeWorkspace } from "./V1StatusRuntimeWorkspace.jsx";
import { useV1StatusFieldEvidenceController } from "./useV1StatusFieldEvidenceController.js";
import {
  buildProductionEnvVariableCheckOverlayForPage,
  buildV1StatusSummaryForPage,
  formatV1StatusSnapshotTime,
  getProductionEnvTemplateSectionLabel,
  normalizeV1PhaseGroupForPage,
  normalizeV1PhaseTaskForPage,
  v1EvidenceStageStatusOptions,
  v1ModuleCompletionRows,
  v1StatusSnapshotMaxAgeMs,
  v1UnblockPlan,
  v2DifferenceItems,
} from "./v1StatusPresentation.js";

const v1StatusWorkspaceSections = {
  overview: [
    { key: "owner", label: "负责人结论" },
    { key: "audit", label: "完成审计" },
    { key: "phase", label: "当前阶段" },
  ],
  production: [
    { key: "env_gate", label: "配置门禁" },
    { key: "env_intake", label: "真实值校验" },
    { key: "first_stage", label: "第一阶段" },
    { key: "env_fix", label: "修正清单" },
    { key: "env_minimum", label: "最小模板" },
    { key: "env_draft", label: "安全草稿" },
  ],
  runtime: [
    { key: "runtime_gate", label: "运行门禁" },
    { key: "acceptance", label: "验收报告" },
  ],
  field: [
    { key: "role_tasks", label: "角色任务" },
    { key: "evidence", label: "证据与签字" },
  ],
  boundary: [{ key: "boundary", label: "V1/V2 边界" }],
  module: [
    { key: "module_pressure", label: "角色压力" },
    { key: "module_gaps", label: "主要未完成" },
    { key: "module_blockers", label: "当前阻塞" },
    { key: "module_v2", label: "V2 差异" },
  ],
};

function getDefaultV1StatusSection(view) {
  return v1StatusWorkspaceSections[view]?.[0]?.key ?? "owner";
}


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
  onOpenEmployeeImport,
}) {
  const [selectedModuleName, setSelectedModuleName] = useState("原材料 / 成本 / 毛利");
  const [selectedPhaseKey, setSelectedPhaseKey] = useState("production_environment");
  const [workspaceView, setWorkspaceView] = useState("overview");
  const [workspaceSection, setWorkspaceSection] = useState("owner");
  const [showAllV1MustContinueItems, setShowAllV1MustContinueItems] = useState(false);
  const [showAllV2BoundaryDifferences, setShowAllV2BoundaryDifferences] = useState(false);
  const [showAllV1V2ModuleDifferences, setShowAllV1V2ModuleDifferences] = useState(false);
  const [showAllProductionEnvFixItems, setShowAllProductionEnvFixItems] = useState(false);
  const [showAllProductionEnvTemplateLines, setShowAllProductionEnvTemplateLines] = useState(false);
  const [showAllProductionEnvMinimumTemplateLines, setShowAllProductionEnvMinimumTemplateLines] = useState(false);
  const [focusedProductionEnvTemplateLineIndex, setFocusedProductionEnvTemplateLineIndex] = useState(null);
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
  const d49Readiness = goLiveStatus?.d49Readiness?.available
    ? goLiveStatus.d49Readiness
    : null;
  const productionEnvMinimumBlockingItems = productionEnvIntakeVerification?.minimumBlockingItems ?? [];
  const productionFirstStageExecution = goLiveStatus?.productionFirstStageExecution?.available
    ? goLiveStatus.productionFirstStageExecution
    : null;
  const productionPersistenceEvidence = goLiveStatus?.productionPersistenceEvidence?.available
    ? goLiveStatus.productionPersistenceEvidence
    : null;
  const todoLoadPrecheck = goLiveStatus?.todoLoadPrecheck ?? null;
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
  const workspaceTitle = {
    overview: "V1 决策总览",
    production: "生产配置与持久化",
    runtime: "运行门禁与验收报告",
    field: "现场任务、证据与签字",
    boundary: "V1/V2 边界",
    module: selectedModule.module,
  }[workspaceView] ?? "V1 上线工作台";
  const workspaceSections = v1StatusWorkspaceSections[workspaceView] ?? [];
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
  const fieldEvidenceController = useV1StatusFieldEvidenceController({
    fieldEvidenceProgress,
    fieldEvidenceStageRowAction,
    fieldEvidenceAttachmentAction,
    fieldEvidenceAttachmentListAction,
    signoffBoundaryAttachmentAction,
    signoffBoundaryAttachmentListAction,
    v1V2BoundaryPrecheckAction,
    canReviewFieldEvidenceAfterStage,
    onStageFieldEvidenceRow,
    onUploadFieldEvidenceAttachment,
    onListFieldEvidenceAttachments,
    onUploadSignoffBoundaryAttachment,
    onListSignoffBoundaryAttachments,
    onValidateFieldEvidenceDraft,
    onPrecheckReleaseCandidateRefresh,
    onPrecheckV1V2Boundary,
    selectWorkspace,
  });
  const {
    activeStage: fieldEvidenceWorkspaceStage,
    setActiveStage: setFieldEvidenceWorkspaceStage,
    evidenceStageDraft,
    setEvidenceStageDraft,
    setEvidenceAttachmentFile,
    signoffStageDraft,
    setSignoffStageDraft,
    setSignoffBoundaryAttachmentFile,
    showAllMissingEvidenceItems,
    setShowAllMissingEvidenceItems,
    selectedMissingEvidenceGroupKey,
    setSelectedMissingEvidenceGroupKey,
    missingEvidenceOptions,
    fieldEvidenceGroupSummaries,
    selectedMissingEvidenceGroup,
    visibleMissingEvidenceItems,
    missingEvidenceDisplayLabel,
    canToggleMissingEvidenceItems,
    signoffBoundaryOptions,
    selectedEvidenceStageItem,
    selectedEvidenceAttachmentListResult,
    selectedEvidenceAttachmentListError,
    selectedSignoffBoundaryStageItem,
    selectedSignoffBoundaryAttachmentListResult,
    selectedSignoffBoundaryAttachmentListError,
    selectedSignoffStatusOptions,
    canStageEvidenceRow,
    canStageEvidenceRowAndReview,
    canUploadAndStageEvidenceAttachment,
    canListEvidenceAttachments,
    canStageSignoffBoundaryRow,
    canStageSignoffBoundaryRowAndReview,
    canStageBoundaryRowAndPrecheck,
    canUploadSignoffBoundaryAttachment,
    canListSignoffBoundaryAttachments,
    evidenceStageCardRef,
    evidenceStageRefInputRef,
    signoffStageCardRef,
    signoffStagePersonInputRef,
    fieldEvidenceIntakeQualityRef,
    fieldEvidenceProgressRef,
    stageSelectedEvidenceRow,
    stageSelectedEvidenceRowAndReview,
    uploadAndStageSelectedEvidenceAttachment,
    listSelectedEvidenceAttachments,
    selectMissingEvidenceForStage,
    selectSignoffBoundaryForStage,
    fillEvidenceRefFromAttachment,
    uploadAndFillSelectedSignoffBoundaryAttachment,
    listSelectedSignoffBoundaryAttachments,
    fillSignoffBoundaryNoteFromAttachment,
    stageSelectedSignoffBoundaryRow,
    stageSelectedSignoffBoundaryRowAndReview,
    stageSelectedBoundaryRowAndPrecheck,
  } = fieldEvidenceController;
  const {
    buildFieldEvidenceGroupActions,
    buildRoleTaskCategorySummaries,
    buildRoleTaskQuickActions,
  } = createV1StatusFieldRoleActionBuilders({
    attachmentRetentionPrecheckAction,
    driverReadinessPrecheckAction,
    fieldEvidenceIntakeQualityRef,
    findMatchingMissingEvidenceOptionByText,
    findSignoffBoundaryOptionByText,
    focusFieldAcceptanceReportFromPhase,
    focusFieldEvidenceProgressFromPhase,
    focusMissingEvidenceGroup,
    focusProductionEnvFixChecklistFromBlocker,
    focusRuntimeReadinessFromPhase,
    focusV1V2BoundaryBriefFromBlocker,
    missingEvidenceOptions,
    onPrecheckProductionEnv,
    onPrecheckProductionGoLive,
    onPrecheckReleaseCandidateRefresh,
    onPrecheckV1AttachmentRetention,
    onPrecheckV1DriverReadiness,
    onPrecheckV1Persistence,
    onPrecheckV1PrintCups,
    onPrecheckV1PrintReadiness,
    onPrecheckV1PrintSpool,
    onPrecheckV1V2Boundary,
    persistencePrecheckAction,
    printCupsPrecheckAction,
    printReadinessPrecheckAction,
    printSpoolPrecheckAction,
    productionEnvGateRef,
    productionEnvPrecheckAction,
    productionGoLivePrecheckAction,
    releaseCandidateRefreshPrecheckAction,
    scrollV1StatusRefIntoView,
    selectedMissingEvidenceGroupKey,
    selectMissingEvidenceForStage,
    selectSignoffBoundaryForStage,
    signoffBoundaryOptions,
    v1V2BoundaryPrecheckAction,
  });
  const roleTaskCategorySummaries = roleTaskBoard
    ? buildRoleTaskCategorySummaries(roleTaskBoard)
    : [];
  if (!hasV1StatusSnapshot) {
    return (
      <V1StatusUnavailable
        loading={goLiveMeta.loading}
        statusSourceLabel={statusSourceLabel}
        statusSourceDetail={statusSourceDetail}
      />
    );
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

  function selectWorkspace(nextView, nextSection = getDefaultV1StatusSection(nextView)) {
    setWorkspaceView(nextView);
    setWorkspaceSection(nextSection);
  }

  function getWorkspaceTargetForRef(targetRef) {
    if (
      targetRef === productionEnvGateRef
    ) return { view: "production", section: "env_gate" };
    if (targetRef === productionEnvIntakeVerificationRef) return { view: "production", section: "env_intake" };
    if (targetRef === productionFirstStageExecutionRef) return { view: "production", section: "first_stage" };
    if (
      targetRef === productionEnvFixChecklistRef
    ) return { view: "production", section: "env_fix" };
    if (targetRef === productionEnvMinimumValuesFragmentTemplateRef) return { view: "production", section: "env_minimum" };
    if (targetRef === productionEnvFillTemplateRef) return { view: "production", section: "env_draft" };
    if (targetRef === runtimeReadinessSectionRef) return { view: "runtime", section: "runtime_gate" };
    if (targetRef === fieldAcceptanceReportRef) return { view: "runtime", section: "acceptance" };
    if (
      targetRef === fieldEvidenceProgressRef ||
      targetRef === fieldEvidenceIntakeQualityRef ||
      targetRef === evidenceStageCardRef ||
      targetRef === signoffStageCardRef
    ) return { view: "field", section: "evidence" };
    if (targetRef === v1V2BoundaryBriefRef) return { view: "boundary", section: "boundary" };
    return { view: "overview", section: "owner" };
  }

  function scrollV1StatusRefIntoView(targetRef) {
    if (typeof window === "undefined") return;
    if (targetRef === fieldEvidenceProgressRef) setFieldEvidenceWorkspaceStage("progress");
    if (targetRef === evidenceStageCardRef) setFieldEvidenceWorkspaceStage("evidence");
    if (targetRef === signoffStageCardRef) setFieldEvidenceWorkspaceStage("signoff");
    if (targetRef === fieldEvidenceIntakeQualityRef) setFieldEvidenceWorkspaceStage("closeout");
    const target = getWorkspaceTargetForRef(targetRef);
    selectWorkspace(target.view, target.section);
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        targetRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }, 0);
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

  const {
    buildCompletionAuditActions,
    buildProductionEnvGateActions,
    buildSelectedPhaseQuickActions,
  } = createV1StatusPhaseActionBuilders({
    attachmentRetentionPrecheckAction,
    canRunFieldEvidenceCloseoutReview,
    canRunProductionEnvFrontDoorReview,
    canShowProductionEnvFrontDoorReview,
    driverReadinessPrecheckAction,
    fieldEvidenceIntakeQualityRef,
    fieldEvidenceValidationAction,
    findMissingEvidenceOptionByText,
    findProductionEnvFixItemForGate,
    findSignoffBoundaryOptionByText,
    focusFieldAcceptanceReportFromPhase,
    focusFieldEvidenceProgressFromPhase,
    focusProductionEnvFillTemplateFromPhase,
    focusProductionEnvFixChecklistFromBlocker,
    focusProductionEnvFixItemFromGate,
    focusProductionEnvMinimumValuesTemplateFromPhase,
    focusProductionEnvTemplateSection,
    focusRuntimeReadinessFromPhase,
    focusV1V2BoundaryBriefFromBlocker,
    missingEvidenceOptions,
    onPrecheckProductionEnv,
    onPrecheckProductionGoLive,
    onPrecheckReleaseCandidateRefresh,
    onPrecheckRuntimeReadiness,
    onPrecheckV1AttachmentRetention,
    onPrecheckV1DriverReadiness,
    onPrecheckV1Persistence,
    onPrecheckV1PrintCups,
    onPrecheckV1PrintReadiness,
    onPrecheckV1PrintSpool,
    onPrecheckV1V2Boundary,
    onRefreshReleaseCandidate,
    persistencePrecheckAction,
    printCupsPrecheckAction,
    printReadinessPrecheckAction,
    printSpoolPrecheckAction,
    productionEnvFrontDoorReviewLoading,
    productionEnvGateRef,
    productionEnvMinimumValuesFragmentTemplate,
    productionEnvPrecheckAction,
    productionEnvTemplateSectionIndexByLabel,
    productionGoLivePrecheckAction,
    releaseCandidateRefreshAction,
    releaseCandidateRefreshPrecheckAction,
    runFieldEvidenceCloseoutReview,
    runProductionEnvFrontDoorReview,
    runtimeReadinessPrecheckAction,
    scrollV1StatusRefIntoView,
    selectedPhase,
    selectMissingEvidenceForStage,
    selectSignoffBoundaryForStage,
    signoffBoundaryOptions,
    v1V2BoundaryPrecheckAction,
  });

  const {
    buildReleaseCandidateRefreshBlockerActions,
    buildRuntimeReadinessBlockerActions,
  } = createV1StatusBlockerActionBuilders({
    attachmentRetentionPrecheckAction,
    canShowProductionEnvFrontDoorReview,
    driverReadinessPrecheckAction,
    fieldEvidenceIntakeQualityRef,
    findMatchingMissingEvidenceOptionByText,
    findSignoffBoundaryOptionByText,
    focusFieldAcceptanceReportFromPhase,
    focusFieldEvidenceProgressFromPhase,
    focusProductionEnvFixChecklistFromBlocker,
    focusV1V2BoundaryBriefFromBlocker,
    missingEvidenceOptions,
    onPrecheckProductionEnv,
    onPrecheckProductionEnvFileAudit,
    onPrecheckProductionEnvFilePreview,
    onPrecheckProductionGoLive,
    onPrecheckRuntimeReadiness,
    onPrecheckV1AttachmentRetention,
    onPrecheckV1DriverReadiness,
    onPrecheckV1Persistence,
    onPrecheckV1PrintCups,
    onPrecheckV1PrintReadiness,
    onPrecheckV1PrintSpool,
    persistencePrecheckAction,
    printCupsPrecheckAction,
    printReadinessPrecheckAction,
    printSpoolPrecheckAction,
    productionEnvFileAuditPrecheckAction,
    productionEnvFilePreviewPrecheckAction,
    productionEnvFrontDoorReviewLoading,
    productionEnvGateRef,
    productionEnvPrecheckAction,
    productionGoLivePrecheckAction,
    releaseCandidateRefreshAction,
    releaseCandidateRefreshPrecheckAction,
    runProductionEnvFrontDoorReview,
    runtimeReadinessPrecheckAction,
    scrollV1StatusRefIntoView,
    selectMissingEvidenceForStage,
    selectSignoffBoundaryForStage,
    signoffBoundaryOptions,
  });

  return (
    <section className={`v1-status-page v1-status-view-${workspaceView} v1-status-section-${workspaceSection}`}>
      <V1StatusHeader
        ready={goLiveStatus?.ready}
        statusSummary={statusSummary}
        snapshotExpired={v1StatusSnapshotExpired}
        statusSourceLabel={statusSourceLabel}
        statusSourceDetail={statusSourceDetail}
      />

      <V1StatusWorkspaceTabs value={workspaceView} onChange={(view) => selectWorkspace(view)} />

      <section className="page-grid two-col v1-status-workbench">
        <V1StatusGateModulePanel
          statusSummary={statusSummary}
          unblockPlan={unblockPlan}
          selectedPhase={selectedPhase}
          setSelectedPhaseKey={(key) => {
            setSelectedPhaseKey(key);
            selectWorkspace("overview", "phase");
          }}
          moduleCompletionRows={moduleCompletionRows}
          selectedModule={selectedModule}
          setSelectedModuleName={(name) => {
            setSelectedModuleName(name);
            selectWorkspace("module", "module_pressure");
          }}
        />

        <DetailPane title={workspaceTitle} subtitle="V1 上线工作台">
          <V1StatusSectionTabs items={workspaceSections} value={workspaceSection} onChange={setWorkspaceSection} />
          <V1StatusModuleWorkspace
            selectedModule={selectedModule}
            selectedPhase={selectedPhase}
            roleBuckets={unblockPlan.roleBuckets}
            blockers={statusSummary.blockers}
            v2DifferenceItems={v2DifferenceItemsForPage}
          />
          <V1StatusDecisionWorkspace
            ownerDecisionBrief={ownerDecisionBrief}
            completionAudit={completionAudit}
            buildCompletionAuditActions={buildCompletionAuditActions}
            selectedPhase={selectedPhase}
            selectedPhaseRoles={selectedPhaseRoles}
            selectedPhaseGroups={selectedPhaseGroups}
            selectedPhaseTasks={selectedPhaseTasks}
            selectedPhaseQuickActions={buildSelectedPhaseQuickActions()}
          />
          <V1StatusProductionWorkspace
            data={{
              productionEnvGate,
              d49Readiness,
              productionEnvIntakeVerification,
              productionEnvMinimumBlockingItems,
              productionEnvMinimumValuesFragmentTemplate,
              productionFirstStageExecution,
              productionEnvValuesApplyGateStatus,
              productionEnvValuesFragmentSourceStatus,
              productionPersistenceEvidence,
              todoLoadPrecheck,
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
            }}
            actions={{
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
            }}
            handlers={{
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
              onOpenEmployeeImport,
              scrollV1StatusRefIntoView,
              onRunProductionFirstStageExecution,
              onRunProductionPersistenceEvidence,
              onPrecheckProductionFirstStageValuesDryRun,
              onApplyProductionFirstStageValues,
              focusProductionEnvTemplateSection,
            }}
            refs={{
              productionEnvGateRef,
              productionEnvIntakeVerificationRef,
              productionFirstStageExecutionRef,
              productionEnvFixChecklistRef,
              productionEnvMinimumValuesFragmentTemplateRef,
              productionEnvFillTemplateRef,
              productionEnvTemplatePreviewRef,
            }}
            viewState={{
              showAllProductionEnvFixItems,
              setShowAllProductionEnvFixItems,
              showAllProductionEnvMinimumTemplateLines,
              setShowAllProductionEnvMinimumTemplateLines,
              showAllProductionEnvTemplateLines,
              setShowAllProductionEnvTemplateLines,
            }}
          />
          <V1StatusRuntimeWorkspace
            runtimeReadinessBlockers={runtimeReadinessBlockers}
            sectionRef={runtimeReadinessSectionRef}
            onPrecheckV1Persistence={onPrecheckV1Persistence}
            persistencePrecheckAction={persistencePrecheckAction}
            onPrecheckV1AttachmentRetention={onPrecheckV1AttachmentRetention}
            attachmentRetentionPrecheckAction={attachmentRetentionPrecheckAction}
            onPrecheckV1PrintSpool={onPrecheckV1PrintSpool}
            printSpoolPrecheckAction={printSpoolPrecheckAction}
            onPrecheckV1PrintCups={onPrecheckV1PrintCups}
            printCupsPrecheckAction={printCupsPrecheckAction}
            onPrecheckV1PrintReadiness={onPrecheckV1PrintReadiness}
            printReadinessPrecheckAction={printReadinessPrecheckAction}
            onPrecheckV1DriverReadiness={onPrecheckV1DriverReadiness}
            driverReadinessPrecheckAction={driverReadinessPrecheckAction}
            onPrecheckRuntimeReadiness={onPrecheckRuntimeReadiness}
            runtimeReadinessPrecheckAction={runtimeReadinessPrecheckAction}
            buildRuntimeReadinessBlockerActions={buildRuntimeReadinessBlockerActions}
          />
          <V1StatusFieldAcceptanceWorkspace
            fieldAcceptanceReport={fieldAcceptanceReport}
            sectionRef={fieldAcceptanceReportRef}
          />
          <V1StatusRoleTaskWorkspace
            roleTaskBoard={roleTaskBoard}
            roleTaskCategorySummaries={roleTaskCategorySummaries}
            buildRoleTaskQuickActions={buildRoleTaskQuickActions}
          />
          <V1StatusFieldEvidenceWorkspace
            activeStage={fieldEvidenceWorkspaceStage}
            onStageChange={setFieldEvidenceWorkspaceStage}
            data={{
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
            }}
            capabilities={{
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
            }}
            actions={{
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
            }}
            handlers={{
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
            }}
            drafts={{
              evidenceStageDraft,
              setEvidenceAttachmentFile,
              setEvidenceStageDraft,
              setShowAllMissingEvidenceItems,
              setSignoffBoundaryAttachmentFile,
              setSignoffStageDraft,
              showAllMissingEvidenceItems,
              signoffStageDraft,
            }}
            refs={{
              evidenceStageCardRef,
              evidenceStageRefInputRef,
              fieldEvidenceIntakeQualityRef,
              fieldEvidenceProgressRef,
              signoffStageCardRef,
              signoffStagePersonInputRef,
            }}
            options={{
              selectedSignoffStatusOptions,
              v1EvidenceStageStatusOptions,
            }}
          />
          <V1StatusBoundaryWorkspace
            v1V2BoundaryBrief={v1V2BoundaryBrief}
            sectionRef={v1V2BoundaryBriefRef}
            onRefreshV1V2ScopeBrief={onRefreshV1V2ScopeBrief}
            v1V2ScopeBriefRefreshAction={v1V2ScopeBriefRefreshAction}
            onPrecheckV1V2Boundary={onPrecheckV1V2Boundary}
            v1V2BoundaryPrecheckAction={v1V2BoundaryPrecheckAction}
            v1MustContinueItems={v1MustContinueItemsForPage}
            v2BoundaryDifferences={v2BoundaryDifferencesForPage}
            v1V2ModuleDifferences={v1V2ModuleDifferencesForPage}
            showAllV1MustContinueItems={showAllV1MustContinueItems}
            setShowAllV1MustContinueItems={setShowAllV1MustContinueItems}
            showAllV2BoundaryDifferences={showAllV2BoundaryDifferences}
            setShowAllV2BoundaryDifferences={setShowAllV2BoundaryDifferences}
            showAllV1V2ModuleDifferences={showAllV1V2ModuleDifferences}
            setShowAllV1V2ModuleDifferences={setShowAllV1V2ModuleDifferences}
          />
        </DetailPane>
      </section>
    </section>
  );
}
