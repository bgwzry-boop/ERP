import { join, resolve } from "node:path";

import {
  v1PersistenceObjectStorageOptionKeys,
  v1PersistencePostgresRepositoryOptionKeys,
} from "./v1PersistenceProfile.mjs";

export const erpRuntimeModes = Object.freeze(["demo", "test", "production"]);

const runtimeStorageOptionKeys = Object.freeze([
  ...v1PersistencePostgresRepositoryOptionKeys,
  ...v1PersistenceObjectStorageOptionKeys,
  "printDriverAdapterOptions",
]);

export function resolveRuntimeConfig(options = {}, env = process.env) {
  const mode = normalizeRuntimeMode(
    options.runtimeMode ?? env.ERP_RUNTIME_MODE ?? inferRuntimeMode(env),
  );
  const explicitDataRoot = String(
    options.runtimeStorageRoot ?? env.ERP_RUNTIME_STORAGE_ROOT ?? env.ERP_LOCAL_STORAGE_DIR ?? "",
  ).trim();
  const storageBaseDir = resolve(
    String(
      options.runtimeStorageBaseDir ??
        env.ERP_RUNTIME_STORAGE_BASE_DIR ??
        join(process.cwd(), ".erp-local-storage", "runtime"),
    ),
  );
  const dataRoot = explicitDataRoot ? resolve(explicitDataRoot) : resolve(storageBaseDir, mode);

  return Object.freeze({
    mode,
    isDemo: mode === "demo",
    isTest: mode === "test",
    isProduction: mode === "production",
    storageBaseDir,
    dataRoot,
    dataPartition: mode,
    storageRootExplicit: Boolean(explicitDataRoot),
    localDataAllowed: mode !== "production",
  });
}

export function applyRuntimeConfigOptions(options = {}, runtimeConfig = resolveRuntimeConfig(options)) {
  const effectiveOptions = {
    ...options,
    runtimeMode: runtimeConfig.mode,
  };

  for (const optionKey of runtimeStorageOptionKeys) {
    const current = normalizeObject(effectiveOptions[optionKey]);
    if (current.storageRoot !== undefined) {
      effectiveOptions[optionKey] = current;
      continue;
    }
    effectiveOptions[optionKey] = {
      ...current,
      storageRoot: runtimeConfig.dataRoot,
    };
  }

  return effectiveOptions;
}

export function buildRuntimeConfigSummary(runtimeConfig) {
  return {
    mode: runtimeConfig.mode,
    dataPartition: runtimeConfig.dataPartition,
    production: runtimeConfig.isProduction,
    localDataAllowed: runtimeConfig.localDataAllowed,
    storageRootExplicit: runtimeConfig.storageRootExplicit,
    storagePathExposed: false,
  };
}

export function parseRuntimeModeArg(args = []) {
  let mode = "";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--mode requires demo, test, or production.");
      mode = normalizeRuntimeMode(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown API startup argument: ${arg}`);
  }
  return mode;
}

function inferRuntimeMode(env) {
  const nodeEnv = String(env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  const lifecycle = String(env.npm_lifecycle_event ?? "").trim().toLowerCase();
  if (lifecycle === "test" || lifecycle === "check" || lifecycle.endsWith(":check")) return "test";
  return "demo";
}

function normalizeRuntimeMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const aliases = {
    development: "demo",
    local: "demo",
    prototype: "demo",
    ci: "test",
    strict: "production",
  };
  const mode = aliases[normalized] ?? normalized;
  if (erpRuntimeModes.includes(mode)) return mode;
  throw new Error(`Unsupported ERP runtime mode: ${normalized || "<empty>"}. Expected demo, test, or production.`);
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}
