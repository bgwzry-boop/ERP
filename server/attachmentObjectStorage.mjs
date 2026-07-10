import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export function createAttachmentObjectStorage(options = {}) {
  const mode = options.mode ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE ?? "local_fs";
  if (mode === "local_fs") {
    return createLocalAttachmentObjectStorage(options);
  }
  if (mode === "object_storage") {
    const config = resolveObjectStorageConfig(options);
    if (!config.configured) {
      return createObjectStoragePlaceholder(config.missingFields);
    }
    return createS3CompatibleAttachmentObjectStorage({ ...options, config });
  }
  throw new Error(`Unsupported attachment object storage mode: ${mode}`);
}

export function createLocalAttachmentObjectStorage(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();
  const storageRootPath = resolve(storageRoot);
  const tokenSecret = options.tokenSecret ?? process.env.ERP_ATTACHMENT_TOKEN_SECRET ?? "erp-p0-local-attachment-secret";
  const localKeyPrefix = normalizeObjectKeyPrefix(options.localKeyPrefix ?? "attachments");

  return {
    kind: "local_fs",

    putObject({ attachmentId, fileName, contentPayload }) {
      const safeFileName = sanitizeStorageFileName(fileName || `${attachmentId}.bin`);
      const storageKey = [localKeyPrefix, attachmentId, safeFileName].filter(Boolean).join("/");
      const filePath = resolveLocalStoragePath(storageRootPath, storageKey);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, contentPayload.buffer);
      return {
        storageProvider: "local_fs",
        storageKey,
        contentDigest: createHash("sha256").update(contentPayload.buffer).digest("hex"),
      };
    },

    readObject({ attachment }) {
      if (attachment.storageProvider === "local_fs" && attachment.storageKey) {
        const filePath = resolveLocalStoragePath(storageRootPath, attachment.storageKey);
        if (existsSync(filePath)) {
          return {
            contentType: attachment.mimeType || "application/octet-stream",
            buffer: readFileSync(filePath),
          };
        }
      }
      if (!attachment.contentDataUrl) return null;
      return parseDataUrl(attachment.contentDataUrl);
    },

    deleteObject({ storageKey }) {
      if (!storageKey) {
        return {
          storageProvider: "local_fs",
          deleted: false,
          reason: "storage key is missing",
        };
      }
      const filePath = resolveLocalStoragePath(storageRootPath, storageKey);
      const existed = existsSync(filePath);
      rmSync(filePath, { force: true });
      return {
        storageProvider: "local_fs",
        deleted: existed,
      };
    },

    createAccessUrl({ attachmentId, ttlSeconds, now = new Date() }) {
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
      const accessToken = createAttachmentAccessToken({ attachmentId, expiresAt, tokenSecret });
      const accessUrl = `/api/attachments/${encodeURIComponent(attachmentId)}/content?accessToken=${encodeURIComponent(
        accessToken,
      )}&expiresAt=${encodeURIComponent(expiresAt)}`;
      return {
        accessUrl,
        expiresAt,
        deliveryMode: "api_proxy",
      };
    },

    validateAccessToken({ attachmentId, accessToken, expiresAt, now = new Date() }) {
      return validateAttachmentAccessToken({
        attachmentId,
        accessToken,
        expiresAt,
        tokenSecret,
        now,
      });
    },
  };
}

export function createS3CompatibleAttachmentObjectStorage(options = {}) {
  const config = options.config ?? resolveObjectStorageConfig(options);
  if (!config.configured) {
    throw new Error(`Object storage is missing required configuration: ${config.missingFields.join(", ")}`);
  }
  if (config.provider !== "s3_compatible") {
    throw new Error(`Unsupported object storage provider: ${config.provider}`);
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Object storage requires a fetch implementation.");
  }
  const nowProvider = createNowProvider(options.now);

  return {
    kind: "object_storage",
    provider: config.provider,

    async putObject({ attachmentId, fileName, contentPayload }) {
      const safeFileName = sanitizeStorageFileName(fileName || `${attachmentId}.bin`);
      const storageKey = buildObjectStorageKey(config.keyPrefix, attachmentId, safeFileName);
      const contentDigest = createHash("sha256").update(contentPayload.buffer).digest("hex");
      const request = createS3SignedRequest({
        config,
        method: "PUT",
        storageKey,
        payloadHash: contentDigest,
        contentType: contentPayload.contentType || "application/octet-stream",
        now: nowProvider(),
      });
      const result = await fetchImpl(request.url, {
        method: "PUT",
        headers: request.headers,
        body: contentPayload.buffer,
      });
      if (!result.ok) {
        const responseText = typeof result.text === "function" ? await result.text() : "";
        throw new Error(`Object storage putObject failed with HTTP ${result.status}: ${responseText.slice(0, 200)}`);
      }
      return {
        storageProvider: "object_storage",
        storageKey,
        contentDigest,
      };
    },

    async readObject({ attachment }) {
      if (attachment.storageProvider !== "object_storage" || !attachment.storageKey) {
        if (!attachment.contentDataUrl) return null;
        return parseDataUrl(attachment.contentDataUrl);
      }
      const request = createS3SignedRequest({
        config,
        method: "GET",
        storageKey: attachment.storageKey,
        payloadHash: "UNSIGNED-PAYLOAD",
        now: nowProvider(),
      });
      const result = await fetchImpl(request.url, {
        method: "GET",
        headers: request.headers,
      });
      if (!result.ok) {
        if (result.status === 404) return null;
        const responseText = typeof result.text === "function" ? await result.text() : "";
        throw new Error(`Object storage readObject failed with HTTP ${result.status}: ${responseText.slice(0, 200)}`);
      }
      const buffer = Buffer.from(await result.arrayBuffer());
      return {
        contentType: attachment.mimeType || result.headers?.get?.("content-type") || "application/octet-stream",
        buffer,
      };
    },

    async deleteObject({ storageKey }) {
      if (!storageKey) {
        return {
          storageProvider: "object_storage",
          deleted: false,
          reason: "storage key is missing",
        };
      }
      const request = createS3SignedRequest({
        config,
        method: "DELETE",
        storageKey,
        payloadHash: createHash("sha256").update("").digest("hex"),
        now: nowProvider(),
      });
      const result = await fetchImpl(request.url, {
        method: "DELETE",
        headers: request.headers,
      });
      if (!result.ok && result.status !== 404) {
        const responseText = typeof result.text === "function" ? await result.text() : "";
        throw new Error(`Object storage deleteObject failed with HTTP ${result.status}: ${responseText.slice(0, 200)}`);
      }
      return {
        storageProvider: "object_storage",
        deleted: result.status !== 404,
      };
    },

    createAccessUrl({ attachmentId, storageKey, ttlSeconds, now = new Date() }) {
      if (!storageKey) {
        throw new Error(`Object storage access URL requires a storageKey for attachment ${attachmentId}.`);
      }
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
      return {
        accessUrl: createS3PresignedUrl({
          config,
          method: "GET",
          storageKey,
          ttlSeconds,
          now,
        }),
        expiresAt,
        deliveryMode: "object_storage_signed_url",
      };
    },

    validateAccessToken() {
      return {
        valid: false,
        present: false,
      };
    },
  };
}

function createObjectStoragePlaceholder(missingFields = []) {
  return {
    kind: "object_storage",
    configured: false,
    missingFields,
    putObject() {
      throw new Error(createObjectStorageMissingConfigMessage(missingFields));
    },
    readObject() {
      throw new Error(createObjectStorageMissingConfigMessage(missingFields));
    },
    deleteObject() {
      throw new Error(createObjectStorageMissingConfigMessage(missingFields));
    },
    createAccessUrl() {
      throw new Error(createObjectStorageMissingConfigMessage(missingFields));
    },
    validateAccessToken() {
      return {
        valid: false,
        present: false,
        message: "Object storage signed URLs are not configured yet.",
      };
    },
  };
}

export function resolveObjectStorageConfig(options = {}) {
  const provider = cleanConfigValue(
    options.provider ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER ?? "s3_compatible",
  );
  const config = {
    configured: false,
    provider,
    endpoint: normalizeEndpoint(options.endpoint ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT),
    bucket: cleanConfigValue(options.bucket ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET),
    region: cleanConfigValue(options.region ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_REGION ?? "us-east-1"),
    accessKeyId: cleanConfigValue(
      options.accessKeyId ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID,
    ),
    secretAccessKey: cleanConfigValue(
      options.secretAccessKey ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY,
    ),
    sessionToken: cleanConfigValue(options.sessionToken ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN),
    keyPrefix: normalizeObjectKeyPrefix(options.keyPrefix ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX ?? "attachments"),
    forcePathStyle: parseBoolean(
      options.forcePathStyle ?? process.env.ERP_ATTACHMENT_OBJECT_STORAGE_FORCE_PATH_STYLE,
      true,
    ),
  };
  if (config.provider !== "s3_compatible") {
    return {
      ...config,
      missingFields: [`unsupported provider: ${config.provider}`],
    };
  }
  const missingFields = ["endpoint", "bucket", "accessKeyId", "secretAccessKey"].filter((field) => !config[field]);
  return {
    ...config,
    configured: missingFields.length === 0,
    missingFields,
  };
}

export function parseDataUrl(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  try {
    const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    return { contentType, buffer };
  } catch {
    return null;
  }
}

export function sanitizeStorageFileName(fileName) {
  const normalized = String(fileName ?? "")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "attachment.bin";
}

function createAttachmentAccessToken({ attachmentId, expiresAt, tokenSecret }) {
  return createHmac("sha256", tokenSecret)
    .update(`${attachmentId}|${expiresAt}`)
    .digest("hex");
}

function validateAttachmentAccessToken({ attachmentId, accessToken, expiresAt, tokenSecret, now = new Date() }) {
  const normalizedToken = String(accessToken ?? "").trim();
  const normalizedExpiresAt = String(expiresAt ?? "").trim();
  if (!normalizedToken && !normalizedExpiresAt) {
    return { valid: false, present: false };
  }
  if (!normalizedToken || !normalizedExpiresAt) {
    return {
      valid: false,
      present: true,
      message: "Attachment access token and expiresAt are both required.",
    };
  }
  const expiresAtMs = Date.parse(normalizedExpiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
    return {
      valid: false,
      present: true,
      message: "Attachment access token is expired.",
    };
  }
  const expectedToken = createAttachmentAccessToken({
    attachmentId,
    expiresAt: normalizedExpiresAt,
    tokenSecret,
  });
  if (!constantTimeEqual(normalizedToken, expectedToken)) {
    return {
      valid: false,
      present: true,
      message: "Attachment access token is invalid.",
    };
  }
  return {
    valid: true,
    present: true,
  };
}

export function createS3SignedRequest({
  config,
  method,
  storageKey,
  payloadHash,
  contentType,
  now = new Date(),
  queryParams = [],
}) {
  const requestUrl = buildObjectStorageUrl(config, storageKey);
  for (const [key, value] of Object.entries(normalizeQueryParams(queryParams))) {
    requestUrl.searchParams.set(key, value);
  }
  const { amzDate, dateStamp } = formatAmzDate(now);
  const headers = {
    host: requestUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;
  if (config.sessionToken) headers["x-amz-security-token"] = config.sessionToken;
  const signed = signS3Request({
    config,
    method,
    requestUrl,
    headers,
    payloadHash,
    amzDate,
    dateStamp,
  });
  return {
    url: requestUrl.toString(),
    headers: {
      ...headers,
      authorization: signed.authorization,
    },
    signedHeaders: signed.signedHeaders,
  };
}

export function createS3PresignedUrl({ config, method, storageKey, ttlSeconds, now = new Date() }) {
  const requestUrl = buildObjectStorageUrl(config, storageKey);
  const { amzDate, dateStamp } = formatAmzDate(now);
  const credentialScope = createCredentialScope({ dateStamp, region: config.region });
  requestUrl.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  requestUrl.searchParams.set("X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`);
  requestUrl.searchParams.set("X-Amz-Date", amzDate);
  requestUrl.searchParams.set("X-Amz-Expires", String(Math.max(1, Math.floor(ttlSeconds))));
  requestUrl.searchParams.set("X-Amz-SignedHeaders", "host");
  if (config.sessionToken) requestUrl.searchParams.set("X-Amz-Security-Token", config.sessionToken);
  const canonicalRequest = [
    method,
    requestUrl.pathname,
    canonicalizeQuery(requestUrl.searchParams),
    `host:${requestUrl.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = createStringToSign({ amzDate, credentialScope, canonicalRequest });
  const signature = hmacHex(getSigningKey(config.secretAccessKey, dateStamp, config.region), stringToSign);
  requestUrl.searchParams.set("X-Amz-Signature", signature);
  return requestUrl.toString();
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveLocalStoragePath(storageRootPath, storageKey) {
  const filePath = resolve(storageRootPath, storageKey);
  if (filePath !== storageRootPath && !filePath.startsWith(`${storageRootPath}${sep}`)) {
    throw new Error("Attachment storage key points outside the local storage root.");
  }
  return filePath;
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}

function signS3Request({ config, method, requestUrl, headers, payloadHash, amzDate, dateStamp }) {
  const credentialScope = createCredentialScope({ dateStamp, region: config.region });
  const normalizedHeaders = normalizeSignedHeaders(headers);
  const canonicalRequest = [
    method,
    requestUrl.pathname,
    canonicalizeQuery(requestUrl.searchParams),
    normalizedHeaders.canonicalHeaders,
    normalizedHeaders.signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = createStringToSign({ amzDate, credentialScope, canonicalRequest });
  const signature = hmacHex(getSigningKey(config.secretAccessKey, dateStamp, config.region), stringToSign);
  return {
    signedHeaders: normalizedHeaders.signedHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${normalizedHeaders.signedHeaders}, Signature=${signature}`,
  };
}

function createStringToSign({ amzDate, credentialScope, canonicalRequest }) {
  return [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
}

function getSigningKey(secretAccessKey, dateStamp, region) {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, "s3");
  return hmacBuffer(serviceKey, "aws4_request");
}

function hmacBuffer(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function createCredentialScope({ dateStamp, region }) {
  return `${dateStamp}/${region}/s3/aws4_request`;
}

function normalizeSignedHeaders(headers) {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase().trim(), String(value).trim().replace(/\s+/g, " ")])
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    canonicalHeaders: entries.map(([key, value]) => `${key}:${value}\n`).join(""),
    signedHeaders: entries.map(([key]) => key).join(";"),
  };
}

function canonicalizeQuery(searchParams) {
  return Array.from(searchParams.entries())
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function normalizeQueryParams(queryParams) {
  if (Array.isArray(queryParams)) {
    return Object.fromEntries(queryParams.map(([key, value]) => [String(key), String(value ?? "")]));
  }
  return Object.fromEntries(Object.entries(queryParams || {}).map(([key, value]) => [key, String(value ?? "")]));
}

function buildObjectStorageUrl(config, storageKey) {
  const endpoint = new URL(config.endpoint);
  const objectPath = encodeObjectKeyPath(storageKey);
  if (config.forcePathStyle) {
    endpoint.pathname = joinUrlPath(endpoint.pathname, encodeRfc3986(config.bucket), objectPath);
    return endpoint;
  }
  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = joinUrlPath(endpoint.pathname, objectPath);
  return endpoint;
}

function buildObjectStorageKey(prefix, attachmentId, safeFileName) {
  return [prefix, attachmentId, safeFileName].filter(Boolean).join("/");
}

function encodeObjectKeyPath(storageKey) {
  return String(storageKey ?? "")
    .split("/")
    .filter(Boolean)
    .map(encodeRfc3986)
    .join("/");
}

function joinUrlPath(...parts) {
  const path = parts
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `/${path}`;
}

function formatAmzDate(now) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function createNowProvider(value) {
  if (typeof value === "function") return value;
  if (value instanceof Date) return () => value;
  return () => new Date();
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeEndpoint(value) {
  const endpoint = cleanConfigValue(value);
  return endpoint ? endpoint.replace(/\/+$/g, "") : "";
}

function normalizeObjectKeyPrefix(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function cleanConfigValue(value) {
  return String(value ?? "").trim();
}

function createObjectStorageMissingConfigMessage(missingFields) {
  const suffix = missingFields.length ? ` Missing: ${missingFields.join(", ")}.` : "";
  return `ERP_ATTACHMENT_OBJECT_STORAGE=object_storage is not configured yet.${suffix}`;
}
