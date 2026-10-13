import { attachmentUploadLimits } from "../../shared/attachmentUploadPolicy.js";

export const RAW_MATERIAL_OCR_NORMALIZED_MAX_EDGE = 3200;
export const RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES = 4;
const JPEG_QUALITIES = [0.9, 0.82, 0.74, 0.66];

export async function prepareRawMaterialDeliveryNotePages(file, options = {}) {
  const sourceMimeType = String(file?.type ?? options.mimeType ?? "").trim().toLowerCase();
  if (sourceMimeType !== "application/pdf") {
    return [await prepareRawMaterialDeliveryNoteFile(file, options)];
  }

  if (!file) throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_REQUIRED", "请选择送货单照片或 PDF。");
  const sourceSize = Number(file.size ?? 0);
  if (!Number.isFinite(sourceSize) || sourceSize <= 0) {
    throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_EMPTY", "送货单文件为空，请重新选择。");
  }
  if (sourceSize > attachmentUploadLimits.rawMaterialOcrSourceBytes) {
    throw uploadError(
      "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_TOO_LARGE",
      "送货单 PDF 不能超过 30MB，请重新选择。",
    );
  }

  const renderedPages = typeof options.renderPdfPages === "function"
    ? await options.renderPdfPages(file, { maxPages: RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES })
    : await renderPdfToImages(file, options);
  if (!Array.isArray(renderedPages) || !renderedPages.length) {
    throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_PDF_EMPTY", "PDF 中没有可识别页面，请重新选择。");
  }
  if (renderedPages.length > RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES) {
    throw uploadError(
      "RAW_MATERIAL_DELIVERY_NOTE_PAGE_LIMIT_EXCEEDED",
      `同一张送货单最多支持 ${RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES} 页，请拆分后再录入。`,
    );
  }

  const baseName = String(file.name || "送货单.pdf").replace(/\.pdf$/iu, "") || "送货单";
  const pages = [];
  for (const [sourcePageIndex, renderedPage] of renderedPages.entries()) {
    const pageFile = toNamedImageFile(
      renderedPage,
      `${baseName}-第${sourcePageIndex + 1}页.jpg`,
      options,
    );
    const prepared = await prepareRawMaterialDeliveryNoteFile(pageFile, {
      ...options,
      mimeType: "image/jpeg",
    });
    pages.push({
      ...prepared,
      documentSourceFile: sourcePageIndex === 0 ? file : null,
      documentSourceFileName: file.name || "送货单.pdf",
      documentSourceFileSize: sourceSize,
      documentSourceMimeType: sourceMimeType,
      pdfPageNumber: sourcePageIndex + 1,
    });
  }
  return pages;
}

export async function prepareRawMaterialDeliveryNoteFile(file, options = {}) {
  if (!file) throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_REQUIRED", "请选择送货单照片或 PDF。");
  const sourceSize = Number(file.size ?? 0);
  const sourceMimeType = String(file.type ?? options.mimeType ?? "").trim().toLowerCase();
  if (!Number.isFinite(sourceSize) || sourceSize <= 0) {
    throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_EMPTY", "送货单文件为空，请重新拍摄或选择。");
  }
  if (sourceSize > attachmentUploadLimits.rawMaterialOcrSourceBytes) {
    throw uploadError(
      "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_TOO_LARGE",
      "送货单原图不能超过 30MB，请重新拍摄或选择其他照片。",
    );
  }

  if (sourceMimeType === "application/pdf") {
    if (sourceSize > attachmentUploadLimits.rawMaterialOcrRequestPageBytes) {
      throw uploadError(
        "RAW_MATERIAL_DELIVERY_NOTE_PDF_TOO_LARGE",
        "PDF 暂不能自动压缩，单页 PDF 请控制在 4MB 内；手机照片可直接选择，系统会自动处理。",
      );
    }
    const contentDataUrl = await readBlobAsDataUrl(file, options);
    return {
      contentDataUrl,
      fileSize: sourceSize,
      mimeType: sourceMimeType,
      sourceContentDataUrl: "",
      sourceFile: file,
      sourceFileSize: sourceSize,
      sourceMimeType,
      normalized: false,
    };
  }

  if (sourceSize <= attachmentUploadLimits.rawMaterialOcrRequestPageBytes) {
    const contentDataUrl = await readBlobAsDataUrl(file, options);
    return {
      contentDataUrl,
      fileSize: sourceSize,
      mimeType: sourceMimeType || "image/jpeg",
      sourceContentDataUrl: "",
      sourceFile: file,
      sourceFileSize: sourceSize,
      sourceMimeType: sourceMimeType || "image/jpeg",
      normalized: false,
    };
  }

  const normalizedBlob = await normalizeImageForOcr(file, options);
  if (!normalizedBlob || normalizedBlob.size > attachmentUploadLimits.rawMaterialOcrRequestPageBytes) {
    throw uploadError(
      "RAW_MATERIAL_DELIVERY_NOTE_NORMALIZE_FAILED",
      "系统未能把照片处理到可识别大小，请重新拍摄；不需要手工压缩。",
    );
  }
  return {
    contentDataUrl: await readBlobAsDataUrl(normalizedBlob, options),
    fileSize: normalizedBlob.size,
    mimeType: "image/jpeg",
    sourceContentDataUrl: "",
    sourceFile: file,
    sourceFileSize: sourceSize,
    sourceMimeType: sourceMimeType || "image/jpeg",
    normalized: true,
  };
}

async function normalizeImageForOcr(file, options) {
  const image = await loadImageSource(file, options);
  try {
    let maxEdge = Number(options.maxEdge ?? RAW_MATERIAL_OCR_NORMALIZED_MAX_EDGE);
    for (let scaleAttempt = 0; scaleAttempt < 5; scaleAttempt += 1) {
      const dimensions = fitRawMaterialOcrImageDimensions(image.width, image.height, maxEdge);
      const canvas = createCanvas(dimensions.width, dimensions.height, options);
      const context = canvas.getContext?.("2d", { alpha: false });
      if (!context) throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_CANVAS_UNAVAILABLE", "当前浏览器无法处理相机照片。");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, dimensions.width, dimensions.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image.source, 0, 0, dimensions.width, dimensions.height);
      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (blob?.size && blob.size <= attachmentUploadLimits.rawMaterialOcrRequestPageBytes) return blob;
      }
      maxEdge = Math.max(1200, Math.floor(maxEdge * 0.82));
    }
    return null;
  } finally {
    image.close?.();
  }
}

async function renderPdfToImages(file, options) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  try {
    const workerAsset = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    if (workerAsset?.default) pdfjs.GlobalWorkerOptions.workerSrc = workerAsset.default;
  } catch {
    // Node-based checks use PDF.js' fake worker; Vite supplies the browser URL.
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjs.getDocument({ data: bytes });
  const document = await documentTask.promise;
  try {
    if (document.numPages > RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES) {
      throw uploadError(
        "RAW_MATERIAL_DELIVERY_NOTE_PAGE_LIMIT_EXCEEDED",
        `该 PDF 有 ${document.numPages} 页，同一张送货单最多支持 ${RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES} 页。`,
      );
    }
    const images = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const initial = page.getViewport({ scale: 1 });
      const scale = Math.min(3, RAW_MATERIAL_OCR_NORMALIZED_MAX_EDGE / Math.max(initial.width, initial.height));
      const viewport = page.getViewport({ scale: Math.max(1, scale) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height), options);
      const context = canvas.getContext?.("2d", { alpha: false });
      if (!context) throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_CANVAS_UNAVAILABLE", "当前浏览器无法处理 PDF 页面。");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      images.push(await canvasToBlob(canvas, "image/jpeg", 0.9));
      page.cleanup?.();
    }
    return images;
  } finally {
    await document.destroy?.();
  }
}

function toNamedImageFile(blob, fileName, options) {
  const FileImpl = options.File ?? globalThis.File;
  if (typeof FileImpl === "function") return new FileImpl([blob], fileName, { type: "image/jpeg" });
  return {
    ...blob,
    name: fileName,
    type: "image/jpeg",
    size: Number(blob?.size) || 0,
    contentDataUrl: blob?.contentDataUrl,
  };
}

async function loadImageSource(file, options) {
  const createImageBitmapImpl = options.createImageBitmap ?? globalThis.createImageBitmap;
  if (typeof createImageBitmapImpl === "function") {
    const bitmap = await createImageBitmapImpl(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: Number(bitmap.width),
      height: Number(bitmap.height),
      close: () => bitmap.close?.(),
    };
  }

  const ImageImpl = options.Image ?? globalThis.Image;
  const URLImpl = options.URL ?? globalThis.URL;
  if (typeof ImageImpl !== "function" || typeof URLImpl?.createObjectURL !== "function") {
    throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_IMAGE_DECODE_UNAVAILABLE", "当前浏览器无法读取相机照片。");
  }
  const objectUrl = URLImpl.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new ImageImpl();
      element.onload = () => resolve(element);
      element.onerror = () => reject(uploadError("RAW_MATERIAL_DELIVERY_NOTE_IMAGE_INVALID", "送货单照片无法读取，请重新拍摄。"));
      element.src = objectUrl;
    });
    return {
      source: image,
      width: Number(image.naturalWidth || image.width),
      height: Number(image.naturalHeight || image.height),
      close: () => URLImpl.revokeObjectURL?.(objectUrl),
    };
  } catch (error) {
    URLImpl.revokeObjectURL?.(objectUrl);
    throw error;
  }
}

function createCanvas(width, height, options) {
  if (typeof options.createCanvas === "function") return options.createCanvas(width, height);
  const documentImpl = options.document ?? globalThis.document;
  const canvas = documentImpl?.createElement?.("canvas");
  if (!canvas) throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_CANVAS_UNAVAILABLE", "当前浏览器无法处理相机照片。");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob?.(
      (blob) => blob ? resolve(blob) : reject(uploadError("RAW_MATERIAL_DELIVERY_NOTE_NORMALIZE_FAILED", "照片处理失败，请重新拍摄。")),
      mimeType,
      quality,
    );
  });
}

function readBlobAsDataUrl(blob, options) {
  if (typeof blob?.contentDataUrl === "string") return Promise.resolve(blob.contentDataUrl);
  const FileReaderImpl = options.FileReader ?? globalThis.FileReader;
  if (typeof FileReaderImpl !== "function") {
    throw uploadError("RAW_MATERIAL_DELIVERY_NOTE_FILE_READER_UNAVAILABLE", "当前浏览器无法读取送货单文件。");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReaderImpl();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(uploadError("RAW_MATERIAL_DELIVERY_NOTE_READ_FAILED", "送货单文件读取失败，请重试。"));
    reader.readAsDataURL(blob);
  });
}

export function fitRawMaterialOcrImageDimensions(widthValue, heightValue, maxEdge = RAW_MATERIAL_OCR_NORMALIZED_MAX_EDGE) {
  const width = Math.max(1, Number(widthValue) || 1);
  const height = Math.max(1, Number(heightValue) || 1);
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function uploadError(code, message) {
  return Object.assign(new Error(message), { code });
}
