import { createHash, randomUUID } from "node:crypto";
import { isStockOrderType } from "../../shared/orderRouting.js";
import { fulfillmentIdOf, packageIdOf, packageContents, isActivePackage, packageAnchorId } from "../../shared/packageContents.js";

const text = value => String(value ?? "").trim();
const lineId = row => text(row?.orderLineId ?? row?.lineId ?? row?.id);
const orderId = row => text(row?.orderId ?? row?.orderNo ?? row?.order_id);
const method = row => ({ delivery: "送货", express_ltl: "快递快运", pickup: "自提" })[row?.method] ?? row?.method;
const fail = (code, message, statusCode = 409) => { throw Object.assign(new Error(message), { code, statusCode }); };
const revision = row => Number(row?.revision ?? 1);
export function hasPackageDownstream(row) {
  return Boolean(row?.physicalOutboundAt || row?.physical_outbound_at || row?.loadedAt || row?.loaded_at || row?.finalDeliveryAt || row?.deliveredAt
    || ["已交付", "已完成", "已出库", "已拉走", "已取消", "已作废", "配送中"].includes(row?.status));
}
function goods(line) { return { productName: text(line.product ?? line.productName), size: text(line.size), bagColor: text(line.bagColor ?? line.color),
  handleColor: text(line.handleColor), handleType: text(line.handleType ?? line.handle), style: text(line.style) }; }
function lineFor(workspace, fulfillment) { return workspace.orderLines.find(row => lineId(row) === lineId(fulfillment)); }
function taskFor(workspace, fulfillment) { return (workspace.packingTasks ?? []).find(row => lineId(row) === lineId(fulfillment)); }
function taskReady(workspace, fulfillment) {
  const line = lineFor(workspace, fulfillment), task = taskFor(workspace, fulfillment);
  return Boolean(line && !["已作废","已取消","已交付","已完成","closed","voided","canceled"].includes(line.status??line.lineStatus) && (task && !["已取消", "已作废"].includes(task.status) || isStockOrderType(line.orderType) && !["待排产", "待生产", "待确认", "已作废"].includes(line.status ?? line.lineStatus)));
}
export function packageGroupSnapshot(workspace, members, packages) {
  return {
    fulfillments: members.map(row => ({ id: fulfillmentIdOf(row), revision: revision(row), orderLineId: lineId(row), actualQty: row.actualQty ?? null, status: row.status,
      physicalOutbound: Boolean(row.physicalOutboundAt), loaded: Boolean(row.loadedAt), delivered: Boolean(row.deliveredAt), finalDelivered: Boolean(row.finalDeliveryAt),
      packingGroupAnchorId: packageAnchorId(row), packingGroupRevision: Number(row.packingGroupRevision ?? 0) })).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    lines: members.map(row => lineFor(workspace, row)).map(row => ({ id: lineId(row), revision: revision(row), orderId: orderId(row), status: row.status ?? row.lineStatus, qty: Number(row.qty ?? row.originalQty) })).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    tasks: members.map(row => taskFor(workspace, row)).filter(Boolean).map(row => ({ id: text(row.packingTaskId ?? row.id), revision: revision(row), status: row.status, orderLineId: lineId(row) })).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    packages: packages.map(row => ({ id: packageIdOf(row), revision: revision(row), status: row.status, packedQty: Number(row.packedQty ?? row.qty),
      labelPrintRecordId: text(row.labelPrintRecordId), contents: packageContents(row) })).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };
}
export function getPackageGroupContext(workspace, { fulfillmentId, orderLineId } = {}) {
  const matches = (workspace.fulfillments ?? []).filter(row => fulfillmentId ? fulfillmentIdOf(row) === fulfillmentId : lineId(row) === orderLineId && !hasPackageDownstream(row));
  if (matches.length !== 1) fail("PACKING_FULFILLMENT_REVIEW_REQUIRED", "本明细缺少唯一可打包交付批次，请办公室核对。", 409);
  const selected = matches[0], anchorId = packageAnchorId(selected) || fulfillmentIdOf(selected);
  const anchor = workspace.fulfillments.find(row => fulfillmentIdOf(row) === anchorId);
  if (!anchor) fail("PACKING_GROUP_ANCHOR_MISSING", "包组主任务缺失，请办公室核对。");
  const anchorLine = lineFor(workspace, anchor), sourceOrderId = orderId(anchorLine);
  if (!sourceOrderId) fail("PACKING_ORDER_ID_REQUIRED", "缺少原始订单编号，不能推断混装范围。");
  if (!isStockOrderType(anchorLine.orderType)) fail("PACKING_CUSTOM_MIXED_FORBIDDEN", "定制单不混装，请按明细单独登记包裹。", 422);
  const existing = Boolean(packageAnchorId(anchor));
  const candidates = workspace.fulfillments.filter(row => {
    const line = lineFor(workspace, row);
    return line && isStockOrderType(line.orderType) && orderId(line) === sourceOrderId && row.customerId === anchor.customerId && method(row) === method(anchor)
      && (existing ? packageAnchorId(row) === anchorId : !packageAnchorId(row) && !hasPackageDownstream(row) && taskReady(workspace, row));
  });
  const allIds = new Set(candidates.map(fulfillmentIdOf));
  const packages = (workspace.packages ?? []).filter(row => isActivePackage(row) && packageContents(row).some(item => allIds.has(item.fulfillmentId)));
  const snapshot = packageGroupSnapshot(workspace, candidates, packages);
  return {
    anchorFulfillmentId: anchorId, orderId: sourceOrderId, customerName: workspace.customers?.find(row => row.id === anchor.customerId)?.name || anchor.customerId,
    method: method(anchor), existing, locked: candidates.some(hasPackageDownstream), packingRevision: Number(anchor.packingGroupRevision ?? 0),
    snapshotToken: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    lines: candidates.map(row => ({ fulfillmentId: fulfillmentIdOf(row), orderLineId: lineId(row), expectedQty: Number(row.expectedQty ?? row.qty),
      actualQty: row.actualQty ?? null, ...goods(lineFor(workspace, row)), packingTaskId: text(taskFor(workspace,row)?.packingTaskId ?? taskFor(workspace,row)?.id), status: row.status })),
    packages: packages.map(row => ({ ...row, packageId: packageIdOf(row), contents: packageContents(row) })),
    _members: candidates, _snapshot: snapshot,
  };
}
export function publicPackageGroupContext(context) { const { _members, _snapshot, ...safe } = context; return safe; }

export async function replacePackageGroup({ workspace, fulfillmentId, body, operatorId }) {
  const repository = workspace.productionPackingTransactionRepository;
  await repository.refreshPackageGroupWorkspace?.({workspace});
  const payload = { fulfillmentId, body, operatorId };
  const replay = await repository.findPackageGroupReplay({ workspace, action: "replace", payload, idempotencyKey: body.idempotencyKey });
  if (replay) return replay;
  const context = getPackageGroupContext(workspace, { fulfillmentId });
  if (context.snapshotToken !== body.snapshotToken) fail("PACKING_GROUP_CHANGED", "订单或包裹已变化，请刷新后重新核对。");
  const selectedIds = body.fulfillmentIds;
  if (!Array.isArray(selectedIds) || !selectedIds.length || new Set(selectedIds).size !== selectedIds.length || !selectedIds.includes(context.anchorFulfillmentId)) fail("PACKING_GROUP_SELECTION_INVALID", "请选择本包组的订单明细，主任务不能移除。", 422);
  const members = context._members.filter(row => selectedIds.includes(fulfillmentIdOf(row)));
  if (members.length !== selectedIds.length || context.existing && selectedIds.length !== context.lines.length) fail("PACKING_GROUP_SELECTION_INVALID", "只能选择本订单可打包明细；更正时必须保留原包组全部明细。");
  if (members.some(row => !isStockOrderType(lineFor(workspace, row)?.orderType))) fail("PACKING_CUSTOM_MIXED_FORBIDDEN", "定制单不混装，请按明细单独登记包裹。", 422);
  if (members.some(row=>["已作废","已取消","closed","voided","canceled"].includes(taskFor(workspace,row)?.status)||["已作废","已取消","已交付","已完成","closed","voided","canceled"].includes((lineFor(workspace,row)?.status??lineFor(workspace,row)?.lineStatus)))) fail("PACKING_GROUP_CLOSED","订单或打包任务已关闭，不能继续建包。");
  if (members.some(hasPackageDownstream)) fail("PACKING_GROUP_DOWNSTREAM_LOCKED", "包组已有实物出库、装车或交付事实，不能直接修改；请办公室处理异常。");
  if (new Set(members.map(lineId)).size !== members.length) fail("PACKING_GROUP_AMBIGUOUS_LINE", "同明细包含多个交付批次，请办公室先核对本次批次。");
  const addresses = new Set(members.map(row => text(row.customerSnapshot?.address ?? row.address)));
  if (addresses.size > 1) fail("PACKING_GROUP_ADDRESS_MISMATCH", "收货地址不同，不能混装同一包。");
  if (body.physicalContentsConfirmed !== true || !text(body.reason)) fail("PACKING_PHYSICAL_CONFIRMATION_REQUIRED", "请逐包核对实物内容并填写登记或更正依据。", 422);
  if (!Array.isArray(body.packages) || !body.packages.length || body.packages.length > 1000) fail("PACKING_PACKAGES_INVALID", "请填写1至1000个实际包裹。", 422);
  const totals = new Map(members.map(row => [fulfillmentIdOf(row),0])), now = new Date().toISOString(), packingRevision = context.packingRevision + 1;
  const packages = body.packages.map((raw,index) => {
    if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > members.length || raw.confirmed !== true) fail("PACKING_PHYSICAL_CONFIRMATION_REQUIRED", "每包都需逐项填写并确认实物。", 422);
    const seen = new Set();
    const contents = raw.items.map(item => {
      const source = members.find(row => fulfillmentIdOf(row) === item.fulfillmentId && lineId(row) === item.orderLineId);
      if (!source || seen.has(item.fulfillmentId)) fail("PACKING_PACKAGE_ORDER_MISMATCH", "一包内只能包含本订单本次选定的明细，明细不能重复。", 422);
      if (!Number.isSafeInteger(item.packedQty) || item.packedQty <= 0 || item.packedQty > 2147483647) fail("PACKING_PACKAGE_QUANTITY_INVALID", "实际逐项数量必须为正整数。", 422);
      seen.add(item.fulfillmentId); totals.set(item.fulfillmentId, totals.get(item.fulfillmentId)+item.packedQty);
      return { orderLineId: item.orderLineId, fulfillmentId: item.fulfillmentId, packedQty: item.packedQty, ...goods(lineFor(workspace,source)) };
    });
    const packedQty = contents.reduce((sum,item)=>sum+item.packedQty,0);
    if (!Number.isSafeInteger(packedQty) || packedQty > 2147483647) fail("PACKING_PACKAGE_QUANTITY_INVALID", "包裹数量超出范围。", 422);
    const packageId = `PKG-${randomUUID().toUpperCase()}`;
    return { packageId, bizNo: packageId, orderLineId: lineId(members.find(row=>fulfillmentIdOf(row)===context.anchorFulfillmentId)), fulfillmentId: context.anchorFulfillmentId,
      packageSeq: index+1, packageCount: body.packages.length, packedQty, contents, packingRevision, revision: 1, status: "待打印标签", labelPrintRecordId: "", createdBy: operatorId, createdAt: now };
  });
  if ([...totals.values()].some(qty=>!Number.isSafeInteger(qty)||qty<=0||qty>2147483647)) fail("PACKING_GROUP_LINE_MISSING", "每个选定明细都必须有实际装包数量；没有实物请取消该明细或交办公室核对。", 422);
  const oldPackages = context.packages.filter(row => packageContents(row).some(item => selectedIds.includes(item.fulfillmentId)));
  const snapshot = packageGroupSnapshot(workspace, members, oldPackages);
  const input = { workspace, payload, idempotencyKey: body.idempotencyKey, action: "replace", anchorId: context.anchorFulfillmentId, orderId: context.orderId,
    snapshot, packages, packingRevision, totals: Object.fromEntries(totals), reason: text(body.reason), operatorId, occurredAt: now,
    operationLogId: `LOG-PKG-${randomUUID()}` };
  return repository.writePackageGroup(input);
}
