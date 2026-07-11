export async function handleFulfillmentWriteRoutes({
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
  createFulfillmentExceptionRoute,
  upsertFulfillmentDispatchRoute,
  printFulfillmentRoute,
  voidPrintRecordRoute,
  updateFulfillmentStatusRoute,
  cancelFulfillmentRoute,
  reviewDeliveryEvidenceRoute,
}) {
  if (method !== "POST") return false;

  const fulfillmentActionMatch = url.pathname.match(/^\/api\/fulfillments\/([^/]+)\/(exception|dispatch|print|prepared|complete|pickup-confirm|cancel|delivery-evidence-review)$/);
  if (fulfillmentActionMatch) {
    const fulfillmentId = decodeURIComponent(fulfillmentActionMatch[1]);
    const action = fulfillmentActionMatch[2];
    const routes = {
      exception: {
        permission: writeActionPermissions.createFulfillmentException,
        run: () => createFulfillmentExceptionRoute({ response, workspace, fulfillmentId, body }),
      },
      dispatch: {
        permission: writeActionPermissions.updateFulfillmentDispatch,
        run: () =>
          upsertFulfillmentDispatchRoute({
            response,
            workspace,
            fulfillmentId,
            body,
            operatorId: getPermissionOperatorId(permissionContext, authContext, body.operatorId ?? "U-OFFICE-A"),
          }),
      },
      print: {
        permission: writeActionPermissions.printFulfillment,
        run: () => printFulfillmentRoute({ response, workspace, fulfillmentId, body }),
      },
      prepared: {
        permission: writeActionPermissions.completeFulfillment,
        run: () => updateFulfillmentStatusRoute({ response, workspace, fulfillmentId, action: "标记已备货", body }),
      },
      complete: {
        permission: writeActionPermissions.completeFulfillment,
        run: () => updateFulfillmentStatusRoute({ response, workspace, fulfillmentId, action: "完成出库/交付", body }),
      },
      "pickup-confirm": {
        permission: writeActionPermissions.confirmFulfillmentPickup,
        run: () => updateFulfillmentStatusRoute({ response, workspace, fulfillmentId, action: "确认已拉走", body }),
      },
      cancel: {
        permission: writeActionPermissions.cancelFulfillment,
        run: () => cancelFulfillmentRoute({ response, workspace, fulfillmentId, body }),
      },
      "delivery-evidence-review": {
        permission: writeActionPermissions.reviewDeliveryEvidence,
        run: () =>
          reviewDeliveryEvidenceRoute({
            response,
            workspace,
            fulfillmentId,
            body,
            operatorId: getPermissionOperatorId(permissionContext, authContext, body.operatorId ?? "U-OFFICE-A"),
          }),
      },
    };
    const route = routes[action];
    if (!requireActionPermission(response, permissionContext, route.permission)) return true;
    await route.run();
    return true;
  }

  const printRecordVoidMatch = url.pathname.match(/^\/api\/print-records\/([^/]+)\/void$/);
  if (!printRecordVoidMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.printFulfillment)) return true;
  await voidPrintRecordRoute({
    response,
    workspace,
    printRecordId: decodeURIComponent(printRecordVoidMatch[1]),
    body,
  });
  return true;
}
