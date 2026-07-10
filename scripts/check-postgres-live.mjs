import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createApiServer } from "../server/apiServer.mjs";
import { buildPostgresIdempotencyRequest } from "../server/idempotency.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresAttachmentRepository } from "../server/attachmentRepository.mjs";
import { createPostgresAttachmentAccessAuditRepository } from "../server/attachmentAccessAuditRepository.mjs";
import { createPostgresPaymentRecordRepository } from "../server/paymentRecordRepository.mjs";
import { createPostgresStatementPaymentTransactionRepository } from "../server/statementPaymentTransactionRepository.mjs";
import { createPostgresStatementSettlementTransactionRepository } from "../server/statementSettlementTransactionRepository.mjs";
import { createPostgresStatementSendTransactionRepository } from "../server/statementSendTransactionRepository.mjs";
import { createPostgresStatementExportRepository } from "../server/statementExportRepository.mjs";
import { createPostgresOrderConfirmationTransactionRepository } from "../server/orderConfirmationTransactionRepository.mjs";
import { createPostgresFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";
import { createPostgresDriverDeviceFieldTestRepository } from "../server/driverDeviceFieldTestRepository.mjs";
import { createPostgresDriverDeliveryTaskReadRepository } from "../server/driverDeliveryTaskReadRepository.mjs";
import { createPostgresInventoryLedgerReadRepository } from "../server/inventoryLedgerReadRepository.mjs";
import { createPostgresInventoryReservationReleaseTransactionRepository } from "../server/inventoryReservationReleaseTransactionRepository.mjs";
import { createPostgresOrderLineVoidTransactionRepository } from "../server/orderLineVoidTransactionRepository.mjs";
import { createPostgresOrderLineQuantityAdjustmentTransactionRepository } from "../server/orderLineQuantityAdjustmentTransactionRepository.mjs";
import { createPostgresProductionPackingReadRepository } from "../server/productionPackingReadRepository.mjs";
import { createPostgresProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";
import { createPostgresProductionScheduleRecordRepository } from "../server/productionScheduleRecordRepository.mjs";
import { createPostgresPrintBatchRepository } from "../server/printBatchRepository.mjs";
import { createPostgresPrintDeviceRepository } from "../server/printDeviceRepository.mjs";
import { createPostgresPrintJobRepository } from "../server/printJobRepository.mjs";
import { createPostgresMasterDataImportReviewRepository } from "../server/masterDataImportReviewRepository.mjs";
import { createPostgresMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";
import { createPrintDriverAdapter } from "../server/printDriverAdapter.mjs";
import { v1PersistencePostgresRepositoryOptionKeys } from "../server/v1PersistenceProfile.mjs";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { assertStatementXlsxWorkbook } from "./xlsxTestUtils.mjs";

const dockerImage = process.env.ERP_POSTGRES_DOCKER_IMAGE || "postgres:16-alpine";
const { Pool } = pg;
const containerName = `erp-postgres-live-${process.pid}-${Date.now()}`;
const storageRoot = mkdtempSync(join(tmpdir(), "erp-postgres-live-storage-"));
let server = null;

try {
  assertDockerAvailable();
  startPostgresContainer();
  await waitForPostgres();
  applyMigrations();
  seedRequiredBusinessRows();
  await checkPostgresIdempotencyAndConcurrency();
  await checkPostgresRepositories();
  await checkApiWithPostgresRepositories();
  console.log(
    `PostgreSQL live check passed: migrations, attachment repository, access-audit repository, payment repository, order confirmation transaction repository, order pool read repository, fulfillment action transaction repository, driver delivery dispatch repository, driver device field-test repository, driver delivery task read repository, inventory ledger read repository, inventory reservation release transaction repository, order line void transaction repository, order line quantity adjustment transaction repository, production packing transaction repository, production packing read repository, production schedule record repository, print batch repository, print device repository, print job repository, master-data import review repository, master-data import transaction repository, statement payment transaction repository, statement settlement transaction repository, statement send transaction repository, statement export repository, and API routes executed against ${dockerImage}.`,
  );
} finally {
  if (server) await closeServer(server);
  stopPostgresContainer();
  rmSync(storageRoot, { recursive: true, force: true });
}

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
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "erp", "-d", "erp"], {
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

  const tableCount = Number(
    runPsql(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
      { capture: true },
    ).trim(),
  );
  assert.ok(tableCount >= 52, `expected migrated PostgreSQL database to have at least 52 tables, got ${tableCount}`);
}

function seedRequiredBusinessRows() {
  runPsql(`
INSERT INTO users (id, login_name, display_name, department)
VALUES
  ('U-OFFICE-A', 'office.a', '办公室A', 'office'),
  ('U-FINANCE-A', 'finance.a', '财务A', 'finance'),
  ('U-WAREHOUSE-A', 'warehouse.a', '仓库A', 'warehouse'),
  ('U-DRIVER-A', 'driver.a', '司机A', 'driver'),
  ('U-PRINT-DRIVER-A', 'print.driver.a', '打印驱动服务账号A', 'system')
ON CONFLICT (id) DO UPDATE SET
  login_name = EXCLUDED.login_name,
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  updated_at = now();

INSERT INTO print_templates (id, template_key, template_type, name, created_by)
VALUES
  ('tpl-p0-fulfillment', 'p0.fulfillment', 'fulfillment', 'P0 出库交付单据', 'U-OFFICE-A'),
  ('tpl-p0-express-label', 'p0.express-label', 'fulfillment_label', 'P0 快运标签', 'U-OFFICE-A'),
  ('tpl-p0-express-ltl-label', 'p0.express-ltl-label', 'fulfillment_label', 'P0 快递快运包裹标签', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  template_key = EXCLUDED.template_key,
  template_type = EXCLUDED.template_type,
  name = EXCLUDED.name,
  updated_at = now();

INSERT INTO customers (id, biz_no, name, short_name, settlement_cycle, created_by)
VALUES
  ('C001', 'CUST-LIVE-001', '张三服饰', '张三服饰', '7天一结', 'U-OFFICE-A'),
  ('C002', 'CUST-LIVE-002', '李四电商', '李四电商', '15天一结', 'U-OFFICE-A'),
  ('C004', 'CUST-LIVE-004', '美的空调网店', '美的空调', '月结', 'U-OFFICE-A'),
  ('C010', 'CUST-LIVE-010', '月结客户', '月结客户', '月结', 'U-OFFICE-A'),
  ('C-LIVE-REPO', 'CUST-LIVE-REPO', 'Postgres 仓储测试客户', 'PG仓储', '7天一结', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  settlement_cycle = EXCLUDED.settlement_cycle,
  updated_at = now();

INSERT INTO standard_colors (id, color_key, name)
VALUES
  ('SC-RED', 'red', '红色'),
  ('SC-WHITE', 'white', '白色')
ON CONFLICT (id) DO UPDATE SET
  color_key = EXCLUDED.color_key,
  name = EXCLUDED.name,
  updated_at = now();

INSERT INTO inventory_items (
  id,
  inventory_key,
  size,
  standard_color_id,
  handle_type,
  style,
  zone,
  inventory_state,
  on_hand_qty,
  reserved_qty,
  waiting_pickup_locked_qty,
  pending_handling_qty,
  trust_level
) VALUES
  ('30*38*10-红色-普通提-空白袋-A区-30*38', '30*38*10|红色|普通提|空白袋|A区-30*38|仓库已清点', '30*38*10', 'SC-RED', '普通提', '空白袋', 'A区-30*38', '仓库已清点', 2480, 1320, 120, 0, '已清点'),
  ('30*38*10-白色-普通提-空白袋-待快运区', '30*38*10|白色|普通提|空白袋|待快运区|待提货锁定', '30*38*10', 'SC-WHITE', '普通提', '空白袋', '待快运区', '待提货锁定', 1005, 0, 1005, 0, '已清点'),
  ('25*32*10-白色-加长提-空白袋-B区-服装', '25*32*10|白色|加长提|空白袋|B区-服装|仓库已清点', '25*32*10', 'SC-WHITE', '加长提', '空白袋', 'B区-服装', '仓库已清点', 2100, 1200, 0, 0, '已清点'),
  ('INV-LIVE-CONFIRM-001', 'live-confirm|红色|普通提|空白袋|A区', '30*38*10', 'SC-RED', '普通提', '空白袋', 'A区', '仓库已清点', 1000, 10, 0, 0, '已清点'),
  ('INV-LIVE-PROD-001', 'live-production|白色|普通提|空白袋|生产完成区', '30*38*10', 'SC-WHITE', '普通提', '空白袋', '生产完成区', '仓库已清点', 20, 0, 0, 0, '已清点')
ON CONFLICT (id) DO UPDATE SET
  inventory_key = EXCLUDED.inventory_key,
  size = EXCLUDED.size,
  standard_color_id = EXCLUDED.standard_color_id,
  handle_type = EXCLUDED.handle_type,
  style = EXCLUDED.style,
  zone = EXCLUDED.zone,
  inventory_state = EXCLUDED.inventory_state,
  on_hand_qty = EXCLUDED.on_hand_qty,
  reserved_qty = EXCLUDED.reserved_qty,
  waiting_pickup_locked_qty = EXCLUDED.waiting_pickup_locked_qty,
  pending_handling_qty = EXCLUDED.pending_handling_qty,
  trust_level = EXCLUDED.trust_level,
  updated_at = now();

INSERT INTO original_orders (id, biz_no, customer_id, customer_snapshot, summary_status, created_by)
VALUES
  ('ORD-0629-001', 'ORD-0629-001', 'C001', '{"name":"张三服饰"}'::jsonb, '待出库', 'U-OFFICE-A'),
  ('ORD-0629-002', 'ORD-0629-002', 'C002', '{"name":"李四电商"}'::jsonb, '已备货', 'U-OFFICE-A'),
  ('ORD-0629-003', 'ORD-0629-003', 'C004', '{"name":"美的空调网店"}'::jsonb, '生产中', 'U-OFFICE-A'),
  ('ORD-0629-009', 'ORD-0629-009', 'C010', '{"name":"月结客户"}'::jsonb, '待送货', 'U-OFFICE-A'),
  ('ORD-0629-015', 'ORD-0629-015', 'C001', '{"name":"张三服饰"}'::jsonb, '待对账', 'U-OFFICE-A'),
  ('ORD-0629-022', 'ORD-0629-022', 'C002', '{"name":"李四电商"}'::jsonb, '丝印中', 'U-OFFICE-A'),
  ('ORD-LIVE-PROD-001', 'ORD-LIVE-PROD-001', 'C-LIVE-REPO', '{"name":"Postgres 仓储测试客户"}'::jsonb, '生产中', 'U-OFFICE-A'),
  ('ORD-LIVE-REPO-001', 'ORD-LIVE-REPO-001', 'C-LIVE-REPO', '{"name":"Postgres 仓储测试客户"}'::jsonb, '待对账', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  customer_snapshot = EXCLUDED.customer_snapshot,
  summary_status = EXCLUDED.summary_status,
  updated_at = now();

INSERT INTO order_lines (
  id,
  biz_no,
  order_id,
  customer_id,
  product_name,
  order_type,
  size,
  bag_color,
  handle_type,
  style,
  original_qty,
  fulfillment_method,
  line_status,
  created_by
) VALUES
  ('ORD-0629-001-01', 'ORD-0629-001-01', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '30*38*10', '红色', '普通提', '空白袋', 500, '自提', '待出库', 'U-OFFICE-A'),
  ('ORD-0629-002-01', 'ORD-0629-002-01', 'ORD-0629-002', 'C002', '服装店白袋', '现货有货', '25*32*10', '白色', '加长提', '空白袋', 1200, '送货', '已备货', 'U-OFFICE-A'),
  ('ORD-0629-003-01', 'ORD-0629-003-01', 'ORD-0629-003', 'C004', '美的空调', '定制印刷', '30*38*10', '白色', '普通提', '空白袋', 1000, '快递快运', '制袋中', 'U-OFFICE-A'),
  ('ORD-0629-009-01', 'ORD-0629-009-01', 'ORD-0629-009', 'C010', '月结客户活动袋', '定制印刷', '35*41', '白色', '普通提', '空白袋', 2000, '送货', '待送货', 'U-OFFICE-A'),
  ('ORD-0629-015-01', 'ORD-0629-015-01', 'ORD-0629-015', 'C001', '空白袋', '现货有货', '25*32*10', '红色', '普通提', '空白袋', 300, '自提', '待对账', 'U-OFFICE-A'),
  ('ORD-0629-022-01', 'ORD-0629-022-01', 'ORD-0629-022', 'C002', '外卖活动袋', '定制印刷', '40*30*10', '黄色', '普通提', '空白袋', 3000, '送货', '丝印中', 'U-OFFICE-A'),
  ('OL-LIVE-PROD-001', 'OL-LIVE-PROD-001', 'ORD-LIVE-PROD-001', 'C-LIVE-REPO', 'Postgres 生产报工', '定制印刷', '30*38*10', '白色', '普通提', '空白袋', 80, '快递快运', '制袋中', 'U-OFFICE-A'),
  ('OL-LIVE-EXPORT-LINE-001', 'OL-LIVE-EXPORT-LINE-001', 'ORD-LIVE-REPO-001', 'C-LIVE-REPO', 'Postgres Export Live', '现货有货', '30*38*10', '白色', '普通提', '空白袋', 273, '自提', '待对账', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  customer_id = EXCLUDED.customer_id,
  product_name = EXCLUDED.product_name,
  original_qty = EXCLUDED.original_qty,
  fulfillment_method = EXCLUDED.fulfillment_method,
  line_status = EXCLUDED.line_status,
  updated_at = now();

INSERT INTO fulfillment_records (
  id,
  biz_no,
  order_line_id,
  customer_id,
  customer_snapshot,
  method,
  expected_qty,
  actual_qty,
  status,
  created_by
) VALUES
  ('F001', 'F001', 'ORD-0629-001-01', 'C001', '{"name":"张三服饰"}'::jsonb, '自提', 500, 500, '待出库', 'U-OFFICE-A'),
  ('F002', 'F002', 'ORD-0629-002-01', 'C002', '{"name":"李四电商"}'::jsonb, '送货', 1200, 1200, '已备货', 'U-OFFICE-A'),
  ('F006', 'F006', 'ORD-0629-009-01', 'C010', '{"name":"月结客户"}'::jsonb, '送货', 2000, 2000, '待送货', 'U-OFFICE-A'),
  ('F008', 'F008', 'ORD-0629-022-01', 'C002', '{"name":"李四电商"}'::jsonb, '送货', 3000, 3000, '待出库', 'U-OFFICE-A'),
  ('F-LIVE-EXPORT-001', 'F-LIVE-EXPORT-001', 'OL-LIVE-EXPORT-LINE-001', 'C-LIVE-REPO', '{"name":"Postgres 仓储测试客户"}'::jsonb, '自提', 273, 273, '待对账', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  order_line_id = EXCLUDED.order_line_id,
  customer_id = EXCLUDED.customer_id,
  expected_qty = EXCLUDED.expected_qty,
  actual_qty = EXCLUDED.actual_qty,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO driver_delivery_dispatches (
  id,
  biz_no,
  fulfillment_id,
  driver_id,
  route_date,
  route_batch_no,
  stop_sequence,
  dispatch_status,
  planned_departure_at,
  assigned_by,
  assigned_at,
  remark
) VALUES
  (
    'DDIS-LIVE-F002-001',
    'DDIS-LIVE-F002-001',
    'F002',
    'U-DRIVER-A',
    '2026-07-02',
    '虎门线-A',
    2,
    '已派单',
    '2026-07-02T08:30:00.000Z',
    'U-OFFICE-A',
    '2026-07-02T08:00:00.000Z',
    '办公室测试派单顺序'
  ),
  (
    'DDIS-LIVE-F008-001',
    'DDIS-LIVE-F008-001',
    'F008',
    'U-DRIVER-A',
    '2026-07-02',
    '虎门线-A',
    3,
    '已派单',
    '2026-07-02T08:40:00.000Z',
    'U-OFFICE-A',
    '2026-07-02T08:05:00.000Z',
    '司机动作字段冷启动测试派单'
  ),
  (
    'DDIS-LIVE-F006-001',
    'DDIS-LIVE-F006-001',
    'F006',
    'U-DRIVER-A',
    '2026-07-02',
    '虎门线-A',
    4,
    '已派单',
    '2026-07-02T08:50:00.000Z',
    'U-OFFICE-A',
    '2026-07-02T08:10:00.000Z',
    '司机异常上报冷启动测试派单'
  )
ON CONFLICT (id) DO UPDATE SET
  driver_id = EXCLUDED.driver_id,
  route_date = EXCLUDED.route_date,
  route_batch_no = EXCLUDED.route_batch_no,
  stop_sequence = EXCLUDED.stop_sequence,
  dispatch_status = EXCLUDED.dispatch_status,
  planned_departure_at = EXCLUDED.planned_departure_at,
  assigned_by = EXCLUDED.assigned_by,
  assigned_at = EXCLUDED.assigned_at,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO packages (
  id,
  biz_no,
  order_line_id,
  fulfillment_id,
  package_seq,
  package_count,
  packed_qty,
  label_print_record_id,
  status,
  created_by
) VALUES
  ('PKG-LIVE-F002-1', 'PKG-LIVE-F002-1', 'ORD-0629-002-01', 'F002', 1, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F002-2', 'PKG-LIVE-F002-2', 'ORD-0629-002-01', 'F002', 2, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F002-3', 'PKG-LIVE-F002-3', 'ORD-0629-002-01', 'F002', 3, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F006-1', 'PKG-LIVE-F006-1', 'ORD-0629-009-01', 'F006', 1, 2, 1000, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F006-2', 'PKG-LIVE-F006-2', 'ORD-0629-009-01', 'F006', 2, 2, 1000, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-1', 'PKG-LIVE-F008-1', 'ORD-0629-022-01', 'F008', 1, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-2', 'PKG-LIVE-F008-2', 'ORD-0629-022-01', 'F008', 2, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-3', 'PKG-LIVE-F008-3', 'ORD-0629-022-01', 'F008', 3, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-4', 'PKG-LIVE-F008-4', 'ORD-0629-022-01', 'F008', 4, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-5', 'PKG-LIVE-F008-5', 'ORD-0629-022-01', 'F008', 5, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-6', 'PKG-LIVE-F008-6', 'ORD-0629-022-01', 'F008', 6, 6, 500, NULL, '已打印', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  fulfillment_id = EXCLUDED.fulfillment_id,
  package_seq = EXCLUDED.package_seq,
  package_count = EXCLUDED.package_count,
  packed_qty = EXCLUDED.packed_qty,
  label_print_record_id = EXCLUDED.label_print_record_id,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO statements (
  id,
  biz_no,
  customer_id,
  period_start,
  period_end,
  status,
  receivable_amount,
  received_amount,
  variance_amount,
  created_by
) VALUES
  ('ST-0629-001', 'ST-LIVE-API-001', 'C001', '2026-06-22', '2026-06-29', '待生成', 273, 0, 273, 'U-OFFICE-A'),
  ('ST-0629-002', 'ST-LIVE-API-002', 'C002', '2026-06-15', '2026-06-29', '差额待确认', 108000, 80000, 28000, 'U-OFFICE-A'),
  ('ST-0629-005', 'ST-LIVE-API-005', 'C010', '2026-06-01', '2026-06-29', '有欠款', 1510, 0, 5300, 'U-OFFICE-A'),
  ('ST-LIVE-REPO-001', 'ST-LIVE-REPO-001', 'C-LIVE-REPO', '2026-06-22', '2026-06-29', '待生成', 273, 0, 273, 'U-OFFICE-A'),
  ('ST-LIVE-VAR-001', 'ST-LIVE-VAR-001', 'C-LIVE-REPO', '2026-06-22', '2026-06-29', '差额待确认', 273, 200, 73, 'U-OFFICE-A'),
  ('ST-LIVE-SEND-001', 'ST-LIVE-SEND-001', 'C-LIVE-REPO', '2026-06-22', '2026-06-29', '待生成', 273, 0, 273, 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  status = EXCLUDED.status,
  receivable_amount = EXCLUDED.receivable_amount,
  received_amount = EXCLUDED.received_amount,
  variance_amount = EXCLUDED.variance_amount,
  updated_at = now();
`);
}

async function checkPostgresIdempotencyAndConcurrency() {
  const portResult = spawnSync("docker", ["port", containerName, "5432/tcp"], { encoding: "utf8" });
  const portMatch = String(portResult.stdout ?? "").trim().match(/:(\d+)$/);
  if (portResult.status !== 0 || !portMatch) {
    throw new Error(portResult.stderr || "Unable to resolve the PostgreSQL live-check host port.");
  }

  const pool = new Pool({
    connectionString: `postgres://erp:erp@127.0.0.1:${portMatch[1]}/erp`,
    max: 4,
    connectionTimeoutMillis: 5_000,
  });
  const client = createPostgresPoolClient({ pool });
  try {
    const firstRequest = buildPostgresIdempotencyRequest({
      scope: "test.live.idempotency",
      idempotencyKey: "idem-postgres-live-001",
      payload: { todoId: "T-LIVE-IDEMPOTENCY-001", summary: "first request" },
      targetType: "todo",
      targetId: "T-LIVE-IDEMPOTENCY-001",
      resourceLocks: ["todo:T-LIVE-IDEMPOTENCY-001"],
      query: buildLiveIdempotencyTodoQuery("T-LIVE-IDEMPOTENCY-001", "first request"),
    });
    const first = await client.idempotentTransactionJson(firstRequest);
    const replay = await client.idempotentTransactionJson(firstRequest);
    assert.deepEqual(replay, first, "same-key same-payload requests must replay the stored response");
    await assert.rejects(
      () =>
        client.idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            ...firstRequest,
            payload: { todoId: "T-LIVE-IDEMPOTENCY-001", summary: "different request" },
            query: buildLiveIdempotencyTodoQuery("T-LIVE-IDEMPOTENCY-001", "different request"),
          }),
        ),
      (error) => error?.statusCode === 409 && error?.code === "IDEMPOTENCY_KEY_REUSED",
    );

    const concurrentRequest = buildPostgresIdempotencyRequest({
      scope: "test.live.concurrency",
      idempotencyKey: "idem-postgres-live-concurrent-001",
      payload: { todoId: "T-LIVE-IDEMPOTENCY-002", summary: "concurrent request" },
      targetType: "todo",
      targetId: "T-LIVE-IDEMPOTENCY-002",
      resourceLocks: ["todo:T-LIVE-IDEMPOTENCY-002"],
      query: buildLiveIdempotencyTodoQuery("T-LIVE-IDEMPOTENCY-002", "concurrent request", true),
    });
    const [concurrentLeft, concurrentRight] = await Promise.all([
      client.idempotentTransactionJson(concurrentRequest),
      client.idempotentTransactionJson(concurrentRequest),
    ]);
    assert.deepEqual(concurrentRight, concurrentLeft, "concurrent retries must converge on one stored response");
  } finally {
    await pool.end();
  }

  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM todos WHERE id IN ('T-LIVE-IDEMPOTENCY-001', 'T-LIVE-IDEMPOTENCY-002');",
        { capture: true },
      ).trim(),
    ),
    2,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM operation_idempotency_keys WHERE scope IN ('test.live.idempotency', 'test.live.concurrency');",
        { capture: true },
      ).trim(),
    ),
    2,
  );
}

function buildLiveIdempotencyTodoQuery(todoId, summary, delay = false) {
  const delayCte = delay ? "delay AS MATERIALIZED (SELECT pg_sleep(0.15))," : "";
  const delayFrom = delay ? "FROM delay" : "";
  return {
    text: `
BEGIN;
WITH ${delayCte}
inserted_todo AS (
  INSERT INTO todos (id, biz_no, type, ref_type, ref_id, priority, status, summary, created_at, updated_at)
  SELECT '${todoId}', '${todoId}', '幂等验收', 'system', '${todoId}', '普通', '未处理', '${summary}', now(), now()
  ${delayFrom}
  RETURNING id
)
SELECT json_build_object(
  'todoId', (SELECT id FROM inserted_todo),
  'summary', '${summary}'
) AS result;
COMMIT;
`.trim(),
    values: [],
  };
}

async function checkPostgresRepositories() {
  const attachmentRepository = createPostgresAttachmentRepository({ queryJson });
  const auditRepository = createPostgresAttachmentAccessAuditRepository({ queryJson });
  const paymentRepository = createPostgresPaymentRecordRepository({ queryJson });
  const paymentTransactionRepository = createPostgresStatementPaymentTransactionRepository({ queryJson });
  const settlementTransactionRepository = createPostgresStatementSettlementTransactionRepository({ queryJson });
  const sendTransactionRepository = createPostgresStatementSendTransactionRepository({ queryJson });
  const exportRepository = createPostgresStatementExportRepository({ queryJson });
  const orderConfirmationRepository = createPostgresOrderConfirmationTransactionRepository({ queryJson });
  const fulfillmentActionRepository = createPostgresFulfillmentActionTransactionRepository({ queryJson });
  const driverDeviceFieldTestRepository = createPostgresDriverDeviceFieldTestRepository({ queryJson });
  const driverDeliveryTaskReadRepository = createPostgresDriverDeliveryTaskReadRepository({ queryJson });
  const inventoryLedgerReadRepository = createPostgresInventoryLedgerReadRepository({ queryJson });
  const inventoryReservationReleaseRepository = createPostgresInventoryReservationReleaseTransactionRepository({ queryJson });
  const orderLineVoidRepository = createPostgresOrderLineVoidTransactionRepository({ queryJson });
  const orderLineQuantityAdjustmentRepository = createPostgresOrderLineQuantityAdjustmentTransactionRepository({ queryJson });
  const productionPackingRepository = createPostgresProductionPackingTransactionRepository({ queryJson });
  const productionPackingReadRepository = createPostgresProductionPackingReadRepository({ queryJson });
  const productionScheduleRecordRepository = createPostgresProductionScheduleRecordRepository({ queryJson });
  const printBatchRepository = createPostgresPrintBatchRepository({ queryJson });
  const printDeviceRepository = createPostgresPrintDeviceRepository({ queryJson });
  const printJobRepository = createPostgresPrintJobRepository({ queryJson });
  const masterDataImportReviewRepository = createPostgresMasterDataImportReviewRepository({ queryJson });
  const masterDataImportTransactionRepository = createPostgresMasterDataImportTransactionRepository({ queryJson });
  const workspace = { attachments: [], attachmentLinks: [], attachmentAccessLogs: [] };

  assert.equal((await attachmentRepository.loadState()).attachments.length, 0);

  const attachment = buildAttachment({
    attachmentId: "ATT-LIVE-REPO-001",
    ownerId: "ST-LIVE-REPO-001",
    uploadedBy: "U-FINANCE-A",
  });
  const link = {
    id: "ALINK-LIVE-REPO-001",
    attachmentId: attachment.attachmentId,
    ownerType: "statement",
    ownerId: attachment.ownerId,
    purpose: "payment_screenshot",
    createdAt: "2026-07-01T10:30:00.000Z",
  };

  const saved = await attachmentRepository.createAttachment({ workspace, attachment, link });
  assert.equal(saved.attachmentId, attachment.attachmentId);
  assert.equal(saved.ownerId, "ST-LIVE-REPO-001");

  const listed = await attachmentRepository.listAttachments({
    filters: {
      ownerType: "statement",
      ownerId: "ST-LIVE-REPO-001",
      purpose: "payment_screenshot",
      fileType: "image",
      keyword: "live",
    },
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].storageKey, attachment.storageKey);

  const found = await attachmentRepository.findAttachmentById({ attachmentId: attachment.attachmentId });
  assert.equal(found.fileName, attachment.fileName);

  const savedLog = await auditRepository.recordAccessLog({
    workspace,
    accessLog: buildAccessLog({
      logId: "ALOG-LIVE-REPO-001",
      attachmentId: attachment.attachmentId,
      operatorId: "U-FINANCE-A",
      operationLogId: "LOG-LIVE-REPO-001",
    }),
  });
  assert.equal(savedLog.logId, "ALOG-LIVE-REPO-001");

  const accessLogs = await auditRepository.listAccessLogs({ attachmentId: attachment.attachmentId, limit: 10 });
  assert.equal(accessLogs.total, 1);
  assert.equal(accessLogs.items[0].operationLogId, "LOG-LIVE-REPO-001");

  const paymentWorkspace = { paymentRecords: [] };
  const paymentRecord = await paymentRepository.createPaymentRecord({
    workspace: paymentWorkspace,
    paymentRecord: buildPaymentRecord({
      paymentRecordId: "PAY-LIVE-REPO-001",
      statementId: "ST-LIVE-REPO-001",
      customerId: "C-LIVE-REPO",
      operatorId: "U-FINANCE-A",
    }),
  });
  assert.equal(paymentRecord.paymentRecordId, "PAY-LIVE-REPO-001");
  assert.equal(paymentRecord.attachmentIds[0], "ATT-PAY-LIVE-001");
  const paymentRecords = await paymentRepository.listPaymentRecords({ filters: { statementId: "ST-LIVE-REPO-001" } });
  assert.equal(paymentRecords.length, 1);
  assert.equal(paymentRecords[0].customerId, "C-LIVE-REPO");

  const masterDataWorkspace = { operationLogs: [] };
  const masterDataExecution = buildLiveMasterDataImportExecution();
  const masterDataImport = await masterDataImportTransactionRepository.applyImportExecution({
    workspace: masterDataWorkspace,
    importExecution: masterDataExecution,
    operationLog: buildLiveMasterDataImportOperationLog(masterDataExecution.executionId),
  });
  assert.equal(masterDataImport.importExecution.status, "committed");
  assert.equal(masterDataImport.importExecution.transactionSummary.repositoryKind, "postgres");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM customers WHERE id = 'C-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM price_table_items WHERE id = 'PTI-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM employees WHERE id = 'EMP-MD-LIVE-001' AND account_enabled = false AND profile_status = 'pending_admin_review';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM machines WHERE id = 'MACH-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-MD-LIVE-IMPORT-001';", { capture: true }).trim()), 1);

  const masterDataReviewWorkspace = { operationLogs: [] };
  const masterDataReviewDraft = buildLiveMasterDataImportReviewDraft();
  const masterDataReviewPlan = buildLiveMasterDataImportConfirmationPlan(masterDataReviewDraft);
  const masterDataReviewPlanLog = buildLiveMasterDataImportReviewPlanOperationLog(masterDataReviewPlan.planId);
  const savedMasterDataReviewPlan = await masterDataImportReviewRepository.saveConfirmationPlan({
    workspace: masterDataReviewWorkspace,
    reviewDraft: masterDataReviewDraft,
    confirmationPlan: masterDataReviewPlan,
    operationLog: masterDataReviewPlanLog,
  });
  assert.equal(savedMasterDataReviewPlan.confirmationPlan.planId, masterDataReviewPlan.planId);
  assert.equal(savedMasterDataReviewPlan.confirmationPlan.operationLogId, masterDataReviewPlanLog.id);
  assert.equal((await masterDataImportReviewRepository.listConfirmationPlans({ filters: { draftId: masterDataReviewDraft.draftId } })).length, 1);

  const masterDataReviewExecution = buildLiveMasterDataImportReviewExecution(masterDataReviewPlan);
  const masterDataReviewExecutionLog = buildLiveMasterDataImportReviewExecutionOperationLog(masterDataReviewExecution.executionId);
  const savedMasterDataReviewExecution = await masterDataImportReviewRepository.saveImportExecution({
    workspace: masterDataReviewWorkspace,
    confirmationPlan: savedMasterDataReviewPlan.confirmationPlan,
    importExecution: masterDataReviewExecution,
    operationLog: masterDataReviewExecutionLog,
  });
  assert.equal(savedMasterDataReviewExecution.importExecution.executionId, masterDataReviewExecution.executionId);
  assert.equal(savedMasterDataReviewExecution.confirmationPlan.lastExecutionId, masterDataReviewExecution.executionId);
  assert.equal((await masterDataImportReviewRepository.listImportExecutions({ filters: { status: "committed" } })).length, 1);
  assert.equal((await masterDataImportReviewRepository.loadState()).masterDataImportConfirmationPlans.length, 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM master_data_import_review_drafts WHERE id = 'MDR-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM master_data_import_confirmation_plans WHERE id = 'MDP-MD-REVIEW-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM master_data_import_executions WHERE id = 'MDE-MD-REVIEW-LIVE-001';", { capture: true }).trim()), 1);

  const statementBefore = buildStatement({ id: "ST-LIVE-REPO-001", customerId: "C-LIVE-REPO", status: "待生成" });
  const statementAfter = buildStatement({
    id: "ST-LIVE-REPO-001",
    customerId: "C-LIVE-REPO",
    status: "差额待确认",
    received: 200,
    variance: 73,
  });
  const transactionWorkspace = {
    statements: [statementBefore],
    paymentRecords: [],
    todos: [],
    operationLogs: [],
  };
  const paymentTransaction = await paymentTransactionRepository.recordStatementPayment({
    workspace: transactionWorkspace,
    statements: [statementAfter],
    statement: statementAfter,
    paymentRecord: buildPaymentRecord({
      paymentRecordId: "PAY-LIVE-TXN-001",
      statementId: "ST-LIVE-REPO-001",
      customerId: "C-LIVE-REPO",
      operatorId: "U-FINANCE-A",
      amount: 200,
    }),
    todo: buildTodo({
      todoId: "T-LIVE-PAY-TXN-001",
      statementId: "ST-LIVE-REPO-001",
    }),
    operationLog: buildOperationLog({ logId: "LOG-LIVE-PAY-TXN-001", before: statementBefore, after: statementAfter }),
  });
  assert.equal(paymentTransaction.statement.status, "差额待确认");
  assert.equal(paymentTransaction.payment.paymentRecordId, "PAY-LIVE-TXN-001");
  assert.equal(paymentTransaction.todo.id, "T-LIVE-PAY-TXN-001");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'received', received_amount, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-LIVE-REPO-001';").status, "差额待确认");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-PAY-TXN-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-PAY-TXN-001';", { capture: true }).trim()), 1);

  const varianceBefore = buildStatement({
    id: "ST-LIVE-VAR-001",
    customerId: "C-LIVE-REPO",
    status: "差额待确认",
    received: 200,
    variance: 73,
  });
  const varianceAfter = buildStatement({
    id: "ST-LIVE-VAR-001",
    customerId: "C-LIVE-REPO",
    status: "有欠款",
    received: 200,
    variance: 73,
  });
  const varianceTransaction = await settlementTransactionRepository.handleStatementVariance({
    workspace: { statements: [varianceBefore], varianceRecords: [], todos: [], operationLogs: [] },
    statements: [varianceAfter],
    statement: varianceAfter,
    varianceRecord: buildVarianceRecord({
      varianceRecordId: "VAR-LIVE-TXN-001",
      statementId: "ST-LIVE-VAR-001",
      amount: 73,
      operatorId: "U-FINANCE-A",
    }),
    todo: buildTodo({
      todoId: "T-LIVE-VAR-TXN-001",
      statementId: "ST-LIVE-VAR-001",
    }),
    operationLog: buildOperationLog({ logId: "LOG-LIVE-VAR-TXN-001", action: "handle_statement_variance", before: varianceBefore, after: varianceAfter }),
  });
  assert.equal(varianceTransaction.varianceRecord.reason, "未收差额转欠款");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-LIVE-VAR-001';").status, "有欠款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM variance_records WHERE id = 'VAR-LIVE-TXN-001';", { capture: true }).trim()), 1);

  const varianceCommitted = varianceTransaction.statement;
  const writtenOff = {
    ...varianceCommitted,
    status: "已确认欠款",
  };
  const writeOffTransaction = await settlementTransactionRepository.writeOffStatement({
    workspace: { statements: [varianceCommitted], varianceRecords: [], todos: [], operationLogs: [] },
    statements: [writtenOff],
    statement: writtenOff,
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-WRITE-TXN-001",
      action: "write_off_statement",
      before: varianceCommitted,
      after: writtenOff,
    }),
  });
  assert.equal(writeOffTransaction.statement.status, "已确认欠款");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-LIVE-VAR-001';").status, "已确认欠款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-WRITE-TXN-001';", { capture: true }).trim()), 1);

  const orderConfirmationWorkspace = { originalOrders: [], orderLines: [], fulfillments: [], operationLogs: [] };
  const orderConfirmation = await orderConfirmationRepository.confirmOrder({
    workspace: orderConfirmationWorkspace,
    order: buildConfirmedOrder({
      orderId: "ORD-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    orderLines: buildConfirmedOrderLines({
      orderId: "ORD-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      orderLineId: "OL-LIVE-CONFIRM-001",
      createdBy: "U-FINANCE-A",
    }),
    priceSnapshots: buildConfirmedPriceSnapshots({ orderLineId: "OL-LIVE-CONFIRM-001", createdBy: "U-FINANCE-A" }),
    fulfillmentRecords: buildConfirmedFulfillments({
      fulfillmentId: "F-LIVE-CONFIRM-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    inventoryReservations: buildConfirmedInventoryReservations({
      reservationId: "RSV-LIVE-CONFIRM-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      reservedQty: 25,
      createdBy: "U-FINANCE-A",
    }),
    inventoryLedgerEntries: buildConfirmedInventoryLedgerEntries({
      ledgerId: "LEDGER-LIVE-CONFIRM-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      sourceId: "OL-LIVE-CONFIRM-001",
      qtyBefore: 10,
      qtyChange: 25,
      qtyAfter: 35,
      operatorId: "U-FINANCE-A",
    }),
    todos: buildConfirmedTodos({
      todoId: "T-LIVE-CONFIRM-001",
      refId: "ORD-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-ORDER-CONFIRM-001",
      action: "confirm_order_draft",
      before: null,
      after: { id: "ORD-LIVE-CONFIRM-001", orderNo: "ORD-LIVE-CONFIRM-001" },
    }),
  });
  assert.equal(orderConfirmation.order.orderId, "ORD-LIVE-CONFIRM-001");
  assert.equal(orderConfirmation.orderLines.length, 1);
  assert.equal(orderConfirmation.priceSnapshots.length, 1);
  assert.equal(orderConfirmation.fulfillmentRecords.length, 1);
  assert.equal(orderConfirmation.inventoryReservations.length, 1);
  assert.equal(orderConfirmation.inventoryLedgerEntries.length, 1);
  assert.equal(orderConfirmation.todos.length, 1);
  assert.equal(
    queryJson("SELECT json_build_object('orderId', id, 'customerId', customer_id) AS result FROM original_orders WHERE id = 'ORD-LIVE-CONFIRM-001';").customerId,
    "C-LIVE-REPO",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM order_lines WHERE order_id = 'ORD-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM price_snapshots WHERE order_line_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM fulfillment_records WHERE order_line_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 35);

  const releasedReservation = await inventoryReservationReleaseRepository.releaseReservation({
    workspace: {
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 35 }],
      inventoryReservations: [orderConfirmation.inventoryReservations[0]],
      inventoryLedgers: [],
      operationLogs: [],
    },
    reservation: {
      ...orderConfirmation.inventoryReservations[0],
      reservedQty: 10,
      status: "部分释放",
    },
    inventoryAdjustment: {
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      reservedQtyChange: -15,
    },
    inventoryLedgerEntry: {
      ledgerId: "LEDGER-LIVE-RELEASE-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      changeType: "释放占用",
      qtyBefore: 35,
      qtyChange: -15,
      qtyAfter: 20,
      sourceType: "inventory_reservation_release",
      sourceId: "RSV-LIVE-CONFIRM-001",
      operatorId: "U-FINANCE-A",
      confirmedBy: "U-FINANCE-A",
      reason: "人工释放库存占用",
      remark: "释放占用 15",
    },
    operationLog: {
      id: "LOG-LIVE-RELEASE-001",
      targetType: "inventory_reservation",
      targetId: "RSV-LIVE-CONFIRM-001",
      action: "release_inventory_reservation",
      before: orderConfirmation.inventoryReservations[0],
      after: { ...orderConfirmation.inventoryReservations[0], reservedQty: 10, status: "部分释放" },
      reason: "人工释放库存占用",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:50:00.000Z",
      createdAt: "2026-07-02T10:50:00.000Z",
    },
  });
  assert.equal(releasedReservation.reservation.status, "部分释放");
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = 'RSV-LIVE-CONFIRM-001';").status,
    "部分释放",
  );
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 20);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-LIVE-RELEASE-001';", { capture: true }).trim()), 1);
  const releaseLedgerRead = await inventoryLedgerReadRepository.listInventoryLedgerEntries({
    query: {
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      sourceType: "inventory_reservation_release",
      sourceId: "RSV-LIVE-CONFIRM-001",
      pageSize: 5,
    },
  });
  assert.equal(releaseLedgerRead.total, 1);
  assert.equal(releaseLedgerRead.items[0].ledgerId, "LEDGER-LIVE-RELEASE-001");
  assert.equal(releaseLedgerRead.items[0].changeType, "释放占用");
  assert.equal(releaseLedgerRead.items[0].qtyChange, -15);
  assert.equal(releaseLedgerRead.items[0].colorName, "红色");

  const voidedOrderLine = await orderLineVoidRepository.voidOrderLine({
    workspace: {
      orderLines: orderConfirmation.orderLines,
      fulfillments: orderConfirmation.fulfillmentRecords,
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 20 }],
      inventoryReservations: [releasedReservation.reservation],
      inventoryLedgers: [],
      orderLineChangeRecords: [],
      operationLogs: [],
    },
    orderLine: {
      ...orderConfirmation.orderLines[0],
      lineStatus: "已关闭",
      status: "已关闭",
      exceptionTags: ["订单已作废"],
      voidedBy: "U-FINANCE-A",
      voidedAt: "2026-07-02T10:55:00.000Z",
      voidReason: "客户取消订单",
    },
    fulfillmentRecords: [{ ...orderConfirmation.fulfillmentRecords[0], status: "已取消", confirmedBy: "U-FINANCE-A" }],
    inventoryReservations: [{ ...releasedReservation.reservation, reservedQty: 0, status: "已释放" }],
    inventoryAdjustments: [{ inventoryItemId: "INV-LIVE-CONFIRM-001", reservedQtyChange: -10 }],
    inventoryLedgerEntries: [
      {
        ledgerId: "LEDGER-LIVE-VOID-001",
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        changeType: "释放占用",
        qtyBefore: 20,
        qtyChange: -10,
        qtyAfter: 10,
        sourceType: "order_line_void",
        sourceId: "OL-LIVE-CONFIRM-001",
        operatorId: "U-FINANCE-A",
        confirmedBy: "U-FINANCE-A",
        reason: "客户取消订单",
        remark: "订单作废释放占用 10",
      },
    ],
    orderLineChangeRecord: {
      changeRecordId: "OLCR-LIVE-VOID-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      changedFields: ["line_status", "void_reason", "inventory_reservation"],
      before: { lineStatus: "待交付确认" },
      after: { lineStatus: "已关闭" },
      reason: "客户取消订单",
      documentReprintRequired: true,
      changedBy: "U-FINANCE-A",
      createdAt: "2026-07-02T10:55:00.000Z",
    },
    operationLog: {
      id: "LOG-LIVE-VOID-001",
      targetType: "order_line",
      targetId: "OL-LIVE-CONFIRM-001",
      action: "void_order_line",
      before: { lineStatus: "待交付确认" },
      after: { lineStatus: "已关闭", releasedReservationIds: ["RSV-LIVE-CONFIRM-001"] },
      reason: "客户取消订单",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:55:00.000Z",
      createdAt: "2026-07-02T10:55:00.000Z",
    },
  });
  assert.equal(voidedOrderLine.orderLine.lineStatus, "已关闭");
  assert.equal(voidedOrderLine.inventoryReservations[0].status, "已释放");
  assert.equal(
    queryJson("SELECT json_build_object('lineStatus', line_status, 'voidReason', void_reason) AS result FROM order_lines WHERE id = 'OL-LIVE-CONFIRM-001';").lineStatus,
    "已关闭",
  );
  assert.equal(queryJson("SELECT json_build_object('status', status) AS result FROM fulfillment_records WHERE id = 'F-LIVE-CONFIRM-001';").status, "已取消");
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = 'RSV-LIVE-CONFIRM-001';").status,
    "已释放",
  );
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 10);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-LIVE-VOID-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM order_line_change_records WHERE id = 'OLCR-LIVE-VOID-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-VOID-001';", { capture: true }).trim()), 1);

  const quantityAdjustmentOrder = await orderConfirmationRepository.confirmOrder({
    workspace: { originalOrders: [], orderLines: [], fulfillments: [], operationLogs: [] },
    order: buildConfirmedOrder({
      orderId: "ORD-LIVE-QTY-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    orderLines: buildConfirmedOrderLines({
      orderId: "ORD-LIVE-QTY-001",
      customerId: "C-LIVE-REPO",
      orderLineId: "OL-LIVE-QTY-001",
      createdBy: "U-FINANCE-A",
    }).map((line) => ({ ...line, qty: 20, amount: 20 })),
    priceSnapshots: buildConfirmedPriceSnapshots({ orderLineId: "OL-LIVE-QTY-001", createdBy: "U-FINANCE-A" }).map(
      (snapshot) => ({ ...snapshot, chargeableQty: 20, amount: 20, finalAmount: 20 }),
    ),
    fulfillmentRecords: buildConfirmedFulfillments({
      fulfillmentId: "F-LIVE-QTY-001",
      orderLineId: "OL-LIVE-QTY-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }).map((fulfillment) => ({ ...fulfillment, qty: 20 })),
    inventoryReservations: buildConfirmedInventoryReservations({
      reservationId: "RSV-LIVE-QTY-001",
      orderLineId: "OL-LIVE-QTY-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      reservedQty: 20,
      createdBy: "U-FINANCE-A",
    }),
    inventoryLedgerEntries: buildConfirmedInventoryLedgerEntries({
      ledgerId: "LEDGER-LIVE-QTY-CONFIRM-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      sourceId: "OL-LIVE-QTY-001",
      qtyBefore: 10,
      qtyChange: 20,
      qtyAfter: 30,
      operatorId: "U-FINANCE-A",
    }),
    todos: [],
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-QTY-CONFIRM-001",
      action: "confirm_order_draft",
      before: null,
      after: { id: "ORD-LIVE-QTY-001", orderNo: "ORD-LIVE-QTY-001" },
    }),
  });
  assert.equal(quantityAdjustmentOrder.orderLines[0].originalQty, 20);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 30);

  const decreasedQuantityOrderLine = await orderLineQuantityAdjustmentRepository.adjustOrderLineQuantity({
    workspace: {
      orderLines: quantityAdjustmentOrder.orderLines,
      fulfillments: quantityAdjustmentOrder.fulfillmentRecords,
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 30 }],
      priceSnapshots: quantityAdjustmentOrder.priceSnapshots,
      inventoryReservations: quantityAdjustmentOrder.inventoryReservations,
      inventoryLedgers: [],
      orderLineChangeRecords: [],
      operationLogs: [],
    },
    orderLine: { ...quantityAdjustmentOrder.orderLines[0], originalQty: 12, qty: 12 },
    fulfillmentRecords: [{ ...quantityAdjustmentOrder.fulfillmentRecords[0], expectedQty: 12, qty: 12, confirmedBy: "U-FINANCE-A" }],
    priceSnapshots: [
      {
        priceSnapshotId: "PS-LIVE-QTY-DECREASE-001",
        orderLineId: "OL-LIVE-QTY-001",
        snapshotType: "quantity_adjustment",
        versionNo: 1,
        bagPrice: 1,
        printPrice: 0,
        otherFee: 0,
        adjustmentAmount: 0,
        chargeableQty: 12,
        finalAmount: 12,
        overrideReason: "订单改量 20 -> 12，按原订单单价重算",
        createdBy: "U-FINANCE-A",
      },
    ],
    inventoryReservations: [{ ...quantityAdjustmentOrder.inventoryReservations[0], reservedQty: 12, qty: 12, status: "生效" }],
    inventoryAdjustments: [{ inventoryItemId: "INV-LIVE-CONFIRM-001", reservedQtyChange: -8 }],
    inventoryLedgerEntries: [
      {
        ledgerId: "LEDGER-LIVE-QTY-DECREASE-001",
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        changeType: "订单改量释放占用",
        qtyBefore: 30,
        qtyChange: -8,
        qtyAfter: 22,
        sourceType: "order_line_quantity_adjustment",
        sourceId: "OL-LIVE-QTY-001",
        operatorId: "U-FINANCE-A",
        confirmedBy: "U-FINANCE-A",
        reason: "客户改量",
        remark: "订单改量 20 -> 12，释放占用 8",
      },
    ],
    orderLineChangeRecord: {
      changeRecordId: "OLCR-LIVE-QTY-DECREASE-001",
      orderLineId: "OL-LIVE-QTY-001",
      changedFields: ["original_qty", "fulfillment_expected_qty", "inventory_reservation"],
      before: { originalQty: 20 },
      after: { originalQty: 12 },
      reason: "客户改量",
      documentReprintRequired: true,
      changedBy: "U-FINANCE-A",
      createdAt: "2026-07-02T11:05:00.000Z",
    },
    operationLog: {
      id: "LOG-LIVE-QTY-DECREASE-001",
      targetType: "order_line",
      targetId: "OL-LIVE-QTY-001",
      action: "adjust_order_line_quantity",
      before: { originalQty: 20 },
      after: { originalQty: 12, adjustedReservationIds: ["RSV-LIVE-QTY-001"] },
      reason: "客户改量",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T11:05:00.000Z",
      createdAt: "2026-07-02T11:05:00.000Z",
    },
  });
  assert.equal(decreasedQuantityOrderLine.orderLine.originalQty, 12);
  assert.equal(decreasedQuantityOrderLine.fulfillmentRecords[0].expectedQty, 12);
  assert.equal(decreasedQuantityOrderLine.inventoryReservations[0].reservedQty, 12);
  assert.equal(
    queryJson("SELECT json_build_object('originalQty', original_qty) AS result FROM order_lines WHERE id = 'OL-LIVE-QTY-001';").originalQty,
    12,
  );
  assert.equal(queryJson("SELECT json_build_object('expectedQty', expected_qty) AS result FROM fulfillment_records WHERE id = 'F-LIVE-QTY-001';").expectedQty, 12);
  assert.equal(
    queryJson("SELECT json_build_object('chargeableQty', chargeable_qty, 'finalAmount', final_amount) AS result FROM price_snapshots WHERE id = 'PS-LIVE-QTY-DECREASE-001';").chargeableQty,
    12,
  );
  assert.equal(Number(runPsql("SELECT final_amount FROM price_snapshots WHERE id = 'PS-LIVE-QTY-DECREASE-001';", { capture: true }).trim()), 12);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 22);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-LIVE-QTY-DECREASE-001';", { capture: true }).trim()), 1);

  const increasedQuantityOrderLine = await orderLineQuantityAdjustmentRepository.adjustOrderLineQuantity({
    workspace: {
      orderLines: [decreasedQuantityOrderLine.orderLine],
      fulfillments: decreasedQuantityOrderLine.fulfillmentRecords,
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 22 }],
      priceSnapshots: decreasedQuantityOrderLine.priceSnapshots,
      inventoryReservations: decreasedQuantityOrderLine.inventoryReservations,
      inventoryLedgers: [],
      orderLineChangeRecords: [],
      operationLogs: [],
    },
    orderLine: { ...decreasedQuantityOrderLine.orderLine, originalQty: 15, qty: 15 },
    fulfillmentRecords: [{ ...decreasedQuantityOrderLine.fulfillmentRecords[0], expectedQty: 15, qty: 15, confirmedBy: "U-FINANCE-A" }],
    priceSnapshots: [
      {
        priceSnapshotId: "PS-LIVE-QTY-INCREASE-001",
        orderLineId: "OL-LIVE-QTY-001",
        snapshotType: "quantity_adjustment",
        versionNo: 2,
        bagPrice: 1,
        printPrice: 0,
        otherFee: 0,
        adjustmentAmount: 0,
        chargeableQty: 15,
        finalAmount: 15,
        overrideReason: "订单改量 12 -> 15，按原订单单价重算",
        createdBy: "U-FINANCE-A",
      },
    ],
    inventoryReservations: [{ ...decreasedQuantityOrderLine.inventoryReservations[0], reservedQty: 15, qty: 15, status: "生效" }],
    inventoryAdjustments: [{ inventoryItemId: "INV-LIVE-CONFIRM-001", reservedQtyChange: 3 }],
    inventoryLedgerEntries: [
      {
        ledgerId: "LEDGER-LIVE-QTY-INCREASE-001",
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        changeType: "订单改量补占用",
        qtyBefore: 22,
        qtyChange: 3,
        qtyAfter: 25,
        sourceType: "order_line_quantity_adjustment",
        sourceId: "OL-LIVE-QTY-001",
        operatorId: "U-FINANCE-A",
        confirmedBy: "U-FINANCE-A",
        reason: "客户改量",
        remark: "订单改量 12 -> 15，补占用 3",
      },
    ],
    orderLineChangeRecord: {
      changeRecordId: "OLCR-LIVE-QTY-INCREASE-001",
      orderLineId: "OL-LIVE-QTY-001",
      changedFields: ["original_qty", "fulfillment_expected_qty", "inventory_reservation"],
      before: { originalQty: 12 },
      after: { originalQty: 15 },
      reason: "客户改量",
      documentReprintRequired: true,
      changedBy: "U-FINANCE-A",
      createdAt: "2026-07-02T11:10:00.000Z",
    },
    operationLog: {
      id: "LOG-LIVE-QTY-INCREASE-001",
      targetType: "order_line",
      targetId: "OL-LIVE-QTY-001",
      action: "adjust_order_line_quantity",
      before: { originalQty: 12 },
      after: { originalQty: 15, adjustedReservationIds: ["RSV-LIVE-QTY-001"] },
      reason: "客户改量",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T11:10:00.000Z",
      createdAt: "2026-07-02T11:10:00.000Z",
    },
  });
  assert.equal(increasedQuantityOrderLine.orderLine.originalQty, 15);
  assert.equal(increasedQuantityOrderLine.priceSnapshots[0].finalAmount, 15);
  assert.equal(increasedQuantityOrderLine.inventoryReservations[0].reservedQty, 15);
  assert.equal(Number(runPsql("SELECT final_amount FROM price_snapshots WHERE id = 'PS-LIVE-QTY-INCREASE-001';", { capture: true }).trim()), 15);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 25);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM order_line_change_records WHERE id LIKE 'OLCR-LIVE-QTY-%';", { capture: true }).trim()), 2);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id LIKE 'LOG-LIVE-QTY-%';", { capture: true }).trim()), 3);

  runPsql(
    `INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled, created_by)
     VALUES
       ('BAG-LIVE-01', 'BAG-LIVE-01', 'Postgres live 制袋机', 'bag_making', '1号车间', 'active', true, 'U-OFFICE-A'),
       ('BAG-LIVE-02', 'BAG-LIVE-02', 'Postgres live 备用制袋机', 'bag_making', '1号车间', 'active', true, 'U-OFFICE-A')
     ON CONFLICT (id) DO NOTHING;`,
  );
  const productionWorkspace = {
    productionTasks: [],
    workshopReports: [],
    packingTasks: [],
    packages: [],
    orderLines: [{ id: "OL-LIVE-PROD-001", status: "制袋中" }],
    fulfillments: [],
    inventories: [{ id: "INV-LIVE-PROD-001", inStock: 20, reserved: 0, locked: 0 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    machineCapacityBaselines: [],
    operationLogs: [],
  };
  const productionReport = await productionPackingRepository.recordProductionReport({
    workspace: productionWorkspace,
    productionTask: buildProductionTaskRecord({ taskStatus: "已完成" }),
    workshopReport: buildWorkshopReportRecord({ remark: "Postgres live O'Brien production report" }),
    orderLine: buildProductionOrderLineRecord({ lineStatus: "待打包" }),
    packingTask: buildPackingTaskRecord({ status: "待打包" }),
    machineCapacityBaseline: buildMachineCapacityBaselineRecord(),
    inventoryReservations: [buildProductionReservationRecord()],
    inventoryAdjustments: [{ inventoryItemId: "INV-LIVE-PROD-001", onHandQtyChange: 80, reservedQtyChange: 80 }],
    inventoryLedgerEntries: [
      buildProductionInventoryLedgerRecord({ ledgerId: "LEDGER-LIVE-PROD-IN-001", qtyBefore: 20, qtyChange: 80, qtyAfter: 100 }),
      buildProductionInventoryLedgerRecord({
        ledgerId: "LEDGER-LIVE-PROD-RSV-001",
        changeType: "生产完成占用",
        qtyBefore: 0,
        qtyChange: 80,
        qtyAfter: 80,
        sourceType: "production_report_reservation",
      }),
    ],
    operationLog: buildProductionOperationLog({ logId: "LOG-LIVE-PROD-001", action: "complete_production_report" }),
  });
  assert.equal(productionReport.productionTask.taskStatus, "已完成");
  assert.equal(productionReport.workshopReport.machineCount, 8888);
  assert.equal(productionReport.machineCapacityBaseline.dailyCapacityQty, 80);
  assert.equal(productionWorkspace.machineCapacityBaselines[0].sourceKind, "production_report");
  assert.equal(productionReport.inventoryReservations[0].reservedQty, 80);
  assert.equal(
    queryJson("SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = 'INV-LIVE-PROD-001';").onHand,
    100,
  );
  assert.equal(
    queryJson("SELECT json_build_object('machineCount', machine_count) AS result FROM workshop_reports WHERE id = 'WR-LIVE-PROD-001';").machineCount,
    8888,
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = 'WR-LIVE-PROD-001';", { capture: true }).trim()), 2);
  assert.equal(
    queryJson(
      "SELECT json_build_object('dailyCapacityQty', daily_capacity_qty, 'sourceKind', source_kind, 'confidence', confidence) AS result FROM machine_capacity_baselines WHERE id = 'MCB-LIVE-PROD-001';",
    ).dailyCapacityQty,
    80,
  );
  const scheduleRecordWorkspace = { productionScheduleRecords: [], operationLogs: [] };
  const scheduleRecordResult = await productionScheduleRecordRepository.resequenceMachineQueue({
    workspace: scheduleRecordWorkspace,
    records: [
      buildProductionScheduleRecord({
        scheduleRecordId: "SQR-LIVE-PROD-001",
        productionTaskId: "PT-LIVE-PROD-001",
        orderLineId: "OL-LIVE-PROD-001",
        machineId: "BAG-LIVE-01",
        queueSeq: 1,
      }),
    ],
    operationLog: buildProductionScheduleOperationLog(),
  });
  assert.equal(scheduleRecordResult.productionScheduleRecords[0].productionTaskId, "PT-LIVE-PROD-001");
  assert.equal(scheduleRecordResult.productionScheduleRecords[0].queueSeq, 1);
  assert.equal(scheduleRecordWorkspace.productionScheduleRecords[0].sourceKind, "manual_resequence");
  assert.equal(
    queryJson(
      "SELECT json_build_object('queueSeq', queue_seq, 'updatedBy', sequence_updated_by, 'sourceKind', source_kind) AS result FROM production_schedule_records WHERE id = 'SQR-LIVE-PROD-001';",
    ).updatedBy,
    "U-OFFICE-A",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SCHEDULE-RESEQ-001';", { capture: true }).trim()), 1);
  const scheduleRecords = await productionScheduleRecordRepository.listProductionScheduleRecords({
    filters: { machineId: "BAG-LIVE-01", status: "active" },
  });
  assert.equal(scheduleRecords.length, 1);
  assert.equal(scheduleRecords[0].scheduleRecordId, "SQR-LIVE-PROD-001");
  const movedScheduleRecordResult = await productionScheduleRecordRepository.moveMachineQueueItem({
    workspace: scheduleRecordWorkspace,
    productionTask: buildProductionTaskRecord({ taskStatus: "已完成", machineId: "BAG-LIVE-02" }),
    records: [
      buildProductionScheduleRecord({
        scheduleRecordId: "SQR-LIVE-PROD-001",
        productionTaskId: "PT-LIVE-PROD-001",
        orderLineId: "OL-LIVE-PROD-001",
        machineId: "BAG-LIVE-01",
        queueSeq: 0,
        status: "moved",
        sourceKind: "machine_reassignment",
        remark: "Postgres live production schedule moved away from source machine",
      }),
      buildProductionScheduleRecord({
        scheduleRecordId: "SQR-BAG-LIVE-02-LIVE-PROD-001",
        productionTaskId: "PT-LIVE-PROD-001",
        orderLineId: "OL-LIVE-PROD-001",
        machineId: "BAG-LIVE-02",
        queueSeq: 1,
        status: "active",
        sourceKind: "machine_reassignment",
        remark: "Postgres live production schedule moved to target machine",
      }),
    ],
    operationLog: buildProductionScheduleOperationLog({
      logId: "LOG-LIVE-SCHEDULE-MOVE-001",
      targetId: "PT-LIVE-PROD-001",
      action: "move_production_schedule_queue_item",
      before: { sourceMachineId: "BAG-LIVE-01" },
      after: {
        targetMachineId: "BAG-LIVE-02",
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
      },
      reason: "Postgres live production schedule move",
    }),
  });
  assert.equal(movedScheduleRecordResult.productionTask.machineId, "BAG-LIVE-02");
  assert.equal(scheduleRecordWorkspace.productionTasks[0].machineId, "BAG-LIVE-02");
  assert.equal(
    queryJson("SELECT json_build_object('machineId', machine_id) AS result FROM production_tasks WHERE id = 'PT-LIVE-PROD-001';").machineId,
    "BAG-LIVE-02",
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', schedule_status, 'sourceKind', source_kind, 'queueSeq', queue_seq) AS result FROM production_schedule_records WHERE id = 'SQR-LIVE-PROD-001';",
    ).status,
    "moved",
  );
  const movedTargetScheduleRecords = await productionScheduleRecordRepository.listProductionScheduleRecords({
    filters: { machineId: "BAG-LIVE-02", status: "active" },
  });
  assert.equal(movedTargetScheduleRecords.length, 1);
  assert.equal(movedTargetScheduleRecords[0].productionTaskId, "PT-LIVE-PROD-001");
  assert.equal(movedTargetScheduleRecords[0].sourceKind, "machine_reassignment");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SCHEDULE-MOVE-001';", { capture: true }).trim()), 1);

  const packingCompletion = await productionPackingRepository.completePackingTask({
    workspace: productionWorkspace,
    packingTask: buildPackingTaskRecord({ status: "已完成", actualPackedQty: 80 }),
    packages: [
      buildPackageRecord({ packageId: "PKG-LIVE-PROD-001-1", packageSeq: 1, packageCount: 2, packedQty: 40 }),
      buildPackageRecord({ packageId: "PKG-LIVE-PROD-001-2", packageSeq: 2, packageCount: 2, packedQty: 40 }),
    ],
    fulfillment: null,
    orderLine: buildProductionOrderLineRecord({ lineStatus: "待打印标签" }),
    inventoryLedgerEntries: [
      buildProductionInventoryLedgerRecord({
        ledgerId: "LEDGER-LIVE-PROD-PACK-001",
        changeType: "打包完成确认",
        qtyBefore: 80,
        qtyChange: 0,
        qtyAfter: 80,
        sourceType: "packing_complete",
        sourceId: "PKT-LIVE-PROD-001",
      }),
    ],
    operationLog: buildProductionOperationLog({
      logId: "LOG-LIVE-PACK-001",
      targetType: "packing_task",
      targetId: "PKT-LIVE-PROD-001",
      action: "complete_packing_task",
    }),
  });
  assert.equal(packingCompletion.packingTask.status, "已完成");
  assert.equal(packingCompletion.packages.length, 2);
  assert.equal(packingCompletion.inventoryLedgerEntries[0].qtyChange, 0);
  const productionInventoryAfterPacking = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = 'INV-LIVE-PROD-001';",
  );
  assert.equal(Number(productionInventoryAfterPacking.onHand), 100);
  assert.equal(Number(productionInventoryAfterPacking.reserved), 80);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM packages WHERE order_line_id = 'OL-LIVE-PROD-001';", { capture: true }).trim()), 2);
  assert.equal(
    queryJson("SELECT json_build_object('lineStatus', line_status) AS result FROM order_lines WHERE id = 'OL-LIVE-PROD-001';").lineStatus,
    "待打印标签",
  );
  const coldStartProductionDetail = await productionPackingReadRepository.getProductionTaskDetail({
    productionTaskId: "PT-LIVE-PROD-001",
  });
  assert.equal(coldStartProductionDetail.productionTask.taskStatus, "已完成");
  assert.equal(coldStartProductionDetail.latestReport.machineCount, 8888);
  assert.equal(coldStartProductionDetail.latestReport.machineCountAffectsInventory, false);
  assert.equal(coldStartProductionDetail.inventoryLedgerEntries.length, 2);
  assert.equal(coldStartProductionDetail.reservations[0].qty, 80);
  const coldStartPackingDetail = await productionPackingReadRepository.getPackingTaskDetail({
    packingTaskId: "PKT-LIVE-PROD-001",
  });
  assert.equal(coldStartPackingDetail.packingTask.status, "已完成");
  assert.equal(coldStartPackingDetail.packages.length, 2);
  assert.equal(coldStartPackingDetail.inventoryLedgerEntries[0].sourceType, "packing_complete");
  assert.equal(coldStartPackingDetail.inventoryDeducted, false);

  const fulfillmentActionWorkspace = {
    fulfillments: [buildFulfillmentActionRecord({ fulfillmentId: "F001", status: "待出库" })],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const fulfillmentAction = await fulfillmentActionRepository.recordFulfillmentAction({
    workspace: fulfillmentActionWorkspace,
    fulfillment: buildFulfillmentActionRecord({ fulfillmentId: "F001", status: "待确认拉走" }),
    printRecord: buildFulfillmentPrintRecord({ printRecordId: "PR-LIVE-FULFILLMENT-001", targetId: "F001" }),
    fulfillmentException: buildFulfillmentExceptionRecord({
      exceptionId: "FEX-LIVE-FULFILLMENT-001",
      fulfillmentId: "F001",
      todoId: "T-LIVE-FULFILLMENT-001",
    }),
    todo: buildFulfillmentTodo({ todoId: "T-LIVE-FULFILLMENT-001", refId: "ORD-0629-001-01" }),
    operationLog: buildFulfillmentOperationLog({
      logId: "LOG-LIVE-FULFILLMENT-ACTION-001",
      action: "create_fulfillment_exception",
      fulfillmentId: "F001",
    }),
  });
  assert.equal(fulfillmentAction.fulfillment.status, "待确认拉走");
  assert.equal(fulfillmentAction.printRecord.printRecordId, "PR-LIVE-FULFILLMENT-001");
  assert.equal(fulfillmentAction.fulfillmentException.exceptionId, "FEX-LIVE-FULFILLMENT-001");
  assert.equal(fulfillmentAction.todo.id, "T-LIVE-FULFILLMENT-001");
  assert.equal(fulfillmentActionWorkspace.printRecords.length, 1);
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'actualQty', actual_qty) AS result FROM fulfillment_records WHERE id = 'F001';").status,
    "待确认拉走",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM print_records WHERE id = 'PR-LIVE-FULFILLMENT-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM fulfillment_exceptions WHERE id = 'FEX-LIVE-FULFILLMENT-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-FULFILLMENT-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-FULFILLMENT-ACTION-001';", { capture: true }).trim()), 1);

  const deliveryEvidenceAfter = buildFulfillmentActionRecord({
    fulfillmentId: "F002",
    orderLineId: "ORD-0629-002-01",
    customerId: "C002",
    method: "送货",
    expectedQty: 1200,
    actualQty: 1200,
    status: "已交付",
    deliveredAt: "2026-07-02T09:30:00.000Z",
    confirmedAt: "2026-07-02T09:30:00.000Z",
    watermarkedPhotoAttached: true,
    watermarkedPhotoAttachmentId: "ATT-LIVE-DELIVERY-WM-001",
    watermarkedPhotoUrl: "https://assets.example.test/live-delivery-wm.jpg",
    watermarkId: "WM-LIVE-DELIVERY-001",
    watermarkText: "李四电商 / 厚街仓库门岗 / 水印 WM-LIVE-DELIVERY-001",
    watermarkCapturedAt: "2026-07-02T09:10:00.000Z",
    watermarkLocationLabel: "厚街仓库门岗",
    watermarkGeoPoint: "22.920000,113.680000",
    watermarkAddress: "厚街仓库 A 区",
    watermarkOperatorId: "U-DRIVER-A",
    watermarkOperatorName: "司机A",
    signaturePhotoAttached: true,
    signaturePhotoAttachmentId: "ATT-LIVE-DELIVERY-SIGN-001",
    deliveryEvidenceReviewStatus: "需重拍",
    deliveryEvidenceReviewedAt: "2026-07-02T10:15:00.000Z",
    deliveryEvidenceReviewedBy: "办公室A",
    deliveryEvidenceReviewedByUserId: "U-OFFICE-A",
    deliveryEvidenceIssueReason: "水印定位不清晰",
    deliveryEvidenceReviewRemark: "请司机补拍",
    deliveryEvidenceReviewUpdatedAt: "2026-07-02T10:15:00.000Z",
  });
  const deliveryEvidenceWorkspace = {
    fulfillments: [buildFulfillmentActionRecord({ fulfillmentId: "F002", status: "已备货" })],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const deliveryEvidenceAction = await fulfillmentActionRepository.recordFulfillmentAction({
    workspace: deliveryEvidenceWorkspace,
    fulfillment: deliveryEvidenceAfter,
    todo: {
      id: "T-LIVE-DELIVERY-EVIDENCE-RETAKE-001",
      type: "照片待重拍",
      customerId: "C002",
      ref: "ORD-0629-002-01",
      summary: "李四电商送达证据需重拍：水印定位不清晰",
      latest: "2026-07-02T15:00:00.000Z",
      urgency: "异常",
      impact: "需司机补拍水印照片",
      createdBy: "U-OFFICE-A",
    },
    operationLog: {
      id: "LOG-LIVE-DELIVERY-EVIDENCE-REVIEW-001",
      targetType: "fulfillment",
      targetId: "F002",
      action: "reject_delivery_evidence",
      before: buildFulfillmentActionRecord({ fulfillmentId: "F002", status: "已交付" }),
      after: deliveryEvidenceAfter,
      reason: "水印定位不清晰",
      operatorId: "U-OFFICE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:15:00.000Z",
      createdAt: "2026-07-02T10:15:00.000Z",
    },
  });
  assert.equal(deliveryEvidenceAction.fulfillment.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
  assert.equal(deliveryEvidenceAction.fulfillment.deliveryEvidenceReviewStatus, "需重拍");
  assert.equal(deliveryEvidenceAction.todo.id, "T-LIVE-DELIVERY-EVIDENCE-RETAKE-001");
  const persistedDeliveryEvidence = queryJson(
    `SELECT json_build_object(
      'watermarkedPhotoAttached', watermarked_photo_attached,
      'watermarkedPhotoAttachmentId', watermarked_photo_attachment_id,
      'watermarkId', watermark_id,
      'watermarkGeoPoint', watermark_geo_point,
      'signaturePhotoAttachmentId', signature_photo_attachment_id,
      'reviewStatus', delivery_evidence_review_status,
      'reviewedByUserId', delivery_evidence_reviewed_by_user_id,
      'issueReason', delivery_evidence_issue_reason
    ) AS result FROM fulfillment_records WHERE id = 'F002';`,
  );
  assert.equal(persistedDeliveryEvidence.watermarkedPhotoAttached, true);
  assert.equal(persistedDeliveryEvidence.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
  assert.equal(persistedDeliveryEvidence.watermarkId, "WM-LIVE-DELIVERY-001");
  assert.equal(persistedDeliveryEvidence.watermarkGeoPoint, "22.920000,113.680000");
  assert.equal(persistedDeliveryEvidence.signaturePhotoAttachmentId, "ATT-LIVE-DELIVERY-SIGN-001");
  assert.equal(persistedDeliveryEvidence.reviewStatus, "需重拍");
  assert.equal(persistedDeliveryEvidence.reviewedByUserId, "U-OFFICE-A");
  assert.equal(persistedDeliveryEvidence.issueReason, "水印定位不清晰");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-DELIVERY-EVIDENCE-RETAKE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-DELIVERY-EVIDENCE-REVIEW-001';", { capture: true }).trim()), 1);

  const repositoryDeviceFieldTest = await driverDeviceFieldTestRepository.recordDriverDeviceFieldTest({
    workspace: { fulfillments: [], operationLogs: [] },
    record: {
      recordId: "DQA-LIVE-REPO-F002",
      fulfillmentId: "F002",
      orderLineId: "ORD-0629-002-01",
      driverId: "U-DRIVER-A",
      operatorId: "U-DRIVER-A",
      operatorName: "司机A",
      checkedAt: "2026-07-02T10:45:00.000Z",
      deviceLabel: "iPhone 15 Pro",
      browserLabel: "Safari 17",
      userAgent: "Mozilla/5.0 Safari/604.1",
      language: "zh-CN",
      summary: { label: "通过 3/6，异常 1", passedCount: 3, issueCount: 1 },
      checks: [
        { key: "camera_permission", status: "passed" },
        { key: "watermark_photo", status: "passed" },
        { key: "package_label_scan", status: "passed" },
        { key: "geolocation", status: "blocked" },
      ],
      packageLabelScanSample: {
        sampleId: "DPLS-LIVE-REPO-F002-PKG-1",
        fulfillmentId: "F002",
        expectedPackageId: "PKG-LIVE-F002-1",
        scannedText: "LABEL:PKG-LIVE-F002-1",
        matchedPackageId: "PKG-LIVE-F002-1",
        method: "scanner_wedge",
        methodLabel: "扫码枪/键盘口",
        result: "matched",
        resultLabel: "已匹配",
        tone: "success",
        message: "repository live package label sample",
        checkedAt: "2026-07-02T10:44:59.000Z",
      },
      note: "repository live check",
    },
    operationLog: {
      id: "LOG-LIVE-DQA-REPO-001",
      targetType: "fulfillment",
      targetId: "F002",
      action: "driver_record_device_field_test",
      before: null,
      after: { recordId: "DQA-LIVE-REPO-F002" },
      reason: "通过 3/6，异常 1",
      operatorId: "U-DRIVER-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:45:01.000Z",
      createdAt: "2026-07-02T10:45:01.000Z",
    },
  });
  assert.equal(repositoryDeviceFieldTest.record.recordId, "DQA-LIVE-REPO-F002");
  assert.equal(repositoryDeviceFieldTest.record.packageLabelScanSample.matchedPackageId, "PKG-LIVE-F002-1");
  assert.equal(repositoryDeviceFieldTest.operationLogId, "LOG-LIVE-DQA-REPO-001");
  const persistedDeviceFieldTest = queryJson(
    "SELECT json_build_object('recordId', id, 'summary', summary_json->>'label', 'sampleMatchedPackageId', summary_json->'packageLabelScanSample'->>'matchedPackageId', 'operationLogId', operation_log_id) AS result FROM driver_device_field_tests WHERE id = 'DQA-LIVE-REPO-F002';",
  );
  assert.equal(persistedDeviceFieldTest.recordId, "DQA-LIVE-REPO-F002");
  assert.equal(persistedDeviceFieldTest.summary, "通过 3/6，异常 1");
  assert.equal(persistedDeviceFieldTest.sampleMatchedPackageId, "PKG-LIVE-F002-1");
  assert.equal(persistedDeviceFieldTest.operationLogId, "LOG-LIVE-DQA-REPO-001");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-DQA-REPO-001';", { capture: true }).trim()), 1);

  const driverDeliveryTaskList = await driverDeliveryTaskReadRepository.listDriverDeliveryTasks({
    query: { driverId: "U-DRIVER-A", status: "已完成", pageSize: 5 },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(driverDeliveryTaskList.metrics.completedCount >= 1, true);
  assert.equal(driverDeliveryTaskList.items.some((item) => item.fulfillmentId === "F002"), true);
  const driverDeliveryTaskDetail = await driverDeliveryTaskReadRepository.getDriverDeliveryTask({
    fulfillmentId: "F002",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(driverDeliveryTaskDetail.status, "已完成");
  assert.equal(driverDeliveryTaskDetail.driverId, "U-DRIVER-A");
  assert.equal(driverDeliveryTaskDetail.routeNo, "虎门线-A");
  assert.equal(driverDeliveryTaskDetail.routeSequence, 2);
  assert.equal(driverDeliveryTaskDetail.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
  assert.equal(driverDeliveryTaskDetail.deliveryEvidenceReviewStatus, "需重拍");
  assert.equal(driverDeliveryTaskDetail.deviceFieldTestRecord.recordId, "DQA-LIVE-REPO-F002");
  assert.equal(driverDeliveryTaskDetail.deviceFieldTestRecord.packageLabelScanSample.matchedPackageId, "PKG-LIVE-F002-1");
  assert.equal(driverDeliveryTaskDetail.deviceFieldTestSummary.label, "通过 3/6，异常 1");
  assert.match(driverDeliveryTaskDetail.goodsSummary, /1200个/);
  assert.equal(driverDeliveryTaskDetail.packageChecklist.length, 3);
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].packageId, "PKG-LIVE-F002-1");
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].labelText, "第 1/3 包");
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].quantityText, "400个");
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].status, "已打印");

  const statementExportWorkspace = { statementExportFiles: [], statementLines: [], operationLogs: [] };
  const exportFile = buildStatementExportFile({
    statementId: "ST-LIVE-REPO-001",
    downloadToken: "DL-LIVE-EXPORT-001",
    operationLogId: "LOG-LIVE-EXPORT-001",
  });
  const exportStatementLines = buildStatementExportLines({
    statementId: "ST-LIVE-REPO-001",
    orderLineId: "OL-LIVE-EXPORT-LINE-001",
    fulfillmentId: "F-LIVE-EXPORT-001",
  });
  const exportTransaction = await exportRepository.createExportFile({
    workspace: statementExportWorkspace,
    exportFile,
    statementLines: exportStatementLines,
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-EXPORT-001",
      action: "preview_statement",
      before: null,
      after: { id: "ST-LIVE-REPO-001", downloadToken: "DL-LIVE-EXPORT-001" },
    }),
  });
  assert.equal(exportTransaction.exportFile.downloadToken, "DL-LIVE-EXPORT-001");
  assert.equal(exportTransaction.statementLines.length, 1);
  assert.equal(statementExportWorkspace.statementExportFiles.length, 1);
  assert.equal(statementExportWorkspace.statementLines.length, 1);
  assert.equal(
    queryJson("SELECT json_build_object('downloadToken', download_token, 'contentLength', length(content_text)) AS result FROM statement_export_files WHERE id = 'DL-LIVE-EXPORT-001';").downloadToken,
    "DL-LIVE-EXPORT-001",
  );
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM statement_lines WHERE statement_id = 'ST-LIVE-REPO-001' AND order_line_id = 'OL-LIVE-EXPORT-LINE-001';", {
        capture: true,
      }).trim(),
    ),
    1,
  );
  const listedExports = await exportRepository.listExportFiles({ statementId: "ST-LIVE-REPO-001" });
  assert.equal(listedExports.length, 1);
  assert.equal(listedExports[0].content, "");
  const foundExport = await exportRepository.findExportFileByToken({
    statementId: "ST-LIVE-REPO-001",
    downloadToken: "DL-LIVE-EXPORT-001",
  });
  assert.equal(Buffer.from(foundExport.content, "base64").toString("utf8"), "Postgres Export Live XLSX");
  assert.equal(foundExport.contentEncoding, "base64");
  assert.equal(
    (await exportRepository.findLatestExportFile({ statementId: "ST-LIVE-REPO-001", previewType: "customer_send" }))
      .downloadToken,
    "DL-LIVE-EXPORT-001",
  );

  const printDeviceWorkspace = { printDevices: [], operationLogs: [] };
  const printDevice = buildPrintDeviceRecord({
    printDeviceId: "PRN-LIVE-REPO-001",
    name: "Postgres O'Brien 标签机",
  });
  const printDeviceTransaction = await printDeviceRepository.upsertPrintDevice({
    workspace: printDeviceWorkspace,
    printDevice,
    operationLog: buildPrintDeviceOperationLog({
      logId: "LOG-LIVE-PRINT-DEVICE-001",
      printDevice,
    }),
  });
  assert.equal(printDeviceTransaction.printDevice.printDeviceId, "PRN-LIVE-REPO-001");
  assert.equal(printDeviceTransaction.operationLogId, "LOG-LIVE-PRINT-DEVICE-001");
  assert.equal(printDeviceWorkspace.printDevices.length, 1);
  assert.equal(
    queryJson(
      "SELECT json_build_object('name', name, 'paperWidthMm', paper_width_mm) AS result FROM printer_devices WHERE id = 'PRN-LIVE-REPO-001';",
    ).paperWidthMm,
    76,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-PRINT-DEVICE-001';", { capture: true }).trim()),
    1,
  );
  const listedPrintDevices = await printDeviceRepository.listPrintDevices({
    filters: { documentType: "express_ltl_label", status: "active" },
  });
  assert.equal(listedPrintDevices.length, 1);
  assert.equal(listedPrintDevices[0].printDeviceId, "PRN-LIVE-REPO-001");

  const printJobWorkspace = { printJobs: [], operationLogs: [] };
  const printJob = buildPrintJobRecord({
    printJobId: "PJ-LIVE-REPO-001",
    printRecordId: "PR-LIVE-FULFILLMENT-001",
    printDeviceId: "PRN-LIVE-REPO-001",
    jobStatus: "queued",
    driverMode: "system_printer",
  });
  const printJobTransaction = await printJobRepository.createPrintJob({
    workspace: printJobWorkspace,
    printJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-PRINT-JOB-001",
      printJob,
      action: "create_print_job",
    }),
  });
  assert.equal(printJobTransaction.printJob.printJobId, "PJ-LIVE-REPO-001");
  assert.equal(printJobTransaction.operationLogId, "LOG-LIVE-PRINT-JOB-001");
  const failedPrintJob = {
    ...printJobTransaction.printJob,
    jobStatus: "failed",
    finishedAt: "2026-07-02T10:40:00.000Z",
    errorCode: "LIVE_DRIVER_TIMEOUT",
    errorMessage: "Live check simulated driver timeout",
    updatedAt: "2026-07-02T10:40:00.000Z",
  };
  const failedPrintJobTransaction = await printJobRepository.updatePrintJob({
    workspace: printJobWorkspace,
    printJob: failedPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-PRINT-JOB-FAILED-001",
      printJob: failedPrintJob,
      action: "update_print_job_status",
      before: printJobTransaction.printJob,
    }),
  });
  assert.equal(failedPrintJobTransaction.printJob.jobStatus, "failed");
  assert.equal(failedPrintJobTransaction.printJob.errorCode, "LIVE_DRIVER_TIMEOUT");
  const retryPrintJob = buildPrintJobRecord({
    printJobId: "PJ-LIVE-REPO-001-RETRY-2",
    printRecordId: "PR-LIVE-FULFILLMENT-001",
    printDeviceId: "PRN-LIVE-REPO-001",
    jobStatus: "queued",
    driverMode: "system_printer",
    attemptNo: 2,
    sourcePrintJobId: "PJ-LIVE-REPO-001",
  });
  const retryPrintJobTransaction = await printJobRepository.createPrintJob({
    workspace: printJobWorkspace,
    printJob: retryPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-PRINT-JOB-RETRY-001",
      printJob: retryPrintJob,
      action: "retry_print_job",
      before: failedPrintJobTransaction.printJob,
    }),
  });
  assert.equal(retryPrintJobTransaction.printJob.sourcePrintJobId, "PJ-LIVE-REPO-001");
  assert.equal(retryPrintJobTransaction.printJob.attemptNo, 2);
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM print_jobs WHERE print_record_id = 'PR-LIVE-FULFILLMENT-001';", { capture: true }).trim()),
    2,
  );
  assert.equal(
    (await printJobRepository.listPrintJobs({ filters: { printRecordId: "PR-LIVE-FULFILLMENT-001" } })).length,
    2,
  );

  const printBatchWorkspace = { printBatchRecords: [], operationLogs: [] };
  const printBatchRecord = buildPrintBatchRecord({
    printBatchId: "PB-LIVE-REPO-001",
    todoId: "T-LIVE-PRINT-001",
    operatorName: "O'Brien live print",
  });
  const printBatchTransaction = await printBatchRepository.createPrintBatchRecord({
    workspace: printBatchWorkspace,
    printBatchRecord,
    operationLog: buildPrintBatchOperationLog({
      logId: "LOG-LIVE-PRINT-BATCH-001",
      printBatchRecord,
    }),
  });
  assert.equal(printBatchTransaction.printBatchRecord.printBatchId, "PB-LIVE-REPO-001");
  assert.equal(printBatchTransaction.operationLogId, "LOG-LIVE-PRINT-BATCH-001");
  assert.equal(printBatchWorkspace.printBatchRecords.length, 1);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', status, 'pending', pending_package_ids[1]) AS result FROM print_batch_records WHERE id = 'PB-LIVE-REPO-001';",
    ).pending,
    "PKG-LIVE-PRINT-002",
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-PRINT-BATCH-001';", { capture: true }).trim()),
    1,
  );
  const listedPrintBatches = await printBatchRepository.listPrintBatchRecords({ filters: { todoId: "T-LIVE-PRINT-001" } });
  assert.equal(listedPrintBatches.length, 1);
  assert.equal(listedPrintBatches[0].pendingPackageIds[0], "PKG-LIVE-PRINT-002");

  const sendBefore = buildStatement({
    id: "ST-LIVE-SEND-001",
    customerId: "C-LIVE-REPO",
    status: "待生成",
    received: 0,
    variance: 273,
  });
  const sendAfter = buildStatement({
    id: "ST-LIVE-SEND-001",
    customerId: "C-LIVE-REPO",
    status: "已发送待回款",
    received: 0,
    variance: 273,
  });
  const sendWorkspace = { statements: [sendBefore], statementSendRecords: [], statementConfirmationRecords: [], operationLogs: [] };
  const sendTransaction = await sendTransactionRepository.markStatementSent({
    workspace: sendWorkspace,
    statements: [sendAfter],
    statement: sendAfter,
    sendRecord: buildSendRecord({
      sendRecordId: "SEND-LIVE-TXN-001",
      statementId: "ST-LIVE-SEND-001",
      exportFileId: "DL-LIVE-SEND-001",
      operatorId: "U-FINANCE-A",
    }),
    operationLog: buildOperationLog({ logId: "LOG-LIVE-SEND-TXN-001", action: "mark_statement_sent", before: sendBefore, after: sendAfter }),
  });
  assert.equal(sendTransaction.statement.status, "已发送待回款");
  assert.equal(sendTransaction.sendRecord.exportFileId, "DL-LIVE-SEND-001");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'lastSentAt', last_sent_at) AS result FROM statements WHERE id = 'ST-LIVE-SEND-001';").status, "已发送待回款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM statement_send_records WHERE id = 'SEND-LIVE-TXN-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SEND-TXN-001';", { capture: true }).trim()), 1);

  const receiptRecord = {
    ...sendTransaction.sendRecord,
    receiptStatus: "read",
    receiptAt: "2026-07-01T11:00:00.000Z",
    receiptBy: "U-FINANCE-A",
    receiptNote: "postgres live customer read receipt",
  };
  const receiptTransaction = await sendTransactionRepository.markStatementSendReceipt({
    workspace: sendWorkspace,
    sendRecord: receiptRecord,
    operationLog: {
      id: "LOG-LIVE-SEND-RECEIPT-TXN-001",
      targetType: "statement_send_record",
      targetId: "SEND-LIVE-TXN-001",
      action: "mark_statement_send_receipt",
      before: sendTransaction.sendRecord,
      after: receiptRecord,
      reason: "postgres live customer read receipt",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-01T11:00:00.000Z",
      createdAt: "2026-07-01T11:00:00.000Z",
    },
  });
  assert.equal(receiptTransaction.sendRecord.receiptStatus, "read");
  assert.equal(
    queryJson("SELECT json_build_object('receiptStatus', receipt_status, 'receiptBy', receipt_by) AS result FROM statement_send_records WHERE id = 'SEND-LIVE-TXN-001';").receiptStatus,
    "read",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SEND-RECEIPT-TXN-001';", { capture: true }).trim()), 1);

  const confirmationStatement = buildStatement({
    id: "ST-LIVE-SEND-001",
    customerId: "C-LIVE-REPO",
    status: "客户已确认",
    received: 0,
    variance: 273,
  });
  const confirmationSendRecord = {
    ...receiptTransaction.sendRecord,
    receiptStatus: "confirmed",
    receiptAt: "2026-07-01T11:20:00.000Z",
    receiptBy: "U-FINANCE-A",
    receiptNote: "postgres live customer confirmed statement",
  };
  const confirmationRecord = {
    confirmationRecordId: "SCONF-LIVE-TXN-001",
    statementId: "ST-LIVE-SEND-001",
    sendRecordId: "SEND-LIVE-TXN-001",
    confirmationType: "customer_reply",
    channel: "wechat",
    confirmedByCustomer: "客户财务",
    confirmedAt: "2026-07-01T11:20:00.000Z",
    content: "postgres live customer confirmed statement",
    attachmentIds: ["ATT-LIVE-CONFIRM-001"],
    recordedBy: "U-FINANCE-A",
  };
  const confirmationTransaction = await sendTransactionRepository.recordStatementCustomerConfirmation({
    workspace: sendWorkspace,
    statements: [confirmationStatement],
    statement: confirmationStatement,
    sendRecord: confirmationSendRecord,
    confirmationRecord,
    operationLog: {
      id: "LOG-LIVE-SEND-CONFIRM-TXN-001",
      targetType: "statement",
      targetId: "ST-LIVE-SEND-001",
      action: "record_statement_customer_confirmation",
      before: { statement: sendAfter, sendRecord: receiptTransaction.sendRecord },
      after: { statement: confirmationStatement, sendRecord: confirmationSendRecord, confirmationRecord },
      reason: "postgres live customer confirmed statement",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-01T11:20:00.000Z",
      createdAt: "2026-07-01T11:20:00.000Z",
    },
  });
  assert.equal(confirmationTransaction.statement.status, "客户已确认");
  assert.equal(confirmationTransaction.sendRecord.receiptStatus, "confirmed");
  assert.equal(confirmationTransaction.confirmationRecord.confirmationRecordId, "SCONF-LIVE-TXN-001");
  assert.equal(queryJson("SELECT json_build_object('status', status) AS result FROM statements WHERE id = 'ST-LIVE-SEND-001';").status, "客户已确认");
  assert.equal(
    queryJson("SELECT json_build_object('receiptStatus', receipt_status) AS result FROM statement_send_records WHERE id = 'SEND-LIVE-TXN-001';").receiptStatus,
    "confirmed",
  );
  assert.equal(
    queryJson("SELECT json_build_object('content', content, 'attachmentIds', attachment_ids_json) AS result FROM statement_confirmation_records WHERE id = 'SCONF-LIVE-TXN-001';").attachmentIds[0],
    "ATT-LIVE-CONFIRM-001",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SEND-CONFIRM-TXN-001';", { capture: true }).trim()), 1);
}

async function checkApiWithPostgresRepositories() {
  const printJobRepository = createPostgresPrintJobRepository({ queryJson });
  const guardedPrintDriverAdapter = createPrintDriverAdapter({ dryRunEnabled: false, systemPrinterEnabled: false });
  const dryRunPollingAdapter = createPrintDriverAdapter({ dryRunEnabled: true, systemPrinterEnabled: false });
  server = createApiServer({
    v1PersistenceProfile: { repositoryMode: "postgres", queryJson },
    printDriverAdapter: {
      kind: guardedPrintDriverAdapter.kind,
      getConfiguration: guardedPrintDriverAdapter.getConfiguration,
      dispatchPrintJob: guardedPrintDriverAdapter.dispatchPrintJob,
      pollPrintJobStatus: dryRunPollingAdapter.pollPrintJobStatus,
    },
    attachmentObjectStorageOptions: { storageRoot },
    statementExportObjectStorageOptions: { storageRoot },
  });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-erp-user-id": "U-OFFICE-A" };
  const driverHeaders = { "x-erp-user-id": "U-DRIVER-A" };
  const printDriverHeaders = { "x-erp-user-id": "U-PRINT-DRIVER-A" };

  const health = await getJson(baseUrl, "/api/health", { headers });
  assert.equal(health.seed.orderPoolReadRepository, "postgres");
  assert.equal(health.seed.driverDeliveryDispatchRepository, "postgres");
  assert.equal(health.seed.driverDeviceFieldTestRepository, "postgres");
  assert.equal(health.seed.driverDeliveryTaskReadRepository, "postgres");
  assert.equal(health.seed.inventoryLedgerReadRepository, "postgres");
  assert.equal(health.seed.productionPackingTransactionRepository, "postgres");
  assert.equal(health.seed.productionPackingReadRepository, "postgres");
  assert.equal(health.seed.productionScheduleRecordRepository, "postgres");
  assert.equal(health.seed.printBatchRepository, "postgres");
  assert.equal(health.seed.printDeviceRepository, "postgres");
  assert.equal(health.seed.printJobRepository, "postgres");
  assert.equal(health.seed.printerDeviceFieldTestRepository, "postgres");
  assert.equal(health.seed.masterDataImportReviewRepository, "postgres");
  assert.equal(health.seed.masterDataImportTransactionRepository, "postgres");
  assert.equal(health.seed.runtimeIdentityRepository, "postgres");
  assert.equal(health.seed.v1PersistenceProfile.repositoryProfile, "postgres");
  assert.equal(
    health.seed.v1PersistenceProfile.postgresRepositoryDefaultsApplied,
    v1PersistencePostgresRepositoryOptionKeys.length,
  );
  assert.equal(health.seed.v1PersistenceProfile.unsupportedRepositoryCount, 0);
  assert.equal(health.seed.v1PersistenceProfile.connectionStringExposed, false);
  assert.equal(health.seed.statementExportObjectStorage, "local_fs");
  assert.equal(health.seed.printDriverAdapter, "guarded_adapter");
  const printDriverConfig = await getJson(baseUrl, "/api/print-driver/config", { headers });
  assert.equal(printDriverConfig.printDriverAdapter.kind, "guarded_adapter");
  assert.equal(printDriverConfig.printDriverAdapter.systemPrinterCommandConfigured, false);
  assert.equal(printDriverConfig.printDriverAdapter.systemPrinterCommandArgsConfigured, true);
  assert.equal(printDriverConfig.printDriverAdapter.systemPrinterCommandTimeoutMs, 5000);
  assert.equal(printDriverConfig.printDriverAdapter.realDispatchAvailable, false);

  const databaseOnlyOrderLines = await getJson(
    baseUrl,
    "/api/order-lines?keyword=OL-LIVE-CONFIRM-001&includeHistory=true&pageSize=5",
    { headers },
  );
  assert.equal(databaseOnlyOrderLines.total, 1);
  assert.equal(databaseOnlyOrderLines.items[0].id, "OL-LIVE-CONFIRM-001");
  assert.equal(databaseOnlyOrderLines.items[0].orderNo, "ORD-LIVE-CONFIRM-001");
  assert.equal(databaseOnlyOrderLines.items[0].customerName, "Postgres 仓储测试客户");
  const databaseInventoryLedgers = await getJson(
    baseUrl,
    "/api/inventory/ledger-entries?inventoryItemId=INV-LIVE-CONFIRM-001&sourceType=order_confirm&sourceId=OL-LIVE-CONFIRM-001&pageSize=5",
    { headers },
  );
  assert.equal(databaseInventoryLedgers.total, 1);
  assert.equal(databaseInventoryLedgers.items[0].ledgerId, "LEDGER-LIVE-CONFIRM-001");
  assert.equal(databaseInventoryLedgers.items[0].changeType, "订单占用");
  assert.equal(databaseInventoryLedgers.items[0].qtyChange, 25);
  assert.equal(databaseInventoryLedgers.items[0].colorName, "红色");

  const databaseDriverTasks = await getJson(
    baseUrl,
    "/api/driver/delivery-tasks?driverId=U-DRIVER-A&status=%E5%B7%B2%E5%AE%8C%E6%88%90&pageSize=5",
    { headers: driverHeaders },
  );
  assert.equal(databaseDriverTasks.items.some((item) => item.fulfillmentId === "F002"), true);
  const databaseDriverTaskDetail = await getJson(baseUrl, "/api/driver/delivery-tasks/F002", { headers: driverHeaders });
  assert.equal(databaseDriverTaskDetail.task.status, "已完成");
  assert.equal(databaseDriverTaskDetail.task.routeDate, "2026-07-02");
  assert.equal(databaseDriverTaskDetail.task.routeNo, "虎门线-A");
  assert.equal(databaseDriverTaskDetail.task.routeSequence, 2);
  assert.equal(databaseDriverTaskDetail.task.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
  assert.equal(databaseDriverTaskDetail.task.deliveryEvidenceReviewStatus, "需重拍");
  assert.equal(databaseDriverTaskDetail.task.packageChecklist[0].packageId, "PKG-LIVE-F002-1");
  assert.equal(databaseDriverTaskDetail.task.packageChecklist[0].quantityText, "400个");

  const driverExceptionOccurredAt = "2026-07-02T09:40:00.000Z";
  const apiDriverException = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F006/exception",
    {
      fulfillmentId: "F006",
      reasonCode: "customer_unavailable",
      reasonText: "客户不在",
      actualQty: 0,
      operatorId: "U-DRIVER-A",
      occurredAt: driverExceptionOccurredAt,
      remark: "postgres live driver exception check",
    },
    { headers: driverHeaders },
  );
  assert.equal(apiDriverException.status, "送货异常");
  assert.equal(apiDriverException.todoType, "送货异常待处理");
  assert.equal(apiDriverException.task.status, "送货异常");
  assert.equal(apiDriverException.task.exceptionReasonCode, "customer_unavailable");
  assert.equal(apiDriverException.task.exceptionReason, "客户不在");
  assert.equal(new Date(apiDriverException.task.exceptionOccurredAt).toISOString(), driverExceptionOccurredAt);
  assert.ok(apiDriverException.todoId);
  assert.ok(apiDriverException.operationLogId);
  const persistedDriverException = queryJson(
    "SELECT json_build_object('status', f.status, 'actualQty', f.actual_qty, 'reasonCode', e.reason_code, 'reason', e.reason, 'actualQtyException', e.actual_qty, 'todoId', e.todo_id, 'occurredAt', e.occurred_at) AS result FROM fulfillment_records AS f JOIN fulfillment_exceptions AS e ON e.fulfillment_id = f.id WHERE f.id = 'F006' ORDER BY e.created_at DESC, e.id DESC LIMIT 1;",
  );
  assert.equal(persistedDriverException.status, "送货异常");
  assert.equal(persistedDriverException.actualQty, 0);
  assert.equal(persistedDriverException.reasonCode, "customer_unavailable");
  assert.equal(persistedDriverException.reason, "客户不在");
  assert.equal(persistedDriverException.actualQtyException, 0);
  assert.equal(persistedDriverException.todoId, apiDriverException.todoId);
  assert.equal(new Date(persistedDriverException.occurredAt).toISOString(), driverExceptionOccurredAt);
  const coldStartAfterDriverException = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F006",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(coldStartAfterDriverException.status, "送货异常");
  assert.equal(coldStartAfterDriverException.exceptionReasonCode, "customer_unavailable");
  assert.equal(coldStartAfterDriverException.exceptionReason, "客户不在");
  assert.equal(new Date(coldStartAfterDriverException.exceptionOccurredAt).toISOString(), driverExceptionOccurredAt);

  const driverLoadAt = "2026-07-02T09:05:00.000Z";
  const driverLoadRemark = "postgres live driver load check；装车核对：6/6包";
  const apiDriverLoad = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/load-confirm",
    {
      fulfillmentId: "F008",
      loadedAt: driverLoadAt,
      operatorId: "U-DRIVER-A",
      checkedPackageIds: [
        "PKG-LIVE-F008-1",
        "PKG-LIVE-F008-2",
        "PKG-LIVE-F008-3",
        "PKG-LIVE-F008-4",
        "PKG-LIVE-F008-5",
        "PKG-LIVE-F008-6",
      ],
      packageCheckSummary: "6/6包",
      remark: driverLoadRemark,
    },
    { headers: driverHeaders },
  );
  assert.equal(apiDriverLoad.status, "配送中");
  assert.equal(new Date(apiDriverLoad.task.loadedAt).toISOString(), driverLoadAt);
  assert.equal(apiDriverLoad.task.loadedBy, "U-DRIVER-A");
  assert.equal(apiDriverLoad.task.driverRemark, driverLoadRemark);
  assert.equal(apiDriverLoad.task.routeSequence, 3);
  assert.equal(apiDriverLoad.task.packageChecklist.length, 6);
  assert.ok(apiDriverLoad.operationLogId);
  const persistedDriverLoad = queryJson(
    "SELECT json_build_object('status', status, 'loadedAt', loaded_at, 'loadedBy', loaded_by, 'driverRemark', driver_remark) AS result FROM fulfillment_records WHERE id = 'F008';",
  );
  assert.equal(persistedDriverLoad.status, "配送中");
  assert.equal(new Date(persistedDriverLoad.loadedAt).toISOString(), driverLoadAt);
  assert.equal(persistedDriverLoad.loadedBy, "U-DRIVER-A");
  assert.equal(persistedDriverLoad.driverRemark, driverLoadRemark);
  const coldStartAfterDriverLoad = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(coldStartAfterDriverLoad.status, "配送中");
  assert.equal(new Date(coldStartAfterDriverLoad.loadedAt).toISOString(), driverLoadAt);
  assert.equal(coldStartAfterDriverLoad.loadedBy, "U-DRIVER-A");
  assert.equal(coldStartAfterDriverLoad.driverRemark, driverLoadRemark);

  const driverCompletedAt = "2026-07-02T10:20:00.000Z";
  const driverCompleteRemark = "postgres live driver complete check";
  const apiDriverComplete = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/complete",
    {
      fulfillmentId: "F008",
      actualQty: 3000,
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttachmentId: "ATT-LIVE-DRIVER-WM-F008",
      watermarkId: "WM-LIVE-DRIVER-F008",
      watermarkText: "李四电商 / 厚街客户仓 / 水印 WM-LIVE-DRIVER-F008",
      watermarkCapturedAt: "2026-07-02T10:18:00.000Z",
      watermarkLocationLabel: "厚街客户仓门口",
      watermarkGeoPoint: "22.910000,113.670000",
      watermarkAddress: "厚街客户仓",
      watermarkOperatorId: "U-DRIVER-A",
      watermarkOperatorName: "司机A",
      receiverName: "客户仓管",
      paperNoteStatus: "已交回",
      completedAt: driverCompletedAt,
      remark: driverCompleteRemark,
    },
    { headers: driverHeaders },
  );
  assert.equal(apiDriverComplete.status, "已完成");
  assert.equal(apiDriverComplete.task.status, "已完成");
  assert.equal(new Date(apiDriverComplete.task.loadedAt).toISOString(), driverLoadAt);
  assert.equal(apiDriverComplete.task.receiverName, "客户仓管");
  assert.equal(apiDriverComplete.task.paperNoteStatus, "已交回");
  assert.equal(apiDriverComplete.task.watermarkedPhotoAttachmentId, "ATT-LIVE-DRIVER-WM-F008");
  assert.equal(apiDriverComplete.inventoryDeductionMode, "skipped_no_reservation");
  assert.ok(apiDriverComplete.operationLogId);
  const persistedDriverComplete = queryJson(
    "SELECT json_build_object('status', status, 'loadedAt', loaded_at, 'loadedBy', loaded_by, 'driverRemark', driver_remark, 'receiverName', receiver_name, 'paperNoteStatus', paper_note_status, 'watermarkId', watermark_id) AS result FROM fulfillment_records WHERE id = 'F008';",
  );
  assert.equal(persistedDriverComplete.status, "已交付");
  assert.equal(new Date(persistedDriverComplete.loadedAt).toISOString(), driverLoadAt);
  assert.equal(persistedDriverComplete.loadedBy, "U-DRIVER-A");
  assert.equal(persistedDriverComplete.driverRemark, driverCompleteRemark);
  assert.equal(persistedDriverComplete.receiverName, "客户仓管");
  assert.equal(persistedDriverComplete.paperNoteStatus, "已交回");
  assert.equal(persistedDriverComplete.watermarkId, "WM-LIVE-DRIVER-F008");
  const coldStartAfterDriverComplete = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(coldStartAfterDriverComplete.status, "已完成");
  assert.equal(new Date(coldStartAfterDriverComplete.loadedAt).toISOString(), driverLoadAt);
  assert.equal(coldStartAfterDriverComplete.loadedBy, "U-DRIVER-A");
  assert.equal(coldStartAfterDriverComplete.driverRemark, driverCompleteRemark);
  assert.equal(coldStartAfterDriverComplete.receiverName, "客户仓管");
  assert.equal(coldStartAfterDriverComplete.paperNoteStatus, "已交回");
  assert.equal(coldStartAfterDriverComplete.watermarkedPhotoAttachmentId, "ATT-LIVE-DRIVER-WM-F008");

  const apiDeliveryEvidenceRetake = await postJson(
    baseUrl,
    "/api/fulfillments/F008/delivery-evidence-review",
    {
      fulfillmentId: "F008",
      reviewStatus: "retake_required",
      operatorId: "U-OFFICE-A",
      reviewerName: "办公室A",
      reason: "水印定位不清晰",
    },
    { headers },
  );
  assert.equal(apiDeliveryEvidenceRetake.reviewStatus, "需重拍");
  assert.equal(apiDeliveryEvidenceRetake.todoType, "照片待重拍");
  assert.equal(apiDeliveryEvidenceRetake.task.deliveryEvidenceReviewStatus, "需重拍");
  assert.ok(apiDeliveryEvidenceRetake.todoId);
  assert.ok(apiDeliveryEvidenceRetake.operationLogId);

  const driverRetakeSubmittedAt = "2026-07-02T10:45:00.000Z";
  const apiDriverEvidenceResubmission = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/complete",
    {
      fulfillmentId: "F008",
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttachmentId: "ATT-LIVE-DRIVER-WM-F008-RETAKE",
      watermarkId: "WM-LIVE-DRIVER-F008-RETAKE",
      watermarkText: "李四电商 / 厚街客户仓 / 补拍水印 WM-LIVE-DRIVER-F008-RETAKE",
      watermarkCapturedAt: driverRetakeSubmittedAt,
      watermarkLocationLabel: "厚街客户仓门口补拍",
      watermarkGeoPoint: "22.910001,113.670001",
      watermarkAddress: "厚街客户仓",
      completedAt: driverRetakeSubmittedAt,
      remark: "postgres live driver retake evidence check",
    },
    { headers: driverHeaders },
  );
  assert.equal(apiDriverEvidenceResubmission.status, "已完成");
  assert.equal(apiDriverEvidenceResubmission.evidenceResubmission, true);
  assert.equal(apiDriverEvidenceResubmission.retakeTodoId, apiDeliveryEvidenceRetake.todoId);
  assert.equal(apiDriverEvidenceResubmission.inventoryDeductionMode, "skipped_delivery_evidence_resubmission");
  assert.equal(apiDriverEvidenceResubmission.inventoryLedgerIds.length, 0);
  assert.equal(apiDriverEvidenceResubmission.task.deliveryEvidenceReviewStatus, "待复核");
  assert.equal(apiDriverEvidenceResubmission.task.deliveryEvidenceIssueReason, "");
  assert.equal(apiDriverEvidenceResubmission.task.watermarkedPhotoAttachmentId, "ATT-LIVE-DRIVER-WM-F008-RETAKE");
  assert.ok(apiDriverEvidenceResubmission.operationLogId);
  const persistedDriverEvidenceResubmission = queryJson(
    `SELECT json_build_object(
      'status', f.status,
      'watermarkedPhotoAttachmentId', f.watermarked_photo_attachment_id,
      'watermarkId', f.watermark_id,
      'reviewStatus', f.delivery_evidence_review_status,
      'reviewedAt', f.delivery_evidence_reviewed_at,
      'issueReason', f.delivery_evidence_issue_reason,
      'todoStatus', t.status,
      'todoHandledBy', t.handled_by,
      'todoHandledAt', t.handled_at,
      'todoHandlingResult', t.handling_result
    ) AS result
    FROM fulfillment_records AS f
    LEFT JOIN todos AS t ON t.id = ${sqlLiteral(apiDeliveryEvidenceRetake.todoId)}
    WHERE f.id = 'F008';`,
  );
  assert.equal(persistedDriverEvidenceResubmission.status, "已交付");
  assert.equal(persistedDriverEvidenceResubmission.watermarkedPhotoAttachmentId, "ATT-LIVE-DRIVER-WM-F008-RETAKE");
  assert.equal(persistedDriverEvidenceResubmission.watermarkId, "WM-LIVE-DRIVER-F008-RETAKE");
  assert.equal(persistedDriverEvidenceResubmission.reviewStatus, "待复核");
  assert.equal(persistedDriverEvidenceResubmission.reviewedAt, null);
  assert.equal(persistedDriverEvidenceResubmission.issueReason, "");
  assert.equal(persistedDriverEvidenceResubmission.todoStatus, "已处理");
  assert.equal(persistedDriverEvidenceResubmission.todoHandledBy, "U-DRIVER-A");
  assert.equal(new Date(persistedDriverEvidenceResubmission.todoHandledAt).toISOString(), driverRetakeSubmittedAt);
  assert.equal(persistedDriverEvidenceResubmission.todoHandlingResult, "司机已补拍送达水印照片，待办公室复核");
  const coldStartAfterDriverEvidenceResubmission = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(coldStartAfterDriverEvidenceResubmission.status, "已完成");
  assert.equal(coldStartAfterDriverEvidenceResubmission.deliveryEvidenceReviewStatus, "待复核");
  assert.equal(coldStartAfterDriverEvidenceResubmission.deliveryEvidenceIssueReason, "");
  assert.equal(coldStartAfterDriverEvidenceResubmission.watermarkedPhotoAttachmentId, "ATT-LIVE-DRIVER-WM-F008-RETAKE");

  const apiDeviceFieldTest = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F002/device-field-tests",
    {
      recordId: "DQA-LIVE-API-F002",
      fulfillmentId: "F002",
      orderLineId: "ORD-0629-002-01",
      driverId: "U-DRIVER-A",
      operatorId: "U-DRIVER-A",
      operatorName: "司机A",
      checkedAt: "2026-07-02T11:20:00.000Z",
      deviceLabel: "iPhone 15 Pro",
      browserLabel: "Safari 17",
      userAgent: "Mozilla/5.0 Safari/604.1",
      language: "zh-CN",
      checks: [
        { key: "camera_permission", status: "passed" },
        { key: "watermark_photo", status: "passed" },
        { key: "package_label_scan", status: "failed" },
        { key: "geolocation", status: "blocked" },
        { key: "file_upload", status: "untested" },
        { key: "navigation", status: "untested" },
      ],
      packageLabelScanSample: {
        sampleId: "DPLS-LIVE-API-F002-PKG-1",
        fulfillmentId: "F002",
        expectedPackageId: "PKG-LIVE-F002-1",
        scannedText: "PKG-LIVE-F002-404",
        matchedPackageId: "",
        method: "camera",
        result: "not_found",
        message: "api live package label mismatch sample",
        checkedAt: "2026-07-02T11:19:59.000Z",
      },
      note: "api live cold-start field test",
    },
    { headers: driverHeaders },
  );
  assert.equal(apiDeviceFieldTest.record.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiDeviceFieldTest.record.summary.label, "通过 2/6，异常 2");
  assert.equal(apiDeviceFieldTest.record.packageLabelScanSample.scannedText, "PKG-LIVE-F002-404");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestRecord.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestRecord.packageLabelScanSample.result, "not_found");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestSummary.label, "通过 2/6，异常 2");
  assert.ok(apiDeviceFieldTest.operationLogId);
  const apiPersistedDeviceFieldTest = queryJson(
    "SELECT json_build_object('recordId', id, 'summary', summary_json->>'label', 'sampleResult', summary_json->'packageLabelScanSample'->>'result', 'operationLogId', operation_log_id) AS result FROM driver_device_field_tests WHERE id = 'DQA-LIVE-API-F002';",
  );
  assert.equal(apiPersistedDeviceFieldTest.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiPersistedDeviceFieldTest.summary, "通过 2/6，异常 2");
  assert.equal(apiPersistedDeviceFieldTest.sampleResult, "not_found");
  assert.equal(apiPersistedDeviceFieldTest.operationLogId, apiDeviceFieldTest.operationLogId);
  const coldStartDriverTaskReadRepository = createPostgresDriverDeliveryTaskReadRepository({ queryJson });
  const coldStartDeviceFieldTask = await coldStartDriverTaskReadRepository.getDriverDeliveryTask({
    fulfillmentId: "F002",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestRecord.recordId, "DQA-LIVE-API-F002");
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestRecord.packageLabelScanSample.scannedText, "PKG-LIVE-F002-404");
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestSummary.label, "通过 2/6，异常 2");
  assert.equal(databaseOnlyOrderLines.items[0].amount, 273);

  const databaseOnlyOrderLineDetail = await getJson(baseUrl, "/api/order-lines/OL-LIVE-CONFIRM-001", { headers });
  assert.equal(databaseOnlyOrderLineDetail.orderLine.id, "OL-LIVE-CONFIRM-001");
  assert.equal(databaseOnlyOrderLineDetail.originalOrder.orderId, "ORD-LIVE-CONFIRM-001");
  assert.equal(databaseOnlyOrderLineDetail.priceSnapshot.orderLineId, "OL-LIVE-CONFIRM-001");
  assert.ok(databaseOnlyOrderLineDetail.inventory.length >= 1);
  assert.ok(databaseOnlyOrderLineDetail.fulfillment.length >= 1);
  assert.ok(Array.isArray(databaseOnlyOrderLineDetail.operationLogs));

  const created = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "statement",
      ownerId: "ST-LIVE-API-001",
      purpose: "payment_screenshot",
      fileType: "image",
      fileName: "payment-proof-postgres-live.svg",
      mimeType: "image/svg+xml",
      uploadedBy: "U-OFFICE-A",
      contentRef: "p0://payment-screenshot/ST-LIVE-API-001/postgres-live",
      contentDataUrl:
        "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIj48dGV4dCB4PSIxMCIgeT0iNjAiPlBvc3RncmVzIExpdmU8L3RleHQ+PC9zdmc+",
    },
    { headers },
  );
  assert.equal(created.ownerId, "ST-LIVE-API-001");
  assert.equal(created.storageProvider, "local_fs");
  assert.ok(created.storageKey.startsWith("attachments/"));

  const listed = await getJson(
    baseUrl,
    "/api/attachments?ownerType=statement&ownerId=ST-LIVE-API-001&purpose=payment_screenshot&fileType=image",
    { headers },
  );
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].attachmentId, created.attachmentId);

  const contentResponse = await fetch(`${baseUrl}/api/attachments/${created.attachmentId}/content`, { headers });
  assert.equal(contentResponse.status, 200);
  assert.equal(contentResponse.headers.get("content-type"), "image/svg+xml");
  assert.match(await contentResponse.text(), /Postgres Live/);

  const accessUrl = await getJson(baseUrl, `/api/attachments/${created.attachmentId}/access-url?ttlSeconds=120`, {
    headers,
  });
  assert.equal(accessUrl.attachmentId, created.attachmentId);
  assert.equal(accessUrl.storageProvider, "local_fs");
  assert.ok(accessUrl.operationLogId);

  const accessLogs = await getJson(baseUrl, `/api/attachments/${created.attachmentId}/access-logs?limit=10`, {
    headers,
  });
  assert.equal(accessLogs.total, 2);
  assert.deepEqual(
    accessLogs.items.map((item) => item.action).sort(),
    ["attachment_access_url_created", "attachment_content_read"],
  );

  const confirmedOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-ORDER-001/confirm",
    {
      draftId: "DRAFT-LIVE-ORDER-001",
      sourceText: "张三服饰 30*38红10个 明天自提",
      customerId: "C001",
      operatorId: "U-OFFICE-A",
      confirmMode: "confirm_now",
      clientRevision: 1,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-ORDER-001-01",
          customerId: "C001",
          customer: "张三服饰",
          productName: "空白袋",
          size: "30*38*10",
          bagColor: "红色",
          handleType: "普通提",
          style: "空白袋",
          qty: 10,
          fulfillmentMethod: "自提",
          latestNeededAt: "明天",
          printFlag: false,
        },
      ],
    },
    { headers },
  );
  assert.ok(confirmedOrder.orderId);
  assert.equal(confirmedOrder.orderLines.length, 1);
  assert.equal(confirmedOrder.reservations.length, 1);
  assert.equal(confirmedOrder.fulfillmentTasks.length, 1);
  assert.equal(
    queryJson(
      `SELECT json_build_object('orderId', id, 'customerId', customer_id) AS result FROM original_orders WHERE id = ${sqlLiteral(
        confirmedOrder.orderId,
      )};`,
    ).customerId,
    "C001",
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM order_lines WHERE order_id = ${sqlLiteral(confirmedOrder.orderId)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM price_snapshots WHERE order_line_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM fulfillment_records WHERE order_line_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1330,
  );

  const apiReleasedReservation = await postJson(
    baseUrl,
    `/api/inventory/reservations/${confirmedOrder.reservations[0].reservationId}/release`,
    {
      releaseQty: 4,
      reason: "manual_release",
      operatorId: "U-OFFICE-A",
      relatedActionId: confirmedOrder.orderLines[0].id,
    },
    { headers },
  );
  assert.equal(apiReleasedReservation.status, "partially_released");
  assert.equal(apiReleasedReservation.qty, 6);
  assert.equal(apiReleasedReservation.releasedQty, 4);
  assert.ok(apiReleasedReservation.ledgerId);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1326,
  );

  const completedFulfillment = await postJson(
    baseUrl,
    `/api/fulfillments/${confirmedOrder.fulfillmentTasks[0].fulfillmentId}/complete`,
    {
      fulfillmentId: confirmedOrder.fulfillmentTasks[0].fulfillmentId,
      actualQty: 10,
      operatorId: "U-OFFICE-A",
      completedAt: "2026-07-02T11:00:00.000Z",
      remark: "postgres live fulfillment action route",
    },
    { headers },
  );
  assert.equal(completedFulfillment.status, "已交付");
  assert.ok(completedFulfillment.operationLogId);
  assert.equal(completedFulfillment.inventoryLedgerIds.length, 1);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'actualQty', actual_qty) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        confirmedOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).status,
    "已交付",
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM operation_logs WHERE target_type = 'fulfillment' AND target_id = ${sqlLiteral(
          confirmedOrder.fulfillmentTasks[0].fulfillmentId,
        )} AND action = 'complete_fulfillment';`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  const inventoryAfterFulfillment = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';",
  );
  assert.equal(Number(inventoryAfterFulfillment.onHand), 2474);
  assert.equal(Number(inventoryAfterFulfillment.reserved), 1320);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM inventory_reservations WHERE order_line_id = ${sqlLiteral(
        confirmedOrder.orderLines[0].id,
      )};`,
    ).status,
    "已出库",
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'fulfillment_complete' AND source_id = ${sqlLiteral(
          confirmedOrder.fulfillmentTasks[0].fulfillmentId,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );

  runPsql(
    `UPDATE fulfillment_records
SET status = '已备货', actual_qty = 1200, revision = 1, updated_at = now()
WHERE id = 'F002';`,
  );
  const completedLegacyFulfillment = await postJson(
    baseUrl,
    "/api/fulfillments/F002/complete",
    {
      fulfillmentId: "F002",
      actualQty: 1200,
      operatorId: "U-OFFICE-A",
      completedAt: "2026-07-02T12:00:00.000Z",
      remark: "postgres live legacy fulfillment deduction",
      allowUnreservedInventoryDeduction: true,
    },
    { headers },
  );
  assert.equal(completedLegacyFulfillment.status, "已交付");
  assert.equal(completedLegacyFulfillment.inventoryDeductionMode, "legacy_reserved_stock_match");
  assert.equal(completedLegacyFulfillment.inventoryLedgerIds.length, 1);
  const legacyInventoryAfterFulfillment = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '25*32*10-白色-加长提-空白袋-B区-服装';",
  );
  assert.equal(Number(legacyInventoryAfterFulfillment.onHand), 900);
  assert.equal(Number(legacyInventoryAfterFulfillment.reserved), 0);
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = 'ORD-0629-002-01';",
        { capture: true },
      ).trim(),
    ),
    0,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'fulfillment_complete_legacy' AND source_id = 'F002';",
        { capture: true },
      ).trim(),
    ),
    1,
  );

  const apiProductionInventoryBefore = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  runPsql(
    `INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled, created_by)
     VALUES ('BAG-03', 'BAG-03', 'API live 制袋机', 'bag_making', '1号车间', 'active', true, 'U-OFFICE-A')
     ON CONFLICT (id) DO NOTHING;`,
  );
  const apiProductionReport = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/report-complete",
    {
      orderLineId: "ORD-0629-003-01",
      qualifiedQty: 1000,
      exceptionQty: 0,
      machineCount: 1888,
      machineId: "BAG-03",
      inventoryItemId: "30*38*10-白色-普通提-空白袋-待快运区",
      operatorId: "U-OFFICE-A",
      completedAt: "2026-07-02T13:00:00.000Z",
      remark: "postgres live production report route",
    },
    { headers },
  );
  assert.equal(apiProductionReport.status, "已完成");
  assert.equal(apiProductionReport.orderLineStatus, "待打包");
  assert.equal(apiProductionReport.qualifiedQty, 1000);
  assert.equal(apiProductionReport.machineCount, 1888);
  assert.equal(apiProductionReport.machineCountAffectsInventory, false);
  assert.equal(apiProductionReport.capacityCalibrationCreated, true);
  assert.equal(apiProductionReport.capacityCalibration.sourceKind, "production_report");
  assert.equal(apiProductionReport.capacityCalibration.dailyCapacityQty, 1000);
  assert.equal(apiProductionReport.inventoryLedgerIds.length, 2);
  assert.ok(apiProductionReport.packingTaskId);
  const apiProductionInventoryAfterReport = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  assert.equal(Number(apiProductionInventoryAfterReport.onHand), Number(apiProductionInventoryBefore.onHand) + 1000);
  assert.equal(Number(apiProductionInventoryAfterReport.reserved), Number(apiProductionInventoryBefore.reserved) + 1000);
  assert.equal(
    queryJson("SELECT json_build_object('machineCount', machine_count) AS result FROM workshop_reports WHERE order_line_id = 'ORD-0629-003-01';").machineCount,
    1888,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type IN ('production_report', 'production_report_reservation') AND source_id = 'WR-PT-ORD-0629-003-01-1';",
        { capture: true },
      ).trim(),
    ),
    2,
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('dailyCapacityQty', daily_capacity_qty, 'sourceKind', source_kind) AS result FROM machine_capacity_baselines WHERE machine_id = 'BAG-03' AND size_key = '30*38*10' AND source_kind = 'production_report' AND effective_from = '2026-07-02';",
    ).dailyCapacityQty,
    1000,
  );

  const warehouseHeaders = { "x-erp-user-id": "U-WAREHOUSE-A" };
  const apiPackingComplete = await postJson(
    baseUrl,
    `/api/packing-tasks/${apiProductionReport.packingTaskId}/complete`,
    {
      orderLineId: "ORD-0629-003-01",
      actualPackedQty: 1000,
      packageCount: 3,
      labelsPrinted: false,
      inventoryItemId: "30*38*10-白色-普通提-空白袋-待快运区",
      operatorId: "U-WAREHOUSE-A",
      completedAt: "2026-07-02T13:20:00.000Z",
      remark: "postgres live packing complete route",
    },
    { headers: warehouseHeaders },
  );
  assert.equal(apiPackingComplete.status, "已完成");
  assert.equal(apiPackingComplete.actualPackedQty, 1000);
  assert.equal(apiPackingComplete.packageIds.length, 3);
  assert.equal(apiPackingComplete.orderLineStatus, "待打印标签");
  assert.equal(apiPackingComplete.inventoryDeducted, false);
  assert.equal(apiPackingComplete.inventoryLedgerIds.length, 1);
  const apiProductionInventoryAfterPacking = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  assert.equal(Number(apiProductionInventoryAfterPacking.onHand), Number(apiProductionInventoryAfterReport.onHand));
  assert.equal(Number(apiProductionInventoryAfterPacking.reserved), Number(apiProductionInventoryAfterReport.reserved));
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM packages WHERE order_line_id = 'ORD-0629-003-01';", { capture: true }).trim()),
    3,
  );
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'actualPackedQty', actual_packed_qty) AS result FROM packing_tasks WHERE id = 'PKT-ORD-0629-003-01';").status,
    "已完成",
  );
  assert.equal(
    queryJson("SELECT json_build_object('lineStatus', line_status) AS result FROM order_lines WHERE id = 'ORD-0629-003-01';").lineStatus,
    "待打印标签",
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'packing_complete' AND source_id = ${sqlLiteral(
          apiProductionReport.packingTaskId,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  const apiProductionDetail = await getJson(baseUrl, `/api/production-tasks/${apiProductionReport.productionTaskId}`, {
    headers,
  });
  assert.equal(apiProductionDetail.productionTaskId, apiProductionReport.productionTaskId);
  assert.equal(apiProductionDetail.latestReport.machineCount, 1888);
  assert.equal(apiProductionDetail.latestReport.machineCountAffectsInventory, false);
  assert.equal(apiProductionDetail.inventoryLedgerEntries.length, 2);
  assert.equal(apiProductionDetail.packingTask.packingTaskId, apiProductionReport.packingTaskId);
  const apiPackingDetail = await getJson(baseUrl, `/api/packing-tasks/${apiProductionReport.packingTaskId}`, {
    headers: warehouseHeaders,
  });
  assert.equal(apiPackingDetail.packingTask.status, "已完成");
  assert.equal(apiPackingDetail.packages.length, 3);
  assert.equal(apiPackingDetail.inventoryLedgerEntries.length, 1);
  assert.equal(apiPackingDetail.inventoryDeducted, false);
  const apiProductionList = await getJson(
    baseUrl,
    `/api/production-tasks?status=${encodeURIComponent("已完成")}&keyword=${encodeURIComponent("美的")}&pageSize=5`,
    { headers },
  );
  assert.ok(
    apiProductionList.items.some(
      (item) =>
        item.productionTaskId === apiProductionReport.productionTaskId &&
        item.latestReport?.machineCountAffectsInventory === false &&
        item.packingTask?.packingTaskId === apiProductionReport.packingTaskId,
    ),
  );
  const apiPackingList = await getJson(
    baseUrl,
    `/api/packing-tasks?status=${encodeURIComponent("已完成")}&keyword=${encodeURIComponent("美的")}&pageSize=5`,
    { headers: warehouseHeaders },
  );
  assert.ok(
    apiPackingList.items.some(
      (item) =>
        item.packingTaskId === apiProductionReport.packingTaskId &&
        item.packingTask?.packageCount === 3 &&
        item.inventoryDeducted === false,
    ),
  );

  const apiPrintDevice = await postJson(
    baseUrl,
    "/api/print-devices",
    {
      printDeviceId: "PRN-LIVE-API-001",
      name: "API Postgres 标签机",
      deviceType: "label_printer",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://postgres-live-label",
      driverName: "Postgres Live 203dpi Driver",
      supportedDocumentTypes: ["express_ltl_label", "package_label"],
      defaultDocumentTypes: ["express_ltl_label"],
      paperWidthMm: 76,
      paperHeightMm: 50,
      paperName: "76x50 热敏标签",
      dpi: 203,
      defaultCopies: 1,
      darkness: 9,
      speed: 4,
      cutterEnabled: false,
      settings: { driverMode: "preview_only", source: "postgres-live-api" },
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiPrintDevice.printDevice.printDeviceId, "PRN-LIVE-API-001");
  assert.ok(apiPrintDevice.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('paperWidthMm', paper_width_mm, 'driver', driver_name) AS result FROM printer_devices WHERE id = 'PRN-LIVE-API-001';",
    ).driver,
    "Postgres Live 203dpi Driver",
  );
  const apiPrintDevices = await getJson(baseUrl, "/api/print-devices?documentType=express_ltl_label", { headers });
  assert.ok(apiPrintDevices.total >= 1);
  assert.ok(apiPrintDevices.items.some((device) => device.printDeviceId === "PRN-LIVE-API-001"));

  const apiSeedPrintJobWorkspace = { printJobs: [], operationLogs: [] };
  const apiSeedPrintJob = buildPrintJobRecord({
    printJobId: "PJ-LIVE-API-001",
    printRecordId: "PR-LIVE-FULFILLMENT-001",
    printDeviceId: "PRN-LIVE-API-001",
    jobStatus: "queued",
    driverMode: "system_printer",
  });
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiSeedPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-001",
      printJob: apiSeedPrintJob,
      action: "create_print_job",
    }),
  });
  const apiPrintJobList = await getJson(baseUrl, "/api/print-jobs?printRecordId=PR-LIVE-FULFILLMENT-001", {
    headers,
  });
  assert.ok(apiPrintJobList.items.some((job) => job.printJobId === "PJ-LIVE-API-001"));
  const apiDispatchedPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/dispatch",
    {
      reason: "postgres live dispatch boundary",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiDispatchedPrintJob.printJob.jobStatus, "failed");
  assert.equal(apiDispatchedPrintJob.dispatchResult.errorCode, "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED");
  assert.ok(apiDispatchedPrintJob.operationLogId);
  const apiFailedPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/status",
    {
      status: "failed",
      errorCode: "LIVE_API_DRIVER_TIMEOUT",
      errorMessage: "postgres live API simulated driver timeout",
      reason: "postgres live status callback",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiFailedPrintJob.printJob.jobStatus, "failed");
  assert.equal(apiFailedPrintJob.printJob.errorCode, "LIVE_API_DRIVER_TIMEOUT");
  assert.ok(apiFailedPrintJob.operationLogId);
  const apiRetryPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/retry",
    {
      retryReason: "postgres live retry",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiRetryPrintJob.sourcePrintJob.printJobId, "PJ-LIVE-API-001");
  assert.equal(apiRetryPrintJob.printJob.sourcePrintJobId, "PJ-LIVE-API-001");
  assert.equal(apiRetryPrintJob.printJob.attemptNo, 2);
  assert.equal(apiRetryPrintJob.printJob.jobStatus, "queued");

  const apiPollingPrintJob = {
    ...buildPrintJobRecord({
      printJobId: "PJ-LIVE-API-POLL-001",
      printRecordId: "PR-LIVE-FULFILLMENT-001",
      printDeviceId: "PRN-LIVE-API-001",
      jobStatus: "sent",
      driverMode: "system_printer",
    }),
    queuedAt: "2026-07-02T10:40:00.000Z",
    sentAt: "2026-07-02T10:41:00.000Z",
    metadata: {
      source: "postgres-live",
      externalJobId: "DRY-PJ-LIVE-API-POLL-001",
    },
  };
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiPollingPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-POLL-001",
      printJob: apiPollingPrintJob,
      action: "create_print_job",
    }),
  });
  const deniedApiStatusPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    {
      statuses: ["sent"],
      reason: "postgres live warehouse poll denial",
    },
    { headers: warehouseHeaders, expectedStatus: 403 },
  );
  assert.equal(deniedApiStatusPoll.requiredPermission, "print.job.callback");
  const apiStatusPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    {
      statuses: ["sent"],
      reason: "postgres live dry-run poll",
    },
    { headers: printDriverHeaders },
  );
  const apiStatusPollItem = apiStatusPoll.items.find((item) => item.printJobId === "PJ-LIVE-API-POLL-001");
  assert.equal(apiStatusPollItem.beforeStatus, "sent");
  assert.equal(apiStatusPollItem.afterStatus, "printed");
  assert.equal(apiStatusPollItem.pollResult.adapterStatus, "dry_run_completed");
  assert.equal(apiStatusPollItem.driverStatusEvent.operatorId, "U-PRINT-DRIVER-A");
  assert.ok(apiStatusPollItem.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', job_status, 'eventSource', metadata_json->'lastDriverStatusEvent'->>'eventSource') AS result FROM print_jobs WHERE id = 'PJ-LIVE-API-POLL-001';",
    ).status,
    "printed",
  );
  const apiStatusPollOperationLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiStatusPollItem.operationLogId)};`,
  );
  assert.equal(apiStatusPollOperationLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiStatusPollOperationLog.action, "record_print_job_driver_status");

  const apiCallbackPrintJob = {
    ...buildPrintJobRecord({
      printJobId: "PJ-LIVE-API-CALLBACK-001",
      printRecordId: "PR-LIVE-FULFILLMENT-001",
      printDeviceId: "PRN-LIVE-API-001",
      jobStatus: "sent",
      driverMode: "system_printer",
    }),
    queuedAt: "2026-07-02T10:30:00.000Z",
    sentAt: "2026-07-02T10:31:00.000Z",
    metadata: {
      source: "postgres-live",
      externalJobId: "SYS-LIVE-API-CALLBACK-001",
    },
  };
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiCallbackPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-CALLBACK-001",
      printJob: apiCallbackPrintJob,
      action: "create_print_job",
    }),
  });
  const apiCallbackPrintJobDetail = await getJson(baseUrl, "/api/print-jobs/PJ-LIVE-API-CALLBACK-001", {
    headers,
  });
  assert.equal(apiCallbackPrintJobDetail.printJob.jobStatus, "sent");
  const apiDriverStatusPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-CALLBACK-001/driver-status",
    {
      status: "printed",
      externalJobId: "SYS-LIVE-API-CALLBACK-001",
      adapterName: "postgres-live-driver",
      eventSource: "driver_callback",
      driverStatus: "completed",
      eventAt: "2026-07-02T10:32:00.000Z",
      message: "postgres live callback completed",
      operatorId: "PRINT-DRIVER-FREEFORM",
    },
    { headers: printDriverHeaders },
  );
  assert.equal(apiDriverStatusPrintJob.printJob.jobStatus, "printed");
  assert.equal(apiDriverStatusPrintJob.printJob.finishedAt, "2026-07-02T10:32:00.000Z");
  assert.equal(apiDriverStatusPrintJob.driverStatusEvent.driverStatus, "completed");
  assert.equal(apiDriverStatusPrintJob.driverStatusEvent.operatorId, "U-PRINT-DRIVER-A");
  assert.ok(apiDriverStatusPrintJob.operationLogId);
  const apiDriverStatusOperationLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiDriverStatusPrintJob.operationLogId)};`,
  );
  assert.equal(apiDriverStatusOperationLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiDriverStatusOperationLog.action, "record_print_job_driver_status");

  const apiPrintBatch = await postJson(
    baseUrl,
    "/api/print-batches",
    {
      printBatchId: "PB-LIVE-API-001",
      action: "批量打印标签",
      resultLabel: "部分打出",
      status: "partial",
      todoIds: ["T-LIVE-API-PRINT-001"],
      todoRefs: ["ORD-LIVE-API-PRINT-001"],
      totalTaskCount: 1,
      totalLabelCount: 3,
      printedLabelCount: 2,
      pendingLabelCount: 1,
      printedPackageIds: ["PKG-LIVE-API-PRINT-001", "PKG-LIVE-API-PRINT-002"],
      pendingPackageIds: ["PKG-LIVE-API-PRINT-003"],
      printPackages: [
        { packageId: "PKG-LIVE-API-PRINT-001", packageSeq: 1, packageCount: 3, status: "printed" },
        { packageId: "PKG-LIVE-API-PRINT-002", packageSeq: 2, packageCount: 3, status: "printed" },
        { packageId: "PKG-LIVE-API-PRINT-003", packageSeq: 3, packageCount: 3, status: "not_printed" },
      ],
      operatorId: "U-OFFICE-A",
      operatorName: "办公室A",
      createdAt: "今天 10:30",
    },
    { headers },
  );
  assert.equal(apiPrintBatch.printBatchRecord.printBatchId, "PB-LIVE-API-001");
  assert.equal(apiPrintBatch.printBatchRecord.pendingPackageIds[0], "PKG-LIVE-API-PRINT-003");
  assert.ok(apiPrintBatch.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', status, 'pending', pending_package_ids[1]) AS result FROM print_batch_records WHERE id = 'PB-LIVE-API-001';",
    ).pending,
    "PKG-LIVE-API-PRINT-003",
  );
  const apiPrintBatchList = await getJson(baseUrl, "/api/print-batches?todoId=T-LIVE-API-PRINT-001", { headers });
  assert.equal(apiPrintBatchList.total, 1);
  assert.equal(apiPrintBatchList.items[0].printBatchId, "PB-LIVE-API-001");

  const voidCandidateOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-VOID-001/confirm",
    {
      draftId: "DRAFT-LIVE-VOID-001",
      sourceText: "张三服饰 30*38红5个 明天自提后取消",
      customerId: "C001",
      operatorId: "U-OFFICE-A",
      confirmMode: "confirm_now",
      clientRevision: 1,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-VOID-001-01",
          customerId: "C001",
          customer: "张三服饰",
          productName: "空白袋",
          size: "30*38*10",
          bagColor: "红色",
          handleType: "普通提",
          style: "空白袋",
          qty: 5,
          fulfillmentMethod: "自提",
          latestNeededAt: "明天",
          printFlag: false,
        },
      ],
    },
    { headers },
  );
  assert.equal(voidCandidateOrder.reservations.length, 1);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1325,
  );
  const apiVoidedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${voidCandidateOrder.orderLines[0].id}/void`,
    {
      reason: "order_cancelled",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiVoidedOrderLine.status, "已关闭");
  assert.equal(apiVoidedOrderLine.releasedReservations[0].status, "released");
  assert.equal(apiVoidedOrderLine.releasedReservations[0].qty, 0);
  assert.ok(apiVoidedOrderLine.canceledFulfillmentIds.includes(voidCandidateOrder.fulfillmentTasks[0].fulfillmentId));
  assert.equal(apiVoidedOrderLine.inventoryLedgerIds.length, 1);
  assert.ok(apiVoidedOrderLine.orderLineChangeRecordId);
  assert.ok(apiVoidedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('lineStatus', line_status, 'voidReason', void_reason) AS result FROM order_lines WHERE id = ${sqlLiteral(
        voidCandidateOrder.orderLines[0].id,
      )};`,
    ).lineStatus,
    "已关闭",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        voidCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).status,
    "已取消",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
        voidCandidateOrder.reservations[0].reservationId,
      )};`,
    ).status,
    "已释放",
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1320,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'order_line_void' AND source_id = ${sqlLiteral(
          voidCandidateOrder.orderLines[0].id,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );

  const quantityCandidateOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-QTY-API-001/confirm",
    {
      draftId: "DRAFT-LIVE-QTY-API-001",
      sourceText: "张三服饰 30*38红10个 明天自提改量",
      customerId: "C001",
      operatorId: "U-OFFICE-A",
      confirmMode: "confirm_now",
      clientRevision: 1,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-QTY-API-001-01",
          customerId: "C001",
          customer: "张三服饰",
          productName: "空白袋",
          size: "30*38*10",
          bagColor: "红色",
          handleType: "普通提",
          style: "空白袋",
          qty: 10,
          fulfillmentMethod: "自提",
          latestNeededAt: "明天",
          printFlag: false,
        },
      ],
    },
    { headers },
  );
  assert.equal(quantityCandidateOrder.reservations.length, 1);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1330,
  );
  const apiDecreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    {
      orderLineId: quantityCandidateOrder.orderLines[0].id,
      newQty: 6,
      reason: "customer_change",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiDecreasedOrderLine.previousQty, 10);
  assert.equal(apiDecreasedOrderLine.newQty, 6);
  assert.equal(apiDecreasedOrderLine.qtyDelta, -4);
  assert.equal(apiDecreasedOrderLine.priceSnapshot.chargeableQty, 6);
  assert.equal(apiDecreasedOrderLine.priceSnapshot.finalAmount, 2.04);
  assert.equal(apiDecreasedOrderLine.adjustedReservations[0].qty, 6);
  assert.equal(apiDecreasedOrderLine.adjustedReservations[0].status, "active");
  assert.ok(apiDecreasedOrderLine.adjustedFulfillmentIds.includes(quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId));
  assert.equal(apiDecreasedOrderLine.inventoryLedgerIds.length, 1);
  assert.ok(apiDecreasedOrderLine.orderLineChangeRecordId);
  assert.ok(apiDecreasedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('originalQty', original_qty) AS result FROM order_lines WHERE id = ${sqlLiteral(
        quantityCandidateOrder.orderLines[0].id,
      )};`,
    ).originalQty,
    6,
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('expectedQty', expected_qty) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).expectedQty,
    6,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1326,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT final_amount FROM price_snapshots WHERE id = ${sqlLiteral(apiDecreasedOrderLine.priceSnapshot.priceSnapshotId)};`,
        { capture: true },
      ).trim(),
    ),
    2.04,
  );

  const apiIncreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    {
      orderLineId: quantityCandidateOrder.orderLines[0].id,
      newQty: 8,
      reason: "customer_change",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiIncreasedOrderLine.previousQty, 6);
  assert.equal(apiIncreasedOrderLine.newQty, 8);
  assert.equal(apiIncreasedOrderLine.qtyDelta, 2);
  assert.equal(apiIncreasedOrderLine.priceSnapshot.chargeableQty, 8);
  assert.equal(apiIncreasedOrderLine.priceSnapshot.finalAmount, 2.72);
  assert.equal(apiIncreasedOrderLine.adjustedReservations[0].qty, 8);
  assert.equal(apiIncreasedOrderLine.adjustedReservations[0].status, "active");
  assert.equal(apiIncreasedOrderLine.inventoryLedgerIds.length, 1);
  assert.equal(
    queryJson(
      `SELECT json_build_object('reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
        quantityCandidateOrder.reservations[0].reservationId,
      )};`,
    ).reservedQty,
    8,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1328,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT final_amount FROM price_snapshots WHERE id = ${sqlLiteral(apiIncreasedOrderLine.priceSnapshot.priceSnapshotId)};`,
        { capture: true },
      ).trim(),
    ),
    2.72,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'order_line_quantity_adjustment' AND source_id = ${sqlLiteral(
          quantityCandidateOrder.orderLines[0].id,
        )};`,
        { capture: true },
      ).trim(),
    ),
    2,
  );
  const apiCancelledFulfillment = await postJson(
    baseUrl,
    `/api/fulfillments/${quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId}/cancel`,
    {
      fulfillmentId: quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      reason: "office_correction",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(apiCancelledFulfillment.status, "已取消");
  assert.equal(apiCancelledFulfillment.releasedReservations[0].qty, 0);
  assert.equal(apiCancelledFulfillment.releasedReservations[0].status, "released");
  assert.equal(apiCancelledFulfillment.inventoryLedgerIds.length, 1);
  assert.ok(apiCancelledFulfillment.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'actualQty', actual_qty) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).status,
    "已取消",
  );
  const cancelledReservation = queryJson(
    `SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
      quantityCandidateOrder.reservations[0].reservationId,
    )};`,
  );
  assert.equal(cancelledReservation.status, "已释放");
  assert.equal(Number(cancelledReservation.reservedQty), 0);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1320,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'fulfillment_cancel' AND source_id = ${sqlLiteral(
          quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM operation_logs WHERE target_type = 'fulfillment' AND target_id = ${sqlLiteral(
          quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
        )} AND action = 'cancel_fulfillment';`,
        { capture: true },
      ).trim(),
    ),
    1,
  );

  const preview = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/preview",
    {
      templateId: "tpl-p0-statement-customer-send",
      previewType: "customer_send",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(preview.statementId, "ST-0629-001");
  assert.ok(preview.downloadToken);
  assert.ok(preview.lines.length >= 1);
  assert.equal(
    queryJson(
      `SELECT json_build_object('downloadToken', download_token, 'operationLogId', operation_log_id, 'contentLength', length(content_text)) AS result FROM statement_export_files WHERE statement_id = 'ST-0629-001' AND download_token = ${sqlLiteral(
        preview.downloadToken,
      )};`,
    ).downloadToken,
    preview.downloadToken,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM statement_lines WHERE statement_id = 'ST-0629-001';", { capture: true }).trim()),
    preview.lines.length,
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('orderLineId', order_line_id, 'chargeableQty', chargeable_qty, 'amount', amount) AS result FROM statement_lines WHERE statement_id = 'ST-0629-001' ORDER BY id LIMIT 1;",
    ).orderLineId,
    preview.lines[0].orderLineId,
  );
  const exportedWorkbook = await getBinary(baseUrl, `/api/statements/ST-0629-001/exports/${preview.downloadToken}`, {
    headers,
  });
  assert.equal(exportedWorkbook.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assertStatementXlsxWorkbook(exportedWorkbook.bytes, { templateVersion: "p0-statement-xlsx-v1" });
  const exportList = await getJson(baseUrl, "/api/statements/ST-0629-001/exports", { headers });
  assert.ok(exportList.total >= 1);
  assert.equal(exportList.items[0].downloadToken, preview.downloadToken);
  assert.equal(exportList.items[0].storageProvider, "local_fs");
  assert.equal(exportList.items[0].storageKeyStored, true);
  assert.equal(exportList.items[0].content, undefined);

  const markedSent = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/mark-sent",
    {
      channel: "wechat",
      sentTo: "张三服饰财务",
      sentAt: "2026-07-01T10:35:00.000Z",
      operatorId: "U-OFFICE-A",
      remark: "postgres live statement send route",
    },
    { headers },
  );
  assert.equal(markedSent.status, "已发送");
  assert.ok(markedSent.sendRecordId);
  const sentStatement = queryJson(
    "SELECT json_build_object('status', status, 'lastSentAt', last_sent_at) AS result FROM statements WHERE id = 'ST-0629-001';",
  );
  assert.equal(sentStatement.status, "已发送待回款");
  assert.equal(
    queryJson("SELECT json_build_object('exportFileId', export_file_id, 'sentTo', sent_to) AS result FROM statement_send_records WHERE statement_id = 'ST-0629-001' ORDER BY sent_at DESC LIMIT 1;").exportFileId,
    preview.downloadToken,
  );
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_type = 'statement' AND target_id = 'ST-0629-001' AND action = 'mark_statement_sent';", {
        capture: true,
      }).trim(),
    ),
    1,
  );

  const sendReceipt = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/send-receipt",
    {
      sendRecordId: markedSent.sendRecordId,
      receiptStatus: "read",
      receiptAt: "2026-07-01T11:05:00.000Z",
      operatorId: "U-OFFICE-A",
      remark: "postgres live customer read receipt route",
    },
    { headers },
  );
  assert.equal(sendReceipt.sendRecordId, markedSent.sendRecordId);
  assert.equal(sendReceipt.receiptStatus, "read");
  assert.ok(sendReceipt.operationLogId);
  assert.equal(
    queryJson("SELECT json_build_object('receiptStatus', receipt_status, 'receiptBy', receipt_by) AS result FROM statement_send_records WHERE id = " + sqlLiteral(markedSent.sendRecordId) + ";").receiptStatus,
    "read",
  );

  const customerConfirmation = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/customer-confirmation",
    {
      sendRecordId: markedSent.sendRecordId,
      confirmationType: "customer_reply",
      channel: "wechat",
      confirmedByCustomer: "张三服饰财务",
      confirmedAt: "2026-07-01T11:15:00.000Z",
      content: "postgres live customer confirmed statement route",
      attachmentIds: ["ATT-LIVE-CONFIRM-ROUTE-001"],
      operatorId: "U-OFFICE-A",
      remark: "postgres live customer confirmation route",
    },
    { headers },
  );
  assert.equal(customerConfirmation.status, "客户已确认");
  assert.equal(customerConfirmation.sendRecordId, markedSent.sendRecordId);
  assert.equal(customerConfirmation.receiptStatus, "confirmed");
  assert.equal(customerConfirmation.confirmationRecord.content, "postgres live customer confirmed statement route");
  assert.equal(customerConfirmation.confirmationRecord.attachmentIds[0], "ATT-LIVE-CONFIRM-ROUTE-001");
  assert.ok(customerConfirmation.operationLogId);
  assert.equal(
    queryJson("SELECT json_build_object('status', status) AS result FROM statements WHERE id = 'ST-0629-001';").status,
    "客户已确认",
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('content', content, 'attachmentIds', attachment_ids_json) AS result FROM statement_confirmation_records WHERE id = " +
        sqlLiteral(customerConfirmation.confirmationRecordId) +
        ";",
    ).attachmentIds[0],
    "ATT-LIVE-CONFIRM-ROUTE-001",
  );

  const payment = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/payments",
    {
      amount: 273,
      paidAt: "2026-07-01T10:30:00.000Z",
      method: "wechat",
      operatorId: "U-OFFICE-A",
      attachmentIds: [created.attachmentId],
      remark: "postgres live payment route",
    },
    { headers },
  );
  assert.equal(payment.payment.statementId, "ST-0629-001");
  assert.equal(payment.payment.customerId, "C001");
  assert.equal(payment.payment.attachmentIds[0], created.attachmentId);
  assert.equal(payment.statementStatus, "收款待确认");

  const paymentCount = Number(
    runPsql("SELECT COUNT(*) FROM payment_records WHERE statement_id = 'ST-0629-001' AND amount = 273;", {
      capture: true,
    }).trim(),
  );
  assert.equal(paymentCount, 1);
  const statementAfterPayment = queryJson(
    "SELECT json_build_object('status', status, 'received', received_amount, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-0629-001';",
  );
  assert.equal(statementAfterPayment.status, "收款待确认");
  assert.equal(Number(statementAfterPayment.received), 273);
  assert.equal(Number(statementAfterPayment.variance), 0);
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_type = 'statement' AND target_id = 'ST-0629-001' AND action = 'record_statement_payment';", {
        capture: true,
      }).trim(),
    ),
    1,
  );

  const variance = await postJson(
    baseUrl,
    "/api/statements/ST-0629-002/variance",
    {
      varianceAmount: 28000,
      handlingResult: "carry_to_debt",
      reason: "未收差额转欠款",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(variance.statementStatus, "有欠款");
  assert.equal(variance.debtAmount, 28000);
  assert.equal(variance.varianceRecord.statementId, "ST-0629-002");
  const varianceStatement = queryJson(
    "SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-0629-002';",
  );
  assert.equal(varianceStatement.status, "有欠款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM variance_records WHERE statement_id = 'ST-0629-002';", { capture: true }).trim()), 1);

  const writeOff = await postJson(
    baseUrl,
    "/api/statements/ST-0629-002/write-off",
    {
      confirmReason: "确认差额转欠款",
      operatorId: "U-OFFICE-A",
    },
    { headers },
  );
  assert.equal(writeOff.status, "已确认欠款");
  assert.equal(writeOff.debtAmount, 28000);
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-0629-002';").status,
    "已确认欠款",
  );
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_type = 'statement' AND target_id = 'ST-0629-002' AND action = 'write_off_statement';", {
        capture: true,
      }).trim(),
    ),
    1,
  );
}

function buildAttachment({ attachmentId, ownerId, uploadedBy }) {
  return {
    attachmentId,
    ownerType: "statement",
    ownerId,
    fileType: "image",
    purpose: "payment_screenshot",
    url: `/api/attachments/${attachmentId}/content`,
    status: "uploaded",
    uploadedBy,
    uploadedAt: "2026-07-01T10:30:00.000Z",
    fileName: "payment-proof-postgres-live.png",
    contentRef: `p0://payment-screenshot/${ownerId}/postgres-live`,
    mimeType: "image/png",
    fileSize: 13,
    contentDataUrl: "",
    storageProvider: "local_fs",
    storageKey: `attachments/${attachmentId}/payment-proof-postgres-live.png`,
    contentDigest: "sha256-postgres-live",
    thumbnailStorageKey: "",
    thumbnailUrl: "",
    signedUrlExpiresAt: "",
    hasContent: true,
    remark: "postgres live check",
  };
}

function buildAccessLog({ logId, attachmentId, operatorId, operationLogId }) {
  return {
    logId,
    attachmentId,
    operationLogId,
    action: "attachment_content_read",
    operatorId,
    accessMode: "permission",
    deliveryMode: "api_permission",
    storageProvider: "local_fs",
    storageKey: `attachments/${attachmentId}/payment-proof-postgres-live.png`,
    ownerType: "statement",
    ownerId: "ST-LIVE-REPO-001",
    purpose: "payment_screenshot",
    fileName: "payment-proof-postgres-live.png",
    contentType: "image/png",
    expiresAt: "",
    metadata: { check: "postgres-live" },
    occurredAt: "2026-07-01T10:30:00.000Z",
  };
}

function buildPaymentRecord({ paymentRecordId, statementId, customerId, operatorId, amount = 273 }) {
  return {
    paymentRecordId,
    bizNo: paymentRecordId,
    statementId,
    customerId,
    amount,
    paidAt: "2026-07-01T10:30:00.000Z",
    method: "wechat",
    status: "recorded",
    attachmentIds: ["ATT-PAY-LIVE-001"],
    operatorId,
    remark: "postgres live payment repository",
  };
}

function buildVarianceRecord({ varianceRecordId, statementId, amount, operatorId }) {
  return {
    varianceRecordId,
    statementId,
    paymentRecordId: "",
    amount,
    handlingResult: "carry_to_debt",
    reason: "未收差额转欠款",
    status: "recorded",
    attachmentId: "",
    operatorId,
  };
}

function buildSendRecord({ sendRecordId, statementId, exportFileId, operatorId }) {
  return {
    sendRecordId,
    statementId,
    channel: "wechat",
    sentTo: "客户财务",
    exportFileId,
    includePaymentQr: false,
    sentBy: operatorId,
    sentAt: "2026-07-01T10:35:00.000Z",
    remark: "postgres live statement send transaction",
    receiptStatus: "pending",
    receiptAt: "",
    receiptBy: "",
    receiptNote: "",
  };
}

function buildStatementExportFile({ statementId, downloadToken, operationLogId }) {
  return {
    exportFileId: downloadToken,
    statementId,
    previewType: "customer_send",
    downloadToken,
    operationLogId,
    fileName: `statement-${statementId}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: Buffer.from("Postgres Export Live XLSX").toString("base64"),
    contentEncoding: "base64",
    storageProvider: "database",
    storageKey: "",
    contentDigest: "",
    createdBy: "U-FINANCE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
    metadata: { lineCount: 1, receivable: 273, contentEncoding: "base64" },
  };
}

function buildStatementExportLines({ statementId, orderLineId, fulfillmentId }) {
  return [
    {
      statementLineId: `${statementId}-001`,
      statementId,
      orderLineId,
      fulfillmentId,
      deliveredQty: 273,
      chargeableQty: 273,
      freeQty: 0,
      amount: 273,
      adjustmentAmount: 0,
      finalAmount: 273,
      createdAt: "2026-07-02T10:30:00.000Z",
    },
  ];
}

function buildConfirmedOrder({ orderId, customerId, createdBy }) {
  return {
    orderId,
    bizNo: orderId,
    sourceDraftId: "",
    customerId,
    customerSnapshot: { name: "Postgres 仓储测试客户" },
    sourceText: "Postgres live order confirmation",
    summaryStatus: "处理中",
    createdBy,
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildConfirmedOrderLines({ orderId, customerId, orderLineId, createdBy }) {
  return [
    {
      id: orderLineId,
      orderNo: orderId,
      customerId,
      product: "Postgres 确认订单",
      orderType: "现货有货",
      size: "30*38*10",
      color: "白色",
      handle: "普通提",
      style: "空白袋",
      print: "否",
      qty: 273,
      fulfillment: "自提",
      status: "待出库",
      amount: 273,
      inventory: "可用",
      exceptions: [],
      createdBy,
    },
  ];
}

function buildConfirmedPriceSnapshots({ orderLineId, createdBy }) {
  return [
    {
      orderLineId,
      bagPrice: 1,
      printPrice: 0,
      otherFee: 0,
      amount: 273,
      priceVersion: "P0-SYNTHETIC",
      chargeableQty: 273,
      createdBy,
    },
  ];
}

function buildConfirmedFulfillments({ fulfillmentId, orderLineId, customerId, createdBy }) {
  return [
    {
      id: fulfillmentId,
      lineId: orderLineId,
      customerId,
      method: "自提",
      qty: 273,
      status: "待出库",
      latest: "待确认",
      goods: "30*38 白色空白袋",
      packages: "1件散装",
      zone: "按库存推荐",
      source: "正式订单占用",
      createdBy,
    },
  ];
}

function buildConfirmedInventoryReservations({
  reservationId,
  orderLineId,
  inventoryItemId,
  reservedQty,
  createdBy,
}) {
  return [
    {
      reservationId,
      orderLineId,
      inventoryItemId,
      reservedQty,
      reservationType: "待提货锁定",
      status: "生效",
      createdBy,
    },
  ];
}

function buildConfirmedInventoryLedgerEntries({
  ledgerId,
  inventoryItemId,
  sourceId,
  qtyBefore,
  qtyChange,
  qtyAfter,
  operatorId,
}) {
  return [
    {
      ledgerId,
      inventoryItemId,
      changeType: "订单占用",
      qtyBefore,
      qtyChange,
      qtyAfter,
      sourceType: "order_confirm",
      sourceId,
      operatorId,
      confirmedBy: operatorId,
      reason: "订单确认占用库存",
      remark: "待提货锁定",
    },
  ];
}

function buildConfirmedTodos({ todoId, refId, customerId, createdBy }) {
  return [
    {
      id: todoId,
      type: "缺货待处理",
      customerId,
      ref: refId,
      summary: "Postgres live order confirmation shortage todo",
      wait: "刚刚",
      latest: "今天",
      urgency: "异常",
      impact: "影响出库承诺",
      createdBy,
    },
  ];
}

function buildProductionTaskRecord(overrides = {}) {
  return {
    productionTaskId: "PT-LIVE-PROD-001",
    id: "PT-LIVE-PROD-001",
    bizNo: "PT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    taskType: "制袋",
    machineId: "BAG-LIVE-01",
    plannedQty: 80,
    taskStatus: "制袋中",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

function buildWorkshopReportRecord(overrides = {}) {
  return {
    reportId: "WR-LIVE-PROD-001",
    productionTaskId: "PT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    processType: "制袋",
    machineId: "BAG-LIVE-01",
    operatorId: "U-OFFICE-A",
    qualifiedQty: 80,
    exceptionQty: 0,
    machineCount: 8888,
    completedAt: "2026-07-02T12:30:00.000Z",
    remark: "Postgres live production report",
    evidence: { machineCountLabel: "机器计数/动作次数，非合格成品数量" },
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildPackingTaskRecord(overrides = {}) {
  return {
    packingTaskId: "PKT-LIVE-PROD-001",
    id: "PKT-LIVE-PROD-001",
    bizNo: "PKT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    plannedQty: 80,
    actualPackedQty: 0,
    status: "待打包",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildMachineCapacityBaselineRecord(overrides = {}) {
  return {
    capacityBaselineId: "MCB-LIVE-PROD-001",
    id: "MCB-LIVE-PROD-001",
    machineId: "BAG-LIVE-01",
    sizeKey: "30*38*10",
    dailyCapacityQty: 80,
    hourlyCapacityQty: null,
    sourceKind: "production_report",
    confidence: "medium",
    effectiveFrom: "2026-07-02",
    remark: "Postgres live production capacity calibration",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildProductionOrderLineRecord(overrides = {}) {
  return {
    orderLineId: "OL-LIVE-PROD-001",
    id: "OL-LIVE-PROD-001",
    lineStatus: "制袋中",
    exceptionTags: [],
    ...overrides,
  };
}

function buildProductionReservationRecord(overrides = {}) {
  return {
    reservationId: "RSV-LIVE-PROD-001",
    id: "RSV-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    inventoryItemId: "INV-LIVE-PROD-001",
    reservedQty: 80,
    reservationType: "生产完成待出库占用",
    status: "生效",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildProductionInventoryLedgerRecord(overrides = {}) {
  return {
    ledgerId: "LEDGER-LIVE-PROD-IN-001",
    inventoryItemId: "INV-LIVE-PROD-001",
    changeType: "生产入库",
    qtyBefore: 20,
    qtyChange: 80,
    qtyAfter: 100,
    sourceType: "production_report",
    sourceId: "WR-LIVE-PROD-001",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-OFFICE-A",
    occurredAt: "2026-07-02T12:30:00.000Z",
    createdAt: "2026-07-02T12:30:00.000Z",
    reason: "车间合格报工入库",
    remark: "机器计数不参与库存",
    ...overrides,
  };
}

function buildPackageRecord(overrides = {}) {
  const packageId = overrides.packageId ?? "PKG-LIVE-PROD-001-1";
  return {
    packageId,
    id: packageId,
    bizNo: overrides.bizNo ?? packageId,
    orderLineId: "OL-LIVE-PROD-001",
    fulfillmentId: "",
    packageSeq: 1,
    packageCount: 1,
    packedQty: 80,
    labelPrintRecordId: "",
    status: "待打印标签",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:40:00.000Z",
    ...overrides,
  };
}

function buildProductionOperationLog(overrides = {}) {
  const id = overrides.logId ?? overrides.id ?? "LOG-LIVE-PROD-001";
  return {
    id,
    targetType: "production_task",
    targetId: "PT-LIVE-PROD-001",
    action: "complete_production_report",
    before: null,
    after: { check: "postgres-live" },
    reason: "postgres live production packing transaction",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T12:30:00.000Z",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildProductionScheduleRecord(overrides = {}) {
  const productionTaskId = overrides.productionTaskId ?? "PT-LIVE-PROD-001";
  return {
    scheduleRecordId: overrides.scheduleRecordId ?? `SQR-${productionTaskId}`,
    productionTaskId,
    orderLineId: overrides.orderLineId ?? "OL-LIVE-PROD-001",
    publishedScheduleId: overrides.publishedScheduleId ?? "SCH-LIVE-PROD-001",
    machineId: overrides.machineId ?? "BAG-LIVE-01",
    queueSeq: overrides.queueSeq ?? 1,
    status: overrides.status ?? "active",
    sourceKind: overrides.sourceKind ?? "manual_resequence",
    sequenceUpdatedAt: overrides.sequenceUpdatedAt ?? "2026-07-02T12:35:00.000Z",
    sequenceUpdatedBy: overrides.sequenceUpdatedBy ?? "U-OFFICE-A",
    remark: overrides.remark ?? "Postgres live production schedule resequence",
    createdBy: overrides.createdBy ?? "U-OFFICE-A",
    createdAt: overrides.createdAt ?? "2026-07-02T12:35:00.000Z",
    updatedBy: overrides.updatedBy ?? "U-OFFICE-A",
    updatedAt: overrides.updatedAt ?? "2026-07-02T12:35:00.000Z",
  };
}

function buildProductionScheduleOperationLog(overrides = {}) {
  const id = overrides.logId ?? overrides.id ?? "LOG-LIVE-SCHEDULE-RESEQ-001";
  return {
    id,
    targetType: overrides.targetType ?? "production_schedule_queue",
    targetId: overrides.targetId ?? "BAG-LIVE-01",
    action: overrides.action ?? "resequence_production_schedule_queue",
    before: overrides.before ?? { items: [] },
    after: overrides.after ?? {
      items: [{ productionTaskId: "PT-LIVE-PROD-001", queueSeq: 1 }],
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
    },
    reason: overrides.reason ?? "Postgres live production schedule resequence",
    operatorId: overrides.operatorId ?? "U-OFFICE-A",
    pageKey: overrides.pageKey ?? "api",
    occurredAt: overrides.occurredAt ?? "2026-07-02T12:35:00.000Z",
    createdAt: overrides.createdAt ?? "2026-07-02T12:35:00.000Z",
    ...overrides,
  };
}

function buildPrintDeviceRecord({ printDeviceId, name }) {
  return {
    printDeviceId,
    bizNo: printDeviceId,
    name,
    deviceType: "label_printer",
    status: "active",
    connectionType: "system_printer",
    connectionUri: "system://postgres-live-label",
    driverName: "Postgres Live 203dpi Driver",
    supportedDocumentTypes: ["express_ltl_label", "package_label"],
    defaultDocumentTypes: ["express_ltl_label"],
    paperWidthMm: 76,
    paperHeightMm: 50,
    paperName: "76x50 热敏标签",
    isContinuous: false,
    dpi: 203,
    defaultCopies: 1,
    darkness: 9,
    speed: 4,
    cutterEnabled: false,
    settings: {
      driverMode: "preview_only",
      source: "postgres-live",
    },
    createdBy: "U-OFFICE-A",
    updatedBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
    updatedAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildPrintDeviceOperationLog({ logId, printDevice }) {
  return {
    id: logId,
    targetType: "print_device",
    targetId: printDevice.printDeviceId,
    action: "upsert_print_device",
    before: null,
    after: printDevice,
    reason: "postgres live print device setup",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildPrintJobRecord(overrides = {}) {
  const printJobId = overrides.printJobId ?? "PJ-LIVE-REPO-001";
  const driverMode = overrides.driverMode ?? "preview_only";
  const jobStatus = overrides.jobStatus ?? "preview_only";
  return {
    printJobId,
    bizNo: printJobId,
    printRecordId: overrides.printRecordId ?? "PR-LIVE-FULFILLMENT-001",
    targetType: "fulfillment",
    targetId: "F001",
    documentType: "express_ltl_label",
    templateId: "tpl-p0-fulfillment",
    printDeviceId: overrides.printDeviceId ?? "PRN-LIVE-REPO-001",
    printDeviceSnapshot: {
      printDeviceId: overrides.printDeviceId ?? "PRN-LIVE-REPO-001",
      name: "Postgres Live 标签机",
      deviceType: "label_printer",
      connectionType: "system_printer",
      paperWidthMm: 76,
      paperHeightMm: 50,
      dpi: 203,
      defaultCopies: 1,
      settings: {
        driverMode,
      },
    },
    driverMode,
    jobStatus,
    attemptNo: overrides.attemptNo ?? 1,
    sourcePrintJobId: overrides.sourcePrintJobId ?? "",
    requestedBy: "U-OFFICE-A",
    queuedAt: jobStatus === "queued" ? "2026-07-02T10:30:00.000Z" : "",
    sentAt: "",
    finishedAt: "",
    errorCode: "",
    errorMessage: "",
    payload: {
      printTemplate: {
        documentType: "express_ltl_label",
        fields: { goodsSummary: "Postgres live print job" },
      },
    },
    metadata: {
      source: "postgres-live",
    },
    createdAt: "2026-07-02T10:30:00.000Z",
    updatedAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildPrintJobOperationLog({ logId, printJob, action, before = null }) {
  return {
    id: logId,
    targetType: "print_job",
    targetId: printJob.printJobId,
    action,
    before,
    after: printJob,
    reason: "postgres live print job check",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildPrintBatchRecord({ printBatchId, todoId, operatorName = "办公室A" }) {
  return {
    printBatchId,
    action: "批量打印标签",
    resultLabel: "部分打出",
    status: "partial",
    todoIds: [todoId],
    todoRefs: ["ORD-LIVE-PRINT-001"],
    totalTaskCount: 1,
    totalLabelCount: 2,
    printedLabelCount: 1,
    pendingLabelCount: 1,
    printedPackageIds: ["PKG-LIVE-PRINT-001"],
    pendingPackageIds: ["PKG-LIVE-PRINT-002"],
    printPackages: [
      {
        packageId: "PKG-LIVE-PRINT-001",
        packageSeq: 1,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "printed",
      },
      {
        packageId: "PKG-LIVE-PRINT-002",
        packageSeq: 2,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "not_printed",
      },
    ],
    printedPackages: [
      {
        packageId: "PKG-LIVE-PRINT-001",
        packageSeq: 1,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "printed",
      },
    ],
    pendingPackages: [
      {
        packageId: "PKG-LIVE-PRINT-002",
        packageSeq: 2,
        packageCount: 2,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 2包",
        status: "not_printed",
      },
    ],
    summary: "部分打出：1/2，待处理 1 张",
    operatorId: "U-OFFICE-A",
    operatorName,
    createdAt: "2026-07-02T10:30:00.000Z",
    operationLogId: "LOG-LIVE-PRINT-BATCH-001",
    metadata: {
      source: "postgres-live",
    },
  };
}

function buildPrintBatchOperationLog({ logId, printBatchRecord }) {
  return {
    id: logId,
    targetType: "print_batch",
    targetId: printBatchRecord.printBatchId,
    action: "create_print_batch",
    before: null,
    after: printBatchRecord,
    reason: printBatchRecord.summary,
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildFulfillmentActionRecord(overrides = {}) {
  const fulfillmentId = overrides.fulfillmentId ?? "F001";
  return {
    fulfillmentId,
    id: fulfillmentId,
    bizNo: fulfillmentId,
    orderLineId: overrides.orderLineId ?? "ORD-0629-001-01",
    lineId: overrides.orderLineId ?? "ORD-0629-001-01",
    customerId: overrides.customerId ?? "C001",
    customerSnapshot: { name: "张三服饰" },
    method: overrides.method ?? "自提",
    expectedQty: overrides.expectedQty ?? 500,
    qty: overrides.expectedQty ?? 500,
    actualQty: overrides.actualQty ?? 500,
    status: overrides.status ?? "待出库",
    latestNeededAt: "2026-07-02T15:00:00.000Z",
    deliveredAt: overrides.deliveredAt ?? "",
    confirmedAt: overrides.confirmedAt ?? "",
    confirmedBy: overrides.confirmedBy ?? "U-OFFICE-A",
    createdBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildFulfillmentPrintRecord({ printRecordId, targetId }) {
  return {
    printRecordId,
    targetType: "fulfillment",
    targetId,
    templateId: "tpl-p0-fulfillment",
    batchNo: `${printRecordId}-BATCH`,
    status: "printed",
    printAction: "first_print",
    operatorId: "U-OFFICE-A",
    printedAt: "2026-07-02T10:40:00.000Z",
    createdAt: "2026-07-02T10:40:00.000Z",
  };
}

function buildFulfillmentExceptionRecord({ exceptionId, fulfillmentId, todoId }) {
  return {
    exceptionId,
    fulfillmentId,
    exceptionType: "quantity_mismatch",
    expectedQty: 500,
    actualQty: 490,
    reason: "stock_shortage",
    status: "待办公室处理",
    todoId,
    reportedBy: "U-WAREHOUSE-A",
    createdAt: "2026-07-02T10:45:00.000Z",
  };
}

function buildFulfillmentTodo({ todoId, refId }) {
  return {
    id: todoId,
    type: "数量差异待处理",
    customerId: "C001",
    ref: refId,
    summary: "张三服饰自提单数量差异，需办公室确认",
    latest: "2026-07-02T15:00:00.000Z",
    urgency: "异常",
    impact: "影响出库交付",
    createdBy: "U-WAREHOUSE-A",
  };
}

function buildFulfillmentOperationLog({ logId, action, fulfillmentId }) {
  const before = buildFulfillmentActionRecord({ fulfillmentId, status: "待出库" });
  const after = buildFulfillmentActionRecord({ fulfillmentId, status: "待确认拉走", actualQty: 490 });
  return {
    id: logId,
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action,
    before,
    after,
    reason: "postgres live fulfillment action",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:45:00.000Z",
    createdAt: "2026-07-02T10:45:00.000Z",
  };
}

function buildStatement({ id, customerId, status, received = 0, variance = 273 }) {
  return {
    id,
    customerId,
    status,
    receivable: 273,
    received,
    variance,
  };
}

function buildTodo({ todoId, statementId }) {
  return {
    id: todoId,
    type: "收款差额待确认",
    customerId: "C-LIVE-REPO",
    ref: statementId,
    summary: "应收 273，实收 200，差额 73",
    latest: "本期",
    urgency: "异常",
    impact: "需确认未收差额",
  };
}

function buildLiveMasterDataImportExecution() {
  const targetRecords = {
    standardColors: [
      {
        id: "SC-MD-LIVE-001",
        colorKey: "md-live-red",
        name: "主数据导入红",
        enabled: true,
      },
    ],
    priceTables: [
      {
        id: "PT-MD-LIVE-001",
        bizNo: "PT-MD-LIVE-001",
        name: "主数据导入价格表",
        status: "pending_review",
        effectiveFrom: "2026-07-03",
      },
    ],
    customers: [
      {
        id: "C-MD-LIVE-001",
        bizNo: "CUST-MD-LIVE-001",
        name: "主数据导入客户",
        shortName: "主数据客户",
        settlementCycle: "7天一结",
        riskStatus: "正常",
        enabled: true,
      },
    ],
    customerContacts: [
      {
        id: "CC-MD-LIVE-001",
        customerId: "C-MD-LIVE-001",
        contactName: "导入联系人",
        phone: "13900009999",
        role: "客户本人",
        isDefault: true,
        remark: "live check",
      },
    ],
    customerAddresses: [
      {
        id: "CA-MD-LIVE-001",
        customerId: "C-MD-LIVE-001",
        contactId: "CC-MD-LIVE-001",
        address: "主数据导入地址",
        area: "虎门",
        defaultFulfillmentMethod: "自提",
        isDefault: true,
        remark: "live check",
      },
    ],
    customerNotes: [
      {
        id: "CN-MD-LIVE-001",
        customerId: "C-MD-LIVE-001",
        noteType: "office",
        content: "主数据导入备注",
        visibleTo: "office",
      },
    ],
    colorAliases: [
      {
        id: "CALIAS-MD-LIVE-001",
        alias: "导入红",
        standardColorId: "SC-MD-LIVE-001",
        sourceType: "global",
        sourceId: "",
        enabled: true,
      },
    ],
    sizeSpecs: [
      {
        id: "SIZE-MD-LIVE-001",
        sizeKey: "md-live-30-38-10",
        displayName: "30*38*10",
        widthMm: 30,
        heightMm: 38,
        metadata: { source: "postgres-live" },
        enabled: true,
      },
    ],
    finishedGoodsStyles: [
      {
        id: "STYLE-MD-LIVE-001",
        styleKey: "blank-bag",
        name: "空白袋",
        enabled: true,
        allowedSizeKeys: ["md-live-30-38-10"],
      },
    ],
    priceTableItems: [
      {
        id: "PTI-MD-LIVE-001",
        priceTableId: "PT-MD-LIVE-001",
        sizeKey: "md-live-30-38-10",
        standardColorId: "SC-MD-LIVE-001",
        handleType: "普通提",
        styleKey: "blank-bag",
        bagPrice: 0.34,
        printPrice: 0,
        otherFee: 0,
        minQty: 1,
        enabled: false,
      },
    ],
    inventoryItems: [
      {
        id: "INV-MD-LIVE-001",
        inventoryKey: "30*38*10|主数据导入红|普通提|空白袋|MD-LIVE|仓库已清点",
        size: "30*38*10",
        standardColorId: "SC-MD-LIVE-001",
        handleType: "普通提",
        style: "空白袋",
        zone: "MD-LIVE",
        inventoryState: "仓库已清点",
        onHandQty: 100,
        reservedQty: 0,
        waitingPickupLockedQty: 0,
        pendingHandlingQty: 0,
        trustLevel: "已清点",
      },
    ],
    inventoryLedgerEntries: [
      {
        id: "LEDGER-MD-LIVE-001",
        inventoryItemId: "INV-MD-LIVE-001",
        changeType: "initial_import",
        qtyBefore: 0,
        qtyChange: 100,
        qtyAfter: 100,
        sourceType: "master_data_import",
        sourceId: "MDE-MD-LIVE-001",
        occurredAt: "2026-07-03T10:30:00.000Z",
        reason: "基础资料初始库存导入",
        remark: "postgres live check",
      },
    ],
    machines: [
      {
        id: "MACH-MD-LIVE-001",
        bizNo: "MACH-MD-LIVE-001",
        name: "主数据导入制袋机",
        machineType: "bag_making",
        workshop: "1号车间",
        status: "active",
        enabled: true,
        settings: { source: "postgres-live" },
      },
    ],
    employees: [
      {
        id: "EMP-MD-LIVE-001",
        bizNo: "EMP-MD-LIVE-001",
        userId: "",
        name: "主数据导入员工",
        roleName: "制袋",
        defaultWorkshop: "1号车间",
        defaultMachineId: "MACH-MD-LIVE-001",
        baseHourlyWage: 22,
        positionAllowanceHourly: 2,
        wageEffectiveFrom: "2026-07-03",
        accountEnabled: false,
        profileStatus: "pending_admin_review",
        requestedEnabled: true,
        remark: "postgres live check",
      },
    ],
    employeeMachineAssignments: [
      {
        id: "EMA-MD-LIVE-001",
        employeeId: "EMP-MD-LIVE-001",
        machineId: "MACH-MD-LIVE-001",
        assignmentType: "default",
        workshop: "1号车间",
        effectiveFrom: "2026-07-03",
        enabled: true,
      },
    ],
    machineCapacityBaselines: [
      {
        id: "MCB-MD-LIVE-001",
        machineId: "MACH-MD-LIVE-001",
        sizeKey: "md-live-30-38-10",
        dailyCapacityQty: 12000,
        hourlyCapacityQty: null,
        sourceKind: "manual_estimate",
        confidence: "low",
        effectiveFrom: "2026-07-03",
        remark: "postgres live check",
      },
    ],
  };
  const targetRecordCount = Object.values(targetRecords).reduce((sum, records) => sum + records.length, 0);
  return {
    executionId: "MDE-MD-LIVE-001",
    planId: "MDP-MD-LIVE-001",
    draftId: "MDI-MD-LIVE-001",
    fileName: "master-data-live.xlsx",
    requestedBy: "管理A",
    requestedAt: "2026-07-03T10:30:00.000Z",
    status: "ready_for_transaction_writer",
    statusLabel: "待事务写入器执行",
    officialWriterKind: "postgres",
    officialImportEnabled: true,
    officialWriteAttempted: false,
    officialWriteScope: "master_data_import_v1",
    transactionStarted: false,
    summary: {
      stagedRowCount: 5,
      writableRowCount: 5,
      failedRowCount: 0,
      targetRecordCount,
      targetTableCount: 16,
    },
    importPayload: {
      targetRecords,
    },
    failedRows: [],
    writeBatches: [],
    blockingReasons: [],
  };
}

function buildLiveMasterDataImportReviewDraft() {
  return {
    draftId: "MDR-MD-LIVE-001",
    status: "ready_for_review_queue",
    statusLabel: "可进入复核",
    fileName: "master-data-review-live.xlsx",
    requestedBy: "办公室A",
    createdAt: "2026-07-03T10:20:00.000Z",
    checkedAt: "2026-07-03T10:20:00.000Z",
    canEnterReviewQueue: true,
    summary: {
      stagedRowCount: 2,
      errorCount: 0,
      warningCount: 0,
    },
  };
}

function buildLiveMasterDataImportConfirmationPlan(reviewDraft) {
  return {
    planId: "MDP-MD-REVIEW-LIVE-001",
    draftId: reviewDraft.draftId,
    status: "ready_for_final_confirmation",
    statusLabel: "待最终确认",
    fileName: reviewDraft.fileName,
    createdBy: "办公室A",
    createdAt: "2026-07-03T10:21:00.000Z",
    summary: {
      stagedRowCount: 2,
      targetRecordCount: 2,
    },
    stagedRows: [{ sheetKey: "customers", rowCount: 1 }],
    targetTables: ["customers", "price_table_items"],
    writeBatches: [],
    officialImportEnabled: false,
    officialWriteScope: "none",
  };
}

function buildLiveMasterDataImportReviewExecution(confirmationPlan) {
  return {
    executionId: "MDE-MD-REVIEW-LIVE-001",
    planId: confirmationPlan.planId,
    draftId: confirmationPlan.draftId,
    status: "committed",
    statusLabel: "已正式导入",
    fileName: confirmationPlan.fileName,
    requestedBy: "管理A",
    requestedAt: "2026-07-03T10:22:00.000Z",
    officialWriterKind: "postgres",
    officialImportEnabled: true,
    officialWriteAttempted: true,
    officialWriteScope: "master_data_import_v1",
    transactionStarted: true,
    summary: {
      stagedRowCount: 2,
      writableRowCount: 2,
      failedRowCount: 0,
      transactionRecordCount: 2,
    },
    importPayload: {
      targetRecords: {},
    },
    failedRows: [],
    blockingReasons: [],
  };
}

function buildLiveMasterDataImportReviewPlanOperationLog(planId) {
  return {
    id: "LOG-MD-LIVE-REVIEW-PLAN-001",
    targetType: "master_data_import_confirmation_plan",
    targetId: planId,
    action: "master_data_import_confirmation_plan_created",
    before: null,
    after: { planId },
    reason: "postgres live master data import review plan",
    operatorId: "U-OFFICE-A",
    pageKey: "master_data",
    occurredAt: "2026-07-03T10:21:00.000Z",
    createdAt: "2026-07-03T10:21:00.000Z",
  };
}

function buildLiveMasterDataImportReviewExecutionOperationLog(executionId) {
  return {
    id: "LOG-MD-LIVE-REVIEW-EXEC-001",
    targetType: "master_data_import_execution",
    targetId: executionId,
    action: "master_data_import_execution_committed",
    before: { status: "ready_for_transaction_writer" },
    after: { executionId, officialWriteScope: "master_data_import_v1" },
    reason: "postgres live master data import review execution",
    operatorId: "U-OFFICE-A",
    pageKey: "master_data",
    occurredAt: "2026-07-03T10:22:00.000Z",
    createdAt: "2026-07-03T10:22:00.000Z",
  };
}

function buildLiveMasterDataImportOperationLog(executionId) {
  return {
    id: "LOG-MD-LIVE-IMPORT-001",
    targetType: "master_data_import_execution",
    targetId: executionId,
    action: "master_data_import_execution_committed",
    before: { status: "ready_for_transaction_writer" },
    after: {
      executionId,
      officialWriteScope: "master_data_import_v1",
    },
    reason: "postgres live master data import",
    operatorId: "U-OFFICE-A",
    pageKey: "master_data",
    occurredAt: "2026-07-03T10:30:00.000Z",
    createdAt: "2026-07-03T10:30:00.000Z",
  };
}

function buildOperationLog({ logId, action = "record_statement_payment", before, after }) {
  const reasonByAction = {
    record_statement_payment: "postgres live payment transaction",
    handle_statement_variance: "未收差额转欠款",
    write_off_statement: "未收差额转欠款",
    mark_statement_sent: "客户发送版对账单已发送",
  };
  return {
    id: logId,
    targetType: "statement",
    targetId: after.id,
    action,
    before,
    after,
    reason: reasonByAction[action] ?? "postgres live statement action",
    operatorId: "U-FINANCE-A",
    pageKey: "api",
    occurredAt: "2026-07-01T10:30:00.000Z",
    createdAt: "2026-07-01T10:30:00.000Z",
  };
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

function stopPostgresContainer() {
  spawnSync("docker", ["rm", "--force", containerName], { encoding: "utf8" });
}

function listen(httpServer) {
  return new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
}

function closeServer(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getJson(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, { headers: options.headers ?? {} });
  const json = await response.json();
  assert.equal(response.status, options.expectedStatus ?? 200, `${route} returned ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

async function postJson(baseUrl, route, body, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, options.expectedStatus ?? 200, `${route} returned ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

async function getBinary(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, { headers: options.headers ?? {} });
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(
    response.status,
    options.expectedStatus ?? 200,
    `${route} returned ${response.status}: ${new TextDecoder().decode(bytes)}`,
  );
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "",
  };
}

function sqlLiteral(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}
