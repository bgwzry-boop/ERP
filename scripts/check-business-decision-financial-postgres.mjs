import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { loadMigrationFiles, validateMigrationSet } from './dbMigrationUtils.mjs';
import { postgresLiveBusinessSeedSql } from './helpers/postgresLiveBusinessSeed.mjs';
import { createPostgresPoolClient } from '../server/postgresPoolClient.mjs';
import { createPostgresBusinessDecisionEvidenceRepository } from '../server/businessDecisionEvidenceRepository.mjs';
import { createBusinessDecisionDirectiveCommandService } from '../server/services/businessDecisionDirectiveCommandService.mjs';
import { createBusinessDecisionEvidenceService } from '../server/services/businessDecisionEvidenceService.mjs';
import { createBusinessDecisionPolicyService } from '../server/services/businessDecisionPolicyService.mjs';
const name = `erp-decision-financial-${process.pid}-${Date.now()}`;
const docker = (args) => { const result = spawnSync('docker', args, { encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr || result.stdout); return result.stdout.trim(); };
let pool, blocker;
try {
  docker(['run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=erp', '-e', 'POSTGRES_USER=erp', '-e', 'POSTGRES_PASSWORD=erp', 'postgres:16-alpine']);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'erp']).status === 0) break;
    if (attempt === 59) throw Error('PostgreSQL startup timeout');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const port = Number(docker(['port', name, '5432/tcp']).split(':').at(-1));
  pool = new pg.Pool({ host: '127.0.0.1', port, database: 'erp', user: 'erp', password: 'erp', statement_timeout: 15000 });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  const repository = createPostgresBusinessDecisionEvidenceRepository({ postgresClient: createPostgresPoolClient({ pool }) });
  const now = () => new Date('2026-09-05T01:00:00Z');
  const service = createBusinessDecisionDirectiveCommandService({ now,
    businessDecisionEvidenceService: createBusinessDecisionEvidenceService({ policyService: createBusinessDecisionPolicyService({ now }), now }),
    buildOperationLog: (_, input) => ({ ...input, id: 'LOG-DECISION-FINANCIAL-RACE', occurredAt: now().toISOString(), createdAt: now().toISOString() }),
  });
  const workspace = {
    users: [{ userId: 'U-MANAGER-A', employeeId: 'EMP-LIVE-MANAGER-001' }],
    employees: [{ id: 'EMP-LIVE-MANAGER-001', name: '负责人', bizNo: '031', source: 'formal', profileStatus: 'active' }],
    businessDecisionAuthorizations: [{ id: 'AUTH-STMT-WRITEOFF-LIVE', employeeId: 'EMP-LIVE-MANAGER-001', decisionScope: 'statement_write_off', activeFrom: '2026-01-01', maxAmount: 50000, status: 'active', revision: 1 }],
    statements: [{ id: 'ST-LIVE-VAR-001', revision: 1, status: '差额待确认', receivable: 273, received: 200, variance: 73 }],
    businessDecisionRecords: [], businessDecisionEvidenceDrafts: [], attachments: [], attachmentLinks: [], operationLogs: [], operationIdempotencyRecords: [], todos: [],
    businessDecisionEvidenceRepository: repository,
  };
  const body = { idempotencyKey: 'decision-financial-race', businessType: 'statement', businessId: 'ST-LIVE-VAR-001', decisionScope: 'statement_write_off', authorizationAmount: 73, outcome: 'approve', note: '按核实金额处理' };
  const submit = () => service.recordDecisionDirective({ workspace, body, operatorId: 'U-MANAGER-A', actionPermissions: ['business_decision.act_directly', 'statement.write_off.direct'] });
  blocker = await pool.connect();
  await blocker.query('BEGIN');
  await blocker.query("UPDATE statements SET received_amount=201, variance_amount=72, revision=revision+1 WHERE id='ST-LIVE-VAR-001'");
  const pending = submit();
  let observedLock = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%locked_statement%'");
    if (rows[0].count > 0) { observedLock = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await blocker.query('COMMIT'); blocker.release(); blocker = null;
  const rejected = await pending;
  assert.equal(observedLock, true, 'directive must actually wait for the concurrent statement writer');
  assert.equal(rejected.code, 'BUSINESS_DECISION_FINANCIAL_SNAPSHOT_CONFLICT');
  const counts = await pool.query("SELECT (SELECT count(*)::int FROM business_decision_records WHERE business_id='ST-LIVE-VAR-001') AS decisions, (SELECT count(*)::int FROM todos WHERE type='经营决定待执行' AND ref_id='ST-LIVE-VAR-001') AS todos, (SELECT count(*)::int FROM operation_logs WHERE id='LOG-DECISION-FINANCIAL-RACE') AS logs");
  assert.deepEqual(counts.rows[0], { decisions: 0, todos: 0, logs: 0 });
  Object.assign(workspace.statements[0], { received: 201, variance: 72, revision: 2 }); body.authorizationAmount = 72;
  const accepted = await submit();
  assert.equal(accepted.statusCode, 201, JSON.stringify(accepted));
  const replayed = await submit(); assert.equal(replayed.statusCode, 200); assert.equal(replayed.response.replayed, true);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM business_decision_records WHERE business_id='ST-LIVE-VAR-001'")).rows[0].count, 1);
  console.log(`Financial directive PostgreSQL passed: ${migrations.length} migrations, observed row-lock wait, stale snapshot rollback, refreshed retry and exact replay.`);
} finally {
  if (blocker) { await blocker.query('ROLLBACK'); blocker.release(); }
  await pool?.end();
  docker(['rm', '-f', name]);
}
