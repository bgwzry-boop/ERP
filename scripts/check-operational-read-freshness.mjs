import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiServer } from '../server/apiServer.mjs';
import { normalizeCoreWorkspaceState } from '../server/coreWorkspaceReadRepository.mjs';
import { operationalReadWorkspace } from '../server/services/operationalReadWorkspace.mjs';
import { withLocalRepositoryFixture } from './helpers/localRepositoryFixture.mjs';
import { closeTestServer, getTestServerBaseUrl, listenTestServer } from './helpers/apiIntegrationTestHarness.mjs';

const initial = {
  ...normalizeCoreWorkspaceState(null),
  customers: [{ id: 'C-FRESH', name: '读取核对客户', cycle: 'monthly' }],
  statements: [{ id: 'ST-FRESH', customerId: 'C-FRESH', status: '待核对', receivable: 273, received: 0, variance: 273, revision: 1 }],
  statementLines: [{ id: 'SL-FRESH', statementId: 'ST-FRESH', orderLineId: 'OL-FRESH', amount: 273, finalAmount: 273 }],
  fulfillments: [{ id: 'F-FRESH', lineId: 'OL-FRESH', customerId: 'C-FRESH', status: '待出库', method: '自提', expectedQty: 500, revision: 1 }],
  orderLines: [{ id: 'OL-FRESH', orderId: 'O-FRESH', customerId: 'C-FRESH', orderType: '现货', printFlag: false, qty: 500, amount: 273, lineStatus: '待出库' }],
  todos: [{ id: 'T-FRESH', refType: 'order_line', refId: 'OL-FRESH', type: '待办', handled: false }],
};
let stored = structuredClone(initial), failing = false, reads = 0;
const repository = { kind: 'postgres', async loadState() { reads += 1; if (failing) throw Error('synthetic database unavailable'); return structuredClone(stored); } };
const storage = await mkdtemp(join(tmpdir(), 'erp-operational-read-'));
const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: 'test', runtimeStorageRoot: storage, applyProductionEnvFile: false,
  seedSource: 'synthetic', authMode: 'prototype', fixedPreviewUserId: '', authSecret: randomBytes(32).toString('hex'),
  allowLegacyIdentityHeaders: false, allowDefaultSeedUser: false, allowActionPermissionOverride: false, coreWorkspaceReadRepository: repository,
}));
try {
  await server.ready; await listenTestServer(server); const base = getTestServerBaseUrl(server);
  const login = await fetch(base + '/api/auth/prototype-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'U-MANAGER-A' }) });
  assert.equal(login.status, 200); const token = (await login.json()).session.accessToken;
  const get = async path => { const r = await fetch(base + path, { headers: { authorization: 'Bearer ' + token } }); return { status: r.status, body: await r.json() }; };
  assert.equal((await get('/api/statements/ST-FRESH')).body.receivable, 273);
  assert.equal((await get('/api/fulfillments/F-FRESH')).body.status, '待出库');
  // A second worker or audited maintenance transaction commits after this API started.
  stored.statements[0] = { ...stored.statements[0], status: '已作废', receivable: 0, variance: 0, revision: 2 };
  stored.statementLines[0] = { ...stored.statementLines[0], adjustmentAmount: -273, finalAmount: 0 };
  stored.fulfillments[0] = { ...stored.fulfillments[0], status: '已取消', revision: 2 };
  stored.orderLines[0].lineStatus = '已关闭'; stored.todos[0].handled = true;
  const bill = await get('/api/statements/ST-FRESH');
  assert.equal(bill.status, 200); assert.equal(bill.body.status, '已作废'); assert.equal(bill.body.receivable, 0);
  const summaries = await get('/api/statements/customers?status=all');
  assert.equal(summaries.status, 200); assert.equal(summaries.body.items.find(r => r.statementId === 'ST-FRESH').currentReceivable, 0);
  const shipment = await get('/api/fulfillments/F-FRESH');
  assert.equal(shipment.status, 200); assert.equal(shipment.body.status, '已取消'); assert.equal(shipment.body.revision, 2);
  assert.ok(!(await get('/api/todos')).body.items.some(r => r.todoId === 'T-FRESH'));
  const beforeDenied = reads;
  const anonymous = await fetch(base + '/api/statements/customers');
  assert.ok([401, 403].includes(anonymous.status)); assert.equal(reads, beforeDenied);
  failing = true;
  for (const path of ['/api/statements/ST-FRESH', '/api/fulfillments/F-FRESH', '/api/todos']) {
    const result = await get(path); assert.ok(result.status >= 500); assert.ok(!('receivable' in result.body));
  }
  assert.equal((await get('/api/health')).status, 200, 'health remains independent of operational reads');
} finally { await closeTestServer(server); await rm(storage, { recursive: true, force: true }); }

// A delayed snapshot belongs only to its request; it cannot rewind shared state.
let finish;
const shared = { ...structuredClone(initial), users: [{ id: 'AUTH-UNCHANGED' }], coreWorkspaceReadRepository: { kind: 'postgres', loadState: () => new Promise(resolve => { finish = resolve; }) } };
const pending = operationalReadWorkspace(shared, '/api/statements/ST-FRESH');
shared.statements = [{ id: 'ST-FRESH', revision: 3, status: '已作废', receivable: 0 }];
finish(structuredClone(initial)); const responseWorkspace = await pending;
assert.equal(responseWorkspace.statements[0].revision, 1); assert.equal(shared.statements[0].revision, 3);
assert.equal(responseWorkspace.users, shared.users);
await assert.rejects(() => operationalReadWorkspace({ coreWorkspaceReadRepository: { kind: 'postgres', loadState: async () => ({}) } }, '/api/todos'), /snapshot is missing/);
const local = { coreWorkspaceReadRepository: { kind: 'local_memory', loadState: () => { throw Error('must not reload local seed'); } } };
assert.equal(await operationalReadWorkspace(local, '/api/todos'), local);
console.log('Operational reads passed: running signed HTTP sees externally committed statements, shipments and todos; denied/unavailable reads never expose stale balances; delayed reads do not rewind shared state.');
