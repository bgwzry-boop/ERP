import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const storageRoot = resolve(process.cwd(), ".erp-local-storage", "e2e", "core-runtime");
const apiPort = String(process.env.ERP_E2E_API_PORT ?? "18787");

await rm(storageRoot, { recursive: true, force: true });

const child = spawn(process.execPath, ["server/apiServer.mjs", "--mode", "test"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "test",
    ERP_API_PORT: apiPort,
    ERP_RUNTIME_MODE: "test",
    ERP_RUNTIME_STORAGE_ROOT: storageRoot,
  },
  stdio: "inherit",
});

let terminating = false;

function terminate(signal) {
  if (terminating) return;
  terminating = true;
  child.kill(signal);
}

process.on("SIGINT", () => terminate("SIGINT"));
process.on("SIGTERM", () => terminate("SIGTERM"));

child.on("error", (error) => {
  console.error(`Failed to start isolated ERP E2E API: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
