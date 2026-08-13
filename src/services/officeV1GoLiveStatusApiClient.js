import { createOfficeV1GoLiveStatusActions } from "./officeV1GoLiveStatusActions.js";
import {
  normalizeFieldEvidenceDraftFreshness,
  normalizeFieldEvidenceIntakeGuidance,
  normalizeFieldEvidenceIntakeQuality,
  normalizeFieldEvidenceProgress,
  normalizeV1FieldEvidenceDraftManifestResult,
  normalizeV1FieldEvidenceDraftValidationResult,
  normalizeV1FieldEvidenceStageRowResult,
} from "./officeV1GoLiveStatusFieldEvidenceNormalizers.js";
import {
  normalizeModuleV1V2Differences,
  normalizeV1ReleaseCandidateRefreshPrecheckResult,
  normalizeV1ReleaseCandidateRefreshResult,
  normalizeV1V2BoundaryPrecheckResult,
  normalizeV1V2ScopeBriefRefreshResult,
} from "./officeV1GoLiveStatusReleaseNormalizers.js";
import {
  normalizeProductionEnvIntakeVerification,
  normalizeProductionEnvValuesApplyGateStatus,
  normalizeProductionEnvValuesFragmentSourceStatus,
  normalizeV1ProductionEnvFileAuditLivePrecheckResult,
  normalizeV1ProductionEnvIntakeLivePrecheckResult,
  normalizeV1ProductionEnvLivePrecheckResult,
  normalizeV1ProductionEnvSetupLiveRunResult,
} from "./officeV1GoLiveStatusProductionEnvNormalizers.js";
import {
  normalizeProductionFirstStageExecution,
  normalizeV1ProductionFirstStageExecutionLiveRunResult,
  normalizeV1ProductionFirstStageValuesApplyLiveRunResult,
  normalizeV1ProductionFirstStageValuesDryRunLivePrecheckResult,
  normalizeV1ProductionPersistenceEvidence,
  normalizeV1ProductionPersistenceEvidenceLiveRunResult,
  normalizeV1TodoLoadPrecheck,
} from "./officeV1GoLiveStatusProductionFirstStageNormalizers.js";
import {
  normalizeProductionEnvFillTemplate,
  normalizeProductionEnvFixChecklist,
  normalizeProductionEnvFixItem,
} from "./officeV1GoLiveStatusProductionTemplateNormalizers.js";
import {
  normalizeV1AttachmentRetentionLivePrecheckResult,
  normalizeV1D49Readiness,
  normalizeV1DriverReadinessLivePrecheckResult,
  normalizeV1PersistenceLivePrecheckResult,
  normalizeV1ProductionGoLiveLivePrecheckResult,
  normalizeV1RuntimeReadinessLivePrecheckResult,
} from "./officeV1GoLiveStatusRuntimeNormalizers.js";
import {
  cleanText,
  extractFieldEvidenceCount,
  extractFirstCount,
  extractSignoffCount,
  formatCountLabel,
  formatDateTimeLabel,
  formatShownCountLabel,
  formatUnblockTaskStatusLabel,
  isPlainObject,
  normalizeStringList,
} from "./officeV1GoLiveStatusNormalizerUtils.js";

const {
  applyOfficeV1ProductionFirstStageValues,
  generateOfficeV1FieldEvidenceDraftManifest,
  getOfficeV1GoLiveStatus,
  precheckOfficeV1AttachmentRetention,
  precheckOfficeV1DriverReadiness,
  precheckOfficeV1Persistence,
  precheckOfficeV1ProductionEnv,
  precheckOfficeV1ProductionEnvFileAudit,
  precheckOfficeV1ProductionEnvFilePreview,
  precheckOfficeV1ProductionEnvIntake,
  precheckOfficeV1ProductionFirstStageValuesDryRun,
  precheckOfficeV1ProductionGoLive,
  precheckOfficeV1ReleaseCandidateRefresh,
  precheckOfficeV1RuntimeReadiness,
  precheckOfficeV1V2Boundary,
  refreshOfficeV1ReleaseCandidate,
  refreshOfficeV1V2ScopeBrief,
  runOfficeV1ProductionEnvSetup,
  runOfficeV1ProductionFirstStageExecution,
  runOfficeV1ProductionPersistenceEvidence,
  stageOfficeV1FieldEvidenceIntakeRow,
  validateOfficeV1FieldEvidenceDraftManifest,
} = createOfficeV1GoLiveStatusActions({
  normalizeV1GoLiveStatusForClient,
  normalizeV1FieldEvidenceDraftManifestResult,
  normalizeV1FieldEvidenceDraftValidationResult,
  normalizeV1FieldEvidenceStageRowResult,
  normalizeV1ProductionEnvLivePrecheckResult,
  normalizeV1ProductionEnvSetupLiveRunResult,
  normalizeV1ProductionEnvIntakeLivePrecheckResult,
  normalizeV1ProductionEnvFileAuditLivePrecheckResult,
  normalizeV1ProductionGoLiveLivePrecheckResult,
  normalizeV1RuntimeReadinessLivePrecheckResult,
  normalizeV1ProductionFirstStageValuesDryRunLivePrecheckResult,
  normalizeV1ProductionFirstStageExecutionLiveRunResult,
  normalizeV1ProductionPersistenceEvidenceLiveRunResult,
  normalizeV1ProductionFirstStageValuesApplyLiveRunResult,
  normalizeV1PersistenceLivePrecheckResult,
  normalizeV1AttachmentRetentionLivePrecheckResult,
  normalizeV1DriverReadinessLivePrecheckResult,
  normalizeV1V2BoundaryPrecheckResult,
  normalizeV1V2ScopeBriefRefreshResult,
  normalizeV1ReleaseCandidateRefreshPrecheckResult,
  normalizeV1ReleaseCandidateRefreshResult,
});

export {
  applyOfficeV1ProductionFirstStageValues,
  generateOfficeV1FieldEvidenceDraftManifest,
  getOfficeV1GoLiveStatus,
  precheckOfficeV1AttachmentRetention,
  precheckOfficeV1DriverReadiness,
  precheckOfficeV1Persistence,
  precheckOfficeV1ProductionEnv,
  precheckOfficeV1ProductionEnvFileAudit,
  precheckOfficeV1ProductionEnvFilePreview,
  precheckOfficeV1ProductionEnvIntake,
  precheckOfficeV1ProductionFirstStageValuesDryRun,
  precheckOfficeV1ProductionGoLive,
  precheckOfficeV1ReleaseCandidateRefresh,
  precheckOfficeV1RuntimeReadiness,
  precheckOfficeV1V2Boundary,
  refreshOfficeV1ReleaseCandidate,
  refreshOfficeV1V2ScopeBrief,
  runOfficeV1ProductionEnvSetup,
  runOfficeV1ProductionFirstStageExecution,
  runOfficeV1ProductionPersistenceEvidence,
  stageOfficeV1FieldEvidenceIntakeRow,
  validateOfficeV1FieldEvidenceDraftManifest,
};

export function normalizeV1GoLiveStatusForClient(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const releaseCandidate = isPlainObject(source.releaseCandidate) ? source.releaseCandidate : {};
  const releaseSummary = isPlainObject(releaseCandidate.summary) ? releaseCandidate.summary : {};
  const moduleCompletionRows = normalizeModuleCompletionRows(source.moduleCompletion);
  const unblockPlan = normalizeUnblockPlan(source.unblockPlan);
  const fieldEvidenceProgress = normalizeFieldEvidenceProgress(source.fieldEvidenceProgress);
  const roleTaskBoard = normalizeRoleTaskBoard(source.roleTaskBoard);
  const v1V2BoundaryBrief = normalizeV1V2BoundaryBrief(source.v1V2BoundaryBrief);
  const ownerDecisionBrief = normalizeOwnerDecisionBrief(source.ownerDecisionBrief);
  const completionAudit = normalizeCompletionAudit(source.completionAudit);
  const runtimeReadinessBlockers = normalizeRuntimeReadinessBlockers(source.runtimeReadinessBlockers);
  const fieldAcceptanceReport = normalizeFieldAcceptanceReport(source.fieldAcceptanceReport);
  const productionEnvGate = normalizeProductionEnvGate(source.productionEnvGate);
  const d49Readiness = normalizeV1D49Readiness(source.d49Readiness);
  const productionEnvIntakeVerification = normalizeProductionEnvIntakeVerification(source.productionEnvIntakeVerification);
  const productionPersistenceEvidence = normalizeV1ProductionPersistenceEvidence(source.productionPersistenceEvidence);
  const todoLoadPrecheck = normalizeV1TodoLoadPrecheck(source.todoLoadPrecheck);
  const productionFirstStageExecution = normalizeProductionFirstStageExecution(source.productionFirstStageExecution);
  const productionEnvFixChecklist = normalizeProductionEnvFixChecklist(source.productionEnvFixChecklist);
  const productionEnvFillTemplate = normalizeProductionEnvFillTemplate(source.productionEnvFillTemplate);
  const productionEnvMinimumValuesFragmentTemplate = normalizeProductionEnvFillTemplate(
    source.productionEnvMinimumValuesFragmentTemplate,
  );
  const productionEnvValuesFragmentSourceStatus = normalizeProductionEnvValuesFragmentSourceStatus(
    source.productionEnvValuesFragmentSourceStatus,
  );
  const productionEnvValuesApplyGateStatus = normalizeProductionEnvValuesApplyGateStatus(
    source.productionEnvValuesApplyGateStatus,
  );
  const fieldEvidenceDraftFreshness = normalizeFieldEvidenceDraftFreshness(source.fieldEvidenceDraftFreshness);
  const fieldEvidenceIntakeGuidance = normalizeFieldEvidenceIntakeGuidance(source.fieldEvidenceIntakeGuidance);
  const fieldEvidenceIntakeQuality = normalizeFieldEvidenceIntakeQuality(source.fieldEvidenceIntakeQuality);
  const moduleV1V2Differences = normalizeModuleV1V2Differences(source.moduleV1V2Differences);
  const plainV2Differences = normalizeStringList(source.v2Differences);
  const v2DifferenceItems = moduleV1V2Differences.length
    ? moduleV1V2Differences.map((item) => [item.module || "V2 差异", item.v2])
    : plainV2Differences.slice(0, 7).map(toV2DifferenceItem);
  const fieldEvidenceValue =
    fieldEvidenceProgress.summary.evidenceItemsLabel ||
    extractFieldEvidenceCount(summary.fieldEvidence || releaseSummary.fieldEvidence);
  const signoffValue =
    fieldEvidenceProgress.summary.signoffLabel ||
    extractSignoffCount(summary.fieldEvidence || releaseSummary.fieldEvidence);
  const releaseGateValue = releaseSummary.totalGateCount
    ? `${releaseSummary.passedGateCount}/${releaseSummary.totalGateCount}`
    : extractFirstCount(summary.releaseGate || releaseSummary.label) || "0/4";

  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope) || "v1_go_live_status",
    sourceLabel: "后端 go-live 产物",
    status: cleanText(source.status) || "blocked",
    ready: source.ready === true,
    statusLabel: source.ready === true ? "V1 可上线" : "V1 仍未完成",
    conclusion:
      cleanText(source.conclusion) ||
      "当前仍不能声明 V1 已完成；必须以发布门禁、现场证据和负责人签字为准。",
    generatedAt: formatDateTimeLabel(source.generatedAt || source.checkedAt),
    checkedAt: cleanText(source.checkedAt),
    metrics: [
      ["需求确认", cleanText(summary.requirements) || "85-90%", "success"],
      ["P0/代码", cleanText(summary.p0Prototype) || "97-98%", "success"],
      ["V1 就绪", cleanText(summary.v1Readiness) || "80-83%", "warning"],
      ["发布门禁", releaseGateValue, releaseGateValue.startsWith("0/") ? "danger" : "warning"],
      ["现场证据", fieldEvidenceValue || "0/40", fieldEvidenceValue?.startsWith("0/") ? "danger" : "warning"],
      ["负责人签字", signoffValue || "0/6", signoffValue?.startsWith("0/") ? "danger" : "warning"],
    ],
    gates: normalizeReleaseGates(releaseCandidate.gates, {
      releaseGate: summary.releaseGate || releaseSummary.label,
      runtimeReadiness: summary.runtimeReadiness || releaseSummary.runtimeReadiness,
      fieldEvidence: summary.fieldEvidence || releaseSummary.fieldEvidence,
      fieldAcceptance: summary.fieldAcceptance || releaseSummary.fieldAcceptance,
      onsiteTaskCount: summary.onsiteTaskCount,
    }),
    blockers: normalizeTopBlockers(source.topBlockers),
    moduleCompletionRows,
    unblockPlan,
    fieldEvidenceProgress,
    roleTaskBoard,
    v1V2BoundaryBrief,
    ownerDecisionBrief,
    completionAudit,
    runtimeReadinessBlockers,
    fieldAcceptanceReport,
    productionEnvGate,
    d49Readiness,
    productionEnvIntakeVerification,
    productionPersistenceEvidence,
    todoLoadPrecheck,
    productionFirstStageExecution,
    productionEnvFixChecklist,
    productionEnvFillTemplate,
    productionEnvMinimumValuesFragmentTemplate,
    productionEnvValuesFragmentSourceStatus,
    productionEnvValuesApplyGateStatus,
    fieldEvidenceDraftFreshness,
    fieldEvidenceIntakeGuidance,
    fieldEvidenceIntakeQuality,
    v2DifferenceItems,
    v2Differences: plainV2Differences,
    v2Categories: normalizeStringList(source.v2Categories),
    sourceStatus: isPlainObject(source.sourceStatus) ? source.sourceStatus : {},
    missingArtifacts: normalizeStringList(source.missingArtifacts),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeOwnerDecisionBrief(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const decision = isPlainObject(source.decision) ? source.decision : {};
  const completion = isPlainObject(source.completion) ? source.completion : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const doneHighlights = normalizeStringList(source.doneHighlights);
  const unfinishedItems = Array.isArray(source.unfinishedItems)
    ? source.unfinishedItems.map(normalizeOwnerDecisionItem).filter((item) => item.label)
    : [];
  const releaseGates = Array.isArray(source.releaseGates)
    ? source.releaseGates.map(normalizeOwnerDecisionGate).filter((item) => item.label)
    : [];
  const blockerGroups = Array.isArray(source.blockerGroups)
    ? source.blockerGroups.map((item) => ({
        gate: cleanText(item?.gate),
        count: Number(item?.count) || 0,
      })).filter((item) => item.gate)
    : [];
  const nextActions = normalizeStringList(source.nextActions);
  const topBlockers = Array.isArray(source.topBlockers)
    ? source.topBlockers.map(normalizeOwnerDecisionTopBlocker).filter((item) => item.label)
    : [];
  const onsiteTaskCount = Number(completion.onsiteTaskCount) || 0;
  const unfinishedItemCount = Number(summary.unfinishedItemCount) || unfinishedItems.length;
  const shownUnfinishedItemCount = Number(summary.shownUnfinishedItemCount) || unfinishedItems.length;
  const nextActionCount = Number(summary.nextActionCount) || nextActions.length;
  const shownNextActionCount = Number(summary.shownNextActionCount) || nextActions.length;
  const topBlockerCount = Number(summary.topBlockerCount) || topBlockers.length;
  const shownTopBlockerCount = Number(summary.shownTopBlockerCount) || topBlockers.length;

  return {
    status: cleanText(source.status) || (source.ready === true ? "ready_owner_brief_written" : "blocked_owner_brief_written"),
    ready: source.ready === true,
    available:
      source.available === true ||
      Boolean(cleanText(source.conclusion)) ||
      unfinishedItems.length > 0 ||
      releaseGates.length > 0,
    canDeclareV1Complete: source.canDeclareV1Complete === true,
    generatedAt: formatDateTimeLabel(source.generatedAt),
    conclusion: cleanText(source.conclusion),
    decision: {
      label: cleanText(decision.label) || (source.ready === true ? "可以宣布 V1 已完成" : "不能宣布 V1 已完成"),
      recommendation: cleanText(decision.recommendation),
      ownerQuestion: cleanText(decision.ownerQuestion),
    },
    completion: {
      requirements: cleanText(completion.requirements) || "85-90%",
      p0Prototype: cleanText(completion.p0Prototype) || "97-98%",
      v1Readiness: cleanText(completion.v1Readiness) || "80-83%",
      releaseGate: cleanText(completion.releaseGate) || "0/4 发布门禁通过",
      runtimeReadiness: cleanText(completion.runtimeReadiness) || "5/11 通过",
      fieldEvidence: cleanText(completion.fieldEvidence) || "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      fieldAcceptance: cleanText(completion.fieldAcceptance) || "5/11 通过",
      onsiteTaskCount,
      onsiteTaskLabel: onsiteTaskCount ? `${onsiteTaskCount} 项` : "",
    },
    summary: {
      unfinishedItemCount,
      shownUnfinishedItemCount,
      unfinishedItemLabel: unfinishedItemCount
        ? `${Math.min(shownUnfinishedItemCount, unfinishedItemCount)}/${unfinishedItemCount}`
        : "",
      releaseGateCount: Number(summary.releaseGateCount) || releaseGates.length,
      releaseGateLabel: `${Number(summary.releaseGateCount) || releaseGates.length} 项`,
      doneHighlightCount: Number(summary.doneHighlightCount) || doneHighlights.length,
      blockerGroupCount: Number(summary.blockerGroupCount) || blockerGroups.length,
      nextActionCount,
      shownNextActionCount,
      nextActionLabel: nextActionCount
        ? `${Math.min(shownNextActionCount, nextActionCount)}/${nextActionCount}`
        : "",
      topBlockerCount,
      shownTopBlockerCount,
      topBlockerLabel: topBlockerCount
        ? `${Math.min(shownTopBlockerCount, topBlockerCount)}/${topBlockerCount}`
        : "",
    },
    doneHighlights,
    unfinishedItems,
    releaseGates,
    blockerGroups,
    nextActions,
    topBlockers,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeCompletionAudit(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeCompletionAuditCriterion).filter((item) => item.key)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria)
    ? source.blockingCriteria.map(normalizeCompletionAuditCriterion).filter((item) => item.key)
    : criteria.filter((item) => !item.ready);
  const v2BoundarySource = isPlainObject(source.v2Boundary) ? source.v2Boundary : {};
  const criteriaCount = Number(summary.criteriaCount) || criteria.length;
  const blockingCriteriaCount = Number(summary.blockingCriteriaCount) || blockingCriteria.length;
  const passedCriteriaCount =
    Number(summary.passedCriteriaCount) ||
    Math.max(0, criteriaCount - blockingCriteriaCount);
  const v2DifferenceCount = Number(summary.v2DifferenceCount || v2BoundarySource.v2DifferenceCount) || 0;
  const onsiteTaskCount = Number(summary.onsiteTaskCount) || 0;
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    canDeclareV1Complete: source.canDeclareV1Complete === true,
    available:
      source.available === true ||
      criteria.length > 0 ||
      blockingCriteria.length > 0 ||
      v2DifferenceCount > 0,
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "V1 完成审计：可完成" : "V1 完成审计：仍不能宣布完成"),
      criteriaCount,
      passedCriteriaCount,
      blockingCriteriaCount,
      blockingCriteriaLabel: cleanText(summary.blockingCriteriaLabel) || `${blockingCriteriaCount}/${criteriaCount}`,
      onsiteTaskCount,
      onsiteTaskLabel: cleanText(summary.onsiteTaskLabel) || (onsiteTaskCount ? `${onsiteTaskCount} 项` : ""),
      v1MustContinueCount: Number(summary.v1MustContinueCount || v2BoundarySource.v1MustContinueCount) || 0,
      v2DifferenceCount,
      v2DifferenceLabel: cleanText(summary.v2DifferenceLabel) || `${v2DifferenceCount} 项`,
    },
    criteria,
    blockingCriteria,
    v2Boundary: {
      ready: v2BoundarySource.ready === true,
      label: cleanText(v2BoundarySource.label),
      nextAction: cleanText(v2BoundarySource.nextAction),
      v1MustContinueCount: Number(v2BoundarySource.v1MustContinueCount) || 0,
      v2CategoryCount: Number(v2BoundarySource.v2CategoryCount) || 0,
      v2DifferenceCount,
      moduleDifferenceCount: Number(v2BoundarySource.moduleDifferenceCount) || 0,
    },
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeCompletionAuditCriterion(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    required: value?.required !== false,
    ready: value?.ready === true,
    status: cleanText(value?.status) || (value?.ready === true ? "ready" : "blocked"),
    statusLabel: cleanText(value?.statusLabel) || (value?.ready === true ? "已满足" : "阻塞"),
    evidenceLabel: cleanText(value?.evidenceLabel),
    current: cleanText(value?.current),
    proofRequirements: normalizeStringList(value?.proofRequirements).slice(0, 3),
    proofGaps: normalizeStringList(value?.proofGaps).slice(0, 4),
    proofGapShownCount: Number(value?.proofGapShownCount) || 0,
    proofGapTotalCount: Number(value?.proofGapTotalCount) || 0,
    proofGapCountLabel: cleanText(value?.proofGapCountLabel),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeOwnerDecisionItem(value = {}) {
  return {
    type: cleanText(value?.type),
    label: cleanText(value?.label),
    detail: cleanText(value?.detail),
  };
}

function normalizeOwnerDecisionGate(value = {}) {
  return {
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    summary: cleanText(value?.summary),
    detail: cleanText(value?.detail),
  };
}

function normalizeOwnerDecisionTopBlocker(value = {}) {
  return {
    gate: cleanText(value?.gate),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "pending",
    detail: cleanText(value?.detail),
  };
}

function normalizeRuntimeReadinessBlockers(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(normalizeRuntimeReadinessBlocker).filter((item) => item.key && item.label)
    : [];
  const passedCount = Number(summary.passedCount) || 0;
  const totalCount = Number(summary.totalCount) || 0;
  const blockingCount = Number(summary.blockingCount) || blockers.filter((item) => !item.ready).length;
  const shownBlockingCount = Number(summary.shownBlockingCount) || blockers.length;
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    available:
      source.available === true ||
      blockers.length > 0 ||
      Boolean(cleanText(summary.readinessLabel || summary.label)),
    summary: {
      label: cleanText(summary.label) || "运行时 V1 readiness：5/11 通过，6 项阻塞",
      readinessLabel: cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : ""),
      passedCount,
      totalCount,
      blockingCount,
      passedLabel: totalCount ? `${passedCount}/${totalCount}` : "",
      blockingLabel: `${blockingCount} 项`,
      shownBlockingCount,
      shownBlockingLabel: formatShownCountLabel(shownBlockingCount, blockingCount),
    },
    blockers,
    nextAction: cleanText(source.nextAction),
    safeguards: {
      rawRuntimeReadinessReportIncluded: false,
      ...(isPlainObject(source.safeguards) ? source.safeguards : {}),
    },
  };
}

function normalizeRuntimeReadinessBlocker(value = {}) {
  const ready = value?.ready === true;
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    group: cleanText(value?.group),
    ownerRole: cleanText(value?.ownerRole),
    status: cleanText(value?.status) || (ready ? "ready" : "pending"),
    ready,
    statusLabel: ready ? "已通过" : "阻塞",
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeFieldAcceptanceReport(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const modules = Array.isArray(source.modules)
    ? source.modules.map(normalizeFieldAcceptanceModule).filter((item) => item.key)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria)
    ? source.blockingCriteria.map(normalizeFieldAcceptanceCriterion).filter((item) => item.key)
    : [];
  const requiredFieldEvidence = Array.isArray(source.requiredFieldEvidence)
    ? source.requiredFieldEvidence.map(normalizeRequiredFieldEvidence).filter((item) => item.key)
    : [];
  const passedCount = Number(summary.passedCount) || modules.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || modules.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.filter((item) => item.blocking).length;
  const shownBlockingCount = Number(summary.shownBlockingCount) || blockingCriteria.length;
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    available:
      source.available === true ||
      modules.length > 0 ||
      blockingCriteria.length > 0 ||
      requiredFieldEvidence.length > 0,
    generatedAt: formatDateTimeLabel(source.generatedAt),
    conclusion: cleanText(source.conclusion),
    summary: {
      label: cleanText(summary.label) || (totalCount ? `${passedCount}/${totalCount} 通过` : ""),
      passedCount,
      totalCount,
      blockingCount,
      passedLabel: totalCount ? `${passedCount}/${totalCount}` : "",
      blockingLabel: `${blockingCount} 项`,
      shownModuleCount: Number(summary.shownModuleCount) || modules.length,
      shownBlockingCount,
      shownBlockingLabel: formatShownCountLabel(shownBlockingCount, blockingCount),
      shownEvidenceGroupCount: Number(summary.shownEvidenceGroupCount) || requiredFieldEvidence.length,
      shownNextActionCount: Number(summary.shownNextActionCount) || 0,
    },
    modules,
    blockingCriteria,
    requiredFieldEvidence,
    remainingV1Risks: normalizeStringList(source.remainingV1Risks),
    nextActions: normalizeStringList(source.nextActions),
    safeguards: {
      rawFieldAcceptanceReportIncluded: false,
      ...(isPlainObject(source.safeguards) ? source.safeguards : {}),
    },
  };
}

function normalizeFieldAcceptanceModule(value = {}) {
  const ready = value?.ready === true;
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || (ready ? "passed" : "pending"),
    statusLabel: ready ? "通过" : "未通过",
    ready,
    detail: cleanText(value?.detail),
    evidence: normalizeStringList(value?.evidence),
  };
}

function normalizeFieldAcceptanceCriterion(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "pending",
    blocking: value?.blocking === true,
    statusLabel: value?.blocking === true ? "阻塞" : cleanText(value?.status) || "待处理",
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeRequiredFieldEvidence(value = {}) {
  const required = normalizeStringList(value?.required);
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    required,
    requiredCount: Number(value?.requiredCount) || required.length,
    requiredLabel: `${Number(value?.requiredCount) || required.length} 项`,
  };
}

function normalizeProductionEnvGate(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const checks = Array.isArray(source.checks)
    ? source.checks.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  const audit = normalizeProductionEnvAudit(source.audit);
  const passedCount = Number(summary.passedCount) || checks.filter((item) => item.ready || item.status === "passed").length;
  const totalCount = Number(summary.totalCount) || checks.length;
  const blockingCount = Number(summary.blockingCount) || checks.filter((item) => item.severity === "blocking" && !item.ready).length;
  const warningCount = Number(summary.warningCount) || checks.filter((item) => item.severity === "warning" && !item.ready).length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "");
  return {
    status: cleanText(source.status) || (blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "passed"),
    ready: source.ready === true,
    available: source.available === true || checks.length > 0 || audit.available,
    checkedAt: cleanText(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (readinessLabel ? `生产配置门禁：${readinessLabel} 通过，${blockingCount} 项阻塞` : ""),
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      placeholderValueCount: Number(summary.placeholderValueCount) || 0,
      envFileCount: Number(summary.envFileCount) || audit.envFileCount,
      auditStatus: cleanText(summary.auditStatus || audit.status),
      auditLabel: cleanText(summary.auditLabel || audit.statusLabel),
      passedLabel: readinessLabel,
      blockingLabel: `${blockingCount} 项`,
      warningLabel: `${warningCount} 项`,
      auditStatusLabel: cleanText(summary.auditLabel || audit.statusLabel),
    },
    checks,
    blockingChecks: checks.filter((item) => item.severity === "blocking" && !item.ready),
    warningChecks: checks.filter((item) => item.severity === "warning" && !item.ready),
    audit,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvAudit(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const envFileCount = Number(source.envFileCount ?? summary.fileCount) || 0;
  const status = cleanText(source.status) || "not_applicable";
  const statusLabel = cleanText(source.statusLabel) || (source.ready === true ? "已通过" : status);
  return {
    status,
    statusLabel,
    ready: source.ready === true,
    included: source.included === true,
    available: source.available === true || Boolean(cleanText(summary.label)),
    envFileCount,
    summary: {
      label: cleanText(summary.label),
      fileCount: Number(summary.fileCount) || envFileCount,
      blockingCount: Number(summary.blockingCount) || 0,
      warningCount: Number(summary.warningCount) || 0,
      passedCount: Number(summary.passedCount) || 0,
      placeholderAssignmentCount: Number(summary.placeholderAssignmentCount) || 0,
      uncommentedAssignmentCount: Number(summary.uncommentedAssignmentCount) || 0,
      sensitiveVariableNameCount: Number(summary.sensitiveVariableNameCount) || 0,
      crossFileDuplicateVariableCount: Number(summary.crossFileDuplicateVariableCount) || 0,
    },
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1V2BoundaryBrief(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const ownerReview = isPlainObject(source.ownerReview) ? source.ownerReview : {};
  const v1MustContinue = normalizeStringList(source.v1MustContinue);
  const v2Categories = normalizeStringList(source.v2Categories);
  const v2Differences = normalizeStringList(source.v2Differences);
  const moduleDifferences = normalizeModuleV1V2Differences(source.moduleDifferences);
  const v1MustContinueCount = Number(summary.v1MustContinueCount) || v1MustContinue.length;
  const v2CategoryCount = Number(summary.v2CategoryCount) || v2Categories.length;
  const v2DifferenceCount = Number(summary.v2DifferenceCount) || v2Differences.length;
  const moduleDifferenceCount = Number(summary.moduleDifferenceCount) || moduleDifferences.length;
  const ownerReviewRuleCount = Number(summary.ownerReviewRuleCount) ||
    [ownerReview.question, ownerReview.recommendation, ownerReview.approvalRule].filter(Boolean).length;
  return {
    status: cleanText(source.status) || (source.ready === true ? "confirmed" : "pending_confirmation"),
    ready: source.ready === true,
    available:
      source.available === true ||
      v1MustContinue.length > 0 ||
      v2Categories.length > 0 ||
      v2Differences.length > 0 ||
      moduleDifferences.length > 0,
    canDeclareV1Complete: source.canDeclareV1Complete === true,
    conclusion: cleanText(source.conclusion),
    summary: {
      label: cleanText(summary.label) || "V1/V2 边界待确认",
      v1MustContinueCount,
      v1MustContinueLabel: `${v1MustContinueCount} 项`,
      v2CategoryCount,
      v2CategoryLabel: `${v2CategoryCount} 类`,
      v2DifferenceCount,
      v2DifferenceLabel: `${v2DifferenceCount} 项`,
      moduleDifferenceCount,
      moduleDifferenceLabel: `${moduleDifferenceCount} 个模块`,
      ownerReviewRuleCount,
    },
    v1MustContinue,
    v2Categories,
    v2Differences,
    moduleDifferences,
    ownerReview: {
      question: cleanText(ownerReview.question),
      recommendation: cleanText(ownerReview.recommendation),
      approvalRule: cleanText(ownerReview.approvalRule),
    },
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeRoleTaskBoard(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const roles = Array.isArray(source.roles)
    ? source.roles.map(normalizeRoleTaskBoardRole).filter((item) => item.role)
    : [];
  const firstActions = Array.isArray(source.firstActions)
    ? source.firstActions.map(normalizeRoleTaskBoardTask).filter((item) => item.id)
    : [];
  const taskCount = Number(summary.taskCount) || roles.reduce((total, role) => total + role.taskCount, 0);
  const roleCount = Number(summary.roleCount) || roles.length;
  const releaseTaskCount = Number(summary.releaseTaskCount) || roles.reduce((total, role) => total + role.releaseTaskCount, 0);
  const evidenceTaskCount = Number(summary.evidenceTaskCount) || roles.reduce((total, role) => total + role.evidenceTaskCount, 0);
  const signoffTaskCount = Number(summary.signoffTaskCount) || roles.reduce((total, role) => total + role.signoffTaskCount, 0);
  const boundaryTaskCount = Number(summary.boundaryTaskCount) || roles.reduce((total, role) => total + role.boundaryTaskCount, 0);
  const categorySummaries = Array.isArray(source.categorySummaries)
    ? source.categorySummaries.map(normalizeRoleTaskBoardCategorySummary).filter((item) => item.key)
    : buildFallbackRoleTaskBoardCategorySummaries({
        releaseTaskCount,
        evidenceTaskCount,
        signoffTaskCount,
        boundaryTaskCount,
      });
  const shownTaskCount = Number(summary.shownTaskCount) ||
    roles.reduce((total, role) => total + role.tasks.length, 0);
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    available: source.available === true || roles.length > 0 || firstActions.length > 0,
    summary: {
      label: cleanText(summary.label) || (taskCount ? `V1 现场仍有 ${taskCount} 个待处理任务` : ""),
      taskCount,
      taskCountLabel: taskCount ? `${taskCount} 项` : "",
      releaseTaskCount,
      evidenceTaskCount,
      signoffTaskCount,
      boundaryTaskCount,
      roleCount,
      roleCountLabel: roleCount ? `${roleCount} 个角色` : "",
      categoryCount: Number(summary.categoryCount) || categorySummaries.length,
      shownRoleCount: Number(summary.shownRoleCount) || roles.length,
      shownTaskCount,
      shownTaskLabel: shownTaskCount && taskCount ? `${shownTaskCount}/${taskCount}` : "",
    },
    categorySummaries,
    roles,
    firstActions,
    safeguards: {
      rawOnsiteTaskBoardIncluded: false,
      ...(isPlainObject(source.safeguards) ? source.safeguards : {}),
    },
  };
}

function normalizeRoleTaskBoardCategorySummary(value = {}) {
  const count = Number(value?.count) || 0;
  return {
    key: cleanText(value?.key),
    title: cleanText(value?.title),
    type: cleanText(value?.type),
    count,
    countLabel: `${count} 项`,
    status: cleanText(value?.status) || (count > 0 ? "pending" : "cleared"),
    statusLabel: cleanText(value?.statusLabel) || (count > 0 ? "待处理" : "已清空"),
    nextAction: cleanText(value?.nextAction),
    firstTasks: Array.isArray(value?.firstTasks)
      ? value.firstTasks.map(normalizeRoleTaskBoardTask).filter((item) => item.id).slice(0, 3)
      : [],
  };
}

function buildFallbackRoleTaskBoardCategorySummaries({
  releaseTaskCount = 0,
  evidenceTaskCount = 0,
  signoffTaskCount = 0,
  boundaryTaskCount = 0,
} = {}) {
  return [
    { key: "release", title: "发布门禁", type: "发布门禁", count: releaseTaskCount, nextAction: "先处理生产 env、runtime readiness、持久化、对象存储、打印和司机真机门禁。" },
    { key: "evidence", title: "现场证据", type: "现场证据", count: evidenceTaskCount, nextAction: "按证据组补真实 PostgreSQL、对象存储、打印、司机真机和业务试跑留档。" },
    { key: "signoff", title: "负责人签字", type: "负责人签字", count: signoffTaskCount, nextAction: "补齐各角色负责人签字。" },
    { key: "boundary", title: "V1/V2 边界", type: "V1/V2 边界", count: boundaryTaskCount, nextAction: "确认 V1 必做项和计划 V2 差异。" },
  ].map(normalizeRoleTaskBoardCategorySummary);
}

function normalizeRoleTaskBoardRole(value = {}) {
  const tasks = Array.isArray(value?.tasks)
    ? value.tasks.map(normalizeRoleTaskBoardTask).filter((item) => item.id)
    : [];
  return {
    role: cleanText(value?.role),
    taskCount: Number(value?.taskCount) || tasks.length,
    p0TaskCount: Number(value?.p0TaskCount) || tasks.length,
    releaseTaskCount: Number(value?.releaseTaskCount) || 0,
    evidenceTaskCount: Number(value?.evidenceTaskCount) || 0,
    signoffTaskCount: Number(value?.signoffTaskCount) || 0,
    boundaryTaskCount: Number(value?.boundaryTaskCount) || 0,
    tasks,
  };
}

function normalizeRoleTaskBoardTask(value = {}) {
  return {
    id: cleanText(value?.id),
    type: cleanText(value?.type),
    group: cleanText(value?.group),
    title: cleanText(value?.title),
    status: cleanText(value?.status) || "pending",
    priority: cleanText(value?.priority),
    primaryRole: cleanText(value?.primaryRole),
    roles: normalizeStringList(value?.roles),
    action: cleanText(value?.action),
  };
}

function normalizeReleaseGates(gates, fallback) {
  const rows = Array.isArray(gates)
    ? gates.map((item) => [
        cleanText(item?.label),
        cleanText(item?.summary) || (item?.ready ? "通过" : "阻塞"),
        cleanText(item?.status) || (item?.ready ? "ready" : "blocked"),
        cleanText(item?.detail),
      ]).filter((item) => item[0])
    : [];
  if (rows.length) return rows;
  return [
    ["发布候选", cleanText(fallback.releaseGate) || "0/4", "blocked", "生产 env、现场证据、运行时 readiness、现场报告仍未同时通过。"],
    ["运行时门禁", cleanText(fallback.runtimeReadiness) || "5/11", "blocked", "系统持久化、附件留档、打印 spool、CUPS、打印 V1、司机真机仍阻塞。"],
    ["现场任务", fallback.onsiteTaskCount ? `${fallback.onsiteTaskCount} 项` : "52 项", "blocked", "技术/管理、办公室、仓库、司机、财务和车间仍有现场任务。"],
    ["V1/V2 边界", cleanText(fallback.fieldEvidence).includes("签字 0/6") ? "待签字" : "待确认", "pending", "V2 差异已整理，但负责人仍需确认边界。"],
  ];
}

function normalizeModuleCompletionRows(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
        module: cleanText(item?.module),
        requirements: cleanText(item?.requirementCompletion),
        p0Code: cleanText(item?.p0CodeCompletion),
        v1Readiness: cleanText(item?.v1Readiness),
        currentStatus: cleanText(item?.currentStatus),
        remaining: cleanText(item?.remaining),
      })).filter((item) => item.module)
    : [];
}

function normalizeUnblockPlan(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const phases = Array.isArray(source.phases)
    ? source.phases.map(normalizeUnblockPhase).filter((item) => item.key)
    : [];
  return {
    summary: {
      label: cleanText(summary.label),
      taskCount: formatCountLabel(summary.taskCount, "项"),
      releaseTaskCount: formatCountLabel(summary.releaseTaskCount, "项"),
      evidenceTaskCount: formatCountLabel(summary.evidenceTaskCount, "项"),
      signoffTaskCount: formatCountLabel(summary.signoffTaskCount, "项"),
      boundaryTaskCount: formatCountLabel(summary.boundaryTaskCount, "项"),
      phaseCount: Number(summary.phaseCount) || phases.length,
      roleCount: Number(summary.roleCount) || 0,
    },
    phases,
    roleBuckets: Array.isArray(source.roleBuckets)
      ? source.roleBuckets.map((item) => [cleanText(item?.role), String(Number(item?.taskCount) || 0)]).filter((item) => item[0])
      : [],
    firstActions: Array.isArray(source.firstActions)
      ? source.firstActions.map(normalizeUnblockTask).filter((item) => item.title)
      : [],
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeUnblockPhase(value = {}) {
  const releaseTaskCount = Number(value.releaseTaskCount) || 0;
  const evidenceTaskCount = Number(value.evidenceTaskCount) || 0;
  const signoffTaskCount = Number(value.signoffTaskCount) || 0;
  const boundaryTaskCount = Number(value.boundaryTaskCount) || 0;
  const taskCount = Number(value.taskCount) || 0;
  const roles = normalizeStringList(value.roles);
  const groups = Array.isArray(value.groups)
    ? value.groups.map(normalizeUnblockPhaseGroup).filter((item) => item.group)
    : [];
  const firstTasks = Array.isArray(value.firstTasks)
    ? value.firstTasks.map(normalizeUnblockTask).filter((item) => item.title)
    : [];
  return {
    key: cleanText(value.key),
    label: cleanText(value.label),
    taskCount,
    taskCountLabel: taskCount ? `${taskCount} 项` : "",
    releaseTaskCount,
    evidenceTaskCount,
    signoffTaskCount,
    boundaryTaskCount,
    signBoundaryCount: signoffTaskCount + boundaryTaskCount,
    roles: roles.join("、"),
    roleItems: roles,
    nextStep: cleanText(value.nextStep),
    groups,
    groupLabel: groups.length ? `${groups.length} 类` : "",
    firstTasks,
    firstTaskLabel: firstTasks.length ? `${firstTasks.length}/${taskCount || firstTasks.length}` : "",
  };
}

function normalizeUnblockPhaseGroup(value = {}) {
  return {
    group: cleanText(value?.group),
    count: Number(value?.count) || 0,
    countLabel: formatCountLabel(value?.count, "项"),
  };
}

function normalizeUnblockTask(value = {}) {
  if (Array.isArray(value)) {
    const roles = cleanText(value[3]) ? [cleanText(value[3])] : [];
    return {
      type: cleanText(value[0]),
      group: cleanText(value[1]),
      title: cleanText(value[2]),
      primaryRole: cleanText(value[3]),
      roles,
      roleLabel: roles.join("、"),
      status: "pending",
      statusLabel: "待处理",
      action: cleanText(value[4]),
    };
  }
  const roles = normalizeStringList(value?.roles);
  const primaryRole = cleanText(value?.primaryRole) || roles[0] || "";
  return {
    type: cleanText(value?.type),
    group: cleanText(value?.group),
    title: cleanText(value?.title),
    primaryRole,
    roles,
    roleLabel: roles.length ? roles.join("、") : primaryRole,
    status: cleanText(value?.status) || "pending",
    statusLabel: formatUnblockTaskStatusLabel(value?.status),
    action: cleanText(value?.action),
  };
}







function normalizeTopBlockers(value) {
  const blockers = Array.isArray(value)
    ? value.map((item) => cleanText(item?.label || item?.detail)).filter(Boolean)
    : [];
  return blockers.slice(0, 6);
}

function toV2DifferenceItem(text) {
  const clean = cleanText(text);
  const [label, detail] = clean.includes("：") ? clean.split(/：(.+)/) : [clean.split(/[，,。]/)[0], clean];
  return [cleanText(label) || "V2 差异", cleanText(detail) || clean];
}
