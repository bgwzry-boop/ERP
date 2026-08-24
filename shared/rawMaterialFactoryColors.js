import {
  FACTORY_STANDARD_COLORS,
  normalizeFactoryStandardColor,
} from "./factoryStandardColors.js";

export const RAW_MATERIAL_FACTORY_COLORS = FACTORY_STANDARD_COLORS;

export const RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE = "supplier";

export function normalizeRawMaterialFactoryColor(value) {
  const color = String(value ?? "").normalize("NFKC").trim().replace(/[\s·•]+/gu, "");
  if (!color || /^(?:-|—|_|\.|待确认|未识别|未知|无)$/u.test(color)) return "";
  return normalizeFactoryStandardColor(color);
}

export function normalizeRawMaterialFactoryColorName(value) {
  const color = String(value ?? "").normalize("NFKC").trim().replace(/[\s·•]+/gu, "");
  if (
    !color
    || color.length > 24
    || /[\u0000-\u001f\u007f]/u.test(color)
    || /^(?:-|—|_|\.|待确认|未识别|未知|无)$/u.test(color)
  ) return "";
  return color;
}

export function listRawMaterialFactoryColors(standardColors = []) {
  const maintainedColors = (Array.isArray(standardColors) ? standardColors : [])
    .filter((item) => item?.enabled !== false)
    .map((item) => normalizeRawMaterialFactoryColorName(item?.name))
    .filter(Boolean);
  return [...new Set([...RAW_MATERIAL_FACTORY_COLORS, ...maintainedColors])];
}

export function normalizeRawMaterialSupplierColor(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\s·•]+/gu, "")
    .replace(/^(?:颜色|色号)[：:]?/u, "");
}

export function normalizeRawMaterialSupplierSourceId(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\s·•()（）]+/gu, "")
    .replace(/(?:销货单|销售单|送货单|退货单|退料单)$/u, "");
}

export function resolveRawMaterialFactoryColor({
  supplierName,
  supplierColor,
  standardColors = [],
  colorAliases = [],
} = {}) {
  const normalizedSupplierColor = normalizeRawMaterialSupplierColor(supplierColor);
  const supplierSourceId = normalizeRawMaterialSupplierSourceId(supplierName);
  if (!normalizedSupplierColor) {
    return buildResolution({ status: "unmapped", supplierSourceId, supplierColor: "" });
  }

  const standardColorNameById = new Map(
    (Array.isArray(standardColors) ? standardColors : [])
      .filter((item) => item?.enabled !== false)
      .map((item) => [cleanText(item?.id), cleanText(item?.name)]),
  );
  const aliases = (Array.isArray(colorAliases) ? colorAliases : [])
    .filter((item) => item?.enabled !== false)
    .filter((item) => normalizeRawMaterialSupplierColor(item?.alias) === normalizedSupplierColor);
  const supplierMatches = aliases.filter((item) => (
    cleanText(item?.sourceType ?? item?.source_type) === RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE
    && normalizeRawMaterialSupplierSourceId(item?.sourceId ?? item?.source_id) === supplierSourceId
  ));
  const globalMatches = aliases.filter((item) => {
    const sourceType = cleanText(item?.sourceType ?? item?.source_type) || "global";
    return sourceType === "global" && !cleanText(item?.sourceId ?? item?.source_id);
  });
  const matches = supplierMatches.length ? supplierMatches : globalMatches;
  const resolvedMatches = matches
    .map((item) => ({
      aliasId: cleanText(item?.id),
      factoryColor: standardColorNameById.get(cleanText(item?.standardColorId ?? item?.standard_color_id)) || "",
      sourceType: cleanText(item?.sourceType ?? item?.source_type) || "global",
    }))
    .filter((item) => item.factoryColor);
  const uniqueFactoryColors = [...new Set(resolvedMatches.map((item) => item.factoryColor))];
  if (uniqueFactoryColors.length === 1) {
    const matched = resolvedMatches[0];
    return buildResolution({
      ...matched,
      status: matched.sourceType === RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE ? "supplier_rule" : "global_rule",
      supplierSourceId,
      supplierColor: normalizedSupplierColor,
    });
  }
  if (uniqueFactoryColors.length > 1) {
    return buildResolution({
      status: "ambiguous",
      supplierSourceId,
      supplierColor: normalizedSupplierColor,
      candidateFactoryColors: uniqueFactoryColors,
    });
  }

  const exactFactoryColor = listRawMaterialFactoryColors(standardColors)
    .find((item) => normalizeRawMaterialFactoryColorName(item) === normalizedSupplierColor);
  if (exactFactoryColor) {
    return buildResolution({
      factoryColor: exactFactoryColor,
      sourceType: "canonical_exact",
      status: "canonical_exact",
      supplierSourceId,
      supplierColor: normalizedSupplierColor,
    });
  }
  const legacyFallback = normalizeRawMaterialFactoryColor(normalizedSupplierColor);
  if (legacyFallback) {
    return buildResolution({
      factoryColor: legacyFallback,
      sourceType: "legacy_global_fallback",
      status: "legacy_global_fallback",
      supplierSourceId,
      supplierColor: normalizedSupplierColor,
    });
  }
  return buildResolution({
    status: "unmapped",
    supplierSourceId,
    supplierColor: normalizedSupplierColor,
  });
}

export function isRawMaterialFactoryColor(value, standardColors = []) {
  const color = normalizeRawMaterialFactoryColorName(value);
  if (!color) return false;
  const availableColors = listRawMaterialFactoryColors(standardColors);
  if (availableColors.some((item) => normalizeRawMaterialFactoryColorName(item) === color)) return true;
  const canonicalColor = normalizeRawMaterialFactoryColor(color);
  return Boolean(canonicalColor) && availableColors.includes(canonicalColor);
}

function buildResolution(value = {}) {
  return {
    aliasId: cleanText(value.aliasId),
    candidateFactoryColors: Array.isArray(value.candidateFactoryColors) ? value.candidateFactoryColors : [],
    factoryColor: cleanText(value.factoryColor),
    sourceType: cleanText(value.sourceType),
    status: cleanText(value.status) || "unmapped",
    supplierColor: cleanText(value.supplierColor),
    supplierSourceId: cleanText(value.supplierSourceId),
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
