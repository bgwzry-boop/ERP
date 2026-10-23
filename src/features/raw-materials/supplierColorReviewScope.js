import {normalizeRawMaterialSupplierColor,normalizeRawMaterialSupplierSourceId} from '../../../shared/rawMaterialFactoryColors.js';
export function canApplySupplierColorToReview(mapping,context,inbound) {
  return Boolean(mapping?.enabled === true && mapping.factoryColor?.trim()
    && context?.inboundId && context.inboundId === inbound?.id
    && normalizeRawMaterialSupplierSourceId(context.supplierName)
    && normalizeRawMaterialSupplierSourceId(context.supplierName) === normalizeRawMaterialSupplierSourceId(inbound.supplierName)
    && normalizeRawMaterialSupplierSourceId(mapping.supplierSourceId) === normalizeRawMaterialSupplierSourceId(context.supplierName)
    && normalizeRawMaterialSupplierColor(mapping.supplierColor)
    && normalizeRawMaterialSupplierColor(mapping.supplierColor) === normalizeRawMaterialSupplierColor(context.supplierColor));
}
