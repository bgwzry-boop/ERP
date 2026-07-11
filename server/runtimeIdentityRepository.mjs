import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
        revokedSessionCount: state.revokedSeedSessions.length,
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

    async saveState({ workspace } = {}) {
      const state = normalizeRuntimeIdentityStateFromWorkspace(workspace);
      const query = buildSaveRuntimeIdentityStateQuery(state);
      const saved = (await transactionJson(query.text, query.values)) ?? {};
      return {
        savedUserCount: Number(saved.savedUserCount ?? state.users.length) || 0,
        revokedSessionCount: Number(saved.revokedSessionCount ?? state.revokedSeedSessions.length) || 0,
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
  return workspace;
}

export function normalizeRuntimeIdentityStateFromWorkspace(workspace = {}) {
  const users = normalizeRuntimeUsers(workspace.users);
  const revokedSeedSessions = normalizeRevokedSeedSessions(
    Array.isArray(workspace.revokedSeedSessions)
      ? workspace.revokedSeedSessions
      : (workspace.revokedSeedSessionJtis ?? []).map((jti) => ({ jti })),
  );
  return {
    schemaVersion: 1,
    users,
    revokedSeedSessions,
    revokedSeedSessionJtis: revokedSeedSessions.map((item) => item.jti),
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
      WHERE source = 'master_data_import_review'
      ORDER BY updated_at DESC, id
    ) runtime_users
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
  ), '[]'::json)
) AS result;
`,
    values: [],
  };
}

export function buildSaveRuntimeIdentityStateSql(state = {}) {
  return buildSaveRuntimeIdentityStateQuery(state).text;
}

export function buildSaveRuntimeIdentityStateQuery(state = {}) {
  const normalized = normalizeRuntimeIdentityState(state);
  const parameters = createPostgresParameterBinder();
  const userRows = normalized.users.map((user) => runtimeUserSqlRow(user, parameters)).filter(Boolean);
  const revokedRows = normalized.revokedSeedSessions.map((record) => revokedSeedSessionSqlRow(record, parameters)).filter(Boolean);
  return {
    text: `
WITH saved_users AS (
  ${userRows.length > 0 ? buildUpsertRuntimeUsersSql(userRows) : "SELECT NULL::TEXT AS id WHERE FALSE"}
),
saved_revoked_sessions AS (
  ${revokedRows.length > 0 ? buildUpsertRevokedSeedSessionsSql(revokedRows) : "SELECT NULL::TEXT AS jti WHERE FALSE"}
)
SELECT json_build_object(
  'savedUserCount', (SELECT COUNT(*) FROM saved_users),
  'revokedSessionCount', (SELECT COUNT(*) FROM saved_revoked_sessions)
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
  metadata_json = EXCLUDED.metadata_json,
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
    ${parameters.nullableText(safeUser.passwordStatus)},
    ${parameters.boolean(safeUser.mustChangePassword === true)},
    ${parameters.nullableText(safeUser.passwordIssuedBy)},
    ${parameters.nullableTimestamp(safeUser.passwordIssuedAt)},
    ${parameters.nullableText(safeUser.passwordChangedBy)},
    ${parameters.nullableTimestamp(safeUser.passwordChangedAt)},
    ${parameters.nullableText(safeUser.passwordRevokedBy)},
    ${parameters.nullableTimestamp(safeUser.passwordRevokedAt)},
    ${parameters.nullableTimestamp(safeUser.sessionValidAfter)},
    ${parameters.integer(safeUser.sessionVersion)},
    ${parameters.json(metadata)},
    ${parameters.timestamp(safeUser.updatedAt)}
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
    'failedLoginCount', COALESCE(NULLIF(${alias}.metadata_json->>'failedLoginCount', '')::INTEGER, 0),
    'lastFailedLoginAt', COALESCE(${alias}.metadata_json->>'lastFailedLoginAt', ''),
    'lockedUntil', COALESCE(${alias}.metadata_json->>'lockedUntil', ''),
    'passwordExpiresAt', COALESCE(${alias}.metadata_json->>'passwordExpiresAt', ''),
    'passwordExpiredAt', COALESCE(${alias}.metadata_json->>'passwordExpiredAt', ''),
    'updatedAt', COALESCE(${alias}.updated_at::TEXT, '')
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
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(
    storePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        users: state.users,
        revokedSeedSessions: state.revokedSeedSessions,
      },
      null,
      2,
    )}\n`,
  );
}

function normalizeRuntimeIdentityState(value = {}) {
  const users = normalizeRuntimeUsers(value.users ?? value.runtimeUsers);
  const revokedSeedSessions = normalizeRevokedSeedSessions(
    value.revokedSeedSessions ??
      value.revokedSessions ??
      (value.revokedSeedSessionJtis ?? []).map((jti) => ({ jti })),
  );
  return {
    schemaVersion: 1,
    users,
    revokedSeedSessions,
    revokedSeedSessionJtis: revokedSeedSessions.map((item) => item.jti),
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
    failedLoginCount: Math.max(0, Number(user.failedLoginCount) || 0),
    lastFailedLoginAt: cleanText(user.lastFailedLoginAt),
    lockedUntil: cleanText(user.lockedUntil),
    passwordExpiresAt: cleanText(user.passwordExpiresAt),
    passwordExpiredAt: cleanText(user.passwordExpiredAt),
    updatedAt: cleanText(user.updatedAt) || new Date().toISOString(),
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
