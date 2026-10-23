import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import pg from 'pg';
import {loadMigrationFiles,validateMigrationSet} from './dbMigrationUtils.mjs';
import {postgresLiveBusinessSeedSql} from './helpers/postgresLiveBusinessSeed.mjs';
import {buildStatementDecisionRecord,buildStatementWriteOffRecord,buildOperationLog,buildVarianceRecord,buildTodo} from './helpers/postgresLiveStatementFixtures.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresStatementSettlementTransactionRepository} from '../server/statementSettlementTransactionRepository.mjs';
const name = `erp-settlement-history-${process.pid}-${Date.now()}`;
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

  for(const migration of migrations)await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);

 const client=createPostgresPoolClient({pool}),repo=createPostgresStatementSettlementTransactionRepository({postgresClient:client});
 const statementId='ST-0629-001';
 const header=async()=> (await pool.query('SELECT id,customer_id AS "customerId",revision,status,receivable_amount::float8 AS receivable,received_amount::float8 AS received,variance_amount::float8 AS variance FROM statements WHERE id=$1',[statementId])).rows[0];
 const snapshot=async()=>{const result={};for(const table of ['statements','statement_write_off_records','variance_records','operation_logs','business_decision_records','todos','operation_idempotency_keys'])result[table]=(await pool.query(`SELECT COALESCE(json_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::json) AS rows FROM ${table} t`)).rows[0].rows;return result;};
 const make=async(name,variance=false)=>{const before=await header(),after={...before,status:variance?'有欠款':'已核销',variance:variance?73:0},logId='LOG-'+name,decisionId='BD-'+name;return {workspace:{statements:[before]},statement:after,operationLog:buildOperationLog({logId,before,after,action:variance?'handle_statement_variance':'write_off_statement'}),decisionRecord:buildStatementDecisionRecord({decisionId,statementId,decisionScope:variance?'statement_variance':'statement_write_off',operationLogId:logId,amount:73}),writeOffRecord:buildStatementWriteOffRecord({writeOffId:'SWO-'+name,statementId,businessDecisionId:decisionId,operationLogId:logId}),varianceRecord:buildVarianceRecord({varianceRecordId:'VAR-'+name,statementId,amount:73,operatorId:'U-FINANCE-A'}),todo:variance?{...buildTodo({todoId:'T-'+name,statementId}),customerId:'C001'}:null,idempotencyKey:'request-'+name,idempotencyPayload:{statementId,name}};};
 const open=()=>pool.query("UPDATE statements SET received_amount=200,variance_amount=73,status='差额待确认' WHERE id=$1",[statementId]);
 await open();const original=await make('ORIGINAL');const saved=await repo.writeOffStatement(original);
 assert.equal(saved.statement.status,'已核销');assert.deepEqual(await repo.findSettlementReplay({...original,scope:'statement.write_off'}),saved);
 await open();
 for(const kind of ['record','log','decision']){const input=await make('COLLISION-'+kind);if(kind==='record')input.writeOffRecord.id=original.writeOffRecord.id;if(kind==='log')input.operationLog.id=original.operationLog.id;if(kind==='decision')input.decisionRecord.id=original.decisionRecord.id;const before=await snapshot();await assert.rejects(repo.writeOffStatement(input),e=>e.statusCode===409);assert.deepEqual(await snapshot(),before);}
 const base=await make('VAR-BASE',true);await repo.handleStatementVariance(base);
 for(const kind of ['record','todo','log','decision']){const input=await make('VAR-COLLISION-'+kind,true);if(kind==='record')input.varianceRecord.varianceRecordId=base.varianceRecord.varianceRecordId;if(kind==='todo')input.todo.id=base.todo.id;if(kind==='log')input.operationLog.id=base.operationLog.id;if(kind==='decision')input.decisionRecord.id=base.decisionRecord.id;const before=await snapshot();await assert.rejects(repo.handleStatementVariance(input),e=>e.statusCode===409);assert.deepEqual(await snapshot(),before);}
 const invalid=await make('FOREIGN-PAYMENT',true);invalid.varianceRecord.paymentRecordId='PAY-NOT-OWNED';const before=await snapshot();await assert.rejects(repo.handleStatementVariance(invalid),e=>e.statusCode===409);assert.deepEqual(await snapshot(),before);
 console.log('PASS settlement PostgreSQL: seven record/todo/log/decision collisions roll back every table, foreign payment rejected, closed original request replays unchanged.');
} finally {await pool?.end();docker(['rm','-f',name]);}
