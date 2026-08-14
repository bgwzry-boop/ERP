import { randomBytes } from "node:crypto";

import { ErpPriceReleaseDeliveryError } from "./erpPriceReleaseDeliveryAdapter.mjs";

function retryDelay(attempt, baseMs, maxMs) {
  return Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt - 1)));
}

export function createErpPriceReleaseDeliveryWorker(options = {}) {
  const repository = options.repository;
  const adapter = options.adapter;
  const now = options.now ?? (() => new Date());
  const workerId = String(options.workerId ?? `price-release:${process.pid}`);
  const batchSize = Math.max(1, Math.min(20, Number(options.batchSize ?? 4)));
  const leaseMs = Math.max(10_000, Math.min(300_000, Number(options.leaseMs ?? 60_000)));
  const requestTimeoutMs = Math.max(1_000, Math.min(300_000, Number(options.requestTimeoutMs ?? 30_000)));
  const activationPollMs = Math.max(5_000, Math.min(300_000, Number(options.activationPollMs ?? 30_000)));
  const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts ?? 10)));
  const retryBaseMs = Math.max(1_000, Number(options.retryBaseMs ?? 5_000));
  const retryMaxMs = Math.max(retryBaseMs, Number(options.retryMaxMs ?? 300_000));
  if (!repository || !adapter) throw new Error("Price release delivery repository and adapter are required.");

  return Object.freeze({
    async processBatch() {
      const startedAt = now();
      const claims = await repository.claim({
        workerId,
        leaseTokenPrefix: `${randomBytes(12).toString("hex")}:`,
        now: startedAt.toISOString(),
        leaseExpiresAt: new Date(startedAt.getTime() + leaseMs).toISOString(),
        limit: batchSize,
        maxAttempts,
      });
      const summary = { claimed: claims.length, delivered: 0, waiting: 0, retried: 0, dead: 0, lost: 0 };
      for (const claim of claims) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const acknowledgement = await adapter.deliver({
            priceVersion: claim.priceVersion,
            payloadSha256: claim.payloadSha256,
            bundle: claim.bundle,
            signal: controller.signal,
          });
          const finishedAt = now();
          let updated;
          if (acknowledgement.status === "active" && acknowledgement.activatedAt) {
            updated = await repository.markDelivered({
              jobId: claim.jobId,
              releaseId: claim.releaseId,
              leaseToken: claim.leaseToken,
              acknowledgement,
              activatedAt: acknowledgement.activatedAt,
              now: finishedAt.toISOString(),
            });
            if (updated) summary.delivered += 1;
          } else {
            updated = await repository.markWaiting({
              jobId: claim.jobId,
              leaseToken: claim.leaseToken,
              acknowledgement,
              nextAttemptAt: new Date(finishedAt.getTime() + activationPollMs).toISOString(),
              now: finishedAt.toISOString(),
            });
            if (updated) summary.waiting += 1;
          }
          if (!updated) summary.lost += 1;
        } catch (error) {
          const finishedAt = now();
          const retryable = !(error instanceof ErpPriceReleaseDeliveryError) || error.retryable;
          const retryAt = retryable && claim.attempt < maxAttempts
            ? new Date(finishedAt.getTime() + retryDelay(claim.attempt, retryBaseMs, retryMaxMs)).toISOString()
            : null;
          const updated = await repository.markFailed({
            jobId: claim.jobId,
            leaseToken: claim.leaseToken,
            errorCode: error instanceof ErpPriceReleaseDeliveryError
              ? error.code
              : "miniapp_price_release_delivery_failed",
            retryAt,
            now: finishedAt.toISOString(),
          });
          if (!updated) summary.lost += 1;
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
