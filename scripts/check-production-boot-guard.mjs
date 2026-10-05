import assert from "node:assert/strict";

import { createApiServer } from "../server/apiServer.mjs";
import { assertProductionBootAllowed } from "../server/productionBootGuard.mjs";
import { loadSeedWorkspace } from "../server/seedData.mjs";
import { applyV1PersistenceProfileOptions } from "../server/v1PersistenceProfile.mjs";

const production = { isProduction: true };
const demo = { isProduction: false };
const assertBootRefused = (input, expectedKey, field) => {
  assert.throws(
    () => assertProductionBootAllowed({ runtimeConfig: production, ...input }),
    (error) =>
      error?.code === "ERP_PRODUCTION_BOOT_REFUSED" &&
      error?.details?.[field]?.includes(expectedKey) &&
      !JSON.stringify(error).includes("secret-value"),
  );
};

assert.doesNotThrow(() => assertProductionBootAllowed({
  runtimeConfig: demo,
  env: { ERP_ORDER_STORE: "local", ERP_E2E_WAREHOUSE_EMPLOYEE_ID: "test" },
}));
assertBootRefused({ env: { ERP_ORDER_STORE: "local" } }, "ERP_ORDER_STORE", "environmentKeys");
assertBootRefused({ env: { ERP_ORDER_STORE: "sqlite" } }, "ERP_ORDER_STORE", "environmentKeys");
assertBootRefused({ env: { ERP_ATTACHMENT_OBJECT_STORAGE: "local_fs" } }, "ERP_ATTACHMENT_OBJECT_STORAGE", "environmentKeys");
assertBootRefused({ env: { ERP_V1_FILE_STORAGE_PROFILE: "local_fs" } }, "ERP_V1_FILE_STORAGE_PROFILE", "environmentKeys");
assertBootRefused({ env: { ERP_E2E_BUSINESS_DECISION_FIXTURES: "false" } }, "ERP_E2E_BUSINESS_DECISION_FIXTURES", "environmentKeys");
assertBootRefused({ env: { ERP_SCENARIO_ID: "secret-value" } }, "ERP_SCENARIO_ID", "environmentKeys");
assertBootRefused({ env: { ERP_OFFICE_SEED_SOURCE: "synthetic" } }, "ERP_OFFICE_SEED_SOURCE", "environmentKeys");
assertBootRefused({ env: {}, options: { attachmentRepositoryOptions: { mode: "local" } } }, "attachmentRepositoryOptions.mode", "optionKeys");
assertBootRefused({ env: {}, options: { attachmentObjectStorageOptions: { mode: "local_fs" } } }, "attachmentObjectStorageOptions.mode", "optionKeys");
assertBootRefused({ env: {}, options: { attachmentRepository: { kind: "local_json" } } }, "attachmentRepository", "optionKeys");

assert.throws(
  () => createApiServer({ runtimeMode: "production", applyProductionEnvFile: false, scenarioId: "case-1" }),
  (error) => error?.code === "ERP_PRODUCTION_SEED_NOT_ALLOWED",
);

const emptyProductionWorkspace = loadSeedWorkspace({ runtimeMode: "production" });
assert.equal(emptyProductionWorkspace.seedDataset.source, "none");
for (const key of ["customers", "orderLines", "inventories", "todos", "fulfillments", "statements", "initialRawMaterialInbounds"]) {
  assert.deepEqual(emptyProductionWorkspace[key], [], `${key} must start empty in production`);
}
assert.throws(
  () => loadSeedWorkspace({ runtimeMode: "production", scenarioId: "case-1" }),
  (error) => error?.code === "ERP_PRODUCTION_SEED_NOT_ALLOWED",
);
assert.ok(loadSeedWorkspace({ runtimeMode: "demo" }).customers.length > 0);

const profile = applyV1PersistenceProfileOptions({
  runtimeMode: "production",
  v1PersistenceProfile: {
    databaseUrl: "postgres://test:secret@example.invalid/erp",
    objectStorageOptions: { provider: "s3_compatible" },
  },
  attachmentRepositoryOptions: { mode: "local" },
  attachmentObjectStorageOptions: { mode: "local_fs" },
}, {});
assert.equal(profile.options.attachmentRepositoryOptions.mode, "postgres");
assert.equal(profile.options.attachmentObjectStorageOptions.mode, "object_storage");

console.log("Production boot guard check passed: local persistence and fixtures fail closed; production seeds stay empty.");
