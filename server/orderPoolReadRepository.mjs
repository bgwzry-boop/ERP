import { resolveStoreMode } from "./storeMode.mjs";
import { calculateLinePricing } from "../src/domain/priceTable.js";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export function createOrderPoolReadRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_ORDER_POOL_READ_STORE", "ERP_ORDER_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresOrderPoolReadRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_ORDER_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalOrderPoolReadRepository();
  throw new Error(`Unsupported order pool read repository mode: ${mode}`);
}

export function createLocalOrderPoolReadRepository() {
  return {
    kind: "local_memory",

    listOrderLines({ workspace, query = {} }) {
      const filters = normalizeOrderPoolQuery(query);
      const customers = new Map((workspace.customers ?? []).map((customer) => [customer.id, customer]));
      let items = (workspace.orderLines ?? []).map((line) =>
        normalizeOrderLineListItem(line, { customer: customers.get(line.customerId) }),
      );
      items = filterLocalOrderLines(items, filters);
      return paginateOrderLines(items, filters);
    },

    getOrderLineDetail({ workspace, orderLineId }) {
      const customers = new Map((workspace.customers ?? []).map((customer) => [customer.id, customer]));
      const sourceLine = (workspace.orderLines ?? []).find((line) => line.id === orderLineId || line.orderLineId === orderLineId);
      if (!sourceLine) return null;
      const orderLine = normalizeOrderLineListItem(sourceLine, { customer: customers.get(sourceLine.customerId) });
      const originalOrder =
        (workspace.originalOrders ?? []).find(
          (order) => order.orderId === orderLine.orderId || order.id === orderLine.orderId,
        ) ?? {};
      const fulfillment = (workspace.fulfillments ?? [])
        .filter((item) => (item.lineId ?? item.orderLineId) === orderLine.id)
        .map(toLocalFulfillmentTrace);
      const inventory = (workspace.inventoryReservations ?? [])
        .filter((item) => item.orderLineId === orderLine.id)
        .map((reservation) => toLocalInventoryTrace(workspace, reservation));
      const statement = (workspace.statements ?? [])
        .filter((item) => Array.isArray(item.lineIds) && item.lineIds.includes(orderLine.id))
        .map(toLocalStatementTrace);
      const operationLogs = (workspace.operationLogs ?? []).filter(
        (log) => log.targetId === orderLine.id || log.targetId === orderLine.orderId,
      );
      const pricing = calculateLinePricing({
        ...orderLine,
        print: orderLine.printFlag ? "是" : orderLine.print,
        qty: orderLine.qty,
      });
      return normalizeOrderLineDetail({
        orderLine,
        originalOrder: {
          orderId: orderLine.orderId,
          orderNo: orderLine.orderNo,
          sourceText: originalOrder.sourceText ?? "",
          sourceChannel: originalOrder.sourceChannel ?? "manual",
          summaryStatus: originalOrder.summaryStatus ?? orderLine.lineStatus,
          createdBy: originalOrder.createdBy ?? orderLine.createdBy ?? "",
          createdAt: originalOrder.createdAt ?? orderLine.createdAt ?? "",
        },
        priceSnapshot: {
          orderLineId: orderLine.id,
          bagPrice: pricing.bagPrice,
          printPrice: pricing.printPrice,
          otherFee: 0,
          amount: orderLine.amount,
          finalAmount: orderLine.amount,
          chargeableQty: orderLine.qty,
          priceVersion: pricing.priceVersion,
        },
        production: [],
        inventory,
        fulfillment,
        statement,
        attachments: [],
        operationLogs,
      });
    },
  };
}

export function createPostgresOrderPoolReadRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));

  return {
    kind: "postgres",

    async listOrderLines({ query = {} } = {}) {
      const builtQuery = buildListOrderLinesQuery(query);
      return normalizeOrderLineListResponse(await queryJson(builtQuery.text, builtQuery.values));
    },

    async getOrderLineDetail({ orderLineId }) {
      const builtQuery = buildFindOrderLineDetailQuery({ orderLineId });
      return normalizeOrderLineDetail(await queryJson(builtQuery.text, builtQuery.values));
    },
  };
}

export function buildListOrderLinesSql(query = {}) {
  return buildListOrderLinesQuery(query).text;
}

export function buildListOrderLinesQuery(query = {}) {
  const filters = normalizeOrderPoolQuery(query);
  const parameters = createPostgresParameterBinder();
  const where = buildOrderLineWhereClause(filters, parameters);
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    text: `
WITH filtered_order_lines AS (
  ${buildOrderLineProjectionSql(where)}
),
paged_order_lines AS (
  SELECT *
  FROM filtered_order_lines
  ORDER BY created_at DESC, id DESC
  LIMIT ${parameters.integer(limit)}
  OFFSET ${parameters.integer(offset)}
)
SELECT json_build_object(
  'items', (
    SELECT COALESCE(json_agg(${orderLineListItemJsonExpression("line")} ORDER BY line.created_at DESC, line.id DESC), '[]'::json)
    FROM paged_order_lines AS line
  ),
  'page', ${parameters.integer(filters.page)},
  'pageSize', ${parameters.integer(filters.pageSize)},
  'total', (SELECT COUNT(*) FROM filtered_order_lines)
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindOrderLineDetailSql({ orderLineId }) {
  return buildFindOrderLineDetailQuery({ orderLineId }).text;
}

export function buildFindOrderLineDetailQuery({ orderLineId }) {
  const id = String(orderLineId ?? "").trim();
  if (!id) throw new Error("orderLineId is required");
  const parameters = createPostgresParameterBinder();
  const orderLineIdParameter = parameters.text(id);
  const where = `WHERE line.id = ${orderLineIdParameter}`;
  return {
    text: `
WITH selected_order_line AS (
  ${buildOrderLineProjectionSql(where)}
  LIMIT 1
),
selected_price_snapshot AS (
  SELECT snapshot.*
  FROM price_snapshots AS snapshot
  WHERE snapshot.order_line_id = ${orderLineIdParameter}
  ORDER BY snapshot.created_at DESC, snapshot.version_no DESC, snapshot.id DESC
  LIMIT 1
),
selected_inventory AS (
  SELECT COALESCE(json_agg(json_build_object(
    'reservationId', reservation.id,
    'inventoryItemId', item.id,
    'inventoryKey', item.inventory_key,
    'zone', item.zone,
    'state', item.inventory_state,
    'trustLevel', item.trust_level,
    'reservedQty', reservation.reserved_qty,
    'availableQty', GREATEST(item.on_hand_qty - item.reserved_qty - item.waiting_pickup_locked_qty - item.pending_handling_qty, 0),
    'ledgerIds', COALESCE(ledger.ledger_ids, ARRAY[]::TEXT[])
  ) ORDER BY reservation.created_at DESC, reservation.id DESC), '[]'::json) AS result
  FROM inventory_reservations AS reservation
  LEFT JOIN inventory_items AS item ON item.id = reservation.inventory_item_id
  LEFT JOIN LATERAL (
    SELECT ARRAY_AGG(entry.id ORDER BY entry.created_at DESC, entry.id DESC) AS ledger_ids
    FROM inventory_ledger_entries AS entry
    WHERE entry.inventory_item_id = reservation.inventory_item_id
      AND entry.source_id IN (reservation.order_line_id, reservation.id)
  ) AS ledger ON true
  WHERE reservation.order_line_id = ${orderLineIdParameter}
),
selected_fulfillment AS (
  SELECT COALESCE(json_agg(json_build_object(
    'fulfillmentId', fulfillment.id,
    'orderLineId', fulfillment.order_line_id,
    'method', fulfillment.method,
    'status', fulfillment.status,
    'expectedQty', fulfillment.expected_qty,
    'actualQty', fulfillment.actual_qty,
    'latestNeededAt', fulfillment.latest_needed_at
  ) ORDER BY fulfillment.created_at DESC, fulfillment.id DESC), '[]'::json) AS result
  FROM fulfillment_records AS fulfillment
  WHERE fulfillment.order_line_id = ${orderLineIdParameter}
),
selected_statement AS (
  SELECT COALESCE(json_agg(json_build_object(
    'statementId', statement.id,
    'period', CONCAT(statement.period_start::TEXT, ' - ', statement.period_end::TEXT),
    'status', statement.status,
    'receivable', statement.receivable_amount,
    'received', statement.received_amount,
    'variance', statement.variance_amount
  ) ORDER BY statement.period_end DESC, statement.id DESC), '[]'::json) AS result
  FROM statement_lines AS statement_line
  JOIN statements AS statement ON statement.id = statement_line.statement_id
  WHERE statement_line.order_line_id = ${orderLineIdParameter}
),
selected_operation_logs AS (
  SELECT COALESCE(json_agg(json_build_object(
    'operationLogId', log.id,
    'targetType', log.target_type,
    'targetId', log.target_id,
    'action', log.action,
    'reason', log.reason,
    'operatorId', log.operator_id,
    'pageKey', log.page_key,
    'occurredAt', log.occurred_at
  ) ORDER BY log.occurred_at DESC, log.id DESC), '[]'::json) AS result
  FROM operation_logs AS log
  WHERE log.target_id = ${orderLineIdParameter}
     OR log.target_id = (SELECT order_id FROM selected_order_line LIMIT 1)
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM selected_order_line) THEN NULL
  ELSE json_build_object(
    'orderLine', (SELECT ${orderLineListItemJsonExpression("line")} FROM selected_order_line AS line),
    'originalOrder', (SELECT json_build_object(
      'orderId', line.order_id,
      'orderNo', line.order_no,
      'sourceText', line.source_text,
      'sourceChannel', 'manual',
      'summaryStatus', line.order_summary_status,
      'createdBy', line.order_created_by,
      'createdAt', line.order_created_at
    ) FROM selected_order_line AS line),
    'priceSnapshot', (SELECT ${priceSnapshotJsonExpression("snapshot")} FROM selected_price_snapshot AS snapshot),
    'production', '[]'::json,
    'inventory', (SELECT result FROM selected_inventory),
    'fulfillment', (SELECT result FROM selected_fulfillment),
    'statement', (SELECT result FROM selected_statement),
    'attachments', '[]'::json,
    'operationLogs', (SELECT result FROM selected_operation_logs)
  )
END AS result;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeOrderLineListResponse(value) {
  const page = toFiniteInteger(value?.page ?? 1, 1);
  const pageSize = toFiniteInteger(value?.pageSize ?? value?.page_size ?? 50, 50);
  const items = Array.isArray(value?.items) ? value.items.map((item) => normalizeOrderLineListItem(item)).filter(Boolean) : [];
  return {
    items,
    page,
    pageSize,
    total: toFiniteInteger(value?.total ?? items.length, items.length),
  };
}

export function normalizeOrderLineDetail(value) {
  if (!value || typeof value !== "object") return null;
  const orderLine = normalizeOrderLineListItem(value.orderLine ?? value.order_line ?? value);
  if (!orderLine) return null;
  return {
    orderLine,
    originalOrder: normalizeOriginalOrderSummary(value.originalOrder ?? value.original_order, orderLine),
    priceSnapshot: normalizePriceSnapshot(value.priceSnapshot ?? value.price_snapshot, orderLine),
    production: Array.isArray(value.production) ? value.production : [],
    inventory: Array.isArray(value.inventory) ? value.inventory.map(normalizeInventoryTrace).filter(Boolean) : [],
    fulfillment: Array.isArray(value.fulfillment) ? value.fulfillment.map(normalizeFulfillmentTrace).filter(Boolean) : [],
    statement: Array.isArray(value.statement) ? value.statement.map(normalizeStatementTrace).filter(Boolean) : [],
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    operationLogs: Array.isArray(value.operationLogs ?? value.operation_logs) ? (value.operationLogs ?? value.operation_logs) : [],
  };
}

export function normalizeOrderPoolQuery(query = {}) {
  const source = toQueryObject(query);
  return {
    keyword: cleanText(source.keyword),
    customerId: cleanFilterValue(source.customerId),
    status: cleanFilterValue(source.status),
    orderType: cleanFilterValue(source.orderType),
    fulfillmentMethod: cleanFilterValue(source.fulfillmentMethod),
    exceptionOnly: toBoolean(source.exceptionOnly),
    financeState: cleanFilterValue(source.financeState),
    dateFrom: cleanText(source.dateFrom),
    dateTo: cleanText(source.dateTo),
    includeHistory: toBoolean(source.includeHistory),
    page: clampInteger(source.page, 1, 100000, 1),
    pageSize: clampInteger(source.pageSize, 1, 200, 50),
  };
}

function buildOrderLineProjectionSql(where) {
  return `
SELECT
  line.id,
  line.biz_no,
  line.order_id,
  line.customer_id,
  line.product_name,
  line.order_type,
  line.size,
  line.bag_color,
  line.handle_type,
  line.style,
  line.print_flag,
  line.print_color,
  line.print_side,
  line.handle_color,
  line.original_qty,
  line.latest_needed_at,
  line.fulfillment_method,
  line.line_status,
  line.exception_tags,
  line.created_by,
  line.created_at,
  line.updated_at,
  original.biz_no AS order_no,
  original.customer_snapshot,
  original.source_text,
  original.summary_status AS order_summary_status,
  original.created_by AS order_created_by,
  original.created_at AS order_created_at,
  COALESCE(customer.name, original.customer_snapshot->>'name', line.customer_id) AS customer_name,
  latest_price.final_amount AS amount,
  latest_price.id AS price_snapshot_id,
  latest_fulfillment.id AS fulfillment_id,
  latest_fulfillment.status AS fulfillment_status,
  latest_fulfillment.method AS latest_fulfillment_method,
  latest_reservation.status AS reservation_status,
  latest_reservation.reserved_qty AS reserved_qty,
  statement_state.finance_state AS finance_state
FROM order_lines AS line
JOIN original_orders AS original ON original.id = line.order_id
LEFT JOIN customers AS customer ON customer.id = line.customer_id
LEFT JOIN LATERAL (
  SELECT snapshot.id, snapshot.final_amount
  FROM price_snapshots AS snapshot
  WHERE snapshot.order_line_id = line.id
  ORDER BY snapshot.created_at DESC, snapshot.version_no DESC, snapshot.id DESC
  LIMIT 1
) AS latest_price ON true
LEFT JOIN LATERAL (
  SELECT fulfillment.id, fulfillment.status, fulfillment.method
  FROM fulfillment_records AS fulfillment
  WHERE fulfillment.order_line_id = line.id
  ORDER BY fulfillment.created_at DESC, fulfillment.id DESC
  LIMIT 1
) AS latest_fulfillment ON true
LEFT JOIN LATERAL (
  SELECT reservation.status, reservation.reserved_qty
  FROM inventory_reservations AS reservation
  WHERE reservation.order_line_id = line.id
  ORDER BY reservation.created_at DESC, reservation.id DESC
  LIMIT 1
) AS latest_reservation ON true
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN statement.status ILIKE '%欠款%' THEN 'debt'
    WHEN statement.status ILIKE '%差额%' THEN 'variance'
    WHEN statement.status ILIKE '%已核销%' OR statement.status ILIKE '%已结清%' THEN 'settled'
    WHEN statement.status ILIKE '%已发送%' THEN 'sent'
    WHEN statement.id IS NOT NULL THEN 'pending_statement'
    ELSE 'unbilled'
  END AS finance_state
  FROM statement_lines AS statement_line
  JOIN statements AS statement ON statement.id = statement_line.statement_id
  WHERE statement_line.order_line_id = line.id
  ORDER BY statement.period_end DESC, statement.created_at DESC, statement.id DESC
  LIMIT 1
) AS statement_state ON true
${where}`.trim();
}

function buildOrderLineWhereClause(filters, parameters) {
  const conditions = [];
  if (filters.customerId) conditions.push(`line.customer_id = ${parameters.text(filters.customerId)}`);
  if (filters.status) conditions.push(`line.line_status = ${parameters.text(filters.status)}`);
  if (filters.orderType) conditions.push(`line.order_type = ${parameters.text(filters.orderType)}`);
  if (filters.fulfillmentMethod) {
    const fulfillmentMethod = parameters.text(filters.fulfillmentMethod);
    conditions.push(
      `(line.fulfillment_method = ${fulfillmentMethod} OR latest_fulfillment.method = ${fulfillmentMethod})`,
    );
  }
  if (filters.exceptionOnly) conditions.push("COALESCE(array_length(line.exception_tags, 1), 0) > 0");
  if (filters.financeState) {
    conditions.push(`COALESCE(statement_state.finance_state, 'unbilled') = ${parameters.text(filters.financeState)}`);
  }
  if (filters.dateFrom && !Number.isNaN(Date.parse(filters.dateFrom))) {
    conditions.push(`line.created_at >= ${parameters.text(filters.dateFrom)}::date`);
  }
  if (filters.dateTo && !Number.isNaN(Date.parse(filters.dateTo))) {
    conditions.push(`line.created_at < (${parameters.text(filters.dateTo)}::date + INTERVAL '1 day')`);
  }
  if (!filters.includeHistory) {
    conditions.push("(line.line_status NOT IN ('已完成', '已关闭') OR line.updated_at >= date_trunc('day', now()))");
  }
  if (filters.keyword) {
    const keyword = parameters.text(`%${filters.keyword}%`);
    conditions.push(`(
      line.id ILIKE ${keyword}
      OR line.biz_no ILIKE ${keyword}
      OR original.biz_no ILIKE ${keyword}
      OR line.product_name ILIKE ${keyword}
      OR line.size ILIKE ${keyword}
      OR line.bag_color ILIKE ${keyword}
      OR line.handle_type ILIKE ${keyword}
      OR line.style ILIKE ${keyword}
      OR line.print_color ILIKE ${keyword}
      OR line.handle_color ILIKE ${keyword}
      OR customer.name ILIKE ${keyword}
      OR original.customer_snapshot->>'name' ILIKE ${keyword}
    )`);
  }
  return conditions.length ? `WHERE ${conditions.join("\n  AND ")}` : "";
}

function orderLineListItemJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'orderLineId', ${alias}.id,
    'orderId', ${alias}.order_id,
    'orderNo', ${alias}.order_no,
    'lineNo', split_part(${alias}.biz_no, '-', array_length(string_to_array(${alias}.biz_no, '-'), 1)),
    'shortNo', right(${alias}.biz_no, 5),
    'customerId', ${alias}.customer_id,
    'customerName', ${alias}.customer_name,
    'productName', ${alias}.product_name,
    'product', ${alias}.product_name,
    'size', ${alias}.size,
    'bagColor', ${alias}.bag_color,
    'color', ${alias}.bag_color,
    'handleType', ${alias}.handle_type,
    'handle', ${alias}.handle_type,
    'style', ${alias}.style,
    'printFlag', ${alias}.print_flag,
    'print', CASE WHEN ${alias}.print_flag THEN '是' ELSE '否' END,
    'printColor', ${alias}.print_color,
    'printSide', ${alias}.print_side,
    'handleColor', ${alias}.handle_color,
    'qty', ${alias}.original_qty,
    'originalQty', ${alias}.original_qty,
    'orderType', ${alias}.order_type,
    'lineStatus', ${alias}.line_status,
    'status', ${alias}.line_status,
    'fulfillmentMethod', COALESCE(${alias}.latest_fulfillment_method, ${alias}.fulfillment_method),
    'fulfillment', COALESCE(${alias}.latest_fulfillment_method, ${alias}.fulfillment_method),
    'latestNeededAt', ${alias}.latest_needed_at,
    'latest', COALESCE(${alias}.latest_needed_at::TEXT, '待确认'),
    'amount', COALESCE(${alias}.amount, 0),
    'financeState', COALESCE(${alias}.finance_state, 'unbilled'),
    'exceptionTags', ${alias}.exception_tags,
    'exceptions', ${alias}.exception_tags,
    'inventory', CASE
      WHEN ${alias}.reservation_status = '生效' THEN '已占用'
      WHEN ${alias}.reservation_status IS NOT NULL THEN ${alias}.reservation_status
      ELSE ''
    END,
    'reservationStatus', ${alias}.reservation_status,
    'reservedQty', COALESCE(${alias}.reserved_qty, 0),
    'fulfillmentStatus', ${alias}.fulfillment_status,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function priceSnapshotJsonExpression(alias) {
  return `json_build_object(
    'priceSnapshotId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'snapshotType', ${alias}.snapshot_type,
    'versionNo', ${alias}.version_no,
    'bagPrice', ${alias}.bag_price,
    'printPrice', ${alias}.print_price,
    'otherFee', ${alias}.other_fee,
    'adjustmentAmount', ${alias}.adjustment_amount,
    'chargeableQty', ${alias}.chargeable_qty,
    'finalAmount', ${alias}.final_amount,
    'amount', ${alias}.final_amount,
    'overrideReason', ${alias}.override_reason,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function filterLocalOrderLines(items, filters) {
  return items.filter((item) => {
    if (filters.keyword && !["id", "orderNo", "productName", "size", "bagColor", "handleType", "style", "customerName"].some((field) => String(item[field] ?? "").includes(filters.keyword))) return false;
    if (filters.customerId && item.customerId !== filters.customerId) return false;
    if (filters.status && item.lineStatus !== filters.status) return false;
    if (filters.orderType && item.orderType !== filters.orderType) return false;
    if (filters.fulfillmentMethod && item.fulfillmentMethod !== filters.fulfillmentMethod) return false;
    if (filters.exceptionOnly && item.exceptionTags.length === 0) return false;
    if (filters.financeState && item.financeState !== filters.financeState) return false;
    return true;
  });
}

function paginateOrderLines(items, filters) {
  const start = (filters.page - 1) * filters.pageSize;
  return {
    items: items.slice(start, start + filters.pageSize),
    page: filters.page,
    pageSize: filters.pageSize,
    total: items.length,
  };
}

function normalizeOrderLineListItem(line, context = {}) {
  if (!line || typeof line !== "object") return null;
  const id = cleanText(line.id ?? line.orderLineId ?? line.order_line_id);
  if (!id) return null;
  const orderId = cleanText(line.orderId ?? line.order_id ?? line.orderNo);
  const qty = toFiniteInteger(line.qty ?? line.originalQty ?? line.original_qty, 0);
  const productName = cleanText(line.productName ?? line.product_name ?? line.product) || "空白袋";
  const bagColor = cleanText(line.bagColor ?? line.bag_color ?? line.color);
  const handleType = cleanText(line.handleType ?? line.handle_type ?? line.handle);
  const lineStatus = cleanText(line.lineStatus ?? line.line_status ?? line.status) || "待确认";
  const fulfillmentMethod = cleanText(line.fulfillmentMethod ?? line.fulfillment_method ?? line.fulfillment) || "待确认";
  const exceptionTags = toStringArray(line.exceptionTags ?? line.exception_tags ?? line.exceptions);
  const customerName =
    cleanText(line.customerName ?? line.customer_name ?? line.customer) ||
    cleanText(context.customer?.name) ||
    cleanText(line.customerSnapshot?.name ?? line.customer_snapshot?.name) ||
    cleanText(line.customerId ?? line.customer_id);
  const printFlag = Boolean(line.printFlag ?? line.print_flag ?? line.print === "是");
  const latestNeededAt = cleanText(line.latestNeededAt ?? line.latest_needed_at);
  const latest = cleanText(line.latest ?? latestNeededAt) || "待确认";
  return {
    id,
    orderLineId: id,
    orderId,
    orderNo: cleanText(line.orderNo ?? line.order_no ?? orderId),
    lineNo: cleanText(line.lineNo ?? line.line_no) || id.split("-").at(-1) || "",
    shortNo: cleanText(line.shortNo ?? line.short_no) || id.slice(-5),
    customerId: cleanText(line.customerId ?? line.customer_id),
    customerName,
    productName,
    product: productName,
    size: cleanText(line.size) || "待确认",
    bagColor,
    color: bagColor,
    handleType,
    handle: handleType,
    style: cleanText(line.style) || "空白袋",
    printFlag,
    print: printFlag ? "是" : "否",
    printColor: cleanText(line.printColor ?? line.print_color),
    printSide: cleanText(line.printSide ?? line.print_side),
    handleColor: cleanText(line.handleColor ?? line.handle_color),
    qty,
    originalQty: qty,
    orderType: cleanText(line.orderType ?? line.order_type) || "stock",
    lineStatus,
    status: lineStatus,
    fulfillmentMethod,
    fulfillment: fulfillmentMethod,
    latestNeededAt,
    latest,
    amount: toFiniteNumber(line.amount ?? line.finalAmount ?? line.final_amount, 0),
    financeState: cleanText(line.financeState ?? line.finance_state) || "unbilled",
    exceptionTags,
    exceptions: exceptionTags,
    inventory: cleanText(line.inventory),
    reservationStatus: cleanText(line.reservationStatus ?? line.reservation_status),
    reservedQty: toFiniteInteger(line.reservedQty ?? line.reserved_qty, 0),
    fulfillmentStatus: cleanText(line.fulfillmentStatus ?? line.fulfillment_status),
    createdBy: cleanText(line.createdBy ?? line.created_by),
    createdAt: cleanText(line.createdAt ?? line.created_at),
  };
}

function normalizeOriginalOrderSummary(order, orderLine) {
  const source = order && typeof order === "object" ? order : {};
  return {
    orderId: cleanText(source.orderId ?? source.id) || orderLine.orderId,
    orderNo: cleanText(source.orderNo ?? source.bizNo ?? source.biz_no) || orderLine.orderNo,
    sourceText: cleanText(source.sourceText ?? source.source_text),
    sourceChannel: cleanText(source.sourceChannel ?? source.source_channel) || "manual",
    summaryStatus: cleanText(source.summaryStatus ?? source.summary_status) || orderLine.lineStatus,
    createdBy: cleanText(source.createdBy ?? source.created_by),
    createdAt: cleanText(source.createdAt ?? source.created_at),
  };
}

function normalizePriceSnapshot(snapshot, orderLine) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    priceSnapshotId: cleanText(source.priceSnapshotId ?? source.id ?? source.price_snapshot_id),
    orderLineId: cleanText(source.orderLineId ?? source.order_line_id) || orderLine.id,
    snapshotType: cleanText(source.snapshotType ?? source.snapshot_type) || "order_confirm",
    versionNo: toFiniteInteger(source.versionNo ?? source.version_no, 1),
    bagPrice: toFiniteNumber(source.bagPrice ?? source.bag_price, 0),
    printPrice: toFiniteNumber(source.printPrice ?? source.print_price, 0),
    otherFee: toFiniteNumber(source.otherFee ?? source.other_fee, 0),
    adjustmentAmount: toFiniteNumber(source.adjustmentAmount ?? source.adjustment_amount, 0),
    chargeableQty: toFiniteInteger(source.chargeableQty ?? source.chargeable_qty ?? orderLine.qty, orderLine.qty),
    finalAmount: toFiniteNumber(source.finalAmount ?? source.final_amount ?? source.amount ?? orderLine.amount, orderLine.amount),
    amount: toFiniteNumber(source.amount ?? source.finalAmount ?? source.final_amount ?? orderLine.amount, orderLine.amount),
    overrideReason: cleanText(source.overrideReason ?? source.override_reason),
    createdBy: cleanText(source.createdBy ?? source.created_by),
    createdAt: cleanText(source.createdAt ?? source.created_at),
  };
}

function normalizeInventoryTrace(item) {
  if (!item || typeof item !== "object") return null;
  const inventoryItemId = cleanText(item.inventoryItemId ?? item.inventory_item_id);
  if (!inventoryItemId && !cleanText(item.reservationId ?? item.id)) return null;
  return {
    reservationId: cleanText(item.reservationId ?? item.id),
    inventoryItemId,
    inventoryKey: cleanText(item.inventoryKey ?? item.inventory_key),
    zone: cleanText(item.zone),
    state: cleanText(item.state ?? item.inventoryState ?? item.inventory_state),
    trustLevel: cleanText(item.trustLevel ?? item.trust_level),
    reservedQty: toFiniteInteger(item.reservedQty ?? item.reserved_qty ?? item.qty, 0),
    availableQty: toFiniteInteger(item.availableQty ?? item.available_qty ?? item.available, 0),
    ledgerIds: toStringArray(item.ledgerIds ?? item.ledger_ids),
  };
}

function normalizeFulfillmentTrace(item) {
  if (!item || typeof item !== "object") return null;
  const fulfillmentId = cleanText(item.fulfillmentId ?? item.id);
  if (!fulfillmentId) return null;
  return {
    fulfillmentId,
    orderLineId: cleanText(item.orderLineId ?? item.order_line_id ?? item.lineId),
    method: cleanText(item.method),
    status: cleanText(item.status),
    expectedQty: toFiniteInteger(item.expectedQty ?? item.expected_qty ?? item.qty, 0),
    actualQty: item.actualQty ?? item.actual_qty,
    latestNeededAt: cleanText(item.latestNeededAt ?? item.latest_needed_at ?? item.latest),
  };
}

function normalizeStatementTrace(item) {
  if (!item || typeof item !== "object") return null;
  const statementId = cleanText(item.statementId ?? item.id);
  if (!statementId) return null;
  return {
    statementId,
    period: cleanText(item.period),
    status: cleanText(item.status),
    receivable: toFiniteNumber(item.receivable ?? item.receivable_amount, 0),
    received: toFiniteNumber(item.received ?? item.received_amount, 0),
    variance: toFiniteNumber(item.variance ?? item.variance_amount, 0),
  };
}

function toLocalFulfillmentTrace(item) {
  return normalizeFulfillmentTrace({
    fulfillmentId: item.id,
    orderLineId: item.lineId,
    method: item.method,
    status: item.status,
    expectedQty: item.qty,
    actualQty: item.actualQty,
    latestNeededAt: item.latest,
  });
}

function toLocalInventoryTrace(workspace, reservation) {
  const item = (workspace.inventories ?? []).find((inventory) => inventory.id === reservation.inventoryItemId);
  return normalizeInventoryTrace({
    reservationId: reservation.id ?? reservation.reservationId,
    inventoryItemId: reservation.inventoryItemId,
    inventoryKey: item?.inventoryKey ?? item?.id ?? reservation.inventoryItemId,
    zone: item?.zone,
    state: item?.state,
    trustLevel: item?.trust,
    reservedQty: reservation.reservedQty ?? reservation.qty,
    availableQty: item?.available,
    ledgerIds: [],
  });
}

function toLocalStatementTrace(statement) {
  return normalizeStatementTrace({
    statementId: statement.id,
    period: statement.period,
    status: statement.status,
    receivable: statement.receivable,
    received: statement.received,
    variance: statement.variance,
  });
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

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
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

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number;
}
