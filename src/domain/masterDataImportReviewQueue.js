export const MASTER_DATA_IMPORT_REVIEW_VERSION = "p0-master-data-import-review-v1";

const reviewStatuses = {
  blocked: {
    label: "存在阻断",
    tone: "blocked",
    nextAction: "先修正阻断项，再重新上传预检查。",
  },
  pending_review: {
    label: "待人工确认",
    tone: "review",
    nextAction: "由有权限人员确认需人工复核项，再决定是否进入正式导入。",
  },
  ready_for_import_confirmation: {
    label: "待确认导入",
    tone: "passed",
    nextAction: "等待有权限人员执行正式导入确认；当前草稿不写正式数据。",
  },
};

export function canCreateMasterDataImportReviewDraft(precheckResult) {
  return getPrecheckErrorCount(precheckResult) === 0 && precheckResult?.summary?.importAllowed !== false;
}

export function createMasterDataImportReviewDraft(input = {}) {
  const precheckResult = input.precheckResult ?? {};
  const createdAt = cleanText(input.createdAt) || new Date().toISOString();
  const requestedBy = cleanText(input.requestedBy) || "unknown";
  const status = getReviewStatus(precheckResult);
  const statusMeta = reviewStatuses[status];
  const summary = precheckResult.summary ?? {};
  const issues = normalizeIssues(precheckResult.issues);
  const sheets = normalizeSheets(precheckResult.sheets);
  const stagedRows = normalizeStagedRows(precheckResult.stagedRows);
  const errorCount = getPrecheckErrorCount(precheckResult);
  const warningCount = getPrecheckWarningCount(precheckResult);
  const dataRowCount = toFiniteNumber(summary.dataRowCount);
  const employeeRoleCoverage = normalizeMasterDataEmployeeRoleCoverage(precheckResult.employeeRoleCoverage);
  const employeePayrollAttendanceCoverage = normalizeMasterDataEmployeePayrollAttendanceCoverage(precheckResult.employeePayrollAttendanceCoverage);

  return {
    version: MASTER_DATA_IMPORT_REVIEW_VERSION,
    draftId: buildReviewDraftId({
      fileName: precheckResult.fileName,
      checkedAt: precheckResult.checkedAt,
      createdAt,
      dataRowCount,
      issueCount: issues.length,
    }),
    status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    nextAction: statusMeta.nextAction,
    precheckVersion: cleanText(precheckResult.version),
    templateVersion: cleanText(precheckResult.templateVersion),
    fileName: cleanText(precheckResult.fileName),
    checkedAt: cleanText(precheckResult.checkedAt),
    createdAt,
    requestedBy,
    canEnterReviewQueue: errorCount === 0,
    officialImportEnabled: false,
    officialWriteScope: "none",
    summary: {
      dataRowCount,
      sheetCount: toFiniteNumber(summary.sheetCount) || sheets.length,
      checkedSheetCount: toFiniteNumber(summary.checkedSheetCount),
      errorCount,
      warningCount,
      issueCount: issues.length,
      importAllowed: errorCount === 0,
      requiresManualReview: warningCount > 0,
      employeeRoleCoverageLabel: employeeRoleCoverage.coverageLabel,
      employeePayrollAttendanceCoverageLabel: employeePayrollAttendanceCoverage.coverageLabel,
    },
    employeeRoleCoverage,
    employeePayrollAttendanceCoverage,
    sheets,
    stagedRows,
    issues: issues.slice(0, 20),
  };
}

export function createMasterDataImportCorrectionDraftFromFailedRows(input = {}) {
  const importExecution = input.importExecution ?? {};
  const failedRows = getExecutionFailedRows(importExecution);
  if (!failedRows.length) {
    throw new Error("没有可生成修正草稿的失败行。");
  }

  const createdAt = cleanText(input.createdAt) || new Date().toISOString();
  const requestedBy = cleanText(input.requestedBy) || "unknown";
  const corrections = buildCorrectionMap(input.rowCorrections);
  const stagedRowsBySheet = new Map();
  const issues = [];
  let correctedRowCount = 0;

  for (const failedRow of failedRows) {
    const rowKey = buildFailedRowKey(failedRow);
    const correction = corrections.get(rowKey);
    const correctedValues = correction ? normalizeRowValues(correction.values) : normalizeRowValues(failedRow.values);
    const corrected = Boolean(correction && Object.keys(correctedValues).length > 0);
    if (corrected) correctedRowCount += 1;

    const sheetKey = cleanText(failedRow.sheetKey);
    const worksheetName = cleanText(failedRow.worksheetName);
    if (!stagedRowsBySheet.has(sheetKey)) {
      stagedRowsBySheet.set(sheetKey, {
        sheetKey,
        worksheetName,
        rows: [],
      });
    }
    stagedRowsBySheet.get(sheetKey).rows.push({
      rowNumber: toFiniteNumber(failedRow.rowNumber),
      values: correctedValues,
    });
    issues.push({
      severity: corrected ? "info" : "warning",
      severityLabel: corrected ? "提示" : "需确认",
      sheet: worksheetName,
      row: String(toFiniteNumber(failedRow.rowNumber) || ""),
      field: "",
      message: corrected
        ? `原失败原因：${cleanText(failedRow.reason)}。已带入修正字段，需重新生成确认计划验证。`
        : `原失败原因：${cleanText(failedRow.reason)}。尚未填入修正字段，需先按失败行下载结果修正。`,
    });
  }

  const stagedRows = Array.from(stagedRowsBySheet.values())
    .filter((sheet) => sheet.sheetKey && sheet.rows.length > 0);
  const unresolvedRowCount = failedRows.length - correctedRowCount;
  const status = unresolvedRowCount > 0 ? "pending_review" : "ready_for_import_confirmation";
  const statusMeta = reviewStatuses[status];

  return {
    version: MASTER_DATA_IMPORT_REVIEW_VERSION,
    draftId: buildReviewDraftId({
      fileName: `failed-rows-correction-${importExecution.executionId}`,
      checkedAt: cleanText(importExecution.requestedAt),
      createdAt,
      dataRowCount: failedRows.length,
      issueCount: issues.length,
    }),
    status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    nextAction: unresolvedRowCount > 0
      ? "先修正失败行字段，再生成确认计划；当前草稿不写正式数据。"
      : statusMeta.nextAction,
    precheckVersion: "failed_rows_correction_draft",
    templateVersion: cleanText(importExecution.importPayloadVersion),
    fileName: `失败行修正草稿-${cleanText(importExecution.executionId)}.csv`,
    checkedAt: createdAt,
    createdAt,
    requestedBy,
    canEnterReviewQueue: true,
    officialImportEnabled: false,
    officialWriteScope: "none",
    correctionMode: "failed_rows_reimport",
    sourceExecutionId: cleanText(importExecution.executionId),
    sourcePlanId: cleanText(importExecution.planId),
    sourceDraftId: cleanText(importExecution.draftId),
    correctionSummary: {
      failedRowCount: failedRows.length,
      correctedRowCount,
      unresolvedRowCount,
    },
    summary: {
      dataRowCount: failedRows.length,
      sheetCount: stagedRows.length,
      checkedSheetCount: stagedRows.length,
      errorCount: 0,
      warningCount: unresolvedRowCount,
      issueCount: issues.length,
      importAllowed: true,
      requiresManualReview: unresolvedRowCount > 0,
      failedRowCount: failedRows.length,
      correctedRowCount,
      unresolvedRowCount,
      sourceExecutionId: cleanText(importExecution.executionId),
    },
    sheets: stagedRows.map((sheet) => ({
      key: sheet.sheetKey,
      label: sheet.worksheetName || sheet.sheetKey,
      worksheetName: sheet.worksheetName,
      status: unresolvedRowCount > 0 ? "warning" : "ok",
      dataRowCount: sheet.rows.length,
      issueCount: issues.filter((issue) => issue.sheet === sheet.worksheetName).length,
    })),
    stagedRows,
    issues: issues.slice(0, 50),
  };
}

export function getMasterDataImportReviewDraftSummary(draft) {
  if (!draft) return "";
  const rowLabel = `${draft.summary?.dataRowCount ?? 0} 行`;
  const warningLabel = `${draft.summary?.warningCount ?? 0} 项需确认`;
  const errorLabel = `${draft.summary?.errorCount ?? 0} 项阻断`;
  const roleLabel = draft.employeeRoleCoverage?.available ? ` · 岗位 ${draft.employeeRoleCoverage.coverageLabel}` : "";
  return `${draft.statusLabel || "待处理"} · ${rowLabel} · ${errorLabel} · ${warningLabel}${roleLabel}`;
}

export function normalizeMasterDataEmployeeRoleCoverage(value = {}) {
  const roles = (Array.isArray(value.roles) ? value.roles : []).map((role) => ({
    roleKey: cleanText(role.roleKey),
    roleLabel: cleanText(role.roleLabel),
    covered: role.covered === true,
    rowCount: toFiniteNumber(role.rowCount),
  })).filter((role) => role.roleKey && role.roleLabel);
  const requiredRoleCount = toFiniteNumber(value.requiredRoleCount) || roles.length;
  const coveredRoleCount = toFiniteNumber(value.coveredRoleCount) || roles.filter((role) => role.covered).length;
  return {
    available: value.available === true,
    complete: value.complete === true && requiredRoleCount > 0 && coveredRoleCount === requiredRoleCount,
    employeeRowCount: toFiniteNumber(value.employeeRowCount),
    requiredRoleCount,
    coveredRoleCount,
    missingRoleCount: Math.max(0, requiredRoleCount - coveredRoleCount),
    coverageLabel: requiredRoleCount ? `${coveredRoleCount}/${requiredRoleCount}` : "0/8",
    missingRoleLabels: (Array.isArray(value.missingRoleLabels) ? value.missingRoleLabels : []).map(cleanText).filter(Boolean),
    roles,
  };
}

export function normalizeMasterDataEmployeePayrollAttendanceCoverage(value = {}) {
  const employeeCount = toFiniteNumber(value.employeeCount);
  const completeCount = Math.min(employeeCount, toFiniteNumber(value.completeCount));
  return {
    available: value.available === true,
    complete: value.complete === true && employeeCount > 0 && completeCount === employeeCount,
    employeeCount,
    completeCount,
    incompleteCount: Math.max(0, employeeCount - completeCount),
    profileReadyCount: Math.min(employeeCount, toFiniteNumber(value.profileReadyCount)),
    wageReadyCount: Math.min(employeeCount, toFiniteNumber(value.wageReadyCount)),
    attendanceMappingReadyCount: Math.min(employeeCount, toFiniteNumber(value.attendanceMappingReadyCount)),
    coverageLabel: `${completeCount}/${employeeCount}`,
  };
}

function getReviewStatus(precheckResult) {
  if (getPrecheckErrorCount(precheckResult) > 0 || precheckResult?.summary?.importAllowed === false) {
    return "blocked";
  }
  if (getPrecheckWarningCount(precheckResult) > 0 || precheckResult?.summary?.status === "review") {
    return "pending_review";
  }
  return "ready_for_import_confirmation";
}

function normalizeSheets(sheets) {
  return (Array.isArray(sheets) ? sheets : []).map((sheet) => ({
    key: cleanText(sheet.key),
    label: cleanText(sheet.label),
    worksheetName: cleanText(sheet.worksheetName),
    status: cleanText(sheet.status),
    dataRowCount: toFiniteNumber(sheet.dataRowCount),
    issueCount: Array.isArray(sheet.issues) ? sheet.issues.length : 0,
  }));
}

function normalizeStagedRows(stagedRows) {
  return (Array.isArray(stagedRows) ? stagedRows : [])
    .map((sheet) => ({
      sheetKey: cleanText(sheet.sheetKey ?? sheet.key),
      worksheetName: cleanText(sheet.worksheetName),
      rows: (Array.isArray(sheet.rows) ? sheet.rows : [])
        .map((row) => ({
          rowNumber: toFiniteNumber(row.rowNumber),
          values: normalizeRowValues(row.values),
        }))
        .filter((row) => row.rowNumber > 0 && Object.values(row.values).some(Boolean)),
    }))
    .filter((sheet) => sheet.sheetKey && sheet.rows.length > 0);
}

function normalizeRowValues(values = {}) {
  return Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [cleanText(key), cleanText(value)]));
}

function normalizeIssues(issues) {
  return (Array.isArray(issues) ? issues : []).map((issue) => ({
    severity: cleanText(issue.severity),
    severityLabel: cleanText(issue.severityLabel) || getSeverityLabel(issue.severity),
    sheet: cleanText(issue.sheet),
    row: cleanText(issue.row),
    field: cleanText(issue.field),
    message: cleanText(issue.message),
  }));
}

function getExecutionFailedRows(importExecution) {
  const failedRows = Array.isArray(importExecution.failedRows)
    ? importExecution.failedRows
    : importExecution.importPayload?.failedRows;
  return (Array.isArray(failedRows) ? failedRows : [])
    .map((row) => ({
      sheetKey: cleanText(row.sheetKey),
      worksheetName: cleanText(row.worksheetName),
      rowNumber: toFiniteNumber(row.rowNumber),
      reason: cleanText(row.reason),
      values: normalizeRowValues(row.values),
    }))
    .filter((row) => row.sheetKey && row.rowNumber > 0);
}

function buildCorrectionMap(rowCorrections) {
  const map = new Map();
  for (const correction of Array.isArray(rowCorrections) ? rowCorrections : []) {
    const sheetKey = cleanText(correction.sheetKey);
    const rowNumber = toFiniteNumber(correction.rowNumber);
    if (!sheetKey || rowNumber <= 0) continue;
    map.set(`${sheetKey}|${rowNumber}`, {
      values: normalizeRowValues(correction.values),
    });
  }
  return map;
}

function buildFailedRowKey(row) {
  return `${cleanText(row.sheetKey)}|${toFiniteNumber(row.rowNumber)}`;
}

function getPrecheckErrorCount(precheckResult) {
  const summaryCount = toFiniteNumber(precheckResult?.summary?.errorCount);
  if (summaryCount) return summaryCount;
  return (Array.isArray(precheckResult?.issues) ? precheckResult.issues : []).filter((issue) => issue.severity === "error").length;
}

function getPrecheckWarningCount(precheckResult) {
  const summaryCount = toFiniteNumber(precheckResult?.summary?.warningCount);
  if (summaryCount) return summaryCount;
  return (Array.isArray(precheckResult?.issues) ? precheckResult.issues : []).filter((issue) => issue.severity === "warning").length;
}

function buildReviewDraftId(input) {
  const date = compactDate(input.createdAt || input.checkedAt);
  const seed = [
    input.fileName,
    input.checkedAt,
    input.createdAt,
    input.dataRowCount,
    input.issueCount,
  ].map(cleanText).join("|");
  return `MDI-${date}-${stableHash(seed)}`;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = cleanText(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

function compactDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (match) return `${match[1]}${match[2]}${match[3]}`;
  return "00000000";
}

function getSeverityLabel(severity) {
  if (severity === "error") return "阻断";
  if (severity === "warning") return "需确认";
  return "提示";
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
