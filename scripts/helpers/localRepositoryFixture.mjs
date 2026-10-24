import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalRuntimeIdentityRepository } from "../../server/runtimeIdentityRepository.mjs";
import { v1PersistencePostgresRepositoryOptionKeys } from "../../server/v1PersistenceProfile.mjs";
import { buildPublishedOrderPriceFixture } from "./publishedOrderPriceFixture.mjs";

export function withLocalRepositoryFixture(options = {}) {
  const runtimeMode = String(options.runtimeMode ?? process.env.ERP_RUNTIME_MODE ?? process.env.NODE_ENV ?? "").trim().toLowerCase();
  const configuredProfile = options.v1PersistenceProfile ?? options.persistenceProfile;
  const profileMode = typeof configuredProfile === "string"
    ? configuredProfile
    : configuredProfile?.repositoryMode ?? configuredProfile?.mode ?? options.v1PersistenceRepositoryMode;
  if (runtimeMode === "production" || runtimeMode === "strict" || String(profileMode ?? "").trim().toLowerCase() === "postgres") {
    return options;
  }

  const fixtureOptions = {
    ...options,
    allowLocalFixture: true,
    v1PersistenceRepositoryMode: "local",
  };
  for (const optionKey of v1PersistencePostgresRepositoryOptionKeys) {
    const repositoryOptions = options[optionKey] ?? {};
    fixtureOptions[optionKey] = {
      ...repositoryOptions,
      mode: repositoryOptions.mode ?? "local",
      allowLocalFixture: true,
    };
  }
  if (runtimeMode === "test" && String(options.seedSource ?? process.env.ERP_OFFICE_SEED_SOURCE ?? "synthetic") === "synthetic"
    && !options.realSampleSeedFile && options.coreWorkspaceReadRepository?.kind === "local_memory") {
    const repository = options.coreWorkspaceReadRepository;
    const prices = buildPublishedOrderPriceFixture();
    fixtureOptions.coreWorkspaceReadRepository = { ...repository, async loadState() {
      return { ...structuredClone(prices), ...await repository.loadState() };
    } };
  }
  if (options.activeDriverFixture === true) {
    if (options.runtimeIdentityRepository) throw new Error("activeDriverFixture requires its own isolated identity repository");
    const repository = createLocalRuntimeIdentityRepository({ ...options.runtimeIdentityRepositoryOptions, storageRoot: options.runtimeIdentityRepositoryOptions?.storageRoot ?? mkdtempSync(join(tmpdir(), "erp-active-driver-fixture-")) });
    fixtureOptions.runtimeIdentityRepository = {
      ...repository,
      loadState() {
        const state = repository.loadState();
        const employeeId = "FIXTURE-DRIVER-001";
        if ((state.employeeAccounts ?? []).some(employee => employee.id === employeeId)) return state;
        return {
          ...state,
          users: [...(state.users ?? []).filter(user => (user.userId ?? user.id) !== "U-DRIVER-A"), { userId: "U-DRIVER-A", loginName: "driver.a", displayName: "合成在岗司机", defaultRole: "driver", roles: ["driver"], enabled: true, loginEnabled: true, employeeId, identityKind: "seed_fixture", source: "seed", passwordStatus: "active", mustChangePassword: false }],
          employeeAccounts: [...(state.employeeAccounts ?? []), { id: employeeId, bizNo: employeeId, name: "合成在岗司机", userId: "U-DRIVER-A", roleName: "司机", profileStatus: "active", source: "isolated_test_fixture" }],
        };
      },
    };
  }
  return fixtureOptions;
}
