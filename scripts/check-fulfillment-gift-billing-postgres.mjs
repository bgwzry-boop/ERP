import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { loadMigrationFiles, validateMigrationSet } from './dbMigrationUtils.mjs';
import { postgresLiveBusinessSeedSql } from './helpers/postgresLiveBusinessSeed.mjs';
import { createPostgresPoolClient } from '../server/postgresPoolClient.mjs';
import { createPostgresCoreWorkspaceReadRepository } from '../server/coreWorkspaceReadRepository.mjs';
import { resolveFulfillmentBillingQuantity } from '../server/services/fulfillmentBillingQuantityService.mjs';
const name = `erp-gift-billing-${process.pid}-${Date.now()}`;
const docker = (args) => { const result = spawnSync('docker', args, { encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr || result.stdout); return result.stdout.trim(); };
let pool;
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
  await pool.query(`INSERT INTO business_decision_records(id,business_type,business_id,decision_scope,decision_type,decision_maker_employee_id,decision_maker_employee_no_snapshot,decision_maker_name_snapshot,decision_channel,decided_at,decision_content_json,authorization_basis,entered_by_user_id,entered_at,created_at,updated_at)
    VALUES('BD-GIFT','fulfillment','F002','fulfillment_quantity_variance','direct','EMP-LIVE-MANAGER-001','031','负责人','self_system',now(),'{}','管理直接决定','U-MANAGER-A',now(),now(),now());
    INSERT INTO fulfillment_quantity_variance_resolutions(id,fulfillment_id,expected_qty,actual_qty,resolution_result,business_decision_id,recorded_by)
    VALUES('GIFT-F002','F002',1200,1205,'赠送数量','BD-GIFT','U-OFFICE-A');`);
  const cold = await createPostgresCoreWorkspaceReadRepository({postgresClient:createPostgresPoolClient({pool})}).loadState();
  assert.deepEqual(resolveFulfillmentBillingQuantity({workspace:cold,fulfillment:{id:'F002'},actualQty:1205}),{deliveredQty:1205,chargeableQty:1200,freeQty:5});
  console.log(`Gift billing PostgreSQL passed: ${migrations.length} migrations, persisted decision and variance resolution reloaded by fresh core repository, 1205 actual / 1200 billable / 5 free preserved.`);
} finally { await pool?.end(); docker(['rm','-f',name]); }
