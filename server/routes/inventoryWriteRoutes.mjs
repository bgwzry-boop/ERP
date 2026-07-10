export async function handleInventoryWriteRoutes({
  method,
  url,
  response,
  workspace,
  body,
  permissionContext,
  writeActionPermissions,
  requireActionPermission,
  createInventoryCorrectionDraftRoute,
  confirmInventoryCorrectionDraftRoute,
  releaseInventoryReservationRoute,
}) {
  if (method !== "POST") return false;

  if (url.pathname === "/api/inventory/correction-drafts") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.createInventoryCorrectionDraft)) return true;
    createInventoryCorrectionDraftRoute({ response, workspace, body });
    return true;
  }

  const correctionConfirmMatch = url.pathname.match(/^\/api\/inventory\/correction-drafts\/([^/]+)\/confirm$/);
  if (correctionConfirmMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmInventoryCorrectionDraft)) return true;
    confirmInventoryCorrectionDraftRoute({
      response,
      workspace,
      correctionDraftId: decodeURIComponent(correctionConfirmMatch[1]),
      body,
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
  });
  return true;
}
