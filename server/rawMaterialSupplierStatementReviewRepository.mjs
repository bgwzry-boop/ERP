import { resolveStoreMode } from "./storeMode.mjs";
import { buildIdempotencyConflictError, buildIdempotencyRequestHash, buildPostgresIdempotencyRequest, normalizeIdempotencyKey, readPostgresIdempotencyReplay, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";
import { supplierSettlementState } from "../shared/reviewListSemantics.js";
import { hasSupplierPaymentReference, supplierAmountCents, sumSupplierAmountCents } from "../shared/supplierSettlementMoney.js";
import { supplierDayInPeriod, supplierStatementDay, supplierStatementPeriod } from "../shared/supplierStatementPeriod.js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { mergeReviewedSupplierReturnsIntoStatement } from "./services/rawMaterialSupplierReturnReconciliationService.mjs";
import { assertSupplierPaymentReferenceUnclaimed, assertSupplierStatementSourceUnclaimed, buildSupplierSettlementClaimsSql, supplierSettlementClaimError } from "./supplierSettlementClaims.mjs";

export const rawMaterialSupplierStatementReviewStoreKey = "metadata/raw-material-supplier-statement-reviews.json";
const settlementScope = "raw-material.supplier-review.command";

export function createRawMaterialSupplierStatementReviewRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_STORE", "ERP_RAW_MATERIAL_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
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

  function save(input, command, decide) {
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const state = loadPersistentReviewState(storageRoot);
    const receipts = state.settlementReceipts ?? [];
    const requestHash = key ? buildIdempotencyRequestHash(settlementRequest(input, command)) : "";
    const replay = key && receipts.find((receipt) => receipt.key === key);
    if (replay) {
      if (replay.requestHash !== requestHash) throw buildIdempotencyConflictError();
      return settlementReplay(replay.result, command);
    }
    const result = decide(input);
    const reviews = result.reviews ?? [result.review, ...normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews)
      .filter((review) => review.reviewId !== result.review.reviewId)];
    if (key) receipts.push({ key, requestHash, result: { review: result.review, operationLogId: result.operationLogId } });
    persistReviewState(storageRoot, reviews, receipts);
    input.workspace.rawMaterialSupplierStatementReviews = reviews;
    return result;
  }

  return {
    kind: "local_json",

    loadState(loadOptions = {}) {
      const state = loadPersistentReviewState(storageRoot);
      if (state.rawMaterialSupplierStatementReviews.length || !Array.isArray(loadOptions.seedReviews)) return state;
      return { rawMaterialSupplierStatementReviews: normalizeReviews(loadOptions.seedReviews) };
    },

    listReviews({ workspace, query } = {}) {
      return buildReviewListResponse(workspace?.rawMaterialSupplierStatementReviews, query);
    },

    createReviewDraft(input = {}) {
      return save(input, "create", createReviewDraftPayload);
    },

    confirmReview(input = {}) {
      return save(input, "review", applyReviewConfirmation);
    },

    setPeriod(input = {}) {
      return save(input, "period", applySupplierStatementPeriod);
    },

    confirmStatement(input = {}) {
      return save(input, "statement", applyStatementConfirmation);
    },

    generatePayableDraft(input = {}) {
      return save(input, "payable", applyPayableDraftGeneration);
    },

    confirmPayment(input = {}) {
      return save(input, "payment", applySupplierPaymentConfirmation);
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

  async function save(input, command, decide) {
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const payload = settlementRequest(input, command);
    if (key && typeof postgresClient?.idempotentTransactionJson !== "function") {
      throw Object.assign(new Error("月结操作需要支持幂等回执的数据库执行器。"), { statusCode: 503, code: "RAW_MATERIAL_SUPPLIER_REVIEW_ATOMIC_EXECUTOR_REQUIRED" });
    }
    if (key) {
      const replay = await readPostgresIdempotencyReplay({ queryJson, scope: settlementScope, idempotencyKey: key, payload });
      if (replay) return settlementReplay(replay, command);
    }
    const resultContext = decide(input);
    const expectedReview = command === "create" ? undefined : normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews)
      .find((review) => review.reviewId === resultContext.review.reviewId);
    const query = buildUpsertReviewPayloadTransactionQuery(resultContext.review, resultContext.operationLog, { expectedReview });
    try {
      const returnIds = collectSupplierReturnIds(resultContext.review);
      const request = buildPostgresIdempotencyRequest({
        scope: settlementScope,
        idempotencyKey: resolveRepositoryIdempotencyKey(key, resultContext.operationLog.id),
        payload,
        operatorId: resultContext.operationLog.operatorId,
        targetType: "raw_material_supplier_statement_review",
        targetId: resultContext.review.reviewId,
        // Claims across rows must serialize before the transaction statement
        // reads other reviews (including legacy JSON without claim columns).
        resourceLocks: ["supplier-settlement-claims", `supplier-review:${resultContext.review.reviewId}`, ...returnIds.map((id) => `raw-material:${id}`)],
        query,
      });
      const receipt = typeof postgresClient?.idempotentTransactionJson === "function"
        ? await postgresClient.idempotentTransactionJson({ ...request, includeReplayMetadata: true })
        : { value: await transactionJson(query.text, query.values), replayed: false };
      const saved = normalizeReviewTransactionResult(receipt.value);
      if (!saved.review) throw supplierReviewConflict();
      if (receipt.replayed) return settlementReplay(saved, command);
      input.workspace.rawMaterialSupplierStatementReviews = [saved.review,
        ...normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews).filter((review) => review.reviewId !== saved.review.reviewId)];
      return { ...resultContext, ...saved };
    } catch (error) {
      if (/ERP_SUPPLIER_STATEMENT_SOURCE_USED/.test(error?.message ?? "")) throw supplierSettlementClaimError("statement");
      if (/ERP_SUPPLIER_PAYMENT_REFERENCE_USED/.test(error?.message ?? "")) throw supplierSettlementClaimError("payment");
      if (error?.code === "BUSINESS_WRITE_CONFLICT" || /ERP_SUPPLIER_REVIEW.*CONFLICT/.test(error?.message ?? "")) throw supplierReviewConflict();
      throw error;
    }
  }

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
      return save(input, "create", createReviewDraftPayload);
    },

    async confirmReview(input = {}) {
      return save(input, "review", applyReviewConfirmation);
    },

    async setPeriod(input = {}) {
      return save(input, "period", applySupplierStatementPeriod);
    },

    async confirmStatement(input = {}) {
      return save(input, "statement", applyStatementConfirmation);
    },

    async generatePayableDraft(input = {}) {
      return save(input, "payable", applyPayableDraftGeneration);
    },

    async confirmPayment(input = {}) {
      return save(input, "payment", applySupplierPaymentConfirmation);
    },
  };
}

function settlementRequest(input, command) {
  const {
    workspace: _workspace, idFactory: _idFactory, idempotencyKey: _idempotencyKey,
    operatorName: _operatorName, ...values
  } = input;
  return { command, ...values };
}

function settlementReplay(value, command) {
  const { review, operationLogId } = normalizeReviewTransactionResult(value);
  return {
    review, operationLogId, operationLog: null,
    ...(command === "payment" ? { paymentRecord: review?.supplierPaymentRecord } : {}),
    ...(command === "payable" ? { payableDraft: review?.supplierPayableDraft } : {}),
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

export function buildUpsertReviewPayloadTransactionQuery(review, operationLog = null, { expectedReview } = {}) {
  const safeReview = normalizeReview(review);
  if (!safeReview?.reviewId) throw new Error("raw material supplier statement review id is required");
  const safeOperationLog = normalizeOperationLog(operationLog);
  const parameters = createPostgresParameterBinder();
  const operationLogSql = safeOperationLog ? buildInsertOperationLogSql(safeOperationLog, parameters) : "";
  const settlementClaimGuard = buildSupplierSettlementClaimsSql(safeReview, safeOperationLog?.action, parameters);
  const expected = expectedReview ? normalizeReview(expectedReview) : null;
  const returnIds = collectSupplierReturnIds(safeReview);
  const hasReturnClaim = returnIds.length && (safeReview.statementConfirmationId || safeReview.supplierPayableId);
  const returnIdsSql = hasReturnClaim ? parameters.textArray(returnIds) : "";
  const reviewIdSql = hasReturnClaim ? parameters.text(safeReview.reviewId) : "";
  const returnClaimGuard = hasReturnClaim
    ? `NOT EXISTS (
        SELECT 1 FROM raw_material_supplier_statement_reviews AS other
        WHERE other.id <> ${reviewIdSql}
          AND (COALESCE(other.payload_json->>'statementConfirmationId', '') <> '' OR COALESCE(other.payload_json->>'supplierPayableId', '') <> '')
          AND (
            COALESCE(other.payload_json->'linkedSupplierReturnIds', '[]'::jsonb) ?| ${returnIdsSql}
            OR COALESCE(other.payload_json->'addedSupplierReturnIds', '[]'::jsonb) ?| ${returnIdsSql}
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(other.payload_json->'rows', '[]'::jsonb) || COALESCE(other.payload_json->'adjustments', '[]'::jsonb)) AS source
              WHERE source->>'sourceReturnInboundId' = ANY(${returnIdsSql}))
          )
      )`
    : "true";

  const conflictClause = expected
    ? `DO UPDATE SET
        supplier_name = EXCLUDED.supplier_name, file_name = EXCLUDED.file_name,
        status = EXCLUDED.status, review_status = EXCLUDED.review_status,
        payload_json = EXCLUDED.payload_json, updated_at = now()
      WHERE COALESCE((raw_material_supplier_statement_reviews.payload_json->>'revision')::integer, 1) = ${parameters.integer(expected.revision)}
        AND COALESCE(raw_material_supplier_statement_reviews.payload_json->>'reviewStatus', 'draft') = ${parameters.text(expected.reviewStatus)}
        AND COALESCE(raw_material_supplier_statement_reviews.payload_json->>'statementConfirmationId', '') = ${parameters.text(expected.statementConfirmationId)}
        AND COALESCE(raw_material_supplier_statement_reviews.payload_json->>'supplierPayableId', '') = ${parameters.text(expected.supplierPayableId)}
        AND COALESCE(raw_material_supplier_statement_reviews.payload_json->>'supplierPaymentConfirmationId', '') = ${parameters.text(expected.supplierPaymentConfirmationId)}`
    : "DO NOTHING";

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
  ) SELECT * FROM (VALUES (
    ${parameters.text(safeReview.reviewId)},
    ${parameters.text(safeReview.supplierName)},
    ${parameters.text(safeReview.fileName)},
    ${parameters.text(safeReview.status)},
    ${parameters.text(safeReview.reviewStatus)},
    ${parameters.json(safeReview)},
    ${parameters.timestamp(safeReview.createdAt)},
    now()
  )) AS candidate
  WHERE ${expected ? `EXISTS (SELECT 1 FROM raw_material_supplier_statement_reviews WHERE id = ${parameters.text(safeReview.reviewId)})` : 'true'}
    AND ${returnClaimGuard}
    ${settlementClaimGuard}
  ON CONFLICT (id) ${conflictClause}
  RETURNING payload_json AS result
)
${safeOperationLog ? `, inserted_operation_log AS (${operationLogSql})` : ""}
SELECT json_build_object(
  'writeGuard', erp_require((SELECT COUNT(*) FROM upserted_review) = 1, 'ERP_SUPPLIER_REVIEW_CONCURRENCY_CONFLICT'),
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
  if (filters.settlementStage && filters.settlementStage !== "全部阶段") items = items.filter((item) => supplierSettlementState(item).label === filters.settlementStage);
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
  const rawStatementResult = input.statementResult ?? input.result ?? {};
  const period = confirmableSupplierPeriod(input.periodStart ?? rawStatementResult.periodStart, input.periodEnd ?? rawStatementResult.periodEnd, rawStatementResult.rows);
  const statementResult = mergeReviewedSupplierReturnsIntoStatement(
    rawStatementResult,
    input.workspace?.rawMaterialInbounds,
    {
      supplierName: input.supplierName ?? input.body?.supplierName ?? rawStatementResult.supplierName,
      fileName: input.fileName ?? input.body?.fileName ?? rawStatementResult.fileName,
      periodStart: period?.from,
      periodEnd: period?.through,
    },
  );
  const summary = statementResult.summary ?? {};
  const now = cleanText(input.now ?? input.createdAt ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const reviewId = cleanText(input.reviewId ?? input.body?.reviewId) || createReviewId(now, input.idFactory);
  const fileName = cleanText(input.fileName ?? input.body?.fileName ?? statementResult.fileName);
  const supplierName = cleanText(input.supplierName ?? input.body?.supplierName ?? statementResult.supplierName);
  const status = getDraftStatus(summary, statementResult);
  const rows = normalizePrecheckRows(statementResult.rows);
  const review = normalizeReview({
    reviewId,
    supplierName,
    fileName,
    sourceFileDigest: cleanText(input.sourceFileDigest ?? input.body?.sourceFileDigest),
    periodStart: period?.from,
    periodEnd: period?.through,
    supplierReturnPeriodRequired: statementResult.supplierReturnPeriodRequired,
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
    linkedSupplierReturnIds: statementResult.linkedSupplierReturnIds,
    addedSupplierReturnIds: statementResult.addedSupplierReturnIds,
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
    idFactory: input.idFactory,
  });
  return { review, operationLog, operationLogId: operationLog.id };
}

function confirmableSupplierPeriod(start, end, rows = [], required = false) {
  if (!start && !end && !required) return null;
  const period = supplierStatementPeriod(start, end);
  if (!period) throw Object.assign(new Error("请按供应商月结单填写有效账期起止日期。"), {
    statusCode: 422, code: "RAW_MATERIAL_SUPPLIER_STATEMENT_PERIOD_INVALID",
  });
  const outside = (Array.isArray(rows) ? rows : []).filter((row) => supplierStatementDay(row?.documentDate) && !supplierDayInPeriod(row.documentDate, period));
  if (outside.length) throw Object.assign(new Error(`有明细日期超出所填账期：${outside.slice(0, 4).map((row) => row.documentNo || row.documentDate).join("、")}。请核对原单。`), {
    statusCode: 422, code: "RAW_MATERIAL_SUPPLIER_STATEMENT_PERIOD_ROW_OUTSIDE",
  });
  return period;
}

function omitReturnTrace(item) {
  const {
    sourceReturnInboundId: _returnId, sourceAttachmentId: _attachmentId,
    sourceFileName: _fileName, sourceMimeType: _mimeType, sourceDocumentNo: _documentNo,
    sourceDocumentDate: _documentDate, sourceDocumentDirection: _direction,
    returnDedupeKey: _dedupeKey, returnMatchStatus: _matchStatus, sourceEvidence: _evidence, ...original
  } = item;
  return original;
}

export function applySupplierStatementPeriod(input = {}) {
  const reviews = normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews);
  const index = reviews.findIndex((item) => item.reviewId === cleanText(input.reviewId));
  if (index < 0) throw Object.assign(new Error("未找到月结草稿。"), { statusCode: 404 });
  const before = reviews[index];
  if (before.statementConfirmationId || before.supplierPayableId || !["draft", "reviewed"].includes(before.reviewStatus)) {
    throw Object.assign(new Error("已确认对账的历史记录不能修改账期。"), { statusCode: 409, code: "RAW_MATERIAL_SUPPLIER_STATEMENT_PERIOD_FINALIZED" });
  }
  if (Number(input.expectedRevision) !== before.revision) throw supplierReviewConflict();
  const period = confirmableSupplierPeriod(input.periodStart, input.periodEnd, before.rows, true);
  const addedByErp = (item) => item.returnMatchStatus === "erp_return_adjustment" || before.addedSupplierReturnIds.includes(item.sourceReturnInboundId);
  const excludedConfirmed = before.adjustments.find((item) => item.sourceReturnInboundId && item.calculationStatus === "manual_confirmed" &&
    !supplierDayInPeriod(item.sourceDocumentDate, period));
  if (excludedConfirmed) throw Object.assign(new Error(`已人工确认的退货扣项 ${excludedConfirmed.sourceDocumentNo || excludedConfirmed.label} 超出新账期。请保留原复核记录并用正确账期重新上传月结。`), {
    statusCode: 422, code: "RAW_MATERIAL_SUPPLIER_STATEMENT_PERIOD_CONFIRMED_ADJUSTMENT_OUTSIDE",
  });
  const now = cleanText(input.now) || new Date().toISOString();
  const updated = mergeReviewedSupplierReturnsIntoStatement({
    ...before,
    rows: before.rows.map(omitReturnTrace),
    adjustments: before.adjustments.filter((item) => !addedByErp(item)).map(omitReturnTrace),
    issues: before.issues.filter((issue) => !issue.id.startsWith("issue-return-amount-")),
  }, input.workspace?.rawMaterialInbounds, { supplierName: before.supplierName, periodStart: period.from, periodEnd: period.through });
  const preserved = new Map(before.adjustments.filter((item) => item.sourceReturnInboundId && item.calculationStatus === "manual_confirmed")
    .map((item) => [item.sourceReturnInboundId, item]));
  const resolvedAdjustments = updated.adjustments.map((item) => preserved.get(item.sourceReturnInboundId) ?? item);
  if ([...preserved.keys()].some((id) => !resolvedAdjustments.some((item) => item.sourceReturnInboundId === id))) {
    throw Object.assign(new Error("已人工确认的退货扣项无法与原单重新关联，未保存新账期。请先核对原单。"), {
      statusCode: 409, code: "RAW_MATERIAL_SUPPLIER_STATEMENT_PERIOD_RETURN_LINK_CHANGED",
    });
  }
  const review = normalizeReview({
    ...before,
    ...updated,
    adjustments: resolvedAdjustments,
    periodStart: period.from,
    periodEnd: period.through,
    revision: before.revision + 1,
    updatedAt: now,
    summaryText: buildSummaryText(updated.summary),
    status: "待人工复核",
    reviewStatus: "draft",
    reviewedAt: "", reviewedBy: "", reviewedByUserId: "",
  });
  const operationLog = buildOperationLog({ targetId: review.reviewId, action: "set_raw_material_supplier_statement_period",
    operatorId: input.operatorId, operatorName: input.operatorName, before: summarizeReview(before), after: summarizeReview(review),
    reason: `核对账期 ${period.from} 至 ${period.through}，重新匹配本期退货并留待人工复核。`, now, idFactory: input.idFactory });
  const nextReviews = [...reviews];
  nextReviews[index] = review;
  return { review, reviews: nextReviews, operationLog, operationLogId: operationLog.id };
}

export function applyReviewConfirmation(input = {}) {
  const reviews = normalizeReviews(input.workspace?.rawMaterialSupplierStatementReviews);
  const reviewId = cleanText(input.reviewId ?? input.body?.reviewId);
  const index = reviews.findIndex((item) => item.reviewId === reviewId);
  if (index < 0) {
    throw Object.assign(new Error(`Raw material supplier statement review not found: ${reviewId}`), { statusCode: 404 });
  }
  const before = reviews[index];
  if (before.reviewStatus !== "draft" || before.statementConfirmationId || before.supplierPayableId || before.supplierPaymentConfirmationId) {
    throw Object.assign(new Error(`Raw material supplier statement review already reviewed: ${reviewId}`), { statusCode: 409 });
  }
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const decision = cleanText(input.decision ?? input.body?.decision);
  if (!["一致", "有差异"].includes(decision)) {
    throw Object.assign(new Error("复核结果必须明确选择一致或有差异。"), {
      statusCode: 422,
      code: "RAW_MATERIAL_SUPPLIER_REVIEW_DECISION_INVALID",
    });
  }
  const reviewedAdjustments = resolveReviewedAdjustments(before.adjustments, input.adjustments ?? input.body?.adjustments, {
    operatorId,
    operatorName,
    now,
  });
  if (decision === "一致") {
    validateReviewedSupplierReturnFacts(before.rows, reviewedAdjustments);
    assertSupplierStatementReady({ ...before, adjustments: reviewedAdjustments });
  }
  const status = decision === "一致" ? "已人工复核/一致" : "已人工复核/有差异";
  const review = normalizeReview({
    ...before,
    revision: before.revision + 1,
    adjustments: reviewedAdjustments,
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
    idFactory: input.idFactory,
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

function resolveReviewedAdjustments(currentAdjustments = [], submittedAdjustments, context = {}) {
  const current = normalizeAdjustments(currentAdjustments);
  const submittedById = new Map(
    (Array.isArray(submittedAdjustments) ? submittedAdjustments : [])
      .map((item) => [cleanText(item?.id), item])
      .filter(([id]) => id),
  );
  return current.map((adjustment) => {
    const submitted = submittedById.get(adjustment.id);
    if (!submitted) return adjustment;
    const submittedAmount = nullableNumber(submitted.amount);
    const isSupplierReturn = adjustment.adjustmentType === "return_adjustment" && Boolean(adjustment.sourceReturnInboundId);
    const explicitlyResolved = (submitted.confirmed === true && supplierAmountCents(submitted.amount) !== null && Boolean(cleanText(submitted.note)))
      || (isSupplierReturn && Number.isFinite(submittedAmount) && submittedAmount !== 0);
    const amount = isSupplierReturn && Number.isFinite(submittedAmount) && submittedAmount !== 0
      ? -Math.abs(submittedAmount)
      : Number.isFinite(submittedAmount)
        ? submittedAmount
        : adjustment.amount;
    return normalizeAdjustments([{
      ...adjustment,
      amount,
      calculationStatus: explicitlyResolved
        ? "manual_confirmed"
        : adjustment.calculationStatus,
      requiresManualReview: explicitlyResolved
        ? false
        : adjustment.requiresManualReview,
      note: cleanText(submitted.note) || adjustment.note,
      confirmedAmountBy: explicitlyResolved ? context.operatorName : "",
      confirmedAmountByUserId: explicitlyResolved ? context.operatorId : "",
      confirmedAmountAt: explicitlyResolved ? context.now : "",
    }])[0];
  });
}

function assertSupplierStatementReady(review) {
  if ((review.supplierReturnPeriodRequired || review.addedSupplierReturnIds?.length) && !supplierStatementPeriod(review.periodStart, review.periodEnd)) {
    throw Object.assign(new Error("请先确认账期起止日期，核对哪些退货属于本期。"), {
      statusCode: 422, code: "RAW_MATERIAL_SUPPLIER_STATEMENT_PERIOD_REQUIRED",
    });
  }
  const rows = review.rows ?? [];
  const unresolvedRows = rows.filter((row) => row.matchingStatus !== "matched" && !row.sourceReturnInboundId);
  const currentAdjustments = (review.adjustments ?? []).filter((item) => !isReferenceAdjustment(item));
  const unresolvedAdjustments = currentAdjustments.filter((item) =>
    supplierAmountCents(item.amount) === null || ["different", "missing_amount"].includes(item.calculationStatus));
  const hardErrors = (review.issues ?? []).some((issue) => issue.severity === "error");
  if (review.summary?.status !== "blocked" && !unresolvedRows.length && !unresolvedAdjustments.length && !hardErrors
    && (rows.length > 0 || currentAdjustments.length > 0)) return;
  throw Object.assign(new Error("月结仍有未匹配明细、未确认扣项或导入错误。请逐项核对后再标记一致。"), {
    statusCode: 422,
    code: "RAW_MATERIAL_SUPPLIER_REVIEW_UNRESOLVED",
    details: {
      rowIds: unresolvedRows.map((row) => row.id),
      adjustmentIds: unresolvedAdjustments.map((item) => item.id),
    },
  });
}

function validateReviewedSupplierReturnFacts(rows = [], adjustments = []) {
  const missingRows = normalizePrecheckRows(rows).filter((row) =>
    row.lineType === "return" && row.sourceReturnInboundId && !(Math.abs(Number(row.amount) || 0) > 0.001),
  );
  const missingAdjustments = normalizeAdjustments(adjustments).filter((item) =>
    item.adjustmentType === "return_adjustment"
      && item.sourceReturnInboundId
      && !(Math.abs(Number(item.amount) || 0) > 0.001),
  );
  if (!missingRows.length && !missingAdjustments.length) return;
  const sourceIds = [...missingRows, ...missingAdjustments]
    .map((item) => item.sourceDocumentNo || item.sourceReturnInboundId)
    .filter(Boolean)
    .join("、");
  throw Object.assign(new Error(`供应商退货实际抵扣金额未确认：${sourceIds || "退货调整"}`), {
    statusCode: 422,
    code: "RAW_MATERIAL_SUPPLIER_RETURN_AMOUNT_REQUIRED",
  });
}

function collectSupplierReturnIds(review = {}) {
  return Array.from(new Set([
    ...(Array.isArray(review.linkedSupplierReturnIds) ? review.linkedSupplierReturnIds : []),
    ...(Array.isArray(review.addedSupplierReturnIds) ? review.addedSupplierReturnIds : []),
    ...(Array.isArray(review.rows) ? review.rows.map((row) => row?.sourceReturnInboundId) : []),
    ...(Array.isArray(review.adjustments) ? review.adjustments.map((item) => item?.sourceReturnInboundId) : []),
  ].map(cleanText).filter(Boolean)));
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
  if (before.reviewStatus !== "reviewed" || before.status !== "已人工复核/一致") {
    throw Object.assign(new Error(`Raw material supplier statement must be reviewed as consistent before confirmation: ${reviewId}`), {
      statusCode: 409,
    });
  }
  assertSupplierStatementReady(before);
  const returnIds = collectSupplierReturnIds(before);
  const duplicateReview = reviews.find((item) =>
    item.reviewId !== before.reviewId
      && Boolean(item.statementConfirmationId || item.supplierPayableId)
      && collectSupplierReturnIds(item).some((id) => returnIds.includes(id)),
  );
  if (duplicateReview) {
    const duplicateIds = collectSupplierReturnIds(duplicateReview).filter((id) => returnIds.includes(id));
    throw Object.assign(new Error(`供应商退货已进入其他已确认对账，不能重复抵扣：${duplicateIds.join("、")}`), {
      statusCode: 409,
      code: "RAW_MATERIAL_SUPPLIER_RETURN_ALREADY_RECONCILED",
      details: {
        duplicateReturnIds: duplicateIds,
        existingReviewId: duplicateReview.reviewId,
      },
    });
  }
  assertSupplierStatementSourceUnclaimed(before, reviews);
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const statementConfirmationId =
    cleanText(input.statementConfirmationId ?? input.body?.statementConfirmationId) || createStatementConfirmationId(now, input.idFactory);
  const note = cleanText(input.note ?? input.body?.note);
  const review = normalizeReview({
    ...before,
    revision: before.revision + 1,
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
    idFactory: input.idFactory,
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
  assertSupplierStatementReady(before);
  assertSupplierStatementSourceUnclaimed(before, reviews);
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const supplierPayableId = cleanText(input.supplierPayableId ?? input.body?.supplierPayableId) || createSupplierPayableId(now, input.idFactory);
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
    revision: before.revision + 1,
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
    idFactory: input.idFactory,
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
  if (before.paymentStatus === "已确认付款") {
    throw Object.assign(new Error(`Raw material supplier payment already confirmed: ${reviewId}`), { statusCode: 409 });
  }
  // 2026-10-29 owner decision: suppliers are often paid in several installments,
  // and most settlements round off (抹零) the last few yuan. Installments add up;
  // 抹零 is recorded in its own column, only on the payment that clears the
  // balance, and never rewrites the payable amount.
  const payableCents = supplierAmountCents(before.supplierPayableDraft?.payableAmount);
  const priorRecords = listSupplierPaymentRecords(before);
  const priorPaidCents = sumSupplierAmountCents(priorRecords, "paidAmount");
  const priorRoundingCents = sumSupplierAmountCents(priorRecords, "roundingAmount");
  if (payableCents === null || priorPaidCents === null || priorRoundingCents === null || payableCents < 0
    || priorPaidCents > payableCents || priorRoundingCents > payableCents - priorPaidCents) {
    throw Object.assign(new Error("历史应付或付款金额待核对，暂不能登记新付款。"), { statusCode: 409, code: "RAW_MATERIAL_SUPPLIER_PAYMENT_BALANCE_INVALID" });
  }
  const remainingCents = payableCents - priorPaidCents - priorRoundingCents;
  const roundingCents = supplierAmountCents(input.roundingAmount ?? input.body?.roundingAmount ?? 0);
  const requestedPaid = input.paidAmount ?? input.amount ?? input.body?.paidAmount ?? input.body?.amount;
  const paidCents = requestedPaid === undefined && roundingCents !== null
    ? remainingCents - roundingCents : supplierAmountCents(requestedPaid);
  if (paidCents === null || paidCents < 0 || roundingCents === null || roundingCents < 0 || paidCents + roundingCents <= 0) {
    throw Object.assign(new Error("请明确填写本次实付和抹零金额，最多两位小数且合计大于零。"), { statusCode: 422, code: "RAW_MATERIAL_SUPPLIER_PAYMENT_AMOUNT_INVALID" });
  }
  if (paidCents > remainingCents || roundingCents > remainingCents - paidCents) {
    throw Object.assign(new Error(`Raw material supplier payment exceeds the remaining payable: ${reviewId}`), {
      statusCode: 409,
      details: { payableAmount: payableCents / 100, paidBefore: priorPaidCents / 100, roundingBefore: priorRoundingCents / 100, remaining: remainingCents / 100 },
    });
  }
  const nextRemainingCents = remainingCents - paidCents - roundingCents;
  const clearsBalance = nextRemainingCents === 0;
  if (roundingCents > 0 && !clearsBalance) {
    throw Object.assign(new Error(`Raw material supplier rounding (抹零) is only allowed on the payment that clears the balance: ${reviewId}`), {
      statusCode: 409,
      details: { remaining: remainingCents / 100 },
    });
  }
  const paymentReferenceNo = input.paymentReferenceNo ?? input.body?.paymentReferenceNo;
  const paymentVoucherNo = input.paymentVoucherNo ?? input.body?.paymentVoucherNo;
  if (paidCents > 0 && !hasSupplierPaymentReference(paymentReferenceNo, paymentVoucherNo)) {
    throw Object.assign(new Error("请填写付款流水号或财务凭证号。"), { statusCode: 422, code: "RAW_MATERIAL_SUPPLIER_PAYMENT_REFERENCE_REQUIRED" });
  }
  const now = cleanText(input.now ?? input.body?.now) || new Date().toISOString();
  const operatorId = cleanText(input.operatorId ?? input.body?.operatorId);
  const operatorName = cleanText(input.operatorName ?? input.body?.operatorName ?? operatorId);
  const supplierPaymentConfirmationId =
    cleanText(input.supplierPaymentConfirmationId ?? input.body?.supplierPaymentConfirmationId) || createSupplierPaymentConfirmationId(now, input.idFactory);
  const paymentRecord = normalizeSupplierPaymentRecord({
    supplierPaymentConfirmationId,
    sourceReviewId: before.reviewId,
    supplierPayableId: before.supplierPayableId,
    supplierName: before.supplierName,
    paidAmount: paidCents / 100,
    roundingAmount: roundingCents / 100,
    installmentNo: priorRecords.length + 1,
    currency: before.supplierPayableDraft?.currency || "CNY",
    paymentMethod: input.paymentMethod ?? input.body?.paymentMethod,
    paymentAccount: input.paymentAccount ?? input.body?.paymentAccount,
    paymentReferenceNo,
    paymentVoucherNo,
    paidAt: input.paidAt ?? input.body?.paidAt ?? now,
    confirmedBy: operatorName,
    confirmedByUserId: operatorId,
    confirmedAt: now,
    note: input.note ?? input.body?.note,
  });
  assertSupplierPaymentReferenceUnclaimed(before, paymentRecord, reviews);
  const paymentRecords = [...priorRecords, paymentRecord];
  const paidTotal = (priorPaidCents + paidCents) / 100;
  const roundingTotal = (priorRoundingCents + roundingCents) / 100;
  const review = normalizeReview({
    ...before,
    revision: before.revision + 1,
    status: clearsBalance ? "已确认付款/已完成" : "部分付款/待付清",
    paymentStatus: clearsBalance ? "已确认付款" : "部分付款",
    payableStatus: clearsBalance ? "已付款" : "部分付款",
    supplierPaymentConfirmationId,
    supplierPaymentRecord: paymentRecord,
    supplierPaymentRecords: paymentRecords,
    supplierPaidTotal: paidTotal,
    supplierRoundingTotal: roundingTotal,
    supplierPayableRemaining: nextRemainingCents / 100,
    supplierPaymentConfirmedBy: operatorName,
    supplierPaymentConfirmedByUserId: operatorId,
    supplierPaymentConfirmedAt: now,
    supplierPaymentNote: paymentRecord.note || before.supplierPaymentNote,
    updatedAt: now,
    accountingEffect: "supplier_payment_confirmed",
    inventoryEffect: "none",
    payableEffect: clearsBalance ? "supplier_payable_paid" : "supplier_payable_partially_paid",
    paymentEffect: clearsBalance ? "supplier_payment_confirmed" : "supplier_payment_installment_recorded",
  });
  const operationLog = buildOperationLog({
    targetId: review.reviewId,
    action: "confirm_raw_material_supplier_payment",
    operatorId,
    operatorName,
    before: summarizeReview(before),
    after: summarizeReview(review),
    reason: clearsBalance
      ? `财务确认供应商应付已付清（第 ${paymentRecord.installmentNo} 笔${roundingCents > 0 ? `，抹零 ${paymentRecord.roundingAmount}` : ""}）；记录付款确认号、金额和凭证，不写库存。`
      : `财务登记供应商第 ${paymentRecord.installmentNo} 笔付款 ${paymentRecord.paidAmount}，尚余 ${review.supplierPayableRemaining}；不写库存。`,
    now,
    idFactory: input.idFactory,
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
    revision: Math.max(1, Math.trunc(Number(input.revision) || 1)),
    supplierName: cleanText(input.supplierName),
    fileName: cleanText(input.fileName),
    sourceFileDigest: /^[a-f0-9]{64}$/u.test(cleanText(input.sourceFileDigest)) ? cleanText(input.sourceFileDigest) : "",
    periodStart: supplierStatementDay(input.periodStart),
    periodEnd: supplierStatementDay(input.periodEnd),
    supplierReturnPeriodRequired: input.supplierReturnPeriodRequired === true,
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
    linkedSupplierReturnIds: Array.isArray(input.linkedSupplierReturnIds) ? input.linkedSupplierReturnIds.map(cleanText).filter(Boolean) : [],
    addedSupplierReturnIds: Array.isArray(input.addedSupplierReturnIds) ? input.addedSupplierReturnIds.map(cleanText).filter(Boolean) : [],
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
    supplierPaymentRecords: listSupplierPaymentRecords(input),
    supplierPaidTotal: nullableNumber(input.supplierPaidTotal),
    supplierRoundingTotal: nullableNumber(input.supplierRoundingTotal),
    supplierPayableRemaining: nullableNumber(input.supplierPayableRemaining),
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
    linkedSupplierReturnCount: toNumber(input.linkedSupplierReturnCount),
    erpReturnAdjustmentCount: toNumber(input.erpReturnAdjustmentCount),
    totalWeightKg: toNumber(input.totalWeightKg),
    totalAmount: toNumber(input.totalAmount),
  };
}

function normalizePrecheckRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: cleanText(row.id) || `row-${index + 1}`,
    sourceSheet: cleanText(row.sourceSheet),
    sourceRow: toNumber(row.sourceRow),
    supplierName: cleanText(row.supplierName),
    documentDate: cleanText(row.documentDate),
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
    ...normalizeSupplierReturnTrace(row),
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
    confirmedAmountBy: cleanText(item.confirmedAmountBy),
    confirmedAmountByUserId: cleanText(item.confirmedAmountByUserId),
    confirmedAmountAt: cleanText(item.confirmedAmountAt),
    ...normalizeSupplierReturnTrace(item),
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

// Installment history. Reviews paid before installments existed carry only
// supplierPaymentRecord; treat that single record as installment one.
function listSupplierPaymentRecords(review = {}) {
  if (Array.isArray(review?.supplierPaymentRecords)) {
    return review.supplierPaymentRecords.map(normalizeSupplierPaymentRecord).filter(Boolean);
  }
  const single = normalizeSupplierPaymentRecord(review?.supplierPaymentRecord);
  return single ? [single] : [];
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
    roundingAmount: round2(input.roundingAmount) ?? 0,
    installmentNo: Math.max(1, Math.trunc(Number(input.installmentNo) || 1)),
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
    confirmedAmountBy: cleanText(item.confirmedAmountBy),
    confirmedAmountByUserId: cleanText(item.confirmedAmountByUserId),
    confirmedAmountAt: cleanText(item.confirmedAmountAt),
    ...normalizeSupplierReturnTrace(item),
  }));
}

function normalizeSupplierReturnTrace(input = {}) {
  const sourceEvidence = input.sourceEvidence && typeof input.sourceEvidence === "object" && !Array.isArray(input.sourceEvidence)
    ? {
        ...input.sourceEvidence,
        inboundId: cleanText(input.sourceEvidence.inboundId),
        attachmentId: cleanText(input.sourceEvidence.attachmentId),
        fileName: cleanText(input.sourceEvidence.fileName),
        mimeType: cleanText(input.sourceEvidence.mimeType),
        documentNo: cleanText(input.sourceEvidence.documentNo),
        documentDate: cleanText(input.sourceEvidence.documentDate),
        documentDirection: cleanText(input.sourceEvidence.documentDirection),
        supplierName: cleanText(input.sourceEvidence.supplierName),
        status: cleanText(input.sourceEvidence.status),
        lineEvidence: Array.isArray(input.sourceEvidence.lineEvidence)
          ? input.sourceEvidence.lineEvidence.map((line) => ({ ...line }))
          : [],
      }
    : null;
  return {
    sourceReturnInboundId: cleanText(input.sourceReturnInboundId),
    sourceAttachmentId: cleanText(input.sourceAttachmentId),
    sourceFileName: cleanText(input.sourceFileName),
    sourceMimeType: cleanText(input.sourceMimeType),
    sourceDocumentNo: cleanText(input.sourceDocumentNo),
    sourceDocumentDate: cleanText(input.sourceDocumentDate),
    sourceDocumentDirection: cleanText(input.sourceDocumentDirection),
    returnDedupeKey: cleanText(input.returnDedupeKey),
    returnMatchStatus: cleanText(input.returnMatchStatus),
    sourceEvidence,
  };
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
    periodStart: review.periodStart,
    periodEnd: review.periodEnd,
    addedSupplierReturnIds: review.addedSupplierReturnIds,
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
    supplierPaidTotal: review.supplierPaidTotal,
    supplierRoundingTotal: review.supplierRoundingTotal,
    supplierPayableRemaining: review.supplierPayableRemaining,
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
    paymentConfirmedCount: items.filter((item) => item.paymentStatus === "已确认付款").length,
    partiallyPaidCount: items.filter((item) => item.paymentStatus === "部分付款").length,
    blockedCount: items.filter((item) => item.status.includes("阻断")).length,
    candidateCount: items.filter((item) => toNumber(item.summary.candidateRowCount) > 0).length,
    unmatchedCount: items.filter((item) => toNumber(item.summary.unmatchedRowCount) > 0).length,
  };
}

function buildOperationLog(input = {}) {
  const now = cleanText(input.now) || new Date().toISOString();
  return normalizeOperationLog({
    id: createCollisionResistantId("RMSR-LOG", now, input.idFactory),
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

function createReviewId(now, idFactory) {
  return createCollisionResistantId("RMSR", now, idFactory);
}

function createStatementConfirmationId(now, idFactory) {
  return createCollisionResistantId("RMSRC", now, idFactory);
}

function createSupplierPayableId(now, idFactory) {
  return createCollisionResistantId("RMSP", now, idFactory);
}

function createSupplierPaymentConfirmationId(now, idFactory) {
  return createCollisionResistantId("RMSPAY", now, idFactory);
}

function createCollisionResistantId(prefix, now, idFactory = randomUUID) {
  const compactDate = cleanText(now).slice(0, 10).replaceAll("-", "") || "LOCAL";
  const entropy = cleanText(idFactory()).replaceAll("-", "").toUpperCase();
  if (!entropy) throw new TypeError("idFactory must return a non-empty identifier");
  return `${prefix}-${compactDate}-${entropy}`;
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
    settlementStage: cleanText(getQueryValue(query, "settlementStage")),
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
      settlementReceipts: Array.isArray(parsed.settlementReceipts) ? parsed.settlementReceipts : [],
    };
  } catch {
    return { rawMaterialSupplierStatementReviews: [] };
  }
}

function persistReviewState(storageRoot, reviews = [], settlementReceipts = []) {
  const filePath = getReviewFilePath(storageRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        rawMaterialSupplierStatementReviews: normalizeReviews(reviews),
        settlementReceipts,
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

function supplierReviewConflict() {
  return Object.assign(new Error("供应商对账或付款记录已被更新，请刷新后核对；原有确认和付款凭证未被覆盖。"), { statusCode: 409, code: "RAW_MATERIAL_SUPPLIER_REVIEW_CONFLICT" });
}
