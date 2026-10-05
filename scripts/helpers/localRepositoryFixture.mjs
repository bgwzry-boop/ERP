import { v1PersistencePostgresRepositoryOptionKeys } from "../../server/v1PersistenceProfile.mjs";

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
  return fixtureOptions;
}
