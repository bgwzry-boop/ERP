#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import { redactSensitiveText } from "./run-v1-production-postgres-preflight.mjs";

const defaultPsqlCommand = "psql";
const databaseUrlSourceNames = ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"];
const compatibleLegacyMigrationChecksums = Object.freeze({
  "0030_miniapp_order_intake": Object.freeze({
    current: "423c48ebede1b1bf54a1e308c132fde00fd2268b62d342f70d3430ac3ea213ad",
    applied: Object.freeze([
      "d9333a508b2f6867cc913246cd0fbdde1e4de214fa2eda49f927043a6b3fd5d6",
    ]),
  }),
});

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    runDbMigrations({
      options,
      baseEnv: process.env,
      commandRunner: spawnSync,
      logger: (line) => process.stdout.write(`${line}\n`),
    });
    process.exit(0);
  } catch (error) {
    process.stderr.write(`DB migration runner failed: ${redactMigrationText(error?.message || String(error))}\n`);
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    applyRequested: false,
    dryRunRequested: false,
    envFiles: [],
    psqlCommand: defaultPsqlCommand,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      options.applyRequested = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRunRequested = true;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
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

  const dryRun = options.dryRunRequested || !options.applyRequested;
  return {
    dryRun,
    apply: options.applyRequested && !dryRun,
    envFiles: options.envFiles,
    psqlCommand: options.psqlCommand || defaultPsqlCommand,
  };
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage:",
    "  node scripts/run-db-migrations.mjs --dry-run",
    "  node scripts/run-db-migrations.mjs --env-file <secure-env-file> --apply",
    "  ERP_V1_DATABASE_URL=postgres://... node scripts/run-db-migrations.mjs --apply",
    "",
    "Options:",
    "  --dry-run               Validate and print the ordered migration plan without connecting to a database.",
    "  --apply                 Apply pending migrations with psql and record them in schema_migrations.",
    "  --env-file <path>       Load KEY=VALUE lines before --apply. Can be repeated.",
    "  --psql-command <path>   PostgreSQL client command. Defaults to psql.",
    "",
    "Database URL priority for --apply:",
    "  ERP_V1_DATABASE_URL, then DATABASE_URL, then PGURL.",
    "",
    "The runner is redacted: it does not print database URLs, passwords, hosts, or raw psql stderr.",
  ].join("\n");
}

function runDbMigrations({
  options = parseArgs([]),
  baseEnv = process.env,
  commandRunner = spawnSync,
  logger = console.log,
} = {}) {
  const envFiles = options.envFiles || [];
  const migrations = loadMigrationFiles();
  const { createdTables } = validateMigrationSet(migrations);

  if (options.dryRun) {
    logger(`DB migration dry-run: ${migrations.length} files, ${createdTables.size} tables`);
    for (const migration of migrations) {
      logger(`- ${migration.id} (${migration.checksum.slice(0, 12)})`);
    }
    logger("Dry-run only. Use --env-file <secure-env-file> --apply to execute against PostgreSQL.");
    return {
      mode: "dry-run",
      appliedCount: 0,
      totalCount: migrations.length,
      createdTableCount: createdTables.size,
    };
  }

  const env = loadEnvironment({ envFiles, baseEnv });
  const databaseUrlConfig = getDatabaseUrl(env);
  if (!databaseUrlConfig.value) {
    throw new Error("ERP_V1_DATABASE_URL, DATABASE_URL, or PGURL is required for --apply.");
  }

  const context = {
    databaseUrl: databaseUrlConfig.value,
    psqlCommand: options.psqlCommand || defaultPsqlCommand,
    commandRunner,
  };

  assertPsqlAvailable(context);
  logger(`DB migration apply target: ${databaseUrlConfig.source}`);
  if (envFiles.length > 0) {
    logger(`Loaded env files: ${envFiles.length}`);
  }

  ensureMigrationTable(context);

  const appliedMigrations = readAppliedMigrations(context);
  const pendingMigrations = [];

  for (const migration of migrations) {
    const appliedChecksum = appliedMigrations.get(migration.id);
    if (!appliedChecksum) {
      pendingMigrations.push(migration);
      continue;
    }
    if (appliedChecksum !== migration.checksum) {
      if (isCompatibleLegacyMigrationChecksum(migration, appliedChecksum)) {
        logger(`Accepted audited legacy checksum for ${migration.id}; migration history was not rewritten`);
        continue;
      }
      throw new Error(
        `Migration checksum mismatch for ${migration.id}. Existing ${appliedChecksum}, current ${migration.checksum}`,
      );
    }
  }

  if (pendingMigrations.length === 0) {
    logger(`DB migrations already up to date: ${migrations.length} applied`);
    return {
      mode: "apply",
      databaseUrlSource: databaseUrlConfig.source,
      appliedCount: 0,
      pendingCount: 0,
      totalCount: migrations.length,
    };
  }

  for (const migration of pendingMigrations) {
    const sql = [
      "BEGIN;",
      migration.sql.trim(),
      `INSERT INTO schema_migrations (id, filename, checksum) VALUES (${sqlLiteral(migration.id)}, ${sqlLiteral(
        migration.filename,
      )}, ${sqlLiteral(migration.checksum)});`,
      "COMMIT;",
    ].join("\n\n");

    runPsql(context, sql);
    logger(`Applied ${migration.id}`);
  }

  logger(`DB migration apply complete: ${pendingMigrations.length} applied, ${migrations.length} total`);
  return {
    mode: "apply",
    databaseUrlSource: databaseUrlConfig.source,
    appliedCount: pendingMigrations.length,
    pendingCount: 0,
    totalCount: migrations.length,
  };
}

function isCompatibleLegacyMigrationChecksum(migration, appliedChecksum) {
  const compatibility = compatibleLegacyMigrationChecksums[migration.id];
  return Boolean(
    compatibility &&
    migration.checksum === compatibility.current &&
    compatibility.applied.includes(appliedChecksum),
  );
}

function getDatabaseUrl(env) {
  for (const source of databaseUrlSourceNames) {
    const value = String(env[source] || "").trim();
    if (value && !isPlaceholderValue(value)) return { source, value };
  }
  return { source: "", value: "" };
}

function assertPsqlAvailable(context) {
  let result;
  try {
    result = context.commandRunner(context.psqlCommand, ["--version"], { encoding: "utf8" });
  } catch (error) {
    throw new Error(redactMigrationText(error?.message || String(error)));
  }
  if (result.error || result.status !== 0) {
    throw new Error("psql is required for --apply. Install PostgreSQL client tools or run --dry-run.");
  }
}

function ensureMigrationTable(context) {
  runPsql(
    context,
    `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  );
}

function readAppliedMigrations(context) {
  const stdout = runPsql(context, "SELECT id || '|' || checksum FROM schema_migrations ORDER BY id;", {
    capture: true,
  });
  const rows = stdout
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);

  return new Map(rows.map((row) => row.split("|", 2)));
}

function runPsql(context, sql, options = {}) {
  let result;
  try {
    result = context.commandRunner(
      context.psqlCommand,
      [context.databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", sql],
      { encoding: "utf8" },
    );
  } catch (error) {
    throw new Error(redactMigrationText(error?.message || String(error)));
  }
  if (result.error) {
    throw new Error(redactMigrationText(result.error.message || String(result.error)));
  }
  if (result.status !== 0) {
    const safeMessage = redactMigrationText(result.stderr || result.stdout || `psql exited with status ${result.status}`);
    throw new Error(safeMessage);
  }
  return options.capture ? String(result.stdout || "") : "";
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function isPlaceholderValue(value) {
  const text = String(value ?? "").trim();
  return /<\s*(REPLACE_WITH|OPTIONAL)_?[A-Z0-9_ -]*\s*>/i.test(text) || /\bREPLACE_WITH_[A-Z0-9_]+\b/i.test(text);
}

function redactMigrationText(value) {
  return redactSensitiveText(value)
    .replace(/host name \"[^\"\s]+\"/gi, 'host name "[redacted-host]"')
    .replace(/server \"[^\"\s]+\"/gi, 'server "[redacted-host]"');
}

export {
  getDatabaseUrl,
  isCompatibleLegacyMigrationChecksum,
  parseArgs,
  redactMigrationText,
  runDbMigrations,
};
