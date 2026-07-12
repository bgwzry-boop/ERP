import {
  formatDraftFreshnessStatusLabel,
  formatDraftManifestStatusLabel,
} from "./officeV1GoLiveStatusFieldEvidenceNormalizers.js";
import { normalizeV1ProductionEnvFileAuditConfigSourceStatus } from "./officeV1GoLiveStatusProductionEnvNormalizers.js";
import {
  cleanText,
  formatDateTimeLabel,
  isPlainObject,
  normalizeStringList,
} from "./officeV1GoLiveStatusNormalizerUtils.js";

export function normalizeV1V2BoundaryPrecheckResult(value = {}) {
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
export function normalizeV1V2ScopeBriefRefreshResult(value = {}) {
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

export function normalizeV1ReleaseCandidateRefreshPrecheckResult(value = {}) {
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

export function normalizeV1ReleaseCandidateRefreshResult(value = {}) {
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

export function normalizeModuleV1V2Differences(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
        module: cleanText(item?.module),
        v1: cleanText(item?.v1),
        v2: cleanText(item?.v2),
      })).filter((item) => item.module || item.v2)
    : [];
}
