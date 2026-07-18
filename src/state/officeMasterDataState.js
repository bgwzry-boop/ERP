export function upsertMasterDataImportExecution(items = [], execution) {
  if (!execution?.executionId) return Array.isArray(items) ? items : [];
  const next = [execution, ...(Array.isArray(items) ? items : []).filter((item) => item.executionId !== execution.executionId)];
  return next.slice(0, 8);
}

export function upsertMasterDataImportReviewDraft(items = [], draft) {
  if (!draft?.draftId) return Array.isArray(items) ? items : [];
  const next = [draft, ...(Array.isArray(items) ? items : []).filter((item) => item.draftId !== draft.draftId)];
  return next.slice(0, 8);
}

export function getMasterDataExecutionFailedRows(execution = {}) {
  const rows = Array.isArray(execution.failedRows)
    ? execution.failedRows
    : execution.importPayload?.failedRows;
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      sheetKey: String(row?.sheetKey ?? "").trim(),
      worksheetName: String(row?.worksheetName ?? "").trim(),
      rowNumber: Number(row?.rowNumber) || 0,
      reason: String(row?.reason ?? "").trim(),
      values: normalizeMasterDataFailedRowValues(row?.values),
    }))
    .filter((row) => row.sheetKey && row.rowNumber > 0);
}

export function getMasterDataFailedRowKey(row = {}) {
  const sheetKey = String(row.sheetKey ?? "").trim();
  const rowNumber = Number(row.rowNumber) || 0;
  return sheetKey && rowNumber > 0 ? `${sheetKey}|${rowNumber}` : "";
}

export function normalizeMasterDataFailedRowValues(values = {}) {
  return Object.fromEntries(
    Object.entries(values ?? {})
      .map(([field, value]) => [String(field ?? "").trim(), String(value ?? "")])
      .filter(([field]) => field),
  );
}

export function getMasterDataFailedRowFields(row = {}) {
  return Object.entries(normalizeMasterDataFailedRowValues(row.values)).map(([field, value]) => ({
    field,
    value,
  }));
}

export function getMasterDataPrecheckTone(status) {
  if (status === "passed") return "passed";
  if (status === "review") return "review";
  if (status === "blocked") return "blocked";
  return "idle";
}

export function hasCommittedMasterDataImportExecution(executions = [], planId = "") {
  const targetPlanId = String(planId ?? "").trim();
  return (Array.isArray(executions) ? executions : []).some((execution) =>
    execution.planId === targetPlanId && execution.status === "committed"
  );
}

export function getEmployeeReviewRowTone(review = {}) {
  if (review.passwordStatus === "password_revoked") return "revoked";
  if (review.passwordStatus === "password_expired") return "review";
  if (review.accountEnabled) return "committed";
  return "review";
}

export function formatCompactDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(5, 16).replace("T", " ");
}

export function getEmployeePasswordStatusLabel(review = {}) {
  if (review.passwordStatus === "password_revoked") return "密码已撤销";
  if (review.passwordStatus === "password_expired") return "密码已过期待改密";
  if (review.passwordStatus === "active") return "正式密码已生效";
  if (review.mustChangePassword) return "临时密码待改密";
  if (review.passwordIssuedAt) return `已发临时密码 ${formatCompactDateTime(review.passwordIssuedAt)}`;
  return "未发密码";
}

export function canRevokeEmployeePassword(review = {}) {
  if (!review.accountEnabled || !review.userId) return false;
  if (review.passwordStatus === "password_revoked") return false;
  return review.loginEnabled !== false;
}

export function upsertMasterDataEmployeeAccountReview(items = [], review) {
  if (!review?.employeeId) return Array.isArray(items) ? items : [];
  return [
    review,
    ...(Array.isArray(items) ? items : []).filter((item) => item.employeeId !== review.employeeId),
  ];
}

export function mergeMasterDataEmployeeAccountReviews(items = [], reviews = []) {
  const updates = new Map(
    (Array.isArray(reviews) ? reviews : [])
      .filter((review) => review?.employeeId)
      .map((review) => [review.employeeId, review]),
  );
  const current = Array.isArray(items) ? items : [];
  const merged = current.map((review) => updates.get(review.employeeId) ?? review);
  const knownIds = new Set(current.map((review) => review?.employeeId).filter(Boolean));
  for (const review of updates.values()) {
    if (!knownIds.has(review.employeeId)) merged.push(review);
  }
  return merged;
}

export function getMasterDataExecutionTone(status = "") {
  if (status === "committed") return "committed";
  if (status === "failed" || status === "blocked_failed_rows_ready") return "blocked";
  if (String(status).startsWith("blocked_")) return "review";
  return "pending";
}
