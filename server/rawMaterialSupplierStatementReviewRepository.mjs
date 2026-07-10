import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export const rawMaterialSupplierStatementReviewStoreKey = "metadata/raw-material-supplier-statement-reviews.json";

export function createRawMaterialSupplierStatementReviewRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_STORE ??
    process.env.ERP_RAW_MATERIAL_STORE ??
    "local";
  if (mode === "local") {
    return createLocalRawMaterialSupplierStatementReviewRepository({
      storageRoot: options.storageRoot,
    });
  }
  if (mode === "postgres") {
    return createPostgresRawMaterialSupplierStatementReviewRepository({
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_DATABASE_URL ??
        process.env.ERP_RAW_MATERIAL_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      postgresClient: options.postgresClient,
    });
  }
  throw new Error(`Unsupported raw material supplier statement review repository mode: ${mode}`);
}

export function createLocalRawMaterialSupplierStatementReviewRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentReviewState(storageRoot);
    },

    listReviews({ workspace, query } = {}) {
      return buildReviewListResponse(workspace?.rawMaterialSupplierStatementReviews, query);
    },

    createReviewDraft(input = {}) {
      const result = createReviewDraftPayload(input);
      const reviews = normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews);
      input.workspace.rawMaterialSupplierStatementReviews = [result.review, ...reviews.filter((item) => item.reviewId !== result.review.reviewId)];
      persistReviewState(storageRoot, input.workspace.rawMaterialSupplierStatementReviews);
      return result;
    },

    confirmReview(input = {}) {
      const result = applyReviewConfirmation(input);
      input.workspace.rawMaterialSupplierStatementReviews = result.reviews;
      persistReviewState(storageRoot, result.reviews);
      return result;
    },

    confirmStatement(input = {}) {
      const result = applyStatementConfirmation(input);
      input.workspace.rawMaterialSupplierStatementReviews = result.reviews;
      persistReviewState(storageRoot, result.reviews);
      return result;
    },

    generatePayableDraft(input = {}) {
      const result = applyPayableDraftGeneration(input);
      input.workspace.rawMaterialSupplierStatementReviews = result.reviews;
      persistReviewState(storageRoot, result.reviews);
      return result;
    },

    confirmPayment(input = {}) {
      const result = applySupplierPaymentConfirmation(input);
      input.workspace.rawMaterialSupplierStatementReviews = result.reviews;
      persistReviewState(storageRoot, result.reviews);
      return result;
    },
  };
}

export function createPostgresRawMaterialSupplierStatementReviewRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const transactionJson =
    options.transactionJson ??
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));

  return {
    kind: "postgres",

    async loadState() {
      const builtQuery = buildListReviewsPayloadQuery({});
      return {
        rawMaterialSupplierStatementReviews: normalizeReviews(await queryJson(builtQuery.text, builtQuery.values)),
      };
    },

    async listReviews({ query } = {}) {
      const builtQuery = buildListReviewsPayloadQuery({ query });
      return buildReviewListResponse(await queryJson(builtQuery.text, builtQuery.values), query);
    },

    async createReviewDraft(input = {}) {
      const result = createReviewDraftPayload(input);
      const builtQuery = buildUpsertReviewPayloadTransactionQuery(result.review, result.operationLog);
      const saved = normalizeReviewTransactionResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      input.workspace.rawMaterialSupplierStatementReviews = [
        saved.review ?? result.review,
        ...normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews).filter(
          (item) => item.reviewId !== result.review.reviewId,
        ),
      ];
      return {
        review: saved.review ?? result.review,
        operationLogId: saved.operationLogId || result.operationLog.id,
        operationLog: result.operationLog,
      };
    },

    async confirmReview(input = {}) {
      const result = applyReviewConfirmation(input);
      const builtQuery = buildUpsertReviewPayloadTransactionQuery(result.review, result.operationLog);
      const saved = normalizeReviewTransactionResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      input.workspace.rawMaterialSupplierStatementReviews = [
        saved.review ?? result.review,
        ...result.reviews.filter((item) => item.reviewId !== result.review.reviewId),
      ];
      return {
        ...result,
        review: saved.review ?? result.review,
        operationLogId: saved.operationLogId || result.operationLog.id,
      };
    },

    async confirmStatement(input = {}) {
      const result = applyStatementConfirmation(input);
      const builtQuery = buildUpsertReviewPayloadTransactionQuery(result.review, result.operationLog);
      const saved = normalizeReviewTransactionResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      input.workspace.rawMaterialSupplierStatementReviews = [
        saved.review ?? result.review,
        ...result.reviews.filter((item) => item.reviewId !== result.review.reviewId),
      ];
      return {
        ...result,
        review: saved.review ?? result.review,
        operationLogId: saved.operationLogId || result.operationLog.id,
      };
    },

    async generatePayableDraft(input = {}) {
      const result = applyPayableDraftGeneration(input);
      const builtQuery = buildUpsertReviewPayloadTransactionQuery(result.review, result.operationLog);
      const saved = normalizeReviewTransactionResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      input.workspace.rawMaterialSupplierStatementReviews = [
        saved.review ?? result.review,
        ...result.reviews.filter((item) => item.reviewId !== result.review.reviewId),
      ];
      return {
        ...result,
        review: saved.review ?? result.review,
        operationLogId: saved.operationLogId || result.operationLog.id,
      };
    },

    async confirmPayment(input = {}) {
      const result = applySupplierPaymentConfirmation(input);
      const builtQuery = buildUpsertReviewPayloadTransactionQuery(result.review, result.operationLog);
      const saved = normalizeReviewTransactionResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      input.workspace.rawMaterialSupplierStatementReviews = [
        saved.review ?? result.review,
        ...result.reviews.filter((item) => item.reviewId !== result.review.reviewId),
      ];
      return {
        ...result,
        review: saved.review ?? result.review,
        operationLogId: saved.operationLogId || result.operationLog.id,
      };
    },
  };
}

export function buildListReviewsPayloadSql({ query } = {}) {
  return buildListReviewsPayloadQuery({ query }).text;
}

export function buildListReviewsPayloadQuery({ query } = {}) {
  const filters = normalizeQuery(query);
  const parameters = createPostgresParameterBinder();
  const where = [];
  if (filters.status && filters.status !== "全部") {
    where.push(`status = ${parameters.text(filters.status)}`);
  }
  if (filters.reviewStatus && filters.reviewStatus !== "全部") {
    where.push(`review_status = ${parameters.text(filters.reviewStatus)}`);
  }
  if (filters.supplierName) {
    where.push(`supplier_name = ${parameters.text(filters.supplierName)}`);
  }
  if (filters.keyword) {
    where.push(`payload_json::text ILIKE ${parameters.text(`%${filters.keyword}%`)}`);
  }
  return {
    text: `
SELECT COALESCE(json_agg(payload_json ORDER BY updated_at DESC, id DESC), '[]'::json) AS result
FROM raw_material_supplier_statement_reviews
${where.length ? `WHERE ${where.join(" AND ")}` : ""};
`.trim(),
    values: parameters.values,
  };
}

export function buildUpsertReviewPayloadTransactionSql(review, operationLog = null) {
  return buildUpsertReviewPayloadTransactionQuery(review, operationLog).text;
}

export function buildUpsertReviewPayloadTransactionQuery(review, operationLog = null) {
  const safeReview = normalizeReview(review);
  if (!safeReview?.reviewId) throw new Error("raw material supplier statement review id is required");
  const safeOperationLog = normalizeOperationLog(operationLog);
  const parameters = createPostgresParameterBinder();
  const operationLogSql = safeOperationLog ? buildInsertOperationLogSql(safeOperationLog, parameters) : "";
  return {
    text: `
BEGIN;
WITH upserted_review AS (
  INSERT INTO raw_material_supplier_statement_reviews (
    id,
    supplier_name,
    file_name,
    status,
    review_status,
    payload_json,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(safeReview.reviewId)},
    ${parameters.text(safeReview.supplierName)},
    ${parameters.text(safeReview.fileName)},
    ${parameters.text(safeReview.status)},
    ${parameters.text(safeReview.reviewStatus)},
    ${parameters.json(safeReview)},
    ${parameters.timestamp(safeReview.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    supplier_name = EXCLUDED.supplier_name,
    file_name = EXCLUDED.file_name,
    status = EXCLUDED.status,
    review_status = EXCLUDED.review_status,
    payload_json = EXCLUDED.payload_json,
    updated_at = now()
  RETURNING payload_json AS result
)
${safeOperationLog ? `, inserted_operation_log AS (${operationLogSql})` : ""}
SELECT json_build_object(
  'review', (SELECT result FROM upserted_review),
  'operationLogId', ${safeOperationLog ? "(SELECT id FROM inserted_operation_log)" : "NULL"}
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
  id,
  target_type,
  target_id,
  action,
  before_json,
  after_json,
  reason,
  operator_id,
  page_key,
  occurred_at,
  created_at
) VALUES (
  ${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.text(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)},
  ${parameters.timestamp(operationLog.createdAt)}
)
ON CONFLICT (id) DO NOTHING
RETURNING id`;
}

export function buildReviewListResponse(reviews = [], query = new URLSearchParams()) {
  const filters = normalizeQuery(query);
  let items = normalizeReviews(reviews);
  if (filters.status && filters.status !== "全部") items = items.filter((item) => item.status === filters.status);
  if (filters.reviewStatus && filters.reviewStatus !== "全部") {
    items = items.filter((item) => item.reviewStatus === filters.reviewStatus);
  }
  if (filters.supplierName) items = items.filter((item) => item.supplierName === filters.supplierName);
  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase();
    items = items.filter((item) =>
      [item.reviewId, item.supplierName, item.fileName, item.status, item.reviewStatus, item.summaryText]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }
  items = items.sort((left, right) => compareDateDesc(left.updatedAt, right.updatedAt) || right.reviewId.localeCompare(left.reviewId));
  const total = items.length;
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(filters.pageSize) || 50));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    metrics: buildReviewMetrics(items),
  };
}

export function createReviewDraftPayload(input = {}) {
  const statementResult = input.statementResult ?? input.result ?? {};
  const summary = statementResult.summary ?? {};
  const now = cleanText(input.now ?? input.createdAt ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const reviewId = cleanText(input.reviewId ?? input.body?.reviewId) || createReviewId(now);
  const fileName = cleanText(input.fileName ?? input.body?.fileName ?? statementResult.fileName);
  const supplierName = cleanText(input.supplierName ?? input.body?.supplierName ?? statementResult.supplierName);
  const status = getDraftStatus(summary, statementResult);
  const rows = normalizePrecheckRows(statementResult.rows);
  const review = normalizeReview({
    reviewId,
    supplierName,
    fileName,
    adapter: {
      key: cleanText(statementResult.adapter?.key),
      label: cleanText(statementResult.adapter?.label),
    },
    status,
    reviewStatus: "draft",
    summary: normalizeSummary(summary),
    summaryText: buildSummaryText(summary),
    recommendedAction: cleanText(statementResult.recommendedAction),
    rows,
    adjustments: normalizeAdjustments(statementResult.adjustments),
    issues: normalizeIssues(statementResult.issues),
    matchedInboundIds: Array.from(new Set(rows.map((row) => row.matchedInboundId).filter(Boolean))),
    accountingEffect: "none",
    inventoryEffect: "none",
    payableEffect: "none",
    paymentEffect: "none",
    createdBy: operatorName,
    createdByUserId: operatorId,
    createdAt: now,
    updatedAt: now,
    reviewNote: cleanText(input.note ?? input.body?.note),
    sourceVersion: cleanText(statementResult.version),
  });
  const operationLog = buildOperationLog({
    targetId: review.reviewId,
    action: "create_raw_material_supplier_statement_review_draft",
    operatorId,
    operatorName,
    before: null,
    after: summarizeReview(review),
    reason: "保存供应商月结 Excel 预检结果为人工复核草稿；不写库存、不生成应付、不确认付款。",
    now,
  });
  return { review, operationLog, operationLogId: operationLog.id };
}

export function applyReviewConfirmation(input = {}) {
  const reviews = normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews);
  const reviewId = cleanText(input.reviewId ?? input.body?.reviewId);
  const index = reviews.findIndex((item) => item.reviewId === reviewId);
  if (index < 0) {
    throw Object.assign(new Error(`Raw material supplier statement review not found: ${reviewId}`), { statusCode: 404 });
  }
  const before = reviews[index];
  if (before.reviewStatus === "reviewed") {
    throw Object.assign(new Error(`Raw material supplier statement review already reviewed: ${reviewId}`), { statusCode: 409 });
  }
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const decision = cleanText(input.decision ?? input.body?.decision);
  const status = decision.includes("一致") ? "已人工复核/一致" : "已人工复核/有差异";
  const review = normalizeReview({
    ...before,
    status,
    reviewStatus: "reviewed",
    reviewedBy: operatorName,
    reviewedByUserId: operatorId,
    reviewedAt: now,
    reviewNote: cleanText(input.note ?? input.body?.note) || before.reviewNote,
    updatedAt: now,
    accountingEffect: "none",
    inventoryEffect: "none",
    payableEffect: "none",
    paymentEffect: "none",
  });
  const operationLog = buildOperationLog({
    targetId: review.reviewId,
    action: "confirm_raw_material_supplier_statement_review",
    operatorId,
    operatorName,
    before: summarizeReview(before),
    after: summarizeReview(review),
    reason: "人工复核供应商月结草稿；仍不写库存、不生成应付、不确认付款。",
    now,
  });
  const nextReviews = [...reviews];
  nextReviews[index] = review;
  return {
    reviews: nextReviews,
    review,
    operationLog,
    operationLogId: operationLog.id,
  };
}

export function applyStatementConfirmation(input = {}) {
  const reviews = normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews);
  const reviewId = cleanText(input.reviewId ?? input.body?.reviewId);
  const index = reviews.findIndex((item) => item.reviewId === reviewId);
  if (index < 0) {
    throw Object.assign(new Error(`Raw material supplier statement review not found: ${reviewId}`), { statusCode: 404 });
  }
  const before = reviews[index];
  if (before.reviewStatus === "statement_confirmed" || before.statementConfirmationId) {
    throw Object.assign(new Error(`Raw material supplier statement already confirmed: ${reviewId}`), { statusCode: 409 });
  }
  if (before.reviewStatus !== "reviewed" || !before.status.includes("一致")) {
    throw Object.assign(new Error(`Raw material supplier statement must be reviewed as consistent before confirmation: ${reviewId}`), {
      statusCode: 409,
    });
  }
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const statementConfirmationId =
    cleanText(input.statementConfirmationId ?? input.body?.statementConfirmationId) || createStatementConfirmationId(now);
  const note = cleanText(input.note ?? input.body?.note);
  const review = normalizeReview({
    ...before,
    status: "已确认对账/待付款",
    reviewStatus: "statement_confirmed",
    statementStatus: "已确认对账",
    statementConfirmationId,
    statementConfirmedBy: operatorName,
    statementConfirmedByUserId: operatorId,
    statementConfirmedAt: now,
    statementConfirmationNote: note || before.statementConfirmationNote,
    paymentStatus: "待财务付款确认",
    updatedAt: now,
    accountingEffect: "statement_confirmed_only",
    inventoryEffect: "none",
    payableEffect: "none",
    paymentEffect: "none",
  });
  const operationLog = buildOperationLog({
    targetId: review.reviewId,
    action: "confirm_raw_material_supplier_statement",
    operatorId,
    operatorName,
    before: summarizeReview(before),
    after: summarizeReview(review),
    reason: "确认供应商月结对账一致；只生成对账确认留痕和待付款状态，不写库存、不生成付款。",
    now,
  });
  const nextReviews = [...reviews];
  nextReviews[index] = review;
  return {
    reviews: nextReviews,
    review,
    operationLog,
    operationLogId: operationLog.id,
  };
}

export function applyPayableDraftGeneration(input = {}) {
  const reviews = normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews);
  const reviewId = cleanText(input.reviewId ?? input.body?.reviewId);
  const index = reviews.findIndex((item) => item.reviewId === reviewId);
  if (index < 0) {
    throw Object.assign(new Error(`Raw material supplier statement review not found: ${reviewId}`), { statusCode: 404 });
  }
  const before = reviews[index];
  if (before.supplierPayableId || before.payableStatus) {
    throw Object.assign(new Error(`Raw material supplier payable draft already generated: ${reviewId}`), { statusCode: 409 });
  }
  if (before.reviewStatus !== "statement_confirmed" || before.statementStatus !== "已确认对账") {
    throw Object.assign(new Error(`Raw material supplier statement must be confirmed before payable draft generation: ${reviewId}`), {
      statusCode: 409,
    });
  }
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const supplierPayableId = cleanText(input.supplierPayableId ?? input.body?.supplierPayableId) || createSupplierPayableId(now);
  const note = cleanText(input.note ?? input.body?.note);
  const payableDraft = buildSupplierPayableDraft(before, {
    supplierPayableId,
    generatedAt: now,
    generatedBy: operatorName,
    generatedByUserId: operatorId,
    note,
  });
  const review = normalizeReview({
    ...before,
    status: "已生成应付/待付款确认",
    payableStatus: payableDraft.status,
    supplierPayableId,
    supplierPayableDraft: payableDraft,
    supplierPayableGeneratedBy: operatorName,
    supplierPayableGeneratedByUserId: operatorId,
    supplierPayableGeneratedAt: now,
    supplierPayableNote: note || before.supplierPayableNote,
    paymentStatus: "待财务付款确认",
    updatedAt: now,
    accountingEffect: "supplier_payable_draft_only",
    inventoryEffect: "none",
    payableEffect: "supplier_payable_draft_created",
    paymentEffect: "none",
  });
  const operationLog = buildOperationLog({
    targetId: review.reviewId,
    action: "generate_raw_material_supplier_payable_draft",
    operatorId,
    operatorName,
    before: summarizeReview(before),
    after: summarizeReview(review),
    reason: "财务基于已确认供应商月结生成应付草稿；仍不写库存、不确认付款。",
    now,
  });
  const nextReviews = [...reviews];
  nextReviews[index] = review;
  return {
    reviews: nextReviews,
    review,
    payableDraft,
    operationLog,
    operationLogId: operationLog.id,
  };
}

export function applySupplierPaymentConfirmation(input = {}) {
  const reviews = normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews);
  const reviewId = cleanText(input.reviewId ?? input.body?.reviewId);
  const index = reviews.findIndex((item) => item.reviewId === reviewId);
  if (index < 0) {
    throw Object.assign(new Error(`Raw material supplier statement review not found: ${reviewId}`), { statusCode: 404 });
  }
  const before = reviews[index];
  if (!before.supplierPayableId || !before.supplierPayableDraft) {
    throw Object.assign(new Error(`Raw material supplier payable draft must be generated before payment confirmation: ${reviewId}`), {
      statusCode: 409,
    });
  }
  if (before.paymentStatus === "已确认付款" || before.supplierPaymentConfirmationId) {
    throw Object.assign(new Error(`Raw material supplier payment already confirmed: ${reviewId}`), { statusCode: 409 });
  }
  const payableAmount = round2(before.supplierPayableDraft?.payableAmount) ?? 0;
  const paidAmount = nullableNumber(input.paidAmount ?? input.amount ?? input.body?.paidAmount ?? input.body?.amount) ?? payableAmount;
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
    throw Object.assign(new Error("Raw material supplier payment amount must be greater than zero"), { statusCode: 422 });
  }
  if (Math.abs(paidAmount - payableAmount) > 0.01) {
    throw Object.assign(new Error(`Raw material supplier payment amount must equal payable draft amount: ${reviewId}`), {
      statusCode: 409,
    });
  }
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const supplierPaymentConfirmationId =
    cleanText(input.supplierPaymentConfirmationId ?? input.body?.supplierPaymentConfirmationId) || createSupplierPaymentConfirmationId(now);
  const paymentRecord = normalizeSupplierPaymentRecord({
    supplierPaymentConfirmationId,
    sourceReviewId: before.reviewId,
    supplierPayableId: before.supplierPayableId,
    supplierName: before.supplierName,
    paidAmount,
    currency: before.supplierPayableDraft?.currency || "CNY",
    paymentMethod: input.paymentMethod ?? input.body?.paymentMethod,
    paymentAccount: input.paymentAccount ?? input.body?.paymentAccount,
    paymentReferenceNo: input.paymentReferenceNo ?? input.body?.paymentReferenceNo,
    paymentVoucherNo: input.paymentVoucherNo ?? input.body?.paymentVoucherNo,
    paidAt: input.paidAt ?? input.body?.paidAt ?? now,
    confirmedBy: operatorName,
    confirmedByUserId: operatorId,
    confirmedAt: now,
    note: input.note ?? input.body?.note,
  });
  const review = normalizeReview({
    ...before,
    status: "已确认付款/已完成",
    paymentStatus: "已确认付款",
    payableStatus: "已付款",
    supplierPaymentConfirmationId,
    supplierPaymentRecord: paymentRecord,
    supplierPaymentConfirmedBy: operatorName,
    supplierPaymentConfirmedByUserId: operatorId,
    supplierPaymentConfirmedAt: now,
    supplierPaymentNote: paymentRecord.note || before.supplierPaymentNote,
    updatedAt: now,
    accountingEffect: "supplier_payment_confirmed",
    inventoryEffect: "none",
    payableEffect: "supplier_payable_paid",
    paymentEffect: "supplier_payment_confirmed",
  });
  const operationLog = buildOperationLog({
    targetId: review.reviewId,
    action: "confirm_raw_material_supplier_payment",
    operatorId,
    operatorName,
    before: summarizeReview(before),
    after: summarizeReview(review),
    reason: "财务确认供应商应付草稿已实际付款；记录付款确认号、金额和凭证，不写库存。",
    now,
  });
  const nextReviews = [...reviews];
  nextReviews[index] = review;
  return {
    reviews: nextReviews,
    review,
    paymentRecord,
    operationLog,
    operationLogId: operationLog.id,
  };
}

export function normalizeReviews(reviews = []) {
  return (Array.isArray(reviews) ? reviews : []).map(normalizeReview).filter((item) => item?.reviewId);
}

function normalizeReview(input = {}) {
  if (!input || typeof input !== "object") return null;
  const reviewId = cleanText(input.reviewId ?? input.id);
  if (!reviewId) return null;
  const summary = normalizeSummary(input.summary);
  return {
    ...input,
    id: reviewId,
    reviewId,
    supplierName: cleanText(input.supplierName),
    fileName: cleanText(input.fileName),
    adapter: {
      key: cleanText(input.adapter?.key),
      label: cleanText(input.adapter?.label),
    },
    status: cleanText(input.status) || "待人工复核",
    reviewStatus: cleanText(input.reviewStatus) || "draft",
    summary,
    summaryText: cleanText(input.summaryText) || buildSummaryText(summary),
    recommendedAction: cleanText(input.recommendedAction),
    rows: normalizePrecheckRows(input.rows),
    adjustments: normalizeAdjustments(input.adjustments),
    issues: normalizeIssues(input.issues),
    matchedInboundIds: Array.isArray(input.matchedInboundIds) ? input.matchedInboundIds.map(cleanText).filter(Boolean) : [],
    accountingEffect: cleanText(input.accountingEffect) || "none",
    inventoryEffect: cleanText(input.inventoryEffect) || "none",
    payableEffect: cleanText(input.payableEffect) || "none",
    paymentEffect: cleanText(input.paymentEffect) || "none",
    statementStatus: cleanText(input.statementStatus),
    statementConfirmationId: cleanText(input.statementConfirmationId),
    statementConfirmedBy: cleanText(input.statementConfirmedBy),
    statementConfirmedByUserId: cleanText(input.statementConfirmedByUserId),
    statementConfirmedAt: cleanText(input.statementConfirmedAt),
    statementConfirmationNote: cleanText(input.statementConfirmationNote),
    paymentStatus: cleanText(input.paymentStatus),
    supplierPayableId: cleanText(input.supplierPayableId),
    payableStatus: cleanText(input.payableStatus),
    supplierPayableDraft: normalizeSupplierPayableDraft(input.supplierPayableDraft),
    supplierPayableGeneratedBy: cleanText(input.supplierPayableGeneratedBy),
    supplierPayableGeneratedByUserId: cleanText(input.supplierPayableGeneratedByUserId),
    supplierPayableGeneratedAt: cleanText(input.supplierPayableGeneratedAt),
    supplierPayableNote: cleanText(input.supplierPayableNote),
    supplierPaymentConfirmationId: cleanText(input.supplierPaymentConfirmationId),
    supplierPaymentRecord: normalizeSupplierPaymentRecord(input.supplierPaymentRecord),
    supplierPaymentConfirmedBy: cleanText(input.supplierPaymentConfirmedBy),
    supplierPaymentConfirmedByUserId: cleanText(input.supplierPaymentConfirmedByUserId),
    supplierPaymentConfirmedAt: cleanText(input.supplierPaymentConfirmedAt),
    supplierPaymentNote: cleanText(input.supplierPaymentNote),
    createdBy: cleanText(input.createdBy),
    createdByUserId: cleanText(input.createdByUserId),
    createdAt: cleanText(input.createdAt),
    updatedAt: cleanText(input.updatedAt) || cleanText(input.createdAt),
    reviewedBy: cleanText(input.reviewedBy),
    reviewedByUserId: cleanText(input.reviewedByUserId),
    reviewedAt: cleanText(input.reviewedAt),
    reviewNote: cleanText(input.reviewNote),
    sourceVersion: cleanText(input.sourceVersion),
  };
}

function normalizeSummary(input = {}) {
  return {
    status: cleanText(input.status),
    statusLabel: cleanText(input.statusLabel),
    rowCount: toNumber(input.rowCount),
    matchedRowCount: toNumber(input.matchedRowCount),
    candidateRowCount: toNumber(input.candidateRowCount),
    unmatchedRowCount: toNumber(input.unmatchedRowCount),
    returnRowCount: toNumber(input.returnRowCount),
    adjustmentCount: toNumber(input.adjustmentCount),
    totalWeightKg: toNumber(input.totalWeightKg),
    totalAmount: toNumber(input.totalAmount),
  };
}

function normalizePrecheckRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: cleanText(row.id) || `row-${index + 1}`,
    documentNo: cleanText(row.documentNo),
    batchNo: cleanText(row.batchNo),
    productName: cleanText(row.productName),
    spec: cleanText(row.spec),
    color: cleanText(row.color),
    rollLabel: cleanText(row.rollLabel),
    totalWeightKg: nullableNumber(row.totalWeightKg),
    rollWeightKg: nullableNumber(row.rollWeightKg),
    unitPrice: nullableNumber(row.unitPrice),
    amount: nullableNumber(row.amount),
    matchingStatus: cleanText(row.matchingStatus),
    matchedInboundId: cleanText(row.matchedInboundId),
    matchedRollId: cleanText(row.matchedRollId),
    confidence: cleanText(row.confidence),
    lineType: cleanText(row.lineType),
  }));
}

function normalizeAdjustments(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: cleanText(item.id) || `adjustment-${index + 1}`,
    label: cleanText(item.label),
    adjustmentType: cleanText(item.adjustmentType),
    typeLabel: cleanText(item.typeLabel),
    isCurrentPeriod: item.isCurrentPeriod !== false,
    amount: nullableNumber(item.amount),
    supplierReportedAmount: nullableNumber(item.supplierReportedAmount),
    calculatedAmount: nullableNumber(item.calculatedAmount),
    calculationStatus: cleanText(item.calculationStatus),
    calculationBasis: normalizeAdjustmentCalculationBasis(item.calculationBasis),
    configuredRule: normalizeAdjustmentRuleSummary(item.configuredRule),
    requiresManualReview: item.requiresManualReview !== false,
    note: cleanText(item.note),
  }));
}

function normalizeAdjustmentCalculationBasis(input = {}) {
  if (!input || typeof input !== "object") return null;
  return {
    quantity: nullableNumber(input.quantity),
    quantityUnit: cleanText(input.quantityUnit),
    unitRate: nullableNumber(input.unitRate),
    unit: cleanText(input.unit),
    formulaText: cleanText(input.formulaText),
  };
}

function normalizeAdjustmentRuleSummary(input = {}) {
  if (!input || typeof input !== "object") return null;
  return {
    key: cleanText(input.key),
    label: cleanText(input.label),
    adjustmentType: cleanText(input.adjustmentType),
    unitRate: nullableNumber(input.unitRate),
    unit: cleanText(input.unit),
    amountMode: cleanText(input.amountMode),
    sign: cleanText(input.sign),
  };
}

function normalizeSupplierPayableDraft(input = {}) {
  if (!input || typeof input !== "object") return null;
  const supplierPayableId = cleanText(input.supplierPayableId ?? input.payableId);
  if (!supplierPayableId) return null;
  return {
    supplierPayableId,
    payableId: supplierPayableId,
    sourceReviewId: cleanText(input.sourceReviewId),
    statementConfirmationId: cleanText(input.statementConfirmationId),
    supplierName: cleanText(input.supplierName),
    status: cleanText(input.status) || "待财务复核",
    currency: cleanText(input.currency) || "CNY",
    lineSubtotal: round2(input.lineSubtotal) ?? 0,
    currentAdjustmentSubtotal: round2(input.currentAdjustmentSubtotal) ?? 0,
    payableAmount: round2(input.payableAmount) ?? 0,
    currentAdjustments: normalizePayableAdjustmentRefs(input.currentAdjustments),
    referenceAdjustments: normalizePayableAdjustmentRefs(input.referenceAdjustments),
    financeReviewRequired: input.financeReviewRequired !== false,
    nextStep: cleanText(input.nextStep) || "财务复核扣项、付款账户和实际付款后再确认付款。",
    generatedBy: cleanText(input.generatedBy),
    generatedByUserId: cleanText(input.generatedByUserId),
    generatedAt: cleanText(input.generatedAt),
    note: cleanText(input.note),
  };
}

function normalizeSupplierPaymentRecord(input = {}) {
  if (!input || typeof input !== "object") return null;
  const supplierPaymentConfirmationId = cleanText(input.supplierPaymentConfirmationId ?? input.paymentConfirmationId);
  if (!supplierPaymentConfirmationId) return null;
  return {
    supplierPaymentConfirmationId,
    paymentConfirmationId: supplierPaymentConfirmationId,
    sourceReviewId: cleanText(input.sourceReviewId),
    supplierPayableId: cleanText(input.supplierPayableId),
    supplierName: cleanText(input.supplierName),
    status: cleanText(input.status) || "已确认付款",
    currency: cleanText(input.currency) || "CNY",
    paidAmount: round2(input.paidAmount ?? input.amount) ?? 0,
    paymentMethod: cleanText(input.paymentMethod) || "银行转账",
    paymentAccount: cleanText(input.paymentAccount),
    paymentReferenceNo: cleanText(input.paymentReferenceNo),
    paymentVoucherNo: cleanText(input.paymentVoucherNo),
    paidAt: cleanText(input.paidAt),
    confirmedBy: cleanText(input.confirmedBy),
    confirmedByUserId: cleanText(input.confirmedByUserId),
    confirmedAt: cleanText(input.confirmedAt),
    note: cleanText(input.note),
  };
}

function normalizePayableAdjustmentRefs(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: cleanText(item.id) || `adjustment-${index + 1}`,
    label: cleanText(item.label),
    adjustmentType: cleanText(item.adjustmentType),
    typeLabel: cleanText(item.typeLabel),
    isCurrentPeriod: item.isCurrentPeriod !== false,
    amount: nullableNumber(item.amount),
    supplierReportedAmount: nullableNumber(item.supplierReportedAmount),
    calculatedAmount: nullableNumber(item.calculatedAmount),
    calculationStatus: cleanText(item.calculationStatus),
    calculationBasis: normalizeAdjustmentCalculationBasis(item.calculationBasis),
    configuredRule: normalizeAdjustmentRuleSummary(item.configuredRule),
    note: cleanText(item.note),
  }));
}

function normalizeIssues(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: cleanText(item.id) || `issue-${index + 1}`,
    severity: cleanText(item.severity),
    severityLabel: cleanText(item.severityLabel),
    message: cleanText(item.message),
    row: cleanText(item.row),
  }));
}

function getDraftStatus(summary = {}, result = {}) {
  if (summary.status === "blocked" || normalizeIssues(result.issues).some((issue) => issue.severity === "error")) {
    return "阻断-待重传";
  }
  if (toNumber(summary.unmatchedRowCount) || toNumber(summary.candidateRowCount) || toNumber(summary.adjustmentCount)) {
    return "待人工复核";
  }
  return "可确认";
}

function buildSummaryText(summary = {}) {
  return `明细 ${toNumber(summary.rowCount)} 行，匹配 ${toNumber(summary.matchedRowCount)}，候选 ${toNumber(summary.candidateRowCount)}，未匹配 ${toNumber(summary.unmatchedRowCount)}，调整 ${toNumber(summary.adjustmentCount)}。`;
}

function summarizeReview(review = {}) {
  return {
    reviewId: review.reviewId,
    supplierName: review.supplierName,
    fileName: review.fileName,
    status: review.status,
    reviewStatus: review.reviewStatus,
    summary: review.summary,
    inventoryEffect: review.inventoryEffect,
    payableEffect: review.payableEffect,
    paymentEffect: review.paymentEffect,
    statementStatus: review.statementStatus,
    statementConfirmationId: review.statementConfirmationId,
    supplierPayableId: review.supplierPayableId,
    payableStatus: review.payableStatus,
    payableAmount: review.supplierPayableDraft?.payableAmount,
    supplierPaymentConfirmationId: review.supplierPaymentConfirmationId,
    supplierPaymentPaidAmount: review.supplierPaymentRecord?.paidAmount,
    paymentStatus: review.paymentStatus,
  };
}

function buildReviewMetrics(reviews = []) {
  const items = normalizeReviews(reviews);
  return {
    totalCount: items.length,
    draftCount: items.filter((item) => item.reviewStatus === "draft").length,
    reviewedCount: items.filter((item) => item.reviewStatus === "reviewed").length,
    statementConfirmedCount: items.filter((item) => item.reviewStatus === "statement_confirmed").length,
    payableDraftCount: items.filter((item) => item.supplierPayableId || item.payableStatus).length,
    paymentConfirmedCount: items.filter((item) => item.paymentStatus === "已确认付款" || item.supplierPaymentConfirmationId).length,
    blockedCount: items.filter((item) => item.status.includes("阻断")).length,
    candidateCount: items.filter((item) => toNumber(item.summary.candidateRowCount) > 0).length,
    unmatchedCount: items.filter((item) => toNumber(item.summary.unmatchedRowCount) > 0).length,
  };
}

function buildOperationLog(input = {}) {
  const now = cleanText(input.now) || new Date().toISOString();
  return normalizeOperationLog({
    id: `RMSR-LOG-${Date.now().toString(36).toUpperCase()}`,
    targetType: "raw_material_supplier_statement_review",
    targetId: input.targetId,
    action: input.action,
    before: input.before,
    after: input.after,
    reason: input.reason,
    operatorId: input.operatorId,
    operatorName: input.operatorName,
    pageKey: "rawMaterials",
    occurredAt: now,
    createdAt: now,
  });
}

function normalizeOperationLog(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  if (!id) return null;
  return {
    id,
    targetType: cleanText(value.targetType),
    targetId: cleanText(value.targetId),
    action: cleanText(value.action),
    before: value.before ?? {},
    after: value.after ?? {},
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId),
    operatorName: cleanText(value.operatorName),
    pageKey: cleanText(value.pageKey) || "rawMaterials",
    occurredAt: cleanText(value.occurredAt),
    createdAt: cleanText(value.createdAt),
  };
}

function normalizeReviewTransactionResult(value) {
  if (!value || typeof value !== "object") return { review: null, operationLogId: "" };
  return {
    review: normalizeReview(value.review),
    operationLogId: cleanText(value.operationLogId),
  };
}

function createReviewId(now) {
  const compactDate = cleanText(now).slice(0, 10).replaceAll("-", "") || "LOCAL";
  return `RMSR-${compactDate}-${Date.now().toString(36).toUpperCase()}`;
}

function createStatementConfirmationId(now) {
  const compactDate = cleanText(now).slice(0, 10).replaceAll("-", "") || "LOCAL";
  return `RMSRC-${compactDate}-${Date.now().toString(36).toUpperCase()}`;
}

function createSupplierPayableId(now) {
  const compactDate = cleanText(now).slice(0, 10).replaceAll("-", "") || "LOCAL";
  return `RMSP-${compactDate}-${Date.now().toString(36).toUpperCase()}`;
}

function createSupplierPaymentConfirmationId(now) {
  const compactDate = cleanText(now).slice(0, 10).replaceAll("-", "") || "LOCAL";
  return `RMSPAY-${compactDate}-${Date.now().toString(36).toUpperCase()}`;
}

function buildSupplierPayableDraft(review = {}, input = {}) {
  const currentAdjustments = [];
  const referenceAdjustments = [];
  for (const adjustment of normalizeAdjustments(review.adjustments)) {
    if (isReferenceAdjustment(adjustment)) referenceAdjustments.push(adjustment);
    else currentAdjustments.push(adjustment);
  }
  const lineSubtotal = round2(review.summary?.totalAmount) ?? 0;
  const currentAdjustmentSubtotal = round2(currentAdjustments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)) ?? 0;
  const payableAmount = round2(lineSubtotal + currentAdjustmentSubtotal) ?? 0;
  const supplierPayableId = cleanText(input.supplierPayableId);
  return normalizeSupplierPayableDraft({
    supplierPayableId,
    sourceReviewId: review.reviewId,
    statementConfirmationId: review.statementConfirmationId,
    supplierName: review.supplierName,
    status: "待财务复核",
    currency: "CNY",
    lineSubtotal,
    currentAdjustmentSubtotal,
    payableAmount,
    currentAdjustments,
    referenceAdjustments,
    financeReviewRequired: true,
    nextStep: "财务复核扣项、付款账户和实际付款后再确认付款。",
    generatedBy: input.generatedBy,
    generatedByUserId: input.generatedByUserId,
    generatedAt: input.generatedAt,
    note: input.note,
  });
}

function isReferenceAdjustment(adjustment = {}) {
  if (adjustment.isCurrentPeriod === false || adjustment.adjustmentType === "reference_balance") return true;
  return /历史|欠款|余额|总欠款|上期|期初/.test(`${adjustment.label || ""} ${adjustment.note || ""}`);
}

function normalizeQuery(query) {
  return {
    keyword: cleanText(getQueryValue(query, "keyword")),
    status: cleanText(getQueryValue(query, "status")),
    reviewStatus: cleanText(getQueryValue(query, "reviewStatus")),
    supplierName: cleanText(getQueryValue(query, "supplierName")),
    page: Number(getQueryValue(query, "page") || 1),
    pageSize: Number(getQueryValue(query, "pageSize") || 50),
  };
}

function getQueryValue(query, key) {
  if (!query) return "";
  if (typeof query.get === "function") return query.get(key) ?? "";
  return query[key] ?? "";
}

function compareDateDesc(left, right) {
  return (Date.parse(right) || 0) - (Date.parse(left) || 0);
}

function loadPersistentReviewState(storageRoot) {
  const filePath = getReviewFilePath(storageRoot);
  if (!existsSync(filePath)) {
    persistReviewState(storageRoot, []);
    return { rawMaterialSupplierStatementReviews: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      rawMaterialSupplierStatementReviews: normalizeReviews(
        parsed.rawMaterialSupplierStatementReviews ?? parsed.items ?? [],
      ),
    };
  } catch {
    return { rawMaterialSupplierStatementReviews: [] };
  }
}

function persistReviewState(storageRoot, reviews = []) {
  const filePath = getReviewFilePath(storageRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        rawMaterialSupplierStatementReviews: normalizeReviews(reviews),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function getReviewFilePath(storageRoot) {
  return join(storageRoot, rawMaterialSupplierStatementReviewStoreKey);
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR || join(process.cwd(), ".erp-local-storage");
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round2(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
