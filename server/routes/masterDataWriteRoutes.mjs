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
  masterDataImportCommandService,
  masterDataEmployeeAccountCommandService,
  masterDataMachineCommandService,
  rawMaterialSupplierColorMappingService,
  phoneIdentityCommandService,
  sendCommandResponse,
}) {
  if (!["POST", "PATCH"].includes(method)) return false;

  if (method === "POST" && url.pathname === "/api/master-data/machines") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewMasterDataEmployeeAccount)) return true;
    const result = await masterDataMachineCommandService.createMachine({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A"),
    });
    sendCommandResponse(response, result, EMPLOYEE_RESPONSE_OPTIONS);
    return true;
  }

  const machineMatch = method === "PATCH"
    ? url.pathname.match(/^\/api\/master-data\/machines\/([^/]+)$/)
    : null;
  if (machineMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewMasterDataEmployeeAccount)) return true;
    const result = await masterDataMachineCommandService.updateMachine({
      workspace,
      machineId: decodeURIComponent(machineMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A"),
    });
    sendCommandResponse(response, result, EMPLOYEE_RESPONSE_OPTIONS);
    return true;
  }

  if (method !== "POST") return false;

  if (url.pathname === "/api/master-data/raw-material-supplier-colors") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.manageRawMaterialSupplierColors)) return true;
    const result = await rawMaterialSupplierColorMappingService.saveMapping({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A"),
    });
    sendCommandResponse(response, result, EMPLOYEE_RESPONSE_OPTIONS);
    return true;
  }

  const directRoutes = {
    "/api/master-data/import-confirmation-plans": {
      permission: writeActionPermissions.createMasterDataImportConfirmationPlan,
      fallbackOperatorId: "U-OFFICE-A",
      run: (input) => masterDataImportCommandService.createConfirmationPlan(input),
      responseOptions: IMPORT_RESPONSE_OPTIONS,
    },
    "/api/master-data/import-executions": {
      permission: writeActionPermissions.executeMasterDataImport,
      fallbackOperatorId: "U-MANAGER-A",
      run: (input) => masterDataImportCommandService.createImportExecution(input),
      responseOptions: IMPORT_RESPONSE_OPTIONS,
    },
    "/api/master-data/employee-account-reviews/batch-enable": {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      fallbackOperatorId: "U-MANAGER-A",
      run: (input) => masterDataEmployeeAccountCommandService.enableEmployeeAccounts(input),
      responseOptions: EMPLOYEE_RESPONSE_OPTIONS,
    },
  };
  const directRoute = directRoutes[url.pathname];
  if (directRoute) {
    if (!requireActionPermission(response, permissionContext, directRoute.permission)) return true;
    const result = await directRoute.run({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, directRoute.fallbackOperatorId),
    });
    sendCommandResponse(response, result, directRoute.responseOptions);
    return true;
  }

  const registrationAssignmentMatch = url.pathname.match(
    /^\/api\/master-data\/personnel\/registration-reviews\/([^/]+)\/assign$/,
  );
  if (registrationAssignmentMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewMasterDataEmployeeAccount)) return true;
    const result = await phoneIdentityCommandService.assignRegistration({
      workspace,
      userId: decodeURIComponent(registrationAssignmentMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A"),
    });
    sendCommandResponse(response, result, EMPLOYEE_RESPONSE_OPTIONS);
    return true;
  }

  const failedRowsMatch = url.pathname.match(/^\/api\/master-data\/import-executions\/([^/]+)\/failed-rows\/correction-draft$/);
  if (failedRowsMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.createMasterDataImportConfirmationPlan)) return true;
    const result = await masterDataImportCommandService.createFailedRowsCorrectionDraft({
      workspace,
      executionId: decodeURIComponent(failedRowsMatch[1]),
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    sendCommandResponse(response, result, IMPORT_RESPONSE_OPTIONS);
    return true;
  }

  const employeeActionMatch = url.pathname.match(/^\/api\/master-data\/employee-account-reviews\/([^/]+)\/(enable|assignment|profile|merge|depart|identity-confirmation|password(?:\/revoke)?)$/);
  if (!employeeActionMatch) return false;

  const employeeId = decodeURIComponent(employeeActionMatch[1]);
  const action = employeeActionMatch[2];
  const routes = {
    enable: {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      run: (input) => masterDataEmployeeAccountCommandService.enableEmployeeAccount(input),
    },
    assignment: {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      run: (input) => masterDataEmployeeAccountCommandService.updateEmployeeAssignment(input),
    },
    profile: {
      permission: writeActionPermissions.manageEmployeeProfile,
      run: (input) => masterDataEmployeeAccountCommandService.updateEmployeeProfile(input),
    },
    merge: {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      run: (input) => masterDataEmployeeAccountCommandService.mergeEmployeeIdentity(input),
    },
    depart: {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      run: (input) => masterDataEmployeeAccountCommandService.departEmployeeAccount(input),
    },
    "identity-confirmation": {
      permission: writeActionPermissions.reviewMasterDataEmployeeAccount,
      run: (input) => masterDataEmployeeAccountCommandService.confirmEmployeeIdentity(input),
    },
    password: {
      permission: writeActionPermissions.issueMasterDataEmployeeAccountPassword,
      run: (input) => masterDataEmployeeAccountCommandService.issueEmployeeTemporaryPassword(input),
    },
    "password/revoke": {
      permission: writeActionPermissions.issueMasterDataEmployeeAccountPassword,
      run: (input) => masterDataEmployeeAccountCommandService.revokeEmployeePassword(input),
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  const result = await route.run({
    workspace,
    employeeId,
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, "U-MANAGER-A"),
  });
  sendCommandResponse(response, result, EMPLOYEE_RESPONSE_OPTIONS);
  return true;
}

const IMPORT_RESPONSE_OPTIONS = Object.freeze({ useResultStatusCode: true });
const EMPLOYEE_RESPONSE_OPTIONS = Object.freeze({
  includeErrorDetails: true,
  useResultStatusCode: true,
});
