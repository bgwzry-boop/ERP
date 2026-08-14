import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

import {
  MiniappArtworkTransferError,
  createMiniappArtworkTransferAdapter,
} from "../server/miniapp/miniappArtworkTransferAdapter.mjs";
import {
  buildClaimMiniappArtworkTransfersQuery,
  buildCompleteMiniappArtworkTransferQuery,
  buildFailMiniappArtworkTransferQuery,
} from "../server/miniapp/miniappArtworkTransferRepository.mjs";
import { createMiniappArtworkTransferWorker } from "../server/miniapp/miniappArtworkTransferWorker.mjs";

const content = Buffer.from("%PDF-1.7\nsynthetic artwork\n", "utf8");
const sha256 = createHash("sha256").update(content).digest("hex");
const keyId = "erp-artwork-check";
const sharedSecret = "artwork-check-secret-value-0123456789";
const now = new Date("2026-08-04T01:00:00.000Z");
const artwork = {
  fileId: "44444444-4444-4444-8444-444444444444",
  fileName: "proof.pdf",
  mimeType: "application/pdf",
  byteSize: content.byteLength,
  sha256,
};

let capturedRequest;
const adapter = createMiniappArtworkTransferAdapter({
  baseUrl: "https://miniapp.example.test/internal/",
  keyId,
  sharedSecret,
  now: () => now,
  nonce: () => "a".repeat(32),
  fetchFn: async (url, init) => {
    capturedRequest = { url: new URL(url), init };
    return new Response(content, {
      status: 200,
      headers: {
        "content-type": artwork.mimeType,
        "content-length": String(artwork.byteSize),
        "x-artwork-file-id": artwork.fileId,
        "x-artwork-source-line-id": "22222222-2222-4222-8222-222222222222",
        "x-artwork-sha256": artwork.sha256,
      },
    });
  },
});
const downloaded = await adapter.download({
  sourceOrderNo: "WT20260804A1B2C3D4E5",
  sourceLineId: "22222222-2222-4222-8222-222222222222",
  artwork,
  signal: new AbortController().signal,
});
assert.deepEqual(downloaded.buffer, content);
assert.equal(downloaded.sha256, sha256);
assert.equal(capturedRequest.init.method, "GET");
assert.equal(capturedRequest.url.searchParams.get("sourceOrderNo"), "WT20260804A1B2C3D4E5");
assert.equal(capturedRequest.url.searchParams.get("sourceLineId"), "22222222-2222-4222-8222-222222222222");
const requestHeaders = capturedRequest.init.headers;
const bodySha256 = createHash("sha256").update("").digest("hex");
const expectedCanonical = [
  "bagwin-hmac-v1",
  now.toISOString(),
  "a".repeat(32),
  "GET",
  `${capturedRequest.url.pathname}${capturedRequest.url.search}`,
  bodySha256,
].join("\n");
assert.equal(requestHeaders["x-bagwin-content-sha256"], bodySha256);
assert.equal(
  requestHeaders["x-bagwin-signature"],
  createHmac("sha256", sharedSecret).update(expectedCanonical).digest("hex"),
);

const mismatchAdapter = createMiniappArtworkTransferAdapter({
  baseUrl: "https://miniapp.example.test/",
  keyId,
  sharedSecret,
  fetchFn: async () => new Response(content, {
    status: 200,
    headers: {
      "content-type": artwork.mimeType,
      "content-length": String(artwork.byteSize),
      "x-artwork-file-id": artwork.fileId,
      "x-artwork-source-line-id": "22222222-2222-4222-8222-222222222222",
      "x-artwork-sha256": "f".repeat(64),
    },
  }),
});
await assert.rejects(
  () => mismatchAdapter.download({
    sourceOrderNo: "WT20260804A1B2C3D4E5",
    sourceLineId: "22222222-2222-4222-8222-222222222222",
    artwork,
    signal: new AbortController().signal,
  }),
  (error) => error instanceof MiniappArtworkTransferError &&
    error.code === "miniapp_artwork_response_metadata_mismatch" && !error.retryable,
);

const claimQuery = buildClaimMiniappArtworkTransfersQuery({
  workerId: "worker-a",
  leaseToken: "lease-a",
  now: now.toISOString(),
  leaseExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
  limit: 4,
});
assert.match(claimQuery.text, /FOR UPDATE SKIP LOCKED/);
assert.match(claimQuery.text, /status = 'running'/);
assert.match(claimQuery.text, /attempt_count = job\.attempt_count \+ 1/);

const completeQuery = buildCompleteMiniappArtworkTransferQuery({
  jobId: "ART-JOB-1",
  leaseToken: "lease-a",
  fileType: "pdf",
  storageProvider: "object_storage",
  storageKey: "attachments/ART-JOB-1/proof.pdf",
  now: now.toISOString(),
});
assert.match(completeQuery.text, /INSERT INTO attachments/);
assert.match(completeQuery.text, /INSERT INTO attachment_links/);
assert.match(completeQuery.text, /'order_draft_line'/);
assert.match(completeQuery.text, /status = 'succeeded'/);

const failQuery = buildFailMiniappArtworkTransferQuery({
  jobId: "ART-JOB-1",
  leaseToken: "lease-a",
  errorCode: "miniapp_artwork_response_digest_mismatch",
  retryAt: null,
  now: now.toISOString(),
});
assert.match(failQuery.text, /'小程序稿件传输失败'/);
assert.match(failQuery.text, /'miniapp_artwork_transfer'/);
assert.ok(failQuery.values.includes("dead"));

const successfulCalls = [];
const successfulWorker = createMiniappArtworkTransferWorker({
  now: () => now,
  repository: {
    claim: async () => [{
      jobId: "ART-JOB-1",
      sourceOrderNo: "WT20260804A1B2C3D4E5",
      sourceLineId: "22222222-2222-4222-8222-222222222222",
      artwork,
      attempt: 1,
      leaseToken: "lease-a",
    }],
    complete: async (input) => { successfulCalls.push(["complete", input]); return { jobId: input.jobId }; },
    fail: async (input) => { successfulCalls.push(["fail", input]); return { jobId: input.jobId }; },
  },
  adapter: { download: async () => downloaded },
  storage: {
    putObject: async (input) => {
      successfulCalls.push(["store", input]);
      return { storageProvider: "object_storage", storageKey: "attachments/proof.pdf", contentDigest: sha256 };
    },
  },
});
assert.deepEqual(await successfulWorker.processBatch(), {
  claimed: 1, succeeded: 1, retried: 0, dead: 0, lost: 0,
});
assert.deepEqual(successfulCalls.map(([kind]) => kind), ["store", "complete"]);

const deadCalls = [];
const deadWorker = createMiniappArtworkTransferWorker({
  now: () => now,
  maxAttempts: 1,
  repository: {
    claim: async () => [{
      jobId: "ART-JOB-2",
      sourceOrderNo: "WT20260804A1B2C3D4E5",
      sourceLineId: "22222222-2222-4222-8222-222222222222",
      artwork,
      attempt: 1,
      leaseToken: "lease-b",
    }],
    complete: async () => null,
    fail: async (input) => { deadCalls.push(input); return { jobId: input.jobId }; },
  },
  adapter: {
    download: async () => { throw new MiniappArtworkTransferError("miniapp_artwork_rejected_404", false); },
  },
  storage: { putObject: async () => assert.fail("dead transfer must not write storage") },
});
assert.deepEqual(await deadWorker.processBatch(), {
  claimed: 1, succeeded: 0, retried: 0, dead: 1, lost: 0,
});
assert.equal(deadCalls[0].retryAt, null);

console.log("Miniapp artwork transfer checks passed: one-time HMAC pull, bounded SHA-verified download, leased retries, ERP attachment linking, dead-job todo, and confirmation-gate SQL are present.");
