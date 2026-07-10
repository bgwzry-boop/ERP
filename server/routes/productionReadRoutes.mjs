export async function handleProductionReadRoutes({
  url,
  response,
  workspace,
  sendJson,
  sendNotFound,
  buildProductionMachineQueueResponse,
}) {
  if (url.pathname === "/api/production-tasks") {
    sendJson(
      response,
      200,
      await workspace.productionPackingReadRepository.listProductionTasks({ workspace, query: url.searchParams }),
    );
    return true;
  }

  if (url.pathname === "/api/production-schedules/machine-queue") {
    sendJson(response, 200, await buildProductionMachineQueueResponse({ workspace, query: url.searchParams }));
    return true;
  }

  const productionTaskDetailMatch = url.pathname.match(/^\/api\/production-tasks\/([^/]+)$/);
  if (productionTaskDetailMatch) {
    const item = await workspace.productionPackingReadRepository.getProductionTaskDetail({
      workspace,
      productionTaskId: decodeURIComponent(productionTaskDetailMatch[1]),
    });
    if (item) sendJson(response, 200, item);
    else sendNotFound(response, "PRODUCTION_TASK_NOT_FOUND");
    return true;
  }

  if (url.pathname === "/api/packing-tasks") {
    sendJson(
      response,
      200,
      await workspace.productionPackingReadRepository.listPackingTasks({ workspace, query: url.searchParams }),
    );
    return true;
  }

  const packingTaskDetailMatch = url.pathname.match(/^\/api\/packing-tasks\/([^/]+)$/);
  if (!packingTaskDetailMatch) return false;

  const item = await workspace.productionPackingReadRepository.getPackingTaskDetail({
    workspace,
    packingTaskId: decodeURIComponent(packingTaskDetailMatch[1]),
  });
  if (item) sendJson(response, 200, item);
  else sendNotFound(response, "PACKING_TASK_NOT_FOUND");
  return true;
}
