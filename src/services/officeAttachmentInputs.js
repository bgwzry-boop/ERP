import { getAttachmentUploadPolicy } from "../../shared/attachmentUploadPolicy.js";

export function createPaymentScreenshotAttachmentInput({ statement, operatorId, remark = "", file = null }) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `payment-${statement.id}-${stamp}.png`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/png";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "statement",
    ownerId: statement.id,
    fileType,
    purpose: "payment_screenshot",
    fileName,
    contentRef: selectedFileName
      ? `p0://payment-screenshot/${statement.id}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://payment-screenshot/${statement.id}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    uploadedBy: operatorId,
    remark,
  };
}

export function createStatementCustomerConfirmationAttachmentInput({ statement, operatorId, remark = "", file = null }) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `customer-confirmation-${statement.id}-${stamp}.png`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/png";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "statement",
    ownerId: statement.id,
    fileType,
    purpose: "statement_customer_confirmation",
    fileName,
    contentRef: selectedFileName
      ? `p0://statement-customer-confirmation/${statement.id}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://statement-customer-confirmation/${statement.id}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      statementId: statement.id,
      confirmationPurpose: "customer_statement_confirmation",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createPayrollAdjustmentEvidenceAttachmentInput({ payrollRunId, employeeId, operatorId, remark = "", file = null }) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `payroll-adjustment-${employeeId}-${stamp}.pdf`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "application/pdf";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "payroll_run",
    ownerId: payrollRunId,
    fileType,
    purpose: "payroll_adjustment_evidence",
    fileName,
    contentRef: `p0://payroll-adjustment/${payrollRunId}/${employeeId}/${stamp}/${encodeURIComponent(fileName)}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: { payrollRunId, employeeId },
    uploadedBy: operatorId,
    remark,
  };
}

export function createInventoryCorrectionEvidenceAttachmentInput({ correctionDraftId, operatorId, remark = "", file = null }) {
  const ownerId = normalizeAttachmentText(correctionDraftId);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `inventory-correction-${ownerId || "draft"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "inventory_correction",
    ownerId,
    fileType,
    purpose: "inventory_correction_evidence",
    fileName,
    contentRef: selectedFileName
      ? `p0://inventory-correction/${ownerId}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://inventory-correction/${ownerId}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: { correctionDraftId: ownerId, evidencePurpose: "inventory_correction_evidence" },
    uploadedBy: operatorId,
    remark,
  };
}

export function createDeliveryEvidenceAttachmentInput({ task, fulfillmentId, operatorId, evidenceType = "watermark", remark = "", metadata = {}, file = null }) {
  const ownerId = fulfillmentId || task?.fulfillmentId || "";
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const purpose = evidenceType === "signature" ? "signature_photo" : "delivery_watermark_photo";
  const prefix = evidenceType === "signature" ? "signature" : "delivery-watermark";
  const fileName = selectedFileName || `${prefix}-${ownerId || "fulfillment"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "fulfillment",
    ownerId,
    fileType,
    purpose,
    fileName,
    contentRef: selectedFileName
      ? `p0://driver-delivery/${ownerId}/${purpose}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://driver-delivery/${ownerId}/${purpose}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: isPlainObject(metadata) ? metadata : {},
    uploadedBy: operatorId,
    remark,
  };
}

export function createFinishedGoodsPhotoAttachmentInput({ productionTaskId, orderLine, operatorId, remark = "", file = null }) {
  const ownerId = String(productionTaskId || orderLine?.productionTaskId || (orderLine?.id ? `PT-${orderLine.id}` : "")).trim();
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `finished-goods-${ownerId || orderLine?.id || "production"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "production_task",
    ownerId,
    fileType,
    purpose: "finished_goods_photo",
    fileName,
    contentRef: selectedFileName
      ? `p0://production-finished-goods/${ownerId}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://production-finished-goods/${ownerId}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      productionTaskId: ownerId,
      orderLineId: String(orderLine?.id ?? orderLine?.orderLineId ?? "").trim(),
      purpose: "finished_goods_photo",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createMaintenanceEvidenceAttachmentInput({ taskId, operatorId, remark = "", file = null }) {
  const ownerId = normalizeAttachmentText(taskId);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `maintenance-${ownerId || "task"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  return {
    ownerType: "maintenance_task",
    ownerId,
    fileType: "image",
    purpose: "maintenance_evidence",
    fileName,
    contentRef: selectedFileName
      ? `p0://maintenance/${ownerId}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://maintenance/${ownerId}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: { taskId: ownerId, evidencePurpose: "maintenance_evidence" },
    uploadedBy: operatorId,
    remark,
  };
}

export function createPrintArtworkAttachmentInput({ draftId, draftLine, operatorId, remark = "", file = null }) {
  const draftLineId = normalizeAttachmentText(draftLine?.id ?? draftLine?.draftLineId);
  const normalizedDraftId = normalizeAttachmentText(draftId);
  const ownerId = normalizedDraftId && draftLineId ? `${normalizedDraftId}:${draftLineId}` : normalizedDraftId || draftLineId;
  const selectedFileName = normalizeAttachmentText(file?.name) || `print-artwork-${draftLineId || Date.now()}.pdf`;
  const mimeType = normalizeAttachmentText(file?.type) || "application/octet-stream";
  return {
    ownerType: "order_draft_line",
    ownerId,
    fileType: inferAttachmentFileType({ mimeType, fileName: selectedFileName }),
    purpose: "print_artwork",
    fileName: selectedFileName,
    contentRef: `order-draft-artwork://${encodeURIComponent(ownerId)}/${encodeURIComponent(draftLineId || "line")}/${encodeURIComponent(selectedFileName)}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    file,
    metadata: { draftId: normalizedDraftId, draftLineId, artworkVersion: 1 },
    uploadedBy: operatorId,
    remark,
  };
}

export function createV1FieldEvidenceAttachmentInput({ evidenceItem, operatorId, remark = "", file = null }) {
  const { groupKey, itemKey, ownerId } = getV1FieldEvidenceAttachmentOwner(evidenceItem);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `v1-field-evidence-${groupKey || "group"}-${itemKey || "item"}-${stamp}.pdf`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "application/pdf";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "v1_field_evidence",
    ownerId,
    fileType,
    purpose: "v1_field_evidence",
    fileName,
    contentRef: selectedFileName
      ? `p0://v1-field-evidence/${groupKey || "group"}/${itemKey || "item"}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://v1-field-evidence/${groupKey || "group"}/${itemKey || "item"}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      groupKey,
      itemKey,
      groupLabel: normalizeAttachmentText(evidenceItem?.groupLabel),
      itemLabel: normalizeAttachmentText(evidenceItem?.label ?? evidenceItem?.itemLabel),
      ownerRole: normalizeAttachmentText(evidenceItem?.ownerRole),
      evidencePurpose: "v1_field_evidence",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createV1FieldEvidenceAttachmentListInput({ evidenceItem, operatorId } = {}) {
  const { ownerId } = getV1FieldEvidenceAttachmentOwner(evidenceItem);
  return {
    ownerType: "v1_field_evidence",
    ownerId,
    purpose: "v1_field_evidence",
    operatorId,
    localAttachments: [],
  };
}

export function createV1SignoffBoundaryAttachmentInput({ signoffItem, operatorId, remark = "", file = null }) {
  const { type, key, ownerId } = getV1SignoffBoundaryAttachmentOwner(signoffItem);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `v1-${type || "signoff"}-${key || "item"}-${stamp}.pdf`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "application/pdf";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "v1_signoff_boundary",
    ownerId,
    fileType,
    purpose: "v1_signoff_boundary",
    fileName,
    contentRef: selectedFileName
      ? `p0://v1-signoff-boundary/${type || "signoff"}/${key || "item"}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://v1-signoff-boundary/${type || "signoff"}/${key || "item"}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      rowType: type,
      roleKey: key,
      label: normalizeAttachmentText(signoffItem?.label),
      status: normalizeAttachmentText(signoffItem?.status),
      evidencePurpose: "v1_signoff_boundary",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createV1SignoffBoundaryAttachmentListInput({ signoffItem, operatorId } = {}) {
  const { ownerId } = getV1SignoffBoundaryAttachmentOwner(signoffItem);
  return {
    ownerType: "v1_signoff_boundary",
    ownerId,
    purpose: "v1_signoff_boundary",
    operatorId,
    localAttachments: [],
  };
}

function getV1FieldEvidenceAttachmentOwner(evidenceItem = {}) {
  const groupKey = normalizeAttachmentText(evidenceItem?.groupKey);
  const itemKey = normalizeAttachmentText(evidenceItem?.key ?? evidenceItem?.itemKey);
  return {
    groupKey,
    itemKey,
    ownerId: [groupKey || "field_evidence", itemKey || "evidence_item"].join(":"),
  };
}

function getV1SignoffBoundaryAttachmentOwner(signoffItem = {}) {
  const type = normalizeAttachmentText(signoffItem?.type) || "signoff";
  const key = normalizeAttachmentText(signoffItem?.key ?? signoffItem?.role) || "owner";
  return {
    type,
    key,
    ownerId: [type, key].join(":"),
  };
}

export function inferAttachmentFileType({ mimeType = "", fileName = "" } = {}) {
  const type = String(mimeType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type === "text/csv" ||
    /\.(xlsx|xls|csv)$/i.test(name)
  ) {
    return "spreadsheet";
  }
  if (
    type.includes("wordprocessingml") ||
    type.includes("msword") ||
    type.startsWith("text/") ||
    /\.(docx|doc|txt|rtf)$/i.test(name)
  ) {
    return "document";
  }
  return "other";
}

export function getAttachmentPurposeRule(purpose) {
  return getAttachmentUploadPolicy(purpose);
}


function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAttachmentText(value) {
  return String(value ?? "").trim();
}

