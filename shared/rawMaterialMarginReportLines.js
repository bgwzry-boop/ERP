import { readFiniteRawMaterialNumber } from "./rawMaterialNumbers.js";
export function buildRawMaterialMarginReportLines(snapshots = []) {
  const rows = new Map();
  const snapshotIds = new Set();
  const costIds = new Set();
  const provenance = new Map(['consumptionRecordIds', 'lossCalibrationIds', 'costConfirmationIds'].map(key => [key, new Set()]));
  const reject = (code = 'RAW_MATERIAL_MARGIN_REPORT_SOURCE_INVALID') => {
    throw Object.assign(new Error(code === 'RAW_MATERIAL_MARGIN_REVENUE_CONFLICT'
      ? '同一订单行的收入、数量或客户信息不一致，请核对来源快照后再复核毛利。'
      : '毛利快照来源缺失或成本重复，请核对原始快照；不能重复累计收入或成本。'), {statusCode: 422, code});
  };
  const money = value => {
    const number = readFiniteRawMaterialNumber(value);
    if (number === null) reject();
    const result = Math.round(number * 100);
    if (!Number.isSafeInteger(result) || result < 0) reject();
    return result;
  };
  for (const snapshot of snapshots) {
    if (!snapshot.marginSnapshotId || snapshotIds.has(snapshot.marginSnapshotId) || !snapshot.lineItems?.length) reject();
    snapshotIds.add(snapshot.marginSnapshotId);
    for (const [key, seen] of provenance) {
      for (const id of snapshot[key] || []) {
        if (!id || seen.has(id)) reject();
        seen.add(id);
      }
    }
    const snapshotCosts = new Set();
    const linesInSnapshot = new Set();
    for (const line of snapshot.lineItems) {
      const id = line.orderLineId;
      if (!id || linesInSnapshot.has(id) || !line.costAllocationDraftIds?.length) reject();
      linesInSnapshot.add(id);
      for (const costId of line.costAllocationDraftIds) {
        if (!costId || costIds.has(costId)) reject();
        costIds.add(costId); snapshotCosts.add(costId);
      }
      const sales = money(line.salesAmount);
      const cost = money(line.materialCostAmount);
      if (!sales || !Number.isFinite(Number(line.quantity ?? 0)) || Number(line.quantity ?? 0) < 0) reject();
      let row = rows.get(id);
      if (row) {
        if (money(row.salesAmount) !== sales || Number(row.quantity ?? 0) !== Number(line.quantity ?? 0) || String(row.customerId || '') !== String(line.customerId || '')) reject('RAW_MATERIAL_MARGIN_REVENUE_CONFLICT');
        const nextCost = money(row.materialCostAmount) + cost;
        if (!Number.isSafeInteger(nextCost)) reject();
        row.materialCostAmount = nextCost / 100;
        row.marginSnapshotIds.push(snapshot.marginSnapshotId);
        row.costAllocationDraftIds.push(...line.costAllocationDraftIds);
        row.productionTaskIds = [...new Set([...row.productionTaskIds, ...(line.productionTaskIds || [])])];
      } else {
        row = {...line, salesAmount: sales / 100, materialCostAmount: cost / 100, marginSnapshotIds: [snapshot.marginSnapshotId], costAllocationDraftIds: [...line.costAllocationDraftIds], productionTaskIds: [...(line.productionTaskIds || [])]};
        rows.set(id, row);
      }
      row.marginSnapshotId = row.marginSnapshotIds.length === 1 ? snapshot.marginSnapshotId : '';
      row.grossProfitAmount = (sales - money(row.materialCostAmount)) / 100;
      row.grossMarginRatePercent = Math.round(row.grossProfitAmount * 100 / (sales / 100) * 100) / 100;
      row.marginStatus = '已财务复核/报表可用';
    }
    const declaredCosts = new Set(snapshot.costAllocationDraftIds || []);
    const declaredLines = new Set(snapshot.orderLineIds || []);
    if (declaredCosts.size !== snapshotCosts.size || [...snapshotCosts].some(id => !declaredCosts.has(id)) || declaredLines.size !== linesInSnapshot.size || [...linesInSnapshot].some(id => !declaredLines.has(id))) reject();
  }
  let totalSales = 0;
  let totalCost = 0;
  for (const row of rows.values()) {
    totalSales += money(row.salesAmount);
    totalCost += money(row.materialCostAmount);
    if (!Number.isSafeInteger(totalSales) || !Number.isSafeInteger(totalCost)) reject();
  }
  return [...rows.values()];
}
