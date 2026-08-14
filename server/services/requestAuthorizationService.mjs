import { writeActionPermissions } from "../writeActionPermissions.mjs";

const attachmentCreatePermissions = Object.freeze({
  inventoryCorrectionEvidence: "attachment.inventory_correction.create",
  finishedGoodsPhoto: "attachment.finished_goods_photo.create",
  deliveryEvidence: "attachment.delivery_evidence.create",
  maintenanceEvidence: "attachment.maintenance.create",
});

export function createRequestAuthorizationService({
  sendJson,
  actionPermissions = writeActionPermissions,
} = {}) {
  if (typeof sendJson !== "function") {
    throw new TypeError("createRequestAuthorizationService requires sendJson.");
  }

  function requireActionPermission(response, permissionContext, permissionKey) {
    const requiredPermission = String(permissionKey ?? "").trim();
    if (requiredPermission && permissionContext?.actionPermissions?.includes(requiredPermission)) return true;
    sendJson(response, 403, {
      code: "PERMISSION_DENIED",
      message: `Missing action permission: ${requiredPermission}`,
      requiredPermission,
    });
    return false;
  }

  function requireAnyActionPermission(response, permissionContext, permissionKeys = []) {
    const keys = [...new Set(permissionKeys.map((permissionKey) => String(permissionKey ?? "").trim()).filter(Boolean))];
    if (keys.some((permissionKey) => permissionContext?.actionPermissions?.includes(permissionKey))) return true;
    sendJson(response, 403, {
      code: "PERMISSION_DENIED",
      message: `Missing one of action permissions: ${keys.join(", ")}`,
      requiredPermission: keys.join(" or "),
    });
    return false;
  }

  function requireAttachmentCreatePermission(response, permissionContext, body = {}) {
    const ownerType = String(body.ownerType ?? "").trim();
    const purpose = String(body.purpose ?? "").trim();
    const generalPermission = actionPermissions.createAttachment;

    if (ownerType === "inventory_correction" && purpose === "inventory_correction_evidence") {
      return requireAnyActionPermission(response, permissionContext, [
        attachmentCreatePermissions.inventoryCorrectionEvidence,
        generalPermission,
      ]);
    }
    if (ownerType === "production_task" && purpose === "finished_goods_photo") {
      return requireAnyActionPermission(response, permissionContext, [
        attachmentCreatePermissions.finishedGoodsPhoto,
        generalPermission,
      ]);
    }
    if (ownerType === "fulfillment" && ["delivery_watermark_photo", "signature_photo"].includes(purpose)) {
      return requireAnyActionPermission(response, permissionContext, [
        attachmentCreatePermissions.deliveryEvidence,
        generalPermission,
      ]);
    }
    if (ownerType === "maintenance_task" && purpose === "maintenance_evidence") {
      return requireAnyActionPermission(response, permissionContext, [
        attachmentCreatePermissions.maintenanceEvidence,
        generalPermission,
      ]);
    }
    if (ownerType === "business_decision_evidence_draft" && purpose === "business_decision_evidence") {
      return requireActionPermission(response, permissionContext, actionPermissions.recordDelegatedBusinessDecision);
    }
    if (ownerType === "payroll_run" && purpose === "payroll_adjustment_evidence") {
      return requireAnyActionPermission(response, permissionContext, [
        actionPermissions.reviewPayroll,
        generalPermission,
      ]);
    }
    if (ownerType === "raw_material_inbound_capture" && purpose === "raw_material_delivery_note") {
      return requireAnyActionPermission(response, permissionContext, [
        actionPermissions.reviewRawMaterialInbound,
        generalPermission,
      ]);
    }
    return requireActionPermission(response, permissionContext, generalPermission);
  }

  function getPermissionOperatorId(permissionContext, authContext, fallbackUserId = "U-OFFICE-A") {
    return (
      [permissionContext?.user?.userId, authContext?.userId, fallbackUserId]
        .map((userId) => String(userId ?? "").trim())
        .find(Boolean) || "U-OFFICE-A"
    );
  }

  return Object.freeze({
    getPermissionOperatorId,
    requireActionPermission,
    requireAnyActionPermission,
    requireAttachmentCreatePermission,
  });
}
