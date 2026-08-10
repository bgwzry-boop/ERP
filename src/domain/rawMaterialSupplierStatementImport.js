import { readMasterDataWorkbook } from "./masterDataImportPrecheck.js";

export const RAW_MATERIAL_SUPPLIER_STATEMENT_IMPORT_VERSION = "p0-raw-material-supplier-statement-import-v1";

const knownAdapters = {
  baihou: {
    key: "baihou",
    label: "白侯对账单模板",
    description: "单 sheet 对账单，重1-重5 拆成卷级行，footer 作为调整项。",
  },
  beichen: {
    key: "beichen",
    label: "北陈每日发货明细模板",
    description: "每日发货明细按批号强匹配，退货分段按表头归一化。",
  },
  generic: {
    key: "generic",
    label: "通用供应商对账模板",
    description: "按常见日期、单号、品名、规格、颜色、重量、单价、金额字段归一化。",
  },
};

export const defaultRawMaterialSupplierAdjustmentRules = [
  {
    key: "baihou.paper_tube_deduction",
    supplierMatchers: ["白侯", "baihou"],
    adapterKey: "baihou",
    matchKeywords: ["纸管"],
    adjustmentType: "paper_tube_deduction",
    label: "纸管扣项",
    unitRate: 3.5,
    unit: "元/件",
    quantityField: "quantity",
    amountMode: "calculated",
    sign: "deduction",
    currentPeriod: true,
  },
];

const fieldMatchers = {
  documentDate: [/制单日期/, /发货日期/, /^日期$/, /单据日期/],
  documentNo: [/^单号$/, /单据编号/, /送货单号/, /发货单号/],
  customerName: [/客户/, /收货单位/, /单位名称/],
  productName: [/商品名称/, /货品/, /品名/, /产品名称/, /材料名称/],
  spec: [/规格/, /规格型号/, /型号/],
  color: [/颜色/, /色号/],
  quantity: [/数量/, /件数/, /卷数/],
  batchNo: [/批号/, /批次/],
  totalWeightKg: [/总重/, /重量/, /公斤/, /^kg$/i],
  unitPrice: [/单价/],
  amount: [/金额/, /合计金额/, /货款/],
};

const excelDateMsPerDay = 24 * 60 * 60 * 1000;
const excelDateBaseUtcMs = Date.UTC(1899, 11, 30);

export async function precheckRawMaterialSupplierStatementWorkbook(input = {}) {
  const workbook = await readMasterDataWorkbook(input.bytes ?? input.workbook);
  return normalizeRawMaterialSupplierStatementWorkbook(workbook, input);
}

export function normalizeRawMaterialSupplierStatementWorkbook(workbook, input = {}) {
  const adapter = detectSupplierStatementAdapter(workbook, input);
  const issues = [];
  const adjustments = [];
  const rows =
    adapter.key === "baihou"
      ? parseBaihouWorkbook(workbook, input, issues, adjustments)
      : adapter.key === "beichen"
        ? parseGenericSupplierWorkbook(workbook, input, issues, adjustments, { preferredAdapter: adapter.key })
        : parseGenericSupplierWorkbook(workbook, input, issues, adjustments, { preferredAdapter: adapter.key });

  const matchedRows = applyInboundMatching(rows, input.existingInbounds ?? [], issues);
  if (!matchedRows.length) {
    issues.push(createIssue("error", "", "", "未识别到供应商对账明细，请确认上传的是月结发货明细 Excel。"));
  }

  const summary = buildSummary(matchedRows, adjustments, issues);
  return {
    version: RAW_MATERIAL_SUPPLIER_STATEMENT_IMPORT_VERSION,
    fileName: cleanText(input.fileName),
    importedAt: cleanText(input.importedAt) || new Date().toISOString(),
    supplierName: cleanText(input.supplierName) || inferSupplierName(matchedRows, input),
    adapter,
    summary,
    rows: matchedRows,
    adjustments,
    issues: sortIssues(issues),
    recommendedAction: getRecommendedAction(summary.status),
  };
}

export function detectSupplierStatementAdapter(workbook, input = {}) {
  const hint = cleanText(input.supplierName).toLowerCase();
  const sheetNames = (workbook?.sheets ?? []).map((sheet) => cleanText(sheet.name)).join(" ");
  const allCells = (workbook?.sheets ?? [])
    .flatMap((sheet) => sheet.rows ?? [])
    .flatMap((row) => row.cells ?? [])
    .map(cleanText)
    .join(" ");

  if (hint.includes("白侯") || sheetNames.includes("对账单") && /重1|重2|重3/.test(allCells)) {
    return knownAdapters.baihou;
  }
  if (hint.includes("北陈") || sheetNames.includes("每日发货明细") || allCells.includes("批号")) {
    return knownAdapters.beichen;
  }
  return knownAdapters.generic;
}

function parseBaihouWorkbook(workbook, input, issues, adjustments) {
  const sheet =
    (workbook?.sheets ?? []).find((item) => cleanText(item.name).includes("对账单"))
    ?? (workbook?.sheets ?? [])[0];
  if (!sheet) return [];
  const headerIndex = findBaihouHeaderIndex(sheet.rows ?? []);
  if (headerIndex < 0) {
    issues.push(createIssue("error", sheet.name, "", "未找到白侯对账单表头：制单日期、单号、商品名称、颜色、重1-重5。"));
    return [];
  }

  const header = (sheet.rows[headerIndex]?.cells ?? []).map(cleanText);
  const columnIndexes = buildColumnIndexes(header);
  const weightColumns = header
    .map((name, index) => ({ name, index }))
    .filter((column) => /^重\d+$/.test(column.name));
  const rows = [];

  for (const row of (sheet.rows ?? []).slice(headerIndex + 1)) {
    const cells = row.cells ?? [];
    if (isBlankRow(cells)) continue;
    const rowText = cells.map(cleanText).filter(Boolean).join(" ");
    if (isAdjustmentRowText(rowText)) {
      adjustments.push(buildAdjustment(row, sheet.name, rowText, input, issues, {
        adapterKey: "baihou",
        columnIndexes,
      }));
      continue;
    }
    const documentNo = fieldValue(cells, columnIndexes, "单号");
    const productName = fieldValue(cells, columnIndexes, "商品名称");
    const color = fieldValue(cells, columnIndexes, "颜色");
    const totalWeightKg = parseNumber(fieldValue(cells, columnIndexes, "总重"));
    const amount = parseNumber(fieldValue(cells, columnIndexes, "金额"));
    const unitPrice = parseNumber(fieldValue(cells, columnIndexes, "单价"));
    if (!productName && !documentNo && !color) continue;

    const rollWeights = weightColumns
      .map((column) => ({
        rollLabel: column.name,
        weightKg: parseNumber(cells[column.index]),
      }))
      .filter((roll) => Number.isFinite(roll.weightKg) && roll.weightKg !== 0);
    const denominator = Math.abs(totalWeightKg || rollWeights.reduce((sum, roll) => sum + roll.weightKg, 0)) || 1;
    const lineType = getLineType({ amount, totalWeightKg, quantity: parseNumber(fieldValue(cells, columnIndexes, "数量")) });

    if (!rollWeights.length) {
      rows.push(normalizeStatementRow({
        id: buildStatementRowId("baihou", sheet.name, row.rowNumber, 0),
        sourceSheet: sheet.name,
        sourceRow: row.rowNumber,
        adapterKey: "baihou",
        lineType,
        supplierName: cleanText(input.supplierName) || "白侯无纺布",
        documentDate: normalizeDateValue(fieldValue(cells, columnIndexes, "制单日期")),
        documentNo,
        customerName: fieldValue(cells, columnIndexes, "客户名称"),
        productName,
        spec: fieldValue(cells, columnIndexes, "规格型号") || productName,
        color,
        quantity: parseNumber(fieldValue(cells, columnIndexes, "数量")),
        totalWeightKg,
        unitPrice,
        amount,
      }));
      continue;
    }

    rollWeights.forEach((roll, index) => {
      const ratio = Math.abs(roll.weightKg) / denominator;
      rows.push(normalizeStatementRow({
        id: buildStatementRowId("baihou", sheet.name, row.rowNumber, index + 1),
        sourceSheet: sheet.name,
        sourceRow: row.rowNumber,
        adapterKey: "baihou",
        lineType,
        supplierName: cleanText(input.supplierName) || "白侯无纺布",
        documentDate: normalizeDateValue(fieldValue(cells, columnIndexes, "制单日期")),
        documentNo,
        customerName: fieldValue(cells, columnIndexes, "客户名称"),
        productName,
        spec: fieldValue(cells, columnIndexes, "规格型号") || productName,
        color,
        rollIndex: index + 1,
        rollLabel: roll.rollLabel,
        rollWeightKg: round2(roll.weightKg),
        totalWeightKg: round2(roll.weightKg),
        unitPrice,
        amount: Number.isFinite(amount) ? round2(amount * ratio) : null,
        originalRowAmount: amount,
        originalRowWeightKg: totalWeightKg,
      }));
    });
  }
  return rows;
}

function parseGenericSupplierWorkbook(workbook, input, issues, adjustments, options = {}) {
  const rows = [];
  for (const sheet of workbook?.sheets ?? []) {
    const segments = findTableSegments(sheet.rows ?? []);
    if (!segments.length) {
      const sheetText = (sheet.rows ?? []).flatMap((row) => row.cells ?? []).map(cleanText).join(" ");
      if (isAdjustmentRowText(sheetText)) {
        adjustments.push(buildAdjustment({ rowNumber: 1, cells: [sheetText] }, sheet.name, sheetText, input, issues, {
          adapterKey: options.preferredAdapter || "generic",
        }));
      }
      continue;
    }
    for (const segment of segments) {
      const dataRows = (sheet.rows ?? []).slice(segment.headerIndex + 1, segment.endIndex);
      for (const row of dataRows) {
        const cells = row.cells ?? [];
        if (isBlankRow(cells)) continue;
        const rowText = cells.map(cleanText).filter(Boolean).join(" ");
        if (isAdjustmentRowText(rowText)) {
          adjustments.push(buildAdjustment(row, sheet.name, rowText, input, issues, {
            adapterKey: options.preferredAdapter || "generic",
            headerMap: segment.headerMap,
          }));
          continue;
        }
        const normalized = normalizeStatementRow({
          id: buildStatementRowId(options.preferredAdapter || "generic", sheet.name, row.rowNumber, 0),
          sourceSheet: sheet.name,
          sourceRow: row.rowNumber,
          adapterKey: options.preferredAdapter || "generic",
          lineType: segment.lineType,
          supplierName: cleanText(input.supplierName) || inferSupplierNameFromSheet(sheet.name),
          documentDate: normalizeDateValue(valueByField(cells, segment.headerMap, "documentDate")),
          documentNo: valueByField(cells, segment.headerMap, "documentNo"),
          customerName: valueByField(cells, segment.headerMap, "customerName"),
          productName: valueByField(cells, segment.headerMap, "productName"),
          spec: valueByField(cells, segment.headerMap, "spec"),
          color: valueByField(cells, segment.headerMap, "color"),
          quantity: parseNumber(valueByField(cells, segment.headerMap, "quantity")),
          batchNo: valueByField(cells, segment.headerMap, "batchNo"),
          totalWeightKg: parseNumber(valueByField(cells, segment.headerMap, "totalWeightKg")),
          unitPrice: parseNumber(valueByField(cells, segment.headerMap, "unitPrice")),
          amount: parseNumber(valueByField(cells, segment.headerMap, "amount")),
        });
        normalized.lineType = getLineType(normalized, segment.lineType);
        if (hasBusinessValue(normalized)) rows.push(normalized);
      }
    }
  }
  if (!rows.length) {
    issues.push(createIssue("warning", "", "", "未能按通用字段识别明细，可能需要新增供应商模板适配器。"));
  }
  return rows;
}

function findBaihouHeaderIndex(rows = []) {
  return rows.findIndex((row) => {
    const cells = (row.cells ?? []).map(cleanText);
    return cells.includes("制单日期") && cells.includes("单号") && cells.some((cell) => /^重\d+$/.test(cell));
  });
}

function findTableSegments(rows = []) {
  const segments = [];
  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index]?.cells ?? [];
    const headerMap = buildFuzzyHeaderMap(cells);
    if (!isUsefulHeaderMap(headerMap)) continue;
    const previousText = rows
      .slice(Math.max(0, index - 2), index + 1)
      .flatMap((row) => row.cells ?? [])
      .map(cleanText)
      .join(" ");
    const nextHeaderIndex = findNextUsefulHeaderIndex(rows, index + 1);
    segments.push({
      headerIndex: index,
      endIndex: nextHeaderIndex < 0 ? rows.length : nextHeaderIndex,
      headerMap,
      lineType: previousText.includes("退货") ? "return" : "shipment",
    });
  }
  return segments;
}

function findNextUsefulHeaderIndex(rows, startIndex) {
  for (let index = startIndex; index < rows.length; index += 1) {
    if (isUsefulHeaderMap(buildFuzzyHeaderMap(rows[index]?.cells ?? []))) return index;
  }
  return -1;
}

function buildFuzzyHeaderMap(cells = []) {
  const map = {};
  cells.forEach((cell, index) => {
    const text = cleanText(cell);
    if (!text) return;
    for (const [field, matchers] of Object.entries(fieldMatchers)) {
      if (map[field] != null) continue;
      if (matchers.some((matcher) => matcher.test(text))) map[field] = index;
    }
  });
  return map;
}

function isUsefulHeaderMap(headerMap) {
  const fields = Object.keys(headerMap);
  if (fields.length < 4) return false;
  return Boolean(headerMap.productName != null || headerMap.spec != null || headerMap.batchNo != null)
    && Boolean(headerMap.amount != null || headerMap.totalWeightKg != null || headerMap.quantity != null);
}

function applyInboundMatching(rows, existingInbounds, issues) {
  const inbounds = Array.isArray(existingInbounds) ? existingInbounds : [];
  return rows.map((row) => {
    const candidates = inbounds
      .map((inbound) => scoreInboundCandidate(row, inbound))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);
    const best = candidates[0] ?? null;
    const matchingStatus = best?.score >= 90 ? "matched" : best?.score >= 60 ? "candidate" : "unmatched";
    if (matchingStatus === "unmatched") {
      issues.push(createIssue("warning", row.sourceSheet, row.sourceRow, `未匹配 ERP 原材料入库记录：${row.documentNo || row.batchNo || row.productName || row.id}`));
    }
    return {
      ...row,
      matchingStatus,
      matchedInboundId: best?.inboundId ?? "",
      matchedRollId: best?.rollId ?? "",
      matchScore: best?.score ?? 0,
      matchReasons: best?.reasons ?? [],
      matchCandidates: candidates.slice(0, 3),
    };
  });
}

function scoreInboundCandidate(row, inbound = {}) {
  let score = 0;
  const reasons = [];
  const documentNo = cleanText(row.documentNo);
  if (documentNo && documentNo === cleanText(inbound.deliveryNoteNo)) {
    score += 95;
    reasons.push("供应商单号精确匹配");
  }
  const batchNo = cleanText(row.batchNo);
  const matchedRoll = (inbound.rolls ?? []).find((roll) => {
    const supplierRollNo = cleanText(roll.supplierRollNo);
    return batchNo && (supplierRollNo === batchNo || supplierRollNo.includes(batchNo) || batchNo.includes(supplierRollNo));
  });
  if (matchedRoll) {
    score += 92;
    reasons.push("批号/卷号匹配");
  }
  const supplierName = cleanText(row.supplierName);
  if (supplierName && cleanText(inbound.supplierName).includes(supplierName.slice(0, 2))) {
    score += 15;
    reasons.push("供应商候选一致");
  }
  if (textIntersects(row.color, [inbound.supplierColor, inbound.factoryColor])) {
    score += 15;
    reasons.push("颜色候选一致");
  }
  if (textIntersects(row.spec || row.productName, [inbound.spec, inbound.productName, inbound.materialType])) {
    score += 15;
    reasons.push("规格/品名候选一致");
  }
  const rowWeight = Number(row.rollWeightKg ?? row.totalWeightKg);
  if (Number.isFinite(rowWeight) && rowWeight > 0) {
    const hasNearRollWeight = (inbound.rolls ?? []).some((roll) => {
      const rollWeight = Number(roll.weightKg);
      return Number.isFinite(rollWeight) && Math.abs(rollWeight - rowWeight) <= Math.max(0.5, rollWeight * 0.01);
    });
    if (hasNearRollWeight) {
      score += 25;
      reasons.push("分卷重量候选一致");
    }
    const inboundTotalWeight = Number(inbound.totalWeightKg);
    if (Number.isFinite(inboundTotalWeight) && Math.abs(inboundTotalWeight - rowWeight) <= Math.max(1, inboundTotalWeight * 0.01)) {
      score += 30;
      reasons.push("总重量候选一致");
    }
  }
  return {
    inboundId: inbound.id,
    rollId: matchedRoll?.id ?? "",
    score: Math.min(100, score),
    reasons,
  };
}

function buildSummary(rows, adjustments, issues) {
  const shipmentRows = rows.filter((row) => row.lineType === "shipment");
  const returnRows = rows.filter((row) => row.lineType === "return");
  const matchedRows = rows.filter((row) => row.matchingStatus === "matched");
  const candidateRows = rows.filter((row) => row.matchingStatus === "candidate");
  const unmatchedRows = rows.filter((row) => row.matchingStatus === "unmatched");
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length + candidateRows.length + unmatchedRows.length;
  const status = errorCount ? "blocked" : warningCount || adjustments.length ? "review" : "passed";
  return {
    status,
    statusLabel: status === "passed" ? "可进入人工确认" : status === "review" ? "需人工复核" : "无法识别",
    rowCount: rows.length,
    shipmentRowCount: shipmentRows.length,
    returnRowCount: returnRows.length,
    matchedRowCount: matchedRows.length,
    candidateRowCount: candidateRows.length,
    unmatchedRowCount: unmatchedRows.length,
    adjustmentCount: adjustments.length,
    totalWeightKg: round2(rows.reduce((sum, row) => sum + (Number(row.totalWeightKg) || 0), 0)),
    totalAmount: round2(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)),
    issueCount: issues.length,
    errorCount,
    warningCount,
  };
}

function normalizeStatementRow(input) {
  const isReturn = input.lineType === "return";
  return {
    id: cleanText(input.id),
    sourceSheet: cleanText(input.sourceSheet),
    sourceRow: Number(input.sourceRow) || 0,
    adapterKey: cleanText(input.adapterKey),
    lineType: isReturn ? "return" : "shipment",
    supplierName: cleanText(input.supplierName),
    documentDate: cleanText(input.documentDate),
    documentNo: cleanText(input.documentNo),
    customerName: cleanText(input.customerName),
    productName: cleanText(input.productName),
    spec: cleanText(input.spec),
    color: cleanText(input.color),
    quantity: signedStatementValue(input.quantity, isReturn),
    batchNo: cleanText(input.batchNo),
    rollIndex: Number(input.rollIndex) || null,
    rollLabel: cleanText(input.rollLabel),
    rollWeightKg: signedStatementValue(input.rollWeightKg, isReturn),
    totalWeightKg: signedStatementValue(input.totalWeightKg, isReturn),
    unitPrice: nullableNumber(input.unitPrice),
    amount: signedStatementValue(input.amount, isReturn),
    originalRowAmount: signedStatementValue(input.originalRowAmount, isReturn),
    originalRowWeightKg: signedStatementValue(input.originalRowWeightKg, isReturn),
  };
}

function signedStatementValue(value, isReturn) {
  const number = nullableNumber(value);
  if (!Number.isFinite(number) || !isReturn || number === 0) return number;
  return -Math.abs(number);
}

function hasBusinessValue(row) {
  return Boolean(row.documentNo || row.batchNo || row.productName || row.spec || row.color || Number.isFinite(row.amount) || Number.isFinite(row.totalWeightKg));
}

function buildAdjustment(row, sheetName, rowText, input, issues = [], context = {}) {
  const text = cleanText(rowText);
  const supplierName = cleanText(input.supplierName);
  const adjustmentType = classifyAdjustmentText(text);
  const rule = findAdjustmentRule({
    input,
    supplierName,
    adapterKey: cleanText(context.adapterKey),
    rowText: text,
    adjustmentType,
  });
  const reportedAmount = findLastNumber(row.cells);
  const quantity = extractAdjustmentQuantity(row.cells, context, text);
  const unitRate = nullableNumber(rule?.unitRate);
  const calculatedAmount =
    rule && adjustmentType === "paper_tube_deduction" && Number.isFinite(quantity) && Number.isFinite(unitRate)
      ? calculateRuleAmount(quantity, unitRate, rule)
      : null;
  const amount =
    rule?.amountMode === "calculated" && Number.isFinite(calculatedAmount)
      ? calculatedAmount
      : Number.isFinite(reportedAmount)
        ? reportedAmount
        : calculatedAmount;
  const calculationStatus = getAdjustmentCalculationStatus(reportedAmount, calculatedAmount);
  if (calculationStatus === "different") {
    issues.push(createIssue(
      "warning",
      sheetName,
      row.rowNumber,
      `${rule.label || "扣项"}按${quantity}件 * ${unitRate}${rule.unit || "元/件"} = ${calculatedAmount}；供应商 footer 金额 ${reportedAmount} 不一致，可能包含退货或其它扣项，需人工拆分确认。`,
    ));
  }
  const isCurrentPeriod = rule?.currentPeriod === false ? false : adjustmentType !== "reference_balance";
  return {
    id: buildStatementRowId("adjustment", sheetName, row.rowNumber, 0),
    supplierName,
    sourceSheet: cleanText(sheetName),
    sourceRow: Number(row.rowNumber) || 0,
    label: text.slice(0, 80),
    adjustmentType,
    typeLabel: getAdjustmentTypeLabel(adjustmentType),
    isCurrentPeriod,
    amount: nullableNumber(amount),
    supplierReportedAmount: nullableNumber(reportedAmount),
    calculatedAmount: nullableNumber(calculatedAmount),
    calculationStatus,
    calculationBasis: buildAdjustmentCalculationBasis({ quantity, unitRate, calculatedAmount, rule }),
    configuredRule: rule ? summarizeAdjustmentRule(rule) : null,
    requiresManualReview: true,
    note: getAdjustmentNote(adjustmentType, rule),
  };
}

function classifyAdjustmentText(text) {
  const value = cleanText(text);
  if (/历史|欠款|余额|总欠款|上期|期初/.test(value)) return "reference_balance";
  if (/纸管/.test(value)) return "paper_tube_deduction";
  if (/退货|减退货/.test(value)) return "return_adjustment";
  return "current_period_adjustment";
}

function getAdjustmentTypeLabel(adjustmentType) {
  if (adjustmentType === "paper_tube_deduction") return "纸管扣项";
  if (adjustmentType === "return_adjustment") return "退货调整";
  if (adjustmentType === "reference_balance") return "历史欠款/余额参考";
  return "本期调整";
}

function findAdjustmentRule({ input = {}, supplierName, adapterKey, rowText, adjustmentType }) {
  return getSupplierAdjustmentRules(input).find((rule) => {
    if (rule.adjustmentType && rule.adjustmentType !== adjustmentType) return false;
    if (rule.adapterKey && adapterKey && rule.adapterKey !== adapterKey) return false;
    if (rule.supplierMatchers.length && !matchesAnyText(supplierName, rule.supplierMatchers)) return false;
    if (rule.matchKeywords.length && !matchesAnyText(rowText, rule.matchKeywords)) return false;
    return true;
  }) ?? null;
}

function getSupplierAdjustmentRules(input = {}) {
  const rules = Array.isArray(input.supplierAdjustmentRules) && input.supplierAdjustmentRules.length
    ? input.supplierAdjustmentRules
    : defaultRawMaterialSupplierAdjustmentRules;
  return rules.map(normalizeAdjustmentRule).filter((rule) => rule.key);
}

function normalizeAdjustmentRule(rule = {}) {
  return {
    key: cleanText(rule.key),
    supplierMatchers: toCleanArray(rule.supplierMatchers ?? rule.supplierNames),
    adapterKey: cleanText(rule.adapterKey),
    matchKeywords: toCleanArray(rule.matchKeywords ?? rule.keywords),
    adjustmentType: cleanText(rule.adjustmentType),
    label: cleanText(rule.label),
    unitRate: nullableNumber(rule.unitRate ?? rule.rate),
    unit: cleanText(rule.unit),
    quantityField: cleanText(rule.quantityField) || "quantity",
    amountMode: cleanText(rule.amountMode) || "reported",
    sign: cleanText(rule.sign) || "deduction",
    currentPeriod: rule.currentPeriod !== false,
  };
}

function toCleanArray(value) {
  return (Array.isArray(value) ? value : [value]).map(cleanText).filter(Boolean);
}

function matchesAnyText(value, candidates = []) {
  const text = cleanText(value).toLowerCase();
  return Boolean(text) && candidates.some((candidate) => {
    const item = cleanText(candidate).toLowerCase();
    return item && (text.includes(item) || item.includes(text));
  });
}

function extractAdjustmentQuantity(cells = [], context = {}, rowText = "") {
  const byColumn = getAdjustmentQuantityFromContext(cells, context);
  if (Number.isFinite(byColumn)) return byColumn;
  const textMatch = cleanText(rowText).match(/(-?\d+(?:\.\d+)?)\s*(?:件|卷|个)/);
  if (textMatch) return nullableNumber(textMatch[1]);
  return null;
}

function getAdjustmentQuantityFromContext(cells = [], context = {}) {
  const columnIndexes = context.columnIndexes;
  if (columnIndexes instanceof Map && columnIndexes.has("数量")) {
    const value = parseNumber(cells[columnIndexes.get("数量")]);
    if (Number.isFinite(value)) return value;
  }
  const headerMap = context.headerMap;
  if (headerMap && headerMap.quantity != null) {
    const value = parseNumber(cells[headerMap.quantity]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function calculateRuleAmount(quantity, unitRate, rule = {}) {
  const amount = round2(Math.abs(Number(quantity)) * Math.abs(Number(unitRate)));
  if (!Number.isFinite(amount)) return null;
  return rule.sign === "addition" ? amount : -amount;
}

function getAdjustmentCalculationStatus(reportedAmount, calculatedAmount) {
  if (!Number.isFinite(calculatedAmount)) return "not_calculated";
  if (!Number.isFinite(reportedAmount)) return "calculated";
  return Math.abs(Number(reportedAmount) - Number(calculatedAmount)) <= 0.01 ? "matched" : "different";
}

function buildAdjustmentCalculationBasis({ quantity, unitRate, calculatedAmount, rule }) {
  if (!rule || !Number.isFinite(quantity) || !Number.isFinite(unitRate) || !Number.isFinite(calculatedAmount)) return null;
  return {
    quantity: nullableNumber(quantity),
    quantityUnit: "件",
    unitRate: nullableNumber(unitRate),
    unit: cleanText(rule.unit) || "元/件",
    formulaText: `${nullableNumber(quantity)}件 * ${nullableNumber(unitRate)}${cleanText(rule.unit) || "元/件"} = ${nullableNumber(calculatedAmount)}`,
  };
}

function summarizeAdjustmentRule(rule = {}) {
  return {
    key: cleanText(rule.key),
    label: cleanText(rule.label),
    adjustmentType: cleanText(rule.adjustmentType),
    unitRate: nullableNumber(rule.unitRate),
    unit: cleanText(rule.unit),
    amountMode: cleanText(rule.amountMode),
    sign: cleanText(rule.sign),
  };
}

function getAdjustmentNote(adjustmentType, rule) {
  if (adjustmentType === "reference_balance") return "历史欠款 / 余额仅作参考，不进入本期应付草稿。";
  if (adjustmentType === "paper_tube_deduction" && rule) return "按供应商扣项规则计算纸管扣项；需人工确认后才可进入应付草稿。";
  return "footer / 调整项仅作复核，不自动确认付款。";
}

function fieldValue(cells, columnIndexes, field) {
  const index = columnIndexes.get(field);
  return index == null ? "" : cleanText(cells[index]);
}

function valueByField(cells, headerMap, field) {
  const index = headerMap[field];
  return index == null ? "" : cleanText(cells[index]);
}

function buildColumnIndexes(header) {
  const map = new Map();
  header.forEach((column, index) => {
    if (column && !map.has(column)) map.set(column, index);
  });
  return map;
}

function getLineType(row, fallback = "shipment") {
  if (fallback === "return") return "return";
  if ((Number(row.amount) || 0) < 0 || (Number(row.totalWeightKg) || 0) < 0 || (Number(row.quantity) || 0) < 0) return "return";
  return "shipment";
}

function isAdjustmentRowText(text) {
  return /合计|纸管|扣|欠款|余额|退货合计|减退货|历史/.test(cleanText(text));
}

function isBlankRow(cells = []) {
  return cells.every((value) => !cleanText(value));
}

function inferSupplierName(rows, input) {
  return cleanText(input.supplierName) || rows.find((row) => row.supplierName)?.supplierName || "";
}

function inferSupplierNameFromSheet(sheetName) {
  const text = cleanText(sheetName);
  if (text.includes("白侯")) return "白侯无纺布";
  if (text.includes("北陈")) return "北陈辅料";
  return "";
}

function textIntersects(value, candidates = []) {
  const source = cleanText(value);
  if (!source) return false;
  return candidates.map(cleanText).filter(Boolean).some((candidate) => source.includes(candidate) || candidate.includes(source));
}

function normalizeDateValue(value) {
  const text = cleanText(value);
  const textDate =
    text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    || text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (textDate) return formatValidatedDate(Number(textDate[1]), Number(textDate[2]), Number(textDate[3]));
  const serialDate = convertExcelDateSerialToDateString(text);
  return serialDate || text;
}

function convertExcelDateSerialToDateString(value) {
  const text = cleanText(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return "";
  const serial = Number(text);
  if (!Number.isFinite(serial) || serial <= 0 || serial > 60000) return "";
  const date = new Date(excelDateBaseUtcMs + Math.floor(serial) * excelDateMsPerDay);
  const year = date.getUTCFullYear();
  if (year < 1990 || year > 2100) return "";
  return formatDateParts(year, date.getUTCMonth() + 1, date.getUTCDate());
}

function formatValidatedDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return formatDateParts(year, month, day);
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNumber(value) {
  const text = cleanText(value).replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? round2(number) : null;
}

function findLastNumber(values = []) {
  const numbers = values.map(parseNumber).filter((value) => Number.isFinite(value));
  return numbers.length ? round2(numbers[numbers.length - 1]) : null;
}

function round2(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function buildStatementRowId(adapterKey, sheetName, rowNumber, index) {
  const sheetKey = cleanText(sheetName).replace(/\W+/g, "-").slice(0, 24) || "sheet";
  return `RMS-${adapterKey}-${sheetKey}-${rowNumber || 0}-${index || 0}`;
}

function createIssue(severity, sheet, row, message) {
  return {
    severity,
    severityLabel: severity === "error" ? "阻断" : severity === "warning" ? "需确认" : "提示",
    sheet: cleanText(sheet),
    row: Number(row) || "",
    message: cleanText(message),
  };
}

function sortIssues(issues) {
  const order = { error: 3, warning: 2, info: 1 };
  return [...issues].sort((left, right) =>
    (order[right.severity] ?? 0) - (order[left.severity] ?? 0)
    || String(left.sheet).localeCompare(String(right.sheet), "zh-Hans-CN")
    || Number(left.row || 0) - Number(right.row || 0),
  );
}

function getRecommendedAction(status) {
  if (status === "passed") return "可进入供应商对账人工确认；确认后再决定是否生成应付/付款流程。";
  if (status === "review") return "存在候选匹配、未匹配或调整项，需要办公室/采购先复核差异。";
  return "Excel 未能识别为供应商月结明细，请按供应商模板重新整理后上传。";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
