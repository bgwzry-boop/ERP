export async function handlePrintWriteRoutes({
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
  createPrintBatchRoute,
  upsertPrintDeviceRoute,
  updatePrintDeviceDriverModeRoute,
  recordPrinterDeviceFieldTestRoute,
  updatePrintJobStatusRoute,
  dispatchPrintJobRoute,
  pollPrintJobsRoute,
  recordPrintJobDriverStatusRoute,
  pollPrintJobDriverStatusRoute,
  retryPrintJobRoute,
}) {
  if (method !== "POST") return false;

  const directRoutes = {
    "/api/print-batches": {
      permission: writeActionPermissions.printFulfillment,
      run: () => {
        const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
        return createPrintBatchRoute({
          response,
          workspace,
          body,
          operatorId,
          operatorName: permissionContext?.user?.displayName ?? operatorId,
        });
      },
    },
    "/api/print-devices": {
      permission: writeActionPermissions.printFulfillment,
      run: () => upsertPrintDeviceRoute({ response, workspace, body }),
    },
    "/api/print-jobs/status-poll": {
      permission: writeActionPermissions.printJobDriverCallback,
      run: () =>
        pollPrintJobsRoute({
          response,
          workspace,
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-PRINT-DRIVER-A"),
        }),
    },
  };
  const directRoute = directRoutes[url.pathname];
  if (directRoute) {
    if (!requireActionPermission(response, permissionContext, directRoute.permission)) return true;
    await directRoute.run();
    return true;
  }

  const deviceMatch = url.pathname.match(/^\/api\/print-devices\/([^/]+)\/(driver-mode|field-tests)$/);
  if (deviceMatch) {
    const printDeviceId = decodeURIComponent(deviceMatch[1]);
    const action = deviceMatch[2];
    const routes = {
      "driver-mode": {
        permission: writeActionPermissions.printFulfillment,
        run: updatePrintDeviceDriverModeRoute,
      },
      "field-tests": {
        permission: writeActionPermissions.recordPrintDeviceFieldTest,
        run: recordPrinterDeviceFieldTestRoute,
      },
    };
    const route = routes[action];
    if (!requireActionPermission(response, permissionContext, route.permission)) return true;
    await route.run({
      response,
      workspace,
      printDeviceId,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const jobMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)\/(status|dispatch|driver-status|poll-status|retry)$/);
  if (!jobMatch) return false;

  const printJobId = decodeURIComponent(jobMatch[1]);
  const action = jobMatch[2];
  const routes = {
    status: {
      permission: writeActionPermissions.printFulfillment,
      run: () => updatePrintJobStatusRoute({ response, workspace, printJobId, body }),
    },
    dispatch: {
      permission: writeActionPermissions.printFulfillment,
      run: () => dispatchPrintJobRoute({ response, workspace, printJobId, body }),
    },
    "driver-status": {
      permission: writeActionPermissions.printJobDriverCallback,
      run: () =>
        recordPrintJobDriverStatusRoute({
          response,
          workspace,
          printJobId,
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-PRINT-DRIVER-A"),
        }),
    },
    "poll-status": {
      permission: writeActionPermissions.printJobDriverCallback,
      run: () =>
        pollPrintJobDriverStatusRoute({
          response,
          workspace,
          printJobId,
          body,
          operatorId: getPermissionOperatorId(permissionContext, authContext, "U-PRINT-DRIVER-A"),
        }),
    },
    retry: {
      permission: writeActionPermissions.printFulfillment,
      run: () => retryPrintJobRoute({ response, workspace, printJobId, body }),
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  await route.run();
  return true;
}
