import { spawn } from "node:child_process";
import { join } from "node:path";

export function createV1LocalCommandRunnerService(options = {}) {
  const spawnProcess = options.spawnProcess === undefined ? spawn : options.spawnProcess;
  const execPath = options.execPath === undefined ? process.execPath : options.execPath;
  const cwd = options.cwd === undefined ? process.cwd() : options.cwd;
  const env = options.env === undefined ? process.env : options.env;
  const setTimer = options.setTimer === undefined ? setTimeout : options.setTimer;
  const clearTimer = options.clearTimer === undefined ? clearTimeout : options.clearTimer;
  for (const [name, value] of Object.entries({ spawnProcess, setTimer, clearTimer })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }
  if (!cleanText(execPath)) throw new TypeError("execPath must be a non-empty string");
  if (!cleanText(cwd)) throw new TypeError("cwd must be a non-empty string");
  if (!env || typeof env !== "object" || Array.isArray(env)) throw new TypeError("env must be an object");

  return Object.freeze({
    runV1ProductionEnvSetupCommand,
    runV1ProductionFirstStageExecutionCommand,
    runV1ProductionFirstStageValuesApplyCommand,
    runV1ProductionFirstStageValuesDryRunCommand,
    runV1ProductionPersistenceEvidenceCommand,
    runV1ReleaseCandidateRefreshCommand,
    runV1V2ScopeBriefRefreshCommand,
  });

  function runV1V2ScopeBriefRefreshCommand({ artifactRoot }) {
    return runNodeJsonCommand({
      args: [
        "scripts/run-v1-v2-scope-brief.mjs",
        "--completion-snapshot-json",
        join(artifactRoot, "v1-completion-snapshot", "latest.json"),
        "--output-dir",
        join(artifactRoot, "v1-v2-scope-brief"),
        "--json",
      ],
      timeoutMs: 30000,
      expectedScope: "v1_v2_scope_brief",
      timeoutMessage: "V1/V2 scope brief refresh command timed out.",
      invalidShapeMessage: "V1/V2 scope brief refresh command returned an unexpected shape.",
      nonZeroMessage: "V1/V2 scope brief refresh command exited non-zero.",
      invalidJsonMessage: "V1/V2 scope brief refresh command returned invalid JSON.",
      emptyJsonMessage: "V1/V2 scope brief refresh command returned no JSON.",
    });
  }

  function runV1ReleaseCandidateRefreshCommand({
    artifactRoot,
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    envFiles = [],
  }) {
    const args = [
      "scripts/run-v1-go-live-suite.mjs",
      "--refresh-release-candidate",
      "--field-evidence-manifest",
      join(artifactRoot, "v1-field-evidence-intake", "filled-manifest.draft.json"),
      "--output-root",
      join(artifactRoot, "v1-go-live-suite"),
      "--canonical-root",
      artifactRoot,
      "--sync-canonical-latest",
      "--api-base-url",
      apiBaseUrl,
      "--operator-id",
      operatorId,
      "--driver-operator-id",
      driverOperatorId,
      "--json",
    ];
    for (const envFile of envFiles) args.push("--env-file", envFile);
    return runNodeJsonCommand({ args, timeoutMs: 120000 });
  }

  function runV1ProductionFirstStageExecutionCommand({ apiBaseUrl = "" } = {}) {
    const args = [
      "scripts/run-v1-production-first-stage-execution.mjs",
      "--use-production-env-setup-env-file",
      "--json",
    ];
    const normalizedApiBaseUrl = cleanText(apiBaseUrl);
    if (normalizedApiBaseUrl) args.push("--api-base-url", normalizedApiBaseUrl);
    return runNodeJsonCommand({
      args,
      timeoutMs: 120000,
      expectedScope: "v1_production_first_stage_execution",
      allowedExitCodes: [0, 2],
      timeoutMessage: "V1 production first-stage execution command timed out.",
      invalidShapeMessage: "V1 production first-stage execution command returned an unexpected shape.",
      nonZeroMessage: "V1 production first-stage execution command exited non-zero.",
      invalidJsonMessage: "V1 production first-stage execution command returned invalid JSON.",
      emptyJsonMessage: "V1 production first-stage execution command returned no JSON.",
    });
  }

  function runV1ProductionPersistenceEvidenceCommand() {
    return runNodeJsonCommand({
      args: [
        "scripts/run-v1-production-persistence-evidence.mjs",
        "--use-production-env-setup-env-file",
        "--json",
      ],
      timeoutMs: 120000,
      expectedScope: "v1_production_persistence_evidence",
      allowedExitCodes: [0, 2],
      timeoutMessage: "V1 production persistence evidence command timed out.",
      invalidShapeMessage: "V1 production persistence evidence command returned an unexpected shape.",
      nonZeroMessage: "V1 production persistence evidence command exited non-zero.",
      invalidJsonMessage: "V1 production persistence evidence command returned invalid JSON.",
      emptyJsonMessage: "V1 production persistence evidence command returned no JSON.",
    });
  }

  function runV1ProductionEnvSetupCommand() {
    return runNodeJsonCommand({
      args: ["scripts/run-v1-production-env-setup.mjs", "--json"],
      timeoutMs: 120000,
      expectedScope: "v1_production_env_setup",
      allowedExitCodes: [0, 2],
      timeoutMessage: "V1 production env setup command timed out.",
      invalidShapeMessage: "V1 production env setup command returned an unexpected shape.",
      nonZeroMessage: "V1 production env setup command exited non-zero.",
      invalidJsonMessage: "V1 production env setup command returned invalid JSON.",
      emptyJsonMessage: "V1 production env setup command returned no JSON.",
    });
  }

  function runV1ProductionFirstStageValuesDryRunCommand({ valuesFile }) {
    return runNodeJsonCommand({
      args: [
        "scripts/run-v1-production-first-stage-execution.mjs",
        "--use-production-env-setup-env-file",
        "--production-env-values-file",
        valuesFile,
        "--production-env-values-dry-run",
        "--json",
      ],
      timeoutMs: 120000,
      expectedScope: "v1_production_first_stage_execution",
      allowedExitCodes: [0, 2],
      timeoutMessage: "V1 production first-stage values dry-run command timed out.",
      invalidShapeMessage: "V1 production first-stage values dry-run command returned an unexpected shape.",
      nonZeroMessage: "V1 production first-stage values dry-run command exited non-zero.",
      invalidJsonMessage: "V1 production first-stage values dry-run command returned invalid JSON.",
      emptyJsonMessage: "V1 production first-stage values dry-run command returned no JSON.",
    });
  }

  function runV1ProductionFirstStageValuesApplyCommand({ valuesFile }) {
    return runNodeJsonCommand({
      args: [
        "scripts/run-v1-production-env-intake-apply.mjs",
        "--values-env-file",
        valuesFile,
        "--json",
      ],
      timeoutMs: 120000,
      expectedScope: "v1_production_env_real_value_intake_apply",
      allowedExitCodes: [0, 2],
      timeoutMessage: "V1 production first-stage values apply command timed out.",
      invalidShapeMessage: "V1 production first-stage values apply command returned an unexpected shape.",
      nonZeroMessage: "V1 production first-stage values apply command exited non-zero.",
      invalidJsonMessage: "V1 production first-stage values apply command returned invalid JSON.",
      emptyJsonMessage: "V1 production first-stage values apply command returned no JSON.",
    });
  }

  function runNodeJsonCommand({
    args,
    timeoutMs = 30000,
    expectedScope = "v1_go_live_suite",
    allowedExitCodes = [0],
    timeoutMessage = "V1 release candidate refresh command timed out.",
    nonZeroMessage = "V1 release candidate refresh command exited non-zero.",
    invalidShapeMessage = "V1 release candidate refresh command returned an unexpected shape.",
    invalidJsonMessage = "V1 release candidate refresh command returned invalid JSON.",
    emptyJsonMessage = "V1 release candidate refresh command returned no JSON.",
  }) {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawnProcess(execPath, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimer(() => {
        child.kill("SIGTERM");
        rejectPromise(new Error(timeoutMessage));
      }, timeoutMs);
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        clearTimer(timer);
        rejectPromise(error);
      });
      child.on("close", (code) => {
        clearTimer(timer);
        const acceptedExitCodes =
          Array.isArray(allowedExitCodes) && allowedExitCodes.length ? allowedExitCodes : [0];
        if (!acceptedExitCodes.includes(code)) {
          rejectPromise(new Error(nonZeroMessage));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (expectedScope && parsed?.scope !== expectedScope) {
            rejectPromise(new Error(invalidShapeMessage));
            return;
          }
          resolvePromise(parsed);
        } catch {
          rejectPromise(new Error(stderr ? invalidJsonMessage : emptyJsonMessage));
        }
      });
    });
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}
