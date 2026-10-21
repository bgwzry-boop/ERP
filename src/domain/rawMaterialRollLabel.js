import { parseRawMaterialSpec } from "../../shared/rawMaterialSpec.js";

export const RAW_MATERIAL_ROLL_LABEL_COMPANY = Object.freeze({
  name: "河北禄兴包装制品有限公司",
  phone: "17367893639",
  address: "河北省邢台市宁晋县河渠镇大召村",
});

export const RAW_MATERIAL_ROLL_LABEL_EXECUTION_STANDARD = "FZ/T 64033-2014";
export const RAW_MATERIAL_ROLL_LABEL_SIZE = Object.freeze({ widthMm: 76, heightMm: 130 });

export function buildRawMaterialRollLabelModel(inbound = {}, roll = {}) {
  const spec = parseRawMaterialSpec(roll.spec || inbound.specRaw || inbound.spec || "");
  const material = clean(roll.materialType || inbound.materialType);
  const product = clean(roll.productName || inbound.productName);
  const widthCm = positive(roll.widthCm) || positive(inbound.widthCm) || positive(spec.widthCm);
  const gramWeightGsm = positive(roll.gramWeightGsm) || positive(inbound.gramWeightGsm) || positive(spec.gramWeightGsm);
  const lengthM = positive(roll.lengthM) || positive(inbound.lengthM) || positive(spec.lengthM);
  const weightKg = positive(roll.weightKg);
  const dateSource = clean(roll.labelVerifiedAt || inbound.receivedAt || inbound.reviewedAt || inbound.deliveryDate);
  const dateMatch = dateSource.match(/\d{4}-\d{2}-\d{2}/u);
  return {
    rollCode: clean(roll.id),
    productName: labelProductName(product, material),
    executionStandard: clean(roll.executionStandard || inbound.executionStandard) || RAW_MATERIAL_ROLL_LABEL_EXECUTION_STANDARD,
    widthText: formatMeasure(widthCm) || "待补",
    lengthText: formatMeasure(lengthM),
    gramWeightText: formatMeasure(gramWeightGsm) || "待补",
    weightText: formatMeasure(weightKg) || "待补",
    color: clean(roll.factoryColor || roll.supplierColor || inbound.factoryColor || inbound.supplierColor) || "待补",
    supplierName: clean(inbound.supplierName) || "待补",
    inboundNo: clean(inbound.deliveryNoteNo || inbound.id) || "待补",
    date: dateMatch?.[0] || dateSource || "待补",
    companyName: clean(inbound.companyName) || RAW_MATERIAL_ROLL_LABEL_COMPANY.name,
    companyPhone: clean(inbound.companyPhone) || RAW_MATERIAL_ROLL_LABEL_COMPANY.phone,
    companyAddress: clean(inbound.companyAddress) || RAW_MATERIAL_ROLL_LABEL_COMPANY.address,
  };
}

function labelProductName(product, material) {
  const evidence = `${product}${material}`;
  if (evidence.includes("提手")) return "提手条";
  if (material === "布料" || material.includes("无纺布") || product.includes("无纺布")) return "无纺布";
  return product || material || "无纺布";
}

function formatMeasure(value) {
  if (!value) return "";
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}
