// The same eligible set drives the command, local preview, button and review dialog.
export function selectUncalibratedRawMaterialConfirmations(confirmations = [], calibrations = []) {
  const completed = new Set((Array.isArray(calibrations) ? calibrations : [])
    .flatMap(record => [record?.costConfirmationId, ...(Array.isArray(record?.costConfirmationIds) ? record.costConfirmationIds : [])])
    .filter(Boolean));
  return (Array.isArray(confirmations) ? confirmations : []).filter(record => record?.costConfirmationId
    && !completed.has(record.costConfirmationId)
    && record.lossCalibrationStatus !== '已校准/待毛利确认');
}

export function matchesRawMaterialLossCalibrationScope(record, confirmations) {
  const expected = new Set(confirmations.map(item => item.costConfirmationId));
  const actual = new Set([record?.costConfirmationId, ...(Array.isArray(record?.costConfirmationIds) ? record.costConfirmationIds : [])].filter(Boolean));
  return expected.size > 0 && actual.size === expected.size && [...expected].every(id => actual.has(id));
}
