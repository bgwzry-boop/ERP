import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertCompleteReviewStaticIdentity } from "./completeReviewPreviewIdentity.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const reviewDir = fileURLToPath(new URL("../docs/prototypes/raw-material-roll-inventory-review/", import.meta.url));
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const apiEntry = fileURLToPath(new URL("../server/apiServer.mjs", import.meta.url));

await assertCompleteReviewStaticIdentity();

const children = [
  spawn(process.execPath, [apiEntry, "--mode", "demo"], { cwd: rootDir, stdio: "inherit", env: process.env }),
  spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "4174", "--strictPort"], {
    cwd: reviewDir,
    stdio: "inherit",
    env: process.env,
  }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 150).unref();
}

for (const child of children) {
  child.once("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    console.error(`Complete review child stopped (${signal || code || 0}); shutting down the paired service.`);
    stop(code || 1);
  });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
