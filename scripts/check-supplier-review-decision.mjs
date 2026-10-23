import assert from 'node:assert/strict';
import { applyReviewConfirmation, applyStatementConfirmation } from '../server/rawMaterialSupplierStatementReviewRepository.mjs';
const draft = { reviewId: 'AUDIT', reviewStatus: 'draft', status: '可确认', rows: [], adjustments: [], revision: 1 };
for (const decision of [undefined, null, '', '不一致', '基本一致', '一致但有差异', true, {}]) {
  const workspace = { rawMaterialSupplierStatementReviews: [structuredClone(draft)] };
  const before = structuredClone(workspace);
  assert.throws(() => applyReviewConfirmation({ workspace, reviewId: 'AUDIT', decision }), { code: 'RAW_MATERIAL_SUPPLIER_REVIEW_DECISION_INVALID', statusCode: 422 });
  assert.deepEqual(workspace, before);
}
for (const decision of ['一致', '有差异']) {
  const workspace = { rawMaterialSupplierStatementReviews: [structuredClone(draft)] };
  const result = applyReviewConfirmation({ workspace, reviewId: 'AUDIT', decision });
  workspace.rawMaterialSupplierStatementReviews = result.reviews;
  if (decision === '一致') assert.equal(applyStatementConfirmation({ workspace, reviewId: 'AUDIT' }).review.reviewStatus, 'statement_confirmed');
  else assert.throws(() => applyStatementConfirmation({ workspace, reviewId: 'AUDIT' }), { statusCode: 409 });
}
const workspace = { rawMaterialSupplierStatementReviews: [{ ...draft, reviewStatus: 'reviewed', status: '已人工复核/不一致' }] };
assert.throws(() => applyStatementConfirmation({ workspace, reviewId: 'AUDIT' }), { statusCode: 409 });
console.log('Exact supplier review decisions and confirmation state guards passed; invalid decisions leave source unchanged.');
