import { createHash } from "node:crypto";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class ErpPriceReleaseError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "ErpPriceReleaseError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function fail(code, message, statusCode = 422) {
  throw new ErpPriceReleaseError(statusCode, code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys, field) {
  if (!isRecord(value)) fail("ERP_PRICE_RELEASE_SCHEMA_INVALID", `${field} must be an object.`);
  const actual = Object.keys(value);
  const allowed = new Set(keys);
  if (actual.some((key) => !allowed.has(key)) || keys.some((key) => !Object.hasOwn(value, key))) {
    fail("ERP_PRICE_RELEASE_SCHEMA_INVALID", `${field} contains missing or unsupported fields.`);
  }
}

function identifier(value, field) {
  const text = String(value ?? "").trim();
  if (!IDENTIFIER_PATTERN.test(text)) fail("ERP_PRICE_RELEASE_SCHEMA_INVALID", `${field} is invalid.`);
  return text;
}

function instant(value, field) {
  const text = String(value ?? "").trim();
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(text) || Number.isNaN(Date.parse(text))) {
    fail("ERP_PRICE_RELEASE_SCHEMA_INVALID", `${field} is invalid.`);
  }
  return text;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function canonicalErpPriceReleaseJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function erpPriceReleaseSha256(value) {
  return createHash("sha256").update(canonicalErpPriceReleaseJson(value)).digest("hex");
}

function sameInstant(left, right) {
  return Date.parse(left) === Date.parse(right);
}

export function validateErpPriceReleaseBundle(value) {
  exactKeys(value, [
    "schemaVersion", "priceVersion", "effectiveFrom", "changeSummary", "catalog",
    "customerPrices", "specialSizePricing", "bootstrap",
  ], "bundle");
  if (value.schemaVersion !== "factory-order-erp-price-release/v1") {
    fail("ERP_PRICE_RELEASE_SCHEMA_INVALID", "bundle.schemaVersion is invalid.");
  }
  const priceVersion = identifier(value.priceVersion, "bundle.priceVersion");
  const effectiveFrom = instant(value.effectiveFrom, "bundle.effectiveFrom");
  const changeSummary = String(value.changeSummary ?? "").trim();
  if (!changeSummary || changeSummary.length > 500) {
    fail("ERP_PRICE_RELEASE_SCHEMA_INVALID", "bundle.changeSummary is invalid.");
  }

  const catalog = value.catalog;
  if (!isRecord(catalog) || catalog.priceVersion !== priceVersion) {
    fail("ERP_PRICE_RELEASE_VERSION_MISMATCH", "Catalog price version does not match the release.");
  }
  const customerPrices = value.customerPrices;
  if (!isRecord(customerPrices) || customerPrices.schemaVersion !== "factory-order-customer-prices/v1" ||
      !Array.isArray(customerPrices.snapshots) || customerPrices.snapshots.length < 1) {
    fail("ERP_PRICE_RELEASE_SCHEMA_INVALID", "Customer price snapshots are required.");
  }
  const customerIds = [];
  for (const [index, snapshot] of customerPrices.snapshots.entries()) {
    if (!isRecord(snapshot) || snapshot.catalogVersion !== priceVersion ||
        snapshot.priceVersion !== priceVersion || snapshot.effectiveTo !== null ||
        !sameInstant(instant(snapshot.effectiveFrom, `customerPrices.snapshots[${index}].effectiveFrom`), effectiveFrom)) {
      fail("ERP_PRICE_RELEASE_VERSION_MISMATCH", "Customer price snapshots must align with the release.");
    }
    customerIds.push(String(snapshot.customerId ?? ""));
  }
  if (new Set(customerIds).size !== customerIds.length || customerIds.some((id) => !id)) {
    fail("ERP_PRICE_RELEASE_CUSTOMER_COVERAGE_INVALID", "Customer price snapshots must identify each customer once.");
  }

  const specialSizePricing = value.specialSizePricing;
  if (!isRecord(specialSizePricing) || !isRecord(specialSizePricing.rules) ||
      !isRecord(specialSizePricing.materialPrice) ||
      !sameInstant(instant(specialSizePricing.rules.effectiveFrom, "specialSizePricing.rules.effectiveFrom"), effectiveFrom) ||
      !sameInstant(instant(specialSizePricing.materialPrice.effectiveFrom, "specialSizePricing.materialPrice.effectiveFrom"), effectiveFrom) ||
      specialSizePricing.materialPrice.provisional !== false) {
    fail("ERP_PRICE_RELEASE_SPECIAL_PRICING_INVALID", "Special-size pricing must be final and aligned with the release.");
  }
  if (!isRecord(catalog.specialQuoteRules) ||
      catalog.specialQuoteRules.version !== specialSizePricing.rules.version ||
      catalog.specialQuoteRules.materialPriceVersion !== specialSizePricing.materialPrice.version) {
    fail("ERP_PRICE_RELEASE_SPECIAL_PRICING_INVALID", "Published special-size rule versions do not match.");
  }

  const bootstrap = value.bootstrap;
  if (!isRecord(bootstrap) || !bootstrap.announcement ||
      !sameInstant(instant(bootstrap.effectiveFrom, "bootstrap.effectiveFrom"), effectiveFrom)) {
    fail("ERP_PRICE_RELEASE_ANNOUNCEMENT_INVALID", "A version-bound price announcement is required.");
  }
  return Object.freeze({
    bundle: structuredClone(value),
    priceVersion,
    effectiveFrom,
    changeSummary,
    customerIds: Object.freeze(customerIds),
    payloadSha256: erpPriceReleaseSha256(value),
  });
}

function actorId(value, field) {
  const text = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(text)) {
    fail("ERP_PRICE_RELEASE_ACTOR_INVALID", `${field} is invalid.`, 400);
  }
  return text;
}

export function createErpPriceReleaseService(options = {}) {
  const repository = options.repository;
  const now = options.now ?? (() => new Date());
  if (!repository) throw new Error("An ERP price release repository is required.");

  return Object.freeze({
    async createDraft(input) {
      const validated = validateErpPriceReleaseBundle(input?.bundle);
      const createdBy = actorId(input?.createdBy, "createdBy");
      const existing = await repository.findByPriceVersion(validated.priceVersion);
      if (existing) {
        if (existing.payloadSha256 !== validated.payloadSha256) {
          throw new ErpPriceReleaseError(
            409,
            "ERP_PRICE_RELEASE_VERSION_CONFLICT",
            "The price version already exists with different content.",
          );
        }
        return { ...existing, disposition: "existing" };
      }
      return repository.createDraft({ ...validated, createdBy, now: now().toISOString() });
    },

    async review(input) {
      const releaseId = identifier(input?.releaseId, "releaseId");
      const reviewedBy = actorId(input?.reviewedBy, "reviewedBy");
      const release = await repository.findById(releaseId);
      if (!release) throw new ErpPriceReleaseError(404, "ERP_PRICE_RELEASE_NOT_FOUND", "Price release was not found.");
      if (release.createdBy === reviewedBy) {
        throw new ErpPriceReleaseError(409, "ERP_PRICE_RELEASE_REVIEWER_CONFLICT", "Creator and reviewer must be different users.");
      }
      const validated = validateErpPriceReleaseBundle(release.bundle);
      if (validated.payloadSha256 !== release.payloadSha256) {
        throw new ErpPriceReleaseError(409, "ERP_PRICE_RELEASE_DIGEST_CONFLICT", "Stored release content has drifted.");
      }
      await repository.assertActiveCustomerCoverage(validated.customerIds);
      return repository.markReviewed({ releaseId, reviewedBy, now: now().toISOString() });
    },

    async publish(input) {
      const releaseId = identifier(input?.releaseId, "releaseId");
      const publishedBy = actorId(input?.publishedBy, "publishedBy");
      return repository.enqueuePublication({ releaseId, publishedBy, now: now().toISOString() });
    },
  });
}
