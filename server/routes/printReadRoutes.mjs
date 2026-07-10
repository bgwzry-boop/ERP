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
  getPrintDriverConfigurationResponse,
  getPrintDriverSpoolDiagnosticsResponse,
  getPrintDriverCupsDiagnosticsResponse,
  getPrintDriverV1ReadinessResponse,
  listPrinterDeviceFieldTestsRoute,
}) {
  if (url.pathname === "/api/print-driver/config") {
    sendJson(response, 200, getPrintDriverConfigurationResponse(workspace));
    return true;
  }

  const driverRoute = {
    "/api/print-driver/spool-diagnostics": getPrintDriverSpoolDiagnosticsResponse,
    "/api/print-driver/cups-diagnostics": getPrintDriverCupsDiagnosticsResponse,
    "/api/print-driver/v1-readiness": getPrintDriverV1ReadinessResponse,
  }[url.pathname];
  if (driverRoute) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.printFulfillment)) return true;
    sendJson(
      response,
      200,
      driverRoute({
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
    await listPrinterDeviceFieldTestsRoute({
      response,
      workspace,
      printDeviceId: decodeURIComponent(deviceFieldTestsMatch[1]),
      searchParams: url.searchParams,
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
