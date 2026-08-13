import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";

export function createAttendancePayrollRepository(options = {}) {
  const mode =
    options.mode ?? process.env.ERP_ATTENDANCE_PAYROLL_STORE ?? process.env.ERP_V1_STORE ?? "local";
  if (mode === "postgres") return createPostgresAttendancePayrollRepository(options);
  if (mode === "local") return createLocalAttendancePayrollRepository();
  throw new Error(`Unsupported attendance/payroll repository mode: ${mode}`);
}

export function createLocalAttendancePayrollRepository() {
  return Object.freeze({
    kind: "local_memory",
    loadState() {
      return emptyState();
    },
    importPunches(input = {}) {
      return applyImportToWorkspace(input);
    },
    saveDayReview(input = {}) {
      return applyDayReviewToWorkspace(input);
    },
    savePolicyVersion(input = {}) {
      return applyPolicyToWorkspace(input);
    },
    createPayrollRun(input = {}) {
      return createLocalPayrollRun(input);
    },
    transitionPayrollRun(input = {}) {
      return transitionLocalPayrollRun(input);
    },
    savePayrollLineAdjustment(input = {}) {
      return applyPayrollLineAdjustmentToWorkspace(input);
    },
    recordPayrollExport(input = {}) {
      return recordLocalPayrollExport(input);
    },
  });
}

export function createPostgresAttendancePayrollRepository(options = {}) {
  const databaseUrl =
    options.databaseUrl ??
    process.env.ERP_ATTENDANCE_PAYROLL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.PGURL;
  const postgresClient =
    options.postgresClient ??
    (options.queryJson || options.transactionJson
      ? null
      : createPostgresPoolClient({ databaseUrl }));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { transactionJson } = createPostgresTransactionExecutor({
    ...options,
    databaseUrl,
    postgresClient,
  });
  return Object.freeze({
    kind: "postgres",
    async loadState() {
      return normalizeState(await queryJson(buildLoadStateSql(), []));
    },
    async importPunches(input = {}) {
      const query = buildImportPunchesQuery(input);
      const result = normalizeImportResult(await transactionJson(query.text, query.values));
      applyImportedResultToWorkspace(input.workspace, result);
      return result;
    },
    async saveDayReview(input = {}) {
      const query = buildSaveDayReviewQuery(input.review);
      const result = normalizeDayReview(await transactionJson(query.text, query.values));
      if (!result) throw new Error("Attendance day review persistence returned no record.");
      applyDayReviewToWorkspace({ workspace: input.workspace, review: result });
      return { review: result };
    },
    async savePolicyVersion(input = {}) {
      const query = buildSavePolicyVersionQuery(input.policyVersion);
      const result = normalizePolicyVersion(await transactionJson(query.text, query.values));
      if (!result) throw new Error("Payroll policy persistence returned no record.");
      applyPolicyToWorkspace({ workspace: input.workspace, policyVersion: result });
      return { policyVersion: result };
    },
    async createPayrollRun(input = {}) {
      const query = buildCreatePayrollRunQuery(input);
      let persisted;
      try {
        persisted = await transactionJson(query.text, query.values);
      } catch (error) {
        if (isPayrollRevisionUniqueConflict(error)) {
          throw payrollRunConflict("工资草稿版本已由其他操作生成，请刷新后重试。", "PAYROLL_DRAFT_REVISION_CONFLICT");
        }
        throw error;
      }
      const result = normalizePayrollRunResult(persisted);
      if (!result.payrollRun) throw payrollRunConflict("工资草稿版本已由其他操作生成，请刷新后重试。", "PAYROLL_DRAFT_REVISION_CONFLICT");
      applyPayrollRunToWorkspace({
        workspace: input.workspace,
        payrollRun: result.payrollRun,
        payrollLines: result.payrollLines,
      });
      return result;
    },
    async transitionPayrollRun(input = {}) {
      const query = buildTransitionPayrollRunQuery(input);
      const result = normalizePayrollRunResult(await transactionJson(query.text, query.values));
      if (!result.payrollRun) throw payrollRunConflict("工资批次状态已被其他操作更新，请刷新后重试。", "PAYROLL_RUN_TRANSITION_CONFLICT");
      applyPayrollRunToWorkspace({
        workspace: input.workspace,
        payrollRun: result.payrollRun,
        payrollLines: result.payrollLines,
      });
      return result;
    },
    async savePayrollLineAdjustment(input = {}) {
      const query = buildSavePayrollLineAdjustmentQuery(input);
      const result = normalizePayrollLineAdjustmentResult(await transactionJson(query.text, query.values));
      if (!result.payrollLine || !result.adjustment) {
        const error = new Error("工资草稿已被其他操作更新或复核，请刷新后重试。");
        error.statusCode = 409;
        error.code = "PAYROLL_LINE_ADJUSTMENT_CONFLICT";
        throw error;
      }
      applyPayrollLineAdjustmentToWorkspace({
        workspace: input.workspace,
        payrollLine: result.payrollLine,
        adjustment: result.adjustment,
      });
      return result;
    },
    async recordPayrollExport(input = {}) {
      const query = buildRecordPayrollExportQuery(input);
      const exportEvent = normalizePayrollExportEvent(await transactionJson(query.text, query.values));
      if (!exportEvent) {
        throw payrollRunConflict(
          "工资批次状态已变化，未记录本次导出；请刷新后重试。",
          "PAYROLL_EXPORT_SNAPSHOT_CONFLICT",
        );
      }
      applyPayrollExportEventToWorkspace({ workspace: input.workspace, exportEvent });
      return { exportEvent };
    },
  });
}

export function buildLoadStateSql() {
  return `
SELECT json_build_object(
  'attendanceImportBatches', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'provider', provider, 'rangeStart', range_start::TEXT,
      'rangeEnd', range_end::TEXT, 'status', status, 'fetchedCount', fetched_count,
      'importedCount', imported_count, 'duplicateCount', duplicate_count,
      'unmatchedCount', unmatched_count, 'issues', issue_json,
      'requestedBy', COALESCE(requested_by, ''), 'createdAt', created_at::TEXT,
      'completedAt', COALESCE(completed_at::TEXT, '')
    ) ORDER BY created_at DESC) FROM attendance_import_batches
  ), '[]'::json),
  'attendancePunches', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'provider', provider, 'externalPunchId', external_punch_id,
      'employeeId', COALESCE(employee_id, ''), 'externalEmployeeId', external_employee_id,
      'punchedAt', punched_at::TEXT, 'localWorkDate', local_work_date::TEXT,
      'eventType', event_type, 'sourceHash', source_hash,
      'rawPayload', raw_payload_json, 'importBatchId', COALESCE(import_batch_id, ''),
      'createdAt', created_at::TEXT
    ) ORDER BY punched_at DESC) FROM attendance_punches
  ), '[]'::json),
  'attendanceDayReviews', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'employeeId', employee_id, 'workDate', work_date::TEXT,
      'status', status, 'explanation', explanation,
      'adjustedWorkMinutes', adjusted_work_minutes,
      'evidenceAttachmentIds', evidence_attachment_ids_json,
      'reviewedBy', COALESCE(reviewed_by, ''), 'reviewedAt', COALESCE(reviewed_at::TEXT, ''),
      'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
    ) ORDER BY work_date DESC, employee_id) FROM attendance_day_reviews
  ), '[]'::json),
  'payrollPolicyVersions', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'versionLabel', version_label, 'status', status,
      'effectiveFrom', effective_from::TEXT, 'effectiveTo', COALESCE(effective_to::TEXT, ''),
      'policy', policy_json, 'integrityDigest', integrity_digest,
      'createdBy', COALESCE(created_by, ''), 'reviewedBy', COALESCE(reviewed_by, ''),
      'reviewedAt', COALESCE(reviewed_at::TEXT, ''),
      'publishedAt', COALESCE(published_at::TEXT, ''),
      'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
    ) ORDER BY effective_from DESC, created_at DESC) FROM payroll_policy_versions
  ), '[]'::json),
  'payrollRuns', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'payrollMonth', payroll_month, 'policyVersionId', COALESCE(policy_version_id, ''),
      'status', status, 'revision', revision, 'generatedBy', COALESCE(generated_by, ''),
      'generatedAt', generated_at::TEXT, 'reviewedBy', COALESCE(reviewed_by, ''),
      'reviewedAt', COALESCE(reviewed_at::TEXT, ''), 'lockedBy', COALESCE(locked_by, ''),
      'lockedAt', COALESCE(locked_at::TEXT, ''), 'paidBy', COALESCE(paid_by, ''),
      'paidAt', COALESCE(paid_at::TEXT, ''), 'paymentReference', payment_reference,
      'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
    ) ORDER BY payroll_month DESC, revision DESC) FROM payroll_runs
  ), '[]'::json),
  'payrollLines', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'payrollRunId', payroll_run_id, 'employeeId', employee_id,
      'attendanceWorkMinutes', attendance_work_minutes, 'baseWage', base_wage,
      'positionAllowance', position_allowance, 'seniorityAward', seniority_award,
      'performanceAward', performance_award, 'overtimeWage', overtime_wage,
      'leaveDeduction', leave_deduction, 'otherDeduction', other_deduction,
      'grossWage', gross_wage, 'netWage', net_wage,
      'calculation', calculation_json, 'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
    ) ORDER BY payroll_run_id, employee_id) FROM payroll_lines
  ), '[]'::json),
  'payrollLineAdjustments', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'payrollLineId', payroll_line_id, 'payrollRunId', payroll_run_id,
      'employeeId', employee_id, 'performanceAward', performance_award,
      'leaveDeduction', leave_deduction, 'otherDeduction', other_deduction,
      'reason', reason, 'previousValues', previous_values_json,
      'newValues', new_values_json, 'evidenceAttachmentIds', evidence_attachment_ids_json,
      'changedBy', COALESCE(changed_by, ''),
      'changedAt', changed_at::TEXT
    ) ORDER BY changed_at DESC) FROM payroll_line_adjustments
  ), '[]'::json),
  'payrollExportEvents', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'payrollRunId', payroll_run_id, 'payrollMonth', payroll_month,
      'revision', revision, 'runStatus', run_status, 'fileName', file_name,
      'contentDigest', content_digest, 'rowCount', row_count,
      'exportedBy', COALESCE(exported_by, ''), 'exportedAt', exported_at::TEXT
    ) ORDER BY exported_at DESC) FROM payroll_export_events
  ), '[]'::json)
) AS result;`;
}

export function buildImportPunchesQuery(input = {}) {
  const batch = normalizeImportBatch(input.batch);
  const punches = normalizePunches(input.punches);
  if (!batch) throw new Error("Attendance import batch is required.");
  const parameters = createPostgresParameterBinder();
  const punchRows = punches.map((punch) => `(
    ${parameters.text(punch.id)}, ${parameters.text(punch.provider)},
    ${parameters.text(punch.externalPunchId)}, ${parameters.nullableText(punch.employeeId)},
    ${parameters.text(punch.externalEmployeeId)}, ${parameters.timestamp(punch.punchedAt)},
    ${parameters.text(punch.localWorkDate)}::date, ${parameters.text(punch.eventType)},
    ${parameters.text(punch.sourceHash)}, ${parameters.json(punch.rawPayload)},
    ${parameters.text(batch.id)}, ${parameters.timestamp(punch.createdAt)}
  )`);
  return {
    text: `
WITH saved_batch AS (
INSERT INTO attendance_import_batches (
  id, provider, range_start, range_end, status, fetched_count, imported_count,
  duplicate_count, unmatched_count, issue_json, requested_by, created_at, completed_at
) VALUES (
  ${parameters.text(batch.id)}, ${parameters.text(batch.provider)},
  ${parameters.timestamp(batch.rangeStart)}, ${parameters.timestamp(batch.rangeEnd)},
  ${parameters.text(batch.status)}, ${parameters.integer(batch.fetchedCount)},
  ${parameters.integer(batch.importedCount)}, ${parameters.integer(batch.duplicateCount)},
  ${parameters.integer(batch.unmatchedCount)}, ${parameters.json(batch.issues)},
  ${parameters.nullableText(batch.requestedBy)}, ${parameters.timestamp(batch.createdAt)},
  ${parameters.nullableTimestamp(batch.completedAt)}
) ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, fetched_count = EXCLUDED.fetched_count,
  imported_count = EXCLUDED.imported_count, duplicate_count = EXCLUDED.duplicate_count,
  unmatched_count = EXCLUDED.unmatched_count, issue_json = EXCLUDED.issue_json,
  completed_at = EXCLUDED.completed_at
RETURNING *
),
${punchRows.length ? `inserted_punches AS (
INSERT INTO attendance_punches (
  id, provider, external_punch_id, employee_id, external_employee_id, punched_at,
  local_work_date, event_type, source_hash, raw_payload_json, import_batch_id, created_at
) SELECT punch_values.*
FROM (VALUES ${punchRows.join(",\n")}) AS punch_values(
  id, provider, external_punch_id, employee_id, external_employee_id, punched_at,
  local_work_date, event_type, source_hash, raw_payload_json, import_batch_id, created_at
)
CROSS JOIN saved_batch
ON CONFLICT (provider, external_punch_id) DO NOTHING
RETURNING attendance_punches.*
)` : `inserted_punches AS (
  SELECT attendance_punches.* FROM attendance_punches CROSS JOIN saved_batch WHERE false
)`}
SELECT json_build_object(
  'batch', (SELECT json_build_object(
    'id', id, 'provider', provider, 'rangeStart', range_start::TEXT, 'rangeEnd', range_end::TEXT,
    'status', status, 'fetchedCount', fetched_count, 'importedCount', imported_count,
    'duplicateCount', duplicate_count, 'unmatchedCount', unmatched_count,
    'issues', issue_json, 'requestedBy', COALESCE(requested_by, ''),
    'createdAt', created_at::TEXT, 'completedAt', COALESCE(completed_at::TEXT, '')
  ) FROM saved_batch),
  'punches', COALESCE((SELECT json_agg(json_build_object(
    'id', id, 'provider', provider, 'externalPunchId', external_punch_id,
    'employeeId', COALESCE(employee_id, ''), 'externalEmployeeId', external_employee_id,
    'punchedAt', punched_at::TEXT, 'localWorkDate', local_work_date::TEXT,
    'eventType', event_type, 'sourceHash', source_hash, 'rawPayload', raw_payload_json,
    'importBatchId', COALESCE(import_batch_id, ''), 'createdAt', created_at::TEXT
  ) ORDER BY punched_at) FROM inserted_punches), '[]'::json)
) AS result;`,
    values: parameters.values,
  };
}

export function buildSaveDayReviewQuery(value = {}) {
  const review = normalizeDayReview(value);
  if (!review) throw new Error("Attendance day review is required.");
  const parameters = createPostgresParameterBinder();
  return {
    text: `INSERT INTO attendance_day_reviews (
      id, employee_id, work_date, status, explanation, adjusted_work_minutes,
      evidence_attachment_ids_json, reviewed_by, reviewed_at, created_at, updated_at
    ) VALUES (
      ${parameters.text(review.id)}, ${parameters.text(review.employeeId)},
      ${parameters.text(review.workDate)}::date, ${parameters.text(review.status)},
      ${parameters.text(review.explanation)}, ${parameters.nullableInteger(review.adjustedWorkMinutes)},
      ${parameters.json(review.evidenceAttachmentIds)}, ${parameters.nullableText(review.reviewedBy)},
      ${parameters.nullableTimestamp(review.reviewedAt)}, ${parameters.timestamp(review.createdAt)},
      ${parameters.timestamp(review.updatedAt)}
    ) ON CONFLICT (employee_id, work_date) DO UPDATE SET
      status = EXCLUDED.status, explanation = EXCLUDED.explanation,
      adjusted_work_minutes = EXCLUDED.adjusted_work_minutes,
      evidence_attachment_ids_json = EXCLUDED.evidence_attachment_ids_json,
      reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at,
      updated_at = EXCLUDED.updated_at
    RETURNING json_build_object(
      'id', id, 'employeeId', employee_id, 'workDate', work_date::TEXT,
      'status', status, 'explanation', explanation, 'adjustedWorkMinutes', adjusted_work_minutes,
      'evidenceAttachmentIds', evidence_attachment_ids_json, 'reviewedBy', COALESCE(reviewed_by, ''),
      'reviewedAt', COALESCE(reviewed_at::TEXT, ''), 'createdAt', created_at::TEXT,
      'updatedAt', updated_at::TEXT
    ) AS result;`,
    values: parameters.values,
  };
}

export function buildSavePolicyVersionQuery(value = {}) {
  const policy = normalizePolicyVersion(value);
  if (!policy) throw new Error("Payroll policy version is required.");
  const parameters = createPostgresParameterBinder();
  return {
    text: `INSERT INTO payroll_policy_versions (
      id, version_label, status, effective_from, effective_to, policy_json,
      integrity_digest, created_by, reviewed_by, reviewed_at, published_at, created_at, updated_at
    ) VALUES (
      ${parameters.text(policy.id)}, ${parameters.text(policy.versionLabel)}, ${parameters.text(policy.status)},
      ${parameters.text(policy.effectiveFrom)}::date, ${parameters.nullableText(policy.effectiveTo)}::date,
      ${parameters.json(policy.policy)}, ${parameters.text(policy.integrityDigest)},
      ${parameters.nullableText(policy.createdBy)}, ${parameters.nullableText(policy.reviewedBy)},
      ${parameters.nullableTimestamp(policy.reviewedAt)}, ${parameters.nullableTimestamp(policy.publishedAt)},
      ${parameters.timestamp(policy.createdAt)}, ${parameters.timestamp(policy.updatedAt)}
    ) ON CONFLICT (id) DO UPDATE SET
      version_label = EXCLUDED.version_label, status = EXCLUDED.status,
      effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
      policy_json = EXCLUDED.policy_json, integrity_digest = EXCLUDED.integrity_digest,
      reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at,
      published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at
    RETURNING json_build_object(
      'id', id, 'versionLabel', version_label, 'status', status,
      'effectiveFrom', effective_from::TEXT, 'effectiveTo', COALESCE(effective_to::TEXT, ''),
      'policy', policy_json, 'integrityDigest', integrity_digest,
      'createdBy', COALESCE(created_by, ''), 'reviewedBy', COALESCE(reviewed_by, ''),
      'reviewedAt', COALESCE(reviewed_at::TEXT, ''), 'publishedAt', COALESCE(published_at::TEXT, ''),
      'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
    ) AS result;`,
    values: parameters.values,
  };
}

export function buildCreatePayrollRunQuery(input = {}) {
  const payrollRun = normalizePayrollRun(input.payrollRun);
  const payrollLines = normalizePayrollLines(input.payrollLines);
  if (!payrollRun) throw new Error("Payroll run is required.");
  if (payrollRun.status !== "draft") throw new Error("A new payroll run must start as draft.");
  if (!payrollLines.length) throw new Error("A payroll run requires at least one payroll line.");
  const expectedLatestRevision = Math.max(0, integer(input.expectedLatestRevision));
  if (payrollRun.revision !== expectedLatestRevision + 1) {
    throw new Error("Payroll run revision does not follow the expected latest revision.");
  }
  const parameters = createPostgresParameterBinder();
  const lineRows = payrollLines.map((line) => `(
    ${parameters.text(line.id)}, ${parameters.text(payrollRun.id)}, ${parameters.text(line.employeeId)},
    ${parameters.integer(line.attendanceWorkMinutes)}, ${parameters.number(line.baseWage)},
    ${parameters.number(line.positionAllowance)}, ${parameters.number(line.seniorityAward)},
    ${parameters.number(line.performanceAward)}, ${parameters.number(line.overtimeWage)},
    ${parameters.number(line.leaveDeduction)}, ${parameters.number(line.otherDeduction)},
    ${parameters.number(line.grossWage)}, ${parameters.number(line.netWage)},
    ${parameters.json(line.calculation)}, ${parameters.timestamp(line.createdAt)},
    ${parameters.timestamp(line.updatedAt)}
  )`);
  return {
    text: `
WITH payroll_month_lock AS MATERIALIZED (
  SELECT pg_advisory_xact_lock(hashtextextended(${parameters.text(`payroll-run:${payrollRun.payrollMonth}`)}::text, 0))
),
inserted_run AS (
INSERT INTO payroll_runs (
  id, payroll_month, policy_version_id, status, revision, generated_by, generated_at,
  reviewed_by, reviewed_at, locked_by, locked_at, paid_by, paid_at, payment_reference,
  created_at, updated_at
) SELECT
  ${parameters.text(payrollRun.id)}, ${parameters.text(payrollRun.payrollMonth)},
  ${parameters.nullableText(payrollRun.policyVersionId)}, ${parameters.text(payrollRun.status)},
  ${parameters.integer(payrollRun.revision)}, ${parameters.nullableText(payrollRun.generatedBy)},
  ${parameters.timestamp(payrollRun.generatedAt)}, ${parameters.nullableText(payrollRun.reviewedBy)},
  ${parameters.nullableTimestamp(payrollRun.reviewedAt)}, ${parameters.nullableText(payrollRun.lockedBy)},
  ${parameters.nullableTimestamp(payrollRun.lockedAt)}, ${parameters.nullableText(payrollRun.paidBy)},
  ${parameters.nullableTimestamp(payrollRun.paidAt)}, ${parameters.text(payrollRun.paymentReference)},
  ${parameters.timestamp(payrollRun.createdAt)}, ${parameters.timestamp(payrollRun.updatedAt)}
FROM payroll_month_lock
WHERE COALESCE((
  SELECT MAX(revision) FROM payroll_runs WHERE payroll_month = ${parameters.text(payrollRun.payrollMonth)}
), 0) = ${parameters.integer(expectedLatestRevision)}
RETURNING *
),
inserted_lines AS (
INSERT INTO payroll_lines (
  id, payroll_run_id, employee_id, attendance_work_minutes, base_wage,
  position_allowance, seniority_award, performance_award, overtime_wage,
  leave_deduction, other_deduction, gross_wage, net_wage, calculation_json,
  created_at, updated_at
) SELECT line_values.*
FROM (VALUES ${lineRows.join(",\n")}) AS line_values(
  id, payroll_run_id, employee_id, attendance_work_minutes, base_wage,
  position_allowance, seniority_award, performance_award, overtime_wage,
  leave_deduction, other_deduction, gross_wage, net_wage, calculation_json,
  created_at, updated_at
)
CROSS JOIN inserted_run
RETURNING payroll_lines.*
)
SELECT json_build_object(
  'payrollRun', (SELECT json_build_object(
    'id', id, 'payrollMonth', payroll_month, 'policyVersionId', COALESCE(policy_version_id, ''),
    'status', status, 'revision', revision, 'generatedBy', COALESCE(generated_by, ''),
    'generatedAt', generated_at::TEXT, 'reviewedBy', COALESCE(reviewed_by, ''),
    'reviewedAt', COALESCE(reviewed_at::TEXT, ''), 'lockedBy', COALESCE(locked_by, ''),
    'lockedAt', COALESCE(locked_at::TEXT, ''), 'paidBy', COALESCE(paid_by, ''),
    'paidAt', COALESCE(paid_at::TEXT, ''), 'paymentReference', payment_reference,
    'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
  ) FROM inserted_run),
  'payrollLines', COALESCE((SELECT json_agg(json_build_object(
    'id', id, 'payrollRunId', payroll_run_id, 'employeeId', employee_id,
    'attendanceWorkMinutes', attendance_work_minutes, 'baseWage', base_wage,
    'positionAllowance', position_allowance, 'seniorityAward', seniority_award,
    'performanceAward', performance_award, 'overtimeWage', overtime_wage,
    'leaveDeduction', leave_deduction, 'otherDeduction', other_deduction,
    'grossWage', gross_wage, 'netWage', net_wage, 'calculation', calculation_json,
    'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
  ) ORDER BY employee_id) FROM inserted_lines), '[]'::json)
) AS result;`,
    values: parameters.values,
  };
}

export function buildTransitionPayrollRunQuery(input = {}) {
  const payrollRun = normalizePayrollRun(input.payrollRun);
  const expectedStatus = cleanText(input.expectedStatus);
  if (!payrollRun) throw new Error("Payroll run is required.");
  if (!isAllowedPayrollTransition(expectedStatus, payrollRun.status)) {
    throw new Error("Payroll run transition does not match the expected prior state.");
  }
  const parameters = createPostgresParameterBinder();
  return {
    text: `
WITH updated_run AS (
UPDATE payroll_runs SET
  status = ${parameters.text(payrollRun.status)},
  reviewed_by = ${parameters.nullableText(payrollRun.reviewedBy)},
  reviewed_at = ${parameters.nullableTimestamp(payrollRun.reviewedAt)},
  locked_by = ${parameters.nullableText(payrollRun.lockedBy)},
  locked_at = ${parameters.nullableTimestamp(payrollRun.lockedAt)},
  paid_by = ${parameters.nullableText(payrollRun.paidBy)},
  paid_at = ${parameters.nullableTimestamp(payrollRun.paidAt)},
  payment_reference = ${parameters.text(payrollRun.paymentReference)},
  updated_at = ${parameters.timestamp(payrollRun.updatedAt)}
WHERE id = ${parameters.text(payrollRun.id)}
  AND status = ${parameters.text(expectedStatus)}
RETURNING *
)
SELECT json_build_object(
  'payrollRun', (SELECT json_build_object(
    'id', id, 'payrollMonth', payroll_month, 'policyVersionId', COALESCE(policy_version_id, ''),
    'status', status, 'revision', revision, 'generatedBy', COALESCE(generated_by, ''),
    'generatedAt', generated_at::TEXT, 'reviewedBy', COALESCE(reviewed_by, ''),
    'reviewedAt', COALESCE(reviewed_at::TEXT, ''), 'lockedBy', COALESCE(locked_by, ''),
    'lockedAt', COALESCE(locked_at::TEXT, ''), 'paidBy', COALESCE(paid_by, ''),
    'paidAt', COALESCE(paid_at::TEXT, ''), 'paymentReference', payment_reference,
    'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
  ) FROM updated_run),
  'payrollLines', COALESCE((SELECT json_agg(json_build_object(
    'id', id, 'payrollRunId', payroll_run_id, 'employeeId', employee_id,
    'attendanceWorkMinutes', attendance_work_minutes, 'baseWage', base_wage,
    'positionAllowance', position_allowance, 'seniorityAward', seniority_award,
    'performanceAward', performance_award, 'overtimeWage', overtime_wage,
    'leaveDeduction', leave_deduction, 'otherDeduction', other_deduction,
    'grossWage', gross_wage, 'netWage', net_wage, 'calculation', calculation_json,
    'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
  ) ORDER BY employee_id) FROM payroll_lines
    WHERE payroll_run_id = ${parameters.text(payrollRun.id)}
      AND EXISTS (SELECT 1 FROM updated_run)), '[]'::json)
) AS result;
`,
    values: parameters.values,
  };
}

export function buildSavePayrollLineAdjustmentQuery(input = {}) {
  const payrollLine = normalizePayrollLine(input.payrollLine);
  const adjustment = normalizePayrollLineAdjustment(input.adjustment);
  if (!payrollLine || !adjustment) throw new Error("Payroll line and adjustment are required.");
  if (payrollLine.id !== adjustment.payrollLineId) throw new Error("Payroll adjustment line identity mismatch.");
  const parameters = createPostgresParameterBinder();
  return {
    text: `
WITH updated_line AS (
UPDATE payroll_lines SET
  performance_award = ${parameters.number(payrollLine.performanceAward)},
  leave_deduction = ${parameters.number(payrollLine.leaveDeduction)},
  other_deduction = ${parameters.number(payrollLine.otherDeduction)},
  gross_wage = ${parameters.number(payrollLine.grossWage)},
  net_wage = ${parameters.number(payrollLine.netWage)},
  calculation_json = ${parameters.json(payrollLine.calculation)},
  updated_at = ${parameters.timestamp(payrollLine.updatedAt)}
WHERE id = ${parameters.text(payrollLine.id)}
  AND payroll_run_id = ${parameters.text(payrollLine.payrollRunId)}
  AND employee_id = ${parameters.text(payrollLine.employeeId)}
  AND performance_award = ${parameters.number(adjustment.previousValues.performanceAward)}
  AND leave_deduction = ${parameters.number(adjustment.previousValues.leaveDeduction)}
  AND other_deduction = ${parameters.number(adjustment.previousValues.otherDeduction)}
  AND EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE payroll_runs.id = payroll_lines.payroll_run_id
      AND payroll_runs.status = 'draft'
  )
RETURNING *
)
,
inserted_adjustment AS (
INSERT INTO payroll_line_adjustments (
  id, payroll_line_id, payroll_run_id, employee_id, performance_award,
  leave_deduction, other_deduction, reason, previous_values_json,
  new_values_json, evidence_attachment_ids_json, changed_by, changed_at
) SELECT
  ${parameters.text(adjustment.id)}, ${parameters.text(adjustment.payrollLineId)},
  ${parameters.text(adjustment.payrollRunId)}, ${parameters.text(adjustment.employeeId)},
  ${parameters.number(adjustment.performanceAward)}, ${parameters.number(adjustment.leaveDeduction)},
  ${parameters.number(adjustment.otherDeduction)}, ${parameters.text(adjustment.reason)},
  ${parameters.json(adjustment.previousValues)}, ${parameters.json(adjustment.newValues)},
  ${parameters.json(adjustment.evidenceAttachmentIds)},
  ${parameters.nullableText(adjustment.changedBy)}, ${parameters.timestamp(adjustment.changedAt)}
FROM updated_line
RETURNING *
)
SELECT json_build_object(
  'payrollLine', (SELECT json_build_object(
    'id', id, 'payrollRunId', payroll_run_id, 'employeeId', employee_id,
    'attendanceWorkMinutes', attendance_work_minutes, 'baseWage', base_wage,
    'positionAllowance', position_allowance, 'seniorityAward', seniority_award,
    'performanceAward', performance_award, 'overtimeWage', overtime_wage,
    'leaveDeduction', leave_deduction, 'otherDeduction', other_deduction,
    'grossWage', gross_wage, 'netWage', net_wage, 'calculation', calculation_json,
    'createdAt', created_at::TEXT, 'updatedAt', updated_at::TEXT
  ) FROM updated_line),
  'adjustment', (SELECT json_build_object(
    'id', id, 'payrollLineId', payroll_line_id, 'payrollRunId', payroll_run_id,
    'employeeId', employee_id, 'performanceAward', performance_award,
    'leaveDeduction', leave_deduction, 'otherDeduction', other_deduction,
    'reason', reason, 'previousValues', previous_values_json,
    'newValues', new_values_json, 'evidenceAttachmentIds', evidence_attachment_ids_json,
    'changedBy', COALESCE(changed_by, ''),
    'changedAt', changed_at::TEXT
  ) FROM inserted_adjustment)
) AS result;`,
    values: parameters.values,
  };
}

export function buildRecordPayrollExportQuery(input = {}) {
  const exportEvent = normalizePayrollExportEvent(input.exportEvent);
  if (!exportEvent) throw new Error("Payroll export audit event is required.");
  if (!new Set(["reviewed", "locked", "paid"]).has(exportEvent.runStatus)) {
    throw new Error("Payroll export audit requires a reviewed, locked, or paid run.");
  }
  const parameters = createPostgresParameterBinder();
  return {
    text: `
WITH matched_run AS (
  SELECT id FROM payroll_runs
  WHERE id = ${parameters.text(exportEvent.payrollRunId)}
    AND payroll_month = ${parameters.text(exportEvent.payrollMonth)}
    AND revision = ${parameters.integer(exportEvent.revision)}
    AND status = ${parameters.text(exportEvent.runStatus)}
),
inserted_export AS (
  INSERT INTO payroll_export_events (
    id, payroll_run_id, payroll_month, revision, run_status, file_name,
    content_digest, row_count, exported_by, exported_at
  ) SELECT
    ${parameters.text(exportEvent.id)}, ${parameters.text(exportEvent.payrollRunId)},
    ${parameters.text(exportEvent.payrollMonth)}, ${parameters.integer(exportEvent.revision)},
    ${parameters.text(exportEvent.runStatus)}, ${parameters.text(exportEvent.fileName)},
    ${parameters.text(exportEvent.contentDigest)}, ${parameters.integer(exportEvent.rowCount)},
    ${parameters.nullableText(exportEvent.exportedBy)}, ${parameters.timestamp(exportEvent.exportedAt)}
  FROM matched_run
  RETURNING *
)
SELECT json_build_object(
  'id', id, 'payrollRunId', payroll_run_id, 'payrollMonth', payroll_month,
  'revision', revision, 'runStatus', run_status, 'fileName', file_name,
  'contentDigest', content_digest, 'rowCount', row_count,
  'exportedBy', COALESCE(exported_by, ''), 'exportedAt', exported_at::TEXT
) AS result
FROM inserted_export;`,
    values: parameters.values,
  };
}

function applyImportToWorkspace({ workspace, batch, punches = [] } = {}) {
  const safeBatch = normalizeImportBatch(batch);
  if (!workspace || !safeBatch) throw new Error("Attendance import requires a workspace and batch.");
  const existingKeys = new Set(
    (workspace.attendancePunches ?? []).map((punch) => `${punch.provider}::${punch.externalPunchId}`),
  );
  const inserted = normalizePunches(punches).filter((punch) => {
    const key = `${punch.provider}::${punch.externalPunchId}`;
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  const result = { batch: safeBatch, punches: inserted };
  applyImportedResultToWorkspace(workspace, result);
  return result;
}

function applyImportedResultToWorkspace(workspace, result = {}) {
  if (!workspace) return;
  workspace.attendanceImportBatches = upsertById(workspace.attendanceImportBatches, result.batch);
  for (const punch of result.punches ?? []) {
    workspace.attendancePunches = upsertById(workspace.attendancePunches, punch);
  }
}

function applyDayReviewToWorkspace({ workspace, review } = {}) {
  const safeReview = normalizeDayReview(review);
  if (!workspace || !safeReview) throw new Error("Attendance review requires a workspace and review.");
  workspace.attendanceDayReviews = upsertByComposite(
    workspace.attendanceDayReviews,
    safeReview,
    (item) => `${item.employeeId}::${item.workDate}`,
  );
  return { review: safeReview };
}

function applyPolicyToWorkspace({ workspace, policyVersion } = {}) {
  const safePolicy = normalizePolicyVersion(policyVersion);
  if (!workspace || !safePolicy) throw new Error("Payroll policy requires a workspace and version.");
  const existing = (workspace.payrollPolicyVersions ?? []).find((item) => item.id === safePolicy.id);
  if (
    existing &&
    new Set(["published", "retired"]).has(cleanText(existing.status)) &&
    JSON.stringify(existing) !== JSON.stringify(safePolicy)
  ) {
    const error = new Error("已发布或已停用的计薪规则不可覆盖；请创建新版本。");
    error.statusCode = 409;
    error.code = "PAYROLL_POLICY_PUBLISHED_IMMUTABLE";
    throw error;
  }
  workspace.payrollPolicyVersions = upsertById(workspace.payrollPolicyVersions, safePolicy);
  return { policyVersion: safePolicy };
}

function createLocalPayrollRun(input = {}) {
  const safeRun = normalizePayrollRun(input.payrollRun);
  const expectedLatestRevision = Math.max(0, integer(input.expectedLatestRevision));
  if (!input.workspace || !safeRun || safeRun.status !== "draft") {
    throw new Error("Payroll draft creation requires a workspace and draft run.");
  }
  const currentLatestRevision = Math.max(
    0,
    ...(input.workspace.payrollRuns ?? [])
      .filter((run) => cleanText(run.payrollMonth) === safeRun.payrollMonth)
      .map((run) => integer(run.revision)),
  );
  if (
    currentLatestRevision !== expectedLatestRevision ||
    safeRun.revision !== expectedLatestRevision + 1 ||
    (input.workspace.payrollRuns ?? []).some((run) =>
      cleanText(run.id) === safeRun.id ||
      (cleanText(run.payrollMonth) === safeRun.payrollMonth && integer(run.revision) === safeRun.revision),
    )
  ) {
    throw payrollRunConflict("工资草稿版本已由其他操作生成，请刷新后重试。", "PAYROLL_DRAFT_REVISION_CONFLICT");
  }
  return applyPayrollRunToWorkspace({
    workspace: input.workspace,
    payrollRun: safeRun,
    payrollLines: input.payrollLines,
  });
}

function transitionLocalPayrollRun(input = {}) {
  const safeRun = normalizePayrollRun(input.payrollRun);
  const expectedStatus = cleanText(input.expectedStatus);
  const current = (input.workspace?.payrollRuns ?? []).find((run) => cleanText(run.id) === safeRun?.id);
  if (
    !input.workspace ||
    !safeRun ||
    !current ||
    cleanText(current.status) !== expectedStatus ||
    !isAllowedPayrollTransition(expectedStatus, safeRun.status)
  ) {
    throw payrollRunConflict("工资批次状态已被其他操作更新，请刷新后重试。", "PAYROLL_RUN_TRANSITION_CONFLICT");
  }
  return applyPayrollRunToWorkspace({
    workspace: input.workspace,
    payrollRun: safeRun,
    payrollLines: (input.workspace.payrollLines ?? []).filter((line) => line.payrollRunId === safeRun.id),
  });
}

function applyPayrollRunToWorkspace({ workspace, payrollRun, payrollLines = [] } = {}) {
  const safeRun = normalizePayrollRun(payrollRun);
  if (!workspace || !safeRun) throw new Error("Payroll run requires a workspace and run.");
  workspace.payrollRuns = upsertById(workspace.payrollRuns, safeRun);
  for (const line of normalizePayrollLines(payrollLines)) {
    workspace.payrollLines = upsertByComposite(
      workspace.payrollLines,
      line,
      (item) => `${item.payrollRunId}::${item.employeeId}`,
    );
  }
  return {
    payrollRun: safeRun,
    payrollLines: normalizePayrollLines(payrollLines),
  };
}

function isAllowedPayrollTransition(expectedStatus, targetStatus) {
  return (
    (expectedStatus === "draft" && targetStatus === "reviewed") ||
    (expectedStatus === "reviewed" && targetStatus === "locked") ||
    (expectedStatus === "locked" && targetStatus === "paid")
  );
}

function payrollRunConflict(message, code) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = code;
  return error;
}

function isPayrollRevisionUniqueConflict(error) {
  return error?.code === "23505" &&
    new Set(["payroll_runs_payroll_month_revision_key", "payroll_runs_pkey"]).has(cleanText(error?.constraint));
}

function applyPayrollLineAdjustmentToWorkspace({ workspace, payrollLine, adjustment } = {}) {
  const safeLine = normalizePayrollLine(payrollLine);
  const safeAdjustment = normalizePayrollLineAdjustment(adjustment);
  if (!workspace || !safeLine || !safeAdjustment) {
    throw new Error("Payroll line adjustment requires a workspace, line, and audit record.");
  }
  workspace.payrollLines = upsertByComposite(
    workspace.payrollLines,
    safeLine,
    (item) => `${item.payrollRunId}::${item.employeeId}`,
  );
  workspace.payrollLineAdjustments = upsertById(workspace.payrollLineAdjustments, safeAdjustment);
  return { payrollLine: safeLine, adjustment: safeAdjustment };
}

function recordLocalPayrollExport({ workspace, exportEvent } = {}) {
  const safeEvent = normalizePayrollExportEvent(exportEvent);
  const payrollRun = (workspace?.payrollRuns ?? []).find((run) => run.id === safeEvent?.payrollRunId);
  if (
    !workspace ||
    !safeEvent ||
    !payrollRun ||
    payrollRun.payrollMonth !== safeEvent.payrollMonth ||
    Number(payrollRun.revision) !== safeEvent.revision ||
    payrollRun.status !== safeEvent.runStatus
  ) {
    throw payrollRunConflict(
      "工资批次状态已变化，未记录本次导出；请刷新后重试。",
      "PAYROLL_EXPORT_SNAPSHOT_CONFLICT",
    );
  }
  applyPayrollExportEventToWorkspace({ workspace, exportEvent: safeEvent });
  return { exportEvent: safeEvent };
}

function applyPayrollExportEventToWorkspace({ workspace, exportEvent } = {}) {
  const safeEvent = normalizePayrollExportEvent(exportEvent);
  if (!workspace || !safeEvent) throw new Error("Payroll export audit requires a workspace and event.");
  workspace.payrollExportEvents = upsertById(workspace.payrollExportEvents, safeEvent);
  return { exportEvent: safeEvent };
}

function emptyState() {
  return {
    attendanceImportBatches: [],
    attendancePunches: [],
    attendanceDayReviews: [],
    payrollPolicyVersions: [],
    payrollRuns: [],
    payrollLines: [],
    payrollLineAdjustments: [],
    payrollExportEvents: [],
  };
}

function normalizeState(value = {}) {
  return {
    attendanceImportBatches: normalizeImportBatches(value.attendanceImportBatches),
    attendancePunches: normalizePunches(value.attendancePunches),
    attendanceDayReviews: normalizeDayReviews(value.attendanceDayReviews),
    payrollPolicyVersions: normalizePolicyVersions(value.payrollPolicyVersions),
    payrollRuns: normalizePayrollRuns(value.payrollRuns),
    payrollLines: normalizePayrollLines(value.payrollLines),
    payrollLineAdjustments: normalizePayrollLineAdjustments(value.payrollLineAdjustments),
    payrollExportEvents: normalizePayrollExportEvents(value.payrollExportEvents),
  };
}

function normalizeImportResult(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    batch: normalizeImportBatch(source.batch ?? {}),
    punches: normalizePunches(source.punches),
  };
}

function normalizePayrollRunResult(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    payrollRun: normalizePayrollRun(source.payrollRun ?? {}),
    payrollLines: normalizePayrollLines(source.payrollLines),
  };
}

function normalizePayrollLineAdjustmentResult(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    payrollLine: normalizePayrollLine(source.payrollLine ?? {}),
    adjustment: normalizePayrollLineAdjustment(source.adjustment ?? {}),
  };
}

function normalizeImportBatches(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizeImportBatch).filter(Boolean);
}

function normalizeImportBatch(value = {}) {
  const id = cleanText(value.id);
  const provider = cleanText(value.provider);
  if (!id || !provider) return null;
  return {
    id,
    provider,
    rangeStart: cleanText(value.rangeStart),
    rangeEnd: cleanText(value.rangeEnd),
    status: cleanText(value.status) || "completed",
    fetchedCount: integer(value.fetchedCount),
    importedCount: integer(value.importedCount),
    duplicateCount: integer(value.duplicateCount),
    unmatchedCount: integer(value.unmatchedCount),
    issues: Array.isArray(value.issues) ? value.issues : [],
    requestedBy: cleanText(value.requestedBy),
    createdAt: cleanText(value.createdAt) || new Date().toISOString(),
    completedAt: cleanText(value.completedAt),
  };
}

function normalizePunches(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizePunch).filter(Boolean);
}

function normalizePunch(value = {}) {
  const id = cleanText(value.id);
  const provider = cleanText(value.provider);
  const externalPunchId = cleanText(value.externalPunchId);
  const externalEmployeeId = cleanText(value.externalEmployeeId);
  const punchedAt = cleanText(value.punchedAt);
  if (!id || !provider || !externalPunchId || !externalEmployeeId || !punchedAt) return null;
  return {
    id,
    provider,
    externalPunchId,
    employeeId: cleanText(value.employeeId),
    externalEmployeeId,
    punchedAt,
    localWorkDate: cleanText(value.localWorkDate) || punchedAt.slice(0, 10),
    eventType: cleanText(value.eventType) || "punch",
    sourceHash: cleanText(value.sourceHash),
    rawPayload: value.rawPayload && typeof value.rawPayload === "object" ? value.rawPayload : {},
    importBatchId: cleanText(value.importBatchId),
    createdAt: cleanText(value.createdAt) || new Date().toISOString(),
  };
}

function normalizeDayReviews(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizeDayReview).filter(Boolean);
}

function normalizeDayReview(value = {}) {
  const id = cleanText(value.id);
  const employeeId = cleanText(value.employeeId);
  const workDate = cleanText(value.workDate);
  if (!id || !employeeId || !workDate) return null;
  return {
    id,
    employeeId,
    workDate,
    status: cleanText(value.status) || "pending",
    explanation: cleanText(value.explanation),
    adjustedWorkMinutes:
      value.adjustedWorkMinutes === null || value.adjustedWorkMinutes === undefined
        ? null
        : integer(value.adjustedWorkMinutes),
    evidenceAttachmentIds: Array.isArray(value.evidenceAttachmentIds)
      ? value.evidenceAttachmentIds.map(cleanText).filter(Boolean)
      : [],
    reviewedBy: cleanText(value.reviewedBy),
    reviewedAt: cleanText(value.reviewedAt),
    createdAt: cleanText(value.createdAt) || new Date().toISOString(),
    updatedAt: cleanText(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizePolicyVersions(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizePolicyVersion).filter(Boolean);
}

function normalizePolicyVersion(value = {}) {
  const id = cleanText(value.id);
  const effectiveFrom = cleanText(value.effectiveFrom);
  if (!id || !effectiveFrom) return null;
  return {
    id,
    versionLabel: cleanText(value.versionLabel) || id,
    status: cleanText(value.status) || "draft",
    effectiveFrom,
    effectiveTo: cleanText(value.effectiveTo),
    policy: value.policy && typeof value.policy === "object" ? value.policy : {},
    integrityDigest: cleanText(value.integrityDigest),
    createdBy: cleanText(value.createdBy),
    reviewedBy: cleanText(value.reviewedBy),
    reviewedAt: cleanText(value.reviewedAt),
    publishedAt: cleanText(value.publishedAt),
    createdAt: cleanText(value.createdAt) || new Date().toISOString(),
    updatedAt: cleanText(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizePayrollRuns(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizePayrollRun).filter(Boolean);
}

function normalizePayrollRun(value = {}) {
  const id = cleanText(value.id);
  const payrollMonth = cleanText(value.payrollMonth);
  if (!id || !/^\d{4}-\d{2}$/.test(payrollMonth)) return null;
  return {
    id,
    payrollMonth,
    policyVersionId: cleanText(value.policyVersionId),
    status: cleanText(value.status) || "draft",
    revision: Math.max(1, integer(value.revision) || 1),
    generatedBy: cleanText(value.generatedBy),
    generatedAt: cleanText(value.generatedAt) || new Date().toISOString(),
    reviewedBy: cleanText(value.reviewedBy),
    reviewedAt: cleanText(value.reviewedAt),
    lockedBy: cleanText(value.lockedBy),
    lockedAt: cleanText(value.lockedAt),
    paidBy: cleanText(value.paidBy),
    paidAt: cleanText(value.paidAt),
    paymentReference: cleanText(value.paymentReference),
    createdAt: cleanText(value.createdAt) || new Date().toISOString(),
    updatedAt: cleanText(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizePayrollLines(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizePayrollLine).filter(Boolean);
}

function normalizePayrollLine(value = {}) {
  const id = cleanText(value.id);
  const payrollRunId = cleanText(value.payrollRunId);
  const employeeId = cleanText(value.employeeId);
  if (!id || !payrollRunId || !employeeId) return null;
  return {
    id,
    payrollRunId,
    employeeId,
    attendanceWorkMinutes: integer(value.attendanceWorkMinutes),
    baseWage: money(value.baseWage),
    positionAllowance: money(value.positionAllowance),
    seniorityAward: money(value.seniorityAward),
    performanceAward: money(value.performanceAward),
    overtimeWage: money(value.overtimeWage),
    leaveDeduction: money(value.leaveDeduction),
    otherDeduction: money(value.otherDeduction),
    grossWage: money(value.grossWage),
    netWage: money(value.netWage),
    calculation: value.calculation && typeof value.calculation === "object" ? value.calculation : {},
    createdAt: cleanText(value.createdAt) || new Date().toISOString(),
    updatedAt: cleanText(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizePayrollLineAdjustments(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizePayrollLineAdjustment).filter(Boolean);
}

function normalizePayrollLineAdjustment(value = {}) {
  const id = cleanText(value.id);
  const payrollLineId = cleanText(value.payrollLineId);
  const payrollRunId = cleanText(value.payrollRunId);
  const employeeId = cleanText(value.employeeId);
  if (!id || !payrollLineId || !payrollRunId || !employeeId) return null;
  return {
    id,
    payrollLineId,
    payrollRunId,
    employeeId,
    performanceAward: money(value.performanceAward),
    leaveDeduction: money(value.leaveDeduction),
    otherDeduction: money(value.otherDeduction),
    reason: cleanText(value.reason),
    previousValues: value.previousValues && typeof value.previousValues === "object" ? value.previousValues : {},
    newValues: value.newValues && typeof value.newValues === "object" ? value.newValues : {},
    evidenceAttachmentIds: uniqueTextList(value.evidenceAttachmentIds).slice(0, 5),
    changedBy: cleanText(value.changedBy),
    changedAt: cleanText(value.changedAt) || new Date().toISOString(),
  };
}

function uniqueTextList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanText).filter(Boolean))];
}

function normalizePayrollExportEvents(values = []) {
  return (Array.isArray(values) ? values : []).map(normalizePayrollExportEvent).filter(Boolean);
}

function normalizePayrollExportEvent(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const id = cleanText(source.id);
  const payrollRunId = cleanText(source.payrollRunId);
  const payrollMonth = cleanText(source.payrollMonth);
  const runStatus = cleanText(source.runStatus);
  const fileName = cleanText(source.fileName);
  const contentDigest = cleanText(source.contentDigest).toLowerCase();
  if (
    !id ||
    !payrollRunId ||
    !/^\d{4}-\d{2}$/.test(payrollMonth) ||
    !new Set(["reviewed", "locked", "paid"]).has(runStatus) ||
    !fileName ||
    !/^[a-f0-9]{64}$/.test(contentDigest) ||
    integer(source.rowCount) < 1
  ) return null;
  return {
    id,
    payrollRunId,
    payrollMonth,
    revision: Math.max(1, integer(source.revision) || 1),
    runStatus,
    fileName,
    contentDigest,
    rowCount: integer(source.rowCount),
    exportedBy: cleanText(source.exportedBy),
    exportedAt: cleanText(source.exportedAt) || new Date().toISOString(),
  };
}

function upsertById(values = [], record) {
  if (!record?.id) return Array.isArray(values) ? values : [];
  return upsertByComposite(values, record, (item) => item.id);
}

function upsertByComposite(values = [], record, keyOf) {
  const rows = Array.isArray(values) ? [...values] : [];
  const key = keyOf(record);
  const index = rows.findIndex((item) => keyOf(item) === key);
  if (index < 0) return [record, ...rows];
  rows[index] = record;
  return rows;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}
