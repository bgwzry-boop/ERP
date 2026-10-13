export async function handleMasterDataReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  writeActionPermissions,
  requireActionPermission,
  sendJson,
  paginate,
  listMasterDataEmployeeAccountReviews,
  buildRuntimeEmployeeAccountReadiness,
  buildEmployeeAssignmentOptions,
  listMasterDataMachines,
  masterDataImportCommandService,
  masterDataSubaccountCommandService,
  rawMaterialSupplierColorMappingService,
  phoneIdentityCommandService,
  sendNotFound,
  sendBusinessError,
  sendFile,
}) {
  if (url.pathname === "/api/master-data/permission-catalog") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.manageSubaccounts)) return true;
    sendJson(response, 200, masterDataSubaccountCommandService.getPermissionCatalog());
    return true;
  }

  if (url.pathname === "/api/master-data/raw-material-supplier-colors") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.manageRawMaterialSupplierColors)) return true;
    sendJson(response, 200, {
      items: rawMaterialSupplierColorMappingService.listMappings(workspace, {
        supplierName: url.searchParams.get("supplierName"),
        supplierSourceId: url.searchParams.get("supplierSourceId"),
        keyword: url.searchParams.get("keyword"),
      }),
      options: rawMaterialSupplierColorMappingService.listOptions(workspace),
    });
    return true;
  }

  const listRoutes = {
    "/api/master-data/import-confirmation-plans": {
      permission: writeActionPermissions.createMasterDataImportConfirmationPlan,
      list: () =>
        workspace.masterDataImportReviewRepository.listConfirmationPlans({
          workspace,
          filters: {
            draftId: url.searchParams.get("draftId"),
            planId: url.searchParams.get("planId"),
            status: url.searchParams.get("status"),
          },
        }),
    },
    "/api/master-data/import-review-drafts": {
      permission: writeActionPermissions.createMasterDataImportConfirmationPlan,
      list: () =>
        workspace.masterDataImportReviewRepository.listReviewDrafts({
          workspace,
          filters: {
            draftId: url.searchParams.get("draftId"),
            status: url.searchParams.get("status"),
            sourceExecutionId: url.searchParams.get("sourceExecutionId"),
          },
        }),
    },
    "/api/master-data/import-executions": {
      permission: writeActionPermissions.executeMasterDataImport,
      list: () =>
        workspace.masterDataImportReviewRepository.listImportExecutions({
          workspace,
          filters: {
            draftId: url.searchParams.get("draftId"),
            planId: url.searchParams.get("planId"),
            executionId: url.searchParams.get("executionId"),
            status: url.searchParams.get("status"),
          },
        }),
    },
    "/api/master-data/employee-account-reviews": {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      list: () =>
        listMasterDataEmployeeAccountReviews(workspace, {
          status: url.searchParams.get("status"),
          employeeId: url.searchParams.get("employeeId"),
          keyword: url.searchParams.get("keyword"),
        }),
    },
    "/api/master-data/subaccounts": {
      permission: writeActionPermissions.manageSubaccounts,
      list: () => masterDataSubaccountCommandService.listSubaccounts(workspace, {
        status: url.searchParams.get("status"),
        keyword: url.searchParams.get("keyword"),
      }),
    },
    "/api/master-data/machines": {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      list: () =>
        listMasterDataMachines(workspace, {
          keyword: url.searchParams.get("keyword"),
          status: url.searchParams.get("status"),
          workshop: url.searchParams.get("workshop"),
        }),
    },
    "/api/master-data/personnel/registration-reviews": {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      list: () =>
        phoneIdentityCommandService.listRegistrationReviews({
          workspace,
          filters: {
            status: url.searchParams.get("status"),
            keyword: url.searchParams.get("keyword"),
          },
        }),
    },
  };
  const listRoute = listRoutes[url.pathname];
  if (listRoute) {
    if (!requireActionPermission(response, permissionContext, listRoute.permission)) return true;
    const body = paginate(await listRoute.list(), url.searchParams);
    if (url.pathname === "/api/master-data/employee-account-reviews") {
      body.readiness = buildRuntimeEmployeeAccountReadiness({ users: workspace.users, machines: workspace.machines });
      body.assignmentOptions = buildEmployeeAssignmentOptions(workspace);
      body.machineRecords = listMasterDataMachines(workspace);
    }
    sendJson(response, 200, body);
    return true;
  }

  const failedRowsMatch = url.pathname.match(/^\/api\/master-data\/import-executions\/([^/]+)\/failed-rows$/);
  if (!failedRowsMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.createMasterDataImportConfirmationPlan)) return true;
  const result = await masterDataImportCommandService.getFailedRowsDownload({
    workspace,
    executionId: decodeURIComponent(failedRowsMatch[1]),
  });
  if (result.notFound) sendNotFound(response, result.code);
  else if (result.error) sendBusinessError(response, result.statusCode, result.code, result.message);
  else sendFile(response, 200, result.file.body, result.file.options);
  return true;
}
