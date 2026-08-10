export function normalizeRawMaterialOcrAngle(value) {
  let angle = Number(value);
  if (!Number.isFinite(angle)) return 0;
  if (Math.abs(angle) >= 360) angle /= 100;
  angle = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return [90, 180, 270].includes(angle) ? angle : 0;
}

export function resolveRawMaterialOcrSourceFrame({
  sourceWidth,
  sourceHeight,
  sourceFileSize = 0,
  normalizedBinaryBytes = 0,
  normalizedMaxEdge = 3200,
  ocrImageWidth = 0,
  ocrImageHeight = 0,
  lines = [],
} = {}) {
  const explicitFrame = normalizeFrame(ocrImageWidth, ocrImageHeight);
  if (explicitFrame) return explicitFrame;

  const decodedFrame = normalizeFrame(sourceWidth, sourceHeight);
  if (!decodedFrame) return null;
  const sourceBounds = (Array.isArray(lines) ? lines : [])
    .map((line) => normalizeRawMaterialOcrSourceBounds(line?.sourceBounds ?? line))
    .filter(Boolean);
  const alignedDecodedFrame = alignFrameOrientation(decodedFrame, sourceBounds);
  const normalizedFrame = fitFrameToMaxEdge(alignedDecodedFrame, normalizedMaxEdge);
  if (normalizedFrame.imageWidth === alignedDecodedFrame.imageWidth
    && normalizedFrame.imageHeight === alignedDecodedFrame.imageHeight) {
    return alignedDecodedFrame;
  }

  const normalizedByFileSize = Number(normalizedBinaryBytes) > 0
    && Number(sourceFileSize) > Number(normalizedBinaryBytes);
  const normalizedByLegacyBounds = sourceBoundsFavorFrame(sourceBounds, normalizedFrame, alignedDecodedFrame);
  return normalizedByFileSize || normalizedByLegacyBounds ? normalizedFrame : alignedDecodedFrame;
}

export function shouldRotateRawMaterialSourcePreview({ sourceWidth, sourceHeight, sourceFrame, rawAngle } = {}) {
  const angle = normalizeRawMaterialOcrAngle(rawAngle);
  if (![90, 270].includes(angle)) return angle !== 0;
  const decoded = normalizeFrame(sourceWidth, sourceHeight);
  const expected = normalizeFrame(sourceFrame?.imageWidth, sourceFrame?.imageHeight);
  if (!decoded || !expected) return true;
  const decodedOrientation = frameOrientation(decoded);
  const expectedOrientation = frameOrientation(expected);
  if (decodedOrientation !== "square" && expectedOrientation !== "square" && decodedOrientation !== expectedOrientation) {
    return false;
  }
  return true;
}

export function orientRawMaterialOcrSourceBounds(rawBounds, rawAngle, sourceFrame = null) {
  const bounds = normalizeRawMaterialOcrSourceBounds({
    ...rawBounds,
    imageWidth: Number(sourceFrame?.imageWidth) || rawBounds?.imageWidth,
    imageHeight: Number(sourceFrame?.imageHeight) || rawBounds?.imageHeight,
  });
  if (!bounds) return null;

  const angle = normalizeRawMaterialOcrAngle(rawAngle);
  if (angle === 0) return bounds;

  const { left, top, right, bottom, imageWidth, imageHeight } = bounds;
  if (angle === 90) {
    return normalizeRawMaterialOcrSourceBounds({
      left: top,
      top: imageWidth - right,
      right: bottom,
      bottom: imageWidth - left,
      imageWidth: imageHeight,
      imageHeight: imageWidth,
    });
  }
  if (angle === 180) {
    return normalizeRawMaterialOcrSourceBounds({
      left: imageWidth - right,
      top: imageHeight - bottom,
      right: imageWidth - left,
      bottom: imageHeight - top,
      imageWidth,
      imageHeight,
    });
  }
  return normalizeRawMaterialOcrSourceBounds({
    left: imageHeight - bottom,
    top: left,
    right: imageHeight - top,
    bottom: right,
    imageWidth: imageHeight,
    imageHeight: imageWidth,
  });
}

export function tightenRawMaterialOcrSourceRowBounds(bounds, nextBounds) {
  const current = normalizeRawMaterialOcrSourceBounds(bounds);
  const next = normalizeRawMaterialOcrSourceBounds(nextBounds);
  if (!current || !next) return current;
  if (current.imageWidth !== next.imageWidth || current.imageHeight !== next.imageHeight) return current;
  if (next.top <= current.top || next.top >= current.bottom) return current;
  const tightenedBottom = next.top;
  if (tightenedBottom - current.top < 1) return current;
  return { ...current, bottom: tightenedBottom };
}

export function normalizeRawMaterialOcrSourceBounds(rawBounds) {
  const imageWidth = Number(rawBounds?.imageWidth);
  const imageHeight = Number(rawBounds?.imageHeight);
  if (![imageWidth, imageHeight].every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0) return null;

  const left = clamp(Number(rawBounds?.left), 0, imageWidth);
  const top = clamp(Number(rawBounds?.top), 0, imageHeight);
  const right = clamp(Number(rawBounds?.right), 0, imageWidth);
  const bottom = clamp(Number(rawBounds?.bottom), 0, imageHeight);
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  return { left, top, right, bottom, imageWidth, imageHeight };
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeFrame(widthValue, heightValue) {
  const imageWidth = Number(widthValue);
  const imageHeight = Number(heightValue);
  if (![imageWidth, imageHeight].every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0) return null;
  return { imageWidth, imageHeight };
}

function frameOrientation(frame) {
  if (frame.imageWidth === frame.imageHeight) return "square";
  return frame.imageWidth > frame.imageHeight ? "landscape" : "portrait";
}

function alignFrameOrientation(frame, sourceBounds) {
  const legacyFrame = sourceBounds
    .map((bounds) => normalizeFrame(bounds.imageWidth, bounds.imageHeight))
    .find(Boolean);
  if (!legacyFrame) return frame;
  const decodedOrientation = frameOrientation(frame);
  const legacyOrientation = frameOrientation(legacyFrame);
  if (decodedOrientation === "square" || legacyOrientation === "square" || decodedOrientation === legacyOrientation) return frame;
  return { imageWidth: frame.imageHeight, imageHeight: frame.imageWidth };
}

function fitFrameToMaxEdge(frame, maxEdgeValue) {
  const maxEdge = Math.max(1, Number(maxEdgeValue) || 1);
  const scale = Math.min(1, maxEdge / Math.max(frame.imageWidth, frame.imageHeight));
  return {
    imageWidth: Math.max(1, Math.round(frame.imageWidth * scale)),
    imageHeight: Math.max(1, Math.round(frame.imageHeight * scale)),
  };
}

function sourceBoundsFavorFrame(sourceBounds, normalizedFrame, decodedFrame) {
  if (!sourceBounds.length) return false;
  const maxRight = Math.max(...sourceBounds.map((bounds) => bounds.right));
  const maxBottom = Math.max(...sourceBounds.map((bounds) => bounds.bottom));
  if (maxRight > normalizedFrame.imageWidth * 1.01 || maxBottom > normalizedFrame.imageHeight * 1.01) return false;
  const normalizedOccupancy = Math.max(maxRight / normalizedFrame.imageWidth, maxBottom / normalizedFrame.imageHeight);
  const decodedOccupancy = Math.max(maxRight / decodedFrame.imageWidth, maxBottom / decodedFrame.imageHeight);
  return normalizedOccupancy >= 0.9 && normalizedOccupancy - decodedOccupancy >= 0.1;
}
