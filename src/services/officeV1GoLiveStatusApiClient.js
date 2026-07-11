import { createOfficeV1GoLiveStatusActions } from "./officeV1GoLiveStatusActions.js";

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
  const productionEnvIntakeVerification = normalizeProductionEnvIntakeVerification(source.productionEnvIntakeVerification);
  const productionPersistenceEvidence = normalizeV1ProductionPersistenceEvidence(source.productionPersistenceEvidence);
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
      ["现场证据", fieldEvidenceValue || "0/34", fieldEvidenceValue?.startsWith("0/") ? "danger" : "warning"],
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
    productionEnvIntakeVerification,
    productionPersistenceEvidence,
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
      fieldEvidence: cleanText(completion.fieldEvidence) || "V1 现场证据清单仍阻塞：证据 0/34，签字 0/6",
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

function normalizeFieldEvidenceProgress(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const groups = Array.isArray(source.groups)
    ? source.groups.map(normalizeFieldEvidenceGroup).filter((item) => item.key)
    : [];
  const signoffs = Array.isArray(source.signoffs)
    ? source.signoffs.map(normalizeFieldEvidenceSignoff).filter((item) => item.role)
    : [];
  const missingItems = Array.isArray(source.missingItems)
    ? source.missingItems.map(normalizeFieldEvidenceMissingItem).filter((item) => item.key)
    : [];
  const groupSummaries = Array.isArray(source.groupSummaries)
    ? source.groupSummaries.map(normalizeFieldEvidenceGroupSummary).filter((item) => item.key)
    : buildFallbackFieldEvidenceGroupSummaries(groups, missingItems);
  const signoffBoundaryActions = Array.isArray(source.signoffBoundaryActions)
    ? source.signoffBoundaryActions.map(normalizeFieldEvidenceSignoffBoundaryAction).filter((item) => item.key)
    : [];
  const boundarySource = isPlainObject(source.boundary) ? source.boundary : {};
  const evidenceGroupsTotal = Number(summary.evidenceGroupsTotal) || groups.length;
  const evidenceGroupsReady = Number(summary.evidenceGroupsReady) || groups.filter((item) => item.ready).length;
  const requiredEvidenceItemsTotal =
    Number(summary.requiredEvidenceItemsTotal) ||
    groups.reduce((total, item) => total + item.requiredTotal, 0);
  const requiredEvidenceItemsCompleted =
    Number(summary.requiredEvidenceItemsCompleted) ||
    groups.reduce((total, item) => total + item.completedRequired, 0);
  const requiredSignoffsTotal =
    Number(summary.requiredSignoffsTotal) ||
    signoffs.filter((item) => item.required).length;
  const requiredSignoffsCompleted =
    Number(summary.requiredSignoffsCompleted) ||
    signoffs.filter((item) => item.ready).length;
  const available = source.available === true || groups.length > 0 || signoffs.length > 0;
  const boundaryReady = boundarySource.ready === true;
  const boundaryStatus = cleanText(summary.boundaryStatus || boundarySource.status) || "pending";
  const boundaryLabel = boundaryReady ? "已确认" : "待确认";
  const signoffBoundarySummary = isPlainObject(source.signoffBoundarySummary)
    ? normalizeFieldEvidenceSignoffBoundarySummary(source.signoffBoundarySummary, {
        signoffBoundaryActions,
        requiredSignoffsTotal,
        requiredSignoffsCompleted,
        boundaryReady,
        boundaryStatus,
        boundaryLabel,
      })
    : buildFallbackFieldEvidenceSignoffBoundarySummary({
        signoffBoundaryActions,
        requiredSignoffsTotal,
        requiredSignoffsCompleted,
        boundaryReady,
        boundaryStatus,
        boundaryLabel,
      });

  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    available,
    summary: {
      label: cleanText(summary.label) || "V1 现场证据采集进度：BLOCKED",
      evidenceLabel:
        cleanText(summary.evidenceLabel) ||
        `证据 ${requiredEvidenceItemsCompleted}/${requiredEvidenceItemsTotal}，签字 ${requiredSignoffsCompleted}/${requiredSignoffsTotal}`,
      evidenceGroupsTotal,
      evidenceGroupsReady,
      evidenceGroupsLabel: evidenceGroupsTotal > 0 ? `${evidenceGroupsReady}/${evidenceGroupsTotal}` : "",
      requiredEvidenceItemsTotal,
      requiredEvidenceItemsCompleted,
      evidenceItemsLabel: requiredEvidenceItemsTotal > 0 ? `${requiredEvidenceItemsCompleted}/${requiredEvidenceItemsTotal}` : "",
      requiredSignoffsTotal,
      requiredSignoffsCompleted,
      signoffLabel: requiredSignoffsTotal > 0 ? `${requiredSignoffsCompleted}/${requiredSignoffsTotal}` : "",
      blockingCount: Number(summary.blockingCount) || 0,
      missingEvidenceItemCount: Number(summary.missingEvidenceItemCount) || missingItems.length,
      missingEvidenceItemsShown: Number(summary.missingEvidenceItemsShown) || missingItems.length,
      groupSummaryCount: Number(summary.groupSummaryCount) || groupSummaries.length,
      missingEvidenceItemsLabel: formatShownCountLabel(
        Number(summary.missingEvidenceItemsShown) || missingItems.length,
        Number(summary.missingEvidenceItemCount) || missingItems.length,
      ),
      signoffBoundaryActionCount: Number(summary.signoffBoundaryActionCount) || signoffBoundaryActions.length,
      signoffBoundaryActionsShown: Number(summary.signoffBoundaryActionsShown) || signoffBoundaryActions.length,
      signoffBoundaryActionsLabel: formatShownCountLabel(
        Number(summary.signoffBoundaryActionsShown) || signoffBoundaryActions.length,
        Number(summary.signoffBoundaryActionCount) || signoffBoundaryActions.length,
      ),
      boundaryStatus,
      boundaryLabel,
    },
    groups,
    groupSummaries,
    missingItems,
    signoffBoundarySummary,
    signoffBoundaryActions,
    signoffs,
    boundary: {
      status: boundaryReady ? "confirmed" : boundaryStatus,
      ready: boundaryReady,
      label: boundaryLabel,
      confirmedByFilled: boundarySource.confirmedByFilled === true,
      confirmedAtFilled: boundarySource.confirmedAtFilled === true,
      v1ItemCount: Number(boundarySource.v1ItemCount) || 0,
      v2ItemCount: Number(boundarySource.v2ItemCount) || 0,
      nextAction: cleanText(boundarySource.nextAction),
    },
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeFieldEvidenceDraftFreshness(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const checks = Array.isArray(source.checks)
    ? source.checks.map(normalizeFieldEvidenceIntakeQualityCheck).filter((item) => item.key)
    : [];
  const status = cleanText(source.status || summary.draftFreshnessStatus) || "missing";
  return {
    status,
    ready: source.ready === true,
    label: cleanText(source.label || summary.label) || formatDraftFreshnessStatusLabel(status),
    generatedAt: formatDateTimeLabel(source.generatedAt),
    summary: {
      draftManifestStatus: cleanText(summary.draftManifestStatus) || "missing",
      draftFreshnessStatus: status,
      draftFreshnessLabel: cleanText(source.label || summary.label) || formatDraftFreshnessStatusLabel(status),
      evidenceCsvMatched: summary.evidenceCsvMatched === true,
      signoffBoundaryCsvMatched: summary.signoffBoundaryCsvMatched === true,
      evidenceRowCount: Number(summary.evidenceRowCount) || 0,
      signoffBoundaryRowCount: Number(summary.signoffBoundaryRowCount) || 0,
      draftSnapshotAvailable: summary.draftSnapshotAvailable === true,
      staleReasonCount: Number(summary.staleReasonCount) || 0,
    },
    checks,
    staleReasons: normalizeStringList(source.staleReasons),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeFieldEvidenceIntakeGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const commands = Array.isArray(source.commands)
    ? source.commands.map(normalizeFieldEvidenceIntakeCommand).filter((item) => item.key)
    : [];
  const evidenceRows = Number(summary.evidenceRows) || 0;
  const completedEvidenceRows = Number(summary.completedEvidenceRows) || 0;
  const signoffRows = Number(summary.signoffRows) || 0;
  const completedSignoffRows = Number(summary.completedSignoffRows) || 0;
  const draftManifestStatus = cleanText(summary.draftManifestStatus) || "missing";
  const draftFreshnessStatus = cleanText(summary.draftFreshnessStatus) || "missing";
  const boundaryLabel = cleanText(summary.boundaryLabel) || (summary.boundaryReady === true ? "已确认" : "待确认");
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    available:
      source.available === true ||
      evidenceRows > 0 ||
      signoffRows > 0 ||
      commands.length > 0,
    summary: {
      label: cleanText(summary.label) || "现场证据回填仍未完成",
      evidenceCsvStatus: cleanText(summary.evidenceCsvStatus),
      signoffCsvStatus: cleanText(summary.signoffCsvStatus),
      evidenceRows,
      filledEvidenceRows: Number(summary.filledEvidenceRows) || 0,
      completedEvidenceRows,
      invalidEvidenceRows: Number(summary.invalidEvidenceRows) || 0,
      blockedEvidenceRows: Number(summary.blockedEvidenceRows) || 0,
      notApplicableEvidenceRows: Number(summary.notApplicableEvidenceRows) || 0,
      signoffRows,
      filledSignoffRows: Number(summary.filledSignoffRows) || 0,
      completedSignoffRows,
      invalidSignoffRows: Number(summary.invalidSignoffRows) || 0,
      boundaryStatus: cleanText(summary.boundaryStatus) || "pending",
      boundaryLabel,
      boundaryReady: summary.boundaryReady === true,
      draftManifestStatus,
      draftManifestLabel: formatDraftManifestStatusLabel(draftManifestStatus),
      draftFreshnessStatus,
      draftFreshnessLabel: cleanText(summary.draftFreshnessLabel) || formatDraftFreshnessStatusLabel(draftFreshnessStatus),
      draftFreshnessReady: summary.draftFreshnessReady === true,
      rulesAvailable: summary.rulesAvailable === true,
      commandCount: Number(summary.commandCount) || commands.length,
      evidenceProgressLabel: evidenceRows > 0 ? `${completedEvidenceRows}/${evidenceRows}` : "",
      signoffProgressLabel: signoffRows > 0 ? `${completedSignoffRows}/${signoffRows}` : "",
      commandCountLabel: `${Number(summary.commandCount) || commands.length} 步`,
    },
    ruleTopics: normalizeStringList(source.ruleTopics),
    commands,
    blockedReason: cleanText(source.blockedReason),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeFieldEvidenceIntakeQuality(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const checks = Array.isArray(source.checks)
    ? source.checks.map(normalizeFieldEvidenceIntakeQualityCheck).filter((item) => item.key)
    : [];
  const draftManifestStatus = cleanText(summary.draftManifestStatus) || "missing";
  const draftFreshnessStatus = cleanText(summary.draftFreshnessStatus) || "missing";
  const blockingIssueCount = Number(summary.blockingIssueCount) || checks.filter((item) => item.blocking && !item.ready).length;
  const checkCount = Number(summary.checkCount) || checks.length;
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    available:
      source.available === true ||
      checks.length > 0 ||
      Boolean(cleanText(summary.evidenceProgress || summary.signoffProgress)),
    summary: {
      label: cleanText(summary.label) || "现场回填质量仍未达标",
      evidenceCsvStatus: cleanText(summary.evidenceCsvStatus),
      signoffCsvStatus: cleanText(summary.signoffCsvStatus),
      evidenceProgress: cleanText(summary.evidenceProgress),
      signoffProgress: cleanText(summary.signoffProgress),
      missingEvidenceRows: Number(summary.missingEvidenceRows) || 0,
      missingSignoffRows: Number(summary.missingSignoffRows) || 0,
      filledEvidenceRows: Number(summary.filledEvidenceRows) || 0,
      filledSignoffRows: Number(summary.filledSignoffRows) || 0,
      invalidEvidenceRows: Number(summary.invalidEvidenceRows) || 0,
      invalidSignoffRows: Number(summary.invalidSignoffRows) || 0,
      blockedEvidenceRows: Number(summary.blockedEvidenceRows) || 0,
      notApplicableEvidenceRows: Number(summary.notApplicableEvidenceRows) || 0,
      boundaryStatus: cleanText(summary.boundaryStatus) || "pending",
      boundaryLabel: cleanText(summary.boundaryLabel) || (summary.boundaryReady === true ? "已确认" : "待确认"),
      boundaryReady: summary.boundaryReady === true,
      draftManifestStatus,
      draftManifestLabel: formatDraftManifestStatusLabel(draftManifestStatus),
      draftFreshnessStatus,
      draftFreshnessLabel: cleanText(summary.draftFreshnessLabel) || formatDraftFreshnessStatusLabel(draftFreshnessStatus),
      draftFreshnessReady: summary.draftFreshnessReady === true,
      rulesAvailable: summary.rulesAvailable === true,
      canGenerateDraft: summary.canGenerateDraft === true,
      canRefreshReleaseCandidate: summary.canRefreshReleaseCandidate === true,
      checkCount,
      checkCountLabel: `${checkCount} 项`,
      blockingIssueCount,
      blockingIssueLabel: `${blockingIssueCount} 项`,
      warningIssueCount: Number(summary.warningIssueCount) || 0,
    },
    checks,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeFieldEvidenceIntakeQualityCheck(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || (value?.ready === true ? "passed" : "blocked"),
    ready: value?.ready === true,
    blocking: value?.blocking !== false,
    statusLabel: cleanText(value?.statusLabel) || (value?.ready === true ? "通过" : "阻塞"),
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeV1FieldEvidenceDraftManifestResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const validation = isPlainObject(source.validation) ? source.validation : {};
  const output = isPlainObject(source.output) ? source.output : {};
  const invalidRows = Array.isArray(source.invalidRows)
    ? source.invalidRows.map(normalizeV1FieldEvidenceDraftInvalidRow).filter((item) => item.reason || item.fixHint)
    : [];
  const draftManifestStatus = cleanText(summary.draftManifestStatus || output.draftManifestStatus) || "not_written";
  const invalidRowCount = Number(summary.invalidRowCount) || invalidRows.length;
  const appliedRowCount = Number(summary.appliedRowCount) || 0;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status: cleanText(source.status) || "blocked",
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "草稿已通过"
        : invalidRowCount > 0
          ? "CSV 需修正"
          : output.draftWritten === true
            ? "草稿已生成"
            : "草稿未生成",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    generatedAt: formatDateTimeLabel(source.generatedAt),
    summary: {
      appliedRowCount,
      appliedEvidenceRowCount: Number(summary.appliedEvidenceRowCount) || 0,
      appliedSignoffRowCount: Number(summary.appliedSignoffRowCount) || 0,
      appliedBoundaryRowCount: Number(summary.appliedBoundaryRowCount) || 0,
      skippedRowCount: Number(summary.skippedRowCount) || 0,
      invalidRowCount,
      appliedLabel: `${appliedRowCount} 行`,
      invalidLabel: `${invalidRowCount} 行`,
      evidenceLabel: cleanText(summary.evidenceLabel),
      evidenceProgress: cleanText(summary.evidenceProgress),
      signoffProgress: cleanText(summary.signoffProgress),
      boundaryStatus: cleanText(summary.boundaryStatus),
      boundaryLabel: cleanText(summary.boundaryStatus) === "confirmed" ? "已确认" : "待确认",
      draftManifestStatus,
      draftManifestLabel: draftManifestStatus === "available" ? "已生成" : "未生成",
      inputSnapshot: isPlainObject(summary.inputSnapshot)
        ? {
            schema: cleanText(summary.inputSnapshot.schema),
            evidenceCsvIncluded: summary.inputSnapshot.evidenceCsvIncluded === true,
            evidenceRowCount: Number(summary.inputSnapshot.evidenceRowCount) || 0,
            signoffBoundaryCsvIncluded: summary.inputSnapshot.signoffBoundaryCsvIncluded === true,
            signoffBoundaryRowCount: Number(summary.inputSnapshot.signoffBoundaryRowCount) || 0,
            rawCsvIncluded: false,
            digestValuesIncluded: false,
          }
        : null,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
    },
    validation: {
      status: cleanText(validation.status),
      ready: validation.ready === true,
      label: cleanText(validation.label),
    },
    output: {
      draftWritten: output.draftWritten === true,
      sourceManifestMutated: output.sourceManifestMutated === true,
      releaseCandidateRefreshed: output.releaseCandidateRefreshed === true,
    },
    invalidRows,
    invalidRowsShown: Number(source.invalidRowsShown) || invalidRows.length,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1FieldEvidenceDraftValidationResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const boundary = isPlainObject(source.boundary) ? source.boundary : {};
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(normalizeV1FieldEvidenceValidationBlocker).filter((item) => item.label || item.nextAction)
    : [];
  const groups = Array.isArray(source.groups)
    ? source.groups.map(normalizeV1FieldEvidenceValidationGroup).filter((item) => item.label)
    : [];
  const signoffs = Array.isArray(source.signoffs)
    ? source.signoffs.map(normalizeV1FieldEvidenceValidationSignoff).filter((item) => item.role)
    : [];
  const blockingIssueCount = Number(summary.blockingIssueCount) || blockers.length;
  const draftManifestStatus = cleanText(summary.draftManifestStatus) || "missing";
  const draftFreshnessStatus = cleanText(summary.draftFreshnessStatus) || "missing";
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status: cleanText(source.status) || "blocked",
    ready: source.ready === true,
    schemaValid: source.schemaValid !== false,
    statusLabel:
      source.ready === true
        ? "校验通过"
        : source.schemaValid === false
          ? "格式错误"
          : draftManifestStatus === "available"
            ? "校验未通过"
            : "草稿缺失",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label),
      evidenceProgress: cleanText(summary.evidenceProgress) || "0/34",
      signoffProgress: cleanText(summary.signoffProgress) || "0/6",
      evidenceGroupsReadyLabel: cleanText(summary.evidenceGroupsReadyLabel) || "0/6",
      blockingIssueCount,
      blockingIssueLabel: `${blockingIssueCount} 项`,
      blockerShownCount: Number(summary.blockerShownCount) || blockers.length,
      draftManifestStatus,
      draftManifestLabel: draftManifestStatus === "available" ? "已生成" : "未生成",
      draftFreshnessStatus,
      draftFreshnessLabel: cleanText(summary.draftFreshnessLabel) || formatDraftFreshnessStatusLabel(draftFreshnessStatus),
      draftFreshnessReady: summary.draftFreshnessReady === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
    },
    blockers,
    groups,
    signoffs,
    boundary: {
      status: cleanText(boundary.status) || "pending",
      label: cleanText(boundary.label) || (boundary.ready === true ? "已确认" : "待确认"),
      ready: boundary.ready === true,
      confirmedByFilled: boundary.confirmedByFilled === true,
      confirmedAtFilled: boundary.confirmedAtFilled === true,
    },
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const checks = Array.isArray(source.checks)
    ? source.checks.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  const blockingChecks = Array.isArray(source.blockingChecks) && source.blockingChecks.length
    ? source.blockingChecks.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : checks.filter((item) => item.severity === "blocking" && !item.ready);
  const warningChecks = Array.isArray(source.warningChecks) && source.warningChecks.length
    ? source.warningChecks.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : checks.filter((item) => item.severity === "warning" && !item.ready);
  const passedCount = Number(summary.passedCount) || checks.filter((item) => item.ready || item.status === "passed").length;
  const totalCount = Number(summary.totalCount) || checks.length;
  const blockingCount = Number(summary.blockingCount) || blockingChecks.length;
  const warningCount = Number(summary.warningCount) || warningChecks.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/10");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const stageDiagnosisSource = isPlainObject(source.stageDiagnosis) ? source.stageDiagnosis : {};
  const summarySourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  const stageDiagnosisSourceStatuses = Array.isArray(stageDiagnosisSource.sourceStatuses)
    ? stageDiagnosisSource.sourceStatuses
        .map(normalizeV1ProductionEnvFileAuditConfigSourceStatus)
        .filter((item) => item.envVariable)
    : [];
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "not_configured"
          ? "未配置"
          : status === "audit_blocked"
            ? "审计阻塞"
            : status === "error"
              ? "预检失败"
              : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前运行环境已通过生产 env 预检" : "当前运行环境仍未通过生产 env 预检"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      warningCount,
      warningLabel: `${warningCount} 项`,
      placeholderValueCount: Number(summary.placeholderValueCount) || 0,
      envFileCount: Number(summary.envFileCount) || 0,
      configuredEnvFileCount: Number(summary.configuredEnvFileCount) || 0,
      currentRuntime: summary.currentRuntime === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathConfigured: summary.envFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind),
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      auditOnlySourceUsed: summary.auditOnlySourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      ignoredConfiguredFallbackVariableCount: Number(summary.ignoredConfiguredFallbackVariableCount) || 0,
      ignoredConfiguredAuditOnlyVariableCount: Number(summary.ignoredConfiguredAuditOnlyVariableCount) || 0,
      sourceStatuses: summarySourceStatuses,
      appliedInMemory: summary.appliedInMemory === true,
      processEnvMutated: summary.processEnvMutated === true,
      envPreflightReady: summary.envPreflightReady === true,
      envFileAuditReady: summary.envFileAuditReady === true,
      envFileAuditStatus: cleanText(summary.envFileAuditStatus),
      envFileAuditStatusLabel: cleanText(summary.envFileAuditStatusLabel),
      envFileAuditBlockingCount: Number(summary.envFileAuditBlockingCount) || 0,
      currentStage: cleanText(summary.currentStage),
      currentStageLabel: cleanText(summary.currentStageLabel),
      stageStatus: cleanText(summary.stageStatus),
      stageStatusLabel: cleanText(summary.stageStatusLabel),
      nextStage: cleanText(summary.nextStage),
      nextStageLabel: cleanText(summary.nextStageLabel),
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      blockerCount: Number(summary.blockerCount) || blockingChecks.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingChecks.length} 项`,
      warningCheckCount: Number(summary.warningCheckCount) || warningChecks.length,
    },
    checks,
    blockingChecks,
    warningChecks,
    stageDiagnosis: {
      currentStage: cleanText(stageDiagnosisSource.currentStage) || cleanText(summary.currentStage),
      currentStageLabel: cleanText(stageDiagnosisSource.currentStageLabel) || cleanText(summary.currentStageLabel),
      stageStatus: cleanText(stageDiagnosisSource.stageStatus) || cleanText(summary.stageStatus),
      stageStatusLabel: cleanText(stageDiagnosisSource.stageStatusLabel) || cleanText(summary.stageStatusLabel),
      nextStage: cleanText(stageDiagnosisSource.nextStage) || cleanText(summary.nextStage),
      nextStageLabel: cleanText(stageDiagnosisSource.nextStageLabel) || cleanText(summary.nextStageLabel),
      auditReady: stageDiagnosisSource.auditReady === true || summary.envFileAuditReady === true,
      envPreflightReady: stageDiagnosisSource.envPreflightReady === true || summary.envPreflightReady === true,
      envFilePathConfigured: stageDiagnosisSource.envFilePathConfigured === true || summary.envFilePathConfigured === true,
      appliedInMemory: stageDiagnosisSource.appliedInMemory === true || summary.appliedInMemory === true,
      processEnvMutated: stageDiagnosisSource.processEnvMutated === true || summary.processEnvMutated === true,
      selectedEnvVariable: cleanText(stageDiagnosisSource.selectedEnvVariable) || cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(stageDiagnosisSource.selectedEnvVariableLabel) || cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(stageDiagnosisSource.selectedSourceKind) || cleanText(summary.selectedSourceKind),
      fallbackSourceUsed: stageDiagnosisSource.fallbackSourceUsed === true || summary.fallbackSourceUsed === true,
      auditOnlySourceUsed: stageDiagnosisSource.auditOnlySourceUsed === true || summary.auditOnlySourceUsed === true,
      configuredSourceVariableCount:
        Number(stageDiagnosisSource.configuredSourceVariableCount) || Number(summary.configuredSourceVariableCount) || 0,
      ignoredConfiguredFallbackVariableCount:
        Number(stageDiagnosisSource.ignoredConfiguredFallbackVariableCount) ||
        Number(summary.ignoredConfiguredFallbackVariableCount) ||
        0,
      ignoredConfiguredAuditOnlyVariableCount:
        Number(stageDiagnosisSource.ignoredConfiguredAuditOnlyVariableCount) ||
        Number(summary.ignoredConfiguredAuditOnlyVariableCount) ||
        0,
      sourceStatuses: stageDiagnosisSourceStatuses.length ? stageDiagnosisSourceStatuses : summarySourceStatuses,
      pathValueExposed: stageDiagnosisSource.pathValueExposed === true,
      detail: cleanText(stageDiagnosisSource.detail),
      nextAction: cleanText(stageDiagnosisSource.nextAction),
    },
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvFileAuditLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const files = Array.isArray(source.files)
    ? source.files.map(normalizeV1ProductionEnvFileAuditFile).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeV1ProductionEnvFileAuditFinding).filter((item) => item.label)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeV1ProductionEnvFileAuditFinding).filter((item) => item.label)
    : [];
  const blockingCount = Number(summary.blockingCount) || blockingFindings.length;
  const warningCount = Number(summary.warningCount) || warningFindings.length;
  const status = cleanText(source.status) || (source.ready === true ? "passed" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "not_configured"
          ? "未配置"
          : status === "error"
            ? "预检失败"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "服务端 env 文件安全审计仍未通过",
      auditLabel: cleanText(summary.auditLabel),
      auditStatus: cleanText(summary.auditStatus),
      auditStatusLabel: cleanText(summary.auditStatusLabel),
      envFileCount: Number(summary.envFileCount) || files.length,
      configuredEnvFileCount: Number(summary.configuredEnvFileCount) || 0,
      fileCount: Number(summary.fileCount) || files.length,
      blockingCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      warningCount,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      passedCount: Number(summary.passedCount) || 0,
      placeholderAssignmentCount: Number(summary.placeholderAssignmentCount) || 0,
      uncommentedAssignmentCount: Number(summary.uncommentedAssignmentCount) || 0,
      sensitiveVariableNameCount: Number(summary.sensitiveVariableNameCount) || 0,
      crossFileDuplicateVariableCount: Number(summary.crossFileDuplicateVariableCount) || 0,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathConfigured: summary.envFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind),
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      auditOnlySourceUsed: summary.auditOnlySourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      ignoredConfiguredFallbackVariableCount: Number(summary.ignoredConfiguredFallbackVariableCount) || 0,
      ignoredConfiguredAuditOnlyVariableCount: Number(summary.ignoredConfiguredAuditOnlyVariableCount) || 0,
      currentRuntime: summary.currentRuntime === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    files,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvFileAuditServerConfigGuidance(value = {}, defaults = {}) {
  const source = isPlainObject(value) ? value : {};
  const fallbackEnvVariables = normalizeStringList(source.fallbackEnvVariables);
  const defaultFallbackEnvVariables = normalizeStringList(defaults.fallbackEnvVariables);
  const sourceStatuses = Array.isArray(source.sourceStatuses)
    ? source.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  return {
    label: cleanText(source.label),
    status: cleanText(source.status) || "not_configured",
    ready: source.ready === true,
    applyEnableEnvVariable: cleanText(source.applyEnableEnvVariable),
    applyEnabled: source.applyEnabled === true,
    primaryEnvVariable: cleanText(source.primaryEnvVariable) || cleanText(defaults.primaryEnvVariable) || "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    fallbackEnvVariables: fallbackEnvVariables.length
      ? fallbackEnvVariables
      : defaultFallbackEnvVariables.length
        ? defaultFallbackEnvVariables
        : ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE"],
    selectedEnvVariable: cleanText(source.selectedEnvVariable),
    selectedEnvVariableLabel: cleanText(source.selectedEnvVariableLabel),
    selectedSourceKind: cleanText(source.selectedSourceKind) || "none",
    fallbackSourceUsed: source.fallbackSourceUsed === true,
    auditOnlySourceUsed: source.auditOnlySourceUsed === true,
    configuredSourceVariableCount: Number(source.configuredSourceVariableCount) || 0,
    ignoredConfiguredFallbackVariableCount: Number(source.ignoredConfiguredFallbackVariableCount) || 0,
    ignoredConfiguredAuditOnlyVariableCount: Number(source.ignoredConfiguredAuditOnlyVariableCount) || 0,
    sourceStatuses,
    configuredEnvFileCount: Number(source.configuredEnvFileCount) || 0,
    configuredValuesFileCount: Number(source.configuredValuesFileCount) || 0,
    targetSetupStatus: normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus),
    targetSetupReady: source.targetSetupReady === true,
    targetSetupReportAvailable: source.targetSetupReportAvailable === true,
    targetSetupEnvFileCount: Number(source.targetSetupEnvFileCount) || 0,
    targetEnvFileConfigured: source.targetEnvFileConfigured === true,
    targetEnvFilePathExposed: source.targetEnvFilePathExposed === true,
    valuesFileAuditStatus: cleanText(source.valuesFileAuditStatus) || "not_run",
    valuesFileAuditReady: source.valuesFileAuditReady === true,
    valuesFileAuditExecuted: source.valuesFileAuditExecuted === true,
    valuesFileAuditBlockingCount: Number(source.valuesFileAuditBlockingCount) || 0,
    valuesFileAuditWarningCount: Number(source.valuesFileAuditWarningCount) || 0,
    valuesFileAuditPathExposed: source.valuesFileAuditPathExposed === true,
    valuesFileAuditValuesIncluded: source.valuesFileAuditValuesIncluded === true,
    dryRunProofStatus: cleanText(source.dryRunProofStatus) || "missing",
    dryRunProofReady: source.dryRunProofReady === true,
    dryRunProofIncluded: source.dryRunProofIncluded === true,
    dryRunProofStatusLabel: cleanText(source.dryRunProofStatusLabel) || "未生成",
    ...normalizeProductionEnvValuesDryRunProofFreshness(source),
    ...normalizeProductionEnvValuesDryRunProofFingerprint(source),
    dryRunProofMinimumBlockingLabel: cleanText(source.dryRunProofMinimumBlockingLabel),
    dryRunProofMinimumBlockingTargetCount: Number(source.dryRunProofMinimumBlockingTargetCount) || 0,
    dryRunProofMinimumBlockingSatisfiedCount: Number(source.dryRunProofMinimumBlockingSatisfiedCount) || 0,
    dryRunProofMinimumBlockingMissingCount: Number(source.dryRunProofMinimumBlockingMissingCount) || 0,
    dryRunProofNextAction: cleanText(source.dryRunProofNextAction),
    intakeVerificationStatus: cleanText(source.intakeVerificationStatus),
    intakeVerificationReady: source.intakeVerificationReady === true,
    intakeVerificationAvailable: source.intakeVerificationAvailable === true,
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel),
    minimumBlockingTargetCount: Number(source.minimumBlockingTargetCount) || 0,
    minimumBlockingSatisfiedCount: Number(source.minimumBlockingSatisfiedCount) || 0,
    minimumBlockingMissingCount: Number(source.minimumBlockingMissingCount) || 0,
    minimumBlockingVariableRowCount: Number(source.minimumBlockingVariableRowCount) || 0,
    minimumBlockingAlternativeGroupCount: Number(source.minimumBlockingAlternativeGroupCount) || 0,
    minimumWarningLabel: cleanText(source.minimumWarningLabel),
    minimumWarningMissingCount: Number(source.minimumWarningMissingCount) || 0,
    fullIntakeConfiguredLabel: cleanText(source.fullIntakeConfiguredLabel),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    restartRequired: source.restartRequired !== false,
    currentAuditStatus: cleanText(source.currentAuditStatus),
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvValuesDryRunProofStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const freshness = normalizeProductionEnvValuesDryRunProofFreshness(source);
  return {
    available: source.available === true,
    status: cleanText(source.status) || "missing",
    ready: source.ready === true,
    included: source.included === true,
    statusLabel: cleanText(source.statusLabel) || "未生成",
    label: cleanText(source.label),
    ...freshness,
    valuesFingerprintStatus: cleanText(source.valuesFingerprintStatus) || "not_checked",
    valuesFingerprintStatusLabel: cleanText(source.valuesFingerprintStatusLabel) || "未检查",
    valuesFingerprintCompared: source.valuesFingerprintCompared === true,
    valuesFingerprintIncluded: source.valuesFingerprintIncluded === true,
    valuesFingerprintMatched: source.valuesFingerprintMatched === true,
    valuesFingerprintDigestExposed: source.valuesFingerprintDigestExposed === true,
    valuesFingerprintValuesExposed: source.valuesFingerprintValuesExposed === true,
    valuesFileUnchangedAfterProof: source.valuesFileUnchangedAfterProof === true,
    targetEnvFileUnchangedAfterProof: source.targetEnvFileUnchangedAfterProof === true,
    fileBindingStatus: isPlainObject(source.fileBindingStatus) ? source.fileBindingStatus : {},
    firstStageStatus: cleanText(source.firstStageStatus),
    firstStageLabel: cleanText(source.firstStageLabel),
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel),
    minimumBlockingTargetCount: Number(source.minimumBlockingTargetCount) || 0,
    minimumBlockingSatisfiedCount: Number(source.minimumBlockingSatisfiedCount) || 0,
    minimumBlockingMissingCount: Number(source.minimumBlockingMissingCount) || 0,
    envPreflightLabel: cleanText(source.envPreflightLabel),
    intakeLabel: cleanText(source.intakeLabel),
    targetWouldBeWritten: source.targetWouldBeWritten === true,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvValuesDryRunProofFreshness(source = {}, fallback = {}) {
  const normalizedSource = isPlainObject(source) ? source : {};
  const normalizedFallback = isPlainObject(fallback) ? fallback : {};
  const maxAgeRaw = normalizedSource.dryRunProofMaxAgeHours ?? normalizedSource.maxAgeHours ?? normalizedFallback.dryRunProofMaxAgeHours;
  const ageRaw = normalizedSource.dryRunProofAgeHours ?? normalizedSource.ageHours ?? normalizedFallback.dryRunProofAgeHours;
  const remainingRaw =
    normalizedSource.dryRunProofRemainingHours ??
    normalizedSource.remainingHours ??
    normalizedFallback.dryRunProofRemainingHours;
  const maxAgeNumber = Number(maxAgeRaw);
  const ageNumber = Number(ageRaw);
  const remainingNumber =
    remainingRaw === null || remainingRaw === undefined || remainingRaw === "" ? NaN : Number(remainingRaw);
  const freshnessStatus =
    cleanText(normalizedSource.dryRunProofFreshnessStatus || normalizedSource.freshnessStatus) ||
    cleanText(normalizedFallback.dryRunProofFreshnessStatus) ||
    "missing";
  const freshnessLabel =
    cleanText(normalizedSource.dryRunProofFreshnessLabel || normalizedSource.freshnessLabel) ||
    cleanText(normalizedFallback.dryRunProofFreshnessLabel) ||
    "未生成";
  return {
    dryRunProofFresh:
      normalizedSource.dryRunProofFresh === true ||
      normalizedSource.fresh === true ||
      normalizedFallback.dryRunProofFresh === true,
    dryRunProofFreshnessStatus: freshnessStatus,
    dryRunProofFreshnessLabel: freshnessLabel,
    dryRunProofMaxAgeHours: Number.isFinite(maxAgeNumber) ? maxAgeNumber : Number(normalizedFallback.dryRunProofMaxAgeHours) || 0,
    dryRunProofAgeHours: Number.isFinite(ageNumber) ? ageNumber : null,
    dryRunProofExpiresAt: formatDateTimeLabel(
      normalizedSource.dryRunProofExpiresAt ||
        normalizedSource.expiresAt ||
        normalizedFallback.dryRunProofExpiresAt,
    ),
    dryRunProofRemainingHours: Number.isFinite(remainingNumber) ? remainingNumber : null,
    dryRunProofCheckedAtIncluded:
      normalizedSource.dryRunProofCheckedAtIncluded === true ||
      normalizedSource.checkedAtIncluded === true ||
      normalizedFallback.dryRunProofCheckedAtIncluded === true,
    dryRunProofCheckedAt:
      formatDateTimeLabel(
        normalizedSource.dryRunProofCheckedAt ||
          normalizedSource.checkedAt ||
          normalizedSource.dryRunCheckedAt ||
          normalizedFallback.dryRunProofCheckedAt,
      ),
  };
}

function normalizeProductionEnvValuesDryRunProofFingerprint(source = {}, fallback = {}) {
  const normalizedSource = isPlainObject(source) ? source : {};
  const normalizedFallback = isPlainObject(fallback) ? fallback : {};
  return {
    dryRunProofValuesFingerprintStatus:
      cleanText(normalizedSource.dryRunProofValuesFingerprintStatus || normalizedSource.valuesFingerprintStatus) ||
      cleanText(normalizedFallback.dryRunProofValuesFingerprintStatus) ||
      "not_checked",
    dryRunProofValuesFingerprintStatusLabel:
      cleanText(
        normalizedSource.dryRunProofValuesFingerprintStatusLabel ||
          normalizedSource.valuesFingerprintStatusLabel,
      ) ||
      cleanText(normalizedFallback.dryRunProofValuesFingerprintStatusLabel) ||
      "未检查",
    dryRunProofValuesFingerprintCompared:
      normalizedSource.dryRunProofValuesFingerprintCompared === true ||
      normalizedSource.valuesFingerprintCompared === true ||
      normalizedFallback.dryRunProofValuesFingerprintCompared === true,
    dryRunProofValuesFingerprintIncluded:
      normalizedSource.dryRunProofValuesFingerprintIncluded === true ||
      normalizedSource.valuesFingerprintIncluded === true ||
      normalizedFallback.dryRunProofValuesFingerprintIncluded === true,
    dryRunProofValuesFingerprintMatched:
      normalizedSource.dryRunProofValuesFingerprintMatched === true ||
      normalizedSource.valuesFingerprintMatched === true ||
      normalizedFallback.dryRunProofValuesFingerprintMatched === true,
    dryRunProofValuesFingerprintDigestExposed:
      normalizedSource.dryRunProofValuesFingerprintDigestExposed === true ||
      normalizedFallback.dryRunProofValuesFingerprintDigestExposed === true,
    dryRunProofValuesFingerprintValuesExposed:
      normalizedSource.dryRunProofValuesFingerprintValuesExposed === true ||
      normalizedFallback.dryRunProofValuesFingerprintValuesExposed === true,
    dryRunProofValuesFileUnchangedAfterProof:
      normalizedSource.dryRunProofValuesFileUnchangedAfterProof === true ||
      normalizedSource.valuesFileUnchangedAfterProof === true ||
      normalizedFallback.dryRunProofValuesFileUnchangedAfterProof === true,
    dryRunProofTargetEnvFileUnchangedAfterProof:
      normalizedSource.dryRunProofTargetEnvFileUnchangedAfterProof === true ||
      normalizedSource.targetEnvFileUnchangedAfterProof === true ||
      normalizedFallback.dryRunProofTargetEnvFileUnchangedAfterProof === true,
  };
}

function normalizeV1ProductionEnvFileAuditConfigSourceStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    envVariable: cleanText(source.envVariable),
    kind: cleanText(source.kind) || "fallback",
    label: cleanText(source.label) || "变量",
    order: Number(source.order) || 0,
    selectable: source.selectable !== false,
    configured: source.configured === true,
    selected: source.selected === true,
    ignored: source.ignored === true,
    envFileCount: Number(source.envFileCount) || 0,
  };
}

function normalizeProductionEnvSetupTargetStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const envFileCount = Number(summary.envFileCount) || 0;
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  return {
    available: source.available === true,
    status: cleanText(source.status) || "not_configured",
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已就绪"
        : cleanText(source.status) === "not_configured"
          ? "未配置"
          : "未就绪",
    summary: {
      label: cleanText(summary.label) || "production env setup 目标 env 未就绪",
      setupReportAvailable: summary.setupReportAvailable === true,
      setupReady: summary.setupReady === true,
      envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || envFileCount > 0,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup !== false,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
    },
    blockingItems,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvSetupLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const setup = normalizeProductionEnvSetupReport(source.setup);
  const setupFindings = Array.isArray(source.setupFindings)
    ? source.setupFindings.map(normalizeProductionEnvSetupFinding).filter((item) => item.label)
    : setup.setupFindings;
  const remainingFixItems = Array.isArray(source.remainingFixItems)
    ? source.remainingFixItems.map(normalizeProductionEnvSetupRemainingFixItem).filter((item) => item.label)
    : setup.envPreflight.remainingFixItems;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : setup.status || "blocked");
  const blockingCount = Number(summary.blockingCount) || setupFindings.length;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "prepared"
          ? "草稿已准备"
          : status === "error"
            ? "执行失败"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产 env 安全草稿已准备",
      setupLabel: cleanText(summary.setupLabel) || setup.summary.label,
      setupStatus: cleanText(summary.setupStatus) || setup.status,
      setupReady: summary.setupReady === true || setup.setupReady === true,
      productionReady: summary.productionReady === true || source.ready === true,
      generated: summary.generated === true,
      imported: summary.imported === true,
      overwritten: summary.overwritten === true,
      targetExistedBefore: summary.targetExistedBefore === true,
      auditReady: summary.auditReady === true || setup.audit.ready === true,
      auditStatus: cleanText(summary.auditStatus) || setup.audit.status,
      envPreflightReady: summary.envPreflightReady === true || setup.envPreflight.ready === true,
      envPreflightStatus: cleanText(summary.envPreflightStatus) || setup.envPreflight.status,
      envPreflightLabel: cleanText(summary.envPreflightLabel) || setup.envPreflight.readinessLabel,
      envPreflightPassedCount: Number(summary.envPreflightPassedCount) || setup.envPreflight.passedCount,
      envPreflightTotalCount: Number(summary.envPreflightTotalCount) || setup.envPreflight.totalCount,
      envPreflightBlockingCount: Number(summary.envPreflightBlockingCount) || setup.envPreflight.blockingCount,
      envPreflightWarningCount: Number(summary.envPreflightWarningCount) || setup.envPreflight.warningCount,
      remainingFixItemCount: Number(summary.remainingFixItemCount) || remainingFixItems.length,
      blockingCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      frontendTargetPathAccepted: summary.frontendTargetPathAccepted === true,
      frontendImportPathAccepted: summary.frontendImportPathAccepted === true,
      frontendEnvValuesAccepted: summary.frontendEnvValuesAccepted === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true,
      targetEnvFileWritten: summary.targetEnvFileWritten === true,
      targetEnvFileOverwritten: summary.targetEnvFileOverwritten === true,
      targetEnvDraftMayBeCreated: summary.targetEnvDraftMayBeCreated === true,
      productionEnvRealValuesWritten: summary.productionEnvRealValuesWritten === true,
      setupReportRefreshed: summary.setupReportRefreshed === true,
      productionEnvValuesApplyExecuted: summary.productionEnvValuesApplyExecuted === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    setup,
    setupFindings,
    remainingFixItems,
    serverConfigGuidance: normalizeProductionEnvSetupServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvSetupReport(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const envFile = isPlainObject(source.envFile) ? source.envFile : {};
  const audit = isPlainObject(source.audit) ? source.audit : {};
  const envPreflight = isPlainObject(source.envPreflight) ? source.envPreflight : {};
  const remainingFixItems = Array.isArray(envPreflight.remainingFixItems)
    ? envPreflight.remainingFixItems.map(normalizeProductionEnvSetupRemainingFixItem).filter((item) => item.label)
    : [];
  const setupFindings = Array.isArray(source.setupFindings)
    ? source.setupFindings.map(normalizeProductionEnvSetupFinding).filter((item) => item.label)
    : [];
  const commands = Array.isArray(source.commands)
    ? source.commands.map((item) => ({
        key: cleanText(item?.key),
        label: cleanText(item?.label),
        command: cleanText(item?.command),
      })).filter((item) => item.label)
    : [];
  return {
    available: source.available === true,
    status: cleanText(source.status) || "missing",
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产 env setup 报告未生成",
      generated: summary.generated === true,
      imported: summary.imported === true,
      overwritten: summary.overwritten === true,
      targetExistedBefore: summary.targetExistedBefore === true,
      setupBlockingCount: Number(summary.setupBlockingCount) || setupFindings.length,
      auditReady: summary.auditReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightPassedCount: Number(summary.envPreflightPassedCount) || 0,
      envPreflightTotalCount: Number(summary.envPreflightTotalCount) || 0,
      envPreflightBlockingCount: Number(summary.envPreflightBlockingCount) || 0,
      envPreflightWarningCount: Number(summary.envPreflightWarningCount) || 0,
      envPreflightLabel: cleanText(summary.envPreflightLabel),
      remainingFixItemCount: Number(summary.remainingFixItemCount) || remainingFixItems.length,
    },
    envFile: {
      insideWorkspace: envFile.insideWorkspace === true,
      gitIgnored: envFile.gitIgnored === true,
      gitTracked: envFile.gitTracked === true,
      existedBefore: envFile.existedBefore === true,
      generated: envFile.generated === true,
      imported: envFile.imported === true,
      overwritten: envFile.overwritten === true,
      fileMode: cleanText(envFile.fileMode),
      assignmentCount: Number(envFile.assignmentCount) || 0,
      placeholderAssignmentCount: Number(envFile.placeholderAssignmentCount) || 0,
      pathExposed: envFile.pathExposed === true,
    },
    audit: {
      status: cleanText(audit.status),
      ready: audit.ready === true,
      blockingCount: Number(audit.blockingCount) || 0,
      warningCount: Number(audit.warningCount) || 0,
      crossFileDuplicateVariableCount: Number(audit.crossFileDuplicateVariableCount) || 0,
    },
    envPreflight: {
      status: cleanText(envPreflight.status),
      ready: envPreflight.ready === true,
      passedCount: Number(envPreflight.passedCount) || 0,
      totalCount: Number(envPreflight.totalCount) || 0,
      readinessLabel: cleanText(envPreflight.readinessLabel),
      blockingCount: Number(envPreflight.blockingCount) || 0,
      warningCount: Number(envPreflight.warningCount) || 0,
      remainingFixItems,
    },
    setupFindings,
    commands,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvSetupRemainingFixItem(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    status: cleanText(value?.status) || "pending",
    statusLabel: formatUnblockTaskStatusLabel(cleanText(value?.status) || "pending"),
    missingVariables: normalizeStringList(value?.missingVariables),
    placeholderVariables: normalizeStringList(value?.placeholderVariables),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeProductionEnvSetupFinding(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    severity: cleanText(value?.severity) || "blocking",
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeProductionEnvSetupServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    targetSource: cleanText(source.targetSource),
    templateSource: cleanText(source.templateSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendTargetPath: source.acceptsFrontendTargetPath === true,
    acceptsFrontendImportPath: source.acceptsFrontendImportPath === true,
    acceptsFrontendEnvValues: source.acceptsFrontendEnvValues === true,
    targetEnvFilePathExposed: source.targetEnvFilePathExposed === true,
    forceOverwriteEnabled: source.forceOverwriteEnabled === true,
    importFromEnabled: source.importFromEnabled === true,
    setupReportRefreshed: source.setupReportRefreshed === true,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvValuesFragmentSourceStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const serverConfigGuidance = normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
  });
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : serverConfigGuidance.sourceStatuses;
  const status = cleanText(source.status) || "not_configured";
  const configuredValuesFileCount = Number(summary.configuredValuesFileCount) || 0;
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  return {
    available: source.available === true,
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已配置"
        : status === "multiple_configured"
          ? "来源不唯一"
          : status === "audit_blocked"
            ? "审计未过"
          : status === "target_not_ready"
            ? "目标 env 未就绪"
            : status === "dry_run_not_ready"
              ? "dry-run 未通过"
              : "未配置",
    summary: {
      label: cleanText(summary.label) || "服务端真实值片段来源未配置",
      configuredValuesFileCount,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      primaryEnvVariable: cleanText(summary.primaryEnvVariable) || serverConfigGuidance.primaryEnvVariable,
      fallbackEnvVariables: normalizeStringList(summary.fallbackEnvVariables).length
        ? normalizeStringList(summary.fallbackEnvVariables)
        : serverConfigGuidance.fallbackEnvVariables,
      acceptsFrontendPath: summary.acceptsFrontendPath === true,
      pathValueExposed: summary.pathValueExposed === true,
      restartRequired: summary.restartRequired !== false,
      dryRunExecuted: summary.dryRunExecuted === true,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetSetupStatus: cleanText(summary.targetSetupStatus) || targetSetupStatus.status,
      targetSetupReady: summary.targetSetupReady === true,
      targetSetupReportAvailable: summary.targetSetupReportAvailable === true,
      targetSetupEnvFileCount: Number(summary.targetSetupEnvFileCount) || targetSetupStatus.summary.envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || targetSetupStatus.summary.targetEnvFileConfigured,
      valuesFileAuditStatus: cleanText(summary.valuesFileAuditStatus) || "not_run",
      valuesFileAuditReady: summary.valuesFileAuditReady === true,
      valuesFileAuditExecuted: summary.valuesFileAuditExecuted === true,
      valuesFileAuditBlockingCount: Number(summary.valuesFileAuditBlockingCount) || 0,
      valuesFileAuditWarningCount: Number(summary.valuesFileAuditWarningCount) || 0,
      valuesFileAuditPathExposed: summary.valuesFileAuditPathExposed === true,
      valuesFileAuditValuesIncluded: summary.valuesFileAuditValuesIncluded === true,
      dryRunProofStatus: cleanText(summary.dryRunProofStatus) || serverConfigGuidance.dryRunProofStatus,
      dryRunProofReady: summary.dryRunProofReady === true,
      dryRunProofIncluded: summary.dryRunProofIncluded === true,
      dryRunProofStatusLabel: cleanText(summary.dryRunProofStatusLabel) || serverConfigGuidance.dryRunProofStatusLabel,
      ...normalizeProductionEnvValuesDryRunProofFreshness(summary, serverConfigGuidance),
      ...normalizeProductionEnvValuesDryRunProofFingerprint(summary, serverConfigGuidance),
      dryRunProofMinimumBlockingLabel:
        cleanText(summary.dryRunProofMinimumBlockingLabel) || serverConfigGuidance.dryRunProofMinimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount:
        Number(summary.dryRunProofMinimumBlockingTargetCount) || serverConfigGuidance.dryRunProofMinimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount:
        Number(summary.dryRunProofMinimumBlockingSatisfiedCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount:
        Number(summary.dryRunProofMinimumBlockingMissingCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingMissingCount,
      dryRunProofNextAction: cleanText(summary.dryRunProofNextAction) || serverConfigGuidance.dryRunProofNextAction,
      intakeVerificationStatus: cleanText(summary.intakeVerificationStatus),
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationAvailable: summary.intakeVerificationAvailable === true,
      minimumBlockingReady: summary.minimumBlockingReady === true,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || serverConfigGuidance.minimumBlockingLabel,
      minimumBlockingTargetCount: Number(summary.minimumBlockingTargetCount) || serverConfigGuidance.minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount:
        Number(summary.minimumBlockingSatisfiedCount) || serverConfigGuidance.minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount:
        Number(summary.minimumBlockingMissingCount) || serverConfigGuidance.minimumBlockingMissingCount,
      minimumBlockingVariableRowCount:
        Number(summary.minimumBlockingVariableRowCount) || serverConfigGuidance.minimumBlockingVariableRowCount,
      minimumBlockingAlternativeGroupCount:
        Number(summary.minimumBlockingAlternativeGroupCount) || serverConfigGuidance.minimumBlockingAlternativeGroupCount,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || serverConfigGuidance.minimumWarningLabel,
      minimumWarningMissingCount:
        Number(summary.minimumWarningMissingCount) || serverConfigGuidance.minimumWarningMissingCount,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || serverConfigGuidance.fullIntakeConfiguredLabel,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    targetSetupStatus,
    serverConfigGuidance,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvValuesApplyGateStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const serverConfigGuidance = normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
  });
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : serverConfigGuidance.sourceStatuses;
  const status = cleanText(source.status) || "disabled";
  const configuredValuesFileCount = Number(summary.configuredValuesFileCount) || 0;
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  return {
    available: source.available === true,
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "可合并"
        : status === "disabled"
          ? "未启用"
          : status === "multiple_configured"
            ? "来源不唯一"
            : status === "audit_blocked"
              ? "审计未过"
            : status === "target_not_ready"
              ? "目标 env 未就绪"
              : status === "dry_run_expired"
                ? "dry-run 已过期"
            : status === "dry_run_stale_or_mismatched"
              ? "dry-run 需重跑"
            : status === "dry_run_file_binding_blocked"
              ? "dry-run 指纹未过"
            : status === "dry_run_not_ready"
              ? "dry-run 未通过"
              : "未配置",
    summary: {
      label: cleanText(summary.label) || "正式合并开关未启用",
      applyEnabled: summary.applyEnabled === true,
      applyEnableEnvVariable: cleanText(summary.applyEnableEnvVariable) || "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
      configuredValuesFileCount,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      primaryEnvVariable: cleanText(summary.primaryEnvVariable) || serverConfigGuidance.primaryEnvVariable,
      fallbackEnvVariables: normalizeStringList(summary.fallbackEnvVariables).length
        ? normalizeStringList(summary.fallbackEnvVariables)
        : serverConfigGuidance.fallbackEnvVariables,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      acceptsFrontendPath: summary.acceptsFrontendPath === true,
      valuesFilePathAccepted: summary.valuesFilePathAccepted === true,
      valuesFilePathExposed: summary.valuesFilePathExposed === true,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetSetupStatus: cleanText(summary.targetSetupStatus) || targetSetupStatus.status,
      targetSetupReady: summary.targetSetupReady === true,
      targetSetupReportAvailable: summary.targetSetupReportAvailable === true,
      targetSetupEnvFileCount: Number(summary.targetSetupEnvFileCount) || targetSetupStatus.summary.envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || targetSetupStatus.summary.targetEnvFileConfigured,
      valuesFileAuditStatus: cleanText(summary.valuesFileAuditStatus) || "not_run",
      valuesFileAuditReady: summary.valuesFileAuditReady === true,
      valuesFileAuditExecuted: summary.valuesFileAuditExecuted === true,
      valuesFileAuditBlockingCount: Number(summary.valuesFileAuditBlockingCount) || 0,
      valuesFileAuditWarningCount: Number(summary.valuesFileAuditWarningCount) || 0,
      valuesFileAuditPathExposed: summary.valuesFileAuditPathExposed === true,
      valuesFileAuditValuesIncluded: summary.valuesFileAuditValuesIncluded === true,
      dryRunProofStatus: cleanText(summary.dryRunProofStatus) || serverConfigGuidance.dryRunProofStatus,
      dryRunProofReady: summary.dryRunProofReady === true,
      dryRunProofIncluded: summary.dryRunProofIncluded === true,
      dryRunProofStatusLabel: cleanText(summary.dryRunProofStatusLabel) || serverConfigGuidance.dryRunProofStatusLabel,
      ...normalizeProductionEnvValuesDryRunProofFreshness(summary, serverConfigGuidance),
      ...normalizeProductionEnvValuesDryRunProofFingerprint(summary, serverConfigGuidance),
      dryRunProofMinimumBlockingLabel:
        cleanText(summary.dryRunProofMinimumBlockingLabel) || serverConfigGuidance.dryRunProofMinimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount:
        Number(summary.dryRunProofMinimumBlockingTargetCount) || serverConfigGuidance.dryRunProofMinimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount:
        Number(summary.dryRunProofMinimumBlockingSatisfiedCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount:
        Number(summary.dryRunProofMinimumBlockingMissingCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingMissingCount,
      dryRunProofNextAction: cleanText(summary.dryRunProofNextAction) || serverConfigGuidance.dryRunProofNextAction,
      intakeVerificationStatus: cleanText(summary.intakeVerificationStatus),
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationAvailable: summary.intakeVerificationAvailable === true,
      minimumBlockingReady: summary.minimumBlockingReady === true,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || serverConfigGuidance.minimumBlockingLabel,
      minimumBlockingTargetCount: Number(summary.minimumBlockingTargetCount) || serverConfigGuidance.minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount:
        Number(summary.minimumBlockingSatisfiedCount) || serverConfigGuidance.minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount:
        Number(summary.minimumBlockingMissingCount) || serverConfigGuidance.minimumBlockingMissingCount,
      minimumBlockingVariableRowCount:
        Number(summary.minimumBlockingVariableRowCount) || serverConfigGuidance.minimumBlockingVariableRowCount,
      minimumBlockingAlternativeGroupCount:
        Number(summary.minimumBlockingAlternativeGroupCount) || serverConfigGuidance.minimumBlockingAlternativeGroupCount,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || serverConfigGuidance.minimumWarningLabel,
      minimumWarningMissingCount:
        Number(summary.minimumWarningMissingCount) || serverConfigGuidance.minimumWarningMissingCount,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || serverConfigGuidance.fullIntakeConfiguredLabel,
      targetEnvFileMayBeMutated: summary.targetEnvFileMayBeMutated === true,
      applyExecuted: summary.applyExecuted === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    targetSetupStatus,
    serverConfigGuidance,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvFileAuditFile(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    insideWorkspace: value?.insideWorkspace === true,
    outsideWorkspace: value?.outsideWorkspace === true,
    gitTracked: value?.gitTracked === true,
    gitIgnored: value?.gitIgnored === true,
    fileMode: cleanText(value?.fileMode),
    uncommentedAssignmentCount: Number(value?.uncommentedAssignmentCount) || 0,
    placeholderAssignmentCount: Number(value?.placeholderAssignmentCount) || 0,
    duplicateVariableCount: Number(value?.duplicateVariableCount) || 0,
    sensitiveVariableNameCount: Number(value?.sensitiveVariableNameCount) || 0,
    variableCount: Number(value?.variableCount) || 0,
  };
}

function normalizeV1ProductionEnvFileAuditFinding(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    severity: cleanText(value?.severity) || "blocking",
    detail: cleanText(value?.detail),
    variables: normalizeStringList(value?.variables),
    variableLabel: cleanText(value?.variableLabel),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeV1PersistenceLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const repositoryGroups = Array.isArray(source.repositoryGroups)
    ? source.repositoryGroups.map(normalizeV1PersistenceRepositoryGroup).filter((item) => item.label)
    : [];
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/7");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前系统 V1 持久化已通过" : "当前系统 V1 持久化仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      repositoryGroupCount: Number(summary.repositoryGroupCount) || repositoryGroups.length,
      repositoryGroupLabel: cleanText(summary.repositoryGroupLabel) || `${Number(summary.repositoryGroupCount) || repositoryGroups.length} 组`,
      repositoryCount: Number(summary.repositoryCount) || repositoryGroups.reduce((sum, group) => sum + group.repositoryCount, 0),
      repositoryLabel: cleanText(summary.repositoryLabel),
      productionReadyRepositoryCount: Number(summary.productionReadyRepositoryCount) || 0,
      localRepositoryCount: Number(summary.localRepositoryCount) || 0,
      localRepositoryLabel: cleanText(summary.localRepositoryLabel) || `${Number(summary.localRepositoryCount) || 0} 个`,
      localMemoryCount: Number(summary.localMemoryCount) || 0,
      localJsonCount: Number(summary.localJsonCount) || 0,
      localFsCount: Number(summary.localFsCount) || 0,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      localPersistenceAcceptedForV1: summary.localPersistenceAcceptedForV1 === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    criteria,
    blockingCriteria,
    repositoryGroups,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1PersistenceRepositoryGroup(value = {}) {
  const repositories = Array.isArray(value.repositories)
    ? value.repositories.map(normalizeV1PersistenceRepository).filter((item) => item.label)
    : [];
  const repositoryCount = Number(value.repositoryCount) || repositories.length;
  const productionReadyCount = Number(value.productionReadyCount) || repositories.filter((item) => item.productionReady).length;
  const localRepositoryCount = Number(value.localRepositoryCount) || repositories.filter((item) => item.localKind).length;
  return {
    key: cleanText(value.key),
    label: cleanText(value.label),
    status: cleanText(value.status) || (value.ready ? "passed" : "pending"),
    statusLabel: cleanText(value.statusLabel) || (value.ready ? "已通过" : "阻塞"),
    ready: value.ready === true,
    acceptedByLocalPolicy: value.acceptedByLocalPolicy === true,
    repositoryCount,
    productionReadyCount,
    localRepositoryCount,
    localMemoryCount: Number(value.localMemoryCount) || 0,
    localJsonCount: Number(value.localJsonCount) || 0,
    localFsCount: Number(value.localFsCount) || 0,
    repositoryLabel: cleanText(value.repositoryLabel) || `${productionReadyCount}/${repositoryCount}`,
    localRepositoryLabel: cleanText(value.localRepositoryLabel) || `${localRepositoryCount} 个`,
    nextAction: cleanText(value.nextAction),
    repositories,
  };
}

function normalizeV1PersistenceRepository(value = {}) {
  return {
    key: cleanText(value.key),
    label: cleanText(value.label),
    kind: cleanText(value.kind),
    kindLabel: cleanText(value.kindLabel) || cleanText(value.kind),
    status: cleanText(value.status) || (value.productionReady ? "passed" : "pending"),
    statusLabel: cleanText(value.statusLabel) || (value.productionReady ? "生产级" : "本地/内存"),
    productionReady: value.productionReady === true,
    localKind: value.localKind === true,
  };
}

function normalizeV1AttachmentRetentionLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const diagnostics = normalizeV1AttachmentRetentionDiagnostics(source.diagnostics);
  const storageMode = normalizeV1AttachmentRetentionStorageMode(source.storageMode);
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/5");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前附件 V1 留档已通过" : "当前附件 V1 留档仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: cleanText(summary.passedLabel) || readinessLabel,
      blockingCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      diagnosticReady: summary.diagnosticReady === true,
      diagnosticObjectCleanedUp: summary.diagnosticObjectCleanedUp === true,
      configured: summary.configured === true,
      missingConfigFieldCount: Number(summary.missingConfigFieldCount) || 0,
      missingConfigFieldLabel: `${Number(summary.missingConfigFieldCount) || 0} 项`,
      storageKind: cleanText(summary.storageKind) || storageMode.storageKind,
      storageProvider: cleanText(summary.storageProvider) || storageMode.storageProvider,
      storageKindLabel: cleanText(summary.storageKindLabel) || storageMode.storageKindLabel,
      objectStorageLive: summary.objectStorageLive === true || storageMode.objectStorageLive === true,
      localFsAcceptedForV1: summary.localFsAcceptedForV1 === true || storageMode.localFsAcceptedForV1 === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    criteria,
    blockingCriteria,
    diagnostics,
    storageMode,
    remainingV1Risks: normalizeStringList(source.remainingV1Risks),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1AttachmentRetentionDiagnostics(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    storageKind: cleanText(source.storageKind),
    storageProvider: cleanText(source.storageProvider),
    configured: source.configured === true,
    missingConfigFields: normalizeStringList(source.missingConfigFields),
    writeOk: source.writeOk === true,
    readOk: source.readOk === true,
    digestOk: source.digestOk === true,
    cleanupOk: source.cleanupOk === true,
    secretFieldsExposed: source.secretFieldsExposed === true,
  };
}

function normalizeV1AttachmentRetentionStorageMode(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const storageKind = cleanText(source.storageKind);
  const storageProvider = cleanText(source.storageProvider);
  return {
    storageKind,
    storageProvider,
    storageKindLabel: formatAttachmentStorageKindLabel(storageKind || storageProvider),
    objectStorageLive: source.objectStorageLive === true,
    localFsAcceptedForV1: source.localFsAcceptedForV1 === true,
  };
}

function formatAttachmentStorageKindLabel(kind) {
  if (kind === "object_storage") return "对象存储";
  if (kind === "local_fs") return "本地文件";
  if (kind === "local_json") return "本地 JSON";
  if (kind === "local_memory") return "本地内存";
  return cleanText(kind) || "未知";
}

function normalizeV1DriverReadinessLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const deliveryTaskReadiness = normalizeV1DriverDeliveryTaskReadiness(source.deliveryTaskReadiness);
  const latestFieldTest = isPlainObject(source.latestFieldTest)
    ? {
        recordId: cleanText(source.latestFieldTest.recordId),
        fulfillmentId: cleanText(source.latestFieldTest.fulfillmentId),
        checkedAt: formatDateTimeLabel(source.latestFieldTest.checkedAt),
        deviceLabel: cleanText(source.latestFieldTest.deviceLabel),
        summaryLabel: cleanText(source.latestFieldTest.summaryLabel),
      }
    : null;
  const nativeBridge = normalizeV1DriverNativeBridge(source.nativeBridge);
  const packageLabelScanSample = isPlainObject(source.packageLabelScanSample)
    ? {
        sampleId: cleanText(source.packageLabelScanSample.sampleId),
        fulfillmentId: cleanText(source.packageLabelScanSample.fulfillmentId),
        method: cleanText(source.packageLabelScanSample.method),
        methodLabel: cleanText(source.packageLabelScanSample.methodLabel),
        result: cleanText(source.packageLabelScanSample.result),
        resultLabel: cleanText(source.packageLabelScanSample.resultLabel),
        checkedAt: formatDateTimeLabel(source.packageLabelScanSample.checkedAt),
        expectedPackageIdPresent: source.packageLabelScanSample.expectedPackageIdPresent === true,
        matchedPackageIdPresent: source.packageLabelScanSample.matchedPackageIdPresent === true,
        scanTextPresent: source.packageLabelScanSample.scanTextPresent === true,
      }
    : null;
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/6");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    driverOperatorId: cleanText(source.driverOperatorId),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "司机端 V1 真机门禁已通过" : "司机端 V1 真机门禁仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: cleanText(summary.passedLabel) || readinessLabel,
      blockingCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      deliveryTaskStatusChanged: summary.deliveryTaskStatusChanged === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      deliveryTaskCount: Number(summary.deliveryTaskCount) || deliveryTaskReadiness.total,
      fieldTestRecordAvailable: summary.fieldTestRecordAvailable === true,
      fieldTestLabel: cleanText(summary.fieldTestLabel) || (latestFieldTest ? latestFieldTest.summaryLabel : "未验收"),
      nativeSupportedLabel: cleanText(summary.nativeSupportedLabel) || nativeBridge.supportedLabel,
      packageLabelScanMatched: summary.packageLabelScanMatched === true,
      packageLabelScanNative: summary.packageLabelScanNative === true,
      requiresNativeShell: summary.requiresNativeShell !== false,
      browserOnlyNotReady: summary.browserOnlyNotReady === true,
      payloadExposed: summary.payloadExposed === true,
    },
    criteria,
    blockingCriteria,
    deliveryTaskReadiness,
    latestFieldTest,
    nativeBridge,
    packageLabelScanSample,
    remainingV1Risks: normalizeStringList(source.remainingV1Risks),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1DriverDeliveryTaskReadiness(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const metrics = isPlainObject(source.metrics) ? source.metrics : {};
  return {
    total: Number(source.total) || 0,
    sampleFulfillmentCount: Number(source.sampleFulfillmentCount) || 0,
    metrics: {
      pendingCount: Number(metrics.pendingCount) || 0,
      deliveringCount: Number(metrics.deliveringCount) || 0,
      completedCount: Number(metrics.completedCount) || 0,
      exceptionCount: Number(metrics.exceptionCount) || 0,
    },
  };
}

function normalizeV1DriverNativeBridge(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const supportedCount = Number(source.supportedCount) || 0;
  const total = Number(source.total) || 0;
  const items = Array.isArray(source.items)
    ? source.items.map((item) => ({
        key: cleanText(item.key),
        label: cleanText(item.label),
        supported: item.supported === true,
        statusLabel: cleanText(item.statusLabel),
        bridgeTypeLabel: cleanText(item.bridgeTypeLabel),
        version: cleanText(item.version),
      })).filter((item) => item.key || item.label)
    : [];
  return {
    label: cleanText(source.label),
    supportedCount,
    total,
    supportedLabel: total ? `${supportedCount}/${total}` : "0/2",
    items,
  };
}

function normalizeV1ProductionGoLiveLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(normalizeV1ProductionGoLiveStage).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages) && source.blockingStages.length
    ? source.blockingStages.map(normalizeV1ProductionGoLiveStage).filter((item) => item.label)
    : stages.filter((item) => !item.ready);
  const fixChecklist = Array.isArray(source.fixChecklist)
    ? source.fixChecklist.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  const unblockChecklist = Array.isArray(source.unblockChecklist)
    ? source.unblockChecklist.map(normalizeV1ProductionGoLiveUnblockItem).filter((item) => item.label)
    : [];
  const fieldEvidenceCoverage = normalizeV1ProductionGoLiveFieldEvidenceCoverage(source.fieldEvidenceCoverage);
  const passedCount = Number(summary.passedCount) || stages.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || stages.length;
  const blockingCount = Number(summary.blockingCount) || blockingStages.length;
  const warningCount = Number(summary.warningCount) || 0;
  const readinessLabel = cleanText(summary.readinessLabel || summary.stageLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/5");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const runtimeReadiness = isPlainObject(source.runtimeReadiness) ? source.runtimeReadiness : null;
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "not_configured"
          ? "未配置"
          : status === "error"
            ? "预检失败"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "生产上线组合预检通过" : "生产上线组合预检仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      warningCount,
      warningLabel: `${warningCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingStages.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingStages.length} 项`,
      envFileCount: Number(summary.envFileCount) || 0,
      configuredEnvFileCount: Number(summary.configuredEnvFileCount) || 0,
      sourceStatuses,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      productionEnvAppliedToProcess: summary.productionEnvAppliedToProcess === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
    },
    stages,
    blockingStages,
    fixChecklist,
    unblockChecklist,
    fieldEvidenceCoverage,
    runtimeReadiness: runtimeReadiness
      ? {
          status: cleanText(runtimeReadiness.status),
          ready: runtimeReadiness.ready === true,
          summary: isPlainObject(runtimeReadiness.summary) ? runtimeReadiness.summary : {},
          systemPersistence: isPlainObject(runtimeReadiness.systemPersistence) ? runtimeReadiness.systemPersistence : {},
          attachmentReadiness: isPlainObject(runtimeReadiness.attachmentReadiness) ? runtimeReadiness.attachmentReadiness : {},
          remainingV1Risks: normalizeStringList(runtimeReadiness.remainingV1Risks),
        }
      : null,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionGoLiveStage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeV1ProductionGoLiveBlockingItem).filter((item) => item.label)
    : [];
  const checks = Array.isArray(source.checks)
    ? source.checks.map(normalizeV1ProductionGoLiveBlockingItem).filter((item) => item.label)
    : [];
  const passedCount = Number(summary.passedCount) || checks.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || checks.length;
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    status: cleanText(source.status) || (source.ready ? "passed" : "pending"),
    sourceStatus: cleanText(source.sourceStatus),
    ready: source.ready === true || source.status === "passed",
    summary: {
      label: cleanText(summary.label) || (totalCount ? `${passedCount}/${totalCount} 通过` : ""),
      passedCount,
      totalCount,
      blockingCount: Number(summary.blockingCount) || blockingItems.length,
      warningCount: Number(summary.warningCount) || 0,
    },
    blockingItems,
    checks,
    nextActions: normalizeStringList(source.nextActions),
  };
}

function normalizeV1ProductionGoLiveBlockingItem(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "unknown",
    ready: value?.ready === true || value?.status === "passed",
    blocking: value?.blocking !== false,
    detail: cleanText(value?.detail),
  };
}

function normalizeV1ProductionGoLiveUnblockItem(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(normalizeV1ProductionGoLiveBlockingItem).filter((item) => item.label)
    : [];
  const fixItems = Array.isArray(source.fixItems)
    ? source.fixItems.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    stageOrder: Number(source.stageOrder) || 0,
    status: cleanText(source.status) || "pending",
    ready: source.ready === true,
    ownerRole: cleanText(source.ownerRole),
    blockingCount: Number(source.blockingCount) || blockers.length,
    nextAction: cleanText(source.nextAction),
    verificationSteps: normalizeStringList(source.verificationSteps),
    evidenceToKeep: normalizeStringList(source.evidenceToKeep),
    blockers,
    fixItems,
  };
}

function normalizeV1ProductionGoLiveFieldEvidenceCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawSummary = isPlainObject(source.summary) ? source.summary : {};
  const items = Array.isArray(source.items)
    ? source.items.map(normalizeV1ProductionGoLiveFieldEvidenceCoverageItem).filter((item) => item.itemLabel)
    : [];
  const reportSupportedCount =
    Number(rawSummary.reportSupportedCount) || items.filter((item) => item.status === "report_supported").length;
  const needsOnsiteRefCount =
    Number(rawSummary.needsOnsiteRefCount) || items.filter((item) => item.status === "needs_onsite_ref").length;
  const waitingForStageCount =
    Number(rawSummary.waitingForStageCount) || items.filter((item) => item.status === "waiting_for_stage").length;
  const onsiteRequiredCount =
    Number(rawSummary.onsiteRequiredCount) || items.filter((item) => item.status === "onsite_required").length;
  const totalCount = Number(rawSummary.totalCount) || items.length;
  const stillNeedsFieldEvidenceCount =
    Number(rawSummary.stillNeedsFieldEvidenceCount) || Math.max(0, totalCount - reportSupportedCount);
  return {
    summary: {
      label: cleanText(rawSummary.label) || `${reportSupportedCount}/${totalCount} 可由本报告直接支持`,
      reportSupportedCount,
      needsOnsiteRefCount,
      waitingForStageCount,
      onsiteRequiredCount,
      totalCount,
      reportSupportedLabel: cleanText(rawSummary.reportSupportedLabel) || `${reportSupportedCount}/${totalCount}`,
      stillNeedsFieldEvidenceCount,
      stillNeedsFieldEvidenceLabel: `${stillNeedsFieldEvidenceCount} 项`,
      nextAction: cleanText(rawSummary.nextAction),
    },
    items,
  };
}

function normalizeV1ProductionGoLiveFieldEvidenceCoverageItem(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    groupKey: cleanText(source.groupKey),
    groupLabel: cleanText(source.groupLabel),
    itemKey: cleanText(source.itemKey),
    itemLabel: cleanText(source.itemLabel),
    status: cleanText(source.status) || "waiting_for_stage",
    statusLabel: cleanText(source.statusLabel) || "待处理",
    ready: source.ready === true,
    supportingStageKey: cleanText(source.supportingStageKey),
    supportingStageLabel: cleanText(source.supportingStageLabel),
    nextAction: cleanText(source.nextAction),
  };
}

function normalizeV1RuntimeReadinessLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/11");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前运行时 V1 总门禁已通过" : "当前运行时 V1 总门禁仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      apiBaseUrlAccepted: summary.apiBaseUrlAccepted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      nonPrinting: summary.nonPrinting !== false,
      driverStatusChanged: summary.driverStatusChanged === true,
    },
    criteria,
    blockingCriteria,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1RuntimeReadinessLiveCriterion(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || (value?.ready ? "passed" : "pending"),
    statusLabel: cleanText(value?.statusLabel) || (value?.ready ? "已通过" : "阻塞"),
    ready: value?.ready === true,
    blocking: value?.blocking !== false,
    detail: cleanText(value?.detail),
  };
}

function normalizeV1V2BoundaryPrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(normalizeV1ReleaseCandidateRefreshBlocker).filter((item) => item.key)
    : [];
  const v1MustContinueCount = Number(summary.v1MustContinueCount) || 0;
  const v2CategoryCount = Number(summary.v2CategoryCount) || 0;
  const v2DifferenceCount = Number(summary.v2DifferenceCount) || 0;
  const moduleDifferenceCount = Number(summary.moduleDifferenceCount) || 0;
  const blockerCount = Number(summary.blockerCount) || blockers.length;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "pending_confirmation");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "confirmed_but_v1_blocked" ? "边界已确认 / V1 未完成" : "待确认",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "V1/V2 边界仍不能作为 V1 放行依据",
      boundaryLabel: cleanText(summary.boundaryLabel) || "待确认",
      boundaryReady: summary.boundaryReady === true,
      canDeclareV1Complete: summary.canDeclareV1Complete === true,
      scopeBriefAvailable: summary.scopeBriefAvailable === true,
      v1MustContinueCount,
      v2CategoryCount,
      v2DifferenceCount,
      moduleDifferenceCount,
      ownerReviewRuleCount: Number(summary.ownerReviewRuleCount) || 0,
      v1MustContinueLabel: cleanText(summary.v1MustContinueLabel) || `${v1MustContinueCount} 项`,
      v2CategoryLabel: cleanText(summary.v2CategoryLabel) || `${v2CategoryCount} 类`,
      v2DifferenceLabel: cleanText(summary.v2DifferenceLabel) || `${v2DifferenceCount} 项`,
      moduleDifferenceLabel: cleanText(summary.moduleDifferenceLabel) || `${moduleDifferenceCount} 个模块`,
      blockerCount,
      blockerLabel: `${blockerCount} 项`,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      requestBodyIgnored: summary.requestBodyIgnored !== false,
    },
    v1MustContinue: normalizeStringList(source.v1MustContinue),
    v2Categories: normalizeStringList(source.v2Categories),
    v2Differences: normalizeStringList(source.v2Differences),
    moduleDifferences: normalizeModuleV1V2Differences(source.moduleDifferences),
    ownerReview: {
      question: cleanText(source.ownerReview?.question),
      recommendation: cleanText(source.ownerReview?.recommendation),
      approvalRule: cleanText(source.ownerReview?.approvalRule),
    },
    blockers,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1V2ScopeBriefRefreshResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const v1MustContinue = normalizeStringList(source.v1MustContinue);
  const v2Categories = normalizeStringList(source.v2Categories);
  const v2Differences = normalizeStringList(source.v2Differences);
  const moduleDifferences = normalizeModuleV1V2Differences(source.moduleDifferences);
  const v1MustContinueCount = Number(summary.v1MustContinueCount) || v1MustContinue.length;
  const v2CategoryCount = Number(summary.v2CategoryCount) || v2Categories.length;
  const v2DifferenceCount = Number(summary.v2DifferenceCount) || v2Differences.length;
  const moduleDifferenceCount = Number(summary.moduleDifferenceCount) || moduleDifferences.length;
  const status = cleanText(source.status) || "blocked_scope_brief_refreshed";
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已刷新"
        : status === "scope_brief_refresh_failed"
          ? "刷新失败"
          : "已刷新仍阻塞",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    conclusion: cleanText(source.conclusion),
    summary: {
      label: cleanText(summary.label) || "V1/V2 差异摘要已刷新",
      canDeclareV1Complete: summary.canDeclareV1Complete === true,
      scopeBriefAvailable: summary.scopeBriefAvailable === true,
      v1MustContinueCount,
      v2CategoryCount,
      v2DifferenceCount,
      moduleDifferenceCount,
      ownerReviewRuleCount: Number(summary.ownerReviewRuleCount) || 0,
      v1MustContinueLabel: cleanText(summary.v1MustContinueLabel) || `${v1MustContinueCount} 项`,
      v2CategoryLabel: cleanText(summary.v2CategoryLabel) || `${v2CategoryCount} 类`,
      v2DifferenceLabel: cleanText(summary.v2DifferenceLabel) || `${v2DifferenceCount} 项`,
      moduleDifferenceLabel: cleanText(summary.moduleDifferenceLabel) || `${moduleDifferenceCount} 个模块`,
      scopeBriefRefreshed: summary.scopeBriefRefreshed === true,
      boundaryConfirmationMutated: summary.boundaryConfirmationMutated === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      requestBodyIgnored: summary.requestBodyIgnored !== false,
    },
    v1MustContinue,
    v2Categories,
    v2Differences,
    moduleDifferences,
    ownerReview: {
      question: cleanText(source.ownerReview?.question),
      recommendation: cleanText(source.ownerReview?.recommendation),
      approvalRule: cleanText(source.ownerReview?.approvalRule),
    },
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ReleaseCandidateRefreshPrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(normalizeV1ReleaseCandidateRefreshBlocker).filter((item) => item.label)
    : [];
  const blockerCount = Number(summary.blockerCount) || blockers.length;
  const draftManifestStatus = cleanText(summary.draftManifestStatus) || "missing";
  const draftFreshnessStatus = cleanText(summary.draftFreshnessStatus) || "missing";
  const productionGoLiveSourceStatuses = Array.isArray(summary.productionGoLiveSourceStatuses)
    ? summary.productionGoLiveSourceStatuses
        .map(normalizeV1ProductionEnvFileAuditConfigSourceStatus)
        .filter((item) => item.envVariable)
    : [];
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status: cleanText(source.status) || "blocked",
    ready: source.ready === true,
    statusLabel: source.ready === true ? "可以刷新" : "暂不能刷新",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "已具备刷新条件" : "暂不能刷新 release candidate"),
      draftManifestStatus,
      draftManifestLabel: cleanText(summary.draftManifestLabel) || formatDraftManifestStatusLabel(draftManifestStatus),
      draftFreshnessStatus,
      draftFreshnessLabel: cleanText(summary.draftFreshnessLabel) || formatDraftFreshnessStatusLabel(draftFreshnessStatus),
      draftFreshnessReady: summary.draftFreshnessReady === true,
      draftValidationStatus: cleanText(summary.draftValidationStatus) || "blocked",
      evidenceProgress: cleanText(summary.evidenceProgress) || "0/34",
      signoffProgress: cleanText(summary.signoffProgress) || "0/6",
      evidenceGroupsReadyLabel: cleanText(summary.evidenceGroupsReadyLabel) || "0/6",
      productionEnvPreflightLabel: cleanText(summary.productionEnvPreflightLabel) || "0/10",
      productionEnvBlockingCount: Number(summary.productionEnvBlockingCount) || 0,
      productionEnvWarningCount: Number(summary.productionEnvWarningCount) || 0,
      productionGoLiveReadinessLabel: cleanText(summary.productionGoLiveReadinessLabel) || "0/5",
      productionGoLiveBlockingCount: Number(summary.productionGoLiveBlockingCount) || 0,
      productionGoLiveFirstBlockedStageKey: cleanText(summary.productionGoLiveFirstBlockedStageKey),
      productionGoLiveFirstBlockedStageLabel: cleanText(summary.productionGoLiveFirstBlockedStageLabel),
      productionGoLiveSourceStatuses,
      productionGoLiveReady: summary.productionGoLiveReady === true,
      boundaryLabel: cleanText(summary.boundaryLabel) || "待确认",
      releaseCandidateRefreshAllowed: summary.releaseCandidateRefreshAllowed === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      blockerCount,
      blockerLabel: `${blockerCount} 项`,
      blockerShownCount: Number(summary.blockerShownCount) || blockers.length,
    },
    blockers,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ReleaseCandidateRefreshResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(normalizeV1ReleaseCandidateRefreshBlocker).filter((item) => item.label)
    : [];
  const blockerCount = Number(summary.blockerCount) || blockers.length;
  const status = cleanText(source.status) || "blocked_by_precheck";
  const productionGoLiveSourceStatuses = Array.isArray(summary.productionGoLiveSourceStatuses)
    ? summary.productionGoLiveSourceStatuses
        .map(normalizeV1ProductionEnvFileAuditConfigSourceStatus)
        .filter((item) => item.envVariable)
    : [];
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "刷新完成"
        : status === "blocked_by_precheck"
          ? "暂不能刷新"
          : status === "refresh_failed"
            ? "刷新失败"
            : "已刷新仍阻塞",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "刷新 release candidate / go-live suite",
      precheckStatus: cleanText(summary.precheckStatus),
      evidenceProgress: cleanText(summary.evidenceProgress) || "0/34",
      signoffProgress: cleanText(summary.signoffProgress) || "0/6",
      productionEnvPreflightLabel: cleanText(summary.productionEnvPreflightLabel) || "0/10",
      productionGoLiveReadinessLabel: cleanText(summary.productionGoLiveReadinessLabel) || "0/5",
      productionGoLiveBlockingCount: Number(summary.productionGoLiveBlockingCount) || 0,
      productionGoLiveFirstBlockedStageKey: cleanText(summary.productionGoLiveFirstBlockedStageKey),
      productionGoLiveFirstBlockedStageLabel: cleanText(summary.productionGoLiveFirstBlockedStageLabel),
      productionGoLiveSourceStatuses,
      productionGoLiveReady: summary.productionGoLiveReady === true,
      boundaryLabel: cleanText(summary.boundaryLabel) || "待确认",
      releaseGateLabel: cleanText(summary.releaseGateLabel),
      ownerDecision: cleanText(summary.ownerDecision),
      p0Prototype: cleanText(summary.p0Prototype),
      v1Readiness: cleanText(summary.v1Readiness),
      fieldEvidenceLabel: cleanText(summary.fieldEvidenceLabel),
      onsiteTaskCount: Number(summary.onsiteTaskCount) || 0,
      v2DifferenceCount: Number(summary.v2DifferenceCount) || 0,
      releaseCandidateRefreshAllowed: summary.releaseCandidateRefreshAllowed === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      blockerCount,
      blockerLabel: `${blockerCount} 项`,
      blockerShownCount: Number(summary.blockerShownCount) || blockers.length,
    },
    blockers,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ReleaseCandidateRefreshBlocker(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    blocking: value?.blocking !== false,
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeV1FieldEvidenceStageRowResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const row = isPlainObject(source.row) ? source.row : {};
  const draftManifest = isPlainObject(source.draftManifest)
    ? normalizeV1FieldEvidenceDraftManifestResult(source.draftManifest)
    : null;
  const invalidRowCount = Number(summary.invalidRowCount) || 0;
  const rowType = cleanText(summary.rowType || row.type);
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status: cleanText(source.status) || "blocked",
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "草稿已通过"
        : invalidRowCount > 0 || source.status === "invalid"
          ? "保存需修正"
          : "草稿已保存",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    row: {
      type: rowType,
      row: Number(row.row) || 0,
      key: cleanText(row.key || row.itemKey || row.role),
      groupKey: cleanText(row.groupKey),
      itemKey: cleanText(row.itemKey),
      role: cleanText(row.role),
      label: cleanText(row.label),
      groupLabel: cleanText(row.groupLabel),
      ownerRole: cleanText(row.ownerRole),
      status: cleanText(row.status),
      evidenceRefFilled: row.evidenceRefFilled === true,
      personFilled: row.personFilled === true,
      timeFilled: row.timeFilled === true,
      notesFilled: row.notesFilled === true,
    },
    summary: {
      rowType,
      rowLabel: cleanText(summary.rowLabel || row.label),
      rowStatus: cleanText(summary.rowStatus || row.status),
      csvUpdated: summary.csvUpdated === true,
      draftWritten: summary.draftWritten === true,
      evidenceProgress: cleanText(summary.evidenceProgress) || "0/34",
      signoffProgress: cleanText(summary.signoffProgress) || "0/6",
      boundaryLabel: cleanText(summary.boundaryLabel) || "待确认",
      invalidRowCount,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
    },
    evidenceCloseout: normalizeV1FieldEvidenceStageRowEvidenceCloseout(source.evidenceCloseout),
    closeout: normalizeV1FieldEvidenceStageRowCloseout(source.closeout),
    draftManifest,
    error: source.error,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1FieldEvidenceStageRowEvidenceCloseout(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const actions = Array.isArray(source.actions)
    ? source.actions.map(normalizeFieldEvidenceMissingItem).filter((item) => item.key)
    : [];
  const missingEvidenceRows = Number(source.missingEvidenceRows) || 0;
  const actionCount = Number(source.actionCount) || actions.length;
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    evidenceProgress: cleanText(source.evidenceProgress) || "0/34",
    requiredEvidenceRows: Number(source.requiredEvidenceRows) || 0,
    completedEvidenceRows: Number(source.completedEvidenceRows) || 0,
    filledEvidenceRows: Number(source.filledEvidenceRows) || 0,
    missingEvidenceRows,
    invalidEvidenceRows: Number(source.invalidEvidenceRows) || 0,
    blockedEvidenceRows: Number(source.blockedEvidenceRows) || 0,
    notApplicableEvidenceRows: Number(source.notApplicableEvidenceRows) || 0,
    actionCount,
    actionShownCount: Number(source.actionShownCount) || actions.length,
    actionLabel: formatShownCountLabel(Number(source.actionShownCount) || actions.length, actionCount),
    actions,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1FieldEvidenceStageRowCloseout(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const actions = Array.isArray(source.actions)
    ? source.actions.map(normalizeFieldEvidenceSignoffBoundaryAction).filter((item) => item.key)
    : [];
  const missingSignoffRows = Number(source.missingSignoffRows) || 0;
  const actionCount = Number(source.actionCount) || actions.length;
  const signoffProgressParts = cleanText(source.signoffProgress).split("/");
  const signoffCompleted = Number(signoffProgressParts[0]) || 0;
  const signoffTotal = Number(signoffProgressParts[1]) || signoffCompleted + missingSignoffRows;
  const boundaryReady = source.boundaryReady === true;
  const boundaryStatus = cleanText(source.boundaryStatus) || "pending";
  const boundaryLabel = cleanText(source.boundaryLabel) || "待确认";
  const signoffBoundarySummary = isPlainObject(source.signoffBoundarySummary)
    ? normalizeFieldEvidenceSignoffBoundarySummary(source.signoffBoundarySummary, {
        signoffBoundaryActions: actions,
        requiredSignoffsTotal: signoffTotal,
        requiredSignoffsCompleted: signoffCompleted,
        boundaryReady,
        boundaryStatus,
        boundaryLabel,
      })
    : buildFallbackFieldEvidenceSignoffBoundarySummary({
        signoffBoundaryActions: actions,
        requiredSignoffsTotal: signoffTotal,
        requiredSignoffsCompleted: signoffCompleted,
        boundaryReady,
        boundaryStatus,
        boundaryLabel,
      });
  return {
    status: cleanText(source.status) || (source.ready === true ? "ready" : "blocked"),
    ready: source.ready === true,
    signoffProgress: cleanText(source.signoffProgress) || "0/6",
    missingSignoffRows,
    invalidSignoffRows: Number(source.invalidSignoffRows) || 0,
    boundaryStatus,
    boundaryLabel,
    boundaryReady,
    actionCount,
    actionShownCount: Number(source.actionShownCount) || actions.length,
    actionLabel: formatShownCountLabel(Number(source.actionShownCount) || actions.length, actionCount),
    actions,
    signoffBoundarySummary,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1FieldEvidenceValidationBlocker(value = {}) {
  return {
    type: cleanText(value?.type),
    groupLabel: cleanText(value?.groupLabel),
    label: cleanText(value?.label),
    status: cleanText(value?.status),
    reason: cleanText(value?.reason),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeV1FieldEvidenceValidationGroup(value = {}) {
  return {
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    status: cleanText(value?.status),
    ready: value?.ready === true,
    progress: cleanText(value?.progress),
    blockedRequired: Number(value?.blockedRequired) || 0,
  };
}

function normalizeV1FieldEvidenceValidationSignoff(value = {}) {
  return {
    role: cleanText(value?.role),
    status: cleanText(value?.status),
    ready: value?.ready === true,
    signerFilled: value?.signerFilled === true,
    signedAtFilled: value?.signedAtFilled === true,
  };
}

function normalizeV1FieldEvidenceDraftInvalidRow(value = {}) {
  return {
    type: cleanText(value?.type),
    row: Number(value?.row) || 0,
    groupKey: cleanText(value?.groupKey),
    itemKey: cleanText(value?.itemKey),
    reason: cleanText(value?.reason),
    fixHint: cleanText(value?.fixHint),
  };
}

function normalizeFieldEvidenceIntakeCommand(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    command: cleanText(value?.command),
    description: cleanText(value?.description),
  };
}

function formatDraftManifestStatusLabel(status) {
  if (status === "available") return "已生成";
  if (status === "invalid") return "草稿异常";
  return "未生成";
}

function formatDraftFreshnessStatusLabel(status) {
  if (status === "fresh") return "已匹配";
  if (status === "stale") return "已过期";
  if (status === "metadata_missing") return "需重生成";
  if (status === "invalid") return "草稿异常";
  return "未生成";
}

function normalizeFieldEvidenceMissingItem(value = {}) {
  return {
    key: cleanText(value?.key),
    groupKey: cleanText(value?.groupKey),
    groupLabel: cleanText(value?.groupLabel),
    ownerRole: cleanText(value?.ownerRole),
    label: cleanText(value?.label),
    required: value?.required !== false,
    status: cleanText(value?.status) || (value?.ready ? "ready" : "pending"),
    ready: value?.ready === true,
    evidenceFilled: value?.evidenceFilled === true,
    progressLabel: cleanText(value?.progressLabel),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeFieldEvidenceSignoffBoundaryAction(value = {}) {
  return {
    type: cleanText(value?.type),
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    required: value?.required !== false,
    status: cleanText(value?.status) || (value?.ready ? "ready" : "pending"),
    ready: value?.ready === true,
    personFilled: value?.personFilled === true,
    timeFilled: value?.timeFilled === true,
    progressLabel: cleanText(value?.progressLabel),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeFieldEvidenceSignoffBoundarySummary(value = {}, fallback = {}) {
  const fallbackActions = Array.isArray(fallback.signoffBoundaryActions)
    ? fallback.signoffBoundaryActions
    : [];
  const previewActions = Array.isArray(value?.previewActions)
    ? value.previewActions.map(normalizeFieldEvidenceSignoffBoundaryAction).filter((item) => item.key)
    : fallbackActions.slice(0, 3);
  const signoffTotal =
    Number(value?.signoffTotal) ||
    Number(fallback.requiredSignoffsTotal) ||
    0;
  const signoffCompleted =
    Number(value?.signoffCompleted) ||
    Number(fallback.requiredSignoffsCompleted) ||
    0;
  const missingSignoffCount =
    Number(value?.missingSignoffCount) ||
    Math.max(0, signoffTotal - signoffCompleted);
  const boundaryReady = value?.boundaryReady === true || fallback.boundaryReady === true;
  const boundaryStatus = cleanText(value?.boundaryStatus || fallback.boundaryStatus) || "pending";
  const boundaryLabel =
    cleanText(value?.boundaryLabel || fallback.boundaryLabel) ||
    (boundaryReady ? "已确认" : "待确认");
  const actionCount =
    Number(value?.actionCount) ||
    fallbackActions.length ||
    missingSignoffCount + (boundaryReady ? 0 : 1);
  const actionShownCount =
    Number(value?.actionShownCount) ||
    fallbackActions.length ||
    previewActions.length;
  const ready =
    value?.ready === true ||
    (signoffTotal > 0 && missingSignoffCount === 0 && boundaryReady);
  const status = cleanText(value?.status) || (ready ? "ready" : "blocked");
  const actionLabel =
    cleanText(value?.actionLabel) ||
    formatShownCountLabel(actionShownCount, actionCount);
  const hiddenActionCount =
    Number(value?.hiddenActionCount) ||
    Math.max(0, actionCount - previewActions.length);

  return {
    status,
    ready,
    signoffTotal,
    signoffCompleted,
    missingSignoffCount,
    signoffProgressLabel:
      cleanText(value?.signoffProgressLabel) ||
      (signoffTotal > 0 ? `${signoffCompleted}/${signoffTotal}` : ""),
    boundaryStatus,
    boundaryLabel,
    boundaryReady,
    actionCount,
    actionShownCount,
    actionLabel,
    previewActions,
    hiddenActionCount,
    nextAction:
      cleanText(value?.nextAction) ||
      (ready
        ? "签字和 V1/V2 边界已满足；重新跑 release candidate 复核。"
        : missingSignoffCount > 0
          ? `还差 ${missingSignoffCount} 个负责人签字；先处理签字 / 边界待办。`
          : "负责人确认 V1 必做项和 V2 延后项后，补齐 V1/V2 边界确认人和时间。"),
  };
}

function buildFallbackFieldEvidenceSignoffBoundarySummary(fallback = {}) {
  const requiredSignoffsTotal = Number(fallback.requiredSignoffsTotal) || 0;
  const requiredSignoffsCompleted = Number(fallback.requiredSignoffsCompleted) || 0;
  const boundaryReady = fallback.boundaryReady === true;
  const missingSignoffCount = Math.max(0, requiredSignoffsTotal - requiredSignoffsCompleted);
  const actions = Array.isArray(fallback.signoffBoundaryActions)
    ? fallback.signoffBoundaryActions
    : [];

  return normalizeFieldEvidenceSignoffBoundarySummary(
    {
      status: requiredSignoffsTotal > 0 && missingSignoffCount === 0 && boundaryReady ? "ready" : "blocked",
      ready: requiredSignoffsTotal > 0 && missingSignoffCount === 0 && boundaryReady,
      signoffTotal: requiredSignoffsTotal,
      signoffCompleted: requiredSignoffsCompleted,
      missingSignoffCount,
      boundaryStatus: fallback.boundaryStatus,
      boundaryLabel: fallback.boundaryLabel,
      boundaryReady,
      actionCount: actions.length || missingSignoffCount + (boundaryReady ? 0 : 1),
      actionShownCount: actions.length,
      previewActions: actions.slice(0, 3),
    },
    fallback,
  );
}

function normalizeFieldEvidenceGroupSummary(value = {}) {
  const firstMissingItems = Array.isArray(value?.firstMissingItems)
    ? value.firstMissingItems.map(normalizeFieldEvidenceMissingItem).filter((item) => item.key)
    : [];
  const requiredTotal = Number(value?.requiredTotal) || 0;
  const completedRequired = Number(value?.completedRequired) || 0;
  const missingCount =
    Number(value?.missingCount) ||
    firstMissingItems.length ||
    Number(value?.blockedRequired) ||
    0;
  const previewItems = firstMissingItems.slice(0, 3);
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    status: cleanText(value?.status) || (value?.ready === true ? "ready" : "blocked"),
    statusLabel: cleanText(value?.statusLabel) || (value?.ready === true ? "已满足" : "阻塞"),
    ready: value?.ready === true,
    requiredTotal,
    completedRequired,
    blockedRequired: Number(value?.blockedRequired) || missingCount,
    progressLabel: cleanText(value?.progressLabel) || `${completedRequired}/${requiredTotal}`,
    missingCount,
    missingLabel: cleanText(value?.missingLabel) || (requiredTotal > 0 ? `${missingCount}/${requiredTotal}` : `${missingCount}`),
    nextAction: cleanText(value?.nextAction),
    firstMissingItems,
    firstMissingItem: firstMissingItems[0] || null,
    previewItems,
    hiddenPreviewCount: Math.max(0, missingCount - previewItems.length),
  };
}

function buildFallbackFieldEvidenceGroupSummaries(groups = [], missingItems = []) {
  const missingByGroup = new Map();
  missingItems.forEach((item) => {
    const groupKey = item.groupKey || "ungrouped";
    if (!missingByGroup.has(groupKey)) {
      missingByGroup.set(groupKey, []);
    }
    missingByGroup.get(groupKey).push(item);
  });
  return groups
    .map((group) => {
      const groupMissingItems = missingByGroup.get(group.key) || [];
      const missingCount = groupMissingItems.length || group.blockedRequired || 0;
      const firstMissingItems = groupMissingItems.slice(0, 3);
      return normalizeFieldEvidenceGroupSummary({
        ...group,
        missingCount,
        missingLabel:
          group.requiredTotal > 0
            ? `${missingCount}/${group.requiredTotal}`
            : `${missingCount}`,
        firstMissingItems,
      });
    })
    .filter((group) => group.key);
}

function normalizeFieldEvidenceGroup(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    status: cleanText(value?.status) || (value?.ready ? "ready" : "blocked"),
    ready: value?.ready === true,
    requiredTotal: Number(value?.requiredTotal) || 0,
    completedRequired: Number(value?.completedRequired) || 0,
    blockedRequired: Number(value?.blockedRequired) || 0,
    progressLabel: cleanText(value?.progressLabel),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeFieldEvidenceSignoff(value = {}) {
  return {
    role: cleanText(value?.role),
    required: value?.required !== false,
    status: cleanText(value?.status) || (value?.ready ? "ready" : "pending"),
    ready: value?.ready === true,
    signerFilled: value?.signerFilled === true,
    signedAtFilled: value?.signedAtFilled === true,
    progressLabel: cleanText(value?.progressLabel),
    nextAction: cleanText(value?.nextAction),
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

function formatUnblockTaskStatusLabel(value) {
  const status = cleanText(value) || "pending";
  const labels = {
    pending: "待处理",
    blocked: "阻塞",
    ready: "已满足",
    done: "已完成",
    completed: "已完成",
    accepted: "已确认",
  };
  return labels[status] || status;
}

function normalizeProductionEnvIntakeVerification(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const alternativeGroups = Array.isArray(source.alternativeGroups)
    ? source.alternativeGroups.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : [];
  const minimumBlockingItems = Array.isArray(source.minimumBlockingItems)
    ? source.minimumBlockingItems.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : blockingFindings.filter((item) =>
      item.severity === "blocking" &&
      (item.type === "alternative_group" || item.type === "variable_row")
    );
  const intakeRowCount = Number(summary.intakeRowCount) || 0;
  const configuredRowCount = Number(summary.configuredRowCount) || 0;
  const missingRowCount = Number(summary.missingRowCount) || Math.max(0, intakeRowCount - configuredRowCount);
  const blockingCount = Number(summary.blockingCount) || blockingFindings.length;
  const warningCount = Number(summary.warningCount) || warningFindings.length;
  const minimumBlockingTargetCount = Number(summary.minimumBlockingTargetCount) || 0;
  const minimumBlockingSatisfiedCount = Number(summary.minimumBlockingSatisfiedCount) || 0;
  const minimumWarningTargetCount = Number(summary.minimumWarningTargetCount) || 0;
  const minimumWarningSatisfiedCount = Number(summary.minimumWarningSatisfiedCount) || 0;
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing" || Boolean(cleanText(summary.label));
  return {
    status,
    statusLabel: source.ready === true
      ? "已通过"
      : !available
        ? "未生成"
        : status === "blocked"
          ? "阻塞"
          : status === "warning"
            ? "提醒"
            : status,
    ready: source.ready === true,
    available,
    checkedAt: cleanText(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (available ? "生产 env 真实值校验待复核" : "生产 env 真实值校验未生成"),
      envFileCount: Number(summary.envFileCount) || 0,
      envFilePathIncluded: summary.envFilePathIncluded === true,
      intakeCsvPathIncluded: summary.intakeCsvPathIncluded === true,
      intakeRowCount,
      configuredRowCount,
      missingRowCount,
      configuredLabel: cleanText(summary.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      alternativeGroupCount: Number(summary.alternativeGroupCount) || alternativeGroups.length,
      alternativeGroupBlockingCount: Number(summary.alternativeGroupBlockingCount) || 0,
      alternativeGroupWarningCount: Number(summary.alternativeGroupWarningCount) || 0,
      minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount: Number(summary.minimumBlockingMissingCount) || Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
      minimumBlockingVariableRowCount: Number(summary.minimumBlockingVariableRowCount) || 0,
      minimumBlockingAlternativeGroupCount: Number(summary.minimumBlockingAlternativeGroupCount) || 0,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
      minimumWarningTargetCount,
      minimumWarningSatisfiedCount,
      minimumWarningMissingCount: Number(summary.minimumWarningMissingCount) || Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
      minimumWarningVariableRowCount: Number(summary.minimumWarningVariableRowCount) || 0,
      minimumWarningAlternativeGroupCount: Number(summary.minimumWarningAlternativeGroupCount) || 0,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
      passedRowCount: Number(summary.passedRowCount) || 0,
      blockingCount,
      warningCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      auditReady: summary.auditReady === true,
      intakeCsvReady: summary.intakeCsvReady === true,
      minimumBlockingItemCount: Number(summary.minimumBlockingItemCount) || minimumBlockingItems.length,
    },
    minimumBlockingItems,
    alternativeGroups,
    blockingFindings,
    warningFindings,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvIntakeLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const verification = normalizeProductionEnvIntakeVerification(source.verification);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : verification.blockingFindings;
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : verification.warningFindings;
  const minimumBlockingItems = Array.isArray(source.minimumBlockingItems)
    ? source.minimumBlockingItems.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : verification.minimumBlockingItems;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const blockingCount = Number(summary.blockingCount) || blockingItems.length + blockingFindings.length;
  const warningCount = Number(summary.warningCount) || warningFindings.length;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "not_configured"
          ? "未配置"
          : status === "error"
            ? "校验失败"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产 env 真实值校验仍有阻塞",
      verificationLabel: cleanText(summary.verificationLabel) || verification.summary.label,
      verificationStatus: cleanText(summary.verificationStatus) || verification.status,
      configuredLabel: cleanText(summary.configuredLabel) || verification.summary.configuredLabel,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || verification.summary.fullIntakeConfiguredLabel,
      intakeRowCount: Number(summary.intakeRowCount) || verification.summary.intakeRowCount,
      configuredRowCount: Number(summary.configuredRowCount) || verification.summary.configuredRowCount,
      missingRowCount: Number(summary.missingRowCount) || verification.summary.missingRowCount,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || verification.summary.minimumBlockingLabel,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || verification.summary.minimumWarningLabel,
      minimumBlockingMissingCount:
        Number(summary.minimumBlockingMissingCount) || verification.summary.minimumBlockingMissingCount,
      minimumWarningMissingCount: Number(summary.minimumWarningMissingCount) || verification.summary.minimumWarningMissingCount,
      blockingCount,
      warningCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      auditReady: summary.auditReady === true || verification.summary.auditReady === true,
      intakeCsvReady: summary.intakeCsvReady === true || verification.summary.intakeCsvReady === true,
      setupReportAvailable: summary.setupReportAvailable === true,
      setupReady: summary.setupReady === true,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true,
      envFileCount: Number(summary.envFileCount) || 0,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathExposed: summary.envFilePathExposed === true,
      intakeCsvPathExposed: summary.intakeCsvPathExposed === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      productionEnvValuesApplyExecuted: summary.productionEnvValuesApplyExecuted === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    verification,
    blockingItems,
    minimumBlockingItems,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: normalizeV1ProductionEnvIntakeServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvIntakeServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    envFileSource: cleanText(source.envFileSource),
    intakeCsvSource: cleanText(source.intakeCsvSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    restartRequired: source.restartRequired === true,
    setupReportAvailable: source.setupReportAvailable === true,
    setupReady: source.setupReady === true,
    envFileCount: Number(source.envFileCount) || 0,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionFirstStageExecution(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const execution = isPlainObject(source.execution) ? source.execution : {};
  const intakeCoverage = normalizeProductionFirstStageIntakeCoverage(source.intakeCoverage);
  const dryRunCoverage = normalizeProductionFirstStageDryRunCoverage(source.dryRunCoverage);
  const stages = Array.isArray(source.stages)
    ? source.stages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : [];
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing" || Boolean(cleanText(summary.label));
  const passedCount = Number(summary.passedCount) || 0;
  const totalCount = Number(summary.totalCount) || stages.length;
  const blockingCount = Number(summary.blockingCount) || blockingStages.length;
  const errorCount = Number(summary.errorCount) || 0;
  return {
    status,
    statusLabel: source.ready === true
      ? "已通过"
      : !available
        ? "未生成"
        : status === "blocked"
          ? "阻塞"
          : status === "error"
            ? "异常"
            : status,
    ready: source.ready === true,
    available,
    checkedAt: cleanText(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (available ? `${passedCount}/${totalCount} 步骤通过` : "第一阶段执行未生成"),
      passedCount,
      plannedCount: Number(summary.plannedCount) || 0,
      totalCount,
      blockingCount,
      errorCount,
      passedLabel: cleanText(summary.passedLabel) || `${passedCount}/${totalCount}`,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      errorLabel: cleanText(summary.errorLabel) || `${errorCount} 项`,
    },
    execution: {
      envFileCount: Number(execution.envFileCount) || 0,
      envFileSourceLabel: cleanText(execution.envFileSourceLabel),
      envFileFromProductionSetup: execution.envFileFromProductionSetup === true,
      planOnly: execution.planOnly === true,
      applyMigrations: execution.applyMigrations === true,
      restoreResetExplicitlyAllowed: execution.restoreResetExplicitlyAllowed === true,
      migrationApplyRequiresExplicitFlag: execution.migrationApplyRequiresExplicitFlag !== false,
      runtimeSmokeUsesExistingApi: execution.runtimeSmokeUsesExistingApi === true,
      fieldEvidenceManifestSourceLabel: cleanText(execution.fieldEvidenceManifestSourceLabel),
      fieldEvidenceManifestConfigured: execution.fieldEvidenceManifestConfigured === true,
      fieldEvidenceManifestDefaultTemplateUsed: execution.fieldEvidenceManifestDefaultTemplateUsed === true,
      productionEnvValuesFileProvided: execution.productionEnvValuesFileProvided === true,
      productionEnvValuesDryRun: execution.productionEnvValuesDryRun === true,
      productionEnvValuesDryRunStopsBeforeFirstStage: execution.productionEnvValuesDryRunStopsBeforeFirstStage === true,
    },
    intakeCoverage,
    dryRunCoverage,
    stages,
    blockingStages,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionFirstStageStage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const evidence = isPlainObject(source.evidence) ? source.evidence : {};
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    status: cleanText(source.status),
    statusLabel: formatUnblockTaskStatusLabel(cleanText(source.status)),
    detail: cleanText(source.detail),
    exitCode: Number.isFinite(Number(source.exitCode)) ? Number(source.exitCode) : null,
    evidence: {
      reportParsed: evidence.reportParsed === true,
      reportStatus: cleanText(evidence.reportStatus),
      reportReady: evidence.reportReady === true,
      dryRun: evidence.dryRun === true,
      dryRunProjectionIncluded: evidence.dryRunProjectionIncluded === true,
      summaryLabel: cleanText(evidence.summaryLabel),
      intakeCoverageIncluded: evidence.intakeCoverageIncluded === true,
      intakeAuditReady: evidence.intakeAuditReady === true,
      intakeCsvReady: evidence.intakeCsvReady === true,
      intakeConfiguredRowCount: Number(evidence.intakeConfiguredRowCount) || 0,
      intakeRowCount: Number(evidence.intakeRowCount) || 0,
      intakeMissingRowCount: Number(evidence.intakeMissingRowCount) || 0,
      fullIntakeConfiguredLabel: cleanText(evidence.fullIntakeConfiguredLabel),
      intakeConfiguredLabel: cleanText(evidence.intakeConfiguredLabel),
      minimumBlockingLabel: cleanText(evidence.minimumBlockingLabel),
      minimumBlockingMissingCount: Number(evidence.minimumBlockingMissingCount) || 0,
      minimumWarningLabel: cleanText(evidence.minimumWarningLabel),
      minimumWarningMissingCount: Number(evidence.minimumWarningMissingCount) || 0,
      passedCount: Number(evidence.passedCount) || 0,
      blockingCount: Number(evidence.blockingCount) || 0,
      warningCount: Number(evidence.warningCount) || 0,
      scope: cleanText(evidence.scope),
    },
    nextActions: normalizeStringList(source.nextActions),
  };
}

function normalizeProductionFirstStageIntakeCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing";
  const configuredRowCount = Number(source.configuredRowCount) || 0;
  const intakeRowCount = Number(source.intakeRowCount) || 0;
  const minimumBlockingSatisfiedCount = Number(source.minimumBlockingSatisfiedCount) || 0;
  const minimumBlockingTargetCount = Number(source.minimumBlockingTargetCount) || 0;
  const minimumWarningSatisfiedCount = Number(source.minimumWarningSatisfiedCount) || 0;
  const minimumWarningTargetCount = Number(source.minimumWarningTargetCount) || 0;
  return {
    available,
    included: source.included === true,
    status,
    statusLabel: cleanText(source.statusLabel) || (source.included === true ? "已纳入" : available ? "未纳入" : "未生成"),
    reportReady: source.reportReady === true,
    auditReady: source.auditReady === true,
    intakeCsvReady: source.intakeCsvReady === true,
    configuredRowCount,
    intakeRowCount,
    missingRowCount: Number(source.missingRowCount) || Math.max(0, intakeRowCount - configuredRowCount),
    configuredLabel: cleanText(source.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    fullIntakeConfiguredLabel: cleanText(source.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    blockingCount: Number(source.blockingCount) || 0,
    warningCount: Number(source.warningCount) || 0,
    alternativeGroupBlockingCount: Number(source.alternativeGroupBlockingCount) || 0,
    alternativeGroupWarningCount: Number(source.alternativeGroupWarningCount) || 0,
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingSatisfiedCount,
    minimumBlockingTargetCount,
    minimumBlockingMissingCount:
      Number(source.minimumBlockingMissingCount) || Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
    minimumBlockingVariableRowCount: Number(source.minimumBlockingVariableRowCount) || 0,
    minimumBlockingAlternativeGroupCount: Number(source.minimumBlockingAlternativeGroupCount) || 0,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumWarningReady: source.minimumWarningReady === true,
    minimumWarningSatisfiedCount,
    minimumWarningTargetCount,
    minimumWarningMissingCount:
      Number(source.minimumWarningMissingCount) || Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
    minimumWarningVariableRowCount: Number(source.minimumWarningVariableRowCount) || 0,
    minimumWarningAlternativeGroupCount: Number(source.minimumWarningAlternativeGroupCount) || 0,
    minimumWarningLabel: cleanText(source.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
    nextAction: cleanText(source.nextAction),
  };
}

function normalizeProductionFirstStageDryRunCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing";
  return {
    available,
    included: source.included === true,
    status,
    statusLabel: cleanText(source.statusLabel) || (source.included === true ? "已纳入" : available ? "未纳入" : "未生成"),
    targetWouldBeWritten: source.targetWouldBeWritten === true,
    envPreflightReady: source.envPreflightReady === true,
    envPreflightPassedCount: Number(source.envPreflightPassedCount) || 0,
    envPreflightTotalCount: Number(source.envPreflightTotalCount) || 0,
    envPreflightBlockingCount: Number(source.envPreflightBlockingCount) || 0,
    envPreflightLabel: cleanText(source.envPreflightLabel) || `${Number(source.envPreflightPassedCount) || 0}/${Number(source.envPreflightTotalCount) || 0}`,
    intakeConfiguredRowCount: Number(source.intakeConfiguredRowCount) || 0,
    intakeRowCount: Number(source.intakeRowCount) || 0,
    intakeLabel: cleanText(source.intakeLabel) || `${Number(source.intakeConfiguredRowCount) || 0}/${Number(source.intakeRowCount) || 0}`,
    intakeMissingRequiredVariableCount: Number(source.intakeMissingRequiredVariableCount) || 0,
    intakeAlternativeGroupBlockingCount: Number(source.intakeAlternativeGroupBlockingCount) || 0,
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingSatisfiedCount: Number(source.minimumBlockingSatisfiedCount) || 0,
    minimumBlockingTargetCount: Number(source.minimumBlockingTargetCount) || 0,
    minimumBlockingMissingCount: Number(source.minimumBlockingMissingCount) || 0,
    minimumBlockingVariableRowCount: Number(source.minimumBlockingVariableRowCount) || 0,
    minimumBlockingAlternativeGroupCount: Number(source.minimumBlockingAlternativeGroupCount) || 0,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel) || `${Number(source.minimumBlockingSatisfiedCount) || 0}/${Number(source.minimumBlockingTargetCount) || 0}`,
    minimumWarningReady: source.minimumWarningReady === true,
    minimumWarningSatisfiedCount: Number(source.minimumWarningSatisfiedCount) || 0,
    minimumWarningTargetCount: Number(source.minimumWarningTargetCount) || 0,
    minimumWarningMissingCount: Number(source.minimumWarningMissingCount) || 0,
    minimumWarningLabel: cleanText(source.minimumWarningLabel) || `${Number(source.minimumWarningSatisfiedCount) || 0}/${Number(source.minimumWarningTargetCount) || 0}`,
    nextAction: cleanText(source.nextAction),
  };
}

function normalizeV1ProductionFirstStageExecutionLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const firstStageExecution = normalizeProductionFirstStageExecution(source.firstStageExecution);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : firstStageExecution.blockingStages;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : firstStageExecution.status || "blocked");
  const blockingCount = Number(summary.blockingCount) || blockingItems.length + blockingStages.length;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "error"
          ? "执行失败"
          : status === "missing"
            ? "未生成"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产环境 / 持久化第一阶段仍有阻塞",
      firstStageLabel: cleanText(summary.firstStageLabel) || firstStageExecution.summary.label,
      firstStageStatus: cleanText(summary.firstStageStatus) || firstStageExecution.status,
      passedCount: Number(summary.passedCount) || firstStageExecution.summary.passedCount,
      totalCount: Number(summary.totalCount) || firstStageExecution.summary.totalCount,
      passedLabel: cleanText(summary.passedLabel) || firstStageExecution.summary.passedLabel,
      blockingCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      errorCount: Number(summary.errorCount) || firstStageExecution.summary.errorCount,
      errorLabel: cleanText(summary.errorLabel) || firstStageExecution.summary.errorLabel,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true,
      envFileSourceLabel: cleanText(summary.envFileSourceLabel),
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathExposed: summary.envFilePathExposed === true,
      productionEnvValuesFileAccepted: summary.productionEnvValuesFileAccepted === true,
      productionEnvValuesApplyExecuted: summary.productionEnvValuesApplyExecuted === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      applyMigrations: summary.applyMigrations === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      runtimeSmokeUsesCurrentApi: summary.runtimeSmokeUsesCurrentApi === true || firstStageExecution.execution.runtimeSmokeUsesExistingApi === true,
      runtimeSmokeApiBaseUrlAccepted: summary.runtimeSmokeApiBaseUrlAccepted === true,
      runtimeSmokeApiBaseUrlExposed: summary.runtimeSmokeApiBaseUrlExposed === true,
      restoreResetExplicitlyAllowed: summary.restoreResetExplicitlyAllowed === true,
      businessDataMutated: summary.businessDataMutated === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    firstStageExecution,
    blockingItems,
    blockingStages,
    serverConfigGuidance: normalizeV1ProductionFirstStageExecutionServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionFirstStageExecutionServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    envFileSource: cleanText(source.envFileSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    restartRequired: source.restartRequired === true,
    applyMigrationsByDefault: source.applyMigrationsByDefault === true,
    restoreResetAllowedByDefault: source.restoreResetAllowedByDefault === true,
    productionEnvValuesFileAccepted: source.productionEnvValuesFileAccepted === true,
    runtimeSmokeApiBaseUrlSource: cleanText(source.runtimeSmokeApiBaseUrlSource),
    runtimeSmokeApiBaseUrlAcceptedFromFrontend: source.runtimeSmokeApiBaseUrlAcceptedFromFrontend === true,
    runtimeSmokeApiBaseUrlExposed: source.runtimeSmokeApiBaseUrlExposed === true,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionPersistenceEvidenceLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const persistenceEvidence = normalizeV1ProductionPersistenceEvidence(source.persistenceEvidence);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeV1ProductionPersistenceEvidenceStage).filter((item) => item.label)
    : persistenceEvidence.blockingStages;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : persistenceEvidence.status || "blocked");
  const blockingCount = Number(summary.blockingCount) || blockingItems.length + blockingStages.length;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "error"
          ? "执行失败"
          : status === "missing"
            ? "未生成"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产持久化留证仍有阻塞",
      evidenceLabel: cleanText(summary.evidenceLabel) || persistenceEvidence.summary.label,
      evidenceStatus: cleanText(summary.evidenceStatus) || persistenceEvidence.status,
      passedCount: Number(summary.passedCount) || persistenceEvidence.summary.passedCount,
      totalCount: Number(summary.totalCount) || persistenceEvidence.summary.totalCount,
      passedLabel: cleanText(summary.passedLabel) || persistenceEvidence.summary.passedLabel,
      blockingCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      warningCount: Number(summary.warningCount) || persistenceEvidence.summary.warningCount,
      warningLabel: cleanText(summary.warningLabel) || `${Number(summary.warningCount) || persistenceEvidence.summary.warningCount} 项`,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true,
      envFileSourceLabel: cleanText(summary.envFileSourceLabel) || persistenceEvidence.envFileSourceLabel,
      persistenceEnvReady: summary.persistenceEnvReady === true,
      postgresReady: summary.postgresReady === true,
      postgresBackupRestoreReady: summary.postgresBackupRestoreReady === true,
      objectStorageReady: summary.objectStorageReady === true,
      objectStorageGovernanceReady: summary.objectStorageGovernanceReady === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathExposed: summary.envFilePathExposed === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      restoreResetExplicitlyAllowed: summary.restoreResetExplicitlyAllowed === true,
      restoreDatabaseMutated: summary.restoreDatabaseMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    persistenceEvidence,
    blockingItems,
    blockingStages,
    serverConfigGuidance: normalizeV1ProductionPersistenceEvidenceServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionPersistenceEvidence(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(normalizeV1ProductionPersistenceEvidenceStage).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeV1ProductionPersistenceEvidenceStage).filter((item) => item.label)
    : stages.filter((item) => item.status !== "passed");
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing" || Boolean(cleanText(summary.label));
  const passedCount = Number(summary.passedCount) || 0;
  const totalCount = Number(summary.totalCount) || stages.length;
  const blockingCount = Number(summary.blockingCount) || blockingStages.length;
  const warningCount = Number(summary.warningCount) || 0;
  const nextActions = normalizeStringList(source.nextActions);
  return {
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "missing"
          ? "未生成"
          : status === "error"
            ? "执行失败"
            : "仍未通过",
    available,
    checkedAt: cleanText(source.checkedAt),
    envFileCount: Number(source.envFileCount) || 0,
    envFileSource: cleanText(source.envFileSource),
    envFileSourceLabel: cleanText(source.envFileSourceLabel),
    envFileFromProductionSetup: source.envFileFromProductionSetup === true,
    summary: {
      label: cleanText(summary.label) || (available ? `${passedCount}/${totalCount} 阶段通过` : "生产持久化留证未生成"),
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      passedLabel: cleanText(summary.passedLabel) || `${passedCount}/${totalCount}`,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      postgresReady: summary.postgresReady === true,
      postgresBackupRestoreReady: summary.postgresBackupRestoreReady === true,
      objectStorageReady: summary.objectStorageReady === true,
      objectStorageGovernanceReady: summary.objectStorageGovernanceReady === true,
      persistenceEnvReady: summary.persistenceEnvReady === true,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true || source.envFileFromProductionSetup === true,
      envFileSource: cleanText(summary.envFileSource || source.envFileSource),
      envFileSourceLabel: cleanText(summary.envFileSourceLabel || source.envFileSourceLabel),
    },
    stages,
    blockingStages,
    nextActions,
    nextAction: nextActions[0] || "",
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionPersistenceEvidenceStage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const evidence = isPlainObject(source.evidence) ? source.evidence : {};
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    status: cleanText(source.status),
    statusLabel: formatUnblockTaskStatusLabel(cleanText(source.status)),
    ready: source.ready === true,
    detail: cleanText(source.detail),
    nextAction: cleanText(source.nextAction),
    evidence: {
      passedCount: Number(evidence.passedCount) || 0,
      totalCount: Number(evidence.totalCount) || 0,
      blockingCount: Number(evidence.blockingCount) || 0,
      warningCount: Number(evidence.warningCount) || 0,
      reportStatus: cleanText(evidence.reportStatus),
      migrationApplyExecuted: evidence.migrationApplyExecuted === true,
      restoreDatabaseMutated: evidence.restoreDatabaseMutated === true,
      dumpFilesRemoved: evidence.dumpFilesRemoved === true,
      readsBucketGovernanceOnly: evidence.readsBucketGovernanceOnly === true,
    },
  };
}

function normalizeV1ProductionPersistenceEvidenceServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    envFileSource: cleanText(source.envFileSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    applyMigrationsByDefault: source.applyMigrationsByDefault === true,
    restoreResetAllowedByDefault: source.restoreResetAllowedByDefault === true,
    writesBusinessData: source.writesBusinessData === true,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionFirstStageValuesDryRunLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const firstStageExecution = normalizeProductionFirstStageExecution(source.firstStageExecution);
  const dryRunCoverage = normalizeProductionFirstStageDryRunCoverage(source.dryRunCoverage || firstStageExecution.dryRunCoverage);
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  const serverConfigGuidance = normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
  });
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : [];
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "not_configured"
        ? "未配置"
        : status === "error"
          ? "预检失败"
          : status === "audit_blocked"
            ? "审计未过"
          : status === "target_not_ready"
            ? "目标 env 未就绪"
          : status === "dry_run_file_binding_blocked"
            ? "dry-run 指纹未过"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "第一阶段真实值 dry-run 仍未通过",
      configuredValuesFileCount: Number(summary.configuredValuesFileCount) || 0,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      valuesFilePathAccepted: summary.valuesFilePathAccepted === true,
      valuesFilePathExposed: summary.valuesFilePathExposed === true,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetSetupStatus: cleanText(summary.targetSetupStatus) || targetSetupStatus.status,
      targetSetupReady: summary.targetSetupReady === true,
      targetSetupReportAvailable: summary.targetSetupReportAvailable === true,
      targetSetupEnvFileCount: Number(summary.targetSetupEnvFileCount) || targetSetupStatus.summary.envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || targetSetupStatus.summary.targetEnvFileConfigured,
      valuesFileAuditStatus: cleanText(summary.valuesFileAuditStatus) || "not_run",
      valuesFileAuditReady: summary.valuesFileAuditReady === true,
      valuesFileAuditExecuted: summary.valuesFileAuditExecuted === true,
      valuesFileAuditBlockingCount: Number(summary.valuesFileAuditBlockingCount) || 0,
      valuesFileAuditWarningCount: Number(summary.valuesFileAuditWarningCount) || 0,
      valuesFileAuditPathExposed: summary.valuesFileAuditPathExposed === true,
      valuesFileAuditValuesIncluded: summary.valuesFileAuditValuesIncluded === true,
      dryRunProofStatus: cleanText(summary.dryRunProofStatus) || serverConfigGuidance.dryRunProofStatus,
      dryRunProofReady: summary.dryRunProofReady === true,
      dryRunProofIncluded: summary.dryRunProofIncluded === true,
      dryRunProofStatusLabel: cleanText(summary.dryRunProofStatusLabel) || serverConfigGuidance.dryRunProofStatusLabel,
      ...normalizeProductionEnvValuesDryRunProofFreshness(summary, serverConfigGuidance),
      ...normalizeProductionEnvValuesDryRunProofFingerprint(summary, serverConfigGuidance),
      dryRunProofMinimumBlockingLabel:
        cleanText(summary.dryRunProofMinimumBlockingLabel) || serverConfigGuidance.dryRunProofMinimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount:
        Number(summary.dryRunProofMinimumBlockingTargetCount) || serverConfigGuidance.dryRunProofMinimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount:
        Number(summary.dryRunProofMinimumBlockingSatisfiedCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount:
        Number(summary.dryRunProofMinimumBlockingMissingCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingMissingCount,
      dryRunProofNextAction: cleanText(summary.dryRunProofNextAction) || serverConfigGuidance.dryRunProofNextAction,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      dryRunStatusLabel: cleanText(summary.dryRunStatusLabel) || dryRunCoverage.statusLabel,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || dryRunCoverage.minimumBlockingLabel,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || dryRunCoverage.minimumWarningLabel,
      envPreflightLabel: cleanText(summary.envPreflightLabel) || dryRunCoverage.envPreflightLabel,
      intakeLabel: cleanText(summary.intakeLabel) || dryRunCoverage.intakeLabel,
      firstStageStatus: cleanText(summary.firstStageStatus) || firstStageExecution.status,
      firstStageLabel: cleanText(summary.firstStageLabel) || firstStageExecution.summary.label,
      blockingCount: Number(summary.blockingCount) || blockingItems.length + blockingStages.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingItems.length + blockingStages.length} 项`,
    },
    dryRunCoverage,
    firstStageExecution,
    targetSetupStatus,
    dryRunProofStatus: normalizeProductionEnvValuesDryRunProofStatus(source.dryRunProofStatus),
    blockingItems,
    blockingStages,
    serverConfigGuidance,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionFirstStageValuesApplyLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const applyReport = normalizeV1ProductionEnvValuesApplyReport(source.applyReport);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : applyReport.blockingFindings;
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : applyReport.warningFindings;
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const applied = summary.productionEnvFileMutated === true || applyReport.targetEnvFile.applied === true;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "disabled"
          ? "未启用"
          : status === "not_configured"
            ? "未配置"
            : status === "audit_blocked"
              ? "审计未过"
            : status === "target_not_ready"
              ? "目标 env 未就绪"
              : status === "dry_run_expired"
                ? "dry-run 已过期"
              : status === "dry_run_stale_or_mismatched"
                ? "dry-run 需重跑"
              : status === "dry_run_file_binding_blocked"
                ? "dry-run 指纹未过"
              : status === "dry_run_not_ready"
                ? "dry-run 未通过"
              : status === "error"
                ? "执行失败"
                : applied
                  ? "已合并待补"
                  : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "真实值正式合并未完成",
      applyEnabled: summary.applyEnabled === true,
      applyEnableEnvVariable: cleanText(summary.applyEnableEnvVariable) || "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
      configuredValuesFileCount: Number(summary.configuredValuesFileCount) || 0,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      valuesFilePathAccepted: summary.valuesFilePathAccepted === true,
      valuesFilePathExposed: summary.valuesFilePathExposed === true,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetSetupStatus: cleanText(summary.targetSetupStatus) || targetSetupStatus.status,
      targetSetupReady: summary.targetSetupReady === true,
      targetSetupReportAvailable: summary.targetSetupReportAvailable === true,
      targetSetupEnvFileCount: Number(summary.targetSetupEnvFileCount) || targetSetupStatus.summary.envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || targetSetupStatus.summary.targetEnvFileConfigured,
      valuesFileAuditStatus: cleanText(summary.valuesFileAuditStatus) || "not_run",
      valuesFileAuditReady: summary.valuesFileAuditReady === true,
      valuesFileAuditExecuted: summary.valuesFileAuditExecuted === true,
      valuesFileAuditBlockingCount: Number(summary.valuesFileAuditBlockingCount) || 0,
      valuesFileAuditWarningCount: Number(summary.valuesFileAuditWarningCount) || 0,
      valuesFileAuditPathExposed: summary.valuesFileAuditPathExposed === true,
      valuesFileAuditValuesIncluded: summary.valuesFileAuditValuesIncluded === true,
      dryRunProofStatus: cleanText(summary.dryRunProofStatus) || "missing",
      dryRunProofReady: summary.dryRunProofReady === true,
      dryRunProofIncluded: summary.dryRunProofIncluded === true,
      dryRunProofStatusLabel: cleanText(summary.dryRunProofStatusLabel) || "未生成",
      ...normalizeProductionEnvValuesDryRunProofFreshness(summary),
      ...normalizeProductionEnvValuesDryRunProofFingerprint(summary),
      dryRunProofMinimumBlockingLabel: cleanText(summary.dryRunProofMinimumBlockingLabel),
      dryRunProofMinimumBlockingTargetCount: Number(summary.dryRunProofMinimumBlockingTargetCount) || 0,
      dryRunProofMinimumBlockingSatisfiedCount: Number(summary.dryRunProofMinimumBlockingSatisfiedCount) || 0,
      dryRunProofMinimumBlockingMissingCount: Number(summary.dryRunProofMinimumBlockingMissingCount) || 0,
      dryRunProofNextAction: cleanText(summary.dryRunProofNextAction),
      targetEnvFileMayBeMutated: summary.targetEnvFileMayBeMutated === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      targetEnvChanged: summary.targetEnvChanged === true,
      targetFileMode0600: summary.targetFileMode0600 === true,
      appliedVariableCount: Number(summary.appliedVariableCount) || applyReport.summary.appliedVariableCount,
      applicableValueCount: Number(summary.applicableValueCount) || applyReport.summary.applicableValueCount,
      blankSourceValueCount: Number(summary.blankSourceValueCount) || applyReport.summary.blankSourceValueCount,
      unknownSourceVariableCount: Number(summary.unknownSourceVariableCount) || applyReport.summary.unknownSourceVariableCount,
      setupReady: summary.setupReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightLabel: cleanText(summary.envPreflightLabel) || applyReport.summary.envPreflightLabel,
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationBlockingCount: Number(summary.intakeVerificationBlockingCount) || 0,
      intakeVerificationWarningCount: Number(summary.intakeVerificationWarningCount) || 0,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      blockingCount: Number(summary.blockingCount) || blockingItems.length + blockingFindings.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingItems.length + blockingFindings.length} 项`,
      warningCount: Number(summary.warningCount) || warningFindings.length,
    },
    applyReport,
    targetSetupStatus,
    blockingItems,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
      primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
    }),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvValuesApplyReport(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : [];
  const envPreflightPassedCount = Number(summary.envPreflightPassedCount) || 0;
  const envPreflightTotalCount = Number(summary.envPreflightTotalCount) || 0;
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    dryRun: source.dryRun === true,
    summary: {
      label: cleanText(summary.label),
      sourceAssignmentCount: Number(summary.sourceAssignmentCount) || 0,
      allowedVariableCount: Number(summary.allowedVariableCount) || 0,
      applicableValueCount: Number(summary.applicableValueCount) || 0,
      blankSourceValueCount: Number(summary.blankSourceValueCount) || 0,
      unknownSourceVariableCount: Number(summary.unknownSourceVariableCount) || 0,
      appliedVariableCount: Number(summary.appliedVariableCount) || 0,
      targetChanged: summary.targetChanged === true,
      targetMode: cleanText(summary.targetMode),
      setupReady: summary.setupReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightPassedCount,
      envPreflightTotalCount,
      envPreflightLabel: `${envPreflightPassedCount}/${envPreflightTotalCount}`,
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationBlockingCount: Number(summary.intakeVerificationBlockingCount) || 0,
      intakeVerificationWarningCount: Number(summary.intakeVerificationWarningCount) || 0,
      blockingCount: Number(summary.blockingCount) || blockingFindings.length,
      warningCount: Number(summary.warningCount) || warningFindings.length,
    },
    sourceEnvFile: normalizeV1ProductionEnvValuesApplyFile(source.sourceEnvFile),
    targetEnvFile: normalizeV1ProductionEnvValuesApplyTargetFile(source.targetEnvFile),
    intakeCsv: normalizeV1ProductionEnvValuesApplyIntakeCsv(source.intakeCsv),
    appliedVariables: normalizeStringList(source.appliedVariables),
    skippedVariables: {
      blankSourceVariables: normalizeStringList(source.skippedVariables?.blankSourceVariables),
      unknownSourceVariables: normalizeStringList(source.skippedVariables?.unknownSourceVariables),
      safeLiteralMismatches: normalizeStringList(source.skippedVariables?.safeLiteralMismatches),
    },
    alternativeGroups: Array.isArray(source.alternativeGroups)
      ? source.alternativeGroups.map(normalizeV1ProductionEnvValuesApplyAlternativeGroup).filter((item) => item.groupKey)
      : [],
    setupRefresh: normalizeV1ProductionEnvValuesApplySetupRefresh(source.setupRefresh),
    intakeVerification: normalizeV1ProductionEnvValuesApplyIntakeVerification(source.intakeVerification),
    blockingFindings,
    warningFindings,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvValuesApplyFile(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    pathIncluded: source.pathIncluded === true,
    exists: source.exists === true,
    auditReady: source.auditReady === true,
    auditStatus: cleanText(source.auditStatus) || "not_run",
    assignmentCount: Number(source.assignmentCount) || 0,
    unknownVariableCount: Number(source.unknownVariableCount) || 0,
    blankValueCount: Number(source.blankValueCount) || 0,
  };
}

function normalizeV1ProductionEnvValuesApplyTargetFile(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    pathIncluded: source.pathIncluded === true,
    exists: source.exists === true,
    auditReadyBefore: source.auditReadyBefore === true,
    auditStatusBefore: cleanText(source.auditStatusBefore) || "not_run",
    applied: source.applied === true,
    changed: source.changed === true,
    fileMode: cleanText(source.fileMode),
  };
}

function normalizeV1ProductionEnvValuesApplyIntakeCsv(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    pathIncluded: source.pathIncluded === true,
    ready: source.ready === true,
    rowCount: Number(source.rowCount) || 0,
    allowedVariableCount: Number(source.allowedVariableCount) || 0,
    missingHeaderCount: Number(source.missingHeaderCount) || 0,
    missingHeaders: normalizeStringList(source.missingHeaders),
  };
}

function normalizeV1ProductionEnvValuesApplyAlternativeGroup(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    groupKey: cleanText(source.groupKey),
    variableCount: Number(source.variableCount) || 0,
    configuredKeyCount: Number(source.configuredKeyCount) || 0,
    configuredKeys: normalizeStringList(source.configuredKeys),
    status: cleanText(source.status),
    severity: cleanText(source.severity),
    rawValuesIncluded: source.rawValuesIncluded === true,
  };
}

function normalizeV1ProductionEnvValuesApplyFinding(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    severity: cleanText(source.severity) || "blocking",
    status: cleanText(source.status) || "blocked",
    statusLabel: formatUnblockTaskStatusLabel(cleanText(source.status) || "blocked"),
    detail: cleanText(source.detail),
    nextAction: cleanText(source.nextAction),
    variables: normalizeStringList(source.variables),
  };
}

function normalizeV1ProductionEnvValuesApplySetupRefresh(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const envPreflight = isPlainObject(source.envPreflight) ? source.envPreflight : {};
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(source.summary?.label),
      remainingFixItemCount: Number(source.summary?.remainingFixItemCount) || 0,
    },
    envPreflight: {
      ready: envPreflight.ready === true,
      status: cleanText(envPreflight.status),
      passedCount: Number(envPreflight.passedCount) || 0,
      totalCount: Number(envPreflight.totalCount) || 0,
      blockingCount: Number(envPreflight.blockingCount) || 0,
      warningCount: Number(envPreflight.warningCount) || 0,
      firstRemainingFixItems: Array.isArray(envPreflight.firstRemainingFixItems)
        ? envPreflight.firstRemainingFixItems.map((item) => ({
            key: cleanText(item?.key),
            label: cleanText(item?.label),
            status: cleanText(item?.status),
            missingVariables: normalizeStringList(item?.missingVariables),
          }))
        : [],
    },
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvValuesApplyIntakeVerification(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      intakeRowCount: Number(source.summary?.intakeRowCount) || 0,
      configuredRowCount: Number(source.summary?.configuredRowCount) || 0,
      missingRowCount: Number(source.summary?.missingRowCount) || 0,
      blockingCount: Number(source.summary?.blockingCount) || 0,
      warningCount: Number(source.summary?.warningCount) || 0,
      alternativeGroupBlockingCount: Number(source.summary?.alternativeGroupBlockingCount) || 0,
    },
    firstBlockingFindings: Array.isArray(source.firstBlockingFindings)
      ? source.firstBlockingFindings.map((item) => ({
          type: cleanText(item?.type),
          label: cleanText(item?.label),
          variableKey: cleanText(item?.variableKey),
          status: cleanText(item?.status),
          detail: cleanText(item?.detail),
          nextAction: cleanText(item?.nextAction),
        }))
      : [],
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionFirstStageValuesDryRunBlockingItem(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    statusLabel: formatUnblockTaskStatusLabel(cleanText(value?.status) || "blocked"),
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeProductionEnvIntakeFinding(value = {}) {
  const variables = normalizeStringList(value?.variables);
  return {
    type: cleanText(value?.type),
    key: cleanText(value?.key),
    itemKey: cleanText(value?.itemKey),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    severity: cleanText(value?.severity) || "warning",
    status: cleanText(value?.status),
    variableKey: cleanText(value?.variableKey),
    alternativeGroup: cleanText(value?.alternativeGroup),
    variables,
    configuredKeyCount: Number(value?.configuredKeyCount) || 0,
    sourceSystem: cleanText(value?.sourceSystem),
    expectedValueType: cleanText(value?.expectedValueType),
    configured: value?.configured === true,
    safeLiteralRequired: value?.safeLiteralRequired === true,
    safeLiteralMatches: value?.safeLiteralMatches !== false,
    filledMarked: value?.filledMarked === true,
    verifiedMarked: value?.verifiedMarked === true,
    evidenceProvided: value?.evidenceProvided === true,
    rawProofRefIncluded: value?.rawProofRefIncluded === true,
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
    variableLabel: cleanText(value?.variableKey) || variables.join(" / ") || cleanText(value?.alternativeGroup),
  };
}

function normalizeProductionEnvFixChecklist(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const items = Array.isArray(source.items)
    ? source.items.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  const configuredVariableCount = Number(summary.configuredVariableCount) || items.reduce((total, item) => total + item.configuredVariableCount, 0);
  const totalVariableCount = Number(summary.totalVariableCount) || items.reduce((total, item) => total + item.totalVariableCount, 0);
  return {
    status: cleanText(source.status) || (items.some((item) => item.severity === "blocking") ? "blocked" : "passed"),
    ready: source.ready === true,
    summary: {
      label: cleanText(summary.label) || (items.length ? `生产环境修正清单：${items.length} 项` : ""),
      itemCount: Number(summary.itemCount) || items.length,
      blockingCount: Number(summary.blockingCount) || items.filter((item) => item.severity === "blocking").length,
      warningCount: Number(summary.warningCount) || items.filter((item) => item.severity === "warning").length,
      passedCount: Number(summary.passedCount) || items.filter((item) => item.status === "passed").length,
      configuredVariableCount,
      totalVariableCount,
      configuredLabel: `${configuredVariableCount}/${totalVariableCount}`,
    },
    items,
  };
}

function normalizeProductionEnvFixItem(value = {}) {
  const requiredVariables = normalizeStringList(value?.requiredVariables);
  const missingVariables = normalizeStringList(value?.missingVariables);
  const placeholderVariables = normalizeStringList(value?.placeholderVariables);
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    severity: cleanText(value?.severity) || "warning",
    status: cleanText(value?.status),
    ready: value?.ready === true,
    blocking: value?.blocking === true,
    configuredVariableCount: Number(value?.configuredVariableCount) || 0,
    totalVariableCount: Number(value?.totalVariableCount) || 0,
    requiredVariables,
    missingVariables,
    placeholderVariables,
    valueGuidance: normalizeStringList(value?.valueGuidance),
    verificationSteps: normalizeStringList(value?.verificationSteps),
    variableLabel: missingVariables.length
      ? missingVariables.join("、")
      : requiredVariables.slice(0, 3).join("、"),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeProductionEnvFillTemplate(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const variableNames = normalizeStringList(source.variableNames);
  const previewLines = Array.isArray(source.previewLines)
    ? source.previewLines.map((line) => cleanText(line))
    : [];
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    available: cleanText(source.status) === "available" && previewLines.some((line) => line !== ""),
    summary: {
      label: cleanText(summary.label),
      lineCount: Number(summary.lineCount) || previewLines.length,
      variableCount: Number(summary.variableCount) || variableNames.length,
      placeholderCount: Number(summary.placeholderCount) || previewLines.filter((line) => line.includes("<待填写>")).length,
      blockingSectionCount: Number(summary.blockingSectionCount) || 0,
      warningSectionCount: Number(summary.warningSectionCount) || 0,
      templateKind: cleanText(summary.templateKind),
      fileName: cleanText(summary.fileName),
      targetLabel: cleanText(summary.targetLabel),
      commandLineCount: Number(summary.commandLineCount) || 0,
    },
    variableNames,
    previewLines,
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeModuleV1V2Differences(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
        module: cleanText(item?.module),
        v1: cleanText(item?.v1),
        v2: cleanText(item?.v2),
      })).filter((item) => item.module || item.v2)
    : [];
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

function formatCountLabel(value, unit) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return `${Math.trunc(parsed)} ${unit}`;
}

function formatShownCountLabel(shown, total) {
  const parsedShown = Number(shown);
  const parsedTotal = Number(total);
  if (!Number.isFinite(parsedShown) || !Number.isFinite(parsedTotal) || parsedTotal <= 0) return "";
  return `${Math.trunc(parsedShown)}/${Math.trunc(parsedTotal)}`;
}

function extractFirstCount(value) {
  return cleanText(value).match(/\d+\s*\/\s*\d+/)?.[0]?.replace(/\s+/g, "") || "";
}

function extractFieldEvidenceCount(value) {
  return cleanText(value).match(/证据\s*(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s+/g, "") || "";
}

function extractSignoffCount(value) {
  return cleanText(value).match(/签字\s*(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s+/g, "") || "";
}

function formatDateTimeLabel(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeStringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((item) => cleanText(item)).filter(Boolean);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
