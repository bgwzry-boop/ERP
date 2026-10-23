// Compatibility tombstone: never restore this historical shared-database public BFF.
import { pathToFileURL } from "node:url";
import { assertMiniappInternalRuntime } from "./miniappInternalRuntimePolicy.mjs";

export async function startMiniappProductionServer() {
  assertMiniappInternalRuntime({ runtimeMode: "production" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMiniappProductionServer().catch((error) => {
    console.error(`${error.code}: ${error.message}`);
    process.exitCode = 1;
  });
}
