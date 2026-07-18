export async function handlePrintReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  sendJson,
  sendNotFound,
  paginate,
  findPrintJob,
  findPrintDevice,
  printDriverDiagnosticsService,
}) {
  if (url.pathname === "/api/print-driver/config") {
    sendJson(response, 200, printDriverDiagnosticsService.getConfiguration({ workspace }));
    return true;
  }

  const driverMethod = {
    "/api/print-driver/spool-diagnostics": "getSpoolDiagnostics",
    "/api/print-driver/cups-diagnostics": "getCupsDiagnostics",
    "/api/print-driver/v1-readiness": "getV1Readiness",
  }[url.pathname];
  if (driverMethod) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.printFulfillment)) return true;
    sendJson(
      response,
      200,
      printDriverDiagnosticsService[driverMethod]({
        workspace,
        operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
      }),
    );
    return true;
  }

  if (url.pathname === "/api/print-batches") {
    const items = await workspace.printBatchRepository.listPrintBatchRecords({
      workspace,
      filters: {
        status: url.searchParams.get("status"),
        todoId: url.searchParams.get("todoId"),
      },
    });
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/print-devices") {
    const items = await workspace.printDeviceRepository.listPrintDevices({
      workspace,
      filters: {
        status: url.searchParams.get("status"),
        deviceType: url.searchParams.get("deviceType"),
        documentType: url.searchParams.get("documentType"),
      },
    });
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  if (url.pathname === "/api/print-jobs") {
    const items = await workspace.printJobRepository.listPrintJobs({
      workspace,
      filters: {
        status: url.searchParams.get("status"),
        targetType: url.searchParams.get("targetType"),
        targetId: url.searchParams.get("targetId"),
        printRecordId: url.searchParams.get("printRecordId"),
        printDeviceId: url.searchParams.get("printDeviceId"),
      },
    });
    sendJson(response, 200, paginate(items, url.searchParams));
    return true;
  }

  const deviceFieldTestsMatch = url.pathname.match(/^\/api\/print-devices\/([^/]+)\/field-tests$/);
  if (deviceFieldTestsMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.recordPrintDeviceFieldTest)) return true;
    const printDeviceId = decodeURIComponent(deviceFieldTestsMatch[1]);
    const printDevice = await findPrintDevice(workspace, printDeviceId);
    if (!printDevice) {
      sendNotFound(response, "PRINT_DEVICE_NOT_FOUND");
      return true;
    }
    const items = await workspace.printerDeviceFieldTestRepository.listPrinterDeviceFieldTests({
      workspace,
      filters: {
        printDeviceId,
        printJobId: url.searchParams.get("printJobId"),
        documentType: url.searchParams.get("documentType"),
        operatorId: url.searchParams.get("operatorId"),
        limit: url.searchParams.get("pageSize"),
      },
    });
    sendJson(response, 200, {
      ...paginate(items, url.searchParams),
      printDevice,
      latestRecord: items[0] ?? null,
    });
    return true;
  }

  const printJobMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)$/);
  if (!printJobMatch) return false;

  const printJob = await findPrintJob(workspace, decodeURIComponent(printJobMatch[1]));
  if (printJob) sendJson(response, 200, { printJob });
  else sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  return true;
}
