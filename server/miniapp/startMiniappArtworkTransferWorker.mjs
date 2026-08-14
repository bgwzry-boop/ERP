import { randomUUID } from "node:crypto";
import pg from "pg";

import { createAttachmentObjectStorage } from "../attachmentObjectStorage.mjs";
import { createPostgresPoolClient } from "../postgresPoolClient.mjs";
import { loadV1ProductionEnvFilesIntoProcess } from "../productionEnvFileLoader.mjs";
import { createMiniappArtworkTransferAdapter } from "./miniappArtworkTransferAdapter.mjs";
import { createPostgresMiniappArtworkTransferRepository } from "./miniappArtworkTransferRepository.mjs";
import { createMiniappArtworkTransferWorker } from "./miniappArtworkTransferWorker.mjs";

loadV1ProductionEnvFilesIntoProcess();

function required(name, fallback = "") {
  const value = String(process.env[name] ?? fallback).trim();
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function integer(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return value;
}

function safeErrorCode(error) {
  if (error?.code && /^[A-Za-z0-9._:-]{1,120}$/.test(String(error.code))) return String(error.code);
  if (error?.message && /^[a-z0-9_]{3,160}$/.test(String(error.message))) return String(error.message);
  return "miniapp_artwork_worker_failed";
}

function requireProductionHttps(name, value) {
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name.toLowerCase()}_must_use_https`);
  }
  return value;
}

const databaseUrl = required("ERP_ARTWORK_DATABASE_URL", process.env.ERP_V1_DATABASE_URL);
const databaseSsl = process.env.ERP_ARTWORK_DATABASE_SSL === "true";
const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: true } : false,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "erp-miniapp-artwork-transfer",
});
const database = createPostgresPoolClient({ pool });
const repository = createPostgresMiniappArtworkTransferRepository({ database });
const adapter = createMiniappArtworkTransferAdapter({
  baseUrl: requireProductionHttps(
    "MINIAPP_ARTWORK_BASE_URL",
    required("MINIAPP_ARTWORK_BASE_URL"),
  ),
  keyId: required("MINIAPP_ARTWORK_HMAC_KEY_ID"),
  sharedSecret: required("MINIAPP_ARTWORK_HMAC_SHARED_SECRET"),
  maxBytes: integer("MINIAPP_ARTWORK_MAX_BYTES", 209_715_200, 1, 209_715_200),
});
const storage = createAttachmentObjectStorage();
const worker = createMiniappArtworkTransferWorker({
  repository,
  adapter,
  storage,
  workerId: `miniapp-artwork:${process.pid}:${randomUUID()}`,
  batchSize: integer("MINIAPP_ARTWORK_WORKER_BATCH_SIZE", 2, 1, 20),
  leaseMs: integer("MINIAPP_ARTWORK_WORKER_LEASE_MS", 900_000, 30_000, 1_800_000),
  requestTimeoutMs: integer("MINIAPP_ARTWORK_REQUEST_TIMEOUT_MS", 300_000, 1_000, 900_000),
  maxAttempts: integer("MINIAPP_ARTWORK_MAX_ATTEMPTS", 8, 1, 20),
});
const pollMs = integer("MINIAPP_ARTWORK_WORKER_POLL_MS", 2_000, 250, 60_000);
let running = false;

async function processBatch() {
  if (running) return;
  running = true;
  try {
    const result = await worker.processBatch();
    if (result.claimed || result.dead) {
      process.stdout.write(`${JSON.stringify({ event: "miniapp_artwork_transfer_batch", ...result })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      event: "miniapp_artwork_transfer_batch_failed",
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
  await pool.end();
}
process.once("SIGINT", () => void shutdown().catch(() => { process.exitCode = 1; }));
process.once("SIGTERM", () => void shutdown().catch(() => { process.exitCode = 1; }));
