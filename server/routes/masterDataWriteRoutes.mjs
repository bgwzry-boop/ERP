export async function handleMasterDataWriteRoutes({
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
  createMasterDataImportConfirmationPlanRoute,
  createMasterDataImportExecutionRoute,
  createMasterDataFailedRowsCorrectionDraftRoute,
  enableMasterDataEmployeeAccountRoute,
  updateMasterDataEmployeeAssignmentRoute,
  issueMasterDataEmployeeAccountPasswordRoute,
  revokeMasterDataEmployeeAccountPasswordRoute,
}) {
  if (method !== "POST") return false;

  const directRoutes = {
    "/api/master-data/import-confirmation-plans": {
      permission: writeActionPermissions.createMasterDataImportConfirmationPlan,
      fallbackOperatorId: "U-OFFICE-A",
      run: createMasterDataImportConfirmationPlanRoute,
    },
    "/api/master-data/import-executions": {
      permission: writeActionPermissions.executeMasterDataImport,
      fallbackOperatorId: "U-MANAGER-A",
      run: createMasterDataImportExecutionRoute,
    },
  };
  const directRoute = directRoutes[url.pathname];
  if (directRoute) {
    if (!requireActionPermission(response, permissionContext, directRoute.permission)) return true;
    await directRoute.run({
      response,
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, directRoute.fallbackOperatorId),
    });
    return true;
  }

  const failedRowsMatch = url.pathname.match(/^\/api\/master-data\/import-executions\/([^/]+)\/failed-rows\/correction-draft$/);
  if (failedRowsMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.createMasterDataImportConfirmationPlan)) return true;
    await createMasterDataFailedRowsCorrectionDraftRoute({
      response,
      workspace,
      executionId: decodeURIComponent(failedRowsMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const employeeActionMatch = url.pathname.match(/^\/api\/master-data\/employee-account-reviews\/([^/]+)\/(enable|assignment|password(?:\/revoke)?)$/);
  if (!employeeActionMatch) return false;

  const employeeId = decodeURIComponent(employeeActionMatch[1]);
  const action = employeeActionMatch[2];
  const routes = {
    enable: {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      run: enableMasterDataEmployeeAccountRoute,
    },
    assignment: {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      run: updateMasterDataEmployeeAssignmentRoute,
    },
    password: {
      permission: writeActionPermissions.issueMasterDataEmployeeAccountPassword,
      run: issueMasterDataEmployeeAccountPasswordRoute,
    },
    "password/revoke": {
      permission: writeActionPermissions.issueMasterDataEmployeeAccountPassword,
      run: revokeMasterDataEmployeeAccountPasswordRoute,
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  await route.run({
    response,
    workspace,
    employeeId,
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A"),
  });
  return true;
}
