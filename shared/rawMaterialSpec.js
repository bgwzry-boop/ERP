export const RAW_MATERIAL_STANDARD_FABRIC_GSM = 78;
export const RAW_MATERIAL_HANDLE_WIDTH_CM = 5;

export function parseRawMaterialSpec(value) {
  const specRaw = cleanText(value);
  const empty = {
    specRaw,
    gramWeightGsm: 0,
    widthCm: 0,
    lengthM: 0,
    specDisplay: specRaw,
    materialCategory: "",
    specNeedsReview: true,
    specReviewReason: specRaw ? "规格不是可确认的三段式克重/宽幅/米数" : "规格缺失",
  };
  if (!specRaw) return empty;

  const parts = specRaw.replace(/[×xX]/gu, "*").split("*").map((part) => part.trim());
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
  const materialCategory = widthCm === RAW_MATERIAL_HANDLE_WIDTH_CM ? "提手条" : "布料";
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

export function enrichRawMaterialSpecValues(values = {}) {
  const enriched = {
    ...values,
    ...parseRawMaterialSpec(values.spec),
  };
  if (enriched.materialCategory === "提手条") {
    enriched.materialType = "提手";
    enriched.productName = "提手条";
  } else if (enriched.materialCategory === "布料") {
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
