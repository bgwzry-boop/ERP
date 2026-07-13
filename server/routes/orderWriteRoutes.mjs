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
  recognizeOrderDraft,
  recognizeOrderDraftQueue,
  saveOrderDraft,
  restoreShortageCancelledDraftLineRoute,
  linkCrossDraftShortageCancellationRoute,
  previewOrderDraftSplitRoute,
  confirmSplitOrderDraftRoute,
  confirmOrderDraftRoute,
  voidOrderLineRoute,
  adjustOrderLineQuantityRoute,
}) {
  if (method === "POST" && url.pathname === "/api/order-drafts/recognize") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.recognizeOrderDraft)) return true;
    await recognizeOrderDraft({
      response,
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  if (method === "POST" && url.pathname === "/api/order-draft-queues/recognize") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.recognizeOrderDraft)) return true;
    await recognizeOrderDraftQueue({
      response,
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const saveDraftMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)$/);
  if (method === "PATCH" && saveDraftMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    await saveOrderDraft({
      response,
      workspace,
      draftId: decodeURIComponent(saveDraftMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const confirmDraftMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/confirm$/);
  if (method === "POST" && confirmDraftMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmOrderDraft)) return true;
    await confirmOrderDraftRoute({
      response,
      workspace,
      draftId: decodeURIComponent(confirmDraftMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const restoreShortageCancellationMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/shortage-cancellation-restore$/);
  if (method === "POST" && restoreShortageCancellationMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    await restoreShortageCancelledDraftLineRoute({
      response,
      workspace,
      draftId: decodeURIComponent(restoreShortageCancellationMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const linkCrossDraftCancellationMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/cross-draft-shortage-cancellation$/);
  if (method === "POST" && linkCrossDraftCancellationMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    await linkCrossDraftShortageCancellationRoute({
      response,
      workspace,
      draftId: decodeURIComponent(linkCrossDraftCancellationMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const splitPreviewMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/split-preview$/);
  if (method === "POST" && splitPreviewMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmOrderDraft)) return true;
    await previewOrderDraftSplitRoute({
      response,
      workspace,
      draftId: decodeURIComponent(splitPreviewMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const splitConfirmMatch = url.pathname.match(/^\/api\/order-drafts\/([^/]+)\/split-confirm$/);
  if (method === "POST" && splitConfirmMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmOrderDraft)) return true;
    await confirmSplitOrderDraftRoute({
      response,
      workspace,
      draftId: decodeURIComponent(splitConfirmMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const orderLineVoidMatch = url.pathname.match(/^\/api\/order-lines\/([^/]+)\/void$/);
  if (method === "POST" && orderLineVoidMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.voidOrderLine)) return true;
    await voidOrderLineRoute({
      response,
      workspace,
      orderLineId: decodeURIComponent(orderLineVoidMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const orderLineQuantityAdjustmentMatch = url.pathname.match(/^\/api\/order-lines\/([^/]+)\/quantity-adjustment$/);
  if (!orderLineQuantityAdjustmentMatch || method !== "POST") return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.adjustOrderLineQuantity)) return true;
  await adjustOrderLineQuantityRoute({
    response,
    workspace,
    orderLineId: decodeURIComponent(orderLineQuantityAdjustmentMatch[1]),
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
  });
  return true;
}
