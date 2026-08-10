const supplierAliasGroups = [
  ["人意无纺布", "人意无纺布销售单", "振恒"],
  ["宁晋县达翔塑料制品", "达翔塑料", "北陈", "河北北陈无纺布"],
  ["宁晋县腾胜无纺布", "腾胜无纺布", "腾胜"],
  ["河北宏尚无纺布", "宏尚无纺布", "白候", "白侯"],
  ["新乐市鑫隆宏无纺布", "鑫隆宏无纺布", "鑫隆宏"],
];

export function mergeReviewedSupplierReturnsIntoStatement(statementResult = {}, rawMaterialInbounds = [], options = {}) {
  const rows = (Array.isArray(statementResult.rows) ? statementResult.rows : []).map(normalizeStatementReturnDirection);
  const adjustments = (Array.isArray(statementResult.adjustments) ? statementResult.adjustments : []).map((item) => ({ ...item }));
  const issues = (Array.isArray(statementResult.issues) ? statementResult.issues : []).map((item) => ({ ...item }));
  const supplierName = cleanText(options.supplierName || statementResult.supplierName);
  const statementMonths = inferStatementMonths(statementResult, options.fileName);
  const usedRowIds = new Set();
  const usedAdjustmentIds = new Set();
  const linkedSupplierReturnIds = [];
  const addedSupplierReturnIds = [];

  const reviewedReturns = (Array.isArray(rawMaterialInbounds) ? rawMaterialInbounds : [])
    .filter(isReviewedSupplierReturn)
    .filter((item) => suppliersAreEquivalent(supplierName, item.supplierName))
    .sort((left, right) => returnDate(left).localeCompare(returnDate(right)) || cleanText(left.id).localeCompare(cleanText(right.id)));

  for (const supplierReturn of reviewedReturns) {
    const evidence = buildSupplierReturnEvidence(supplierReturn);
    const matchingRow = findMatchingReturnRow(rows, supplierReturn, usedRowIds);
    if (matchingRow) {
      Object.assign(matchingRow, buildReturnTraceFields(supplierReturn, evidence, "matched_statement_row"));
      usedRowIds.add(cleanText(matchingRow.id));
      linkedSupplierReturnIds.push(cleanText(supplierReturn.id));
      continue;
    }

    const matchingAdjustment = findMatchingReturnAdjustment(adjustments, supplierReturn, usedAdjustmentIds);
    if (matchingAdjustment) {
      normalizeReturnAdjustmentSign(matchingAdjustment);
      Object.assign(matchingAdjustment, buildReturnTraceFields(supplierReturn, evidence, "matched_statement_adjustment"));
      usedAdjustmentIds.add(cleanText(matchingAdjustment.id));
      linkedSupplierReturnIds.push(cleanText(supplierReturn.id));
      continue;
    }

    if (!returnBelongsToStatementPeriod(supplierReturn, statementMonths)) continue;
    adjustments.push(buildErpReturnAdjustment(supplierReturn, evidence));
    addedSupplierReturnIds.push(cleanText(supplierReturn.id));
    if (!hasReturnAmount(supplierReturn)) {
      issues.push({
        id: `issue-return-amount-${cleanText(supplierReturn.id)}`,
        severity: "warning",
        severityLabel: "需确认",
        message: `退货单 ${cleanText(supplierReturn.deliveryNoteNo) || cleanText(supplierReturn.id)} 已关联原单，但退货金额为 0；财务必须补齐实际抵扣金额后再确认对账。`,
        row: cleanText(supplierReturn.deliveryNoteNo) || cleanText(supplierReturn.id),
      });
    }
  }

  const summary = rebuildStatementSummary(statementResult.summary, rows, adjustments, {
    linkedSupplierReturnCount: linkedSupplierReturnIds.length,
    erpReturnAdjustmentCount: addedSupplierReturnIds.length,
  });
  return {
    ...statementResult,
    supplierName: supplierName || cleanText(statementResult.supplierName),
    rows,
    adjustments,
    issues,
    summary,
    linkedSupplierReturnIds: Array.from(new Set(linkedSupplierReturnIds)),
    addedSupplierReturnIds: Array.from(new Set(addedSupplierReturnIds)),
  };
}

function isReviewedSupplierReturn(item = {}) {
  return cleanText(item.documentDirection) === "supplier_return"
    && cleanText(item.status) === "退货单已复核"
    && Boolean(cleanText(item.id));
}

function normalizeStatementReturnDirection(row = {}) {
  const next = { ...row };
  if (cleanText(next.lineType) !== "return") return next;
  for (const key of ["quantity", "rollWeightKg", "totalWeightKg", "amount", "originalRowAmount", "originalRowWeightKg"]) {
    const value = nullableNumber(next[key]);
    if (Number.isFinite(value) && value !== 0) next[key] = -Math.abs(value);
  }
  return next;
}

function normalizeReturnAdjustmentSign(adjustment = {}) {
  for (const key of ["amount", "supplierReportedAmount", "calculatedAmount"]) {
    const value = nullableNumber(adjustment[key]);
    if (Number.isFinite(value) && value !== 0) adjustment[key] = -Math.abs(value);
  }
  adjustment.adjustmentType = "return_adjustment";
  adjustment.typeLabel = cleanText(adjustment.typeLabel) || "退货调整";
  adjustment.isCurrentPeriod = true;
}

function findMatchingReturnRow(rows, supplierReturn, usedRowIds) {
  const candidates = rows
    .filter((row) => cleanText(row.lineType) === "return" && !usedRowIds.has(cleanText(row.id)))
    .map((row) => ({ row, score: scoreReturnMatch(row, supplierReturn) }))
    .filter((candidate) => candidate.score >= 80)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.row ?? null;
}

function findMatchingReturnAdjustment(adjustments, supplierReturn, usedAdjustmentIds) {
  const candidates = adjustments
    .filter((item) => cleanText(item.adjustmentType) === "return_adjustment" && !usedAdjustmentIds.has(cleanText(item.id)))
    .map((adjustment) => ({ adjustment, score: scoreReturnMatch(adjustment, supplierReturn) }))
    .filter((candidate) => candidate.score >= 70)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.adjustment ?? null;
}

function scoreReturnMatch(candidate = {}, supplierReturn = {}) {
  let score = 0;
  const inboundId = cleanText(supplierReturn.id);
  const documentNo = cleanText(supplierReturn.deliveryNoteNo);
  if (inboundId && cleanText(candidate.matchedInboundId || candidate.sourceReturnInboundId) === inboundId) score += 120;
  if (documentNo && cleanText(candidate.documentNo || candidate.sourceDocumentNo) === documentNo) score += 110;
  if (documentNo && cleanText(candidate.label).includes(documentNo)) score += 100;

  const candidateAmount = nullableNumber(candidate.amount ?? candidate.supplierReportedAmount);
  const returnAmount = effectiveReturnAmount(supplierReturn);
  if (Number.isFinite(candidateAmount) && Number.isFinite(returnAmount) && Math.abs(Math.abs(candidateAmount) - Math.abs(returnAmount)) <= 0.01) {
    score += 55;
  }
  const candidateWeight = nullableNumber(candidate.totalWeightKg ?? candidate.rollWeightKg);
  const returnWeight = nullableNumber(supplierReturn.totalWeightKg);
  if (Number.isFinite(candidateWeight) && Number.isFinite(returnWeight) && Math.abs(Math.abs(candidateWeight) - Math.abs(returnWeight)) <= 0.1) {
    score += 25;
  }
  const candidateDate = cleanText(candidate.documentDate || candidate.sourceDocumentDate);
  const supplierReturnDate = returnDate(supplierReturn);
  if (candidateDate && supplierReturnDate && candidateDate.slice(0, 10) === supplierReturnDate.slice(0, 10)) score += 20;
  if (suppliersAreEquivalent(candidate.supplierName, supplierReturn.supplierName)) score += 20;
  if (textIntersects(candidate.spec || candidate.productName, [supplierReturn.spec, supplierReturn.productName, supplierReturn.materialType])) score += 10;
  if (textIntersects(candidate.color, [supplierReturn.supplierColor, supplierReturn.factoryColor])) score += 10;
  return score;
}

function buildErpReturnAdjustment(supplierReturn, evidence) {
  const amount = signedReturnAmount(effectiveReturnAmount(supplierReturn));
  return {
    id: `erp-return-${cleanText(supplierReturn.id)}`,
    label: `${cleanText(supplierReturn.deliveryNoteNo) || cleanText(supplierReturn.id)} 供应商退货`,
    adjustmentType: "return_adjustment",
    typeLabel: "退货调整",
    isCurrentPeriod: true,
    amount,
    supplierReportedAmount: signedReturnAmount(supplierReturn.ocrDeclaredAmount || supplierReturn.amount),
    calculatedAmount: signedReturnAmount(supplierReturn.ocrCalculatedLineAmount || supplierReturn.amount),
    calculationStatus: hasReturnAmount(supplierReturn) ? "reviewed_erp_return" : "missing_amount",
    calculationBasis: null,
    configuredRule: null,
    requiresManualReview: true,
    note: supplierReturn.documentPriceReferenceOnly === true && !hasReturnAmount(supplierReturn)
      ? "ERP 已复核退货原单只保留票面价格证据；实际退货抵扣金额待厂家月结或财务确认，不生成入库标签、不增加库存。"
      : "ERP 已复核退货单形成的本期负数对账调整；不生成入库标签、不增加库存。厂家月结若包含同一退货，只匹配此记录，不重复扣减。",
    ...buildReturnTraceFields(supplierReturn, evidence, "erp_return_adjustment"),
  };
}

function buildReturnTraceFields(supplierReturn, sourceEvidence, returnMatchStatus) {
  return {
    sourceReturnInboundId: cleanText(supplierReturn.id),
    sourceAttachmentId: cleanText(supplierReturn.sourceAttachmentId),
    sourceFileName: cleanText(supplierReturn.sourceFileName),
    sourceMimeType: cleanText(supplierReturn.sourceMimeType),
    sourceDocumentNo: cleanText(supplierReturn.deliveryNoteNo),
    sourceDocumentDate: returnDate(supplierReturn),
    sourceDocumentDirection: "supplier_return",
    returnDedupeKey: buildReturnDedupeKey(supplierReturn),
    returnMatchStatus,
    sourceEvidence,
  };
}

function buildSupplierReturnEvidence(supplierReturn = {}) {
  return {
    inboundId: cleanText(supplierReturn.id),
    attachmentId: cleanText(supplierReturn.sourceAttachmentId),
    fileName: cleanText(supplierReturn.sourceFileName),
    mimeType: cleanText(supplierReturn.sourceMimeType),
    documentNo: cleanText(supplierReturn.deliveryNoteNo),
    documentDate: returnDate(supplierReturn),
    documentDirection: "supplier_return",
    documentTypeLabel: cleanText(supplierReturn.documentTypeLabel) || "退货单",
    supplierName: cleanText(supplierReturn.supplierName),
    status: cleanText(supplierReturn.status),
    reviewedAt: cleanText(supplierReturn.reviewedAt),
    reviewedBy: cleanText(supplierReturn.reviewedBy),
    ocrRawText: cleanText(supplierReturn.ocrRawText),
    lineEvidence: (Array.isArray(supplierReturn.ocrLines) ? supplierReturn.ocrLines : []).map((line) => ({
      lineId: cleanText(line.lineId),
      sourceRowIndex: Math.max(0, Number(line.sourceRowIndex) || 0),
      sourceText: cleanText(line.sourceText),
      sourceBounds: line.sourceBounds && typeof line.sourceBounds === "object" ? { ...line.sourceBounds } : null,
      recognizedValues: line.recognizedValues && typeof line.recognizedValues === "object" ? { ...line.recognizedValues } : {},
      reviewedValues: line.values && typeof line.values === "object" ? { ...line.values } : {},
      reviewStatus: cleanText(line.reviewStatus),
      reviewedAt: cleanText(line.reviewedAt),
    })),
  };
}

function rebuildStatementSummary(summary = {}, rows = [], adjustments = [], counts = {}) {
  const returnRows = rows.filter((row) => cleanText(row.lineType) === "return");
  const totalWeightKg = round2(rows.reduce((sum, row) => sum + (nullableNumber(row.totalWeightKg) || 0), 0));
  const totalAmount = round2(rows.reduce((sum, row) => sum + (nullableNumber(row.amount) || 0), 0));
  const status = cleanText(summary.status) === "blocked"
    ? "blocked"
    : adjustments.length || returnRows.length || Number(summary.candidateRowCount) || Number(summary.unmatchedRowCount)
      ? "review"
      : cleanText(summary.status);
  return {
    ...summary,
    status,
    statusLabel: status === "blocked" ? cleanText(summary.statusLabel) || "无法识别" : status === "review" ? "需人工复核" : cleanText(summary.statusLabel),
    rowCount: rows.length,
    shipmentRowCount: rows.length - returnRows.length,
    returnRowCount: returnRows.length,
    adjustmentCount: adjustments.length,
    linkedSupplierReturnCount: Number(counts.linkedSupplierReturnCount) || 0,
    erpReturnAdjustmentCount: Number(counts.erpReturnAdjustmentCount) || 0,
    totalWeightKg,
    totalAmount,
  };
}

function inferStatementMonths(statementResult = {}, fileName = "") {
  const months = new Set();
  for (const row of Array.isArray(statementResult.rows) ? statementResult.rows : []) {
    const month = extractMonth(row.documentDate);
    if (month) months.add(month);
  }
  if (!months.size) {
    const fileMonth = extractMonth(fileName || statementResult.fileName);
    if (fileMonth) months.add(fileMonth);
  }
  return months;
}

function returnBelongsToStatementPeriod(supplierReturn, statementMonths) {
  if (!statementMonths.size) return false;
  const month = extractMonth(returnDate(supplierReturn));
  return Boolean(month && statementMonths.has(month));
}

function extractMonth(value) {
  const text = cleanText(value);
  const match = text.match(/(20\d{2})[-/.年]?([01]?\d)(?:[-/.月]?\d{1,2})?/);
  if (!match) return "";
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

export function suppliersAreEquivalent(left, right) {
  const leftKey = normalizeSupplierName(left);
  const rightKey = normalizeSupplierName(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey)) return true;
  return supplierAliasGroups.some((group) => {
    const aliases = group.map(normalizeSupplierName);
    return aliases.some((alias) => leftKey.includes(alias) || alias.includes(leftKey))
      && aliases.some((alias) => rightKey.includes(alias) || alias.includes(rightKey));
  });
}

function normalizeSupplierName(value) {
  return cleanText(value)
    .replace(/[\s·,，。()（）\-_/]/g, "")
    .replace(/有限责任公司|股份有限公司|有限公司|销售单|销货单|退货单|无纺布/g, "");
}

function buildReturnDedupeKey(supplierReturn = {}) {
  return [
    normalizeSupplierName(supplierReturn.supplierName),
    cleanText(supplierReturn.deliveryNoteNo) || cleanText(supplierReturn.id),
    returnDate(supplierReturn),
    Math.abs(nullableNumber(supplierReturn.totalWeightKg) || 0).toFixed(2),
    Math.abs(nullableNumber(supplierReturn.amount) || 0).toFixed(2),
  ].join("|");
}

function returnDate(supplierReturn = {}) {
  return cleanText(supplierReturn.receivedAt || supplierReturn.reviewedAt || supplierReturn.ocrRecognizedAt).slice(0, 10);
}

function hasReturnAmount(supplierReturn = {}) {
  return Math.abs(effectiveReturnAmount(supplierReturn) || 0) > 0.001;
}

function effectiveReturnAmount(supplierReturn = {}) {
  const confirmedAmount = nullableNumber(
    supplierReturn.confirmedSettlementAmount
      ?? supplierReturn.reconciliationAmount
      ?? supplierReturn.actualSettlementAmount,
  );
  if (Number.isFinite(confirmedAmount)) return confirmedAmount;
  if (supplierReturn.documentPriceReferenceOnly === true) return null;
  return nullableNumber(supplierReturn.amount);
}

function signedReturnAmount(value) {
  const number = nullableNumber(value);
  return Number.isFinite(number) && number !== 0 ? -Math.abs(number) : 0;
}

function textIntersects(value, candidates = []) {
  const source = cleanText(value);
  return Boolean(source) && candidates.map(cleanText).filter(Boolean).some((candidate) => source.includes(candidate) || candidate.includes(source));
}

function nullableNumber(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round2(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
