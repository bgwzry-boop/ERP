#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultProductionEnvSetupJsonPath,
  productionEnvFileSourceLabel,
  resolveProductionEnvSetupEnvFiles,
} from "./productionEnvSetupEnvFileResolver.mjs";

const trueValues = new Set(["1", "true", "yes", "on"]);
const falseValues = new Set(["0", "false", "no", "off"]);
const objectStorageRequiredNames = [
  "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
  "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
  "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
];
const preflightRelevantEnvNames = [
  "ERP_RUNTIME_MODE",
  "ERP_V1_PERSISTENCE_PROFILE",
  "ERP_V1_REPOSITORY_STORE",
  "ERP_V1_DATABASE_URL",
  "DATABASE_URL",
  "PGURL",
  "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
  "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED",
  "ERP_V1_FILE_STORAGE_PROFILE",
  "ERP_V1_OBJECT_STORAGE_PROFILE",
  "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER",
  ...objectStorageRequiredNames,
  "ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN",
  "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX",
  "ERP_SYSTEM_PRINTER_ENABLED",
  "ERP_SYSTEM_PRINTER_ADAPTER",
  "ERP_SYSTEM_PRINTER_COMMAND",
  "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON",
  "ERP_SYSTEM_PRINTER_ALLOWLIST",
  "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
  "ERP_PRINT_COMMAND_BRIDGE_MODE",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS",
  "ERP_V1_READINESS_API_BASE_URL",
  "VITE_ERP_API_BASE_URL",
  "ERP_V1_READINESS_OPERATOR_ID",
  "ERP_V1_READINESS_DRIVER_OPERATOR_ID",
  "ERP_V1_READINESS_TOKEN",
  "ERP_V1_READINESS_DRIVER_TOKEN",
  "ERP_V1_READINESS_LOGIN_NAME",
  "ERP_V1_READINESS_PASSWORD",
  "ERP_V1_READINESS_DRIVER_LOGIN_NAME",
  "ERP_V1_READINESS_DRIVER_PASSWORD",
  "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR",
  "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL",
  "ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID",
  "ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID",
  "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED",
  "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF",
  "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED",
  "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF",
];

const fixGuidanceByKey = {
  "runtime-mode": {
    valueGuidance: [
      "生产 API 必须显式使用 ERP_RUNTIME_MODE=production。",
      "demo / test / production 使用独立数据分区；生产模式不读取本地业务数据。",
      "不要通过 NODE_ENV 或启动参数把生产实例降级为 demo。",
    ],
    verificationSteps: [
      "npm run runtime-config:check",
      "npm run batch-a:check",
      "确认 /api/health 的 runtimeConfig.mode 为 production。",
    ],
  },
  "v1-persistence-profile": {
    valueGuidance: [
      "生产必须显式使用 postgres 仓储 profile；不要沿用 local_json 或 memory。",
      "数据库连接串必须来自生产 PostgreSQL 管理方；真实连接串只放安全 env 文件。",
      "文件留档 profile 必须切到 object_storage，并与附件对象存储配置同时复核。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "npm run v1-production-profile-live:check",
    ],
  },
  "postgres-restore-validation-env": {
    valueGuidance: [
      "生产恢复演练必须使用专用可重置验证库，不能和生产源库指向同一 host/port/database。",
      "恢复验证库连接串只放安全 env 文件；不要粘贴到交接文档或聊天记录。",
      "`ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED` 在生产 env 中必须保持 false；实际恢复演练时由负责人显式传 `--allow-restore-reset`。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "node -- scripts/run-v1-production-postgres-backup-restore-check.mjs --use-production-env-setup-env-file --allow-restore-reset",
    ],
  },
  "attachment-object-storage-env": {
    valueGuidance: [
      "endpoint、bucket、access key、secret key 必须来自真实 OSS/S3/COS 或兼容对象存储。",
      "bucket 需要支持附件上传、读回、下载和签名 URL 留档；不要使用本地目录替代。",
      "临时凭证供应商需要同时配置 session token，key prefix 建议按生产环境隔离，且必须是相对对象 key 前缀。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "在上线状态页执行附件留档预检，并保留上传 / 读回现场证据。",
    ],
  },
  "statement-export-object-storage-env": {
    valueGuidance: [
      "对账导出可以使用独立 bucket，也可以在附件对象存储完整时复用附件 fallback。",
      "如使用独立 bucket，4 个 ERP_STATEMENT_EXPORT_OBJECT_STORAGE_* 变量必须成套配置。",
      "key prefix 建议与附件、付款凭证和现场证据目录分开，且必须是相对对象 key 前缀，方便财务留档检索。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "在真实 API 上导出一份客户对账单并确认导出记录可重新下载。",
    ],
  },
  "system-printer-command-bridge-env": {
    valueGuidance: [
      "打印桥必须启用 command_bridge，并指向生产打印桥命令或 Node 命令。",
      "命令参数必须是 JSON array，allowlist 只能列真实允许打印的设备名。",
      "spool 目录必须是生产机器可写、可回读、可清理的安全目录。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "在上线状态页依次执行 spool 预检和打印门禁预检。",
    ],
  },
  "cups-preflight-env": {
    valueGuidance: [
      "CUPS 模式必须使用 cups_lp，allowlist 只列现场真实 CUPS 队列。",
      "状态命令必须是非出纸命令，例如 lpstat；参数必须是 JSON array。",
      "先确认队列可查询，再进行样张出纸、纸张对位和条码扫码证据采集。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "在上线状态页执行 CUPS 预检，并保留现场 lpstat / 队列截图证据。",
    ],
  },
  "v1-readiness-identity-env": {
    valueGuidance: [
      "API base URL 必须指向生产 API，不要使用本机 localhost 作为生产验收目标。",
      "办公室和司机验收账号必须是真实生产账号，权限应与现场岗位一致。",
      "如生产 API 需要 bearer token，只把 token 放入安全 env 文件。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "npm run v1-readiness:check",
      "用指定账号在上线状态页执行运行时门禁、司机真机和打印门禁预检。",
    ],
  },
  "v1-field-acceptance-report-env": {
    valueGuidance: [
      "输出目录必须是上线交接包可归档的位置，不能依赖临时目录。",
      "现场验收 API 地址应与 readiness 目标一致，避免报告和实际运行实例不一致。",
      "办公室和司机验收人应与现场签字角色一致，便于后续追责。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "生成 V1 现场验收 JSON / Markdown 报告。",
      "把报告编号回填到现场证据采集包后再刷新 go-live suite。",
    ],
  },
  "local-v1-acceptance-bypass-env": {
    valueGuidance: [
      "生产默认不接受本地持久化或本地文件留档。",
      "如业务负责人临时接受，必须填写书面签字编号，且 release candidate 仍需显示 warning。",
      "该开关只能作为明确风险接受记录，不能替代 PostgreSQL、对象存储和现场证据。",
    ],
    verificationSteps: [
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
      "确认负责人签字 / V1-V2 边界表已记录该风险是否被接受。",
    ],
  },
  "preflight-redaction-safeguard": {
    valueGuidance: [
      "报告只能输出变量名、计数、状态和脱敏下一步。",
      "不要把真实连接串、secret、命令路径、spool 路径或 token 粘贴进交接文档。",
    ],
    verificationSteps: [
      "npm run v1-production-env-preflight:check",
      "git diff --check",
    ],
  },
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const env = loadEnvironment({ envFiles: options.envFiles, baseEnv: process.env });
    const report = buildProductionEnvPreflight({
      env,
      envFiles: options.envFiles,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatReport(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = error?.message || String(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production env preflight failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function parseArgs(args) {
  const options = { envFiles: [], productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJsonPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  const envFileResolution = resolveProductionEnvSetupEnvFiles({
    envFiles: options.envFiles,
    productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: options.useProductionEnvSetupEnvFile,
  });
  options.envFiles = envFileResolution.envFiles;
  options.envFileSource = envFileResolution.source;
  options.envFileSourceSummary = envFileResolution.summary;
  options.envFileFromProductionSetup = envFileResolution.usedProductionEnvSetup;
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-env-preflight.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>                    Load KEY=VALUE lines before checking. Can be repeated.",
    "  --use-production-env-setup-env-file  Reuse the secure env file recorded by production env setup.",
    "  --production-env-setup-json <path>   Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --json                               Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Required V1 production environment variables are configured",
    "  1  Env file / runner error",
    "  2  Environment is readable but still blocked for V1 production",
    "",
    "This check is non-mutating and redacted: it reports variable names, counts, and statuses only.",
  ].join("\n");
}

function loadEnvironment({ envFiles, baseEnv }) {
  const env = { ...baseEnv };
  for (const envFile of envFiles) {
    const fullPath = resolve(envFile);
    if (!existsSync(fullPath)) throw new Error(`Env file not found: ${envFile}`);
    Object.assign(env, parseEnvFile(readFileSync(fullPath, "utf8")));
  }
  return env;
}

function parseEnvFile(content) {
  const result = {};
  const lines = String(content ?? "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = unquoteEnvValue(normalized.slice(equalsIndex + 1).trim());
  }
  return result;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const hashIndex = value.search(/\s#/);
  return hashIndex >= 0 ? value.slice(0, hashIndex).trim() : value;
}

function buildProductionEnvPreflight({
  env,
  envFiles = [],
  envFileSource = envFiles.length ? "cli" : "none",
  envFileSourceSummary = envFiles.length ? `${envFiles.length} 个命令行 env 文件` : "未传入 env 文件",
  envFileFromProductionSetup = false,
}) {
  const criteria = [
    buildRuntimeModeCriterion(env),
    buildPersistenceCriterion(env),
    buildPostgresRestoreValidationCriterion(env),
    buildObjectStorageCriterion(env),
    buildStatementExportStorageCriterion(env),
    buildPrintBridgeCriterion(env),
    buildCupsPreflightCriterion(env),
    buildReadinessIdentityCriterion(env),
    buildFieldAcceptanceReportCriterion(env),
    buildLocalBypassCriterion(env),
    buildRedactionCriterion(),
  ];
  const blockingCriteria = criteria.filter((item) => item.blocking && item.status !== "passed");
  const warningCriteria = criteria.filter((item) => !item.blocking && item.status !== "passed");
  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const placeholderValueCount = countPlaceholderValues(env, preflightRelevantEnvNames);
  const fixChecklist = buildFixChecklist({ env, criteria });
  return {
    status: blockingCriteria.length === 0 ? "ready" : "blocked",
    ready: blockingCriteria.length === 0,
    checkedAt: new Date().toISOString(),
    scope: "v1_production_environment_preflight",
    envFileCount: envFiles.length,
    envFileSource,
    envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
    envFileSourceSummary,
    envFileFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    summary: {
      label: `${passedCount}/${criteria.length} 通过`,
      passedCount,
      totalCount: criteria.length,
      blockingCount: blockingCriteria.length,
      warningCount: warningCriteria.length,
      placeholderValueCount,
      envFileSource,
      envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
      envFileFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    criteria,
    blockingCriteria,
    warningCriteria,
    fixChecklist,
    safeguards: {
      nonMutating: true,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      objectStorageKeyPrefixExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      placeholderValuesAccepted: false,
      envFileReadFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    nextActions: buildNextActions({ blockingCriteria, warningCriteria }),
  };
}

function buildRuntimeModeCriterion(env) {
  const mode = cleanValue(env.ERP_RUNTIME_MODE);
  return criterion({
    key: "runtime-mode",
    label: "生产运行模式",
    status: mode === "production" ? "passed" : "pending",
    detail:
      mode === "production"
        ? "ERP runtime mode is explicitly production."
        : "缺少或未启用：ERP_RUNTIME_MODE=production",
    evidence: {
      productionMode: mode === "production",
      configured: Boolean(mode),
    },
  });
}

function buildPersistenceCriterion(env) {
  const profile = cleanValue(env.ERP_V1_PERSISTENCE_PROFILE || env.ERP_V1_REPOSITORY_STORE);
  const databaseConfigured = hasAny(env, ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"]);
  const databaseSourceVariable = firstConfiguredName(env, ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"]);
  const databaseTarget = parsePostgresConnectionTarget(databaseSourceVariable ? env[databaseSourceVariable] : "");
  const fileProfile = cleanValue(env.ERP_V1_FILE_STORAGE_PROFILE || env.ERP_V1_OBJECT_STORAGE_PROFILE);
  const missing = [];
  if (profile !== "postgres") missing.push("ERP_V1_PERSISTENCE_PROFILE=postgres");
  if (!databaseConfigured) missing.push("ERP_V1_DATABASE_URL or DATABASE_URL");
  if (databaseConfigured && !databaseTarget.parsed) {
    missing.push("ERP_V1_DATABASE_URL or DATABASE_URL valid PostgreSQL connection string");
  }
  if (fileProfile !== "object_storage") missing.push("ERP_V1_FILE_STORAGE_PROFILE=object_storage");
  return criterion({
    key: "v1-persistence-profile",
    label: "统一 V1 持久化 profile",
    status: missing.length === 0 ? "passed" : "pending",
    detail:
      missing.length === 0
        ? "PostgreSQL repository profile and object-storage file profile are selected."
        : `缺少或未启用：${missing.join(", ")}`,
    evidence: {
      repositoryProfilePostgres: profile === "postgres",
      databaseUrlConfigured: databaseConfigured,
      databaseSourceVariable,
      databaseConnectionStringParsed: databaseTarget.parsed,
      fileStorageProfileObjectStorage: fileProfile === "object_storage",
      configuredVariableCount: countPresent(env, [
        "ERP_V1_PERSISTENCE_PROFILE",
        "ERP_V1_DATABASE_URL",
        "DATABASE_URL",
        "ERP_V1_FILE_STORAGE_PROFILE",
      ]),
    },
  });
}

function buildPostgresRestoreValidationCriterion(env) {
  const missing = [];
  const sourceDatabaseVariable = firstConfiguredName(env, ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"]);
  const sourceDatabaseTarget = parsePostgresConnectionTarget(sourceDatabaseVariable ? env[sourceDatabaseVariable] : "");
  const restoreDatabaseTarget = parsePostgresConnectionTarget(env.ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL);
  const targetsComparable = sourceDatabaseTarget.parsed && restoreDatabaseTarget.parsed;
  const samePhysicalTarget = targetsComparable && sourceDatabaseTarget.fingerprint === restoreDatabaseTarget.fingerprint;
  const resetAllowedFlagConfigured = hasValue(env, "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED");
  const resetAllowedCurrentlyTrue = isTrue(env.ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED);
  const resetAllowedCurrentlyFalse = isExplicitFalse(env.ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED);
  if (!hasValue(env, "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL")) {
    missing.push("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL");
  } else if (!restoreDatabaseTarget.parsed) {
    missing.push("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL valid PostgreSQL connection string");
  }
  if (samePhysicalTarget) {
    missing.push("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL different host/port/database from production source");
  }
  if (!resetAllowedFlagConfigured || !resetAllowedCurrentlyFalse) {
    missing.push("ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false");
  }
  const persistentResetAllowed = resetAllowedFlagConfigured && !resetAllowedCurrentlyFalse;
  return criterion({
    key: "postgres-restore-validation-env",
    label: "PostgreSQL 恢复验证库环境变量",
    status: missing.length === 0 ? "passed" : "pending",
    detail:
      missing.length === 0
        ? "Dedicated restore-validation database URL is configured; reset still requires explicit runtime authorization."
        : persistentResetAllowed
          ? "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED 必须在生产 env 中保持 false；恢复演练时传 --allow-restore-reset 显式授权。"
        : `缺少：${missing.join(", ")}`,
    evidence: {
      restoreDatabaseUrlConfigured: hasValue(env, "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL"),
      resetAllowedFlagConfigured,
      resetAllowedCurrentlyTrue,
      resetAllowedCurrentlyFalse,
      persistentResetAllowedBlocked: persistentResetAllowed,
      restoreValidationRequiresExplicitReset: true,
      sourceDatabaseSourceVariable: sourceDatabaseVariable,
      sourceDatabaseConnectionStringParsed: sourceDatabaseTarget.parsed,
      restoreDatabaseConnectionStringParsed: restoreDatabaseTarget.parsed,
      restoreTargetComparable: targetsComparable,
      restoreTargetSamePhysicalDatabase: samePhysicalTarget,
    },
  });
}

function buildObjectStorageCriterion(env) {
  const missing = objectStorageRequiredNames.filter((name) => !hasValue(env, name));
  const endpointConfigured = hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT");
  const bucketConfigured = hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET");
  const keyPrefixConfigured = hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX");
  const endpointUrlValid = !endpointConfigured || isHttpUrl(env.ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT);
  const bucketNameValid = !bucketConfigured || isObjectStorageBucketName(env.ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET);
  const keyPrefixValid = !keyPrefixConfigured || isObjectStorageKeyPrefix(env.ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX);
  if (endpointConfigured && !endpointUrlValid) missing.push("ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT http/https URL");
  if (bucketConfigured && !bucketNameValid) missing.push("ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET valid bucket name");
  if (keyPrefixConfigured && !keyPrefixValid) {
    missing.push("ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix");
  }
  return criterion({
    key: "attachment-object-storage-env",
    label: "附件对象存储环境变量",
    status: missing.length === 0 ? "passed" : "pending",
    detail:
      missing.length === 0
        ? "Attachment object-storage endpoint, bucket, access key, and secret key are configured."
        : `缺少或格式不正确：${missing.join(", ")}`,
    evidence: {
      providerConfigured: hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER"),
      endpointConfigured,
      endpointUrlValid,
      bucketConfigured,
      bucketNameValid,
      accessKeyConfigured: hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID"),
      secretKeyConfigured: hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY"),
      sessionTokenConfigured: hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN"),
      keyPrefixConfigured,
      keyPrefixValid,
    },
  });
}

function buildStatementExportStorageCriterion(env) {
  const explicitNames = [
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  ];
  const explicitCount = countPresent(env, explicitNames);
  const explicitEndpointConfigured = hasValue(env, "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT");
  const explicitBucketConfigured = hasValue(env, "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET");
  const explicitKeyPrefixConfigured = hasValue(env, "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX");
  const explicitEndpointUrlValid =
    !explicitEndpointConfigured || isHttpUrl(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT);
  const explicitBucketNameValid =
    !explicitBucketConfigured || isObjectStorageBucketName(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET);
  const explicitKeyPrefixValid =
    !explicitKeyPrefixConfigured || isObjectStorageKeyPrefix(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX);
  const attachmentEndpointValid = isHttpUrl(env.ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT);
  const attachmentBucketValid = isObjectStorageBucketName(env.ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET);
  const usesAttachmentFallback =
    explicitCount === 0 &&
    objectStorageRequiredNames.every((name) => hasValue(env, name)) &&
    attachmentEndpointValid &&
    attachmentBucketValid;
  const explicitStorageReady =
    explicitCount === explicitNames.length && explicitEndpointUrlValid && explicitBucketNameValid;
  const missingExplicit = [];
  if (!usesAttachmentFallback && !explicitStorageReady) {
    missingExplicit.push(...explicitNames.filter((name) => !hasValue(env, name)));
  }
  if (explicitEndpointConfigured && !explicitEndpointUrlValid) {
    missingExplicit.push("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT http/https URL");
  }
  if (explicitBucketConfigured && !explicitBucketNameValid) {
    missingExplicit.push("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET valid bucket name");
  }
  if (explicitKeyPrefixConfigured && !explicitKeyPrefixValid) {
    missingExplicit.push("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix");
  }
  const ready = (explicitStorageReady || usesAttachmentFallback) && explicitKeyPrefixValid;
  return criterion({
    key: "statement-export-object-storage-env",
    label: "对账导出对象存储环境变量",
    status: ready ? "passed" : "pending",
    detail: ready
      ? usesAttachmentFallback
        ? "Statement export storage can use the attachment object-storage fallback."
        : "Statement export object-storage credentials are explicitly configured."
      : `缺少独立配置，且附件对象存储 fallback 不完整：${missingExplicit.join(", ")}`,
    evidence: {
      explicitConfiguredCount: explicitCount,
      explicitTotalCount: explicitNames.length,
      usesAttachmentFallback,
      explicitEndpointUrlValid,
      explicitBucketNameValid,
      explicitKeyPrefixConfigured,
      explicitKeyPrefixValid,
    },
  });
}

function buildPrintBridgeCriterion(env) {
  const commandArgs = parseJsonArray(env.ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON);
  const missing = [];
  if (!isTrue(env.ERP_SYSTEM_PRINTER_ENABLED)) missing.push("ERP_SYSTEM_PRINTER_ENABLED=true");
  if (cleanValue(env.ERP_SYSTEM_PRINTER_ADAPTER) !== "command_bridge") missing.push("ERP_SYSTEM_PRINTER_ADAPTER=command_bridge");
  if (!hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND")) missing.push("ERP_SYSTEM_PRINTER_COMMAND");
  if (!hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON")) missing.push("ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON");
  if (hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON") && !commandArgs.valid) {
    missing.push("ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON valid JSON array");
  }
  if (!hasValue(env, "ERP_SYSTEM_PRINTER_ALLOWLIST")) missing.push("ERP_SYSTEM_PRINTER_ALLOWLIST");
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR")) missing.push("ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR");
  return criterion({
    key: "system-printer-command-bridge-env",
    label: "系统打印 command_bridge 环境变量",
    status: missing.length === 0 ? "passed" : "pending",
    detail:
      missing.length === 0
        ? "System-printer command bridge is explicitly configured."
        : `缺少或格式不正确：${missing.join(", ")}`,
    evidence: {
      systemPrinterEnabled: isTrue(env.ERP_SYSTEM_PRINTER_ENABLED),
      adapterCommandBridge: cleanValue(env.ERP_SYSTEM_PRINTER_ADAPTER) === "command_bridge",
      commandConfigured: hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND"),
      commandArgsConfigured: hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON"),
      commandArgsValidJsonArray: commandArgs.valid,
      allowlistCount: splitList(env.ERP_SYSTEM_PRINTER_ALLOWLIST).length,
      spoolDirConfigured: hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR"),
    },
  });
}

function buildCupsPreflightCriterion(env) {
  const statusArgs = parseJsonArray(env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON);
  const missing = [];
  const mode = cleanValue(env.ERP_PRINT_COMMAND_BRIDGE_MODE);
  const statusTimeoutConfigured = hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS");
  const statusTimeoutValid = !statusTimeoutConfigured || isPositiveIntegerString(env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS);
  if (mode !== "cups_lp") missing.push("ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp");
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST")) {
    missing.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST");
  }
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND")) {
    missing.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND");
  }
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON")) {
    missing.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON");
  }
  if (hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON") && !statusArgs.valid) {
    missing.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON valid JSON array");
  }
  if (statusTimeoutConfigured && !statusTimeoutValid) {
    missing.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS positive integer");
  }
  return criterion({
    key: "cups-preflight-env",
    label: "CUPS 队列预检环境变量",
    status: missing.length === 0 ? "passed" : "pending",
    detail:
      missing.length === 0
        ? "CUPS mode, allowlist, and non-printing status command are configured."
        : `缺少或格式不正确：${missing.join(", ")}`,
    evidence: {
      bridgeModeCupsLp: mode === "cups_lp",
      cupsAllowlistCount: splitList(env.ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST).length,
      cupsPrinterConfigured: hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER"),
      statusCommandConfigured: hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND"),
      statusArgsConfigured: hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON"),
      statusArgsValidJsonArray: statusArgs.valid,
      timeoutConfigured: statusTimeoutConfigured,
      timeoutValid: statusTimeoutValid,
    },
  });
}

function buildReadinessIdentityCriterion(env) {
  const missing = [];
  const apiBaseSourceVariable = firstConfiguredName(env, ["ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"]);
  const apiBaseUrlValid = !apiBaseSourceVariable || isHttpUrl(env[apiBaseSourceVariable]);
  if (!hasAny(env, ["ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"])) {
    missing.push("ERP_V1_READINESS_API_BASE_URL");
  } else if (!apiBaseUrlValid) {
    missing.push("ERP_V1_READINESS_API_BASE_URL valid http/https URL");
  }
  if (!hasValue(env, "ERP_V1_READINESS_OPERATOR_ID")) missing.push("ERP_V1_READINESS_OPERATOR_ID");
  if (!hasValue(env, "ERP_V1_READINESS_DRIVER_OPERATOR_ID")) missing.push("ERP_V1_READINESS_DRIVER_OPERATOR_ID");
  const officeTokenConfigured = hasValue(env, "ERP_V1_READINESS_TOKEN");
  const officeLoginConfigured =
    hasValue(env, "ERP_V1_READINESS_LOGIN_NAME") && hasValue(env, "ERP_V1_READINESS_PASSWORD");
  const driverTokenConfigured = hasValue(env, "ERP_V1_READINESS_DRIVER_TOKEN");
  const driverLoginConfigured =
    hasValue(env, "ERP_V1_READINESS_DRIVER_LOGIN_NAME") &&
    hasValue(env, "ERP_V1_READINESS_DRIVER_PASSWORD");
  if (!officeTokenConfigured && !officeLoginConfigured) {
    missing.push("ERP_V1_READINESS_TOKEN or ERP_V1_READINESS_LOGIN_NAME + ERP_V1_READINESS_PASSWORD");
  }
  if (!driverTokenConfigured && !driverLoginConfigured) {
    missing.push(
      "ERP_V1_READINESS_DRIVER_TOKEN or ERP_V1_READINESS_DRIVER_LOGIN_NAME + ERP_V1_READINESS_DRIVER_PASSWORD",
    );
  }
  return criterion({
    key: "v1-readiness-identity-env",
    label: "V1 readiness 验收账号环境变量",
    blocking: true,
    status: missing.length === 0 ? "passed" : "pending",
    detail:
      missing.length === 0
        ? "Readiness API base URL and formal office / driver authentication are explicit."
        : `缺少 production 正式验收身份配置：${missing.join(", ")}`,
    evidence: {
      apiBaseUrlConfigured: hasAny(env, ["ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"]),
      apiBaseSourceVariable,
      apiBaseUrlValid,
      officeOperatorConfigured: hasValue(env, "ERP_V1_READINESS_OPERATOR_ID"),
      driverOperatorConfigured: hasValue(env, "ERP_V1_READINESS_DRIVER_OPERATOR_ID"),
      tokenConfigured: hasValue(env, "ERP_V1_READINESS_TOKEN"),
      driverTokenConfigured: hasValue(env, "ERP_V1_READINESS_DRIVER_TOKEN"),
      officeLoginPairConfigured: officeLoginConfigured,
      driverLoginPairConfigured: driverLoginConfigured,
    },
  });
}

function buildFieldAcceptanceReportCriterion(env) {
  const missing = [];
  const apiBaseSourceVariable = firstConfiguredName(env, [
    "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL",
    "ERP_V1_READINESS_API_BASE_URL",
    "VITE_ERP_API_BASE_URL",
  ]);
  const apiBaseUrlValid = !apiBaseSourceVariable || isHttpUrl(env[apiBaseSourceVariable]);
  if (!hasValue(env, "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR")) missing.push("ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR");
  if (!hasAny(env, ["ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL", "ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"])) {
    missing.push("ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL");
  } else if (!apiBaseUrlValid) {
    missing.push("ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL valid http/https URL");
  }
  return criterion({
    key: "v1-field-acceptance-report-env",
    label: "V1 现场验收报告留档环境变量",
    blocking: false,
    status: missing.length === 0 ? "passed" : "warning",
    detail:
      missing.length === 0
        ? "Field-acceptance report output and API target are explicit."
        : `未显式配置，将使用默认输出目录或 API 默认值：${missing.join(", ")}`,
    evidence: {
      outputDirConfigured: hasValue(env, "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR"),
      apiBaseUrlConfigured: hasAny(env, [
        "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL",
        "ERP_V1_READINESS_API_BASE_URL",
        "VITE_ERP_API_BASE_URL",
      ]),
      apiBaseSourceVariable,
      apiBaseUrlValid,
      officeOperatorConfigured: hasValue(env, "ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID"),
      driverOperatorConfigured: hasValue(env, "ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID"),
    },
  });
}

function buildLocalBypassCriterion(env) {
  const localSystemAccepted = isTrue(env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED);
  const localAttachmentAccepted = isTrue(env.ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED);
  const active = localSystemAccepted || localAttachmentAccepted;
  return criterion({
    key: "local-v1-acceptance-bypass-env",
    label: "本地持久化 / 本地文件留档 V1 接受开关",
    blocking: false,
    status: active ? "warning" : "passed",
    detail: active
      ? "检测到本地持久化或本地文件留档接受开关；真实生产预检应由业务方单独签字确认。"
      : "No local-persistence or local-file-retention V1 acceptance bypass is enabled.",
    evidence: {
      localSystemPersistenceAccepted: localSystemAccepted,
      localSystemAcceptanceReferenceConfigured: hasValue(env, "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF"),
      localAttachmentFsAccepted: localAttachmentAccepted,
      localAttachmentAcceptanceReferenceConfigured: hasValue(env, "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF"),
    },
  });
}

function buildRedactionCriterion() {
  return criterion({
    key: "preflight-redaction-safeguard",
    label: "预检输出脱敏护栏",
    status: "passed",
    detail: "Only variable names, counts, booleans, and statuses are emitted.",
    evidence: {
      connectionStringExposed: false,
      endpointExposed: false,
      bucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
    },
  });
}

function criterion({ key, label, status, detail, evidence = {}, blocking = true }) {
  return {
    key,
    label,
    status,
    blocking,
    detail,
    evidence,
  };
}

function buildNextActions({ blockingCriteria, warningCriteria }) {
  if (blockingCriteria.length === 0) {
    const actions = [
      "启动 ERP API 后运行 scripts/run-v1-readiness-check.mjs --json。",
      "生成 V1 现场验收报告，并保留真实设备 / 真机 / 对象存储证据。",
    ];
    if (warningCriteria.length > 0) {
      actions.unshift("处理 warning 项，确保现场人员不用脚本默认账号或默认输出目录完成验收。");
    }
    return actions;
  }
  return blockingCriteria
    .slice(0, 8)
    .map((item) => `${item.label}：${item.detail}`);
}

function buildFixChecklist({ env, criteria }) {
  const byKey = new Map(criteria.map((item) => [item.key, item]));
  return [
    buildRuntimeModeFixItem({ env, criterion: byKey.get("runtime-mode") }),
    buildPersistenceFixItem({ env, criterion: byKey.get("v1-persistence-profile") }),
    buildPostgresRestoreValidationFixItem({ env, criterion: byKey.get("postgres-restore-validation-env") }),
    buildObjectStorageFixItem({ env, criterion: byKey.get("attachment-object-storage-env") }),
    buildStatementExportStorageFixItem({ env, criterion: byKey.get("statement-export-object-storage-env") }),
    buildPrintBridgeFixItem({ env, criterion: byKey.get("system-printer-command-bridge-env") }),
    buildCupsPreflightFixItem({ env, criterion: byKey.get("cups-preflight-env") }),
    buildReadinessIdentityFixItem({ env, criterion: byKey.get("v1-readiness-identity-env") }),
    buildFieldAcceptanceFixItem({ env, criterion: byKey.get("v1-field-acceptance-report-env") }),
    buildLocalBypassFixItem({ env, criterion: byKey.get("local-v1-acceptance-bypass-env") }),
    buildRedactionFixItem({ criterion: byKey.get("preflight-redaction-safeguard") }),
  ].filter(Boolean);
}

function buildRuntimeModeFixItem({ env, criterion }) {
  const mode = cleanValue(env.ERP_RUNTIME_MODE);
  const ready = mode === "production";
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: ["ERP_RUNTIME_MODE=production"],
    configuredVariableCount: ready ? 1 : 0,
    totalVariableCount: 1,
    missingVariables: ready ? [] : ["ERP_RUNTIME_MODE=production"],
    placeholderVariables: placeholderNames(env, ["ERP_RUNTIME_MODE"]),
    nextAction: ready
      ? "保持 production 运行模式，并继续复核仓储和对象存储实例。"
      : "将 ERP_RUNTIME_MODE 设置为 production；不要使用 demo/test 模式启动生产 API。",
  });
}

function buildPersistenceFixItem({ env, criterion }) {
  const profile = cleanValue(env.ERP_V1_PERSISTENCE_PROFILE || env.ERP_V1_REPOSITORY_STORE);
  const fileProfile = cleanValue(env.ERP_V1_FILE_STORAGE_PROFILE || env.ERP_V1_OBJECT_STORAGE_PROFILE);
  const databaseConfigured = hasAny(env, ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"]);
  const databaseSourceVariable = firstConfiguredName(env, ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"]);
  const databaseTarget = parsePostgresConnectionTarget(databaseSourceVariable ? env[databaseSourceVariable] : "");
  const missingVariables = [];
  if (profile !== "postgres") missingVariables.push("ERP_V1_PERSISTENCE_PROFILE=postgres");
  if (!databaseConfigured) {
    missingVariables.push("ERP_V1_DATABASE_URL or DATABASE_URL or PGURL");
  } else if (!databaseTarget.parsed) {
    missingVariables.push(`${databaseSourceVariable} valid PostgreSQL connection string`);
  }
  if (fileProfile !== "object_storage") {
    missingVariables.push("ERP_V1_FILE_STORAGE_PROFILE=object_storage");
  }
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [
      "ERP_V1_PERSISTENCE_PROFILE=postgres",
      "ERP_V1_DATABASE_URL or DATABASE_URL or PGURL",
      "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
    ],
    configuredVariableCount:
      (profile === "postgres" ? 1 : 0) +
      (databaseConfigured && databaseTarget.parsed ? 1 : 0) +
      (fileProfile === "object_storage" ? 1 : 0),
    totalVariableCount: 3,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      "ERP_V1_PERSISTENCE_PROFILE",
      "ERP_V1_REPOSITORY_STORE",
      "ERP_V1_DATABASE_URL",
      "DATABASE_URL",
      "PGURL",
      "ERP_V1_FILE_STORAGE_PROFILE",
      "ERP_V1_OBJECT_STORAGE_PROFILE",
    ]),
    nextAction:
      missingVariables.length === 0
        ? "保持 PostgreSQL 和对象存储 profile，继续启动 API 并跑 runtime readiness。"
        : "补齐 PostgreSQL 连接和 object_storage 文件 profile；不要把模板占位符原样取消注释。",
  });
}

function buildPostgresRestoreValidationFixItem({ env, criterion }) {
  const missingVariables = [];
  const sourceDatabaseVariable = firstConfiguredName(env, ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"]);
  const sourceDatabaseTarget = parsePostgresConnectionTarget(sourceDatabaseVariable ? env[sourceDatabaseVariable] : "");
  const restoreDatabaseTarget = parsePostgresConnectionTarget(env.ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL);
  const targetsComparable = sourceDatabaseTarget.parsed && restoreDatabaseTarget.parsed;
  const samePhysicalTarget = targetsComparable && sourceDatabaseTarget.fingerprint === restoreDatabaseTarget.fingerprint;
  const resetAllowedFlagConfigured = hasValue(env, "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED");
  const resetAllowedCurrentlyFalse = isExplicitFalse(env.ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED);
  const persistentResetAllowed = resetAllowedFlagConfigured && !resetAllowedCurrentlyFalse;
  if (!hasValue(env, "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL")) {
    missingVariables.push("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL");
  } else if (!restoreDatabaseTarget.parsed) {
    missingVariables.push("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL valid PostgreSQL connection string");
  }
  if (samePhysicalTarget) {
    missingVariables.push("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL different host/port/database from production source");
  }
  if (!resetAllowedFlagConfigured || !resetAllowedCurrentlyFalse) {
    missingVariables.push("ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false");
  }
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [
      "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
      "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
    ],
    recommendedVariables: [
      "Use --allow-restore-reset only during the scheduled restore-validation run",
      "Keep restore validation database host/port/database different from production source",
    ],
    configuredVariableCount:
      (hasValue(env, "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL") ? 1 : 0) +
      (resetAllowedCurrentlyFalse ? 1 : 0),
    totalVariableCount: 2,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
      "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED",
    ]),
    nextAction:
      persistentResetAllowed
        ? "把 ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED 改回 false；仅在计划内恢复验证运行命令中显式传 --allow-restore-reset。"
        : missingVariables.length === 0
        ? "保留专用恢复验证库配置；执行恢复演练时再显式允许重置验证库。"
        : "补齐专用恢复验证库 URL，并保留 reset 默认 false；恢复演练时用显式授权运行。",
  });
}

function buildObjectStorageFixItem({ env, criterion }) {
  const missingVariables = objectStorageRequiredNames.filter((name) => !hasValue(env, name));
  if (hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT") && !isHttpUrl(env.ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT)) {
    missingVariables.push("ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT http/https URL");
  }
  if (hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET") && !isObjectStorageBucketName(env.ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET)) {
    missingVariables.push("ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET valid bucket name");
  }
  if (
    hasValue(env, "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX") &&
    !isObjectStorageKeyPrefix(env.ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX)
  ) {
    missingVariables.push("ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix");
  }
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [...objectStorageRequiredNames],
    recommendedVariables: [
      "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER",
      "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN when provider requires temporary credentials",
    ],
    configuredVariableCount: countPresent(env, objectStorageRequiredNames),
    totalVariableCount: objectStorageRequiredNames.length,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER",
      ...objectStorageRequiredNames,
      "ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN",
      "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX",
    ]),
    nextAction:
      missingVariables.length === 0
        ? "保留附件对象存储配置，后续用附件上传 / 读回 / 签名 URL live 检查留档。"
        : "补齐附件对象存储 endpoint、bucket、access key 和 secret key；真实值只放安全 env 文件。",
  });
}

function buildStatementExportStorageFixItem({ env, criterion }) {
  const explicitNames = [
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  ];
  const explicitCount = countPresent(env, explicitNames);
  const explicitEndpointConfigured = hasValue(env, "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT");
  const explicitBucketConfigured = hasValue(env, "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET");
  const explicitKeyPrefixConfigured = hasValue(env, "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX");
  const explicitEndpointUrlValid =
    !explicitEndpointConfigured || isHttpUrl(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT);
  const explicitBucketNameValid =
    !explicitBucketConfigured || isObjectStorageBucketName(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET);
  const explicitKeyPrefixValid =
    !explicitKeyPrefixConfigured || isObjectStorageKeyPrefix(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX);
  const attachmentEndpointValid = isHttpUrl(env.ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT);
  const attachmentBucketValid = isObjectStorageBucketName(env.ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET);
  const usesAttachmentFallback =
    explicitCount === 0 &&
    objectStorageRequiredNames.every((name) => hasValue(env, name)) &&
    attachmentEndpointValid &&
    attachmentBucketValid;
  const explicitStorageReady =
    explicitCount === explicitNames.length && explicitEndpointUrlValid && explicitBucketNameValid;
  const ready = (explicitStorageReady || usesAttachmentFallback) && explicitKeyPrefixValid;
  const missingVariables = [];
  if (!usesAttachmentFallback && !explicitStorageReady) {
    missingVariables.push(...explicitNames.filter((name) => !hasValue(env, name)));
  }
  if (explicitEndpointConfigured && !explicitEndpointUrlValid) {
    missingVariables.push("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT http/https URL");
  }
  if (explicitBucketConfigured && !explicitBucketNameValid) {
    missingVariables.push("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET valid bucket name");
  }
  if (explicitKeyPrefixConfigured && !explicitKeyPrefixValid) {
    missingVariables.push("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix");
  }
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [
      "Either complete all ERP_STATEMENT_EXPORT_OBJECT_STORAGE_* variables",
      "or leave them empty and complete attachment object storage fallback",
    ],
    recommendedVariables: ["ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX"],
    configuredVariableCount: usesAttachmentFallback ? explicitNames.length : explicitCount,
    totalVariableCount: explicitNames.length,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      ...explicitNames,
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX",
    ]),
    nextAction: ready
      ? "确认对账导出复用路径或独立 bucket 留档策略，继续跑对账导出 live 证据。"
      : "补齐对账导出对象存储 4 个变量，或先补齐附件对象存储让对账导出复用 fallback。",
  });
}

function buildPrintBridgeFixItem({ env, criterion }) {
  const commandArgs = parseJsonArray(env.ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON);
  const missingVariables = [];
  if (!isTrue(env.ERP_SYSTEM_PRINTER_ENABLED)) missingVariables.push("ERP_SYSTEM_PRINTER_ENABLED=true");
  if (cleanValue(env.ERP_SYSTEM_PRINTER_ADAPTER) !== "command_bridge") {
    missingVariables.push("ERP_SYSTEM_PRINTER_ADAPTER=command_bridge");
  }
  if (!hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND")) missingVariables.push("ERP_SYSTEM_PRINTER_COMMAND");
  if (!hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON")) {
    missingVariables.push("ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON");
  } else if (!commandArgs.valid) {
    missingVariables.push("ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON valid JSON array");
  }
  if (!hasValue(env, "ERP_SYSTEM_PRINTER_ALLOWLIST")) missingVariables.push("ERP_SYSTEM_PRINTER_ALLOWLIST");
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR")) missingVariables.push("ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR");
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [
      "ERP_SYSTEM_PRINTER_ENABLED=true",
      "ERP_SYSTEM_PRINTER_ADAPTER=command_bridge",
      "ERP_SYSTEM_PRINTER_COMMAND",
      "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON",
      "ERP_SYSTEM_PRINTER_ALLOWLIST",
      "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
    ],
    configuredVariableCount:
      (isTrue(env.ERP_SYSTEM_PRINTER_ENABLED) ? 1 : 0) +
      (cleanValue(env.ERP_SYSTEM_PRINTER_ADAPTER) === "command_bridge" ? 1 : 0) +
      (hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND") ? 1 : 0) +
      (hasValue(env, "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON") && commandArgs.valid ? 1 : 0) +
      (hasValue(env, "ERP_SYSTEM_PRINTER_ALLOWLIST") ? 1 : 0) +
      (hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR") ? 1 : 0),
    totalVariableCount: 6,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      "ERP_SYSTEM_PRINTER_ENABLED",
      "ERP_SYSTEM_PRINTER_ADAPTER",
      "ERP_SYSTEM_PRINTER_COMMAND",
      "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON",
      "ERP_SYSTEM_PRINTER_ALLOWLIST",
      "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
    ]),
    nextAction:
      missingVariables.length === 0
        ? "保留 command_bridge 配置，后续用 non-printing 或真实打印任务验证 spool / 状态回读。"
        : "补齐打印命令桥开关、命令、JSON 参数、设备 allowlist 和 spool 目录；真实路径只放安全 env 文件。",
  });
}

function buildCupsPreflightFixItem({ env, criterion }) {
  const statusArgs = parseJsonArray(env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON);
  const statusTimeoutConfigured = hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS");
  const statusTimeoutValid = !statusTimeoutConfigured || isPositiveIntegerString(env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS);
  const missingVariables = [];
  if (cleanValue(env.ERP_PRINT_COMMAND_BRIDGE_MODE) !== "cups_lp") {
    missingVariables.push("ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp");
  }
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST")) {
    missingVariables.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST");
  }
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND")) {
    missingVariables.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND");
  }
  if (!hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON")) {
    missingVariables.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON");
  } else if (!statusArgs.valid) {
    missingVariables.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON valid JSON array");
  }
  if (statusTimeoutConfigured && !statusTimeoutValid) {
    missingVariables.push("ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS positive integer");
  }
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [
      "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON",
    ],
    recommendedVariables: [
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS",
    ],
    configuredVariableCount:
      (cleanValue(env.ERP_PRINT_COMMAND_BRIDGE_MODE) === "cups_lp" ? 1 : 0) +
      (hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST") ? 1 : 0) +
      (hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND") ? 1 : 0) +
      (hasValue(env, "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON") && statusArgs.valid ? 1 : 0),
    totalVariableCount: 4,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      "ERP_PRINT_COMMAND_BRIDGE_MODE",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS",
    ]),
    nextAction:
      missingVariables.length === 0
        ? "保留 CUPS 队列预检配置，后续在现场执行 lpstat / CUPS 队列和样张出纸证据。"
        : "补齐 CUPS 模式、队列 allowlist、状态命令和 JSON 参数；命令路径只放安全 env 文件。",
  });
}

function buildReadinessIdentityFixItem({ env, criterion }) {
  const missingVariables = [];
  const apiBaseSourceVariable = firstConfiguredName(env, ["ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"]);
  const apiBaseUrlValid = !apiBaseSourceVariable || isHttpUrl(env[apiBaseSourceVariable]);
  if (!hasAny(env, ["ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"])) {
    missingVariables.push("ERP_V1_READINESS_API_BASE_URL or VITE_ERP_API_BASE_URL");
  } else if (!apiBaseUrlValid) {
    missingVariables.push("ERP_V1_READINESS_API_BASE_URL valid http/https URL");
  }
  if (!hasValue(env, "ERP_V1_READINESS_OPERATOR_ID")) missingVariables.push("ERP_V1_READINESS_OPERATOR_ID");
  if (!hasValue(env, "ERP_V1_READINESS_DRIVER_OPERATOR_ID")) {
    missingVariables.push("ERP_V1_READINESS_DRIVER_OPERATOR_ID");
  }
  const officeAuthConfigured =
    hasValue(env, "ERP_V1_READINESS_TOKEN") ||
    (hasValue(env, "ERP_V1_READINESS_LOGIN_NAME") && hasValue(env, "ERP_V1_READINESS_PASSWORD"));
  const driverAuthConfigured =
    hasValue(env, "ERP_V1_READINESS_DRIVER_TOKEN") ||
    (hasValue(env, "ERP_V1_READINESS_DRIVER_LOGIN_NAME") &&
      hasValue(env, "ERP_V1_READINESS_DRIVER_PASSWORD"));
  if (!officeAuthConfigured) {
    missingVariables.push("ERP_V1_READINESS_TOKEN or ERP_V1_READINESS_LOGIN_NAME + ERP_V1_READINESS_PASSWORD");
  }
  if (!driverAuthConfigured) {
    missingVariables.push(
      "ERP_V1_READINESS_DRIVER_TOKEN or ERP_V1_READINESS_DRIVER_LOGIN_NAME + ERP_V1_READINESS_DRIVER_PASSWORD",
    );
  }
  return fixItem({
    criterion,
    ownerRole: "技术/办公室",
    requiredVariables: [
      "ERP_V1_READINESS_API_BASE_URL or VITE_ERP_API_BASE_URL",
      "ERP_V1_READINESS_OPERATOR_ID",
      "ERP_V1_READINESS_DRIVER_OPERATOR_ID",
      "ERP_V1_READINESS_TOKEN or ERP_V1_READINESS_LOGIN_NAME + ERP_V1_READINESS_PASSWORD",
      "ERP_V1_READINESS_DRIVER_TOKEN or ERP_V1_READINESS_DRIVER_LOGIN_NAME + ERP_V1_READINESS_DRIVER_PASSWORD",
    ],
    recommendedVariables: [],
    configuredVariableCount:
      (hasAny(env, ["ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"]) ? 1 : 0) +
      (hasValue(env, "ERP_V1_READINESS_OPERATOR_ID") ? 1 : 0) +
      (hasValue(env, "ERP_V1_READINESS_DRIVER_OPERATOR_ID") ? 1 : 0) +
      (officeAuthConfigured ? 1 : 0) +
      (driverAuthConfigured ? 1 : 0),
    totalVariableCount: 5,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      "ERP_V1_READINESS_API_BASE_URL",
      "VITE_ERP_API_BASE_URL",
      "ERP_V1_READINESS_OPERATOR_ID",
      "ERP_V1_READINESS_DRIVER_OPERATOR_ID",
      "ERP_V1_READINESS_TOKEN",
      "ERP_V1_READINESS_DRIVER_TOKEN",
      "ERP_V1_READINESS_LOGIN_NAME",
      "ERP_V1_READINESS_PASSWORD",
      "ERP_V1_READINESS_DRIVER_LOGIN_NAME",
      "ERP_V1_READINESS_DRIVER_PASSWORD",
    ]),
    nextAction:
      missingVariables.length === 0
        ? "使用正式 runtime token 或安全 env 登录凭据跑 readiness，保留脱敏结果到 release candidate。"
        : "补齐生产 API、正式账号 ID，以及办公室 / 司机各自的 runtime token 或安全 env 登录凭据。",
  });
}

function buildFieldAcceptanceFixItem({ env, criterion }) {
  const missingVariables = [];
  const apiBaseSourceVariable = firstConfiguredName(env, [
    "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL",
    "ERP_V1_READINESS_API_BASE_URL",
    "VITE_ERP_API_BASE_URL",
  ]);
  const apiBaseUrlValid = !apiBaseSourceVariable || isHttpUrl(env[apiBaseSourceVariable]);
  if (!hasValue(env, "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR")) {
    missingVariables.push("ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR");
  }
  if (!hasAny(env, ["ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL", "ERP_V1_READINESS_API_BASE_URL", "VITE_ERP_API_BASE_URL"])) {
    missingVariables.push("ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL or readiness API base URL");
  } else if (!apiBaseUrlValid) {
    missingVariables.push("ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL valid http/https URL");
  }
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [
      "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR",
      "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL or ERP_V1_READINESS_API_BASE_URL",
    ],
    recommendedVariables: [
      "ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID",
      "ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID",
    ],
    configuredVariableCount:
      (hasValue(env, "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR") ? 1 : 0) +
      (hasAny(env, [
        "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL",
        "ERP_V1_READINESS_API_BASE_URL",
        "VITE_ERP_API_BASE_URL",
      ])
        ? 1
        : 0),
    totalVariableCount: 2,
    missingVariables,
    placeholderVariables: placeholderNames(env, [
      "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR",
      "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL",
      "ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID",
      "ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID",
    ]),
    nextAction:
      missingVariables.length === 0
        ? "用指定输出目录生成现场验收报告，并把 JSON / Markdown 放入上线交接包。"
        : "补齐现场验收报告输出目录和生产 API 地址，避免报告写到默认临时目录。",
  });
}

function buildLocalBypassFixItem({ env, criterion }) {
  const active =
    isTrue(env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED) || isTrue(env.ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED);
  const missingReferences = [];
  if (isTrue(env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED) && !hasValue(env, "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF")) {
    missingReferences.push("ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF");
  }
  if (isTrue(env.ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED) && !hasValue(env, "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF")) {
    missingReferences.push("ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF");
  }
  return fixItem({
    criterion,
    ownerRole: "管理/技术",
    requiredVariables: [],
    recommendedVariables: [
      "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF when local persistence bypass is accepted",
      "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF when local file-retention bypass is accepted",
    ],
    configuredVariableCount:
      (isTrue(env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED) ? 1 : 0) +
      (isTrue(env.ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED) ? 1 : 0),
    totalVariableCount: 2,
    missingVariables: missingReferences,
    placeholderVariables: placeholderNames(env, [
      "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED",
      "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF",
      "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED",
      "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF",
    ]),
    nextAction: active
      ? "确认负责人是否书面接受本地持久化 / 本地文件留档风险；生产优先改回 PostgreSQL 和对象存储。"
      : "保持本地持久化接受开关关闭；生产发布继续以 PostgreSQL 和对象存储为准。",
  });
}

function buildRedactionFixItem({ criterion }) {
  return fixItem({
    criterion,
    ownerRole: "技术/管理",
    requiredVariables: [],
    configuredVariableCount: 0,
    totalVariableCount: 0,
    missingVariables: [],
    placeholderVariables: [],
    nextAction: "保持报告只输出变量名、计数、布尔状态和脱敏下一步，不粘贴真实密钥或路径。",
  });
}

function fixItem({
  criterion,
  ownerRole,
  requiredVariables,
  recommendedVariables = [],
  configuredVariableCount,
  totalVariableCount,
  missingVariables,
  placeholderVariables,
  nextAction,
}) {
  if (!criterion) return null;
  const ready = criterion.status === "passed";
  const severity = ready ? "ok" : criterion.blocking === false ? "warning" : "blocking";
  const guidance = fixGuidanceByKey[criterion.key] || {};
  return {
    key: criterion.key,
    label: criterion.label,
    status: criterion.status,
    ready,
    blocking: criterion.blocking !== false,
    severity,
    ownerRole,
    requiredVariables,
    recommendedVariables,
    configuredVariableCount,
    totalVariableCount,
    missingVariables,
    placeholderVariableCount: placeholderVariables.length,
    placeholderVariables,
    valueGuidance: stringList(guidance.valueGuidance),
    verificationSteps: stringList(guidance.verificationSteps),
    nextAction,
  };
}

function placeholderNames(env, names) {
  return Array.from(new Set(names)).filter((name) => isPlaceholderValue(env[name]));
}

function formatReport(report) {
  const lines = [
    `V1 production env preflight: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Blocking: ${report.summary.blockingCount}; warnings: ${report.summary.warningCount}`,
    `Env file source: ${report.envFileSourceLabel || productionEnvFileSourceLabel(report.envFileSource)}`,
    `Env file read from production setup: ${yesNo(report.safeguards.envFileReadFromProductionSetup)}`,
    "",
    "Criteria:",
    ...report.criteria.map((item) => `- ${item.status.toUpperCase()} ${item.label}: ${item.detail}`),
    "",
    "Fix checklist:",
    ...report.fixChecklist.map((item) => formatFixChecklistItem(item)),
    "",
    report.ready ? "Next:" : "Next blockers:",
    ...report.nextActions.map((item) => `- ${item}`),
    "",
  ];
  return lines.join("\n");
}

function formatFixChecklistItem(item) {
  const status = item.severity.toUpperCase();
  const missing = item.missingVariables.length > 0 ? `；需补：${item.missingVariables.join(", ")}` : "";
  const placeholders =
    item.placeholderVariableCount > 0 ? `；占位未替换：${item.placeholderVariables.join(", ")}` : "";
  const guidance = item.valueGuidance?.length ? `；填写提示：${item.valueGuidance[0]}` : "";
  const verification = item.verificationSteps?.length ? `；复核：${item.verificationSteps[0]}` : "";
  return `- ${status} ${item.ownerRole} · ${item.label}：${item.nextAction}${missing}${placeholders}${guidance}${verification}`;
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function hasValue(env, name) {
  return hasRawValue(env[name]) && !isPlaceholderValue(env[name]);
}

function hasAny(env, names) {
  return names.some((name) => hasValue(env, name));
}

function firstConfiguredName(env, names) {
  return names.find((name) => hasValue(env, name)) || "";
}

function countPresent(env, names) {
  return names.filter((name) => hasValue(env, name)).length;
}

function cleanValue(value) {
  return String(value ?? "").trim();
}

function isTrue(value) {
  return trueValues.has(cleanValue(value).toLowerCase());
}

function isExplicitFalse(value) {
  return falseValues.has(cleanValue(value).toLowerCase());
}

function splitList(value) {
  if (!hasRawValue(value) || isPlaceholderValue(value)) return [];
  return cleanValue(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray(value) {
  if (!hasRawValue(value)) return { valid: false, length: 0 };
  try {
    const parsed = JSON.parse(String(value));
    return { valid: Array.isArray(parsed), length: Array.isArray(parsed) ? parsed.length : 0 };
  } catch {
    return { valid: false, length: 0 };
  }
}

function parsePostgresConnectionTarget(value) {
  const text = cleanValue(value);
  if (!text || isPlaceholderValue(text)) return { parsed: false, fingerprint: "" };
  const urlTarget = parsePostgresUrlTarget(text);
  if (urlTarget.parsed) return urlTarget;
  const keywordTarget = parsePostgresKeywordTarget(text);
  if (keywordTarget.parsed) return keywordTarget;
  return { parsed: false, fingerprint: "" };
}

function parsePostgresUrlTarget(value) {
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== "postgres:" && protocol !== "postgresql:") return { parsed: false, fingerprint: "" };
    const host = normalizeConnectionComponent(url.hostname || url.searchParams.get("host") || "localhost");
    const port = normalizeConnectionComponent(url.port || url.searchParams.get("port") || "5432");
    const database = normalizeConnectionComponent(
      decodeURIComponent((url.pathname || "").replace(/^\/+/, "")) || url.searchParams.get("dbname") || "",
    );
    if (!database) return { parsed: false, fingerprint: "" };
    return { parsed: true, fingerprint: `${host}:${port}/${database}` };
  } catch {
    return { parsed: false, fingerprint: "" };
  }
}

function parsePostgresKeywordTarget(value) {
  const fields = parsePostgresKeywordConnection(value);
  const database = fields.dbname || fields.database || "";
  if (!database) return { parsed: false, fingerprint: "" };
  const host = normalizeConnectionComponent(fields.host || fields.hostaddr || "localhost");
  const port = normalizeConnectionComponent(fields.port || "5432");
  return { parsed: true, fingerprint: `${host}:${port}/${normalizeConnectionComponent(database)}` };
}

function parsePostgresKeywordConnection(value) {
  const fields = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)=('[^']*(?:\\'[^']*)*'|"[^"]*(?:\\"[^"]*)*"|[^\s]+)/g;
  let match;
  while ((match = pattern.exec(String(value || "")))) {
    fields[match[1].toLowerCase()] = unquoteConnectionValue(match[2]);
  }
  return fields;
}

function unquoteConnectionValue(value) {
  const text = cleanValue(value);
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return text;
}

function normalizeConnectionComponent(value) {
  return cleanValue(value).toLowerCase();
}

function isHttpUrl(value) {
  const text = cleanValue(value);
  if (!text || isPlaceholderValue(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isObjectStorageBucketName(value) {
  const text = cleanValue(value);
  if (!text || isPlaceholderValue(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/[\\/\s]/.test(text)) return false;
  return true;
}

function isObjectStorageKeyPrefix(value) {
  const raw = String(value ?? "");
  const text = raw.trim();
  if (!text || isPlaceholderValue(text)) return false;
  if (raw !== text) return false;
  if (text.length > 512) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
  if (text.startsWith("/") || text.includes("\\") || /\s/.test(text)) return false;
  const segments = text.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return true;
}

function isPositiveIntegerString(value) {
  const text = cleanValue(value);
  if (!/^\d+$/.test(text)) return false;
  return Number(text) > 0;
}

function hasRawValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isPlaceholderValue(value) {
  const text = cleanValue(value);
  return /<\s*(REPLACE_WITH|OPTIONAL)_?[A-Z0-9_ -]*\s*>/i.test(text) || /\bREPLACE_WITH_[A-Z0-9_]+\b/i.test(text);
}

function countPlaceholderValues(env, names) {
  return Array.from(new Set(names)).filter((name) => isPlaceholderValue(env[name])).length;
}

export {
  buildProductionEnvPreflight,
  loadEnvironment,
  parseEnvFile,
};
