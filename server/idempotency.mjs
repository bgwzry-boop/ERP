import { createHash } from "node:crypto";

const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const operationScopePattern = /^[a-z][a-z0-9_.:-]{2,95}$/;

export function readHttpIdempotencyKey(request, body = {}) {
  return normalizeIdempotencyKey(
    request?.headers?.["idempotency-key"] ??
      request?.headers?.["x-idempotency-key"] ??
      body.idempotencyKey ??
      body.idempotency_key,
  );
}

export function requireHttpIdempotencyKey(request, body = {}) {
  const key = readHttpIdempotencyKey(request, body);
  if (!key) {
    throw idempotencyError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required for production business writes.",
    );
  }
  return key;
}

export function isProductionBusinessWritePath(pathname) {
  const path = String(pathname ?? "").trim();
  return path.startsWith("/api/") && !path.startsWith("/api/auth/") && !path.startsWith("/api/system/");
}

export function normalizeIdempotencyKey(value) {
  const key = String(value ?? "").trim();
  if (!key) return "";
  if (!idempotencyKeyPattern.test(key)) {
    throw idempotencyError(
      400,
      "IDEMPOTENCY_KEY_INVALID",
      "Idempotency keys must be 8-128 characters using letters, numbers, dot, underscore, colon, or hyphen.",
    );
  }
  return key;
}

export function buildPostgresIdempotencyRequest({
  scope,
  idempotencyKey,
  payload,
  operatorId = "",
  targetType = "",
  targetId = "",
  resourceLocks = [],
  query,
} = {}) {
  const normalizedScope = String(scope ?? "").trim().toLowerCase();
  if (!operationScopePattern.test(normalizedScope)) {
    throw new Error(`Invalid idempotency operation scope: ${normalizedScope || "<empty>"}`);
  }
  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  if (!normalizedKey) {
    throw idempotencyError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required.");
  }
  if (!query?.text) throw new Error("An idempotent PostgreSQL transaction query is required.");

  return {
    scope: normalizedScope,
    idempotencyKey: normalizedKey,
    requestHash: buildIdempotencyRequestHash(payload),
    operatorId: cleanText(operatorId),
    targetType: cleanText(targetType),
    targetId: cleanText(targetId),
    resourceLocks: uniqueSorted([
      `idempotency:${normalizedScope}:${normalizedKey}`,
      ...resourceLocks.map(cleanText),
    ]),
    text: query.text,
    values: Array.isArray(query.values) ? query.values : [],
  };
}

export function buildIdempotencyRequestHash(payload) {
  return createHash("sha256").update(stableSerialize(payload ?? null)).digest("hex");
}

export function buildIdempotencyConflictError() {
  return idempotencyError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "The idempotency key was already used with a different request payload.",
  );
}

export function resolveRepositoryIdempotencyKey(idempotencyKey, operationLogId) {
  const explicitKey = normalizeIdempotencyKey(idempotencyKey);
  if (explicitKey) return explicitKey;
  const source = cleanText(operationLogId);
  if (!source) {
    throw idempotencyError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required.");
  }
  return `operation:${createHash("sha256").update(source).digest("hex").slice(0, 32)}`;
}

function stableSerialize(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, sortValue(value[key])]),
  );
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function idempotencyError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
