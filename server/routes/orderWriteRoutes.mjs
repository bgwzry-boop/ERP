export async function handleOrderWriteRoutes({
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
  orderDraftCommandService,
  orderLineMutationCommandService,
  sendCommandResponse,
}) {
  if (method === "POST" && url.pathname === "/api/order-drafts/recognize") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.recognizeOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.recognizeOrderDraft({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  if (method === "POST" && url.pathname === "/api/order-draft-queues/recognize") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.recognizeOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.recognizeOrderDraftQueue({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const saveDraftMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)$/);
  if (method === "PATCH" && saveDraftMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.saveOrderDraft({
      workspace,
      draftId: decodeURIComponent(saveDraftMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const confirmDraftMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/confirm$/);
  if (method === "POST" && confirmDraftMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.confirmOrderDraft({
      workspace,
      draftId: decodeURIComponent(confirmDraftMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const restoreShortageCancellationMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/shortage-cancellation-restore$/);
  if (method === "POST" && restoreShortageCancellationMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.restoreShortageCancelledDraftLine({
      workspace,
      draftId: decodeURIComponent(restoreShortageCancellationMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const linkCrossDraftCancellationMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/cross-draft-shortage-cancellation$/);
  if (method === "POST" && linkCrossDraftCancellationMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.linkCrossDraftShortageCancellation({
      workspace,
      draftId: decodeURIComponent(linkCrossDraftCancellationMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const splitPreviewMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/split-preview$/);
  if (method === "POST" && splitPreviewMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.previewOrderDraftSplit({
      workspace,
      draftId: decodeURIComponent(splitPreviewMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const splitConfirmMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/split-confirm$/);
  if (method === "POST" && splitConfirmMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmOrderDraft)) return true;
    sendCommandResponse(response, await orderDraftCommandService.confirmSplitOrderDraft({
      workspace,
      draftId: decodeURIComponent(splitConfirmMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const orderLineVoidMatch = url.pathname.match(/^\/api\/order-lines\/([^/]+)\/void$/);
  if (method === "POST" && orderLineVoidMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.voidOrderLine)) return true;
    sendCommandResponse(response, await orderLineMutationCommandService.voidOrderLine({
      workspace,
      orderLineId: decodeURIComponent(orderLineVoidMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    }));
    return true;
  }

  const orderLineQuantityAdjustmentMatch = url.pathname.match(/^\/api\/order-lines\/([^/]+)\/quantity-adjustment$/);
  if (!orderLineQuantityAdjustmentMatch || method !== "POST") return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.adjustOrderLineQuantity)) return true;
  sendCommandResponse(response, await orderLineMutationCommandService.adjustOrderLineQuantity({
    workspace,
    orderLineId: decodeURIComponent(orderLineQuantityAdjustmentMatch[1]),
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
  }));
  return true;
}
