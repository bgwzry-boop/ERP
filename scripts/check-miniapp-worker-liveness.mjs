import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

for (const name of ['startMiniappArtworkTransferWorker.mjs', 'startErpPriceReleaseDeliveryWorker.mjs']) {
  const source = readFileSync(new URL(`../server/miniapp/${name}`, import.meta.url), 'utf8');
  const loop = source.slice(source.indexOf('let running = false;'));
  const code = `const pollMs = 25;
    const safeErrorCode = () => 'simulated_database_failure';
    let calls = 0;
    const worker = { async processBatch() {
      calls++; console.log('POLL:' + calls);
      if (calls === 1) throw new Error('simulated_database_failure');
      return { claimed: 0, dead: 0 };
    }};
    const closeSharedPostgresPools = async () => console.log('CLOSED');
    const pool = { end: closeSharedPostgresPools };
    ${loop}`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '', stopped = false;
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${name}: timeout`)); }, 3000);
    child.stdout.on('data', data => {
      output += data;
      if (!stopped && output.includes('POLL:3')) { stopped = true; child.kill('SIGTERM'); }
    });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', reject);
    child.on('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, output, errors }); });
  });
  assert.match(result.output, /POLL:3/, `${name}: must keep polling after failure and empty batches`);
  assert.match(result.errors, /simulated_database_failure/);
  assert.match(result.output, /CLOSED/);
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
}
console.log('Actual worker loop sections survived an initial failure and empty batches, then closed cleanly on SIGTERM; adapters/database were stubbed.');
