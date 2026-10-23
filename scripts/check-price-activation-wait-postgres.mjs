import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {
  buildClaimErpPriceReleaseDeliveriesQuery as claimQuery,
  buildMarkErpPriceReleaseWaitingQuery as waitingQuery,
  buildMarkErpPriceReleaseDeliveryFailedQuery as failedQuery,
  buildMarkErpPriceReleaseDeliveredQuery as deliveredQuery,
} from '../server/miniapp/erpPriceReleaseDeliveryRepository.mjs';

// Dedicated disposable database. Never reads application credentials or env files.
const container = `erp-price-wait-${randomUUID()}`;
const password = randomUUID();
const now = '2026-09-11T00:00:00Z';
let started = false;
let pool;
const docker = (...args) => execFileSync('docker', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try {
  docker('run','-d','--rm','--name',container,'-e',`POSTGRES_PASSWORD=${password}`,'-p','127.0.0.1::5432','postgres:16-alpine');
  started = true;
  let ready = false;
  for(let i=0;i<60;i++) {
    try { docker('exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'); ready=true; break; }
    catch { await new Promise(resolve=>setTimeout(resolve,250)); }
  }
  assert.ok(ready,'isolated PostgreSQL must become ready');
  const port = Number(docker('port',container,'5432/tcp').split(':').pop());
  pool = new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'});
  await pool.query('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE customers(id TEXT PRIMARY KEY); CREATE TABLE order_intake_snapshots(id TEXT PRIMARY KEY, authoritative BOOLEAN);');
  await pool.query(await readFile(new URL('../db/migrations/0034_miniapp_price_release_authority.sql',import.meta.url),'utf8'));
  await pool.query("INSERT INTO users VALUES ('creator'),('reviewer'); INSERT INTO miniapp_price_releases(id,price_version,requested_effective_from,change_summary,payload_sha256,bundle_json,status,created_by,reviewed_by,reviewed_at,published_at) VALUES ('r','v','2026-09-12','audit',repeat('a',64),'{}','delivering','creator','reviewer',now(),now()); INSERT INTO miniapp_price_release_delivery_jobs(id,release_id,next_attempt_at) VALUES ('j','r','2026-01-01');");
  const run = async q => (await pool.query(q.text,q.values)).rows[0].result;
  let sequence=0;
  const claim = async () => (await run(claimQuery({now,leaseExpiresAt:'2026-09-11T00:01:00Z',workerId:'test',leaseTokenPrefix:`lease-${sequence++}:`,maxAttempts:10,limit:1}))).claims;
  const job = async () => (await pool.query('SELECT status,attempt_count FROM miniapp_price_release_delivery_jobs')).rows[0];
  for(let i=0;i<25;i++) {
    const [c]=await claim(); assert.ok(c,'normal waiting must remain claimable');
    const waiting={jobId:'j',leaseToken:c.leaseToken,nextAttemptAt:now,acknowledgement:{status:'validated',activationOutcome:'not_due'},now};
    assert.equal((await run(waitingQuery({...waiting,leaseToken:'stale'}))).updated,false);
    assert.equal((await job()).attempt_count,1,'stale receipt cannot refund an attempt');
    assert.equal((await run(waitingQuery(waiting))).updated,true);
    assert.equal((await run(waitingQuery(waiting))).updated,false,'duplicate receipt cannot refund twice');
    assert.equal((await job()).attempt_count,0);
  }
  const [active]=await claim();
  assert.equal((await run(deliveredQuery({jobId:'j',releaseId:'r',leaseToken:active.leaseToken,activatedAt:'2026-09-12T00:00:00Z',now:'2026-09-12T00:00:00Z',acknowledgement:{status:'active'}}))).updated,true);
  assert.equal((await job()).status,'succeeded');
  assert.equal((await pool.query("SELECT status FROM miniapp_price_releases WHERE id='r'")).rows[0].status,'published');
  // Reset this isolated fixture to test real failures, including a valid wait between them.
  await pool.query("UPDATE miniapp_price_releases SET status='delivering'; UPDATE miniapp_price_release_delivery_jobs SET status='pending',attempt_count=0,next_attempt_at='2026-01-01',completed_at=NULL;");
  for(let i=0;i<10;i++) {
    const [c]=await claim(); assert.ok(c);
    await run(failedQuery({jobId:'j',leaseToken:c.leaseToken,errorCode:'test_transport',retryAt:i<9?now:null,now}));
    if(i===3) {
      const [w]=await claim();
      await run(waitingQuery({jobId:'j',leaseToken:w.leaseToken,nextAttemptAt:now,acknowledgement:{status:'validated'},now}));
      assert.equal((await job()).attempt_count,4,'normal wait must retain earlier failures');
    }
  }
  assert.deepEqual(await job(),{status:'dead',attempt_count:10});
  assert.equal((await claim()).length,0);
  console.log('PASS PostgreSQL: 25 waits, stale/duplicate receipts, activation, prior failure retention, terminal failure budget. Scope: migration0034 with minimal referenced tables; no external BFF.');
} finally {
  await pool?.end();
  if(started) docker('stop',container);
}
