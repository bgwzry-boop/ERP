import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import {
  loadMigrationFiles,
  validateMigrationSet,
} from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import {
  officePricingWorkspace,
  pricingService,
  permissions,
  makeQuote,
  confirmQuote,
  materialFacts,
} from "./check-office-order-pricing.mjs";
import { createPostgresOrderDraftRepository } from "../server/orderDraftRepository.mjs";
import { createPostgresOrderConfirmationTransactionRepository } from "../server/orderConfirmationTransactionRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
const name = `erp-office-quote-${process.pid}-${Date.now()}`;
const docker = (args) => {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  if (r.status) throw Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
let pool;
try {
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_DB=erp",
    "-e",
    "POSTGRES_USER=erp",
    "-e",
    "POSTGRES_PASSWORD=erp",
    "postgres:16-alpine",
  ]);
  for (let i = 0; i < 60; i++) {
    if (
      spawnSync("docker", [
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "erp",
      ]).status === 0
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const url = `postgres://erp:erp@127.0.0.1:${docker(["port", name, "5432/tcp"]).split(":").at(-1)}/erp`;
  pool = new pg.Pool({ connectionString: url });
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  for (const m of migrations) await pool.query(m.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  await pool.query(
    "INSERT INTO users(id,login_name,display_name) VALUES ('U-PRICE','officequote.test','合成办公室报价');INSERT INTO customers(id,biz_no,name) VALUES ('C-PRICE','C-PRICE','合成报价客户');UPDATE price_table_items SET bag_price=.90 WHERE price_table_id='PT-TEST-PUBLISHED'",
  );
  const workspace = officePricingWorkspace({ print: true });
  workspace.orderDraftRepository = createPostgresOrderDraftRepository({
    databaseUrl: url,
  });
  workspace.orderConfirmationTransactionRepository =
    createPostgresOrderConfirmationTransactionRepository({ databaseUrl: url });
  workspace.coreWorkspaceReadRepository =
    createPostgresCoreWorkspaceReadRepository({ databaseUrl: url });
  async function saveDraft(lines, key) {
    const prior = workspace.orderDrafts[0];
    const id = `D-PRICE-${key}`;
    workspace.currentPricingDraftId = id;
    const saved = await workspace.orderDraftRepository.saveOrderDraft({
      workspace,
      draft: {
        ...prior,
        id,
        bizNo: id,
        draftId: id,
        status: "待审核",
        revision: 0,
        clientRevision: 0,
        recognitionContext: null,
        lines,
        createdBy: "U-PRICE",
      },
      expectedRevision: 0,
      idempotencyKey: `pg-office-quote-save-${key}`,
      operationLog: {
        id: `LOG-PG-OQ-${key}`,
        targetType: "order_draft",
        targetId: id,
        action: "save_order_draft",
        operatorId: "U-PRICE",
      },
    });
    return saved.draft;
  }

  const first = structuredClone(workspace.orderDrafts[0].lines[0]);
  await saveDraft([first], "original");
  const originalQuote = await makeQuote(workspace, {}, "pg-original");
  assert.ok(originalQuote.response, JSON.stringify(originalQuote));
  const original = await confirmQuote(
    workspace,
    originalQuote.response.quote,
    {},
    "pg-original",
  );
  assert.ok(original.response, JSON.stringify(original));
  const oldLine = original.response.orderLines[0].id;
  const oldPrice = (
    await pool.query("SELECT * FROM price_snapshots WHERE order_line_id=$1", [
      oldLine,
    ])
  ).rows[0];
  await saveDraft(
    [{ ...first, id: "D-PG-SUP", draftLineId: "D-PG-SUP" }],
    "supplement",
  );
  const supplementation = {
    orderLineIds: [oldLine],
    targetDraftLineId: "D-PG-SUP",
    confirmedSameBatch: true,
    batchReference: "PG-SYNTHETIC-BATCH",
    reason: "合成未开印补单",
  };
  const sup = await makeQuote(workspace, { supplementation }, "pg-supplement");
  assert.ok(sup.response, JSON.stringify(sup));
  assert.equal(sup.response.quote.affectedOrders[0].revisedPrintPrice, 0.06);
  const counts = async () =>
    (
      await pool.query(
        "SELECT jsonb_build_object('orders',(SELECT count(*) FROM original_orders),'lines',(SELECT count(*) FROM order_lines),'prices',(SELECT count(*) FROM price_snapshots),'changes',(SELECT count(*) FROM order_line_change_records),'draft',(SELECT sum(revision) FROM order_drafts WHERE id LIKE 'D-PRICE-%')) v",
      )
    ).rows[0].v;
  const before = await counts();
  assert.equal(
    (await confirmQuote(workspace, sup.response.quote, {}, "pg-no-ack")).code,
    "ORDER_PRINT_AFFECTED_CONFIRMATION_REQUIRED",
  );
  assert.deepEqual(await counts(), before);
  // A concurrent start invalidates the frozen quote at the actual transaction.
  await pool.query(
    "UPDATE production_tasks SET task_status='丝印中',revision=revision+1 WHERE order_line_id=$1",
    [oldLine],
  );
  await assert.rejects(
    confirmQuote(
      workspace,
      sup.response.quote,
      { confirmedAffectedOrderLineIds: [oldLine] },
      "pg-stale-start",
    ),
    { statusCode: 409 },
  );
  assert.deepEqual(await counts(), before);
  await pool.query(
    "UPDATE production_tasks SET task_status='待排产',revision=revision-1 WHERE order_line_id=$1",
    [oldLine],
  );
  const replayDraft = workspace.orderDrafts.find(
    (d) => d.id === workspace.currentPricingDraftId,
  );
  const replayBody = {
    expectedRevision: replayDraft.revision,
    lines: structuredClone(replayDraft.lines),
    pricingQuoteId: sup.response.quote.quoteId,
    confirmedAffectedOrderLineIds: [oldLine],
    idempotencyKey: "office-pricing-confirm-pg-supplement-ok",
  };
  const confirmed = await confirmQuote(
    workspace,
    sup.response.quote,
    { confirmedAffectedOrderLineIds: [oldLine] },
    "pg-supplement-ok",
  );
  assert.ok(confirmed.response, JSON.stringify(confirmed));
  assert.deepEqual(
    (
      await pool.query("SELECT * FROM price_snapshots WHERE id=$1", [
        oldPrice.id,
      ])
    ).rows[0],
    oldPrice,
    "Original accepted price is immutable",
  );
  const revisions = (
    await pool.query(
      "SELECT * FROM price_snapshots WHERE order_line_id=$1 ORDER BY created_at DESC,version_no DESC",
      [oldLine],
    )
  ).rows;
  assert.equal(revisions.length, 2);
  assert.equal(Number(revisions[0].print_price), 0.06);
  assert.equal(revisions[0].snapshot_type, "print_group_revision");
  assert.equal(
    Number(
      (
        await pool.query("SELECT revision FROM order_lines WHERE id=$1", [
          oldLine,
        ])
      ).rows[0].revision,
    ),
    2,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM order_line_change_records WHERE order_line_id=$1",
        [oldLine],
      )
    ).rows[0].count,
    "1",
  );
  const after = await counts();
  await pricingService.confirmOrderDraft({
    workspace,
    draftId: workspace.currentPricingDraftId,
    operatorId: "U-PRICE",
    actionPermissions: permissions,
    body: replayBody,
  });
  assert.deepEqual(await counts(), after);
  // Formal special-price calculation consumes real, confirmed synthetic material
  // rows, then rechecks their exact batch price again inside confirmation.
  const special = officePricingWorkspace({ special: true });
  await saveDraft(
    special.orderDrafts[0].lines.map((line) => ({
      ...line,
      id: "D-PG-MANUAL",
      draftLineId: "D-PG-MANUAL",
    })),
    "manual",
  );
  const manual = await makeQuote(
    workspace,
    {
      overrides: [
        {
          draftLineId: "D-PG-MANUAL",
          bagPrice: 0.88,
          reason: "合成特殊单授权成交价",
        },
      ],
    },
    "pg-manual",
  );
  assert.ok(manual.response, JSON.stringify(manual));
  assert.ok(
    (
      await confirmQuote(
        workspace,
        manual.response.quote,
        {},
        "pg-manual-confirm",
      )
    ).response,
  );
  const manualSnapshot = (
    await pool.query(
      "SELECT final_amount,override_reason,source_evidence_json FROM price_snapshots WHERE source_evidence_json->>'officeQuoteId'=$1",
      [manual.response.quote.quoteId],
    )
  ).rows[0];
  assert.equal(Number(manualSnapshot.final_amount), 4400);
  assert.equal(manualSnapshot.override_reason, "合成特殊单授权成交价");
  assert.equal(
    manualSnapshot.source_evidence_json.override.operatorId,
    "U-PRICE",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM todos WHERE ref_id=$1 AND type='本单改价待查看'",
        [workspace.currentPricingDraftId],
      )
    ).rows[0].count,
    "1",
  );
  materialFacts(special);
  for (const inbound of special.rawMaterialInbounds)
    await pool.query(
      "INSERT INTO raw_material_inbounds(id,supplier_name,status,payload_json,updated_at) VALUES($1,$2,'已入库',$3::jsonb,$4)",
      [
        inbound.id,
        inbound.supplierName,
        JSON.stringify(inbound),
        inbound.updatedAt,
      ],
    );
  await saveDraft(
    special.orderDrafts[0].lines.map((l) => ({
      ...l,
      id: "D-PG-SPECIAL",
      draftLineId: "D-PG-SPECIAL",
    })),
    "special",
  );
  const sq = await makeQuote(workspace, {}, "pg-special");
  assert.ok(sq.response, JSON.stringify(sq));
  const sb = await counts();
  await pool.query(
    "UPDATE raw_material_inbounds SET payload_json=jsonb_set(payload_json,'{rolls,0,unitPrice}','10'::jsonb) WHERE id='RM-Q-BODY'",
  );
  await assert.rejects(
    confirmQuote(workspace, sq.response.quote, {}, "pg-special-stale"),
    { statusCode: 409 },
  );
  assert.deepEqual(await counts(), sb);
  await pool.query(
    "UPDATE raw_material_inbounds SET payload_json=jsonb_set(payload_json,'{rolls,0,unitPrice}','9.2'::jsonb) WHERE id='RM-Q-BODY'",
  );
  assert.ok(
    (await confirmQuote(workspace, sq.response.quote, {}, "pg-special-ok"))
      .response,
  );
  console.log(
    "Office pricing PostgreSQL: persisted server quote, immutable original + atomic cross-order pricing revision/audit, affected acknowledgements, concurrent printing start, exact material-source conflict/rollback and successful special confirmation passed.",
  );
} finally {
  if (pool) await pool.end();
  await closeSharedPostgresPools();
  spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
}
