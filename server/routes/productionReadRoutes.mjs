import { getPackageGroupContext, publicPackageGroupContext } from "../services/packageGroupService.mjs";
import { compareSilkScreenPoolItems, INK_ORDER_GROUPS, inkOrderGroup } from "../../shared/silkScreenInkOrder.js";
import { canReadOfficePacking, canReadOfficeProduction, getTrustedWorkerMachine, isWorkerTaskVisible, projectWorkerTask } from "../services/businessReadAccessService.mjs";

export async function handleProductionReadRoutes({
  url,
  response,
  workspace,
  sendJson,
  sendNotFound,
  buildProductionMachineQueueResponse,
  permissionContext,
}) {
  // Direct unit callers historically omit a context; the API always supplies it.
  const workerScope = permissionContext && !canReadOfficeProduction(permissionContext);
  const packingWorkerScope = permissionContext && !canReadOfficePacking(permissionContext);
  const machineId = workerScope ? getTrustedWorkerMachine(workspace, permissionContext) : "";
  const query = new URLSearchParams(url.searchParams);
  if (workerScope) {
    if (!machineId && /\/production-(?:tasks|schedules)/.test(url.pathname)) {
      sendJson(response, 403, { code: "PRODUCTION_MACHINE_ASSIGNMENT_REQUIRED", message: "尚未维护本人的机台安排，请联系办公室。" });
      return true;
    }
    query.set("machineId", machineId);
    query.set("visibility", "workshop_mobile");
  }
  if (url.pathname === "/api/production-tasks") {
    const result = await workspace.productionPackingReadRepository.listProductionTasks({ workspace, query });
    sendJson(
      response,
      200,
      workerScope ? { ...result, items: result.items.map((item) => projectWorkerTask(item)) } : result,
    );
    return true;
  }

  // P2-02 丝印领任务池：按油墨颜色分组（先白色，黑色和多色收尾），领了的显示领取人。
  if (url.pathname === "/api/production-schedules/silk-screen-pool") {
    if (workerScope) {
      const machine = (workspace.machines ?? []).find((row) => String(row.id ?? row.machineId ?? "").trim() === machineId);
      if (machine?.machineType !== "screen_printing") {
        sendJson(response, 403, { code: "SILK_SCREEN_CLAIM_MACHINE_REQUIRED", message: "只有丝印机的师傅可以领丝印任务。" });
        return true;
      }
    }
    const userId = String(permissionContext?.user?.userId ?? "").trim();
    const result = await workspace.productionPackingReadRepository.listProductionTasks({
      workspace,
      query: new URLSearchParams({ visibility: "silk_screen_pool", pageSize: "200" }),
    });
    const items = [...result.items].sort(compareSilkScreenPoolItems).map((item) => {
      const group = inkOrderGroup(item.orderLine ?? {});
      const claimer = String(item.productionTask?.claimedByUserId ?? "").trim();
      return {
        ...(workerScope ? projectWorkerTask(item) : item),
        inkGroup: group.key,
        inkGroupLabel: group.label,
        claimedByMe: Boolean(userId) && claimer === userId,
      };
    });
    sendJson(response, 200, {
      items,
      groups: INK_ORDER_GROUPS,
      total: result.total,
      truncated: result.total > items.length,
      machineId,
    });
    return true;
  }

  if (url.pathname === "/api/production-schedules/machine-queue") {
    sendJson(response, 200, await buildProductionMachineQueueResponse({ workspace, query }));
    return true;
  }

  const productionTaskDetailMatch = url.pathname.match(/^\/api\/production-tasks\/([^/]+)$/);
  if (productionTaskDetailMatch) {
    const item = await workspace.productionPackingReadRepository.getProductionTaskDetail({
      workspace,
      productionTaskId: decodeURIComponent(productionTaskDetailMatch[1]),
    });
    if (item && (!workerScope || isWorkerTaskVisible(item, machineId))) sendJson(response, 200, workerScope ? projectWorkerTask(item) : item);
    else sendNotFound(response, "PRODUCTION_TASK_NOT_FOUND");
    return true;
  }

  if (url.pathname === "/api/packing-tasks") {
    const result = await workspace.productionPackingReadRepository.listPackingTasks({ workspace, query: url.searchParams });
    sendJson(
      response,
      200,
      packingWorkerScope ? { ...result, items: result.items.map((item) => projectWorkerTask(item, "packing")) } : result,
    );
    return true;
  }

  if (url.pathname === "/api/packing-groups") {
    await workspace.productionPackingTransactionRepository.refreshPackageGroupWorkspace?.({workspace});
    sendJson(response,200,publicPackageGroupContext(getPackageGroupContext(workspace,{
      fulfillmentId:url.searchParams.get("fulfillmentId") || undefined,orderLineId:url.searchParams.get("orderLineId") || undefined,
    })));
    return true;
  }

  const packingTaskDetailMatch = url.pathname.match(/^\/api\/packing-tasks\/([^/]+)$/);
  if (!packingTaskDetailMatch) return false;

  const item = await workspace.productionPackingReadRepository.getPackingTaskDetail({
    workspace,
    packingTaskId: decodeURIComponent(packingTaskDetailMatch[1]),
  });
  if (item) sendJson(response, 200, packingWorkerScope ? projectWorkerTask(item, "packing") : item);
  else sendNotFound(response, "PACKING_TASK_NOT_FOUND");
  return true;
}
