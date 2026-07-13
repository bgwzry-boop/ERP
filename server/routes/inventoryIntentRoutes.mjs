import { createInventoryIntentCommandService } from "../services/inventoryIntentCommandService.mjs";

const intentActionPermissions = Object.freeze({
  create: "inventory.reservation.create",
  extend: "inventory.reservation.create",
  release: "inventory.reservation.release",
  expire: "inventory.reservation.release",
});

export function createInventoryIntentRouteModule(options = {}) {
  const commandService = options.commandService ?? createInventoryIntentCommandService(options.commandServiceOptions);

  return {
    handleReadRoutes,
    handleWriteRoutes,
  };

  async function handleReadRoutes({ url, response, workspace, sendJson }) {
    if (url.pathname === "/api/inventory/intents") {
      sendJson(response, 200, {
        items: commandService.listIntents({
          workspace,
          filters: {
            status: url.searchParams.get("status"),
            intentType: url.searchParams.get("intentType"),
            customerId: url.searchParams.get("customerId"),
            sourceDraftId: url.searchParams.get("sourceDraftId"),
          },
        }),
      });
      return true;
    }

    if (url.pathname !== "/api/inventory/holds") return false;
    sendJson(response, 200, {
      items: commandService.listTemporaryHolds({
        workspace,
        filters: {
          status: url.searchParams.get("status"),
          customerId: url.searchParams.get("customerId"),
        },
      }),
    });
    return true;
  }

  async function handleWriteRoutes({
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
  }) {
    if (method !== "POST") return false;

    const intentHoldMatch = url.pathname.match(/^\/api\/inventory\/intents\/([^/]+)\/hold$/);
    if (intentHoldMatch) {
      if (!requireActionPermission(response, permissionContext, intentActionPermissions.create)) return true;
      return executeCommand(
        response,
        commandService.createTemporaryHold({
          workspace,
          intentId: decodeURIComponent(intentHoldMatch[1]),
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
        }),
        { sendJson, sendNotFound, sendBusinessError },
      );
    }

    const holdReleaseMatch = url.pathname.match(/^\/api\/inventory\/holds\/([^/]+)\/release$/);
    if (holdReleaseMatch) {
      if (!requireActionPermission(response, permissionContext, intentActionPermissions.release)) return true;
      return executeCommand(
        response,
        commandService.releaseTemporaryHold({
          workspace,
          reservationId: decodeURIComponent(holdReleaseMatch[1]),
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
        }),
        { sendJson, sendNotFound, sendBusinessError },
      );
    }

    const holdExtendMatch = url.pathname.match(/^\/api\/inventory\/holds\/([^/]+)\/extend$/);
    if (holdExtendMatch) {
      if (!requireActionPermission(response, permissionContext, intentActionPermissions.extend)) return true;
      return executeCommand(
        response,
        commandService.extendTemporaryHold({
          workspace,
          reservationId: decodeURIComponent(holdExtendMatch[1]),
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
        }),
        { sendJson, sendNotFound, sendBusinessError },
      );
    }

    if (url.pathname !== "/api/inventory/holds/expire-due") return false;
    if (!requireActionPermission(response, permissionContext, intentActionPermissions.expire)) return true;
    return executeCommand(
      response,
      commandService.expireDueTemporaryHolds({ workspace, body }),
      { sendJson, sendNotFound, sendBusinessError },
    );
  }
}

export const inventoryIntentRouteModule = createInventoryIntentRouteModule();

async function executeCommand(response, command, handlers) {
  const result = await command;
  if (result.notFound) handlers.sendNotFound(response, result.code);
  else if (result.error) handlers.sendBusinessError(response, result.statusCode, result.code, result.message);
  else handlers.sendJson(response, 200, result.response);
  return true;
}
