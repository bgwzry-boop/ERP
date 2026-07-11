export async function handleRawMaterialWriteRoutes({
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
  sendNotFound,
  rawMaterialInboundActionRoute,
  createRawMaterialSupplierStatementReviewDraftRoute,
  confirmRawMaterialSupplierStatementReviewRoute,
  confirmRawMaterialSupplierStatementRoute,
  generateRawMaterialSupplierPayableDraftRoute,
  confirmRawMaterialSupplierPaymentRoute,
}) {
  if (method !== "POST") return false;

  const inboundActionMatch = url.pathname.match(/^\/api\/raw-material-inbounds\/([^/]+)\/([^/]+)$/);
  if (inboundActionMatch) {
    const inboundId = decodeURIComponent(inboundActionMatch[1]);
    const actionSlug = decodeURIComponent(inboundActionMatch[2]);
    const permission = getRawMaterialInboundActionPermission(actionSlug, writeActionPermissions);
    if (!permission) {
      sendNotFound(response, "RAW_MATERIAL_INBOUND_ACTION_NOT_FOUND");
      return true;
    }
    if (!requireActionPermission(response, permissionContext, permission)) return true;
    await rawMaterialInboundActionRoute({
      response,
      workspace,
      inboundId,
      actionSlug,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  if (url.pathname === "/api/raw-material-supplier-statement-reviews") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.createRawMaterialSupplierStatementReview)) return true;
    await createRawMaterialSupplierStatementReviewDraftRoute({
      response,
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    return true;
  }

  const supplierActionMatch = url.pathname.match(
    /^\/api\/raw-material-supplier-statement-reviews\/([^/]+)\/(confirm-review|confirm-statement|generate-payable|confirm-payment)$/,
  );
  if (!supplierActionMatch) return false;

  const reviewId = decodeURIComponent(supplierActionMatch[1]);
  const action = supplierActionMatch[2];
  const routes = {
    "confirm-review": {
      permission: writeActionPermissions.confirmRawMaterialSupplierStatementReview,
      fallbackOperatorId: "U-OFFICE-A",
      run: confirmRawMaterialSupplierStatementReviewRoute,
    },
    "confirm-statement": {
      permission: writeActionPermissions.confirmRawMaterialSupplierStatement,
      fallbackOperatorId: "U-OFFICE-A",
      run: confirmRawMaterialSupplierStatementRoute,
    },
    "generate-payable": {
      permission: writeActionPermissions.generateRawMaterialSupplierPayableDraft,
      fallbackOperatorId: "U-FINANCE-A",
      run: generateRawMaterialSupplierPayableDraftRoute,
    },
    "confirm-payment": {
      permission: writeActionPermissions.confirmRawMaterialSupplierPayment,
      fallbackOperatorId: "U-FINANCE-A",
      run: confirmRawMaterialSupplierPaymentRoute,
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  await route.run({
    response,
    workspace,
    reviewId,
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, route.fallbackOperatorId),
  });
  return true;
}

function getRawMaterialInboundActionPermission(actionSlug, writeActionPermissions) {
  const action = String(actionSlug ?? "").trim();
  const permissions = {
    review: writeActionPermissions.reviewRawMaterialInbound,
    "print-labels": writeActionPermissions.printRawMaterialInboundLabels,
    print_labels: writeActionPermissions.printRawMaterialInboundLabels,
    "attach-confirm": writeActionPermissions.confirmRawMaterialInboundAttachment,
    attach_confirm: writeActionPermissions.confirmRawMaterialInboundAttachment,
    "issue-to-machine": writeActionPermissions.issueRawMaterialToMachine,
    issue_to_machine: writeActionPermissions.issueRawMaterialToMachine,
    "confirm-consumption": writeActionPermissions.confirmRawMaterialConsumption,
    confirm_consumption: writeActionPermissions.confirmRawMaterialConsumption,
    "return-leftover": writeActionPermissions.returnRawMaterialLeftover,
    return_leftover: writeActionPermissions.returnRawMaterialLeftover,
    "review-leftover": writeActionPermissions.reviewRawMaterialLeftover,
    review_leftover: writeActionPermissions.reviewRawMaterialLeftover,
    "generate-cost-draft": writeActionPermissions.generateRawMaterialCostDraft,
    generate_cost_draft: writeActionPermissions.generateRawMaterialCostDraft,
    "confirm-cost-draft": writeActionPermissions.confirmRawMaterialCostDraft,
    confirm_cost_draft: writeActionPermissions.confirmRawMaterialCostDraft,
    "calibrate-loss": writeActionPermissions.calibrateRawMaterialLoss,
    calibrate_loss: writeActionPermissions.calibrateRawMaterialLoss,
    "generate-margin-snapshot": writeActionPermissions.generateRawMaterialMarginSnapshot,
    generate_margin_snapshot: writeActionPermissions.generateRawMaterialMarginSnapshot,
    "review-margin-snapshot": writeActionPermissions.reviewRawMaterialMarginSnapshot,
    review_margin_snapshot: writeActionPermissions.reviewRawMaterialMarginSnapshot,
    exception: writeActionPermissions.createRawMaterialInboundException,
  };
  return permissions[action] ?? "";
}
