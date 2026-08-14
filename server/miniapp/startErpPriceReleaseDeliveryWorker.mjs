import { randomUUID } from "node:crypto";

import { closeSharedPostgresPools } from "../postgresPoolClient.mjs";
import { loadV1ProductionEnvFilesIntoProcess } from "../productionEnvFileLoader.mjs";
import { createErpPriceReleaseDeliveryAdapter } from "./erpPriceReleaseDeliveryAdapter.mjs";
import { createPostgresErpPriceReleaseDeliveryRepository } from "./erpPriceReleaseDeliveryRepository.mjs";
import { createErpPriceReleaseDeliveryWorker } from "./erpPriceReleaseDeliveryWorker.mjs";

loadV1ProductionEnvFilesIntoProcess();

function required(name, fallback = "") {
  const value = String(process.env[name] ?? fallback).trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function integer(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function safeErrorCode(error) {
  if (error?.code && /^[A-Za-z0-9._:-]{1,120}$/.test(String(error.code))) return String(error.code);
  if (error?.message && /^[a-z0-9_]{3,160}$/.test(String(error.message))) return String(error.message);
  return "erp_price_release_worker_failed";
}

function requireProductionHttps(name, value) {
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name.toLowerCase()}_must_use_https`);
  }
  return value;
}

const databaseUrl = required("ERP_PRICE_RELEASE_DATABASE_URL", process.env.ERP_V1_DATABASE_URL);
const baseUrl = requireProductionHttps(
  "MINIAPP_PRICE_RELEASE_BASE_URL",
  required("MINIAPP_PRICE_RELEASE_BASE_URL"),
);
const keyId = required("MINIAPP_PRICE_RELEASE_HMAC_KEY_ID");
const sharedSecret = required("MINIAPP_PRICE_RELEASE_HMAC_SHARED_SECRET");
const pollMs = integer("ERP_PRICE_RELEASE_WORKER_POLL_MS", 2_000, 250, 60_000);
const repository = createPostgresErpPriceReleaseDeliveryRepository({ databaseUrl });
const adapter = createErpPriceReleaseDeliveryAdapter({ baseUrl, keyId, sharedSecret });
const worker = createErpPriceReleaseDeliveryWorker({
  repository,
  adapter,
  workerId: `erp-price-release:${process.pid}:${randomUUID()}`,
  batchSize: integer("ERP_PRICE_RELEASE_WORKER_BATCH_SIZE", 4, 1, 20),
  maxAttempts: integer("ERP_PRICE_RELEASE_WORKER_MAX_ATTEMPTS", 10, 1, 20),
  requestTimeoutMs: integer("ERP_PRICE_RELEASE_REQUEST_TIMEOUT_MS", 30_000, 1_000, 300_000),
  activationPollMs: integer("ERP_PRICE_RELEASE_ACTIVATION_POLL_MS", 30_000, 5_000, 300_000),
});
let running = false;

async function processBatch() {
  if (running) return;
  running = true;
  try {
    const result = await worker.processBatch();
    if (result.claimed || result.dead) console.log(JSON.stringify({ event: "erp_price_release_batch", ...result }));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      event: "erp_price_release_batch_failed",
      errorCode: safeErrorCode(error),
    })}\n`);
  } finally {
    running = false;
  }
}

const timer = setInterval(() => void processBatch(), pollMs);
timer.unref();
void processBatch();

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  await closeSharedPostgresPools();
}
process.once("SIGINT", () => void shutdown().catch(() => { process.exitCode = 1; }));
process.once("SIGTERM", () => void shutdown().catch(() => { process.exitCode = 1; }));
