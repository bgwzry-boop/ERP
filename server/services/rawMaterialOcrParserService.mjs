import { enrichRawMaterialSpecValues, parseRawMaterialSpec } from "../../shared/rawMaterialSpec.js";

const headerAliases = {
  productName: ["品名", "产品名称", "货品名称", "物料名称", "材料名称", "名称"],
  materialType: ["材料", "材质", "物料类型", "类别", "品类"],
  supplierColor: ["颜色", "色号", "供应商颜色"],
  spec: ["规格", "型号"],
  width: ["宽幅", "门幅", "幅宽", "宽度"],
  gramWeight: ["克重", "克数"],
  length: ["米数", "长度"],
  rollCount: ["卷数", "件数", "数量", "卷/件"],
  totalWeightKg: ["净重", "重量", "公斤", "kg"],
  unit: ["单位"],
  unitPrice: ["单价"],
  amount: ["金额", "价税合计", "小计"],
  supplierRollNo: ["卷号", "批号", "条码", "缸号"],
};

const keyValueAliases = {
  supplierName: ["供应商", "供货单位", "送货单位", "销货单位"],
  deliveryNoteNo: ["送货单号", "销货单号", "单据编号", "单号", "编号", "No"],
  receivedAt: ["送货日期", "单据日期", "日期"],
};

export const RAW_MATERIAL_OCR_PARSER_VERSION = 4;

export function createRawMaterialOcrParserService() {
  return {
    parserVersion: RAW_MATERIAL_OCR_PARSER_VERSION,
    buildInboundDraft: buildRawMaterialInboundDraftFromOcr,
  };
}

export function buildRawMaterialInboundDraftFromOcr(input = {}) {
  const ocr = input.ocr ?? {};
  const inboundId = cleanText(input.inboundId);
  if (!inboundId) throw new TypeError("OCR inbound draft requires inboundId.");
  const tables = normalizeTables(ocr.tables);
  const tableRows = tables.map((table) => buildRows(table.cells));
  const allRows = tableRows.flat();
  const allCells = tables.flatMap((table) => table.cells);
  const allText = allCells.map((cell) => cell.text).filter(Boolean).join("\n");
  const knownSupplierNames = uniqueText(input.knownSupplierNames);
  const supplierName = normalizeSupplierName(
    knownSupplierNames.find((name) => name && allText.includes(name)) ||
    findKeyValue(allRows, keyValueAliases.supplierName).value ||
    inferSupplierName(allText),
  );
  const deliveryNoteNo =
    findKeyValue(allRows, keyValueAliases.deliveryNoteNo).value ||
    inferDeliveryNoteNo(allText);
  const receivedAt = normalizeRecognizedDate(
    findKeyValue(allRows, keyValueAliases.receivedAt).value || inferRecognizedDate(allText),
  ) || cleanText(input.receivedAt);
  const lineCandidates = tableRows.flatMap((rows, tableIndex) => extractTableLines(rows, tableIndex));
  const lines = lineCandidates.length ? lineCandidates : [buildFallbackLine(allRows)];
  const validLines = lines
    .map((line, index) => normalizeLine(line, index))
    .filter((line) => Object.values(line.values).some((value) => cleanText(value)));
  const firstLine = validLines[0] ?? normalizeLine({}, 0);
  const summaryValues = extractSummaryValues(allRows);
  const totalWeightKg = summaryValues.totalWeightKg || roundNumber(sum(validLines.map((line) => line.values.totalWeightKg)), 3);
  const amount = summaryValues.amount || roundNumber(sum(validLines.map((line) => line.values.amount)), 2);
  const rawRecognizedRollCount = Math.round(sum(validLines.map((line) => line.values.rollCount))) || 0;
  const candidateRollCount = summaryValues.rollCount || rawRecognizedRollCount;
  const recognizedRollCount = candidateRollCount > 0 && candidateRollCount <= 500 ? candidateRollCount : 0;
  const materialType = firstLine.values.materialType || inferMaterialTypeFromContext({ allText, lines: validLines });
  const productName = firstLine.values.productName || (materialType === "无纺布" ? "无纺布卷料" : materialType) || "待人工确认原材料";
  const supplierColor = firstLine.values.supplierColor;
  const spec = firstLine.values.spec;
  const specStructure = parseRawMaterialSpec(spec);
  const unit = firstLine.values.unit || (totalWeightKg > 0 ? "kg" : "件");
  const unitPrice = firstLine.values.unitPrice;
  const reviewValues = {
    supplierName,
    deliveryNoteNo,
    materialType,
    productName,
    spec,
    supplierColor,
    factoryColor: supplierColor,
    rollCount: recognizedRollCount,
    totalWeightKg,
    unit,
    unitPrice,
    amount,
  };
  const fieldConfidence = buildFieldConfidence({ allRows, firstLine, supplierName, deliveryNoteNo });
  const ocrReviewFields = Object.entries(reviewValues).map(([key, value]) => ({
    key,
    label: getFieldLabel(key),
    recognizedValue: value,
    value,
    confidence: fieldConfidence[key] ?? 0,
    reviewStatus: needsReview(key, value, fieldConfidence[key]) ? "待人工复核" : "待人工接受",
    required: ["supplierName", "materialType", "productName", "spec", "rollCount", "unit"].includes(key),
  }));
  const recognizedAt = cleanText(input.recognizedAt) || new Date().toISOString();
  const rolls = buildOcrRolls({ inboundId, lines: validLines, recognizedRollCount, totalWeightKg });

  return {
    id: inboundId,
    revision: 1,
    ...reviewValues,
    ...specStructure,
    receivedAt: receivedAt || recognizedAt,
    status: "已识别待复核",
    source: "送货单照片 / 腾讯云表格识别V3",
    ocrProvider: "tencent_cloud_table_v3",
    ocrAction: cleanText(ocr.action) || "RecognizeTableAccurateOCR",
    ocrRequestId: cleanText(ocr.requestId),
    ocrStatus: `腾讯云表格识别V3已完成，${ocrReviewFields.filter((field) => field.reviewStatus === "待人工复核").length} 项需重点复核`,
    ocrAngle: finiteNumber(ocr.angle, 0),
    ocrParserVersion: RAW_MATERIAL_OCR_PARSER_VERSION,
    ocrRecognizedAt: recognizedAt,
    ocrRawText: allText.slice(0, 30_000),
    ocrReviewFields,
    ocrLines: validLines,
    ocrTableRows: tableRows.map((rows) => rows.map((row) => row.map((cell) => cell.text))),
    photoStatus: "送货单照片已上传",
    signedNoteStatus: "单据附件可选，尚未上传",
    nextStep: "办公室对照原图逐项核对 OCR 字段；确认后才能打印一卷一标，逐卷人工贴标核对后才可用。",
    note: "OCR只生成待复核草稿，不直接增加库存、不生成应付。",
    location: "原料待检区",
    statementStatus: "待月结对账",
    statementSummary: "OCR草稿尚未人工复核，不进入供应商应付。",
    statementDifferences: ocrReviewFields
      .filter((field) => field.reviewStatus === "待人工复核")
      .map((field) => `${field.label}待复核`),
    rolls,
  };
}

function extractTableLines(rows, tableIndex) {
  if (!rows.length) return [];
  const header = rows
    .map((row, rowIndex) => ({ row, rowIndex, score: row.reduce((total, cell) => total + (matchHeaderKey(cell.text) ? 1 : 0), 0) }))
    .sort((left, right) => right.score - left.score || left.rowIndex - right.rowIndex)[0];
  if (!header || header.score < 2) return [];
  const sequentialLayout = detectSequentialLayout(header.row);
  const columns = new Map();
  for (const cell of header.row) {
    const key = matchHeaderKey(cell.text);
    if (key && !columns.has(key)) columns.set(key, cell.colTl);
  }
  return rows.slice(header.rowIndex + 1).map((row, offset) => {
    if (shouldSkipRecognizedRow(row)) return null;
    const sequential = parseSequentialLine({ layout: sequentialLayout, row });
    if (sequential) {
      return {
        lineId: `OCR-T${tableIndex + 1}-R${header.rowIndex + offset + 2}`,
        sourceRowIndex: header.rowIndex + offset + 1,
        ...sequential,
        sourceText: row.map((cell) => cell.text).join(" | "),
      };
    }
    const values = {};
    const confidences = {};
    for (const [key, column] of columns) {
      const cell = findCellForColumn(row, column);
      values[key] = parseFieldValue(key, cell?.text);
      confidences[key] = cell?.confidence ?? 0;
    }
    values.spec = buildSpec(values);
    return {
      lineId: `OCR-T${tableIndex + 1}-R${header.rowIndex + offset + 2}`,
      sourceRowIndex: header.rowIndex + offset + 1,
      values,
      confidences,
      sourceText: row.map((cell) => cell.text).join(" | "),
    };
  }).filter(Boolean);
}

function detectSequentialLayout(headerRow) {
  const labels = headerRow.map((cell) => normalizeHeader(cell.text));
  if (labels.some((label) => label.includes("序号")) && labels.some((label) => label.includes("件数")) && labels.some((label) => label.includes("重量kg"))) {
    return "count_then_total_then_roll_weights";
  }
  if (labels.some((label) => label.includes("编号")) && labels.some((label) => label.includes("商品全名")) && labels.some((label) => label.includes("单位"))) {
    return "one_weighed_roll_per_row";
  }
  if (labels.some((label) => label.includes("商品名称")) && labels.some((label) => label.includes("颜色")) && labels.some((label) => label.includes("重量"))) {
    return "variable_roll_weights";
  }
  return "";
}

function parseSequentialLine({ layout, row }) {
  if (!layout) return null;
  const cells = row.map((cell) => ({ text: cleanText(cell.text), confidence: clampConfidence(cell.confidence) }));
  const texts = cells.map((cell) => cell.text);
  if (layout === "count_then_total_then_roll_weights") {
    if (texts.length < 7 || !looksLikeSpec(texts[2])) return null;
    const rollCount = parsePositiveInteger(texts[3]);
    if (!rollCount) return null;
    const rollWeightsKg = texts.slice(7, 7 + rollCount).map(parseNumber).filter((value) => value > 0);
    return {
      values: {
        productName: "无纺布卷料",
        materialType: "无纺布",
        supplierColor: texts[1],
        spec: texts[2],
        rollCount,
        totalWeightKg: parseNumber(texts[4]) || roundNumber(sum(rollWeightsKg), 3),
        unit: "kg",
        unitPrice: parseNumber(texts[5]),
        amount: parseNumber(texts[6]),
        supplierRollNo: "",
        rollWeightsKg,
      },
      confidences: buildSequentialConfidences(cells, {
        productName: 2,
        materialType: 2,
        supplierColor: 1,
        spec: 2,
        rollCount: 3,
        totalWeightKg: 4,
        unit: 4,
        unitPrice: 5,
        amount: 6,
      }),
    };
  }
  if (layout === "one_weighed_roll_per_row") {
    if (texts.length < 7 || !looksLikeUnit(texts[3]) || parseNumber(texts[4]) <= 0) return null;
    return {
      values: {
        productName: "无纺布卷料",
        materialType: "无纺布",
        supplierColor: texts[1],
        spec: texts[2],
        rollCount: 1,
        totalWeightKg: parseNumber(texts[4]),
        unit: normalizeUnit(texts[3]),
        unitPrice: parseNumber(texts[5]),
        amount: parseNumber(texts[6]),
        supplierRollNo: "",
        rollWeightsKg: [parseNumber(texts[4])].filter((value) => value > 0),
      },
      confidences: buildSequentialConfidences(cells, {
        productName: 2,
        materialType: 2,
        supplierColor: 1,
        spec: 2,
        rollCount: 4,
        totalWeightKg: 4,
        unit: 3,
        unitPrice: 5,
        amount: 6,
      }),
    };
  }
  if (layout === "variable_roll_weights") return parseVariableRollWeightLine(cells);
  return null;
}

function parseVariableRollWeightLine(cells) {
  const texts = cells.map((cell) => cell.text);
  let spec = texts[0];
  let supplierColor = texts[1];
  let rollCountIndex = 2;
  if (!looksLikeSpec(spec) && parsePositiveInteger(texts[1])) {
    supplierColor = spec;
    spec = "";
    rollCountIndex = 1;
  }
  const rollCount = parsePositiveInteger(texts[rollCountIndex]);
  if (!rollCount || rollCount > 100) return null;
  const weightStart = rollCountIndex + 1;
  const rollWeightsKg = texts.slice(weightStart, weightStart + rollCount).map(parseNumber).filter((value) => value > 0);
  if (!rollWeightsKg.length) return null;
  const rollWeightTotal = roundNumber(sum(rollWeightsKg), 3);
  let remaining = texts.slice(weightStart + rollCount).map(parseNumber);
  let totalWeightKg = rollWeightTotal;
  if (remaining.length >= 3 && approximatelyEqual(remaining[0], rollWeightTotal)) {
    totalWeightKg = remaining[0];
    remaining = remaining.slice(1);
  }
  let unitPrice = 0;
  let amount = 0;
  if (remaining.length >= 2) {
    unitPrice = remaining.at(-2);
    amount = remaining.at(-1);
    if (unitPrice > 100 && amount > 0 && amount < 100) [unitPrice, amount] = [amount, unitPrice];
  } else if (remaining.length === 1) {
    amount = remaining[0];
  }
  const confidenceIndex = Math.min(cells.length - 1, weightStart);
  return {
    values: enrichRawMaterialSpecValues({
      productName: "无纺布卷料",
      materialType: "无纺布",
      supplierColor,
      spec,
      rollCount,
      totalWeightKg,
      unit: "kg",
      unitPrice,
      amount,
      supplierRollNo: "",
      rollWeightsKg,
    }),
    confidences: buildSequentialConfidences(cells, {
      productName: 0,
      materialType: 0,
      supplierColor: rollCountIndex === 2 ? 1 : 0,
      spec: 0,
      rollCount: rollCountIndex,
      totalWeightKg: confidenceIndex,
      unit: confidenceIndex,
      unitPrice: Math.max(0, cells.length - 2),
      amount: Math.max(0, cells.length - 1),
    }),
  };
}

function buildSequentialConfidences(cells, indexes) {
  return Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, cells[index]?.confidence ?? 0]));
}

function shouldSkipRecognizedRow(row) {
  const texts = row.map((cell) => cleanText(cell.text)).filter(Boolean);
  const joined = texts.join(" ");
  if (!texts.length || /^(?:合计|合计:|总计|总计大写|页小计|上期欠款|本单金额|累计欠款)/.test(joined)) return true;
  if (texts.length <= 10 && texts.every((text) => /^\d+$/.test(text))) return true;
  return false;
}

function extractSummaryValues(rows) {
  for (const row of rows) {
    const texts = row.map((cell) => cleanText(cell.text)).filter(Boolean);
    if (!texts.length) continue;
    const label = texts[0];
    const numbers = texts.slice(1).map(parseNumber).filter((value) => value > 0);
    if (/^(?:合计|合计:)/.test(label)) {
      const rollCount = Number.isInteger(numbers[0]) && numbers[0] <= 500 ? numbers[0] : 0;
      if (numbers.length >= 3) return { rollCount, totalWeightKg: numbers.at(-2), amount: numbers.at(-1) };
      if (numbers.length >= 2) return { rollCount, totalWeightKg: 0, amount: numbers.at(-1) };
    }
    if (/^(?:总计大写|页小计)/.test(label) && numbers.length >= 2) {
      return { rollCount: 0, totalWeightKg: numbers.at(-2), amount: numbers.at(-1) };
    }
  }
  return { rollCount: 0, totalWeightKg: 0, amount: 0 };
}

function buildFallbackLine(rows) {
  const values = {};
  const confidences = {};
  for (const [key, aliases] of Object.entries(headerAliases)) {
    const found = findKeyValue(rows, aliases);
    values[key] = parseFieldValue(key, found.value);
    confidences[key] = found.confidence;
  }
  values.spec = buildSpec(values);
  return { lineId: "OCR-FALLBACK-1", sourceRowIndex: 0, values, confidences, sourceText: "" };
}

function normalizeLine(input = {}, index) {
  const values = input.values ?? {};
  return {
    lineId: cleanText(input.lineId) || `OCR-LINE-${index + 1}`,
    sourceRowIndex: Math.max(0, Number(input.sourceRowIndex) || 0),
    sourceText: cleanText(input.sourceText),
    reviewStatus: "待人工复核",
    values: enrichRawMaterialSpecValues({
      productName: cleanText(values.productName),
      materialType: cleanText(values.materialType),
      supplierColor: cleanText(values.supplierColor),
      spec: cleanText(values.spec),
      rollCount: positiveNumber(values.rollCount, 0),
      totalWeightKg: positiveNumber(values.totalWeightKg, 0),
      unit: normalizeUnit(values.unit, values.totalWeightKg),
      unitPrice: positiveNumber(values.unitPrice, 0),
      amount: positiveNumber(values.amount, 0),
      supplierRollNo: cleanText(values.supplierRollNo),
      rollWeightsKg: (Array.isArray(values.rollWeightsKg) ? values.rollWeightsKg : [])
        .map((value) => positiveNumber(value, 0))
        .filter((value) => value > 0),
    }),
    confidences: Object.fromEntries(
      Object.entries(input.confidences ?? {}).map(([key, value]) => [key, clampConfidence(value)]),
    ),
  };
}

function buildRows(cells = []) {
  const groups = new Map();
  for (const cell of cells) {
    const row = Math.max(0, Number(cell.rowTl) || 0);
    if (!groups.has(row)) groups.set(row, []);
    groups.get(row).push(cell);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => row.sort((left, right) => left.colTl - right.colTl));
}

function normalizeTables(tables = []) {
  return (Array.isArray(tables) ? tables : []).map((table) => ({
    cells: (Array.isArray(table?.cells) ? table.cells : []).map((cell) => ({
      colTl: Math.max(0, Number(cell?.colTl) || 0),
      colBr: Math.max(0, Number(cell?.colBr) || 0),
      rowTl: Math.max(0, Number(cell?.rowTl) || 0),
      rowBr: Math.max(0, Number(cell?.rowBr) || 0),
      text: cleanText(cell?.text),
      confidence: clampConfidence(cell?.confidence),
    })).filter((cell) => cell.text),
  }));
}

function findKeyValue(rows, aliases) {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const cell = row[index];
      const alias = aliases.find((candidate) => normalizeHeader(cell.text).includes(normalizeHeader(candidate)));
      if (!alias) continue;
      const inline = cleanText(cell.text).replace(new RegExp(`^.*?${escapeRegExp(alias)}[：:\\s]*`, "i"), "");
      if (inline && normalizeHeader(inline) !== normalizeHeader(cell.text)) {
        return { value: inline, confidence: cell.confidence };
      }
      const next = row[index + 1];
      if (next?.text) return { value: next.text, confidence: next.confidence };
    }
  }
  return { value: "", confidence: 0 };
}

function matchHeaderKey(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return "";
  return Object.entries(headerAliases).find(([, aliases]) =>
    aliases.some((alias) => normalized === normalizeHeader(alias) || normalized.includes(normalizeHeader(alias))),
  )?.[0] ?? "";
}

function findCellForColumn(row, column) {
  return row.find((cell) => cell.colTl <= column && Math.max(cell.colTl, cell.colBr) >= column) ??
    row.find((cell) => cell.colTl === column);
}

function parseFieldValue(key, value) {
  const text = cleanText(value);
  if (["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key)) return parseNumber(text);
  if (key === "unit") return normalizeUnit(text);
  return text;
}

function buildSpec(values = {}) {
  if (cleanText(values.spec)) return cleanText(values.spec);
  return [values.gramWeight, values.width, values.length].map(cleanText).filter(Boolean).join("*");
}

function buildFieldConfidence({ allRows, firstLine, supplierName, deliveryNoteNo }) {
  return {
    supplierName: supplierName ? findConfidenceForValue(allRows, supplierName) : 0,
    deliveryNoteNo: deliveryNoteNo ? findConfidenceForValue(allRows, deliveryNoteNo) : 0,
    materialType: firstLine.confidences.materialType ?? firstLine.confidences.productName ?? 0,
    productName: firstLine.confidences.productName ?? 0,
    spec: firstLine.values.specNeedsReview
      ? 0
      : Math.min(...[firstLine.confidences.spec, firstLine.confidences.width, firstLine.confidences.gramWeight, firstLine.confidences.length].filter((value) => Number.isFinite(value)), 100),
    supplierColor: firstLine.confidences.supplierColor ?? 0,
    factoryColor: firstLine.confidences.supplierColor ?? 0,
    rollCount: firstLine.confidences.rollCount ?? 0,
    totalWeightKg: firstLine.confidences.totalWeightKg ?? 0,
    unit: firstLine.confidences.unit ?? firstLine.confidences.totalWeightKg ?? 0,
    unitPrice: firstLine.confidences.unitPrice ?? 0,
    amount: firstLine.confidences.amount ?? 0,
  };
}

function findConfidenceForValue(rows, value) {
  const target = cleanText(value);
  return rows.flat().find((cell) => cell.text.includes(target))?.confidence ?? 0;
}

function needsReview(key, value, confidence = 0) {
  if (["supplierName", "materialType", "productName", "spec", "rollCount", "unit"].includes(key) && !cleanText(value)) return true;
  if (key === "rollCount" && Number(value) <= 0) return true;
  return Number(confidence) < 85;
}

function inferSupplierName(allText) {
  return cleanText(allText.split(/\n+/).find((line) => /(?:有限公司|公司|布业|无纺布|材料厂|织造厂)/.test(line) && line.length <= 40));
}

function inferDeliveryNoteNo(allText) {
  return allText.match(/(?:送货单号|销货单号|单据编号|单号|编号|No)[：:\s]*([A-Z0-9][A-Z0-9._/-]{3,})/i)?.[1] ?? "";
}

function inferRecognizedDate(allText) {
  return allText.match(/20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}/)?.[0] ?? "";
}

function normalizeSupplierName(value) {
  return cleanText(value).replace(/(?:销货单|销售单|送货单)\s*$/u, "").trim();
}

function inferMaterialTypeFromContext({ allText, lines }) {
  const productName = lines.find((line) => cleanText(line.values.productName))?.values.productName;
  if (/无纺布/.test(allText) || lines.some((line) => looksLikeSpec(line.values.spec))) return "无纺布";
  return inferMaterialType(productName);
}

function buildOcrRolls({ inboundId, lines, recognizedRollCount, totalWeightKg }) {
  if (!recognizedRollCount) return [];
  const rollInputs = [];
  for (const line of lines) {
    const count = parsePositiveInteger(line.values.rollCount);
    if (!count) continue;
    const exactWeights = Array.isArray(line.values.rollWeightsKg) && line.values.rollWeightsKg.length === count
      ? line.values.rollWeightsKg
      : [];
    const fallbackWeight = Number(line.values.totalWeightKg) > 0 ? roundNumber(Number(line.values.totalWeightKg) / count, 3) : 0;
    for (let index = 0; index < count; index += 1) {
      rollInputs.push({ line, weightKg: positiveNumber(exactWeights[index], fallbackWeight) });
    }
  }
  while (rollInputs.length < recognizedRollCount) {
    rollInputs.push({
      line: lines[Math.min(rollInputs.length, Math.max(0, lines.length - 1))] ?? { values: {}, lineId: "" },
      weightKg: totalWeightKg > 0 ? roundNumber(totalWeightKg / recognizedRollCount, 3) : 0,
    });
  }
  return rollInputs.slice(0, recognizedRollCount).map(({ line, weightKg }, index) => ({
    id: `RM-${inboundId.replace(/^RMI-/, "")}-${String(index + 1).padStart(2, "0")}`,
    supplierRollNo: cleanText(line.values.supplierRollNo) || `OCR待核对${index + 1}`,
    weightKg,
    originalWeightKg: weightKg,
    labelStatus: "待人工复核",
    inventoryStatus: "不可用",
    location: "原料待检区",
    signedNoteStatus: "入库无需逐卷扫码或签单",
    ocrLineId: line.lineId,
    productName: cleanText(line.values.productName),
    materialType: cleanText(line.values.materialType),
    supplierColor: cleanText(line.values.supplierColor),
    spec: cleanText(line.values.spec),
    specRaw: cleanText(line.values.specRaw || line.values.spec),
    specDisplay: cleanText(line.values.specDisplay || line.values.spec),
    gramWeightGsm: positiveNumber(line.values.gramWeightGsm, 0),
    widthCm: positiveNumber(line.values.widthCm, 0),
    lengthM: positiveNumber(line.values.lengthM, 0),
    unitPrice: positiveNumber(line.values.unitPrice, 0),
    materialCategory: cleanText(line.values.materialCategory),
    specNeedsReview: line.values.specNeedsReview === true,
    specReviewReason: cleanText(line.values.specReviewReason),
  }));
}

function looksLikeSpec(value) {
  return /\d{2,4}\s*[*×xX]\s*\d{2,4}(?:\s*[*×xX]\s*\d{2,4})?/u.test(cleanText(value));
}

function looksLikeUnit(value) {
  return /公斤|千克|kg|吨|米|卷|件|个|只/i.test(cleanText(value));
}

function parsePositiveInteger(value) {
  const number = parseNumber(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function approximatelyEqual(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.02);
}

function inferMaterialType(productName) {
  const text = cleanText(productName);
  if (text.includes("提手")) return "提手";
  if (text.includes("布")) return "无纺布";
  if (text.includes("膜")) return "覆膜材料";
  if (text.includes("纸")) return "纸类辅料";
  return text;
}

function normalizeRecognizedDate(value) {
  const text = cleanText(value);
  if (!text) return "";
  const match = text.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normalizeUnit(value, weight) {
  const text = cleanText(value).toLowerCase();
  if (/公斤|千克|kg/.test(text)) return "kg";
  if (/吨|ton/.test(text)) return "吨";
  if (/米|m/.test(text)) return "米";
  if (/卷/.test(text)) return "卷";
  if (/件|个|只/.test(text)) return "件";
  return text || (Number(weight) > 0 ? "kg" : "");
}

function getFieldLabel(key) {
  return {
    supplierName: "供应商",
    deliveryNoteNo: "供应商单号",
    materialType: "材料类型",
    productName: "原料名称",
    spec: "规格",
    supplierColor: "供应商颜色",
    factoryColor: "厂内颜色",
    rollCount: "卷/件数",
    totalWeightKg: "总重量kg",
    unit: "单位",
    unitPrice: "单价",
    amount: "金额",
  }[key] ?? key;
}

function parseNumber(value) {
  const normalized = cleanText(value).replace(/[,，\s]/g, "");
  const number = Number(normalized.match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(number) ? number : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function roundNumber(value, digits) {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/[\s:：()（）/\\_-]/g, "");
}

function uniqueText(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanText(value) {
  return String(value ?? "").trim();
}
