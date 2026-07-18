import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export function createProductionPackingReadRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_PRODUCTION_PACKING_READ_STORE ??
    process.env.ERP_PRODUCTION_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresProductionPackingReadRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalProductionPackingReadRepository();
  throw new Error(`Unsupported production packing read repository mode: ${mode}`);
}

export function createLocalProductionPackingReadRepository() {
  return {
    kind: "local_memory",

    listProductionTasks({ workspace, query } = {}) {
      return buildProductionTaskListFromWorkspace(workspace, query);
    },

    listPackingTasks({ workspace, query } = {}) {
      return buildPackingTaskListFromWorkspace(workspace, query);
    },

    getProductionTaskDetail({ workspace, productionTaskId }) {
      return buildProductionTaskDetailFromWorkspace(workspace, productionTaskId);
    },

    getPackingTaskDetail({ workspace, packingTaskId }) {
      return buildPackingTaskDetailFromWorkspace(workspace, packingTaskId);
    },
  };
}

export function createPostgresProductionPackingReadRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));

  return {
    kind: "postgres",

    async listProductionTasks({ query } = {}) {
      const builtQuery = buildListProductionTasksQuery({ query });
      return normalizeProductionTaskListResponse(await queryJson(builtQuery.text, builtQuery.values));
    },

    async listPackingTasks({ query } = {}) {
      const builtQuery = buildListPackingTasksQuery({ query });
      return normalizePackingTaskListResponse(await queryJson(builtQuery.text, builtQuery.values));
    },

    async getProductionTaskDetail({ productionTaskId }) {
      const builtQuery = buildFindProductionTaskDetailQuery({ productionTaskId });
      return normalizeProductionTaskDetail(await queryJson(builtQuery.text, builtQuery.values));
    },

    async getPackingTaskDetail({ packingTaskId }) {
      const builtQuery = buildFindPackingTaskDetailQuery({ packingTaskId });
      return normalizePackingTaskDetail(await queryJson(builtQuery.text, builtQuery.values));
    },
  };
}

export function buildListProductionTasksSql({ query } = {}) {
  return buildListProductionTasksQuery({ query }).text;
}

export function buildListProductionTasksQuery({ query } = {}) {
  const filters = normalizeListQuery(query);
  const parameters = createPostgresParameterBinder();
  const whereSql = buildProductionTaskListWhereSql(filters, parameters);
  return {
    text: `
WITH filtered_production_tasks AS (
  SELECT task.*
  FROM production_tasks AS task
  LEFT JOIN order_lines AS line ON line.id = task.order_line_id
  ${whereSql}
),
total_count AS (
  SELECT COUNT(*)::int AS total
  FROM filtered_production_tasks
),
paged_production_tasks AS (
  SELECT *
  FROM filtered_production_tasks
  ORDER BY created_at DESC NULLS LAST, id DESC
  LIMIT ${parameters.integer(filters.pageSize)}
  OFFSET ${parameters.integer(filters.offset)}
),
list_items AS (
  SELECT
    task.created_at AS sort_created_at,
    task.id AS item_id,
    json_build_object(
      'productionTaskId', task.id,
      'orderLineId', task.order_line_id,
      'productionTask', ${productionTaskJsonExpression("task")},
      'orderLine', ${orderLineJsonExpression("line")},
      'latestReport', (
        SELECT ${workshopReportJsonExpression("report")}
        FROM workshop_reports AS report
        WHERE report.production_task_id = task.id
           OR report.order_line_id = task.order_line_id
        ORDER BY report.completed_at DESC NULLS LAST, report.created_at DESC, report.id DESC
        LIMIT 1
      ),
      'latestException', (
        SELECT ${productionExceptionJsonExpression("exception_record")}
        FROM production_exception_records AS exception_record
        WHERE exception_record.production_task_id = task.id
        ORDER BY exception_record.occurred_at DESC, exception_record.created_at DESC, exception_record.id DESC
        LIMIT 1
      ),
      'packingTask', (
        SELECT ${packingTaskJsonExpression("packing_task")}
        FROM packing_tasks AS packing_task
        WHERE packing_task.order_line_id = task.order_line_id
        ORDER BY packing_task.created_at DESC, packing_task.id DESC
        LIMIT 1
      ),
      'inventoryItem', (
        SELECT ${inventoryItemJsonExpression("item")}
        FROM (
          SELECT inventory_item.*, COALESCE(color.name, inventory_item.standard_color_id, '') AS color_name
          FROM inventory_items AS inventory_item
          LEFT JOIN standard_colors AS color ON color.id = inventory_item.standard_color_id
          WHERE inventory_item.id = (
            SELECT reservation.inventory_item_id
            FROM inventory_reservations AS reservation
            WHERE reservation.order_line_id = task.order_line_id
            ORDER BY reservation.created_at DESC, reservation.id DESC
            LIMIT 1
          )
          OR (
            inventory_item.size = line.size
            AND COALESCE(color.name, inventory_item.standard_color_id, '') = COALESCE(line.bag_color, '')
            AND inventory_item.handle_type = COALESCE(line.handle_type, '')
            AND inventory_item.style = COALESCE(line.style, '')
          )
          ORDER BY inventory_item.updated_at DESC, inventory_item.id DESC
          LIMIT 1
        ) AS item
      ),
      'reservations', (
        SELECT COALESCE(json_agg(${inventoryReservationJsonExpression("reservation")} ORDER BY reservation.created_at DESC, reservation.id DESC), '[]'::json)
        FROM inventory_reservations AS reservation
        WHERE reservation.order_line_id = task.order_line_id
      )
    ) AS result
  FROM paged_production_tasks AS task
  LEFT JOIN order_lines AS line ON line.id = task.order_line_id
)
SELECT json_build_object(
  'items', COALESCE((SELECT json_agg(result ORDER BY sort_created_at DESC NULLS LAST, item_id DESC) FROM list_items), '[]'::json),
  'page', ${parameters.integer(filters.page)},
  'pageSize', ${parameters.integer(filters.pageSize)},
  'total', (SELECT total FROM total_count)
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildListPackingTasksSql({ query } = {}) {
  return buildListPackingTasksQuery({ query }).text;
}

export function buildListPackingTasksQuery({ query } = {}) {
  const filters = normalizeListQuery(query);
  const parameters = createPostgresParameterBinder();
  const whereSql = buildPackingTaskListWhereSql(filters, parameters);
  return {
    text: `
WITH filtered_packing_tasks AS (
  SELECT task.*
  FROM packing_tasks AS task
  LEFT JOIN order_lines AS line ON line.id = task.order_line_id
  ${whereSql}
),
total_count AS (
  SELECT COUNT(*)::int AS total
  FROM filtered_packing_tasks
),
paged_packing_tasks AS (
  SELECT *
  FROM filtered_packing_tasks
  ORDER BY created_at DESC NULLS LAST, id DESC
  LIMIT ${parameters.integer(filters.pageSize)}
  OFFSET ${parameters.integer(filters.offset)}
),
list_items AS (
  SELECT
    task.created_at AS sort_created_at,
    task.id AS item_id,
    json_build_object(
      'packingTaskId', task.id,
      'orderLineId', task.order_line_id,
      'packingTask', ${packingTaskJsonExpression("task")},
      'orderLine', ${orderLineJsonExpression("line")},
      'packages', (
        SELECT COALESCE(json_agg(${packageJsonExpression("pkg")} ORDER BY pkg.package_seq ASC, pkg.id ASC), '[]'::json)
        FROM packages AS pkg
        WHERE pkg.order_line_id = task.order_line_id
      ),
      'packageCount', (
        SELECT COUNT(*)::int
        FROM packages AS pkg
        WHERE pkg.order_line_id = task.order_line_id
      ),
      'fulfillment', (
        SELECT ${fulfillmentJsonExpression("fulfillment")}
        FROM fulfillment_records AS fulfillment
        WHERE fulfillment.order_line_id = task.order_line_id
        ORDER BY fulfillment.created_at DESC, fulfillment.id DESC
        LIMIT 1
      ),
      'inventoryItem', (
        SELECT ${inventoryItemJsonExpression("item")}
        FROM (
          SELECT inventory_item.*, COALESCE(color.name, inventory_item.standard_color_id, '') AS color_name
          FROM inventory_items AS inventory_item
          LEFT JOIN standard_colors AS color ON color.id = inventory_item.standard_color_id
          WHERE inventory_item.size = line.size
            AND COALESCE(color.name, inventory_item.standard_color_id, '') = COALESCE(line.bag_color, '')
            AND inventory_item.handle_type = COALESCE(line.handle_type, '')
            AND inventory_item.style = COALESCE(line.style, '')
          ORDER BY inventory_item.updated_at DESC, inventory_item.id DESC
          LIMIT 1
        ) AS item
      ),
      'inventoryDeducted', false
    ) AS result
  FROM paged_packing_tasks AS task
  LEFT JOIN order_lines AS line ON line.id = task.order_line_id
)
SELECT json_build_object(
  'items', COALESCE((SELECT json_agg(result ORDER BY sort_created_at DESC NULLS LAST, item_id DESC) FROM list_items), '[]'::json),
  'page', ${parameters.integer(filters.page)},
  'pageSize', ${parameters.integer(filters.pageSize)},
  'total', (SELECT total FROM total_count)
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindProductionTaskDetailSql({ productionTaskId }) {
  return buildFindProductionTaskDetailQuery({ productionTaskId }).text;
}

export function buildFindProductionTaskDetailQuery({ productionTaskId }) {
  const id = cleanText(productionTaskId);
  if (!id) throw new Error("productionTaskId is required");
  const parameters = createPostgresParameterBinder();
  const productionTaskIdParameter = parameters.text(id);
  return {
    text: `
WITH direct_production_task AS (
  SELECT task.*
  FROM production_tasks AS task
  WHERE task.id = ${productionTaskIdParameter}
     OR task.biz_no = ${productionTaskIdParameter}
  ORDER BY task.created_at DESC, task.id DESC
  LIMIT 1
),
report_production_task AS (
  SELECT task.*
  FROM workshop_reports AS report
  JOIN production_tasks AS task ON task.id = report.production_task_id
  WHERE report.id = ${productionTaskIdParameter}
  ORDER BY report.created_at DESC, report.id DESC
  LIMIT 1
),
selected_production_task AS (
  SELECT *
  FROM direct_production_task
  UNION ALL
  SELECT *
  FROM report_production_task
  WHERE NOT EXISTS (SELECT 1 FROM direct_production_task)
  LIMIT 1
),
selected_order_line AS (
  SELECT line.*
  FROM order_lines AS line
  WHERE line.id = (SELECT order_line_id FROM selected_production_task)
  LIMIT 1
),
selected_reports AS (
  SELECT COALESCE(json_agg(${workshopReportJsonExpression("report")} ORDER BY report.completed_at DESC NULLS LAST, report.created_at DESC, report.id DESC), '[]'::json) AS result
  FROM workshop_reports AS report
  WHERE report.production_task_id = (SELECT id FROM selected_production_task)
     OR report.order_line_id = (SELECT order_line_id FROM selected_production_task)
),
selected_production_exceptions AS (
  SELECT COALESCE(json_agg(${productionExceptionJsonExpression("exception_record")} ORDER BY exception_record.occurred_at DESC, exception_record.created_at DESC, exception_record.id DESC), '[]'::json) AS result
  FROM production_exception_records AS exception_record
  WHERE exception_record.production_task_id = (SELECT id FROM selected_production_task)
),
selected_packing_task AS (
  SELECT task.*
  FROM packing_tasks AS task
  WHERE task.order_line_id = (SELECT order_line_id FROM selected_production_task)
  ORDER BY task.created_at DESC, task.id DESC
  LIMIT 1
),
selected_reservations AS (
  SELECT COALESCE(json_agg(${inventoryReservationJsonExpression("reservation")} ORDER BY reservation.created_at DESC, reservation.id DESC), '[]'::json) AS result
  FROM inventory_reservations AS reservation
  WHERE reservation.order_line_id = (SELECT order_line_id FROM selected_production_task)
),
selected_inventory_ledger_entries AS (
  SELECT COALESCE(json_agg(${inventoryLedgerJsonExpression("entry")} ORDER BY entry.occurred_at DESC, entry.created_at DESC, entry.id DESC), '[]'::json) AS result
  FROM ${productionPackingLedgerProjectionSql()} AS entry
  WHERE entry.source_type IN ('production_report', 'production_report_reservation')
    AND (
      entry.source_id = (SELECT id FROM selected_production_task)
      OR entry.source_id IN (
        SELECT report.id
        FROM workshop_reports AS report
        WHERE report.production_task_id = (SELECT id FROM selected_production_task)
           OR report.order_line_id = (SELECT order_line_id FROM selected_production_task)
      )
    )
),
selected_inventory_item AS (
  SELECT item.*, COALESCE(color.name, item.standard_color_id, '') AS color_name
  FROM inventory_items AS item
  LEFT JOIN standard_colors AS color ON color.id = item.standard_color_id
  WHERE item.id = COALESCE(
    (
      SELECT ledger.inventory_item_id
      FROM inventory_ledger_entries AS ledger
      WHERE ledger.source_type IN ('production_report', 'production_report_reservation')
        AND (
          ledger.source_id = (SELECT id FROM selected_production_task)
          OR ledger.source_id IN (
            SELECT report.id
            FROM workshop_reports AS report
            WHERE report.production_task_id = (SELECT id FROM selected_production_task)
               OR report.order_line_id = (SELECT order_line_id FROM selected_production_task)
          )
        )
      ORDER BY ledger.occurred_at DESC, ledger.created_at DESC, ledger.id DESC
      LIMIT 1
    ),
    (
      SELECT reservation.inventory_item_id
      FROM inventory_reservations AS reservation
      WHERE reservation.order_line_id = (SELECT order_line_id FROM selected_production_task)
      ORDER BY reservation.created_at DESC, reservation.id DESC
      LIMIT 1
    )
  )
  OR (
    item.size = (SELECT size FROM selected_order_line)
    AND COALESCE(color.name, item.standard_color_id, '') = COALESCE((SELECT bag_color FROM selected_order_line), '')
    AND item.handle_type = COALESCE((SELECT handle_type FROM selected_order_line), '')
    AND item.style = COALESCE((SELECT style FROM selected_order_line), '')
  )
  ORDER BY item.updated_at DESC, item.id DESC
  LIMIT 1
),
selected_operation_logs AS (
  SELECT COALESCE(json_agg(${operationLogJsonExpression("log")} ORDER BY log.occurred_at DESC, log.created_at DESC, log.id DESC), '[]'::json) AS result
  FROM operation_logs AS log
  WHERE log.target_type = 'production_task'
    AND log.target_id = (SELECT id FROM selected_production_task)
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM selected_production_task) THEN NULL
  ELSE json_build_object(
    'productionTaskId', (SELECT id FROM selected_production_task),
    'orderLineId', (SELECT order_line_id FROM selected_production_task),
    'productionTask', (SELECT ${productionTaskJsonExpression("task")} FROM selected_production_task AS task),
    'orderLine', (SELECT ${orderLineJsonExpression("line")} FROM selected_order_line AS line),
    'reports', (SELECT result FROM selected_reports),
    'exceptions', (SELECT result FROM selected_production_exceptions),
    'latestReport', (
      SELECT ${workshopReportJsonExpression("report")}
      FROM workshop_reports AS report
      WHERE report.production_task_id = (SELECT id FROM selected_production_task)
         OR report.order_line_id = (SELECT order_line_id FROM selected_production_task)
      ORDER BY report.completed_at DESC NULLS LAST, report.created_at DESC, report.id DESC
      LIMIT 1
    ),
    'packingTask', (SELECT ${packingTaskJsonExpression("task")} FROM selected_packing_task AS task),
    'inventoryItem', (SELECT ${inventoryItemJsonExpression("item")} FROM selected_inventory_item AS item),
    'reservations', (SELECT result FROM selected_reservations),
    'inventoryLedgerEntries', (SELECT result FROM selected_inventory_ledger_entries),
    'operationLogs', (SELECT result FROM selected_operation_logs)
  )
END AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindPackingTaskDetailSql({ packingTaskId }) {
  return buildFindPackingTaskDetailQuery({ packingTaskId }).text;
}

export function buildFindPackingTaskDetailQuery({ packingTaskId }) {
  const id = cleanText(packingTaskId);
  if (!id) throw new Error("packingTaskId is required");
  const parameters = createPostgresParameterBinder();
  const packingTaskIdParameter = parameters.text(id);
  return {
    text: `
WITH selected_packing_task AS (
  SELECT task.*
  FROM packing_tasks AS task
  WHERE task.id = ${packingTaskIdParameter}
     OR task.biz_no = ${packingTaskIdParameter}
  ORDER BY task.created_at DESC, task.id DESC
  LIMIT 1
),
selected_order_line AS (
  SELECT line.*
  FROM order_lines AS line
  WHERE line.id = (SELECT order_line_id FROM selected_packing_task)
  LIMIT 1
),
selected_packages AS (
  SELECT COALESCE(json_agg(${packageJsonExpression("pkg")} ORDER BY pkg.package_seq ASC, pkg.id ASC), '[]'::json) AS result
  FROM packages AS pkg
  WHERE pkg.order_line_id = (SELECT order_line_id FROM selected_packing_task)
),
selected_fulfillment AS (
  SELECT fulfillment.*
  FROM fulfillment_records AS fulfillment
  WHERE fulfillment.order_line_id = (SELECT order_line_id FROM selected_packing_task)
  ORDER BY fulfillment.created_at DESC, fulfillment.id DESC
  LIMIT 1
),
selected_inventory_ledger_entries AS (
  SELECT COALESCE(json_agg(${inventoryLedgerJsonExpression("entry")} ORDER BY entry.occurred_at DESC, entry.created_at DESC, entry.id DESC), '[]'::json) AS result
  FROM ${productionPackingLedgerProjectionSql()} AS entry
  WHERE entry.source_type = 'packing_complete'
    AND entry.source_id = (SELECT id FROM selected_packing_task)
),
selected_inventory_item AS (
  SELECT item.*, COALESCE(color.name, item.standard_color_id, '') AS color_name
  FROM inventory_items AS item
  LEFT JOIN standard_colors AS color ON color.id = item.standard_color_id
  WHERE item.id = (
    SELECT ledger.inventory_item_id
    FROM inventory_ledger_entries AS ledger
    WHERE ledger.source_type = 'packing_complete'
      AND ledger.source_id = (SELECT id FROM selected_packing_task)
    ORDER BY ledger.occurred_at DESC, ledger.created_at DESC, ledger.id DESC
    LIMIT 1
  )
  OR (
    item.size = (SELECT size FROM selected_order_line)
    AND COALESCE(color.name, item.standard_color_id, '') = COALESCE((SELECT bag_color FROM selected_order_line), '')
    AND item.handle_type = COALESCE((SELECT handle_type FROM selected_order_line), '')
    AND item.style = COALESCE((SELECT style FROM selected_order_line), '')
  )
  ORDER BY item.updated_at DESC, item.id DESC
  LIMIT 1
),
selected_operation_logs AS (
  SELECT COALESCE(json_agg(${operationLogJsonExpression("log")} ORDER BY log.occurred_at DESC, log.created_at DESC, log.id DESC), '[]'::json) AS result
  FROM operation_logs AS log
  WHERE log.target_type = 'packing_task'
    AND log.target_id = (SELECT id FROM selected_packing_task)
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM selected_packing_task) THEN NULL
  ELSE json_build_object(
    'packingTaskId', (SELECT id FROM selected_packing_task),
    'orderLineId', (SELECT order_line_id FROM selected_packing_task),
    'packingTask', (SELECT ${packingTaskJsonExpression("task")} FROM selected_packing_task AS task),
    'orderLine', (SELECT ${orderLineJsonExpression("line")} FROM selected_order_line AS line),
    'packages', (SELECT result FROM selected_packages),
    'fulfillment', (SELECT ${fulfillmentJsonExpression("fulfillment")} FROM selected_fulfillment AS fulfillment),
    'inventoryItem', (SELECT ${inventoryItemJsonExpression("item")} FROM selected_inventory_item AS item),
    'inventoryLedgerEntries', (SELECT result FROM selected_inventory_ledger_entries),
    'operationLogs', (SELECT result FROM selected_operation_logs),
    'inventoryDeducted', false
  )
END AS result;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeProductionTaskListResponse(value) {
  return normalizeListResponse(value, normalizeProductionTaskListItem);
}

export function normalizePackingTaskListResponse(value) {
  return normalizeListResponse(value, normalizePackingTaskListItem);
}

export function normalizeProductionTaskDetail(value) {
  if (!value || typeof value !== "object") return null;
  const productionTask = normalizeProductionTaskSummary(value.productionTask ?? value.production_task ?? value);
  if (!productionTask?.productionTaskId) return null;
  const reports = normalizeArray(value.reports).map(normalizeWorkshopReportSummary).filter(Boolean).sort(sortByLatestDate);
  const exceptions = normalizeArray(value.exceptions ?? value.productionExceptions ?? value.production_exceptions)
    .map(normalizeProductionExceptionSummary)
    .filter(Boolean)
    .sort(sortByLatestDate);
  const latestException = normalizeProductionExceptionSummary(value.latestException ?? value.latest_exception) ?? exceptions[0] ?? null;
  const latestReport = normalizeWorkshopReportSummary(value.latestReport ?? value.latest_report) ?? reports[0] ?? null;
  const packingTask = normalizePackingTaskSummary(value.packingTask ?? value.packing_task);
  const reservations = normalizeArray(value.reservations).map(normalizeInventoryReservationSummary).filter(Boolean);
  const inventoryLedgerEntries = normalizeArray(value.inventoryLedgerEntries ?? value.inventory_ledger_entries)
    .map(normalizeInventoryLedgerSummary)
    .filter(Boolean)
    .sort(sortByLatestDate);
  return {
    productionTaskId: cleanText(value.productionTaskId ?? value.production_task_id ?? productionTask.productionTaskId),
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id ?? productionTask.orderLineId),
    productionTask,
    orderLine: normalizeOrderLineSummary(value.orderLine ?? value.order_line),
    finishedGoodsPhoto: normalizeFinishedGoodsPhotoSummary(
      value.finishedGoodsPhoto ?? value.finished_goods_photo ?? productionTask.finishedGoodsPhoto,
    ),
    reports,
    latestReport,
    exceptions,
    latestException,
    dailyProgress: normalizeProductionDailyProgressSummary(value.dailyProgress ?? value.daily_progress) ?? buildProductionDailyProgressSummary({
      productionTask,
      reports,
    }),
    packingTask,
    inventoryItem: normalizeInventoryItemSummary(value.inventoryItem ?? value.inventory_item),
    reservations,
    inventoryLedgerEntries,
    operationLogs: normalizeArray(value.operationLogs ?? value.operation_logs).map(normalizeOperationLogSummary).filter(Boolean),
  };
}

export function normalizePackingTaskDetail(value) {
  if (!value || typeof value !== "object") return null;
  const packingTask = normalizePackingTaskSummary(value.packingTask ?? value.packing_task ?? value);
  if (!packingTask?.packingTaskId) return null;
  return {
    packingTaskId: cleanText(value.packingTaskId ?? value.packing_task_id ?? packingTask.packingTaskId),
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id ?? packingTask.orderLineId),
    packingTask,
    orderLine: normalizeOrderLineSummary(value.orderLine ?? value.order_line),
    packages: normalizeArray(value.packages).map(normalizePackageSummary).filter(Boolean).sort(sortPackageSeqAsc),
    fulfillment: normalizeFulfillmentSummary(value.fulfillment),
    inventoryItem: normalizeInventoryItemSummary(value.inventoryItem ?? value.inventory_item),
    inventoryLedgerEntries: normalizeArray(value.inventoryLedgerEntries ?? value.inventory_ledger_entries)
      .map(normalizeInventoryLedgerSummary)
      .filter(Boolean)
      .sort(sortByLatestDate),
    operationLogs: normalizeArray(value.operationLogs ?? value.operation_logs).map(normalizeOperationLogSummary).filter(Boolean),
    inventoryDeducted: value.inventoryDeducted === true || value.inventory_deducted === true,
  };
}

function normalizeProductionTaskListItem(value) {
  if (!value || typeof value !== "object") return null;
  const latestReport = value.latestReport ?? value.latest_report;
  const detail = normalizeProductionTaskDetail({
    ...value,
    reports: value.reports ?? (latestReport ? [latestReport] : []),
  });
  if (!detail) return null;
  return detail;
}

function normalizePackingTaskListItem(value) {
  if (!value || typeof value !== "object") return null;
  const detail = normalizePackingTaskDetail(value);
  if (!detail) return null;
  const packageCount = Math.max(
    detail.packages.length,
    toFiniteInteger(value.packageCount ?? value.package_count ?? detail.packingTask?.packageCount),
  );
  return {
    ...detail,
    packageCount,
    packingTask: detail.packingTask
      ? {
          ...detail.packingTask,
          packageCount,
        }
      : null,
    inventoryDeducted: false,
  };
}

function normalizeListResponse(value, mapItem) {
  const source = value && typeof value === "object" ? value : {};
  const items = normalizeArray(source.items).map(mapItem).filter(Boolean);
  return {
    items,
    page: positiveInteger(source.page, 1),
    pageSize: positiveInteger(source.pageSize ?? source.page_size, items.length || 50),
    total: toFiniteInteger(source.total, items.length),
  };
}

function buildProductionTaskListFromWorkspace(workspace = {}, query) {
  const filters = normalizeListQuery(query);
  const items = (workspace.productionTasks ?? [])
    .map((task) => buildProductionTaskListItemFromWorkspace(workspace, task))
    .filter(Boolean)
    .filter((item) => matchesProductionTaskListFilters(item, filters))
    .sort(sortProductionPackingListItems);
  return paginateListItems(items, filters);
}

function buildPackingTaskListFromWorkspace(workspace = {}, query) {
  const filters = normalizeListQuery(query);
  const items = (workspace.packingTasks ?? [])
    .map((task) => buildPackingTaskListItemFromWorkspace(workspace, task))
    .filter(Boolean)
    .filter((item) => matchesPackingTaskListFilters(item, filters))
    .sort(sortProductionPackingListItems);
  return paginateListItems(items, filters);
}

function buildProductionTaskListItemFromWorkspace(workspace, task) {
  const productionTaskId = cleanText(task?.productionTaskId ?? task?.id);
  if (!productionTaskId) return null;
  return normalizeProductionTaskListItem(buildProductionTaskDetailFromWorkspace(workspace, productionTaskId));
}

function buildPackingTaskListItemFromWorkspace(workspace, task) {
  const packingTaskId = cleanText(task?.packingTaskId ?? task?.id);
  if (!packingTaskId) return null;
  const detail = buildPackingTaskDetailFromWorkspace(workspace, packingTaskId);
  if (!detail) return null;
  return normalizePackingTaskListItem({
    ...detail,
    packageCount: detail.packages.length,
  });
}

function buildProductionTaskDetailFromWorkspace(workspace = {}, productionTaskId) {
  const productionTask =
    findProductionTask(workspace, productionTaskId) ??
    findProductionTaskByReportId(workspace, productionTaskId);
  if (!productionTask) return null;

  const resolvedProductionTaskId = cleanText(productionTask.productionTaskId ?? productionTask.id);
  const orderLineId = cleanText(productionTask.orderLineId ?? productionTask.lineId);
  const orderLine = findOrderLine(workspace, orderLineId);
  const reports = (workspace.workshopReports ?? [])
    .filter((report) => report.productionTaskId === resolvedProductionTaskId || report.orderLineId === orderLineId)
    .map(normalizeWorkshopReportSummary)
    .filter(Boolean)
    .sort(sortByLatestDate);
  const reportIds = new Set(reports.map((report) => report.reportId).filter(Boolean));
  const exceptions = (workspace.productionExceptions ?? [])
    .filter((record) => cleanText(record.productionTaskId ?? record.production_task_id) === resolvedProductionTaskId)
    .map(normalizeProductionExceptionSummary)
    .filter(Boolean)
    .sort(sortByLatestDate);
  const packingTask =
    (workspace.packingTasks ?? []).find((task) => cleanText(task.orderLineId ?? task.lineId) === orderLineId) ?? null;
  const inventoryLedgerEntries = (workspace.inventoryLedgers ?? [])
    .filter((entry) => {
      const sourceType = cleanText(entry.sourceType ?? entry.source_type);
      const sourceId = cleanText(entry.sourceId ?? entry.source_id);
      return (
        (sourceType === "production_report" || sourceType === "production_report_reservation") &&
        (reportIds.has(sourceId) || sourceId === resolvedProductionTaskId)
      );
    })
    .map((entry) => normalizeInventoryLedgerSummary(entry, { inventoryItem: findInventoryItem(workspace, entry.inventoryItemId ?? entry.inventory_item_id), users: workspace.users }))
    .filter(Boolean)
    .sort(sortByLatestDate);
  const reservations = (workspace.inventoryReservations ?? [])
    .filter((reservation) => reservation.orderLineId === orderLineId)
    .map(normalizeInventoryReservationSummary)
    .filter(Boolean);
  const inventoryItem = resolveWorkspaceInventoryItem(workspace, {
    orderLine,
    inventoryLedgerEntries,
    reservations,
  });
  const operationLogs = (workspace.operationLogs ?? [])
    .filter((log) => log.targetType === "production_task" && log.targetId === resolvedProductionTaskId)
    .map(normalizeOperationLogSummary)
    .filter(Boolean)
    .sort(sortByLatestDate);
  const dailyProgress = buildProductionDailyProgressSummary({
    productionTask,
    reports,
  });

  return normalizeProductionTaskDetail({
    productionTaskId: resolvedProductionTaskId,
    orderLineId,
    productionTask: normalizeProductionTaskSummary(productionTask, orderLine),
    orderLine: normalizeOrderLineSummary(orderLine),
    finishedGoodsPhoto: buildFinishedGoodsPhotoSummary(productionTask, orderLine),
    reports,
    latestReport: reports[0] ?? null,
    exceptions,
    latestException: exceptions[0] ?? null,
    dailyProgress,
    packingTask: packingTask ? normalizePackingTaskSummary(packingTask) : null,
    inventoryItem: inventoryItem ? normalizeInventoryItemSummary(inventoryItem) : null,
    reservations,
    inventoryLedgerEntries,
    operationLogs,
  });
}

function buildPackingTaskDetailFromWorkspace(workspace = {}, packingTaskId) {
  const packingTask = findPackingTask(workspace, packingTaskId);
  if (!packingTask) return null;

  const resolvedPackingTaskId = cleanText(packingTask.packingTaskId ?? packingTask.id);
  const orderLineId = cleanText(packingTask.orderLineId ?? packingTask.lineId);
  const orderLine = findOrderLine(workspace, orderLineId);
  const packages = (workspace.packages ?? [])
    .filter((record) => record.packingTaskId === resolvedPackingTaskId || record.orderLineId === orderLineId)
    .map(normalizePackageSummary)
    .filter(Boolean)
    .sort(sortPackageSeqAsc);
  const fulfillment = findFulfillmentByOrderLineId(workspace, orderLineId);
  const inventoryLedgerEntries = (workspace.inventoryLedgers ?? [])
    .filter((entry) => cleanText(entry.sourceType ?? entry.source_type) === "packing_complete" && cleanText(entry.sourceId ?? entry.source_id) === resolvedPackingTaskId)
    .map((entry) => normalizeInventoryLedgerSummary(entry, { inventoryItem: findInventoryItem(workspace, entry.inventoryItemId ?? entry.inventory_item_id), users: workspace.users }))
    .filter(Boolean)
    .sort(sortByLatestDate);
  const inventoryItem = resolveWorkspaceInventoryItem(workspace, {
    orderLine,
    inventoryLedgerEntries,
    reservations: [],
  });
  const operationLogs = (workspace.operationLogs ?? [])
    .filter((log) => log.targetType === "packing_task" && log.targetId === resolvedPackingTaskId)
    .map(normalizeOperationLogSummary)
    .filter(Boolean)
    .sort(sortByLatestDate);

  return normalizePackingTaskDetail({
    packingTaskId: resolvedPackingTaskId,
    orderLineId,
    packingTask: normalizePackingTaskSummary(packingTask),
    orderLine: normalizeOrderLineSummary(orderLine),
    packages,
    fulfillment: fulfillment ? normalizeFulfillmentSummary(fulfillment) : null,
    inventoryItem: inventoryItem ? normalizeInventoryItemSummary(inventoryItem) : null,
    inventoryLedgerEntries,
    operationLogs,
    inventoryDeducted: false,
  });
}

function findProductionTaskByReportId(workspace, reportId) {
  const report = (workspace.workshopReports ?? []).find((item) => item.reportId === reportId || item.id === reportId);
  return report ? findProductionTask(workspace, report.productionTaskId) : null;
}

function findProductionTask(workspace, id) {
  return (workspace.productionTasks ?? []).find((item) => item.id === id || item.productionTaskId === id);
}

function findPackingTask(workspace, id) {
  return (workspace.packingTasks ?? []).find((item) => item.id === id || item.packingTaskId === id);
}

function findOrderLine(workspace, id) {
  return (workspace.orderLines ?? []).find((item) => item.id === id || item.orderLineId === id) ?? null;
}

function findInventoryItem(workspace, id) {
  return (workspace.inventories ?? []).find((item) => item.id === id) ?? null;
}

function findFulfillmentByOrderLineId(workspace, orderLineId) {
  return (workspace.fulfillments ?? []).find((item) => (item.orderLineId ?? item.lineId) === orderLineId) ?? null;
}

function resolveWorkspaceInventoryItem(workspace, input = {}) {
  const ledgerInventoryItemId = input.inventoryLedgerEntries?.find((entry) => entry.inventoryItemId)?.inventoryItemId;
  if (ledgerInventoryItemId) return findInventoryItem(workspace, ledgerInventoryItemId);
  const reservationInventoryItemId = input.reservations?.find((reservation) => reservation.inventoryItemId)?.inventoryItemId;
  if (reservationInventoryItemId) return findInventoryItem(workspace, reservationInventoryItemId);
  const line = input.orderLine;
  if (!line) return null;
  return (workspace.inventories ?? []).find(
    (item) =>
      item.size === line.size &&
      item.color === (line.bagColor ?? line.color) &&
      (item.handleType ?? item.handle) === (line.handleType ?? line.handle) &&
      item.style === line.style,
  ) ?? null;
}

function normalizeListQuery(query = {}) {
  const page = positiveInteger(getQueryValue(query, "page"), 1);
  const pageSize = Math.min(200, positiveInteger(getQueryValue(query, "pageSize"), 50));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    keyword: cleanText(getQueryValue(query, "keyword")),
    status: normalizeAllFilter(getQueryValue(query, "status")),
    taskType: normalizeAllFilter(getQueryValue(query, "taskType") ?? getQueryValue(query, "processType")),
    machineId: normalizeAllFilter(getQueryValue(query, "machineId") ?? getQueryValue(query, "currentMachineId")),
    visibility: normalizeAllFilter(getQueryValue(query, "visibility")),
  };
}

function getQueryValue(query, key) {
  if (!query) return "";
  if (typeof query.get === "function") return query.get(key);
  if (query instanceof Map) return query.get(key);
  return query[key];
}

function normalizeAllFilter(value) {
  const text = cleanText(value);
  return text && text !== "all" && text !== "全部" ? text : "";
}

function buildProductionTaskListWhereSql(filters, parameters) {
  const conditions = [];
  const statusSql = buildTaskStatusWhereSql("task.task_status", filters.status, parameters);
  if (statusSql) conditions.push(statusSql);
  if (filters.taskType) conditions.push(`task.task_type = ${parameters.text(filters.taskType)}`);
  if (filters.machineId) conditions.push(`task.machine_id = ${parameters.text(filters.machineId)}`);
  if (isWorkshopMobileVisibility(filters.visibility)) {
    conditions.push("task.task_status <> '已完成'");
    conditions.push(buildWorkshopMobileProductionTaskVisibilitySql());
  }
  const keywordSql = buildKeywordWhereSql(
    [
      "task.id",
      "task.biz_no",
      "task.task_type",
      "task.machine_id",
      "task.task_status",
      "line.id",
      "line.order_id",
      "line.customer_id",
      "line.product_name",
      "line.size",
      "line.bag_color",
      "line.handle_type",
      "line.style",
      "line.line_status",
      "line.fulfillment_method",
    ],
    filters.keyword,
    parameters,
  );
  if (keywordSql) conditions.push(keywordSql);
  return conditions.length ? `WHERE ${conditions.join("\n    AND ")}` : "";
}

function buildWorkshopMobileProductionTaskVisibilitySql() {
  return `(
      NULLIF(task.published_schedule_id, '') IS NOT NULL
      OR task.task_status IN ('跨日继续', '待完工确认')
      OR EXISTS (
        SELECT 1
        FROM workshop_reports AS report
        WHERE (report.production_task_id = task.id OR report.order_line_id = task.order_line_id)
          AND report.evidence_json->>'reportKind' = 'daily_progress'
          AND LOWER(COALESCE(report.evidence_json->>'carryOver', 'false')) IN ('true', '1', 'yes')
      )
    )`;
}

function buildPackingTaskListWhereSql(filters, parameters) {
  const conditions = [];
  const statusSql = buildTaskStatusWhereSql("task.status", filters.status, parameters);
  if (statusSql) conditions.push(statusSql);
  const keywordSql = buildKeywordWhereSql(
    [
      "task.id",
      "task.biz_no",
      "task.status",
      "line.id",
      "line.order_id",
      "line.customer_id",
      "line.product_name",
      "line.size",
      "line.bag_color",
      "line.handle_type",
      "line.style",
      "line.line_status",
      "line.fulfillment_method",
    ],
    filters.keyword,
    parameters,
  );
  if (keywordSql) conditions.push(keywordSql);
  return conditions.length ? `WHERE ${conditions.join("\n    AND ")}` : "";
}

function buildTaskStatusWhereSql(column, status, parameters) {
  if (!status) return "";
  if (isOpenStatusFilter(status)) return `${column} <> '已完成'`;
  if (isCompletedStatusFilter(status)) return `${column} = '已完成'`;
  return `${column} = ${parameters.text(status)}`;
}

function buildKeywordWhereSql(expressions, keyword, parameters) {
  if (!keyword) return "";
  const like = parameters.text(`%${keyword}%`);
  return `(${expressions.map((expression) => `COALESCE(${expression}::text, '') ILIKE ${like}`).join(" OR ")})`;
}

function matchesProductionTaskListFilters(item, filters) {
  const task = item.productionTask ?? {};
  if (!matchesTaskStatus(task.taskStatus ?? task.status, filters.status)) return false;
  if (filters.taskType && task.taskType !== filters.taskType) return false;
  if (filters.machineId && cleanText(task.machineId) !== filters.machineId) return false;
  if (isWorkshopMobileVisibility(filters.visibility) && !matchesWorkshopMobileProductionTaskVisibility(item)) return false;
  return matchesListKeyword(item, filters.keyword);
}

function matchesPackingTaskListFilters(item, filters) {
  return matchesTaskStatus(item.packingTask?.status ?? item.status, filters.status) && matchesListKeyword(item, filters.keyword);
}

function matchesTaskStatus(value, status) {
  if (!status) return true;
  const text = cleanText(value);
  if (isOpenStatusFilter(status)) return !isCompletedTaskStatus(text);
  if (isCompletedStatusFilter(status)) return isCompletedTaskStatus(text);
  return text === status;
}

function matchesListKeyword(item, keyword) {
  if (!keyword) return true;
  return JSON.stringify(item).toLowerCase().includes(keyword.toLowerCase());
}

function isOpenStatusFilter(status) {
  const text = cleanText(status).toLowerCase();
  return text === "open" || text === "pending" || text === "active" || text === "未完成" || text === "待处理";
}

function isCompletedStatusFilter(status) {
  const text = cleanText(status).toLowerCase();
  return text === "completed" || text === "done" || text === "closed" || text === "已完成";
}

function isCompletedTaskStatus(status) {
  const text = cleanText(status).toLowerCase();
  return text === "completed" || text === "done" || text === "closed" || cleanText(status).includes("已完成");
}

function isWorkshopMobileVisibility(visibility) {
  const text = cleanText(visibility).toLowerCase();
  return text === "workshop_mobile" || text === "workshop" || text === "车间手机端";
}

function matchesWorkshopMobileProductionTaskVisibility(item) {
  const task = item?.productionTask ?? {};
  const status = cleanText(task.taskStatus ?? task.status);
  if (isCompletedTaskStatus(status)) return false;
  return hasPublishedSchedule(task) || hasCarryOverProductionTask(item);
}

function hasPublishedSchedule(task) {
  return Boolean(cleanText(task?.publishedScheduleId ?? task?.published_schedule_id));
}

function hasCarryOverProductionTask(item) {
  const task = item?.productionTask ?? {};
  const status = cleanText(task.taskStatus ?? task.status);
  const progress = item?.dailyProgress ?? item?.daily_progress;
  return (
    status === "跨日继续" ||
    status === "待完工确认" ||
    progress?.carryOver === true ||
    progress?.carry_over === true ||
    toFiniteInteger(progress?.remainingQty ?? progress?.remaining_qty) > 0
  );
}

function paginateListItems(items, filters) {
  const start = filters.offset;
  return {
    items: items.slice(start, start + filters.pageSize),
    page: filters.page,
    pageSize: filters.pageSize,
    total: items.length,
  };
}

function sortProductionPackingListItems(left, right) {
  const leftDate = getProductionPackingListSortDate(left);
  const rightDate = getProductionPackingListSortDate(right);
  if (leftDate !== rightDate) return rightDate - leftDate;
  return cleanText(right.productionTaskId ?? right.packingTaskId).localeCompare(cleanText(left.productionTaskId ?? left.packingTaskId));
}

function getProductionPackingListSortDate(item) {
  const value = item.productionTask?.createdAt ?? item.packingTask?.createdAt ?? "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function normalizeProductionTaskSummary(task, orderLine = {}) {
  if (!task || typeof task !== "object") return null;
  const productionTaskId = cleanText(task.productionTaskId ?? task.production_task_id ?? task.id);
  if (!productionTaskId) return null;
  return {
    productionTaskId,
    bizNo: cleanText(task.bizNo ?? task.biz_no ?? productionTaskId),
    orderLineId: cleanText(task.orderLineId ?? task.order_line_id ?? task.lineId ?? orderLine?.id),
    taskType: cleanText(task.taskType ?? task.task_type ?? task.processType ?? task.process_type),
    machineId: cleanText(task.machineId ?? task.machine_id),
    publishedScheduleId: cleanText(task.publishedScheduleId ?? task.published_schedule_id),
    plannedQty: toFiniteInteger(task.plannedQty ?? task.planned_qty ?? task.qty ?? orderLine?.qty),
    taskStatus: cleanText(task.taskStatus ?? task.task_status ?? task.status),
    status: cleanText(task.status ?? task.taskStatus ?? task.task_status),
    revision: Math.max(1, toFiniteInteger(task.revision, 1)),
    finishedGoodsPhoto: buildFinishedGoodsPhotoSummary(task, orderLine),
    createdBy: cleanText(task.createdBy ?? task.created_by),
    createdAt: cleanText(task.createdAt ?? task.created_at),
  };
}

function buildFinishedGoodsPhotoSummary(task = {}, orderLine = {}) {
  const sourcePhoto =
    task.finishedGoodsPhoto && typeof task.finishedGoodsPhoto === "object"
      ? task.finishedGoodsPhoto
      : {};
  const attachmentId = cleanText(
    task.finishedGoodsPhotoAttachmentId ??
      task.finished_goods_photo_attachment_id ??
      sourcePhoto.attachmentId,
  );
  const status = cleanText(
    task.finishedGoodsPhotoStatus ??
      task.finished_goods_photo_status ??
      sourcePhoto.status,
  ) || (attachmentId ? "待确认" : "未上传");
  return {
    status,
    required: sourcePhoto.required === true || isFinishedGoodsPhotoRequired(orderLine),
    attachmentId,
    fileName: cleanText(task.finishedGoodsPhotoFileName ?? task.finished_goods_photo_file_name ?? sourcePhoto.fileName),
    uploadedAt: cleanText(task.finishedGoodsPhotoUploadedAt ?? task.finished_goods_photo_uploaded_at ?? sourcePhoto.uploadedAt),
    uploadedBy: cleanText(task.finishedGoodsPhotoUploadedBy ?? task.finished_goods_photo_uploaded_by ?? sourcePhoto.uploadedBy),
    reviewedAt: cleanText(task.finishedGoodsPhotoReviewedAt ?? task.finished_goods_photo_reviewed_at ?? sourcePhoto.reviewedAt),
    reviewedBy: cleanText(task.finishedGoodsPhotoReviewedBy ?? task.finished_goods_photo_reviewed_by ?? sourcePhoto.reviewedBy),
    rejectedReason: cleanText(task.finishedGoodsPhotoRejectedReason ?? task.finished_goods_photo_rejected_reason ?? sourcePhoto.rejectedReason),
    history: normalizeArray(task.finishedGoodsPhotoHistory ?? task.finished_goods_photo_history ?? sourcePhoto.history)
      .map((item) => ({
        status: cleanText(item?.status),
        attachmentId: cleanText(item?.attachmentId ?? item?.attachment_id),
        fileName: cleanText(item?.fileName ?? item?.file_name),
        uploadedAt: cleanText(item?.uploadedAt ?? item?.uploaded_at),
        uploadedBy: cleanText(item?.uploadedBy ?? item?.uploaded_by),
        reviewedAt: cleanText(item?.reviewedAt ?? item?.reviewed_at),
        reviewedBy: cleanText(item?.reviewedBy ?? item?.reviewed_by),
        reason: cleanText(item?.reason ?? item?.remark),
      }))
      .filter((item) => item.status || item.attachmentId),
  };
}

function normalizeFinishedGoodsPhotoSummary(value) {
  if (!value || typeof value !== "object") return null;
  return buildFinishedGoodsPhotoSummary({ finishedGoodsPhoto: value }, {});
}

function isFinishedGoodsPhotoRequired(orderLine = {}) {
  const orderType = cleanText(orderLine.orderType ?? orderLine.order_type);
  const printFlag = cleanText(orderLine.print ?? orderLine.printFlag ?? orderLine.print_flag);
  const status = cleanText(orderLine.status ?? orderLine.lineStatus ?? orderLine.line_status);
  return (
    orderType.includes("定制") ||
    orderType.includes("印刷") ||
    printFlag === "是" ||
    printFlag.toLowerCase() === "true" ||
    status.includes("丝印") ||
    status.includes("制袋")
  );
}

function normalizeWorkshopReportSummary(report) {
  if (!report || typeof report !== "object") return null;
  const reportId = cleanText(report.reportId ?? report.report_id ?? report.id);
  if (!reportId) return null;
  const machineCount = report.machineCount ?? report.machine_count;
  return {
    reportId,
    productionTaskId: cleanText(report.productionTaskId ?? report.production_task_id),
    orderLineId: cleanText(report.orderLineId ?? report.order_line_id),
    processType: cleanText(report.processType ?? report.process_type),
    machineId: cleanText(report.machineId ?? report.machine_id),
    operatorId: cleanText(report.operatorId ?? report.operator_id),
    qualifiedQty: toFiniteInteger(report.qualifiedQty ?? report.qualified_qty),
    exceptionQty: toFiniteInteger(report.exceptionQty ?? report.exception_qty),
    machineCount: machineCount === undefined || machineCount === null ? null : toFiniteInteger(machineCount),
    machineCountAffectsInventory: false,
    startedAt: cleanText(report.startedAt ?? report.started_at),
    completedAt: cleanText(report.completedAt ?? report.completed_at ?? report.createdAt ?? report.created_at),
    createdAt: cleanText(report.createdAt ?? report.created_at ?? report.completedAt ?? report.completed_at),
    remark: cleanText(report.remark),
    evidence: normalizeObject(report.evidence ?? report.evidence_json),
  };
}

function normalizeProductionExceptionSummary(record) {
  if (!record || typeof record !== "object") return null;
  const productionExceptionId = cleanText(record.productionExceptionId ?? record.production_exception_id ?? record.id);
  if (!productionExceptionId) return null;
  return {
    productionExceptionId,
    bizNo: cleanText(record.bizNo ?? record.biz_no ?? productionExceptionId),
    productionTaskId: cleanText(record.productionTaskId ?? record.production_task_id),
    orderLineId: cleanText(record.orderLineId ?? record.order_line_id),
    processType: cleanText(record.processType ?? record.process_type),
    machineId: cleanText(record.machineId ?? record.machine_id),
    operatorId: cleanText(record.operatorId ?? record.operator_id),
    exceptionType: cleanText(record.exceptionType ?? record.exception_type),
    continuationMode: cleanText(record.continuationMode ?? record.continuation_mode),
    status: cleanText(record.status),
    resolutionCode: cleanText(record.resolutionCode ?? record.resolution_code),
    resolutionNote: cleanText(record.resolutionNote ?? record.resolution_note),
    resolvedBy: cleanText(record.resolvedBy ?? record.resolved_by),
    resolvedAt: cleanText(record.resolvedAt ?? record.resolved_at),
    estimatedLossQty: Math.max(0, toFiniteInteger(record.estimatedLossQty ?? record.estimated_loss_qty)),
    affectsDelivery: record.affectsDelivery === true || record.affects_delivery === true,
    remark: cleanText(record.remark),
    evidence: normalizeObject(record.evidence ?? record.evidence_json),
    occurredAt: cleanText(record.occurredAt ?? record.occurred_at ?? record.createdAt ?? record.created_at),
    createdAt: cleanText(record.createdAt ?? record.created_at ?? record.occurredAt ?? record.occurred_at),
  };
}

function buildProductionDailyProgressSummary({ productionTask, reports }) {
  const dailyReports = normalizeArray(reports)
    .map(normalizeWorkshopReportSummary)
    .filter((report) => report?.evidence?.reportKind === "daily_progress")
    .sort(sortByLatestDate);
  if (dailyReports.length === 0) return null;
  const latestReport = dailyReports[0];
  const latestEvidence = latestReport.evidence ?? {};
  const sumQualifiedQty = dailyReports.reduce((total, report) => total + Math.max(0, toFiniteInteger(report.qualifiedQty)), 0);
  const cumulativeQualifiedQty = Math.max(sumQualifiedQty, toFiniteInteger(latestEvidence.cumulativeQualifiedQty));
  const plannedQty = toFiniteInteger(latestEvidence.plannedQty ?? productionTask?.plannedQty ?? productionTask?.planned_qty);
  const remainingQty = Math.max(0, toFiniteInteger(latestEvidence.remainingQty ?? plannedQty - cumulativeQualifiedQty));
  return normalizeProductionDailyProgressSummary({
    latestReportId: latestReport.reportId,
    progressDate: latestEvidence.progressDate ?? "",
    latestDailyQualifiedQty: latestReport.qualifiedQty,
    previousQualifiedQty: toFiniteInteger(latestEvidence.previousQualifiedQty),
    cumulativeQualifiedQty,
    remainingQty,
    plannedQty,
    carryOver: latestEvidence.carryOver === true || remainingQty > 0,
    nextWorkDate: latestEvidence.nextWorkDate ?? "",
    machineCount: latestReport.machineCount,
    machineCountAffectsInventory: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
  });
}

function normalizeProductionDailyProgressSummary(value) {
  if (!value || typeof value !== "object") return null;
  const latestReportId = cleanText(value.latestReportId ?? value.latest_report_id);
  const cumulativeQualifiedQty = toFiniteInteger(value.cumulativeQualifiedQty ?? value.cumulative_qualified_qty);
  const remainingQty = toFiniteInteger(value.remainingQty ?? value.remaining_qty);
  if (!latestReportId && cumulativeQualifiedQty <= 0 && remainingQty <= 0) return null;
  const machineCount = value.machineCount ?? value.machine_count;
  return {
    latestReportId,
    progressDate: cleanText(value.progressDate ?? value.progress_date),
    latestDailyQualifiedQty: toFiniteInteger(value.latestDailyQualifiedQty ?? value.latest_daily_qualified_qty),
    previousQualifiedQty: toFiniteInteger(value.previousQualifiedQty ?? value.previous_qualified_qty),
    cumulativeQualifiedQty,
    remainingQty,
    plannedQty: toFiniteInteger(value.plannedQty ?? value.planned_qty),
    carryOver: value.carryOver === true || value.carry_over === true || remainingQty > 0,
    nextWorkDate: cleanText(value.nextWorkDate ?? value.next_work_date),
    machineCount: machineCount === undefined || machineCount === null ? null : toFiniteInteger(machineCount),
    machineCountAffectsInventory: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
  };
}

function normalizePackingTaskSummary(task) {
  if (!task || typeof task !== "object") return null;
  const packingTaskId = cleanText(task.packingTaskId ?? task.packing_task_id ?? task.id);
  if (!packingTaskId) return null;
  return {
    packingTaskId,
    bizNo: cleanText(task.bizNo ?? task.biz_no ?? packingTaskId),
    orderLineId: cleanText(task.orderLineId ?? task.order_line_id ?? task.lineId),
    plannedQty: toFiniteInteger(task.plannedQty ?? task.planned_qty ?? task.qty),
    actualPackedQty: toFiniteInteger(task.actualPackedQty ?? task.actual_packed_qty),
    packageCount: toFiniteInteger(task.packageCount ?? task.package_count),
    status: cleanText(task.status ?? task.taskStatus ?? task.task_status),
    createdBy: cleanText(task.createdBy ?? task.created_by),
    createdAt: cleanText(task.createdAt ?? task.created_at),
  };
}

function normalizePackageSummary(record) {
  if (!record || typeof record !== "object") return null;
  const packageId = cleanText(record.packageId ?? record.package_id ?? record.id);
  if (!packageId) return null;
  return {
    packageId,
    bizNo: cleanText(record.bizNo ?? record.biz_no ?? packageId),
    orderLineId: cleanText(record.orderLineId ?? record.order_line_id),
    fulfillmentId: cleanText(record.fulfillmentId ?? record.fulfillment_id),
    packageSeq: toFiniteInteger(record.packageSeq ?? record.package_seq),
    packageCount: toFiniteInteger(record.packageCount ?? record.package_count),
    packedQty: toFiniteInteger(record.packedQty ?? record.packed_qty ?? record.qty),
    labelPrintRecordId: cleanText(record.labelPrintRecordId ?? record.label_print_record_id),
    status: cleanText(record.status),
    createdBy: cleanText(record.createdBy ?? record.created_by),
    createdAt: cleanText(record.createdAt ?? record.created_at),
  };
}

function normalizeFulfillmentSummary(fulfillment) {
  if (!fulfillment || typeof fulfillment !== "object") return null;
  const fulfillmentId = cleanText(fulfillment.fulfillmentId ?? fulfillment.fulfillment_id ?? fulfillment.id);
  if (!fulfillmentId) return null;
  return {
    fulfillmentId,
    orderLineId: cleanText(fulfillment.orderLineId ?? fulfillment.order_line_id ?? fulfillment.lineId),
    method: mapFulfillmentMethod(cleanText(fulfillment.method)),
    status: cleanText(fulfillment.status),
    expectedQty: toFiniteInteger(fulfillment.expectedQty ?? fulfillment.expected_qty ?? fulfillment.qty),
    actualQty: optionalInteger(fulfillment.actualQty ?? fulfillment.actual_qty),
  };
}

function normalizeOrderLineSummary(orderLine) {
  if (!orderLine || typeof orderLine !== "object") return null;
  const orderLineId = cleanText(orderLine.orderLineId ?? orderLine.order_line_id ?? orderLine.id);
  if (!orderLineId) return null;
  return {
    orderLineId,
    orderId: cleanText(orderLine.orderId ?? orderLine.order_id ?? orderLine.orderNo),
    customerId: cleanText(orderLine.customerId ?? orderLine.customer_id),
    productName: cleanText(orderLine.productName ?? orderLine.product_name ?? orderLine.product),
    size: cleanText(orderLine.size),
    bagColor: cleanText(orderLine.bagColor ?? orderLine.bag_color ?? orderLine.color),
    handleType: cleanText(orderLine.handleType ?? orderLine.handle_type ?? orderLine.handle),
    style: cleanText(orderLine.style),
    originalQty: toFiniteInteger(orderLine.originalQty ?? orderLine.original_qty ?? orderLine.qty),
    lineStatus: cleanText(orderLine.lineStatus ?? orderLine.line_status ?? orderLine.status),
    fulfillmentMethod: cleanText(orderLine.fulfillmentMethod ?? orderLine.fulfillment_method ?? orderLine.fulfillment),
    exceptionTags: normalizeTextArray(orderLine.exceptionTags ?? orderLine.exception_tags ?? orderLine.exceptions),
    voidReason: cleanText(orderLine.voidReason ?? orderLine.void_reason),
    voidedBy: cleanText(orderLine.voidedBy ?? orderLine.voided_by),
    voidedAt: cleanText(orderLine.voidedAt ?? orderLine.voided_at),
  };
}

function normalizeInventoryItemSummary(inventoryItem) {
  if (!inventoryItem || typeof inventoryItem !== "object") return null;
  const id = cleanText(inventoryItem.id ?? inventoryItem.inventoryItemId ?? inventoryItem.inventory_item_id);
  if (!id) return null;
  return {
    id,
    inventoryKey: cleanText(inventoryItem.inventoryKey ?? inventoryItem.inventory_key ?? id),
    size: cleanText(inventoryItem.size),
    color: cleanText(inventoryItem.color ?? inventoryItem.colorName ?? inventoryItem.color_name),
    handle: cleanText(inventoryItem.handle ?? inventoryItem.handleType ?? inventoryItem.handle_type),
    handleType: cleanText(inventoryItem.handleType ?? inventoryItem.handle_type ?? inventoryItem.handle),
    style: cleanText(inventoryItem.style),
    zone: cleanText(inventoryItem.zone),
    state: cleanText(inventoryItem.state ?? inventoryItem.inventoryState ?? inventoryItem.inventory_state),
    inStock: toFiniteInteger(inventoryItem.inStock ?? inventoryItem.in_stock ?? inventoryItem.onHand ?? inventoryItem.on_hand_qty),
    reserved: toFiniteInteger(inventoryItem.reserved ?? inventoryItem.reserved_qty),
  };
}

function normalizeInventoryReservationSummary(reservation) {
  if (!reservation || typeof reservation !== "object") return null;
  const reservationId = cleanText(reservation.reservationId ?? reservation.reservation_id ?? reservation.id);
  if (!reservationId) return null;
  return {
    reservationId,
    orderLineId: cleanText(reservation.orderLineId ?? reservation.order_line_id),
    inventoryItemId: cleanText(reservation.inventoryItemId ?? reservation.inventory_item_id),
    qty: toFiniteInteger(reservation.qty ?? reservation.reservedQty ?? reservation.reserved_qty),
    status: mapInventoryReservationApiStatus(cleanText(reservation.status)),
  };
}

function normalizeInventoryLedgerSummary(entry, context = {}) {
  if (!entry || typeof entry !== "object") return null;
  const ledgerId = cleanText(entry.ledgerId ?? entry.ledger_id ?? entry.id);
  const inventoryItemId = cleanText(entry.inventoryItemId ?? entry.inventory_item_id ?? context.inventoryItem?.id);
  if (!ledgerId || !inventoryItemId) return null;
  const users = new Map((context.users ?? []).map((user) => [user.id ?? user.userId, user]));
  const inventoryItem = context.inventoryItem ?? {};
  const operatorId = cleanText(entry.operatorId ?? entry.operator_id);
  const confirmedBy = cleanText(entry.confirmedBy ?? entry.confirmed_by);
  return {
    ledgerId,
    inventoryItemId,
    inventoryKey: cleanText(entry.inventoryKey ?? entry.inventory_key ?? inventoryItem.inventoryKey ?? inventoryItem.id),
    size: cleanText(entry.size ?? inventoryItem.size),
    colorName: cleanText(entry.colorName ?? entry.color_name ?? entry.color ?? inventoryItem.color),
    color: cleanText(entry.color ?? entry.colorName ?? entry.color_name ?? inventoryItem.color),
    handleType: cleanText(entry.handleType ?? entry.handle_type ?? entry.handle ?? inventoryItem.handle),
    style: cleanText(entry.style ?? inventoryItem.style),
    zone: cleanText(entry.zone ?? inventoryItem.zone),
    inventoryState: cleanText(entry.inventoryState ?? entry.inventory_state ?? inventoryItem.state),
    changeType: cleanText(entry.changeType ?? entry.change_type),
    qtyBefore: toFiniteInteger(entry.qtyBefore ?? entry.qty_before),
    qtyChange: toFiniteInteger(entry.qtyChange ?? entry.qty_change),
    qtyAfter: toFiniteInteger(entry.qtyAfter ?? entry.qty_after),
    sourceType: cleanText(entry.sourceType ?? entry.source_type),
    sourceId: cleanText(entry.sourceId ?? entry.source_id),
    operatorId,
    operatorName: cleanText(entry.operatorName ?? entry.operator_name ?? getUserDisplayName(users, operatorId)),
    confirmedBy,
    confirmedByName: cleanText(entry.confirmedByName ?? entry.confirmed_by_name ?? getUserDisplayName(users, confirmedBy)),
    occurredAt: cleanText(entry.occurredAt ?? entry.occurred_at ?? entry.createdAt ?? entry.created_at),
    createdAt: cleanText(entry.createdAt ?? entry.created_at ?? entry.occurredAt ?? entry.occurred_at),
    reason: cleanText(entry.reason),
    remark: cleanText(entry.remark),
  };
}

function normalizeOperationLogSummary(log) {
  if (!log || typeof log !== "object") return null;
  const operationLogId = cleanText(log.operationLogId ?? log.operation_log_id ?? log.id);
  if (!operationLogId) return null;
  return {
    operationLogId,
    targetType: cleanText(log.targetType ?? log.target_type),
    targetId: cleanText(log.targetId ?? log.target_id),
    action: cleanText(log.action),
    before: log.before ?? log.before_json ?? null,
    after: log.after ?? log.after_json ?? null,
    reason: cleanText(log.reason),
    operatorId: cleanText(log.operatorId ?? log.operator_id),
    createdAt: cleanText(log.createdAt ?? log.created_at ?? log.occurredAt ?? log.occurred_at),
  };
}

function productionPackingLedgerProjectionSql() {
  return `(
    SELECT
      ledger.id,
      ledger.inventory_item_id,
      ledger.change_type,
      ledger.qty_before,
      ledger.qty_change,
      ledger.qty_after,
      ledger.source_type,
      ledger.source_id,
      ledger.operator_id,
      operator_user.display_name AS operator_name,
      ledger.confirmed_by,
      confirmer_user.display_name AS confirmed_by_name,
      ledger.occurred_at,
      ledger.created_at,
      ledger.reason,
      ledger.remark,
      item.inventory_key,
      item.size,
      COALESCE(color.name, item.standard_color_id, '') AS color_name,
      item.handle_type,
      item.style,
      item.zone,
      item.inventory_state
    FROM inventory_ledger_entries AS ledger
    JOIN inventory_items AS item ON item.id = ledger.inventory_item_id
    LEFT JOIN standard_colors AS color ON color.id = item.standard_color_id
    LEFT JOIN users AS operator_user ON operator_user.id = ledger.operator_id
    LEFT JOIN users AS confirmer_user ON confirmer_user.id = ledger.confirmed_by
  )`;
}

function productionTaskJsonExpression(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'taskType', ${alias}.task_type,
    'machineId', ${alias}.machine_id,
    'publishedScheduleId', ${alias}.published_schedule_id,
    'plannedQty', ${alias}.planned_qty,
    'taskStatus', ${alias}.task_status,
    'status', ${alias}.task_status,
    'revision', ${alias}.revision,
    'finishedGoodsPhoto', ${alias}.finished_goods_photo,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function workshopReportJsonExpression(alias) {
  return `json_build_object(
    'reportId', ${alias}.id,
    'productionTaskId', ${alias}.production_task_id,
    'orderLineId', ${alias}.order_line_id,
    'processType', ${alias}.process_type,
    'machineId', ${alias}.machine_id,
    'operatorId', ${alias}.operator_id,
    'qualifiedQty', ${alias}.qualified_qty,
    'exceptionQty', ${alias}.exception_qty,
    'machineCount', ${alias}.machine_count,
    'machineCountAffectsInventory', false,
    'startedAt', ${alias}.started_at,
    'completedAt', ${alias}.completed_at,
    'createdAt', ${alias}.created_at,
    'remark', ${alias}.remark,
    'evidence', ${alias}.evidence_json
  )`;
}

function productionExceptionJsonExpression(alias) {
  return `json_build_object(
    'productionExceptionId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'productionTaskId', ${alias}.production_task_id,
    'orderLineId', ${alias}.order_line_id,
    'processType', ${alias}.process_type,
    'machineId', ${alias}.machine_id,
    'operatorId', ${alias}.operator_id,
    'exceptionType', ${alias}.exception_type,
    'continuationMode', ${alias}.continuation_mode,
    'status', ${alias}.status,
    'resolutionCode', ${alias}.resolution_code,
    'resolutionNote', ${alias}.resolution_note,
    'resolvedBy', ${alias}.resolved_by,
    'resolvedAt', ${alias}.resolved_at,
    'estimatedLossQty', ${alias}.estimated_loss_qty,
    'affectsDelivery', ${alias}.affects_delivery,
    'remark', ${alias}.remark,
    'evidence', ${alias}.evidence_json,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at
  )`;
}

function packingTaskJsonExpression(alias) {
  return `json_build_object(
    'packingTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'plannedQty', ${alias}.planned_qty,
    'actualPackedQty', ${alias}.actual_packed_qty,
    'packageCount', 0,
    'status', ${alias}.status,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function packageJsonExpression(alias) {
  return `json_build_object(
    'packageId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'fulfillmentId', ${alias}.fulfillment_id,
    'packageSeq', ${alias}.package_seq,
    'packageCount', ${alias}.package_count,
    'packedQty', ${alias}.packed_qty,
    'labelPrintRecordId', ${alias}.label_print_record_id,
    'status', ${alias}.status,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function fulfillmentJsonExpression(alias) {
  return `json_build_object(
    'fulfillmentId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'method', ${alias}.method,
    'status', ${alias}.status,
    'expectedQty', ${alias}.expected_qty,
    'actualQty', ${alias}.actual_qty
  )`;
}

function orderLineJsonExpression(alias) {
  return `json_build_object(
    'orderLineId', ${alias}.id,
    'orderId', ${alias}.order_id,
    'customerId', ${alias}.customer_id,
    'productName', ${alias}.product_name,
    'size', ${alias}.size,
    'bagColor', ${alias}.bag_color,
    'handleType', ${alias}.handle_type,
    'style', ${alias}.style,
    'originalQty', ${alias}.original_qty,
    'lineStatus', ${alias}.line_status,
    'fulfillmentMethod', ${alias}.fulfillment_method,
    'exceptionTags', ${alias}.exception_tags,
    'voidReason', ${alias}.void_reason,
    'voidedBy', ${alias}.voided_by,
    'voidedAt', ${alias}.voided_at
  )`;
}

function inventoryItemJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'inventoryKey', ${alias}.inventory_key,
    'size', ${alias}.size,
    'color', ${alias}.color_name,
    'handle', ${alias}.handle_type,
    'handleType', ${alias}.handle_type,
    'style', ${alias}.style,
    'zone', ${alias}.zone,
    'state', ${alias}.inventory_state,
    'inStock', ${alias}.on_hand_qty,
    'reserved', ${alias}.reserved_qty
  )`;
}

function inventoryReservationJsonExpression(alias) {
  return `json_build_object(
    'reservationId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'qty', ${alias}.reserved_qty,
    'status', ${alias}.status
  )`;
}

function inventoryLedgerJsonExpression(alias) {
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

function operationLogJsonExpression(alias) {
  return `json_build_object(
    'operationLogId', ${alias}.id,
    'targetType', ${alias}.target_type,
    'targetId', ${alias}.target_id,
    'action', ${alias}.action,
    'before', ${alias}.before_json,
    'after', ${alias}.after_json,
    'reason', ${alias}.reason,
    'operatorId', ${alias}.operator_id,
    'createdAt', ${alias}.created_at
  )`;
}

function mapFulfillmentMethod(value) {
  const map = {
    自提: "pickup",
    送货: "delivery",
    快递快运: "express",
  };
  return map[value] ?? value;
}

function mapInventoryReservationApiStatus(value) {
  const map = {
    生效: "active",
    已释放: "released",
    已取消: "cancelled",
  };
  return map[value] ?? value;
}

function getUserDisplayName(users, userId) {
  if (!userId) return "";
  const user = users.get(userId);
  return cleanText(user?.displayName ?? user?.display_name ?? user?.name);
}

function sortByLatestDate(left, right) {
  const leftDate = Date.parse(left.completedAt ?? left.createdAt ?? left.occurredAt ?? "");
  const rightDate = Date.parse(right.completedAt ?? right.createdAt ?? right.occurredAt ?? "");
  return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
}

function sortPackageSeqAsc(left, right) {
  return Number(left.packageSeq ?? 0) - Number(right.packageSeq ?? 0);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toFiniteInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function positiveInteger(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.trunc(number);
}

function optionalInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}
