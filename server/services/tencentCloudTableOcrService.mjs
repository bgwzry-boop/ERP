import { createHash, createHmac } from "node:crypto";
import { attachmentUploadLimits } from "../../shared/attachmentUploadPolicy.js";

export const TENCENT_TABLE_OCR_ACTION = "RecognizeTableAccurateOCR";
export const TENCENT_TABLE_OCR_VERSION = "2018-11-19";
export const TENCENT_TABLE_OCR_ENDPOINT = "ocr.tencentcloudapi.com";
export const TENCENT_TABLE_OCR_MAX_BASE64_BYTES = attachmentUploadLimits.rawMaterialOcrEncodedBytes;

const supportedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/bmp",
  "application/pdf",
]);

export function createTencentCloudTableOcrService(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const endpoint = cleanText(options.endpoint) || TENCENT_TABLE_OCR_ENDPOINT;
  const requestTimeoutMs = positiveNumber(options.requestTimeoutMs, 30_000);
  if (typeof fetchImpl !== "function") throw new TypeError("Tencent OCR requires a fetch implementation.");
  if (typeof now !== "function") throw new TypeError("Tencent OCR now must be a function.");

  return {
    getReadiness() {
      const config = resolveTencentCloudOcrConfig(options.env ?? process.env);
      return {
        provider: "tencent_cloud",
        action: TENCENT_TABLE_OCR_ACTION,
        version: TENCENT_TABLE_OCR_VERSION,
        endpoint,
        region: config.region,
        configured: Boolean(config.secretId && config.secretKey),
      };
    },

    async recognizeTable(input = {}) {
      const config = resolveTencentCloudOcrConfig(options.env ?? process.env);
      if (!config.secretId || !config.secretKey) {
        throw buildOcrError(
          503,
          "TENCENT_OCR_CREDENTIALS_REQUIRED",
          "腾讯云 OCR 密钥尚未配置，照片没有发送到腾讯云。",
        );
      }
      const image = normalizeTencentOcrImage(input);
      const timestamp = Math.floor(new Date(now()).getTime() / 1000);
      if (!Number.isFinite(timestamp)) {
        throw buildOcrError(500, "TENCENT_OCR_CLOCK_INVALID", "服务器时间无效，无法签署腾讯云 OCR 请求。");
      }
      const requestBody = {
        ImageBase64: image.base64,
        UseNewModel: input.useNewModel === true,
      };
      if (image.mimeType === "application/pdf") {
        requestBody.PdfPageNumber = positiveInteger(input.pdfPageNumber, 1);
      }
      const payload = JSON.stringify(requestBody);
      const signed = buildTencentCloudTc3Request({
        action: TENCENT_TABLE_OCR_ACTION,
        endpoint,
        payload,
        region: config.region,
        secretId: config.secretId,
        secretKey: config.secretKey,
        service: "ocr",
        timestamp,
        version: TENCENT_TABLE_OCR_VERSION,
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      let response;
      try {
        response = await fetchImpl(`https://${endpoint}/`, {
          method: "POST",
          headers: signed.headers,
          body: payload,
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = error?.name === "AbortError";
        throw buildOcrError(
          502,
          timedOut ? "TENCENT_OCR_TIMEOUT" : "TENCENT_OCR_NETWORK_ERROR",
          timedOut ? "腾讯云 OCR 请求超时，请稍后重试。" : "无法连接腾讯云 OCR，请检查网络后重试。",
        );
      } finally {
        clearTimeout(timeout);
      }

      let json;
      try {
        json = await response.json();
      } catch {
        throw buildOcrError(502, "TENCENT_OCR_INVALID_RESPONSE", "腾讯云 OCR 返回了无法读取的响应。");
      }
      const cloudResponse = json?.Response ?? {};
      if (!response.ok || cloudResponse.Error) {
        const cloudCode = cleanText(cloudResponse.Error?.Code) || `HTTP_${response.status}`;
        throw buildOcrError(
          mapTencentOcrStatusCode(cloudCode, response.status),
          "TENCENT_OCR_REQUEST_FAILED",
          toTencentOcrUserMessage(cloudCode),
          { cloudCode, requestId: cleanText(cloudResponse.RequestId) },
        );
      }
      return normalizeTencentTableOcrResponse(cloudResponse, {
        imageWidth: image.imageWidth,
        imageHeight: image.imageHeight,
      });
    },
  };
}

export function buildTencentCloudTc3Request(input = {}) {
  const algorithm = "TC3-HMAC-SHA256";
  const contentType = "application/json; charset=utf-8";
  const endpoint = cleanText(input.endpoint);
  const payload = String(input.payload ?? "{}");
  const service = cleanText(input.service);
  const timestamp = Number(input.timestamp);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:${contentType}\nhost:${endpoint}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [algorithm, timestamp, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const secretDate = hmacSha256(date, `TC3${input.secretKey}`);
  const secretService = hmacSha256(service, secretDate);
  const secretSigning = hmacSha256("tc3_request", secretService);
  const signature = hmacSha256(stringToSign, secretSigning, "hex");
  const authorization = `${algorithm} Credential=${input.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers = {
    Authorization: authorization,
    "Content-Type": contentType,
    Host: endpoint,
    "X-TC-Action": cleanText(input.action),
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": cleanText(input.version),
  };
  const region = cleanText(input.region);
  if (region) headers["X-TC-Region"] = region;
  return { authorization, canonicalRequest, credentialScope, headers, stringToSign };
}

export function normalizeTencentOcrImage(input = {}) {
  const source = cleanText(input.imageBase64 ?? input.contentDataUrl);
  if (!source) {
    throw buildOcrError(422, "TENCENT_OCR_IMAGE_REQUIRED", "请选择送货单照片后再识别。");
  }
  const dataUrlMatch = source.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  const mimeType = cleanText(input.mimeType || dataUrlMatch?.[1]).toLowerCase();
  const base64 = cleanText(dataUrlMatch?.[2] ?? source).replace(/\s+/g, "");
  if (!supportedMimeTypes.has(mimeType)) {
    throw buildOcrError(
      422,
      "TENCENT_OCR_FILE_TYPE_NOT_SUPPORTED",
      "送货单只支持 PNG、JPG、JPEG、BMP 图片或单页 PDF。",
    );
  }
  if (!/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
    throw buildOcrError(422, "TENCENT_OCR_IMAGE_INVALID", "送货单照片内容无法读取，请重新选择文件。");
  }
  const encodedBytes = Buffer.byteLength(base64, "utf8");
  if (encodedBytes > TENCENT_TABLE_OCR_MAX_BASE64_BYTES) {
    throw buildOcrError(413, "TENCENT_OCR_IMAGE_TOO_LARGE", "送货单识别副本编码后不能超过 10MB，系统未能自动处理，请重新拍摄或选择文件。");
  }
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    throw buildOcrError(422, "TENCENT_OCR_IMAGE_EMPTY", "送货单照片内容为空，请重新选择文件。");
  }
  const dimensions = readTencentOcrImageDimensions(buffer, mimeType);
  return {
    base64,
    buffer,
    mimeType,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
  };
}

export function normalizeTencentTableOcrResponse(response = {}, image = {}) {
  return {
    provider: "tencent_cloud_table_v3",
    action: TENCENT_TABLE_OCR_ACTION,
    requestId: cleanText(response.RequestId),
    angle: finiteNumber(response.Angle, 0),
    imageWidth: Math.max(0, Number(image.imageWidth) || 0),
    imageHeight: Math.max(0, Number(image.imageHeight) || 0),
    pdfPageSize: Math.max(0, Number(response.PdfPageSize) || 0),
    tables: (Array.isArray(response.TableDetections) ? response.TableDetections : []).map((table, tableIndex) => ({
      tableIndex,
      type: Number.isFinite(Number(table?.Type)) ? Number(table.Type) : 0,
      cells: (Array.isArray(table?.Cells) ? table.Cells : []).map((cell) => ({
        colTl: Math.max(0, Number(cell?.ColTl) || 0),
        rowTl: Math.max(0, Number(cell?.RowTl) || 0),
        colBr: Math.max(0, Number(cell?.ColBr) || 0),
        rowBr: Math.max(0, Number(cell?.RowBr) || 0),
        text: cleanText(cell?.Text),
        type: cleanText(cell?.Type),
        confidence: clampConfidence(cell?.Confidence),
        polygon: (Array.isArray(cell?.Polygon) ? cell.Polygon : []).map((point) => ({
          x: finiteNumber(point?.X, 0),
          y: finiteNumber(point?.Y, 0),
        })),
      })).filter((cell) => cell.text),
    })),
  };
}

export function readTencentOcrImageDimensions(buffer, mimeType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return { width: 0, height: 0 };
  const type = cleanText(mimeType).toLowerCase();
  if (type === "image/png" && buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return normalizeImageDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  }
  if (type === "image/bmp" && buffer.length >= 26 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return normalizeImageDimensions(buffer.readInt32LE(18), Math.abs(buffer.readInt32LE(22)));
  }
  if ((type === "image/jpeg" || type === "image/jpg") && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
        return normalizeImageDimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
      }
      offset += segmentLength;
    }
  }
  return { width: 0, height: 0 };
}

function isJpegStartOfFrame(marker) {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
}

function normalizeImageDimensions(widthValue, heightValue) {
  const width = Math.max(0, Number(widthValue) || 0);
  const height = Math.max(0, Number(heightValue) || 0);
  return width > 0 && height > 0 ? { width, height } : { width: 0, height: 0 };
}

export function resolveTencentCloudOcrConfig(env = {}) {
  return {
    secretId: cleanText(env.ERP_TENCENT_OCR_SECRET_ID ?? env.TENCENTCLOUD_SECRET_ID),
    secretKey: cleanText(env.ERP_TENCENT_OCR_SECRET_KEY ?? env.TENCENTCLOUD_SECRET_KEY),
    region: cleanText(env.ERP_TENCENT_OCR_REGION ?? env.TENCENTCLOUD_REGION) || "ap-guangzhou",
  };
}

function mapTencentOcrStatusCode(cloudCode, httpStatus) {
  if (/AuthFailure|Unauthorized|InvalidCredential/i.test(cloudCode)) return 503;
  if (/LimitExceeded|RequestLimitExceeded|ResourceUnavailable/i.test(cloudCode)) return 429;
  if (/InvalidParameter|FailedOperation.Image|UnsupportedOperation/i.test(cloudCode)) return 422;
  return Number.isInteger(Number(httpStatus)) && Number(httpStatus) >= 400 ? Number(httpStatus) : 502;
}

function toTencentOcrUserMessage(cloudCode) {
  if (/AuthFailure|Unauthorized|InvalidCredential/i.test(cloudCode)) return "腾讯云 OCR 密钥无效或无权调用表格识别 V3。";
  if (/LimitExceeded|RequestLimitExceeded/i.test(cloudCode)) return "腾讯云 OCR 调用频率或额度已受限，请稍后重试。";
  if (/ResourceUnavailable/i.test(cloudCode)) return "腾讯云 OCR 资源包当前不可用，请检查额度后重试。";
  if (/Image|InvalidParameter/i.test(cloudCode)) return "腾讯云无法识别这张送货单，请检查图片清晰度和格式。";
  return "腾讯云 OCR 识别失败，请稍后重试。";
}

function buildOcrError(statusCode, code, message, details = undefined) {
  return Object.assign(new Error(message), { statusCode, code, details });
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(value, secret, encoding = undefined) {
  return createHmac("sha256", secret).update(value).digest(encoding);
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number * 1000) / 1000));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
