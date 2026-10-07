import assert from "node:assert/strict";

import { createApiServer } from "../server/apiServer.mjs";
import { assertProductionBootAllowed } from "../server/productionBootGuard.mjs";
import { loadSeedWorkspace } from "../server/seedData.mjs";
import { applyV1PersistenceProfileOptions } from "../server/v1PersistenceProfile.mjs";
import { resolveStoreMode } from "../server/storeMode.mjs";
import { createOrderDraftRepository } from "../server/orderDraftRepository.mjs";
import { createFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";
import { createRawMaterialInboundRepository } from "../server/rawMaterialInboundRepository.mjs";
import { createProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";
import { createAttendancePayrollRepository } from "../server/attendancePayrollRepository.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

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
assertBootRefused({ env: { ERP_STAGING_TEST_LOGIN: "configured-only-for-staging" } }, "ERP_STAGING_TEST_LOGIN", "environmentKeys");
assertBootRefused({ env: { ERP_SCENARIO_ID: "secret-value" } }, "ERP_SCENARIO_ID", "environmentKeys");
assertBootRefused({ env: { ERP_OFFICE_SEED_SOURCE: "synthetic" } }, "ERP_OFFICE_SEED_SOURCE", "environmentKeys");
assertBootRefused({ env: {}, options: { attachmentRepositoryOptions: { mode: "local" } } }, "attachmentRepositoryOptions.mode", "optionKeys");
assertBootRefused({ env: {}, options: { attachmentObjectStorageOptions: { mode: "local_fs" } } }, "attachmentObjectStorageOptions.mode", "optionKeys");
assertBootRefused({ env: {}, options: { attachmentRepository: { kind: "local_json" } } }, "attachmentRepository", "optionKeys");

assert.throws(
  () => createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true, runtimeMode: "production", applyProductionEnvFile: false, scenarioId: "case-1" })),
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

assert.equal(resolveStoreMode({ env: {}, runtimeMode: "demo" }), "postgres");
assert.equal(resolveStoreMode({ env: {}, runtimeMode: "production" }), "postgres");
assert.throws(
  () => resolveStoreMode({ explicitMode: "local", env: {}, runtimeMode: "demo" }),
  (error) => error?.code === "ERP_LOCAL_STORE_FIXTURE_REQUIRED",
);
assert.equal(resolveStoreMode({ explicitMode: "local", env: {}, runtimeMode: "test", allowLocalFixture: true }), "local");
assert.equal(resolveStoreMode({ env: { ERP_ORDER_STORE: "postgres" }, envKeys: ["ERP_ORDER_STORE"], runtimeMode: "production" }), "postgres");
assert.throws(
  () => resolveStoreMode({ env: { ERP_ORDER_STORE: "local" }, envKeys: ["ERP_ORDER_STORE"], runtimeMode: "production" }),
  (error) => error?.code === "ERP_PRODUCTION_STORE_MODE_REFUSED",
);
for (const createRepository of [
  createOrderDraftRepository,
  createFulfillmentActionTransactionRepository,
  createRawMaterialInboundRepository,
  createProductionPackingTransactionRepository,
  createAttendancePayrollRepository,
]) {
  assert.throws(
    () => createRepository({ mode: "local", runtimeMode: "production" }),
    (error) => error?.code === "ERP_PRODUCTION_STORE_MODE_REFUSED",
  );
}

console.log("Production boot guard check passed: local persistence and fixtures fail closed; production seeds stay empty.");
