import assert from "node:assert/strict";
import { hashRuntimeUserPassword } from "../server/authSeed.mjs";
import { requiredV1RuntimeEmployeeRoles } from "../server/services/runtimeEmployeeAccountReadiness.mjs";
import {
  buildSystemV1Readiness,
  v1SystemPersistenceGroups,
} from "../server/services/systemV1ReadinessService.mjs";

const nowMs = Date.parse("2026-07-12T10:00:00.000Z");
const operatorId = "U-V1-MANAGEMENT";

const demoBlocked = buildSystemV1Readiness({
  workspace: buildWorkspace({ mode: "demo", repositoryKind: "local_memory" }),
  operatorId,
  env: {},
  nowMs,
});
assert.equal(demoBlocked.ready, false);
assert.equal(demoBlocked.repositoryGroups.length, 5);
assert.equal(
  demoBlocked.repositories.length,
  v1SystemPersistenceGroups.reduce((total, group) => total + group.repositories.length, 0),
);
assert.equal(demoBlocked.runtimeEmployeeAccountReadiness.requiredRoleCount, 8);
assert.equal(
  demoBlocked.criteria.find((item) => item.key === "system-runtime-employee-role-coverage")?.blocking,
  false,
);

const demoAccepted = buildSystemV1Readiness({
  workspace: buildWorkspace({ mode: "demo", repositoryKind: "local_json" }),
  operatorId,
  env: {
    ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED: "true",
    ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF: "TEST-ONLY-LOCAL-ACCEPTANCE",
  },
  nowMs,
});
assert.equal(demoAccepted.ready, true);
assert.equal(demoAccepted.localPersistenceAcceptance.accepted, true);
assert.equal(demoAccepted.localPersistenceAcceptance.ignoredInProduction, false);

const productionMissingAccounts = buildSystemV1Readiness({
  workspace: buildWorkspace({ mode: "production", repositoryKind: "postgres" }),
  operatorId,
  env: {},
  nowMs,
});
assert.equal(productionMissingAccounts.ready, false);
assert.equal(productionMissingAccounts.summary.label, "7/8 通过");
assert.equal(productionMissingAccounts.runtimeEmployeeAccountReadiness.coveredRoleCount, 0);
assert.deepEqual(
  productionMissingAccounts.blockingCriteria.map((item) => item.key),
  ["system-runtime-employee-role-coverage"],
);

const productionReady = buildSystemV1Readiness({
  workspace: buildWorkspace({
    mode: "production",
    repositoryKind: "postgres",
    users: buildReadyFormalUsers(),
  }),
  operatorId,
  env: {},
  nowMs,
});
assert.equal(productionReady.ready, true);
assert.equal(productionReady.summary.label, "8/8 通过");
assert.equal(productionReady.runtimeEmployeeAccountReadiness.coveredRoleCount, 8);
assert.equal(productionReady.safeguards.repositoryPayloadExposed, false);
assert.equal(productionReady.safeguards.connectionStringExposed, false);

const productionLocalBypassRejected = buildSystemV1Readiness({
  workspace: buildWorkspace({
    mode: "production",
    repositoryKind: "local_json",
    users: buildReadyFormalUsers(),
  }),
  operatorId,
  env: {
    ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED: "true",
    ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF: "MUST-NOT-BYPASS-PRODUCTION",
  },
  nowMs,
});
assert.equal(productionLocalBypassRejected.ready, false);
assert.equal(productionLocalBypassRejected.localPersistenceAcceptance.accepted, false);
assert.equal(productionLocalBypassRejected.localPersistenceAcceptance.declaredAccepted, true);
assert.equal(productionLocalBypassRejected.localPersistenceAcceptance.ignoredInProduction, true);
assert.equal(productionLocalBypassRejected.safeguards.localPersistenceAcceptedForV1, false);
assert.equal(productionLocalBypassRejected.safeguards.localPersistenceAcceptanceIgnoredInProduction, true);
assert.ok(
  productionLocalBypassRejected.blockingCriteria.some(
    (item) => item.key === "system-local-persistence-acceptance" && item.detail.includes("production 禁止"),
  ),
);

console.log("system V1 readiness service check passed");

function buildWorkspace({ mode, repositoryKind, users = [] }) {
  const workspace = {
    runtimeConfig: { mode },
    users,
    v1PersistenceProfile: { repositoryProfile: repositoryKind },
  };
  for (const group of v1SystemPersistenceGroups) {
    for (const [repositoryKey] of group.repositories) {
      workspace[repositoryKey] = {
        kind: group.key === "file-retention-stores" && repositoryKind === "postgres"
          ? "object_storage"
          : repositoryKind,
      };
    }
  }
  return workspace;
}

function buildReadyFormalUsers() {
  return requiredV1RuntimeEmployeeRoles.map((roleKey) => {
    const userId = `U-V1-${roleKey.toUpperCase()}`;
    return {
      id: userId,
      userId,
      loginName: `v1.${roleKey}`,
      displayName: roleKey,
      defaultRole: roleKey,
      roles: [roleKey],
      source: "master_data_import_review",
      enabled: true,
      loginEnabled: true,
      passwordHash: hashRuntimeUserPassword(`D49-${roleKey}-password`, {
        userId,
        authSecret: "system-v1-readiness-service-check-secret",
      }),
      passwordStatus: "active",
      mustChangePassword: false,
      passwordChangedAt: "2026-07-01T00:00:00.000Z",
      passwordExpiresAt: "2026-09-29T00:00:00.000Z",
      lockedUntil: "",
      defaultMachineId: roleKey === "workshop" ? "BAG-01" : "",
    };
  });
}
