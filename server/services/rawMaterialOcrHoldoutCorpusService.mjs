import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { buildRawMaterialInboundDraftFromOcr } from "./rawMaterialOcrParserService.mjs";

export const RAW_MATERIAL_OCR_HOLDOUT_CORPUS_VERSION = "raw-material-ocr-holdout-corpus-v1";
export const RAW_MATERIAL_OCR_HOLDOUT_FORMAT_KEYS = Object.freeze([
  "count_total_per_roll_weights",
  "one_weighed_roll_per_row",
  "variable_per_roll_weights",
  "supplier_number_optional",
]);

const DEFAULT_TEMPLATE_PATH = ".erp-local-storage/raw-material-ocr-holdout/raw-material-ocr-holdout.template.json";
const MAX_CORPUS_BYTES = 3 * 1024 * 1024;
const MAX_CASES = 20;
const MAX_TABLES_PER_CASE = 12;
const MAX_ROWS_PER_TABLE = 240;
const MAX_COLUMNS_PER_ROW = 48;
const MAX_CELL_TEXT_LENGTH = 500;

export function createRawMaterialOcrHoldoutCorpusTemplate(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const outputFile = resolve(options.outputFile ?? DEFAULT_TEMPLATE_PATH);
  assertPrivateCorpusPath(outputFile, projectRoot);
  if (existsSync(outputFile)) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_TEMPLATE_EXISTS");

  const outputDir = dirname(outputFile);
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);
  writeFileSync(outputFile, `${JSON.stringify(buildRawMaterialOcrHoldoutCorpusTemplate(), null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(outputFile, 0o600);
  return {
    version: RAW_MATERIAL_OCR_HOLDOUT_CORPUS_VERSION,
    scope: "raw_material_ocr_holdout_template",
    status: "written",
    ready: false,
    summary: buildRequiredSummary(),
    safeguards: buildSafeguards({ outputWritten: true }),
  };
}

export function buildRawMaterialOcrHoldoutCorpusTemplate() {
  return {
    schemaVersion: RAW_MATERIAL_OCR_HOLDOUT_CORPUS_VERSION,
    sourceKind: "confirmed_private_supplier_holdout",
    cases: [],
  };
}

export function precheckRawMaterialOcrHoldoutCorpus(options = {}) {
  try {
    const payload = readPrivateCorpus(options);
    const summary = validateAndEvaluateCorpus(payload);
    return {
      version: RAW_MATERIAL_OCR_HOLDOUT_CORPUS_VERSION,
      scope: "raw_material_ocr_holdout_precheck",
      status: "ready",
      ready: true,
      summary,
      safeguards: buildSafeguards({}),
    };
  } catch (error) {
    const code = normalizeCorpusErrorCode(error?.code);
    return {
      version: RAW_MATERIAL_OCR_HOLDOUT_CORPUS_VERSION,
      scope: "raw_material_ocr_holdout_precheck",
      status: "blocked",
      ready: false,
      error: { code, message: getCorpusErrorMessage(code) },
      safeguards: buildSafeguards({}),
    };
  }
}

function readPrivateCorpus(options) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const sourceFile = cleanText(options.file);
  if (!sourceFile) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_FILE_REQUIRED");
  const actualPath = resolve(sourceFile);
  assertPrivateCorpusPath(actualPath, projectRoot);
  let stats;
  try {
    stats = statSync(actualPath);
  } catch {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_FILE_UNAVAILABLE");
  }
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_CORPUS_BYTES) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_FILE_INVALID");
  }
  if ((stats.mode & 0o077) !== 0) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_FILE_NOT_PRIVATE");
  try {
    return JSON.parse(readFileSync(actualPath, "utf8"));
  } catch {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_JSON_INVALID");
  }
}

function validateAndEvaluateCorpus(payload) {
  assertPlainObject(payload, "RAW_MATERIAL_OCR_HOLDOUT_SCHEMA_INVALID");
  if (payload.schemaVersion !== RAW_MATERIAL_OCR_HOLDOUT_CORPUS_VERSION) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_SCHEMA_INVALID");
  }
  if (payload.sourceKind !== "confirmed_private_supplier_holdout") {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_SOURCE_INVALID");
  }
  if (!Array.isArray(payload.cases) || payload.cases.length < RAW_MATERIAL_OCR_HOLDOUT_FORMAT_KEYS.length || payload.cases.length > MAX_CASES) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_CASE_COUNT_INVALID");
  }

  const caseIds = new Set();
  const formats = new Set();
  const totals = { parsedLineCount: 0, expectedRollCount: 0, unavailableRollCount: 0 };
  for (const entry of payload.cases) {
    assertPlainObject(entry, "RAW_MATERIAL_OCR_HOLDOUT_CASE_INVALID");
    const caseId = cleanText(entry.caseId);
    if (!/^[a-z0-9][a-z0-9_-]{3,64}$/i.test(caseId) || caseIds.has(caseId)) {
      throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_CASE_INVALID");
    }
    caseIds.add(caseId);
    const formatKey = cleanText(entry.formatKey);
    if (!RAW_MATERIAL_OCR_HOLDOUT_FORMAT_KEYS.includes(formatKey)) {
      throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_FORMAT_INVALID");
    }
    formats.add(formatKey);
    validateSourceEvidence(entry.sourceEvidence);
    const expected = normalizeExpectedCase(entry.expected);
    const requiresSupplierDocumentNumber = formatKey !== "supplier_number_optional";
    if ((requiresSupplierDocumentNumber && !expected.deliveryNoteNo) || (!requiresSupplierDocumentNumber && expected.deliveryNoteNo)) {
      throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
    }
    const draft = buildRawMaterialInboundDraftFromOcr({
      inboundId: `RMI-HOLDOUT-${caseIds.size}`,
      recognizedAt: "2001-01-01T00:00:00.000Z",
      ocr: { action: "RecognizeTableAccurateOCR", tables: buildOcrTables(entry.ocrTableRows) },
    });
    assertExpectedDraft(draft, expected);
    totals.parsedLineCount += draft.ocrLines.length;
    totals.expectedRollCount += expected.rollCount;
    totals.unavailableRollCount += draft.rolls.filter((roll) => roll.inventoryStatus === "不可用").length;
  }
  if (RAW_MATERIAL_OCR_HOLDOUT_FORMAT_KEYS.some((key) => !formats.has(key))) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_FORMAT_COVERAGE_INCOMPLETE");
  }
  if (totals.expectedRollCount !== totals.unavailableRollCount) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_INVENTORY_GUARD_FAILED");
  }
  return {
    ...buildRequiredSummary(),
    caseCount: caseIds.size,
    formatKeys: RAW_MATERIAL_OCR_HOLDOUT_FORMAT_KEYS.filter((key) => formats.has(key)),
    ...totals,
  };
}

function normalizeExpectedCase(value) {
  assertPlainObject(value, "RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  const expected = {
    supplierName: requiredText(value.supplierName),
    deliveryNoteNo: cleanText(value.deliveryNoteNo),
    receivedAt: requiredText(value.receivedAt),
    rollCount: requiredPositiveInteger(value.rollCount),
    totalWeightKg: requiredPositiveNumber(value.totalWeightKg),
    amount: requiredPositiveNumber(value.amount),
    lines: Array.isArray(value.lines) ? value.lines.map(normalizeExpectedLine) : [],
  };
  if (expected.receivedAt === "2001-01-01T00:00:00.000Z") throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  if (!expected.lines.length || expected.lines.length > 100) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  if (expected.lines.reduce((total, line) => total + line.rollCount, 0) !== expected.rollCount) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  }
  if (!numbersEqual(expected.lines.reduce((total, line) => total + line.totalWeightKg, 0), expected.totalWeightKg)) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  }
  if (!numbersEqual(expected.lines.reduce((total, line) => total + line.amount, 0), expected.amount)) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  }
  return expected;
}

function validateSourceEvidence(value) {
  assertPlainObject(value, "RAW_MATERIAL_OCR_HOLDOUT_SOURCE_EVIDENCE_INVALID");
  if (cleanText(value.captureKind) !== "tencent_table_ocr_saved_output" || !/^\d{4}-\d{2}-\d{2}/.test(cleanText(value.confirmedAt))) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_SOURCE_EVIDENCE_INVALID");
  }
}

function normalizeExpectedLine(value) {
  assertPlainObject(value, "RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  const rollCount = requiredPositiveInteger(value.rollCount);
  const rollWeightsKg = Array.isArray(value.rollWeightsKg) ? value.rollWeightsKg.map(requiredPositiveNumber) : [];
  if (rollWeightsKg.length !== rollCount) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  const totalWeightKg = requiredPositiveNumber(value.totalWeightKg);
  if (!numbersEqual(rollWeightsKg.reduce((total, weight) => total + weight, 0), totalWeightKg)) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  }
  return {
    productName: requiredText(value.productName),
    materialType: requiredText(value.materialType),
    supplierColor: cleanText(value.supplierColor),
    spec: requiredText(value.spec),
    rollCount,
    totalWeightKg,
    unit: requiredText(value.unit),
    unitPrice: requiredPositiveNumber(value.unitPrice),
    amount: requiredPositiveNumber(value.amount),
    rollWeightsKg,
  };
}

function buildOcrTables(tableRows) {
  if (!Array.isArray(tableRows) || !tableRows.length || tableRows.length > MAX_TABLES_PER_CASE) {
    throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_TABLES_INVALID");
  }
  return tableRows.map((rows) => {
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS_PER_TABLE) {
      throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_TABLES_INVALID");
    }
    const cells = [];
    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || !row.length || row.length > MAX_COLUMNS_PER_ROW) {
        throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_TABLES_INVALID");
      }
      row.forEach((value, columnIndex) => {
        const text = cleanText(value);
        if (text.length > MAX_CELL_TEXT_LENGTH) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_TABLES_INVALID");
        cells.push({ colTl: columnIndex, colBr: columnIndex, rowTl: rowIndex, rowBr: rowIndex, text, confidence: 100 });
      });
    });
    return { cells };
  });
}

function assertExpectedDraft(draft, expected) {
  const matches =
    cleanText(draft.supplierName) === expected.supplierName &&
    cleanText(draft.deliveryNoteNo) === expected.deliveryNoteNo &&
    cleanText(draft.receivedAt) === expected.receivedAt &&
    Number(draft.rollCount) === expected.rollCount &&
    numbersEqual(draft.totalWeightKg, expected.totalWeightKg) &&
    numbersEqual(draft.amount, expected.amount) &&
    draft.status === "已识别待复核" &&
    draft.rolls.length === expected.rollCount &&
    draft.rolls.every((roll) => roll.inventoryStatus === "不可用") &&
    draft.ocrLines.length === expected.lines.length &&
    expected.lines.every((line, index) => matchesExpectedLine(draft.ocrLines[index]?.values, line));
  if (!matches) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_MISMATCH");
}

function matchesExpectedLine(values = {}, expected) {
  return (
    cleanText(values.productName) === expected.productName &&
    cleanText(values.materialType) === expected.materialType &&
    cleanText(values.supplierColor) === expected.supplierColor &&
    cleanText(values.spec) === expected.spec &&
    Number(values.rollCount) === expected.rollCount &&
    numbersEqual(values.totalWeightKg, expected.totalWeightKg) &&
    cleanText(values.unit) === expected.unit &&
    numbersEqual(values.unitPrice, expected.unitPrice) &&
    numbersEqual(values.amount, expected.amount) &&
    Array.isArray(values.rollWeightsKg) &&
    values.rollWeightsKg.length === expected.rollWeightsKg.length &&
    values.rollWeightsKg.every((weight, index) => numbersEqual(weight, expected.rollWeightsKg[index]))
  );
}

function buildRequiredSummary() {
  return {
    requiredFormatCount: RAW_MATERIAL_OCR_HOLDOUT_FORMAT_KEYS.length,
    requiredFormatKeys: [...RAW_MATERIAL_OCR_HOLDOUT_FORMAT_KEYS],
    templateContainsBusinessData: false,
  };
}

function assertPrivateCorpusPath(target, projectRoot) {
  const privateRoot = canonicalizePath(resolve(projectRoot, ".erp-local-storage", "raw-material-ocr-holdout"));
  if (!isPathWithin(privateRoot, canonicalizePath(target))) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_PATH_RESTRICTED");
}

function canonicalizePath(target) {
  let current = resolve(target);
  const missingSegments = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    missingSegments.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...missingSegments);
}

function isPathWithin(root, target) {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function buildSafeguards({ outputWritten = false } = {}) {
  return {
    readOnlyPrecheck: !outputWritten,
    outputWritten,
    outputMode: outputWritten ? "0600" : "not_applicable",
    sourcePathIncluded: false,
    sourceContentIncluded: false,
    supplierIdentityIncluded: false,
    documentNumberIncluded: false,
    monetaryValuesIncluded: false,
    productionApprovalGranted: false,
  };
}

function requiredText(value) {
  const text = cleanText(value);
  if (!text) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  return text;
}

function requiredPositiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 500) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  return number;
}

function requiredPositiveNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw corpusError("RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_INVALID");
  return number;
}

function numbersEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) <= Math.max(0.01, Math.abs(Number(right)) * 0.0001);
}

function assertPlainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw corpusError(code);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeCorpusErrorCode(value) {
  const code = cleanText(value);
  return code.startsWith("RAW_MATERIAL_OCR_HOLDOUT_") ? code : "RAW_MATERIAL_OCR_HOLDOUT_PRECHECK_FAILED";
}

function corpusError(code) {
  return Object.assign(new Error(code), { code });
}

function getCorpusErrorMessage(code) {
  const messages = {
    RAW_MATERIAL_OCR_HOLDOUT_FILE_REQUIRED: "未选择私有原材料OCR留出样本。",
    RAW_MATERIAL_OCR_HOLDOUT_FILE_UNAVAILABLE: "无法读取私有原材料OCR留出样本。",
    RAW_MATERIAL_OCR_HOLDOUT_FILE_INVALID: "原材料OCR留出样本文件无效。",
    RAW_MATERIAL_OCR_HOLDOUT_FILE_NOT_PRIVATE: "原材料OCR留出样本权限不安全，文件必须仅限所有者读取。",
    RAW_MATERIAL_OCR_HOLDOUT_PATH_RESTRICTED: "原材料OCR留出样本必须位于私有运行时目录。",
    RAW_MATERIAL_OCR_HOLDOUT_JSON_INVALID: "原材料OCR留出样本不是有效JSON。",
    RAW_MATERIAL_OCR_HOLDOUT_CASE_COUNT_INVALID: "原材料OCR留出样本至少需要四份样本。",
    RAW_MATERIAL_OCR_HOLDOUT_FORMAT_COVERAGE_INCOMPLETE: "原材料OCR留出样本没有覆盖四种供应商格式。",
    RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_MISMATCH: "原材料OCR留出样本解析结果与已确认预期不一致。",
  };
  return messages[code] ?? "原材料OCR留出样本预检未通过，请按受控模板和错误码复核。";
}
