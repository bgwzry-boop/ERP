const inboundFields = ["id", "revision", "status", "documentDirection", "supplierName", "receivedAt", "materialType", "materialCategory", "productName", "factoryColor", "supplierColor", "spec", "specDisplay", "widthCm", "gramWeightGsm", "lengthM", "unit", "location"];
const rollFields = ["id", "supplierRollNo", "factoryColor", "supplierColor", "spec", "specDisplay", "widthCm", "gramWeightGsm", "lengthM", "materialCategory", "materialType", "productName", "unit", "weightKg", "inventoryStatus", "labelStatus", "location", "machineId", "productionTaskId", "sourceRollId", "parentRollId", "remainingMachineSideWeightKg", "consumptionRecordId", "lastConsumedWeightKg", "lastConsumedQuantity", "leftoverWeightKg", "leftoverReviewedWeightKg", "leftoverReviewRecordId", "leftoverQuantity", "leftoverReviewedQuantity"];
const displayFields = ["source", "color", "width", "widthCm", "materialCategory", "materialUsage", "gramWeight", "spec", "weight", "unitLabel", "status", "supplier", "date", "location"];
const issueFields = ["issueRecordId", "rollId", "sourceRollId", "machineId", "productionTaskId", "issuedWeightKg", "issuedQuantity", "inventoryStatus", "consumptionStatus", "productionTaskMatchStatus", "productionTaskOrderLineId"];

export function canReadRawMaterialInboundEvidence(permissionContext) {
  return (permissionContext?.actionPermissions ?? []).includes("raw_material.inbound.read");
}
export function projectRawMaterialStockInbound(inbound = {}, rolls = inbound.rolls ?? []) {
  const rollIds = new Set(rolls.map((roll) => roll.id));
  return {
    ...pick(inbound, inboundFields),
    projectionScope: "stock_only",
    rolls: rolls.map((roll) => pick(roll, rollFields)),
    rawMaterialIssueRecords: (inbound.rawMaterialIssueRecords ?? [])
      .filter((record) => rollIds.has(record.rollId))
      .map((record) => pick(record, issueFields)),
  };
}
export function projectRawMaterialRollReadAccess(result, permissionContext) {
  if (canReadRawMaterialInboundEvidence(permissionContext)) return result;
  return {
    ...pick(result, ["page", "pageSize", "total", "summary", "widthOptions", "colorOptions", "locationOptions", "distribution", "aggregateScope"]),
    projectionScope: "stock_only",
    items: (result.items ?? []).map((roll) => ({
      ...pick(roll, [...rollFields, ...displayFields]),
      sourceInbound: projectRawMaterialStockInbound(roll.sourceInbound, [roll]),
    })),
  };
}
function pick(value = {}, fields) {
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}
