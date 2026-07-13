import assert from "node:assert/strict";
import { createInventoryIntentCommandService } from "../server/services/inventoryIntentCommandService.mjs";
import {
  buildCreateTemporaryHoldQuery,
  buildExtendTemporaryHoldQuery,
  buildReleaseTemporaryHoldQuery,
  createLocalInventoryIntentTransactionRepository,
} from "../server/inventoryIntentTransactionRepository.mjs";

const clock = { value: new Date("2026-07-12T02:00:00.000Z") };
const service = createInventoryIntentCommandService({ now: () => new Date(clock.value) });

const workspace = buildWorkspace();
const inquiry = await service.createTemporaryHold({
  workspace,
  intentId: "INT-INQUIRY",
  body: { clientRevision: 1, candidateIndex: 0, inventoryItemId: "INV-001", qty: 20 },
  operatorId: "U-OFFICE-A",
});
assert.equal(inquiry.error, true);
assert.equal(inquiry.code, "INVENTORY_INTENT_NOT_HOLD_REQUEST");
assert.equal(workspace.inventoryReservations.length, 0, "inventory inquiry must not reserve stock");

const created = await service.createTemporaryHold({
  workspace,
  intentId: "INT-HOLD",
  body: {
    clientRevision: 1,
    candidateIndex: 0,
    inventoryItemId: "INV-001",
    qty: 120,
    idempotencyKey: "hold-create-001",
  },
  operatorId: "U-OFFICE-A",
});
assert.equal(created.error, undefined);
assert.equal(created.response.intent.intentStatus, "临时留货-生效");
assert.equal(created.response.hold.reservedQty, 120);
assert.equal(created.response.hold.expiresAt, "2026-07-12T11:30:00.000Z");
assert.equal(workspace.inventories[0].reserved, 220);
assert.equal(workspace.inventoryLedgers[0].changeType, "临时留货占用");

const extended = await service.extendTemporaryHold({
  workspace,
  reservationId: created.response.hold.reservationId,
  body: {
    clientRevision: 2,
    expiresAt: "2026-07-12T20:30:00+08:00",
    reason: "客户已明确回复，授权延长一小时",
    idempotencyKey: "hold-extend-001",
  },
  operatorId: "U-OFFICE-A",
});
assert.equal(extended.error, undefined);
assert.equal(extended.response.hold.expiresAt, "2026-07-12T12:30:00.000Z");
assert.equal(workspace.inventories[0].reserved, 220, "extension must not change reserved stock");

const released = await service.releaseTemporaryHold({
  workspace,
  reservationId: created.response.hold.reservationId,
  body: {
    clientRevision: 3,
    reason: "客户取消临时留货",
    idempotencyKey: "hold-release-001",
  },
  operatorId: "U-OFFICE-A",
});
assert.equal(released.error, undefined);
assert.equal(released.response.intent.intentStatus, "已取消");
assert.equal(released.response.hold.reservedQty, 0);
assert.equal(workspace.inventories[0].reserved, 100);
assert.equal(workspace.inventoryLedgers[0].qtyChange, -120);

const expiryWorkspace = buildWorkspace();
const expiring = await service.createTemporaryHold({
  workspace: expiryWorkspace,
  intentId: "INT-HOLD",
  body: {
    clientRevision: 1,
    candidateIndex: 0,
    inventoryItemId: "INV-001",
    qty: 80,
    idempotencyKey: "hold-create-expiry",
  },
  operatorId: "U-OFFICE-A",
});
clock.value = new Date("2026-07-12T11:31:00.000Z");
const expiry = await service.expireDueTemporaryHolds({ workspace: expiryWorkspace });
assert.equal(expiry.response.dueCount, 1);
assert.equal(expiry.response.expiredCount, 1);
assert.equal(expiry.response.expired[0].intent.intentStatus, "已过期");
assert.equal(expiryWorkspace.inventories[0].reserved, 100);
assert.equal(expiring.response.hold.reservedQty, 80);

clock.value = new Date("2026-07-12T12:10:00.000Z");
const afterCutoffWorkspace = buildWorkspace();
afterCutoffWorkspace.inventoryIntents[0].candidate = {
  ...afterCutoffWorkspace.inventoryIntents[0].candidate,
  expiresAt: "2026-07-12T19:30:00+08:00",
  requiresExpiryReview: true,
  expiryRule: "manual_future_expiry_required_after_1930",
};
const blockedAfterCutoff = await service.createTemporaryHold({
  workspace: afterCutoffWorkspace,
  intentId: "INT-HOLD",
  body: { clientRevision: 1, candidateIndex: 0, inventoryItemId: "INV-001", qty: 20 },
  operatorId: "U-OFFICE-A",
});
assert.equal(blockedAfterCutoff.code, "TEMPORARY_HOLD_EXPIRY_REVIEW_REQUIRED");
assert.equal(afterCutoffWorkspace.inventoryReservations.length, 0);
const reviewedAfterCutoff = await service.createTemporaryHold({
  workspace: afterCutoffWorkspace,
  intentId: "INT-HOLD",
  body: {
    clientRevision: 1,
    candidateIndex: 0,
    inventoryItemId: "INV-001",
    qty: 20,
    expiresAt: "2026-07-13T19:30:00+08:00",
    reason: "办公室确认19:30后新留货到期时间",
    idempotencyKey: "hold-create-after-cutoff-reviewed",
  },
  operatorId: "U-OFFICE-A",
});
assert.equal(reviewedAfterCutoff.error, undefined);
assert.equal(reviewedAfterCutoff.response.hold.expiresAt, "2026-07-13T11:30:00.000Z");

const sqlInput = buildSqlInput();
for (const query of [
  buildCreateTemporaryHoldQuery(sqlInput),
  buildReleaseTemporaryHoldQuery({
    ...sqlInput,
    reservationId: "HOLD-SQL",
    expectedRevision: 2,
    targetStatus: "已取消",
  }),
  buildExtendTemporaryHoldQuery({
    ...sqlInput,
    reservationId: "HOLD-SQL",
    expectedRevision: 2,
    expiresAt: "2026-07-12T12:30:00.000Z",
  }),
]) {
  assert.match(query.text, /BEGIN;/);
  assert.match(query.text, /erp_require/);
  assert.ok(query.values.length > 0);
  assert.doesNotMatch(query.text, /客户明确要求临时留货/);
}

console.log("Inventory intent command service check passed: inquiry isolation, hold create/extend/release/expiry, revisions, ledgers, and parameterized PostgreSQL transactions are covered.");

function buildWorkspace() {
  return {
    inventoryIntents: [
      {
        id: "INT-HOLD",
        sourceDraftId: "DRAFT-001",
        sourceMessageId: "MSG-HOLD",
        conversationId: "GROUP-001",
        customerId: "C001",
        intentType: "temporary_hold",
        intentStatus: "临时留货-待确认",
        sourceText: "35*27白色有的话给我留120个",
        candidate: {
          expiresAt: "2026-07-12T19:30:00+08:00",
          parsedCandidates: [{ size: "35*27*10", color: "白色", handle: "普通提", style: "空白袋", qty: 120 }],
        },
        revision: 1,
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-12T02:00:00.000Z",
        updatedAt: "2026-07-12T02:00:00.000Z",
      },
      {
        id: "INT-INQUIRY",
        sourceDraftId: "DRAFT-001",
        sourceMessageId: "MSG-INQUIRY",
        conversationId: "GROUP-001",
        customerId: "C001",
        intentType: "inventory_inquiry",
        intentStatus: "询库存-待客户确认",
        sourceText: "35*27白色有吗120个",
        candidate: { parsedCandidates: [{ size: "35*27*10", color: "白色", qty: 120 }] },
        revision: 1,
      },
    ],
    inventories: [{
      id: "INV-001",
      size: "35*27*10",
      color: "白色",
      handle: "普通提",
      style: "空白袋",
      inStock: 1000,
      onHandQty: 1000,
      reserved: 100,
      reservedQty: 100,
      locked: 0,
      pending: 0,
      revision: 4,
    }],
    inventoryReservations: [],
    inventoryLedgers: [],
    operationLogs: [],
    inventoryIntentTransactionRepository: createLocalInventoryIntentTransactionRepository(),
  };
}

function buildSqlInput() {
  return {
    intent: buildWorkspace().inventoryIntents[0],
    expectedRevision: 1,
    inventoryItem: { id: "INV-001" },
    reservation: {
      reservationId: "HOLD-SQL",
      sourceIntentId: "INT-HOLD",
      customerId: "C001",
      sourceMessageId: "MSG-HOLD",
      inventoryItemId: "INV-001",
      reservedQty: 120,
      expiresAt: "2026-07-12T11:30:00.000Z",
      metadata: { reason: "客户明确要求临时留货" },
      createdBy: "U-OFFICE-A",
      createdAt: "2026-07-12T02:00:00.000Z",
    },
    inventoryLedgerEntry: {
      ledgerId: "LEDGER-HOLD-SQL",
      inventoryItemId: "INV-001",
      changeType: "临时留货占用",
      qtyBefore: 100,
      qtyChange: 120,
      qtyAfter: 220,
      sourceType: "inventory_temporary_hold",
      sourceId: "INT-HOLD",
      operatorId: "U-OFFICE-A",
      confirmedBy: "U-OFFICE-A",
      occurredAt: "2026-07-12T02:00:00.000Z",
      createdAt: "2026-07-12T02:00:00.000Z",
      reason: "客户明确要求临时留货",
      remark: "留货至 19:30",
    },
    operationLog: {
      id: "LOG-HOLD-SQL",
      targetType: "inventory_intent",
      targetId: "INT-HOLD",
      action: "create_temporary_inventory_hold",
      before: {},
      after: {},
      reason: "客户明确要求临时留货",
      operatorId: "U-OFFICE-A",
      pageKey: "inventory",
      occurredAt: "2026-07-12T02:00:00.000Z",
      createdAt: "2026-07-12T02:00:00.000Z",
    },
    updatedAt: "2026-07-12T02:00:00.000Z",
  };
}
