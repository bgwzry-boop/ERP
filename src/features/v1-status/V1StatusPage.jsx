import { useEffect, useRef, useState } from "react";
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
import { V1StatusRoleTaskWorkspace } from "./V1StatusRoleTaskWorkspace.jsx";
import { V1StatusRuntimeWorkspace } from "./V1StatusRuntimeWorkspace.jsx";
import {
  buildProductionEnvVariableCheckOverlayForPage,
  buildV1StatusSummaryForPage,
  formatV1StatusSnapshotTime,
  getProductionEnvTemplateSectionLabel,
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
}) {
  const [selectedModuleName, setSelectedModuleName] = useState("原材料 / 成本 / 毛利");
  const [selectedPhaseKey, setSelectedPhaseKey] = useState("production_environment");
  const [workspaceView, setWorkspaceView] = useState("overview");
  const [workspaceSection, setWorkspaceSection] = useState("owner");
  const [fieldEvidenceWorkspaceStage, setFieldEvidenceWorkspaceStage] = useState("progress");
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
  const missingEvidenceOptions = fieldEvidenceProgress?.missingItems || [];
  const missingEvidenceDisplayLimit = 6;
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
    selectWorkspace("field", "evidence");
    setFieldEvidenceWorkspaceStage("evidence");
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
    selectWorkspace("field", "evidence");
    setFieldEvidenceWorkspaceStage("signoff");
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
