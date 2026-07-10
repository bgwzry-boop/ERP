#!/usr/bin/env node

import { mkdirSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRuntimeConfig } from "../server/runtimeConfig.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}

export function resetDemoRuntimeData(options = {}) {
  const runtimeConfig = resolveRuntimeConfig(
    {
      runtimeMode: options.runtimeMode ?? "demo",
      runtimeStorageBaseDir: options.runtimeStorageBaseDir,
    },
    {},
  );
  if (!runtimeConfig.isDemo || basename(runtimeConfig.dataRoot) !== "demo") {
    throw new Error("Runtime data reset is restricted to the demo partition.");
  }

  rmSync(runtimeConfig.dataRoot, { recursive: true, force: true });
  mkdirSync(runtimeConfig.dataRoot, { recursive: true });
  return {
    status: "reset",
    ready: true,
    mode: runtimeConfig.mode,
    dataPartition: runtimeConfig.dataPartition,
    storagePathExposed: false,
  };
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = resetDemoRuntimeData(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write("ERP demo data reset complete. Test and production partitions were not touched.\n");
    }
  } catch (error) {
    process.stderr.write(`ERP demo data reset failed: ${error?.message || error}\n`);
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = { runtimeMode: "demo" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--mode requires a value.");
      options.runtimeMode = value;
      index += 1;
      continue;
    }
    if (arg === "--storage-base") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--storage-base requires a value.");
      options.runtimeStorageBaseDir = value;
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}
