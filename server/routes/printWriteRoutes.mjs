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
  printBatchCommandService,
  printDeviceCommandService,
  printJobLifecycleService,
  sendJson,
  sendCommandRecord,
}) {
  if (method !== "POST") return false;

  const directRoutes = {
    "/api/print-batches": {
      permission: writeActionPermissions.printFulfillment,
      fallbackOperatorId: "U-OFFICE-A",
      responseMode: "json",
      run: (operatorId) =>
        printBatchCommandService.createPrintBatch({
          workspace,
          body,
          operatorId,
          operatorName: permissionContext?.user?.displayName ?? operatorId,
        }),
    },
    "/api/print-devices": {
      permission: writeActionPermissions.printFulfillment,
      fallbackOperatorId: "U-OFFICE-A",
      responseMode: "json",
      run: (operatorId) => printDeviceCommandService.upsertPrintDevice({ workspace, body, operatorId }),
    },
    "/api/print-jobs/status-poll": {
      permission: writeActionPermissions.printJobDriverCallback,
      fallbackOperatorId: "U-PRINT-DRIVER-A",
      run: (operatorId) => printJobLifecycleService.pollPrintJobs({ workspace, body, operatorId }),
    },
  };
  const directRoute = directRoutes[url.pathname];
  if (directRoute) return runRoute(directRoute);

  const deviceMatch = url.pathname.match(/^\/api\/print-devices\/([^/]+)\/(driver-mode|field-tests)$/);
  if (deviceMatch) {
    const printDeviceId = decodeURIComponent(deviceMatch[1]);
    const routes = {
      "driver-mode": {
        permission: writeActionPermissions.printFulfillment,
        fallbackOperatorId: "U-OFFICE-A",
        run: (operatorId) =>
          printDeviceCommandService.updatePrintDeviceDriverMode({ workspace, printDeviceId, body, operatorId }),
      },
      "field-tests": {
        permission: writeActionPermissions.recordPrintDeviceFieldTest,
        fallbackOperatorId: "U-OFFICE-A",
        run: (operatorId) =>
          printDeviceCommandService.recordPrinterDeviceFieldTest({ workspace, printDeviceId, body, operatorId }),
      },
    };
    return runRoute(routes[deviceMatch[2]]);
  }

  const jobMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)\/(status|dispatch|driver-status|poll-status|retry)$/);
  if (!jobMatch) return false;

  const printJobId = decodeURIComponent(jobMatch[1]);
  const officeJobRoute = (run) => ({
    permission: writeActionPermissions.printFulfillment,
    fallbackOperatorId: "U-OFFICE-A",
    options: { notFoundCode: "PRINT_JOB_NOT_FOUND" },
    run,
  });
  const driverJobRoute = (run) => ({
    permission: writeActionPermissions.printJobDriverCallback,
    fallbackOperatorId: "U-PRINT-DRIVER-A",
    options: { notFoundCode: "PRINT_JOB_NOT_FOUND" },
    run,
  });
  const routes = {
    status: officeJobRoute((operatorId) =>
      printJobLifecycleService.updatePrintJobStatus({ workspace, printJobId, body, operatorId })),
    dispatch: officeJobRoute((operatorId) =>
      printJobLifecycleService.dispatchPrintJob({ workspace, printJobId, body, operatorId })),
    "driver-status": driverJobRoute((operatorId) =>
      printJobLifecycleService.recordPrintJobDriverStatus({ workspace, printJobId, body, operatorId })),
    "poll-status": driverJobRoute((operatorId) =>
      printJobLifecycleService.pollPrintJobById({ workspace, printJobId, body, operatorId })),
    retry: officeJobRoute((operatorId) =>
      printJobLifecycleService.retryPrintJob({ workspace, printJobId, body, operatorId })),
  };
  return runRoute(routes[jobMatch[2]]);

  async function runRoute(route) {
    if (!requireActionPermission(response, permissionContext, route.permission)) return true;
    const operatorId = getPermissionOperatorId(permissionContext, authContext, route.fallbackOperatorId);
    const result = await route.run(operatorId);
    if (route.responseMode === "json") sendJson(response, 200, result);
    else sendCommandRecord(response, result, route.options);
    return true;
  }
}
