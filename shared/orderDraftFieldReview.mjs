const FIELD_LABELS = {
  size: "尺寸",
  color: "袋色",
  handleColor: "提手颜色",
  colorHandle: "袋色/提手颜色",
};

export function createDraftFieldReview({ id, field, originalValue, suggestedValue, reason, sourceMessageId = "" }) {
  return {
    reviewId: id,
    field,
    fieldLabel: FIELD_LABELS[field] ?? field,
    originalValue: clean(originalValue),
    suggestedValue: clean(suggestedValue),
    reason: clean(reason),
    sourceMessageId: clean(sourceMessageId),
    status: "pending",
  };
}

export function getDraftFieldReviews(row = {}) {
  const reviews = Array.isArray(row.fieldReviews)
    ? row.fieldReviews
    : Array.isArray(row.recognitionEvidence?.fieldReviews)
      ? row.recognitionEvidence.fieldReviews
      : [];
  if (reviews.length) return reviews.map(normalizeReview).filter((review) => review.reviewId);

  const dimension = row.dimensionEvidence ?? row.recognitionEvidence?.dimensionEvidence;
  if (!dimension?.requiresConfirmation) return [];
  return [createDraftFieldReview({
    id: `legacy-dimension:${clean(row.id ?? row.draftLineId) || "line"}`,
    field: "size",
    originalValue: dimension.original,
    suggestedValue: dimension.suggested ?? row.size,
    reason: `疑似尺寸输入错误：${dimension.original || "原值未知"}`,
    sourceMessageId: row.sourceMessageId ?? row.recognitionEvidence?.sourceMessageId,
  })];
}

export function getPendingDraftFieldReviews(row = {}) {
  return getDraftFieldReviews(row).filter((review) => review.status !== "confirmed");
}

export function confirmDraftFieldReview(row, reviewId, { method = "accepted", value, operatorId = "", confirmedAt = "" } = {}) {
  const fieldReviews = getDraftFieldReviews(row).map((review) => review.reviewId === reviewId ? {
    ...review,
    status: "confirmed",
    confirmationMethod: method,
    confirmedValue: clean(value ?? getRowFieldValue(row, review.field) ?? review.suggestedValue),
    confirmedBy: clean(operatorId),
    confirmedAt: clean(confirmedAt),
  } : review);
  return applyReviews(row, fieldReviews);
}

export function confirmDraftFieldReviewsForEdit(row, field, value) {
  const matching = getPendingDraftFieldReviews(row).filter((review) => review.field === field || (review.field === "colorHandle" && ["color", "handleColor"].includes(field)));
  return matching.reduce(
    (current, review) => confirmDraftFieldReview(current, review.reviewId, { method: "edited", value }),
    row,
  );
}

export function mergePersistedDraftFieldReviews(incomingRow, persistedRow) {
  const incoming = getDraftFieldReviews(incomingRow);
  const persisted = getDraftFieldReviews(persistedRow);
  if (!persisted.length) return applyReviews(incomingRow, incoming);

  const incomingById = new Map(incoming.map((review) => [review.reviewId, review]));
  const merged = persisted.map((review) => {
    const candidate = incomingById.get(review.reviewId);
    if (review.status === "confirmed") return review;
    return candidate?.status === "confirmed" ? candidate : review;
  });
  for (const review of incoming) {
    if (!merged.some((item) => item.reviewId === review.reviewId)) merged.push(review);
  }
  return applyReviews(incomingRow, merged);
}

function applyReviews(row, fieldReviews) {
  const next = { ...row, fieldReviews };
  if (row.dimensionEvidence) {
    const sizeReview = fieldReviews.find((review) => review.field === "size");
    next.dimensionEvidence = sizeReview ? {
      ...row.dimensionEvidence,
      requiresConfirmation: sizeReview.status !== "confirmed",
      reviewStatus: sizeReview.status,
      confirmationMethod: sizeReview.confirmationMethod,
      confirmedValue: sizeReview.confirmedValue,
    } : row.dimensionEvidence;
  }
  return next;
}

function getRowFieldValue(row, field) {
  if (field === "colorHandle") return [row.color, row.handleColor].filter(Boolean).join(" / ");
  return row[field];
}

function normalizeReview(review) {
  return {
    ...review,
    reviewId: clean(review.reviewId ?? review.id),
    field: clean(review.field),
    fieldLabel: clean(review.fieldLabel) || FIELD_LABELS[review.field] || clean(review.field),
    originalValue: clean(review.originalValue),
    suggestedValue: clean(review.suggestedValue),
    reason: clean(review.reason),
    sourceMessageId: clean(review.sourceMessageId),
    status: review.status === "confirmed" ? "confirmed" : "pending",
  };
}

function clean(value) {
  return String(value ?? "").trim();
}
