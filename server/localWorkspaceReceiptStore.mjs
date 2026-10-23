import { normalizeIdempotencyKey, buildIdempotencyRequestHash, buildIdempotencyConflictError } from "./idempotency.mjs";

// Process-local receipts only. Each repository instance owns a distinct scope;
// workspace ownership prevents test/review stores from sharing a receipt.
export function createLocalWorkspaceReceiptStore() {
  const receipts = new WeakMap();
  return {
    read(input) {
      const key = normalizeIdempotencyKey(input.idempotencyKey);
      if (!key || !input.workspace) return null;
      const receipt = receipts.get(input.workspace)?.get(key);
      if (!receipt) return null;
      if (receipt.hash !== buildIdempotencyRequestHash(input.idempotencyPayload)) throw buildIdempotencyConflictError();
      return structuredClone(receipt.value);
    },
    save(input, value) {
      const key = normalizeIdempotencyKey(input.idempotencyKey);
      if (!key || !input.workspace) return;
      let entries = receipts.get(input.workspace);
      if (!entries) { entries = new Map(); receipts.set(input.workspace, entries); }
      entries.set(key, { hash: buildIdempotencyRequestHash(input.idempotencyPayload), value: structuredClone(value) });
    },
  };
}
