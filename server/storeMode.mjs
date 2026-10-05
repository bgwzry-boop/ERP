export function resolveStoreMode({
  explicitMode,
  env = process.env,
  envKeys = [],
  runtimeMode = env.ERP_RUNTIME_MODE ?? env.NODE_ENV,
  productionMode = "postgres",
  allowLocalFixture = false,
} = {}) {
  const mode = String(runtimeMode ?? "").trim().toLowerCase();
  const requested = String(
    explicitMode ?? envKeys.map((key) => env[key]).find(Boolean) ?? "",
  ).trim().toLowerCase();
  if (mode === "production" || mode === "strict") {
    if (requested && requested !== productionMode) {
      throw storeModeError(`Production store mode must be ${productionMode}.`, requested, "ERP_PRODUCTION_STORE_MODE_REFUSED");
    }
    return productionMode;
  }
  const localModes = new Set(["local", "local_json", "local_memory", "local_fs"]);
  if (requested && localModes.has(requested) && allowLocalFixture !== true) {
    throw storeModeError("Local store mode is only allowed for an explicit test fixture.", requested);
  }
  return requested || productionMode;
}

function storeModeError(message, requestedMode, code = "ERP_LOCAL_STORE_FIXTURE_REQUIRED") {
  const error = new Error(message);
  error.code = code;
  error.requestedMode = requestedMode;
  return error;
}
