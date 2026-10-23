import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyRawMaterialOcrReview } from '../server/rawMaterialInboundOcrSupport.mjs';

// Execute the component's actual callback with controlled props/state.
const source = readFileSync(new URL('../src/features/raw-materials/RawMaterialMobileOcrReview.jsx', import.meta.url), 'utf8');
const callback = source.slice(source.indexOf('  function syncDocumentSummary('), source.indexOf('  function excludePendingRoll('));
const values = { productName: '无纺布卷料', materialType: '无纺布', factoryColor: '本白', supplierColor: '白色', spec: '90g*1.6米', rollCount: 1, totalWeightKg: 10, rollWeightsKg: [10], unit: 'kg', unitPrice: 10, amount: 100 };
const lines = [{ lineId: 'L1', values }, { lineId: 'L2', values }];
for (const amount of [200, 100, 0]) {
  const documentDraft = { ...values, supplierName: '合成厂家', rollCount: 2, totalWeightKg: 20, amount };
  const changes = [];
  const context = { reviewRolls: [{ reviewId: 'L1:0', lineId: 'L1' }, { reviewId: 'L2:0', lineId: 'L2' }], lines, lineDrafts: { L1: values, L2: values }, documentDraft, onDocumentFieldChange(key, value) { changes.push(key); documentDraft[key] = value; } };
  vm.runInNewContext(`${callback}\nsyncDocumentSummary([{reviewId:'L2:0'}]);`, context);
  assert.equal(documentDraft.rollCount, 1);
  assert.equal(documentDraft.amount, amount);
  assert.equal(documentDraft.totalWeightKg, 20);
  assert.deepEqual(changes, ['rollCount']);
  vm.runInNewContext('syncDocumentSummary([]);', context);
  assert.equal(documentDraft.rollCount, 2);
  assert.equal(documentDraft.amount, amount);
  assert.equal(documentDraft.totalWeightKg, 20);
}
const before = { id: 'AUDIT', status: '已识别待复核', ocrProvider: 'tencent_cloud_table_v3', ocrDeclaredAmount: 200, ocrDeclaredWeightKg: 20, ocrLines: lines };
const lineReviews = [{ lineId: 'L1', values }, { lineId: 'L2', values, excludedRollIndices: [0], exclusionReason: '原票与实物无此卷' }];
const reviewFields = { ...values, supplierName: '合成厂家', rollCount: 1, totalWeightKg: 20, amount: 200 };
const review = (fields) => applyRawMaterialOcrReview({ before, reviewFields: fields, lineReviews, operatorId: 'audit', operatorName: '审计', now: '2026-09-11T10:00:00.000Z' });
assert.throws(() => review(reviewFields), { code: 'RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_MISMATCH' });
assert.throws(() => review({ ...reviewFields, totalWeightKg: 10 }), { code: 'RAW_MATERIAL_OCR_REVIEW_LINE_AMOUNT_MISMATCH' });
// An operator may still explicitly correct erroneous OCR header values.
const corrected = review({ ...reviewFields, totalWeightKg: 10, amount: 100 });
assert.equal(corrected.rolls.length, 1);
assert.equal(corrected.ocrDeclaredAmount, 200);
assert.equal(corrected.ocrLines[1].excludedByUserId, 'audit');
console.log('Exclusion/undo preserve document weight and money; actual server review rejects differences and retains explicit corrections and exclusion evidence.');
