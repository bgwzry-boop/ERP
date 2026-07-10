import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createApiServer } from "../server/apiServer.mjs";
import { createSeedSession } from "../server/authSeed.mjs";
import {
  applyRuntimeConfigOptions,
  parseRuntimeModeArg,
  resolveRuntimeConfig,
} from "../server/runtimeConfig.mjs";
import {
  v1PersistenceObjectStorageOptionKeys,
  v1PersistencePostgresRepositoryOptionKeys,
} from "../server/v1PersistenceProfile.mjs";
import { resetDemoRuntimeData } from "./reset-erp-runtime-data.mjs";

const storageBase = join(process.cwd(), ".erp-local-storage", "checks", "runtime-config");
rmSync(storageBase, { recursive: true, force: true });
mkdirSync(storageBase, { recursive: true });

const demo = resolveRuntimeConfig({ runtimeMode: "demo", runtimeStorageBaseDir: storageBase }, {});
const test = resolveRuntimeConfig({ runtimeMode: "test", runtimeStorageBaseDir: storageBase }, {});
const production = resolveRuntimeConfig({ runtimeMode: "production", runtimeStorageBaseDir: storageBase }, {});
assert.notEqual(demo.dataRoot, test.dataRoot);
assert.notEqual(demo.dataRoot, production.dataRoot);
assert.notEqual(test.dataRoot, production.dataRoot);
assert.equal(demo.dataPartition, "demo");
assert.equal(test.dataPartition, "test");
assert.equal(production.dataPartition, "production");
assert.equal(production.localDataAllowed, false);
const explicitLegacyRoot = join(storageBase, "explicit-test-root");
const explicitTest = resolveRuntimeConfig(
  { runtimeMode: "test", runtimeStorageBaseDir: storageBase },
  { ERP_LOCAL_STORAGE_DIR: explicitLegacyRoot },
);
assert.equal(explicitTest.dataRoot, explicitLegacyRoot);
assert.equal(explicitTest.storageRootExplicit, true);
assert.equal(parseRuntimeModeArg(["--mode", "production"]), "production");
assert.throws(() => parseRuntimeModeArg(["--mode", "invalid"]), /Expected demo, test, or production/);

const isolatedOptions = applyRuntimeConfigOptions({}, test);
for (const optionKey of [
  ...v1PersistencePostgresRepositoryOptionKeys,
  ...v1PersistenceObjectStorageOptionKeys,
  "printDriverAdapterOptions",
]) {
  assert.equal(isolatedOptions[optionKey].storageRoot, test.dataRoot, `${optionKey} should use the test partition`);
}

for (const runtime of [demo, test, production]) {
  mkdirSync(runtime.dataRoot, { recursive: true });
  writeFileSync(join(runtime.dataRoot, "sentinel.txt"), runtime.mode);
}
const resetReport = resetDemoRuntimeData({ runtimeMode: "demo", runtimeStorageBaseDir: storageBase });
assert.equal(resetReport.status, "reset");
assert.equal(existsSync(join(demo.dataRoot, "sentinel.txt")), false);
assert.equal(existsSync(join(test.dataRoot, "sentinel.txt")), true);
assert.equal(existsSync(join(production.dataRoot, "sentinel.txt")), true);
assert.throws(
  () => resetDemoRuntimeData({ runtimeMode: "test", runtimeStorageBaseDir: storageBase }),
  /restricted to the demo partition/,
);

assert.throws(
  () =>
    createApiServer({
      runtimeMode: "production",
      applyProductionEnvFile: false,
      authSecret: "runtime-config-check-secret",
    }),
  (error) => error?.code === "ERP_PRODUCTION_PERSISTENCE_REQUIRED" && /PostgreSQL/.test(error.message),
);

const objectStorageOptions = {
  provider: "s3_compatible",
  endpoint: "https://storage.example.invalid",
  bucket: "erp-runtime-check",
  accessKeyId: "runtime-check-access",
  secretAccessKey: "runtime-check-secret",
  fetch: async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) }),
};
assert.throws(
  () =>
    createApiServer({
      runtimeMode: "production",
      applyProductionEnvFile: false,
      authSecret: "runtime-config-check-secret",
      v1PersistenceProfile: {
        databaseUrl: "postgres://runtime:secret@db.example.invalid/erp",
        queryJson: async () => [],
        objectStorageOptions,
      },
      attachmentRepositoryOptions: { mode: "local" },
    }),
  (error) =>
    error?.code === "ERP_PRODUCTION_PERSISTENCE_REQUIRED" &&
    error?.details?.invalidRepositories?.includes("attachmentRepository"),
);

const productionServer = createApiServer({
  runtimeMode: "production",
  applyProductionEnvFile: false,
  authSecret: "runtime-config-check-secret",
  corsAllowedOrigins: ["https://erp.example.invalid"],
  v1PersistenceProfile: {
    databaseUrl: "postgres://runtime:secret@db.example.invalid/erp",
    queryJson: async () => [],
    objectStorageOptions,
  },
  runtimeIdentityRepository: {
    kind: "postgres",
    loadState: async () => ({
      users: [
        {
          userId: "U-RUNTIME-OFFICE",
          loginName: "runtime.office",
          displayName: "运行时办公室测试账号",
          defaultRole: "office",
          department: "office",
          enabled: true,
          roles: ["office"],
          loginEnabled: true,
          passwordHash: "runtime-password-test",
          sessionVersion: 1,
        },
      ],
      revokedSeedSessions: [],
    }),
  },
});
await productionServer.ready;
await listen(productionServer);
try {
  const { port } = productionServer.address();
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  const healthJson = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthJson.seed.runtimeConfig.mode, "production");
  assert.equal(healthJson.seed.runtimeConfig.localDataAllowed, false);
  assert.equal(healthJson.seed.productionPersistenceValidation.ready, true);
  assert.equal(healthJson.seed.attachmentRepository, "postgres");
  assert.equal(healthJson.seed.attachmentObjectStorage, "object_storage");
  assert.equal(healthJson.seed.statementExportObjectStorage, "object_storage");
  assert.equal(healthJson.seed.coreWorkspaceReadRepository, "postgres");
  assert.equal(healthJson.seed.customers, 0);
  assert.equal(healthJson.seed.orderLines, 0);
  assert.equal(healthJson.seed.inventories, 0);
  assert.equal(healthJson.seed.todos, 0);
  assert.equal(healthJson.seed.fulfillments, 0);
  assert.equal(healthJson.seed.statements, 0);

  const legacyIdentityResponse = await fetch(`http://127.0.0.1:${port}/api/permissions/effective`, {
    headers: { "x-erp-user-id": "U-OFFICE-A" },
  });
  assert.equal(legacyIdentityResponse.status, 401);

  const runtimeSession = createSeedSession("U-RUNTIME-OFFICE", {
    authSecret: "runtime-config-check-secret",
    sessionVersion: 1,
  });
  const missingIdempotencyKey = await fetch(`http://127.0.0.1:${port}/api/nonexistent-business-write`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${runtimeSession.accessToken}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(missingIdempotencyKey.status, 400);
  assert.equal((await missingIdempotencyKey.json()).code, "IDEMPOTENCY_KEY_REQUIRED");

  const validIdempotencyKey = await fetch(`http://127.0.0.1:${port}/api/nonexistent-business-write`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${runtimeSession.accessToken}`,
      "content-type": "application/json",
      "idempotency-key": "runtime-config-idem-001",
    },
    body: "{}",
  });
  assert.equal(validIdempotencyKey.status, 404);
} finally {
  await close(productionServer);
}

const emptyProductionRun = await runEmptyProductionStartup();
assert.equal(emptyProductionRun.status, 1, emptyProductionRun.stderr);
assert.match(emptyProductionRun.stderr, /Production runtime requires a PostgreSQL connection URL/);
assert.doesNotMatch(emptyProductionRun.stderr, /\.erp-local-storage|\/Users\/|\/private\//);

console.log("Runtime config check passed: mode isolation, demo reset, production fail-closed persistence, strict identity, and configured production startup are covered.");

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
}

function close(server) {
  return new Promise((resolvePromise) => server.close(resolvePromise));
}

function runEmptyProductionStartup() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["server/apiServer.mjs", "--mode", "production"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "",
        ERP_AUTH_SECRET: "runtime-empty-production-secret",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}
