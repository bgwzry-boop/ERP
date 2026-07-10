import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  buildProductionPostgresPreflight,
  formatProductionPostgresPreflight,
  redactSensitiveText,
} from "./run-v1-production-postgres-preflight.mjs";
import { loadMigrationFiles, requiredTableColumns, requiredTables } from "./dbMigrationUtils.mjs";

const runnerScript = join(process.cwd(), "scripts", "run-v1-production-postgres-preflight.mjs");
const migrations = loadMigrationFiles();
const sensitiveDatabaseUrl = "postgres://erp_user:SUPER_SECRET_PASSWORD@prod-db.internal:5432/erp";

const blockedReport = buildProductionPostgresPreflight({
  env: {},
  checkedAt: "2026-07-08T00:00:00.000Z",
  commandRunner: fakePsqlRunner(),
});
assert.equal(blockedReport.ready, false);
assert.equal(blockedReport.status, "blocked");
assert.equal(blockedReport.criteria.find((item) => item.key === "database-url-configured")?.status, "blocked");
assert.ok(blockedReport.criteria.every((item) => item.status === "blocked"), "empty env should block every PostgreSQL criterion");
assertNoSensitiveOutput(JSON.stringify(blockedReport));

const readyReport = buildProductionPostgresPreflight({
  env: { ERP_V1_DATABASE_URL: sensitiveDatabaseUrl },
  envFiles: ["/secure/prod.env"],
  checkedAt: "2026-07-08T00:00:00.000Z",
  commandRunner: fakePsqlRunner(),
});
assert.equal(readyReport.ready, true);
assert.equal(readyReport.status, "ready");
assert.equal(readyReport.summary.passedCount, readyReport.summary.totalCount);
assert.equal(readyReport.summary.migrationCount, migrations.length);
assert.equal(readyReport.summary.requiredTableCount, requiredTables.length);
assert.equal(readyReport.criteria.find((item) => item.key === "schema-migrations")?.evidence.appliedMigrationCount, migrations.length);
assert.equal(readyReport.criteria.find((item) => item.key === "required-tables")?.evidence.missingTableCount, 0);
assert.equal(readyReport.criteria.find((item) => item.key === "required-columns")?.evidence.missingColumnCount, 0);
assert.equal(readyReport.criteria.find((item) => item.key === "core-privileges")?.evidence.missingPrivilegeCount, 0);
assert.equal(readyReport.criteria.find((item) => item.key === "temporary-write-probe")?.evidence.businessTablesMutated, false);
assert.ok(readyReport.nextActions.some((item) => item.includes("现场证据")));
assertNoSensitiveOutput(JSON.stringify(readyReport));

const readyText = formatProductionPostgresPreflight(readyReport);
assert.match(readyText, /V1 production PostgreSQL preflight: READY/);
assert.match(readyText, /TEMP write probe rolled back: yes/);
assert.match(readyText, /Database URL exposed: no/);
assertNoSensitiveOutput(readyText);

const migrationBlockedReport = buildProductionPostgresPreflight({
  env: { ERP_V1_DATABASE_URL: sensitiveDatabaseUrl },
  commandRunner: fakePsqlRunner({ omitMigrationId: migrations[0].id }),
});
assert.equal(migrationBlockedReport.ready, false);
const migrationCriterion = migrationBlockedReport.criteria.find((item) => item.key === "schema-migrations");
assert.equal(migrationCriterion.status, "blocked");
assert.equal(migrationCriterion.evidence.missingMigrationCount, 1);
assert.equal(migrationCriterion.evidence.firstMissingMigrationIds[0], migrations[0].id);
assertNoSensitiveOutput(JSON.stringify(migrationBlockedReport));

const tableBlockedReport = buildProductionPostgresPreflight({
  env: { ERP_V1_DATABASE_URL: sensitiveDatabaseUrl },
  commandRunner: fakePsqlRunner({ omitTable: requiredTables[0] }),
});
assert.equal(tableBlockedReport.ready, false);
const tableCriterion = tableBlockedReport.criteria.find((item) => item.key === "required-tables");
assert.equal(tableCriterion.status, "blocked");
assert.equal(tableCriterion.evidence.firstMissingTables[0], requiredTables[0]);
assertNoSensitiveOutput(JSON.stringify(tableBlockedReport));

const privilegeBlockedReport = buildProductionPostgresPreflight({
  env: { ERP_V1_DATABASE_URL: sensitiveDatabaseUrl },
  commandRunner: fakePsqlRunner({ denyPrivilegeTable: "attachments" }),
});
assert.equal(privilegeBlockedReport.ready, false);
const privilegeCriterion = privilegeBlockedReport.criteria.find((item) => item.key === "core-privileges");
assert.equal(privilegeCriterion.status, "blocked");
assert.ok(privilegeCriterion.evidence.firstMissingPrivileges.includes("attachments:INSERT"));
assertNoSensitiveOutput(JSON.stringify(privilegeBlockedReport));

const connectionErrorReport = buildProductionPostgresPreflight({
  env: { ERP_V1_DATABASE_URL: sensitiveDatabaseUrl },
  commandRunner: fakePsqlRunner({ connectionFails: true }),
});
assert.equal(connectionErrorReport.ready, false);
assertNoSensitiveOutput(JSON.stringify(connectionErrorReport));
assert.equal(
  redactSensitiveText("psql: error: connection to server at \"prod-db.internal\", password=SUPER_SECRET_PASSWORD postgres://erp:secret@prod-db.internal/db"),
  'psql: error: connection to server at "[redacted-host]", password=[redacted] [redacted-postgres-url]',
);

const cliBlockedRun = await runCli({ env: { PATH: process.env.PATH || "" } });
assert.equal(cliBlockedRun.status, 2, runFailureMessage("CLI without database URL should return blocked", cliBlockedRun));
const cliBlockedReport = JSON.parse(cliBlockedRun.stdout);
assert.equal(cliBlockedReport.ready, false);
assert.equal(cliBlockedReport.criteria.find((item) => item.key === "database-url-configured")?.status, "blocked");
assertNoSensitiveOutput(cliBlockedRun.stdout + cliBlockedRun.stderr);

console.log(
  "V1 production PostgreSQL preflight check passed: blocked env, ready fake PostgreSQL, migrations, tables, privileges, temp write probe, CLI blocked path, and redaction are covered.",
);

function fakePsqlRunner(options = {}) {
  return (command, args) => {
    if (args.includes("--version")) {
      return { status: 0, stdout: "psql (PostgreSQL) 16.0\n", stderr: "" };
    }
    const sql = args[args.length - 1] || "";
    if (options.connectionFails && /current_database\(\)/.test(sql)) {
      return {
        status: 2,
        stdout: "",
        stderr: `psql: error: connection to server at "prod-db.internal" failed for ${sensitiveDatabaseUrl}`,
      };
    }
    if (/current_database\(\)/.test(sql)) return { status: 0, stdout: "t|t|t\n", stderr: "" };
    if (/FROM schema_migrations/.test(sql)) {
      return {
        status: 0,
        stdout: migrations
          .filter((migration) => migration.id !== options.omitMigrationId)
          .map((migration) => `${migration.id}|${migration.checksum}`)
          .join("\n"),
        stderr: "",
      };
    }
    if (/information_schema\.tables/.test(sql)) {
      return {
        status: 0,
        stdout: requiredTables.filter((table) => table !== options.omitTable).sort().join("\n"),
        stderr: "",
      };
    }
    if (/information_schema\.columns/.test(sql)) {
      const rows = [];
      for (const [table, columns] of Object.entries(requiredTableColumns)) {
        for (const column of columns) rows.push(`${table}|${column}`);
      }
      return { status: 0, stdout: `${rows.join("\n")}\n`, stderr: "" };
    }
    if (/has_table_privilege/.test(sql)) {
      const tables = [
        "attachments",
        "customers",
        "fulfillment_records",
        "inventory_items",
        "operation_logs",
        "order_lines",
        "original_orders",
        "statements",
        "users",
      ];
      return {
        status: 0,
        stdout: `${tables
          .map((table) =>
            table === options.denyPrivilegeTable ? `${table}|t|f|t` : `${table}|t|t|t`,
          )
          .join("\n")}\n`,
        stderr: "",
      };
    }
    if (/erp_v1_preflight_probe/.test(sql)) return { status: 0, stdout: "t\n", stderr: "" };
    return { status: 1, stdout: "", stderr: `unexpected SQL for ${command}` };
  };
}

function runCli({ env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerScript, "--json"], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function runFailureMessage(label, run) {
  return `${label}\nstatus=${run.status}\nstdout=${run.stdout}\nstderr=${run.stderr}`;
}

function assertNoSensitiveOutput(text) {
  assert.doesNotMatch(text, /SUPER_SECRET_PASSWORD|prod-db\.internal|postgres:\/\/erp_user|secret@prod-db/i);
}
