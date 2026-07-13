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
  downloadMasterDataImportFailedRowsRoute,
}) {
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
  };
  const listRoute = listRoutes[url.pathname];
  if (listRoute) {
    if (!requireActionPermission(response, permissionContext, listRoute.permission)) return true;
    const body = paginate(await listRoute.list(), url.searchParams);
    if (url.pathname === "/api/master-data/employee-account-reviews") {
      body.readiness = buildRuntimeEmployeeAccountReadiness({ users: workspace.users });
      body.assignmentOptions = buildEmployeeAssignmentOptions(workspace);
    }
    sendJson(response, 200, body);
    return true;
  }

  const failedRowsMatch = url.pathname.match(/^\/api\/master-data\/import-executions\/([^/]+)\/failed-rows$/);
  if (!failedRowsMatch) return false;

  if (!requireActionPermission(response, permissionContext, writeActionPermissions.createMasterDataImportConfirmationPlan)) return true;
  await downloadMasterDataImportFailedRowsRoute({
    response,
    workspace,
    executionId: decodeURIComponent(failedRowsMatch[1]),
  });
  return true;
}
