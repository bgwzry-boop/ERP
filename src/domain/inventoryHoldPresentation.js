import { normalizeInventoryHoldTimestamp } from '../../shared/inventoryHoldTime.js';

export function resolveTemporaryHoldCandidate(hold) {
  if (hold?.metadata?.candidate) return hold.metadata.candidate;
  const candidates = hold?.intent?.candidate?.parsedCandidates;
  if (!Array.isArray(candidates)) return null;
  const rawIndex = hold?.metadata?.candidateIndex;
  if (rawIndex === undefined) return candidates.length === 1 ? candidates[0] : null;
  if (typeof rawIndex !== 'number' && (typeof rawIndex !== 'string' || !rawIndex.trim())) return null;
  const index = Number(rawIndex);
  return Number.isSafeInteger(index) && index >= 0 ? candidates[index] ?? null : null;
}

export function toShanghaiExpiryIso(value) {
  const text = String(value ?? '').trim();
  return /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? normalizeInventoryHoldTimestamp(text) : '';
}

export function formatInventoryLedgerTime(value) {
  const normalized = normalizeInventoryHoldTimestamp(value);
  if (!normalized) return '时间待确认';
  return new Date(normalized).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
