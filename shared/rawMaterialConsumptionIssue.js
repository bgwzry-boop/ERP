// A roll may be issued several times. Cost must follow the recorded issue identity.
export function resolveRawMaterialConsumptionIssue(record, issueRecords = [], inboundId, consumptionRecords = []) {
  if (!record?.issueRecordId || !record.consumptionRecordId || !record.rollId) return null;
  if (record.inboundId && record.inboundId !== inboundId) return null;
  if (consumptionRecords.filter(row=>row.consumptionRecordId === record.consumptionRecordId).length > 1) return null;
  const matches = issueRecords.filter(row=>row.issueRecordId === record.issueRecordId);
  if (matches.length !== 1) return null;
  const issue = matches[0];
  if (issue.rollId !== record.rollId || (issue.inboundId && issue.inboundId !== inboundId)) return null;
  if (record.productionTaskId && record.productionTaskId !== issue.productionTaskId) return null;
  if (record.productionTaskOrderLineId && record.productionTaskOrderLineId !== issue.productionTaskOrderLineId) return null;
  return issue;
}
