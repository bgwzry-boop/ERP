import assert from "node:assert/strict";
import { createPostgresParameterBinder } from "../server/postgresSqlParameters.mjs";
import {
  buildInsertInventoryLedgerEntriesSql,
  buildInsertInventoryReservationsSql,
  buildInsertPackagesSql,
  buildUpdateFulfillmentSql,
  buildUpdateInventoryItemsSql,
} from "../server/productionPackingFulfillmentInventorySqlFragments.mjs";

checkPackagesAndFulfillment();
checkInventoryWrites();

console.log("Production packing fulfillment/inventory SQL fragments check passed: packages, fulfillment, reservations, inventory deltas, and ledgers stay parameterized and guarded.");

function checkPackagesAndFulfillment() {
  const parameters = createPostgresParameterBinder();
  const packagesSql = buildInsertPackagesSql(
    [
      {
        packageId: "PKG-SQL-FRAGMENT-001",
        bizNo: "PKG-001",
        orderLineId: "OL-SQL-FRAGMENT-001",
        fulfillmentId: "FUL-SQL-FRAGMENT-001",
        packageSeq: 1,
        packageCount: 2,
        packedQty: 80,
        labelPrintRecordId: null,
        status: "待打印标签",
        createdBy: "O'Brien",
        createdAt: "2026-07-16T10:00:00.000Z",
      },
    ],
    parameters,
    "write_guard",
  );
  assert.match(packagesSql, /INSERT INTO packages/);
  assert.match(packagesSql, /JOIN write_guard ON write_guard\.ok/);
  assert.match(packagesSql, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.ok(!packagesSql.includes("O'Brien"));
  assert.equal(parameters.values.includes("O'Brien"), true);
  assert.equal(buildInsertPackagesSql([], createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");

  const fulfillmentSql = buildUpdateFulfillmentSql(
    {
      fulfillmentId: "FUL-SQL-FRAGMENT-001",
      expectedQty: 80,
      actualQty: 80,
      status: "待打印标签",
      confirmedBy: "U-WAREHOUSE-A",
    },
    parameters,
    "write_guard",
  );
  assert.match(fulfillmentSql, /UPDATE fulfillment_records/);
  assert.match(fulfillmentSql, /revision = fulfillment_records\.revision \+ 1/);
  assert.match(fulfillmentSql, /AND EXISTS \(SELECT 1 FROM write_guard WHERE ok\)/);
  assert.equal(buildUpdateFulfillmentSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
}

function checkInventoryWrites() {
  const parameters = createPostgresParameterBinder();
  const reservationSql = buildInsertInventoryReservationsSql(
    [
      {
        reservationId: "RSV-SQL-FRAGMENT-001",
        orderLineId: "OL-SQL-FRAGMENT-001",
        inventoryItemId: "INV-SQL-FRAGMENT-001",
        reservedQty: 80,
        reservationType: "production",
        status: "有效",
        expiresAt: "2026-07-17T10:00:00.000Z",
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-16T10:00:00.000Z",
      },
    ],
    parameters,
    "write_guard",
  );
  assert.match(reservationSql, /INSERT INTO inventory_reservations/);
  assert.match(reservationSql, /JOIN write_guard ON write_guard\.ok/);
  assert.match(reservationSql, /reservation_type = EXCLUDED\.reservation_type/);

  const inventorySql = buildUpdateInventoryItemsSql(
    [
      {
        inventoryItemId: "INV-O'Brien",
        onHandQtyChange: 80,
        reservedQtyChange: 80,
        waitingPickupLockedQtyChange: 0,
      },
    ],
    parameters,
    "write_guard",
  );
  assert.match(inventorySql, /UPDATE inventory_items AS item/);
  assert.match(inventorySql, /GROUP BY inventory_item_id/);
  assert.match(inventorySql, /AND EXISTS \(SELECT 1 FROM write_guard WHERE ok\)/);
  assert.ok(!inventorySql.includes("INV-O'Brien"));
  assert.equal(parameters.values.includes("INV-O'Brien"), true);

  const ledgerSql = buildInsertInventoryLedgerEntriesSql(
    [
      {
        ledgerId: "LEDGER-SQL-FRAGMENT-001",
        inventoryItemId: "INV-SQL-FRAGMENT-001",
        changeType: "生产完成入库",
        qtyBefore: 0,
        qtyChange: 80,
        qtyAfter: 80,
        sourceType: "production_report",
        sourceId: "WR-SQL-FRAGMENT-001",
        operatorId: "U-WORKSHOP-A",
        confirmedBy: "U-OFFICE-A",
        occurredAt: "2026-07-16T10:00:00.000Z",
        createdAt: "2026-07-16T10:00:00.000Z",
        reason: null,
        remark: "ledger O'Brien",
      },
    ],
    parameters,
    "write_guard",
  );
  assert.match(ledgerSql, /INSERT INTO inventory_ledger_entries/);
  assert.match(ledgerSql, /JOIN write_guard ON write_guard\.ok/);
  assert.match(ledgerSql, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.ok(!ledgerSql.includes("ledger O'Brien"));
  assert.equal(parameters.values.includes("ledger O'Brien"), true);
  assert.equal(buildInsertInventoryReservationsSql([], createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
  assert.equal(buildUpdateInventoryItemsSql([], createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
  assert.equal(buildInsertInventoryLedgerEntriesSql([], createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
}
