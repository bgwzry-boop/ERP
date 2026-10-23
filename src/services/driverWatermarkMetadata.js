export function buildDeliveryWatermarkImageLines(watermarkMetadata = {}) {
  return [
    [watermarkMetadata.watermarkOperatorName, watermarkMetadata.watermarkOrderRef, watermarkMetadata.watermarkId].filter(Boolean).join(" / "),
    watermarkMetadata.watermarkAddress ? `地址 ${watermarkMetadata.watermarkAddress}` : "",
    watermarkMetadata.watermarkCapturedAt ? `时间 ${watermarkMetadata.watermarkCapturedAt}` : "",
    [watermarkMetadata.watermarkLocationLabel, watermarkMetadata.watermarkGeoPoint].filter(Boolean).join(" / "),
  ].filter(Boolean);
}

export function getWatermarkedDeliveryFileName(fileName = "", watermarkId = "") {
  const safeName = String(fileName || "delivery-watermark.jpg").trim();
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const suffix = watermarkId ? `-${watermarkId}` : "-watermarked";
  return `${baseName}${suffix}.jpg`;
}

export function estimateDataUrlByteSize(dataUrl = "") {
  const base64 = String(dataUrl).split(",")[1] ?? "";
  if (!base64) return undefined;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

