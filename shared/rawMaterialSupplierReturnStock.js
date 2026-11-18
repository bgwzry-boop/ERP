export const supplierReturnStagePermission = "raw_material.leftover.return";
export const supplierReturnShipPermission = "raw_material.leftover.review";
export const supplierReturnStaged = "供应商退货暂存";
export const supplierReturnShipped = "已退厂";

export function getSupplierReturnAccess(permissionContext) {
  const permissions = permissionContext?.actionPermissions ?? [];
  const canReadStock = permissions.includes("raw_material.stock.read");
  return {
    canStage: canReadStock && permissions.includes(supplierReturnStagePermission),
    canShip: canReadStock && permissions.includes(supplierReturnShipPermission),
  };
}
