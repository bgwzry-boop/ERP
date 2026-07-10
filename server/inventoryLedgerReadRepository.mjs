import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export function createInventoryLedgerReadRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_INVENTORY_LEDGER_READ_STORE ??
    process.env.ERP_INVENTORY_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresInventoryLedgerReadRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_INVENTORY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalInventoryLedgerReadRepository();
  throw new Error(`Unsupported inventory ledger read repository mode: ${mode}`);
}

export function createLocalInventoryLedgerReadRepository() {
  return {
    kind: "local_memory",

    listInventoryLedgerEntries({ workspace, query = {} } = {}) {
      const filters = normalizeInventoryLedgerQuery(query);
      const inventoryItems = new Map((workspace.inventories ?? []).map((item) => [item.id, item]));
      const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
      let items = (workspace.inventoryLedgers ?? [])
        .map((entry) =>
          normalizeInventoryLedgerEntry(entry, {
            inventoryItem: inventoryItems.get(entry.inventoryItemId ?? entry.inventory_item_id),
            operator: users.get(entry.operatorId ?? entry.operator_id),
            confirmer: users.get(entry.confirmedBy ?? entry.confirmed_by),
          }),
        )
        .filter(Boolean);

      items = filterLocalInventoryLedgerEntries(items, filters);
      items.sort(compareInventoryLedgerEntryDesc);
      return paginateInventoryLedgerEntries(items, filters);
    },
  };
}

export function createPostgresInventoryLedgerReadRepository(options = {}) {
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));

  return {
    kind: "postgres",

    async listInventoryLedgerEntries({ query = {} } = {}) {
      const builtQuery = buildListInventoryLedgerEntriesQuery(query);
      return normalizeInventoryLedgerListResponse(await queryJson(builtQuery.text, builtQuery.values));
    },
  };
}

export function buildListInventoryLedgerEntriesSql(query = {}) {
  return buildListInventoryLedgerEntriesQuery(query).text;
}

export function buildListInventoryLedgerEntriesQuery(query = {}) {
  const filters = normalizeInventoryLedgerQuery(query);
  const parameters = createPostgresParameterBinder();
  const where = buildInventoryLedgerWhereClause(filters, parameters);
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    text: `
WITH filtered_ledger_entries AS (
  SELECT
    entry.id,
    entry.inventory_item_id,
    entry.change_type,
    entry.qty_before,
    entry.qty_change,
    entry.qty_after,
    entry.source_type,
    entry.source_id,
    entry.operator_id,
    entry.confirmed_by,
    entry.occurred_at,
    entry.created_at,
    entry.reason,
    entry.remark,
    item.inventory_key,
    item.size,
    COALESCE(color.name, item.standard_color_id, '') AS color_name,
    item.handle_type,
    item.style,
    item.zone,
    item.inventory_state,
    item.trust_level,
    operator_user.display_name AS operator_name,
    confirmer_user.display_name AS confirmed_by_name
  FROM inventory_ledger_entries AS entry
  JOIN inventory_items AS item ON item.id = entry.inventory_item_id
  LEFT JOIN standard_colors AS color ON color.id = item.standard_color_id
  LEFT JOIN users AS operator_user ON operator_user.id = entry.operator_id
  LEFT JOIN users AS confirmer_user ON confirmer_user.id = entry.confirmed_by
  ${where}
),
paged_ledger_entries AS (
  SELECT *
  FROM filtered_ledger_entries
  ORDER BY occurred_at DESC, created_at DESC, id DESC
  LIMIT ${parameters.integer(limit)}
  OFFSET ${parameters.integer(offset)}
)
SELECT json_build_object(
  'items', (
    SELECT COALESCE(json_agg(${inventoryLedgerEntryJsonExpression("entry")} ORDER BY entry.occurred_at DESC, entry.created_at DESC, entry.id DESC), '[]'::json)
    FROM paged_ledger_entries AS entry
  ),
  'page', ${parameters.integer(filters.page)},
  'pageSize', ${parameters.integer(filters.pageSize)},
  'total', (SELECT COUNT(*) FROM filtered_ledger_entries),
  'filters', ${inventoryLedgerFiltersJsonExpression(filters, parameters)}
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeInventoryLedgerListResponse(value) {
  const page = toFiniteInteger(value?.page ?? 1, 1);
  const pageSize = toFiniteInteger(value?.pageSize ?? value?.page_size ?? 50, 50);
  const items = Array.isArray(value?.items)
    ? value.items.map((item) => normalizeInventoryLedgerEntry(item)).filter(Boolean)
    : [];
  return {
    items,
    page,
    pageSize,
    total: toFiniteInteger(value?.total ?? items.length, items.length),
    filters: normalizeInventoryLedgerFilterSnapshot(value?.filters),
  };
}

export function normalizeInventoryLedgerEntry(entry, context = {}) {
  if (!entry || typeof entry !== "object") return null;
  const ledgerId = cleanText(entry.ledgerId ?? entry.ledger_id ?? entry.id);
  const inventoryItemId = cleanText(entry.inventoryItemId ?? entry.inventory_item_id);
  if (!ledgerId || !inventoryItemId) return null;

  const inventoryItem = context.inventoryItem ?? {};
  const operator = context.operator ?? {};
  const confirmer = context.confirmer ?? {};
  const sourceType = cleanText(entry.sourceType ?? entry.source_type) || inferLocalSourceType(entry);
  const sourceId = cleanText(entry.sourceId ?? entry.source_id) || inferLocalSourceId(entry);
  const colorName = cleanText(
    entry.colorName ?? entry.color_name ?? entry.color ?? inventoryItem.colorName ?? inventoryItem.color,
  );

  return {
    ledgerId,
    inventoryItemId,
    inventoryKey: cleanText(entry.inventoryKey ?? entry.inventory_key ?? inventoryItem.inventoryKey ?? inventoryItem.id),
    size: cleanText(entry.size ?? inventoryItem.size),
    colorName,
    color: colorName,
    handleType: cleanText(entry.handleType ?? entry.handle_type ?? entry.handle ?? inventoryItem.handleType ?? inventoryItem.handle),
    style: cleanText(entry.style ?? inventoryItem.style),
    zone: cleanText(entry.zone ?? inventoryItem.zone),
    inventoryState: cleanText(entry.inventoryState ?? entry.inventory_state ?? entry.state ?? inventoryItem.state),
    trustLevel: cleanText(entry.trustLevel ?? entry.trust_level ?? entry.trust ?? inventoryItem.trust),
    changeType: cleanText(entry.changeType ?? entry.change_type) || "unknown",
    qtyBefore: toFiniteInteger(entry.qtyBefore ?? entry.qty_before, 0),
    qtyChange: toFiniteInteger(entry.qtyChange ?? entry.qty_change, 0),
    qtyAfter: toFiniteInteger(entry.qtyAfter ?? entry.qty_after, 0),
    sourceType,
    sourceId,
    operatorId: cleanText(entry.operatorId ?? entry.operator_id),
    operatorName: cleanText(entry.operatorName ?? entry.operator_name ?? operator.displayName ?? operator.display_name),
    confirmedBy: cleanText(entry.confirmedBy ?? entry.confirmed_by),
    confirmedByName: cleanText(
      entry.confirmedByName ?? entry.confirmed_by_name ?? confirmer.displayName ?? confirmer.display_name,
    ),
    occurredAt: cleanText(entry.occurredAt ?? entry.occurred_at ?? entry.createdAt ?? entry.created_at),
    createdAt: cleanText(entry.createdAt ?? entry.created_at ?? entry.occurredAt ?? entry.occurred_at),
    reason: cleanText(entry.reason),
    remark: cleanText(entry.remark),
  };
}

export function normalizeInventoryLedgerQuery(query = {}) {
  const source = toQueryObject(query);
  return {
    keyword: cleanText(source.keyword),
    inventoryItemId: cleanFilterValue(source.inventoryItemId),
    sourceType: cleanFilterValue(source.sourceType),
    sourceId: cleanFilterValue(source.sourceId),
    changeType: cleanFilterValue(source.changeType),
    dateFrom: cleanText(source.dateFrom),
    dateTo: cleanText(source.dateTo),
    page: clampInteger(source.page, 1, 100000, 1),
    pageSize: clampInteger(source.pageSize, 1, 200, 50),
  };
}

function buildInventoryLedgerWhereClause(filters, parameters) {
  const conditions = [];
  if (filters.inventoryItemId) conditions.push(`entry.inventory_item_id = ${parameters.text(filters.inventoryItemId)}`);
  if (filters.sourceType) conditions.push(`entry.source_type = ${parameters.text(filters.sourceType)}`);
  if (filters.sourceId) conditions.push(`entry.source_id = ${parameters.text(filters.sourceId)}`);
  if (filters.changeType) conditions.push(`entry.change_type = ${parameters.text(filters.changeType)}`);
  if (filters.dateFrom && !Number.isNaN(Date.parse(filters.dateFrom))) {
    conditions.push(`entry.occurred_at >= ${parameters.text(filters.dateFrom)}::date`);
  }
  if (filters.dateTo && !Number.isNaN(Date.parse(filters.dateTo))) {
    conditions.push(`entry.occurred_at < (${parameters.text(filters.dateTo)}::date + INTERVAL '1 day')`);
  }
  if (filters.keyword) {
    const keyword = parameters.text(`%${filters.keyword}%`);
    conditions.push(`(
      entry.id ILIKE ${keyword}
      OR entry.source_id ILIKE ${keyword}
      OR entry.change_type ILIKE ${keyword}
      OR entry.reason ILIKE ${keyword}
      OR entry.remark ILIKE ${keyword}
      OR item.inventory_key ILIKE ${keyword}
      OR item.size ILIKE ${keyword}
      OR item.handle_type ILIKE ${keyword}
      OR item.style ILIKE ${keyword}
      OR item.zone ILIKE ${keyword}
      OR item.inventory_state ILIKE ${keyword}
      OR color.name ILIKE ${keyword}
    )`);
  }
  return conditions.length ? `WHERE ${conditions.join("\n    AND ")}` : "";
}

function inventoryLedgerEntryJsonExpression(alias) {
  return `json_build_object(
    'ledgerId', ${alias}.id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'inventoryKey', ${alias}.inventory_key,
    'size', ${alias}.size,
    'colorName', ${alias}.color_name,
    'color', ${alias}.color_name,
    'handleType', ${alias}.handle_type,
    'style', ${alias}.style,
    'zone', ${alias}.zone,
    'inventoryState', ${alias}.inventory_state,
    'trustLevel', ${alias}.trust_level,
    'changeType', ${alias}.change_type,
    'qtyBefore', ${alias}.qty_before,
    'qtyChange', ${alias}.qty_change,
    'qtyAfter', ${alias}.qty_after,
    'sourceType', ${alias}.source_type,
    'sourceId', ${alias}.source_id,
    'operatorId', ${alias}.operator_id,
    'operatorName', ${alias}.operator_name,
    'confirmedBy', ${alias}.confirmed_by,
    'confirmedByName', ${alias}.confirmed_by_name,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at,
    'reason', ${alias}.reason,
    'remark', ${alias}.remark
  )`;
}

function inventoryLedgerFiltersJsonExpression(filters, parameters) {
  return `json_build_object(
    'keyword', ${parameters.text(filters.keyword)},
    'inventoryItemId', ${parameters.text(filters.inventoryItemId)},
    'sourceType', ${parameters.text(filters.sourceType)},
    'sourceId', ${parameters.text(filters.sourceId)},
    'changeType', ${parameters.text(filters.changeType)},
    'dateFrom', ${parameters.text(filters.dateFrom)},
    'dateTo', ${parameters.text(filters.dateTo)}
  )`;
}

function normalizeInventoryLedgerFilterSnapshot(value) {
  const filters = value && typeof value === "object" ? value : {};
  return {
    keyword: cleanText(filters.keyword),
    inventoryItemId: cleanText(filters.inventoryItemId ?? filters.inventory_item_id),
    sourceType: cleanText(filters.sourceType ?? filters.source_type),
    sourceId: cleanText(filters.sourceId ?? filters.source_id),
    changeType: cleanText(filters.changeType ?? filters.change_type),
    dateFrom: cleanText(filters.dateFrom ?? filters.date_from),
    dateTo: cleanText(filters.dateTo ?? filters.date_to),
  };
}

function filterLocalInventoryLedgerEntries(items, filters) {
  return items.filter((item) => {
    if (
      filters.keyword &&
      ![
        "ledgerId",
        "inventoryItemId",
        "inventoryKey",
        "size",
        "colorName",
        "handleType",
        "style",
        "zone",
        "inventoryState",
        "changeType",
        "sourceId",
        "reason",
        "remark",
      ].some((field) => String(item[field] ?? "").includes(filters.keyword))
    ) {
      return false;
    }
    if (filters.inventoryItemId && item.inventoryItemId !== filters.inventoryItemId) return false;
    if (filters.sourceType && item.sourceType !== filters.sourceType) return false;
    if (filters.sourceId && item.sourceId !== filters.sourceId) return false;
    if (filters.changeType && item.changeType !== filters.changeType) return false;
    if (filters.dateFrom && !isSameOrAfterDay(item.occurredAt, filters.dateFrom)) return false;
    if (filters.dateTo && !isSameOrBeforeDay(item.occurredAt, filters.dateTo)) return false;
    return true;
  });
}

function paginateInventoryLedgerEntries(items, filters) {
  const start = (filters.page - 1) * filters.pageSize;
  return {
    items: items.slice(start, start + filters.pageSize),
    page: filters.page,
    pageSize: filters.pageSize,
    total: items.length,
    filters: normalizeInventoryLedgerFilterSnapshot(filters),
  };
}

function compareInventoryLedgerEntryDesc(left, right) {
  const leftTime = Date.parse(left.occurredAt || left.createdAt) || 0;
  const rightTime = Date.parse(right.occurredAt || right.createdAt) || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.ledgerId).localeCompare(String(left.ledgerId));
}

function inferLocalSourceType(entry) {
  if (entry.correctionDraftId) return "inventory_correction";
  if (entry.reservationId) return "inventory_reservation";
  if (entry.orderLineId) return "order_line";
  return "";
}

function inferLocalSourceId(entry) {
  return cleanText(entry.correctionDraftId ?? entry.reservationId ?? entry.orderLineId);
}

function isSameOrAfterDay(value, dateText) {
  const valueDate = Date.parse(value);
  const floorDate = Date.parse(dateText);
  if (!Number.isFinite(valueDate) || !Number.isFinite(floorDate)) return true;
  return valueDate >= floorDate;
}

function isSameOrBeforeDay(value, dateText) {
  const valueDate = Date.parse(value);
  const floorDate = Date.parse(dateText);
  if (!Number.isFinite(valueDate) || !Number.isFinite(floorDate)) return true;
  return valueDate < floorDate + 24 * 60 * 60 * 1000;
}

function toQueryObject(query) {
  if (query instanceof URLSearchParams) return Object.fromEntries(query.entries());
  return query && typeof query === "object" ? query : {};
}

function cleanFilterValue(value) {
  const text = cleanText(value);
  return !text || text === "all" ? "" : text;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function toFiniteInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}
