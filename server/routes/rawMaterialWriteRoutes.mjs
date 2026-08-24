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
  sendJson,
  sendBusinessError,
  rawMaterialCommandService,
}) {
  if (method !== "POST") return false;

  if (url.pathname === "/api/raw-material-inbounds/recognize-delivery-note") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewRawMaterialInbound)) return true;
    const result = await rawMaterialCommandService.recognizeDeliveryNote({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    sendCommandResult({ response, result, sendJson, sendBusinessError });
    return true;
  }

  if (url.pathname === "/api/raw-material-inbounds/ocr-jobs") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewRawMaterialInbound)) return true;
    const result = await rawMaterialCommandService.startDeliveryNoteRecognitionJob({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    sendCommandResult({ response, result, sendJson, sendBusinessError });
    return true;
  }

  const ocrJobMatch = url.pathname.match(/^\/api\/raw-material-inbounds\/ocr-jobs\/([^/]+)\/(status|retry)$/u);
  if (ocrJobMatch) {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.reviewRawMaterialInbound)) return true;
    const jobId = decodeURIComponent(ocrJobMatch[1]);
    const operatorId = getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A");
    const result = ocrJobMatch[2] === "retry"
      ? await rawMaterialCommandService.retryDeliveryNoteRecognitionJob({ workspace, jobId, body, operatorId })
      : await rawMaterialCommandService.getDeliveryNoteRecognitionJob({ jobId, operatorId });
    sendCommandResult({ response, result, sendJson, sendBusinessError });
    return true;
  }

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
    const result = await rawMaterialCommandService.recordInboundAction({
      workspace,
      inboundId,
      actionSlug,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    sendCommandResult({ response, result, sendJson, sendBusinessError });
    return true;
  }

  if (url.pathname === "/api/raw-material-supplier-statement-reviews") {
    if (!requireActionPermission(response, permissionContext, writeActionPermissions.createRawMaterialSupplierStatementReview)) return true;
    const result = await rawMaterialCommandService.createSupplierStatementReviewDraft({
      workspace,
      body,
      operatorId: getPermissionOperatorId(permissionContext, authContext, "U-OFFICE-A"),
    });
    sendCommandResult({ response, result, sendJson, sendBusinessError });
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
      run: rawMaterialCommandService.confirmSupplierStatementReview,
    },
    "confirm-statement": {
      permission: writeActionPermissions.confirmRawMaterialSupplierStatement,
      fallbackOperatorId: "U-OFFICE-A",
      run: rawMaterialCommandService.confirmSupplierStatement,
    },
    "generate-payable": {
      permission: writeActionPermissions.generateRawMaterialSupplierPayableDraft,
      fallbackOperatorId: "U-FINANCE-A",
      run: rawMaterialCommandService.generateSupplierPayableDraft,
    },
    "confirm-payment": {
      permission: writeActionPermissions.confirmRawMaterialSupplierPayment,
      fallbackOperatorId: "U-FINANCE-A",
      run: rawMaterialCommandService.confirmSupplierPayment,
    },
  };
  const route = routes[action];
  if (!requireActionPermission(response, permissionContext, route.permission)) return true;
  const result = await route.run({
    workspace,
    reviewId,
    body,
    operatorId: getPermissionOperatorId(permissionContext, authContext, route.fallbackOperatorId),
  });
  sendCommandResult({ response, result, sendJson, sendBusinessError });
  return true;
}

function sendCommandResult({ response, result, sendJson, sendBusinessError }) {
  if (result?.error) {
    sendBusinessError(response, result.statusCode, result.code, result.message, result.details);
    return;
  }
  sendJson(response, 200, result);
}

function getRawMaterialInboundActionPermission(actionSlug, writeActionPermissions) {
  const action = String(actionSlug ?? "").trim();
  const permissions = {
    review: writeActionPermissions.reviewRawMaterialInbound,
    "reparse-ocr": writeActionPermissions.reviewRawMaterialInbound,
    reparse_ocr: writeActionPermissions.reviewRawMaterialInbound,
    "void-draft": writeActionPermissions.reviewRawMaterialInbound,
    void_draft: writeActionPermissions.reviewRawMaterialInbound,
    "print-labels": writeActionPermissions.printRawMaterialInboundLabels,
    print_labels: writeActionPermissions.printRawMaterialInboundLabels,
    "defer-labels": writeActionPermissions.printRawMaterialInboundLabels,
    defer_labels: writeActionPermissions.printRawMaterialInboundLabels,
    "attach-confirm": writeActionPermissions.confirmRawMaterialInboundAttachment,
    attach_confirm: writeActionPermissions.confirmRawMaterialInboundAttachment,
    "void-label": writeActionPermissions.printRawMaterialInboundLabels,
    void_label: writeActionPermissions.printRawMaterialInboundLabels,
    "reprint-label": writeActionPermissions.printRawMaterialInboundLabels,
    reprint_label: writeActionPermissions.printRawMaterialInboundLabels,
    "stage-supplier-return": writeActionPermissions.returnRawMaterialLeftover,
    stage_supplier_return: writeActionPermissions.returnRawMaterialLeftover,
    "confirm-supplier-return-shipment": writeActionPermissions.reviewRawMaterialLeftover,
    confirm_supplier_return_shipment: writeActionPermissions.reviewRawMaterialLeftover,
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
