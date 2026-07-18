import { buildIdempotencyRequestHash, normalizeIdempotencyKey } from "./idempotency.mjs";

export function buildRawMaterialActionIdempotencyScope(input = {}) {
  return `raw-material.${normalizeAction(input.action)}.${cleanText(input.inboundId)}`;
}

export function readLocalRawMaterialActionReplay(input = {}) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return null;
  const scope = buildRawMaterialActionIdempotencyScope(input);
  const requestHash = buildIdempotencyRequestHash(input.idempotencyPayload ?? input.body ?? {});
  const stored = (input.workspace?.operationIdempotencyRecords ?? []).find(
    (record) => record.scope === scope && record.idempotencyKey === idempotencyKey,
  );
  if (!stored) return null;
  if (stored.requestHash !== requestHash) {
    throw Object.assign(new Error("同一个幂等键已用于不同的原材料入库请求。"), {
      statusCode: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  }
  return { ...stored.response, replayed: true, operationLog: null };
}

export function recordLocalRawMaterialActionResult(input = {}, result = {}) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return;
  input.workspace.operationIdempotencyRecords = [
    {
      scope: buildRawMaterialActionIdempotencyScope(input),
      idempotencyKey,
      requestHash: buildIdempotencyRequestHash(input.idempotencyPayload ?? input.body ?? {}),
      response: { inbound: result.inbound, operationLogId: result.operationLog?.id ?? "" },
    },
    ...(input.workspace.operationIdempotencyRecords ?? []),
  ];
}

export function rawMaterialWriteConflict(currentRevision) {
  const revision = Math.max(1, Number(currentRevision) || 1);
  return Object.assign(new Error("该原材料入库单已被另一位办公室人员更新，请刷新后重新确认。"), {
    statusCode: 409,
    code: "BUSINESS_WRITE_CONFLICT",
    currentRevision: revision,
    details: { currentRevision: revision },
  });
}

function normalizeAction(value) {
  return cleanText(value).replaceAll("-", "_");
}

function cleanText(value) {
  return String(value ?? "").trim();
}
