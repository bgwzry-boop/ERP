import {
  cleanText,
  formatDateTimeLabel,
  formatShownCountLabel,
  isPlainObject,
  normalizeStringList,
} from "./officeV1GoLiveStatusNormalizerUtils.js";

export function normalizeFieldEvidenceProgress(value = {}) {
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

export function normalizeFieldEvidenceDraftFreshness(value = {}) {
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

export function normalizeFieldEvidenceIntakeGuidance(value = {}) {
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

export function normalizeFieldEvidenceIntakeQuality(value = {}) {
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

export function normalizeV1FieldEvidenceDraftManifestResult(value = {}) {
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

export function normalizeV1FieldEvidenceDraftValidationResult(value = {}) {
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
      evidenceProgress: cleanText(summary.evidenceProgress) || "0/40",
      signoffProgress: cleanText(summary.signoffProgress) || "0/6",
      evidenceGroupsReadyLabel: cleanText(summary.evidenceGroupsReadyLabel) || "0/7",
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

export function normalizeV1FieldEvidenceStageRowResult(value = {}) {
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
      evidenceProgress: cleanText(summary.evidenceProgress) || "0/40",
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
    evidenceProgress: cleanText(source.evidenceProgress) || "0/40",
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

export function formatDraftManifestStatusLabel(status) {
  if (status === "available") return "已生成";
  if (status === "invalid") return "草稿异常";
  return "未生成";
}

export function formatDraftFreshnessStatusLabel(status) {
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
