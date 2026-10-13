import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMigrationFiles } from "./dbMigrationUtils.mjs";
import {
  isAcceptedAppliedMigrationChecksum,
  parseArgs,
  redactMigrationText,
  runDbMigrations,
} from "./run-db-migrations.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "db-migration-runner");
rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

const sensitiveDatabaseUrl = "postgres://erp_user:SUPER_SECRET_PASSWORD@prod-db.internal:5432/erp";
const fallbackDatabaseUrl = "postgres://fallback_user:FALLBACK_SECRET@fallback-db.internal:5432/erp";
const secureEnvPath = join(storageRoot, "secure-production.env");
writeFileSync(
  secureEnvPath,
  [
    "ERP_V1_DATABASE_URL='postgres://erp_user:SUPER_SECRET_PASSWORD@prod-db.internal:5432/erp'",
    "DATABASE_URL='postgres://should_not:USE_THIS@wrong-db.internal:5432/erp'",
  ].join("\n"),
);

const parsed = parseArgs(["--apply", "--env-file", secureEnvPath, "--psql-command", "/usr/local/bin/psql"]);
assert.equal(parsed.apply, true);
assert.equal(parsed.dryRun, false);
assert.deepEqual(parsed.envFiles, [secureEnvPath]);
assert.equal(parsed.psqlCommand, "/usr/local/bin/psql");

const dryRunCalls = [];
const dryRunLogs = [];
const dryRunResult = runDbMigrations({
  options: parseArgs(["--dry-run", "--env-file", join(storageRoot, "not-needed.env")]),
  baseEnv: {},
  commandRunner: (...args) => {
    dryRunCalls.push(args);
    throw new Error("dry-run must not call psql");
  },
  logger: (line) => dryRunLogs.push(line),
});
assert.equal(dryRunResult.mode, "dry-run");
assert.equal(dryRunCalls.length, 0);
assert.ok(dryRunLogs.some((line) => line.includes("Dry-run only")));

const canonicalMiniappIntakeChecksum = "423c48ebede1b1bf54a1e308c132fde00fd2268b62d342f70d3430ac3ea213ad";
const byteEquivalentLegacyChecksum = "d9333a508b2f6867cc913246cd0fbdde1e4de214fa2eda49f927043a6b3fd5d6";
const canonicalMiniappIntakeMigration = loadMigrationFiles().find(
  (migration) => migration.id === "0030_miniapp_order_intake",
);
const canonicalMiniappArtworkTransferChecksum = "9d48beae57346bdc7e643419502cf0dd2596d20a9a4394cb293cb3242b5caf6b";
const byteEquivalentLegacyArtworkTransferChecksum =
  "fe934e65e551e908f45751b545e09135e3de0df7bb93bf429e78a6e13bfd72e3";
const canonicalMiniappArtworkTransferMigration = loadMigrationFiles().find(
  (migration) => migration.id === "0035_miniapp_artwork_transfer",
);
assert.equal(canonicalMiniappIntakeMigration?.checksum, canonicalMiniappIntakeChecksum);
assert.equal(
  isAcceptedAppliedMigrationChecksum(canonicalMiniappIntakeMigration, byteEquivalentLegacyChecksum),
  true,
);
assert.equal(
  isAcceptedAppliedMigrationChecksum(canonicalMiniappIntakeMigration, "unknown"),
  false,
);
assert.equal(
  isAcceptedAppliedMigrationChecksum(
    { ...canonicalMiniappIntakeMigration, id: "0031_attachment_upload_limits" },
    byteEquivalentLegacyChecksum,
  ),
  false,
);
assert.equal(canonicalMiniappArtworkTransferMigration?.checksum, canonicalMiniappArtworkTransferChecksum);
assert.equal(
  isAcceptedAppliedMigrationChecksum(
    canonicalMiniappArtworkTransferMigration,
    byteEquivalentLegacyArtworkTransferChecksum,
  ),
  true,
);
assert.equal(
  isAcceptedAppliedMigrationChecksum(canonicalMiniappArtworkTransferMigration, "unknown"),
  false,
);
assert.equal(
  isAcceptedAppliedMigrationChecksum(
    { ...canonicalMiniappArtworkTransferMigration, id: "0036_price_release_delivery" },
    byteEquivalentLegacyArtworkTransferChecksum,
  ),
  false,
);

const applyCalls = [];
const applyLogs = [];
const applyResult = runDbMigrations({
  options: parsed,
  baseEnv: { DATABASE_URL: fallbackDatabaseUrl },
  commandRunner: buildSuccessfulPsqlRunner(applyCalls),
  logger: (line) => applyLogs.push(line),
});
assert.equal(applyResult.mode, "apply");
assert.equal(applyResult.databaseUrlSource, "ERP_V1_DATABASE_URL");
assert.ok(applyResult.appliedCount > 0);
assert.ok(applyCalls.some((call) => call.args[0] === sensitiveDatabaseUrl));
assert.ok(applyCalls.every((call) => call.command === "/usr/local/bin/psql"));
assertNoSensitive(applyLogs.join("\n"));

const missingCalls = [];
assert.throws(
  () =>
    runDbMigrations({
      options: parseArgs(["--apply"]),
      baseEnv: { ERP_V1_DATABASE_URL: "<REPLACE_WITH_POSTGRES_CONNECTION_URL>" },
      commandRunner: buildSuccessfulPsqlRunner(missingCalls),
      logger: () => {},
    }),
  /ERP_V1_DATABASE_URL, DATABASE_URL, or PGURL is required/,
);
assert.equal(missingCalls.length, 0);

const failingCalls = [];
assert.throws(
  () =>
    runDbMigrations({
      options: parseArgs(["--apply", "--env-file", secureEnvPath]),
      baseEnv: {},
      commandRunner: buildFailingPsqlRunner(failingCalls),
      logger: () => {},
    }),
  (error) => {
    const message = error?.message || String(error);
    assert.match(message, /\[redacted-postgres-url\]/);
    assertNoSensitive(message);
    return true;
  },
);
assert.ok(failingCalls.some((call) => call.args[0] === sensitiveDatabaseUrl));

const redacted = redactMigrationText(
  `psql: error: could not connect to postgres://erp_user:SUPER_SECRET_PASSWORD@prod-db.internal:5432/erp at "prod-db.internal"`,
);
assertNoSensitive(redacted);
assert.match(redacted, /\[redacted-postgres-url\]/);

console.log("DB migration runner check passed: env-file apply, dry-run isolation, source priority, and redaction are covered.");

function buildSuccessfulPsqlRunner(calls) {
  return (command, args) => {
    calls.push({ command, args: [...args] });
    if (args[0] === "--version") return { status: 0, stdout: "psql (PostgreSQL) 16.0\n", stderr: "" };
    const sql = args[args.indexOf("--command") + 1] || "";
    if (sql.includes("SELECT id || '|' || checksum")) return { status: 0, stdout: "", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
}

function buildFailingPsqlRunner(calls) {
  return (command, args) => {
    calls.push({ command, args: [...args] });
    if (args[0] === "--version") return { status: 0, stdout: "psql (PostgreSQL) 16.0\n", stderr: "" };
    return {
      status: 2,
      stdout: "",
      stderr:
        'psql: error: connection to server at "prod-db.internal" failed for postgres://erp_user:SUPER_SECRET_PASSWORD@prod-db.internal:5432/erp',
    };
  };
}

function assertNoSensitive(text) {
  assert.equal(text.includes("SUPER_SECRET_PASSWORD"), false);
  assert.equal(text.includes("FALLBACK_SECRET"), false);
  assert.equal(text.includes("prod-db.internal"), false);
  assert.equal(text.includes("fallback-db.internal"), false);
  assert.equal(text.includes("postgres://erp_user"), false);
}
