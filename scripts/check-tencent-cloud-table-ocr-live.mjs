import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createTencentCloudTableOcrService } from "../server/services/tencentCloudTableOcrService.mjs";

const samplePath = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  process.stderr.write("Usage: node scripts/check-tencent-cloud-table-ocr-live.mjs <image-or-pdf>\n");
  process.exit(1);
}

const mimeType = resolveMimeType(samplePath);
const contentDataUrl = `data:${mimeType};base64,${readFileSync(samplePath).toString("base64")}`;
const service = createTencentCloudTableOcrService();
const readiness = service.getReadiness();
if (!readiness.configured) {
  process.stderr.write("Tencent Cloud OCR is not configured in the current process environment.\n");
  process.exit(1);
}

try {
  const result = await service.recognizeTable({ contentDataUrl, mimeType, useNewModel: true });
  const tables = Array.isArray(result.tables) ? result.tables : [];
  const cells = tables.flatMap((table) => Array.isArray(table.cells) ? table.cells : []);
  process.stdout.write(JSON.stringify({
    ok: true,
    provider: result.provider,
    action: result.action,
    requestIdPresent: Boolean(result.requestId),
    tableCount: tables.length,
    cellCount: cells.length,
    nonEmptyCellCount: cells.filter((cell) => String(cell.text ?? "").trim()).length,
    averageConfidence: average(cells.map((cell) => Number(cell.confidence)).filter(Number.isFinite)),
  }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({
    ok: false,
    code: String(error?.code ?? "TENCENT_OCR_LIVE_CHECK_FAILED"),
    statusCode: Number(error?.statusCode) || 500,
    message: String(error?.message ?? "腾讯云 OCR 实测失败。"),
    cloudCode: String(error?.details?.cloudCode ?? ""),
    requestIdPresent: Boolean(error?.details?.requestId),
  }) + "\n");
  process.exit(1);
}

function resolveMimeType(path) {
  const extension = extname(path).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
  };
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error("Live OCR sample must be PNG, JPG, JPEG, BMP, or PDF.");
  return mimeType;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 1000;
}
