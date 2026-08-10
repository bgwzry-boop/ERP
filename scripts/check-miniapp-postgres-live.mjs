import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import pg from "pg";

import { createMiniappApiRuntime } from "../server/miniapp/miniappApiServer.mjs";
import { fingerprintWechatSubject } from "../server/miniapp/miniappIdentityService.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";

const { Pool } = pg;
const dockerImage = process.env.ERP_POSTGRES_DOCKER_IMAGE || "postgres:16-alpine";
const containerName = `erp-miniapp-live-${process.pid}-${Date.now()}`;
const identityPepper = "miniapp-live-identity-pepper-20260720";
const sessionSecret = "miniapp-live-session-secret-20260720";
const openId = "miniapp-live-openid-customer-a";
let runtime;
let seedPool;

try {
  assertDockerAvailable();
  startPostgresContainer();
  await waitForPostgres();
  applyMigrations();
  const databaseUrl = resolveLiveDatabaseUrl();
  seedPool = new Pool({ connectionString: databaseUrl, max: 2 });
  await seedMiniappMasterData(seedPool);

  runtime = createMiniappApiRuntime({
    runtimeMode: "production",
    repositoryMode: "postgres",
    databaseUrl,
    sessionSecret,
    identityPepper,
    identityProvider: { async exchange() { return { openId, unionId: "" }; } },
  });
  await listen(runtime.server);
  const address = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const session = await requestJson(baseUrl, "/v1/miniapp/session", {
    method: "POST",
    body: { code: "live-code" },
  });
  assert.equal(session.status, 200);
  assert.equal(session.body.customerBinding, "bound");
  const token = session.body.accessToken;

  const bootstrap = await requestJson(baseUrl, "/v1/miniapp/bootstrap", { token });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.customer.id, "CUSTOMER-MINIAPP-LIVE");
  assert.equal(bootstrap.body.customer.deliveryMethod, "到厂自提");

  const catalog = await requestJson(baseUrl, "/v1/miniapp/catalog", { token });
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.priceVersion, "PT-MINIAPP-LIVE-v4");
  assert.equal(catalog.body.priceTableId, undefined);
  assert.equal(catalog.body.regularSizes.find((item) => item.id === "30x37x10").price, 0.34);

  const line = {
    clientLineId: "L1",
    productType: "stock_plain",
    productName: "现货纯色袋",
    size: "30×37×10",
    colorGroup: "regular",
    colorId: "red",
    color: "红色",
    handleId: "regular",
    handle: "普通提",
    quantity: 500,
    unitPrice: 0.01,
  };
  const quote = await requestJson(baseUrl, "/v1/miniapp/quotes/preview", { method: "POST", token, body: line });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.unitPrice, 0.34);
  assert.equal(quote.body.amount, 170);

  const inventory = await requestJson(baseUrl, "/v1/miniapp/inventory/check", { method: "POST", token, body: line });
  assert.equal(inventory.status, 200);
  assert.equal(inventory.body.status, "available");
  assert.equal(Object.hasOwn(inventory.body, "availableQty"), false);

  const payload = {
    customerId: "CLIENT-MUST-NOT-SELECT-CUSTOMER",
    deliveryMethod: "到厂自提",
    desiredDate: "2026-07-21",
    desiredTime: "13:30",
    addressId: "ADDR-MINIAPP-LIVE",
    address: "义乌市测试路 1 号",
    packagingPreference: "独立扎包",
    quote: { amount: 1 },
    lines: [line],
  };
  const idempotencyKey = "miniapp-live-order-0001";
  const created = await requestJson(baseUrl, "/v1/miniapp/orders", {
    method: "POST", token, idempotencyKey, body: payload, expectedStatus: 201,
  });
  assert.equal(created.body.serverQuote.amount, 170);
  assert.equal(created.body.status, "confirming");
  assert.equal(created.body.replayed, false);

  const replayed = await requestJson(baseUrl, "/v1/miniapp/orders", {
    method: "POST", token, idempotencyKey, body: payload, expectedStatus: 201,
  });
  assert.equal(replayed.body.orderId, created.body.orderId);
  assert.equal(replayed.body.replayed, true);

  const conflict = await requestJson(baseUrl, "/v1/miniapp/orders", {
    method: "POST",
    token,
    idempotencyKey,
    body: { ...payload, desiredTime: "14:00" },
    expectedStatus: 409,
  });
  assert.equal(conflict.body.code, "IDEMPOTENCY_KEY_REUSED");

  const counts = await seedPool.query(`
SELECT json_build_object(
  'submissions', (SELECT count(*) FROM order_intake_submissions),
  'intakeLines', (SELECT count(*) FROM order_intake_lines),
  'snapshots', (SELECT count(*) FROM order_intake_snapshots),
  'drafts', (SELECT count(*) FROM order_drafts WHERE source_channel = 'mini_program'),
  'draftLines', (SELECT count(*) FROM order_draft_lines WHERE order_draft_id LIKE 'DRAFT-MP%'),
  'todos', (SELECT count(*) FROM todos WHERE type = '小程序订单待确认'),
  'formalOrders', (SELECT count(*) FROM original_orders)
) AS result;
  `);
  const result = counts.rows[0].result;
  assert.deepEqual(result, {
    submissions: 1,
    intakeLines: 1,
    snapshots: 1,
    drafts: 1,
    draftLines: 1,
    todos: 1,
    formalOrders: 0,
  });

  console.log(`Miniapp PostgreSQL live check passed against ${dockerImage}: migration, bound login, ERP catalog/quote/inventory projection, idempotent draft intake, and no-formal-order boundary are verified.`);
} finally {
  if (runtime?.server?.listening) await closeServer(runtime.server);
  await closeSharedPostgresPools();
  if (seedPool) await seedPool.end();
  stopPostgresContainer();
}

function assertDockerAvailable() {
  const result = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("Docker must be running for npm run miniapp-postgres-live:check.");
  }
}

function startPostgresContainer() {
  runDocker([
    "run", "--rm", "--detach", "--name", containerName,
    "--publish", "127.0.0.1::5432",
    "--env", "POSTGRES_DB=erp",
    "--env", "POSTGRES_USER=erp",
    "--env", "POSTGRES_PASSWORD=erp",
    dockerImage,
  ]);
}

async function waitForPostgres() {
  let lastOutput = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "erp", "-d", "erp"], { encoding: "utf8" });
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
    runPsql([
      "BEGIN;",
      migration.sql.trim(),
      `INSERT INTO schema_migrations (id, filename, checksum) VALUES (${sqlLiteral(migration.id)}, ${sqlLiteral(migration.filename)}, ${sqlLiteral(migration.checksum)});`,
      "COMMIT;",
    ].join("\n\n"));
  }
}

async function seedMiniappMasterData(pool) {
  const fingerprint = fingerprintWechatSubject(openId, identityPepper);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO price_tables (id, biz_no, name, version_no, status, effective_from) VALUES ($1, $2, $3, $4, 'active', now() - interval '1 day')`, ["PRICE-TABLE-MINIAPP-LIVE", "PT-MINIAPP-LIVE", "小程序联调价表", 4]);
    await client.query(`INSERT INTO customers (id, biz_no, name, short_name, price_table_id, enabled) VALUES ($1, $2, $3, $4, $5, true)`, ["CUSTOMER-MINIAPP-LIVE", "C-MINIAPP-LIVE", "张三服饰", "张三服饰", "PRICE-TABLE-MINIAPP-LIVE"]);
    await client.query(`INSERT INTO customer_contacts (id, customer_id, contact_name, phone, is_default) VALUES ($1, $2, $3, $4, true)`, ["CONTACT-MINIAPP-LIVE", "CUSTOMER-MINIAPP-LIVE", "张老板", "13800001234"]);
    await client.query(`INSERT INTO customer_addresses (id, customer_id, contact_id, address, default_fulfillment_method, is_default, remark) VALUES ($1, $2, $3, $4, $5, true, $6)`, ["ADDR-MINIAPP-LIVE", "CUSTOMER-MINIAPP-LIVE", "CONTACT-MINIAPP-LIVE", "义乌市测试路 1 号", "到厂自提", "独立扎包"]);
    await client.query(`INSERT INTO standard_colors (id, color_key, name, enabled) VALUES ($1, $2, $3, true)`, ["red", "red", "红色"]);
    await client.query(`INSERT INTO size_specs (id, size_key, display_name, width_mm, height_mm, gusset_mm, enabled) VALUES ($1, $2, $3, 300, 370, 100, true)`, ["SIZE-3037", "30*37*10", "30×37×10"]);
    await client.query(`INSERT INTO price_table_items (id, price_table_id, size_key, standard_color_id, handle_type, style_key, bag_price, print_price, min_qty, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, true)`, ["PRICE-ITEM-MINIAPP-LIVE", "PRICE-TABLE-MINIAPP-LIVE", "30*37*10", "red", "regular", "stock_plain", 0.34, 0.09]);
    await client.query(`INSERT INTO inventory_items (id, inventory_key, size, standard_color_id, handle_type, style, on_hand_qty, reserved_qty, waiting_pickup_locked_qty, pending_handling_qty) VALUES ($1, $2, $3, $4, $5, $6, 1000, 100, 50, 0)`, ["INVENTORY-MINIAPP-LIVE", "INV-MINIAPP-LIVE", "30×37×10", "red", "regular", "stock_plain"]);
    await client.query(`INSERT INTO customer_channel_bindings (id, channel, external_subject_fingerprint, customer_id, status, verified_at) VALUES ($1, 'wechat_mini_program', $2, $3, 'active', now())`, ["BIND-MINIAPP-LIVE", fingerprint, "CUSTOMER-MINIAPP-LIVE"]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function runPsql(sql) {
  const result = spawnSync("docker", [
    "exec", "--interactive", containerName, "psql", "-U", "erp", "-d", "erp", "-X",
    "-v", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--pset=footer=off",
  ], { input: sql, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker psql exited with status ${result.status}`);
}

function runDocker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args.join(" ")} exited with status ${result.status}`);
  return result.stdout.trim();
}

function resolveLiveDatabaseUrl() {
  const result = spawnSync("docker", ["port", containerName, "5432/tcp"], { encoding: "utf8" });
  const port = String(result.stdout || "").trim().match(/:(\d+)$/)?.[1];
  if (result.status !== 0 || !port) throw new Error(result.stderr || "Unable to resolve PostgreSQL live-check port.");
  return `postgres://erp:erp@127.0.0.1:${port}/erp`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stopPostgresContainer() {
  spawnSync("docker", ["rm", "--force", containerName], { encoding: "utf8" });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json();
  assert.equal(response.status, options.expectedStatus || 200, `${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body };
}
