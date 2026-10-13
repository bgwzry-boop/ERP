import assert from "node:assert/strict";
import { createRequestAuthorizationService } from "../server/services/requestAuthorizationService.mjs";
import { writeActionPermissions } from "../server/writeActionPermissions.mjs";

assert.equal(Object.isFrozen(writeActionPermissions), true);
assert.equal(writeActionPermissions.confirmOrderDraft, "order.confirm");
assert.equal(writeActionPermissions.createAttachment, "attachment.create");
assert.equal(writeActionPermissions.reportProduction, "production.report.complete");
assert.equal(writeActionPermissions.confirmRawMaterialSupplierPayment, "raw_material.supplier_payment.confirm");
assert.equal(writeActionPermissions.handleTodo, "todo.handle");

const responses = [];
const response = {};
const authorization = createRequestAuthorizationService({
  sendJson(target, statusCode, payload) {
    responses.push({ target, statusCode, payload });
  },
});

assert.equal(
  authorization.requireActionPermission(response, { actionPermissions: ["order.confirm"] }, "order.confirm"),
  true,
);
assert.equal(responses.length, 0);

assert.equal(authorization.requireActionPermission(response, { actionPermissions: [] }, "order.confirm"), false);
assert.deepEqual(responses.pop(), {
  target: response,
  statusCode: 403,
  payload: {
    code: "PERMISSION_DENIED",
    message: "Missing action permission: order.confirm",
    requiredPermission: "order.confirm",
  },
});

assert.equal(
  authorization.requireAnyActionPermission(
    response,
    { actionPermissions: ["permission.second"] },
    [" permission.first ", "permission.second", "permission.second", ""],
  ),
  true,
);
assert.equal(responses.length, 0);
assert.equal(
  authorization.requireAnyActionPermission(response, { actionPermissions: [] }, ["permission.first", "permission.second"]),
  false,
);
assert.deepEqual(responses.pop()?.payload, {
  code: "PERMISSION_DENIED",
  message: "Missing one of action permissions: permission.first, permission.second",
  requiredPermission: "permission.first or permission.second",
});

const attachmentCases = [
  [
    { ownerType: "inventory_correction", purpose: "inventory_correction_evidence" },
    "attachment.inventory_correction.create",
  ],
  [{ ownerType: "production_task", purpose: "finished_goods_photo" }, "attachment.finished_goods_photo.create"],
  [{ ownerType: "fulfillment", purpose: "delivery_watermark_photo" }, "attachment.delivery_evidence.create"],
  [{ ownerType: "fulfillment", purpose: "signature_photo" }, "attachment.delivery_evidence.create"],
  [{ ownerType: "maintenance_task", purpose: "maintenance_evidence" }, "attachment.maintenance.create"],
  [{ ownerType: "payroll_run", purpose: "payroll_adjustment_evidence" }, writeActionPermissions.reviewPayroll],
  [{ ownerType: "raw_material_inbound_capture", purpose: "raw_material_delivery_note" }, writeActionPermissions.reviewRawMaterialInbound],
];
for (const [body, permission] of attachmentCases) {
  assert.equal(
    authorization.requireAttachmentCreatePermission(response, { actionPermissions: [permission] }, body),
    true,
  );
  assert.equal(
    authorization.requireAttachmentCreatePermission(
      response,
      { actionPermissions: [writeActionPermissions.createAttachment] },
      body,
    ),
    true,
  );
}
assert.equal(responses.length, 0);

assert.equal(
  authorization.requireAttachmentCreatePermission(
    response,
    { actionPermissions: ["attachment.inventory_correction.create"] },
    { ownerType: "customer", purpose: "statement_attachment" },
  ),
  false,
);
assert.equal(responses.pop()?.payload.requiredPermission, writeActionPermissions.createAttachment);
assert.equal(
  authorization.requireAttachmentCreatePermission(
    response,
    { actionPermissions: [] },
    { ownerType: "production_task", purpose: "finished_goods_photo" },
  ),
  false,
);
assert.deepEqual(responses.pop()?.payload, {
  code: "PERMISSION_DENIED",
  message: "Missing one of action permissions: attachment.finished_goods_photo.create, attachment.create",
  requiredPermission: "attachment.finished_goods_photo.create or attachment.create",
});

assert.equal(
  authorization.getPermissionOperatorId({ user: { userId: " U-PERMISSION " } }, { userId: "U-AUTH" }),
  "U-PERMISSION",
);
assert.equal(
  authorization.getPermissionOperatorId({ user: { userId: "  " } }, { userId: " U-AUTH " }),
  "U-AUTH",
);
assert.equal(authorization.getPermissionOperatorId({}, {}, " U-DRIVER-A "), "U-DRIVER-A");
assert.equal(authorization.getPermissionOperatorId({}, {}, "  "), "U-OFFICE-A");

assert.throws(
  () => createRequestAuthorizationService(),
  /createRequestAuthorizationService requires sendJson/,
);
assert.equal(Object.isFrozen(authorization), true);

console.log(
  "request authorization service checks passed: frozen permission catalog, fail-closed checks, attachment scopes, and operator identity priority are locked",
);
