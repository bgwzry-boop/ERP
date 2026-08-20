export const RAW_MATERIAL_FACTORY_COLORS = [
  "本白",
  "大红",
  "酒红",
  "枣红",
  "焦糖",
  "酱黄",
  "米黄",
  "咖啡",
  "桔红",
  "黑色",
  "宝兰",
  "天兰",
  "浅紫",
  "深灰",
  "豆沙绿",
  "翠绿",
  "果绿",
  "墨绿",
  "橄榄绿",
  "湖蓝",
];

export const RAW_MATERIAL_SUPPLIER_COLOR_SOURCE_TYPE = "supplier";

const RAW_MATERIAL_FACTORY_COLOR_ALIASES = [
  [/^(?:本白|白|白色|日白|曰白|口白)$/u, "本白"],
  [/大红/u, "大红"],
  [/酒红/u, "酒红"],
  [/枣红/u, "枣红"],
  [/焦糖/u, "焦糖"],
  [/(?:酱黄|酱黄色)/u, "酱黄"],
  [/米黄/u, "米黄"],
  [/(?:咖啡|咖色)/u, "咖啡"],
  [/(?:桔红|橘红)/u, "桔红"],
  [/^(?:黑|黑色)$/u, "黑色"],
  [/(?:宝兰|宝蓝)/u, "宝兰"],
  [/(?:天兰|天蓝)/u, "天兰"],
  [/浅紫/u, "浅紫"],
  [/深灰/u, "深灰"],
  [/豆沙绿/u, "豆沙绿"],
  [/翠绿/u, "翠绿"],
  [/果绿/u, "果绿"],
  [/墨绿/u, "墨绿"],
  [/橄榄绿/u, "橄榄绿"],
  [/湖蓝/u, "湖蓝"],
];

export function normalizeRawMaterialFactoryColor(value) {
  const color = String(value ?? "").normalize("NFKC").trim().replace(/[\s·•]+/gu, "");
  if (!color || /^(?:-|—|_|\.|待确认|未识别|未知|无)$/u.test(color)) return "";
  const exact = RAW_MATERIAL_FACTORY_COLORS.find((item) => item === color);
  if (exact) return exact;
  return RAW_MATERIAL_FACTORY_COLOR_ALIASES.find(([pattern]) => pattern.test(color))?.[1] ?? "";
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
    .replace(/(?:销售退货单|销货退货单|销售退料单|销货退料单|销货单|销售单|送货单|退货单|退料单|退库单)$/u, "");
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

  const exactFactoryColor = RAW_MATERIAL_FACTORY_COLORS.find((item) => item === normalizedSupplierColor);
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

export function isRawMaterialFactoryColor(value) {
  return RAW_MATERIAL_FACTORY_COLORS.includes(String(value ?? "").trim());
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
