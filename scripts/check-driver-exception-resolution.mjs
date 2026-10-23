import assert from 'node:assert/strict';
import { prepareDriverDeliveryExceptionResolution as prepare } from '../server/services/driverDeliveryExceptionResolutionPolicy.mjs';
import { createLocalFulfillmentActionTransactionRepository } from '../server/fulfillmentActionTransactionRepository.mjs';
const body = { fulfillmentId: 'F-1', exceptionId: 'EX-1', expectedRevision: 3, confirmed: true, quantityVerified: true, reason: '客户已联系，确认原数量继续配送', idempotencyKey: 'resolve-1' };
function fixture(loaded = false) {
  return { fulfillments: [{ id: 'F-1', fulfillmentId: 'F-1', orderLineId: 'L-1', method: '送货', status: '送货异常', revision: 3, expectedQty: 100, actualQty: 100, physicalOutboundAt: '2026-09-04T00:00:00Z', loadedAt: loaded ? '2026-09-04T01:00:00Z' : '', confirmedBy: 'warehouse', createdBy: 'office' }], fulfillmentExceptions: [{ exceptionId: 'EX-1', fulfillmentId: 'F-1', exceptionType: 'delivery_exception', status: '待处理', reasonCode: 'customer_unavailable', reason: '客户不在', actualQty: 0, expectedQty: 100, todoId: 'TODO-1', reportedBy: 'driver', occurredAt: '2026-09-04T02:00:00Z' }], todos: [{ id: 'TODO-1', type: '送货异常待处理', ref: 'F-1', handled: false }], inventories: [{ id: 'I-1', inStock: 50 }], inventoryLedgers: [], statements: [], packages: [] };
}
function plan(workspace, patch = {}) { return prepare({ workspace, fulfillmentId: 'F-1', body: { ...body, ...patch }, operatorId: 'office', now: new Date('2026-09-05T00:00:00Z') }); }
for (const loaded of [false, true]) {
  const workspace = fixture(loaded);
  const original = structuredClone(workspace);
  const prepared = plan(workspace);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.after.status, loaded ? '配送中' : '待送货');
  assert.deepEqual(workspace, original, 'preparation is read-only');
  const repository = createLocalFulfillmentActionTransactionRepository();
  const input = { workspace, idempotencyKey: body.idempotencyKey, idempotencyPayload: { ...body, operatorId: 'office' }, fulfillment: prepared.after, fulfillmentException: prepared.updatedException, driverExceptionBefore: prepared.exception, driverExceptionTodoBefore: prepared.currentTodo, todo: prepared.todo, operationLog: { id: 'LOG-1', logId: 'LOG-1', targetId: 'F-1', action: 'resolve_driver_delivery_exception', operatorId: 'office', before: original, after: prepared.after } };
  repository.recordFulfillmentAction(input);
  assert.equal(workspace.fulfillments[0].status, loaded ? '配送中' : '待送货');
  assert.equal(workspace.fulfillments[0].actualQty, 100);
  assert.equal(workspace.fulfillments[0].confirmedBy, 'warehouse');
  assert.equal(workspace.fulfillments[0].loadedAt, original.fulfillments[0].loadedAt);
  assert.deepEqual(workspace.fulfillmentExceptions[0], { ...original.fulfillmentExceptions[0], id: 'EX-1', status: '已解决' });
  for (const field of ['inventories', 'inventoryLedgers', 'statements', 'packages']) assert.deepEqual(workspace[field], original[field]);
  assert.equal(workspace.todos[0].handledBy, 'office');
  assert.equal(repository.findDriverExceptionResolutionReplay({ workspace, body, operatorId: 'office' }).replayed, true);
  assert.throws(() => repository.findDriverExceptionResolutionReplay({ workspace, body: { ...body, reason: '不同内容' }, operatorId: 'office' }), { code: 'IDEMPOTENCY_KEY_REUSED' });
  assert.equal(workspace.operationLogs.length, 1);
}
for (const [patch, code] of [[{ expectedRevision: 2 }, 'BUSINESS_WRITE_CONFLICT'], [{ confirmed: false }, 'DRIVER_EXCEPTION_CONFIRMATION_REQUIRED'], [{ quantityVerified: false }, 'DRIVER_EXCEPTION_CONFIRMATION_REQUIRED'], [{ reason: '' }, 'DRIVER_EXCEPTION_RESOLUTION_REASON_REQUIRED'], [{ exceptionId: 'OTHER' }, 'DRIVER_EXCEPTION_NOT_OPEN']]) assert.equal(plan(fixture(), patch).code, code);
const multiple = fixture(true);
multiple.fulfillmentExceptions.push({ ...multiple.fulfillmentExceptions[0], exceptionId: 'EX-2' });
assert.equal(plan(multiple).after.status, '送货异常');
assert.equal(plan(multiple).remainingCount, 1);
const invalid = fixture(true); invalid.fulfillments[0].physicalOutboundAt = '';
assert.equal(plan(invalid).code, 'DRIVER_EXCEPTION_LOADING_UNVERIFIED');
const wrongTodo = fixture(); wrongTodo.todos[0].ref = 'F-OTHER';
assert.equal(plan(wrongTodo).code, 'DRIVER_EXCEPTION_TODO_INVALID');
const wrongBinding = fixture(); const p = plan(wrongBinding);
assert.throws(() => createLocalFulfillmentActionTransactionRepository().recordFulfillmentAction({ workspace: wrongBinding, fulfillment: p.after, fulfillmentException: { ...p.updatedException, exceptionId: 'EX-OTHER' }, driverExceptionBefore: p.exception, operationLog: { action: 'resolve_driver_delivery_exception' } }));
console.log('Driver exception resolution: read-only preparation, loaded/unloaded recovery, original evidence preservation, multiple exceptions, stale revision, confirmations, bindings and replay passed. PostgreSQL and browser acceptance remain separate.');

const race = fixture(); const beforeRace = plan(race);
race.todos[0] = { ...race.todos[0], status: '已处理', handled: true, handledBy: 'another-office', handlingResult: '已经处理' };
const raceSnapshot = structuredClone(race);
assert.throws(() => createLocalFulfillmentActionTransactionRepository().recordFulfillmentAction({ workspace: race, fulfillment: beforeRace.after, fulfillmentException: beforeRace.updatedException, driverExceptionBefore: beforeRace.exception, driverExceptionTodoBefore: beforeRace.currentTodo, todo: beforeRace.todo, operationLog: { action: 'resolve_driver_delivery_exception' } }), { code: 'BUSINESS_WRITE_CONFLICT' });
assert.deepEqual(race, raceSnapshot);
assert.deepEqual(plan(race).todo, race.todos[0], 'recovery after refresh preserves existing handler evidence');
const { getRolePermissionSet } = await import('../shared/auth/roleCatalog.js');
for(const role of ['driver','warehouse','production','maintenance']) assert.equal(getRolePermissionSet([role]).actionPermissions.includes('delivery.exception.resolve'),false,role);
for(const role of ['office','management']) assert.equal(getRolePermissionSet([role]).actionPermissions.includes('delivery.exception.resolve'),true,role);
const { resolveOfficeDriverDeliveryException } = await import('../src/services/officeFulfillmentApiClient.js');
const requests=[];
const options={ fetchImpl:async(url,init)=>{ requests.push({url,init}); return new Response(JSON.stringify({fulfillmentId:'F-1',status:'配送中',operationLogId:'LOG-SAVED'}),{status:200,headers:{'content-type':'application/json'}}); } };
for(let i=0;i<2;i++) assert.equal((await resolveOfficeDriverDeliveryException({authState:{session:{accessToken:'test-session'}},...body},options)).blocked,false);
assert.equal(requests[0].init.headers['idempotency-key'],body.idempotencyKey);
assert.equal(requests[1].init.headers['idempotency-key'],body.idempotencyKey);
assert.equal(JSON.parse(requests[0].init.body).idempotencyKey,body.idempotencyKey);
console.log('Driver resolution additional checks: todo race rollback, preserved handler, role permissions and stable HTTP retry identity passed.');
