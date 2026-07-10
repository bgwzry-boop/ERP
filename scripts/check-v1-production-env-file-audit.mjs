import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-file-audit");
const safeEnvPath = join(storageRoot, "secure-prod.env");
const safeOverlayEnvPath = join(storageRoot, "secure-prod-overlay.env");
const placeholderEnvPath = join(storageRoot, "placeholder-prod.env");
const duplicateEnvPath = join(storageRoot, "duplicate-prod.env");
const missingEnvPath = join(storageRoot, "missing-prod.env");
const nonFileEnvPath = join(storageRoot, "non-file-prod.env");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-env-file-audit.mjs");
const templatePath = join(process.cwd(), "docs", "development", "v1-production.env.example");
const sensitiveValues = [
  "postgres://v1_user:pass@prod-db.internal:5432/erp",
  "https://oss-secret.example.com",
  "erp-v1-private-bucket",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/usr/local/bin/node-secret",
  "/var/spool/erp-secret",
];

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });
mkdirSync(nonFileEnvPath, { recursive: true });

writeFileSync(
  safeEnvPath,
  [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL='${sensitiveValues[0]}'`,
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    `ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=${sensitiveValues[1]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=${sensitiveValues[2]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=${sensitiveValues[3]}`,
    `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${sensitiveValues[4]}`,
    "ERP_SYSTEM_PRINTER_ENABLED=true",
    "ERP_SYSTEM_PRINTER_ADAPTER=command_bridge",
    `ERP_SYSTEM_PRINTER_COMMAND=${sensitiveValues[5]}`,
    "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON=[\"scripts/print-command-bridge.mjs\",\"--print-job-id\",\"{printJobId}\"]",
    `ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=${sensitiveValues[6]}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(safeEnvPath, 0o600);

const safeRun = await runAudit(["--env-file", safeEnvPath, "--json"]);
assert.equal(safeRun.status, 0, runFailureMessage("secure ignored env file should pass", safeRun));
const safeReport = JSON.parse(safeRun.stdout);
assert.equal(safeReport.status, "passed");
assert.equal(safeReport.ready, true);
assert.equal(safeReport.envFileCount, 1);
assert.equal(safeReport.summary.placeholderAssignmentCount, 0);
assert.ok(safeReport.summary.uncommentedAssignmentCount >= 10);
assert.equal(safeReport.files[0].git.tracked, false);
assert.equal(safeReport.files[0].git.ignored, true);
assert.equal(safeReport.files[0].fileMode, "600");
assert.equal(safeReport.files[0].path, "env 文件 1");
assert.equal(safeReport.files[0].pathRedacted, true);
assert.equal(safeReport.files[0].sourceIndex, 1);
assert.equal(safeReport.safeguards.envFilePathExposed, false);
assert.ok(safeReport.files[0].variableNames.includes("ERP_V1_DATABASE_URL"));
assertNoSensitiveOutput(safeRun.stdout + safeRun.stderr);
assertNoEnvFilePathOutput(safeRun.stdout + safeRun.stderr);

const textRun = await runAudit(["--env-file", safeEnvPath]);
assert.equal(textRun.status, 0, runFailureMessage("secure ignored env file text output should pass", textRun));
assert.match(textRun.stdout, /V1 production env file audit: PASSED/);
assert.match(textRun.stdout, /env 文件 1/);
assertNoSensitiveOutput(textRun.stdout + textRun.stderr);
assertNoEnvFilePathOutput(textRun.stdout + textRun.stderr);

writeFileSync(
  safeOverlayEnvPath,
  [
    "ERP_V1_DATABASE_URL=postgres://v1_user:overlay-pass@prod-db.internal:5432/erp",
    "ERP_V1_READINESS_OPERATOR_ID=U-OFFICE-A",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(safeOverlayEnvPath, 0o600);

const multiFileRun = await runAudit(["--env-file", safeEnvPath, "--env-file", safeOverlayEnvPath, "--json"]);
assert.equal(multiFileRun.status, 0, runFailureMessage("cross-file duplicate env variables should warn but not block", multiFileRun));
const multiFileReport = JSON.parse(multiFileRun.stdout);
assert.equal(multiFileReport.status, "passed");
assert.equal(multiFileReport.ready, true);
assert.equal(multiFileReport.envFileCount, 2);
assert.deepEqual(
  multiFileReport.files.map((file) => file.path),
  ["env 文件 1", "env 文件 2"],
);
assert.equal(multiFileReport.summary.crossFileDuplicateVariableCount, 1);
assert.ok(
  multiFileReport.warningFindings.some(
    (finding) =>
      finding.key === "cross-file-duplicate-variables" &&
      finding.variables.includes("ERP_V1_DATABASE_URL"),
  ),
  "cross-file duplicate variable should be reported as a warning",
);
assertNoSensitiveOutput(multiFileRun.stdout + multiFileRun.stderr);
assertNoEnvFilePathOutput(multiFileRun.stdout + multiFileRun.stderr);
assert.doesNotMatch(multiFileRun.stdout, /overlay-pass/);

const multiFileTextRun = await runAudit(["--env-file", safeEnvPath, "--env-file", safeOverlayEnvPath]);
assert.equal(multiFileTextRun.status, 0, runFailureMessage("cross-file duplicate env variables text output should warn but not block", multiFileTextRun));
assert.match(multiFileTextRun.stdout, /跨多个 env 文件重复变量/);
assertNoSensitiveOutput(multiFileTextRun.stdout + multiFileTextRun.stderr);
assertNoEnvFilePathOutput(multiFileTextRun.stdout + multiFileTextRun.stderr);
assert.doesNotMatch(multiFileTextRun.stdout, /overlay-pass/);

const templateRun = await runAudit(["--env-file", templatePath, "--json"]);
assert.equal(templateRun.status, 2, runFailureMessage("checked-in template should be blocked", templateRun));
const templateReport = JSON.parse(templateRun.stdout);
assert.equal(templateReport.status, "blocked");
assert.equal(templateReport.ready, false);
assert.ok(
  templateReport.blockingFindings.some((finding) => finding.key === "not-template-or-doc"),
  "template path should be blocked",
);
assert.ok(
  templateReport.blockingFindings.some((finding) => finding.key === "ignored-or-outside-workspace"),
  "docs template path should be blocked because it is not ignored",
);
assertNoSensitiveOutput(templateRun.stdout + templateRun.stderr);
assertNoEnvFilePathOutput(templateRun.stdout + templateRun.stderr);

writeFileSync(
  placeholderEnvPath,
  [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    "ERP_V1_DATABASE_URL=<REPLACE_WITH_POSTGRES_CONNECTION_URL>",
    "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<REPLACE_WITH_SECRET_ACCESS_KEY>",
    "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(placeholderEnvPath, 0o600);

const placeholderRun = await runAudit(["--env-file", placeholderEnvPath, "--json"]);
assert.equal(placeholderRun.status, 2, runFailureMessage("placeholder values should be blocked", placeholderRun));
const placeholderReport = JSON.parse(placeholderRun.stdout);
assert.equal(placeholderReport.summary.placeholderAssignmentCount, 2);
assert.deepEqual(placeholderReport.files[0].placeholderVariables, [
  "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "ERP_V1_DATABASE_URL",
]);
assert.ok(
  placeholderReport.blockingFindings.some((finding) => finding.key === "no-placeholder-values"),
  "placeholder finding should be blocking",
);
assertNoSensitiveOutput(placeholderRun.stdout + placeholderRun.stderr);
assertNoEnvFilePathOutput(placeholderRun.stdout + placeholderRun.stderr);
assert.doesNotMatch(placeholderRun.stdout, /REPLACE_WITH_POSTGRES_CONNECTION_URL|REPLACE_WITH_SECRET_ACCESS_KEY/);

writeFileSync(
  duplicateEnvPath,
  [
    "ERP_V1_PERSISTENCE_PROFILE=postgres",
    `ERP_V1_DATABASE_URL=${sensitiveValues[0]}`,
    "ERP_V1_DATABASE_URL=postgres://v1_user:pass2@prod-db.internal:5432/erp",
    "",
  ].join("\n"),
  { mode: 0o644 },
);
chmodSync(duplicateEnvPath, 0o644);

const duplicateRun = await runAudit(["--env-file", duplicateEnvPath, "--json"]);
assert.equal(duplicateRun.status, 0, runFailureMessage("duplicate env file should warn but not block", duplicateRun));
const duplicateReport = JSON.parse(duplicateRun.stdout);
assert.equal(duplicateReport.status, "passed");
assert.ok(duplicateReport.summary.warningCount >= 2);
assert.ok(
  duplicateReport.warningFindings.some((finding) => finding.key === "no-duplicate-variables"),
  "duplicate variable should be a warning",
);
assert.ok(
  duplicateReport.warningFindings.some((finding) => finding.key === "file-permission-review"),
  "group/other readable env file should be a warning",
);
assertNoSensitiveOutput(duplicateRun.stdout + duplicateRun.stderr);
assertNoEnvFilePathOutput(duplicateRun.stdout + duplicateRun.stderr);
assert.doesNotMatch(duplicateRun.stdout, /pass2@prod-db/);

const missingRun = await runAudit(["--env-file", missingEnvPath, "--json"]);
assert.equal(missingRun.status, 1, runFailureMessage("missing env file should fail without exposing its path", missingRun));
const missingReport = JSON.parse(missingRun.stdout);
assert.equal(missingReport.status, "error");
assert.equal(missingReport.ready, false);
assert.match(missingReport.error.message, /env 文件 1 not found/);
assertNoEnvFilePathOutput(missingRun.stdout + missingRun.stderr);

const nonFileRun = await runAudit(["--env-file", nonFileEnvPath, "--json"]);
assert.equal(nonFileRun.status, 1, runFailureMessage("directory env input should fail without exposing its path", nonFileRun));
const nonFileReport = JSON.parse(nonFileRun.stdout);
assert.equal(nonFileReport.status, "error");
assert.equal(nonFileReport.ready, false);
assert.match(nonFileReport.error.message, /env 文件 1 is not a file/);
assertNoEnvFilePathOutput(nonFileRun.stdout + nonFileRun.stderr);

console.log("V1 production env file audit check passed: safe file, cross-file duplicate warnings, template rejection, placeholder rejection, warnings, exit codes, value redaction, and path redaction are covered.");

function runAudit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--", runnerScript, ...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("production env file audit process timed out after 10000ms"));
    }, 10000);
    timeout.unref?.();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  for (const value of sensitiveValues) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)), `output leaked sensitive value: ${value}`);
  }
  assert.doesNotMatch(output, /pass@prod-db|pass2@prod-db/, "output leaked database credentials");
  assert.doesNotMatch(output, /SUPER_SECRET_VALUE/, "output leaked object-storage secret");
}

function assertNoEnvFilePathOutput(output) {
  for (const path of [safeEnvPath, safeOverlayEnvPath, placeholderEnvPath, duplicateEnvPath, missingEnvPath, nonFileEnvPath, templatePath]) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(path)), `output leaked env file path: ${path}`);
  }
  assert.doesNotMatch(output, new RegExp(escapeRegExp(storageRoot)), "output leaked env storage root");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
