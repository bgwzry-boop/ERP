export async function handleDriverWriteRoutes({
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
  driverDeviceFieldTestCommandService,
  sendCommandResponse,
}) {
  if (method !== "POST") return false;

  const match = url.pathname.match(/^\/api\/driver\/delivery-tasks\/([^/]+)\/(load-confirm|device-field-tests|complete|exception)$/);
  if (!match) return false;

  const fulfillmentId = decodeURIComponent(match[1]);
  const action = match[2];
  const routes = {
    "load-confirm": {
      permission: writeActionPermissions.confirmDriverDeliveryLoaded,
      run: (operatorId) => fulfillmentActionCommandService.confirmDriverDeliveryLoaded({ workspace, fulfillmentId, body, operatorId }),
    },
    "device-field-tests": {
      permission: writeActionPermissions.recordDriverDeviceFieldTest,
      run: (operatorId) => driverDeviceFieldTestCommandService.recordDriverDeviceFieldTest({ workspace, fulfillmentId, body, operatorId }),
    },
    complete: {
      permission: writeActionPermissions.completeDriverDelivery,
      run: (operatorId) => fulfillmentActionCommandService.completeDriverDelivery({ workspace, fulfillmentId, body, operatorId }),
    },
    exception: {
      permission: writeActionPermissions.createDriverDeliveryException,
      run: (operatorId) => fulfillmentActionCommandService.reportDriverDeliveryException({ workspace, fulfillmentId, body, operatorId }),
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-DRIVER-A");
  const result = await route.run(operatorId);
  sendCommandResponse(response, result);
  return true;
}
