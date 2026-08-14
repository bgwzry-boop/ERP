import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { enrichRawMaterialSpecValues } from "../shared/rawMaterialSpec.js";
import {
  applyRawMaterialOcrLineReviews,
  buildRawMaterialOcrReviewedRolls,
  validateRawMaterialOcrLineReviewSummary,
} from "../shared/rawMaterialOcrLineReview.js";
import {
  normalizeRawMaterialOcrPages,
  normalizeRawMaterialOcrTextList,
} from "./rawMaterialOcrMetadataNormalizers.mjs";

export function applyRawMaterialOcrReview({ before = {}, reviewFields, lineReviews, operatorName, operatorId, now }) {
  const isOcrDraft = cleanText(before.ocrProvider) === "tencent_cloud_table_v3";
  const documentDirection = cleanText(before.documentDirection) || "supplier_delivery";
  const isSupplierReturn = documentDirection === "supplier_return";
  if (isOcrDraft && cleanText(before.status) !== "已识别待复核") {
    throw Object.assign(new Error("Only pending OCR drafts can be reviewed."), {
      statusCode: 409,
      code: "RAW_MATERIAL_OCR_REVIEW_NOT_ALLOWED",
    });
  }
  const reviewedValues = isOcrDraft ? resolveReviewedOcrValues(before, reviewFields, { documentDirection }) : {};
  if (isOcrDraft) Object.assign(reviewedValues, enrichRawMaterialSpecValues(reviewedValues));
  if (isOcrDraft) validateReviewedOcrValues(reviewedValues, { documentDirection });
  const reviewedLines = isOcrDraft
    ? applyRawMaterialOcrLineReviews({
        lines: before.ocrLines,
        lineReviews,
        operatorName,
        operatorId,
        now,
        documentDirection,
      })
    : before.ocrLines;
  if (isOcrDraft) validateRawMaterialOcrLineReviewSummary({
    lines: reviewedLines,
    reviewValues: reviewedValues,
    documentDirection,
    amountReferenceOnly: before.documentPriceReferenceOnly === true,
  });
  return {
    ...before,
    ...reviewedValues,
    status: isSupplierReturn ? "退货单已复核" : "已复核待打印标签",
    ocrStatus: isSupplierReturn ? "退货明细人工复核已通过；不生成入库卷标、不增加库存，进入厂家负数对账依据" : "人工复核已通过",
    ocrReviewFields: isOcrDraft
      ? (before.ocrReviewFields ?? []).map((field) => {
          const value = Object.hasOwn(reviewedValues, field.key) ? reviewedValues[field.key] : field.value;
          return {
            ...field,
            value,
            reviewStatus: areValuesEqual(value, field.recognizedValue) ? "人工接受" : "人工修改",
            reviewedBy: operatorName,
            reviewedByUserId: operatorId,
            reviewedAt: now,
          };
        })
      : before.ocrReviewFields,
    ocrLines: reviewedLines,
    reviewedBy: operatorName,
    reviewedByUserId: operatorId,
    reviewedAt: now,
    nextStep: isSupplierReturn
      ? "退货复核已留档并作为负数厂家对账依据；不进入入库打印和可用库存。实物退厂使用独立退货出库流程。"
      : "打印系统卷标；标签打印后仍需逐卷与实物人工核对，确认一致才算可用原料。",
    note: isSupplierReturn
      ? "该单据为供应商退货方向，保存带符号的退货复核和原单证据，供厂家月结抵扣；不生成入库卷标、不增加库存。"
      : before.note,
    rolls: isSupplierReturn
      ? []
      : isOcrDraft
      ? buildRawMaterialOcrReviewedRolls({
          inboundId: before.id,
          existingRolls: before.rolls,
          lines: reviewedLines,
          documentDirection,
        })
      : (before.rolls ?? []).map((roll) => ({
          ...roll,
          labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "待打印标签",
        })),
  };
}

export function applyRawMaterialOcrReparse({ before = {}, reparsedInbound = {} }) {
  const currentVersion = Number(before.ocrParserVersion) || 1;
  const nextVersion = Number(reparsedInbound?.ocrParserVersion) || 0;
  if (
    cleanText(before.ocrProvider) !== "tencent_cloud_table_v3" ||
    cleanText(before.status) !== "已识别待复核" ||
    nextVersion <= currentVersion
  ) {
    throw Object.assign(new Error("Only stale pending OCR drafts can be reparsed."), {
      statusCode: 409,
      code: "RAW_MATERIAL_OCR_REPARSE_NOT_ALLOWED",
    });
  }
  if (cleanText(reparsedInbound.id) !== cleanText(before.id)) {
    throw Object.assign(new Error("Reparsed OCR draft id does not match the source draft."), {
      statusCode: 422,
      code: "RAW_MATERIAL_OCR_REPARSE_ID_MISMATCH",
    });
  }
  const replacementKeys = [
    "documentDirection", "documentTypeLabel", "supplierOcrProfileKey", "supplierOcrProfileProvisional",
    "documentPriceReferenceOnly", "priceAuthority",
    "supplierName", "deliveryNoteNo", "receivedAt", "materialType", "productName", "spec", "specRaw", "specDisplay",
    "gramWeightGsm", "widthCm", "lengthM", "materialCategory", "specNeedsReview", "specReviewReason",
    "supplierColor", "factoryColor", "rollCount", "totalWeightKg", "unit", "unitPrice", "amount",
    "ocrStatus", "ocrAngle", "ocrImageWidth", "ocrImageHeight", "ocrPageCount", "ocrPages", "ocrParserVersion", "ocrRawText", "ocrReviewFields", "ocrLines",
    "ocrDeclaredAmount", "ocrCalculatedLineAmount", "ocrDeclaredWeightKg", "ocrCalculatedLineWeightKg", "ocrReconciliationIssues",
    "ocrTableRows", "ocrTableSourcePages", "photoStatus", "signedNoteStatus", "nextStep", "note", "location",
    "statementStatus", "statementSummary", "statementDifferences", "rolls",
  ];
  const replacements = Object.fromEntries(
    replacementKeys.filter((key) => Object.hasOwn(reparsedInbound, key)).map((key) => [key, reparsedInbound[key]]),
  );
  const after = {
    ...before,
    ...replacements,
    id: before.id,
    revision: before.revision,
    status: "已识别待复核",
    ocrProvider: before.ocrProvider,
    ocrAction: before.ocrAction,
    ocrRequestId: before.ocrRequestId,
    ocrRecognizedAt: before.ocrRecognizedAt,
    ocrSourceDigest: before.ocrSourceDigest,
    sourceAttachmentId: before.sourceAttachmentId,
    sourceAttachmentIds: before.sourceAttachmentIds,
    sourceFileName: before.sourceFileName,
    sourceFileNames: before.sourceFileNames,
    sourceMimeType: before.sourceMimeType,
    sourceMimeTypes: before.sourceMimeTypes,
  };
  if ((after.rolls ?? []).some((roll) => cleanText(roll.inventoryStatus) === "可用")) {
    throw Object.assign(new Error("Reparsed OCR drafts must not create available inventory."), {
      statusCode: 422,
      code: "RAW_MATERIAL_OCR_REPARSE_AVAILABLE_INVENTORY_FORBIDDEN",
    });
  }
  return after;
}

export function normalizeRawMaterialOcrMetadata(item = {}) {
  item.documentDirection = cleanText(item.documentDirection) || "supplier_delivery";
  item.documentTypeLabel = cleanText(item.documentTypeLabel) || (item.documentDirection === "supplier_return" ? "退货单" : "送货单");
  item.supplierOcrProfileKey = cleanText(item.supplierOcrProfileKey) || "generic";
  item.supplierOcrProfileProvisional = item.supplierOcrProfileProvisional === true;
  item.documentPriceReferenceOnly = item.documentPriceReferenceOnly === true;
  item.priceAuthority = cleanText(item.priceAuthority) || "supplier_document_pending_reconciliation";
  item.source = cleanText(item.source);
  item.ocrProvider = cleanText(item.ocrProvider);
  item.ocrAction = cleanText(item.ocrAction);
  item.ocrRequestId = cleanText(item.ocrRequestId);
  item.ocrStatus = cleanText(item.ocrStatus);
  item.ocrImageWidth = Math.max(0, Number(item.ocrImageWidth) || 0);
  item.ocrImageHeight = Math.max(0, Number(item.ocrImageHeight) || 0);
  item.ocrPageCount = Math.max(1, Number(item.ocrPageCount) || 1);
  item.ocrPages = normalizeRawMaterialOcrPages(item.ocrPages, item.ocrPageCount, item.ocrImageWidth, item.ocrImageHeight, item.ocrAngle);
  item.ocrSourceDigest = cleanText(item.ocrSourceDigest);
  item.ocrRecognizedAt = cleanText(item.ocrRecognizedAt);
  item.ocrRawText = cleanText(item.ocrRawText);
  item.ocrDeclaredAmount = Number(item.ocrDeclaredAmount) || 0;
  item.ocrCalculatedLineAmount = Number(item.ocrCalculatedLineAmount) || 0;
  item.ocrDeclaredWeightKg = Number(item.ocrDeclaredWeightKg) || 0;
  item.ocrCalculatedLineWeightKg = Number(item.ocrCalculatedLineWeightKg) || 0;
  item.ocrReconciliationIssues = (Array.isArray(item.ocrReconciliationIssues) ? item.ocrReconciliationIssues : [])
    .map(cleanText)
    .filter(Boolean);
  item.sourceAttachmentId = cleanText(item.sourceAttachmentId);
  item.sourceAttachmentIds = normalizeRawMaterialOcrTextList(item.sourceAttachmentIds, item.sourceAttachmentId);
  item.sourceFileName = cleanText(item.sourceFileName);
  item.sourceFileNames = normalizeRawMaterialOcrTextList(item.sourceFileNames, item.sourceFileName);
  item.sourceMimeType = cleanText(item.sourceMimeType);
  item.sourceMimeTypes = normalizeRawMaterialOcrTextList(item.sourceMimeTypes, item.sourceMimeType);
  item.ocrReviewFields = normalizeReviewFields(item.ocrReviewFields);
  item.ocrLines = normalizeLines(item.ocrLines);
  item.ocrTableRows = (Array.isArray(item.ocrTableRows) ? item.ocrTableRows : []).map((row) =>
    (Array.isArray(row) ? row : []).map((cells) =>
      (Array.isArray(cells) ? cells : []).map(cleanText).filter(Boolean),
    ),
  );
  item.ocrTableSourcePages = (Array.isArray(item.ocrTableSourcePages) ? item.ocrTableSourcePages : [])
    .map((value) => Math.max(0, Number(value) || 0));
  return item;
}

export function buildRawMaterialInboundOcrInsertTransactionQuery(safeInbound, safeOperationLog = null) {
  const parameters = createPostgresParameterBinder();
  const operationLogSql = safeOperationLog ? buildInsertOperationLogSql(safeOperationLog, parameters) : "";
  return {
    text: `
BEGIN;
WITH inserted_inbound AS MATERIALIZED (
  INSERT INTO raw_material_inbounds (id, delivery_note_no, supplier_name, status, payload_json, revision, created_at, updated_at)
  VALUES (
    ${parameters.text(safeInbound.id)}, ${parameters.text(safeInbound.deliveryNoteNo)},
    ${parameters.text(safeInbound.supplierName)}, ${parameters.text(safeInbound.status)},
    ${parameters.json({ ...safeInbound, revision: 1 })}, 1, now(), now()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING payload_json || jsonb_build_object('revision', revision) AS result
),
inbound_write_guard AS MATERIALIZED (
  SELECT erp_require((SELECT COUNT(*) FROM inserted_inbound) = 1, 'ERP_RAW_MATERIAL_INBOUND_ALREADY_EXISTS') AS ok
)
${safeOperationLog ? `, inserted_operation_log AS (${operationLogSql})` : ""}
SELECT json_build_object(
  'inbound', (SELECT result FROM inserted_inbound),
  'operationLogId', ${safeOperationLog ? "(SELECT id FROM inserted_operation_log)" : "NULL"},
  'writeGuard', (SELECT ok FROM inbound_write_guard)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

function resolveReviewedOcrValues(inbound, reviewFields, { documentDirection = "supplier_delivery" } = {}) {
  const allowedKeys = new Set([
    "supplierName", "deliveryNoteNo", "materialType", "productName", "spec", "supplierColor",
    "factoryColor", "rollCount", "totalWeightKg", "unit", "unitPrice", "amount",
  ]);
  const submitted = Array.isArray(reviewFields)
    ? Object.fromEntries(reviewFields.map((field) => [cleanText(field?.key), field?.value]))
    : reviewFields && typeof reviewFields === "object" ? reviewFields : {};
  const values = {};
  for (const field of inbound.ocrReviewFields ?? []) {
    if (allowedKeys.has(field.key)) values[field.key] = Object.hasOwn(submitted, field.key) ? submitted[field.key] : field.value;
  }
  for (const [key, value] of Object.entries(submitted)) if (allowedKeys.has(key)) values[key] = value;
  for (const key of ["rollCount", "totalWeightKg", "unitPrice", "amount"]) values[key] = Number(values[key]) || 0;
  if (documentDirection === "supplier_return") {
    values.totalWeightKg = values.totalWeightKg ? -Math.abs(values.totalWeightKg) : 0;
    values.amount = values.amount ? -Math.abs(values.amount) : 0;
  }
  for (const key of allowedKeys) {
    if (!["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key)) values[key] = cleanText(values[key]);
  }
  return values;
}

function validateReviewedOcrValues(values, { documentDirection = "supplier_delivery" } = {}) {
  const missing = [];
  if (!cleanText(values.supplierName)) missing.push("供应商");
  if (!cleanText(values.materialType) && !cleanText(values.productName)) missing.push("材料/品名");
  if (documentDirection !== "supplier_return" && !cleanText(values.spec)) missing.push("规格");
  if (!cleanText(values.unit)) missing.push("单位");
  if (!Number.isInteger(Number(values.rollCount)) || Number(values.rollCount) <= 0 || Number(values.rollCount) > 500) missing.push("卷/件数（1-500）");
  if (missing.length) {
    throw Object.assign(new Error(`OCR 人工复核未完成：${missing.join("、")}`), {
      statusCode: 422,
      code: "RAW_MATERIAL_OCR_REVIEW_REQUIRED_FIELDS_MISSING",
    });
  }
}

function normalizeReviewFields(fields) {
  return (Array.isArray(fields) ? fields : []).map((field) => ({
    ...field,
    key: cleanText(field?.key),
    label: cleanText(field?.label),
    recognizedValue: field?.recognizedValue ?? "",
    value: field?.value ?? "",
    confidence: Math.max(0, Math.min(100, Number(field?.confidence) || 0)),
    reviewStatus: cleanText(field?.reviewStatus) || "待人工复核",
    required: field?.required === true,
  })).filter((field) => field.key);
}

function normalizeLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const values = line?.values && typeof line.values === "object" && !Array.isArray(line.values) ? { ...line.values } : {};
    const recognizedValues = line?.recognizedValues && typeof line.recognizedValues === "object" && !Array.isArray(line.recognizedValues)
      ? { ...line.recognizedValues }
      : {};
    return {
      ...line,
      lineId: cleanText(line?.lineId) || `OCR-LINE-${index + 1}`,
      sourcePageIndex: Math.max(0, Number(line?.sourcePageIndex) || 0),
      sourceRowIndex: Math.max(0, Number(line?.sourceRowIndex) || 0),
      sourceText: cleanText(line?.sourceText),
      reviewStatus: cleanText(line?.reviewStatus) || "待人工复核",
      values,
      recognizedValues: Object.keys(recognizedValues).length ? recognizedValues : { ...values },
      confidences: line?.confidences && typeof line.confidences === "object" && !Array.isArray(line.confidences) ? { ...line.confidences } : {},
      reviewedFields: (Array.isArray(line?.reviewedFields) ? line.reviewedFields : []).map((field) => ({
        key: cleanText(field?.key),
        recognizedValue: field?.recognizedValue ?? "",
        value: field?.value ?? "",
        reviewStatus: cleanText(field?.reviewStatus) || "待人工复核",
      })).filter((field) => field.key),
      reviewedBy: cleanText(line?.reviewedBy),
      reviewedByUserId: cleanText(line?.reviewedByUserId),
      reviewedAt: cleanText(line?.reviewedAt),
      reviewDisposition: cleanText(line?.reviewDisposition) || "included",
      reviewProjectedRollCount: Math.max(0, Math.trunc(Number(line?.reviewProjectedRollCount) || 0)),
      excludedRollIndices: (Array.isArray(line?.excludedRollIndices) ? line.excludedRollIndices : [])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value >= 0),
      exclusionReason: cleanText(line?.exclusionReason),
      excludedBy: cleanText(line?.excludedBy),
      excludedByUserId: cleanText(line?.excludedByUserId),
      excludedAt: cleanText(line?.excludedAt),
    };
  });
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
  id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at
) VALUES (
  ${parameters.text(operationLog.id)}, ${parameters.text(operationLog.targetType)}, ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)}, ${parameters.json(operationLog.before)}, ${parameters.json(operationLog.after)},
  ${parameters.text(operationLog.reason)}, ${parameters.nullableText(operationLog.operatorId)}, ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)}, ${parameters.timestamp(operationLog.createdAt)}
) ON CONFLICT (id) DO NOTHING RETURNING id`;
}

function areValuesEqual(left, right) {
  return typeof left === "number" || typeof right === "number" ? Number(left) === Number(right) : cleanText(left) === cleanText(right);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
