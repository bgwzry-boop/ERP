import assert from "node:assert/strict";
import {
  buildRecordFulfillmentActionTransactionQuery,
  buildRecordFulfillmentActionTransactionSql,
  createLocalFulfillmentActionTransactionRepository,
  createPostgresFulfillmentActionTransactionRepository,
} from "../server/fulfillmentActionTransactionRepository.mjs";

await checkLocalFulfillmentActionTransactionRepository();
await checkPostgresFulfillmentActionTransactionSqlBoundary();

console.log(
  "Fulfillment action transaction repository check passed: local workspace mutation and PostgreSQL fulfillment action SQL are covered.",
);

async function checkLocalFulfillmentActionTransactionRepository() {
  const repository = createLocalFulfillmentActionTransactionRepository();
  const workspace = {
    fulfillments: [buildFulfillment()],
    inventories: [{ id: "INV-F003", inStock: 2000, reserved: 1500 }],
    inventoryReservations: [buildInventoryReservation()],
    inventoryLedgers: [],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const printRecord = buildPrintRecord();
  const printLog = buildOperationLog({ logId: "LOG-FULFILLMENT-PRINT-001", action: "print_fulfillment" });
  const printTransaction = await repository.recordFulfillmentAction({
    workspace,
    fulfillment: buildFulfillment({ status: "待确认拉走", printed: true }),
    printRecord,
    operationLog: printLog,
  });

  assert.equal(printTransaction.fulfillment.status, "待确认拉走");
  assert.equal(printTransaction.printRecord.printRecordId, "PR-F003-001");
  assert.equal(printTransaction.operationLogId, "LOG-FULFILLMENT-PRINT-001");
  assert.equal(workspace.fulfillments[0].status, "待确认拉走");
  assert.equal(workspace.printRecords.length, 1);
  assert.equal(workspace.operationLogs.length, 1);

  const completionLog = buildOperationLog({
    logId: "LOG-FULFILLMENT-COMPLETE-001",
    action: "complete_fulfillment",
  });
  const completionTransaction = await repository.recordFulfillmentAction({
    workspace,
    fulfillment: buildFulfillment({ status: "已交付", actualQty: 1500 }),
    inventoryReservations: [buildInventoryReservation({ status: "已出库" })],
    inventoryLedgerEntries: [buildInventoryLedgerEntry()],
    inventoryAdjustments: [{ inventoryItemId: "INV-F003", onHandQtyChange: -1500, reservedQtyChange: -1500 }],
    operationLog: completionLog,
  });

  assert.equal(completionTransaction.fulfillment.status, "已交付");
  assert.equal(completionTransaction.inventoryReservations[0].status, "已出库");
  assert.equal(completionTransaction.inventoryLedgerEntries[0].ledgerId, "LEDGER-F003-OUT-001");
  assert.equal(workspace.inventories[0].inStock, 500);
  assert.equal(workspace.inventories[0].reserved, 0);
  assert.equal(workspace.inventoryReservations[0].status, "已出库");
  assert.equal(workspace.inventoryLedgers.length, 1);

  const legacyWorkspace = {
    fulfillments: [buildFulfillment({ fulfillmentId: "F-LEGACY-001", id: "F-LEGACY-001", status: "待出库" })],
    inventories: [{ id: "INV-F003", inStock: 2000, reserved: 0 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const legacyCompletionLog = buildOperationLog({
    logId: "LOG-FULFILLMENT-LEGACY-COMPLETE-001",
    targetId: "F-LEGACY-001",
    action: "complete_fulfillment",
  });
  const legacyCompletionTransaction = await repository.recordFulfillmentAction({
    workspace: legacyWorkspace,
    fulfillment: buildFulfillment({
      fulfillmentId: "F-LEGACY-001",
      id: "F-LEGACY-001",
      status: "已交付",
      actualQty: 300,
    }),
    inventoryLedgerEntries: [
      buildInventoryLedgerEntry({
        ledgerId: "LEDGER-F-LEGACY-001-OUT",
        qtyBefore: 2000,
        qtyChange: -300,
        qtyAfter: 1700,
        sourceType: "fulfillment_complete_legacy",
        sourceId: "F-LEGACY-001",
        remark: "未发现旧汇总占用，仅扣在库",
      }),
    ],
    inventoryAdjustments: [{ inventoryItemId: "INV-F003", onHandQtyChange: -300, reservedQtyChange: 0 }],
    operationLog: legacyCompletionLog,
  });

  assert.equal(legacyCompletionTransaction.fulfillment.status, "已交付");
  assert.equal(legacyCompletionTransaction.inventoryReservations.length, 0);
  assert.equal(legacyCompletionTransaction.inventoryLedgerEntries[0].sourceType, "fulfillment_complete_legacy");
  assert.equal(legacyWorkspace.inventories[0].inStock, 1700);
  assert.equal(legacyWorkspace.inventories[0].reserved, 0);
  assert.equal(legacyWorkspace.inventoryLedgers.length, 1);

  const cancellationWorkspace = {
    fulfillments: [buildFulfillment()],
    inventories: [{ id: "INV-F003", inStock: 2000, reserved: 1500 }],
    inventoryReservations: [buildInventoryReservation()],
    inventoryLedgers: [],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const cancellationLog = buildOperationLog({
    logId: "LOG-FULFILLMENT-CANCEL-001",
    action: "cancel_fulfillment",
    after: buildFulfillment({ status: "已取消", actualQty: 0 }),
    reason: "办公室修正取消出库",
  });
  const cancellationTransaction = await repository.recordFulfillmentAction({
    workspace: cancellationWorkspace,
    fulfillment: buildFulfillment({ status: "已取消", actualQty: 0 }),
    inventoryReservations: [buildInventoryReservation({ status: "已释放", reservedQty: 0 })],
    inventoryLedgerEntries: [
      buildInventoryLedgerEntry({
        ledgerId: "LEDGER-F003-CANCEL-001",
        changeType: "取消出库释放占用",
        qtyBefore: 1500,
        qtyChange: -1500,
        qtyAfter: 0,
        sourceType: "fulfillment_cancel",
        reason: "办公室修正取消出库",
        remark: "取消出库任务释放占用 1500",
      }),
    ],
    inventoryAdjustments: [{ inventoryItemId: "INV-F003", reservedQtyChange: -1500 }],
    operationLog: cancellationLog,
  });

  assert.equal(cancellationTransaction.fulfillment.status, "已取消");
  assert.equal(cancellationTransaction.inventoryReservations[0].reservedQty, 0);
  assert.equal(cancellationWorkspace.inventoryReservations[0].status, "已释放");
  assert.equal(cancellationWorkspace.inventoryReservations[0].reservedQty, 0);
  assert.equal(cancellationWorkspace.inventories[0].reserved, 0);
  assert.equal(cancellationWorkspace.inventoryLedgers[0].sourceType, "fulfillment_cancel");

  const todo = buildTodo();
  const fulfillmentException = buildFulfillmentException();
  const exceptionLog = buildOperationLog({
    logId: "LOG-FULFILLMENT-EXCEPTION-001",
    action: "create_fulfillment_exception",
    reason: "stock_shortage",
  });
  const exceptionTransaction = await repository.recordFulfillmentAction({
    workspace,
    fulfillment: buildFulfillment({ status: "数量差异待处理", actualQty: 1400 }),
    fulfillmentException,
    todo,
    operationLog: exceptionLog,
  });

  assert.equal(exceptionTransaction.fulfillment.status, "数量差异待处理");
  assert.equal(exceptionTransaction.fulfillmentException.exceptionId, "FEX-001");
  assert.equal(exceptionTransaction.todo.id, "T-FULFILLMENT-001");
  assert.equal(workspace.fulfillments[0].actualQty, 1400);
  assert.equal(workspace.fulfillmentExceptions.length, 1);
  assert.equal(workspace.todos.length, 1);
  assert.equal(workspace.operationLogs.length, 3);
}

async function checkPostgresFulfillmentActionTransactionSqlBoundary() {
  const calls = [];
  const fulfillment = buildFulfillment({
    method: "送货",
    status: "已交付",
    actualQty: 1500,
    latestNeededAt: "2026-07-02T19:00:00.000Z",
    watermarkedPhotoAttached: true,
    watermarkedPhotoAttachmentId: "ATT-LIVE-WATERMARK-001",
    watermarkedPhotoUrl: "https://assets.example.test/watermark.jpg",
    watermarkId: "WM-LIVE-001",
    watermarkText: "白鲸自营店 / 厚街仓库门岗 / 水印 WM-LIVE-001",
    watermarkCapturedAt: "2026-07-02T09:10:00.000Z",
    watermarkLocationLabel: "厚街仓库门岗",
    watermarkGeoPoint: "22.920000,113.680000",
    watermarkAddress: "厚街仓库 A 区",
    watermarkOperatorId: "U-DRIVER-A",
    watermarkOperatorName: "司机A",
    signaturePhotoAttached: true,
    signaturePhotoAttachmentId: "ATT-LIVE-SIGNATURE-001",
    loadedAt: "2026-07-02T09:00:00.000Z",
    loadedBy: "U-DRIVER-A",
    driverRemark: "装车核对：3/3包",
    receiverName: "API 客户签收",
    paperNoteStatus: "已交回",
    deliveryEvidenceReviewStatus: "需重拍",
    deliveryEvidenceReviewedAt: "2026-07-02T10:15:00.000Z",
    deliveryEvidenceReviewedBy: "办公室A",
    deliveryEvidenceReviewedByUserId: "U-OFFICE-A",
    deliveryEvidenceIssueReason: "O'Brien 水印定位不清晰",
    deliveryEvidenceReviewRemark: "请司机补拍",
    deliveryEvidenceReviewUpdatedAt: "2026-07-02T10:15:00.000Z",
  });
  const printRecord = buildPrintRecord({ templateId: "tpl-p0-express-label" });
  const fulfillmentException = buildFulfillmentException({ reason: "O'Brien stock_shortage" });
  const inventoryReservations = [buildInventoryReservation({ status: "已出库" })];
  const inventoryLedgerEntries = [buildInventoryLedgerEntry()];
  const inventoryAdjustments = [{ inventoryItemId: "INV-F003", onHandQtyChange: -1500, reservedQtyChange: -1500 }];
  const todo = buildTodo({ summary: "O'Brien 快运数量差异待确认" });
  const operationLog = buildOperationLog({ logId: "LOG-FULFILLMENT-ACTION-SQL-001", action: "print_fulfillment" });
  const repository = createPostgresFulfillmentActionTransactionRepository({
    postgresClient: {
      async transactionJson(text, values) {
        calls.push({ text, values });
        return {
          fulfillment,
          printRecord,
          fulfillmentException,
          inventoryReservations,
          inventoryLedgerEntries,
          todo,
          operationLogId: operationLog.id,
        };
      },
    },
  });

  const workspace = {
    fulfillments: [buildFulfillment()],
    inventories: [{ id: "INV-F003", inStock: 2000, reserved: 1500 }],
    inventoryReservations: [buildInventoryReservation()],
    inventoryLedgers: [],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const transaction = await repository.recordFulfillmentAction({
    workspace,
    fulfillment,
    printRecord,
    fulfillmentException,
    inventoryReservations,
    inventoryLedgerEntries,
    inventoryAdjustments,
    todo,
    operationLog,
  });

  assert.equal(transaction.fulfillment.fulfillmentId, "F003");
  assert.equal(transaction.fulfillment.watermarkedPhotoAttachmentId, "ATT-LIVE-WATERMARK-001");
  assert.equal(transaction.fulfillment.loadedAt, "2026-07-02T09:00:00.000Z");
  assert.equal(transaction.fulfillment.loadedBy, "U-DRIVER-A");
  assert.equal(transaction.fulfillment.driverRemark, "装车核对：3/3包");
  assert.equal(transaction.fulfillment.receiverName, "API 客户签收");
  assert.equal(transaction.fulfillment.paperNoteStatus, "已交回");
  assert.equal(transaction.fulfillment.deliveryEvidenceReviewStatus, "需重拍");
  assert.equal(workspace.fulfillments[0].deliveryEvidenceIssueReason, "O'Brien 水印定位不清晰");
  assert.equal(workspace.printRecords.length, 1);
  assert.equal(workspace.fulfillmentExceptions.length, 1);
  assert.equal(workspace.fulfillmentExceptions[0].reasonCode, "stock_shortage");
  assert.equal(workspace.fulfillmentExceptions[0].occurredAt, "2026-07-02T10:34:00.000Z");
  assert.equal(workspace.inventoryReservations[0].status, "已出库");
  assert.equal(workspace.inventoryLedgers.length, 1);
  assert.equal(workspace.inventories[0].inStock, 500);
  assert.equal(workspace.inventories[0].reserved, 0);
  assert.equal(workspace.todos.length, 1);

  const { text: sql, values } = calls[0];
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /UPDATE fulfillment_records/);
  assert.match(sql, /watermarked_photo_attachment_id = \$\d+::text/);
  assert.match(sql, /watermark_geo_point = \$\d+::text/);
  assert.match(sql, /loaded_at = COALESCE\(\$\d+::timestamptz, loaded_at\)/);
  assert.match(sql, /loaded_by = COALESCE\(\$\d+::text, loaded_by\)/);
  assert.match(sql, /driver_remark = COALESCE\(NULLIF\(\$\d+::text, ''\), driver_remark\)/);
  assert.match(sql, /receiver_name = COALESCE\(NULLIF\(\$\d+::text, ''\), receiver_name\)/);
  assert.match(sql, /paper_note_status = COALESCE\(NULLIF\(\$\d+::text, ''\), paper_note_status\)/);
  assert.match(sql, /delivery_evidence_review_status = \$\d+::text/);
  assert.match(sql, /delivery_evidence_issue_reason = \$\d+::text/);
  assert.match(sql, /INSERT INTO print_records/);
  assert.match(sql, /INSERT INTO fulfillment_exceptions/);
  assert.match(sql, /reason_code/);
  assert.match(sql, /occurred_at/);
  assert.match(sql, /\$\d+::jsonb/);
  assert.match(sql, /UPDATE inventory_reservations/);
  assert.match(sql, /reserved_qty = updates\.reserved_qty/);
  assert.match(sql, /UPDATE inventory_items AS item/);
  assert.match(sql, /INSERT INTO inventory_ledger_entries/);
  assert.match(sql, /INSERT INTO todos/);
  assert.match(sql, /INSERT INTO operation_logs/);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(sql, /O''Brien|ATT-LIVE-WATERMARK-001|tpl-p0-express-label|stock_shortage/);
  assert.ok(values.includes("O'Brien 水印定位不清晰"));
  assert.ok(values.includes("O'Brien stock_shortage"));
  assert.ok(values.includes("tpl-p0-express-label"));

  const directSql = buildRecordFulfillmentActionTransactionSql({
    fulfillment,
    printRecord,
    fulfillmentException,
    inventoryReservations,
    inventoryLedgerEntries,
    inventoryAdjustments,
    todo,
    operationLog,
  });
  assert.match(directSql, /'fulfillment'/);
  assert.match(directSql, /'printRecord'/);
  assert.match(directSql, /'fulfillmentException'/);
  assert.match(directSql, /'inventoryReservations'/);
  assert.match(directSql, /'inventoryLedgerEntries'/);
  assert.match(directSql, /'todo'/);
  assert.match(directSql, /'deliveryEvidenceReviewStatus'/);
  assert.match(directSql, /'loadedAt'/);
  assert.match(directSql, /'receiverName'/);
  assert.match(directSql, /'paperNoteStatus'/);

  const directQuery = buildRecordFulfillmentActionTransactionQuery({
    fulfillment,
    printRecord,
    fulfillmentException,
    inventoryReservations,
    inventoryLedgerEntries,
    inventoryAdjustments,
    todo,
    operationLog,
  });
  assert.equal(directQuery.text, directSql);
  assert.ok(directQuery.values.length > 80);
  assert.ok(directQuery.values.includes("O'Brien 水印定位不清晰"));
}

function buildFulfillment(overrides = {}) {
  return {
    id: "F003",
    fulfillmentId: "F003",
    bizNo: "F003",
    orderLineId: "ORD-0629-010-01",
    lineId: "ORD-0629-010-01",
    customerId: "C011",
    customerSnapshot: { name: "白鲸自营店" },
    method: "快递快运",
    goods: "白鲸活动袋 35*27 白印黑 / 白袋黑提",
    qty: 1500,
    expectedQty: 1500,
    actualQty: 1500,
    status: "待打印标签",
    latest: "今天 19:00",
    latestNeededAt: "",
    zone: "待快运区",
    source: "待提货锁定",
    createdBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildPrintRecord(overrides = {}) {
  return {
    printRecordId: "PR-F003-001",
    targetType: "fulfillment",
    targetId: "F003",
    templateId: "tpl-p0-fulfillment",
    batchNo: "PB-F003-001",
    status: "printed",
    printAction: "first_print",
    operatorId: "U-OFFICE-A",
    printedAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
    ...overrides,
  };
}

function buildFulfillmentException(overrides = {}) {
  return {
    exceptionId: "FEX-001",
    fulfillmentId: "F003",
    exceptionType: "quantity_mismatch",
    expectedQty: 1500,
    actualQty: 1400,
    reasonCode: "stock_shortage",
    reason: "stock_shortage",
    status: "待办公室处理",
    todoId: "T-FULFILLMENT-001",
    reportedBy: "U-WAREHOUSE-A",
    occurredAt: "2026-07-02T10:34:00.000Z",
    createdAt: "2026-07-02T10:35:00.000Z",
    ...overrides,
  };
}

function buildInventoryReservation(overrides = {}) {
  return {
    id: "RSV-F003-001",
    reservationId: "RSV-F003-001",
    orderLineId: "ORD-0629-010-01",
    inventoryItemId: "INV-F003",
    reservedQty: 1500,
    reservationType: "出库占用",
    status: "生效",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:20:00.000Z",
    ...overrides,
  };
}

function buildInventoryLedgerEntry(overrides = {}) {
  return {
    ledgerId: "LEDGER-F003-OUT-001",
    inventoryItemId: "INV-F003",
    changeType: "出库扣减",
    qtyBefore: 2000,
    qtyChange: -1500,
    qtyAfter: 500,
    sourceType: "fulfillment_complete",
    sourceId: "F003",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-OFFICE-A",
    occurredAt: "2026-07-02T10:45:00.000Z",
    createdAt: "2026-07-02T10:45:00.000Z",
    reason: "完成出库扣减库存",
    remark: "释放占用 1500",
    ...overrides,
  };
}

function buildTodo(overrides = {}) {
  return {
    id: "T-FULFILLMENT-001",
    type: "数量差异待处理",
    customerId: "C011",
    ref: "ORD-0629-010-01",
    summary: "白鲸活动袋 应出 1500，实际 1400；stock_shortage",
    latest: "今天 19:00",
    urgency: "异常",
    impact: "需办公室决定客户沟通、改单或重打单据",
    createdBy: "U-WAREHOUSE-A",
    ...overrides,
  };
}

function buildOperationLog(overrides = {}) {
  return {
    id: overrides.logId ?? "LOG-FULFILLMENT-ACTION-001",
    targetType: "fulfillment",
    targetId: "F003",
    action: overrides.action ?? "print_fulfillment",
    before: buildFulfillment(),
    after: buildFulfillment({ status: "待确认拉走" }),
    reason: overrides.reason ?? "",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
    ...overrides,
  };
}
