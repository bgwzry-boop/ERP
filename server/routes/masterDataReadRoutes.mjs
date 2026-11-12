import { readSalesPrices } from "../services/salesPriceService.mjs";
import { customerDeliveryAddresses, customerWithAddresses } from "../../shared/deliveryAddress.js";
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
  customerAddressCommandService,
  phoneIdentityCommandService,
  sendNotFound,
  sendBusinessError,
  sendFile,
}) {
  // 负责人 2026-11-12「销售价格」：办公室、负责人、财务都能看，只有负责人能改。
  if (url.pathname === "/api/sales-prices") {
    if (!requireActionPermission(response, permissionContext, "order.read")) return true;
    const result = await readSalesPrices({ workspace });
    if (result.error) { sendBusinessError(response, result.statusCode, result.code, result.message); return true; }
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/master-data/permission-catalog") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.manageSubaccounts)) return true;
    sendJson(response, 200, masterDataSubaccountCommandService.getPermissionCatalog());
    return true;
  }

  // 负责人 2026-11-05：开单时选客户（整单一次，必填）。
  if (url.pathname === "/api/master-data/customers" && customerAddressCommandService?.searchCustomers) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    let source = workspace;
    if (workspace.coreWorkspaceReadRepository?.loadState) {
      const state = await workspace.coreWorkspaceReadRepository.loadState();
      if (Array.isArray(state?.customers)) source = { ...workspace, customers: state.customers, customerContacts: state.customerContacts ?? [] };
    }
    const result = customerAddressCommandService.searchCustomers({ workspace: source, query: url.searchParams.get("q") ?? "", limit: url.searchParams.get("limit") ?? 20 });
    sendJson(response, 200, result.response);
    return true;
  }

  const profileMatch = url.pathname.match(/^\/api\/master-data\/customers\/([^/]+)\/profile$/);
  if (profileMatch && customerAddressCommandService) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    let source = workspace;
    if (workspace.coreWorkspaceReadRepository?.loadState) {
      const state = await workspace.coreWorkspaceReadRepository.loadState();
      if (Array.isArray(state?.customers)) source = { ...workspace, customers: state.customers, customerContacts: state.customerContacts ?? [] };
    }
    const result = customerAddressCommandService.readCustomerProfile({ workspace: source, customerId: decodeURIComponent(profileMatch[1]) });
    if (result.notFound) sendNotFound(response, result.code);
    else sendJson(response, 200, result.response);
    return true;
  }

  // 负责人 2026-11-04：开单送货时选这个客户的哪个收货地址。
  const deliveryAddressMatch = url.pathname.match(/^\/api\/master-data\/customers\/([^/]+)\/delivery-addresses$/);
  if (deliveryAddressMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.saveOrderDraft)) return true;
    const customerId = decodeURIComponent(deliveryAddressMatch[1]);
    let customers = workspace.customers ?? [];
    let addressSource = workspace;
    if (workspace.coreWorkspaceReadRepository?.loadState) {
      const state = await workspace.coreWorkspaceReadRepository.loadState();
      if (Array.isArray(state?.customers)) { customers = state.customers; addressSource = state; }
    }
    const customer = customers.find((item) => (item.id ?? item.customerId) === customerId);
    if (!customer) {
      sendNotFound(response, "CUSTOMER_NOT_FOUND");
      return true;
    }
    const addresses = customerDeliveryAddresses(customerWithAddresses(addressSource, customer));
    sendJson(response, 200, {
      customerId,
      customerName: String(customer.name ?? ""),
      addresses,
      defaultAddressId: (addresses.find((item) => item.isDefault) ?? addresses[0])?.addressId ?? "",
    });
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
