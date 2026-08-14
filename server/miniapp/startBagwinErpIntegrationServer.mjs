import { createBagwinErpIntegrationRuntime } from "./bagwinErpIntegrationServer.mjs";
import { loadV1ProductionEnvFilesIntoProcess } from "../productionEnvFileLoader.mjs";
import { closeSharedPostgresPools } from "../postgresPoolClient.mjs";

loadV1ProductionEnvFilesIntoProcess();

function positivePort(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 65_535 ? number : fallback;
}

const host = String(process.env.BAGWIN_ERP_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
const port = positivePort(process.env.BAGWIN_ERP_PORT, 8790);
const runtime = createBagwinErpIntegrationRuntime();

runtime.server.requestTimeout = 15_000;
runtime.server.headersTimeout = 10_000;
runtime.server.keepAliveTimeout = 5_000;
runtime.server.listen(port, host, () => {
  process.stdout.write(`Bagwin ERP integration listening on ${host}:${port}.\n`);
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const forcedExit = setTimeout(() => process.exit(1), 10_000);
  forcedExit.unref();
  await new Promise((resolve, reject) => {
    runtime.server.close((error) => error ? reject(error) : resolve());
  });
  await closeSharedPostgresPools();
  clearTimeout(forcedExit);
}

process.on("SIGINT", () => void stop().catch(() => { process.exitCode = 1; }));
process.on("SIGTERM", () => void stop().catch(() => { process.exitCode = 1; }));
