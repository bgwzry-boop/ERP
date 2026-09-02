import assert from "node:assert/strict";
import {
  buildReleaseInventoryReservationTransactionQuery,
  buildReleaseInventoryReservationTransactionSql,
  createLocalInventoryReservationReleaseTransactionRepository,
  createPostgresInventoryReservationReleaseTransactionRepository,
} from "../server/inventoryReservationReleaseTransactionRepository.mjs";
import { createInventoryReservationReleaseCommandService } from "../server/services/inventoryReservationReleaseCommandService.mjs";

await checkInventoryReservationReleaseCommandService();
await checkLocalInventoryReservationReleaseTransactionRepository();
await checkPostgresInventoryReservationReleaseTransactionSqlBoundary();
console.log(
  "Inventory reservation release checks passed: command validation, local mutation, and PostgreSQL release SQL are covered.",
);

async function checkInventoryReservationReleaseCommandService() {
  const service = createInventoryReservationReleaseCommandService({
    buildOperationLog(workspace, input) {
      return {
        id: `LOG-${workspace.operationLogs.length + 1}`,
        ...input,
        pageKey: "api",
        occurredAt: "2026-07-13T08:00:00.000Z",
        createdAt: "2026-07-13T08:00:00.000Z",
      };
    },
    findInventoryItem(workspace, id) {
      return workspace.inventories.find((item) => item.id === id) ?? null;
    },
    findInventoryReservation(workspace, id) {
      return workspace.inventoryReservations.find((item) => item.id === id || item.reservationId === id) ?? null;
    },
    isReleasableInventoryReservation(reservation) {
      return ["生效", "部分释放", "active", "partially_released"].includes(reservation.status);
    },
    nextPlainId(prefix, value) {
      return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
    },
  });
  const workspace = buildWorkspace();
  workspace.inventoryReservationReleaseTransactionRepository =
    createLocalInventoryReservationReleaseTransactionRepository();

  const partial = await service.releaseReservation({
    workspace,
    reservationId: "RSV-F003-001",
    body: {
      releaseQty: 500,
      reason: "qty_changed",
      relatedActionId: "OLCR-001",
      operatorId: "U-SPOOFED",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(partial.response.status, "partially_released");
  assert.equal(partial.response.qty, 1000);
  assert.equal(partial.response.releasedQty, 500);
  assert.equal(workspace.inventories[0].reserved, 1000);
  assert.equal(workspace.inventoryLedgers[0].sourceId, "OLCR-001");
  assert.equal(workspace.inventoryLedgers[0].reason, "订单改量释放库存");
  assert.equal(workspace.inventoryLedgers[0].operatorId, "U-OFFICE-A");
  assert.equal(workspace.operationLogs[0].operatorId, "U-OFFICE-A");

  const full = await service.releaseReservation({
    workspace,
    reservationId: "RSV-F003-001",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(full.response.status, "released");
  assert.equal(full.response.qty, 0);
  assert.equal(workspace.inventories[0].reserved, 0);

  assert.equal(
    (await service.releaseReservation({ workspace, reservationId: "MISSING", operatorId: "U-OFFICE-A" })).code,
    "INVENTORY_RESERVATION_NOT_FOUND",
  );
  const validationWorkspace = buildWorkspace();
  validationWorkspace.inventoryReservationReleaseTransactionRepository =
    createLocalInventoryReservationReleaseTransactionRepository();
  assert.equal(
    (
      await service.releaseReservation({
        workspace: validationWorkspace,
        reservationId: "RSV-F003-001",
        body: { reservationId: "RSV-OTHER" },
        operatorId: "U-OFFICE-A",
      })
    ).code,
    "VALIDATION_ERROR",
  );
  assert.equal(
    (
      await service.releaseReservation({
        workspace: validationWorkspace,
        reservationId: "RSV-F003-001",
        body: { releaseQty: 1501 },
        operatorId: "U-OFFICE-A",
      })
    ).code,
    "INVENTORY_RELEASE_QTY_EXCEEDS_RESERVED",
  );
  validationWorkspace.inventoryReservations[0].reservationType = "临时留货";
  assert.equal(
    (
      await service.releaseReservation({
        workspace: validationWorkspace,
        reservationId: "RSV-F003-001",
        body: {},
        operatorId: "U-OFFICE-A",
      })
    ).code,
    "TEMPORARY_HOLD_DEDICATED_RELEASE_REQUIRED",
  );
}

async function checkLocalInventoryReservationReleaseTransactionRepository() {
  const repository = createLocalInventoryReservationReleaseTransactionRepository();
  const workspace = buildWorkspace();
  const reservation = buildInventoryReservation({ reservedQty: 1000, status: "部分释放" });
  const ledgerEntry = buildInventoryLedgerEntry({ qtyBefore: 1500, qtyChange: -500, qtyAfter: 1000 });
  const operationLog = buildOperationLog({ after: reservation });

  const transaction = await repository.releaseReservation({
    workspace,
    reservation,
    inventoryAdjustment: { inventoryItemId: "INV-F003", reservedQtyChange: -500 },
    inventoryLedgerEntry: ledgerEntry,
    operationLog,
  });

  assert.equal(transaction.reservation.status, "部分释放");
  assert.equal(transaction.inventoryLedgerEntry.ledgerId, "LEDGER-RSV-F003-RELEASE-001");
  assert.equal(transaction.operationLogId, "LOG-RSV-F003-RELEASE-001");
  assert.equal(workspace.inventoryReservations[0].reservedQty, 1000);
  assert.equal(workspace.inventoryReservations[0].status, "部分释放");
  assert.equal(workspace.inventories[0].reserved, 1000);
  assert.equal(workspace.inventoryLedgers.length, 1);
  assert.equal(workspace.operationLogs.length, 1);
}

async function checkPostgresInventoryReservationReleaseTransactionSqlBoundary() {
  const calls = [];
  const reservation = buildInventoryReservation({ reservedQty: 0, status: "已释放" });
  const inventoryLedgerEntry = buildInventoryLedgerEntry({
    qtyBefore: 1500,
    qtyChange: -1500,
    qtyAfter: 0,
    reason: "O'Brien manual release",
  });
  const operationLog = buildOperationLog({ after: reservation, reason: "O'Brien manual release" });
  const repository = createPostgresInventoryReservationReleaseTransactionRepository({
    postgresClient: {
      transactionJson(text, values) {
        calls.push({ text, values });
        return {
          reservation,
          inventoryLedgerEntry,
          operationLogId: operationLog.id,
        };
      },
    },
  });

  const workspace = buildWorkspace();
  const transaction = await repository.releaseReservation({
    workspace,
    reservation,
    inventoryAdjustment: { inventoryItemId: "INV-F003", reservedQtyChange: -1500 },
    inventoryLedgerEntry,
    operationLog,
  });

  assert.equal(transaction.reservation.status, "已释放");
  assert.equal(workspace.inventoryReservations[0].reservedQty, 0);
  assert.equal(workspace.inventories[0].reserved, 0);
  assert.equal(workspace.inventoryLedgers.length, 1);

  const call = calls[0];
  assert.match(call.text, /^BEGIN;/);
  assert.match(call.text, /UPDATE inventory_reservations/);
  assert.match(call.text, /reserved_qty = \$1::integer/);
  assert.match(call.text, /UPDATE inventory_items AS item/);
  assert.match(call.text, /INSERT INTO inventory_ledger_entries/);
  assert.match(call.text, /INSERT INTO operation_logs/);
  assert.doesNotMatch(call.text, /O''Brien manual release/);
  assert.ok(call.values.includes("O'Brien manual release"));
  assert.match(call.text, /COMMIT;/);

  const directInput = {
    reservation,
    inventoryAdjustment: { inventoryItemId: "INV-F003", reservedQtyChange: -1500 },
    inventoryLedgerEntry,
    operationLog,
  };
  const directQuery = buildReleaseInventoryReservationTransactionQuery(directInput);
  const directSql = buildReleaseInventoryReservationTransactionSql(directInput);
  assert.equal(directQuery.text, directSql);
  assert.ok(directQuery.values.length > 25);
  assert.match(directSql, /'reservation'/);
  assert.match(directSql, /'inventoryLedgerEntry'/);
  assert.match(directSql, /'operationLogId'/);
}

function buildWorkspace() {
  return {
    inventories: [{ id: "INV-F003", inStock: 2000, reserved: 1500 }],
    inventoryReservations: [buildInventoryReservation()],
    inventoryLedgers: [],
    operationLogs: [],
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
    ledgerId: "LEDGER-RSV-F003-RELEASE-001",
    inventoryItemId: "INV-F003",
    changeType: "释放占用",
    qtyBefore: 1500,
    qtyChange: -500,
    qtyAfter: 1000,
    sourceType: "inventory_reservation_release",
    sourceId: "RSV-F003-001",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-OFFICE-A",
    occurredAt: "2026-07-02T10:45:00.000Z",
    createdAt: "2026-07-02T10:45:00.000Z",
    reason: "人工释放库存占用",
    remark: "释放占用 500",
    ...overrides,
  };
}

function buildOperationLog(overrides = {}) {
  return {
    id: "LOG-RSV-F003-RELEASE-001",
    targetType: "inventory_reservation",
    targetId: "RSV-F003-001",
    action: "release_inventory_reservation",
    before: buildInventoryReservation(),
    after: buildInventoryReservation({ reservedQty: 1000, status: "部分释放" }),
    reason: "人工释放库存占用",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:45:00.000Z",
    createdAt: "2026-07-02T10:45:00.000Z",
    ...overrides,
  };
}
