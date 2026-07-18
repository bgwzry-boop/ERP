export async function handleProductionWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  productionSchedulingCommandService,
  productionReportingCommandService,
  productionFinishedGoodsPhotoCommandService,
  packingCommandService,
  productionFinishedGoodsPhotoProjectionService,
  todoReadProjectionService,
  findOrderLine,
  toProductionTaskSummary,
  summarizeOrderLineForChange,
  sendCommandResponse,
  sendJson,
  sendNotFound,
  sendBusinessError,
}) {
  if (method !== "POST") return false;

  const productionActionMatch = url.pathname.match(
    /^\/api\/production-tasks\/([^/]+)\/(publish-schedule|report-complete|daily-progress|exception|exception-resolution|finished-goods-photo|finished-goods-photo-review)$/,
  );
  if (productionActionMatch) {
    const productionTaskId = decodeURIComponent(productionActionMatch[1]);
    const routes = {
      "publish-schedule": {
        permission: writeActionPermissions.publishProductionSchedule,
        run: (operatorId) => productionSchedulingCommandService.publishSchedule({
          workspace,
          productionTaskId,
          body,
          operatorId,
          actionPermissions: permissionContext?.actionPermissions ?? [],
        }),
      },
      "report-complete": {
        permission: writeActionPermissions.reportProduction,
        run: (operatorId) => productionReportingCommandService.completeProductionReport({ workspace, productionTaskId, body, operatorId }),
      },
      "daily-progress": {
        permission: writeActionPermissions.reportProduction,
        run: (operatorId) => productionReportingCommandService.recordDailyProgress({ workspace, productionTaskId, body, operatorId }),
      },
      exception: {
        permission: writeActionPermissions.reportProduction,
        run: (operatorId) => productionReportingCommandService.recordProductionException({ workspace, productionTaskId, body, operatorId }),
      },
      "exception-resolution": {
        permission: writeActionPermissions.resolveProductionException,
        run: (operatorId) => productionReportingCommandService.resolveProductionException({ workspace, productionTaskId, body, operatorId }),
      },
      "finished-goods-photo": {
        permission: writeActionPermissions.reportProduction,
        photoMode: "upload",
        run: (operatorId) => productionFinishedGoodsPhotoCommandService.uploadPhoto({ workspace, productionTaskId, body, operatorId }),
      },
      "finished-goods-photo-review": {
        permission: writeActionPermissions.publishProductionSchedule,
        photoMode: "review",
        run: (operatorId) => productionFinishedGoodsPhotoCommandService.reviewPhoto({ workspace, productionTaskId, body, operatorId }),
      },
    };
    return runRoute(routes[productionActionMatch[2]], { productionTaskId });
  }

  const queueRoute = {
    "/api/production-schedules/machine-queue/resequence": {
      permission: writeActionPermissions.resequenceProductionSchedule,
      run: (operatorId) => productionSchedulingCommandService.resequenceMachineQueue({
        workspace,
        body,
        operatorId,
        actionPermissions: permissionContext?.actionPermissions ?? [],
      }),
    },
    "/api/production-schedules/machine-queue/move": {
      permission: writeActionPermissions.moveProductionSchedule,
      run: (operatorId) => productionSchedulingCommandService.moveMachineQueueItem({
        workspace,
        body,
        operatorId,
        actionPermissions: permissionContext?.actionPermissions ?? [],
      }),
    },
  }[url.pathname];
  if (queueRoute) return runRoute(queueRoute);

  const packingCompleteMatch = url.pathname.match(/^\/api\/packing-tasks\/([^/]+)\/complete$/);
  if (!packingCompleteMatch) return false;
  const packingTaskId = decodeURIComponent(packingCompleteMatch[1]);
  return runRoute({
    permission: writeActionPermissions.completePacking,
    run: (operatorId) => packingCommandService.completePackingTask({ workspace, packingTaskId, body, operatorId }),
  });

  async function runRoute(route, context = {}) {
    if (!requireActionPermission(response, permissionContext, route.permission)) return true;
    const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
    const result = await route.run(operatorId);
    if (route.photoMode) sendPhotoResult(result, context.productionTaskId, route.photoMode);
    else sendCommandResponse(response, result);
    return true;
  }

  function sendPhotoResult(result, productionTaskId, mode) {
    if (result.notFound) return sendNotFound(response, result.code);
    if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
    const productionTask = result.productionTask;
    const orderLine = findOrderLine(workspace, productionTask.orderLineId);
    const payload = {
      productionTaskId,
      orderLineId: productionTask.orderLineId,
      productionTask: toProductionTaskSummary(productionTask, orderLine),
      orderLine: summarizeOrderLineForChange(orderLine),
      finishedGoodsPhoto: productionFinishedGoodsPhotoProjectionService.buildPhotoSummary(workspace, productionTask, orderLine),
      customerNotificationTodoCreated: mode === "review" && result.reviewStatus === "已接受",
      retakeTodoCreated: mode === "review" && result.reviewStatus === "需重拍",
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
      operationLogId: result.operationLogId,
    };
    if (mode === "review") payload.todo = result.todo ? todoReadProjectionService.summarizeTodo(result.todo) : null;
    return sendJson(response, 200, payload);
  }
}
