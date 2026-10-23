import {
  canPrintRawMaterialLabels,
  canReviewRawMaterialInbound,
} from "./rawMaterialInboundListState.js";
import { projectRawMaterialOcrPhysicalRollReviewRows } from "../../shared/rawMaterialOcrLineReview.js";
import {
  RAW_MATERIAL_HANDLE_WIDTH_CM,
  RAW_MATERIAL_STANDARD_HANDLE_GSM,
  formatRawMaterialMobileSpec,
  parseRawMaterialSpec,
} from "../../shared/rawMaterialSpec.js";

export const OFFICE_LABEL_PAPER = Object.freeze({
  widthMm: 76,
  heightMm: 130,
  name: "76×130 面单",
});

export const OFFICE_INBOUND_STEPS = Object.freeze([
  { key: "scan", label: "扫描送货单" },
  { key: "review", label: "核对卷料" },
  { key: "print", label: "打印卷标" },
  { key: "complete", label: "回办公室入库" },
]);

export function resolveOfficeInboundStep(inbound = {}) {
  if (!inbound?.id) return "scan";
  if (inbound.documentDirection === "supplier_return") {
    return canReviewRawMaterialInbound(inbound) ? "review" : "done";
  }
  if (canReviewRawMaterialInbound(inbound)) return "review";
  if (inbound.status === "已复核待打印标签" || canPrintRawMaterialLabels(inbound)) return "print";
  if (
    listOfficePendingAttachRolls(inbound).length
    || String(inbound.status || "").includes("部分入库")
    || String(inbound.status || "").includes("不符")
  ) return "complete";
  if ((inbound.rolls ?? []).some((roll) => roll.inventoryStatus === "可用")) return "done";
  return "scan";
}

export function listOfficePendingAttachRolls(inbound = {}) {
  return (inbound.rolls ?? []).filter((roll) => roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用");
}

export function listOfficePrintableRolls(inbound = {}) {
  return (inbound.rolls ?? []).filter((roll) => roll.inventoryStatus !== "可用");
}

export function officeInboundUsesCountGate(inbound = {}) {
  const rollCount = officePhysicalRollCount(inbound);
  const pending = listOfficePendingAttachRolls(inbound);
  return rollCount > 0 && pending.length === rollCount && !officeHasMismatch(inbound);
}

export function officePhysicalRollCount(inbound = {}) {
  const declared = Number(inbound.rollCount);
  const actual = (inbound.rolls ?? []).length;
  return Number.isInteger(declared) && declared > 0 ? declared : actual;
}

export function evaluateOfficeInboundCompletion(inbound = {}, stickCount) {
  const rollCount = officePhysicalRollCount(inbound);
  const pending = listOfficePendingAttachRolls(inbound);
  if (officeHasMismatch(inbound)) {
    return { allowed: false, pending, rollCount, reason: "有卷对不上，先单独处理，整单不能一次入库。" };
  }
  if (!pending.length) {
    return { allowed: false, pending, rollCount, reason: "没有待入库的卷。" };
  }
  const stuck = parseStickCount(stickCount);
  if (stuck == null) {
    return { allowed: false, pending, rollCount, reason: "先填写已经贴上的标签张数。" };
  }
  if (stuck !== rollCount) {
    return {
      allowed: false,
      pending,
      rollCount,
      reason: `已贴 ${stuck} 张，这单有 ${rollCount} 卷。张数对不上，先回院子核对，不要入库。`,
    };
  }
  if (pending.length !== rollCount) {
    return {
      allowed: false,
      pending,
      rollCount,
      reason: `还有 ${pending.length} 卷待入库，和这单 ${rollCount} 卷不一致，不能一次入库。`,
    };
  }
  return { allowed: true, pending, rollCount, reason: "" };
}

export function buildOfficeMatchedAttachPayload(inbound = {}, roll = {}) {
  const facts = describeOfficeRollFacts(roll, inbound);
  return {
    rollId: roll.id,
    expectedLabelVersion: Math.max(1, Number(roll.labelVersion) || 1),
    matchResult: "matched",
    checkedWeightKg: roll.weightKg,
    checkedColor: facts.color,
    checkedSpec: roll.spec || inbound.spec || facts.specLabel,
    location: "原料库-可用区",
    verificationNote: "办公室核对已贴张数与卷数一致，一次确认入库。",
  };
}

export function buildOfficeReviewRows(inbound = {}, lineDrafts = {}) {
  const lines = Array.isArray(inbound.ocrLines) ? inbound.ocrLines : [];
  if (lines.length) {
    return projectRawMaterialOcrPhysicalRollReviewRows({
      lines,
      lineDrafts,
      documentDirection: inbound.documentDirection || "supplier_delivery",
    }).map((row) => toOfficeReviewRow(row, inbound));
  }
  return (inbound.rolls ?? []).map((roll, index) => toOfficeReviewRow({
    reviewId: roll.id || `roll-${index + 1}`,
    physicalRollIndex: index + 1,
    line: null,
    lineId: roll.ocrLineId || "",
    lineDraft: {},
    lineRollIndex: Number(roll.sourceLineRollIndex) || 0,
    lineRollCount: 1,
    supplierColor: roll.factoryColor || roll.supplierColor || "",
    spec: roll.spec || inbound.spec || "",
    weightKg: roll.weightKg,
  }, inbound));
}

export function officeRollBlocker(facts = {}, inbound = {}) {
  if (inbound.documentDirection === "supplier_return") return "";
  if (!clean(facts.color) || clean(facts.color).includes("待")) return "颜色还没看清";
  if (!(Number(facts.widthCm) > 0)) return "宽幅还没看清";
  if (!(Number(facts.weightKg) > 0)) return "公斤还没看清";
  return "";
}

export function applyOfficeRollCorrection({ lineDrafts = {}, documentDraft = {}, row = {}, correction = {} } = {}) {
  const lineId = clean(row.lineId);
  if (!lineId) return { lineDrafts, documentDraft };
  const count = positiveCount(row.lineRollCount);
  const stored = lineDrafts[lineId];
  const current = { ...(stored && Object.keys(stored).length ? stored : draftFromLineValues(row.line?.values)) };
  if (correction.color != null) current.factoryColor = clean(correction.color);
  if (correction.widthCm != null && clean(correction.widthCm)) {
    current.spec = replaceWidthInSpec(current.spec || row.spec, correction.widthCm);
  }
  if (correction.weightKg != null && clean(correction.weightKg)) {
    const weights = readWeightDraft(current.rollWeightsKg, count);
    weights[Math.max(0, Number(row.lineRollIndex) || 0)] = clean(correction.weightKg);
    current.rollWeightsKg = weights.join(", ");
    const lineTotal = roundWeight(weights.reduce((total, weight) => total + (Number(weight) || 0), 0));
    current.totalWeightKg = count === 1 ? weights[0] : lineTotal;
  }
  const nextLineDrafts = { ...lineDrafts, [lineId]: current };
  const nextDocument = { ...documentDraft };
  if (correction.weightKg != null) nextDocument.totalWeightKg = sumDraftWeight(nextLineDrafts);
  return { lineDrafts: nextLineDrafts, documentDraft: nextDocument };
}

export function replaceWidthInSpec(spec, widthCm) {
  const width = Number(widthCm);
  const original = String(spec ?? "");
  if (!(width > 0)) return original;
  const parsed = parseRawMaterialSpec(original);
  if (parsed.lengthM > 0 && parsed.gramWeightGsm > 0) {
    return `${formatPlainNumber(parsed.gramWeightGsm)}*${formatPlainNumber(width)}*${formatPlainNumber(parsed.lengthM)}`;
  }
  if (width === RAW_MATERIAL_HANDLE_WIDTH_CM) {
    const gram = parsed.gramWeightGsm || RAW_MATERIAL_STANDARD_HANDLE_GSM;
    return parsed.lengthM > 0
      ? `${gram}*${RAW_MATERIAL_HANDLE_WIDTH_CM}*${formatPlainNumber(parsed.lengthM)}`
      : `${gram}*${RAW_MATERIAL_HANDLE_WIDTH_CM}`;
  }
  return original;
}

function toOfficeReviewRow(row, inbound) {
  const parsed = parseRawMaterialSpec(row.spec);
  const widthCm = parsed.widthCm || Number(row.widthCm) || Number(inbound.widthCm) || 0;
  const color = clean(row.lineDraft?.factoryColor) || clean(row.line?.values?.factoryColor) || clean(row.factoryColor) || clean(inbound.factoryColor);
  const facts = { color, widthCm, weightKg: row.weightKg, specLabel: formatRawMaterialMobileSpec(row.spec) || clean(row.spec) };
  return {
    ...row,
    ...facts,
    blocker: officeRollBlocker(facts, inbound),
  };
}

function draftFromLineValues(values = {}) {
  return {
    productName: values.productName ?? "",
    materialType: values.materialType ?? "",
    supplierColor: values.supplierColor ?? "",
    factoryColor: values.factoryColor ?? "",
    spec: values.spec ?? "",
    rollCount: values.rollCount ?? "",
    totalWeightKg: values.totalWeightKg ?? "",
    unit: values.unit ?? "",
    unitPrice: values.unitPrice ?? "",
    amount: values.amount ?? "",
    supplierRollNo: values.supplierRollNo ?? "",
    rollWeightsKg: Array.isArray(values.rollWeightsKg) ? values.rollWeightsKg.join(", ") : values.rollWeightsKg ?? "",
  };
}

function describeOfficeRollFacts(roll = {}, inbound = {}) {
  const parsed = parseRawMaterialSpec(roll.spec || inbound.spec);
  return {
    color: clean(roll.factoryColor) || clean(roll.supplierColor) || clean(inbound.factoryColor) || clean(inbound.supplierColor),
    specLabel: formatRawMaterialMobileSpec(roll.spec || inbound.spec),
    widthCm: parsed.widthCm || Number(roll.widthCm) || Number(inbound.widthCm) || 0,
  };
}

function officeHasMismatch(inbound = {}) {
  return (inbound.rolls ?? []).some((roll) => String(roll.labelStatus || "").includes("不符") || roll.inventoryStatus === "待确认");
}

function parseStickCount(value) {
  const text = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)$/u.test(text)) return null;
  return Number(text);
}

function readWeightDraft(value, count) {
  const entries = Array.isArray(value)
    ? value
    : clean(value)
      ? clean(value).split(/[,，\s]+/u)
      : [];
  return Array.from({ length: count }, (_, index) => entries[index] ?? "");
}

function sumDraftWeight(lineDrafts) {
  return roundWeight(Object.values(lineDrafts).reduce((total, draft) => {
    const direct = Number(draft?.totalWeightKg);
    return total + (Number.isFinite(direct) ? direct : 0);
  }, 0));
}

function positiveCount(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

function roundWeight(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function formatPlainNumber(value) {
  return Number.isInteger(Number(value)) ? String(Number(value)) : String(Number(value));
}

function clean(value) {
  return String(value ?? "").trim();
}
