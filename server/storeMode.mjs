export function resolveStoreMode({
  explicitMode,
  env = process.env,
  envKeys = [],
  runtimeMode = env.ERP_RUNTIME_MODE ?? env.NODE_ENV,
  productionMode = "postgres",
} = {}) {
  const mode = String(runtimeMode ?? "").trim().toLowerCase();
  const requested = String(
    explicitMode ?? envKeys.map((key) => env[key]).find(Boolean) ?? "",
  ).trim().toLowerCase();
  if (mode === "production" || mode === "strict") {
    if (requested && requested !== productionMode) {
      const error = new Error(`Production store mode must be ${productionMode}.`);
      error.code = "ERP_PRODUCTION_STORE_MODE_REFUSED";
      throw error;
    }
    return productionMode;
  }
  return requested || "local";
}
