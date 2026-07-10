#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import { getDatabaseUrl, redactSensitiveText as redactPostgresText } from "./run-v1-production-postgres-preflight.mjs";
import { requiredTables } from "./dbMigrationUtils.mjs";
import {
  defaultProductionEnvSetupJsonPath,
  productionEnvFileSourceLabel,
  resolveProductionEnvSetupEnvFiles,
} from "./productionEnvSetupEnvFileResolver.mjs";

const defaultOutputDir = join(".erp-local-storage", "v1-production-postgres-backup-restore");
const restoreUrlEnvKeys = [
  "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
  "ERP_V1_RESTORE_TEST_DATABASE_URL",
  "ERP_V1_POSTGRES_RESTORE_DATABASE_URL",
];

if (isCliEntrypoint()) runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const env = loadEnvironment({ envFiles: options.envFiles, baseEnv: process.env });
    const report = buildProductionPostgresBackupRestoreCheck({
      env,
      envFiles: options.envFiles,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
      psqlCommand: options.psqlCommand,
      pgDumpCommand: options.pgDumpCommand,
      restoreDatabaseUrl: options.restoreDatabaseUrl,
      allowRestoreReset: options.allowRestoreReset,
    });
    if (options.write) writeReport(report, options.outputDir);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionPostgresBackupRestoreCheck(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactSensitiveText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production PostgreSQL backup/restore check failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    envFiles: [],
    psqlCommand: "psql",
    pgDumpCommand: "pg_dump",
    outputDir: defaultOutputDir,
    write: true,
    json: false,
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--allow-restore-reset") {
      options.allowRestoreReset = true;
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
    if (arg === "--psql-command") {
      options.psqlCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--pg-dump-command") {
      options.pgDumpCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--restore-database-url") {
      options.restoreDatabaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
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
    "Usage: node scripts/run-v1-production-postgres-backup-restore-check.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>              Load secure production env file. Can be repeated.",
    "  --use-production-env-setup-env-file",
    "                                  Reuse the secure env file recorded by production env setup.",
    "  --production-env-setup-json <path>",
    "                                  Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --restore-database-url <url>   Dedicated restore-validation database URL. Overrides env.",
    "  --allow-restore-reset          Allow resetting the restore-validation database public schema.",
    "  --psql-command <path>          PostgreSQL client command. Defaults to psql.",
    "  --pg-dump-command <path>       PostgreSQL dump command. Defaults to pg_dump.",
    "  --output-dir <path>            Write latest JSON / Markdown report here.",
    "  --no-write                     Do not write report files.",
    "  --json                         Print machine-readable JSON.",
    "",
    "Env fallback for restore URL:",
    `  ${restoreUrlEnvKeys.join(" or ")}`,
    "",
    "Exit codes:",
    "  0  Production schema dump and dedicated restore validation are ready",
    "  1  Runner error",
    "  2  Check is readable but still blocked for V1 PostgreSQL backup / restore evidence",
    "",
    "The source production database is read-only. The restore-validation database is reset only when explicitly allowed.",
    "The report is redacted and does not include database URLs, dump contents, local dump paths, passwords, or raw SQL stderr.",
  ].join("\n");
}

function buildProductionPostgresBackupRestoreCheck({
  env = process.env,
  envFiles = [],
  envFileSource = envFiles.length ? "cli" : "none",
  envFileSourceSummary = envFiles.length ? `${envFiles.length} 个命令行 env 文件` : "未传入 env 文件",
  envFileFromProductionSetup = false,
  psqlCommand = "psql",
  pgDumpCommand = "pg_dump",
  restoreDatabaseUrl = "",
  allowRestoreReset,
  commandRunner = spawnSync,
  checkedAt = new Date().toISOString(),
  tempDirFactory = () => mkdtempSync(join(tmpdir(), "erp-v1-pg-restore-")),
} = {}) {
  const sourceDatabaseUrl = getDatabaseUrl(env);
  const restoreUrl = cleanString(restoreDatabaseUrl) || getRestoreDatabaseUrl(env);
  const resetAllowed = Boolean(allowRestoreReset || truthyEnv(env.ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED));
  const state = {
    sourceDatabaseUrl,
    restoreUrl,
    resetAllowed,
    tempDir: "",
    schemaDumpPath: "",
    dataDumpPath: "",
    dumpFileRemoved: true,
    restoreDatabaseReset: false,
    schemaDumpBytes: 0,
    migrationDataDumpBytes: 0,
    schemaDumpSha256: "",
    migrationDataDumpSha256: "",
  };
  const context = { psqlCommand, pgDumpCommand, commandRunner, state };
  const criteria = [];

  criteria.push(checkSourceDatabaseUrlConfigured(sourceDatabaseUrl));
  criteria.push(checkRestoreDatabaseUrlConfigured(restoreUrl));
  criteria.push(checkRestoreTargetSeparated(sourceDatabaseUrl, restoreUrl));
  criteria.push(checkRestoreResetAllowed(resetAllowed, restoreUrl));
  criteria.push(checkCommandAvailable({ ...context, command: pgDumpCommand, key: "pg-dump-client-available", label: "pg_dump 客户端" }));
  criteria.push(checkCommandAvailable({ ...context, command: psqlCommand, key: "psql-client-available", label: "psql 客户端" }));

  try {
    const dumpPrerequisites = [
      "source-database-url-configured",
      "restore-database-url-configured",
      "restore-target-separated",
      "restore-reset-allowed",
      "pg-dump-client-available",
    ];
    if (!hasBlocking(criteria, dumpPrerequisites)) {
      state.tempDir = tempDirFactory();
      state.schemaDumpPath = join(state.tempDir, "schema.sql");
      state.dataDumpPath = join(state.tempDir, "schema-migrations-data.sql");
      criteria.push(runSchemaDump(context));
      criteria.push(runSchemaMigrationsDataDump(context));
    } else {
      criteria.push(blockedBecausePrerequisite("schema-dump-created", "生产 schema 备份抽样", "缺少生产库连接、恢复验证库授权或 pg_dump 客户端。"));
      criteria.push(blockedBecausePrerequisite("schema-migrations-data-dump", "迁移记录数据抽样", "缺少生产库连接、恢复验证库授权或 pg_dump 客户端。"));
    }

    const restorePrerequisites = [
      "restore-database-url-configured",
      "restore-target-separated",
      "restore-reset-allowed",
      "psql-client-available",
      "schema-dump-created",
      "schema-migrations-data-dump",
    ];
    if (!hasBlocking(criteria, restorePrerequisites)) {
      criteria.push(resetRestoreDatabase(context));
      criteria.push(restoreDumpFile(context, "schema-dump-restored", "生产 schema 恢复验证", state.schemaDumpPath));
      criteria.push(restoreDumpFile(context, "schema-migrations-data-restored", "迁移记录数据恢复验证", state.dataDumpPath));
      criteria.push(validateRestoredDatabase(context));
    } else {
      criteria.push(blockedBecausePrerequisite("restore-database-reset", "恢复验证库重置", "恢复验证前置条件未满足。"));
      criteria.push(blockedBecausePrerequisite("schema-dump-restored", "生产 schema 恢复验证", "恢复验证前置条件未满足。"));
      criteria.push(blockedBecausePrerequisite("schema-migrations-data-restored", "迁移记录数据恢复验证", "恢复验证前置条件未满足。"));
      criteria.push(blockedBecausePrerequisite("restored-database-validated", "恢复结果抽样校验", "恢复验证前置条件未满足。"));
    }
  } finally {
    if (state.tempDir && existsSync(state.tempDir)) {
      rmSync(state.tempDir, { recursive: true, force: true });
      state.dumpFileRemoved = !existsSync(state.tempDir);
    }
  }

  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const warningCount = criteria.filter((item) => item.status === "warning").length;
  const blockingCriteria = criteria.filter((item) => item.status === "blocked");
  const ready = blockingCriteria.length === 0;

  return {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_production_postgres_backup_restore_check",
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
      warningCount,
      requiredTableCount: requiredTables.length,
      schemaDumpBytes: state.schemaDumpBytes,
      migrationDataDumpBytes: state.migrationDataDumpBytes,
      envFileSource,
      envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
      envFileFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    criteria,
    blockingCriteria,
    safeguards: {
      sourceDatabaseReadOnly: true,
      sourceDatabaseMutated: false,
      restoreDatabaseMutated: state.restoreDatabaseReset,
      restoreResetExplicitlyAllowed: resetAllowed,
      dumpFilesRemoved: state.dumpFileRemoved,
      dumpContentIncluded: false,
      dumpLocalPathExposed: false,
      sourceDatabaseUrlExposed: false,
      restoreDatabaseUrlExposed: false,
      passwordExposed: false,
      rawPsqlErrorExposed: false,
      envFileReadFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    nextActions: buildNextActions({ ready, blockingCriteria }),
  };
}

function formatProductionPostgresBackupRestoreCheck(report) {
  const lines = [
    `V1 production PostgreSQL backup/restore check: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Env files checked: ${Number(report.envFileCount) || 0}`,
    `Env file source: ${report.envFileSourceLabel || productionEnvFileSourceLabel(report.envFileSource)}`,
    "",
    "Criteria:",
  ];
  for (const criterion of report.criteria) {
    lines.push(`- ${criterion.status.toUpperCase()} ${criterion.label}: ${criterion.detail}`);
    if (criterion.nextAction && criterion.status !== "passed") lines.push(`  - Next: ${criterion.nextAction}`);
  }
  lines.push(
    "",
    "Safeguards:",
    `- Source database read-only: ${yesNo(report.safeguards.sourceDatabaseReadOnly)}`,
    `- Source database mutated: ${yesNo(report.safeguards.sourceDatabaseMutated)}`,
    `- Restore database reset explicitly allowed: ${yesNo(report.safeguards.restoreResetExplicitlyAllowed)}`,
    `- Restore database mutated: ${yesNo(report.safeguards.restoreDatabaseMutated)}`,
    `- Dump files removed: ${yesNo(report.safeguards.dumpFilesRemoved)}`,
    `- Dump content included: ${yesNo(report.safeguards.dumpContentIncluded)}`,
    `- Database URLs exposed: ${yesNo(report.safeguards.sourceDatabaseUrlExposed || report.safeguards.restoreDatabaseUrlExposed)}`,
    `- Env file read from production setup: ${yesNo(report.safeguards.envFileReadFromProductionSetup)}`,
  );
  if (report.nextActions.length > 0) {
    lines.push("", report.ready ? "Next:" : "Next blockers:");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }
  lines.push("");
  return lines.join("\n");
}

function checkSourceDatabaseUrlConfigured(sourceDatabaseUrl) {
  if (sourceDatabaseUrl) {
    return passedCriterion({
      key: "source-database-url-configured",
      label: "生产 PostgreSQL 源库连接串",
      detail: "已从安全 env 读取生产 PostgreSQL 源库连接；报告不输出连接串。",
      evidence: { configured: true, sourceVariables: ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"] },
    });
  }
  return blockedCriterion({
    key: "source-database-url-configured",
    label: "生产 PostgreSQL 源库连接串",
    detail: "未配置 ERP_V1_DATABASE_URL、DATABASE_URL 或 PGURL。",
    nextAction: "把真实生产 PostgreSQL 连接串写入安全未跟踪 env 文件后重跑本检查。",
    evidence: { configured: false, sourceVariables: ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"] },
  });
}

function checkRestoreDatabaseUrlConfigured(restoreUrl) {
  if (restoreUrl) {
    return passedCriterion({
      key: "restore-database-url-configured",
      label: "恢复验证库连接串",
      detail: "已配置专用恢复验证库；报告不输出连接串。",
      evidence: { configured: true, sourceVariables: restoreUrlEnvKeys },
    });
  }
  return blockedCriterion({
    key: "restore-database-url-configured",
    label: "恢复验证库连接串",
    detail: "未配置专用恢复验证库。",
    nextAction: `配置 ${restoreUrlEnvKeys[0]}，该库必须是可重置的验证库，不得指向生产业务库。`,
    evidence: { configured: false, sourceVariables: restoreUrlEnvKeys },
  });
}

function checkRestoreTargetSeparated(sourceDatabaseUrl, restoreUrl) {
  if (!sourceDatabaseUrl || !restoreUrl) {
    return blockedCriterion({
      key: "restore-target-separated",
      label: "恢复验证库隔离",
      detail: "源库或恢复验证库未配置，无法确认两者隔离。",
      nextAction: "先配置生产源库和专用恢复验证库连接串。",
      evidence: { comparable: false },
    });
  }
  const sourceTarget = parsePostgresConnectionTarget(sourceDatabaseUrl);
  const restoreTarget = parsePostgresConnectionTarget(restoreUrl);
  if (!sourceTarget.parsed || !restoreTarget.parsed) {
    return blockedCriterion({
      key: "restore-target-separated",
      label: "恢复验证库隔离",
      detail: "源库或恢复验证库连接串无法安全解析，禁止执行恢复重置。",
      nextAction: "使用标准 PostgreSQL URL 或 host/port/dbname 连接串，并确认恢复验证库是单独可重置数据库后重跑。",
      evidence: {
        comparable: false,
        sourceParsed: sourceTarget.parsed,
        restoreParsed: restoreTarget.parsed,
        sameConnectionString: sourceDatabaseUrl === restoreUrl,
      },
    });
  }
  const samePhysicalTarget = sourceTarget.fingerprint === restoreTarget.fingerprint;
  if (sourceDatabaseUrl === restoreUrl || samePhysicalTarget) {
    return blockedCriterion({
      key: "restore-target-separated",
      label: "恢复验证库隔离",
      detail: samePhysicalTarget
        ? "恢复验证库与生产源库指向同一 host/port/database，禁止执行恢复重置。"
        : "恢复验证库连接串与生产源库相同，禁止执行恢复重置。",
      nextAction: "准备单独的恢复验证库，确认不会覆盖生产业务库后重跑。",
      evidence: {
        comparable: true,
        comparison: "host_port_database",
        sameConnectionString: sourceDatabaseUrl === restoreUrl,
        samePhysicalTarget,
      },
    });
  }
  return passedCriterion({
    key: "restore-target-separated",
    label: "恢复验证库隔离",
    detail: "恢复验证库与生产源库的 host/port/database 不同。",
    evidence: {
      comparable: true,
      comparison: "host_port_database",
      sameConnectionString: false,
      samePhysicalTarget: false,
    },
  });
}

function parsePostgresConnectionTarget(value) {
  const text = cleanString(value);
  if (!text) return { parsed: false, fingerprint: "" };
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
    const key = match[1].toLowerCase();
    fields[key] = unquoteConnectionValue(match[2]);
  }
  return fields;
}

function unquoteConnectionValue(value) {
  const text = cleanString(value);
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).replace(/\\(['"])/g, "$1");
  }
  return text;
}

function normalizeConnectionComponent(value) {
  return cleanString(value).toLowerCase();
}

function checkRestoreResetAllowed(resetAllowed, restoreUrl) {
  if (!restoreUrl) {
    return blockedCriterion({
      key: "restore-reset-allowed",
      label: "恢复验证库重置授权",
      detail: "恢复验证库未配置，不能授权重置。",
      nextAction: "先配置专用恢复验证库。",
      evidence: { allowed: false },
    });
  }
  if (!resetAllowed) {
    return blockedCriterion({
      key: "restore-reset-allowed",
      label: "恢复验证库重置授权",
      detail: "未显式允许重置恢复验证库；脚本不会清空任何数据库。",
      nextAction:
        "确认连接串指向专用验证库后，运行命令显式传 --allow-restore-reset；安全生产 env 中不要长期保留 ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=true。",
      evidence: { allowed: false },
    });
  }
  return passedCriterion({
    key: "restore-reset-allowed",
    label: "恢复验证库重置授权",
    detail: "已显式允许重置专用恢复验证库 public schema。",
    evidence: { allowed: true },
  });
}

function checkCommandAvailable({ commandRunner, command, key, label }) {
  const result = runCommand(commandRunner, command, ["--version"]);
  if (!result.ok) {
    return blockedCriterion({
      key,
      label,
      detail: `当前机器无法执行 ${label.replace(" 客户端", "")}。`,
      nextAction: `在执行检查的机器安装 PostgreSQL client tools，或用对应 --*-command 指向可执行文件。`,
      evidence: { commandConfigured: Boolean(command), versionReadable: false },
    });
  }
  return passedCriterion({
    key,
    label,
    detail: `${label.replace(" 客户端", "")} 可执行。`,
    evidence: { commandConfigured: true, versionReadable: true },
  });
}

function runSchemaDump({ commandRunner, pgDumpCommand, state }) {
  const result = runCommand(commandRunner, pgDumpCommand, [
    state.sourceDatabaseUrl,
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--file",
    state.schemaDumpPath,
  ]);
  if (!result.ok) {
    return blockedCriterion({
      key: "schema-dump-created",
      label: "生产 schema 备份抽样",
      detail: result.safeError || "生产 schema dump 失败。",
      nextAction: "检查生产库连接、pg_dump 版本兼容性和当前角色读取 schema 的权限。",
      evidence: { dumpCreated: false },
    });
  }
  const metadata = readDumpMetadata(state.schemaDumpPath);
  state.schemaDumpBytes = metadata.bytes;
  state.schemaDumpSha256 = metadata.sha256;
  if (metadata.bytes <= 0) {
    return blockedCriterion({
      key: "schema-dump-created",
      label: "生产 schema 备份抽样",
      detail: "生产 schema dump 文件为空。",
      nextAction: "检查 pg_dump 输出目标和源库 schema 权限。",
      evidence: { dumpCreated: false, bytes: metadata.bytes },
    });
  }
  return passedCriterion({
    key: "schema-dump-created",
    label: "生产 schema 备份抽样",
    detail: "已生成生产 schema-only dump；报告只保留大小，不输出 dump 内容或本地路径。",
    evidence: { dumpCreated: true, bytes: metadata.bytes, sha256RecordedInternally: Boolean(metadata.sha256) },
  });
}

function runSchemaMigrationsDataDump({ commandRunner, pgDumpCommand, state }) {
  const result = runCommand(commandRunner, pgDumpCommand, [
    state.sourceDatabaseUrl,
    "--data-only",
    "--table",
    "schema_migrations",
    "--column-inserts",
    "--file",
    state.dataDumpPath,
  ]);
  if (!result.ok) {
    return blockedCriterion({
      key: "schema-migrations-data-dump",
      label: "迁移记录数据抽样",
      detail: result.safeError || "schema_migrations 数据 dump 失败。",
      nextAction: "确认生产库已执行迁移并允许读取 schema_migrations。",
      evidence: { dumpCreated: false },
    });
  }
  const metadata = readDumpMetadata(state.dataDumpPath);
  state.migrationDataDumpBytes = metadata.bytes;
  state.migrationDataDumpSha256 = metadata.sha256;
  if (metadata.bytes <= 0) {
    return blockedCriterion({
      key: "schema-migrations-data-dump",
      label: "迁移记录数据抽样",
      detail: "schema_migrations 数据 dump 文件为空。",
      nextAction: "确认 schema_migrations 已存在且包含生产迁移记录。",
      evidence: { dumpCreated: false, bytes: metadata.bytes },
    });
  }
  return passedCriterion({
    key: "schema-migrations-data-dump",
    label: "迁移记录数据抽样",
    detail: "已生成 schema_migrations data-only dump，用于验证恢复后迁移记录可读。",
    evidence: { dumpCreated: true, bytes: metadata.bytes, sha256RecordedInternally: Boolean(metadata.sha256) },
  });
}

function resetRestoreDatabase({ commandRunner, psqlCommand, state }) {
  const result = runPsql(commandRunner, psqlCommand, state.restoreUrl, `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
`);
  if (!result.ok) {
    return blockedCriterion({
      key: "restore-database-reset",
      label: "恢复验证库重置",
      detail: result.safeError || "恢复验证库 public schema 重置失败。",
      nextAction: "确认恢复验证库连接串、权限和该库可被重置；不要使用生产业务库。",
      evidence: { resetCompleted: false },
    });
  }
  state.restoreDatabaseReset = true;
  return passedCriterion({
    key: "restore-database-reset",
    label: "恢复验证库重置",
    detail: "专用恢复验证库 public schema 已重置。",
    evidence: { resetCompleted: true, productionDatabaseMutated: false },
  });
}

function restoreDumpFile({ commandRunner, psqlCommand, state }, key, label, dumpFile) {
  const result = runCommand(commandRunner, psqlCommand, [state.restoreUrl, "-X", "-v", "ON_ERROR_STOP=1", "--file", dumpFile]);
  if (!result.ok) {
    return blockedCriterion({
      key,
      label,
      detail: result.safeError || `${label}失败。`,
      nextAction: "检查 dump 文件兼容性、恢复验证库权限和 PostgreSQL 版本。",
      evidence: { restored: false },
    });
  }
  return passedCriterion({
    key,
    label,
    detail: `${label}通过。`,
    evidence: { restored: true, productionDatabaseMutated: false },
  });
}

function validateRestoredDatabase({ commandRunner, psqlCommand, state }) {
  const tableResult = runPsql(
    commandRunner,
    psqlCommand,
    state.restoreUrl,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;`,
    { capture: true },
  );
  if (!tableResult.ok) {
    return blockedCriterion({
      key: "restored-database-validated",
      label: "恢复结果抽样校验",
      detail: tableResult.safeError || "无法读取恢复验证库表清单。",
      nextAction: "检查恢复验证库 schema 是否成功恢复。",
      evidence: { validated: false },
    });
  }
  const existing = new Set(String(tableResult.stdout || "").split("\n").map((line) => line.trim()).filter(Boolean));
  const missing = requiredTables.filter((table) => !existing.has(table));
  const migrationResult = runPsql(commandRunner, psqlCommand, state.restoreUrl, "SELECT COUNT(*) FROM schema_migrations;", {
    capture: true,
  });
  if (!migrationResult.ok) {
    return blockedCriterion({
      key: "restored-database-validated",
      label: "恢复结果抽样校验",
      detail: migrationResult.safeError || "恢复后无法读取 schema_migrations。",
      nextAction: "检查 schema_migrations 数据抽样是否成功恢复。",
      evidence: { validated: false, missingTableCount: missing.length },
    });
  }
  const migrationRowCount = Number(String(migrationResult.stdout || "").trim());
  const passed = missing.length === 0 && migrationRowCount > 0;
  return criterion({
    key: "restored-database-validated",
    label: "恢复结果抽样校验",
    status: passed ? "passed" : "blocked",
    detail: passed
      ? `恢复验证库表结构和 schema_migrations 抽样通过：核心表 ${requiredTables.length}/${requiredTables.length}，迁移记录 ${migrationRowCount} 行。`
      : `恢复验证库抽样未通过：缺核心表 ${missing.length} 个，迁移记录 ${Number.isFinite(migrationRowCount) ? migrationRowCount : 0} 行。`,
    nextAction: passed ? "" : "重新执行 schema dump / 恢复验证，确认恢复验证库为空库且迁移记录 data dump 可恢复。",
    evidence: {
      validated: passed,
      expectedTableCount: requiredTables.length,
      existingRequiredTableCount: requiredTables.length - missing.length,
      missingTableCount: missing.length,
      firstMissingTables: missing.slice(0, 8),
      migrationRowCount: Number.isFinite(migrationRowCount) ? migrationRowCount : 0,
    },
  });
}

function runPsql(commandRunner, psqlCommand, databaseUrl, sql, options = {}) {
  const result = runCommand(commandRunner, psqlCommand, [
    databaseUrl,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    sql,
  ]);
  if (!result.ok) return result;
  return { ok: true, stdout: options.capture ? String(result.stdout || "") : "" };
}

function runCommand(commandRunner, command, args) {
  try {
    const result = commandRunner(command, args, { encoding: "utf8" });
    if (result.error) return { ok: false, safeError: redactSensitiveText(result.error.message || String(result.error)) };
    if (result.status !== 0) {
      return {
        ok: false,
        safeError: redactSensitiveText(result.stderr || result.stdout || `${command} exited with status ${result.status}`),
      };
    }
    return { ok: true, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
  } catch (error) {
    return { ok: false, safeError: redactSensitiveText(error?.message || String(error)) };
  }
}

function readDumpMetadata(path) {
  if (!path || !existsSync(path)) return { bytes: 0, sha256: "" };
  const buffer = readFileSync(path);
  return {
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function writeReport(report, outputDir = defaultOutputDir) {
  const directory = resolve(outputDir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(directory, "latest.md"), formatProductionPostgresBackupRestoreCheck(report));
}

function getRestoreDatabaseUrl(env) {
  for (const key of restoreUrlEnvKeys) {
    const value = cleanString(env[key]);
    if (value && !isPlaceholderValue(value)) return value;
  }
  return "";
}

function hasBlocking(criteria, keys) {
  const set = new Set(keys);
  return criteria.some((item) => set.has(item.key) && item.status === "blocked");
}

function blockedBecausePrerequisite(key, label, detail) {
  return blockedCriterion({
    key,
    label,
    detail,
    nextAction: "先处理前置阻塞项后重跑本检查。",
    evidence: { skippedBecausePrerequisiteBlocked: true },
  });
}

function buildNextActions({ ready, blockingCriteria }) {
  if (ready) {
    return [
      "把本报告编号或 latest.md 留入现场证据：生产库备份策略和负责人已确认。",
      "把恢复验证结果留入现场证据：恢复演练或恢复样本已留档。",
      "继续执行对象存储 live 预检、生产 API runtime smoke 和第一阶段 closeout。",
    ];
  }
  return blockingCriteria.slice(0, 5).map((item) => item.nextAction || item.detail);
}

function criterion({ key, label, status, detail, nextAction = "", evidence = {} }) {
  return {
    key,
    label,
    status,
    ready: status === "passed",
    detail: redactSensitiveText(detail),
    nextAction: redactSensitiveText(nextAction),
    evidence,
  };
}

function passedCriterion(options) {
  return criterion({ ...options, status: "passed" });
}

function blockedCriterion(options) {
  return criterion({ ...options, status: "blocked" });
}

function truthyEnv(value) {
  return ["1", "true", "yes", "y", "on"].includes(cleanString(value).toLowerCase());
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function isPlaceholderValue(value) {
  const text = cleanString(value);
  return /<\s*(REPLACE_WITH|OPTIONAL)_?[A-Z0-9_ -]*\s*>/i.test(text) || /\bREPLACE_WITH_[A-Z0-9_]+\b/i.test(text);
}

function redactSensitiveText(value) {
  return redactPostgresText(value)
    .replace(/(?:\/private)?\/(?:var\/folders|var\/tmp|tmp)\/[^\s"',)]+/gi, "[redacted-temp-path]")
    .replace(/\/Users\/[^\s"',)]+/gi, "[redacted-local-path]")
    .replace(/--file\s+("[^"]+"|'[^']+'|[^\s"',)]+)/g, "--file [redacted-dump-path]");
}

export {
  buildProductionPostgresBackupRestoreCheck,
  formatProductionPostgresBackupRestoreCheck,
  parseArgs,
  redactSensitiveText,
};
