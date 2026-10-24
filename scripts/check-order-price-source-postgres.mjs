import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { buildPriceSourceWorkspace } from "./check-order-confirmation-price-source.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createPostgresOrderDraftRepository } from "../server/orderDraftRepository.mjs";
import { createPostgresOrderConfirmationTransactionRepository } from "../server/orderConfirmationTransactionRepository.mjs";
import { createPostgresBagwinErpIntegrationRepository } from "../server/miniapp/bagwinErpIntegrationRepository.mjs";
import { createBagwinErpIntegrationService } from "../server/miniapp/bagwinErpIntegrationService.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";

const container = `erp-price-source-${process.pid}-${Date.now()}`;
const docker = args => {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
let pool;
try {
  docker(["run", "--rm", "-d", "--name", container, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break;
    if (attempt === 59) throw new Error("Disposable PostgreSQL startup timeout");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
  const databaseUrl = `postgres://erp:erp@127.0.0.1:${port}/erp`;
  pool = new pg.Pool({ connectionString: databaseUrl });
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  await pool.query("INSERT INTO users(id,login_name,display_name) VALUES ('U-PRICE','price.test','合成价格核对'); INSERT INTO customers(id,biz_no,name) VALUES ('C-PRICE','C-PRICE','合成价格核对客户')");
  const workspace = buildPriceSourceWorkspace();
  workspace.fulfillments = (await pool.query("SELECT id FROM fulfillment_records")).rows;
  workspace.orderDraftRepository = createPostgresOrderDraftRepository({ databaseUrl });
  workspace.orderConfirmationTransactionRepository = createPostgresOrderConfirmationTransactionRepository({ databaseUrl });
  const saved = await workspace.orderDraftRepository.saveOrderDraft({ workspace, draft: { ...workspace.orderDrafts[0], createdBy: "U-PRICE" }, expectedRevision: 0, idempotencyKey: "pg-price-source-draft", operationLog: { id: "LOG-PRICE-DRAFT", targetType: "order_draft", targetId: "D-PRICE", action: "save_order_draft", operatorId: "U-PRICE" } });
  const snapshot = async () => (await pool.query("SELECT jsonb_build_object('orders',(SELECT count(*) FROM original_orders),'lines',(SELECT count(*) FROM order_lines),'prices',(SELECT count(*) FROM price_snapshots),'production',(SELECT count(*) FROM production_tasks),'deliveries',(SELECT count(*) FROM fulfillment_records),'audit',(SELECT count(*) FROM operation_logs),'draft',(SELECT to_jsonb(d) FROM order_drafts d WHERE id='D-PRICE')) value")).rows[0].value;
  const service = createApiSharedServiceRegistry().orderDraftCommandService;
  const before = await snapshot();
  const denied = await service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: saved.draft.revision, idempotencyKey: "pg-no-special-price", lines: saved.draft.lines } });
  assert.equal(denied.code, "ORDER_PRICE_SOURCE_REQUIRED");
  assert.deepEqual(await snapshot(), before, "No business write or consumed draft on refusal");
  const known = { ...saved.draft.lines[0], size: "30*38*10", orderType: "stock" };
  const confirmed = await service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: saved.draft.revision, idempotencyKey: "pg-known-price", lines: [known] } });
  assert.ok(confirmed.response, JSON.stringify(confirmed));
  const lineId = confirmed.response.orderLines[0].id;
  assert.equal(Number((await pool.query("SELECT final_amount FROM price_snapshots WHERE order_line_id=$1", [lineId])).rows[0].final_amount), 34);

  // Synthetic persisted status facts: only the first line has a fulfillment.
  // The second line still produces and has not selected its delivery method.
  await pool.query("UPDATE order_lines SET line_status='已交付' WHERE id=$1", [lineId]);
  await pool.query("UPDATE fulfillment_records SET status='已交付' WHERE order_line_id=$1", [lineId]);
  await pool.query("INSERT INTO order_lines SELECT (jsonb_populate_record(NULL::order_lines, to_jsonb(l) || jsonb_build_object('id','OL-PRICE-PENDING','biz_no','OL-PRICE-PENDING','line_status','制袋中','fulfillment_method','待确认'))).* FROM order_lines l WHERE id=$1", [lineId]);
  await pool.query("INSERT INTO order_intake_submissions(id,biz_no,source_channel,external_submission_id,idempotency_scope,idempotency_key,request_hash,customer_id,status,draft_id) VALUES ('INTAKE-PRICE','WT20261024ABCDEF1234','wechat_mini_program','status-synthetic','bagwin:orders','status-synthetic',repeat('a',64),'C-PRICE','confirmed','D-PRICE')");
  const integration = createBagwinErpIntegrationService({ repository: createPostgresBagwinErpIntegrationRepository({ databaseUrl }) });
  const queryStatus = () => integration.getOrderStatus({ sourceOrderNo: "WT20261024ABCDEF1234", erpOrderId: "INTAKE-PRICE" });
  assert.equal((await queryStatus()).status, "production", "Persisted incomplete line cannot become completed from a fulfillment subset");
  await pool.query("UPDATE order_lines SET line_status='已作废' WHERE id='OL-PRICE-PENDING'");
  assert.equal((await queryStatus()).status, "completed", "Cancelled line does not block the completed active line");
  await pool.query("UPDATE fulfillment_records SET status='配送中' WHERE order_line_id=$1", [lineId]);
  assert.equal((await queryStatus()).status, "transporting", "An unfinished delivery still blocks final completion");
  await pool.query("UPDATE order_lines SET line_status='已作废' WHERE id=$1", [lineId]);
  assert.equal((await queryStatus()).status, "cancelled");
  console.log(`PostgreSQL order price/status checks passed: ${migrations.length} migrations; no-price confirmation leaves draft and all business tables unchanged, valid price persists 34, partial delivery/cancellation/active delivery use real repository status facts.`);
} finally {
  await pool?.end();
  await closeSharedPostgresPools();
  spawnSync("docker", ["rm", "--force", container], { encoding: "utf8" });
}
