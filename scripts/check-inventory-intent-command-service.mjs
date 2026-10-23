import { normalizeInventoryHoldTimestamp } from "../shared/inventoryHoldTime.js";
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
  body: { expectedRevision: 1, candidateIndex: 0, inventoryItemId: "INV-001", qty: 20 },
  operatorId: "U-OFFICE-A",
});
assert.equal(inquiry.error, true);
assert.equal(inquiry.code, "INVENTORY_INTENT_NOT_HOLD_REQUEST");
assert.equal(workspace.inventoryReservations.length, 0, "inventory inquiry must not reserve stock");

const created = await service.createTemporaryHold({
  workspace,
  intentId: "INT-HOLD",
  body: {
    expectedRevision: 1,
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
    expectedRevision: 2,
    expiresAt: "2026-07-12T20:30:00+08:00",
    reason: "客户已明确回复，授权延长一小时",
    idempotencyKey: "hold-extend-001",
  },
  operatorId: "U-OFFICE-A",
});
assert.equal(extended.error, undefined);
assert.equal(extended.response.hold.expiresAt, "2026-07-12T12:30:00.000Z");
assert.equal(workspace.inventories[0].reserved, 220, "extension must not change reserved stock");

const extensionState = JSON.stringify(workspace);
const extensionReplayInput = { workspace, reservationId: created.response.hold.reservationId, body: { expectedRevision: 2, expiresAt: "2026-07-12T20:30:00+08:00", reason: "客户已明确回复，授权延长一小时", idempotencyKey: "hold-extend-001" }, operatorId: "U-OFFICE-A" };
clock.value = new Date("2026-07-13T00:00:00Z");
assert.deepEqual(await service.extendTemporaryHold(extensionReplayInput), extended);
assert.equal(JSON.stringify(workspace), extensionState);
assert.equal((await service.extendTemporaryHold({...extensionReplayInput,body:{...extensionReplayInput.body,reason:"另一个原因"}})).code,"IDEMPOTENCY_KEY_REUSED");
clock.value = new Date("2026-07-12T02:00:00Z");

const released = await service.releaseTemporaryHold({
  workspace,
  reservationId: created.response.hold.reservationId,
  body: {
    expectedRevision: 3,
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

// Replay must return the original receipt without a second release or audit write.
const afterRelease = JSON.stringify(workspace);
const creationReplayInput = {workspace,intentId:"INT-HOLD",body:{expectedRevision:1,candidateIndex:0,inventoryItemId:"INV-001",qty:120,idempotencyKey:"hold-create-001"},operatorId:"U-OFFICE-A"};
clock.value = new Date("2026-07-13T00:00:00Z");
assert.deepEqual(await service.createTemporaryHold(creationReplayInput), created);
assert.equal(JSON.stringify(workspace),afterRelease,"Historical create receipt cannot restore released inventory");
assert.equal((await service.createTemporaryHold({...creationReplayInput,body:{...creationReplayInput.body,reason:"changed reason"}})).code,"IDEMPOTENCY_KEY_REUSED");
clock.value = new Date("2026-07-12T02:00:00Z");
assert.deepEqual(await service.extendTemporaryHold(extensionReplayInput), extended);
assert.equal(JSON.stringify(workspace), afterRelease, "Historical extension receipt must never restore a released hold");
const replayReleaseInput = { workspace, reservationId: created.response.hold.reservationId,
  body: { expectedRevision: 3, reason: "客户取消临时留货", idempotencyKey: "hold-release-001" }, operatorId: "U-OFFICE-A" };
assert.deepEqual(await service.releaseTemporaryHold(replayReleaseInput), released);
assert.equal(JSON.stringify(workspace), afterRelease);
const changedReleaseReason = await service.releaseTemporaryHold({ ...replayReleaseInput, body: { ...replayReleaseInput.body, reason: "另一项释放原因" } });
assert.equal(changedReleaseReason.code, "IDEMPOTENCY_KEY_REUSED");
const detachedReceipt = await service.releaseTemporaryHold(replayReleaseInput);
detachedReceipt.response.hold.status = "不应污染缓存";
assert.deepEqual(await service.releaseTemporaryHold(replayReleaseInput), released);
assert.equal(JSON.stringify(workspace), afterRelease);

const expiryWorkspace = buildWorkspace();
const expiring = await service.createTemporaryHold({
  workspace: expiryWorkspace,
  intentId: "INT-HOLD",
  body: {
    expectedRevision: 1,
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
  body: { expectedRevision: 1, candidateIndex: 0, inventoryItemId: "INV-001", qty: 20 },
  operatorId: "U-OFFICE-A",
});
assert.equal(blockedAfterCutoff.code, "TEMPORARY_HOLD_EXPIRY_REVIEW_REQUIRED");
assert.equal(afterCutoffWorkspace.inventoryReservations.length, 0);
const reviewedAfterCutoff = await service.createTemporaryHold({
  workspace: afterCutoffWorkspace,
  intentId: "INT-HOLD",
  body: {
    expectedRevision: 1,
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

{
 const missingStock = buildWorkspace();
 missingStock.inventoryReservations = [{reservationId:'HOLD-MISSING-STOCK',sourceIntentId:'INT-HOLD',inventoryItemId:'INV-MISSING',reservationType:'临时留货',status:'生效',expiresAt:'2026-07-12T11:30:00.000Z',reservedQty:20}];
 const result = await service.expireDueTemporaryHolds({workspace:missingStock});
 assert.equal(result.response.expiredCount,0,'Missing inventory must not count as successfully expired');
 assert.deepEqual(result.response.skipped,[{reservationId:'HOLD-MISSING-STOCK',code:'INVENTORY_ITEM_NOT_FOUND'}]);
 assert.equal(missingStock.inventoryReservations[0].status,'生效');
}

{
 const inconsistent = buildWorkspace();
 inconsistent.inventoryIntents[0].intentStatus='临时留货-生效';
 inconsistent.inventoryReservations=[{id:'HOLD-UNDERFLOW',reservationId:'HOLD-UNDERFLOW',sourceIntentId:'INT-HOLD',inventoryItemId:'INV-001',reservationType:'临时留货',status:'生效',reservedQty:120,revision:1}];
 const before=structuredClone({inventories:inconsistent.inventories,reservations:inconsistent.inventoryReservations,intents:inconsistent.inventoryIntents});
 const result=await service.releaseTemporaryHold({workspace:inconsistent,reservationId:'HOLD-UNDERFLOW',body:{expectedRevision:1,idempotencyKey:'underflow'},operatorId:'U-OFFICE-A'});
 assert.equal(result.error,true,'Insufficient reserved stock must block release, not clamp to zero');
 assert.deepEqual({inventories:inconsistent.inventories,reservations:inconsistent.inventoryReservations,intents:inconsistent.inventoryIntents},before);
 assert.equal(inconsistent.inventoryLedgers.length,0);
 assert.equal(inconsistent.operationLogs.length,0);
}

{
 const raceClock={value:new Date('2026-07-12T02:00:00Z')};
 const raceService=createInventoryIntentCommandService({now:()=>raceClock.value});
 const race=buildWorkspace();
 const created=await raceService.createTemporaryHold({workspace:race,intentId:'INT-HOLD',body:{expectedRevision:1,qty:80,idempotencyKey:'race-create'},operatorId:'U-OFFICE-A'});
 const reservationId=created.response.hold.reservationId;
 const staleRevision=created.response.intent.revision;
 await raceService.extendTemporaryHold({workspace:race,reservationId,body:{expectedRevision:staleRevision,expiresAt:'2026-07-13T11:30:00Z',reason:'Customer confirmed extension',idempotencyKey:'race-extend'},operatorId:'U-OFFICE-A'});
 const snapshot=structuredClone({inventories:race.inventories,reservations:race.inventoryReservations,intents:race.inventoryIntents,ledgers:race.inventoryLedgers,logs:race.operationLogs});
 const oldRelease=await raceService.releaseTemporaryHold({workspace:race,reservationId,body:{expectedRevision:staleRevision,idempotencyKey:'race-old-expiry'},expired:true});
 assert.equal(oldRelease.code,'TEMPORARY_HOLD_NOT_DUE');
 assert.deepEqual({inventories:race.inventories,reservations:race.inventoryReservations,intents:race.inventoryIntents,ledgers:race.inventoryLedgers,logs:race.operationLogs},snapshot);
 raceClock.value=new Date('2026-07-12T12:00:00Z');
 const sweep=await raceService.expireDueTemporaryHolds({workspace:race});
 assert.equal(sweep.response.dueCount,0,'Extended hold must not appear in old expiry window');
 assert.equal(race.inventories[0].reserved,180);
}
console.log('PASS local stale expiry after extension preserves inventory, reservation, intent, ledger and audit.');

{
 const query=buildReleaseTemporaryHoldQuery({...buildSqlInput(),reservationId:'HOLD-SQL',expectedRevision:2,targetStatus:'已过期'});
 assert.match(query.text,/expires_at <= \$[0-9]+::timestamptz/);
}

for (const invalid of [true, [20], {valueOf:()=>20}, Number.MAX_SAFE_INTEGER + 1]) {
 const invalidWorkspace=buildWorkspace();
 const result=await service.createTemporaryHold({workspace:invalidWorkspace,intentId:'INT-HOLD',body:{expectedRevision:1,qty:invalid,expiresAt:'2099-01-01T00:00:00Z',idempotencyKey:'invalid-qty'},operatorId:'U-OFFICE-A'});
 assert.equal(result.code,'VALIDATION_ERROR','Non-scalar or unsafe quantities must fail before reservation');
 assert.equal(invalidWorkspace.inventoryReservations.length,0);
 assert.equal(invalidWorkspace.inventories[0].reserved,100);
}

for (const invalid of [true, [1], Number.MAX_SAFE_INTEGER + 1]) {
 const result=await service.createTemporaryHold({workspace:buildWorkspace(),intentId:'INT-HOLD',body:{expectedRevision:invalid,qty:20,expiresAt:'2099-01-01T00:00:00Z'},operatorId:'U-OFFICE-A'});
 assert.equal(result.code,'VALIDATION_ERROR');
}
{
 const valid=buildWorkspace();
 const result=await service.createTemporaryHold({workspace:valid,intentId:'INT-HOLD',body:{expectedRevision:'1',qty:'20',expiresAt:'2099-01-01T00:00:00Z',idempotencyKey:'valid-scalar'},operatorId:'U-OFFICE-A'});
 assert.equal(result.response.hold.reservedQty,20);
}

for (const candidateIndex of [null, '', false, [], [0]]) {
 const ambiguous=buildWorkspace();
 ambiguous.inventoryIntents[0].candidate.parsedCandidates.push({...ambiguous.inventoryIntents[0].candidate.parsedCandidates[0],qty:50});
 const result=await service.createTemporaryHold({workspace:ambiguous,intentId:'INT-HOLD',body:{expectedRevision:1,candidateIndex,qty:20,expiresAt:'2099-01-01T00:00:00Z'},operatorId:'U-OFFICE-A'});
 assert.equal(result.code,'TEMPORARY_HOLD_CANDIDATE_REQUIRED','Empty or nonnumeric candidate selection must not choose first item');
 assert.equal(ambiguous.inventoryReservations.length,0);
}

for (const candidateIndex of [0, '0']) {
 const valid=buildWorkspace();
 const result=await service.createTemporaryHold({workspace:valid,intentId:'INT-HOLD',body:{expectedRevision:1,candidateIndex,qty:20,expiresAt:'2099-01-01T00:00:00Z'},operatorId:'U-OFFICE-A'});
 assert.equal(result.response.hold.reservedQty,20);
}

{
 const localTime=buildWorkspace();
 const result=await service.createTemporaryHold({workspace:localTime,intentId:'INT-HOLD',body:{expectedRevision:1,qty:20,expiresAt:'2099-01-01T19:30'},operatorId:'U-OFFICE-A'});
 assert.equal(result.response.hold.expiresAt,'2099-01-01T11:30:00.000Z');
}

for (const value of ['2099-02-29T19:30','2099-01-01T24:00',true,123,'2099-01-01']) assert.equal(normalizeInventoryHoldTimestamp(value),'');
assert.equal(normalizeInventoryHoldTimestamp('2096-02-29T19:30'),'2096-02-29T11:30:00.000Z');

{
 const rows=[{reservationId:'H1',inventoryItemId:'INV1',reservationType:'临时留货',status:'生效'}, {reservationId:'H2',inventoryItemId:'INV2',reservationType:'临时留货',status:'生效'}];
 assert.deepEqual(service.listTemporaryHolds({workspace:{inventoryReservations:rows},filters:{inventoryItemId:'INV2'}}).map(row=>row.reservationId),['H2']);
 assert.equal(service.listTemporaryHolds({workspace:{inventoryReservations:rows},filters:{inventoryItemId:'MISSING'}}).length,0);
}

{
 const input={inventoryReservations:[{id:'H-CUSTOMER',reservationType:'临时留货',customerId:'C1',customerName:'stale'}],customers:[{id:'C1',name:'Current customer'},{id:'C2',name:'Other customer'}]};
 assert.equal(service.listTemporaryHolds({workspace:input})[0].customerName,'Current customer');
 input.customers=[];
 assert.equal(service.listTemporaryHolds({workspace:input})[0].customerName,'');
}
