#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGracefulShutdownController, resolveShutdownTimeoutMs } from "../server/gracefulShutdown.mjs";

assert.equal(resolveShutdownTimeoutMs(undefined), 25_000);
assert.equal(resolveShutdownTimeoutMs(500), 25_000);
assert.equal(resolveShutdownTimeoutMs(8_000), 8_000);
assert.equal(resolveShutdownTimeoutMs(500_000), 120_000);

const events = [];
let closeCallback;
const server = {
  close(callback) {
    events.push("http-close-requested");
    closeCallback = callback;
  },
  closeIdleConnections() {
    events.push("idle-connections-closed");
  },
  closeAllConnections() {
    events.push("all-connections-closed");
  },
};
const signalTarget = new EventEmitter();
const exitCodes = [];
const controller = createGracefulShutdownController({
  server,
  signalTarget,
  timeoutMs: 5_000,
  closeResources: async () => events.push("resources-closed"),
  setExitCode: (code) => exitCodes.push(code),
  forceExit: (code) => exitCodes.push(code),
  logger: {
    info: (message) => events.push(message),
    error: (message) => events.push(message),
  },
});

controller.install();
signalTarget.emit("SIGTERM");
signalTarget.emit("SIGINT");
assert.equal(typeof closeCallback, "function");
assert.equal(events.filter((item) => item === "http-close-requested").length, 1);
closeCallback();
const result = await controller.shutdown("manual");
assert.deepEqual(result, { status: "closed", signal: "SIGTERM", exitCode: 0 });
assert.deepEqual(exitCodes, [0]);
assert.ok(events.indexOf("resources-closed") > events.indexOf("http-close-requested"));
assert.ok(events.includes("idle-connections-closed"));

controller.uninstall();
assert.equal(signalTarget.listenerCount("SIGTERM"), 0);
assert.equal(signalTarget.listenerCount("SIGINT"), 0);

let resourceCloseCallback;
const errorController = createGracefulShutdownController({
  server: {
    close(callback) {
      resourceCloseCallback = callback;
    },
  },
  closeResources: async () => {
    throw new Error("database close failed");
  },
  setExitCode: (code) => exitCodes.push(code),
  logger: { info() {}, error() {} },
});
const errorPromise = errorController.shutdown("test");
resourceCloseCallback();
assert.deepEqual(await errorPromise, { status: "error", signal: "test", exitCode: 1 });
assert.equal(exitCodes.at(-1), 1);

assert.throws(
  () => createGracefulShutdownController({ server: {} }),
  /running HTTP server is required/,
);

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const child = spawn(process.execPath, ["server/apiServer.mjs", "--mode", "test"], {
  cwd: projectRoot,
  env: { ...process.env, ERP_API_PORT: "0", ERP_API_SHUTDOWN_TIMEOUT_MS: "5000" },
  stdio: ["ignore", "pipe", "pipe"],
});
let childOutput = "";
child.stdout.on("data", (chunk) => {
  childOutput += chunk;
});
child.stderr.on("data", (chunk) => {
  childOutput += chunk;
});
await waitFor(() => childOutput.includes("ERP API (test) listening"), 10_000);
child.kill("SIGTERM");
const childExit = await new Promise((resolveExit, reject) => {
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("API child did not exit after SIGTERM."));
  }, 10_000);
  child.once("exit", (code, signal) => {
    clearTimeout(timeout);
    resolveExit({ code, signal });
  });
});
assert.deepEqual(childExit, { code: 0, signal: null });
assert.match(childOutput, /graceful shutdown started \(SIGTERM\)/);
assert.match(childOutput, /graceful shutdown completed/);

const occupiedPortServer = createServer();
await new Promise((resolveListen, reject) => {
  occupiedPortServer.once("error", reject);
  occupiedPortServer.listen(0, "127.0.0.1", resolveListen);
});
const occupiedPort = occupiedPortServer.address().port;
const conflictChild = spawn(process.execPath, ["server/apiServer.mjs", "--mode", "test"], {
  cwd: projectRoot,
  env: { ...process.env, ERP_API_PORT: String(occupiedPort), ERP_API_SHUTDOWN_TIMEOUT_MS: "5000" },
  stdio: ["ignore", "pipe", "pipe"],
});
let conflictOutput = "";
conflictChild.stdout.on("data", (chunk) => {
  conflictOutput += chunk;
});
conflictChild.stderr.on("data", (chunk) => {
  conflictOutput += chunk;
});
const conflictExit = await waitForChildExit(conflictChild, 10_000);
await new Promise((resolveClose) => occupiedPortServer.close(resolveClose));
assert.deepEqual(conflictExit, { code: 1, signal: null });
assert.match(conflictOutput, /ERP API server error \(EADDRINUSE\)/);
assert.match(conflictOutput, /graceful shutdown started \(SERVER_ERROR\)/);

console.log("Graceful shutdown check passed.");

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting for API child output.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
}

function waitForChildExit(target, timeoutMs) {
  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      target.kill("SIGKILL");
      reject(new Error("API child did not exit in time."));
    }, timeoutMs);
    target.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolveExit({ code, signal });
    });
  });
}
