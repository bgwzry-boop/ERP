import { createPostgresPoolClient } from "./postgresPoolClient.mjs";

export const coreWorkspaceCollectionKeys = Object.freeze([
  "customers",
  "customerContacts",
  "customerAddresses",
  "standardColors",
  "originalOrders",
  "orderLines",
  "orderLineChangeRecords",
  "priceSnapshots",
  "inventories",
  "inventoryReservations",
  "inventoryLedgers",
  "inventoryCorrectionDrafts",
  "productionTasks",
  "workshopReports",
  "packingTasks",
  "fulfillments",
  "fulfillmentExceptions",
  "packages",
  "printRecords",
  "statements",
  "statementLines",
  "todos",
  "todoEvents",
  "varianceRecords",
  "statementSendRecords",
  "statementConfirmationRecords",
  "operationLogs",
]);

const sourceTables = Object.freeze({
  customers: "customers",
  customerContacts: "customer_contacts",
  customerAddresses: "customer_addresses",
  standardColors: "standard_colors",
  originalOrders: "original_orders",
  orderLines: "order_lines",
  orderLineChangeRecords: "order_line_change_records",
  priceSnapshots: "price_snapshots",
  inventories: "inventory_items",
  inventoryReservations: "inventory_reservations",
  inventoryLedgers: "inventory_ledger_entries",
  inventoryCorrectionDrafts: "inventory_correction_drafts",
  productionTasks: "production_tasks",
  workshopReports: "workshop_reports",
  packingTasks: "packing_tasks",
  fulfillments: "fulfillment_records",
  fulfillmentExceptions: "fulfillment_exceptions",
  packages: "packages",
  printRecords: "print_records",
  statements: "statements",
  statementLines: "statement_lines",
  todos: "todos",
  todoEvents: "todo_events",
  varianceRecords: "variance_records",
  statementSendRecords: "statement_send_records",
  statementConfirmationRecords: "statement_confirmation_records",
  operationLogs: "operation_logs",
});

export function createCoreWorkspaceReadRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_CORE_WORKSPACE_STORE ?? process.env.ERP_ORDER_STORE ?? "local";
  if (mode === "postgres") {
    return createPostgresCoreWorkspaceReadRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_ORDER_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalCoreWorkspaceReadRepository();
  throw new Error(`Unsupported core workspace repository mode: ${mode}`);
}

export function createLocalCoreWorkspaceReadRepository() {
  return {
    kind: "local_memory",
    loadState() {
      return {};
    },
  };
}

export function createPostgresCoreWorkspaceReadRepository(options = {}) {
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient(options));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  return {
    kind: "postgres",
    async loadState() {
      const query = buildCoreWorkspaceSnapshotQuery();
      return normalizeCoreWorkspaceState(await queryJson(query.text, query.values));
    },
  };
}

export function buildCoreWorkspaceSnapshotQuery() {
  const entries = Object.entries(sourceTables).map(
    ([key, table]) => `'${key}', (
      SELECT COALESCE(json_agg(to_jsonb(row_data) ORDER BY row_data.id), '[]'::json)
      FROM ${table} AS row_data
    )`,
  );
  return {
    text: `SELECT json_build_object(\n${entries.map((entry) => `  ${entry}`).join(",\n")}\n) AS result;`,
    values: [],
  };
}

export function normalizeCoreWorkspaceState(value) {
  const source = isObject(value) ? value : {};
  const rows = Object.fromEntries(
    coreWorkspaceCollectionKeys.map((key) => [key, Array.isArray(source[key]) ? source[key] : []]),
  );
  const contactsByCustomer = groupBy(rows.customerContacts, (row) => row.customer_id);
  const addressesByCustomer = groupBy(rows.customerAddresses, (row) => row.customer_id);
  const statementLinesByStatement = groupBy(rows.statementLines, (row) => row.statement_id);
  const priceSnapshotsByOrderLine = groupBy(rows.priceSnapshots, (row) => row.order_line_id);
  const reservationsByOrderLine = groupBy(rows.inventoryReservations, (row) => row.order_line_id);
  const packagesByFulfillment = groupBy(rows.packages, (row) => row.fulfillment_id);
  const colorsById = new Map(rows.standardColors.map((row) => [clean(row.id), row]));
  const inventoryById = new Map(rows.inventories.map((row) => [clean(row.id), row]));
  const orderLinesById = new Map(rows.orderLines.map((row) => [clean(row.id), row]));
  const statementsByCustomer = groupBy(rows.statements, (row) => row.customer_id);
  const todoEventsByTodo = groupBy(rows.todoEvents, (row) => row.todo_id);

  return {
    customers: rows.customers.map((row) =>
      toCustomer(
        row,
        contactsByCustomer.get(clean(row.id)) ?? [],
        addressesByCustomer.get(clean(row.id)) ?? [],
        statementsByCustomer.get(clean(row.id)) ?? [],
      ),
    ),
    customerContacts: rows.customerContacts.map(toCustomerContact),
    customerAddresses: rows.customerAddresses.map(toCustomerAddress),
    standardColors: rows.standardColors.map(toStandardColor),
    originalOrders: rows.originalOrders.map(toOriginalOrder),
    orderLines: rows.orderLines.map((row) =>
      toOrderLine(
        row,
        latestRow(priceSnapshotsByOrderLine.get(clean(row.id)) ?? []),
        reservationsByOrderLine.get(clean(row.id)) ?? [],
      ),
    ),
    orderLineChangeRecords: rows.orderLineChangeRecords.map(toOrderLineChangeRecord),
    priceSnapshots: rows.priceSnapshots.map(toPriceSnapshot),
    inventories: rows.inventories.map((row) => toInventory(row, colorsById.get(clean(row.standard_color_id)))),
    inventoryReservations: rows.inventoryReservations.map(toInventoryReservation),
    inventoryLedgers: rows.inventoryLedgers.map(toInventoryLedger),
    inventoryCorrectionDrafts: rows.inventoryCorrectionDrafts.map(toInventoryCorrectionDraft),
    productionTasks: rows.productionTasks.map(toProductionTask),
    workshopReports: rows.workshopReports.map(toWorkshopReport),
    packingTasks: rows.packingTasks.map(toPackingTask),
    fulfillments: rows.fulfillments.map((row) =>
      toFulfillment(
        row,
        orderLinesById.get(clean(row.order_line_id)),
        packagesByFulfillment.get(clean(row.id)) ?? [],
        reservationsByOrderLine.get(clean(row.order_line_id)) ?? [],
        inventoryById,
      ),
    ),
    fulfillmentExceptions: rows.fulfillmentExceptions.map(toFulfillmentException),
    packages: rows.packages.map(toPackage),
    printRecords: rows.printRecords.map(toPrintRecord),
    statements: rows.statements.map((row) =>
      toStatement(row, statementLinesByStatement.get(clean(row.id)) ?? []),
    ),
    statementLines: rows.statementLines.map(toStatementLine),
    todos: rows.todos.map((row) => toTodo(row, latestRow(todoEventsByTodo.get(clean(row.id)) ?? []))),
    todoEvents: rows.todoEvents.map(toTodoEvent),
    varianceRecords: rows.varianceRecords.map(toVarianceRecord),
    statementSendRecords: rows.statementSendRecords.map(toStatementSendRecord),
    statementConfirmationRecords: rows.statementConfirmationRecords.map(toStatementConfirmationRecord),
    operationLogs: rows.operationLogs.map(toOperationLog),
  };
}

function toCustomer(row, contactRows, addressRows, statementRows) {
  const contacts = contactRows.map(toCustomerContact);
  const addresses = addressRows.map(toCustomerAddress);
  const defaultContact = contacts.find((item) => item.isDefault) ?? contacts[0] ?? {};
  const defaultAddress = addresses.find((item) => item.isDefault) ?? addresses[0] ?? {};
  const latestStatement = latestRow(statementRows);
  const currentReceivable = statementRows.reduce(
    (sum, statement) => sum + Math.max(0, number(statement.receivable_amount) - number(statement.received_amount)),
    0,
  );
  const settlementCycle = clean(row.settlement_cycle) || "未设置";
  return {
    id: clean(row.id),
    customerId: clean(row.id),
    bizNo: clean(row.biz_no),
    name: clean(row.name),
    shortName: clean(row.short_name) || clean(row.name),
    cycle: settlementCycle,
    settlementCycle,
    priceTableId: clean(row.price_table_id),
    riskStatus: clean(row.risk_status) || "正常",
    receivable: currentReceivable,
    debt: number(row.debt_amount_snapshot),
    debtAmountSnapshot: number(row.debt_amount_snapshot),
    contact: clean(defaultContact.name),
    phone: clean(defaultContact.phone),
    address: clean(defaultAddress.address),
    contacts,
    addresses,
    lastStatement: clean(latestStatement?.period_end),
    enabled: boolean(row.enabled, true),
    tags: clean(row.risk_status) && clean(row.risk_status) !== "正常" ? [clean(row.risk_status)] : [],
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toCustomerContact(row) {
  return {
    id: clean(row.id),
    contactId: clean(row.id),
    customerId: clean(row.customer_id),
    name: clean(row.contact_name),
    contactName: clean(row.contact_name),
    phone: clean(row.phone),
    role: clean(row.role),
    isDefault: boolean(row.is_default),
    remark: clean(row.remark),
  };
}

function toCustomerAddress(row) {
  return {
    id: clean(row.id),
    addressId: clean(row.id),
    customerId: clean(row.customer_id),
    contactId: clean(row.contact_id),
    address: clean(row.address),
    area: clean(row.area),
    defaultFulfillmentMethod: clean(row.default_fulfillment_method),
    isDefault: boolean(row.is_default),
    remark: clean(row.remark),
  };
}

function toStandardColor(row) {
  return {
    id: clean(row.id),
    standardColorId: clean(row.id),
    colorKey: clean(row.color_key),
    name: clean(row.name),
    enabled: boolean(row.enabled, true),
  };
}

function toOriginalOrder(row) {
  return {
    id: clean(row.id),
    orderId: clean(row.id),
    bizNo: clean(row.biz_no),
    sourceDraftId: clean(row.source_draft_id),
    customerId: clean(row.customer_id),
    customerSnapshot: object(row.customer_snapshot),
    sourceText: clean(row.source_text),
    summaryStatus: clean(row.summary_status),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    voidedAt: timestamp(row.voided_at),
    voidedBy: clean(row.voided_by),
    voidReason: clean(row.void_reason),
  };
}

function toOrderLine(row, priceSnapshot, reservations) {
  const activeReservation = reservations.find((item) => isActiveReservation(item));
  const lineStatus = clean(row.line_status) || "待确认";
  return {
    id: clean(row.id),
    orderLineId: clean(row.id),
    bizNo: clean(row.biz_no),
    orderNo: clean(row.order_id),
    orderId: clean(row.order_id),
    lineNo: clean(row.id).split("-").at(-1) ?? "",
    customerId: clean(row.customer_id),
    product: clean(row.product_name),
    productName: clean(row.product_name),
    orderType: clean(row.order_type),
    size: clean(row.size),
    color: clean(row.bag_color),
    bagColor: clean(row.bag_color),
    handle: clean(row.handle_type),
    handleType: clean(row.handle_type),
    style: clean(row.style),
    print: boolean(row.print_flag) ? "是" : "否",
    printFlag: boolean(row.print_flag),
    printColor: clean(row.print_color),
    printSide: clean(row.print_side),
    handleColor: clean(row.handle_color),
    qty: integer(row.original_qty),
    originalQty: integer(row.original_qty),
    latest: timestamp(row.latest_needed_at) || "待确认",
    latestNeededAt: timestamp(row.latest_needed_at),
    fulfillment: clean(row.fulfillment_method),
    fulfillmentMethod: clean(row.fulfillment_method),
    status: lineStatus,
    lineStatus,
    exceptions: array(row.exception_tags),
    exceptionTags: array(row.exception_tags),
    revision: integer(row.revision, 1),
    amount: number(priceSnapshot?.final_amount),
    inventory: activeReservation ? "已占用" : lineStatus.includes("缺货") ? "缺货" : "",
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    closedAt: timestamp(row.closed_at),
    voidedAt: timestamp(row.voided_at),
    voidedBy: clean(row.voided_by),
    voidReason: clean(row.void_reason),
  };
}

function toOrderLineChangeRecord(row) {
  return {
    id: clean(row.id),
    changeRecordId: clean(row.id),
    orderLineId: clean(row.order_line_id),
    changedFields: array(row.changed_fields),
    before: object(row.before_json),
    after: object(row.after_json),
    reason: clean(row.reason),
    documentReprintRequired: boolean(row.document_reprint_required),
    changedBy: clean(row.changed_by),
    createdAt: timestamp(row.created_at),
  };
}

function toPriceSnapshot(row) {
  return {
    id: clean(row.id),
    priceSnapshotId: clean(row.id),
    orderLineId: clean(row.order_line_id),
    snapshotType: clean(row.snapshot_type),
    versionNo: integer(row.version_no, 1),
    priceTableId: clean(row.price_table_id),
    priceVersion: integer(row.price_version),
    bagPrice: number(row.bag_price),
    printPrice: number(row.print_price),
    otherFee: number(row.other_fee),
    adjustmentAmount: number(row.adjustment_amount),
    chargeableQty: integer(row.chargeable_qty),
    finalAmount: number(row.final_amount),
    amount: number(row.final_amount),
    overrideReason: clean(row.override_reason),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
  };
}

function toInventory(row, colorRow) {
  const inStock = integer(row.on_hand_qty);
  const reserved = integer(row.reserved_qty);
  const locked = integer(row.waiting_pickup_locked_qty);
  const pending = integer(row.pending_handling_qty);
  return {
    id: clean(row.id),
    inventoryItemId: clean(row.id),
    inventoryKey: clean(row.inventory_key),
    size: clean(row.size),
    standardColorId: clean(row.standard_color_id),
    color: clean(colorRow?.name) || clean(row.standard_color_id),
    handle: clean(row.handle_type),
    handleType: clean(row.handle_type),
    style: clean(row.style),
    zone: clean(row.zone),
    state: clean(row.inventory_state),
    inventoryState: clean(row.inventory_state),
    inStock,
    onHandQty: inStock,
    reserved,
    reservedQty: reserved,
    locked,
    waitingPickupLockedQty: locked,
    pending,
    pendingHandlingQty: pending,
    available: Math.max(0, inStock - reserved - locked - pending),
    trustLevel: clean(row.trust_level),
    revision: integer(row.revision, 1),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toInventoryReservation(row) {
  return {
    id: clean(row.id),
    reservationId: clean(row.id),
    orderLineId: clean(row.order_line_id),
    inventoryItemId: clean(row.inventory_item_id),
    qty: integer(row.reserved_qty),
    reservedQty: integer(row.reserved_qty),
    reservationType: clean(row.reservation_type),
    status: clean(row.status),
    revision: integer(row.revision, 1),
    expiresAt: timestamp(row.expires_at),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toInventoryLedger(row) {
  return {
    id: clean(row.id),
    ledgerId: clean(row.id),
    inventoryItemId: clean(row.inventory_item_id),
    changeType: clean(row.change_type),
    qtyBefore: integer(row.qty_before),
    qtyChange: integer(row.qty_change),
    qtyAfter: integer(row.qty_after),
    sourceType: clean(row.source_type),
    sourceId: clean(row.source_id),
    operatorId: clean(row.operator_id),
    confirmedBy: clean(row.confirmed_by),
    occurredAt: timestamp(row.occurred_at),
    createdAt: timestamp(row.created_at),
    reason: clean(row.reason),
    remark: clean(row.remark),
  };
}

function toInventoryCorrectionDraft(row) {
  const expectedQty = integer(row.expected_qty);
  const actualQty = integer(row.actual_qty);
  return {
    id: clean(row.id),
    correctionDraftId: clean(row.id),
    bizNo: clean(row.biz_no),
    inventoryItemId: clean(row.inventory_item_id),
    expectedQty,
    actualQty,
    deltaQty: integer(row.delta_qty),
    reason: clean(row.reason),
    remark: clean(row.remark),
    attachmentIds: array(row.attachment_ids),
    status: clean(row.status),
    revision: integer(row.revision, 1),
    qtyBefore: { onHand: expectedQty },
    requestedQtyAfter: { onHand: actualQty },
    operatorId: clean(row.created_by),
    createdBy: clean(row.created_by),
    confirmedBy: clean(row.confirmed_by),
    confirmedAt: timestamp(row.confirmed_at),
    todoId: clean(row.todo_id),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toProductionTask(row) {
  const finishedGoodsPhoto = object(row.finished_goods_photo);
  return {
    id: clean(row.id),
    productionTaskId: clean(row.id),
    bizNo: clean(row.biz_no),
    orderLineId: clean(row.order_line_id),
    taskType: clean(row.task_type),
    machineId: clean(row.machine_id),
    plannedQty: integer(row.planned_qty),
    taskStatus: clean(row.task_status),
    status: clean(row.task_status),
    publishedScheduleId: clean(row.published_schedule_id),
    revision: integer(row.revision, 1),
    finishedGoodsPhoto,
    finishedGoodsPhotoStatus: clean(finishedGoodsPhoto.status),
    finishedGoodsPhotoAttachmentId: clean(finishedGoodsPhoto.attachmentId),
    finishedGoodsPhotoFileName: clean(finishedGoodsPhoto.fileName),
    finishedGoodsPhotoUploadedAt: timestamp(finishedGoodsPhoto.uploadedAt),
    finishedGoodsPhotoUploadedBy: clean(finishedGoodsPhoto.uploadedBy),
    finishedGoodsPhotoReviewedAt: timestamp(finishedGoodsPhoto.reviewedAt),
    finishedGoodsPhotoReviewedBy: clean(finishedGoodsPhoto.reviewedBy),
    finishedGoodsPhotoRejectedReason: clean(finishedGoodsPhoto.rejectedReason),
    finishedGoodsPhotoHistory: array(finishedGoodsPhoto.history),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toWorkshopReport(row) {
  return {
    id: clean(row.id),
    reportId: clean(row.id),
    productionTaskId: clean(row.production_task_id),
    orderLineId: clean(row.order_line_id),
    processType: clean(row.process_type),
    machineId: clean(row.machine_id),
    operatorId: clean(row.operator_id),
    qualifiedQty: integer(row.qualified_qty),
    exceptionQty: integer(row.exception_qty),
    machineCount: integer(row.machine_count),
    startedAt: timestamp(row.started_at),
    completedAt: timestamp(row.completed_at),
    remark: clean(row.remark),
    evidence: object(row.evidence_json),
    createdAt: timestamp(row.created_at),
  };
}

function toPackingTask(row) {
  return {
    id: clean(row.id),
    packingTaskId: clean(row.id),
    bizNo: clean(row.biz_no),
    orderLineId: clean(row.order_line_id),
    plannedQty: integer(row.planned_qty),
    actualPackedQty: integer(row.actual_packed_qty),
    status: clean(row.status),
    revision: integer(row.revision, 1),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toFulfillment(row, orderLine, packageRows, reservations, inventoryById) {
  const packages = packageRows.map(toPackage);
  const activeReservation = reservations.find(isActiveReservation);
  const inventory = inventoryById.get(clean(activeReservation?.inventory_item_id));
  const qty = integer(row.expected_qty);
  return {
    ...camelizeRecord(row),
    id: clean(row.id),
    fulfillmentId: clean(row.id),
    bizNo: clean(row.biz_no),
    lineId: clean(row.order_line_id),
    orderLineId: clean(row.order_line_id),
    customerId: clean(row.customer_id),
    customerSnapshot: object(row.customer_snapshot),
    method: clean(row.method),
    qty,
    expectedQty: qty,
    actualQty: nullableInteger(row.actual_qty),
    status: clean(row.status),
    latest: timestamp(row.latest_needed_at) || "待确认",
    latestNeededAt: timestamp(row.latest_needed_at),
    goods: [clean(orderLine?.size), clean(orderLine?.bag_color), clean(orderLine?.product_name)].filter(Boolean).join(" "),
    packages: packages.length ? `${packages.length}包` : "",
    packageRecords: packages,
    zone: clean(inventory?.zone),
    source: "PostgreSQL",
    revision: integer(row.revision, 1),
  };
}

function toFulfillmentException(row) {
  return {
    ...camelizeRecord(row),
    id: clean(row.id),
    exceptionId: clean(row.id),
    fulfillmentId: clean(row.fulfillment_id),
    expectedQty: nullableInteger(row.expected_qty),
    actualQty: nullableInteger(row.actual_qty),
    revision: integer(row.revision, 1),
  };
}

function toPackage(row) {
  return {
    id: clean(row.id),
    packageId: clean(row.id),
    bizNo: clean(row.biz_no),
    orderLineId: clean(row.order_line_id),
    fulfillmentId: clean(row.fulfillment_id),
    packageSeq: integer(row.package_seq, 1),
    packageCount: integer(row.package_count, 1),
    packedQty: integer(row.packed_qty),
    labelPrintRecordId: clean(row.label_print_record_id),
    status: clean(row.status),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toPrintRecord(row) {
  return {
    ...camelizeRecord(row),
    id: clean(row.id),
    printRecordId: clean(row.id),
    revision: integer(row.revision, 1),
  };
}

function toStatement(row, lineRows) {
  const periodStart = clean(row.period_start);
  const periodEnd = clean(row.period_end);
  const status = clean(row.status);
  return {
    id: clean(row.id),
    statementId: clean(row.id),
    bizNo: clean(row.biz_no),
    customerId: clean(row.customer_id),
    periodStart,
    periodEnd,
    period: [periodStart, periodEnd].filter(Boolean).join(" 至 "),
    status,
    receivable: number(row.receivable_amount),
    receivableAmount: number(row.receivable_amount),
    received: number(row.received_amount),
    receivedAmount: number(row.received_amount),
    variance: number(row.variance_amount),
    varianceAmount: number(row.variance_amount),
    lineIds: lineRows.map((line) => clean(line.order_line_id)).filter(Boolean),
    sent: Boolean(row.last_sent_at) || status !== "待生成",
    lastSentAt: timestamp(row.last_sent_at),
    settledAt: timestamp(row.settled_at),
    revision: integer(row.revision, 1),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toStatementLine(row) {
  return {
    id: clean(row.id),
    statementLineId: clean(row.id),
    statementId: clean(row.statement_id),
    orderLineId: clean(row.order_line_id),
    fulfillmentId: clean(row.fulfillment_id),
    deliveredQty: integer(row.delivered_qty),
    chargeableQty: integer(row.chargeable_qty),
    freeQty: integer(row.free_qty),
    amount: number(row.amount),
    adjustmentAmount: number(row.adjustment_amount),
    finalAmount: number(row.final_amount),
    createdAt: timestamp(row.created_at),
  };
}

function toTodo(row, latestEvent) {
  const eventPayload = object(latestEvent?.event_payload);
  const projectedTodo = object(eventPayload.todo ?? eventPayload.after);
  const status = clean(row.status) || "未处理";
  return {
    ...projectedTodo,
    id: clean(row.id),
    todoId: clean(row.id),
    bizNo: clean(row.biz_no),
    type: clean(row.type),
    refType: clean(row.ref_type),
    refId: clean(row.ref_id),
    ref: clean(row.ref_id),
    priority: clean(row.priority),
    urgency: clean(row.priority),
    status,
    summary: clean(row.summary),
    dueAt: timestamp(row.due_at),
    latest: timestamp(row.due_at) || "待确认",
    remindAt: timestamp(row.remind_at),
    handled: status === "已处理",
    handledBy: clean(row.handled_by),
    handledAt: timestamp(row.handled_at),
    handlingResult: clean(row.handling_result),
    createdBy: clean(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function toTodoEvent(row) {
  return {
    eventId: clean(row.id),
    todoId: clean(row.todo_id),
    eventType: clean(row.event_type),
    eventPayload: object(row.event_payload),
    operatorId: clean(row.operator_id),
    occurredAt: timestamp(row.occurred_at),
    createdAt: timestamp(row.created_at),
  };
}

function toVarianceRecord(row) {
  return {
    ...camelizeRecord(row),
    id: clean(row.id),
    varianceRecordId: clean(row.id),
    varianceAmount: number(row.variance_amount),
  };
}

function toStatementSendRecord(row) {
  return {
    ...camelizeRecord(row),
    id: clean(row.id),
    sendRecordId: clean(row.id),
    includePaymentQr: boolean(row.include_payment_qr),
  };
}

function toStatementConfirmationRecord(row) {
  return {
    ...camelizeRecord(row),
    id: clean(row.id),
    confirmationRecordId: clean(row.id),
    attachmentIds: array(row.attachment_ids_json),
  };
}

function toOperationLog(row) {
  return {
    id: clean(row.id),
    targetType: clean(row.target_type),
    targetId: clean(row.target_id),
    action: clean(row.action),
    before: row.before_json ?? null,
    after: row.after_json ?? null,
    reason: clean(row.reason),
    operatorId: clean(row.operator_id),
    pageKey: clean(row.page_key),
    occurredAt: timestamp(row.occurred_at),
    createdAt: timestamp(row.created_at),
  };
}

function groupBy(rows, keyOf) {
  const result = new Map();
  for (const row of rows) {
    const key = clean(keyOf(row));
    if (!key) continue;
    const current = result.get(key) ?? [];
    current.push(row);
    result.set(key, current);
  }
  return result;
}

function latestRow(rows) {
  return [...rows].sort((left, right) => {
    const leftValue = clean(left.updated_at ?? left.created_at ?? left.period_end);
    const rightValue = clean(right.updated_at ?? right.created_at ?? right.period_end);
    return rightValue.localeCompare(leftValue);
  })[0];
}

function isActiveReservation(row) {
  const status = clean(row.status);
  return !["已释放", "released", "已取消", "canceled"].includes(status) && integer(row.reserved_qty) > 0;
}

function camelizeRecord(row) {
  return Object.fromEntries(
    Object.entries(isObject(row) ? row : {}).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_match, character) => character.toUpperCase()),
      value,
    ]),
  );
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function object(value) {
  if (isObject(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function array(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  return integer(value);
}

function boolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || value === "") return fallback;
  return ["true", "1", "yes", "是"].includes(clean(value).toLowerCase());
}

function timestamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? clean(value) : parsed.toISOString();
}
