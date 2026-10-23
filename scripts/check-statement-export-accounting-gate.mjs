import assert from 'node:assert/strict';
import { createStatementCommunicationCommandService } from '../server/services/statementCommunicationCommandService.mjs';
import { createStatementPreviewProjectionService } from '../server/services/statementPreviewProjectionService.mjs';
const projection = createStatementPreviewProjectionService();
let stored = 0, written = 0;
const service = createStatementCommunicationCommandService({
  findStatement: (workspace, id) => workspace.statements.find(row => row.id === id),
  buildStatementPreviewLines: projection.buildPreviewLines,
  getStatementExcelTemplateId: () => 'CUSTOMER',
  buildOperationLog: (_workspace, input) => ({ ...input, id: input.id || 'LOG-1' }),
  nextPlainId: () => 'DL-1',
  buildStatementExportFile: (_workspace, statement, options) => ({
    ...options, statementId: statement.id,
    metadata: { statementPreviewSnapshot: { lines: options.lines, summary: options.summary } },
  }),
  storeStatementExportFile: async (_workspace, file) => { stored++; return file; },
});
function fixture() {
  return {
    statements: [{ id: 'S1', revision: 1, lineIds: ['O1'], receivable: 99, received: 0 }],
    orderLines: [{ id: 'O1', qty: 1200, amount: 600 }],
    statementLines: [{ statementLineId: 'SL1', statementId: 'S1', orderLineId: 'O1',
      deliveredQty: 205, chargeableQty: 200, freeQty: 5, amount: 100, adjustmentAmount: -1, finalAmount: 99 }],
    operationLogs: [], statementExportFiles: [],
    statementExportRepository: {
      findExportFileByToken: async () => null,
      createExportFile: async ({exportFile}) => { written++; return { exportFile, operationLogId: 'LOG-1' }; },
    },
  };
}
const run = workspace => service.previewStatement({workspace, statementId: 'S1', operatorId: 'U1', body: {idempotencyKey: 'preview-1'}});
const valid = await run(fixture());
assert.equal(valid.response.lines[0].finalAmount, 99);
assert.equal(valid.response.lines[0].deliveredQty, 205);
assert.equal(stored, 1);
assert.equal(written, 1);
const cases = [
  ['missing persisted lines', w => { w.statementLines = []; }],
  ['other statement only', w => { w.statementLines[0].statementId = 'S2'; }],
  ['duplicate line', w => { w.statementLines.push({...w.statementLines[0]}); }],
  ...['deliveredQty', 'chargeableQty', 'freeQty', 'amount', 'adjustmentAmount', 'finalAmount'].flatMap(key =>
    [null, undefined, '', '   ', true, {}, 'not-a-number'].map(value => [key, w => { w.statementLines[0][key] = value; }])),
  ['fractional quantity', w => { w.statementLines[0].deliveredQty = 205.5; }],
  ['negative quantity', w => { w.statementLines[0].freeQty = -5; }],
  ['quantity mismatch', w => { w.statementLines[0].freeQty = 6; }],
  ['amount mismatch', w => { w.statementLines[0].finalAmount = 98; }],
  ['sub-cent amount', w => { w.statementLines[0].amount = 100.001; }],
  ['header mismatch', w => { w.statements[0].receivable = 100; }],
  ['missing header amount', w => { w.statements[0].receivable = null; }],
];
for (const [label, mutate] of cases) {
  const workspace = fixture(); mutate(workspace);
  const before = JSON.stringify(workspace);
  const response = await run(workspace);
  assert.equal(response.code, 'STATEMENT_EXPORT_ACCOUNTING_INCOMPLETE', label);
  assert.equal(stored, 1, `${label}: no object storage write`);
  assert.equal(written, 1, `${label}: no repository write`);
  assert.equal(JSON.stringify(workspace), before, `${label}: preserve accounting`);
}
// Currency decimal representation and zero-value finalized gifts remain valid.
const decimal = fixture();
Object.assign(decimal.statementLines[0], { amount: 0.29, adjustmentAmount: 0, finalAmount: 0.29 });
decimal.statements[0].receivable = 0.29;
assert.ok((await run(decimal)).response);
const gift = fixture();
Object.assign(gift.statementLines[0], { chargeableQty: 0, freeQty: 205, amount: 0, adjustmentAmount: 0, finalAmount: 0 });
gift.statements[0].receivable = 0;
assert.ok((await run(gift)).response);
// Historical replay describes the already stored file even if today's accounting is unavailable.
const replay = fixture(); replay.statementLines = []; replay.statements[0].receivable = null;
replay.statementExportRepository.findExportFileByToken = async () => ({ downloadToken: 'OLD', previewType: 'customer_send', metadata: {statementPreviewSnapshot: {lines: valid.response.lines, summary: valid.response.summary}} });
assert.deepEqual((await run(replay)).response.lines, valid.response.lines);
console.log(`Statement export accounting gate passed: ${cases.length} invalid cases, batch/gift/decimal and replay`);
