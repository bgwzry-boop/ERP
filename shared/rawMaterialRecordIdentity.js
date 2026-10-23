// UUID v4 entropy is independent of clock resolution and browser lifetime.
// getRandomValues also supports local HTTP review contexts; no weak fallback.
export function rawMaterialRecordIdentitySuffix() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
