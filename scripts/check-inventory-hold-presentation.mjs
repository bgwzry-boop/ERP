import assert from 'node:assert/strict';
import {resolveTemporaryHoldCandidate, toShanghaiExpiryIso, formatInventoryLedgerTime} from '../src/domain/inventoryHoldPresentation.js';
const candidates=[{id:'FIRST'},{id:'SECOND'}];
const hold=metadata=>({intent:{candidate:{parsedCandidates:candidates}},metadata});
for(const candidateIndex of [undefined,null,false,'',-1,0.5,'x',2])assert.equal(resolveTemporaryHoldCandidate(hold({candidateIndex})),null);
assert.equal(resolveTemporaryHoldCandidate(hold({candidateIndex:1})),candidates[1]);
assert.equal(resolveTemporaryHoldCandidate(hold({candidateIndex:'0'})),candidates[0]);
assert.equal(resolveTemporaryHoldCandidate({intent:{candidate:{parsedCandidates:[candidates[0]]}}}),candidates[0]);
assert.equal(resolveTemporaryHoldCandidate({metadata:{candidate:candidates[1]}}),candidates[1]);
assert.equal(toShanghaiExpiryIso('2026-02-30T19:30'),'');
assert.equal(toShanghaiExpiryIso('2026-10-23T19:30'),'2026-10-23T11:30:00.000Z');
for(const timeZone of ['UTC','America/New_York','Asia/Shanghai']){process.env.TZ=timeZone;assert.match(formatInventoryLedgerTime('2026-10-23T11:30:00.000Z'),/10\/23.*19:30/);assert.match(formatInventoryLedgerTime('2026-10-23T19:30'),/10\/23.*19:30/);assert.equal(formatInventoryLedgerTime('2026-02-30T19:30'),'时间待确认');}
console.log('PASS inventory presentation: ambiguous hold candidate blocked, exact explicit identity, invalid calendar dates rejected and event/expiry time fixed to China across runtime TZs.');
