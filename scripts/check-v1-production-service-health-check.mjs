#!/usr/bin/env node

import assert from "node:assert/strict";
import { buildProductionServiceHealthReport, formatReport } from "./run-v1-production-service-health-check.mjs";

const readyPayload = {
  status: "ok",
  release: {
    ready: true,
    target: "tencent-production",
    commit: "1234567890abcdef1234567890abcdef12345678",
  },
  seed: {
    runtimeConfig: { production: true },
    productionEnvFileApplication: { applied: true },
    v1PersistenceProfile: { repositoryProfile: "postgres", unsupportedRepositoryCount: 0 },
    attachmentObjectStorage: "object_storage",
    statementExportObjectStorage: "object_storage",
    customers: 99,
  },
};

let requestedUrl = "";
const ready = await buildProductionServiceHealthReport({
  apiBaseUrl: "https://erp.example.test/api/",
  expectedCommit: "1234567890abcdef1234567890abcdef12345678",
  fetchImpl: async (url) => {
    requestedUrl = String(url);
    return { ok: true, json: async () => readyPayload };
  },
});
assert.equal(ready.ready, true);
assert.equal(ready.summary.passedCount, 11);
assert.equal(requestedUrl, "https://erp.example.test/api/health");
const serialized = JSON.stringify(ready);
assert.doesNotMatch(serialized, /erp\.example\.test|customers|99/);
assert.doesNotMatch(serialized, /postgres:\/\/|example-secret|example-bucket/i);
assert.match(formatReport(ready), /11\/11/);

const blocked = await buildProductionServiceHealthReport({
  fetchImpl: async () => ({ ok: true, json: async () => ({ status: "ok", seed: {} }) }),
});
assert.equal(blocked.ready, false);
assert.equal(blocked.summary.passedCount, 2);
assert.equal(blocked.summary.blockingCount, 8);

const unavailable = await buildProductionServiceHealthReport({
  fetchImpl: async () => {
    throw new Error("SENSITIVE_HEALTH_ERROR_VALUE");
  },
});
assert.equal(unavailable.ready, false);
assert.equal(unavailable.summary.passedCount, 0);
assert.doesNotMatch(JSON.stringify(unavailable), /SENSITIVE_HEALTH_ERROR_VALUE/);

console.log("V1 production service health check passed.");
