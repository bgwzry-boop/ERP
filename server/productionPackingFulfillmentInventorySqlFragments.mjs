export function buildInsertPackagesSql(packages, parameters, dependency = "") {
  if (packages.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = packages
    .map(
      (record) => `(
    ${parameters.text(record.packageId)},
    ${parameters.text(record.bizNo)},
    ${parameters.text(record.orderLineId)},
    ${parameters.nullableText(record.fulfillmentId)},
    ${parameters.integer(record.packageSeq)},
    ${parameters.integer(record.packageCount)},
    ${parameters.integer(record.packedQty)},
    ${parameters.nullableText(record.labelPrintRecordId)},
    ${parameters.text(record.status)},
    ${parameters.nullableText(record.createdBy)},
    ${timestampParameter(record.createdAt, parameters)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO packages (
  id,
  biz_no,
  order_line_id,
  fulfillment_id,
  package_seq,
  package_count,
  packed_qty,
  label_print_record_id,
  status,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "biz_no", "order_line_id", "fulfillment_id", "package_seq", "package_count", "packed_qty", "label_print_record_id", "status", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  fulfillment_id = EXCLUDED.fulfillment_id,
  package_seq = EXCLUDED.package_seq,
  package_count = EXCLUDED.package_count,
  packed_qty = EXCLUDED.packed_qty,
  label_print_record_id = EXCLUDED.label_print_record_id,
  status = EXCLUDED.status,
  updated_at = now()
RETURNING ${packageJsonExpression("packages")} AS result`;
}

export function buildUpdateFulfillmentSql(fulfillment, parameters, dependency = "") {
  if (!fulfillment) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE fulfillment_records
SET
  expected_qty = ${parameters.integer(fulfillment.expectedQty)},
  actual_qty = ${parameters.nullableInteger(fulfillment.actualQty)},
  status = ${parameters.text(fulfillment.status)},
  confirmed_by = COALESCE(${parameters.nullableText(fulfillment.confirmedBy)}, confirmed_by),
  revision = fulfillment_records.revision + 1,
  updated_at = now()
WHERE id = ${parameters.text(fulfillment.fulfillmentId)}
${buildWriteGuardCondition(dependency)}
RETURNING ${fulfillmentJsonExpression("fulfillment_records")} AS result`;
}

export function buildInsertInventoryReservationsSql(records, parameters, dependency = "") {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.reservationId)},
    ${parameters.text(record.orderLineId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.integer(record.reservedQty)},
    ${parameters.text(record.reservationType)},
    ${parameters.text(record.status)},
    ${parameters.nullableTimestamp(record.expiresAt)},
    ${parameters.nullableText(record.createdBy)},
    ${timestampParameter(record.createdAt, parameters)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO inventory_reservations (
  id,
  order_line_id,
  inventory_item_id,
  reserved_qty,
  reservation_type,
  status,
  expires_at,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "order_line_id", "inventory_item_id", "reserved_qty", "reservation_type", "status", "expires_at", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  reserved_qty = EXCLUDED.reserved_qty,
  reservation_type = EXCLUDED.reservation_type,
  status = EXCLUDED.status,
  updated_at = now()
RETURNING ${inventoryReservationJsonExpression("inventory_reservations")} AS result`;
}

export function buildUpdateInventoryItemsSql(records, parameters, dependency = "") {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) =>
        `(${parameters.text(record.inventoryItemId)}, ${parameters.integer(record.onHandQtyChange)}, ${parameters.integer(
          record.reservedQtyChange,
        )}, ${parameters.integer(record.waitingPickupLockedQtyChange)})`,
    )
    .join(",\n");
  return `UPDATE inventory_items AS item
SET
  on_hand_qty = GREATEST(0, item.on_hand_qty + delta.on_hand_qty_change),
  reserved_qty = GREATEST(0, item.reserved_qty + delta.reserved_qty_change),
  waiting_pickup_locked_qty = GREATEST(0, item.waiting_pickup_locked_qty + delta.waiting_pickup_locked_qty_change),
  revision = item.revision + 1,
  updated_at = now()
FROM (
  SELECT
    inventory_item_id,
    SUM(on_hand_qty_change)::INTEGER AS on_hand_qty_change,
    SUM(reserved_qty_change)::INTEGER AS reserved_qty_change,
    SUM(waiting_pickup_locked_qty_change)::INTEGER AS waiting_pickup_locked_qty_change
  FROM (VALUES
${values}
  ) AS raw(inventory_item_id, on_hand_qty_change, reserved_qty_change, waiting_pickup_locked_qty_change)
  GROUP BY inventory_item_id
) AS delta
WHERE item.id = delta.inventory_item_id
${buildWriteGuardCondition(dependency)}
RETURNING json_build_object(
  'inventoryItemId', item.id,
  'onHandQty', item.on_hand_qty,
  'reservedQty', item.reserved_qty,
  'waitingPickupLockedQty', item.waiting_pickup_locked_qty,
  'revision', item.revision
) AS result`;
}

export function buildInsertInventoryLedgerEntriesSql(records, parameters, dependency = "") {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.ledgerId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.text(record.changeType)},
    ${parameters.integer(record.qtyBefore)},
    ${parameters.integer(record.qtyChange)},
    ${parameters.integer(record.qtyAfter)},
    ${parameters.text(record.sourceType)},
    ${parameters.text(record.sourceId)},
    ${parameters.nullableText(record.operatorId)},
    ${parameters.nullableText(record.confirmedBy)},
    ${timestampParameter(record.occurredAt, parameters)},
    ${timestampParameter(record.createdAt, parameters)},
    ${parameters.nullableText(record.reason)},
    ${parameters.nullableText(record.remark)}
  )`,
    )
    .join(",\n");
  return `INSERT INTO inventory_ledger_entries (
  id,
  inventory_item_id,
  change_type,
  qty_before,
  qty_change,
  qty_after,
  source_type,
  source_id,
  operator_id,
  confirmed_by,
  occurred_at,
  created_at,
  reason,
  remark
) ${buildInsertValuesSource(values, ["id", "inventory_item_id", "change_type", "qty_before", "qty_change", "qty_after", "source_type", "source_id", "operator_id", "confirmed_by", "occurred_at", "created_at", "reason", "remark"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  inventory_item_id = EXCLUDED.inventory_item_id,
  change_type = EXCLUDED.change_type,
  qty_before = EXCLUDED.qty_before,
  qty_change = EXCLUDED.qty_change,
  qty_after = EXCLUDED.qty_after,
  source_type = EXCLUDED.source_type,
  source_id = EXCLUDED.source_id,
  reason = EXCLUDED.reason,
  remark = EXCLUDED.remark
RETURNING ${inventoryLedgerJsonExpression("inventory_ledger_entries")} AS result`;
}

function buildInsertValuesSource(values, columns, dependency) {
  if (!dependency) return `VALUES\n${values}`;
  return `SELECT payload.*
FROM (VALUES\n${values}) AS payload(${columns.join(", ")})
JOIN ${dependency} ON ${dependency}.ok`;
}

function buildWriteGuardCondition(dependency) {
  return dependency ? `AND EXISTS (SELECT 1 FROM ${dependency} WHERE ok)` : "";
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
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function fulfillmentJsonExpression(alias) {
  return `json_build_object(
    'fulfillmentId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'expectedQty', ${alias}.expected_qty,
    'actualQty', ${alias}.actual_qty,
    'status', ${alias}.status,
    'confirmedBy', ${alias}.confirmed_by,
    'revision', ${alias}.revision
  )`;
}

function inventoryReservationJsonExpression(alias) {
  return `json_build_object(
    'reservationId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'reservedQty', ${alias}.reserved_qty,
    'reservationType', ${alias}.reservation_type,
    'status', ${alias}.status,
    'expiresAt', ${alias}.expires_at,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function inventoryLedgerJsonExpression(alias) {
  return `json_build_object(
    'ledgerId', ${alias}.id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'changeType', ${alias}.change_type,
    'qtyBefore', ${alias}.qty_before,
    'qtyChange', ${alias}.qty_change,
    'qtyAfter', ${alias}.qty_after,
    'sourceType', ${alias}.source_type,
    'sourceId', ${alias}.source_id,
    'operatorId', ${alias}.operator_id,
    'confirmedBy', ${alias}.confirmed_by,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at,
    'reason', ${alias}.reason,
    'remark', ${alias}.remark
  )`;
}

function timestampParameter(value, parameters) {
  const text = String(value ?? "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? parameters.timestamp(text) : "now()";
}
