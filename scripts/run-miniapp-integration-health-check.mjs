#!/usr/bin/env node

import pg from "pg";

import { loadV1ProductionEnvFilesIntoProcess } from "../server/productionEnvFileLoader.mjs";
import {
  assessMiniappIntegrationHealth,
  MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL,
} from "../server/miniapp/miniappIntegrationHealth.mjs";

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
  return "miniapp_integration_health_check_failed";
}

async function checkBagwin(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok || !String(response.headers.get("content-type") ?? "")
      .toLowerCase().startsWith("application/json")) return false;
    const body = await response.json();
    return body?.status === "ok" && body?.service === "bagwin-erp-integration";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  loadV1ProductionEnvFilesIntoProcess();
  const databaseUrl = required("ERP_MINIAPP_HEALTH_DATABASE_URL", process.env.ERP_V1_DATABASE_URL);
  const databaseSsl = process.env.ERP_MINIAPP_HEALTH_DATABASE_SSL === "true";
  const staleSeconds = integer("ERP_MINIAPP_QUEUE_STALE_SECONDS", 900, 60, 86_400);
  const requestTimeoutMs = integer("ERP_MINIAPP_HEALTH_REQUEST_TIMEOUT_MS", 3_000, 500, 30_000);
  const bagwinHealthUrl = required(
    "BAGWIN_ERP_HEALTH_URL",
    `http://127.0.0.1:${integer("BAGWIN_ERP_PORT", 8790, 1, 65_535)}/healthz`,
  );
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: true } : false,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
    application_name: "erp-miniapp-integration-health",
  });
  try {
    const [bagwinHealthy, queueResult] = await Promise.all([
      checkBagwin(bagwinHealthUrl, requestTimeoutMs),
      pool.query(MINIAPP_INTEGRATION_QUEUE_HEALTH_SQL, [staleSeconds]),
    ]);
    const report = assessMiniappIntegrationHealth({
      bagwinHealthy,
      queue: queueResult.rows[0],
    });
    process.stdout.write(`${JSON.stringify({
      event: "miniapp_integration_health",
      ...report,
    })}\n`);
    if (!report.ready) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    event: "miniapp_integration_health_failed",
    errorCode: safeErrorCode(error),
  })}\n`);
  process.exitCode = 1;
});
