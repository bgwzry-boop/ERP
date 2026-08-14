import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const AUTH_VERSION = "1";
const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;

export class BagwinIntegrationAuthError extends Error {
  constructor(code, message, statusCode = 401) {
    super(message);
    this.name = "BagwinIntegrationAuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildBagwinCanonicalRequest({ timestamp, nonce, method, pathAndQuery, bodySha256 }) {
  return [
    "bagwin-hmac-v1",
    timestamp,
    nonce,
    String(method || "").toUpperCase(),
    pathAndQuery,
    bodySha256,
  ].join("\n");
}

function readHeader(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function safeHexEqual(left, right) {
  if (!DIGEST_PATTERN.test(left) || !DIGEST_PATTERN.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function createBagwinIntegrationAuthenticator(options = {}) {
  const keyId = String(options.keyId ?? "").trim();
  const sharedSecret = String(options.sharedSecret ?? "");
  const maxClockSkewMs = Math.max(1_000, Number(options.maxClockSkewMs ?? 5 * 60_000));
  const now = options.now ?? (() => new Date());
  const nonceStore = options.nonceStore;

  if (!KEY_ID_PATTERN.test(keyId)) throw new Error("BAGWIN_ERP_HMAC_KEY_ID is invalid.");
  if (Buffer.byteLength(sharedSecret, "utf8") < 32) {
    throw new Error("BAGWIN_ERP_HMAC_SHARED_SECRET must contain at least 32 UTF-8 bytes.");
  }
  if (!nonceStore || typeof nonceStore.claim !== "function") {
    throw new Error("A durable Bagwin integration nonce store is required.");
  }

  return Object.freeze({
    async authenticate({ request, url, rawBody }) {
      const version = readHeader(request, "x-bagwin-auth-version");
      const requestKeyId = readHeader(request, "x-bagwin-key-id");
      const timestamp = readHeader(request, "x-bagwin-timestamp");
      const nonce = readHeader(request, "x-bagwin-nonce");
      const bodySha256 = readHeader(request, "x-bagwin-content-sha256");
      const signature = readHeader(request, "x-bagwin-signature");

      if (version !== AUTH_VERSION || requestKeyId !== keyId) {
        throw new BagwinIntegrationAuthError("BAGWIN_AUTH_REJECTED", "Integration authentication failed.");
      }
      if (!NONCE_PATTERN.test(nonce) || !DIGEST_PATTERN.test(bodySha256) || !DIGEST_PATTERN.test(signature)) {
        throw new BagwinIntegrationAuthError("BAGWIN_AUTH_REJECTED", "Integration authentication failed.");
      }

      const parsedTimestamp = Date.parse(timestamp);
      const nowMs = now().getTime();
      if (!Number.isFinite(parsedTimestamp) || Math.abs(nowMs - parsedTimestamp) > maxClockSkewMs) {
        throw new BagwinIntegrationAuthError("BAGWIN_AUTH_TIMESTAMP_INVALID", "Integration request timestamp is outside the allowed window.");
      }

      const actualBodySha256 = sha256Hex(rawBody);
      if (!safeHexEqual(bodySha256, actualBodySha256)) {
        throw new BagwinIntegrationAuthError("BAGWIN_AUTH_BODY_DIGEST_INVALID", "Integration request body digest does not match.");
      }

      const canonical = buildBagwinCanonicalRequest({
        timestamp,
        nonce,
        method: request.method,
        pathAndQuery: `${url.pathname}${url.search}`,
        bodySha256,
      });
      const expectedSignature = createHmac("sha256", sharedSecret).update(canonical).digest("hex");
      if (!safeHexEqual(signature, expectedSignature)) {
        throw new BagwinIntegrationAuthError("BAGWIN_AUTH_REJECTED", "Integration authentication failed.");
      }

      const claimed = await nonceStore.claim({
        keyId,
        nonce,
        requestTimestamp: new Date(parsedTimestamp).toISOString(),
        expiresAt: new Date(parsedTimestamp + maxClockSkewMs * 2).toISOString(),
      });
      if (!claimed) {
        throw new BagwinIntegrationAuthError("BAGWIN_AUTH_REPLAYED", "Integration request nonce has already been used.");
      }
      return Object.freeze({ keyId, timestamp, nonce, bodySha256 });
    },
  });
}
