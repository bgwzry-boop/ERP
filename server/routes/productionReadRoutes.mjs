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
