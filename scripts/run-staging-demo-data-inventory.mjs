#!/usr/bin/env node
// Read-only inventory of automated-test fixtures left in a Staging database.
// Owner decision 2026-10-29: Staging keeps a small demo dataset; the rest of the
// fixtures are removed only after the owner approves a keep/delete list. This
// script never writes. It prints per-table totals, how many rows look like test
// fixtures, and up to five fixture ids per table (ids only, never names, phone
// numbers, amounts or connection values).
//
//   node scripts/run-staging-demo-data-inventory.mjs --env-file /etc/erp/erp.production.env [--json]

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const FIXTURE_ID_PATTERNS = Object.freeze(["%-LIVE-%", "E2E-%", "%-E2E-%", "TEST-%", "%-TEST-%"]);
export const FIXTURE_NAME_PATTERNS = Object.freeze(["%测试%", "Postgres %", "E2E%"]);
export const FIXTURE_NAME_COLUMNS = Object.freeze(["name", "display_name", "short_name", "customer_name", "supplier_name", "title"]);
const SAMPLE_LIMIT = 5;

const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;
const quoteLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

export function buildFixturePredicate(columns) {
  const names = new Set(columns);
  const parts = [];
  for (const column of ["id", "biz_no"]) {
    if (!names.has(column)) continue;
    for (const pattern of FIXTURE_ID_PATTERNS) parts.push(`${quoteIdent(column)}::text ILIKE ${quoteLiteral(pattern)}`);
  }
  for (const column of FIXTURE_NAME_COLUMNS) {
    if (!names.has(column)) continue;
    for (const pattern of FIXTURE_NAME_PATTERNS) parts.push(`${quoteIdent(column)}::text ILIKE ${quoteLiteral(pattern)}`);
  }
  return parts.length ? parts.join(" OR ") : "FALSE";
}

export function buildInventorySql(tables) {
  const selects = tables
    .filter((table) => table.columns.includes("id"))
    .map((table) => {
      const from = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
      const predicate = buildFixturePredicate(table.columns);
      return `SELECT json_build_object(
  'table', ${quoteLiteral(table.name)},
  'total', (SELECT count(*) FROM ${from}),
  'fixtures', (SELECT count(*) FROM ${from} WHERE ${predicate}),
  'sampleIds', COALESCE((SELECT json_agg(id ORDER BY id) FROM (SELECT id::text AS id FROM ${from} WHERE ${predicate} ORDER BY 1 LIMIT ${SAMPLE_LIMIT}) s), '[]'::json)
) AS row`;
    });
  if (!selects.length) return "SELECT '[]'::json;";
  return `SELECT COALESCE(json_agg(row), '[]'::json) FROM (\n${selects.join("\nUNION ALL\n")}\n) inventory;`;
}

export const LIST_TABLES_SQL = `SELECT COALESCE(json_agg(t ORDER BY t.name), '[]'::json) FROM (
  SELECT c.table_schema AS schema, c.table_name AS name, json_agg(c.column_name::text ORDER BY c.ordinal_position) AS columns
  FROM information_schema.columns c
  JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.table_name NOT LIKE 'schema_migrations%'
  GROUP BY c.table_schema, c.table_name
) t;`;

export function summarizeInventory(rows) {
  const tables = rows
    .map((row) => ({ table: row.table, total: Number(row.total) || 0, fixtures: Number(row.fixtures) || 0, sampleIds: row.sampleIds || [] }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.fixtures - a.fixtures || a.table.localeCompare(b.table));
  return {
    scope: "staging_demo_data_inventory",
    readOnly: true,
    tablesWithRows: tables.length,
    tablesWithFixtures: tables.filter((row) => row.fixtures > 0).length,
    totalRows: tables.reduce((sum, row) => sum + row.total, 0),
    fixtureRows: tables.reduce((sum, row) => sum + row.fixtures, 0),
    tables,
  };
}

export function formatInventory(report) {
  const lines = [
    `测试站数据盘点（只读）：${report.tablesWithRows} 张表有数据，共 ${report.totalRows} 行；疑似测试数据 ${report.fixtureRows} 行，分布在 ${report.tablesWithFixtures} 张表。`,
    "",
    "| 表 | 总行数 | 疑似测试 | 示例编号 |",
    "| --- | ---: | ---: | --- |",
    ...report.tables.map((row) => `| ${row.table} | ${row.total} | ${row.fixtures} | ${row.sampleIds.join(", ")} |`),
  ];
  return `${lines.join("\n")}\n`;
}

function parseConnection(databaseUrl) {
  const url = new URL(databaseUrl);
  const env = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    PGUSER: decodeURIComponent(url.username),
  };
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const envFileIndex = args.indexOf("--env-file");
  const envFile = envFileIndex >= 0 ? args[envFileIndex + 1] : "";
  const json = args.includes("--json");
  const { loadEnvironment } = await import(new URL("./run-v1-production-env-preflight.mjs", import.meta.url).href);
  const { getDatabaseUrl } = await import(new URL("./run-db-migrations.mjs", import.meta.url).href);
  const env = loadEnvironment({ envFiles: envFile ? [envFile] : [], baseEnv: process.env });
  const databaseUrl = getDatabaseUrl(env).value;
  if (!databaseUrl) throw new Error("DATABASE_NOT_CONFIGURED");
  const childEnv = {
    ...process.env,
    ...parseConnection(databaseUrl),
    PGAPPNAME: "erp-staging-demo-data-inventory",
    PGCONNECT_TIMEOUT: "10",
    PGCLIENTENCODING: "UTF8",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=60s",
  };
  const psql = (sql) => {
    const result = spawnSync("psql", ["-X", "--quiet", "--tuples-only", "--no-align", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      env: childEnv,
      encoding: "utf8",
      input: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${sql}\nCOMMIT;\n`,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120000,
    });
    if (result.error || result.status !== 0) throw new Error("PSQL_FAILED");
    return JSON.parse(String(result.stdout).trim());
  };
  const tables = psql(LIST_TABLES_SQL);
  const report = summarizeInventory(psql(buildInventorySql(tables)));
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatInventory(report));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    // Never echo connection details.
    process.stderr.write(`staging demo data inventory failed: ${/^[A-Z_]+$/.test(error?.message || "") ? error.message : "UNEXPECTED_ERROR"}\n`);
    process.exit(1);
  });
}
