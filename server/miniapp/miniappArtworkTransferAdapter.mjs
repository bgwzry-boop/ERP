import { createHash, createHmac, randomBytes } from "node:crypto";

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export class MiniappArtworkTransferError extends Error {
  constructor(code, retryable) {
    super(code);
    this.name = "MiniappArtworkTransferError";
    this.code = code;
    this.retryable = retryable;
  }
}

function endpoint(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol)) {
    throw new Error("miniapp_artwork_url_invalid");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function sameHeader(response, name, expected) {
  return String(response.headers.get(name) ?? "") === String(expected);
}

function httpError(status) {
  if ([408, 425, 429].includes(status) || status >= 500) {
    return new MiniappArtworkTransferError(`miniapp_artwork_retryable_${status}`, true);
  }
  return new MiniappArtworkTransferError(`miniapp_artwork_rejected_${status}`, false);
}

export function createMiniappArtworkTransferAdapter(options = {}) {
  const baseUrl = endpoint(options.baseUrl);
  const keyId = String(options.keyId ?? "").trim();
  const sharedSecret = String(options.sharedSecret ?? "");
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? (() => new Date());
  const nonce = options.nonce ?? (() => randomBytes(16).toString("hex"));
  const maxBytes = Math.max(1, Math.min(209_715_200, Number(options.maxBytes ?? 209_715_200)));
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/.test(keyId)) {
    throw new Error("miniapp_artwork_key_id_invalid");
  }
  if (Buffer.byteLength(sharedSecret, "utf8") < 32) {
    throw new Error("miniapp_artwork_shared_secret_too_short");
  }

  return Object.freeze({
    async download(input) {
      const artwork = input.artwork;
      if (!artwork || !DIGEST_PATTERN.test(String(artwork.sha256 ?? "")) ||
          !Number.isSafeInteger(artwork.byteSize) || artwork.byteSize < 1 ||
          artwork.byteSize > maxBytes) {
        throw new MiniappArtworkTransferError("miniapp_artwork_metadata_invalid", false);
      }
      const url = new URL(`v1/integrations/erp/artworks/${encodeURIComponent(artwork.fileId)}`, baseUrl);
      url.searchParams.set("sourceOrderNo", input.sourceOrderNo);
      url.searchParams.set("sourceLineId", input.sourceLineId);
      if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
        throw new MiniappArtworkTransferError("miniapp_artwork_endpoint_invalid", false);
      }
      const bodySha256 = createHash("sha256").update("").digest("hex");
      const timestamp = now().toISOString();
      const requestNonce = nonce();
      if (!/^[a-f0-9]{32}$/.test(requestNonce)) {
        throw new MiniappArtworkTransferError("miniapp_artwork_nonce_invalid", false);
      }
      const pathAndQuery = `${url.pathname}${url.search}`;
      const canonical = [
        "bagwin-hmac-v1",
        timestamp,
        requestNonce,
        "GET",
        pathAndQuery,
        bodySha256,
      ].join("\n");
      const signature = createHmac("sha256", sharedSecret).update(canonical).digest("hex");
      let response;
      try {
        response = await fetchFn(url, {
          method: "GET",
          signal: input.signal,
          headers: {
            accept: "application/octet-stream",
            "x-bagwin-auth-version": "1",
            "x-bagwin-key-id": keyId,
            "x-bagwin-timestamp": timestamp,
            "x-bagwin-nonce": requestNonce,
            "x-bagwin-content-sha256": bodySha256,
            "x-bagwin-signature": signature,
          },
        });
      } catch {
        throw new MiniappArtworkTransferError(
          input.signal?.aborted ? "miniapp_artwork_request_aborted" : "miniapp_artwork_transport_failed",
          true,
        );
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw httpError(response.status);
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (!Number.isSafeInteger(contentLength) || contentLength !== artwork.byteSize ||
          contentLength > maxBytes ||
          !sameHeader(response, "x-artwork-file-id", artwork.fileId) ||
          !sameHeader(response, "x-artwork-source-line-id", input.sourceLineId) ||
          !sameHeader(response, "x-artwork-sha256", artwork.sha256) ||
          String(response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !==
            String(artwork.mimeType).trim().toLowerCase()) {
        await response.body?.cancel().catch(() => undefined);
        throw new MiniappArtworkTransferError("miniapp_artwork_response_metadata_mismatch", false);
      }
      if (!response.body) {
        throw new MiniappArtworkTransferError("miniapp_artwork_response_body_missing", true);
      }
      const chunks = [];
      const digest = createHash("sha256");
      let received = 0;
      try {
        for await (const rawChunk of response.body) {
          const chunk = Buffer.from(rawChunk);
          received += chunk.byteLength;
          if (received > contentLength || received > maxBytes) {
            throw new MiniappArtworkTransferError("miniapp_artwork_response_too_large", false);
          }
          digest.update(chunk);
          chunks.push(chunk);
        }
      } catch (error) {
        if (error instanceof MiniappArtworkTransferError) throw error;
        throw new MiniappArtworkTransferError("miniapp_artwork_response_interrupted", true);
      }
      if (received !== artwork.byteSize || digest.digest("hex") !== artwork.sha256) {
        throw new MiniappArtworkTransferError("miniapp_artwork_response_digest_mismatch", false);
      }
      return Object.freeze({
        fileId: artwork.fileId,
        fileName: artwork.fileName,
        mimeType: artwork.mimeType,
        byteSize: artwork.byteSize,
        sha256: artwork.sha256,
        buffer: Buffer.concat(chunks, received),
      });
    },
  });
}
