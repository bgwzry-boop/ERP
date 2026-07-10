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
  confirmDriverDeliveryLoadedRoute,
  recordDriverDeviceFieldTestRoute,
  completeDriverDeliveryTaskRoute,
  reportDriverDeliveryExceptionRoute,
}) {
  if (method !== "POST") return false;

  const match = url.pathname.match(/^\/api\/driver\/delivery-tasks\/([^/]+)\/(load-confirm|device-field-tests|complete|exception)$/);
  if (!match) return false;

  const fulfillmentId = decodeURIComponent(match[1]);
  const action = match[2];
  const routes = {
    "load-confirm": {
      permission: writeActionPermissions.confirmDriverDeliveryLoaded,
      run: confirmDriverDeliveryLoadedRoute,
    },
    "device-field-tests": {
      permission: writeActionPermissions.recordDriverDeviceFieldTest,
      run: recordDriverDeviceFieldTestRoute,
    },
    complete: {
      permission: writeActionPermissions.completeDriverDelivery,
      run: completeDriverDeliveryTaskRoute,
    },
    exception: {
      permission: writeActionPermissions.createDriverDeliveryException,
      run: reportDriverDeliveryExceptionRoute,
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  await route.run({
    response,
    workspace,
    fulfillmentId,
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-DRIVER-A"),
  });
  return true;
}
