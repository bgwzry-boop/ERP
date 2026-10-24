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
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";

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
  await pool.query("UPDATE price_tables SET status='pending_review' WHERE id='PT-TEST-PUBLISHED'; INSERT INTO price_tables(id,biz_no,name,version_no,status,effective_from) VALUES ('PT-PRICE-CURRENT','PRICE-CURRENT','合成当前发布价',9,'active','2020-01-01'); INSERT INTO price_table_items(id,price_table_id,size_key,handle_type,style_key,bag_price,print_price,other_fee,enabled) VALUES ('PI-PRICE-CURRENT','PT-PRICE-CURRENT','30*37*10','普通提','空白袋',0.90,0,0,true)");
  const workspace = buildPriceSourceWorkspace();
  workspace.coreWorkspaceReadRepository = createPostgresCoreWorkspaceReadRepository({ databaseUrl });
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
  let confirmedInput;
  const confirmOrder = workspace.orderConfirmationTransactionRepository.confirmOrder.bind(workspace.orderConfirmationTransactionRepository);
  workspace.orderConfirmationTransactionRepository.confirmOrder = input => { confirmedInput = input; return confirmOrder(input); };
  const confirmKnown = key => service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: saved.draft.revision, idempotencyKey: key, lines: [known] } });
  const coreRead = workspace.coreWorkspaceReadRepository;
  workspace.coreWorkspaceReadRepository = { kind: "postgres", async loadState() { return {}; } };
  assert.equal((await confirmKnown("pg-broken-price-read")).code, "ORDER_PRICE_SOURCE_REQUIRED");
  assert.deepEqual(await snapshot(), before, "A damaged live-read contract cannot use workspace price caches");
  workspace.coreWorkspaceReadRepository = coreRead;
  await pool.query("UPDATE price_tables SET status='pending_review' WHERE id='PT-PRICE-CURRENT'");
  assert.equal((await confirmKnown("pg-no-publication")).code, "ORDER_PRICE_SOURCE_REQUIRED");
  assert.deepEqual(await snapshot(), before, "No published table cannot fall back to static 34");
  await pool.query("UPDATE price_tables SET status='active' WHERE id='PT-PRICE-CURRENT'");
  workspace.orderConfirmationTransactionRepository.confirmOrder = async input => {
    await pool.query("UPDATE price_table_items SET bag_price=0.95 WHERE id='PI-PRICE-CURRENT'");
    return confirmOrder(input);
  };
  await assert.rejects(confirmKnown("pg-source-changed"), { code: "BUSINESS_WRITE_CONFLICT", statusCode: 409 });
  assert.deepEqual(await snapshot(), before, "A changed publication rolls back all business writes and keeps the same draft revision");
  await pool.query("UPDATE price_table_items SET bag_price=0.90 WHERE id='PI-PRICE-CURRENT'");
  workspace.orderConfirmationTransactionRepository.confirmOrder = input => { confirmedInput = input; return confirmOrder(input); };
  const confirmed = await confirmKnown("pg-known-price");
  assert.ok(confirmed.response, JSON.stringify(confirmed));
  const lineId = confirmed.response.orderLines[0].id;
  const persistedPrice = (await pool.query("SELECT bag_price,final_amount,source_evidence_json FROM price_snapshots WHERE order_line_id=$1", [lineId])).rows[0];
  assert.equal(Number(persistedPrice.bag_price), 0.9);
  assert.equal(Number(persistedPrice.final_amount), 90);
  assert.equal(persistedPrice.source_evidence_json.priceVersion, "PRICE-CURRENT-v9");
  const beforeUnjustifiedZero = await snapshot();
  await assert.rejects(confirmOrder({ ...confirmedInput, idempotencyKey: "pg-unjustified-zero", priceSnapshots: confirmedInput.priceSnapshots.map(row => ({ ...row, finalAmount: 0, amount: 0 })) }), { code: "ORDER_PRICE_SOURCE_REQUIRED" });
  assert.deepEqual(await snapshot(), beforeUnjustifiedZero, "A formally positive price cannot become unexplained zero accounting");

  // Synthetic persisted status facts: only the first line has a fulfillment.
  // The second line still produces and has not selected its delivery method.
  await pool.query("UPDATE order_lines SET line_status='已交付' WHERE id=$1", [lineId]);
  await pool.query("UPDATE fulfillment_records SET status='已交付' WHERE order_line_id=$1", [lineId]);
  await pool.query("UPDATE production_tasks SET task_status='已完成' WHERE order_line_id=$1", [lineId]);
  await pool.query("INSERT INTO order_lines SELECT (jsonb_populate_record(NULL::order_lines, to_jsonb(l) || jsonb_build_object('id','OL-PRICE-PENDING','biz_no','OL-PRICE-PENDING','line_status','制袋中','fulfillment_method','待确认'))).* FROM order_lines l WHERE id=$1", [lineId]);
  await pool.query("INSERT INTO order_intake_submissions(id,biz_no,source_channel,external_submission_id,idempotency_scope,idempotency_key,request_hash,customer_id,status,draft_id) VALUES ('INTAKE-PRICE','WT20261024ABCDEF1234','wechat_mini_program','status-synthetic','bagwin:orders','status-synthetic',repeat('a',64),'C-PRICE','confirmed','D-PRICE')");
  const integration = createBagwinErpIntegrationService({ repository: createPostgresBagwinErpIntegrationRepository({ databaseUrl }) });
  const queryStatus = () => integration.getOrderStatus({ sourceOrderNo: "WT20261024ABCDEF1234", erpOrderId: "INTAKE-PRICE" });
  assert.equal((await queryStatus()).status, "production", "Persisted incomplete line cannot become completed from a fulfillment subset");
  await pool.query("UPDATE order_lines SET line_status='已作废' WHERE id='OL-PRICE-PENDING'");
  assert.equal((await queryStatus()).status, "completed", "Cancelled line does not block the completed active line");
  await pool.query("UPDATE production_tasks SET task_status='制袋中' WHERE order_line_id=$1", [lineId]);
  assert.equal((await queryStatus()).status, "production", "An explicit unfinished production fact blocks completion despite delivered lines");
  await pool.query("UPDATE production_tasks SET task_status='已完成' WHERE order_line_id=$1", [lineId]);
  await pool.query("UPDATE fulfillment_records SET status='配送中' WHERE order_line_id=$1", [lineId]);
  assert.equal((await queryStatus()).status, "transporting", "An unfinished delivery still blocks final completion");
  await pool.query("UPDATE order_lines SET line_status='已作废' WHERE id=$1", [lineId]);
  assert.equal((await queryStatus()).status, "cancelled");
  const splitLine = { ...known, id: "D-PRICE-SPLIT-01", draftLineId: "D-PRICE-SPLIT-01" };
  const splitDraft = { ...buildPriceSourceWorkspace().orderDrafts[0], id: "D-PRICE-SPLIT", draftId: "D-PRICE-SPLIT", customerId: "C-PRICE", createdBy: "U-PRICE", lines: [splitLine,
    { ...splitLine, id: "D-PRICE-SPLIT-02", draftLineId: "D-PRICE-SPLIT-02", qty: 200, latest: "2026-11-02", latestNeededAt: "2026-11-02" }] };
  const splitSaved = await workspace.orderDraftRepository.saveOrderDraft({ workspace, draft: splitDraft, expectedRevision: 0, idempotencyKey: "pg-price-split-save", operationLog: { id: "LOG-PRICE-SPLIT", targetType: "order_draft", targetId: splitDraft.id, action: "save_order_draft", operatorId: "U-PRICE" } });
  const splitBody = { expectedRevision: splitSaved.draft.revision, lines: splitSaved.draft.lines };
  const preview = await service.previewOrderDraftSplit({ workspace, draftId: splitDraft.id, body: splitBody });
  assert.equal(preview.response.splitPlan.groups.length, 2);
  const splitConfirmed = await service.confirmSplitOrderDraft({ workspace, draftId: splitDraft.id, operatorId: "U-PRICE", body: { ...splitBody, splitPlanHash: preview.response.splitPlan.planHash, idempotencyKey: "pg-price-split-confirm" } });
  assert.deepEqual(splitConfirmed.response.priceSnapshots.map(row => row.finalAmount).sort((a,b) => a-b), [90,180]);
  const splitAmounts = (await pool.query("SELECT p.final_amount FROM price_snapshots p JOIN order_lines l ON l.id=p.order_line_id JOIN original_orders o ON o.id=l.order_id WHERE o.source_draft_id=$1 ORDER BY p.final_amount", [splitDraft.id])).rows.map(row => Number(row.final_amount));
  assert.deepEqual(splitAmounts, [90,180], "Split prices persist from the same authoritative publication");
  const saveFreshDraft = async (draftId, changes = {}) => {
    const line = { ...known, ...changes, id: `${draftId}-01`, draftLineId: `${draftId}-01` };
    const draft = { ...buildPriceSourceWorkspace().orderDrafts[0], id: draftId, draftId, createdBy: "U-PRICE", lines: [line] };
    const saved = await workspace.orderDraftRepository.saveOrderDraft({ workspace, draft, expectedRevision: 0, idempotencyKey: `${draftId}-save`, operationLog: { id: `LOG-${draftId}`, targetType: "order_draft", targetId: draftId, action: "save_order_draft", operatorId: "U-PRICE" } });
    return { draftId, saved };
  };
  const confirmFresh = ({ draftId, saved }, key = draftId) => service.confirmOrderDraft({ workspace, draftId, operatorId: "U-PRICE", body: { expectedRevision: saved.draft.revision, lines: saved.draft.lines, idempotencyKey: key } });
  await pool.query("UPDATE price_table_items SET bag_price=0.1234 WHERE id='PI-PRICE-CURRENT'");
  const preciseDraft = await saveFreshDraft("D-PRICE-PRECISE");
  const precise = await confirmFresh(preciseDraft);
  assert.equal(precise.response.priceSnapshots[0].bagPrice, 0.1234);
  assert.equal(precise.response.priceSnapshots[0].finalAmount, 12.34);
  const preciseStored = (await pool.query("SELECT bag_price,final_amount FROM price_snapshots WHERE order_line_id=$1", [precise.response.orderLines[0].id])).rows[0];
  assert.equal(Number(preciseStored.bag_price), 0.1234);
  assert.equal(Number(preciseStored.final_amount), 12.34, "PG cannot persist the prematurely rounded 12 instead of 12.34");
  await pool.query("INSERT INTO price_table_items(id,price_table_id,size_key,handle_type,style_key,bag_price,enabled) VALUES ('PI-LAM-PLAIN','PT-PRICE-CURRENT','30*37*10','普通提','覆膜袋',0.9,true),('PI-LAM-METALLIC','PT-PRICE-CURRENT','30*37*10','普通提','覆膜金银',1.2,false)");
  const metallicDraft = await saveFreshDraft("D-PRICE-METALLIC", { style: "覆膜金银", product: "覆膜金银袋", productName: "覆膜金银袋" });
  const beforeMissingMetallic = await snapshot();
  assert.equal((await confirmFresh(metallicDraft, "pg-missing-metallic")).code, "ORDER_PRICE_SOURCE_REQUIRED");
  assert.deepEqual(await snapshot(), beforeMissingMetallic, "Plain laminated prices never substitute for missing metallic prices");
  await pool.query("UPDATE price_table_items SET enabled=true WHERE id='PI-LAM-METALLIC'");
  const metallic = await confirmFresh(metallicDraft);
  assert.equal(metallic.response.priceSnapshots[0].finalAmount, 120);
  assert.equal(Number((await pool.query("SELECT final_amount FROM price_snapshots WHERE order_line_id=$1", [metallic.response.orderLines[0].id])).rows[0].final_amount), 120);
  await pool.query("UPDATE price_table_items SET enabled=false WHERE id='PI-LAM-METALLIC'; INSERT INTO price_table_items(id,price_table_id,size_key,handle_type,style_key,bag_price,enabled) VALUES ('PI-LAM-BLANK-STYLE','PT-PRICE-CURRENT','30*37*10','普通提','',0.9,true)");
  for (const [index, handle] of ["普通提", "加长提"].entries()) {
    const blankStyleDraft = await saveFreshDraft(`D-PRICE-METALLIC-BLANK-${index}`, { style: "覆膜金银", product: "覆膜金银袋", productName: "覆膜金银袋", handle, handleType: handle });
    const before = await snapshot();
    const beforeDraft = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId: blankStyleDraft.draftId });
    assert.equal((await confirmFresh(blankStyleDraft)).code, "ORDER_PRICE_SOURCE_REQUIRED", `${handle}: a blank style cannot substitute for a metallic price`);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId: blankStyleDraft.draftId }), beforeDraft);
  }
  console.log(`PostgreSQL order price/status checks passed: ${migrations.length} migrations; no-price confirmation leaves draft and all business tables unchanged, published 0.90 persists 90, split 90/180, precise 0.1234 persists 12.34, metallic 1.20 persists 120; missing/changed publication fails closed with no writes, partial delivery/cancellation/active delivery use real repository status facts.`);
} finally {
  await pool?.end();
  await closeSharedPostgresPools();
  spawnSync("docker", ["rm", "--force", container], { encoding: "utf8" });
}
