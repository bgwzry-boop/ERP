import { inventoryIntentRouteModule as defaultInventoryIntentRouteModule } from "./inventoryIntentRoutes.mjs";
import { buildInventoryQuantitySnapshot } from "../services/inventoryCorrectionReadProjectionService.mjs";

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
  inventoryCorrectionCommandService,
  inventoryReservationReleaseCommandService,
  inventoryCorrectionReadProjectionService,
  todoReadProjectionService,
  inventoryIntentRouteModule = defaultInventoryIntentRouteModule,
  sendCommandResponse,
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
    const result = await inventoryCorrectionCommandService.createCorrectionDraft({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    if (sendCommandFailure(response, result, sendCommandResponse)) return true;
    const draft = result.correctionDraft;
    sendJson(response, 200, {
      correctionDraftId: draft.correctionDraftId,
      inventoryItemId: draft.inventoryItemId,
      status: draft.status,
      revision: draft.revision,
      attachmentIds: draft.attachmentIds ?? [],
      qtyBefore: draft.qtyBefore,
      requestedQtyAfter: draft.requestedQtyAfter,
      todoId: result.todo.id,
      operationLogId: result.operationLogId,
    });
    return true;
  }

  const correctionAttachmentMatch = url.pathname.match(/^\/api\/inventory\/correction-drafts\/([^/]+)\/attachments$/);
  if (correctionAttachmentMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.linkInventoryCorrectionAttachments)) return true;
    const result = await inventoryCorrectionCommandService.linkCorrectionAttachments({
      workspace,
      correctionDraftId: decodeURIComponent(correctionAttachmentMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    if (sendCommandFailure(response, result, sendCommandResponse)) return true;
    sendJson(response, 200, {
      correctionDraftId: result.correctionDraft.correctionDraftId,
      attachmentIds: result.attachmentIds ?? result.correctionDraft.attachmentIds ?? [],
      revision: result.correctionDraft.revision,
      unchanged: Boolean(result.unchanged),
      operationLogId: result.operationLogId,
    });
    return true;
  }

  const correctionConfirmMatch = url.pathname.match(/^\/api\/inventory\/correction-drafts\/([^/]+)\/confirm$/);
  if (correctionConfirmMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.confirmInventoryCorrectionDraft)) return true;
    const result = await inventoryCorrectionCommandService.confirmCorrectionDraft({
      workspace,
      correctionDraftId: decodeURIComponent(correctionConfirmMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    if (sendCommandFailure(response, result, sendCommandResponse)) return true;
    sendJson(response, 200, {
      correctionDraftId: result.correctionDraft.correctionDraftId,
      inventoryItemId: result.inventoryItem.id,
      qtyBefore: result.correctionDraft.qtyBefore,
      qtyAfter: buildInventoryQuantitySnapshot(result.inventoryItem),
      ledger: inventoryCorrectionReadProjectionService.buildLedgerSummary({
        entry: result.inventoryLedger,
        inventoryItem: result.inventoryItem,
        workspace,
        correctionDraftId: result.correctionDraft.correctionDraftId,
      }),
      todo: result.todo ? todoReadProjectionService.projectTodo({ workspace, todo: result.todo }) : null,
      operationLogId: result.operationLogId,
    });
    return true;
  }

  const reservationReleaseMatch = url.pathname.match(/^\/api\/inventory\/reservations\/([^/]+)\/release$/);
  if (!reservationReleaseMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.releaseInventoryReservation)) return true;
  const result = await inventoryReservationReleaseCommandService.releaseReservation({
    workspace,
    reservationId: decodeURIComponent(reservationReleaseMatch[1]),
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
  });
  sendCommandResponse(response, result);
  return true;
}

function sendCommandFailure(response, result, sendCommandResponse) {
  if (!result?.notFound && !result?.error) return false;
  sendCommandResponse(response, result);
  return true;
}
