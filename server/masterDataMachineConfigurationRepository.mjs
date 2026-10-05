import { resolveStoreMode } from "./storeMode.mjs";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";
import { buildDefaultBagMachineLegacyIds } from "../shared/masterDataMachineIdentity.js";

export const masterDataMachineConfigurationStoreKey = "metadata/master-data-machines.json";

const machineTypes = new Set(["bag_making", "screen_printing", "cutting", "packing", "other"]);
const machineStatuses = new Set(["active", "maintenance", "inactive"]);

export function createMasterDataMachineConfigurationRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_MASTER_DATA_MACHINE_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresMasterDataMachineConfigurationRepository({
      ...options,
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_MASTER_DATA_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
    });
  }
  if (mode === "local") {
    return createLocalMasterDataMachineConfigurationRepository({ storageRoot: options.storageRoot });
  }
  throw new Error(`Unsupported master-data machine repository mode: ${mode}`);
}

export function createLocalMasterDataMachineConfigurationRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();
  return {
    kind: "local_json",

    loadState() {
      return loadPersistentMachineState(storageRoot);
    },

    saveState({ workspace } = {}) {
      persistMachineState(storageRoot, workspace);
      return {
        machineCount: normalizeMasterDataMachines(workspace?.machines).length,
      };
    },

    upsertMachine({ workspace, machine, operationLog }) {
      const normalized = normalizeMasterDataMachine(machine);
      if (!normalized) throw new Error("A valid machine is required");
      applyMachineWorkspaceMutation({ workspace, machine: normalized, operationLog });
      persistMachineState(storageRoot, workspace);
      return {
        machine: normalized,
        operationLogId: cleanText(operationLog?.id),
      };
    },
  };
}

export function createPostgresMasterDataMachineConfigurationRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ??
    (options.queryJson || options.idempotentTransactionJson
      ? null
      : createPostgresPoolClient({ databaseUrl }));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({
    ...options,
    databaseUrl,
    postgresClient,
  });

  return {
    kind: "postgres",

    async loadState() {
      const query = buildListMasterDataMachinesQuery();
      return {
        machines: normalizeMasterDataMachines(await queryJson(query.text, query.values)),
      };
    },

    async saveState() {
      return null;
    },

    async upsertMachine(input = {}) {
      const query = buildUpsertMasterDataMachineTransactionQuery(input);
      const result = normalizeMachineTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `master-data.machine.upsert.${cleanText(input.machine?.machineId ?? input.machine?.id)}`,
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? {
              machine: input.machine,
              createOnly: input.createOnly === true,
              expectedUpdatedAt: cleanText(input.expectedUpdatedAt),
            },
            operatorId: input.operationLog?.operatorId,
            targetType: "master_data_machine",
            targetId: input.machine?.machineId ?? input.machine?.id,
            resourceLocks: [`master-data-machine:${cleanText(input.machine?.machineId ?? input.machine?.id)}`],
            query,
          }),
        ),
      );
      if (!result.machine) throw new Error("PostgreSQL machine upsert returned no machine");
      applyMachineWorkspaceMutation({
        workspace: input.workspace,
        machine: result.machine,
        operationLog: result.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return result;
    },
  };
}

export function buildDefaultMasterDataMachines(now = "2026-06-29T10:30:00.000Z") {
  return normalizeMasterDataMachines([
    ...Array.from({ length: 9 }, (_, index) => {
      const number = index + 1;
      const machineId = `BAG-${String(number).padStart(2, "0")}`;
      return {
        machineId,
        bizNo: machineId,
        name: `${number}号制袋机`,
        machineType: "bag_making",
        workshop: `${Math.ceil(number / 3)}号车间`,
        status: "active",
        enabled: true,
        settings: {
          source: "bootstrap_default_map",
          legacyMachineIds: buildDefaultBagMachineLegacyIds(number),
        },
        createdBy: "system",
        updatedBy: "system",
        createdAt: now,
        updatedAt: now,
      };
    }),
    ...Array.from({ length: 4 }, (_, index) => {
      const number = index + 1;
      const machineId = `PRINT-${String(number).padStart(2, "0")}`;
      return {
        machineId,
        bizNo: machineId,
        name: `${number}号丝印机`,
        machineType: "screen_printing",
        workshop: "丝印车间",
        status: "active",
        enabled: true,
        createdBy: "system",
        updatedBy: "system",
        createdAt: now,
        updatedAt: now,
      };
    }),
  ]);
}

export function normalizeMasterDataMachines(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeMasterDataMachine).filter(Boolean).sort(sortMachine);
}

export function normalizeMasterDataMachine(value = {}) {
  if (!value || typeof value !== "object") return null;
  const machineId = cleanText(value.machineId ?? value.machine_id ?? value.id);
  if (!machineId) return null;
  const statusInput = cleanText(value.status);
  const status = machineStatuses.has(statusInput) ? statusInput : "active";
  const machineTypeInput = cleanText(value.machineType ?? value.machine_type);
  const machineType = machineTypes.has(machineTypeInput) ? machineTypeInput : "other";
  const updatedAt = cleanText(value.updatedAt ?? value.updated_at) || new Date().toISOString();
  const createdAt = cleanText(value.createdAt ?? value.created_at) || updatedAt;
  return {
    id: machineId,
    machineId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || machineId,
    name: cleanText(value.name) || machineId,
    machineLabel: cleanText(value.machineLabel ?? value.machine_label ?? value.name) || machineId,
    machineType,
    workshop: cleanText(value.workshop),
    status,
    enabled: value.enabled !== false && status === "active",
    settings: normalizeObject(value.settings ?? value.settings_json),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    updatedBy: cleanText(value.updatedBy ?? value.updated_by),
    createdAt,
    updatedAt,
  };
}

export function buildListMasterDataMachinesQuery() {
  return {
    text: `SELECT COALESCE(json_agg(record ORDER BY record->>'workshop', record->>'name', record->>'machineId'), '[]'::json) AS result
FROM (
  SELECT ${machineJsonExpression("machines")} AS record
  FROM machines
) AS machine_records;`,
    values: [],
  };
}

export function buildUpsertMasterDataMachineTransactionQuery(input = {}) {
  const machine = normalizeMasterDataMachine(input.machine);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!machine || !operationLog) throw new Error("Machine and operation log are required");
  const parameters = createPostgresParameterBinder();
  const createOnly = input.createOnly === true;
  const expectedUpdatedAt = cleanText(input.expectedUpdatedAt);
  const writeCondition = createOnly
    ? "NOT EXISTS (SELECT 1 FROM locked_machine)"
    : expectedUpdatedAt
      ? `EXISTS (
          SELECT 1 FROM locked_machine
          WHERE updated_at = ${parameters.timestamp(expectedUpdatedAt)}
        )`
      : "EXISTS (SELECT 1 FROM locked_machine)";
  return {
    text: `BEGIN;
WITH locked_machine AS MATERIALIZED (
  SELECT id, updated_at
  FROM machines
  WHERE id = ${parameters.text(machine.machineId)}
  FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(${writeCondition}, 'ERP_MASTER_DATA_MACHINE_WRITE_CONFLICT') AS ok
),
upserted_machine AS (
  INSERT INTO machines (
    id, biz_no, name, machine_type, workshop, status, enabled, settings_json,
    created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(machine.machineId)},
    ${parameters.text(machine.bizNo)},
    ${parameters.text(machine.name)},
    ${parameters.text(machine.machineType)},
    ${parameters.text(machine.workshop)},
    ${parameters.text(machine.status)},
    ${parameters.boolean(machine.enabled)},
    ${parameters.json(machine.settings)},
    ${parameters.nullableText(machine.createdBy)},
    ${parameters.timestamp(machine.createdAt)},
    ${parameters.timestamp(machine.updatedAt)}
  FROM write_guard
  ON CONFLICT (id) DO UPDATE SET
    biz_no = EXCLUDED.biz_no,
    name = EXCLUDED.name,
    machine_type = EXCLUDED.machine_type,
    workshop = EXCLUDED.workshop,
    status = EXCLUDED.status,
    enabled = EXCLUDED.enabled,
    settings_json = EXCLUDED.settings_json,
    updated_at = EXCLUDED.updated_at
  RETURNING ${machineJsonExpression("machines")} AS result
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'machine', (SELECT result FROM upserted_machine),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

function loadPersistentMachineState(storageRoot) {
  const filePath = join(storageRoot, masterDataMachineConfigurationStoreKey);
  if (!existsSync(filePath)) {
    return { machines: buildDefaultMasterDataMachines(), operationLogs: [] };
  }
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      machines: normalizeMasterDataMachines(value?.machines),
      operationLogs: normalizeMachineOperationLogs(value?.operationLogs),
    };
  } catch {
    return { machines: buildDefaultMasterDataMachines(), operationLogs: [] };
  }
}

function persistMachineState(storageRoot, workspace = {}) {
  const filePath = join(storageRoot, masterDataMachineConfigurationStoreKey);
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(
    filePath,
    `${JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      machines: normalizeMasterDataMachines(workspace.machines),
      operationLogs: normalizeMachineOperationLogs(workspace.operationLogs),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  chmodSync(filePath, 0o600);
}

function applyMachineWorkspaceMutation({ workspace, machine, operationLog }) {
  if (!workspace) return;
  workspace.machines = upsertById(workspace.machines, machine, "machineId");
  if (operationLog) workspace.operationLogs = upsertById(workspace.operationLogs, operationLog, "id");
}

function normalizeMachineTransactionResult(value = {}) {
  return {
    machine: normalizeMasterDataMachine(value.machine ?? value.machine_record),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
  };
}

function normalizeMachineOperationLogs(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => cleanText(item?.targetType ?? item?.target_type) === "master_data_machine")
    .map((item) => ({ ...item }));
}

function normalizeOperationLog(value = {}) {
  const id = cleanText(value.id);
  if (!id) return null;
  return {
    id,
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? null,
    after: value.after ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "master_data",
    occurredAt: cleanText(value.occurredAt ?? value.occurred_at) || new Date().toISOString(),
    createdAt: cleanText(value.createdAt ?? value.created_at) || new Date().toISOString(),
  };
}

function buildInsertOperationLogSql(operationLog, parameters, dependency) {
  return `INSERT INTO operation_logs (
  id, target_type, target_id, action, before_json, after_json, reason,
  operator_id, page_key, occurred_at, created_at
)
SELECT
  ${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.text(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)},
  ${parameters.timestamp(operationLog.createdAt)}
FROM ${dependency}
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
RETURNING id`;
}

function machineJsonExpression(alias) {
  return `json_build_object(
    'machineId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'name', ${alias}.name,
    'machineType', ${alias}.machine_type,
    'workshop', ${alias}.workshop,
    'status', ${alias}.status,
    'enabled', ${alias}.enabled,
    'settings', ${alias}.settings_json,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function upsertById(value, record, key) {
  const rows = Array.isArray(value) ? value : [];
  const id = cleanText(record?.[key] ?? record?.id);
  const index = rows.findIndex((item) => cleanText(item?.[key] ?? item?.id) === id);
  return index < 0
    ? [...rows, record].sort(sortMachine)
    : rows.map((item, itemIndex) => itemIndex === index ? record : item).sort(sortMachine);
}

function sortMachine(left, right) {
  return cleanText(left?.workshop).localeCompare(cleanText(right?.workshop), "zh-CN", { numeric: true }) ||
    cleanText(left?.name ?? left?.machineLabel).localeCompare(cleanText(right?.name ?? right?.machineLabel), "zh-CN", { numeric: true }) ||
    cleanText(left?.machineId ?? left?.id).localeCompare(cleanText(right?.machineId ?? right?.id), "zh-CN", { numeric: true });
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
