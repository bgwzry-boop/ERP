import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createErpPriceReleaseDeliveryAdapter } from "../server/miniapp/erpPriceReleaseDeliveryAdapter.mjs";
import {
  buildAssertErpPriceReleaseCoverageQuery,
  buildCreateErpPriceReleaseDraftQuery,
  buildPublishErpPriceReleaseQuery,
  buildReviewErpPriceReleaseQuery,
} from "../server/miniapp/erpPriceReleaseRepository.mjs";
import { createErpPriceReleaseDeliveryWorker } from "../server/miniapp/erpPriceReleaseDeliveryWorker.mjs";
import {
  createErpPriceReleaseService,
  erpPriceReleaseSha256,
  validateErpPriceReleaseBundle,
} from "../server/miniapp/erpPriceReleaseService.mjs";

const now = new Date("2026-08-04T08:00:00.000Z");
const effectiveFrom = "2026-08-04T09:00:00.000+08:00";
const priceVersion = "ERP-PRICE-CHECK-V1";
const bundle = {
  schemaVersion: "factory-order-erp-price-release/v1",
  priceVersion,
  effectiveFrom,
  changeSummary: "材料成本调整，发布统一价格版本。",
  catalog: {
    priceVersion,
    specialQuoteRules: { version: "SPECIAL-V1", materialPriceVersion: "MATERIAL-V1" },
  },
  customerPrices: {
    schemaVersion: "factory-order-customer-prices/v1",
    snapshots: [{
      customerId: "11111111-1111-4111-8111-111111111111",
      catalogVersion: priceVersion,
      priceVersion,
      effectiveFrom,
      effectiveTo: null,
      prices: {},
    }],
  },
  specialSizePricing: {
    rules: { version: "SPECIAL-V1", effectiveFrom },
    materialPrice: { version: "MATERIAL-V1", effectiveFrom, provisional: false },
  },
  bootstrap: {
    version: `announcement-${priceVersion}`,
    effectiveFrom,
    announcement: { id: `price-${priceVersion}` },
    featuredUpdates: [],
  },
};

const validated = validateErpPriceReleaseBundle(bundle);
assert.equal(validated.payloadSha256, erpPriceReleaseSha256(bundle));
assert.equal(validated.customerIds.length, 1);
assert.throws(
  () => validateErpPriceReleaseBundle({ ...bundle, bootstrap: { ...bundle.bootstrap, announcement: null } }),
  /version-bound price announcement/,
);

function memoryRepository() {
  const releases = new Map();
  const jobs = [];
  return {
    releases,
    jobs,
    async findByPriceVersion(version) {
      return [...releases.values()].find((item) => item.priceVersion === version) ?? null;
    },
    async findById(id) {
      return releases.get(id) ?? null;
    },
    async createDraft(input) {
      const release = {
        id: "MPR-CHECK-1",
        priceVersion: input.priceVersion,
        effectiveFrom: input.effectiveFrom,
        changeSummary: input.changeSummary,
        payloadSha256: input.payloadSha256,
        bundle: input.bundle,
        status: "draft",
        createdBy: input.createdBy,
        disposition: "created",
      };
      releases.set(release.id, release);
      return release;
    },
    async assertActiveCustomerCoverage(customerIds) {
      assert.deepEqual(customerIds, ["11111111-1111-4111-8111-111111111111"]);
    },
    async markReviewed(input) {
      const release = releases.get(input.releaseId);
      Object.assign(release, { status: "reviewed", reviewedBy: input.reviewedBy });
      return release;
    },
    async enqueuePublication(input) {
      const release = releases.get(input.releaseId);
      Object.assign(release, { status: "delivering", publishedBy: input.publishedBy });
      jobs.push({ id: "MPRJ-CHECK-1", releaseId: release.id });
      return { ...release, deliveryJobId: jobs[0].id };
    },
  };
}

const repository = memoryRepository();
const service = createErpPriceReleaseService({ repository, now: () => now });
const draft = await service.createDraft({ bundle, createdBy: "U-PRICE-EDITOR" });
assert.equal(draft.status, "draft");
await assert.rejects(
  service.review({ releaseId: draft.id, reviewedBy: "U-PRICE-EDITOR" }),
  /Creator and reviewer must be different/,
);
const reviewed = await service.review({ releaseId: draft.id, reviewedBy: "U-PRICE-REVIEWER" });
assert.equal(reviewed.status, "reviewed");
const published = await service.publish({ releaseId: draft.id, publishedBy: "U-PRICE-PUBLISHER" });
assert.equal(published.status, "delivering");
assert.equal(repository.jobs.length, 1);

const draftQuery = buildCreateErpPriceReleaseDraftQuery({
  id: draft.id,
  ...validated,
  createdBy: "U-PRICE-EDITOR",
  now: now.toISOString(),
});
assert.match(draftQuery.text, /INSERT INTO miniapp_price_releases/);
assert.doesNotMatch(draftQuery.text, new RegExp(priceVersion));
const coverageQuery = buildAssertErpPriceReleaseCoverageQuery(validated.customerIds);
assert.match(coverageQuery.text, /miniapp_customer_accounts/);
const reviewQuery = buildReviewErpPriceReleaseQuery({
  releaseId: draft.id,
  reviewedBy: "U-PRICE-REVIEWER",
  now: now.toISOString(),
});
assert.match(reviewQuery.text, /created_by <>/);
const publishQuery = buildPublishErpPriceReleaseQuery({
  releaseId: draft.id,
  publishedBy: "U-PRICE-PUBLISHER",
  jobId: "MPRJ-CHECK-1",
  now: now.toISOString(),
});
assert.match(publishQuery.text, /miniapp_price_release_delivery_jobs/);

let capturedRequest;
const adapter = createErpPriceReleaseDeliveryAdapter({
  baseUrl: "https://miniapp.example.test/",
  keyId: "price-release-check-v1",
  sharedSecret: "s".repeat(32),
  now: () => now,
  nonce: () => "b".repeat(32),
  fetchFn: async (url, init) => {
    capturedRequest = { url: String(url), init };
    return new Response(JSON.stringify({
      schemaVersion: 1,
      priceVersion,
      payloadSha256: validated.payloadSha256,
      status: "active",
      activationOutcome: "activated",
      activatedAt: now.toISOString(),
    }), { status: 201, headers: { "content-type": "application/json" } });
  },
});
const acknowledgement = await adapter.deliver({
  priceVersion,
  payloadSha256: validated.payloadSha256,
  bundle,
  signal: new AbortController().signal,
});
assert.equal(acknowledgement.status, "active");
const canonical = [
  "bagwin-hmac-v1",
  now.toISOString(),
  "b".repeat(32),
  "POST",
  "/v1/integrations/erp/price-releases",
  capturedRequest.init.headers["x-bagwin-content-sha256"],
].join("\n");
assert.equal(
  capturedRequest.init.headers["x-bagwin-signature"],
  createHmac("sha256", "s".repeat(32)).update(canonical).digest("hex"),
);

const deliveryCalls = [];
const worker = createErpPriceReleaseDeliveryWorker({
  repository: {
    async claim() {
      return [{
        jobId: "MPRJ-CHECK-1",
        releaseId: draft.id,
        priceVersion,
        payloadSha256: validated.payloadSha256,
        bundle,
        attempt: 1,
        leaseToken: "lease-1",
      }];
    },
    async markDelivered(input) { deliveryCalls.push(input); return true; },
    async markWaiting() { throw new Error("not expected"); },
    async markFailed() { throw new Error("not expected"); },
  },
  adapter,
  now: () => now,
});
assert.deepEqual(await worker.processBatch(), {
  claimed: 1,
  delivered: 1,
  waiting: 0,
  retried: 0,
  dead: 0,
  lost: 0,
});
assert.equal(deliveryCalls[0].activatedAt, now.toISOString());

const migration = await readFile(new URL("../db/migrations/0034_miniapp_price_release_authority.sql", import.meta.url), "utf8");
assert.match(migration, /CREATE TABLE IF NOT EXISTS miniapp_customer_accounts/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS miniapp_price_releases/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS miniapp_price_release_delivery_jobs/);
assert.match(migration, /order_intake_snapshots_authoritative_lock_check/);

console.log("ERP price release checks passed: strict version coupling, four-eyes review, durable delivery, HMAC sync, activation acknowledgement, and authoritative intake lock are enforced.");
