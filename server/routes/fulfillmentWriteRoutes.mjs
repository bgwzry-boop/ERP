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
  fulfillmentActionCommandService,
  fulfillmentPrintCommandService,
  sendCommandResponse,
  sendCommandRecord,
}) {
  if (method !== "POST") return false;

  const fulfillmentActionMatch = url.pathname.match(/^\/api\/fulfillments\/([^/]+)\/(exception|quantity-variance-resolution|dispatch|print|paper-handoff|warehouse-execution|prepared|complete|pickup-confirm|cancel|delivery-evidence-review)$/);
  if (fulfillmentActionMatch) {
    const fulfillmentId = decodeURIComponent(fulfillmentActionMatch[1]);
    const action = fulfillmentActionMatch[2];
    const routes = {
      exception: {
        permission: writeActionPermissions.createFulfillmentException,
        run: (operatorId) => fulfillmentActionCommandService.createFulfillmentException({ workspace, fulfillmentId, body, operatorId }),
      },
      "quantity-variance-resolution": {
        permission: writeActionPermissions.resolveFulfillmentQuantityVariance,
        run: (operatorId) => fulfillmentActionCommandService.resolveFulfillmentQuantityVariance({
          workspace,
          fulfillmentId,
          body,
          operatorId,
          actionPermissions: permissionContext?.actionPermissions ?? [],
        }),
      },
      dispatch: {
        permission: writeActionPermissions.updateFulfillmentDispatch,
        run: (operatorId) => fulfillmentActionCommandService.upsertDriverDispatch({ workspace, fulfillmentId, body, operatorId }),
      },
      print: {
        permission: writeActionPermissions.printFulfillment,
        run: (operatorId) => fulfillmentPrintCommandService.printFulfillment({ workspace, fulfillmentId, body, operatorId }),
        recordOptions: { notFoundCode: "FULFILLMENT_NOT_FOUND" },
      },
      "paper-handoff": {
        permission: writeActionPermissions.handoffPaperOutboundDocument,
        run: (operatorId) => fulfillmentActionCommandService.handoffPaperOutboundDocument({ workspace, fulfillmentId, body, operatorId }),
      },
      "warehouse-execution": {
        permission: writeActionPermissions.recordWarehouseOutboundExecution,
        run: (operatorId) => fulfillmentActionCommandService.recordWarehouseOutboundExecution({ workspace, fulfillmentId, body, operatorId }),
      },
      prepared: {
        permission: writeActionPermissions.completeFulfillment,
        run: (operatorId) => fulfillmentActionCommandService.updateFulfillmentStatus({ workspace, fulfillmentId, action: "标记已备货", body, operatorId }),
      },
      complete: {
        permission: writeActionPermissions.completeFulfillment,
        run: (operatorId) => fulfillmentActionCommandService.updateFulfillmentStatus({ workspace, fulfillmentId, action: "完成出库/交付", body, operatorId }),
      },
      "pickup-confirm": {
        permission: writeActionPermissions.confirmFulfillmentPickup,
        run: (operatorId) => fulfillmentActionCommandService.updateFulfillmentStatus({ workspace, fulfillmentId, action: "确认已拉走", body, operatorId }),
      },
      cancel: {
        permission: writeActionPermissions.cancelFulfillment,
        run: (operatorId) => fulfillmentActionCommandService.cancelFulfillment({ workspace, fulfillmentId, body, operatorId }),
      },
      "delivery-evidence-review": {
        permission: writeActionPermissions.reviewDeliveryEvidence,
        run: (operatorId) => fulfillmentActionCommandService.reviewDeliveryEvidence({ workspace, fulfillmentId, body, operatorId }),
      },
    };
    const route = routes[action];
    if (!requireActionPermission(response, permissionContext, route.permission)) return true;
    const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
    const result = await route.run(operatorId);
    if (route.recordOptions) sendCommandRecord(response, result, route.recordOptions);
    else sendCommandResponse(response, result);
    return true;
  }

  const printRecordVoidMatch = url.pathname.match(/^\/api\/print-records\/([^/]+)\/void$/);
  if (!printRecordVoidMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.printFulfillment)) return true;
  const result = await fulfillmentPrintCommandService.voidPrintRecord({
    workspace,
    printRecordId: decodeURIComponent(printRecordVoidMatch[1]),
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
  });
  sendCommandRecord(response, result, { notFoundCode: "PRINT_RECORD_NOT_FOUND" });
  return true;
}
