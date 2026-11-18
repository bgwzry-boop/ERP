import { normalizedSupplierAliases, suppliersAreEquivalent } from "./services/rawMaterialSupplierReturnReconciliationService.mjs";
import { supplierStatementDay } from "../shared/supplierStatementPeriod.js";

const clean = (value) => String(value ?? "").trim();
const referenceKey = (value) => clean(value).normalize("NFKC").toUpperCase();
const confirmed = (review) => review.statementConfirmationId || review.supplierPayableId;
const paymentReferences = (record) => [record?.paymentReferenceNo, record?.paymentVoucherNo].map(referenceKey).filter(Boolean);

function shipmentSources(review) {
  return (review.rows ?? []).filter((row) => row.lineType !== "return" && !row.sourceReturnInboundId)
    .map((row) => ({
      inbound: clean(row.matchedInboundId),
      roll: clean(row.matchedRollId),
      document: referenceKey(row.documentNo),
      day: supplierStatementDay(row.documentDate),
      batch: referenceKey(row.batchNo),
    }));
}

function sameShipmentSource(left, right) {
  if (left.roll && right.roll) return left.roll === right.roll;
  if (left.inbound && left.inbound === right.inbound) return true;
  if (left.day && right.day && left.day !== right.day) return false;
  if (left.document && right.document) return left.document === right.document;
  return Boolean(left.day && left.day === right.day && left.batch && left.batch === right.batch);
}

export function assertSupplierStatementSourceUnclaimed(current, reviews) {
  const sources = shipmentSources(current);
  const duplicate = reviews.find((review) => review.reviewId !== current.reviewId && confirmed(review)
    && suppliersAreEquivalent(current.supplierName, review.supplierName)
    && ((current.sourceFileDigest && current.sourceFileDigest === review.sourceFileDigest)
      || shipmentSources(review).some((other) => sources.some((source) => sameShipmentSource(source, other)))));
  if (duplicate) throw supplierSettlementClaimError("statement", duplicate.reviewId);
}

export function assertSupplierPaymentReferenceUnclaimed(current, payment, reviews) {
  const references = paymentReferences(payment);
  if (!references.length) return;
  const duplicate = reviews.find((review) => suppliersAreEquivalent(current.supplierName, review.supplierName)
    && [...(review.supplierPaymentRecords ?? []), review.supplierPaymentRecord]
      .some((paid) => paymentReferences(paid).some((ref) => references.includes(ref))));
  if (duplicate) throw supplierSettlementClaimError("payment", duplicate.reviewId);
}

export function supplierSettlementClaimError(kind, reviewId = "") {
  const payment = kind === "payment";
  const message = payment
    ? "同一供应商的此付款流水或凭证已登记，请打开原付款记录核对。"
    : "这份月结或其中的入库记录已进入其他对账，不能重复生成应付。请核对已确认账单。";
  return Object.assign(new Error(message), {
    statusCode: 409,
    code: payment ? "RAW_MATERIAL_SUPPLIER_PAYMENT_REFERENCE_USED" : "RAW_MATERIAL_SUPPLIER_STATEMENT_SOURCE_USED",
    ...(reviewId ? { details: { existingReviewId: reviewId } } : {}),
  });
}

const sqlReference = (value) => `upper(btrim(normalize(coalesce(${value}, ''), NFKC)))`;
// Keep historical supplier spellings comparable without rewriting any rows.
const sqlSupplier = (value) => `regexp_replace(regexp_replace(${value}, '[[:space:]·,，。()（）_/-]', '', 'g'),
  '有限责任公司|股份有限公司|有限公司|销售单|销货单|送货单|退货单|无纺布', '', 'g')`;

export function buildSupplierSettlementClaimsSql(review, operation, parameters) {
  const claimStatement = ["confirm_raw_material_supplier_statement", "generate_raw_material_supplier_payable_draft"].includes(operation);
  const references = operation === "confirm_raw_material_supplier_payment" ? paymentReferences(review.supplierPaymentRecord) : [];
  if (!claimStatement && !references.length) return "";
  const aliases = parameters.textArray(normalizedSupplierAliases(review.supplierName));
  const supplierPredicate = `${sqlSupplier("other.supplier_name")} = ANY(${aliases})`;
  if (references.length) {
    const referenceValues = parameters.textArray(references);
    return `AND erp_require(NOT EXISTS (
      SELECT 1 FROM raw_material_supplier_statement_reviews other
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(other.payload_json->'supplierPaymentRecords', '[]'::jsonb) ||
        jsonb_build_array(other.payload_json->'supplierPaymentRecord')) AS paid
      WHERE ${supplierPredicate} AND (
        ${sqlReference("paid->>'paymentReferenceNo'")} = ANY(${referenceValues}) OR
        ${sqlReference("paid->>'paymentVoucherNo'")} = ANY(${referenceValues})
      )
    ), 'ERP_SUPPLIER_PAYMENT_REFERENCE_USED')`;
  }

  const reviewId = parameters.text(review.reviewId);
  const sources = parameters.json(shipmentSources(review));
  const digest = parameters.text(review.sourceFileDigest);
  const dateParts = `regexp_match(btrim(previous->>'documentDate'), '^(20[0-9]{2})[-/.年]([0-9]{1,2})[-/.月]([0-9]{1,2})($|日|T|[[:space:]])')`;
  return `AND erp_require(NOT EXISTS (
    SELECT 1 FROM raw_material_supplier_statement_reviews other
    WHERE other.id <> ${reviewId} AND ${supplierPredicate}
      AND (COALESCE(other.payload_json->>'statementConfirmationId', '') <> '' OR COALESCE(other.payload_json->>'supplierPayableId', '') <> '')
      AND ((${digest} <> '' AND ${digest} = other.payload_json->>'sourceFileDigest') OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(other.payload_json->'rows', '[]'::jsonb)) previous
        CROSS JOIN LATERAL (SELECT ${dateParts} AS parts) receipt_date
        CROSS JOIN jsonb_to_recordset(${sources}) AS candidate(inbound text, roll text, document text, day text, batch text)
        WHERE coalesce(previous->>'lineType', '') <> 'return' AND coalesce(previous->>'sourceReturnInboundId', '') = ''
          AND CASE WHEN candidate.roll <> '' AND coalesce(previous->>'matchedRollId', '') <> ''
            THEN candidate.roll = previous->>'matchedRollId'
            ELSE (candidate.inbound <> '' AND candidate.inbound = previous->>'matchedInboundId')
              OR ((candidate.day = '' OR receipt_date.parts IS NULL OR candidate.day =
                concat(receipt_date.parts[1], '-', lpad(receipt_date.parts[2], 2, '0'), '-', lpad(receipt_date.parts[3], 2, '0')))
                AND CASE WHEN candidate.document <> '' AND ${sqlReference("previous->>'documentNo'")} <> ''
                  THEN candidate.document = ${sqlReference("previous->>'documentNo'")}
                  ELSE candidate.day <> '' AND receipt_date.parts IS NOT NULL AND candidate.batch <> ''
                    AND candidate.batch = ${sqlReference("previous->>'batchNo'")}
                END)
            END
      ))
  ), 'ERP_SUPPLIER_STATEMENT_SOURCE_USED')`;
}
