import { createPostgresParameterBinder } from '../postgresSqlParameters.mjs';
import { isDeepStrictEqual } from 'node:util';

const conflict = () => Object.assign(new Error('小程序原订单价格凭据不完整或不一致，请先核对。'), { code: 'MINIAPP_CONFIRMATION_SOURCE_CONFLICT', statusCode: 409 });
const hasText = value => typeof value === 'string' && value.trim().length > 0;
function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100_000_000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw conflict();
  return Math.round(value * 100);
}

// Input must come from the repository, never from a confirmation request body.
// This validates a read snapshot only; it does not authorize a later write.
export function validateMiniappConfirmationSource(sources, { draftId, customerId }) {
  if (!Array.isArray(sources) || sources.length !== 1) throw conflict();
  const source = sources[0];
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw conflict();
  if (!hasText(draftId) || !hasText(customerId) || source.draftId !== draftId || source.customerId !== customerId ||
      !hasText(source.id) || !hasText(source.sourceOrderNo) || !/^[a-f0-9]{64}$/.test(source.requestHash ?? '') ||
      !Number.isSafeInteger(source.revision) || source.revision < 1 || !['draft_created', 'office_review'].includes(source.status)) throw conflict();
  const snapshots = Array.isArray(source.snapshots) ? source.snapshots.filter(item => item?.type === 'customer_submit') : null;
  if (!snapshots || snapshots.length !== 1) throw conflict();
  const snapshot = snapshots[0], quote = snapshot.quote;
  if (snapshot.authoritative !== true || !hasText(snapshot.id) || !hasText(snapshot.priceReleaseId) || !hasText(snapshot.priceVersion) ||
      !/^[a-f0-9]{64}$/.test(snapshot.priceReleaseSha256 ?? '') || quote?.authoritative !== true ||
      quote.priceVersion !== snapshot.priceVersion || quote.priceReleaseId !== snapshot.priceReleaseId ||
      quote.priceReleaseSha256 !== snapshot.priceReleaseSha256 || !Array.isArray(source.lines) || !source.lines.length ||
      !Array.isArray(quote.lines) || quote.lines.length !== source.lines.length) throw conflict();
  const seenDraft = new Set(), seenSource = new Set();
  let total = 0;
  for (const line of source.lines) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw conflict();
    const normalized = line.normalizedLine, price = normalized?.quoteSnapshot;
    if (!hasText(line.draftLineId) || seenDraft.has(line.draftLineId) || line.mappingStatus !== 'mapped' ||
        !hasText(normalized?.sourceLineId) || seenSource.has(normalized.sourceLineId) || !Number.isSafeInteger(normalized.quantity) || normalized.quantity < 1 ||
        price?.quantity !== normalized.quantity || !hasText(price?.priceVersion)) throw conflict();
    seenDraft.add(line.draftLineId); seenSource.add(normalized.sourceLineId);
    const amount = cents(normalized.estimatedAmount);
    if (cents(price.amount) !== amount) throw conflict();
    const matching = quote.lines.filter(item => item?.sourceLineId === normalized.sourceLineId);
    if (matching.length !== 1 || cents(matching[0].amount) !== amount || !isDeepStrictEqual(matching[0].snapshot, price)) throw conflict();
    total += amount;
  }
  if (cents(quote.amount) !== total) throw conflict();
  return structuredClone(source);
}

// Internal read only. A caller must validate the source and compare it again
// in the confirmation transaction before using any quote as accounting input.
export function buildMiniappConfirmationSourceQuery(draftId, parameters = createPostgresParameterBinder()) {
  if (typeof draftId !== 'string' || !draftId.trim()) throw new TypeError('draftId is required');
  return {
    text: `SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'sourceOrderNo', s.biz_no, 'draftId', s.draft_id,
      'customerId', s.customer_id, 'sourceChannel', s.source_channel,
      'delivery', jsonb_build_object('method', s.normalized_payload_json->'deliveryMethod', 'address', s.normalized_payload_json->'address', 'desiredDate', s.normalized_payload_json->'desiredDate', 'desiredTime', s.normalized_payload_json->'desiredTime', 'packagingPreference', s.normalized_payload_json->'packagingPreference'),
      'status', s.status, 'revision', s.revision, 'requestHash', s.request_hash,
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'draftLineId', l.draft_line_id, 'clientLineId', l.client_line_id,
        'mappingStatus', l.mapping_status, 'normalizedLine', l.normalized_line_json
      ) ORDER BY l.line_seq) FROM order_intake_lines l WHERE l.submission_id=s.id), '[]'::jsonb),
      'snapshots', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'type', p.snapshot_type, 'priceVersion', p.price_version,
        'authoritative', p.authoritative, 'priceReleaseId', p.price_release_id,
        'priceReleaseSha256', p.price_release_sha256, 'quote', p.quote_snapshot_json
      ) ORDER BY p.id) FROM order_intake_snapshots p WHERE p.submission_id=s.id), '[]'::jsonb)
    ) ORDER BY s.id), '[]'::jsonb) AS result
    FROM order_intake_submissions s WHERE s.draft_id=${parameters.text(draftId.trim())}`,
    values: parameters.values,
  };
}

export function buildMiniappConfirmationSourceGuard(source, identity, parameters) {
  const locked = `erp_locked_confirmation_source(${parameters.text(identity.draftId)})`;
  if (!source) {
    return `(SELECT state->'sources' = '[]'::jsonb
      AND COALESCE(state->>'sourceChannel', '') NOT IN ('mini_program', 'wechat_mini_program')
      FROM (SELECT ${locked} AS state) locked_source)`;
  }
  validateMiniappConfirmationSource([source], identity);
  return `(${locked}->'sources') = ${parameters.json([source])}::jsonb`;
}
