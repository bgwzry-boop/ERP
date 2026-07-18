import assert from "node:assert/strict";
import { handleRawMaterialWriteRoutes } from "../server/routes/rawMaterialWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-REQUESTED" },
  permissionContext: { actionPermissions: [] },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: {
    reviewRawMaterialInbound: "raw_material.inbound.review",
    printRawMaterialInboundLabels: "raw_material.label.print",
    confirmRawMaterialInboundAttachment: "raw_material.label.attach_confirm",
    issueRawMaterialToMachine: "raw_material.issue.create",
    confirmRawMaterialConsumption: "raw_material.consumption.confirm",
    returnRawMaterialLeftover: "raw_material.leftover.return",
    reviewRawMaterialLeftover: "raw_material.leftover.review",
    generateRawMaterialCostDraft: "raw_material.cost.allocate",
    confirmRawMaterialCostDraft: "raw_material.cost.confirm",
    calibrateRawMaterialLoss: "raw_material.cost.calibrate",
    generateRawMaterialMarginSnapshot: "raw_material.margin.snapshot",
    reviewRawMaterialMarginSnapshot: "raw_material.margin.review",
    createRawMaterialInboundException: "raw_material.exception.create",
    createRawMaterialSupplierStatementReview: "raw_material.inbound.review",
    confirmRawMaterialSupplierStatementReview: "raw_material.inbound.review",
    confirmRawMaterialSupplierStatement: "raw_material.inbound.review",
    generateRawMaterialSupplierPayableDraft: "raw_material.supplier_payable.create",
    confirmRawMaterialSupplierPayment: "raw_material.supplier_payment.confirm",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  sendJson(response, statusCode, payload) {
    calls.push({ kind: "json", response, statusCode, payload });
  },
  sendBusinessError(response, statusCode, code, message, details) {
    calls.push({ kind: "businessError", response, statusCode, code, message, details });
  },
};
dependencies.rawMaterialCommandService = {
  recognizeDeliveryNote: createCommand("recognizeDeliveryNote"),
  recordInboundAction: createCommand("inbound"),
  createSupplierStatementReviewDraft: createCommand("createReview"),
  confirmSupplierStatementReview: createCommand("confirmReview"),
  confirmSupplierStatement: createCommand("confirmStatement"),
  generateSupplierPayableDraft: createCommand("generatePayable"),
  confirmSupplierPayment: createCommand("confirmPayment"),
};

await expectSupplierAction(
  "/api/raw-material-inbounds/recognize-delivery-note",
  "raw_material.inbound.review",
  "recognizeDeliveryNote",
  undefined,
  "U-OFFICE-A",
);

for (const [action, permission] of [
  ["review", "raw_material.inbound.review"],
  ["print-labels", "raw_material.label.print"],
  ["void-label", "raw_material.label.print"],
  ["reprint-label", "raw_material.label.print"],
  ["attach-confirm", "raw_material.label.attach_confirm"],
  ["issue-to-machine", "raw_material.issue.create"],
  ["confirm-consumption", "raw_material.consumption.confirm"],
  ["return-leftover", "raw_material.leftover.return"],
  ["review-leftover", "raw_material.leftover.review"],
  ["generate-cost-draft", "raw_material.cost.allocate"],
  ["confirm-cost-draft", "raw_material.cost.confirm"],
  ["calibrate-loss", "raw_material.cost.calibrate"],
  ["generate-margin-snapshot", "raw_material.margin.snapshot"],
  ["review-margin-snapshot", "raw_material.margin.review"],
  ["exception", "raw_material.exception.create"],
  ["issue_to_machine", "raw_material.issue.create"],
]) {
  await expectInboundAction(action, permission);
}

await expectSupplierAction("/api/raw-material-supplier-statement-reviews", "raw_material.inbound.review", "createReview", undefined, "U-OFFICE-A");
await expectSupplierAction("/api/raw-material-supplier-statement-reviews/RSR-1/confirm-review", "raw_material.inbound.review", "confirmReview", "RSR-1", "U-OFFICE-A");
await expectSupplierAction("/api/raw-material-supplier-statement-reviews/RSR-1/confirm-statement", "raw_material.inbound.review", "confirmStatement", "RSR-1", "U-OFFICE-A");
await expectSupplierAction("/api/raw-material-supplier-statement-reviews/RSR-1/generate-payable", "raw_material.supplier_payable.create", "generatePayable", "RSR-1", "U-FINANCE-A");
await expectSupplierAction("/api/raw-material-supplier-statement-reviews/RSR-1/confirm-payment", "raw_material.supplier_payment.confirm", "confirmPayment", "RSR-1", "U-FINANCE-A");

calls.length = 0;
assert.equal(await handleRawMaterialWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/raw-material-inbounds/RMI-1/unknown") }), true);
assert.deepEqual(calls, [{ kind: "notFound", response: dependencies.response, code: "RAW_MATERIAL_INBOUND_ACTION_NOT_FOUND" }]);
calls.length = 0;
assert.equal(
  await handleRawMaterialWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/raw-material-inbounds/RMI-1/review"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
calls.length = 0;
assert.equal(
  await handleRawMaterialWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/raw-material-inbounds/RMI-1/review"),
    rawMaterialCommandService: {
      ...dependencies.rawMaterialCommandService,
      async recordInboundAction(input) {
        calls.push({ kind: "inboundError", ...input });
        return { error: true, statusCode: 409, code: "CONFLICT", message: "conflict", details: { retry: false } };
      },
    },
  }),
  true,
);
assert.deepEqual(calls.at(-1), {
  kind: "businessError",
  response: dependencies.response,
  statusCode: 409,
  code: "CONFLICT",
  message: "conflict",
  details: { retry: false },
});
assert.equal(await handleRawMaterialWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/raw-material-inbounds/RMI-1/review") }), false);
assert.equal(await handleRawMaterialWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/raw-material-supplier-statement-reviews/RSR-1") }), false);

console.log("raw-material write routes checks passed");

async function expectInboundAction(action, permission) {
  calls.length = 0;
  assert.equal(await handleRawMaterialWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test/api/raw-material-inbounds/RMI-1/${action}`) }), true);
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission },
    { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "U-OFFICE-A" },
    {
      kind: "inbound",
      workspace: dependencies.workspace,
      inboundId: "RMI-1",
      actionSlug: action,
      body: dependencies.body,
      operatorId: "U-RESOLVED",
    },
    {
      kind: "json",
      response: dependencies.response,
      statusCode: 200,
      payload: { result: "inbound" },
    },
  ]);
}

async function expectSupplierAction(pathname, permission, kind, reviewId, fallback) {
  calls.length = 0;
  assert.equal(await handleRawMaterialWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.shift(), { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission });
  assert.deepEqual(calls.shift(), { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback });
  assert.deepEqual(calls, [
    {
      kind,
      workspace: dependencies.workspace,
      body: dependencies.body,
      ...(reviewId ? { reviewId } : {}),
      operatorId: "U-RESOLVED",
    },
    {
      kind: "json",
      response: dependencies.response,
      statusCode: 200,
      payload: { result: kind },
    },
  ]);
}

function createCommand(kind) {
  return async (input) => {
    calls.push({ kind, ...input });
    return { result: kind };
  };
}
