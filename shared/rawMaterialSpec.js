export const RAW_MATERIAL_STANDARD_FABRIC_GSM = 78;
export const RAW_MATERIAL_HANDLE_WIDTH_CM = 5;
export const RAW_MATERIAL_HANDLE_CATEGORY = "提手条";
export const RAW_MATERIAL_BODY_CATEGORY = "布料";
export const RAW_MATERIAL_HANDLE_USAGE = "提手原材料";
export const RAW_MATERIAL_BODY_USAGE = "袋身原材料";

export function hasExplicitRawMaterialStripMarker(value) {
  const text = cleanText(value).replace(/\s+/gu, "");
  return Boolean(text && /(?:提手条|把条|布条|条料|条类|条)$/u.test(text));
}

export function classifyRawMaterialCategory({ widthCm = 0, texts = [] } = {}) {
  const confirmedWidthCm = Number(widthCm);
  const evidence = Array.isArray(texts) ? texts : [texts];
  if (Number.isFinite(confirmedWidthCm) && confirmedWidthCm > 0) {
    return confirmedWidthCm === RAW_MATERIAL_HANDLE_WIDTH_CM
      ? RAW_MATERIAL_HANDLE_CATEGORY
      : RAW_MATERIAL_BODY_CATEGORY;
  }
  if (evidence.some(hasExplicitRawMaterialStripMarker)) return RAW_MATERIAL_HANDLE_CATEGORY;
  return "";
}

export function resolveRawMaterialUsage(input = {}) {
  const materialCategory = classifyRawMaterialCategory(input);
  if (materialCategory === RAW_MATERIAL_HANDLE_CATEGORY) {
    return { materialCategory, materialUsage: RAW_MATERIAL_HANDLE_USAGE };
  }
  if (materialCategory === RAW_MATERIAL_BODY_CATEGORY) {
    return { materialCategory, materialUsage: RAW_MATERIAL_BODY_USAGE };
  }
  return { materialCategory: "", materialUsage: "" };
}

export function parseRawMaterialSpec(value) {
  const specRaw = cleanText(value);
  const explicitStrip = hasExplicitRawMaterialStripMarker(specRaw);
  const explicitWidthCm = extractExplicitRawMaterialWidthCm(specRaw);
  const incompleteCategory = classifyRawMaterialCategory({
    widthCm: explicitWidthCm,
    texts: [specRaw],
  });
  const stripDefaultsApply = incompleteCategory === RAW_MATERIAL_HANDLE_CATEGORY;
  const empty = {
    specRaw,
    gramWeightGsm: stripDefaultsApply ? RAW_MATERIAL_STANDARD_FABRIC_GSM : 0,
    widthCm: stripDefaultsApply ? RAW_MATERIAL_HANDLE_WIDTH_CM : explicitWidthCm,
    lengthM: 0,
    specDisplay: stripDefaultsApply
      ? `${RAW_MATERIAL_STANDARD_FABRIC_GSM}克 × ${RAW_MATERIAL_HANDLE_WIDTH_CM}cm`
      : specRaw,
    materialCategory: incompleteCategory,
    specNeedsReview: !stripDefaultsApply,
    specReviewReason: stripDefaultsApply
      ? `已识别为提手条并带入工厂固定${RAW_MATERIAL_STANDARD_FABRIC_GSM}克/${RAW_MATERIAL_HANDLE_WIDTH_CM}cm宽；厂家未写米数，按原单保留为空`
      : explicitWidthCm > 0
        ? `已按${formatNumber(explicitWidthCm)}cm宽幅识别为袋身原材料；克重/米数仍需复核`
        : specRaw ? "规格不是可确认的三段式克重/宽幅/米数" : "规格缺失",
  };
  if (!specRaw) return empty;

  const parts = specRaw.replace(/[×xX]/gu, "*").split("*").map((part) => part.trim());
  if (parts.length === 2) {
    const numbers = parts.map((part) => {
      const matches = part.match(/\d+(?:\.\d+)?/gu) ?? [];
      return matches.length === 1 ? Number(matches[0]) : 0;
    });
    const isCanonicalStripWithoutMeters = numbers.includes(RAW_MATERIAL_STANDARD_FABRIC_GSM)
      && numbers.includes(RAW_MATERIAL_HANDLE_WIDTH_CM);
    if (isCanonicalStripWithoutMeters) {
      return {
        specRaw,
        gramWeightGsm: RAW_MATERIAL_STANDARD_FABRIC_GSM,
        widthCm: RAW_MATERIAL_HANDLE_WIDTH_CM,
        lengthM: 0,
        specDisplay: `${RAW_MATERIAL_STANDARD_FABRIC_GSM}克 × ${RAW_MATERIAL_HANDLE_WIDTH_CM}cm`,
        materialCategory: RAW_MATERIAL_HANDLE_CATEGORY,
        specNeedsReview: false,
        specReviewReason: "",
      };
    }
  }
  if (parts.length !== 3) return empty;
  const numbers = parts.map((part) => {
    const matches = part.match(/\d+(?:\.\d+)?/gu) ?? [];
    return matches.length === 1 ? Number(matches[0]) : 0;
  });
  if (numbers.some((number) => !Number.isFinite(number) || number <= 0)) return empty;

  const [first, second, lengthM] = numbers;
  const firstIsGram = /克重|克|gsm|g\b/iu.test(parts[0]);
  const secondIsGram = /克重|克|gsm|g\b/iu.test(parts[1]);
  const firstIsWidth = /宽幅|门幅|幅宽|宽度|cm|厘米/iu.test(parts[0]);
  const secondIsWidth = /宽幅|门幅|幅宽|宽度|cm|厘米/iu.test(parts[1]);
  let gramWeightGsm = 0;
  let widthCm = 0;
  if (firstIsGram && secondIsWidth) [gramWeightGsm, widthCm] = [first, second];
  else if (secondIsGram && firstIsWidth) [gramWeightGsm, widthCm] = [second, first];
  else if (first === RAW_MATERIAL_STANDARD_FABRIC_GSM && second !== RAW_MATERIAL_STANDARD_FABRIC_GSM) {
    [gramWeightGsm, widthCm] = [first, second];
  } else if (second === RAW_MATERIAL_STANDARD_FABRIC_GSM && first !== RAW_MATERIAL_STANDARD_FABRIC_GSM) {
    [gramWeightGsm, widthCm] = [second, first];
  } else if (first === RAW_MATERIAL_STANDARD_FABRIC_GSM && second === RAW_MATERIAL_STANDARD_FABRIC_GSM) {
    [gramWeightGsm, widthCm] = [first, second];
  } else {
    return {
      ...empty,
      specReviewReason: `前两段未找到当前标准克重${RAW_MATERIAL_STANDARD_FABRIC_GSM}克，不能自动判断克重与宽幅`,
    };
  }
  const materialCategory = classifyRawMaterialCategory({ widthCm, texts: explicitStrip ? [specRaw] : [] });
  if (materialCategory === RAW_MATERIAL_HANDLE_CATEGORY) {
    return {
      specRaw,
      gramWeightGsm: RAW_MATERIAL_STANDARD_FABRIC_GSM,
      widthCm: RAW_MATERIAL_HANDLE_WIDTH_CM,
      lengthM,
      specDisplay: lengthM > 0
        ? `${RAW_MATERIAL_STANDARD_FABRIC_GSM}克 × ${RAW_MATERIAL_HANDLE_WIDTH_CM}cm × ${formatNumber(lengthM)}米`
        : `${RAW_MATERIAL_STANDARD_FABRIC_GSM}克 × ${RAW_MATERIAL_HANDLE_WIDTH_CM}cm`,
      materialCategory,
      specNeedsReview: false,
      specReviewReason: "",
    };
  }
  const specNeedsReview = gramWeightGsm !== RAW_MATERIAL_STANDARD_FABRIC_GSM;
  return {
    specRaw,
    gramWeightGsm,
    widthCm,
    lengthM,
    specDisplay: `${formatNumber(gramWeightGsm)}克 × ${formatNumber(widthCm)}cm × ${formatNumber(lengthM)}米`,
    materialCategory,
    specNeedsReview,
    specReviewReason: specNeedsReview ? `克重不是当前标准${RAW_MATERIAL_STANDARD_FABRIC_GSM}克，需人工确认` : "",
  };
}

export function formatRawMaterialMobileSpec(value) {
  const parsed = parseRawMaterialSpec(value);
  if (parsed.gramWeightGsm > 0 && parsed.widthCm > 0 && parsed.lengthM > 0) {
    return `${formatNumber(parsed.gramWeightGsm)}克*${formatNumber(parsed.widthCm)}宽*${formatNumber(parsed.lengthM)}米`;
  }
  if (parsed.materialCategory === RAW_MATERIAL_HANDLE_CATEGORY && parsed.gramWeightGsm > 0 && parsed.widthCm > 0) {
    return `${formatNumber(parsed.gramWeightGsm)}克*${formatNumber(parsed.widthCm)}宽`;
  }
  return parsed.specDisplay || cleanText(value);
}

export function enrichRawMaterialSpecValues(values = {}) {
  const parsed = parseRawMaterialSpec(values.spec);
  const stripEvidence = [values.spec, values.productName, values.materialType, values.supplierColor, values.factoryColor];
  const materialCategory = classifyRawMaterialCategory({ widthCm: parsed.widthCm, texts: stripEvidence });
  const enriched = {
    ...values,
    ...parsed,
    materialCategory,
  };
  if (hasExplicitRawMaterialStripMarker(enriched.supplierColor)) enriched.supplierColor = removeStripSuffix(enriched.supplierColor);
  if (hasExplicitRawMaterialStripMarker(enriched.factoryColor)) enriched.factoryColor = removeStripSuffix(enriched.factoryColor);
  if (enriched.materialCategory === RAW_MATERIAL_HANDLE_CATEGORY) {
    enriched.gramWeightGsm = RAW_MATERIAL_STANDARD_FABRIC_GSM;
    enriched.widthCm = RAW_MATERIAL_HANDLE_WIDTH_CM;
    enriched.lengthM = parseThirdSpecNumber(values.spec);
    enriched.spec = enriched.lengthM > 0
      ? `${RAW_MATERIAL_STANDARD_FABRIC_GSM}*${RAW_MATERIAL_HANDLE_WIDTH_CM}*${formatNumber(enriched.lengthM)}`
      : `${RAW_MATERIAL_STANDARD_FABRIC_GSM}*${RAW_MATERIAL_HANDLE_WIDTH_CM}`;
    enriched.materialType = "提手";
    enriched.productName = "提手条";
    enriched.specDisplay = `${formatNumber(enriched.gramWeightGsm)}克 × ${formatNumber(enriched.widthCm)}cm × ${formatNumber(enriched.lengthM)}米`;
    if (!(enriched.lengthM > 0)) enriched.specDisplay = `${formatNumber(enriched.gramWeightGsm)}克 × ${formatNumber(enriched.widthCm)}cm`;
    enriched.specNeedsReview = false;
    enriched.specReviewReason = "";
  } else if (enriched.materialCategory === RAW_MATERIAL_BODY_CATEGORY) {
    enriched.materialType = "无纺布";
    enriched.productName = enriched.productName || "无纺布卷料";
  }
  return enriched;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function removeStripSuffix(value) {
  return cleanText(value).replace(/(?:提手条|把条|布条|条料|条类|条)\s*$/u, "").trim();
}

function parseThirdSpecNumber(value) {
  const parts = cleanText(value).replace(/[×xX]/gu, "*").split("*").map((part) => part.trim());
  if (parts.length !== 3) return 0;
  const matches = parts[2].match(/\d+(?:\.\d+)?/gu) ?? [];
  if (matches.length !== 1) return 0;
  const number = Number(matches[0]);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function extractExplicitRawMaterialWidthCm(value) {
  const text = cleanText(value);
  const labeled = text.match(/(?:宽幅|门幅|幅宽|宽度|宽)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)?/iu);
  const suffixLabeled = text.match(/(\d+(?:\.\d+)?)\s*(?:cm|厘米)\s*(?:宽幅|门幅|幅宽|宽度|宽)/iu);
  const segmented = text.match(/(?:^|[*×xX])\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)(?=$|[*×xX])/iu);
  const standalone = text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)\s*$/iu);
  const number = Number(labeled?.[1] ?? suffixLabeled?.[1] ?? segmented?.[1] ?? standalone?.[1] ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
