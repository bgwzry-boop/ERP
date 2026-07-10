#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const defaultEnvPath = join("docs", "development", "v1-production.env.example");
const defaultRunbookPath = join("docs", "development", "v1-go-live-runbook.zh-CN.md");

const envSections = [
  {
    title: "V1 production profile",
    lines: [
      "ERP_RUNTIME_MODE=production",
      "ERP_V1_PERSISTENCE_PROFILE=postgres",
      "ERP_V1_DATABASE_URL=<REPLACE_WITH_POSTGRES_CONNECTION_URL>",
      "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    ],
  },
  {
    title: "API authentication and transport boundary",
    lines: [
      "Strict mode is required for production. Use a high-entropy secret kept only in this secure env file.",
      "ERP_AUTH_MODE=strict",
      "ERP_AUTH_SECRET=<REPLACE_WITH_HIGH_ENTROPY_AUTH_SECRET>",
      "ERP_CORS_ALLOWED_ORIGINS=https://<REPLACE_WITH_ERP_WEB_HOST>",
      "ERP_API_MAX_JSON_BODY_BYTES=25165824",
      "VITE_ERP_RUNTIME_MODE=production",
    ],
  },
  {
    title: "PostgreSQL restore validation",
    lines: [
      "Restore validation database must use a different host/port/database from ERP_V1_DATABASE_URL.",
      "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=<REPLACE_WITH_DEDICATED_RESTORE_VALIDATION_DATABASE_URL>",
      "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    ],
  },
  {
    title: "Attachment object storage",
    lines: [
      "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER=s3_compatible",
      "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_OBJECT_STORAGE_ENDPOINT>",
      "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=<REPLACE_WITH_ATTACHMENT_BUCKET>",
      "ERP_ATTACHMENT_OBJECT_STORAGE_REGION=<REPLACE_WITH_REGION>",
      "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=<REPLACE_WITH_ACCESS_KEY_ID>",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<REPLACE_WITH_SECRET_ACCESS_KEY>",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN=<OPTIONAL_SESSION_TOKEN>",
      "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX=erp-v1/attachments",
      "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED=false",
      "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF=",
    ],
  },
  {
    title: "Statement export object storage",
    lines: [
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_OBJECT_STORAGE_ENDPOINT>",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET=<REPLACE_WITH_STATEMENT_EXPORT_BUCKET>",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION=<REPLACE_WITH_REGION>",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID=<REPLACE_WITH_ACCESS_KEY_ID>",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<REPLACE_WITH_SECRET_ACCESS_KEY>",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX=erp-v1/statement-exports",
    ],
  },
  {
    title: "System printer command bridge",
    lines: [
      "ERP_SYSTEM_PRINTER_ENABLED=true",
      "ERP_SYSTEM_PRINTER_ADAPTER=command_bridge",
      "ERP_SYSTEM_PRINTER_COMMAND=<REPLACE_WITH_NODE_OR_BRIDGE_COMMAND>",
      "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON=[\"scripts/print-command-bridge.mjs\",\"--print-job-id\",\"{printJobId}\",\"--print-device-id\",\"{printDeviceId}\",\"--print-device-name\",\"{printDeviceName}\"]",
      "ERP_SYSTEM_PRINTER_ALLOWLIST=PRN-LABEL-A,PRN-DOT-A",
      "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=<REPLACE_WITH_SECURE_SPOOL_DIR>",
    ],
  },
  {
    title: "CUPS non-printing preflight",
    lines: [
      "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=标签机A,针式打印机A",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER=标签机A",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=<REPLACE_WITH_LPSTAT_COMMAND>",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON=[\"-p\",\"{cupsPrinterName}\"]",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS=5000",
    ],
  },
  {
    title: "Readiness and field acceptance",
    lines: [
      "ERP_V1_READINESS_API_BASE_URL=https://<REPLACE_WITH_ERP_HOST>/api",
      "ERP_V1_READINESS_OPERATOR_ID=<REPLACE_WITH_OFFICE_VALIDATION_USER_ID>",
      "ERP_V1_READINESS_DRIVER_OPERATOR_ID=<REPLACE_WITH_DRIVER_VALIDATION_USER_ID>",
      "ERP_V1_READINESS_TOKEN=<OPTIONAL_OFFICE_BEARER_TOKEN>",
      "ERP_V1_READINESS_DRIVER_TOKEN=<OPTIONAL_DRIVER_BEARER_TOKEN>",
      "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL=https://<REPLACE_WITH_ERP_HOST>/api",
      "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR=.erp-local-storage/v1-field-acceptance",
      "ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID=<REPLACE_WITH_OFFICE_VALIDATION_USER_ID>",
      "ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID=<REPLACE_WITH_DRIVER_VALIDATION_USER_ID>",
      "ERP_V1_FIELD_EVIDENCE_MANIFEST=<REPLACE_WITH_FILLED_FIELD_EVIDENCE_MANIFEST_PATH>",
      "ERP_V1_RELEASE_API_BASE_URL=https://<REPLACE_WITH_ERP_HOST>/api",
      "ERP_V1_RELEASE_CANDIDATE_OUTPUT_DIR=.erp-local-storage/v1-release-candidate",
      "ERP_V1_RELEASE_OPERATOR_ID=<REPLACE_WITH_OFFICE_VALIDATION_USER_ID>",
      "ERP_V1_RELEASE_DRIVER_OPERATOR_ID=<REPLACE_WITH_DRIVER_VALIDATION_USER_ID>",
    ],
  },
  {
    title: "Local V1 bypass flags, keep disabled unless signed",
    lines: [
      "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED=false",
      "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF=",
    ],
  },
];

const requiredPreflightVariables = [
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
];

try {
  const options = parseArgs(process.argv.slice(2));
  const envText = buildEnvTemplate();
  const runbookText = buildRunbook();
  if (options.write) {
    writeText(options.outputEnv, envText);
    writeText(options.outputRunbook, runbookText);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(buildSummary(options), null, 2)}\n`);
  } else if (options.runbook) {
    process.stdout.write(runbookText);
  } else {
    process.stdout.write(envText);
  }
} catch (error) {
  process.stderr.write(`V1 production env template generation failed: ${error?.message || error}\n`);
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    outputEnv: defaultEnvPath,
    outputRunbook: defaultRunbookPath,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--runbook") {
      options.runbook = true;
      continue;
    }
    if (arg === "--output-env") {
      options.outputEnv = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-runbook") {
      options.outputRunbook = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/generate-v1-production-env-template.mjs [options]",
    "",
    "Options:",
    "  --write                 Write env template and runbook files.",
    "  --output-env <path>     Env template path, default docs/development/v1-production.env.example",
    "  --output-runbook <path> Runbook path, default docs/development/v1-go-live-runbook.zh-CN.md",
    "  --runbook               Print the runbook instead of the env template.",
    "  --json                  Print a summary instead of template text.",
  ].join("\n");
}

function buildEnvTemplate() {
  const lines = [
    "# ERP V1 production environment template",
    "# Last generated: 2026-07-10",
    "#",
    "# Copy this file to a secure, untracked env file before editing.",
    "# You can create that secure draft with:",
    "#   node -- scripts/run-v1-production-env-setup.mjs --target <your-secure-env-file>",
    "# If real values were prepared in another safe env file, import them into the secure draft with:",
    "#   node -- scripts/run-v1-production-env-setup.mjs --import-from <filled-secure-env-file> --target <your-secure-env-file> --force",
    "# Keep real connection strings, object-storage secrets, command paths, and spool paths out of git.",
    "# After replacing every <REPLACE_WITH_...> value, audit the env file and run preflight through the setup report:",
    "#   node -- scripts/run-v1-production-env-file-audit.mjs --env-file <your-secure-env-file>",
    "#   node -- scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
    "# The preflight output includes a redacted fix checklist with owner roles, missing variable names, and next actions.",
    "# For API startup, set ERP_V1_PRODUCTION_ENV_FILE=<your-secure-env-file> and restart the API.",
    "# Use ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS only for read-only audit / preview diagnostics.",
    "",
  ];
  for (const section of envSections) {
    lines.push(`# ${section.title}`);
    for (const line of section.lines) lines.push(`# ${line}`);
    lines.push("");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function buildRunbook() {
  const lines = [
    "# ERP V1 发布前执行清单",
    "",
    "最后更新：2026-07-09",
    "",
    "## 使用方式",
    "",
    "1. 推荐先运行 `run-v1-production-env-setup` 生成安全 env 草稿；也可以手工复制 `docs/development/v1-production.env.example` 到安全的、不会提交到 git 的环境文件。",
    "2. 在安全 env 文件中填写真实 PostgreSQL、对象存储、打印桥、CUPS、生产 API 严格认证密钥 / CORS 来源、验收账号和现场证据 manifest 路径；不要把真实连接串、密钥、命令路径或 spool 路径写入文档。",
    "3. 如果真实值先填在另一份安全 env 文件里，可用 `run-v1-production-env-setup --import-from <filled-secure-env-file> --target <secure-env-file> --force` 导入到统一安全草稿；导入前会审计来源 env，target 已存在时必须显式 `--force`。",
    "4. 如果真实值只放在一个较小的安全 env 片段中，优先从 `production-env-minimum-values-fragment.template.env.example` 复制当前最小 blocking 补值路径；站点已经固定使用 `DATABASE_URL` / `PGURL` 别名，或要补 warning / optional fallback 时，再使用完整 `production-env-values-fragment.template.env.example`。片段先用 `run-v1-production-env-intake-apply --dry-run` 或第一阶段执行器的 `--production-env-values-dry-run` 预检白名单、任选别名和安全固定值；dry-run 会在内存中给出预计生产 env 变量预检、全量 intake 覆盖、最小 blocking 补值覆盖和建议 / 可选补值覆盖结果，不写目标 env，也不产生含真实值副本。正式合并入口会先运行 `run-v1-production-env-values-dry-run-proof-check`，要求最近 dry-run 证明有效、目标来源一致、真实值片段指纹一致，且真实值片段和目标 env 在 dry-run 后未修改；确认无阻塞后，再在第一阶段执行器里去掉 `--production-env-values-dry-run`，保留 `--production-env-values-file <secure-values-env-fragment>`，由执行器先检查 dry-run 证明、再调用 intake 白名单合并，并继续 env 审计、真实值校验和后续阶段。",
    "5. 准备器会把真实值字段留空、保留少量安全默认值，并把文件权限收窄到 `0600`；导入模式只复制到安全 target，报告仍不输出真实值；同时输出 `production-env-fix-checklist.zh-CN.md`、`production-env-fix-checklist.csv`、`production-env-real-value-intake.csv`、`production-env-minimum-values-fragment.template.env.example`、`production-env-values-fragment.template.env.example` 和 `production-env-fill-template.env.example` 供现场按变量名填写；最小片段只含当前 blocking 最短补值路径，全量片段保留 warning / optional fallback 和全部白名单变量；它只代表 env 文件已可安全填写，不代表生产变量已通过。",
    "6. 预检会把未替换的 `<REPLACE_WITH_...>` / `<OPTIONAL_...>` 占位值按未配置处理；不要只取消注释模板行。",
    "7. 先跑生产 env 文件安全审计，确认真实 env 文件未被 git 跟踪、不是模板文件、没有未替换占位值；再跑生产环境变量预检，按输出里的 `fixChecklist` / `Fix checklist` 分派修正项；发布候选检查在传入 `--env-file` 时也会重新执行 env 文件安全审计，审计不通过时即使变量预检全项通过也仍然 blocked。",
    "8. API 启动时如需真正应用该安全 env 文件，配置 `ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file>` 后通过 `npm run api:production` 启动；安全 env 必须含 `ERP_RUNTIME_MODE=production`、`ERP_AUTH_MODE=strict` 和非空 `ERP_AUTH_SECRET`。生产 Web 构建会强制后端模式，`VITE_ERP_RUNTIME_MODE=production` 继续作为显式部署标记。API 会先执行 env 文件安全审计，审计通过才把变量应用到当前进程。`ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS` 只用于页面 / 接口只读审计和应用预览，不会被启动加载器自动应用。",
    "9. 生产上线组合预检会合并 env 文件审计、env 变量预检、当前 API V1 readiness 和当前 API 生产 profile 确认；即使实验室配置能让底层 readiness 到 `11/11`，只要当前 API 仍靠本地持久化 / 本地文件留档接受旁路通过，组合预检仍必须 blocked。",
    "10. 本地 Node 24 会把 `--env-file` 识别为 Node 自身参数；现场执行带 `--env-file` 的脚本时统一使用 `node -- scripts/... --env-file <secure-env-file>`。",
    "",
    "## 命令顺序",
    "",
    "```bash",
    "# 先生成安全 env 草稿和生产 env 修正清单 / 填写骨架；该命令不会写真实值，生成后仍必须人工填写并通过预检：",
    "node -- scripts/run-v1-production-env-setup.mjs --target <secure-env-file>",
    "# 如果真实值已经在另一份安全 env 文件中，先审计来源并导入到统一安全草稿；target 已存在时必须显式 --force：",
    "node -- scripts/run-v1-production-env-setup.mjs --import-from <filled-secure-env-file> --target <secure-env-file> --force",
    "# 如果真实值只在独立安全 env 片段里，优先复制 production-env-minimum-values-fragment.template.env.example 成安全片段，再 dry-run 预检白名单、任选别名、安全固定值、预计预检结果和最小补值覆盖；该命令不写入目标 env，也不产生含真实值副本：",
    "node -- scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-values-env-fragment> --use-production-env-setup-env-file --intake-csv .erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv --dry-run",
    "# 也可以通过第一阶段执行器做同一个真实值片段 dry-run；它只跑白名单合并预检，不写目标 env，也不会继续跑后续第一阶段：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 推荐先用第一阶段执行器串联 env 审计、真实值 intake 校验、env 预检、迁移计划、PostgreSQL / 对象存储 live 留证、runtime smoke、现场证据建议和 closeout；默认不执行迁移 --apply：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 如果真实值只在独立安全 env 片段里，可让第一阶段执行器先校验最近 dry-run 证明，再按 intake 白名单合并到 setup 安全草稿，并继续执行：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 备用：只有需要绕开 production env setup 报告时，才显式传入安全 env 文件：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --env-file <secure-env-file> --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 备用：显式 env 文件同样可带真实值片段合并；该模式要求只解析到一个目标 env 文件：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --env-file <secure-env-file> --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 如果生产库尚未迁移，必须先确认备份窗口和负责人，再显式加 --apply-migrations：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest> --apply-migrations",
    "# 备用：只有绕开 setup 报告时才显式传入安全 env 文件后执行迁移：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --env-file <secure-env-file> --field-evidence-manifest <filled-field-evidence-manifest> --apply-migrations",
    "# 如需拆分执行，可按下面顺序逐项留证：",
    "node -- scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
    "node -- scripts/run-v1-production-env-intake-verify.mjs --use-production-env-setup-env-file --intake-csv .erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv",
    "# 备用：只有需要绕开 production env setup 报告时，真实值 intake 校验才显式传入安全 env 文件：",
    "node -- scripts/run-v1-production-env-intake-verify.mjs --env-file <secure-env-file> --intake-csv .erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv",
    "node -- scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
    "node -- scripts/run-db-migrations.mjs --env-file <secure-env-file> --apply",
    "node -- scripts/run-v1-production-postgres-preflight.mjs --use-production-env-setup-env-file",
    "# 专用恢复验证库确认后再运行；恢复库必须和生产源库使用不同 host/port/database。该命令只读生产库，但会重置恢复验证库 public schema：",
    "node -- scripts/run-v1-production-postgres-backup-restore-check.mjs --use-production-env-setup-env-file --allow-restore-reset",
    "# 如需在第一阶段执行器内完成恢复验证库重置 / 恢复抽样，负责人确认后显式加 --allow-restore-reset；不要把 ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED 长期设为 true：",
    "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest> --allow-restore-reset",
    "node -- scripts/run-v1-production-object-storage-preflight.mjs --use-production-env-setup-env-file",
    "node -- scripts/run-v1-production-object-storage-governance-check.mjs --use-production-env-setup-env-file",
    "# 汇总生产 env / PostgreSQL / 对象存储首阶段脱敏留证；该命令不执行迁移 --apply：",
    "node -- scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file",
    "# 备用：只有需要绕开 production env setup 报告时，上述只读 / 诊断命令才显式传入 --env-file <secure-env-file>。",
    "# 用 production env setup 报告中的同一份安全 env，通过 ERP_V1_PRODUCTION_ENV_FILE 临时启动 ERP API，读回 /health 的 productionEnvFileApplication.applied=true 和 /system/v1-readiness，确认运行态已进入 PostgreSQL / 对象存储 profile；检查结束会停止该 API：",
    "node -- scripts/run-v1-production-runtime-smoke.mjs --use-production-env-setup-env-file",
    "# 生产 API 已由进程守护 / 反向代理长驻启动后，复用 runtime smoke 检查真实服务 URL；该模式不启动临时 API，但仍要求真实服务 /health 报告已应用安全生产 env 文件：",
    "node -- scripts/run-v1-production-runtime-smoke.mjs --use-production-env-setup-env-file --api-base-url https://<erp-host>/api",
    "# 备用：如需绕开 setup 报告，也可显式传入安全 env 文件：",
    "node -- scripts/run-v1-production-runtime-smoke.mjs --env-file <secure-env-file> --api-base-url https://<erp-host>/api",
    "# 生产 API 长驻启动时要让进程真正应用同一份 env 文件；该变量会在 API 启动时审计通过后应用，不要使用 AUDIT_PATHS 代替：",
    "ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> npm run api:dev",
    "# 只读审计 / 文件应用预览入口可额外配置 AUDIT_PATHS；它不会改变当前 API 进程 env：",
    "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS=<secure-env-file> npm run api:dev",
    "# 根据持久化留证和 runtime smoke 生成第一阶段现场证据回填建议；该建议必须负责人复核后再 apply，不会自动改源 CSV 或 manifest：",
    "node scripts/run-v1-production-first-stage-evidence-suggestions.mjs --persistence-evidence-json .erp-local-storage/v1-production-persistence-evidence/latest.json --runtime-smoke-json .erp-local-storage/v1-production-runtime-smoke/latest.json --evidence-csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --output-dir .erp-local-storage/v1-production-first-stage-evidence-suggestions",
    "# 汇总持久化留证和 runtime smoke 两份 latest，判断第一阶段生产环境 / 持久化是否可交给负责人签收：",
    "node scripts/run-v1-production-first-stage-closeout.mjs --persistence-evidence-json .erp-local-storage/v1-production-persistence-evidence/latest.json --runtime-smoke-json .erp-local-storage/v1-production-runtime-smoke/latest.json --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 保存打印 readiness JSON。该命令只读取 API 打印门禁，不直接出纸；真实样张出纸、扫码和对位证据仍要填入现场证据 manifest：",
    "mkdir -p .erp-local-storage/v1-print-readiness",
    "node scripts/run-print-v1-readiness-check.mjs --api-base-url https://<erp-host>/api --operator-id <office-user> --json > .erp-local-storage/v1-print-readiness/latest.json",
    "# 汇总打印 readiness 和 print_hardware 现场证据，判断真实打印链路是否可交给办公室 / 仓库负责人签收：",
    "node scripts/run-v1-print-chain-closeout.mjs --print-readiness-json .erp-local-storage/v1-print-readiness/latest.json --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 真实司机手机 / 原生壳现场验收后，保存司机 readiness 并汇总 driver_native_device 现场证据：",
    "node -- scripts/run-v1-driver-real-device-execution.mjs --api-base-url https://<erp-host>/api --driver-operator-id <driver-user> --field-evidence-manifest <filled-field-evidence-manifest>",
    "# 用 <secure-env-file> 启动 / 重启 ERP API 后，先跑组合预检；该预检只读，不应用 env、不刷新候选、不出纸：",
    "node -- scripts/run-v1-production-go-live-precheck.mjs --use-production-env-setup-env-file --api-base-url https://<erp-host>/api --operator-id <office-user> --driver-operator-id <driver-user>",
    "# 备用：只有需要绕开 production env setup 报告时，组合预检才显式传入安全 env 文件：",
    "node -- scripts/run-v1-production-go-live-precheck.mjs --env-file <secure-env-file> --api-base-url https://<erp-host>/api --operator-id <office-user> --driver-operator-id <driver-user>",
    "# 如需单独保存完整 runtime readiness 明细，可继续运行底层 runner：",
    "node scripts/run-v1-readiness-check.mjs --api-base-url https://<erp-host>/api --operator-id <office-user> --driver-operator-id <driver-user>",
    "node scripts/run-v1-field-acceptance-report.mjs --api-base-url https://<erp-host>/api --output-dir .erp-local-storage/v1-field-acceptance",
    "node scripts/validate-v1-field-evidence-manifest.mjs --manifest <filled-field-evidence-manifest>",
    "node -- scripts/run-v1-release-candidate-check.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest> --api-base-url https://<erp-host>/api",
    "# 备用：只有需要绕开 production env setup 报告刷新 release-candidate 时，才改用 --env-file <secure-env-file>。",
    "# 一键生成现场任务、完成度快照、负责人摘要、证据采集包、最小解除阻塞清单和上线交接包：",
    "node scripts/run-v1-go-live-suite.mjs --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --release-candidate-markdown .erp-local-storage/v1-release-candidate/latest.md --field-evidence-manifest <filled-field-evidence-manifest> --output-root .erp-local-storage/v1-go-live-suite --sync-canonical-latest",
    "# 如果现场负责人已经填写 evidence-items.csv 和 signoff-boundary.csv，可由 suite 先生成 draft manifest，再基于 draft 生成交接材料：",
    "node scripts/run-v1-go-live-suite.mjs --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --release-candidate-markdown .erp-local-storage/v1-release-candidate/latest.md --field-evidence-manifest <current-field-evidence-manifest> --field-evidence-intake-csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --field-evidence-signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv --field-evidence-draft-output <filled-field-evidence-manifest-draft> --output-root .erp-local-storage/v1-go-live-suite --sync-canonical-latest",
    "# 最终发布判断必须刷新 release-candidate，让门禁读取 CSV draft 后的最新证据、签字和 V1/V2 边界确认：",
    "node -- scripts/run-v1-go-live-suite.mjs --refresh-release-candidate --use-production-env-setup-env-file --api-base-url https://<erp-host>/api --operator-id <office-user> --driver-operator-id <driver-user> --field-evidence-manifest <current-field-evidence-manifest> --field-evidence-intake-csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --field-evidence-signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv --field-evidence-draft-output <filled-field-evidence-manifest-draft> --output-root .erp-local-storage/v1-go-live-suite --sync-canonical-latest",
    "# 备用：只有需要绕开 production env setup 报告刷新 release-candidate 时，才把上条命令改成 --env-file <secure-env-file>。",
    "node scripts/run-v1-onsite-task-board.mjs --field-evidence-manifest <filled-field-evidence-manifest> --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --output-dir .erp-local-storage/v1-onsite-task-board",
    "node scripts/run-v1-completion-snapshot.mjs --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --onsite-task-board-json .erp-local-storage/v1-onsite-task-board/latest.json --output-dir .erp-local-storage/v1-completion-snapshot",
    "node scripts/run-v1-field-evidence-intake-pack.mjs --manifest <filled-field-evidence-manifest> --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --onsite-task-board-json .erp-local-storage/v1-onsite-task-board/latest.json --completion-snapshot-json .erp-local-storage/v1-completion-snapshot/latest.json --output-dir .erp-local-storage/v1-field-evidence-intake",
    "# 现场负责人填完 .erp-local-storage/v1-field-evidence-intake/evidence-items.csv 和 signoff-boundary.csv 后，可生成新的 manifest 草稿：",
    "node scripts/apply-v1-field-evidence-intake.mjs --manifest <current-field-evidence-manifest> --csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv --output <filled-field-evidence-manifest-draft>",
    "node scripts/run-v1-owner-decision-brief.mjs --completion-snapshot-json .erp-local-storage/v1-completion-snapshot/latest.json --output-dir .erp-local-storage/v1-owner-decision-brief",
    "node scripts/run-v1-go-live-handoff-pack.mjs --field-evidence-manifest <filled-field-evidence-manifest> --output-dir .erp-local-storage/v1-go-live-handoff",
    "```",
    "",
    "## 必须留档",
    "",
    "- PostgreSQL：`run-v1-production-postgres-preflight --use-production-env-setup-env-file` 脱敏预检输出、`run-v1-production-postgres-backup-restore-check --use-production-env-setup-env-file --allow-restore-reset` 恢复验证输出、连接池 / 备份 / 恢复 / 权限负责人确认；`run-db-migrations --env-file <secure-env-file> --apply` 仍作为明确写入生产库的迁移执行记录保留显式安全 env 文件。恢复验证必须使用专用可重置验证库，不得和生产源库指向同一 host/port/database；安全生产 env 中 `ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED` 常态保持 `false`，只在计划内恢复验证命令上显式授权。",
    "- 生产 env 准备报告：`run-v1-production-env-setup` 生成、复核或从另一份已填写安全 env 导入统一安全 env 草稿，确认目标路径被 git 忽略或在工作区外、文件权限为 `0600`、来源 env 审计通过、真实值字段未写入报告；该报告不代表 PostgreSQL / 对象存储已连通。",
    "- 生产 env 文件：保留 env 文件安全审计 JSON / Markdown 摘要；审计输出只使用 `env 文件 1/2` 标签，不保留绝对路径、工作区相对路径、文件名或存储根目录；真实值只在安全未跟踪 env 文件内，不进入交接包、截图或 git。",
    "- 生产环境修正清单 / env 填写草稿：优先读取 `.erp-local-storage/v1-production-env-setup/production-env-fix-checklist.zh-CN.md`、`.csv`、`production-env-real-value-intake.csv`、`production-env-minimum-values-fragment.template.env.example`、`production-env-values-fragment.template.env.example` 和 `production-env-fill-template.env.example`；同步 handoff 后也可读取 `.erp-local-storage/v1-go-live-handoff/production-env-fix-checklist.zh-CN.md`、`.csv`、`production-env-real-value-intake.csv`、`production-env-minimum-values-fragment.template.env.example`、`production-env-values-fragment.template.env.example` 和 `production-env-fill-template.env.example`。先把 `production-env-minimum-values-fragment.template.env.example` 复制成安全未跟踪片段，填当前最小 blocking 补值路径；站点使用别名或要补 warning / optional fallback 时再用完整 `production-env-values-fragment.template.env.example`。片段先用 `run-v1-production-env-intake-apply --dry-run` 或第一阶段执行器 `--production-env-values-dry-run` 预检，不写目标 env；dry-run 报告会给出预计生产 env 变量预检、全量 intake 覆盖、最小 blocking 补值覆盖和建议 / 可选补值覆盖结果，但不输出真实值、不输出路径、不写含真实值副本；正式合并前第一阶段执行器会先检查 dry-run 证明是否仍在默认 24 小时有效期内、是否与当前目标来源一致、真实值片段指纹是否一致、真实值片段和目标 env 是否在 dry-run 后未修改，全部通过后才会调用白名单合并；只把真实值填入安全 env 文件或安全真实值片段。",
    "- 对象存储：`run-v1-production-object-storage-preflight --use-production-env-setup-env-file` 脱敏 live 输出、附件上传 / 读回 / 签名 URL、对账导出写入 / 重下载 / 清理诊断；`run-v1-production-object-storage-governance-check --use-production-env-setup-env-file` 脱敏 bucket 治理输出、bucket 版本控制 / 生命周期 / 服务端加密读回、bucket policy 可读性 warning、访问审计、控制台截图和备份策略负责人确认。",
    "- 生产 env 真实值 intake 校验：`run-v1-production-env-intake-verify` 优先用 `--use-production-env-setup-env-file` 复用 production env setup 报告中的安全 env 文件，并对照 `production-env-real-value-intake.csv` 确认真实值变量、任选别名组、安全固定值以及 `filled` / `verified` / `evidenceRef` 回填状态；只有绕开 setup 报告时才显式传入 `--env-file <secure-env-file>`。它只输出变量名、计数、状态和下一步，不输出真实 env 值、路径、连接串、bucket、secret、spool 路径或证据原文。",
    "- 第一阶段执行器：`run-v1-production-first-stage-execution` 串联 env 文件审计、生产 env 真实值 intake 校验、生产 env 预检、迁移计划 / 显式迁移执行、持久化留证、runtime smoke、第一阶段现场证据建议和 closeout；默认不执行迁移 `--apply`，只有传 `--apply-migrations` 才会调用生产迁移；恢复验证库重置同样必须显式传 `--allow-restore-reset`，不要依赖长期 env true；可用 `--use-production-env-setup-env-file` 复用生产 env setup 报告中的安全 env 文件，也可显式传 `--env-file <secure-env-file>`；如果真实值先放在独立安全 env 片段，可先加 `--production-env-values-dry-run`，让执行器只跑白名单合并 dry-run 并停止，确认白名单、任选别名、安全固定值、预计生产 env 预检和最小补值覆盖无阻塞后，再去掉该参数、保留 `--production-env-values-file <secure-values-env-fragment>` 正式合并；正式合并会先执行 `run-v1-production-env-values-dry-run-proof-check`，要求 latest dry-run 报告 ready、默认 24 小时内有效、setup 目标来源一致、真实值片段指纹一致、真实值片段和目标安全 env 文件未在 dry-run 后改动，证明通过后才按 intake 白名单合并并刷新 setup / intake verify latest，再继续执行后续阶段；现场证据 manifest 可通过 `--field-evidence-manifest` 显式传入，也可由安全 env 文件中的 `ERP_V1_FIELD_EVIDENCE_MANIFEST` 提供；证据建议只生成待复核 CSV，不自动应用、不自动签收。",
    "- 生产持久化首阶段留证：`run-v1-production-persistence-evidence --use-production-env-setup-env-file` 汇总 env 文件安全审计、生产持久化 env 子集、迁移计划、PostgreSQL 结构 / 权限预检、PostgreSQL 备份 / 恢复抽样验证、对象存储 live 预检和独立 bucket 治理检查（版本控制 / 生命周期 / 服务端加密 / policy 可读性）；它不执行迁移 `--apply`，不替代现场备份策略负责人确认、恢复演练工单 / 截图、对象存储控制台截图、访问审计或真实业务附件样本；只有需要绕开 setup 报告时才显式传入 `--env-file <secure-env-file>`。",
    "- 生产 API 运行态 smoke：`run-v1-production-runtime-smoke` 可用 `--use-production-env-setup-env-file` 复用生产 env setup 报告中的安全 env 文件，也可显式传 `--env-file <secure-env-file>`；脚本通过 `ERP_V1_PRODUCTION_ENV_FILE` 临时启动 API，或在传入 `--api-base-url https://<erp-host>/api` 时检查已经长驻运行的生产 API。两种模式都只执行 GET 探针，并要求 `/api/health.seed.productionEnvFileApplication.applied=true`、`/api/health` 和 `/api/system/v1-readiness` 显示 PostgreSQL repository profile、附件对象存储、对账导出对象存储和系统 V1 持久化门禁，不替代打印、司机真机或业务试跑。",
    "- 第一阶段现场证据建议：`run-v1-production-first-stage-evidence-suggestions` 读取持久化留证和 runtime smoke，生成 `suggested-evidence-items.csv`，只建议自动化报告可支撑的 `production_persistence` / `object_storage` 回填项；备份策略负责人、bucket 备份策略 / 控制台证据和访问审计仍必须人工补齐。建议 CSV 不能替代负责人复核、不能自动刷新 release candidate，也不能声明 V1 完成。",
    "- 第一阶段 closeout：`run-v1-production-first-stage-closeout` 读取持久化首阶段留证、runtime smoke 和已填写现场证据 manifest，检查自动化证据 ready、时效、安全护栏，以及 `production_persistence` / `object_storage` 两组证据后生成第一阶段签收结论；它不连接外部服务，不声明 V1 全部完成，只用于生产环境 / 持久化阶段交接。",
    "- 打印阶段 closeout：`run-v1-print-chain-closeout` 读取已保存的打印 readiness JSON 和已填写的 `print_hardware` 现场证据组，检查 CUPS 非打印预检、标签 / 针式样张、纸张对位、条码扫码、spool 或驱动回写、作废重打和脱敏护栏；它不调用 API、CUPS 或打印机，也不声明 V1 全部完成，只用于真实打印链路阶段签收。",
    "- 司机真机阶段执行器：`run-v1-driver-real-device-execution` 读取运行中 API 的司机 V1 readiness 并保存 latest，再运行司机真机 closeout 汇总 `driver_native_device` 现场证据；它不请求相机 / 定位权限、不打开导航、不调用原生桥、不上传照片、不改司机送货状态，也不声明 V1 全部完成。",
    "- 标签机 / 针式机：CUPS 队列预检、样张出纸、纸张对位、条码扫码、spool 或驱动回写、作废重打和现场签认。",
    "- 司机真机：真实手机相机权限、水印拍照、纸质包裹标签原生扫码、定位、上传兜底、地图导航和司机签认。",
    "- 业务试运行：办公室、仓库、车间、司机、财务各自确认真实样本无阻塞。",
    "- 现场证据清单：复制 `docs/development/v1-field-evidence-manifest.template.json`，填写证据编号和签字后通过 manifest 校验。",
    "- Go-live suite：生成 `.erp-local-storage/v1-go-live-suite/`，汇总发布候选、现场任务、完成度快照、负责人摘要、证据采集包、最小解除阻塞清单和交接包；带 `--sync-canonical-latest` 时会同步刷新顶层 latest 目录，避免不同入口状态不一致。",
    "- 生产环境修正清单 / env 填写草稿：同步后读取 `.erp-local-storage/v1-go-live-handoff/production-env-fix-checklist.zh-CN.md`、`.csv`、`production-env-real-value-intake.csv`、`production-env-minimum-values-fragment.template.env.example`、`production-env-values-fragment.template.env.example` 和 `production-env-fill-template.env.example`；真实值可填入统一安全 env 文件，也可先填最小 blocking 安全真实值片段；片段先 dry-run 预检后再传给 `--production-env-values-file`。",
    "- 最小解除阻塞清单：先读 `.erp-local-storage/v1-go-live-suite/v1-unblock-plan.zh-CN.md`；如果已经同步顶层 latest，也可以直接读 `.erp-local-storage/v1-go-live-handoff/v1-unblock-plan.latest.zh-CN.md`。按生产环境 / 持久化、真实打印、司机真机、真实业务试跑、安全运维 / 签字 / V1-V2 边界的顺序处理；该清单只排序 blocker，不代表任何 pending 证据已通过。",
    "- 现场证据采集包：生成 `.erp-local-storage/v1-field-evidence-intake/`，把 6 个证据组、`intake-rules.zh-CN.md`、`evidence-items.csv`、`signoff-boundary.csv`、签字和 V1/V2 边界确认单分发给现场负责人；先看规则文件再填写 CSV。",
    "- 负责人决策摘要：生成 `.erp-local-storage/v1-owner-decision-brief/`，直接说明当前是否可以宣布 V1 完成、已完成 / 未完成项和 V2 差异。",
    "",
    "## V1 与 V2 边界",
    "",
    "- V1：核心 ERP 闭环、人工确认、生产级持久化、真实打印、司机真机、对象存储和现场 QA。",
    "- V2：企业微信自动化、AI/OCR、路线 / 排产优化、原材料成本毛利、售后工资和 BI 深化。",
    "",
    "## 禁止误判",
    "",
    "- 本地 `local_memory` / `local_json` / `local_fs` 不能默认算 V1 生产就绪。",
    "- fake CUPS、自动化 QA 样本和实验室 `11/11` 不能替代真实现场验收。",
    "- 生成报告不等于上线批准；只有发布候选检查 READY 且现场负责人签字后，才能进入真实订单试运行。",
    "",
  ];
  return `${lines.join("\n")}`;
}

function writeText(path, content) {
  const fullPath = resolve(path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function buildSummary(options) {
  return {
    status: "ready",
    envTemplatePath: displayPath(options.outputEnv),
    runbookPath: displayPath(options.outputRunbook),
    sectionCount: envSections.length,
    requiredPreflightVariables,
    safeguards: {
      realSecretsIncluded: false,
      allValuesCommented: true,
      placeholderValuesOnly: true,
    },
  };
}

function displayPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return path;
}
