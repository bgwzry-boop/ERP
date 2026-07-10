export async function createWatermarkedDeliveryImageDataUrl(sourceDataUrl, watermarkMetadata = {}) {
  if (!sourceDataUrl || typeof document === "undefined" || typeof Image === "undefined") return sourceDataUrl;
  const image = await loadImageFromDataUrl(sourceDataUrl);
  if (!image) return sourceDataUrl;
  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  if (!sourceWidth || !sourceHeight) return sourceDataUrl;

  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return sourceDataUrl;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  drawDeliveryWatermarkOverlay(context, canvas, watermarkMetadata);
  try {
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return sourceDataUrl;
  }
}

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

function loadImageFromDataUrl(sourceDataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = sourceDataUrl;
  });
}

function drawDeliveryWatermarkOverlay(context, canvas, watermarkMetadata = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const padding = Math.max(14, Math.round(width * 0.018));
  const fontSize = Math.max(18, Math.round(width * 0.025));
  const lineHeight = Math.round(fontSize * 1.35);
  const lines = buildDeliveryWatermarkImageLines(watermarkMetadata);
  context.save();
  context.font = `600 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const wrappedLines = lines
    .flatMap((line) => wrapCanvasText(context, line, width - padding * 2))
    .slice(0, 9);
  const panelHeight = Math.min(height, padding * 2 + wrappedLines.length * lineHeight);
  const panelTop = height - panelHeight;
  const gradient = context.createLinearGradient(0, panelTop, 0, height);
  gradient.addColorStop(0, "rgba(15, 23, 42, 0.12)");
  gradient.addColorStop(0.18, "rgba(15, 23, 42, 0.78)");
  gradient.addColorStop(1, "rgba(15, 23, 42, 0.9)");
  context.fillStyle = gradient;
  context.fillRect(0, panelTop, width, panelHeight);
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.65)";
  context.shadowBlur = 4;
  context.shadowOffsetY = 1;
  wrappedLines.forEach((line, index) => {
    context.fillText(line, padding, panelTop + padding + lineHeight * (index + 0.75));
  });
  context.restore();
}

function wrapCanvasText(context, text, maxWidth) {
  const characters = Array.from(String(text ?? "").trim());
  if (!characters.length) return [];
  const lines = [];
  let currentLine = "";
  characters.forEach((character) => {
    const nextLine = `${currentLine}${character}`;
    if (currentLine && context.measureText(nextLine).width > maxWidth) {
      lines.push(currentLine);
      currentLine = character;
    } else {
      currentLine = nextLine;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}
