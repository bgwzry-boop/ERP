import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import {
  isValidEmployeeNumber,
  normalizeEmployeeNumberKey,
} from "../shared/auth/employeeIdentity.js";

const masterDataImportWriteScope = "master_data_import_v1";

const recordTypeContracts = {
  standardColors: { tableName: "standard_colors", workspaceKey: "standardColors", required: ["id", "colorKey", "name"], updatedAt: true },
  priceTables: { tableName: "price_tables", workspaceKey: "priceTables", required: ["id", "bizNo", "name"], updatedAt: true },
  customers: { tableName: "customers", workspaceKey: "customers", required: ["id", "bizNo", "name"], updatedAt: true },
  customerContacts: { tableName: "customer_contacts", workspaceKey: "customerContacts", required: ["id", "customerId"], updatedAt: true },
  customerAddresses: { tableName: "customer_addresses", workspaceKey: "customerAddresses", required: ["id", "customerId", "address"], updatedAt: true },
  customerNotes: { tableName: "customer_notes", workspaceKey: "customerNotes", required: ["id", "customerId", "noteType", "content"], updatedAt: true },
  colorAliases: { tableName: "color_aliases", workspaceKey: "colorAliases", required: ["id", "alias", "standardColorId"], updatedAt: true },
  sizeSpecs: { tableName: "size_specs", workspaceKey: "sizeSpecs", required: ["id", "sizeKey", "displayName"], updatedAt: true },
  finishedGoodsStyles: { tableName: "finished_goods_styles", workspaceKey: "finishedGoodsStyles", required: ["id", "styleKey", "name"], updatedAt: true },
  priceTableItems: { tableName: "price_table_items", workspaceKey: "priceTableItems", required: ["id", "priceTableId"], updatedAt: true },
  inventoryItems: { tableName: "inventory_items", workspaceKey: "inventoryItems", required: ["id", "inventoryKey", "size", "handleType", "style", "zone", "inventoryState"], updatedAt: true },
  inventoryLedgerEntries: { tableName: "inventory_ledger_entries", workspaceKey: "inventoryLedgerEntries", required: ["id", "inventoryItemId", "sourceType", "sourceId"] },
  machines: { tableName: "machines", workspaceKey: "machines", required: ["id", "bizNo", "name"], updatedAt: true },
  employees: { tableName: "employees", workspaceKey: "employees", required: ["id", "bizNo", "name", "roleName"], updatedAt: true },
  employeeMachineAssignments: { tableName: "employee_machine_assignments", workspaceKey: "employeeMachineAssignments", required: ["id", "employeeId", "machineId"], updatedAt: true },
  machineCapacityBaselines: { tableName: "machine_capacity_baselines", workspaceKey: "machineCapacityBaselines", required: ["id", "machineId", "sizeKey"], updatedAt: true },
};

const recordTypeWriteOrder = [
  "standardColors",
  "priceTables",
  "customers",
  "customerContacts",
  "customerAddresses",
  "customerNotes",
  "colorAliases",
  "sizeSpecs",
  "finishedGoodsStyles",
  "priceTableItems",
  "inventoryItems",
  "inventoryLedgerEntries",
  "machines",
  "employees",
  "employeeMachineAssignments",
  "machineCapacityBaselines",
];

const rollbackWorkspaceKeys = [
  ...new Set([
    ...recordTypeWriteOrder.map((recordType) => recordTypeContracts[recordType].workspaceKey),
    "inventories",
    "operationLogs",
  ]),
];

export function createMasterDataImportTransactionRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_MASTER_DATA_IMPORT_TRANSACTION_STORE ??
    (process.env.ERP_MASTER_DATA_IMPORT_WRITER === "postgres" ? "postgres" : "local");

  if (mode === "postgres") {
    return createPostgresMasterDataImportTransactionRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_MASTER_DATA_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local" || mode === "local_transaction") return createLocalMasterDataImportTransactionRepository();
  throw new Error(`Unsupported master data import transaction repository mode: ${mode}`);
}

export function createLocalMasterDataImportTransactionRepository() {
  return {
    kind: "local_memory",

    async applyImportExecution(input) {
      assertExecutionCanBeWritten(input.importExecution);
      const snapshot = snapshotWorkspace(input.workspace);
      try {
        const normalizedRecords = normalizeTargetRecords(input.importExecution.importPayload?.targetRecords);
        assertImportedEmployeesEligible(input.workspace?.employees, normalizedRecords.employees);
        normalizedRecords.employees = prepareImportedEmployeeProfiles(
          input.workspace?.employees,
          normalizedRecords.employees,
          input.operationLog,
        );
        const writeSummary = applyTargetRecordsToWorkspace(input.workspace, normalizedRecords);
        const committedExecution = buildCommittedImportExecution({
          importExecution: input.importExecution,
          operationLog: input.operationLog,
          repositoryKind: "local_memory",
          writeSummary,
        });
        upsertOperationLog(input.workspace, input.operationLog);
        await persistLocalRuntimeIdentityState(input.workspace, snapshot);
        return {
          importExecution: committedExecution,
          operationLogId: cleanText(input.operationLog?.id),
          summary: committedExecution.transactionSummary,
        };
      } catch (error) {
        restoreWorkspace(input.workspace, snapshot);
        throw error;
      }
    },
  };
}

async function persistLocalRuntimeIdentityState(workspace = {}, snapshot = {}) {
  const repository = workspace.runtimeIdentityRepository;
  if (!repository?.saveState) return null;
  if (repository.kind !== "local_json") {
    throw new Error("Local master-data import requires the local runtime identity repository.");
  }
  const machineRepository = workspace.masterDataMachineConfigurationRepository;
  try {
    const identityResult = await repository.saveState({ workspace });
    await machineRepository?.saveState?.({ workspace });
    return identityResult;
  } catch (error) {
    const rollbackWorkspace = { ...workspace };
    restoreWorkspace(rollbackWorkspace, snapshot);
    const rollbackErrors = [];
    try {
      await repository.saveState({ workspace: rollbackWorkspace });
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      await machineRepository?.saveState?.({ workspace: rollbackWorkspace });
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Local master-data persistence failed and rollback was incomplete: ${error?.message ?? String(error)}`,
      );
    }
    throw error;
  }
}

export function createPostgresMasterDataImportTransactionRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));

  return {
    kind: "postgres",

    async applyImportExecution(input) {
      assertExecutionCanBeWritten(input.importExecution);
      const normalizedRecords = normalizeTargetRecords(input.importExecution.importPayload?.targetRecords);
      assertImportedEmployeesEligible(input.workspace?.employees, normalizedRecords.employees);
      normalizedRecords.employees = prepareImportedEmployeeProfiles(
        input.workspace?.employees,
        normalizedRecords.employees,
        input.operationLog,
      );
      assertAttendanceIdentityUniqueness(input.workspace?.employees, normalizedRecords.employees);
      const builtQuery = buildMasterDataImportTransactionQuery({
        ...input,
        targetRecords: normalizedRecords,
      });
      const rawResult = normalizePostgresTransactionResult(
        await queryJson(builtQuery.text, builtQuery.values),
      );
      const writeSummary = {
        ...summarizeTargetRecords(normalizedRecords),
        ...rawResult.summary,
        repositoryKind: "postgres",
      };
      applyTargetRecordsToWorkspace(input.workspace, normalizedRecords);
      upsertOperationLog(input.workspace, input.operationLog);
      const committedExecution = buildCommittedImportExecution({
        importExecution: input.importExecution,
        operationLog: input.operationLog,
        repositoryKind: "postgres",
        writeSummary,
      });
      return {
        importExecution: committedExecution,
        operationLogId: cleanText(rawResult.operationLogId) || cleanText(input.operationLog?.id),
        summary: committedExecution.transactionSummary,
      };
    },
  };
}

export function buildMasterDataImportTransactionSql(input = {}) {
  return buildMasterDataImportTransactionQuery(input).text;
}

export function buildMasterDataImportTransactionQuery(input = {}) {
  assertExecutionCanBeWritten(input.importExecution);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!operationLog) throw new Error("Operation log is required for master data import transaction");
  const targetRecords = normalizeTargetRecords(input.targetRecords ?? input.importExecution.importPayload?.targetRecords);
  const summary = summarizeTargetRecords(targetRecords);
  const parameters = createPostgresParameterBinder();
  const insertStatements = recordTypeWriteOrder
    .map((recordType) => buildInsertRecordsSql(recordType, targetRecords[recordType] ?? [], operationLog.operatorId, parameters))
    .filter(Boolean);

  return {
    text: `
BEGIN;
${insertStatements.join("\n\n")}
${buildInsertOperationLogSql(operationLog, parameters)}
SELECT json_build_object(
  'executionId', ${parameters.text(input.importExecution.executionId)},
  'status', 'committed',
  'recordCount', ${parameters.integer(summary.appliedRecordCount)},
  'affectedTableCount', ${parameters.integer(summary.affectedTableCount)},
  'operationLogId', ${parameters.text(operationLog.id)}
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeTargetRecords(targetRecords = {}) {
  const normalized = {};
  for (const recordType of recordTypeWriteOrder) {
    normalized[recordType] = normalizeRecordList(recordType, targetRecords[recordType] ?? []);
  }
  assertIncomingEmployeeIdentityKeys(normalized.employees);
  return normalized;
}

export function summarizeTargetRecords(targetRecords = {}) {
  const recordTypeCounts = {};
  let appliedRecordCount = 0;
  let affectedTableCount = 0;
  for (const recordType of recordTypeWriteOrder) {
    const count = Array.isArray(targetRecords[recordType]) ? targetRecords[recordType].length : 0;
    if (count > 0) {
      recordTypeCounts[recordType] = count;
      appliedRecordCount += count;
      affectedTableCount += 1;
    }
  }
  return {
    appliedRecordCount,
    affectedTableCount,
    insertedCount: appliedRecordCount,
    updatedCount: 0,
    recordTypeCounts,
  };
}

function applyTargetRecordsToWorkspace(workspace = {}, targetRecords = {}) {
  const summary = {
    appliedRecordCount: 0,
    affectedTableCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    recordTypeCounts: {},
  };

  assertAttendanceIdentityUniqueness(workspace.employees, targetRecords.employees);
  for (const recordType of recordTypeWriteOrder) {
    const contract = recordTypeContracts[recordType];
    const records = targetRecords[recordType] ?? [];
    if (!records.length) continue;
    workspace[contract.workspaceKey] = Array.isArray(workspace[contract.workspaceKey])
      ? workspace[contract.workspaceKey]
      : [];
    if (recordType === "employees") {
      assertExistingEmployeeIdentityKeys(workspace[contract.workspaceKey], records);
    }
    assertLocalReferences(workspace, recordType, records);
    const result = upsertManyById(workspace[contract.workspaceKey], records, {
      preserveExistingFields: recordType === "employees"
        ? ["userId", "accountEnabled", "profileStatus", "requestedEnabled"]
        : [],
    });
    workspace[contract.workspaceKey] = result.items;
    summary.appliedRecordCount += records.length;
    summary.affectedTableCount += 1;
    summary.insertedCount += result.insertedCount;
    summary.updatedCount += result.updatedCount;
    summary.recordTypeCounts[recordType] = records.length;

    if (recordType === "inventoryItems") {
      const inventoryUiRecords = records.map(toInventoryUiRecord);
      const uiResult = upsertManyById(Array.isArray(workspace.inventories) ? workspace.inventories : [], inventoryUiRecords);
      workspace.inventories = uiResult.items;
    }
  }

  return summary;
}

function assertIncomingEmployeeIdentityKeys(records = []) {
  const seen = new Set();
  for (const record of records) {
    const employeeId = cleanText(record.id);
    if (!isValidEmployeeNumber(employeeId)) {
      throw new Error(`employees record has invalid stable employee number: ${employeeId || "missing"}`);
    }
    const key = normalizeEmployeeNumberKey(employeeId);
    if (seen.has(key)) throw new Error(`employees records contain duplicate employee number: ${employeeId}`);
    seen.add(key);
  }
}

function assertExistingEmployeeIdentityKeys(currentRecords = [], incomingRecords = []) {
  const existingByKey = new Map(
    currentRecords.map((record) => [normalizeEmployeeNumberKey(record?.id), cleanText(record?.id)]),
  );
  for (const record of incomingRecords) {
    const existingId = existingByKey.get(normalizeEmployeeNumberKey(record.id));
    if (existingId && existingId !== cleanText(record.id)) {
      throw new Error(`employees record conflicts with existing employee number: ${record.id}`);
    }
  }
}

function assertAttendanceIdentityUniqueness(currentRecords = [], incomingRecords = []) {
  const incomingIds = new Set(incomingRecords.map((record) => cleanText(record.id)));
  const seen = new Map();
  for (const record of [...currentRecords.filter((record) => !incomingIds.has(cleanText(record.id))), ...incomingRecords]) {
    const provider = cleanText(record.attendanceProvider).toLowerCase();
    const externalId = cleanText(record.attendanceExternalId);
    if (!provider && !externalId) continue;
    if (!provider || !externalId) {
      throw new Error(`employees record has incomplete attendance identity: ${cleanText(record.id) || "missing"}`);
    }
    const key = `${provider}|${externalId}`;
    if (seen.has(key)) {
      throw new Error(`employees records contain duplicate attendance identity: ${provider} / ${externalId}`);
    }
    seen.set(key, cleanText(record.id));
  }
}

function assertImportedEmployeesEligible(currentRecords = [], incomingRecords = []) {
  const currentById = new Map(
    (Array.isArray(currentRecords) ? currentRecords : []).map((record) => [cleanText(record.id), record]),
  );
  for (const incoming of incomingRecords) {
    const current = currentById.get(cleanText(incoming.id));
    const status = cleanText(current?.profileStatus).toLowerCase();
    if (["departed", "left", "retired", "inactive_employee", "merged_duplicate"].includes(status)) {
      throw new Error(`employees record is not eligible for active profile import: ${cleanText(incoming.id)}`);
    }
  }
}

function prepareImportedEmployeeProfiles(currentRecords = [], incomingRecords = [], operationLog = {}) {
  const currentById = new Map(
    (Array.isArray(currentRecords) ? currentRecords : []).map((record) => [cleanText(record.id), record]),
  );
  const changedAt = cleanText(operationLog.occurredAt ?? operationLog.createdAt) || new Date().toISOString();
  const operatorId = cleanText(operationLog.operatorId);
  return incomingRecords.map((record) => {
    const existing = currentById.get(cleanText(record.id));
    const presence = normalizeObject(record.profileFieldPresence);
    if (!existing) {
      const mappingPresent = presence.attendanceMapping === true;
      return {
        ...record,
        attendanceMappingUpdatedBy: mappingPresent ? operatorId : "",
        attendanceMappingUpdatedAt: mappingPresent ? changedAt : "",
      };
    }
    const mappingProvided = presence.attendanceMapping === true;
    const nextProvider = mappingProvided
      ? cleanText(record.attendanceProvider).toLowerCase()
      : cleanText(existing.attendanceProvider).toLowerCase();
    const nextExternalId = mappingProvided
      ? cleanText(record.attendanceExternalId)
      : cleanText(existing.attendanceExternalId);
    const mappingChanged =
      nextProvider !== cleanText(existing.attendanceProvider).toLowerCase()
      || nextExternalId !== cleanText(existing.attendanceExternalId);
    return {
      ...record,
      birthDate: presence.birthDate === true ? record.birthDate : cleanText(existing.birthDate),
      hireDate: presence.hireDate === true ? record.hireDate : cleanText(existing.hireDate),
      payrollPositionKey: presence.payrollPositionKey === true
        ? cleanText(record.payrollPositionKey)
        : cleanText(existing.payrollPositionKey),
      baseHourlyWage: presence.baseHourlyWage === true
        ? record.baseHourlyWage
        : toFiniteNumber(existing.baseHourlyWage),
      positionAllowanceHourly: presence.positionAllowanceHourly === true
        ? record.positionAllowanceHourly
        : toFiniteNumber(existing.positionAllowanceHourly),
      wageEffectiveFrom: presence.wageEffectiveFrom === true
        ? record.wageEffectiveFrom
        : cleanText(existing.wageEffectiveFrom),
      attendanceProvider: nextProvider,
      attendanceExternalId: nextExternalId,
      attendanceMappingUpdatedBy: mappingChanged
        ? operatorId
        : cleanText(existing.attendanceMappingUpdatedBy),
      attendanceMappingUpdatedAt: mappingChanged
        ? changedAt
        : cleanText(existing.attendanceMappingUpdatedAt),
    };
  });
}

function assertLocalReferences(workspace, recordType, records) {
  if (recordType === "customerContacts" || recordType === "customerAddresses" || recordType === "customerNotes") {
    for (const record of records) {
      assertWorkspaceRecordExists(workspace, "customers", record.customerId, `${recordType}.${record.id}.customerId`);
    }
  }
  if (recordType === "colorAliases") {
    for (const record of records) {
      assertWorkspaceRecordExists(workspace, "standardColors", record.standardColorId, `${recordType}.${record.id}.standardColorId`);
    }
  }
  if (recordType === "priceTableItems") {
    for (const record of records) {
      assertWorkspaceRecordExists(workspace, "priceTables", record.priceTableId, `${recordType}.${record.id}.priceTableId`);
      if (record.standardColorId) {
        assertWorkspaceRecordExists(workspace, "standardColors", record.standardColorId, `${recordType}.${record.id}.standardColorId`);
      }
    }
  }
  if (recordType === "inventoryItems") {
    for (const record of records) {
      if (record.standardColorId) {
        assertWorkspaceRecordExists(workspace, "standardColors", record.standardColorId, `${recordType}.${record.id}.standardColorId`);
      }
    }
  }
  if (recordType === "inventoryLedgerEntries") {
    for (const record of records) {
      assertWorkspaceRecordExists(workspace, "inventoryItems", record.inventoryItemId, `${recordType}.${record.id}.inventoryItemId`);
    }
  }
  if (recordType === "employeeMachineAssignments") {
    for (const record of records) {
      assertWorkspaceRecordExists(workspace, "employees", record.employeeId, `${recordType}.${record.id}.employeeId`);
      assertWorkspaceRecordExists(workspace, "machines", record.machineId, `${recordType}.${record.id}.machineId`);
    }
  }
  if (recordType === "machineCapacityBaselines") {
    for (const record of records) {
      assertWorkspaceRecordExists(workspace, "machines", record.machineId, `${recordType}.${record.id}.machineId`);
    }
  }
}

function assertWorkspaceRecordExists(workspace, workspaceKey, id, label) {
  if (!cleanText(id)) throw new Error(`${label} is required`);
  const items = Array.isArray(workspace[workspaceKey]) ? workspace[workspaceKey] : [];
  if (!items.some((item) => cleanText(item?.id) === cleanText(id))) {
    throw new Error(`${label} references missing record: ${id}`);
  }
}

function buildCommittedImportExecution({ importExecution, operationLog, repositoryKind, writeSummary }) {
  const finishedAt = cleanText(operationLog?.occurredAt) || new Date().toISOString();
  const summary = {
    ...(importExecution.summary ?? {}),
    blockedReasonCount: 0,
    transactionRecordCount: writeSummary.appliedRecordCount,
    insertedCount: writeSummary.insertedCount,
    updatedCount: writeSummary.updatedCount,
    affectedTableCount: writeSummary.affectedTableCount,
  };
  return {
    ...importExecution,
    status: "committed",
    statusLabel: "已正式导入",
    officialImportEnabled: true,
    officialWriteAttempted: true,
    officialWriteScope: masterDataImportWriteScope,
    transactionStarted: true,
    finishedAt,
    summary,
    writeBatches: (Array.isArray(importExecution.writeBatches) ? importExecution.writeBatches : []).map((batch) => ({
      ...batch,
      executionStatus: "committed",
      failureCount: 0,
      insertedCount: summary.insertedCount,
      updatedCount: summary.updatedCount,
    })),
    blockingReasons: [],
    nextRequiredCapabilities: [
      "员工账号密码发放 / 正式用户仓储接入",
      "更多外部 Excel 编辑器兼容样例",
    ],
    transactionSummary: {
      ...writeSummary,
      repositoryKind,
      operationLogId: cleanText(operationLog?.id),
      committedAt: finishedAt,
      rollbackPolicy: "rollback_on_any_failed_row",
    },
  };
}

function assertExecutionCanBeWritten(execution) {
  if (!execution || typeof execution !== "object") throw new Error("Master data import execution is required");
  if (cleanText(execution.status) !== "ready_for_transaction_writer") {
    throw new Error(`Master data import execution is not ready for transaction writer: ${cleanText(execution.status)}`);
  }
  if (execution.officialImportEnabled !== true) {
    throw new Error("officialImportEnabled=true is required before writing master data");
  }
  if (cleanText(execution.officialWriterKind) === "not_configured") {
    throw new Error("officialWriterKind must be configured before writing master data");
  }
  if (toFiniteInteger(execution.summary?.failedRowCount) > 0 || (execution.failedRows ?? []).length > 0) {
    throw new Error("Master data import contains failed rows and must not be written");
  }
}

function normalizeRecordList(recordType, records) {
  const contract = recordTypeContracts[recordType];
  return (Array.isArray(records) ? records : []).map((record) => {
    const normalized = normalizeRecord(recordType, record);
    const missingField = contract.required.find((field) => !hasRequiredValue(normalized[field]));
    if (missingField) {
      throw new Error(`${contract.tableName} record is missing required field: ${missingField}`);
    }
    return normalized;
  });
}

function normalizeRecord(recordType, record = {}) {
  const base = { ...record, id: cleanText(record.id) };
  if (recordType === "customers") {
    return {
      ...base,
      bizNo: cleanText(record.bizNo) || base.id,
      name: cleanText(record.name),
      shortName: cleanText(record.shortName) || cleanText(record.name).slice(0, 12),
      settlementCycle: cleanText(record.settlementCycle) || "未设置",
      riskStatus: cleanText(record.riskStatus) || "正常",
      enabled: record.enabled !== false,
      cycle: cleanText(record.settlementCycle) || "未设置",
      debt: toFiniteNumber(record.debtAmountSnapshot),
    };
  }
  if (recordType === "customerContacts") {
    return {
      ...base,
      customerId: cleanText(record.customerId),
      contactName: cleanText(record.contactName),
      phone: cleanText(record.phone),
      role: cleanText(record.role),
      isDefault: record.isDefault !== false,
      remark: cleanText(record.remark),
    };
  }
  if (recordType === "customerAddresses") {
    return {
      ...base,
      customerId: cleanText(record.customerId),
      contactId: cleanText(record.contactId),
      address: cleanText(record.address),
      area: cleanText(record.area),
      defaultFulfillmentMethod: cleanText(record.defaultFulfillmentMethod),
      isDefault: record.isDefault !== false,
      remark: cleanText(record.remark),
    };
  }
  if (recordType === "customerNotes") {
    return {
      ...base,
      customerId: cleanText(record.customerId),
      noteType: cleanText(record.noteType),
      content: cleanText(record.content),
      visibleTo: cleanText(record.visibleTo) || "office",
    };
  }
  if (recordType === "standardColors") {
    return {
      ...base,
      colorKey: cleanText(record.colorKey),
      name: cleanText(record.name),
      enabled: record.enabled !== false,
    };
  }
  if (recordType === "colorAliases") {
    return {
      ...base,
      alias: cleanText(record.alias),
      standardColorId: cleanText(record.standardColorId),
      sourceType: cleanText(record.sourceType) || "global",
      sourceId: cleanText(record.sourceId),
      enabled: record.enabled !== false,
    };
  }
  if (recordType === "sizeSpecs") {
    return {
      ...base,
      sizeKey: cleanText(record.sizeKey),
      displayName: cleanText(record.displayName),
      widthMm: toNullableNumber(record.widthMm),
      heightMm: toNullableNumber(record.heightMm),
      metadata: normalizeObject(record.metadata),
      enabled: record.enabled !== false,
    };
  }
  if (recordType === "finishedGoodsStyles") {
    return {
      ...base,
      styleKey: cleanText(record.styleKey),
      name: cleanText(record.name),
      enabled: record.enabled !== false,
      allowedSizeKeys: normalizeTextArray(record.allowedSizeKeys),
    };
  }
  if (recordType === "priceTables") {
    return {
      ...base,
      bizNo: cleanText(record.bizNo) || base.id,
      name: cleanText(record.name),
      status: cleanText(record.status) || "pending_review",
      effectiveFrom: cleanText(record.effectiveFrom),
    };
  }
  if (recordType === "priceTableItems") {
    return {
      ...base,
      priceTableId: cleanText(record.priceTableId),
      sizeKey: cleanText(record.sizeKey),
      standardColorId: cleanText(record.standardColorId),
      handleType: cleanText(record.handleType),
      styleKey: cleanText(record.styleKey),
      bagPrice: toFiniteNumber(record.bagPrice),
      printPrice: toFiniteNumber(record.printPrice),
      otherFee: toFiniteNumber(record.otherFee),
      minQty: toFiniteInteger(record.minQty) || 1,
      enabled: record.enabled === true,
    };
  }
  if (recordType === "inventoryItems") {
    return {
      ...base,
      inventoryKey: cleanText(record.inventoryKey),
      size: cleanText(record.size),
      standardColorId: cleanText(record.standardColorId),
      handleType: cleanText(record.handleType),
      style: cleanText(record.style),
      zone: cleanText(record.zone),
      inventoryState: cleanText(record.inventoryState),
      onHandQty: toFiniteInteger(record.onHandQty),
      reservedQty: toFiniteInteger(record.reservedQty),
      waitingPickupLockedQty: toFiniteInteger(record.waitingPickupLockedQty),
      pendingHandlingQty: toFiniteInteger(record.pendingHandlingQty),
      trustLevel: cleanText(record.trustLevel) || "待复核",
    };
  }
  if (recordType === "inventoryLedgerEntries") {
    return {
      ...base,
      inventoryItemId: cleanText(record.inventoryItemId),
      changeType: cleanText(record.changeType) || "initial_import",
      qtyBefore: toFiniteInteger(record.qtyBefore),
      qtyChange: toFiniteInteger(record.qtyChange),
      qtyAfter: toFiniteInteger(record.qtyAfter),
      sourceType: cleanText(record.sourceType),
      sourceId: cleanText(record.sourceId),
      occurredAt: cleanText(record.occurredAt),
      reason: cleanText(record.reason),
      remark: cleanText(record.remark),
    };
  }
  if (recordType === "machines") {
    return {
      ...base,
      bizNo: cleanText(record.bizNo) || base.id,
      name: cleanText(record.name),
      machineType: cleanText(record.machineType) || "bag_making",
      workshop: cleanText(record.workshop),
      status: cleanText(record.status) || "active",
      enabled: record.enabled !== false,
      settings: normalizeObject(record.settings),
    };
  }
  if (recordType === "employees") {
    return {
      ...base,
      bizNo: cleanText(record.bizNo) || base.id,
      userId: cleanText(record.userId),
      name: cleanText(record.name),
      roleName: cleanText(record.roleName),
      defaultWorkshop: cleanText(record.defaultWorkshop),
      defaultMachineId: cleanText(record.defaultMachineId),
      birthDate: cleanText(record.birthDate),
      hireDate: cleanText(record.hireDate),
      payrollPositionKey: cleanText(record.payrollPositionKey),
      baseHourlyWage: toFiniteNumber(record.baseHourlyWage),
      positionAllowanceHourly: toFiniteNumber(record.positionAllowanceHourly),
      wageEffectiveFrom: cleanText(record.wageEffectiveFrom),
      attendanceProvider: cleanText(record.attendanceProvider).toLowerCase(),
      attendanceExternalId: cleanText(record.attendanceExternalId),
      attendanceMappingUpdatedBy: cleanText(record.attendanceMappingUpdatedBy),
      attendanceMappingUpdatedAt: cleanText(record.attendanceMappingUpdatedAt),
      profileFieldPresence: normalizeObject(record.profileFieldPresence),
      accountEnabled: false,
      profileStatus: cleanText(record.profileStatus) || "pending_admin_review",
      requestedEnabled: record.requestedEnabled === true,
      remark: cleanText(record.remark),
    };
  }
  if (recordType === "employeeMachineAssignments") {
    return {
      ...base,
      employeeId: cleanText(record.employeeId),
      machineId: cleanText(record.machineId),
      assignmentType: cleanText(record.assignmentType) || "default",
      workshop: cleanText(record.workshop),
      effectiveFrom: cleanText(record.effectiveFrom),
      enabled: record.enabled !== false,
    };
  }
  if (recordType === "machineCapacityBaselines") {
    return {
      ...base,
      machineId: cleanText(record.machineId),
      sizeKey: cleanText(record.sizeKey),
      dailyCapacityQty: toFiniteInteger(record.dailyCapacityQty),
      hourlyCapacityQty: toNullableInteger(record.hourlyCapacityQty),
      sourceKind: cleanText(record.sourceKind) || "manual_estimate",
      confidence: cleanText(record.confidence) || "low",
      effectiveFrom: cleanText(record.effectiveFrom),
      remark: cleanText(record.remark),
    };
  }
  return base;
}

function buildInsertRecordsSql(recordType, records, operatorId, parameters) {
  if (!records.length) return "";
  const sqlLiteral = (value) => parameters.text(value);
  const sqlNullableLiteral = (value) => parameters.nullableText(value);
  const sqlNullableTimestamp = (value) => parameters.nullableTimestamp(value);
  const sqlNullableDate = (value) => nullableDateParameter(value, parameters);
  const sqlInteger = (value) => parameters.integer(value);
  const sqlNullableInteger = (value) => parameters.nullableInteger(value);
  const sqlNumber = (value) => parameters.number(value);
  const sqlNullableNumber = (value) => parameters.nullableNumber(value);
  const sqlBoolean = (value) => parameters.boolean(value);
  const sqlJson = (value) => parameters.json(value);
  const sqlTextArray = (values) => parameters.textArray(values);
  if (recordType === "standardColors") {
    return buildInsertSql("standard_colors", ["id", "color_key", "name", "enabled"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.colorKey),
      sqlLiteral(record.name),
      sqlBoolean(record.enabled),
    ]);
  }
  if (recordType === "priceTables") {
    return buildInsertSql("price_tables", ["id", "biz_no", "name", "status", "effective_from", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.bizNo),
      sqlLiteral(record.name),
      sqlLiteral(record.status),
      sqlNullableTimestamp(record.effectiveFrom),
      sqlNullableLiteral(operatorId),
    ]);
  }
  if (recordType === "customers") {
    return buildInsertSql("customers", ["id", "biz_no", "name", "short_name", "settlement_cycle", "risk_status", "enabled", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.bizNo),
      sqlLiteral(record.name),
      sqlLiteral(record.shortName),
      sqlLiteral(record.settlementCycle),
      sqlLiteral(record.riskStatus),
      sqlBoolean(record.enabled),
      sqlNullableLiteral(operatorId),
    ]);
  }
  if (recordType === "customerContacts") {
    return buildInsertSql("customer_contacts", ["id", "customer_id", "contact_name", "phone", "role", "is_default", "remark"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.customerId),
      sqlLiteral(record.contactName),
      sqlLiteral(record.phone),
      sqlLiteral(record.role),
      sqlBoolean(record.isDefault),
      sqlLiteral(record.remark),
    ]);
  }
  if (recordType === "customerAddresses") {
    return buildInsertSql("customer_addresses", ["id", "customer_id", "contact_id", "address", "area", "default_fulfillment_method", "is_default", "remark"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.customerId),
      sqlNullableLiteral(record.contactId),
      sqlLiteral(record.address),
      sqlLiteral(record.area),
      sqlLiteral(record.defaultFulfillmentMethod),
      sqlBoolean(record.isDefault),
      sqlLiteral(record.remark),
    ]);
  }
  if (recordType === "customerNotes") {
    return buildInsertSql("customer_notes", ["id", "customer_id", "note_type", "content", "visible_to", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.customerId),
      sqlLiteral(record.noteType),
      sqlLiteral(record.content),
      sqlLiteral(record.visibleTo),
      sqlNullableLiteral(operatorId),
    ]);
  }
  if (recordType === "colorAliases") {
    return buildInsertSql("color_aliases", ["id", "alias", "standard_color_id", "source_type", "source_id", "enabled", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.alias),
      sqlLiteral(record.standardColorId),
      sqlLiteral(record.sourceType),
      sqlLiteral(record.sourceId),
      sqlBoolean(record.enabled),
      sqlNullableLiteral(operatorId),
    ]);
  }
  if (recordType === "sizeSpecs") {
    return buildInsertSql("size_specs", ["id", "size_key", "display_name", "width_mm", "height_mm", "metadata_json", "enabled"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.sizeKey),
      sqlLiteral(record.displayName),
      sqlNullableNumber(record.widthMm),
      sqlNullableNumber(record.heightMm),
      sqlJson(record.metadata),
      sqlBoolean(record.enabled),
    ]);
  }
  if (recordType === "finishedGoodsStyles") {
    return buildInsertSql("finished_goods_styles", ["id", "style_key", "name", "enabled", "allowed_size_keys"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.styleKey),
      sqlLiteral(record.name),
      sqlBoolean(record.enabled),
      sqlTextArray(record.allowedSizeKeys),
    ]);
  }
  if (recordType === "priceTableItems") {
    return buildInsertSql("price_table_items", ["id", "price_table_id", "size_key", "standard_color_id", "handle_type", "style_key", "bag_price", "print_price", "other_fee", "min_qty", "enabled"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.priceTableId),
      sqlLiteral(record.sizeKey),
      sqlNullableLiteral(record.standardColorId),
      sqlLiteral(record.handleType),
      sqlLiteral(record.styleKey),
      sqlNumber(record.bagPrice),
      sqlNumber(record.printPrice),
      sqlNumber(record.otherFee),
      sqlNullableInteger(record.minQty),
      sqlBoolean(record.enabled),
    ]);
  }
  if (recordType === "inventoryItems") {
    return buildInsertSql("inventory_items", ["id", "inventory_key", "size", "standard_color_id", "handle_type", "style", "zone", "inventory_state", "on_hand_qty", "reserved_qty", "waiting_pickup_locked_qty", "pending_handling_qty", "trust_level"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.inventoryKey),
      sqlLiteral(record.size),
      sqlNullableLiteral(record.standardColorId),
      sqlLiteral(record.handleType),
      sqlLiteral(record.style),
      sqlLiteral(record.zone),
      sqlLiteral(record.inventoryState),
      sqlInteger(record.onHandQty),
      sqlInteger(record.reservedQty),
      sqlInteger(record.waitingPickupLockedQty),
      sqlInteger(record.pendingHandlingQty),
      sqlLiteral(record.trustLevel),
    ]);
  }
  if (recordType === "inventoryLedgerEntries") {
    return buildInsertSql("inventory_ledger_entries", ["id", "inventory_item_id", "change_type", "qty_before", "qty_change", "qty_after", "source_type", "source_id", "operator_id", "confirmed_by", "occurred_at", "reason", "remark"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.inventoryItemId),
      sqlLiteral(record.changeType),
      sqlInteger(record.qtyBefore),
      sqlInteger(record.qtyChange),
      sqlInteger(record.qtyAfter),
      sqlLiteral(record.sourceType),
      sqlLiteral(record.sourceId),
      sqlNullableLiteral(operatorId),
      sqlNullableLiteral(operatorId),
      sqlNullableTimestamp(record.occurredAt),
      sqlLiteral(record.reason),
      sqlLiteral(record.remark),
    ], { updatedAt: false });
  }
  if (recordType === "machines") {
    return buildInsertSql("machines", ["id", "biz_no", "name", "machine_type", "workshop", "status", "enabled", "settings_json", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.bizNo),
      sqlLiteral(record.name),
      sqlLiteral(record.machineType),
      sqlLiteral(record.workshop),
      sqlLiteral(record.status),
      sqlBoolean(record.enabled),
      sqlJson(record.settings),
      sqlNullableLiteral(operatorId),
    ]);
  }
  if (recordType === "employees") {
    return buildInsertSql("employees", ["id", "biz_no", "user_id", "name", "role_name", "default_workshop", "default_machine_id", "birth_date", "hire_date", "payroll_position_key", "base_hourly_wage", "position_allowance_hourly", "wage_effective_from", "attendance_provider", "attendance_external_id", "attendance_mapping_updated_by", "attendance_mapping_updated_at", "account_enabled", "profile_status", "requested_enabled", "remark", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.bizNo),
      sqlNullableLiteral(record.userId),
      sqlLiteral(record.name),
      sqlLiteral(record.roleName),
      sqlLiteral(record.defaultWorkshop),
      sqlNullableLiteral(record.defaultMachineId),
      sqlNullableDate(record.birthDate),
      sqlNullableDate(record.hireDate),
      sqlLiteral(record.payrollPositionKey),
      sqlNumber(record.baseHourlyWage),
      sqlNumber(record.positionAllowanceHourly),
      sqlNullableDate(record.wageEffectiveFrom),
      sqlLiteral(record.attendanceProvider),
      sqlLiteral(record.attendanceExternalId),
      record.attendanceProvider && record.attendanceExternalId
        ? sqlNullableLiteral(record.attendanceMappingUpdatedBy || operatorId)
        : "NULL",
      record.attendanceProvider && record.attendanceExternalId
        ? `COALESCE(${sqlNullableTimestamp(record.attendanceMappingUpdatedAt)}, now())`
        : "NULL",
      sqlBoolean(false),
      sqlLiteral(record.profileStatus),
      sqlBoolean(record.requestedEnabled),
      sqlLiteral(record.remark),
      sqlNullableLiteral(operatorId),
    ], { excludedUpdateColumns: ["user_id", "account_enabled", "profile_status", "requested_enabled"] });
  }
  if (recordType === "employeeMachineAssignments") {
    return buildInsertSql("employee_machine_assignments", ["id", "employee_id", "machine_id", "assignment_type", "workshop", "effective_from", "enabled", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.employeeId),
      sqlLiteral(record.machineId),
      sqlLiteral(record.assignmentType),
      sqlLiteral(record.workshop),
      sqlNullableDate(record.effectiveFrom),
      sqlBoolean(record.enabled),
      sqlNullableLiteral(operatorId),
    ]);
  }
  if (recordType === "machineCapacityBaselines") {
    return buildInsertSql("machine_capacity_baselines", ["id", "machine_id", "size_key", "daily_capacity_qty", "hourly_capacity_qty", "source_kind", "confidence", "effective_from", "remark", "created_by"], records, (record) => [
      sqlLiteral(record.id),
      sqlLiteral(record.machineId),
      sqlLiteral(record.sizeKey),
      sqlInteger(record.dailyCapacityQty),
      sqlNullableInteger(record.hourlyCapacityQty),
      sqlLiteral(record.sourceKind),
      sqlLiteral(record.confidence),
      sqlNullableDate(record.effectiveFrom),
      sqlLiteral(record.remark),
      sqlNullableLiteral(operatorId),
    ]);
  }
  return "";
}

function buildInsertSql(tableName, columns, records, toValues, options = {}) {
  const excludedUpdateColumns = new Set(options.excludedUpdateColumns ?? []);
  const updateColumns = columns.filter(
    (column) => column !== "id" && column !== "created_by" && !excludedUpdateColumns.has(column),
  );
  const updatedAt = options.updatedAt ?? true;
  const updateClause = [
    ...updateColumns.map((column) => `${column} = EXCLUDED.${column}`),
    ...(updatedAt ? ["updated_at = now()"] : []),
  ].join(",\n  ");
  return `INSERT INTO ${tableName} (
  ${columns.join(",\n  ")}
) VALUES
  ${records.map((record) => `(${toValues(record).join(", ")})`).join(",\n  ")}
ON CONFLICT (id) DO UPDATE SET
  ${updateClause};`;
}

function buildInsertOperationLogSql(operationLog, parameters) {
  const sqlLiteral = (value) => parameters.text(value);
  const sqlNullableLiteral = (value) => parameters.nullableText(value);
  const sqlTimestamp = (value) => timestampParameter(value, parameters);
  const sqlJson = (value) => parameters.json(value);
  return `INSERT INTO operation_logs (
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
) VALUES (
  ${sqlLiteral(operationLog.id)},
  ${sqlLiteral(operationLog.targetType)},
  ${sqlLiteral(operationLog.targetId)},
  ${sqlLiteral(operationLog.action)},
  ${sqlJson(operationLog.before)},
  ${sqlJson(operationLog.after)},
  ${sqlLiteral(operationLog.reason)},
  ${sqlNullableLiteral(operationLog.operatorId)},
  ${sqlLiteral(operationLog.pageKey)},
  ${sqlTimestamp(operationLog.occurredAt)},
  ${sqlTimestamp(operationLog.createdAt)}
)
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key,
  occurred_at = EXCLUDED.occurred_at;`;
}

function normalizePostgresTransactionResult(value) {
  if (!value || typeof value !== "object") return { operationLogId: "", summary: {} };
  return {
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
    summary: {
      appliedRecordCount: toFiniteInteger(value.recordCount ?? value.record_count),
      affectedTableCount: toFiniteInteger(value.affectedTableCount ?? value.affected_table_count),
    },
  };
}

function normalizeOperationLogForPersistence(operationLog) {
  if (!operationLog || typeof operationLog !== "object") return null;
  const id = cleanText(operationLog.id);
  if (!id) return null;
  return {
    id,
    targetType: cleanText(operationLog.targetType ?? operationLog.target_type),
    targetId: cleanText(operationLog.targetId ?? operationLog.target_id),
    action: cleanText(operationLog.action),
    before: operationLog.before ?? null,
    after: operationLog.after ?? null,
    reason: cleanText(operationLog.reason),
    operatorId: cleanText(operationLog.operatorId ?? operationLog.operator_id),
    pageKey: cleanText(operationLog.pageKey ?? operationLog.page_key) || "api",
    occurredAt: cleanText(operationLog.occurredAt ?? operationLog.occurred_at) || new Date().toISOString(),
    createdAt: cleanText(operationLog.createdAt ?? operationLog.created_at) || new Date().toISOString(),
  };
}

function upsertManyById(currentItems, records, options = {}) {
  const byId = new Map((Array.isArray(currentItems) ? currentItems : []).map((item) => [cleanText(item?.id), item]));
  const preserveExistingFields = Array.isArray(options.preserveExistingFields) ? options.preserveExistingFields : [];
  let insertedCount = 0;
  let updatedCount = 0;
  for (const record of records) {
    const id = cleanText(record.id);
    if (byId.has(id)) updatedCount += 1;
    else insertedCount += 1;
    const existing = byId.get(id);
    const next = { ...(existing ?? {}), ...record };
    if (existing) {
      for (const field of preserveExistingFields) next[field] = existing[field];
    }
    byId.set(id, next);
  }
  return {
    items: [...byId.values()],
    insertedCount,
    updatedCount,
  };
}

function toInventoryUiRecord(record) {
  const parts = cleanText(record.inventoryKey).split("|");
  return {
    id: record.id,
    size: record.size,
    color: parts[1] || record.standardColorId,
    handle: record.handleType,
    style: record.style,
    zone: record.zone,
    state: record.inventoryState,
    inStock: record.onHandQty,
    reserved: record.reservedQty,
    locked: record.waitingPickupLockedQty,
    pending: record.pendingHandlingQty,
    estimated: record.trustLevel !== "已清点",
  };
}

function snapshotWorkspace(workspace = {}) {
  return Object.fromEntries(rollbackWorkspaceKeys.map((key) => [key, cloneValue(workspace[key])]));
}

function restoreWorkspace(workspace = {}, snapshot = {}) {
  for (const key of rollbackWorkspaceKeys) {
    if (snapshot[key] === undefined) delete workspace[key];
    else workspace[key] = cloneValue(snapshot[key]);
  }
}

function upsertOperationLog(workspace = {}, operationLog) {
  if (!operationLog?.id) return;
  const logs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
  workspace.operationLogs = [operationLog, ...logs.filter((log) => cleanText(log?.id) !== cleanText(operationLog.id))];
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function hasRequiredValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return cleanText(value) !== "";
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeTextArray(values) {
  return (Array.isArray(values) ? values : []).map(cleanText).filter(Boolean);
}

function toFiniteInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function toFiniteNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function timestampParameter(value, parameters) {
  const text = cleanText(value);
  return text ? parameters.timestamp(text) : "now()";
}

function nullableDateParameter(value, parameters) {
  const text = cleanText(value);
  return text ? `${parameters.text(text)}::date` : "NULL";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
