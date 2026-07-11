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
  publishProductionScheduleRoute,
  resequenceProductionMachineQueueRoute,
  moveProductionMachineQueueItemRoute,
  reportProductionCompleteRoute,
  recordProductionDailyProgressRoute,
  uploadProductionFinishedGoodsPhotoRoute,
  reviewProductionFinishedGoodsPhotoRoute,
  completePackingTaskRoute,
}) {
  if (method !== "POST") return false;

  const productionActionMatch = url.pathname.match(
    /^\/api\/production-tasks\/([^/]+)\/(publish-schedule|report-complete|daily-progress|finished-goods-photo|finished-goods-photo-review)$/,
  );
  if (productionActionMatch) {
    const productionTaskId = decodeURIComponent(productionActionMatch[1]);
    const action = productionActionMatch[2];
    const routes = {
      "publish-schedule": {
        permission: writeActionPermissions.publishProductionSchedule,
        run: () =>
          publishProductionScheduleRoute({
            response,
            workspace,
            productionTaskId,
            body,
            operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
          }),
      },
      "report-complete": {
        permission: writeActionPermissions.reportProduction,
        run: () =>
          reportProductionCompleteRoute({
            response,
            workspace,
            productionTaskId,
            body,
            operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
          }),
      },
      "daily-progress": {
        permission: writeActionPermissions.reportProduction,
        run: () =>
          recordProductionDailyProgressRoute({
            response,
            workspace,
            productionTaskId,
            body,
            operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
          }),
      },
      "finished-goods-photo": {
        permission: writeActionPermissions.reportProduction,
        run: () =>
          uploadProductionFinishedGoodsPhotoRoute({
            response,
            workspace,
            productionTaskId,
            body,
            operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
          }),
      },
      "finished-goods-photo-review": {
        permission: writeActionPermissions.publishProductionSchedule,
        run: () =>
          reviewProductionFinishedGoodsPhotoRoute({
            response,
            workspace,
            productionTaskId,
            body,
            operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
          }),
      },
    };
    const route = routes[action];
    if (!requireActionPermission(response, permissionContext, route.permission)) return true;
    await route.run();
    return true;
  }

  const queueRoute = {
    "/api/production-schedules/machine-queue/resequence": {
      permission: writeActionPermissions.resequenceProductionSchedule,
      run: () =>
        resequenceProductionMachineQueueRoute({
          response,
          workspace,
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
        }),
    },
    "/api/production-schedules/machine-queue/move": {
      permission: writeActionPermissions.moveProductionSchedule,
      run: () =>
        moveProductionMachineQueueItemRoute({
          response,
          workspace,
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
        }),
    },
  }[url.pathname];
  if (queueRoute) {
    if (!requireActionPermission(response, permissionContext, queueRoute.permission)) return true;
    await queueRoute.run();
    return true;
  }

  const packingCompleteMatch = url.pathname.match(/^\/api\/packing-tasks\/([^/]+)\/complete$/);
  if (!packingCompleteMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.completePacking)) return true;
  await completePackingTaskRoute({
    response,
    workspace,
    packingTaskId: decodeURIComponent(packingCompleteMatch[1]),
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
  });
  return true;
}
