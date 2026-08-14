import { pathToFileURL } from "node:url";

import { closeSharedPostgresPools } from "../postgresPoolClient.mjs";
import { createMiniappApiRuntime } from "./miniappApiServer.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function validPort(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("MINIAPP_BFF_PORT must be an integer from 1 to 65535");
  return parsed;
}

export function readMiniappProductionConfig(env = process.env) {
  const config = {
    databaseUrl: clean(env.MINIAPP_DATABASE_URL || env.ERP_V1_DATABASE_URL || env.DATABASE_URL || env.PGURL),
    sessionSecret: clean(env.MINIAPP_SESSION_SECRET),
    identityPepper: clean(env.MINIAPP_IDENTITY_PEPPER),
    wechatAppId: clean(env.WECHAT_MINIAPP_APP_ID),
    wechatAppSecret: clean(env.WECHAT_MINIAPP_APP_SECRET),
    host: clean(env.MINIAPP_BFF_HOST) || "127.0.0.1",
    port: validPort(env.MINIAPP_BFF_PORT, 8790),
  };
  const missing = [
    ["MINIAPP_DATABASE_URL or ERP_V1_DATABASE_URL or DATABASE_URL or PGURL", config.databaseUrl],
    ["MINIAPP_SESSION_SECRET", config.sessionSecret],
    ["MINIAPP_IDENTITY_PEPPER", config.identityPepper],
    ["WECHAT_MINIAPP_APP_ID", config.wechatAppId],
    ["WECHAT_MINIAPP_APP_SECRET", config.wechatAppSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Miniapp BFF configuration is incomplete: ${missing.join(", ")}`);
  if (Buffer.byteLength(config.sessionSecret) < 32) throw new Error("MINIAPP_SESSION_SECRET must contain at least 32 bytes");
  if (Buffer.byteLength(config.identityPepper) < 32) throw new Error("MINIAPP_IDENTITY_PEPPER must contain at least 32 bytes");
  return config;
}

export async function startMiniappProductionServer(options = {}) {
  const config = options.config || readMiniappProductionConfig(options.env || process.env);
  const runtime = createMiniappApiRuntime({
    runtimeMode: "production",
    repositoryMode: "postgres",
    databaseUrl: config.databaseUrl,
    sessionSecret: config.sessionSecret,
    identityPepper: config.identityPepper,
    wechatAppId: config.wechatAppId,
    wechatAppSecret: config.wechatAppSecret,
  });
  await new Promise((resolve, reject) => {
    runtime.server.once("error", reject);
    runtime.server.listen(config.port, config.host, () => {
      runtime.server.off("error", reject);
      resolve();
    });
  });
  return { ...runtime, host: config.host, port: config.port };
}

async function main() {
  const runtime = await startMiniappProductionServer();
  console.log(`Miniapp BFF listening on http://${runtime.host}:${runtime.port}`);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => runtime.server.close(() => resolve()));
    await closeSharedPostgresPools();
  };
  process.once("SIGINT", () => shutdown().finally(() => { process.exitCode = 0; }));
  process.once("SIGTERM", () => shutdown().finally(() => { process.exitCode = 0; }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
