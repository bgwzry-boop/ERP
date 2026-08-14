#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  assessMiniappIntegrationHealth,
  MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL,
} from "../server/miniapp/miniappIntegrationHealth.mjs";

const ready = assessMiniappIntegrationHealth({
  bagwinHealthy: true,
  queue: {
    artwork_dead: 0,
    artwork_expired_running: 0,
    artwork_stalled: 0,
    price_dead: 0,
    price_expired_running: 0,
    price_stalled: 0,
  },
});
assert.equal(ready.ready, true);
assert.equal(ready.status, "ready");

for (const field of [
  "artwork_dead",
  "artwork_expired_running",
  "artwork_stalled",
  "price_dead",
  "price_expired_running",
  "price_stalled",
]) {
  const blocked = assessMiniappIntegrationHealth({
    bagwinHealthy: true,
    queue: { ...Object.fromEntries([
      "artwork_dead",
      "artwork_expired_running",
      "artwork_stalled",
      "price_dead",
      "price_expired_running",
      "price_stalled",
    ].map((key) => [key, 0])), [field]: 1 },
  });
  assert.equal(blocked.ready, false, `${field} must block health`);
}
assert.equal(assessMiniappIntegrationHealth({ bagwinHealthy: false }).ready, false);
assert.match(MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL, /miniapp_artwork_transfer_jobs/);
assert.match(MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL, /miniapp_price_release_delivery_jobs/);
assert.match(MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL, /lease_expires_at <= now\(\)/);
assert.match(MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL, /requested_effective_from <= now\(\)/);
assert.doesNotMatch(MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL, /source_order_no|artwork_file_id|payload_sha256/i);

console.log("Miniapp integration health checks passed.");
