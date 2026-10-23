export { buildDeliveryWatermarkImageLines, getWatermarkedDeliveryFileName, estimateDataUrlByteSize } from "./driverWatermarkMetadata.js";

// Canvas rendering is needed only when a driver actually submits a delivery photo.
export async function createWatermarkedDeliveryImageDataUrl(sourceDataUrl, watermarkMetadata = {}) {
  const { renderWatermarkedDeliveryImageDataUrl } = await import("./driverWatermarkImageRenderer.js");
  return renderWatermarkedDeliveryImageDataUrl(sourceDataUrl, watermarkMetadata);
}
