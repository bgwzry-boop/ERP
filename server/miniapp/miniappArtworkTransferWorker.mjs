import { randomBytes } from "node:crypto";

import { MiniappArtworkTransferError } from "./miniappArtworkTransferAdapter.mjs";

function retryDelay(attempt, baseMs, maxMs) {
  return Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt - 1)));
}

function fileType(mimeType, fileName) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  const extension = String(fileName).split(".").at(-1)?.toLowerCase();
  return extension || "document";
}

export function createMiniappArtworkTransferWorker(options = {}) {
  const repository = options.repository;
  const adapter = options.adapter;
  const storage = options.storage;
  const now = options.now ?? (() => new Date());
  const workerId = String(options.workerId ?? `miniapp-artwork:${process.pid}`);
  const batchSize = Math.max(1, Math.min(20, Number(options.batchSize ?? 2)));
  const leaseMs = Math.max(30_000, Math.min(30 * 60_000, Number(options.leaseMs ?? 15 * 60_000)));
  const requestTimeoutMs = Math.max(1_000, Math.min(15 * 60_000, Number(options.requestTimeoutMs ?? 5 * 60_000)));
  const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts ?? 8)));
  const retryBaseMs = Math.max(1_000, Number(options.retryBaseMs ?? 5_000));
  const retryMaxMs = Math.max(retryBaseMs, Number(options.retryMaxMs ?? 15 * 60_000));
  if (!repository || !adapter || !storage) {
    throw new Error("Miniapp artwork transfer repository, adapter, and storage are required.");
  }

  return Object.freeze({
    async processBatch() {
      const startedAt = now();
      const leaseToken = randomBytes(24).toString("hex");
      const claims = await repository.claim({
        workerId,
        leaseToken,
        now: startedAt.toISOString(),
        leaseExpiresAt: new Date(startedAt.getTime() + leaseMs).toISOString(),
        limit: batchSize,
      });
      const summary = { claimed: claims.length, succeeded: 0, retried: 0, dead: 0, lost: 0 };
      for (const claim of claims) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const download = await adapter.download({
            sourceOrderNo: claim.sourceOrderNo,
            sourceLineId: claim.sourceLineId,
            artwork: claim.artwork,
            signal: controller.signal,
          });
          const attachmentId = `${claim.jobId}-ATT`;
          const stored = await storage.putObject({
            attachmentId,
            fileName: download.fileName,
            contentPayload: { contentType: download.mimeType, buffer: download.buffer },
            contentDigest: download.sha256,
          });
          const completed = await repository.complete({
            jobId: claim.jobId,
            leaseToken: claim.leaseToken,
            fileType: fileType(download.mimeType, download.fileName),
            storageProvider: stored.storageProvider,
            storageKey: stored.storageKey,
            now: now().toISOString(),
          });
          if (completed) summary.succeeded += 1;
          else summary.lost += 1;
        } catch (error) {
          const finishedAt = now();
          const retryable = !(error instanceof MiniappArtworkTransferError) || error.retryable;
          const retryAt = retryable && claim.attempt < maxAttempts
            ? new Date(finishedAt.getTime() + retryDelay(claim.attempt, retryBaseMs, retryMaxMs)).toISOString()
            : null;
          const failed = await repository.fail({
            jobId: claim.jobId,
            leaseToken: claim.leaseToken,
            errorCode: error instanceof MiniappArtworkTransferError
              ? error.code
              : "miniapp_artwork_transfer_failed",
            retryAt,
            now: finishedAt.toISOString(),
          });
          if (!failed) summary.lost += 1;
          else if (retryAt) summary.retried += 1;
          else summary.dead += 1;
        } finally {
          clearTimeout(timeout);
        }
      }
      return summary;
    },
  });
}
