import { createHash, createHmac, randomBytes } from "node:crypto";

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export class ErpPriceReleaseDeliveryError extends Error {
  constructor(code, retryable) {
    super(code);
    this.name = "ErpPriceReleaseDeliveryError";
    this.code = code;
    this.retryable = retryable;
  }
}

function endpoint(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("miniapp_price_release_url_must_not_contain_credentials_query_or_fragment");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(response) {
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new ErpPriceReleaseDeliveryError("miniapp_price_release_response_content_type_invalid", false);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 256 * 1024) {
    throw new ErpPriceReleaseDeliveryError("miniapp_price_release_response_too_large", false);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ErpPriceReleaseDeliveryError("miniapp_price_release_response_json_invalid", false);
  }
}

function httpError(status) {
  if ([408, 425, 429].includes(status) || status >= 500) {
    return new ErpPriceReleaseDeliveryError(`miniapp_price_release_retryable_${status}`, true);
  }
  return new ErpPriceReleaseDeliveryError(`miniapp_price_release_rejected_${status}`, false);
}

function validateAcknowledgement(value, expected) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 ||
      value.priceVersion !== expected.priceVersion ||
      value.payloadSha256 !== expected.payloadSha256 ||
      !["validated", "active", "superseded"].includes(value.status) ||
      !["activated", "already_active", "not_due", "historical"].includes(value.activationOutcome)) {
    throw new ErpPriceReleaseDeliveryError("miniapp_price_release_ack_invalid", false);
  }
  if (value.status === "active" && !value.activatedAt) {
    throw new ErpPriceReleaseDeliveryError("miniapp_price_release_activation_missing", false);
  }
  return Object.freeze({
    priceVersion: value.priceVersion,
    payloadSha256: value.payloadSha256,
    status: value.status,
    activationOutcome: value.activationOutcome,
    activatedAt: value.activatedAt || null,
  });
}

export function createErpPriceReleaseDeliveryAdapter(options = {}) {
  const baseUrl = endpoint(options.baseUrl);
  const keyId = String(options.keyId ?? "").trim();
  const sharedSecret = String(options.sharedSecret ?? "");
  const now = options.now ?? (() => new Date());
  const nonce = options.nonce ?? (() => randomBytes(16).toString("hex"));
  const fetchFn = options.fetchFn ?? fetch;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/.test(keyId)) throw new Error("miniapp_price_release_key_id_invalid");
  if (Buffer.byteLength(sharedSecret, "utf8") < 32) throw new Error("miniapp_price_release_shared_secret_too_short");

  return Object.freeze({
    async deliver(input) {
      if (!DIGEST_PATTERN.test(String(input.payloadSha256 ?? ""))) {
        throw new ErpPriceReleaseDeliveryError("miniapp_price_release_digest_invalid", false);
      }
      const url = new URL("v1/integrations/erp/price-releases", baseUrl);
      if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
        throw new ErpPriceReleaseDeliveryError("miniapp_price_release_endpoint_invalid", false);
      }
      const body = JSON.stringify({
        payloadSha256: input.payloadSha256,
        bundle: input.bundle,
      });
      const bodySha256 = sha256(body);
      const timestamp = now().toISOString();
      const requestNonce = nonce();
      if (!/^[a-f0-9]{32}$/.test(requestNonce)) {
        throw new ErpPriceReleaseDeliveryError("miniapp_price_release_nonce_invalid", false);
      }
      const canonical = [
        "bagwin-hmac-v1",
        timestamp,
        requestNonce,
        "POST",
        url.pathname,
        bodySha256,
      ].join("\n");
      const signature = createHmac("sha256", sharedSecret).update(canonical).digest("hex");
      let response;
      try {
        response = await fetchFn(url, {
          method: "POST",
          signal: input.signal,
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-bagwin-auth-version": "1",
            "x-bagwin-key-id": keyId,
            "x-bagwin-timestamp": timestamp,
            "x-bagwin-nonce": requestNonce,
            "x-bagwin-content-sha256": bodySha256,
            "x-bagwin-signature": signature,
          },
          body,
        });
      } catch {
        throw new ErpPriceReleaseDeliveryError(
          input.signal?.aborted ? "miniapp_price_release_request_aborted" : "miniapp_price_release_transport_failed",
          true,
        );
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw httpError(response.status);
      }
      return validateAcknowledgement(await readJson(response), input);
    },
  });
}
