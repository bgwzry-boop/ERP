export const invalidPackageStatuses = ["已作废", "已失效", "voided", "invalidated"];
export const packageIdOf = row => String(row?.packageId ?? row?.id ?? "").trim();
export const fulfillmentIdOf = row => String(row?.fulfillmentId ?? row?.id ?? "").trim();
export const isActivePackage = row => Boolean(packageIdOf(row)) && !invalidPackageStatuses.includes(row?.status);
export function packageContents(row = {}) {
  const items = row.contents ?? row.contentsJson ?? row.contents_json;
  if (Array.isArray(items) && items.length) return items;
  return [{ orderLineId: row.orderLineId ?? row.order_line_id, fulfillmentId: row.fulfillmentId ?? row.fulfillment_id, packedQty: row.packedQty ?? row.packed_qty ?? row.qty }];
}
export function packageContainsFulfillment(row, fulfillmentId) {
  return packageContents(row).some(item => item.fulfillmentId === fulfillmentId);
}
export function packageAnchorId(fulfillment = {}) {
  return String(fulfillment.packingGroupAnchorId ?? fulfillment.packing_group_anchor_id ?? "").trim();
}
export function packageLabelRows(rows = []) {
  return rows.filter(isActivePackage).sort((a, b) => Number(a.packageSeq) - Number(b.packageSeq)).map((row, index, all) => ({
    packageId: packageIdOf(row), sequence: `${index + 1}/${all.length}`, packedQty: Number(row.packedQty),
    contents: packageContents(row).map(item => ({ orderLineId: item.orderLineId, fulfillmentId: item.fulfillmentId, packedQty: Number(item.packedQty),
      productName: item.productName ?? "", size: item.size ?? "", bagColor: item.bagColor ?? "", handleColor: item.handleColor ?? "", handleType: item.handleType ?? "", style: item.style ?? "" })),
  }));
}
