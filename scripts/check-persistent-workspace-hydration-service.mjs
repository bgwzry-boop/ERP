import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coreWorkspaceCollectionKeys } from "../server/coreWorkspaceReadRepository.mjs";
import {
  hydratePersistentWorkspaceState,
  isProductionWorkspaceRuntime,
} from "../server/services/persistentWorkspaceHydrationService.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.match(apiSource, /hydratePersistentWorkspaceState\(\{/);
assert.doesNotMatch(apiSource, /function loadPersistentWorkspaceState/);
assert.doesNotMatch(apiSource, /seedInbounds: workspace\.initialRawMaterialInbounds/);

assert.equal(isProductionWorkspaceRuntime({ runtimeConfig: { production: true, mode: "demo" } }), true);
assert.equal(isProductionWorkspaceRuntime({ runtimeConfig: { production: false, mode: "production" } }), true);
assert.equal(isProductionWorkspaceRuntime({ runtimeConfig: { production: false, mode: "demo" } }), false);

const production = buildWorkspace({
  runtimeConfig: { production: false, mode: "production" },
  coreState: { customers: [{ id: "C-PERSISTED" }] },
  rawMaterialState: {},
  runtimeIdentityState: {
    users: [{ userId: "U-FORMAL", displayName: "正式员工" }],
    employeeAccounts: [{ id: "E-FORMAL", userId: "U-FORMAL", name: "正式员工" }],
  },
});
let productionDemoSeedCalls = 0;
await hydratePersistentWorkspaceState({
  workspace: production.workspace,
  seedDemoPrintJobs: async () => {
    productionDemoSeedCalls += 1;
  },
});

assert.deepEqual(production.workspace.customers, [{ id: "C-PERSISTED" }]);
for (const key of coreWorkspaceCollectionKeys.filter((key) => key !== "customers" && key !== "employees")) {
  assert.deepEqual(production.workspace[key], [], `production core collection ${key} must not retain demo rows`);
}
assert.deepEqual(production.workspace.orderDrafts, []);
assert.deepEqual(production.workspace.driverDeliveryDispatches, []);
assert.deepEqual(production.workspace.rawMaterialInbounds, []);
assert.equal(productionDemoSeedCalls, 0);
assert.equal(production.calls.find((call) => call.name === "rawMaterial")?.options, undefined);
assert.equal(production.workspace.users.some((item) => item.userId === "U-FORMAL"), true);
assert.equal(production.workspace.employees.some((item) => item.id === "E-FORMAL"), true);

const demo = buildWorkspace({
  runtimeConfig: { production: false, mode: "demo" },
  coreState: {},
  rawMaterialState: {},
  runtimeIdentityState: {},
});
let demoSeedWorkspace = null;
await hydratePersistentWorkspaceState({
  workspace: demo.workspace,
  seedDemoPrintJobs: async (workspace) => {
    demoSeedWorkspace = workspace;
  },
});

assert.deepEqual(demo.workspace.customers, [{ id: "C-DEMO" }]);
assert.deepEqual(demo.workspace.orderDrafts, [{ id: "D-DEMO" }]);
assert.deepEqual(demo.workspace.driverDeliveryDispatches, [{ id: "DD-DEMO" }]);
assert.deepEqual(demo.workspace.rawMaterialInbounds, [{ id: "RMI-DEMO" }]);
assert.equal(demoSeedWorkspace, demo.workspace);
assert.deepEqual(demo.calls.find((call) => call.name === "rawMaterial")?.options, {
  seedInbounds: [{ id: "RMI-DEMO" }],
});

const persistedDemo = buildWorkspace({
  runtimeConfig: { production: false, mode: "demo" },
  coreState: {},
  rawMaterialState: { rawMaterialInbounds: [] },
  runtimeIdentityState: {},
});
await hydratePersistentWorkspaceState({ workspace: persistedDemo.workspace });
assert.deepEqual(persistedDemo.workspace.rawMaterialInbounds, []);

const postgresDemo = buildWorkspace({
  runtimeConfig: { production: false, mode: "test" },
  coreState: {},
  rawMaterialState: { rawMaterialInbounds: [] },
  runtimeIdentityState: {},
  runtimeIdentityKind: "postgres",
});
await hydratePersistentWorkspaceState({
  workspace: postgresDemo.workspace,
  seedUsers: [
    { userId: "U-OFFICE-A", loginName: "office.a", displayName: "办公室A", department: "office" },
    { userId: "U-OFFICE-B", loginName: "office.b", displayName: "办公室B", department: "office" },
  ],
});
const seedIdentitySave = postgresDemo.calls.find((call) => call.name === "runtimeIdentity:save");
assert(seedIdentitySave, "test PostgreSQL startup must persist seed users required by business foreign keys");
assert.deepEqual(
  seedIdentitySave.input.workspace.users.map((user) => user.userId),
  ["U-OFFICE-A", "U-OFFICE-B"],
);
assert.equal(
  postgresDemo.workspace.users.find((user) => user.userId === "U-OFFICE-B")?.identityKind,
  "seed_fixture",
);
assert.equal(
  seedIdentitySave.input.workspace.users.find((user) => user.userId === "U-OFFICE-B")?.passwordStatus,
  "not_applicable",
);

const postgresProduction = buildWorkspace({
  runtimeConfig: { production: true, mode: "production" },
  coreState: {},
  rawMaterialState: {},
  runtimeIdentityState: {},
  runtimeIdentityKind: "postgres",
});
await hydratePersistentWorkspaceState({
  workspace: postgresProduction.workspace,
  seedUsers: [{ userId: "U-OFFICE-B", loginName: "office.b", displayName: "办公室B" }],
});
assert.equal(
  postgresProduction.calls.some((call) => call.name === "runtimeIdentity:save"),
  false,
  "production startup must never persist prototype seed users",
);

console.log(
  "persistent workspace hydration checks passed: production empty-state authority, demo-only fallback, raw-material seed isolation, and identity merge are locked",
);

function buildWorkspace({
  runtimeConfig,
  coreState,
  rawMaterialState,
  runtimeIdentityState,
  runtimeIdentityKind = "local_json",
}) {
  const calls = [];
  const repository = (name, state = {}, kind = "local_json") => ({
    kind,
    async loadState(options) {
      calls.push({ name, options });
      return state;
    },
    async saveState(input) {
      calls.push({ name: `${name}:save`, input });
      return {};
    },
  });
  const workspace = Object.fromEntries(
    coreWorkspaceCollectionKeys.map((key) => [key, [{ id: `DEMO-${key}` }]]),
  );
  Object.assign(workspace, {
    runtimeConfig,
    customers: [{ id: "C-DEMO" }],
    users: [{ id: "U-DEMO", userId: "U-DEMO" }],
    employees: [{ id: "E-DEMO" }],
    initialOrderDrafts: [{ id: "D-DEMO" }],
    initialDriverDeliveryDispatches: [{ id: "DD-DEMO" }],
    initialRawMaterialInbounds: [{ id: "RMI-DEMO" }],
    coreWorkspaceReadRepository: repository("core", coreState, "postgres"),
    orderDraftRepository: repository("orderDraft", { orderDrafts: [] }, "local_memory"),
    driverDeliveryDispatchRepository: repository("driverDispatch", { driverDeliveryDispatches: [] }),
    driverDeviceFieldTestRepository: repository("driverFieldTest"),
    printBatchRepository: repository("printBatch"),
    printDeviceRepository: repository("printDevice"),
    printJobRepository: repository("printJob"),
    printerDeviceFieldTestRepository: repository("printerFieldTest"),
    masterDataImportReviewRepository: repository("masterDataReview"),
    rawMaterialInboundRepository: repository("rawMaterial", rawMaterialState),
    rawMaterialSupplierStatementReviewRepository: repository("supplierStatementReview"),
    runtimeIdentityRepository: repository("runtimeIdentity", runtimeIdentityState, runtimeIdentityKind),
    productionScheduleRecordRepository: repository("productionSchedule"),
    paymentRecordRepository: repository("payment"),
    statementExportRepository: repository("statementExport"),
    attachmentRepository: repository("attachment"),
    attachmentAccessAuditRepository: repository("attachmentAudit"),
  });
  return { workspace, calls };
}
