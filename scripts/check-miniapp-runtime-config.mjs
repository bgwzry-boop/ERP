import assert from "node:assert/strict";
import { startMiniappProductionServer } from "../server/miniapp/startMiniappApiServer.mjs";
import { createMiniappApiRuntime } from "../server/miniapp/miniappApiServer.mjs";

await assert.rejects(startMiniappProductionServer(), { code: "MINIAPP_PUBLIC_BFF_NOT_SUPPORTED" });
for (const repositoryMode of ["memory", "postgres"]) {
  assert.throws(() => createMiniappApiRuntime({ runtimeMode: "production", repositoryMode, databaseUrl: "postgres://example.invalid/erp" }), { code: "MINIAPP_PUBLIC_BFF_NOT_SUPPORTED" });
}
console.log("Miniapp runtime boundary checks passed: historical public startup fails before database access or socket binding, regardless of persistence mode.");
