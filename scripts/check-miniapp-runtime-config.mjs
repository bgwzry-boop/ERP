import assert from "node:assert/strict";

import { readMiniappProductionConfig } from "../server/miniapp/startMiniappApiServer.mjs";

assert.throws(
  () => readMiniappProductionConfig({}),
  /Miniapp BFF configuration is incomplete/,
);
assert.throws(
  () => readMiniappProductionConfig({
    DATABASE_URL: "postgres://example.invalid/erp",
    MINIAPP_SESSION_SECRET: "short",
    MINIAPP_IDENTITY_PEPPER: "miniapp-identity-pepper-long-enough-001",
    WECHAT_MINIAPP_APP_ID: "wx-test",
    WECHAT_MINIAPP_APP_SECRET: "secret",
  }),
  /MINIAPP_SESSION_SECRET must contain at least 32 bytes/,
);

const config = readMiniappProductionConfig({
  ERP_V1_DATABASE_URL: "postgres://example.invalid/erp",
  MINIAPP_SESSION_SECRET: "miniapp-session-secret-long-enough-001",
  MINIAPP_IDENTITY_PEPPER: "miniapp-identity-pepper-long-enough-001",
  WECHAT_MINIAPP_APP_ID: "wx-test",
  WECHAT_MINIAPP_APP_SECRET: "secret",
  MINIAPP_BFF_HOST: "0.0.0.0",
  MINIAPP_BFF_PORT: "9010",
});
assert.equal(config.databaseUrl, "postgres://example.invalid/erp");
assert.equal(config.host, "0.0.0.0");
assert.equal(config.port, 9010);
assert.equal(Object.hasOwn(config, "customerId"), false);

console.log("Miniapp runtime configuration checks passed: production startup fails closed and accepts the shared ERP PostgreSQL URL without exposing customer scope in configuration.");
