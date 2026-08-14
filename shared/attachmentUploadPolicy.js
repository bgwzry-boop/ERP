export const ATTACHMENT_MEBIBYTE = 1024 * 1024;

export const attachmentUploadLimits = Object.freeze({
  cameraSourceBytes: 30 * ATTACHMENT_MEBIBYTE,
  documentBytes: 50 * ATTACHMENT_MEBIBYTE,
  printArtworkBytes: 200 * ATTACHMENT_MEBIBYTE,
  rawMaterialOcrSourceBytes: 30 * ATTACHMENT_MEBIBYTE,
  rawMaterialOcrEncodedBytes: 10 * ATTACHMENT_MEBIBYTE,
  rawMaterialOcrBinaryBytes: 7.5 * ATTACHMENT_MEBIBYTE,
  rawMaterialOcrRequestPageBytes: 4 * ATTACHMENT_MEBIBYTE,
  rawMaterialOcrRequestJsonBytes: 23 * ATTACHMENT_MEBIBYTE,
});

const imageTypes = ["image"];
const imageMimePrefixes = ["image/"];
const imageOrPdfTypes = ["image", "pdf"];
const imageOrPdfMimeTypes = ["application/pdf"];
const evidenceTypes = ["image", "pdf", "document", "spreadsheet"];
const evidenceMimePrefixes = ["image/", "text/"];
const evidenceMimeTypes = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const printArtworkMimeTypes = [
  "application/pdf",
  "application/postscript",
  "application/illustrator",
  "application/vnd.corel-draw",
  "application/cdr",
  "application/x-cdr",
  "application/octet-stream",
  "image/vnd.adobe.photoshop",
  "image/x-photoshop",
  "application/x-photoshop",
];

const commonPhotoPolicy = Object.freeze({
  allowedFileTypes: imageTypes,
  allowedMimePrefixes: imageMimePrefixes,
  allowedMimeTypes: [],
  allowedExtensions: [],
  allowedLabel: "图片",
  maxBytes: attachmentUploadLimits.cameraSourceBytes,
});

const commonEvidencePolicy = Object.freeze({
  allowedFileTypes: evidenceTypes,
  allowedMimePrefixes: evidenceMimePrefixes,
  allowedMimeTypes: evidenceMimeTypes,
  allowedExtensions: [],
  allowedLabel: "图片、PDF、表格或文档",
  label: "附件",
  maxBytes: attachmentUploadLimits.documentBytes,
});

const purposePolicies = Object.freeze({
  raw_material_delivery_note: Object.freeze({
    allowedFileTypes: imageOrPdfTypes,
    allowedMimePrefixes: imageMimePrefixes,
    allowedMimeTypes: imageOrPdfMimeTypes,
    allowedExtensions: ["png", "jpg", "jpeg", "bmp", "pdf"],
    allowedLabel: "PNG、JPG、JPEG、BMP 图片或 PDF",
    label: "原材料送货单",
    maxBytes: attachmentUploadLimits.rawMaterialOcrSourceBytes,
    requiresContent: true,
  }),
  payment_screenshot: Object.freeze({
    ...commonPhotoPolicy,
    label: "付款截图",
    requiresContent: true,
  }),
  delivery_watermark_photo: Object.freeze({ ...commonPhotoPolicy, label: "送达水印照片" }),
  signature_photo: Object.freeze({ ...commonPhotoPolicy, label: "签收照片" }),
  finished_goods_photo: Object.freeze({ ...commonPhotoPolicy, label: "定制成品图" }),
  maintenance_evidence: Object.freeze({
    ...commonPhotoPolicy,
    label: "设备检查照片",
    requiresContent: true,
  }),
  statement_customer_confirmation: Object.freeze({
    allowedFileTypes: imageOrPdfTypes,
    allowedMimePrefixes: imageMimePrefixes,
    allowedMimeTypes: imageOrPdfMimeTypes,
    allowedExtensions: [],
    allowedLabel: "图片或 PDF",
    label: "客户确认附件",
    maxBytes: attachmentUploadLimits.cameraSourceBytes,
    requiresContent: true,
  }),
  inventory_correction_evidence: Object.freeze({
    allowedFileTypes: imageOrPdfTypes,
    allowedMimePrefixes: imageMimePrefixes,
    allowedMimeTypes: imageOrPdfMimeTypes,
    allowedExtensions: [],
    allowedLabel: "图片或 PDF",
    label: "库存修正凭证",
    maxBytes: attachmentUploadLimits.cameraSourceBytes,
  }),
  business_decision_evidence: Object.freeze({
    ...commonEvidencePolicy,
    label: "经营决定凭据",
    requiresContent: true,
  }),
  payroll_adjustment_evidence: Object.freeze({
    allowedFileTypes: imageOrPdfTypes,
    allowedMimePrefixes: imageMimePrefixes,
    allowedMimeTypes: imageOrPdfMimeTypes,
    allowedExtensions: [],
    allowedLabel: "图片或 PDF",
    label: "工资调整凭证",
    maxBytes: attachmentUploadLimits.documentBytes,
    requiresContent: true,
  }),
  v1_field_evidence: Object.freeze({ ...commonEvidencePolicy, label: "V1 现场凭据" }),
  v1_signoff_boundary: Object.freeze({ ...commonEvidencePolicy, label: "V1 签字或边界附件" }),
  print_artwork: Object.freeze({
    allowedFileTypes: ["image", "pdf", "other"],
    allowedMimePrefixes: imageMimePrefixes,
    allowedMimeTypes: printArtworkMimeTypes,
    allowedExtensions: ["psd", "cdr", "ai", "pdf", "png", "jpg", "jpeg"],
    allowedLabel: "PSD、CDR、AI、PDF、PNG、JPG 或 JPEG 稿件",
    label: "印刷定稿文件",
    maxBytes: attachmentUploadLimits.printArtworkBytes,
    requiresContent: true,
  }),
});

export function getAttachmentUploadPolicy(purpose) {
  return purposePolicies[String(purpose ?? "").trim()] ?? commonEvidencePolicy;
}

export function getAttachmentFileExtension(fileName) {
  const match = String(fileName ?? "").trim().toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match?.[1] ?? "";
}
