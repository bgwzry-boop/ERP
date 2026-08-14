export function normalizeRawMaterialOcrPages(pages, pageCount, imageWidth, imageHeight, angle) {
  const source = Array.isArray(pages) ? pages : [];
  return Array.from({ length: Math.max(pageCount, source.length) }, (_, sourcePageIndex) => ({
    sourcePageIndex,
    pageNumber: sourcePageIndex + 1,
    angle: Number(source[sourcePageIndex]?.angle ?? angle) || 0,
    imageWidth: Math.max(0, Number(source[sourcePageIndex]?.imageWidth ?? imageWidth) || 0),
    imageHeight: Math.max(0, Number(source[sourcePageIndex]?.imageHeight ?? imageHeight) || 0),
    requestId: cleanText(source[sourcePageIndex]?.requestId),
  }));
}

export function normalizeRawMaterialOcrTextList(values, fallback) {
  const normalized = (Array.isArray(values) ? values : []).map(cleanText).filter(Boolean);
  if (normalized.length) return normalized;
  const safeFallback = cleanText(fallback);
  return safeFallback ? [safeFallback] : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
