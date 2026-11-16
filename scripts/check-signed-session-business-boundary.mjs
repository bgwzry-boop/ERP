import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createApiServer } from "../server/apiServer.mjs";
import { createRuntimeSession, createSeedSession } from "../server/authSeed.mjs";
import { createLocalProductionPackingReadRepository } from "../server/productionPackingReadRepository.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

// Only loopback HTTP and isolated local repositories. Tokens stay in memory.
export async function checkSignedSessionBusinessBoundary({ createServer = createApiServer } = {}) {
  const storage = await mkdtemp(join(tmpdir(), "erp-session-boundary-"));
  const authSecret = randomBytes(32).toString("hex");
  const previousStorage = process.env.ERP_LOCAL_STORAGE_DIR;
  process.env.ERP_LOCAL_STORAGE_DIR = storage;
  const users = [{ userId: "AUTH-BOUNDARY-MANAGER", loginName: "auth-boundary-manager", displayName: "隔离认证管理账号", roles: ["management"], defaultRole: "management", enabled: true, loginEnabled: true, passwordHash: "isolated-fixture", passwordStatus: "active", sessionVersion: 1 }];
  const fixture = {
    orderLines: [{ id: "OL-AUTH-BOUNDARY", customerId: "C001", orderType: "stock", product: "隔离认证测试", size: "30*37*10", color: "红色", handle: "普通提", style: "空白袋", qty: 10, status: "待排产", revision: 1 }],
    productionTasks: [{ id: "PT-AUTH-BOUNDARY", productionTaskId: "PT-AUTH-BOUNDARY", orderLineId: "OL-AUTH-BOUNDARY", taskType: "制袋", machineId: "BAG-01", plannedQty: 10, taskStatus: "待排产", revision: 1, createdBy: "U-OFFICE-A" }],
    machines: [{ id: "BAG-01", machineId: "BAG-01", name: "隔离制袋机", machineType: "bag_making", workshop: "隔离车间", status: "active", enabled: true }],
    employees: [], inventoryReservations: [], workshopReports: [], packingTasks: [], operationLogs: [],
  };
  let workspace;
  const readRepository = createLocalProductionPackingReadRepository();
  let server;
  try {
    server = createServer(withLocalRepositoryFixture({
      runtimeMode: "test", runtimeStorageRoot: storage, seedSource: "synthetic", applyProductionEnvFile: false,
      authMode: "prototype", authSecret, fixedPreviewUserId: "U-MANAGER-A",
      runtimeIdentityRepository: { kind: "test_memory", loadState: async () => ({ users, revokedSeedSessions: [] }), saveState: async () => ({}) },
      coreWorkspaceReadRepository: { kind: "local_memory", loadState: async () => structuredClone(fixture) },
      masterDataMachineConfigurationRepository: { kind: "local_memory", loadState: async () => ({ machines: structuredClone(fixture.machines) }) },
      productionPackingReadRepository: { ...readRepository, async listProductionTasks(input) { workspace = input.workspace; return readRepository.listProductionTasks(input); } },
    }));
    await listenTestServer(server);
    const base = getTestServerBaseUrl(server);
    const validSeed = createSeedSession("U-MANAGER-A", { authSecret }).accessToken;
    const validRuntime = createRuntimeSession(users[0].userId, { authSecret, sessionVersion: 1 }).accessToken;
    const expiredAt = Date.now() - 9 * 60 * 60 * 1000;
    const invalidTokens = [
      { name: "expired-seed", token: createSeedSession("U-MANAGER-A", { authSecret, nowMs: expiredAt }).accessToken, code: "AUTH_TOKEN_EXPIRED" },
      { name: "expired-runtime", token: createRuntimeSession(users[0].userId, { authSecret, sessionVersion: 1, nowMs: expiredAt }).accessToken, code: "AUTH_TOKEN_EXPIRED" },
      { name: "tampered-seed", token: `${validSeed.slice(0, -1)}${validSeed.endsWith("a") ? "b" : "a"}`, code: "AUTH_TOKEN_INVALID" },
      { name: "tampered-runtime", token: `${validRuntime.slice(0, -1)}${validRuntime.endsWith("a") ? "b" : "a"}`, code: "AUTH_TOKEN_INVALID" },
      { name: "unknown-bearer", token: "unknown-signed-session-format", code: "AUTH_TOKEN_INVALID" },
      { name: "empty-bearer", token: "", code: "AUTH_TOKEN_INVALID" },
    ];
    const publishPath = "/api/production-tasks/PT-AUTH-BOUNDARY/publish-schedule";
    const publishBody = { productionTaskId: "PT-AUTH-BOUNDARY", orderLineId: "OL-AUTH-BOUNDARY", processType: "制袋", machineId: "BAG-01", plannedQty: 10, expectedRevision: 1, directDecisionContent: { summary: "隔离认证边界测试，不写入排产" } };
    const request = (path, token, method = "GET", body) => requestJson(base, path, {
      method, headers: { ...(token === undefined ? {} : { authorization: `Bearer${token ? ` ${token}` : ""}` }), ...(body ? { "content-type": "application/json", "idempotency-key": "auth-boundary-no-business-write" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal((await request("/api/production-tasks", validSeed)).status, 200);
    assert.ok(workspace);
    const businessState = () => structuredClone(Object.fromEntries([
      "orderLines", "productionTasks", "productionScheduleRecords", "inventories", "inventoryReservations", "workshopReports", "packingTasks", "operationLogs", "businessDecisionRecords",
    ].map(key => [key, workspace[key] ?? []])));
    const before = businessState();
    const results = [];
    for (const invalid of invalidTokens) {
      for (const [method, path, body] of [
        ["GET", "/api/auth/me"],
        ["GET", "/api/production-schedules/machine-queue"],
        ["POST", publishPath, publishBody],
      ]) {
        const response = await request(path, invalid.token, method, body);
        results.push({ identity: invalid.name, method, path, status: response.status, code: response.body.code });
        assert.equal(response.status, 401, `${invalid.name} ${method} ${path}: ${response.body.code}`);
        assert.equal(response.body.code, invalid.code);
        assert.deepEqual(businessState(), before, "authentication failures cannot mutate business objects or audit logs");
      }
    }

    const finance = createSeedSession("U-FINANCE-A", { authSecret }).accessToken;
    for (const token of [validSeed, validRuntime, finance]) assert.equal((await request("/api/auth/me", token)).status, 200);
    for (const [method, path, body] of [["GET", "/api/production-schedules/machine-queue"], ["POST", publishPath, publishBody]]) {
      const response = await request(path, finance, method, body);
      assert.equal(response.status, 403);
      assert.equal(response.body.code, "PERMISSION_DENIED", "valid sessions with insufficient business permission remain 403");
    }
    assert.equal((await request("/api/production-schedules/machine-queue", validSeed)).status, 200);
    const publish = await request(publishPath, validSeed, "POST", publishBody);
    assert.equal(publish.status, 422, "fresh manager passes authentication and permission checks into employee binding validation");
    assert.equal(publish.body.code, "BUSINESS_DECISION_DIRECT_EMPLOYEE_REQUIRED");
    assert.deepEqual(businessState(), before, "permission and employee binding failures also preserve business state");

    for (const token of [undefined, invalidTokens[0].token, invalidTokens[4].token]) {
      assert.equal((await request("/api/health", token)).status, 200, "health remains public");
      const login = await request("/api/auth/prototype-login", token, "POST", { userId: "U-MANAGER-A" });
      assert.equal(login.status, 200, "public prototype login may replace an expired or invalid session");
      assert.equal(login.body.session?.userId, "U-MANAGER-A");
      assert.ok(login.body.session?.accessToken);
      assert.equal((await request(publishPath, token, "OPTIONS")).status, 204, "preflight remains available");
    }
    assert.equal((await request("/api/production-schedules/machine-queue", undefined)).status, 200, "existing unsigned loopback preview behavior is preserved");
    assert.equal((await request("/api/production-schedules/machine-queue", "seed:U-MANAGER-A")).status, 200, "allowed legacy loopback seed identity retains its existing contract");
    assert.equal((await request("/api/auth/me", undefined)).status, 401, "unsigned preview is not a signed session");
    assert.deepEqual(businessState(), before);
    console.log("PASS signed-session HTTP boundary: expired seed/runtime and invalid Bearer 401; valid permission denial 403; fresh manager reaches employee-binding 422; public login/health/OPTIONS and local preview unchanged; no business writes.");
    return results;
  } finally {
    await closeTestServer(server, { forceAfterMs: 1000 });
    await rm(storage, { recursive: true, force: true });
    if (previousStorage === undefined) delete process.env.ERP_LOCAL_STORAGE_DIR;
    else process.env.ERP_LOCAL_STORAGE_DIR = previousStorage;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkSignedSessionBusinessBoundary();
