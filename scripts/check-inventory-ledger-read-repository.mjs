import assert from "node:assert/strict";
import {
  buildListInventoryLedgerEntriesQuery,
  buildListInventoryLedgerEntriesSql,
  createLocalInventoryLedgerReadRepository,
  createPostgresInventoryLedgerReadRepository,
} from "../server/inventoryLedgerReadRepository.mjs";

await checkLocalInventoryLedgerReadRepository();
await checkPostgresInventoryLedgerReadRepository();

console.log(
  "Inventory ledger read repository check passed: local filtering/normalization and PostgreSQL ledger SQL are covered.",
);

async function checkLocalInventoryLedgerReadRepository() {
  const repository = createLocalInventoryLedgerReadRepository();
  const workspace = {
    users: [
      { id: "U-OFFICE-A", displayName: "办公室A" },
      { id: "U-MANAGER-A", displayName: "经理A" },
    ],
    inventories: [
      {
        id: "INV-LOCAL-001",
        inventoryKey: "30*38*10|白色|普通提|空白袋|A区|仓库已清点",
        size: "30*38*10",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
        zone: "A区",
        state: "仓库已清点",
        trust: "已清点",
      },
      {
        id: "INV-LOCAL-002",
        inventoryKey: "25*32*10|红色|加长提|空白袋|B区|仓库已清点",
        size: "25*32*10",
        color: "红色",
        handle: "加长提",
        style: "空白袋",
        zone: "B区",
        state: "仓库已清点",
        trust: "已清点",
      },
    ],
    inventoryLedgers: [
      {
        ledgerId: "LEDGER-LOCAL-001",
        inventoryItemId: "INV-LOCAL-001",
        changeType: "correction",
        qtyBefore: 100,
        qtyChange: 20,
        qtyAfter: 120,
        correctionDraftId: "ADJ-LOCAL-001",
        operatorId: "U-OFFICE-A",
        confirmedBy: "U-MANAGER-A",
        occurredAt: "2026-07-02T09:30:00.000Z",
        createdAt: "2026-07-02T09:30:00.000Z",
        reason: "盘点差异",
        remark: "本地检查",
      },
      {
        ledgerId: "LEDGER-LOCAL-002",
        inventoryItemId: "INV-LOCAL-001",
        changeType: "release",
        qtyBefore: 50,
        qtyChange: 4,
        qtyAfter: 46,
        sourceType: "inventory_reservation",
        sourceId: "RSV-LOCAL-001",
        operatorId: "U-OFFICE-A",
        occurredAt: "2026-07-02T10:30:00.000Z",
      },
      {
        ledgerId: "LEDGER-LOCAL-003",
        inventoryItemId: "INV-LOCAL-002",
        changeType: "reservation",
        qtyBefore: 0,
        qtyChange: 30,
        qtyAfter: 30,
        sourceType: "order_line",
        sourceId: "OL-LOCAL-001",
        operatorId: "U-OFFICE-A",
        occurredAt: "2026-07-01T10:30:00.000Z",
      },
    ],
  };

  const listed = await repository.listInventoryLedgerEntries({
    workspace,
    query: {
      inventoryItemId: "INV-LOCAL-001",
      keyword: "白色",
      pageSize: 1,
    },
  });

  assert.equal(listed.total, 2);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].ledgerId, "LEDGER-LOCAL-002");
  assert.equal(listed.items[0].inventoryKey, "30*38*10|白色|普通提|空白袋|A区|仓库已清点");
  assert.equal(listed.items[0].colorName, "白色");
  assert.equal(listed.items[0].handleType, "普通提");
  assert.equal(listed.items[0].inventoryState, "仓库已清点");
  assert.equal(listed.items[0].sourceType, "inventory_reservation");

  const correction = await repository.listInventoryLedgerEntries({
    workspace,
    query: { changeType: "correction", sourceType: "inventory_correction" },
  });
  assert.equal(correction.total, 1);
  assert.equal(correction.items[0].sourceId, "ADJ-LOCAL-001");
  assert.equal(correction.items[0].operatorName, "办公室A");
  assert.equal(correction.items[0].confirmedByName, "经理A");
}

async function checkPostgresInventoryLedgerReadRepository() {
  const calls = [];
  const repository = createPostgresInventoryLedgerReadRepository({
    queryJson(text, values) {
      calls.push({ text, values });
      return {
        items: [
          {
            ledgerId: "LEDGER-PG-001",
            inventoryItemId: "INV-PG-001",
            inventoryKey: "30*38*10|白色|普通提|空白袋|A区|仓库已清点",
            size: "30*38*10",
            colorName: "白色",
            handleType: "普通提",
            style: "空白袋",
            zone: "A区",
            inventoryState: "仓库已清点",
            trustLevel: "已清点",
            changeType: "correction",
            qtyBefore: 100,
            qtyChange: 20,
            qtyAfter: 120,
            sourceType: "inventory_correction",
            sourceId: "ADJ-PG-001",
            operatorId: "U-OFFICE-A",
            operatorName: "办公室A",
            confirmedBy: "U-MANAGER-A",
            confirmedByName: "经理A",
            occurredAt: "2026-07-02T10:30:00.000Z",
            createdAt: "2026-07-02T10:30:00.000Z",
            reason: "cycle_count",
            remark: "Postgres check",
          },
        ],
        page: 2,
        pageSize: 20,
        total: 1,
        filters: {
          keyword: "O'Brien",
          inventoryItemId: "INV-PG-001",
          sourceType: "inventory_correction",
          sourceId: "ADJ-PG-001",
          changeType: "correction",
          dateFrom: "2026-07-01",
          dateTo: "2026-07-02",
        },
      };
    },
  });

  const listed = await repository.listInventoryLedgerEntries({
    query: {
      keyword: "O'Brien",
      inventoryItemId: "INV-PG-001",
      sourceType: "inventory_correction",
      sourceId: "ADJ-PG-001",
      changeType: "correction",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
      page: 2,
      pageSize: 20,
    },
  });

  assert.equal(listed.page, 2);
  assert.equal(listed.pageSize, 20);
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].ledgerId, "LEDGER-PG-001");
  assert.equal(listed.items[0].colorName, "白色");
  assert.equal(listed.items[0].operatorName, "办公室A");
  assert.equal(listed.filters.inventoryItemId, "INV-PG-001");

  const call = calls[0];
  assert.match(call.text, /FROM inventory_ledger_entries AS entry/);
  assert.match(call.text, /JOIN inventory_items AS item/);
  assert.match(call.text, /LEFT JOIN standard_colors AS color/);
  assert.match(call.text, /LEFT JOIN users AS operator_user/);
  assert.match(call.text, /entry.inventory_item_id = \$1::text/);
  assert.match(call.text, /entry.source_type = \$2::text/);
  assert.match(call.text, /entry.source_id = \$3::text/);
  assert.match(call.text, /entry.change_type = \$4::text/);
  assert.match(call.text, /entry.occurred_at >= \$5::text::date/);
  assert.match(call.text, /entry.occurred_at < \(\$6::text::date \+ INTERVAL '1 day'\)/);
  assert.doesNotMatch(call.text, /O''Brien/);
  assert.ok(call.values.includes("%O'Brien%"));
  assert.match(call.text, /LIMIT \$8::integer/);
  assert.match(call.text, /OFFSET \$9::integer/);

  const directQuery = buildListInventoryLedgerEntriesQuery({ pageSize: 5 });
  const directSql = buildListInventoryLedgerEntriesSql({ pageSize: 5 });
  assert.match(directSql, /'items'/);
  assert.equal(directQuery.text, directSql);
  assert.deepEqual(directQuery.values, [5, 0, 1, 5, "", "", "", "", "", "", ""]);
}
