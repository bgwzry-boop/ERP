import {sumRawMaterialCostAmounts} from './rawMaterialCostAmounts.js';

export function assertRawMaterialConfirmationSources({inboundId, confirmations = [], drafts = []}) {
  const reject = () => { throw Object.assign(new Error('成本确认与草稿来源或金额不一致，请核对原记录后再校准损耗。'), {statusCode:422,code:'RAW_MATERIAL_COST_CONFIRMATION_SOURCE_INVALID'}); };
  const declared = new Set(confirmations.flatMap(row => row.costAllocationDraftIds || []));
  const byId = new Map();
  for (const draft of drafts) {
    if (!declared.has(draft.costAllocationDraftId)) continue;
    if (byId.has(draft.costAllocationDraftId)) reject();
    byId.set(draft.costAllocationDraftId, draft);
  }
  const confirmationIds = new Set();
  const usedDrafts = new Set();
  const usedConsumptions = new Set();
  const sameSet = (actual, expected, allowRepeatedIssue = false) => {
    if (!Array.isArray(actual) || actual.some(id=>!id) || (!allowRepeatedIssue && new Set(actual).size !== actual.length)) return false;
    const wanted = new Set(expected);
    return new Set(actual).size === wanted.size && actual.every(id=>wanted.has(id));
  };
  if (!inboundId || !confirmations.length) reject();
  for (const confirmation of confirmations) {
    const ids = confirmation.costAllocationDraftIds;
    if (!confirmation.costConfirmationId || confirmationIds.has(confirmation.costConfirmationId) || confirmation.inboundId !== inboundId || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) reject();
    confirmationIds.add(confirmation.costConfirmationId);
    const sources = ids.map(id => {
      const draft = byId.get(id);
      if (!draft || usedDrafts.has(id) || draft.inboundId !== inboundId || draft.costConfirmationId !== confirmation.costConfirmationId || !draft.consumptionRecordId || !draft.issueRecordId || !draft.orderLineId || !draft.productionTaskId || usedConsumptions.has(draft.consumptionRecordId)) reject();
      usedDrafts.add(id); usedConsumptions.add(draft.consumptionRecordId);
      return draft;
    });
    for (const [list, field] of [['consumptionRecordIds','consumptionRecordId'],['issueRecordIds','issueRecordId'],['orderLineIds','orderLineId'],['productionTaskIds','productionTaskId']]) {
      if (!sameSet(confirmation[list], sources.map(draft=>draft[field]), list === "issueRecordIds")) reject();
    }
    if (Number(confirmation.confirmedCount) !== sources.length) reject();
    if (sumRawMaterialCostAmounts(sources,'confirmedCostAmount') !== sumRawMaterialCostAmounts([confirmation],'confirmedCostAmount')) reject();
  }
}
