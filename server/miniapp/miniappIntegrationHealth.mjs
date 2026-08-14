export const MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL = `
SELECT
  (SELECT count(*)::integer
     FROM miniapp_artwork_transfer_jobs
    WHERE status = 'dead') AS artwork_dead,
  (SELECT count(*)::integer
     FROM miniapp_artwork_transfer_jobs
    WHERE status = 'running' AND lease_expires_at <= now()) AS artwork_expired_running,
  (SELECT count(*)::integer
     FROM miniapp_artwork_transfer_jobs
    WHERE status IN ('pending', 'retry')
      AND next_attempt_at <= now() - ($1::integer * interval '1 second')) AS artwork_stalled,
  (SELECT count(*)::integer
     FROM miniapp_price_release_delivery_jobs
    WHERE status = 'dead') AS price_dead,
  (SELECT count(*)::integer
     FROM miniapp_price_release_delivery_jobs
    WHERE status = 'running' AND lease_expires_at <= now()) AS price_expired_running,
  (SELECT count(*)::integer
     FROM miniapp_price_release_delivery_jobs AS job
     JOIN miniapp_price_releases AS release ON release.id = job.release_id
    WHERE release.status = 'delivering'
      AND release.requested_effective_from <= now()
      AND job.status IN ('pending', 'retry', 'waiting_activation')
      AND job.next_attempt_at <= now() - ($1::integer * interval '1 second')) AS price_stalled
`.trim();

function count(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export function assessMiniappIntegrationHealth(input = {}) {
  const queue = input.queue ?? {};
  const summary = Object.freeze({
    artworkDead: count(queue.artwork_dead ?? queue.artworkDead),
    artworkExpiredRunning: count(queue.artwork_expired_running ?? queue.artworkExpiredRunning),
    artworkStalled: count(queue.artwork_stalled ?? queue.artworkStalled),
    priceDead: count(queue.price_dead ?? queue.priceDead),
    priceExpiredRunning: count(queue.price_expired_running ?? queue.priceExpiredRunning),
    priceStalled: count(queue.price_stalled ?? queue.priceStalled),
  });
  const queueHealthy = Object.values(summary).every((value) => value === 0);
  const bagwinHealthy = input.bagwinHealthy === true;
  return Object.freeze({
    status: bagwinHealthy && queueHealthy ? "ready" : "blocked",
    ready: bagwinHealthy && queueHealthy,
    bagwinHealthy,
    queueHealthy,
    summary,
  });
}
