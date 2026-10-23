export function assertRawMaterialCostDraftScope({inboundId, drafts = [], priorDrafts = []}) {
  const reject = () => { throw Object.assign(new Error('成本草稿来源重复、归属不符或已进入后续阶段，请核对消耗记录后再确认成本。'), {statusCode:422,code:'RAW_MATERIAL_COST_DRAFT_SOURCE_INVALID'}); };
  const ids = new Set();
  const consumptions = new Set();
  if (!inboundId || !drafts.length) reject();
  for (const draft of drafts) {
    if (!draft.costAllocationDraftId || ids.has(draft.costAllocationDraftId) || !draft.consumptionRecordId || consumptions.has(draft.consumptionRecordId)
      || draft.inboundId !== inboundId || !draft.issueRecordId || !draft.rollId || !draft.productionTaskId || !draft.orderLineId
      || draft.costConfirmationId || draft.lossCalibrationId || draft.marginSnapshotId || draft.marginReportId) reject();
    ids.add(draft.costAllocationDraftId); consumptions.add(draft.consumptionRecordId);
  }
  for (const prior of priorDrafts) {
    if (ids.has(prior.costAllocationDraftId)) {
      if (prior.costConfirmationId || prior.lossCalibrationId || prior.marginSnapshotId || prior.marginReportId) reject();
      continue;
    }
    if (consumptions.has(prior.consumptionRecordId)) reject();
  }
}
