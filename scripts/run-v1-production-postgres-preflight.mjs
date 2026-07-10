#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import { loadMigrationFiles, requiredTableColumns, requiredTables, validateMigrationSet } from "./dbMigrationUtils.mjs";
import {
  defaultProductionEnvSetupJsonPath,
  productionEnvFileSourceLabel,
  resolveProductionEnvSetupEnvFiles,
} from "./productionEnvSetupEnvFileResolver.mjs";

const defaultCorePrivilegeTables = [
  "users",
  "customers",
  "original_orders",
  "order_lines",
  "inventory_items",
  "fulfillment_records",
  "statements",
  "attachments",
  "operation_logs",
];

if (isCliEntrypoint()) runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const env = loadEnvironment({ envFiles: options.envFiles, baseEnv: process.env });
    const report = buildProductionPostgresPreflight({
      env,
      envFiles: options.envFiles,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
      psqlCommand: options.psqlCommand,
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionPostgresPreflight(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactSensitiveText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production PostgreSQL preflight failed: ${message}\n`);
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
    json: false,
    psqlCommand: "psql",
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
  };
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
    if (arg === "--psql-command") {
      options.psqlCommand = readValue(args, index, arg);
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
    "Usage: node scripts/run-v1-production-postgres-preflight.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>                    Load secure production env file. Can be repeated.",
    "  --use-production-env-setup-env-file  Reuse the secure env file recorded by production env setup.",
    "  --production-env-setup-json <path>   Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --psql-command <path>                PostgreSQL client command. Defaults to psql.",
    "  --json                               Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Production PostgreSQL connection, migrations, tables, privileges, and temp write probe are ready",
    "  1  Runner error",
    "  2  Check is readable but still blocked for V1 production PostgreSQL",
    "",
    "This check is non-mutating for business data: the write probe uses a TEMP table inside a rolled-back transaction.",
    "The report is redacted: it does not print database URLs, passwords, hosts, or raw SQL stderr.",
  ].join("\n");
}

function buildProductionPostgresPreflight({
  env = process.env,
  envFiles = [],
  envFileSource = envFiles.length ? "cli" : "none",
  envFileSourceSummary = envFiles.length ? `${envFiles.length} 个命令行 env 文件` : "未传入 env 文件",
  envFileFromProductionSetup = false,
  psqlCommand = "psql",
  commandRunner = spawnSync,
  checkedAt = new Date().toISOString(),
} = {}) {
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  const databaseUrl = getDatabaseUrl(env);
  const context = {
    databaseUrl,
    psqlCommand,
    commandRunner,
    migrations,
  };

  const criteria = [
    checkDatabaseUrlConfigured(databaseUrl),
    checkPsqlAvailable(context),
    checkConnection(context),
    checkSchemaMigrations(context),
    checkRequiredTables(context),
    checkRequiredColumns(context),
    checkCorePrivileges(context),
    checkTemporaryWriteProbe(context),
  ];

  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const warningCount = criteria.filter((item) => item.status === "warning").length;
  const blockingCriteria = criteria.filter((item) => item.status === "blocked");
  const ready = blockingCriteria.length === 0;

  return {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_production_postgres_preflight",
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
      migrationCount: migrations.length,
      requiredTableCount: requiredTables.length,
      requiredColumnTableCount: Object.keys(requiredTableColumns).length,
      envFileSource,
      envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
      envFileFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    criteria,
    blockingCriteria,
    safeguards: {
      nonMutatingBusinessData: true,
      tempTableWriteProbeRolledBack: true,
      databaseUrlExposed: false,
      passwordExposed: false,
      rawPsqlErrorExposed: false,
      envFileReadFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    nextActions: buildNextActions({ ready, blockingCriteria }),
  };
}

function formatProductionPostgresPreflight(report) {
  const lines = [
    `V1 production PostgreSQL preflight: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
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
    `- Non-mutating business data: ${yesNo(report.safeguards.nonMutatingBusinessData)}`,
    `- TEMP write probe rolled back: ${yesNo(report.safeguards.tempTableWriteProbeRolledBack)}`,
    `- Database URL exposed: ${yesNo(report.safeguards.databaseUrlExposed)}`,
    `- Password exposed: ${yesNo(report.safeguards.passwordExposed)}`,
    `- Env file read from production setup: ${yesNo(report.safeguards.envFileReadFromProductionSetup)}`,
  );
  if (report.nextActions.length > 0) {
    lines.push("", report.ready ? "Next:" : "Next blockers:");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }
  lines.push("");
  return lines.join("\n");
}

function checkDatabaseUrlConfigured(databaseUrl) {
  if (databaseUrl) {
    return passedCriterion({
      key: "database-url-configured",
      label: "生产 PostgreSQL 连接串",
      detail: "已从安全 env 读取到 PostgreSQL 连接变量；报告不输出连接串。",
      evidence: { configured: true, sourceVariables: ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"] },
    });
  }
  return blockedCriterion({
    key: "database-url-configured",
    label: "生产 PostgreSQL 连接串",
    detail: "未配置 ERP_V1_DATABASE_URL、DATABASE_URL 或 PGURL。",
    nextAction: "把真实生产 PostgreSQL 连接串写入安全未跟踪 env 文件后重跑本预检。",
    evidence: { configured: false, sourceVariables: ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"] },
  });
}

function checkPsqlAvailable(context) {
  if (!context.databaseUrl) return blockedBecauseNoDatabase("psql-client-available", "psql 客户端");
  const result = context.commandRunner(context.psqlCommand, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return blockedCriterion({
      key: "psql-client-available",
      label: "psql 客户端",
      detail: "当前机器无法执行 psql。",
      nextAction: "在执行预检的机器安装 PostgreSQL client tools，或用 --psql-command 指向可用 psql。",
      evidence: { commandConfigured: Boolean(context.psqlCommand), versionReadable: false },
    });
  }
  return passedCriterion({
    key: "psql-client-available",
    label: "psql 客户端",
    detail: "psql 可执行，后续数据库查询可以运行。",
    evidence: { commandConfigured: true, versionReadable: true },
  });
}

function checkConnection(context) {
  if (!context.databaseUrl) return blockedBecauseNoDatabase("postgres-connection", "生产库连接");
  const result = runPsql(context, "SELECT current_database() IS NOT NULL, current_user IS NOT NULL, version() IS NOT NULL;", {
    capture: true,
  });
  if (!result.ok) {
    return blockedCriterion({
      key: "postgres-connection",
      label: "生产库连接",
      detail: result.safeError || "连接生产 PostgreSQL 失败。",
      nextAction: "检查数据库地址、网络、安全组、账号密码和 SSL 配置后重跑预检。",
      evidence: { connected: false },
    });
  }
  const columns = parseDelimitedRows(result.stdout)[0] || [];
  const passed = columns.every((item) => item === "t" || item === "true");
  if (!passed) {
    return blockedCriterion({
      key: "postgres-connection",
      label: "生产库连接",
      detail: "可以连接数据库，但基础连接上下文读取不完整。",
      nextAction: "让 DBA 检查当前连接角色和数据库可见性。",
      evidence: { connected: true, contextReadable: false },
    });
  }
  return passedCriterion({
    key: "postgres-connection",
    label: "生产库连接",
    detail: "生产库连接成功，数据库名、当前角色和版本信息均可读取。",
    evidence: { connected: true, databaseNameReadable: true, currentUserReadable: true, serverVersionReadable: true },
  });
}

function checkSchemaMigrations(context) {
  if (!context.databaseUrl) return blockedBecauseNoDatabase("schema-migrations", "迁移记录");
  const result = runPsql(context, "SELECT id || '|' || checksum FROM schema_migrations ORDER BY id;", { capture: true });
  if (!result.ok) {
    return blockedCriterion({
      key: "schema-migrations",
      label: "迁移记录",
      detail: result.safeError || "无法读取 schema_migrations。",
      nextAction: "先执行数据库迁移，再保留迁移输出或 DBA 复核记录。",
      evidence: { readable: false, expectedMigrationCount: context.migrations.length },
    });
  }
  const applied = new Map(
    result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("|", 2)),
  );
  const missing = context.migrations.filter((migration) => !applied.has(migration.id)).map((migration) => migration.id);
  const checksumMismatches = context.migrations
    .filter((migration) => applied.has(migration.id) && applied.get(migration.id) !== migration.checksum)
    .map((migration) => migration.id);
  const expectedIds = new Set(context.migrations.map((migration) => migration.id));
  const extra = Array.from(applied.keys()).filter((id) => !expectedIds.has(id));
  const status = missing.length || checksumMismatches.length ? "blocked" : extra.length ? "warning" : "passed";
  return criterion({
    key: "schema-migrations",
    label: "迁移记录",
    status,
    detail:
      status === "passed"
        ? `生产库迁移记录与本地 ${context.migrations.length} 个迁移一致。`
        : status === "warning"
          ? `生产库迁移记录与本地迁移一致，但存在 ${extra.length} 个额外迁移记录。`
          : `生产库迁移未对齐：缺 ${missing.length} 个，checksum 不一致 ${checksumMismatches.length} 个。`,
    nextAction:
      status === "passed"
        ? ""
        : "按受控变更流程执行或核对数据库迁移，并保留迁移记录编号。",
    evidence: {
      readable: true,
      expectedMigrationCount: context.migrations.length,
      appliedMigrationCount: applied.size,
      missingMigrationCount: missing.length,
      checksumMismatchCount: checksumMismatches.length,
      extraMigrationCount: extra.length,
      firstMissingMigrationIds: missing.slice(0, 5),
      firstChecksumMismatchMigrationIds: checksumMismatches.slice(0, 5),
    },
  });
}

function checkRequiredTables(context) {
  if (!context.databaseUrl) return blockedBecauseNoDatabase("required-tables", "核心表");
  const result = runPsql(
    context,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;",
    { capture: true },
  );
  if (!result.ok) {
    return blockedCriterion({
      key: "required-tables",
      label: "核心表",
      detail: result.safeError || "无法读取 public schema 表清单。",
      nextAction: "确认当前角色有 information_schema 读取权限，并确认迁移已执行。",
      evidence: { readable: false, expectedTableCount: requiredTables.length },
    });
  }
  const existing = new Set(result.stdout.split("\n").map((line) => line.trim()).filter(Boolean));
  const missing = requiredTables.filter((table) => !existing.has(table));
  return criterion({
    key: "required-tables",
    label: "核心表",
    status: missing.length ? "blocked" : "passed",
    detail: missing.length
      ? `核心表缺 ${missing.length} 个，生产库结构尚未满足 V1。`
      : `核心表已对齐：${requiredTables.length}/${requiredTables.length}。`,
    nextAction: missing.length ? "执行缺失迁移或让 DBA 核对 schema_migrations 与 public schema。" : "",
    evidence: {
      readable: true,
      expectedTableCount: requiredTables.length,
      existingRequiredTableCount: requiredTables.length - missing.length,
      missingTableCount: missing.length,
      firstMissingTables: missing.slice(0, 8),
    },
  });
}

function checkRequiredColumns(context) {
  if (!context.databaseUrl) return blockedBecauseNoDatabase("required-columns", "关键列");
  const tableNames = Object.keys(requiredTableColumns);
  const result = runPsql(
    context,
    `SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (${tableNames
      .map(sqlLiteral)
      .join(", ")}) ORDER BY table_name, ordinal_position;`,
    { capture: true },
  );
  if (!result.ok) {
    return blockedCriterion({
      key: "required-columns",
      label: "关键列",
      detail: result.safeError || "无法读取关键表列清单。",
      nextAction: "确认当前角色有 information_schema.columns 读取权限，并核对迁移。",
      evidence: { readable: false, checkedTableCount: tableNames.length },
    });
  }
  const existing = new Map();
  for (const [table, column] of parseDelimitedRows(result.stdout)) {
    if (!existing.has(table)) existing.set(table, new Set());
    existing.get(table).add(column);
  }
  const missing = [];
  for (const [table, columns] of Object.entries(requiredTableColumns)) {
    const actual = existing.get(table) || new Set();
    for (const column of columns) {
      if (!actual.has(column)) missing.push(`${table}.${column}`);
    }
  }
  return criterion({
    key: "required-columns",
    label: "关键列",
    status: missing.length ? "blocked" : "passed",
    detail: missing.length
      ? `关键列缺 ${missing.length} 个，部分 API / 仓储可能无法写入。`
      : `关键列已对齐：${tableNames.length} 张重点表通过。`,
    nextAction: missing.length ? "执行最新迁移并复核缺失列；不要手工改业务表绕过迁移。" : "",
    evidence: {
      readable: true,
      checkedTableCount: tableNames.length,
      missingColumnCount: missing.length,
      firstMissingColumns: missing.slice(0, 10),
    },
  });
}

function checkCorePrivileges(context) {
  if (!context.databaseUrl) return blockedBecauseNoDatabase("core-privileges", "核心表权限");
  const result = runPsql(
    context,
    `
WITH tables(table_name) AS (
  VALUES ${defaultCorePrivilegeTables.map((table) => `(${sqlLiteral(table)})`).join(", ")}
)
SELECT table_name || '|' ||
  has_table_privilege(format('%I.%I', 'public', table_name), 'SELECT') || '|' ||
  has_table_privilege(format('%I.%I', 'public', table_name), 'INSERT') || '|' ||
  has_table_privilege(format('%I.%I', 'public', table_name), 'UPDATE')
FROM tables
ORDER BY table_name;
`,
    { capture: true },
  );
  if (!result.ok) {
    return blockedCriterion({
      key: "core-privileges",
      label: "核心表权限",
      detail: result.safeError || "无法读取核心表权限。",
      nextAction: "让 DBA 复核当前连接角色对 V1 核心表的 SELECT / INSERT / UPDATE 权限。",
      evidence: { readable: false, checkedTableCount: defaultCorePrivilegeTables.length },
    });
  }
  const missing = [];
  for (const row of parseDelimitedRows(result.stdout)) {
    const [table, canSelect, canInsert, canUpdate] = row;
    if (!truthyPg(canSelect)) missing.push(`${table}:SELECT`);
    if (!truthyPg(canInsert)) missing.push(`${table}:INSERT`);
    if (!truthyPg(canUpdate)) missing.push(`${table}:UPDATE`);
  }
  return criterion({
    key: "core-privileges",
    label: "核心表权限",
    status: missing.length ? "blocked" : "passed",
    detail: missing.length
      ? `当前连接角色缺 ${missing.length} 项核心表权限。`
      : `当前连接角色具备 ${defaultCorePrivilegeTables.length} 张核心表 SELECT / INSERT / UPDATE 权限。`,
    nextAction: missing.length ? "按最小权限原则补齐应用账号权限，避免使用超级用户直接跑业务。" : "",
    evidence: {
      readable: true,
      checkedTableCount: defaultCorePrivilegeTables.length,
      missingPrivilegeCount: missing.length,
      firstMissingPrivileges: missing.slice(0, 10),
    },
  });
}

function checkTemporaryWriteProbe(context) {
  if (!context.databaseUrl) return blockedBecauseNoDatabase("temporary-write-probe", "临时写入探针");
  const result = runPsql(
    context,
    `
BEGIN;
CREATE TEMP TABLE erp_v1_preflight_probe (
  id TEXT PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
) ON COMMIT DROP;
INSERT INTO erp_v1_preflight_probe (id) VALUES ('probe');
SELECT COUNT(*) = 1 FROM erp_v1_preflight_probe;
ROLLBACK;
`,
    { capture: true },
  );
  if (!result.ok) {
    return blockedCriterion({
      key: "temporary-write-probe",
      label: "临时写入探针",
      detail: result.safeError || "临时表写入探针失败。",
      nextAction: "检查当前角色临时表 / 写入事务权限；该探针不会修改业务表。",
      evidence: { probeCompleted: false, businessTablesMutated: false },
    });
  }
  const passed = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean).some((line) => truthyPg(line));
  return criterion({
    key: "temporary-write-probe",
    label: "临时写入探针",
    status: passed ? "passed" : "blocked",
    detail: passed
      ? "临时表写入、读取和回滚通过；未修改业务表。"
      : "临时表写入探针没有返回成功结果。",
    nextAction: passed ? "" : "让 DBA 检查当前角色的临时对象和事务权限。",
    evidence: { probeCompleted: passed, businessTablesMutated: false },
  });
}

function blockedBecauseNoDatabase(key, label) {
  return blockedCriterion({
    key,
    label,
    detail: "生产 PostgreSQL 连接串未配置，跳过该项。",
    nextAction: "先配置安全 env 文件中的 ERP_V1_DATABASE_URL、DATABASE_URL 或 PGURL。",
    evidence: { skippedBecauseDatabaseUrlMissing: true },
  });
}

function runPsql(context, sql, options = {}) {
  try {
    const result = context.commandRunner(
      context.psqlCommand,
      [context.databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", sql],
      { encoding: "utf8" },
    );
    if (result.error) {
      return { ok: false, safeError: redactSensitiveText(result.error.message || String(result.error)) };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        safeError: redactSensitiveText(result.stderr || result.stdout || `psql exited with status ${result.status}`),
      };
    }
    return { ok: true, stdout: options.capture ? String(result.stdout || "") : "" };
  } catch (error) {
    return { ok: false, safeError: redactSensitiveText(error?.message || String(error)) };
  }
}

function getDatabaseUrl(env) {
  for (const key of ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"]) {
    const value = String(env[key] || "").trim();
    if (value && !isPlaceholderValue(value)) return value;
  }
  return "";
}

function parseDelimitedRows(stdout) {
  return String(stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|"));
}

function buildNextActions({ ready, blockingCriteria }) {
  if (ready) {
    return [
      "把本预检报告编号或输出留入现场证据：PostgreSQL 迁移已执行、账号权限已复核。",
      "继续补生产库备份策略、恢复演练样本和对象存储 live 证据。",
      "重新执行生产上线组合预检和 release candidate 刷新预检。",
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

function truthyPg(value) {
  return ["t", "true", "1", "yes"].includes(String(value || "").trim().toLowerCase());
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function isPlaceholderValue(value) {
  const text = String(value ?? "").trim();
  return /<\s*(REPLACE_WITH|OPTIONAL)_?[A-Z0-9_ -]*\s*>/i.test(text) || /\bREPLACE_WITH_[A-Z0-9_]+\b/i.test(text);
}

function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted-postgres-url]")
    .replace(/(password|passwd|pwd|secret|token|access[_-]?key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/:\/\/([^:\s/@]+):([^@\s/]+)@/g, "://[redacted-user]:[redacted-password]@")
    .replace(/at \"[^\"\s]+\"/g, 'at "[redacted-host]"')
    .replace(/host=[^\s]+/gi, "host=[redacted-host]");
}

export {
  buildProductionPostgresPreflight,
  formatProductionPostgresPreflight,
  getDatabaseUrl,
  parseArgs,
  redactSensitiveText,
};
