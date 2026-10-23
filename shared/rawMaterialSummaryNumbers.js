import { readFiniteRawMaterialNumber } from "./rawMaterialNumbers.js";
// Summary values are projections, not missing-value defaults for accounting.
export const rawMaterialSummaryNumberFields = Object.freeze([
  'costAllocationDraftAmount', 'costAllocationConfirmedAmount',
  'lossCalibrationRatePercent', 'lossCalibrationActualOutputQuantity',
  'lossCalibrationExpectedOutputQuantity', 'lossCalibrationAmount',
  'marginSnapshotTotalSalesAmount', 'marginSnapshotMaterialCostAmount',
  'marginSnapshotGrossProfitAmount', 'marginSnapshotGrossMarginRatePercent',
  'marginReportTotalSalesAmount', 'marginReportMaterialCostAmount',
  'marginReportGrossProfitAmount', 'marginReportGrossMarginRatePercent',
]);

export function normalizeRawMaterialSummaryNumbers(item) {
  for (const field of rawMaterialSummaryNumberFields) {
    item[field] = readFiniteRawMaterialNumber(item[field]);
  }
  return item;
}
