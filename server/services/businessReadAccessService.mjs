// Route-level authorization is deliberately independent of navigation visibility.
export const businessReadPolicies = Object.freeze([
  [/^\/api\/order-(?:drafts|lines)(?:\/|$)/, ["order.read"]],
  [/^\/api\/(?:production-tasks|production-schedules)(?:\/|$)/, ["production.read"]],
  [/^\/api\/packing-tasks(?:\/|$)/, ["packing.read"]],
  [/^\/api\/inventory(?:\/|$)/, ["inventory.read"]],
  [/^\/api\/fulfillments(?:\/|$)/, ["fulfillment.read"]],
  [/^\/api\/statements(?:\/|$)/, ["statement.preview"]],
  [/^\/api\/todos(?:\/|$)/, ["todo.read"]],
  [/^\/api\/raw-material-rolls(?:\/|$)/, ["raw_material.stock.read"]],
  [/^\/api\/raw-material-inbounds(?:\/|$)/, ["raw_material.inbound.read"]],
  [/^\/api\/raw-material-supplier-statement-reviews(?:\/|$)/, ["raw_material.accounting.read"]],
  [/^\/api\/raw-material-purchase-requests(?:\/|$)/, ["raw_material.purchase.direct", "raw_material.purchase.record_delegated"]],
  [/^\/api\/(?:print-batches|print-devices|print-jobs)(?:\/|$)/, ["print.read"]],
  [/^\/api\/print-driver(?:\/|$)/, ["fulfillment.print"]],
  [/^\/api\/operation-logs$/, ["audit.read"]],
  [/^\/api\/office\/workspace$/, ["office.workspace.read"]],
  [/^\/api\/(?:system\/|openapi\/status$)/, ["system.read"]],
]);

export function authorizeBusinessRead({ url, response, permissionContext, requireAnyActionPermission }) {
  const policy = businessReadPolicies.find(([pattern]) => pattern.test(url.pathname));
  return !policy || requireAnyActionPermission(response, permissionContext, policy[1]);
}

export function canReadOfficeProduction(permissionContext) {
  return (permissionContext?.actionPermissions ?? []).includes("production.read.all");
}

export function canReadOfficePacking(permissionContext) {
  return (permissionContext?.actionPermissions ?? []).includes("packing.read.all");
}

export function getTrustedWorkerMachine(workspace, permissionContext) {
  const userId = permissionContext?.user?.userId;
  const user = workspace.users?.find((row) => (row.userId ?? row.id) === userId) ?? permissionContext?.user;
  const employeeId = user?.employeeId;
  const employee = employeeId ? workspace.employees?.find((row) => (row.employeeId ?? row.id) === employeeId) : null;
  // An explicitly linked employee is authoritative; stale account defaults may not override their assignment.
  const value = employeeId
    ? employee?.defaultMachineId ?? employee?.machineId ?? employee?.currentMachineId
    : user?.defaultMachineId;
  return String(value ?? "").trim();
}

const operationalOrderFields = ["id", "orderLineId", "orderId", "orderNo", "lineNo", "shortNo", "customerId", "customerName", "productName", "product", "size", "bagColor", "color", "handleType", "handle", "handleColor", "style", "printFlag", "print", "printColor", "printSide", "qty", "originalQty", "orderType", "lineStatus", "status", "fulfillmentMethod", "fulfillment", "latestNeededAt", "latest", "remark", "notes", "revision", "finishedGoodsPhoto", "requirements"];
const operationalProductionFields = ["productionTaskId", "orderLineId", "productionTask", "finishedGoodsPhoto", "reports", "latestReport", "exceptions", "latestException", "dailyProgress"];
const operationalPackingFields = ["packingTaskId", "orderLineId", "packingTask", "packages", "packageCount", "inventoryDeducted"];
function pick(value, fields) {
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}

export function projectWorkerTask(item, kind = "production") {
  if (!item) return item;
  return {
    ...pick(item, kind === "production" ? operationalProductionFields : operationalPackingFields),
    orderLine: pick(item.orderLine, operationalOrderFields),
    // The inventory identity is needed by existing command clients, not the all-factory ledger or balances.
    inventoryItem: pick(item.inventoryItem, ["id", "inventoryItemId", "size", "color", "handle", "style", "revision"]),
  };
}

export function isWorkerTaskVisible(item, machineId) {
  const task = item?.productionTask ?? {};
  return Boolean(machineId) && task.machineId === machineId && Boolean(
    task.publishedScheduleId || item.dailyProgress?.carryOver || ["跨日继续", "待完工确认"].includes(task.taskStatus ?? task.status),
  );
}

export async function authorizeProductionWriteScope({ url, workspace, permissionContext, response, sendJson }) {
  const match = url.pathname.match(/^\/api\/production-tasks\/([^/]+)\/(?:report-complete|daily-progress|exception|finished-goods-photo)(?:\/|$)/);
  // Preserve the existing write-scope boundary: all-factory read grants never
  // authorize cross-machine writes. Command routes still check their write key.
  if (!match || permissionContext?.actionPermissions?.includes("production.schedule.publish")) return true;
  // Let the command route report its explicit missing permission before evaluating record scope.
  if (!permissionContext?.actionPermissions?.includes("production.report.complete")) return true;
  const machineId = getTrustedWorkerMachine(workspace, permissionContext);
  const item = await workspace.productionPackingReadRepository.getProductionTaskDetail({ workspace, productionTaskId: decodeURIComponent(match[1]) });
  if (isWorkerTaskVisible(item, machineId)) return true;
  sendJson(response, 403, { code: "PRODUCTION_TASK_SCOPE_DENIED", message: "只能操作本人当前机台已发布的任务；请刷新任务或联系办公室核对机台安排。" });
  return false;
}
