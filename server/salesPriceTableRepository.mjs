// 负责人 2026-11-12「销售价格」：读价格表各版本、保存新版本。
// 每次改价 = 新建一个价格表版本（price_tables 一行 + 全部价格行），旧的生效版本改成 superseded 并写上停用时间。
// 已经下的订单有价格快照，不受影响；开单报价只认唯一一个生效版本（见 orderDraftPublishedPricing.mjs）。
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export const SALES_PRICE_LOCK_KEY = "sales-price-table:active";
export const SALES_PRICE_HISTORY_LIMIT = 30;

const clean = (value) => String(value ?? "").trim();
const changed = () => Object.assign(new Error("价格刚被别人改过，请刷新后再改。"), { statusCode: 409, code: "SALES_PRICE_CHANGED" });

export const salesPriceBizNo = (versionNo) => `SALES-PRICE-${String(versionNo).padStart(4, "0")}`;

function isActiveNow(table, time) {
  return table.status === "active"
    && (!table.effectiveFrom || Date.parse(table.effectiveFrom) <= time)
    && (!table.effectiveTo || Date.parse(table.effectiveTo) > time);
}

/** 本地模式（评审壳 / 开发）：价格表就在 workspace 数组里。 */
export function listLocalSalesPriceTables(workspace) {
  const users = new Map((workspace.users ?? []).map((user) => [clean(user.id), clean(user.displayName ?? user.name)]));
  const tables = [...(workspace.priceTables ?? [])]
    .sort((a, b) => Number(b.versionNo ?? 1) - Number(a.versionNo ?? 1) || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, SALES_PRICE_HISTORY_LIMIT)
    .map((table) => ({ ...table, createdByName: users.get(clean(table.createdBy)) || "" }));
  const ids = new Set(tables.map((table) => table.id));
  const items = (workspace.priceTableItems ?? []).filter((item) => ids.has(item.priceTableId));
  return { tables, items };
}

export function saveLocalSalesPriceVersion(workspace, input) {
  const time = Date.parse(input.now);
  const tables = (workspace.priceTables ??= []);
  const active = tables.filter((table) => isActiveNow(table, time));
  const expected = clean(input.expectedCurrentId);
  if (expected ? !(active.length === 1 && active[0].id === expected) : active.length !== 0) throw changed();
  const versionNo = tables.reduce((max, table) => Math.max(max, Number(table.versionNo ?? 1)), 0) + 1;
  for (const table of active) Object.assign(table, { status: "superseded", effectiveTo: input.now, updatedAt: input.now });
  const table = {
    id: input.tableId, bizNo: salesPriceBizNo(versionNo), name: "销售价格表", versionNo, status: "active",
    effectiveFrom: input.now, effectiveTo: null, createdBy: input.operatorId, createdAt: input.now, updatedAt: input.now,
    rules: input.rules, changeSummary: input.changeSummary,
  };
  tables.push(table);
  const items = input.items.map((item, index) => ({
    id: `${input.tableId}-${String(index + 1).padStart(3, "0")}`, priceTableId: input.tableId, sizeKey: item.sizeKey,
    standardColorId: "", handleType: "", styleKey: item.styleKey, bagPrice: item.bagPrice, printPrice: 0, otherFee: 0, minQty: null,
    enabled: true, label: item.label, category: item.category, sortOrder: item.sortOrder, createdAt: input.now, updatedAt: input.now,
  }));
  (workspace.priceTableItems ??= []).push(...items);
  if (input.operationLog) (workspace.operationLogs ??= []).push(input.operationLog);
  return { priceTable: table, operationLogId: input.operationLog?.id ?? "" };
}

const tableJson = (alias, users) => `json_build_object('id', ${alias}.id, 'bizNo', ${alias}.biz_no, 'name', ${alias}.name, 'versionNo', ${alias}.version_no,
  'status', ${alias}.status, 'effectiveFrom', ${alias}.effective_from, 'effectiveTo', ${alias}.effective_to, 'createdBy', COALESCE(${alias}.created_by, ''),
  'createdByName', COALESCE(${users}.display_name, ''), 'createdAt', ${alias}.created_at, 'rules', ${alias}.rules_json, 'changeSummary', ${alias}.change_summary)`;

export function buildListSalesPriceTablesQuery() {
  return {
    text: `
WITH recent AS MATERIALIZED (
  SELECT * FROM price_tables ORDER BY version_no DESC, created_at DESC LIMIT ${SALES_PRICE_HISTORY_LIMIT}
)
SELECT json_build_object(
  'tables', COALESCE((SELECT json_agg(${tableJson("t", "u")} ORDER BY t.version_no DESC, t.created_at DESC)
    FROM recent t LEFT JOIN users u ON u.id = t.created_by), '[]'::json),
  'items', COALESCE((SELECT json_agg(json_build_object('id', i.id, 'priceTableId', i.price_table_id, 'sizeKey', COALESCE(i.size_key, ''),
    'standardColorId', COALESCE(i.standard_color_id, ''), 'handleType', COALESCE(i.handle_type, ''), 'styleKey', COALESCE(i.style_key, ''),
    'bagPrice', i.bag_price, 'printPrice', i.print_price, 'otherFee', i.other_fee, 'minQty', i.min_qty, 'enabled', i.enabled,
    'label', i.label, 'category', i.category, 'sortOrder', i.sort_order) ORDER BY i.price_table_id, i.sort_order, i.id)
    FROM price_table_items i WHERE i.price_table_id IN (SELECT id FROM recent)), '[]'::json)
) AS result;`.trim(),
    values: [],
  };
}

export function buildSaveSalesPriceVersionQuery(input) {
  const p = createPostgresParameterBinder();
  const now = p.timestamp(input.now);
  const tableId = p.text(input.tableId);
  const expected = p.text(clean(input.expectedCurrentId));
  const items = p.json(input.items.map((item, index) => ({
    id: `${input.tableId}-${String(index + 1).padStart(3, "0")}`, size_key: item.sizeKey, style_key: item.styleKey,
    bag_price: item.bagPrice, label: item.label, category: item.category, sort_order: item.sortOrder,
  })));
  const log = input.operationLog;
  return {
    text: `
WITH current_active AS MATERIALIZED (
  SELECT id FROM price_tables
  WHERE status = 'active' AND (effective_from IS NULL OR effective_from <= ${now}) AND (effective_to IS NULL OR effective_to > ${now})
  FOR UPDATE
),
guard AS MATERIALIZED (
  SELECT erp_require(
    CASE WHEN ${expected} = '' THEN NOT EXISTS (SELECT 1 FROM current_active)
      ELSE (SELECT count(*) FROM current_active) = 1 AND EXISTS (SELECT 1 FROM current_active WHERE id = ${expected}) END,
    'SALES_PRICE_CHANGED') AS ok
),
next_version AS MATERIALIZED (
  SELECT COALESCE(max(version_no), 0) + 1 AS version_no FROM price_tables
),
retired AS (
  UPDATE price_tables SET status = 'superseded', effective_to = ${now}, updated_at = ${now}
  FROM guard WHERE guard.ok AND price_tables.id IN (SELECT id FROM current_active)
  RETURNING price_tables.id
),
inserted_table AS (
  INSERT INTO price_tables (id, biz_no, name, version_no, status, effective_from, created_by, created_at, updated_at, rules_json, change_summary)
  SELECT ${tableId}, 'SALES-PRICE-' || lpad(next_version.version_no::text, 4, '0'), '销售价格表', next_version.version_no, 'active', ${now},
    ${p.nullableText(input.operatorId)}, ${now}, ${now}, ${p.json(input.rules)}, ${p.text(input.changeSummary)}
  FROM guard, next_version WHERE guard.ok
  RETURNING id, biz_no, version_no
),
inserted_items AS (
  INSERT INTO price_table_items (id, price_table_id, size_key, standard_color_id, handle_type, style_key, bag_price, print_price, other_fee, min_qty, enabled, label, category, sort_order, created_at, updated_at)
  SELECT x.id, inserted_table.id, x.size_key, NULL, NULL, x.style_key, x.bag_price, 0, 0, NULL, true, x.label, x.category, x.sort_order, ${now}, ${now}
  FROM inserted_table, jsonb_to_recordset(${items}) AS x(id text, size_key text, style_key text, bag_price numeric, label text, category text, sort_order integer)
  RETURNING id
),
logged AS (
  INSERT INTO operation_logs (id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at)
  SELECT ${p.text(log?.id ?? "")}, 'price_table', inserted_table.id, 'save_sales_price_version', ${p.json(log?.before ?? null)}::jsonb,
    jsonb_build_object('versionNo', inserted_table.version_no, 'itemCount', (SELECT count(*) FROM inserted_items), 'changes', ${p.json(log?.after?.changes ?? [])}::jsonb),
    ${p.text(input.changeSummary)}, ${p.nullableText(input.operatorId)}, 'sales-prices', ${now}, ${now}
  FROM inserted_table WHERE ${p.text(log?.id ?? "")} <> ''
  RETURNING id
)
SELECT json_build_object(
  'priceTable', (SELECT json_build_object('id', id, 'bizNo', biz_no, 'versionNo', version_no) FROM inserted_table),
  'itemCount', (SELECT count(*) FROM inserted_items),
  'retired', (SELECT count(*) FROM retired),
  'operationLogId', COALESCE((SELECT id FROM logged), '')
) AS result;`.trim(),
    values: p.values,
  };
}

export function createPostgresSalesPriceTableMethods(runQuery) {
  return {
    async listSalesPriceTables() {
      const query = buildListSalesPriceTablesQuery();
      const raw = await runQuery(query.text, query.values, {});
      const row = Array.isArray(raw) ? raw[0] : raw;
      return { tables: row?.tables ?? [], items: (row?.items ?? []).map((item) => ({ ...item, bagPrice: Number(item.bagPrice), printPrice: Number(item.printPrice), otherFee: Number(item.otherFee) })) };
    },
    async saveSalesPriceVersion(input) {
      const query = buildSaveSalesPriceVersionQuery(input);
      let raw;
      try {
        raw = await runQuery(query.text, query.values, { resourceLocks: [SALES_PRICE_LOCK_KEY] });
      } catch (error) {
        if (String(error?.message ?? "").includes("SALES_PRICE_CHANGED")) throw changed();
        throw error;
      }
      const row = Array.isArray(raw) ? raw[0] : raw;
      if (!row?.priceTable?.id) throw changed();
      return { priceTable: row.priceTable, operationLogId: clean(row.operationLogId) };
    },
  };
}
