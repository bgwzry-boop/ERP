import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const generatorScript = join(process.cwd(), "scripts", "generate-v1-production-env-template.mjs");
const envTemplatePath = join(process.cwd(), "docs", "development", "v1-production.env.example");
const runbookPath = join(process.cwd(), "docs", "development", "v1-go-live-runbook.zh-CN.md");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-template");
const tempEnvPath = join(tempRoot, "v1-production.env.example");
const tempRunbookPath = join(tempRoot, "v1-go-live-runbook.zh-CN.md");
const requiredVariables = [
  "ERP_RUNTIME_MODE",
  "ERP_V1_PERSISTENCE_PROFILE",
  "ERP_V1_DATABASE_URL",
  "ERP_V1_FILE_STORAGE_PROFILE",
  "ERP_AUTH_MODE",
  "ERP_AUTH_SECRET",
  "ERP_CORS_ALLOWED_ORIGINS",
  "ERP_API_MAX_JSON_BODY_BYTES",
  "VITE_ERP_RUNTIME_MODE",
  "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
  "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
  "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "ERP_SYSTEM_PRINTER_ENABLED",
  "ERP_SYSTEM_PRINTER_ADAPTER",
  "ERP_SYSTEM_PRINTER_COMMAND",
  "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON",
  "ERP_SYSTEM_PRINTER_ALLOWLIST",
  "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
  "ERP_PRINT_COMMAND_BRIDGE_MODE",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON",
  "ERP_V1_READINESS_API_BASE_URL",
  "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR",
  "ERP_V1_FIELD_EVIDENCE_MANIFEST",
  "ERP_V1_RELEASE_CANDIDATE_OUTPUT_DIR",
];
const forbiddenPatterns = [
  /postgres:\/\/[^<\s]+:[^<\s]+@/i,
  /AKIA[0-9A-Z]{8,}/,
  /SECRET_VALUE/i,
  /pass@prod-db/i,
  /oss-secret/i,
  /erp-v1-private-bucket/i,
  /\/var\/spool\/erp-secret/i,
  /\/usr\/bin\/lpstat-secret/i,
];

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const syntaxRun = await runNode([generatorScript, "--json"]);
assert.equal(syntaxRun.status, 0, runFailureMessage("generator summary should succeed", syntaxRun));
const summary = JSON.parse(syntaxRun.stdout);
assert.equal(summary.status, "ready");
assert.equal(summary.safeguards.realSecretsIncluded, false);
assert.equal(summary.safeguards.allValuesCommented, true);

const writeRun = await runNode([
  generatorScript,
  "--write",
  "--json",
  "--output-env",
  tempEnvPath,
  "--output-runbook",
  tempRunbookPath,
]);
assert.equal(writeRun.status, 0, runFailureMessage("generator write should succeed", writeRun));
assert.ok(existsSync(tempEnvPath), "temporary env template was not written");
assert.ok(existsSync(tempRunbookPath), "temporary runbook was not written");

const envTemplate = readFileSync(envTemplatePath, "utf8");
const runbook = readFileSync(runbookPath, "utf8");
const tempEnvTemplate = readFileSync(tempEnvPath, "utf8");
const tempRunbook = readFileSync(tempRunbookPath, "utf8");
assert.equal(tempEnvTemplate, envTemplate, "checked-in env template is not in sync with generator");
assert.equal(tempRunbook, runbook, "checked-in runbook is not in sync with generator");

for (const variable of requiredVariables) {
  assert.match(envTemplate, new RegExp(`# ${escapeRegExp(variable)}=`), `env template missed ${variable}`);
}
for (const line of envTemplate.split(/\r?\n/)) {
  if (!line.trim()) continue;
  assert.ok(line.startsWith("#"), `env template should keep all values commented: ${line}`);
}
assert.match(envTemplate, /<REPLACE_WITH_POSTGRES_CONNECTION_URL>/);
assert.match(envTemplate, /ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=<REPLACE_WITH_DEDICATED_RESTORE_VALIDATION_DATABASE_URL>/);
assert.match(envTemplate, /ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false/);
assert.match(envTemplate, /<REPLACE_WITH_OBJECT_STORAGE_ENDPOINT>/);
assert.match(envTemplate, /<REPLACE_WITH_LPSTAT_COMMAND>/);
assert.match(envTemplate, /node -- scripts\/run-v1-production-env-setup\.mjs --target <your-secure-env-file>/);
assert.match(
  envTemplate,
  /node -- scripts\/run-v1-production-env-setup\.mjs --import-from <filled-secure-env-file> --target <your-secure-env-file> --force/,
);
assert.match(envTemplate, /node -- scripts\/run-v1-production-env-file-audit\.mjs --env-file <your-secure-env-file>/);
assert.match(envTemplate, /ERP_V1_PRODUCTION_ENV_FILE=<your-secure-env-file>/);
assert.match(envTemplate, /ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS only for read-only audit \/ preview diagnostics/);
assert.match(runbook, /run-v1-production-env-setup/);
assert.match(runbook, /node -- scripts\/run-v1-production-env-setup\.mjs --target <secure-env-file>/);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-env-setup\.mjs --import-from <filled-secure-env-file> --target <secure-env-file> --force/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-env-intake-apply\.mjs --values-env-file <secure-values-env-fragment> --use-production-env-setup-env-file --intake-csv \.erp-local-storage\/v1-production-env-setup\/production-env-real-value-intake\.csv --dry-run/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest>/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --env-file <secure-env-file> --field-evidence-manifest <filled-field-evidence-manifest>/,
);
assert.match(runbook, /备用：只有需要绕开 production env setup 报告时，才显式传入安全 env 文件/);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --env-file <secure-env-file> --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>/,
);
assert.match(runbook, /备用：显式 env 文件同样可带真实值片段合并/);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest> --apply-migrations/,
);
assert.match(runbook, /备用：只有绕开 setup 报告时才显式传入安全 env 文件后执行迁移/);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --env-file <secure-env-file> --field-evidence-manifest <filled-field-evidence-manifest> --apply-migrations/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-env-intake-verify\.mjs --use-production-env-setup-env-file --intake-csv \.erp-local-storage\/v1-production-env-setup\/production-env-real-value-intake\.csv/,
);
assert.match(runbook, /备用：只有需要绕开 production env setup 报告时，真实值 intake 校验才显式传入安全 env 文件/);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-env-intake-verify\.mjs --env-file <secure-env-file> --intake-csv \.erp-local-storage\/v1-production-env-setup\/production-env-real-value-intake\.csv/,
);
assert.match(runbook, /生产 env 真实值 intake 校验/);
assert.match(runbook, /--production-env-values-file <secure-values-env-fragment>/);
assert.match(runbook, /--production-env-values-dry-run/);
assert.match(runbook, /run-v1-production-env-intake-apply --dry-run/);
assert.match(runbook, /第一阶段执行器的 `--production-env-values-dry-run` 预检/);
assert.match(runbook, /去掉 `--production-env-values-dry-run`，保留 `--production-env-values-file <secure-values-env-fragment>`/);
assert.match(runbook, /按 intake 白名单合并并刷新 setup \/ intake verify latest/);
assert.match(runbook, /production-env-minimum-values-fragment\.template\.env\.example/);
assert.match(runbook, /production-env-values-fragment\.template\.env\.example/);
assert.match(runbook, /优先从 `production-env-minimum-values-fragment\.template\.env\.example` 复制当前最小 blocking 补值路径/);
assert.match(runbook, /片段先用 `run-v1-production-env-intake-apply --dry-run` 或第一阶段执行器的 `--production-env-values-dry-run` 预检/);
assert.match(runbook, /run-v1-production-env-values-dry-run-proof-check/);
assert.match(runbook, /默认 24 小时有效期/);
assert.match(runbook, /真实值片段指纹一致/);
assert.match(runbook, /真实值片段和目标安全 env 文件未在 dry-run 后改动/);
assert.match(runbook, /证明通过后才按 intake 白名单合并/);
assert.match(runbook, /先把 `production-env-minimum-values-fragment\.template\.env\.example` 复制成安全未跟踪片段/);
assert.match(runbook, /真实值可填入统一安全 env 文件，也可先填最小 blocking 安全真实值片段；片段先 dry-run 预检后再传给 `--production-env-values-file`/);
assert.match(runbook, /串联 env 文件审计、生产 env 真实值 intake 校验、生产 env 预检/);
assert.match(
  runbook,
  /node scripts\/run-v1-production-first-stage-closeout\.mjs --persistence-evidence-json \.erp-local-storage\/v1-production-persistence-evidence\/latest\.json --runtime-smoke-json \.erp-local-storage\/v1-production-runtime-smoke\/latest\.json --field-evidence-manifest <filled-field-evidence-manifest>/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-runtime-smoke\.mjs --use-production-env-setup-env-file --api-base-url https:\/\/<erp-host>\/api/,
);
assert.match(runbook, /node -- scripts\/run-v1-production-runtime-smoke\.mjs --use-production-env-setup-env-file/);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-runtime-smoke\.mjs --env-file <secure-env-file> --api-base-url https:\/\/<erp-host>\/api/,
);
assert.match(runbook, /备用：如需绕开 setup 报告，也可显式传入安全 env 文件/);
assert.match(runbook, /通过 ERP_V1_PRODUCTION_ENV_FILE 临时启动 ERP API/);
assert.match(runbook, /productionEnvFileApplication\.applied=true/);
assert.match(runbook, /仍要求真实服务 \/health 报告已应用安全生产 env 文件/);
assert.match(runbook, /ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> npm run api:dev/);
assert.match(runbook, /ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS=<secure-env-file> npm run api:dev/);
assert.match(runbook, /API 会先执行 env 文件安全审计，审计通过才把变量应用到当前进程/);
assert.match(runbook, /只用于页面 \/ 接口只读审计和应用预览，不会被启动加载器自动应用/);
assert.match(
  runbook,
  /node scripts\/run-v1-production-first-stage-evidence-suggestions\.mjs --persistence-evidence-json \.erp-local-storage\/v1-production-persistence-evidence\/latest\.json --runtime-smoke-json \.erp-local-storage\/v1-production-runtime-smoke\/latest\.json --evidence-csv \.erp-local-storage\/v1-field-evidence-intake\/evidence-items\.csv --output-dir \.erp-local-storage\/v1-production-first-stage-evidence-suggestions/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-env-preflight\.mjs --use-production-env-setup-env-file/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-postgres-preflight\.mjs --use-production-env-setup-env-file/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-postgres-backup-restore-check\.mjs --use-production-env-setup-env-file --allow-restore-reset/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest> --allow-restore-reset/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-object-storage-preflight\.mjs --use-production-env-setup-env-file/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-object-storage-governance-check\.mjs --use-production-env-setup-env-file/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-persistence-evidence\.mjs --use-production-env-setup-env-file/,
);
assert.match(
  runbook,
  /备用：只有需要绕开 production env setup 报告时，上述只读 \/ 诊断命令才显式传入 --env-file <secure-env-file>/,
);
assert.match(
  runbook,
  /node -- scripts\/run-v1-production-go-live-precheck\.mjs --use-production-env-setup-env-file --api-base-url https:\/\/<erp-host>\/api --operator-id <office-user> --driver-operator-id <driver-user>/,
);
assert.match(
  runbook,
  /备用：只有需要绕开 production env setup 报告时，组合预检才显式传入安全 env 文件/,
);
assert.match(runbook, /恢复验证必须使用专用可重置验证库/);
assert.match(runbook, /ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED` 常态保持 `false`/);
assert.match(runbook, /不要把 ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED 长期设为 true/);
assert.match(runbook, /bucket 版本控制 \/ 生命周期 \/ 服务端加密读回/);
assert.match(runbook, /独立 bucket 治理检查（版本控制 \/ 生命周期 \/ 服务端加密 \/ policy 可读性）/);
assert.match(runbook, /第一阶段现场证据建议/);
assert.match(runbook, /suggested-evidence-items\.csv/);
assert.match(runbook, /不能自动刷新 release candidate/);
assert.match(runbook, /node -- scripts\/run-v1-production-env-file-audit\.mjs --env-file <secure-env-file>/);
assert.match(runbook, /node scripts\/run-print-v1-readiness-check\.mjs --api-base-url https:\/\/<erp-host>\/api --operator-id <office-user> --json > \.erp-local-storage\/v1-print-readiness\/latest\.json/);
assert.match(runbook, /node scripts\/run-v1-print-chain-closeout\.mjs --print-readiness-json \.erp-local-storage\/v1-print-readiness\/latest\.json --field-evidence-manifest <filled-field-evidence-manifest>/);
assert.match(runbook, /打印阶段 closeout/);
assert.match(
  runbook,
  /node -- scripts\/run-v1-driver-real-device-execution\.mjs --api-base-url https:\/\/<erp-host>\/api --driver-operator-id <driver-user> --field-evidence-manifest <filled-field-evidence-manifest>/,
);
assert.match(runbook, /司机真机阶段执行器/);
assert.match(runbook, /生产 env 准备报告/);
assert.match(runbook, /--use-production-env-setup-env-file/);
assert.match(runbook, /node -- scripts\/run-v1-release-candidate-check\.mjs/);
assert.match(runbook, /--field-evidence-manifest <filled-field-evidence-manifest>/);
assert.match(runbook, /node scripts\/run-v1-go-live-suite\.mjs/);
assert.match(runbook, /--field-evidence-intake-csv \.erp-local-storage\/v1-field-evidence-intake\/evidence-items\.csv/);
assert.match(runbook, /--field-evidence-draft-output <filled-field-evidence-manifest-draft>/);
assert.match(runbook, /--refresh-release-candidate/);
assert.match(runbook, /最终发布判断必须刷新 release-candidate/);
assert.match(runbook, /node scripts\/run-v1-onsite-task-board\.mjs/);
assert.match(runbook, /node scripts\/run-v1-completion-snapshot\.mjs/);
assert.match(runbook, /node scripts\/run-v1-field-evidence-intake-pack\.mjs/);
assert.match(runbook, /node scripts\/apply-v1-field-evidence-intake\.mjs/);
assert.match(runbook, /node scripts\/run-v1-owner-decision-brief\.mjs/);
assert.match(runbook, /node scripts\/run-v1-go-live-handoff-pack\.mjs/);
assert.match(runbook, /V1 与 V2 边界/);
assert.match(runbook, /禁止误判/);
assertNoSensitiveOutput(envTemplate + runbook + syntaxRun.stdout + writeRun.stdout);

console.log("V1 production env template check passed: generator, checked-in files, required variables, runbook, and redaction are covered.");

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("env template generator timed out after 10000ms"));
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
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(output, pattern, `output matched forbidden sensitive pattern ${pattern}`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
