import {
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  getOrderLineShortNo,
  shortColorName,
} from "../src/domain/officeRules.js";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export function createDriverDeliveryTaskReadRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_DRIVER_DELIVERY_TASK_READ_STORE ??
    process.env.ERP_DRIVER_TASK_STORE ??
    process.env.ERP_FULFILLMENT_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresDriverDeliveryTaskReadRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_DRIVER_TASK_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalDriverDeliveryTaskReadRepository();
  throw new Error(`Unsupported driver delivery task read repository mode: ${mode}`);
}

export function createLocalDriverDeliveryTaskReadRepository() {
  return {
    kind: "local_memory",

    listDriverDeliveryTasks({ workspace, query = {}, operatorId = "" } = {}) {
      const filters = normalizeDriverDeliveryTaskQuery({ ...toQueryObject(query), operatorId });
      let items = buildLocalDriverDeliveryTasks(workspace, { driverId: filters.driverId || operatorId });
      const metrics = buildDriverDeliveryMetrics(items);
      if (filters.status) items = items.filter((item) => item.status === filters.status);
      return paginateDriverDeliveryTasks(items, filters, metrics);
    },

    getDriverDeliveryTask({ workspace, fulfillmentId, operatorId = "" } = {}) {
      const fulfillment = findDriverDeliveryFulfillment(workspace, fulfillmentId);
      if (!fulfillment) return null;
      return buildLocalDriverDeliveryTask(workspace, fulfillment, {
        driverId: fulfillment.driverId ?? operatorId,
        sortSequence: getFulfillmentSortSequence(workspace, fulfillment.id ?? fulfillment.fulfillmentId),
      });
    },
  };
}

export function createPostgresDriverDeliveryTaskReadRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));

  return {
    kind: "postgres",

    async listDriverDeliveryTasks({ query = {}, operatorId = "" } = {}) {
      const builtQuery = buildListDriverDeliveryTasksQuery({ query, operatorId });
      return normalizeDriverDeliveryTaskListResponse(await queryJson(builtQuery.text, builtQuery.values));
    },

    async getDriverDeliveryTask({ fulfillmentId, operatorId = "" } = {}) {
      const builtQuery = buildFindDriverDeliveryTaskQuery({ fulfillmentId, operatorId });
      return normalizeDriverDeliveryTask(await queryJson(builtQuery.text, builtQuery.values));
    },
  };
}

export function buildListDriverDeliveryTasksSql({ query = {}, operatorId = "" } = {}) {
  return buildListDriverDeliveryTasksQuery({ query, operatorId }).text;
}

export function buildListDriverDeliveryTasksQuery({ query = {}, operatorId = "" } = {}) {
  const filters = normalizeDriverDeliveryTaskQuery({ ...toQueryObject(query), operatorId });
  const parameters = createPostgresParameterBinder();
  const driverId = parameters.text(filters.driverId || operatorId);
  const statusWhere = filters.status ? `WHERE source.status = ${parameters.text(filters.status)}` : "";
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    text: `
WITH delivery_source AS (
  ${driverDeliveryTaskProjectionSql(driverId)}
),
filtered_tasks AS (
  SELECT source.*
  FROM delivery_source AS source
  ${statusWhere}
),
numbered_tasks AS (
  SELECT
    task.*,
    ROW_NUMBER() OVER (
      ORDER BY ${driverDeliveryTaskOrderBySql("task")}
    ) AS sort_sequence
  FROM filtered_tasks AS task
),
paged_tasks AS (
  SELECT *
  FROM numbered_tasks
  ORDER BY ${driverDeliveryTaskOrderBySql("numbered_tasks")}
  LIMIT ${parameters.integer(limit)}
  OFFSET ${parameters.integer(offset)}
),
task_metrics AS (
  SELECT json_build_object(
    'pendingCount', COUNT(*) FILTER (WHERE status = '待送货'),
    'deliveringCount', COUNT(*) FILTER (WHERE status = '配送中'),
    'completedCount', COUNT(*) FILTER (WHERE status = '已完成'),
    'exceptionCount', COUNT(*) FILTER (WHERE status = '送货异常')
  ) AS result
  FROM delivery_source
)
SELECT json_build_object(
  'items', (
    SELECT COALESCE(json_agg(${driverDeliveryTaskJsonExpression("task")} ORDER BY ${driverDeliveryTaskOrderBySql("task")}), '[]'::json)
    FROM paged_tasks AS task
  ),
  'page', ${parameters.integer(filters.page)},
  'pageSize', ${parameters.integer(filters.pageSize)},
  'total', (SELECT COUNT(*) FROM filtered_tasks),
  'metrics', (SELECT result FROM task_metrics)
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindDriverDeliveryTaskSql({ fulfillmentId, operatorId = "" } = {}) {
  return buildFindDriverDeliveryTaskQuery({ fulfillmentId, operatorId }).text;
}

export function buildFindDriverDeliveryTaskQuery({ fulfillmentId, operatorId = "" } = {}) {
  const id = cleanText(fulfillmentId);
  if (!id) throw new Error("fulfillmentId is required");
  const parameters = createPostgresParameterBinder();
  const driverId = parameters.text(operatorId);
  const fulfillmentIdParameter = parameters.text(id);
  return {
    text: `
WITH delivery_source AS (
  ${driverDeliveryTaskProjectionSql(driverId)}
),
selected_task AS (
  SELECT
    source.*,
    ROW_NUMBER() OVER (
      ORDER BY ${driverDeliveryTaskOrderBySql("source")}
    ) AS sort_sequence
  FROM delivery_source AS source
)
SELECT ${driverDeliveryTaskJsonExpression("task")} AS result
FROM selected_task AS task
WHERE task.fulfillment_id = ${fulfillmentIdParameter}
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

function driverDeliveryTaskProjectionSql(driverId) {
  return `
SELECT
  fulfillment.id AS fulfillment_id,
  fulfillment.id AS driver_task_id,
  COALESCE(NULLIF(active_dispatch.driver_id, ''), ${driverId}) AS driver_id,
  fulfillment.order_line_id,
  line.biz_no AS order_line_no,
  original_order.biz_no AS order_no,
  fulfillment.customer_id,
  COALESCE(NULLIF(fulfillment.customer_snapshot->>'customerName', ''), NULLIF(fulfillment.customer_snapshot->>'name', ''), customer.name, '客户待确认') AS customer_name,
  COALESCE(NULLIF(fulfillment.customer_snapshot->>'contactName', ''), NULLIF(fulfillment.customer_snapshot->>'contact', ''), contact.contact_name, '联系人待确认') AS contact_name,
  COALESCE(NULLIF(fulfillment.customer_snapshot->>'contactPhone', ''), NULLIF(fulfillment.customer_snapshot->>'phone', ''), contact.phone, '电话待确认') AS contact_phone,
  COALESCE(NULLIF(fulfillment.customer_snapshot->>'address', ''), address.address, '地址待补') AS address,
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
  line.exception_tags,
  fulfillment.expected_qty,
  fulfillment.actual_qty,
  fulfillment.status AS fulfillment_status,
  CASE
    WHEN fulfillment.status = '配送中' THEN '配送中'
    WHEN fulfillment.status IN ('已交付', '已完成') THEN '已完成'
    WHEN fulfillment.status LIKE '%异常%' OR fulfillment.status LIKE '%无法%' OR fulfillment.status LIKE '%数量%' THEN '送货异常'
    ELSE '待送货'
  END AS status,
  CASE
    WHEN fulfillment.status = '配送中' THEN 0
    WHEN fulfillment.status IN ('已交付', '已完成') THEN 3
    WHEN fulfillment.status LIKE '%异常%' OR fulfillment.status LIKE '%无法%' OR fulfillment.status LIKE '%数量%' THEN 2
    ELSE 1
  END AS status_rank,
  fulfillment.latest_needed_at,
  fulfillment.delivered_at,
  fulfillment.confirmed_at,
  fulfillment.loaded_at,
  fulfillment.loaded_by,
  fulfillment.driver_remark,
  fulfillment.receiver_name,
  fulfillment.paper_note_status,
  fulfillment.watermarked_photo_attached,
  fulfillment.watermarked_photo_attachment_id,
  fulfillment.watermarked_photo_url,
  fulfillment.watermark_id,
  fulfillment.watermark_text,
  fulfillment.watermark_captured_at,
  fulfillment.watermark_location_label,
  fulfillment.watermark_geo_point,
  fulfillment.watermark_address,
  fulfillment.watermark_operator_id,
  fulfillment.watermark_operator_name,
  fulfillment.signature_photo_attached,
  fulfillment.signature_photo_attachment_id,
  fulfillment.delivery_evidence_review_status,
  fulfillment.delivery_evidence_reviewed_at,
  fulfillment.delivery_evidence_reviewed_by,
  fulfillment.delivery_evidence_reviewed_by_user_id,
  fulfillment.delivery_evidence_issue_reason,
  COALESCE(package_stats.package_count, 1) AS package_count,
  COALESCE(active_print.batch_no, active_print.id, '待打印/回填') AS delivery_note_no,
  COALESCE(inventory_source.summary, '') AS inventory_source,
  COALESCE(latest_exception.reason_code, '') AS exception_reason_code,
  COALESCE(latest_exception.reason, '') AS exception_reason,
  latest_exception.occurred_at AS exception_occurred_at,
  active_dispatch.route_date,
  active_dispatch.route_batch_no,
  active_dispatch.stop_sequence,
  active_dispatch.dispatch_status,
  active_dispatch.planned_departure_at,
  active_dispatch.assigned_at AS dispatch_assigned_at,
  latest_device_field_test.record_json AS device_field_test_record,
  latest_device_field_test.summary_json AS device_field_test_summary,
  fulfillment.created_at
FROM fulfillment_records AS fulfillment
JOIN order_lines AS line ON line.id = fulfillment.order_line_id
JOIN original_orders AS original_order ON original_order.id = line.order_id
LEFT JOIN customers AS customer ON customer.id = fulfillment.customer_id
LEFT JOIN LATERAL (
  SELECT contact_name, phone
  FROM customer_contacts
  WHERE customer_id = fulfillment.customer_id
  ORDER BY is_default DESC, created_at ASC, id ASC
  LIMIT 1
) AS contact ON true
LEFT JOIN LATERAL (
  SELECT address
  FROM customer_addresses
  WHERE customer_id = fulfillment.customer_id
  ORDER BY is_default DESC, created_at ASC, id ASC
  LIMIT 1
) AS address ON true
LEFT JOIN LATERAL (
  SELECT id, batch_no
  FROM print_records
  WHERE target_type = 'fulfillment'
    AND target_id = fulfillment.id
    AND status NOT IN ('voided', '已作废')
  ORDER BY printed_at DESC NULLS LAST, created_at DESC, id DESC
  LIMIT 1
) AS active_print ON true
LEFT JOIN LATERAL (
  SELECT GREATEST(COALESCE(MAX(package_count), COUNT(*), 1), 1)::INTEGER AS package_count
  FROM packages
  WHERE fulfillment_id = fulfillment.id
) AS package_stats ON true
LEFT JOIN LATERAL (
  SELECT STRING_AGG(DISTINCT CONCAT_WS(' / ', item.zone, item.inventory_state), '、') AS summary
  FROM inventory_reservations AS reservation
  JOIN inventory_items AS item ON item.id = reservation.inventory_item_id
  WHERE reservation.order_line_id = fulfillment.order_line_id
) AS inventory_source ON true
LEFT JOIN LATERAL (
  SELECT reason_code, reason, occurred_at
  FROM fulfillment_exceptions
  WHERE fulfillment_id = fulfillment.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1
) AS latest_exception ON true
LEFT JOIN LATERAL (
  SELECT
    driver_id,
    route_date,
    route_batch_no,
    stop_sequence,
    dispatch_status,
    planned_departure_at,
    assigned_at
  FROM driver_delivery_dispatches
  WHERE fulfillment_id = fulfillment.id
    AND dispatch_status NOT IN ('已取消', 'canceled', 'voided')
  ORDER BY route_date ASC NULLS LAST, stop_sequence ASC NULLS LAST, assigned_at DESC NULLS LAST, created_at DESC, id DESC
  LIMIT 1
) AS active_dispatch ON true
LEFT JOIN LATERAL (
  SELECT
    jsonb_build_object(
      'recordId', field_test.id,
      'id', field_test.id,
      'bizNo', field_test.biz_no,
      'fulfillmentId', field_test.fulfillment_id,
      'orderLineId', COALESCE(field_test.order_line_id, ''),
      'driverId', COALESCE(field_test.driver_id, ''),
      'operatorId', COALESCE(field_test.operator_id, ''),
      'operatorName', field_test.operator_name,
      'checkedAt', COALESCE(field_test.checked_at::TEXT, ''),
      'deviceLabel', field_test.device_label,
      'browserLabel', field_test.browser_label,
      'userAgent', field_test.user_agent,
      'language', field_test.language,
      'summary', field_test.summary_json,
      'checks', field_test.checks_json,
      'packageLabelScanSample', field_test.summary_json->'packageLabelScanSample',
      'nativeBridgeDiagnostics', field_test.summary_json->'nativeBridgeDiagnostics',
      'note', field_test.note,
      'operationLogId', COALESCE(field_test.operation_log_id, ''),
      'createdAt', COALESCE(field_test.created_at::TEXT, ''),
      'updatedAt', COALESCE(field_test.updated_at::TEXT, '')
    ) AS record_json,
    field_test.summary_json
  FROM driver_device_field_tests AS field_test
  WHERE field_test.fulfillment_id = fulfillment.id
  ORDER BY field_test.checked_at DESC NULLS LAST, field_test.created_at DESC, field_test.id DESC
  LIMIT 1
) AS latest_device_field_test ON true
WHERE fulfillment.method = '送货'`;
}

function driverDeliveryTaskOrderBySql(alias) {
  return `CASE WHEN COALESCE(${alias}.stop_sequence, 0) > 0 THEN 0 ELSE 1 END ASC,
      ${alias}.route_date ASC NULLS LAST,
      NULLIF(${alias}.route_batch_no, '') ASC NULLS LAST,
      NULLIF(${alias}.stop_sequence, 0) ASC NULLS LAST,
      ${alias}.status_rank ASC,
      ${alias}.latest_needed_at ASC NULLS LAST,
      ${alias}.created_at ASC,
      ${alias}.fulfillment_id ASC`;
}

function driverDeliveryTaskJsonExpression(alias) {
  return `(jsonb_build_object(
    'driverTaskId', ${alias}.driver_task_id,
    'fulfillmentId', ${alias}.fulfillment_id,
    'driverId', ${alias}.driver_id,
    'orderLineId', ${alias}.order_line_id,
    'orderTail', ${driverOrderTailSql(alias)},
    'customerId', ${alias}.customer_id,
    'customerName', ${alias}.customer_name,
    'contactName', ${alias}.contact_name,
    'contactPhone', ${alias}.contact_phone,
    'address', ${alias}.address,
    'addressArea', CASE WHEN char_length(${alias}.address) > 8 THEN substring(${alias}.address from 1 for 8) ELSE ${alias}.address END,
    'deliveryNoteNo', ${alias}.delivery_note_no,
    'productName', ${alias}.product_name,
    'orderType', ${alias}.order_type,
    'size', ${alias}.size,
    'bagColor', ${alias}.bag_color,
    'handleType', ${alias}.handle_type,
    'style', ${alias}.style,
    'printFlag', ${alias}.print_flag,
    'printColor', ${alias}.print_color,
    'printSide', ${alias}.print_side,
    'handleColor', ${alias}.handle_color,
    'exceptionTags', ${alias}.exception_tags,
    'packageSummary', CONCAT(${alias}.package_count::TEXT, '包'),
    'packageCount', ${alias}.package_count,
    'packageChecklist', ${driverPackageChecklistSql(alias)},
    'qty', COALESCE(${alias}.actual_qty, ${alias}.expected_qty, ${alias}.original_qty, 0),
    'expectedQty', COALESCE(${alias}.expected_qty, ${alias}.original_qty, 0),
    'latest', COALESCE(${alias}.latest_needed_at::TEXT, ''),
    'latestNeededAt', COALESCE(${alias}.latest_needed_at::TEXT, ''),
    'status', ${alias}.status,
    'inventorySource', ${alias}.inventory_source,
    'exceptionReasonCode', ${alias}.exception_reason_code,
    'exceptionReason', ${alias}.exception_reason,
    'exceptionOccurredAt', COALESCE(${alias}.exception_occurred_at::TEXT, ''),
    'routeDate', COALESCE(${alias}.route_date::TEXT, ''),
    'routeNo', ${alias}.route_batch_no,
    'routeSequence', COALESCE(${alias}.stop_sequence, 0),
    'dispatchStatus', ${alias}.dispatch_status,
    'plannedDepartureAt', COALESCE(${alias}.planned_departure_at::TEXT, ''),
    'dispatchAssignedAt', COALESCE(${alias}.dispatch_assigned_at::TEXT, '')
  ) || jsonb_build_object(
    'receiverName', ${alias}.receiver_name,
    'paperNoteStatus', ${alias}.paper_note_status,
    'loadedAt', COALESCE(${alias}.loaded_at::TEXT, ''),
    'loadedBy', COALESCE(${alias}.loaded_by, ''),
    'driverRemark', ${alias}.driver_remark,
    'deviceFieldTestRecord', ${alias}.device_field_test_record,
    'latestDeviceFieldTestRecord', ${alias}.device_field_test_record,
    'deviceFieldTestSummary', ${alias}.device_field_test_summary,
    'watermarkedPhotoAttached', ${alias}.watermarked_photo_attached,
    'watermarkedPhotoAttachmentId', ${alias}.watermarked_photo_attachment_id,
    'watermarkedPhotoUrl', ${alias}.watermarked_photo_url,
    'watermarkId', ${alias}.watermark_id,
    'watermarkText', ${alias}.watermark_text,
    'watermarkCapturedAt', COALESCE(${alias}.watermark_captured_at::TEXT, ''),
    'watermarkLocationLabel', ${alias}.watermark_location_label,
    'watermarkGeoPoint', ${alias}.watermark_geo_point,
    'watermarkAddress', ${alias}.watermark_address,
    'watermarkOperatorId', COALESCE(${alias}.watermark_operator_id, ''),
    'watermarkOperatorName', ${alias}.watermark_operator_name,
    'signaturePhotoAttached', ${alias}.signature_photo_attached,
    'signaturePhotoAttachmentId', ${alias}.signature_photo_attachment_id,
    'deliveryEvidenceReviewStatus', ${alias}.delivery_evidence_review_status,
    'deliveryEvidenceReviewedAt', COALESCE(${alias}.delivery_evidence_reviewed_at::TEXT, ''),
    'deliveryEvidenceReviewedBy', ${alias}.delivery_evidence_reviewed_by,
    'deliveryEvidenceReviewedByUserId', COALESCE(${alias}.delivery_evidence_reviewed_by_user_id, ''),
    'deliveryEvidenceIssueReason', ${alias}.delivery_evidence_issue_reason,
    'completedAt', COALESCE(${alias}.delivered_at::TEXT, ''),
    'sortSequence', COALESCE(${alias}.sort_sequence, 0)
  ))`;
}

function driverOrderTailSql(alias) {
  return `CASE
    WHEN ${alias}.order_line_no ~ '^ORD-[0-9]{4}-[0-9]+-[0-9]+$'
      THEN regexp_replace(${alias}.order_line_no, '^ORD-[0-9]{4}-([0-9]+)-([0-9]+)$', '#\\1-\\2')
    WHEN ${alias}.order_line_no IS NOT NULL AND ${alias}.order_line_no <> ''
      THEN RIGHT(${alias}.order_line_no, 5)
    ELSE RIGHT(${alias}.order_line_id, 5)
  END`;
}

function driverPackageChecklistSql(alias) {
  const totalQty = `GREATEST(COALESCE(${alias}.actual_qty, ${alias}.expected_qty, ${alias}.original_qty, 0), 0)::INTEGER`;
  const packageCount = `GREATEST(COALESCE(${alias}.package_count, 1), 1)::INTEGER`;
  const packageWhere = `package_item.fulfillment_id = ${alias}.fulfillment_id
        OR (package_item.fulfillment_id IS NULL AND package_item.order_line_id = ${alias}.order_line_id)`;
  return `COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'packageId', package_row.id,
        'labelText', CONCAT('第 ', package_row.package_seq::TEXT, '/', package_row.driver_package_count::TEXT, ' 包'),
        'packageSeq', package_row.package_seq,
        'packageCount', package_row.driver_package_count,
        'packedQty', package_row.packed_qty,
        'quantityText', CONCAT(package_row.packed_qty::TEXT, '个'),
        'status', COALESCE(NULLIF(package_row.status, ''), '待装车核对'),
        'labelPrintRecordId', COALESCE(package_row.label_print_record_id, '')
      ) ORDER BY package_row.package_seq, package_row.id)
      FROM (
        SELECT
          package_item.*,
          GREATEST(
            COALESCE(MAX(package_item.package_count) OVER (), 0),
            COUNT(*) OVER (),
            1
          )::INTEGER AS driver_package_count
        FROM packages AS package_item
        WHERE ${packageWhere}
      ) AS package_row
    ), (
      SELECT jsonb_agg(jsonb_build_object(
        'packageId', CONCAT(${alias}.fulfillment_id, '-PKG-', package_row.seq::TEXT),
        'labelText', CONCAT('第 ', package_row.seq::TEXT, '/', ${packageCount}::TEXT, ' 包'),
        'packageSeq', package_row.seq,
        'packageCount', ${packageCount},
        'packedQty', (
          FLOOR(${totalQty}::NUMERIC / ${packageCount})::INTEGER +
          CASE WHEN package_row.seq <= MOD(${totalQty}, ${packageCount}) THEN 1 ELSE 0 END
        ),
        'quantityText', CONCAT((
          FLOOR(${totalQty}::NUMERIC / ${packageCount})::INTEGER +
          CASE WHEN package_row.seq <= MOD(${totalQty}, ${packageCount}) THEN 1 ELSE 0 END
        )::TEXT, '个'),
        'status', '待装车核对',
        'labelPrintRecordId', ''
      ) ORDER BY package_row.seq)
      FROM generate_series(1, ${packageCount}) AS package_row(seq)
    ), '[]'::jsonb)`;
}

export function normalizeDriverDeliveryTaskListResponse(value) {
  const items = toArray(value?.items).map(normalizeDriverDeliveryTask).filter(Boolean);
  return {
    items,
    page: toFiniteInteger(value?.page, 1),
    pageSize: toFiniteInteger(value?.pageSize, items.length || 50),
    total: toFiniteInteger(value?.total, items.length),
    metrics: normalizeDriverDeliveryMetrics(value?.metrics, items),
  };
}

export function normalizeDriverDeliveryTask(value = {}) {
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.id);
  if (!fulfillmentId) return null;
  const line = {
    product: value.product ?? value.productName,
    productName: value.productName ?? value.product,
    orderType: value.orderType,
    size: value.size,
    color: value.color ?? value.bagColor,
    bagColor: value.bagColor ?? value.color,
    handleType: value.handleType,
    style: value.style,
    print: value.print ?? (value.printFlag === true ? "是" : "否"),
    printFlag: value.printFlag === true,
    printColor: value.printColor,
    printSide: value.printSide,
    handleColor: value.handleColor,
    qty: value.expectedQty ?? value.qty,
    latest: value.latestNeededAt ?? value.latest,
    exceptions: toArray(value.exceptionTags ?? value.exceptions),
    note: value.note ?? "",
  };
  const packageCount = Math.max(1, toFiniteInteger(value.packageCount, parsePackageCount(value.packageSummary)));
  const qty = Math.max(0, toFiniteInteger(value.qty ?? value.actualQty ?? value.expectedQty, 0));
  const status = mapDriverDeliveryStatus(value.status ?? value.fulfillmentStatus);
  const packageSummary = cleanText(value.packageSummary) || `${packageCount}包`;
  return {
    driverTaskId: cleanText(value.driverTaskId ?? fulfillmentId) || fulfillmentId,
    fulfillmentId,
    driverId: cleanText(value.driverId),
    orderLineId: cleanText(value.orderLineId),
    orderTail: cleanText(value.orderTail) || getDriverOrderTail(line, value.orderLineId),
    customerId: cleanText(value.customerId),
    customerName: cleanText(value.customerName) || "客户待确认",
    contactName: cleanText(value.contactName ?? value.contact) || "联系人待确认",
    contactPhone: cleanText(value.contactPhone ?? value.phone) || "电话待确认",
    address: cleanText(value.address) || "地址待补",
    addressArea: cleanText(value.addressArea) || inferDriverAddressArea(value.address),
    deliveryNoteNo: cleanText(value.deliveryNoteNo) || "待打印/回填",
    goodsSummary: cleanText(value.goodsSummary) || buildDriverGoodsSummary({ fulfillment: value, orderLine: line, qty }),
    packageSummary,
    packageCount,
    packageChecklist: normalizeDriverPackageChecklist(value.packageChecklist ?? value.packageItems ?? value.packages, {
      fulfillmentId,
      packageSummary,
      packageCount,
      qty,
    }),
    qty,
    expectedQty: Math.max(0, toFiniteInteger(value.expectedQty ?? value.qty, qty)),
    latest: cleanText(value.latest ?? value.latestNeededAt),
    latestNeededAt: cleanText(value.latestNeededAt ?? value.latest),
    status,
    inventorySource: cleanText(value.inventorySource),
    nextStep: cleanText(value.nextStep) || getDriverDeliveryNextStep(status),
    customerNote: cleanText(value.customerNote) || getLineRemark(line) || "无",
    officeNote: cleanText(value.officeNote) || cleanText(value.exceptionReason) || line.exceptions.join("、") || "无",
    exceptionReasonCode: cleanText(value.exceptionReasonCode),
    exceptionReason: cleanText(value.exceptionReason),
    exceptionOccurredAt: cleanText(value.exceptionOccurredAt),
    routeDate: cleanText(value.routeDate),
    routeNo: cleanText(value.routeNo),
    routeSequence: toFiniteInteger(value.routeSequence, 0),
    dispatchStatus: cleanText(value.dispatchStatus),
    plannedDepartureAt: cleanText(value.plannedDepartureAt),
    dispatchAssignedAt: cleanText(value.dispatchAssignedAt),
    receiverName: cleanText(value.receiverName),
    paperNoteStatus: cleanText(value.paperNoteStatus),
    loadedBy: cleanText(value.loadedBy),
    driverRemark: cleanText(value.driverRemark),
    watermarkedPhotoAttached: value.watermarkedPhotoAttached === true,
    watermarkedPhotoAttachmentId: cleanText(value.watermarkedPhotoAttachmentId),
    watermarkedPhotoUrl: cleanText(value.watermarkedPhotoUrl),
    watermarkId: cleanText(value.watermarkId),
    watermarkText: cleanText(value.watermarkText),
    watermarkCapturedAt: cleanText(value.watermarkCapturedAt),
    watermarkLocationLabel: cleanText(value.watermarkLocationLabel),
    watermarkGeoPoint: cleanText(value.watermarkGeoPoint),
    watermarkAddress: cleanText(value.watermarkAddress),
    watermarkOperatorId: cleanText(value.watermarkOperatorId),
    watermarkOperatorName: cleanText(value.watermarkOperatorName),
    signaturePhotoAttached: value.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: cleanText(value.signaturePhotoAttachmentId),
    deliveryEvidenceReviewStatus: cleanText(value.deliveryEvidenceReviewStatus),
    deliveryEvidenceReviewedAt: cleanText(value.deliveryEvidenceReviewedAt),
    deliveryEvidenceReviewedBy: cleanText(value.deliveryEvidenceReviewedBy),
    deliveryEvidenceReviewedByUserId: cleanText(value.deliveryEvidenceReviewedByUserId),
    deliveryEvidenceIssueReason: cleanText(value.deliveryEvidenceIssueReason),
    deviceFieldTestRecord: value.deviceFieldTestRecord ?? value.latestDeviceFieldTestRecord ?? null,
    deviceFieldTestSummary: value.deviceFieldTestSummary ?? value.deviceFieldTestRecord?.summary ?? null,
    completedAt: cleanText(value.completedAt ?? value.deliveredAt),
    loadedAt: cleanText(value.loadedAt),
    sortSequence: toFiniteInteger(value.sortSequence ?? value.sequence, 0),
  };
}

function buildLocalDriverDeliveryTasks(workspace, options = {}) {
  const driverId = cleanText(options.driverId);
  return (workspace.fulfillments ?? [])
    .filter((fulfillment) => fulfillment.method === "送货")
    .map((fulfillment, index) =>
      buildLocalDriverDeliveryTask(workspace, fulfillment, {
        driverId: fulfillment.driverId ?? driverId,
        sortSequence: index + 1,
      }),
    )
    .filter(Boolean)
    .sort(compareDriverDeliveryTasks);
}

function buildLocalDriverDeliveryTask(workspace, fulfillment, options = {}) {
  if (!fulfillment || fulfillment.method !== "送货") return null;
  const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
  const orderLine = findOrderLine(workspace, orderLineId) ?? {};
  const customer = (workspace.customers ?? []).find((item) => item.id === (fulfillment.customerId ?? orderLine.customerId)) ?? {};
  const printRecord = findActiveFulfillmentPrintRecord(workspace, fulfillment);
  const dispatch = findActiveDriverDeliveryDispatch(workspace, fulfillment.id ?? fulfillment.fulfillmentId);
  return normalizeDriverDeliveryTask({
    ...fulfillment,
    driverTaskId: fulfillment.id,
    fulfillmentId: fulfillment.id,
    driverId: dispatch.driverId ?? fulfillment.driverId ?? options.driverId ?? "",
    orderLineId,
    orderTail: getDriverOrderTail(orderLine, orderLineId),
    customerId: fulfillment.customerId ?? orderLine.customerId ?? "",
    customerName: customer.name ?? "客户待确认",
    contactName: customer.contact ?? "联系人待确认",
    contactPhone: customer.phone ?? "电话待确认",
    address: cleanText(customer.address ?? fulfillment.address) || "地址待补",
    addressArea: inferDriverAddressArea(customer.address ?? fulfillment.address),
    deliveryNoteNo:
      fulfillment.deliveryNoteNo ??
      fulfillment.printBatch ??
      printRecord?.batchNo ??
      printRecord?.printRecordId ??
      "待打印/回填",
    productName: orderLine.product ?? fulfillment.goods,
    orderType: orderLine.orderType,
    size: orderLine.size,
    bagColor: orderLine.color,
    handleType: orderLine.handle,
    style: orderLine.style,
    printFlag: orderLine.print === "是" || orderLine.printFlag === true,
    printColor: orderLine.printColor,
    printSide: orderLine.printSide,
    handleColor: orderLine.handleColor,
    exceptionTags: orderLine.exceptions ?? [],
    note: orderLine.note ?? "",
    packageSummary: fulfillment.packages,
    packageCount: parsePackageCount(fulfillment.packages ?? fulfillment.packageSummary),
    packageChecklist: buildLocalDriverPackageChecklist(workspace, {
      fulfillment,
      orderLineId,
      packageCount: parsePackageCount(fulfillment.packages ?? fulfillment.packageSummary),
      qty: Number(fulfillment.actualQty ?? fulfillment.qty ?? orderLine.qty ?? 0),
    }),
    qty: Number(fulfillment.actualQty ?? fulfillment.qty ?? orderLine.qty ?? 0),
    expectedQty: Number(fulfillment.qty ?? orderLine.qty ?? 0),
    latest: fulfillment.latest ?? orderLine.latest ?? "",
    latestNeededAt: fulfillment.latestNeededAt ?? fulfillment.latest ?? orderLine.latest ?? "",
    status: fulfillment.status,
    inventorySource: [fulfillment.zone, fulfillment.source].filter(Boolean).join(" / "),
    routeDate: dispatch.routeDate,
    routeNo: dispatch.routeNo ?? dispatch.routeBatchNo,
    routeSequence: dispatch.stopSequence ?? dispatch.routeSequence,
    dispatchStatus: dispatch.dispatchStatus,
    plannedDepartureAt: dispatch.plannedDepartureAt,
    dispatchAssignedAt: dispatch.assignedAt ?? dispatch.dispatchAssignedAt,
    customerNote: getLineRemark(orderLine) || fulfillment.customerNote || "无",
    officeNote: fulfillment.exceptionReason || (Array.isArray(orderLine.exceptions) ? orderLine.exceptions.join("、") : "") || "无",
    exceptionReasonCode: fulfillment.exceptionReasonCode ?? fulfillment.reasonCode ?? "",
    exceptionReason: fulfillment.exceptionReason ?? "",
    exceptionOccurredAt: fulfillment.exceptionOccurredAt ?? fulfillment.occurredAt ?? "",
    completedAt: fulfillment.completedAt ?? fulfillment.deliveredAt ?? "",
    loadedAt: fulfillment.loadedAt ?? "",
    sortSequence: Number(options.sortSequence ?? getFulfillmentSortSequence(workspace, fulfillment.id)),
  });
}

function buildDriverDeliveryMetrics(items = []) {
  return {
    pendingCount: items.filter((item) => item.status === "待送货").length,
    deliveringCount: items.filter((item) => item.status === "配送中").length,
    completedCount: items.filter((item) => item.status === "已完成").length,
    exceptionCount: items.filter((item) => item.status === "送货异常").length,
  };
}

function normalizeDriverDeliveryMetrics(value, items = []) {
  const fallback = buildDriverDeliveryMetrics(items);
  return {
    pendingCount: toFiniteInteger(value?.pendingCount, fallback.pendingCount),
    deliveringCount: toFiniteInteger(value?.deliveringCount, fallback.deliveringCount),
    completedCount: toFiniteInteger(value?.completedCount, fallback.completedCount),
    exceptionCount: toFiniteInteger(value?.exceptionCount, fallback.exceptionCount),
  };
}

function paginateDriverDeliveryTasks(items, filters, metrics) {
  const total = items.length;
  const start = (filters.page - 1) * filters.pageSize;
  return {
    items: items.slice(start, start + filters.pageSize),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    metrics,
  };
}

function normalizeDriverDeliveryTaskQuery(query = {}) {
  const source = toQueryObject(query);
  const status = cleanText(source.status);
  return {
    driverId: cleanText(source.driverId ?? source.operatorId),
    status: status && status !== "全部" ? status : "",
    page: clampInteger(source.page, 1, 99999, 1),
    pageSize: clampInteger(source.pageSize, 1, 200, 50),
  };
}

function findDriverDeliveryFulfillment(workspace, fulfillmentId) {
  const id = cleanText(fulfillmentId);
  return (workspace.fulfillments ?? []).find((item) => item.id === id && item.method === "送货");
}

function findOrderLine(workspace, orderLineId) {
  const id = cleanText(orderLineId);
  return (workspace.orderLines ?? []).find((item) => item.id === id || item.orderLineId === id);
}

function findActiveFulfillmentPrintRecord(workspace, fulfillment) {
  const fulfillmentId = fulfillment.id ?? fulfillment.fulfillmentId;
  return (workspace.printRecords ?? [])
    .filter((record) => {
      const targetId = record.targetId ?? record.fulfillmentId;
      const status = cleanText(record.status);
      return targetId === fulfillmentId && !["voided", "已作废"].includes(status);
    })
    .sort((a, b) => cleanText(b.printedAt ?? b.createdAt).localeCompare(cleanText(a.printedAt ?? a.createdAt)))[0];
}

function findActiveDriverDeliveryDispatch(workspace, fulfillmentId) {
  const id = cleanText(fulfillmentId);
  return (workspace.driverDeliveryDispatches ?? [])
    .filter((dispatch) => {
      const dispatchFulfillmentId = cleanText(dispatch.fulfillmentId ?? dispatch.fulfillment_id);
      const status = cleanText(dispatch.dispatchStatus ?? dispatch.dispatch_status);
      return dispatchFulfillmentId === id && !["已取消", "canceled", "voided"].includes(status);
    })
    .sort((a, b) => {
      const dateDiff = cleanText(a.routeDate ?? a.route_date).localeCompare(cleanText(b.routeDate ?? b.route_date));
      if (dateDiff) return dateDiff;
      const routeDiff = cleanText(a.routeNo ?? a.routeBatchNo ?? a.route_batch_no).localeCompare(
        cleanText(b.routeNo ?? b.routeBatchNo ?? b.route_batch_no),
        "zh-Hans-CN",
      );
      if (routeDiff) return routeDiff;
      const sequenceDiff =
        toFiniteInteger(a.stopSequence ?? a.routeSequence ?? a.stop_sequence, 0) -
        toFiniteInteger(b.stopSequence ?? b.routeSequence ?? b.stop_sequence, 0);
      if (sequenceDiff) return sequenceDiff;
      return cleanText(b.assignedAt ?? b.assigned_at ?? b.createdAt).localeCompare(cleanText(a.assignedAt ?? a.assigned_at ?? a.createdAt));
    })[0] ?? {};
}

function getFulfillmentSortSequence(workspace, fulfillmentId) {
  const index = (workspace.fulfillments ?? []).findIndex((item) => item.id === fulfillmentId || item.fulfillmentId === fulfillmentId);
  return index >= 0 ? index + 1 : 0;
}

function compareDriverDeliveryTasks(a, b) {
  const dispatchRankDiff = (Number(a.routeSequence ?? 0) > 0 ? 0 : 1) - (Number(b.routeSequence ?? 0) > 0 ? 0 : 1);
  if (dispatchRankDiff) return dispatchRankDiff;
  const routeDateDiff = cleanText(a.routeDate).localeCompare(cleanText(b.routeDate));
  if (routeDateDiff) return routeDateDiff;
  const routeNoDiff = cleanText(a.routeNo).localeCompare(cleanText(b.routeNo), "zh-Hans-CN");
  if (routeNoDiff) return routeNoDiff;
  const routeSequenceDiff = Number(a.routeSequence ?? 0) - Number(b.routeSequence ?? 0);
  if (routeSequenceDiff) return routeSequenceDiff;
  const rank = { 配送中: 0, 待送货: 1, 送货异常: 2, 已完成: 3 };
  const rankDiff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
  if (rankDiff) return rankDiff;
  const sequenceDiff = Number(a.sortSequence ?? 0) - Number(b.sortSequence ?? 0);
  if (sequenceDiff) return sequenceDiff;
  return cleanText(a.latest).localeCompare(cleanText(b.latest), "zh-Hans-CN");
}

function mapDriverDeliveryStatus(value) {
  const status = cleanText(value);
  if (status === "配送中") return "配送中";
  if (status === "已交付" || status === "已完成") return "已完成";
  if (status.includes("异常") || status.includes("无法") || status.includes("数量")) return "送货异常";
  return "待送货";
}

function buildDriverGoodsSummary({ fulfillment, orderLine = {}, qty }) {
  const colorSpec = getDriverColorSpecLabel(orderLine);
  const printSide = getLinePrintSide(orderLine);
  const remark = getLineRemark(orderLine);
  const parts = [
    cleanText(orderLine.product ?? orderLine.productName) || cleanText(fulfillment.goods ?? fulfillment.productName),
    cleanText(orderLine.size),
    colorSpec && colorSpec !== "待确认" ? colorSpec : "",
    printSide && printSide !== "无需印刷" ? printSide : "",
    `${Number(qty || 0)}个`,
    remark,
  ];
  return parts.filter(Boolean).join(" ");
}

function getDriverColorSpecLabel(line = {}) {
  const labels = [];
  if ((cleanText(line.print) === "是" || line.printFlag === true) && cleanText(line.printColor) && cleanText(line.printColor) !== "待确认") {
    labels.push(`${shortColorName(line.color ?? line.bagColor)}印${shortColorName(line.printColor)}`);
  }
  if (cleanText(line.handleColor) && cleanText(line.handleColor) !== "待确认") {
    labels.push(`${shortColorName(line.color ?? line.bagColor)}袋${shortColorName(line.handleColor)}提`);
  }
  return labels.length ? labels.join(" / ") : getLineColorSpecLabel(line);
}

function getDriverDeliveryNextStep(status) {
  if (status === "配送中") return "到达客户处后提交水印照片，确认完成送货。";
  if (status === "已完成") return "送货已完成，回单进入办公室复核和对账候选。";
  if (status === "送货异常") return "异常已回到办公室处理，司机等待下一步通知。";
  return "先确认已装车，出发后状态进入配送中。";
}

function inferDriverAddressArea(address) {
  const text = cleanText(address);
  if (!text) return "地址待补";
  const firstToken = text.split(/\s+/)[0];
  return firstToken.length > 8 ? firstToken.slice(0, 8) : firstToken;
}

function getDriverOrderTail(line = {}, orderLineId = "") {
  if (line.orderNo && line.lineNo) return getOrderLineShortNo(line);
  const id = cleanText(line.id ?? line.orderLineId ?? orderLineId);
  const match = id.match(/ORD-\d{4}-(\d+)-(\d+)/);
  if (match) return `#${match[1]}-${match[2]}`;
  return id.slice(-5);
}

function buildLocalDriverPackageChecklist(workspace, { fulfillment, orderLineId, packageCount, qty }) {
  const fulfillmentId = cleanText(fulfillment.id ?? fulfillment.fulfillmentId);
  const packageRows = (workspace.packages ?? [])
    .filter((item) => {
      const itemFulfillmentId = cleanText(item.fulfillmentId);
      const itemOrderLineId = cleanText(item.orderLineId);
      return (fulfillmentId && itemFulfillmentId === fulfillmentId) || (!itemFulfillmentId && orderLineId && itemOrderLineId === orderLineId);
    })
    .sort((a, b) => Number(a.packageSeq ?? 0) - Number(b.packageSeq ?? 0));
  if (packageRows.length) {
    return packageRows.map((item, index) =>
      normalizeDriverPackageChecklistItem(item, {
        index,
        packageCount: packageRows.length,
        fulfillmentId,
      }),
    );
  }
  return normalizeDriverPackageChecklist([], {
    fulfillmentId,
    packageSummary: fulfillment.packages ?? fulfillment.packageSummary,
    packageCount,
    qty,
  });
}

function normalizeDriverPackageChecklist(value, fallback = {}) {
  const source = Array.isArray(value) ? value : [];
  const packageSummary = cleanText(fallback.packageSummary);
  const fallbackCount = Math.max(1, Number(fallback.packageCount || parsePackageCount(packageSummary) || source.length || 1));
  const quantities = distributeDriverPackageQty(Number(fallback.qty ?? 0), Math.max(fallbackCount, source.length || 0));
  const normalized = source
    .map((item, index) => normalizeDriverPackageChecklistItem(item, {
      index,
      packageCount: Math.max(fallbackCount, source.length),
      fulfillmentId: fallback.fulfillmentId,
      fallbackQty: quantities[index],
    }))
    .filter(Boolean);
  if (normalized.length) return normalized;
  const count = fallbackCount;
  const generatedQuantities = distributeDriverPackageQty(Number(fallback.qty ?? 0), count);
  return Array.from({ length: count }, (_, index) =>
    normalizeDriverPackageChecklistItem({}, {
      index,
      packageCount: count,
      fulfillmentId: fallback.fulfillmentId,
      fallbackQty: generatedQuantities[index],
      packageSummary,
    }),
  );
}

function normalizeDriverPackageChecklistItem(item = {}, options = {}) {
  const packageSeq = Math.max(1, Number(item.packageSeq ?? item.sequence ?? options.index + 1));
  const packageCount = Math.max(1, Number(item.packageCount ?? options.packageCount ?? 1));
  const packageId =
    cleanText(item.packageId ?? item.id) ||
    [cleanText(options.fulfillmentId) || "DRIVER-PKG", packageSeq].join("-PKG-");
  const packedQty = Math.max(0, Number(item.packedQty ?? item.qty ?? item.expectedQty ?? options.fallbackQty ?? 0));
  const labelText =
    cleanText(item.labelText) ||
    (cleanText(options.packageSummary) && packageCount === 1 ? cleanText(options.packageSummary) : `第 ${packageSeq}/${packageCount} 包`);
  return {
    packageId,
    labelText,
    packageSeq,
    packageCount,
    packedQty,
    quantityText: packedQty ? `${packedQty}个` : "数量待核",
    status: cleanText(item.status) || "待装车核对",
    labelPrintRecordId: cleanText(item.labelPrintRecordId),
    checked: item.checked === true,
  };
}

function distributeDriverPackageQty(totalQty, packageCount) {
  const count = Math.max(1, Math.trunc(Number(packageCount || 1)));
  const total = Math.max(0, Math.trunc(Number(totalQty || 0)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function parsePackageCount(value) {
  const match = cleanText(value).match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function toQueryObject(query) {
  if (query instanceof URLSearchParams) return Object.fromEntries(query.entries());
  return query && typeof query === "object" ? query : {};
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
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
