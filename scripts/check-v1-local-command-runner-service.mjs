import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { createV1LocalCommandRunnerService } from "../server/services/v1LocalCommandRunnerService.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
const systemWriteRouteSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
const compositionSource = `${apiSource}\n${registrySource}\n${systemWriteRouteSource}`;
assert.match(registrySource, /createV1LocalCommandRunnerService\(\)/);
assert.doesNotMatch(apiSource, /from "node:child_process"/);
assert.doesNotMatch(apiSource, /from "node:path"/);
for (const functionName of [
  "runNodeJsonCommand",
  "runV1V2ScopeBriefRefreshCommand",
  "runV1ReleaseCandidateRefreshCommand",
  "runV1ProductionFirstStageExecutionCommand",
  "runV1ProductionPersistenceEvidenceCommand",
  "runV1ProductionEnvSetupCommand",
  "runV1ProductionFirstStageValuesDryRunCommand",
  "runV1ProductionFirstStageValuesApplyCommand",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${functionName}\\(`));
}
for (const methodName of [
  "runV1V2ScopeBriefRefreshCommand",
  "runV1ReleaseCandidateRefreshCommand",
  "runV1ProductionFirstStageExecutionCommand",
  "runV1ProductionPersistenceEvidenceCommand",
  "runV1ProductionEnvSetupCommand",
  "runV1ProductionFirstStageValuesDryRunCommand",
  "runV1ProductionFirstStageValuesApplyCommand",
]) {
  assert.match(compositionSource, new RegExp(`v1LocalCommandRunnerService\\.${methodName}`));
}

const artifactRoot = "/private/erp/artifacts";
const valuesFile = "/private/erp/production-values.env";
const processEnv = { ERP_SAFE_TEST: "1" };
const harness = createHarness({
  fixtures: [
    jsonFixture("v1_v2_scope_brief"),
    jsonFixture("v1_go_live_suite"),
    jsonFixture("v1_production_first_stage_execution", { exitCode: 2 }),
    jsonFixture("v1_production_persistence_evidence", { exitCode: 2 }),
    jsonFixture("v1_production_env_setup", { exitCode: 2 }),
    jsonFixture("v1_production_first_stage_execution", { exitCode: 2 }),
    jsonFixture("v1_production_env_real_value_intake_apply", { exitCode: 2 }),
  ],
  env: processEnv,
});
const service = harness.service;
assert.equal(Object.isFrozen(service), true);
assert.deepEqual(Object.keys(service).sort(), [
  "runV1ProductionEnvSetupCommand",
  "runV1ProductionFirstStageExecutionCommand",
  "runV1ProductionFirstStageValuesApplyCommand",
  "runV1ProductionFirstStageValuesDryRunCommand",
  "runV1ProductionPersistenceEvidenceCommand",
  "runV1ReleaseCandidateRefreshCommand",
  "runV1V2ScopeBriefRefreshCommand",
]);

await service.runV1V2ScopeBriefRefreshCommand({ artifactRoot });
await service.runV1ReleaseCandidateRefreshCommand({
  artifactRoot,
  apiBaseUrl: "https://erp.example/api",
  operatorId: "U-MANAGER-A",
  driverOperatorId: "U-DRIVER-A",
  envFiles: ["/private/erp/a.env", "/private/erp/b.env"],
});
await service.runV1ProductionFirstStageExecutionCommand({ apiBaseUrl: " https://erp.example/api " });
await service.runV1ProductionPersistenceEvidenceCommand();
await service.runV1ProductionEnvSetupCommand();
await service.runV1ProductionFirstStageValuesDryRunCommand({ valuesFile });
await service.runV1ProductionFirstStageValuesApplyCommand({ valuesFile });

assert.equal(harness.calls.length, 7);
for (const call of harness.calls) {
  assert.equal(call.command, "/runtime/node");
  assert.equal(call.options.cwd, "/workspace/erp");
  assert.equal(call.options.env, processEnv);
  assert.deepEqual(call.options.stdio, ["ignore", "pipe", "pipe"]);
}
assert.deepEqual(harness.calls[0].args, [
  "scripts/run-v1-v2-scope-brief.mjs",
  "--completion-snapshot-json",
  "/private/erp/artifacts/v1-completion-snapshot/latest.json",
  "--output-dir",
  "/private/erp/artifacts/v1-v2-scope-brief",
  "--json",
]);
assert.deepEqual(harness.calls[1].args, [
  "scripts/run-v1-go-live-suite.mjs",
  "--refresh-release-candidate",
  "--field-evidence-manifest",
  "/private/erp/artifacts/v1-field-evidence-intake/filled-manifest.draft.json",
  "--output-root",
  "/private/erp/artifacts/v1-go-live-suite",
  "--canonical-root",
  artifactRoot,
  "--sync-canonical-latest",
  "--api-base-url",
  "https://erp.example/api",
  "--operator-id",
  "U-MANAGER-A",
  "--driver-operator-id",
  "U-DRIVER-A",
  "--json",
  "--env-file",
  "/private/erp/a.env",
  "--env-file",
  "/private/erp/b.env",
]);
assert.deepEqual(harness.calls[2].args, [
  "scripts/run-v1-production-first-stage-execution.mjs",
  "--use-production-env-setup-env-file",
  "--json",
  "--api-base-url",
  "https://erp.example/api",
]);
assert.deepEqual(harness.calls[3].args, [
  "scripts/run-v1-production-persistence-evidence.mjs",
  "--use-production-env-setup-env-file",
  "--json",
]);
assert.deepEqual(harness.calls[4].args, ["scripts/run-v1-production-env-setup.mjs", "--json"]);
assert.deepEqual(harness.calls[5].args, [
  "scripts/run-v1-production-first-stage-execution.mjs",
  "--use-production-env-setup-env-file",
  "--production-env-values-file",
  valuesFile,
  "--production-env-values-dry-run",
  "--json",
]);
assert.deepEqual(harness.calls[6].args, [
  "scripts/run-v1-production-env-intake-apply.mjs",
  "--values-env-file",
  valuesFile,
  "--json",
]);
assert.deepEqual(harness.timerDurations, [30000, 120000, 120000, 120000, 120000, 120000, 120000]);
assert.equal(harness.clearedTimers.length, 7);

const noApiHarness = createHarness({
  fixtures: [jsonFixture("v1_production_first_stage_execution")],
});
await noApiHarness.service.runV1ProductionFirstStageExecutionCommand({ apiBaseUrl: "   " });
assert.equal(noApiHarness.calls[0].args.includes("--api-base-url"), false);

await assert.rejects(
  () =>
    createHarness({ fixtures: [jsonFixture("unexpected_scope")] }).service.runV1ProductionEnvSetupCommand(),
  /unexpected shape/,
);
await assert.rejects(
  () =>
    createHarness({ fixtures: [jsonFixture("v1_production_first_stage_execution", { exitCode: 1 })] })
      .service.runV1ProductionFirstStageExecutionCommand(),
  /exited non-zero/,
);
await assert.rejects(
  () =>
    createHarness({ fixtures: [{ stdout: "not-json", stderr: "diagnostic", exitCode: 0 }] })
      .service.runV1ProductionEnvSetupCommand(),
  /invalid JSON/,
);
await assert.rejects(
  () =>
    createHarness({ fixtures: [{ stdout: "", stderr: "", exitCode: 0 }] })
      .service.runV1ProductionEnvSetupCommand(),
  /returned no JSON/,
);
const spawnError = new Error("spawn unavailable");
await assert.rejects(
  () =>
    createHarness({ fixtures: [{ error: spawnError }] }).service.runV1ProductionEnvSetupCommand(),
  spawnError,
);

const timeoutHarness = createHarness({ fixtures: [{ deferred: true }] });
const timeoutResult = timeoutHarness.service.runV1ProductionEnvSetupCommand();
assert.equal(timeoutHarness.timers.length, 1);
timeoutHarness.timers[0].callback();
await assert.rejects(() => timeoutResult, /timed out/);
assert.deepEqual(timeoutHarness.children[0].killSignals, ["SIGTERM"]);

for (const [name, value] of [
  ["spawnProcess", null],
  ["setTimer", null],
  ["clearTimer", null],
]) {
  assert.throws(() => createV1LocalCommandRunnerService({ [name]: value }), new RegExp(`${name} must be a function`));
}
assert.throws(() => createV1LocalCommandRunnerService({ execPath: " " }), /execPath must be a non-empty string/);
assert.throws(() => createV1LocalCommandRunnerService({ cwd: " " }), /cwd must be a non-empty string/);
assert.throws(() => createV1LocalCommandRunnerService({ env: null }), /env must be an object/);

console.log(
  "V1 local command runner service checks passed: fixed scripts, arguments, scopes, exit codes, JSON parsing, timeouts, and API process isolation are locked",
);

function jsonFixture(scope, options = {}) {
  return {
    stdout: JSON.stringify({ scope, status: "checked" }),
    stderr: "",
    exitCode: options.exitCode ?? 0,
  };
}

function createHarness({ fixtures = [], env = {} } = {}) {
  const calls = [];
  const children = [];
  const timers = [];
  const timerDurations = [];
  const clearedTimers = [];
  const queue = [...fixtures];
  const service = createV1LocalCommandRunnerService({
    execPath: "/runtime/node",
    cwd: "/workspace/erp",
    env,
    spawnProcess(command, args, options) {
      const fixture = queue.shift();
      assert.ok(fixture, "a process fixture is required for every spawn");
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.killSignals = [];
      child.kill = (signal) => {
        child.killSignals.push(signal);
      };
      calls.push({ command, args, options });
      children.push(child);
      if (!fixture.deferred) {
        queueMicrotask(() => {
          if (fixture.error) {
            child.emit("error", fixture.error);
            return;
          }
          if (fixture.stdout) child.stdout.write(fixture.stdout);
          if (fixture.stderr) child.stderr.write(fixture.stderr);
          child.emit("close", fixture.exitCode ?? 0);
        });
      }
      return child;
    },
    setTimer(callback, duration) {
      const timer = { callback, duration };
      timers.push(timer);
      timerDurations.push(duration);
      return timer;
    },
    clearTimer(timer) {
      clearedTimers.push(timer);
    },
  });
  return { service, calls, children, timers, timerDurations, clearedTimers };
}
