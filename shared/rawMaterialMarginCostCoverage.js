import { readFiniteRawMaterialNumber } from "./rawMaterialNumbers.js";
const cents = value => Math.round(Number(value) * 100);
export function rawMaterialDraftCostAmount(record = {}) {
  const field = record.lossCalibrationId ? "calibratedCostAmount" : record.costConfirmationId ? "confirmedCostAmount" : "allocatedCostAmount";
  return readFiniteRawMaterialNumber(record[field]);
}

export function assertRawMaterialMarginCostCoverage({calibrations = [], drafts = [], orderLineIds = []}) {
  const reject = () => { throw Object.assign(new Error('成本来源不完整或金额不守恒，请核对损耗校准与逐单成本明细；不能按订单数量平均补算。'), {statusCode: 422, code: 'RAW_MATERIAL_MARGIN_COST_TRACE_INVALID'}); };
  const byId = new Map();
  for (const draft of drafts) {
    const amount = rawMaterialDraftCostAmount(draft);
    if (!draft.costAllocationDraftId || byId.has(draft.costAllocationDraftId) || !draft.orderLineId || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents(amount))) reject();
    byId.set(draft.costAllocationDraftId, draft);
  }
  const covered = new Set();
  for (const calibration of calibrations) {
    const ids = calibration.costAllocationDraftIds || [];
    if (!ids.length || new Set(ids).size !== ids.length) reject();
    let amount = 0;
    const lines = new Set();
    for (const id of ids) {
      const draft = byId.get(id);
      if (!draft || covered.has(id)) reject();
      covered.add(id); lines.add(draft.orderLineId);
      amount += cents(rawMaterialDraftCostAmount(draft));
    }
    const expected = readFiniteRawMaterialNumber(calibration.confirmedCostAmount);
    if (!Number.isFinite(expected) || expected < 0 || !Number.isSafeInteger(cents(expected)) || amount !== cents(expected)) reject();
    if ((calibration.orderLineIds || []).some(id => !lines.has(id))) reject();
  }
  if (covered.size !== drafts.length || orderLineIds.some(id => !drafts.some(draft => draft.orderLineId === id))) reject();
}
