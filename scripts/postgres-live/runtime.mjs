import { assertMigrationApplied, assertMigratedSchema } from "./assertions.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMigrationFiles, validateMigrationSet } from "../dbMigrationUtils.mjs";
import { seedPostgresLiveBusinessRows } from "../helpers/postgresLiveBusinessSeed.mjs";

export async function startLivePostgres() {
  const runtime = createLivePostgresRuntime();
  try {
    runtime.assertDockerAvailable();
    runtime.startPostgresContainer();
    await runtime.waitForPostgres();
    runtime.applyMigrations();
    runtime.seedRequiredBusinessRows();
    return runtime;
  } catch (error) {
    await stopLivePostgres(runtime);
    throw error;
  }
}

export async function stopLivePostgres(runtime) {
  try {
    if (runtime.server) await new Promise((resolve, reject) => runtime.server.close((error) => error ? reject(error) : resolve()));
    if (runtime.orderDraftPool) await runtime.orderDraftPool.end();
    if (runtime.attachmentPool) await runtime.attachmentPool.end();
  } finally {
    runtime.stopPostgresContainer();
    rmSync(runtime.storageRoot, { recursive: true, force: true });
  }
}

function createLivePostgresRuntime() {
  const dockerImage = process.env.ERP_POSTGRES_DOCKER_IMAGE || "postgres:16-alpine";
  const containerName = `erp-postgres-live-${process.pid}-${Date.now()}`;
  const storageRoot = mkdtempSync(join(tmpdir(), "erp-postgres-live-storage-"));
  const liveRuntimeAuthSecret = "postgres-live-runtime-auth-secret";
  const liveRuntimeUserId = "U-EMP-LIVE-IDENTITY-001";
  const liveRuntimeLoginName = "employee.live.identity";
  const liveRuntimePassword = "employee-live-password-001";
  const liveOfficeRuntimeUserId = "U-EMP-LIVE-OFFICE-001";
  const liveOfficeRuntimeLoginName = "employee.live.office";
  const liveOfficeRuntimePassword = "employee-live-office-password-001";
  const liveManagerRuntimeUserId = "U-EMP-LIVE-MANAGER-001";
  const liveManagerRuntimeLoginName = "employee.live.manager";
  const liveManagerRuntimePassword = "employee-live-manager-password-001";

  function assertDockerAvailable() {
    const result = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
    if (result.error || result.status !== 0) {
      throw new Error("Docker is required for npm run db:postgres-live:check.");
    }
  }

  function startPostgresContainer() {
    runDocker([
      "run",
      "--rm",
      "--detach",
      "--name",
      containerName,
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_DB=erp",
      "--env",
      "POSTGRES_USER=erp",
      "--env",
      "POSTGRES_PASSWORD=erp",
      dockerImage,
    ]);
  }

  async function waitForPostgres() {
    let lastOutput = "";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-h", "127.0.0.1", "-U", "erp", "-d", "erp"], {
        encoding: "utf8",
      });
      if (result.status === 0) return;
      lastOutput = result.stderr || result.stdout || `status ${result.status}`;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`PostgreSQL container did not become ready: ${lastOutput}`);
  }

  function applyMigrations() {
    const migrations = loadMigrationFiles();
    validateMigrationSet(migrations);
    runPsql(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  `);

    for (const migration of migrations) {
      runPsql(
        [
          "BEGIN;",
          migration.sql.trim(),
          `INSERT INTO schema_migrations (id, filename, checksum) VALUES (${sqlLiteral(migration.id)}, ${sqlLiteral(
            migration.filename,
          )}, ${sqlLiteral(migration.checksum)});`,
          "COMMIT;",
        ].join("\n\n"),
      );
    }

    const appliedMigrationIds = new Set(
      runPsql("SELECT id FROM schema_migrations ORDER BY id;", { capture: true })
        .trim()
        .split("\n")
        .filter(Boolean),
    );
    for (const migration of migrations) {
      assertMigrationApplied(migration.filename, appliedMigrationIds.has(migration.id));
    }

    const tableCount = Number(
      runPsql(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
        { capture: true },
      ).trim(),
    );
    assertMigratedSchema(tableCount);
  }

  function seedRequiredBusinessRows() {
    return seedPostgresLiveBusinessRows({ runPsql });
  }

  function queryJson(sql, values = []) {
    const output = runPsql(interpolatePsqlParameters(sql, values), { capture: true }).trim();
    if (!output) return null;
    const jsonLine = output
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("{") || line.startsWith("[") || line === "null");
    if (!jsonLine || jsonLine === "null") return null;
    return JSON.parse(jsonLine);
  }

  function interpolatePsqlParameters(sql, values = []) {
    if (!Array.isArray(values) || values.length === 0) return sql;
    return String(sql).replace(/\$(\d+)/g, (placeholder, rawIndex) => {
      const index = Number(rawIndex) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= values.length) {
        throw new Error(`Missing PostgreSQL test parameter for ${placeholder}`);
      }
      return toPsqlParameterLiteral(values[index]);
    });
  }

  function toPsqlParameterLiteral(value) {
    if (value === null || value === undefined) return "NULL";
    if (Array.isArray(value)) return `ARRAY[${value.map((item) => toPsqlParameterLiteral(item)).join(", ")}]`;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("PostgreSQL test parameters must use finite numbers");
      return String(value);
    }
    return sqlLiteral(value);
  }

  function runPsql(sql, options = {}) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "--interactive",
        containerName,
        "psql",
        "-U",
        "erp",
        "-d",
        "erp",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "--tuples-only",
        "--no-align",
        "--pset=footer=off",
      ],
      {
        input: sql,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `docker psql exited with status ${result.status}`);
    }
    return options.capture ? result.stdout : "";
  }

  function runDocker(args) {
    const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `docker ${args.join(" ")} exited with status ${result.status}`);
    }
    return result.stdout.trim();
  }

  function resolveLiveDatabaseUrl() {
    const portResult = spawnSync("docker", ["port", containerName, "5432/tcp"], { encoding: "utf8" });
    const portMatch = String(portResult.stdout ?? "").trim().match(/:(\d+)$/);
    if (portResult.status !== 0 || !portMatch) {
      throw new Error(portResult.stderr || "Unable to resolve the PostgreSQL live-check host port.");
    }
    return `postgres://erp:erp@127.0.0.1:${portMatch[1]}/erp`;
  }

  function stopPostgresContainer() {
    spawnSync("docker", ["rm", "--force", containerName], { encoding: "utf8" });
  }

  function sqlLiteral(value) {
    return `'${String(value ?? "").replaceAll("'", "''")}'`;
  }

  return {
    dockerImage, storageRoot,
    liveRuntimeAuthSecret, liveRuntimeUserId, liveRuntimeLoginName, liveRuntimePassword,
    liveOfficeRuntimeUserId, liveOfficeRuntimeLoginName, liveOfficeRuntimePassword,
    liveManagerRuntimeUserId, liveManagerRuntimeLoginName, liveManagerRuntimePassword,
    attachmentPool: null, orderDraftPool: null, server: null,
    assertDockerAvailable, startPostgresContainer, waitForPostgres, applyMigrations,
    seedRequiredBusinessRows, queryJson, runPsql, resolveLiveDatabaseUrl,
    stopPostgresContainer, sqlLiteral,
  };
}
