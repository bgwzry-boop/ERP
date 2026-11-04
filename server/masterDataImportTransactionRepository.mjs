import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
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
  if (mode === "local" || mode === "local_transaction") return createLocalMasterDataImportTransactionRepository(options);
  throw new Error(`Unsupported master data import transaction repository mode: ${mode}`);
}

export function createLocalMasterDataImportTransactionRepository(options = {}) {
  const colourPath = join(options.storageRoot ?? process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage"), "metadata", "supplier-colour-mappings.json");
  return {
    loadSupplierColourState() {
      if (!existsSync(colourPath)) return null;
      const state = JSON.parse(readFileSync(colourPath, "utf8"));
      if (state.version !== 1 || !Array.isArray(state.standardColors) || !Array.isArray(state.colorAliases) || !Array.isArray(state.operationLogs)) throw new Error("Invalid persisted supplier colour state");
      return state;
    },
    kind: "local_memory",

    // 负责人 2026-11-04：首次送到时把司机手机定位记到这个客户地址上；已有定位不覆盖。
    async recordCustomerAddressLocation(input = {}) {
      const location = normalizeAddressLocation(input);
      const fulfillment = (input.workspace?.fulfillments ?? []).find((row) => (row.id ?? row.fulfillmentId) === location.fulfillmentId);
      if (!fulfillment) return { recorded: false, reason: "fulfillment_not_found" };
      const customerId = String(fulfillment.customerId ?? "").trim();
      const addresses = (input.workspace.customerAddresses ??= []);
      const pick = locationTargetAddress(addresses.filter((row) => (row.customerId ?? row.customer_id) === customerId), fulfillment.customerSnapshot);
      if (!pick) return { recorded: false, reason: "address_not_found" };
      if (pick.latitude != null && pick.longitude != null) return { recorded: false, reason: "already_located", addressId: pick.id ?? pick.addressId };
      Object.assign(pick, { latitude: location.latitude, longitude: location.longitude, locationCapturedAt: location.capturedAt,
        locationSource: "driver_delivery", locationFulfillmentId: location.fulfillmentId });
      for (const customer of input.workspace.customers ?? []) {
        for (const address of customer.addresses ?? []) {
          if ((address.addressId ?? address.id) === (pick.id ?? pick.addressId)) Object.assign(address, { latitude: location.latitude, longitude: location.longitude, locationCapturedAt: location.capturedAt });
        }
      }
      if (input.operationLog) (input.workspace.operationLogs ??= []).push(input.operationLog);
      return { recorded: true, addressId: pick.id ?? pick.addressId };
    },

    // 负责人 2026-11-04：客户资料可编辑——名称、简称、结算周期、默认联系人和电话。
    async updateCustomerProfile(input = {}) {
      const change = normalizeProfileChange(input);
      const customer = (input.workspace.customers ?? []).find((row) => (row.id ?? row.customerId) === change.customerId);
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      const contacts = (input.workspace.customerContacts ??= []);
      const contact = contacts.filter((row) => (row.customerId ?? row.customer_id) === change.customerId)
        .sort((a, b) => Number(b.isDefault === true) - Number(a.isDefault === true))[0] ?? null;
      const current = { name: customer.name ?? "", shortName: customer.shortName || customer.name || "", settlementCycle: customer.settlementCycle || customer.cycle || "未设置",
        contactName: contact?.contactName ?? contact?.name ?? customer.contact ?? "", phone: contact?.phone ?? customer.phone ?? "" };
      if (Object.keys(change.expected).some((key) => String(current[key] ?? "").trim() !== change.expected[key])) throw new Error("CUSTOMER_PROFILE_CHANGED");
      if (change.name !== null) customer.name = change.name;
      if (change.shortName !== null) customer.shortName = change.shortName;
      if (change.settlementCycle !== null) { customer.settlementCycle = change.settlementCycle; customer.cycle = change.settlementCycle; }
      if (change.contactName !== null || change.phone !== null) {
        if (contact) {
          if (change.contactName !== null) { contact.contactName = change.contactName; contact.name = change.contactName; }
          if (change.phone !== null) contact.phone = change.phone;
        } else {
          contacts.push({ id: change.newContactId, customerId: change.customerId, contactName: change.contactName ?? "", name: change.contactName ?? "", phone: change.phone ?? "", isDefault: true });
        }
        if (change.contactName !== null) customer.contact = change.contactName;
        if (change.phone !== null) customer.phone = change.phone;
      }
      if (input.operationLog) (input.workspace.operationLogs ??= []).push(input.operationLog);
      return { profile: { customerId: change.customerId, name: customer.name, shortName: customer.shortName ?? "", settlementCycle: customer.settlementCycle ?? "",
        contactName: customer.contact ?? "", phone: customer.phone ?? "" } };
    },

    // 负责人 2026-11-04：客户资料可编辑。改地址文字、设默认、清除定位；按编辑前快照防并发覆盖。
    async updateCustomerAddress(input = {}) {
      const change = normalizeAddressChange(input);
      const addresses = (input.workspace.customerAddresses ??= []);
      let target = addresses.find((row) => (row.id ?? row.addressId) === change.addressId && (row.customerId ?? row.customer_id) === change.customerId);
      if (!target) {
        // An address that so far only lives on the customer record moves into the address list.
        const owner = (input.workspace.customers ?? []).find((customer) => (customer.id ?? customer.customerId) === change.customerId);
        const embedded = (owner?.addresses ?? []).find((row) => (row.addressId ?? row.id) === change.addressId);
        if (embedded) { target = { ...embedded, id: change.addressId, customerId: change.customerId }; addresses.push(target); }
      }
      if (!target) throw new Error("CUSTOMER_ADDRESS_NOT_FOUND");
      if (!addressMatchesExpected(target, change.expected)) throw new Error("CUSTOMER_ADDRESS_CHANGED");
      if (change.address !== null) target.address = change.address;
      if (change.remark !== null) target.remark = change.remark;
      if (change.clearLocation) Object.assign(target, { latitude: null, longitude: null, locationCapturedAt: "", locationSource: "", locationFulfillmentId: "" });
      if (change.makeDefault) for (const row of addresses) if ((row.customerId ?? row.customer_id) === change.customerId) row.isDefault = row === target;
      for (const customer of input.workspace.customers ?? []) {
        if ((customer.id ?? customer.customerId) !== change.customerId || !Array.isArray(customer.addresses)) continue;
        customer.addresses = customer.addresses.filter((row) => (row.addressId ?? row.id) !== change.addressId);
        if (change.makeDefault) customer.addresses = customer.addresses.map((row) => ({ ...row, isDefault: false }));
      }
      if (input.operationLog) (input.workspace.operationLogs ??= []).push(input.operationLog);
      return { address: projectAddress(target) };
    },

    async applyImportExecution(input) {
      assertExecutionCanBeWritten(input.importExecution);
      if (input.operationLog?.targetType === "raw_material_supplier_color_mapping") {
        const current = (input.workspace.colorAliases ?? []).find(row => row.id === input.operationLog.targetId) ?? null;
        const expected = input.supplierColourExpected;
        const fields = ["id", "alias", "standardColorId", "sourceType", "sourceId", "enabled", "updatedAt"];
        if (expected === undefined || Boolean(current) !== Boolean(expected) || (current && fields.some(key => current[key] !== expected[key]))) {
          throw new Error("RAW_MATERIAL_COLOR_MAPPING_SNAPSHOT_CONFLICT");
        }
      }
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
        if (input.operationLog?.targetType === "raw_material_supplier_color_mapping") {
          const state = {
            version: 1,
            standardColors: input.workspace.standardColors,
            colorAliases: input.workspace.colorAliases,
            operationLogs: input.workspace.operationLogs.filter(log => log.targetType === "raw_material_supplier_color_mapping"),
          };
          mkdirSync(dirname(colourPath), { recursive: true, mode: 0o700 });
          writeFileSync(`${colourPath}.tmp`, JSON.stringify(state), { mode: 0o600 });
          renameSync(`${colourPath}.tmp`, colourPath);
        }
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
  // Release review 2026-11-04: two people setting different addresses of one customer as the
  // default at the same moment both succeeded. Every edit of one customer's addresses or
  // profile now takes the same per-customer lock before its statement snapshot is taken.
  const queryJsonForCustomer = (customerId, text, values) => options.queryJson
    ? options.queryJson(text, values, { resourceLocks: [customerEditLockKey(customerId)] })
    : postgresClient.transactionJson(text, values, { resourceLocks: [customerEditLockKey(customerId)] });

  return {
    kind: "postgres",

    async updateCustomerProfile(input = {}) {
      const change = normalizeProfileChange(input);
      const builtQuery = buildUpdateCustomerProfileQuery(change, input.operationLog);
      let result;
      try {
        result = await queryJsonForCustomer(change.customerId, builtQuery.text, builtQuery.values);
      } catch (error) {
        if (String(error?.message).includes("CUSTOMER_PROFILE_CHANGED")) throw new Error("CUSTOMER_PROFILE_CHANGED");
        throw error;
      }
      const row = Array.isArray(result) ? result[0] : result;
      if (!row?.profile) throw new Error("CUSTOMER_NOT_FOUND");
      return { profile: row.profile };
    },

    async updateCustomerAddress(input = {}) {
      const change = normalizeAddressChange(input);
      const builtQuery = buildUpdateCustomerAddressQuery(change, input.operationLog);
      let result;
      try {
        result = await queryJsonForCustomer(change.customerId, builtQuery.text, builtQuery.values);
      } catch (error) {
        if (String(error?.message).includes("CUSTOMER_ADDRESS_CHANGED")) throw new Error("CUSTOMER_ADDRESS_CHANGED");
        throw error;
      }
      const row = Array.isArray(result) ? result[0] : result;
      if (!row?.address) throw new Error("CUSTOMER_ADDRESS_NOT_FOUND");
      return { address: row.address };
    },

    async recordCustomerAddressLocation(input = {}) {
      const location = normalizeAddressLocation(input);
      const builtQuery = buildRecordCustomerAddressLocationQuery(location, input.operationLog);
      const result = await queryJson(builtQuery.text, builtQuery.values);
      const row = Array.isArray(result) ? result[0] : result;
      return row?.addressId ? { recorded: true, addressId: row.addressId } : { recorded: false, reason: "not_updated" };
    },

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
        await (options.queryJson
          ? queryJson(builtQuery.text, builtQuery.values)
          : postgresClient.transactionStatementsJson(builtQuery.statements)),
      );
      const writeSummary = {
        ...summarizeTargetRecords(normalizedRecords),
        ...rawResult.summary,
        repositoryKind: "postgres",
      };
      applyTargetRecordsToWorkspace(input.workspace, normalizedRecords);
      if (rawResult.supplierColourAlias) {
        const index = input.workspace.colorAliases.findIndex(row => row.id === rawResult.supplierColourAlias.id);
        if (index >= 0) input.workspace.colorAliases[index] = rawResult.supplierColourAlias;
      }
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
  const colourGuard = buildSupplierColourTransactionGuard(input, parameters);
  const insertStatements = recordTypeWriteOrder
    .map((recordType) => buildInsertRecordsSql(recordType, targetRecords[recordType] ?? [], operationLog.operatorId, parameters))
    .filter(Boolean);

  const colourResult = input.operationLog?.targetType === "raw_material_supplier_color_mapping"
    ? `, 'supplierColourAlias', (SELECT json_build_object('id', id, 'alias', alias, 'standardColorId', standard_color_id, 'sourceType', source_type, 'sourceId', source_id, 'enabled', enabled, 'createdBy', created_by, 'createdAt', created_at, 'updatedAt', updated_at) FROM color_aliases WHERE id = ${parameters.text(input.operationLog.targetId)})`
    : "";
  const resultStatement = `SELECT json_build_object(
  'executionId', ${parameters.text(input.importExecution.executionId)},
  'status', 'committed',
  'recordCount', ${parameters.integer(summary.appliedRecordCount)},
  'affectedTableCount', ${parameters.integer(summary.affectedTableCount)},
  'operationLogId', ${parameters.text(operationLog.id)}${colourResult}
) AS result;`;
  const parts = [...colourGuard, ...insertStatements, buildInsertOperationLogSql(operationLog, parameters), resultStatement];
  const statements = parts.map(text => {
    const values = [];
    const indexes = new Map();
    const boundText = text.replace(/\$(\d+)/g, (_, value) => {
      const index = Number(value);
      if (!indexes.has(index)) { indexes.set(index, values.length + 1); values.push(parameters.values[index - 1]); }
      return `$${indexes.get(index)}`;
    });
    return { text: boundText, values };
  });
  return { text: `BEGIN;\n${parts.join("\n")}\nCOMMIT;`, values: parameters.values, statements };
}

function buildSupplierColourTransactionGuard(input, parameters) {
  if (input.operationLog?.targetType !== "raw_material_supplier_color_mapping") return [];
  if (input.supplierColourExpected === undefined) throw new Error("RAW_MATERIAL_COLOR_MAPPING_SNAPSHOT_CONFLICT");
  const expected = input.supplierColourExpected;
  const id = parameters.text(input.operationLog.targetId);
  const predicate = expected
    ? `EXISTS (SELECT 1 FROM color_aliases WHERE id = ${id}
        AND alias = ${parameters.text(expected.alias)}
        AND standard_color_id = ${parameters.text(expected.standardColorId)}
        AND source_type = ${parameters.text(expected.sourceType)}
        AND source_id = ${parameters.text(expected.sourceId)}
        AND enabled = ${parameters.boolean(expected.enabled !== false)}
        AND updated_at = ${parameters.text(expected.updatedAt)}::timestamptz)`
    : `NOT EXISTS (SELECT 1 FROM color_aliases WHERE id = ${id})`;
  return [`LOCK TABLE color_aliases IN SHARE ROW EXCLUSIVE MODE;`, `CREATE TEMP TABLE supplier_colour_precondition (
  matched boolean NOT NULL CONSTRAINT supplier_colour_snapshot_conflict CHECK (matched)
 ) ON COMMIT DROP;`, `INSERT INTO supplier_colour_precondition (matched) SELECT ${predicate};`];
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
    supplierColourAlias: value.supplierColourAlias ?? null,
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

function normalizeAddressLocation(input = {}) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const fulfillmentId = String(input.fulfillmentId ?? "").trim();
  if (!fulfillmentId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || (latitude === 0 && longitude === 0)) throw new Error("CUSTOMER_ADDRESS_LOCATION_INVALID");
  return { fulfillmentId, latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6,
    capturedAt: String(input.capturedAt ?? new Date().toISOString()) };
}

// The address frozen on the delivery, or the customer's default address for an older delivery.
function locationTargetAddress(addresses, customerSnapshot = {}) {
  const chosenId = String(customerSnapshot?.deliveryAddressId ?? "").trim();
  if (chosenId) return addresses.find((row) => (row.id ?? row.addressId) === chosenId) ?? null;
  if (String(customerSnapshot?.deliveryAddressSource ?? "") === "order_one_off") return null;
  return addresses.find((row) => row.isDefault === true || row.is_default === true) ?? addresses[0] ?? null;
}

export function buildRecordCustomerAddressLocationQuery(location, operationLog) {
  const values = [location.fulfillmentId, location.latitude, location.longitude, location.capturedAt];
  return {
    text: `
WITH delivery AS (
  SELECT id, customer_id, customer_snapshot FROM fulfillment_records WHERE id = $1
),
target AS (
  SELECT address.id FROM customer_addresses AS address, delivery
  WHERE address.customer_id = delivery.customer_id
    AND COALESCE(delivery.customer_snapshot->>'deliveryAddressSource', '') <> 'order_one_off'
    AND (
      address.id = NULLIF(delivery.customer_snapshot->>'deliveryAddressId', '')
      OR (NULLIF(delivery.customer_snapshot->>'deliveryAddressId', '') IS NULL AND address.id = (
        SELECT fallback.id FROM customer_addresses AS fallback WHERE fallback.customer_id = delivery.customer_id
        ORDER BY fallback.is_default DESC, fallback.created_at ASC, fallback.id ASC LIMIT 1))
    )
  LIMIT 1
),
updated AS (
  UPDATE customer_addresses AS address
  SET latitude = $2::numeric, longitude = $3::numeric, location_captured_at = $4::timestamptz,
      location_source = 'driver_delivery', location_fulfillment_id = $1, updated_at = now()
  FROM target
  WHERE address.id = target.id AND address.latitude IS NULL AND address.longitude IS NULL
  RETURNING address.id
)
SELECT json_build_object('addressId', (SELECT id FROM updated)) AS result;`.trim(),
    values,
  };
}

function normalizeAddressChange(input = {}) {
  const text = (value) => value === undefined || value === null ? null : String(value).replace(/\s+/gu, " ").trim();
  return {
    customerId: String(input.customerId ?? "").trim(),
    addressId: String(input.addressId ?? "").trim(),
    address: text(input.address),
    remark: text(input.remark),
    makeDefault: input.makeDefault === true,
    clearLocation: input.clearLocation === true,
    expected: {
      address: String(input.expected?.address ?? "").trim(),
      isDefault: input.expected?.isDefault === true,
      located: input.expected?.located === true,
    },
  };
}

function addressMatchesExpected(row, expected) {
  const located = row.latitude != null && row.longitude != null;
  return String(row.address ?? "").trim() === expected.address
    && (row.isDefault === true || row.is_default === true) === expected.isDefault
    && located === expected.located;
}

function projectAddress(row) {
  return { addressId: row.id ?? row.addressId, address: row.address, area: row.area ?? "", isDefault: row.isDefault === true,
    remark: row.remark ?? "", located: row.latitude != null && row.longitude != null };
}

export function buildUpdateCustomerAddressQuery(change, operationLog = {}) {
  const values = [change.addressId, change.customerId, change.address, change.remark, change.makeDefault, change.clearLocation,
    change.expected.address, change.expected.isDefault, change.expected.located,
    operationLog.id ?? "", JSON.stringify(operationLog.before ?? null), JSON.stringify(operationLog.after ?? null),
    String(operationLog.reason ?? ""), operationLog.operatorId ?? null];
  return {
    text: `
WITH target AS MATERIALIZED (
  SELECT id, address, is_default, latitude, longitude FROM customer_addresses WHERE id = $1 AND customer_id = $2 FOR UPDATE
),
guard AS MATERIALIZED (
  SELECT erp_require(EXISTS (SELECT 1 FROM target WHERE BTRIM(address) = $7 AND is_default = $8::boolean
    AND ((latitude IS NOT NULL AND longitude IS NOT NULL) = $9::boolean)), 'CUSTOMER_ADDRESS_CHANGED') AS ok
),
updated AS (
  UPDATE customer_addresses AS address SET
    address = COALESCE($3::text, address.address),
    remark = COALESCE($4::text, address.remark),
    is_default = CASE WHEN $5::boolean THEN true ELSE address.is_default END,
    latitude = CASE WHEN $6::boolean THEN NULL ELSE address.latitude END,
    longitude = CASE WHEN $6::boolean THEN NULL ELSE address.longitude END,
    location_captured_at = CASE WHEN $6::boolean THEN NULL ELSE address.location_captured_at END,
    location_source = CASE WHEN $6::boolean THEN NULL ELSE address.location_source END,
    location_fulfillment_id = CASE WHEN $6::boolean THEN NULL ELSE address.location_fulfillment_id END,
    updated_at = now()
  FROM guard
  WHERE address.id = $1 AND address.customer_id = $2 AND guard.ok
  RETURNING address.*
),
other_defaults AS (
  UPDATE customer_addresses SET is_default = false, updated_at = now()
  WHERE customer_id = $2 AND id <> $1 AND $5::boolean AND is_default AND EXISTS (SELECT 1 FROM updated)
  RETURNING id
),
logged AS (
  INSERT INTO operation_logs (id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at)
  SELECT $10, 'customer', $2, 'update_customer_delivery_address', $11::jsonb, $12::jsonb, $13, $14, 'customer', now(), now()
  WHERE $10 <> '' AND EXISTS (SELECT 1 FROM updated)
  RETURNING id
)
SELECT json_build_object('address', (SELECT json_build_object('addressId', id, 'address', address, 'area', COALESCE(area, ''),
  'isDefault', is_default, 'remark', COALESCE(remark, ''), 'located', latitude IS NOT NULL AND longitude IS NOT NULL) FROM updated),
  'clearedDefaults', (SELECT count(*) FROM other_defaults), 'operationLogId', (SELECT id FROM logged)) AS result;`.trim(),
    values,
  };
}

function normalizeProfileChange(input = {}) {
  const text = (value) => value === undefined || value === null ? null : String(value).replace(/\s+/gu, " ").trim();
  const expected = input.expected ?? {};
  return {
    customerId: String(input.customerId ?? "").trim(),
    name: text(input.name),
    shortName: text(input.shortName),
    settlementCycle: text(input.settlementCycle),
    contactName: text(input.contactName),
    phone: text(input.phone),
    newContactId: String(input.newContactId ?? "").trim(),
    expected: Object.fromEntries(["name", "shortName", "settlementCycle", "contactName", "phone"].map((key) => [key, String(expected[key] ?? "").trim()])),
  };
}

export function buildUpdateCustomerProfileQuery(change, operationLog = {}) {
  const values = [change.customerId, change.name, change.shortName, change.settlementCycle, change.contactName, change.phone,
    change.expected.name, change.expected.shortName, change.expected.settlementCycle, change.expected.contactName, change.expected.phone,
    change.newContactId, operationLog.id ?? "", JSON.stringify(operationLog.before ?? null), JSON.stringify(operationLog.after ?? null),
    String(operationLog.reason ?? ""), operationLog.operatorId ?? null];
  return {
    text: `
WITH target AS MATERIALIZED (
  SELECT id, name, short_name, settlement_cycle FROM customers WHERE id = $1 FOR UPDATE
),
contact AS MATERIALIZED (
  SELECT id, contact_name, phone FROM customer_contacts WHERE customer_id = $1
  ORDER BY is_default DESC, created_at ASC, id ASC LIMIT 1 FOR UPDATE
),
guard AS MATERIALIZED (
  SELECT erp_require(EXISTS (SELECT 1 FROM target WHERE BTRIM(name) = $7 AND BTRIM(COALESCE(short_name, name)) = $8 AND BTRIM(settlement_cycle) = $9)
    AND BTRIM(COALESCE((SELECT contact_name FROM contact), '')) = $10 AND BTRIM(COALESCE((SELECT phone FROM contact), '')) = $11,
    'CUSTOMER_PROFILE_CHANGED') AS ok
),
updated_customer AS (
  UPDATE customers AS customer SET
    name = COALESCE($2::text, customer.name),
    short_name = COALESCE($3::text, customer.short_name),
    settlement_cycle = COALESCE($4::text, customer.settlement_cycle),
    updated_at = now()
  FROM guard WHERE customer.id = $1 AND guard.ok
  RETURNING customer.id, customer.name, customer.short_name, customer.settlement_cycle
),
updated_contact AS (
  UPDATE customer_contacts AS item SET
    contact_name = COALESCE($5::text, item.contact_name),
    phone = COALESCE($6::text, item.phone),
    updated_at = now()
  FROM guard WHERE item.id = (SELECT id FROM contact) AND guard.ok AND ($5::text IS NOT NULL OR $6::text IS NOT NULL)
  RETURNING item.contact_name, item.phone
),
inserted_contact AS (
  INSERT INTO customer_contacts (id, customer_id, contact_name, phone, is_default)
  SELECT $12, $1, $5::text, $6::text, true FROM guard
  WHERE guard.ok AND $12 <> '' AND NOT EXISTS (SELECT 1 FROM contact) AND ($5::text IS NOT NULL OR $6::text IS NOT NULL)
  RETURNING contact_name, phone
),
logged AS (
  INSERT INTO operation_logs (id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at)
  SELECT $13, 'customer', $1, 'update_customer_profile', $14::jsonb, $15::jsonb, $16, $17, 'customer', now(), now()
  WHERE $13 <> '' AND EXISTS (SELECT 1 FROM updated_customer)
  RETURNING id
)
SELECT json_build_object('profile', (SELECT json_build_object('customerId', id, 'name', name, 'shortName', COALESCE(short_name, name),
  'settlementCycle', settlement_cycle,
  'contactName', COALESCE((SELECT contact_name FROM updated_contact), (SELECT contact_name FROM inserted_contact), (SELECT contact_name FROM contact), ''),
  'phone', COALESCE((SELECT phone FROM updated_contact), (SELECT phone FROM inserted_contact), (SELECT phone FROM contact), '')) FROM updated_customer),
  'operationLogId', (SELECT id FROM logged)) AS result;`.trim(),
    values,
  };
}

export function customerEditLockKey(customerId) {
  return `customer-master-data:${String(customerId ?? "").trim()}`;
}
