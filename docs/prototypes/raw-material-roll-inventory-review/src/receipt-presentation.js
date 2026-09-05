import {
  RAW_MATERIAL_HANDLE_WIDTH_CM,
  hasExplicitRawMaterialStripMarker,
  parseRawMaterialSpec,
} from "../../../../shared/rawMaterialSpec.js";

const cleanText = (value) => String(value ?? "").trim();

const positiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const formatMeasurement = (value) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export function formatReceiptArrivalTime(value) {
  const text = cleanText(value);
  if (!text) return "时间待确认";
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }
  }
  const match = text.match(/^(\d{4}[-/]\d{2}[-/]\d{2})[T\s]+(\d{2}:\d{2})/);
  return match ? `${match[1].replaceAll("/", "-")} ${match[2]}` : text;
}

export function buildReceiptRowPresentation(row = {}) {
  const countValue = Math.max(0, Math.trunc(Number(row.rollCount ?? row.rolls?.length ?? 0) || 0));
  const materialIdentity = `${cleanText(row.materialType)} ${cleanText(row.materialCategory)}`;
  const countUnit = row.documentDirection === "supplier_return" || (materialIdentity.includes("提手") && cleanText(row.unit) === "件") ? "件" : "卷";
  const totalWeightKg = Number(row.totalWeightKg);
  const reviewStatus = cleanText(row.status) || "状态待确认";
  const duplicateText = cleanText(row.duplicate) || "未发现重复";
  return {
    supplierName: cleanText(row.supplier ?? row.supplierName) || "送货单位待确认",
    ticketText: cleanText(row.deliveryNoteNo) || "供应商未提供单号",
    arrivalTime: formatReceiptArrivalTime(row.receivedAt),
    countLabel: `${countValue}${countUnit}`,
    totalWeightLabel: Number.isFinite(totalWeightKg) && totalWeightKg !== 0
      ? `${totalWeightKg.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}kg`
      : "待确认",
    reviewStatus,
    duplicateText,
    duplicateNeedsAttention: Boolean(cleanText(row.duplicate)) || reviewStatus.includes("异常"),
  };
}

export function buildReceiptMaterialPresentation(row = {}) {
  const sourceSpec = cleanText(row.specDisplay || row.spec);
  const parsedSpec = parseRawMaterialSpec(sourceSpec);
  const evidence = [row.materialCategory, row.productName, row.materialType, sourceSpec].map(cleanText).filter(Boolean);
  const explicitWidthCm = positiveNumber(row.widthCm);
  const isHandleStrip = evidence.some((value) => value === "提手条" || hasExplicitRawMaterialStripMarker(value))
    || explicitWidthCm === RAW_MATERIAL_HANDLE_WIDTH_CM;
  const widthCm = isHandleStrip
    ? RAW_MATERIAL_HANDLE_WIDTH_CM
    : explicitWidthCm || positiveNumber(parsedSpec.widthCm);
  const materialType = isHandleStrip
    ? "把条"
    : cleanText(row.materialCategory || row.materialType || row.productName) || "类型待确认";

  return {
    materialType,
    widthLabel: widthCm ? `${formatMeasurement(widthCm)}cm` : "宽幅待确认",
  };
}
