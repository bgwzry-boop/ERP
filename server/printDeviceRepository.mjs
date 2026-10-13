import { resolveStoreMode } from "./storeMode.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export const printDeviceStoreKey = "metadata/print-devices.json";

export function createPrintDeviceRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_PRINT_DEVICE_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresPrintDeviceRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_PRINT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalPrintDeviceRepository({
      storageRoot: options.storageRoot,
    });
  }
  throw new Error(`Unsupported print device repository mode: ${mode}`);
}

export function createLocalPrintDeviceRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentPrintDeviceState(storageRoot);
    },

    upsertPrintDevice({ workspace, printDevice, operationLog }) {
      const device = normalizePrintDeviceRecord(printDevice);
      if (!device) throw new Error("Invalid print device");
      applyPrintDeviceWorkspaceMutation({ workspace, printDevice: device, operationLog });
      persistPersistentPrintDeviceState(storageRoot, workspace);
      return {
        printDevice: device,
        operationLogId: operationLog?.id ?? "",
      };
    },

    listPrintDevices({ workspace, filters = {} }) {
      return filterPrintDevices(workspace.printDevices, filters);
    },

    getDefaultPrintDevice({ workspace, documentType }) {
      return findDefaultPrintDevice(workspace.printDevices, documentType);
    },
  };
}

export function createPostgresPrintDeviceRepository(options = {}) {
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async loadState() {
      const query = buildListPrintDevicesQuery({});
      return {
        printDevices: normalizePrintDevices(await queryJson(query.text, query.values)),
      };
    },

    async upsertPrintDevice({ workspace, printDevice, operationLog, idempotencyKey, idempotencyPayload }) {
      const query = buildUpsertPrintDeviceTransactionQuery({ printDevice, operationLog });
      const saved = normalizePrintDeviceTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `print.device.upsert.${printDevice?.printDeviceId ?? printDevice?.id ?? "unknown"}`,
            idempotencyKey: resolveRepositoryIdempotencyKey(idempotencyKey, operationLog?.id),
            payload: idempotencyPayload ?? { printDevice, action: operationLog?.action },
            operatorId: operationLog?.operatorId,
            targetType: "print_device",
            targetId: printDevice?.printDeviceId ?? printDevice?.id,
            resourceLocks: [`print-device:${printDevice?.printDeviceId ?? printDevice?.id ?? ""}`],
            query,
          }),
        ),
      );
      if (!saved.printDevice) throw new Error("PostgreSQL print device upsert returned an invalid record");
      applyPrintDeviceWorkspaceMutation({
        workspace,
        printDevice: saved.printDevice,
        operationLog: saved.operationLogId === operationLog?.id ? operationLog : null,
      });
      return saved;
    },

    async listPrintDevices({ filters = {} }) {
      const query = buildListPrintDevicesQuery(filters);
      return normalizePrintDevices(await queryJson(query.text, query.values));
    },

    async getDefaultPrintDevice({ documentType }) {
      const query = buildListPrintDevicesQuery({ documentType, status: "active" });
      const items = normalizePrintDevices(await queryJson(query.text, query.values));
      return findDefaultPrintDevice(items, documentType);
    },
  };
}

export function buildUpsertPrintDeviceTransactionSql(input) {
  return buildUpsertPrintDeviceTransactionQuery(input).text;
}

export function buildUpsertPrintDeviceTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildUpsertPrintDeviceTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildUpsertPrintDeviceTransactionText(input, parameters) {
  const device = normalizePrintDeviceRecord(input.printDevice);
  if (!device) throw new Error("Print device is required for persistence");
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  const expectedRevision = Math.max(0, Number(device.revision) || 0);
  return `
BEGIN;
WITH locked_device AS MATERIALIZED (
  SELECT id, revision
  FROM printer_devices
  WHERE id = ${parameters.text(device.printDeviceId)}
  FOR UPDATE
),
upserted_device AS (
  INSERT INTO printer_devices (
    id,
    biz_no,
    name,
    device_type,
    status,
    connection_type,
    connection_uri,
    driver_name,
    supported_document_types,
    default_document_types,
    paper_width_mm,
    paper_height_mm,
    paper_name,
    is_continuous,
    dpi,
    default_copies,
    darkness,
    speed,
    cutter_enabled,
    settings_json,
    created_by,
    updated_by,
    revision,
    created_at,
    updated_at
  )
  SELECT
    ${parameters.text(device.printDeviceId)},
    ${parameters.text(device.bizNo)},
    ${parameters.text(device.name)},
    ${parameters.text(device.deviceType)},
    ${parameters.text(device.status)},
    ${parameters.text(device.connectionType)},
    ${parameters.nullableText(device.connectionUri)},
    ${parameters.nullableText(device.driverName)},
    ${parameters.textArray(device.supportedDocumentTypes)},
    ${parameters.textArray(device.defaultDocumentTypes)},
    ${parameters.number(device.paperWidthMm)},
    ${parameters.number(device.paperHeightMm)},
    ${parameters.nullableText(device.paperName)},
    ${parameters.boolean(device.isContinuous)},
    ${parameters.integer(device.dpi)},
    ${parameters.integer(device.defaultCopies)},
    ${parameters.integer(device.darkness)},
    ${parameters.integer(device.speed)},
    ${parameters.boolean(device.cutterEnabled)},
    ${parameters.json(device.settings)},
    ${parameters.nullableText(device.createdBy)},
    ${parameters.nullableText(device.updatedBy)},
    1,
    ${parameters.timestamp(device.createdAt)},
    ${parameters.timestamp(device.updatedAt)}
  WHERE ${parameters.integer(expectedRevision)} = 0
    OR EXISTS (SELECT 1 FROM locked_device WHERE revision = ${parameters.integer(expectedRevision)})
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    device_type = EXCLUDED.device_type,
    status = EXCLUDED.status,
    connection_type = EXCLUDED.connection_type,
    connection_uri = EXCLUDED.connection_uri,
    driver_name = EXCLUDED.driver_name,
    supported_document_types = EXCLUDED.supported_document_types,
    default_document_types = EXCLUDED.default_document_types,
    paper_width_mm = EXCLUDED.paper_width_mm,
    paper_height_mm = EXCLUDED.paper_height_mm,
    paper_name = EXCLUDED.paper_name,
    is_continuous = EXCLUDED.is_continuous,
    dpi = EXCLUDED.dpi,
    default_copies = EXCLUDED.default_copies,
    darkness = EXCLUDED.darkness,
    speed = EXCLUDED.speed,
    cutter_enabled = EXCLUDED.cutter_enabled,
    settings_json = EXCLUDED.settings_json,
    updated_by = EXCLUDED.updated_by,
    revision = printer_devices.revision + 1,
    updated_at = EXCLUDED.updated_at
  WHERE printer_devices.revision = ${parameters.integer(expectedRevision)}
  RETURNING ${printDeviceJsonExpression("printer_devices")} AS result
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
),
print_device_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM upserted_device) = 1,
    'ERP_PRINT_DEVICE_CONCURRENCY_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'printDevice', (SELECT result FROM upserted_device),
  'operationLogId', COALESCE((SELECT id FROM inserted_operation_log), ''),
  'writeGuard', (SELECT ok FROM print_device_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function buildListPrintDevicesSql(filters = {}) {
  return buildListPrintDevicesQuery(filters).text;
}

export function buildListPrintDevicesQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildPrintDeviceWhereClause(filters, parameters);
  const documentType = parameters.nullableText(filters.documentType);
  const limit = parameters.integer(normalizePrintDeviceLimit(filters.limit ?? 200));
  return {
    text: `
SELECT COALESCE(json_agg(record), '[]'::json) AS result
FROM (
  SELECT ${printDeviceJsonExpression("printer_devices")} AS record
  FROM printer_devices
  ${where}
  ORDER BY
    CASE WHEN ${documentType} = ANY(default_document_types) THEN 0 ELSE 1 END,
    name ASC,
    id ASC
  LIMIT ${limit}
) AS ordered_print_devices;
`.trim(),
    values: parameters.values,
  };
}

export function normalizePrintDeviceTransactionResult(value) {
  if (!value || typeof value !== "object") return { printDevice: null, operationLogId: "" };
  return {
    printDevice: normalizePrintDeviceRecord(value.printDevice ?? value.print_device),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizePrintDevices(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizePrintDeviceRecord(item)).filter(Boolean);
}

export function normalizePrintDeviceRecord(device) {
  if (!device || typeof device !== "object") return null;
  const printDeviceId = String(device.printDeviceId ?? device.print_device_id ?? device.id ?? "").trim();
  if (!printDeviceId) return null;
  const name = String(device.name ?? "").trim() || printDeviceId;
  const updatedAt = device.updatedAt ?? device.updated_at ?? new Date().toISOString();
  const createdAt = device.createdAt ?? device.created_at ?? updatedAt;
  return {
    printDeviceId,
    bizNo: String(device.bizNo ?? device.biz_no ?? printDeviceId).trim() || printDeviceId,
    name,
    deviceType: normalizeDeviceType(device.deviceType ?? device.device_type),
    status: normalizeStatus(device.status),
    connectionType: normalizeConnectionType(device.connectionType ?? device.connection_type),
    connectionUri: String(device.connectionUri ?? device.connection_uri ?? "").trim(),
    driverName: String(device.driverName ?? device.driver_name ?? "").trim(),
    supportedDocumentTypes: normalizeStringList(device.supportedDocumentTypes ?? device.supported_document_types, [
      "express_ltl_label",
    ]),
    defaultDocumentTypes: normalizeStringList(device.defaultDocumentTypes ?? device.default_document_types),
    paperWidthMm: normalizeNumber(device.paperWidthMm ?? device.paper_width_mm, 80),
    paperHeightMm: normalizeNumber(device.paperHeightMm ?? device.paper_height_mm, 60),
    paperName: String(device.paperName ?? device.paper_name ?? "").trim(),
    isContinuous: Boolean(device.isContinuous ?? device.is_continuous ?? false),
    dpi: normalizeInteger(device.dpi, 203),
    defaultCopies: normalizeInteger(device.defaultCopies ?? device.default_copies, 1),
    darkness: normalizeInteger(device.darkness, 8),
    speed: normalizeInteger(device.speed, 4),
    cutterEnabled: Boolean(device.cutterEnabled ?? device.cutter_enabled ?? false),
    settings: normalizeObject(device.settings ?? device.settings_json),
    createdBy: String(device.createdBy ?? device.created_by ?? "").trim(),
    updatedBy: String(device.updatedBy ?? device.updated_by ?? "").trim(),
    revision: Math.max(0, normalizeInteger(device.revision, 0)),
    createdAt: String(createdAt).trim(),
    updatedAt: String(updatedAt).trim(),
  };
}

export function buildDefaultPrintDevices(now = "2026-07-02T10:30:00.000Z") {
  return normalizePrintDevices([
    {
      printDeviceId: "PRN-LABEL-A",
      bizNo: "PRN-LABEL-A",
      name: "标签机A",
      deviceType: "label_printer",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://label-printer-a",
      driverName: "Generic 203dpi Label",
      supportedDocumentTypes: ["express_ltl_label", "package_label"],
      defaultDocumentTypes: ["express_ltl_label", "package_label"],
      paperWidthMm: 80,
      paperHeightMm: 60,
      paperName: "80x60 热敏标签",
      isContinuous: false,
      dpi: 203,
      defaultCopies: 1,
      darkness: 8,
      speed: 4,
      cutterEnabled: false,
      createdBy: "system",
      updatedBy: "system",
      createdAt: now,
      updatedAt: now,
      settings: {
        driverMode: "preview_only",
        note: "P0 默认标签机参数，后续接真实驱动。",
      },
    },
    {
      printDeviceId: "PRN-DOT-A",
      bizNo: "PRN-DOT-A",
      name: "EPSON LQ-615KII 针式单据打印机",
      deviceType: "dot_matrix",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://epson-lq-615kii",
      driverName: "EPSON LQ-610KII/615KII / ESC-P-K",
      supportedDocumentTypes: ["outbound_note", "pickup_note", "delivery_note", "outbound_slip", "pickup_slip"],
      defaultDocumentTypes: ["outbound_note", "pickup_note", "delivery_note", "outbound_slip", "pickup_slip"],
      paperWidthMm: 241,
      paperHeightMm: 140,
      paperName: "二联二等分连续针式纸",
      isContinuous: true,
      dpi: 180,
      defaultCopies: 2,
      darkness: 0,
      speed: 0,
      cutterEnabled: false,
      createdBy: "system",
      updatedBy: "system",
      createdAt: now,
      updatedAt: now,
      settings: {
        driverMode: "preview_only",
        manufacturer: "EPSON",
        model: "LQ-615KII",
        displayModel: "EPSON LQ-615KII",
        printHeadPins: 24,
        columnsAt10Cpi: 82,
        printMethod: "24针击打式点阵打印",
        controlCodes: ["ESC/P-K", "IBM2390+", "OKI5530SC"],
        interfaces: ["USB2.0 全速", "IEEE-1284 双向并行接口"],
        officialContinuousPaperWidthRangeMm: [101.6, 254],
        officialSingleSheetWidthRangeMm: [90, 257],
        officialPaperThicknessRangeMm: [0.065, 0.32],
        maxCopyParts: 4,
        copyCapability: "1份原件+3份拷贝",
        recommendedCupsQueueName: "epson_lq_615kii_notes",
        hostOperatingSystem: "Windows 11",
        systemPrinterNameKnown: false,
        fieldPaperProfile: "现场二联二等分连续针式纸，当前模板假设 241x140mm，需实测纸宽、纸高、孔距、页顶和左边距。",
        sampleDocumentType: "delivery_note",
        sampleDocumentSource: "2026-07-09 现场成品袋送货单照片样张",
        fieldAlignmentIssueKnown: false,
        sourceUrl: "https://www.epson.com.cn/products/dot/1058/lq-615kii/",
        note: "现场已确认型号、Win11 打印主机、二联二等分连续针式纸和送货单照片样张；仍需确认系统打印机名称/队列名、驱动安装名、连接方式、精确纸张尺寸和对位参数。",
      },
    },
  ]);
}

export function buildPrintDeviceSnapshot(device) {
  const normalized = normalizePrintDeviceRecord(device);
  if (!normalized) return null;
  return {
    printDeviceId: normalized.printDeviceId,
    name: normalized.name,
    deviceType: normalized.deviceType,
    connectionType: normalized.connectionType,
    driverName: normalized.driverName,
    paperWidthMm: normalized.paperWidthMm,
    paperHeightMm: normalized.paperHeightMm,
    paperName: normalized.paperName,
    isContinuous: normalized.isContinuous,
    dpi: normalized.dpi,
    defaultCopies: normalized.defaultCopies,
    darkness: normalized.darkness,
    speed: normalized.speed,
    cutterEnabled: normalized.cutterEnabled,
    settings: normalized.settings,
  };
}

function applyPrintDeviceWorkspaceMutation({ workspace, printDevice, operationLog }) {
  workspace.printDevices = upsertById(workspace.printDevices ?? [], printDevice, (item) => item.printDeviceId);
  if (operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], operationLog, (item) => item.id);
  }
}

function loadPersistentPrintDeviceState(storageRoot) {
  const filePath = join(storageRoot, printDeviceStoreKey);
  if (!existsSync(filePath)) return { printDevices: buildDefaultPrintDevices() };
  try {
    const json = JSON.parse(readFileSync(filePath, "utf8"));
    const printDevices = normalizePrintDevices(json?.printDevices);
    return {
      printDevices: printDevices.length ? printDevices : buildDefaultPrintDevices(),
    };
  } catch {
    return { printDevices: buildDefaultPrintDevices() };
  }
}

function persistPersistentPrintDeviceState(storageRoot, workspace) {
  const filePath = join(storageRoot, printDeviceStoreKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        printDevices: normalizePrintDevices(workspace.printDevices),
      },
      null,
      2,
    )}\n`,
  );
}

export function filterPrintDevices(devices, filters = {}) {
  let items = normalizePrintDevices(Array.isArray(devices) ? devices : []);
  if (filters.status) items = items.filter((item) => item.status === filters.status);
  if (filters.deviceType) items = items.filter((item) => item.deviceType === filters.deviceType);
  if (filters.documentType) {
    items = items.filter(
      (item) =>
        item.supportedDocumentTypes.includes(filters.documentType) ||
        item.defaultDocumentTypes.includes(filters.documentType),
    );
  }
  return items.sort((left, right) => {
    const leftDefault = filters.documentType && left.defaultDocumentTypes.includes(filters.documentType) ? 0 : 1;
    const rightDefault = filters.documentType && right.defaultDocumentTypes.includes(filters.documentType) ? 0 : 1;
    return leftDefault - rightDefault || left.name.localeCompare(right.name) || left.printDeviceId.localeCompare(right.printDeviceId);
  });
}

export function findDefaultPrintDevice(devices, documentType) {
  const items = filterPrintDevices(devices, { documentType, status: "active" });
  return items.find((item) => item.defaultDocumentTypes.includes(documentType)) ?? items[0] ?? null;
}

function buildPrintDeviceWhereClause(filters = {}, parameters) {
  const clauses = [];
  if (filters.status) clauses.push(`status = ${parameters.text(filters.status)}`);
  if (filters.deviceType) clauses.push(`device_type = ${parameters.text(filters.deviceType)}`);
  if (filters.documentType) {
    clauses.push(
      `(${parameters.text(filters.documentType)} = ANY(supported_document_types) OR ${parameters.text(
        filters.documentType,
      )} = ANY(default_document_types))`,
    );
  }
  return clauses.length ? `WHERE ${clauses.join("\n  AND ")}` : "";
}

function printDeviceJsonExpression(alias) {
  return `json_build_object(
    'printDeviceId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'name', ${alias}.name,
    'deviceType', ${alias}.device_type,
    'status', ${alias}.status,
    'connectionType', ${alias}.connection_type,
    'connectionUri', ${alias}.connection_uri,
    'driverName', ${alias}.driver_name,
    'supportedDocumentTypes', ${alias}.supported_document_types,
    'defaultDocumentTypes', ${alias}.default_document_types,
    'paperWidthMm', ${alias}.paper_width_mm,
    'paperHeightMm', ${alias}.paper_height_mm,
    'paperName', ${alias}.paper_name,
    'isContinuous', ${alias}.is_continuous,
    'dpi', ${alias}.dpi,
    'defaultCopies', ${alias}.default_copies,
    'darkness', ${alias}.darkness,
    'speed', ${alias}.speed,
    'cutterEnabled', ${alias}.cutter_enabled,
    'settings', ${alias}.settings_json,
    'createdBy', ${alias}.created_by,
    'updatedBy', ${alias}.updated_by,
    'revision', ${alias}.revision,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function buildInsertOperationLogSql(operationLog, parameters) {
  if (!operationLog) return "SELECT NULL::text AS id WHERE false";
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
)
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key
RETURNING id`;
}

function normalizeOperationLogForPersistence(operationLog) {
  if (!operationLog || typeof operationLog !== "object") return null;
  const id = String(operationLog.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    targetType: String(operationLog.targetType ?? operationLog.target_type ?? "").trim(),
    targetId: String(operationLog.targetId ?? operationLog.target_id ?? "").trim(),
    action: String(operationLog.action ?? "").trim(),
    before: operationLog.before ?? null,
    after: operationLog.after ?? null,
    reason: String(operationLog.reason ?? "").trim(),
    operatorId: String(operationLog.operatorId ?? operationLog.operator_id ?? "").trim(),
    pageKey: String(operationLog.pageKey ?? operationLog.page_key ?? "api").trim() || "api",
    occurredAt: operationLog.occurredAt ?? new Date().toISOString(),
    createdAt: operationLog.createdAt ?? new Date().toISOString(),
  };
}

function upsertById(rows, row, getId) {
  if (!row) return rows;
  const id = getId(row);
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? row : item));
}

function normalizeDeviceType(value) {
  const type = String(value ?? "").trim();
  if (["label_printer", "dot_matrix", "office_printer"].includes(type)) return type;
  return "label_printer";
}

function normalizeStatus(value) {
  const status = String(value ?? "").trim();
  if (["active", "inactive", "maintenance"].includes(status)) return status;
  return "active";
}

function normalizeConnectionType(value) {
  const type = String(value ?? "").trim();
  if (["system_printer", "usb", "network", "browser_download", "manual"].includes(type)) return type;
  return "system_printer";
}

function normalizeStringList(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function normalizePrintDeviceLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 200;
  return Math.min(500, Math.max(1, Math.trunc(number)));
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
