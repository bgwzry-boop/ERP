import { inventoryIntentRouteModule as defaultInventoryIntentRouteModule } from "./inventoryIntentRoutes.mjs";

export async function handleInventoryWriteRoutes({
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
  createInventoryCorrectionDraftRoute,
  linkInventoryCorrectionAttachmentsRoute,
  confirmInventoryCorrectionDraftRoute,
  releaseInventoryReservationRoute,
  inventoryIntentRouteModule = defaultInventoryIntentRouteModule,
  sendJson,
  sendNotFound,
  sendBusinessError,
}) {
  if (method !== "POST") return false;

  if (
    await inventoryIntentRouteModule.handleWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      requireActionPermission,
      getPermissionOperatorId,
      sendJson,
      sendNotFound,
      sendBusinessError,
    })
  ) {
    return true;
  }

  if (url.pathname === "/api/inventory/correction-drafts") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.createInventoryCorrectionDraft)) return true;
    await createInventoryCorrectionDraftRoute({
      response,
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const correctionAttachmentMatch = url.pathname.match(/^\/api\/inventory\/correction-drafts\/([^/]+)\/attachments$/);
  if (correctionAttachmentMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.linkInventoryCorrectionAttachments)) return true;
    await linkInventoryCorrectionAttachmentsRoute({
      response,
      workspace,
      correctionDraftId: decodeURIComponent(correctionAttachmentMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const correctionConfirmMatch = url.pathname.match(/^\/api\/inventory\/correction-drafts\/([^/]+)\/confirm$/);
  if (correctionConfirmMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmInventoryCorrectionDraft)) return true;
    await confirmInventoryCorrectionDraftRoute({
      response,
      workspace,
      correctionDraftId: decodeURIComponent(correctionConfirmMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const reservationReleaseMatch = url.pathname.match(/^\/api\/inventory\/reservations\/([^/]+)\/release$/);
  if (!reservationReleaseMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.releaseInventoryReservation)) return true;
  await releaseInventoryReservationRoute({
    response,
    workspace,
    reservationId: decodeURIComponent(reservationReleaseMatch[1]),
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
  });
  return true;
}
