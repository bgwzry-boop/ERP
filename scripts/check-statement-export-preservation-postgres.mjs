import { captureStatementExportSnapshot } from '../server/services/statementExportSnapshotService.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { loadMigrationFiles, validateMigrationSet } from './dbMigrationUtils.mjs';
import { postgresLiveBusinessSeedSql } from './helpers/postgresLiveBusinessSeed.mjs';
import { createPostgresPoolClient } from '../server/postgresPoolClient.mjs';
import { createPostgresStatementExportRepository } from '../server/statementExportRepository.mjs';
const name = `erp-export-preserve-${process.pid}-${Date.now()}`;
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
  const client = createPostgresPoolClient({pool});
  const repo = createPostgresStatementExportRepository({postgresClient:client});
  const workspace = { statementExportFiles: [], statementLines: [{ id:'LOCAL-KEEP', finalAmount:77 }], operationLogs: [] };
  const readLines = async () => (await pool.query("SELECT to_jsonb(statement_lines) AS row FROM statement_lines ORDER BY id")).rows;
  const before = await readLines();
  const readSnapshot = async () => {
    const header = (await pool.query("SELECT id, revision, status, receivable_amount AS receivable, received_amount AS received, variance_amount AS variance FROM statements WHERE id='ST-0629-001'")).rows;
    const lines = (await readLines()).map(row => row.row);
    return captureStatementExportSnapshot({statements:header,statementLines:lines}, 'ST-0629-001');
  };
  const expectedStatementSnapshot = await readSnapshot();
  const exportFile = { exportFileId:'EXP-KEEP', downloadToken:'EXP-KEEP', statementId:'ST-0629-001', previewType:'customer_send', fileName:'test.xlsx', content:'original-workbook', contentType:'application/octet-stream', operationLogId:'LOG-EXPORT-KEEP', createdBy:'U-OFFICE-A', createdAt:'2026-09-06T00:00:00Z', metadata:{ statementPreviewSnapshot:{summary:{receivable:273},lines:[{statementLineId:'SNAPSHOT',statementId:'ST-0629-001',orderLineId:'ORD-0629-001-01',finalAmount:273}]} } };
  const log = {id:'LOG-EXPORT-KEEP',targetType:'statement',targetId:'ST-0629-001',action:'preview_statement',operatorId:'U-OFFICE-A',createdAt:'2026-09-06T00:00:00Z',occurredAt:'2026-09-06T00:00:00Z'};
  const input = {workspace,expectedStatementSnapshot,exportFile,operationLog:log,statementLines:[{statementLineId:'POISON',statementId:'ST-0629-001',orderLineId:'ORD-0629-001-01',finalAmount:999}],idempotencyKey:'export-preserve-original',idempotencyPayload:{statementId:'ST-0629-001',previewType:'customer_send'}};
  const saved = await repo.createExportFile(input);
  assert.equal(saved.exportFile.content, 'original-workbook');
  assert.deepEqual(await readLines(), before, 'Every accounting row and column must remain unchanged');
  assert.deepEqual(workspace.statementLines,[{id:'LOCAL-KEEP',finalAmount:77}]);
  const replay = await repo.createExportFile(input);
  assert.equal(replay.operationLogId, log.id);
  assert.deepEqual(await readLines(), before);
  const cold = await createPostgresStatementExportRepository({postgresClient:client}).findExportFileByToken({statementId:'ST-0629-001',downloadToken:'EXP-KEEP'});
  assert.equal(cold.metadata.statementPreviewSnapshot.summary.receivable,273);
  await assert.rejects(repo.createExportFile({...input,idempotencyKey:'export-preserve-conflicting',exportFile:{...exportFile,content:'changed-workbook'},operationLog:{...log,id:'LOG-CONFLICT'}}),error=>error.statusCode===409);
  assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-CONFLICT'")).rows[0].n,0);
  assert.equal((await repo.findExportFileByToken({statementId:'ST-0629-001',downloadToken:'EXP-KEEP'})).content,'original-workbook');
  assert.deepEqual(await readLines(),before);
  // A blank preview payload cannot erase an existing bill either.
  await repo.createExportFile({...input,idempotencyKey:'export-preserve-empty',statementLines:[],exportFile:{...exportFile,exportFileId:'EXP-EMPTY',downloadToken:'EXP-EMPTY'},operationLog:{...log,id:'LOG-EMPTY'}});
  assert.deepEqual(await readLines(),before);
  const writer = await pool.connect();
  try {
    await writer.query('BEGIN');
    await writer.query("SELECT pg_advisory_xact_lock(hashtextextended('statement:ST-0629-001',0))");
    await writer.query("UPDATE statements SET received_amount=received_amount+1,revision=revision+1 WHERE id='ST-0629-001'");
    const stale = {...input,idempotencyKey:'export-snapshot-race',exportFile:{...exportFile,exportFileId:'EXP-RACE',downloadToken:'EXP-RACE'},operationLog:{...log,id:'LOG-RACE'}};
    const pending = repo.createExportFile(stale);
    const outcome = pending.then(value => ({value}),error => ({error}));
    // Observe the export actually waiting on the writer's advisory lock before committing.
    let waiting = false;
    for(let i=0;i<100;i++) {
      waiting = (await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event='advisory' AND pid<>pg_backend_pid()" )).rows[0].n > 0;
      if(waiting) break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.ok(waiting,'Export must wait for the competing statement transaction');
    await writer.query('COMMIT');
    const result = await outcome;
    assert.equal(result.error?.statusCode,409,'Stale export must fail after concurrent payment commit');
    assert.equal((await pool.query("SELECT count(*)::int n FROM statement_export_files WHERE id='EXP-RACE'")).rows[0].n,0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-RACE'")).rows[0].n,0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_idempotency_keys WHERE idempotency_key='export-snapshot-race'")).rows[0].n,0,'Conflict must roll back idempotency record');
    await repo.createExportFile({...stale,expectedStatementSnapshot:await readSnapshot()});
    assert.equal((await repo.findExportFileByToken({statementId:'ST-0629-001',downloadToken:'EXP-RACE'})).downloadToken,'EXP-RACE');
    // A new accounting row arriving while export waits must be retained, never erased.
    const beforeInsertSnapshot = await readSnapshot();
    await writer.query('BEGIN');
    await writer.query("SELECT pg_advisory_xact_lock(hashtextextended('statement:ST-0629-001',0))");
    await writer.query(`INSERT INTO statement_lines
      (id,statement_id,order_line_id,delivered_qty,chargeable_qty,free_qty,amount,adjustment_amount,final_amount)
      SELECT 'SL-CONCURRENT-EXPORT',statement_id,order_line_id,1,1,0,1,0,1
      FROM statement_lines WHERE statement_id='ST-0629-001' LIMIT 1`);
    const insertRace = repo.createExportFile({...input,expectedStatementSnapshot:beforeInsertSnapshot,
      idempotencyKey:'export-new-line-race',exportFile:{...exportFile,exportFileId:'EXP-NEW-LINE',downloadToken:'EXP-NEW-LINE'},
      operationLog:{...log,id:'LOG-NEW-LINE'}}).then(value=>({value}),error=>({error}));
    waiting = false;
    for(let i=0;i<100;i++) {
      waiting = (await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event='advisory' AND pid<>pg_backend_pid()")).rows[0].n > 0;
      if(waiting) break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.ok(waiting,'Export must wait while a new accounting row is being inserted');
    await writer.query('COMMIT');
    assert.equal((await insertRace).error?.statusCode,409);
    assert.equal((await pool.query("SELECT count(*)::int n FROM statement_lines WHERE id='SL-CONCURRENT-EXPORT'")).rows[0].n,1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM statement_export_files WHERE id='EXP-NEW-LINE'")).rows[0].n,0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-NEW-LINE'")).rows[0].n,0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_idempotency_keys WHERE idempotency_key='export-new-line-race'")).rows[0].n,0);
    // Changing an accounting row without changing the header must also conflict.
    const staleLines = await readSnapshot();
    assert.ok(staleLines.lines.length,'Seed must include actual accounting rows for line mutation coverage');
    await pool.query("UPDATE statement_lines SET final_amount=final_amount+1 WHERE statement_id='ST-0629-001'");
    await assert.rejects(repo.createExportFile({...input,expectedStatementSnapshot:staleLines,idempotencyKey:'export-lines-race',exportFile:{...exportFile,exportFileId:'EXP-LINES',downloadToken:'EXP-LINES'},operationLog:{...log,id:'LOG-LINES'}}),error=>error.statusCode===409);
  } finally { await writer.query('ROLLBACK'); writer.release(); }
  console.log(`Statement export PostgreSQL passed: ${migrations.length} migrations; existing accounting rows byte-for-byte unchanged for ordinary, empty and replayed exports; immutable collision rejected without phantom log; fresh export lookup preserves preview snapshot; observed advisory-lock race rejects stale header, rolls back logs/idempotency, permits refreshed retry, preserves concurrently inserted lines, and rejects independently changed accounting rows.`);

} finally { await pool?.end(); docker(['rm','-f',name]); }
