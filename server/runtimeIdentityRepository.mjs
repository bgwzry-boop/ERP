import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";

export const runtimeIdentityStoreKey = "metadata/runtime-identity.json";

export function createRuntimeIdentityRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_RUNTIME_IDENTITY_STORE ??
    process.env.ERP_IDENTITY_STORE ??
    process.env.ERP_USER_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresRuntimeIdentityRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_IDENTITY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalRuntimeIdentityRepository({
      storageRoot: options.storageRoot,
    });
  }
  throw new Error(`Unsupported runtime identity repository mode: ${mode}`);
}

export function createLocalRuntimeIdentityRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentRuntimeIdentityState(storageRoot);
    },

    saveState({ workspace } = {}) {
      const state = normalizeRuntimeIdentityStateFromWorkspace(workspace);
      persistPersistentRuntimeIdentityState(storageRoot, state);
      return {
        savedUserCount: state.users.length,
        savedPhoneVerificationChallengeCount: state.phoneVerificationChallenges.length,
        revokedSessionCount: state.revokedSeedSessions.length,
        savedOperationLogCount: state.operationLogs.length,
        savedEmployeeAccountCount: state.employeeAccounts.length,
      };
    },
  };
}

export function createPostgresRuntimeIdentityRepository(options = {}) {
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { transactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async loadState() {
      const query = buildLoadRuntimeIdentityStateQuery();
      return normalizeRuntimeIdentityState(await queryJson(query.text, query.values));
    },

    async saveState({ workspace, identityEmployeeUpdates = [] } = {}) {
      const state = normalizeRuntimeIdentityStateFromWorkspace(workspace);
      const query = buildSaveRuntimeIdentityStateQuery(state, { identityEmployeeUpdates });
      const saved = (await transactionJson(query.text, query.values)) ?? {};
      return {
        savedUserCount: Number(saved.savedUserCount ?? state.users.length) || 0,
        savedPhoneVerificationChallengeCount:
          Number(saved.savedPhoneVerificationChallengeCount ?? state.phoneVerificationChallenges.length) || 0,
        revokedSessionCount: Number(saved.revokedSessionCount ?? state.revokedSeedSessions.length) || 0,
        savedOperationLogCount:
          Number(saved.savedOperationLogCount ?? state.operationLogs.length) || 0,
        savedEmployeeAccountCount: state.employeeAccounts.length,
        updatedEmployeeCount: Number(saved.updatedEmployeeCount) || 0,
        updatedEmployeeAssignmentCount: Number(saved.updatedEmployeeAssignmentCount) || 0,
        updatedEmployeeIdentityCount: Number(saved.updatedEmployeeIdentityCount) || 0,
      };
    },
  };
}

export function mergeRuntimeIdentityStateIntoWorkspace(workspace = {}, state = {}) {
  const normalized = normalizeRuntimeIdentityState(state);
  const existingUsers = Array.isArray(workspace.users) ? workspace.users : [];
  const usersById = new Map(existingUsers.map((user) => [cleanText(user?.userId ?? user?.id), user]).filter(([id]) => id));
  for (const user of normalized.users) {
    const userId = cleanText(user.userId ?? user.id);
    if (!userId) continue;
    usersById.set(userId, {
      ...(usersById.get(userId) ?? {}),
      ...user,
      id: userId,
      userId,
    });
  }
  workspace.users = Array.from(usersById.values());
  workspace.revokedSeedSessions = normalized.revokedSeedSessions;
  workspace.revokedSeedSessionJtis = normalized.revokedSeedSessionJtis;
  workspace.phoneVerificationChallenges = normalized.phoneVerificationChallenges;
  const employeesById = new Map(
    (Array.isArray(workspace.employees) ? workspace.employees : [])
      .map((employee) => [cleanText(employee?.id), employee])
      .filter(([id]) => id),
  );
  for (const employeeAccount of normalized.employeeAccounts) {
    employeesById.set(employeeAccount.id, {
      ...(employeesById.get(employeeAccount.id) ?? {}),
      ...employeeAccount,
    });
  }
  workspace.employees = applyLatestEmployeeAssignmentAudit(
    Array.from(employeesById.values()),
    normalized.operationLogs,
  );
  const operationLogsById = new Map(
    (Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [])
      .map((log) => [cleanText(log?.id), log])
      .filter(([id]) => id),
  );
  for (const operationLog of normalized.operationLogs) {
    operationLogsById.set(operationLog.id, {
      ...(operationLogsById.get(operationLog.id) ?? {}),
      ...operationLog,
    });
  }
  workspace.operationLogs = Array.from(operationLogsById.values());
  return workspace;
}

export function normalizeRuntimeIdentityStateFromWorkspace(workspace = {}) {
  const users = normalizeRuntimeUsers(workspace.users);
  const revokedSeedSessions = normalizeRevokedSeedSessions(
    Array.isArray(workspace.revokedSeedSessions)
      ? workspace.revokedSeedSessions
      : (workspace.revokedSeedSessionJtis ?? []).map((jti) => ({ jti })),
  );
  const operationLogs = normalizeRuntimeIdentityOperationLogs(workspace.operationLogs);
  return {
    schemaVersion: 2,
    users,
    phoneVerificationChallenges: normalizePhoneVerificationChallenges(
      workspace.phoneVerificationChallenges,
    ),
    employeeAccounts: applyLatestEmployeeAssignmentAudit(
      normalizeRuntimeIdentityEmployeeAccounts(workspace.employees, users),
      operationLogs,
    ),
    revokedSeedSessions,
    revokedSeedSessionJtis: revokedSeedSessions.map((item) => item.jti),
    operationLogs,
  };
}

export function buildLoadRuntimeIdentityStateSql() {
  return buildLoadRuntimeIdentityStateQuery().text;
}

export function buildLoadRuntimeIdentityStateQuery() {
  return {
    text: `
SELECT json_build_object(
  'users', COALESCE((
    SELECT json_agg(record ORDER BY record->>'updatedAt' DESC, record->>'userId')
    FROM (
      SELECT ${runtimeUserJsonExpression("users")} AS record
      FROM users
      WHERE source IN ('master_data_import_review', 'phone_self_registration')
      ORDER BY updated_at DESC, id
    ) runtime_users
  ), '[]'::json),
  'employeeAccounts', COALESCE((
    SELECT json_agg(json_build_object(
      'id', employees.id,
      'bizNo', employees.biz_no,
      'userId', COALESCE(employees.user_id, users.id),
      'loginName', users.login_name,
      'name', employees.name,
      'roleName', employees.role_name,
      'defaultWorkshop', employees.default_workshop,
      'defaultMachineId', employees.default_machine_id,
      'birthDate', COALESCE(employees.birth_date::TEXT, ''),
      'hireDate', COALESCE(employees.hire_date::TEXT, ''),
      'baseHourlyWage', employees.base_hourly_wage,
      'positionAllowanceHourly', employees.position_allowance_hourly,
      'wageEffectiveFrom', COALESCE(employees.wage_effective_from::TEXT, ''),
      'attendanceProvider', employees.attendance_provider,
      'attendanceExternalId', employees.attendance_external_id,
      'attendanceMappingUpdatedBy', COALESCE(employees.attendance_mapping_updated_by, ''),
      'attendanceMappingUpdatedAt', COALESCE(employees.attendance_mapping_updated_at::TEXT, ''),
      'departedAt', COALESCE(employees.departed_at::TEXT, ''),
      'departureEffectiveDate', COALESCE(employees.departure_effective_date::TEXT, ''),
      'departedBy', COALESCE(employees.departed_by, ''),
      'departureReason', employees.departure_reason,
      'accountEnabled', employees.account_enabled,
      'profileStatus', employees.profile_status,
      'requestedEnabled', employees.requested_enabled,
      'remark', employees.remark,
      'updatedAt', COALESCE(employees.updated_at::TEXT, '')
    ) ORDER BY employees.updated_at DESC, employees.id)
    FROM employees
    JOIN users ON users.employee_id = employees.id
    WHERE users.source IN ('master_data_import_review', 'phone_self_registration')
  ), '[]'::json),
  'phoneVerificationChallenges', COALESCE((
    SELECT json_agg(json_build_object(
      'id', id,
      'phoneE164', phone_e164,
      'purpose', purpose,
      'codeHash', code_hash,
      'requestedAt', requested_at::TEXT,
      'expiresAt', expires_at::TEXT,
      'consumedAt', COALESCE(consumed_at::TEXT, ''),
      'failedAttempts', failed_attempts,
      'maxAttempts', max_attempts,
      'deliveryStatus', delivery_status,
      'deliveryReference', delivery_reference,
      'createdAt', created_at::TEXT,
      'updatedAt', updated_at::TEXT
    ) ORDER BY requested_at DESC, id)
    FROM phone_verification_challenges
    WHERE requested_at >= now() - INTERVAL '24 hours'
  ), '[]'::json),
  'revokedSeedSessions', COALESCE((
    SELECT json_agg(json_build_object(
      'jti', jti,
      'userId', user_id,
      'revokedAt', COALESCE(revoked_at::TEXT, ''),
      'expiresAt', COALESCE(expires_at::TEXT, ''),
      'reason', reason,
      'source', source,
      'createdAt', COALESCE(created_at::TEXT, '')
    ) ORDER BY revoked_at DESC, jti)
    FROM seed_session_revocations
  ), '[]'::json),
  'operationLogs', COALESCE((
    SELECT json_agg(${runtimeIdentityOperationLogJsonExpression("operation_logs")} ORDER BY occurred_at DESC, id)
    FROM operation_logs
    WHERE target_type IN (
      'master_data_employee_account_review',
      'master_data_employee_account_password',
      'master_data_employee_assignment',
      'master_data_employee_profile',
      'master_data_employee_identity_confirmation',
      'phone_self_registration',
      'personnel_phone_registration_assignment'
    )
  ), '[]'::json)
) AS result;
`,
    values: [],
  };
}

export function buildSaveRuntimeIdentityStateSql(state = {}, options = {}) {
  return buildSaveRuntimeIdentityStateQuery(state, options).text;
}

export function buildSaveRuntimeIdentityStateQuery(state = {}, options = {}) {
  const normalized = normalizeRuntimeIdentityState(state);
  const parameters = createPostgresParameterBinder();
  const userRows = normalized.users.map((user) => runtimeUserSqlRow(user, parameters)).filter(Boolean);
  const phoneVerificationChallengeRows = normalized.phoneVerificationChallenges
    .map((record) => phoneVerificationChallengeSqlRow(record, parameters))
    .filter(Boolean);
  const employeeAssignmentRows = normalized.employeeAccounts
    .map((record) => runtimeEmployeeAssignmentSqlRow(record, parameters))
    .filter(Boolean);
  const employeeIdentityRows = normalizeRuntimeIdentityEmployeeUpdates(options.identityEmployeeUpdates)
    .map((record) => runtimeEmployeeIdentitySqlRow(record, parameters))
    .filter(Boolean);
  const revokedRows = normalized.revokedSeedSessions.map((record) => revokedSeedSessionSqlRow(record, parameters)).filter(Boolean);
  const operationLogRows = normalized.operationLogs
    .map((record) => runtimeIdentityOperationLogSqlRow(record, parameters))
    .filter(Boolean);
  return {
    text: `
WITH saved_users AS (
  ${userRows.length > 0 ? buildUpsertRuntimeUsersSql(userRows) : "SELECT NULL::TEXT AS id WHERE FALSE"}
),
saved_revoked_sessions AS (
  ${revokedRows.length > 0 ? buildUpsertRevokedSeedSessionsSql(revokedRows) : "SELECT NULL::TEXT AS jti WHERE FALSE"}
),
saved_phone_verification_challenges AS (
  ${phoneVerificationChallengeRows.length > 0
    ? buildUpsertPhoneVerificationChallengesSql(phoneVerificationChallengeRows)
    : "SELECT NULL::TEXT AS id WHERE FALSE"}
),
employee_assignment_updates (id, default_workshop, default_machine_id, updated_at) AS (
  ${employeeAssignmentRows.length > 0
    ? `VALUES\n${employeeAssignmentRows.join(",\n")}`
    : "SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ WHERE FALSE"}
),
updated_employee_assignments AS (
  UPDATE employees
  SET
    default_workshop = employee_assignment_updates.default_workshop,
    default_machine_id = employee_assignment_updates.default_machine_id,
    updated_at = employee_assignment_updates.updated_at
  FROM employee_assignment_updates
  WHERE employees.id = employee_assignment_updates.id
  RETURNING employees.id
),
employee_identity_updates (
  id, name, account_enabled, profile_status, requested_enabled, remark,
  birth_date, hire_date, base_hourly_wage, position_allowance_hourly, wage_effective_from,
  attendance_provider, attendance_external_id, attendance_mapping_updated_by,
  attendance_mapping_updated_at, departed_at, departure_effective_date, departed_by, departure_reason, updated_at
) AS (
  ${employeeIdentityRows.length > 0
    ? `VALUES\n${employeeIdentityRows.join(",\n")}`
    : `SELECT
        NULL::TEXT, NULL::TEXT, NULL::BOOLEAN, NULL::TEXT, NULL::BOOLEAN, NULL::TEXT,
        NULL::DATE, NULL::DATE, NULL::NUMERIC, NULL::NUMERIC, NULL::DATE,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ,
        NULL::TIMESTAMPTZ, NULL::DATE, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ
      WHERE FALSE`}
),
updated_employee_identities AS (
  UPDATE employees
  SET
    name = employee_identity_updates.name,
    account_enabled = employee_identity_updates.account_enabled,
    profile_status = employee_identity_updates.profile_status,
    requested_enabled = employee_identity_updates.requested_enabled,
    remark = employee_identity_updates.remark,
    birth_date = employee_identity_updates.birth_date,
    hire_date = employee_identity_updates.hire_date,
    base_hourly_wage = employee_identity_updates.base_hourly_wage,
    position_allowance_hourly = employee_identity_updates.position_allowance_hourly,
    wage_effective_from = employee_identity_updates.wage_effective_from,
    attendance_provider = employee_identity_updates.attendance_provider,
    attendance_external_id = employee_identity_updates.attendance_external_id,
    attendance_mapping_updated_by = employee_identity_updates.attendance_mapping_updated_by,
    attendance_mapping_updated_at = employee_identity_updates.attendance_mapping_updated_at,
    departed_at = employee_identity_updates.departed_at,
    departure_effective_date = employee_identity_updates.departure_effective_date,
    departed_by = employee_identity_updates.departed_by,
    departure_reason = employee_identity_updates.departure_reason,
    updated_at = employee_identity_updates.updated_at
  FROM employee_identity_updates
  WHERE employees.id = employee_identity_updates.id
  RETURNING employees.id
),
updated_employees AS (
  UPDATE employees
  SET
    user_id = users.id,
    account_enabled = TRUE,
    profile_status = 'account_enabled',
    updated_at = users.updated_at
  FROM users
  WHERE employees.id = users.employee_id
    AND users.source IN ('master_data_import_review', 'phone_self_registration')
    AND users.enabled = TRUE
    AND EXISTS (SELECT 1 FROM saved_users WHERE saved_users.id = users.id)
  RETURNING employees.id
),
saved_operation_logs AS (
  ${operationLogRows.length > 0 ? buildUpsertRuntimeIdentityOperationLogsSql(operationLogRows) : "SELECT NULL::TEXT AS id WHERE FALSE"}
)
SELECT json_build_object(
  'savedUserCount', (SELECT COUNT(*) FROM saved_users),
  'savedPhoneVerificationChallengeCount', (SELECT COUNT(*) FROM saved_phone_verification_challenges),
  'revokedSessionCount', (SELECT COUNT(*) FROM saved_revoked_sessions),
  'updatedEmployeeCount', (SELECT COUNT(*) FROM updated_employees),
  'updatedEmployeeAssignmentCount', (SELECT COUNT(*) FROM updated_employee_assignments),
  'updatedEmployeeIdentityCount', (SELECT COUNT(*) FROM updated_employee_identities),
  'savedOperationLogCount', (SELECT COUNT(*) FROM saved_operation_logs)
) AS result;
`,
    values: parameters.values,
  };
}

function buildUpsertRuntimeUsersSql(rows) {
  return `
INSERT INTO users (
  id,
  login_name,
  display_name,
  department,
  enabled,
  source,
  employee_id,
  default_machine_id,
  login_enabled,
  password_hash,
  password_status,
  must_change_password,
  password_issued_by,
  password_issued_at,
  password_changed_by,
  password_changed_at,
  password_revoked_by,
  password_revoked_at,
  session_valid_after,
  session_version,
  phone_e164,
  phone_verified_at,
  registration_status,
  registration_source,
  assigned_at,
  assigned_by,
  metadata_json,
  updated_at
)
VALUES
${rows.join(",\n")}
ON CONFLICT (id) DO UPDATE SET
  login_name = EXCLUDED.login_name,
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  enabled = EXCLUDED.enabled,
  source = EXCLUDED.source,
  employee_id = EXCLUDED.employee_id,
  default_machine_id = EXCLUDED.default_machine_id,
  login_enabled = EXCLUDED.login_enabled,
  password_hash = EXCLUDED.password_hash,
  password_status = EXCLUDED.password_status,
  must_change_password = EXCLUDED.must_change_password,
  password_issued_by = EXCLUDED.password_issued_by,
  password_issued_at = EXCLUDED.password_issued_at,
  password_changed_by = EXCLUDED.password_changed_by,
  password_changed_at = EXCLUDED.password_changed_at,
  password_revoked_by = EXCLUDED.password_revoked_by,
  password_revoked_at = EXCLUDED.password_revoked_at,
  session_valid_after = EXCLUDED.session_valid_after,
  session_version = EXCLUDED.session_version,
  phone_e164 = EXCLUDED.phone_e164,
  phone_verified_at = EXCLUDED.phone_verified_at,
  registration_status = EXCLUDED.registration_status,
  registration_source = EXCLUDED.registration_source,
  assigned_at = EXCLUDED.assigned_at,
  assigned_by = EXCLUDED.assigned_by,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = EXCLUDED.updated_at
RETURNING id
`;
}

function buildUpsertPhoneVerificationChallengesSql(rows) {
  return `
INSERT INTO phone_verification_challenges (
  id,
  phone_e164,
  purpose,
  code_hash,
  requested_at,
  expires_at,
  consumed_at,
  failed_attempts,
  max_attempts,
  delivery_status,
  delivery_reference,
  created_at,
  updated_at
)
VALUES
${rows.join(",\n")}
ON CONFLICT (id) DO UPDATE SET
  consumed_at = EXCLUDED.consumed_at,
  failed_attempts = EXCLUDED.failed_attempts,
  delivery_status = EXCLUDED.delivery_status,
  delivery_reference = EXCLUDED.delivery_reference,
  updated_at = EXCLUDED.updated_at
RETURNING id
`;
}

function buildUpsertRevokedSeedSessionsSql(rows) {
  return `
INSERT INTO seed_session_revocations (
  jti,
  user_id,
  revoked_at,
  expires_at,
  reason,
  source,
  created_at
)
VALUES
${rows.join(",\n")}
ON CONFLICT (jti) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  revoked_at = EXCLUDED.revoked_at,
  expires_at = EXCLUDED.expires_at,
  reason = EXCLUDED.reason,
  source = EXCLUDED.source
RETURNING jti
`;
}

function buildUpsertRuntimeIdentityOperationLogsSql(rows) {
  return `
INSERT INTO operation_logs (
  id,
  target_type,
  target_id,
  action,
  before_json,
  after_json,
  reason,
  operator_id,
  page_key,
  occurred_at,
  created_at
)
VALUES
${rows.join(",\n")}
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key,
  occurred_at = EXCLUDED.occurred_at
RETURNING id
`;
}

function runtimeUserSqlRow(user, parameters) {
  const safeUser = normalizeRuntimeUser(user);
  if (!safeUser) return null;
  const metadata = {
    roles: safeUser.roles,
    defaultRole: safeUser.defaultRole,
    source: safeUser.source,
    passwordIssueNote: safeUser.passwordIssueNote,
    passwordRevokeNote: safeUser.passwordRevokeNote,
    failedLoginCount: safeUser.failedLoginCount,
    lastFailedLoginAt: safeUser.lastFailedLoginAt,
    lockedUntil: safeUser.lockedUntil,
    passwordExpiresAt: safeUser.passwordExpiresAt,
    passwordExpiredAt: safeUser.passwordExpiredAt,
    accountReviewedBy: safeUser.accountReviewedBy,
    accountReviewedAt: safeUser.accountReviewedAt,
    accountReviewNote: safeUser.accountReviewNote,
    authMethods: safeUser.authMethods,
    invitationReferenceHash: safeUser.invitationReferenceHash,
  };
  return `(
    ${parameters.text(safeUser.userId)},
    ${parameters.text(safeUser.loginName || safeUser.userId)},
    ${parameters.text(safeUser.displayName || safeUser.userId)},
    ${parameters.nullableText(safeUser.department)},
    ${parameters.boolean(safeUser.enabled !== false)},
    ${parameters.text(safeUser.source || "master_data_import_review")},
    ${parameters.nullableText(safeUser.employeeId)},
    ${parameters.nullableText(safeUser.defaultMachineId)},
    ${parameters.boolean(safeUser.loginEnabled === true)},
    ${parameters.nullableText(safeUser.passwordHash)},
    ${parameters.text(
      safeUser.passwordStatus || (safeUser.loginEnabled ? "password_revoked" : "not_applicable"),
    )},
    ${parameters.boolean(safeUser.mustChangePassword === true)},
    ${parameters.nullableText(safeUser.passwordIssuedBy)},
    ${parameters.nullableTimestamp(safeUser.passwordIssuedAt)},
    ${parameters.nullableText(safeUser.passwordChangedBy)},
    ${parameters.nullableTimestamp(safeUser.passwordChangedAt)},
    ${parameters.nullableText(safeUser.passwordRevokedBy)},
    ${parameters.nullableTimestamp(safeUser.passwordRevokedAt)},
    ${parameters.nullableTimestamp(safeUser.sessionValidAfter)},
    ${parameters.integer(safeUser.sessionVersion)},
    ${parameters.nullableText(safeUser.phoneE164)},
    ${parameters.nullableTimestamp(safeUser.phoneVerifiedAt)},
    ${parameters.text(safeUser.registrationStatus || "legacy_account")},
    ${parameters.text(safeUser.registrationSource)},
    ${parameters.nullableTimestamp(safeUser.assignedAt)},
    ${parameters.nullableText(safeUser.assignedBy)},
    ${parameters.json(metadata)},
    ${parameters.timestamp(safeUser.updatedAt)}
  )`;
}

function phoneVerificationChallengeSqlRow(record, parameters) {
  const safeRecord = normalizePhoneVerificationChallenge(record);
  if (!safeRecord) return null;
  return `(
    ${parameters.text(safeRecord.id)},
    ${parameters.text(safeRecord.phoneE164)},
    ${parameters.text(safeRecord.purpose)},
    ${parameters.text(safeRecord.codeHash)},
    ${parameters.timestamp(safeRecord.requestedAt)},
    ${parameters.timestamp(safeRecord.expiresAt)},
    ${parameters.nullableTimestamp(safeRecord.consumedAt)},
    ${parameters.integer(safeRecord.failedAttempts)},
    ${parameters.integer(safeRecord.maxAttempts)},
    ${parameters.text(safeRecord.deliveryStatus)},
    ${parameters.nullableText(safeRecord.deliveryReference)},
    ${parameters.timestamp(safeRecord.createdAt)},
    ${parameters.timestamp(safeRecord.updatedAt)}
  )`;
}

function revokedSeedSessionSqlRow(record, parameters) {
  const safeRecord = normalizeRevokedSeedSession(record);
  if (!safeRecord) return null;
  return `(
    ${parameters.text(safeRecord.jti)},
    ${parameters.nullableText(safeRecord.userId)},
    ${parameters.timestamp(safeRecord.revokedAt)},
    ${parameters.nullableTimestamp(safeRecord.expiresAt)},
    ${parameters.nullableText(safeRecord.reason || "logout")},
    ${parameters.text(safeRecord.source || "seed_session_logout")},
    ${parameters.timestamp(safeRecord.createdAt || safeRecord.revokedAt)}
  )`;
}

function runtimeIdentityOperationLogSqlRow(record, parameters) {
  const safeRecord = normalizeRuntimeIdentityOperationLog(record);
  if (!safeRecord) return null;
  return `(
    ${parameters.text(safeRecord.id)},
    ${parameters.text(safeRecord.targetType)},
    ${parameters.text(safeRecord.targetId)},
    ${parameters.text(safeRecord.action)},
    ${parameters.json(safeRecord.before)},
    ${parameters.json(safeRecord.after)},
    ${parameters.nullableText(safeRecord.reason)},
    ${parameters.nullableText(safeRecord.operatorId)},
    ${parameters.nullableText(safeRecord.pageKey)},
    ${parameters.timestamp(safeRecord.occurredAt)},
    ${parameters.timestamp(safeRecord.createdAt)}
  )`;
}

function runtimeEmployeeAssignmentSqlRow(record, parameters) {
  const employeeId = cleanText(record?.id);
  if (!employeeId) return null;
  return `(
    ${parameters.text(employeeId)},
    ${parameters.text(record.defaultWorkshop)},
    ${parameters.nullableText(record.defaultMachineId)},
    ${parameters.timestamp(record.updatedAt)}
  )`;
}

function normalizeRuntimeIdentityEmployeeUpdates(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      id: cleanText(record?.id),
      name: cleanText(record?.name),
      accountEnabled: record?.accountEnabled === true,
      profileStatus: cleanText(record?.profileStatus),
      requestedEnabled: record?.requestedEnabled === true,
      remark: cleanText(record?.remark),
      birthDate: normalizeIsoDate(record?.birthDate ?? record?.birth_date),
      hireDate: normalizeIsoDate(record?.hireDate ?? record?.hire_date),
      baseHourlyWage: nonNegativeNumber(record?.baseHourlyWage ?? record?.base_hourly_wage),
      positionAllowanceHourly: nonNegativeNumber(
        record?.positionAllowanceHourly ?? record?.position_allowance_hourly,
      ),
      wageEffectiveFrom: normalizeIsoDate(
        record?.wageEffectiveFrom ?? record?.wage_effective_from,
      ),
      attendanceProvider: cleanText(record?.attendanceProvider ?? record?.attendance_provider).toLowerCase(),
      attendanceExternalId: cleanText(
        record?.attendanceExternalId ?? record?.attendance_external_id,
      ),
      attendanceMappingUpdatedBy: cleanText(
        record?.attendanceMappingUpdatedBy ?? record?.attendance_mapping_updated_by,
      ),
      attendanceMappingUpdatedAt: cleanText(
        record?.attendanceMappingUpdatedAt ?? record?.attendance_mapping_updated_at,
      ),
      departedAt: cleanText(record?.departedAt ?? record?.departed_at),
      departureEffectiveDate: normalizeIsoDate(
        record?.departureEffectiveDate ?? record?.departure_effective_date,
      ),
      departedBy: cleanText(record?.departedBy ?? record?.departed_by),
      departureReason: cleanText(record?.departureReason ?? record?.departure_reason),
      updatedAt: cleanText(record?.updatedAt) || new Date().toISOString(),
    }))
    .filter((record) => record.id && record.name && record.profileStatus);
}

function runtimeEmployeeIdentitySqlRow(record, parameters) {
  return `(
    ${parameters.text(record.id)},
    ${parameters.text(record.name)},
    ${parameters.boolean(record.accountEnabled)},
    ${parameters.text(record.profileStatus)},
    ${parameters.boolean(record.requestedEnabled)},
    ${parameters.nullableText(record.remark)},
    ${parameters.nullableText(record.birthDate)}::date,
    ${parameters.nullableText(record.hireDate)}::date,
    ${parameters.number(record.baseHourlyWage)},
    ${parameters.number(record.positionAllowanceHourly)},
    ${parameters.nullableText(record.wageEffectiveFrom)}::date,
    ${parameters.text(record.attendanceProvider)},
    ${parameters.text(record.attendanceExternalId)},
    ${parameters.nullableText(record.attendanceMappingUpdatedBy)},
    ${parameters.nullableTimestamp(record.attendanceMappingUpdatedAt)},
    ${parameters.nullableTimestamp(record.departedAt)},
    ${parameters.nullableText(record.departureEffectiveDate)}::date,
    ${parameters.nullableText(record.departedBy)},
    ${parameters.text(record.departureReason)},
    ${parameters.timestamp(record.updatedAt)}
  )`;
}

function runtimeUserJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'userId', ${alias}.id,
    'loginName', ${alias}.login_name,
    'displayName', ${alias}.display_name,
    'defaultRole', ${alias}.metadata_json->>'defaultRole',
    'department', ${alias}.department,
    'defaultMachineId', ${alias}.default_machine_id,
    'enabled', ${alias}.enabled,
    'roles', COALESCE(${alias}.metadata_json->'roles', '[]'::jsonb),
    'employeeId', ${alias}.employee_id,
    'source', COALESCE(${alias}.source, ${alias}.metadata_json->>'source'),
    'loginEnabled', ${alias}.login_enabled,
    'passwordHash', ${alias}.password_hash,
    'passwordStatus', ${alias}.password_status,
    'passwordIssuedBy', ${alias}.password_issued_by,
    'passwordIssuedAt', COALESCE(${alias}.password_issued_at::TEXT, ''),
    'passwordChangedBy', ${alias}.password_changed_by,
    'passwordChangedAt', COALESCE(${alias}.password_changed_at::TEXT, ''),
    'passwordRevokedBy', ${alias}.password_revoked_by,
    'passwordRevokedAt', COALESCE(${alias}.password_revoked_at::TEXT, ''),
    'mustChangePassword', ${alias}.must_change_password,
    'sessionValidAfter', COALESCE(${alias}.session_valid_after::TEXT, ''),
    'sessionVersion', ${alias}.session_version,
    'phoneE164', COALESCE(${alias}.phone_e164, ''),
    'phoneVerifiedAt', COALESCE(${alias}.phone_verified_at::TEXT, ''),
    'registrationStatus', COALESCE(${alias}.registration_status, 'legacy_account'),
    'registrationSource', COALESCE(${alias}.registration_source, ''),
    'assignedAt', COALESCE(${alias}.assigned_at::TEXT, ''),
    'assignedBy', COALESCE(${alias}.assigned_by, ''),
    'authMethods', COALESCE(${alias}.metadata_json->'authMethods', '[]'::jsonb),
    'invitationReferenceHash', COALESCE(${alias}.metadata_json->>'invitationReferenceHash', ''),
    'failedLoginCount', COALESCE(NULLIF(${alias}.metadata_json->>'failedLoginCount', '')::INTEGER, 0),
    'lastFailedLoginAt', COALESCE(${alias}.metadata_json->>'lastFailedLoginAt', ''),
    'lockedUntil', COALESCE(${alias}.metadata_json->>'lockedUntil', ''),
    'passwordExpiresAt', COALESCE(${alias}.metadata_json->>'passwordExpiresAt', ''),
    'passwordExpiredAt', COALESCE(${alias}.metadata_json->>'passwordExpiredAt', ''),
    'accountReviewedBy', COALESCE(${alias}.metadata_json->>'accountReviewedBy', ''),
    'accountReviewedAt', COALESCE(${alias}.metadata_json->>'accountReviewedAt', ''),
    'accountReviewNote', COALESCE(${alias}.metadata_json->>'accountReviewNote', ''),
    'updatedAt', COALESCE(${alias}.updated_at::TEXT, '')
  )`;
}

function runtimeIdentityOperationLogJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'targetType', ${alias}.target_type,
    'targetId', ${alias}.target_id,
    'action', ${alias}.action,
    'before', ${alias}.before_json,
    'after', ${alias}.after_json,
    'reason', COALESCE(${alias}.reason, ''),
    'operatorId', COALESCE(${alias}.operator_id, ''),
    'pageKey', COALESCE(${alias}.page_key, ''),
    'occurredAt', COALESCE(${alias}.occurred_at::TEXT, ''),
    'createdAt', COALESCE(${alias}.created_at::TEXT, '')
  )`;
}

function loadPersistentRuntimeIdentityState(storageRoot) {
  const storePath = getStorePath(storageRoot);
  if (!existsSync(storePath)) return normalizeRuntimeIdentityState({});
  try {
    return normalizeRuntimeIdentityState(JSON.parse(readFileSync(storePath, "utf8")));
  } catch {
    return normalizeRuntimeIdentityState({});
  }
}

function persistPersistentRuntimeIdentityState(storageRoot, state) {
  const storePath = getStorePath(storageRoot);
  const storeDirectory = dirname(storePath);
  mkdirSync(storeDirectory, { recursive: true, mode: 0o700 });
  chmodSync(storeDirectory, 0o700);
  writeFileSync(
    storePath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        users: state.users,
        phoneVerificationChallenges: state.phoneVerificationChallenges,
        employeeAccounts: state.employeeAccounts,
        revokedSeedSessions: state.revokedSeedSessions,
        operationLogs: state.operationLogs,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  chmodSync(storePath, 0o600);
}

function normalizeRuntimeIdentityState(value = {}) {
  const users = normalizeRuntimeUsers(value.users ?? value.runtimeUsers);
  const revokedSeedSessions = normalizeRevokedSeedSessions(
    value.revokedSeedSessions ??
      value.revokedSessions ??
      (value.revokedSeedSessionJtis ?? []).map((jti) => ({ jti })),
  );
  const operationLogs = normalizeRuntimeIdentityOperationLogs(value.operationLogs);
  return {
    schemaVersion: 2,
    users,
    phoneVerificationChallenges: normalizePhoneVerificationChallenges(
      value.phoneVerificationChallenges,
    ),
    employeeAccounts: applyLatestEmployeeAssignmentAudit(
      normalizeRuntimeIdentityEmployeeAccounts(value.employeeAccounts, users),
      operationLogs,
    ),
    revokedSeedSessions,
    revokedSeedSessionJtis: revokedSeedSessions.map((item) => item.jti),
    operationLogs,
  };
}

function normalizeRuntimeUsers(users = []) {
  const seen = new Set();
  return (Array.isArray(users) ? users : [])
    .map((user) => normalizeRuntimeUser(user))
    .filter(Boolean)
    .filter((user) => {
      if (seen.has(user.userId)) return false;
      seen.add(user.userId);
      return true;
    });
}

function normalizeRuntimeIdentityEmployeeAccounts(records = []) {
  const seen = new Set();
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeRuntimeIdentityEmployeeAccount(record))
    .filter(Boolean)
    .filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
}

function normalizeRuntimeIdentityEmployeeAccount(record = {}) {
  const id = cleanText(record.id ?? record.employeeId ?? record.employee_id);
  if (!id) return null;
  return {
    id,
    bizNo: cleanText(record.bizNo ?? record.biz_no) || id,
    userId: cleanText(record.userId ?? record.user_id),
    loginName: cleanText(record.loginName ?? record.login_name),
    name: cleanText(record.name),
    roleName: cleanText(record.roleName ?? record.role_name),
    defaultWorkshop: cleanText(record.defaultWorkshop ?? record.default_workshop),
    defaultMachineId: cleanText(record.defaultMachineId ?? record.default_machine_id),
    birthDate: normalizeIsoDate(record.birthDate ?? record.birth_date),
    hireDate: normalizeIsoDate(record.hireDate ?? record.hire_date),
    baseHourlyWage: nonNegativeNumber(record.baseHourlyWage ?? record.base_hourly_wage),
    positionAllowanceHourly: nonNegativeNumber(
      record.positionAllowanceHourly ?? record.position_allowance_hourly,
    ),
    wageEffectiveFrom: normalizeIsoDate(record.wageEffectiveFrom ?? record.wage_effective_from),
    attendanceProvider: cleanText(record.attendanceProvider ?? record.attendance_provider).toLowerCase(),
    attendanceExternalId: cleanText(record.attendanceExternalId ?? record.attendance_external_id),
    attendanceMappingUpdatedBy: cleanText(
      record.attendanceMappingUpdatedBy ?? record.attendance_mapping_updated_by,
    ),
    attendanceMappingUpdatedAt: cleanText(
      record.attendanceMappingUpdatedAt ?? record.attendance_mapping_updated_at,
    ),
    departedAt: cleanText(record.departedAt ?? record.departed_at),
    departureEffectiveDate: normalizeIsoDate(
      record.departureEffectiveDate ?? record.departure_effective_date,
    ),
    departedBy: cleanText(record.departedBy ?? record.departed_by),
    departureReason: cleanText(record.departureReason ?? record.departure_reason),
    assignmentMode: cleanText(record.assignmentMode ?? record.assignment_mode),
    assignmentUpdatedBy: cleanText(record.assignmentUpdatedBy ?? record.assignment_updated_by),
    assignmentUpdatedAt: cleanText(record.assignmentUpdatedAt ?? record.assignment_updated_at),
    assignmentNote: cleanText(record.assignmentNote ?? record.assignment_note),
    accountEnabled: record.accountEnabled === true || record.account_enabled === true,
    profileStatus:
      cleanText(record.profileStatus ?? record.profile_status) || "account_enabled",
    requestedEnabled: record.requestedEnabled === true || record.requested_enabled === true,
    remark: cleanText(record.remark),
    updatedAt: cleanText(record.updatedAt ?? record.updated_at) || new Date().toISOString(),
  };
}

function applyLatestEmployeeAssignmentAudit(employeeAccounts = [], operationLogs = []) {
  const latestLogByEmployeeId = new Map();
  for (const log of operationLogs) {
    if (log.targetType !== "master_data_employee_assignment" || !log.targetId) continue;
    const current = latestLogByEmployeeId.get(log.targetId);
    if (!current || compareOperationLogRecency(log, current) > 0) {
      latestLogByEmployeeId.set(log.targetId, log);
    }
  }
  return employeeAccounts.map((account) => {
    const latestLog = latestLogByEmployeeId.get(account.id);
    if (!latestLog) return account;
    return {
      ...account,
      assignmentUpdatedBy: latestLog.operatorId,
      assignmentUpdatedAt: latestLog.occurredAt,
      assignmentNote: latestLog.reason,
    };
  });
}

function compareOperationLogRecency(left = {}, right = {}) {
  const leftTime = Date.parse(left.occurredAt || left.createdAt || "");
  const rightTime = Date.parse(right.occurredAt || right.createdAt || "");
  const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
  const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
  if (normalizedLeftTime !== normalizedRightTime) return normalizedLeftTime - normalizedRightTime;
  return cleanText(left.id).localeCompare(cleanText(right.id));
}

function normalizeRuntimeUser(user = {}) {
  const userId = cleanText(user.userId ?? user.id);
  if (!userId) return null;
  const loginName = cleanText(user.loginName) || userId;
  return {
    ...user,
    id: userId,
    userId,
    loginName,
    displayName: cleanText(user.displayName ?? user.name) || userId,
    defaultRole: cleanText(user.defaultRole),
    department: cleanText(user.department),
    defaultMachineId: cleanText(user.defaultMachineId),
    enabled: user.enabled !== false,
    roles: Array.isArray(user.roles) ? user.roles.map((role) => cleanText(role)).filter(Boolean) : [],
    employeeId: cleanText(user.employeeId),
    source: cleanText(user.source) || "master_data_import_review",
    loginEnabled: user.loginEnabled === true,
    passwordHash: cleanText(user.passwordHash),
    passwordStatus: cleanText(user.passwordStatus),
    passwordIssuedBy: cleanText(user.passwordIssuedBy),
    passwordIssuedAt: cleanText(user.passwordIssuedAt),
    passwordChangedBy: cleanText(user.passwordChangedBy),
    passwordChangedAt: cleanText(user.passwordChangedAt),
    passwordRevokedBy: cleanText(user.passwordRevokedBy),
    passwordRevokedAt: cleanText(user.passwordRevokedAt),
    mustChangePassword: user.mustChangePassword === true,
    sessionValidAfter: cleanText(user.sessionValidAfter),
    sessionVersion: Number(user.sessionVersion) || 0,
    phoneE164: cleanText(user.phoneE164 ?? user.phone_e164),
    phoneVerifiedAt: cleanText(user.phoneVerifiedAt ?? user.phone_verified_at),
    registrationStatus:
      cleanText(user.registrationStatus ?? user.registration_status) || "legacy_account",
    registrationSource: cleanText(user.registrationSource ?? user.registration_source),
    assignedAt: cleanText(user.assignedAt ?? user.assigned_at),
    assignedBy: cleanText(user.assignedBy ?? user.assigned_by),
    authMethods: Array.isArray(user.authMethods)
      ? user.authMethods.map((method) => cleanText(method)).filter(Boolean)
      : [],
    invitationReferenceHash: cleanText(user.invitationReferenceHash),
    failedLoginCount: Math.max(0, Number(user.failedLoginCount) || 0),
    lastFailedLoginAt: cleanText(user.lastFailedLoginAt),
    lockedUntil: cleanText(user.lockedUntil),
    passwordExpiresAt: cleanText(user.passwordExpiresAt),
    passwordExpiredAt: cleanText(user.passwordExpiredAt),
    accountReviewedBy: cleanText(user.accountReviewedBy),
    accountReviewedAt: cleanText(user.accountReviewedAt),
    accountReviewNote: cleanText(user.accountReviewNote),
    updatedAt: cleanText(user.updatedAt) || new Date().toISOString(),
  };
}

function normalizeRuntimeIdentityOperationLogs(records = []) {
  const seen = new Set();
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeRuntimeIdentityOperationLog(record))
    .filter(Boolean)
    .filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
}

function normalizeRuntimeIdentityOperationLog(record = {}) {
  const id = cleanText(record.id);
  const targetType = cleanText(record.targetType ?? record.target_type);
  if (
    !id ||
    ![
      "master_data_employee_account_review",
      "master_data_employee_account_password",
      "master_data_employee_assignment",
      "master_data_employee_identity_merge",
      "master_data_employee_identity_confirmation",
      "phone_self_registration",
      "personnel_phone_registration_assignment",
    ].includes(
      targetType,
    )
  ) {
    return null;
  }
  const occurredAt =
    cleanText(record.occurredAt ?? record.occurred_at) || new Date().toISOString();
  return {
    id,
    targetType,
    targetId: cleanText(record.targetId ?? record.target_id),
    action: cleanText(record.action),
    before: record.before ?? record.before_json ?? null,
    after: record.after ?? record.after_json ?? null,
    reason: cleanText(record.reason),
    operatorId: cleanText(record.operatorId ?? record.operator_id),
    pageKey: cleanText(record.pageKey ?? record.page_key),
    occurredAt,
    createdAt: cleanText(record.createdAt ?? record.created_at) || occurredAt,
  };
}

function normalizePhoneVerificationChallenges(records = []) {
  const seen = new Set();
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizePhoneVerificationChallenge(record))
    .filter(Boolean)
    .filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
}

function normalizePhoneVerificationChallenge(record = {}) {
  const id = cleanText(record.id);
  const phoneE164 = cleanText(record.phoneE164 ?? record.phone_e164);
  const purpose = cleanText(record.purpose);
  const codeHash = cleanText(record.codeHash ?? record.code_hash);
  const requestedAt = cleanText(record.requestedAt ?? record.requested_at);
  const expiresAt = cleanText(record.expiresAt ?? record.expires_at);
  if (!id || !phoneE164 || !["registration", "login"].includes(purpose) || !codeHash || !requestedAt || !expiresAt) {
    return null;
  }
  return {
    id,
    phoneE164,
    purpose,
    codeHash,
    requestedAt,
    expiresAt,
    consumedAt: cleanText(record.consumedAt ?? record.consumed_at),
    failedAttempts: Math.max(0, Number(record.failedAttempts ?? record.failed_attempts) || 0),
    maxAttempts: Math.max(1, Number(record.maxAttempts ?? record.max_attempts) || 5),
    deliveryStatus: cleanText(record.deliveryStatus ?? record.delivery_status) || "sent",
    deliveryReference: cleanText(record.deliveryReference ?? record.delivery_reference),
    createdAt: cleanText(record.createdAt ?? record.created_at) || requestedAt,
    updatedAt: cleanText(record.updatedAt ?? record.updated_at) || requestedAt,
  };
}

function normalizeRevokedSeedSessions(records = []) {
  const seen = new Set();
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeRevokedSeedSession(record))
    .filter(Boolean)
    .filter((record) => {
      if (seen.has(record.jti)) return false;
      seen.add(record.jti);
      return true;
    });
}

function normalizeRevokedSeedSession(record = {}) {
  const jti = cleanText(typeof record === "string" ? record : record.jti);
  if (!jti) return null;
  const revokedAt = cleanText(record.revokedAt) || new Date().toISOString();
  return {
    jti,
    userId: cleanText(record.userId),
    revokedAt,
    expiresAt: cleanText(record.expiresAt),
    reason: cleanText(record.reason) || "logout",
    source: cleanText(record.source) || "seed_session_logout",
    createdAt: cleanText(record.createdAt) || revokedAt,
  };
}

function getStorePath(storageRoot) {
  return join(storageRoot, runtimeIdentityStoreKey);
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeIsoDate(value) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? "" : text;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
