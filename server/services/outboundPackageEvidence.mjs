import { fulfillmentIdOf, isActivePackage, packageAnchorId, packageContents } from "../../shared/packageContents.js";

export const outboundPackageLabels = ["package_label", "express_ltl_label"];
export const deliveryMethods = ["送货", "delivery"];

export function outboundPackageEvidence(workspace, fulfillment, actualQty) {
  const fulfillmentId = fulfillmentIdOf(fulfillment);
  const anchorId = packageAnchorId(fulfillment);
  if (!anchorId && !deliveryMethods.includes(fulfillment.method)) return { ready: true };

  const targetId = anchorId || fulfillmentId;
  const packages = (workspace.packages ?? []).filter(row =>
    isActivePackage(row) && (row.fulfillmentId ?? row.fulfillment_id) === targetId);
  const lineId = fulfillment.orderLineId ?? fulfillment.lineId ?? fulfillment.order_line_id;
  const contents = packages.flatMap(packageContents).filter(row => row.fulfillmentId === fulfillmentId);
  if (!contents.length || !contents.every(row => Number.isSafeInteger(Number(row.packedQty)) && Number(row.packedQty) > 0)) {
    return { ready: false, code: "WAREHOUSE_REAL_PACKAGES_REQUIRED", reason: "本批送货还没有有效的实际包裹，请先登记逐包数量。" };
  }
  if (contents.some(row => row.orderLineId !== lineId)) {
    return { ready: false, code: "WAREHOUSE_PACKAGE_ORDER_MISMATCH", reason: "这批包裹的货品明细与出库订单不符，请重新核对。" };
  }
  const packedQty = contents.reduce((total, row) => total + Number(row.packedQty), 0);
  if (packedQty !== Number(actualQty)) {
    return { ready: false, code: "WAREHOUSE_PACKAGE_QUANTITY_MISMATCH", reason: `有效包裹共 ${packedQty} 个，与本批出库的 ${actualQty} 个不一致，请先核对。` };
  }
  const printed = new Set((workspace.printRecords ?? []).filter(row =>
    (row.targetType ?? row.target_type) === "fulfillment" &&
    (row.targetId ?? row.target_id) === targetId &&
    outboundPackageLabels.includes(row.documentType ?? row.document_type) &&
    ["printed", "reprinted"].includes(row.status)
  ).map(row => row.printRecordId ?? row.id));
  if (packages.some(row => row.status !== "已打印标签" ||
    !printed.has(row.labelPrintRecordId ?? row.label_print_record_id))) {
    return { ready: false, code: "PACKING_GROUP_WAREHOUSE_LABEL_REQUIRED", reason: "请先打印本批全部有效挂牌并核对贴牌，再登记实物出库。" };
  }
  return { ready: true };
}
