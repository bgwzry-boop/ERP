import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildProductionPostgresBackupRestoreCheck,
  formatProductionPostgresBackupRestoreCheck,
  payrollAttendanceRestoreTables,
  redactSensitiveText,
} from "./run-v1-production-postgres-backup-restore-check.mjs";
import { requiredTables } from "./dbMigrationUtils.mjs";

const runnerScript = join(process.cwd(), "scripts", "run-v1-production-postgres-backup-restore-check.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-postgres-backup-restore");
const sensitiveSourceUrl = "postgres://erp_user:SUPER_SECRET_PASSWORD@prod-db.internal:5432/erp";
const sensitiveRestoreUrl = "postgres://restore_user:RESTORE_SECRET@restore-db.internal:5432/erp_restore";

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const blockedReport = buildProductionPostgresBackupRestoreCheck({
  env: {},
  checkedAt: "2026-07-08T00:00:00.000Z",
  commandRunner: fakePostgresToolsRunner(),
  tempDirFactory: () => join(tempRoot, "blocked-temp"),
});
assert.equal(blockedReport.ready, false);
assert.equal(blockedReport.status, "blocked");
assert.equal(blockedReport.criteria.find((item) => item.key === "source-database-url-configured")?.status, "blocked");
assert.equal(blockedReport.criteria.find((item) => item.key === "restore-database-url-configured")?.status, "blocked");
assertNoSensitiveOutput(JSON.stringify(blockedReport));

const readyReport = buildProductionPostgresBackupRestoreCheck({
  env: {
    ERP_V1_DATABASE_URL: sensitiveSourceUrl,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveRestoreUrl,
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "true",
  },
  envFiles: ["/secure/prod.env"],
  checkedAt: "2026-07-08T00:00:00.000Z",
  commandRunner: fakePostgresToolsRunner(),
  tempDirFactory: () => join(tempRoot, "ready-temp"),
});
assert.equal(readyReport.ready, true);
assert.equal(readyReport.status, "ready");
assert.equal(readyReport.summary.passedCount, readyReport.summary.totalCount);
assert.ok(readyReport.summary.schemaDumpBytes > 0);
assert.ok(readyReport.summary.migrationDataDumpBytes > 0);
assert.equal(readyReport.safeguards.sourceDatabaseMutated, false);
assert.equal(readyReport.safeguards.restoreDatabaseMutated, true);
assert.equal(readyReport.safeguards.dumpFilesRemoved, true);
assert.equal(readyReport.safeguards.dumpContentIncluded, false);
assert.equal(readyReport.criteria.find((item) => item.key === "restored-database-validated")?.evidence.missingTableCount, 0);
assert.equal(readyReport.summary.payrollAttendanceRequiredTableCount, payrollAttendanceRestoreTables.length);
assert.equal(
  readyReport.criteria.find((item) => item.key === "restored-database-validated")?.evidence.existingPayrollAttendanceTableCount,
  payrollAttendanceRestoreTables.length,
);
for (const table of payrollAttendanceRestoreTables) assert.ok(requiredTables.includes(table));
assert.ok(readyReport.nextActions.some((item) => item.includes("恢复演练")));
assertNoSensitiveOutput(JSON.stringify(readyReport));

const readyText = formatProductionPostgresBackupRestoreCheck(readyReport);
assert.match(readyText, /V1 production PostgreSQL backup\/restore check: READY/);
assert.match(readyText, /Source database read-only: yes/);
assert.match(readyText, /Restore database reset explicitly allowed: yes/);
assert.match(readyText, /Dump files removed: yes/);
assertNoSensitiveOutput(readyText);

const sameTargetReport = buildProductionPostgresBackupRestoreCheck({
  env: {
    ERP_V1_DATABASE_URL: sensitiveSourceUrl,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveSourceUrl,
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "true",
  },
  commandRunner: fakePostgresToolsRunner(),
  tempDirFactory: () => join(tempRoot, "same-target-temp"),
});
assert.equal(sameTargetReport.ready, false);
assert.equal(sameTargetReport.criteria.find((item) => item.key === "restore-target-separated")?.status, "blocked");
assert.equal(sameTargetReport.safeguards.restoreDatabaseMutated, false);
assertNoSensitiveOutput(JSON.stringify(sameTargetReport));

const samePhysicalTargetReport = buildProductionPostgresBackupRestoreCheck({
  env: {
    ERP_V1_DATABASE_URL: `${sensitiveSourceUrl}?sslmode=require`,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: "postgres://restore_user:RESTORE_SECRET@prod-db.internal:5432/erp?application_name=restore-check",
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "true",
  },
  commandRunner: fakePostgresToolsRunner(),
  tempDirFactory: () => join(tempRoot, "same-physical-target-temp"),
});
const samePhysicalTargetCriterion = samePhysicalTargetReport.criteria.find((item) => item.key === "restore-target-separated");
assert.equal(samePhysicalTargetReport.ready, false);
assert.equal(samePhysicalTargetCriterion?.status, "blocked");
assert.equal(samePhysicalTargetCriterion?.evidence.sameConnectionString, false);
assert.equal(samePhysicalTargetCriterion?.evidence.samePhysicalTarget, true);
assert.equal(samePhysicalTargetReport.safeguards.restoreDatabaseMutated, false);
assertNoSensitiveOutput(JSON.stringify(samePhysicalTargetReport));

const resetBlockedReport = buildProductionPostgresBackupRestoreCheck({
  env: {
    ERP_V1_DATABASE_URL: sensitiveSourceUrl,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveRestoreUrl,
  },
  commandRunner: fakePostgresToolsRunner(),
  tempDirFactory: () => join(tempRoot, "reset-blocked-temp"),
});
assert.equal(resetBlockedReport.ready, false);
assert.equal(resetBlockedReport.criteria.find((item) => item.key === "restore-reset-allowed")?.status, "blocked");
assert.equal(resetBlockedReport.safeguards.restoreDatabaseMutated, false);
assertNoSensitiveOutput(JSON.stringify(resetBlockedReport));

const missingRestoreTableReport = buildProductionPostgresBackupRestoreCheck({
  env: {
    ERP_V1_DATABASE_URL: sensitiveSourceUrl,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveRestoreUrl,
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "true",
  },
  commandRunner: fakePostgresToolsRunner({ missingRestoreTable: requiredTables[0] }),
  tempDirFactory: () => join(tempRoot, "missing-table-temp"),
});
assert.equal(missingRestoreTableReport.ready, false);
const restoreValidation = missingRestoreTableReport.criteria.find((item) => item.key === "restored-database-validated");
assert.equal(restoreValidation.status, "blocked");
assert.equal(restoreValidation.evidence.firstMissingTables[0], requiredTables[0]);
assertNoSensitiveOutput(JSON.stringify(missingRestoreTableReport));

const missingPayrollTableReport = buildProductionPostgresBackupRestoreCheck({
  env: {
    ERP_V1_DATABASE_URL: sensitiveSourceUrl,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveRestoreUrl,
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "true",
  },
  commandRunner: fakePostgresToolsRunner({ missingRestoreTable: "payroll_export_events" }),
  tempDirFactory: () => join(tempRoot, "missing-payroll-table-temp"),
});
assert.equal(missingPayrollTableReport.ready, false);
const payrollRestoreValidation = missingPayrollTableReport.criteria.find((item) => item.key === "restored-database-validated");
assert.equal(payrollRestoreValidation.status, "blocked");
assert.equal(payrollRestoreValidation.evidence.missingPayrollAttendanceTableCount, 1);
assert.deepEqual(payrollRestoreValidation.evidence.firstMissingPayrollAttendanceTables, ["payroll_export_events"]);
assertNoSensitiveOutput(JSON.stringify(missingPayrollTableReport));

const dumpErrorReport = buildProductionPostgresBackupRestoreCheck({
  env: {
    ERP_V1_DATABASE_URL: sensitiveSourceUrl,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveRestoreUrl,
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "true",
  },
  commandRunner: fakePostgresToolsRunner({ schemaDumpFails: true }),
  tempDirFactory: () => join(tempRoot, "dump-error-temp"),
});
assert.equal(dumpErrorReport.ready, false);
assert.equal(dumpErrorReport.criteria.find((item) => item.key === "schema-dump-created")?.status, "blocked");
assertNoSensitiveOutput(JSON.stringify(dumpErrorReport));

assert.equal(
  redactSensitiveText(
    `pg_dump failed for ${sensitiveSourceUrl} password=SUPER_SECRET_PASSWORD --file ${join(tempRoot, "secret.sql")}`,
  ),
  "pg_dump failed for [redacted-postgres-url] password=[redacted] --file [redacted-dump-path]",
);

const cliBlockedRun = await runCli(["--json", "--no-write"], { env: { PATH: process.env.PATH || "" } });
assert.equal(cliBlockedRun.status, 2, runFailureMessage("CLI without env should return blocked", cliBlockedRun));
const cliBlockedReport = JSON.parse(cliBlockedRun.stdout);
assert.equal(cliBlockedReport.ready, false);
assertNoSensitiveOutput(cliBlockedRun.stdout + cliBlockedRun.stderr);

console.log(
  "V1 production PostgreSQL backup/restore check passed: blocked env, ready fake dump/restore, target separation, reset authorization, restore validation blockers, CLI blocked path, and redaction are covered.",
);

function fakePostgresToolsRunner(options = {}) {
  return (command, args) => {
    if (args.includes("--version")) {
      return { status: 0, stdout: `${command} (PostgreSQL) 16.0\n`, stderr: "" };
    }
    if (command.includes("pg_dump")) {
      if (options.schemaDumpFails && args.includes("--schema-only")) {
        return {
          status: 1,
          stdout: "",
          stderr: `pg_dump: error: connection to server at "prod-db.internal" failed for ${sensitiveSourceUrl}`,
        };
      }
      const filePath = valueAfter(args, "--file");
      mkdirSync(dirname(filePath), { recursive: true });
      if (args.includes("--schema-only")) {
        writeFileSync(filePath, `CREATE TABLE schema_migrations (id text, checksum text);\n-- ${requiredTables.length} tables\n`);
      } else if (args.includes("--data-only")) {
        writeFileSync(filePath, "INSERT INTO schema_migrations (id, checksum) VALUES ('001', 'abc');\n");
      } else {
        return { status: 1, stdout: "", stderr: `unexpected pg_dump args ${args.join(" ")}` };
      }
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command.includes("psql")) {
      if (args.includes("--file")) return { status: 0, stdout: "", stderr: "" };
      const sql = args[args.length - 1] || "";
      if (/DROP SCHEMA IF EXISTS public/.test(sql)) return { status: 0, stdout: "", stderr: "" };
      if (/information_schema\.tables/.test(sql)) {
        return {
          status: 0,
          stdout: `${requiredTables.filter((table) => table !== options.missingRestoreTable).join("\n")}\n`,
          stderr: "",
        };
      }
      if (/COUNT\(\*\) FROM schema_migrations/.test(sql)) return { status: 0, stdout: "1\n", stderr: "" };
      return { status: 1, stdout: "", stderr: `unexpected psql SQL for ${sensitiveRestoreUrl}` };
    }
    return { status: 1, stdout: "", stderr: `unexpected command ${command}` };
  };
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function runCli(args, { env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerScript, ...args], {
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
  assert.doesNotMatch(text, /SUPER_SECRET_PASSWORD|RESTORE_SECRET|prod-db\.internal|restore-db\.internal|postgres:\/\/erp_user|postgres:\/\/restore_user|secret\.sql/i);
}
