import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  buildListReviewsPayloadQuery,
  buildListReviewsPayloadSql,
  createLocalRawMaterialSupplierStatementReviewRepository,
  createPostgresRawMaterialSupplierStatementReviewRepository,
} from "../server/rawMaterialSupplierStatementReviewRepository.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "raw-material-supplier-statement-review-api");
const repositoryStorageRoot = join(checkStorageRoot, "repository");
const apiStorageRoot = join(checkStorageRoot, "api");
rmSync(checkStorageRoot, { recursive: true, force: true });

await checkRepository();
await checkPostgresRepositoryBoundary();
await checkApi();

console.log("raw-material supplier statement review API check passed");

async function checkRepository() {
  const repository = createLocalRawMaterialSupplierStatementReviewRepository({ storageRoot: repositoryStorageRoot });
  const workspace = repository.loadState();
  const created = repository.createReviewDraft({
    workspace,
    statementResult: buildStatementResult({ fileName: "baihou-2026-07.xlsx" }),
    supplierName: "白侯无纺布",
    fileName: "baihou-2026-07.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-07-04T03:00:00.000Z",
  });

  assert.match(created.review.reviewId, /^RMSR-20260704-/, "review draft should have a raw-material statement review id");
  assert.equal(created.review.reviewStatus, "draft");
  assert.equal(created.review.status, "待人工复核", "candidate rows should require manual review");
  assert.equal(created.review.inventoryEffect, "none", "review draft must not affect inventory");
  assert.equal(created.review.payableEffect, "none", "review draft must not create payable");
  assert.equal(created.review.paymentEffect, "none", "review draft must not confirm payment");
  assert.equal(created.review.rows[0].matchedInboundId, "RMI-0704-002");

  const listed = repository.listReviews({ workspace, query: { keyword: "白侯" } });
  assert.equal(listed.total, 1, "repository should list saved review drafts");
  assert.equal(listed.metrics.draftCount, 1, "repository metrics should count draft reviews");

  const confirmed = repository.confirmReview({
    workspace,
    reviewId: created.review.reviewId,
    decision: "有差异",
    note: "纸管扣项待供应商确认",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-07-04T03:10:00.000Z",
  });
  assert.equal(confirmed.review.reviewStatus, "reviewed");
  assert.equal(confirmed.review.status, "已人工复核/有差异");
  assert.equal(confirmed.review.payableEffect, "none", "confirmed review still must not create payable");
  assert.throws(
    () =>
      repository.confirmStatement({
        workspace,
        reviewId: created.review.reviewId,
        note: "有差异草稿不能确认对账",
        operatorId: "U-OFFICE-A",
        operatorName: "办公室A",
        now: "2026-07-04T03:11:00.000Z",
      }),
    /must be reviewed as consistent/,
    "statement confirmation should require a consistent manual review",
  );

  const consistentDraft = repository.createReviewDraft({
    workspace,
    statementResult: buildStatementResult({ fileName: "baihou-consistent-2026-07.xlsx" }),
    supplierName: "白侯无纺布",
    fileName: "baihou-consistent-2026-07.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-07-04T03:12:00.000Z",
  });
  repository.confirmReview({
    workspace,
    reviewId: consistentDraft.review.reviewId,
    decision: "一致",
    note: "明细、纸管扣项已人工核对一致",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-07-04T03:13:00.000Z",
  });
  const statementConfirmed = repository.confirmStatement({
    workspace,
    reviewId: consistentDraft.review.reviewId,
    note: "确认进入待付款，财务另行处理付款",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-07-04T03:14:00.000Z",
  });
  assert.match(statementConfirmed.review.statementConfirmationId, /^RMSRC-20260704-/, "statement confirmation should get an id");
  assert.equal(statementConfirmed.review.reviewStatus, "statement_confirmed");
  assert.equal(statementConfirmed.review.status, "已确认对账/待付款");
  assert.equal(statementConfirmed.review.paymentStatus, "待财务付款确认");
  assert.equal(statementConfirmed.review.inventoryEffect, "none", "statement confirmation must not affect inventory");
  assert.equal(statementConfirmed.review.payableEffect, "none", "statement confirmation must not create payable records");
  assert.equal(statementConfirmed.review.paymentEffect, "none", "statement confirmation must not confirm payment");

  const payableDraft = repository.generatePayableDraft({
    workspace,
    reviewId: consistentDraft.review.reviewId,
    note: "财务生成应付草稿，仍待付款确认",
    operatorId: "U-FINANCE-A",
    operatorName: "财务A",
    now: "2026-07-04T03:15:00.000Z",
  });
  assert.match(payableDraft.review.supplierPayableId, /^RMSP-20260704-/, "payable draft should get an id");
  assert.equal(payableDraft.review.status, "已生成应付/待付款确认");
  assert.equal(payableDraft.review.payableStatus, "待财务复核");
  assert.equal(payableDraft.review.supplierPayableDraft.payableAmount, 1816.14, "payable draft should include current adjustments");
  assert.equal(payableDraft.review.supplierPayableDraft.lineSubtotal, 1826.64);
  assert.equal(payableDraft.review.supplierPayableDraft.currentAdjustmentSubtotal, -10.5);
  assert.equal(payableDraft.review.supplierPayableDraft.currentAdjustments.length, 1);
  assert.equal(payableDraft.review.supplierPayableDraft.currentAdjustments[0].adjustmentType, "paper_tube_deduction");
  assert.equal(payableDraft.review.supplierPayableDraft.currentAdjustments[0].calculationBasis.unitRate, 3.5);
  assert.equal(payableDraft.review.supplierPayableDraft.referenceAdjustments.length, 1);
  assert.equal(payableDraft.review.supplierPayableDraft.referenceAdjustments[0].adjustmentType, "reference_balance");
  assert.equal(payableDraft.review.inventoryEffect, "none", "payable draft generation must not affect inventory");
  assert.equal(payableDraft.review.payableEffect, "supplier_payable_draft_created");
  assert.equal(payableDraft.review.paymentEffect, "none", "payable draft generation must not confirm payment");
  assert.throws(
    () =>
      repository.generatePayableDraft({
        workspace,
        reviewId: consistentDraft.review.reviewId,
        note: "重复生成应付应阻断",
        operatorId: "U-FINANCE-A",
        operatorName: "财务A",
        now: "2026-07-04T03:16:00.000Z",
      }),
    /already generated/,
    "payable draft should not be generated twice",
  );
  assert.throws(
    () =>
      repository.confirmPayment({
        workspace,
        reviewId: consistentDraft.review.reviewId,
        paidAmount: 1800,
        paymentMethod: "银行转账",
        note: "付款金额不一致应阻断",
        operatorId: "U-FINANCE-A",
        operatorName: "财务A",
        now: "2026-07-04T03:16:30.000Z",
      }),
    /must equal payable draft amount/,
    "supplier payment should require paid amount to match payable draft in v1",
  );

  const paymentConfirmed = repository.confirmPayment({
    workspace,
    reviewId: consistentDraft.review.reviewId,
    paidAmount: 1816.14,
    paymentMethod: "银行转账",
    paymentReferenceNo: "BANK-20260704-001",
    note: "财务确认供应商应付草稿已实际付款",
    operatorId: "U-FINANCE-A",
    operatorName: "财务A",
    now: "2026-07-04T03:17:00.000Z",
  });
  assert.match(paymentConfirmed.review.supplierPaymentConfirmationId, /^RMSPAY-20260704-/, "payment confirmation should get an id");
  assert.equal(paymentConfirmed.review.status, "已确认付款/已完成");
  assert.equal(paymentConfirmed.review.paymentStatus, "已确认付款");
  assert.equal(paymentConfirmed.review.payableStatus, "已付款");
  assert.equal(paymentConfirmed.review.supplierPaymentRecord.paidAmount, 1816.14);
  assert.equal(paymentConfirmed.review.supplierPaymentRecord.paymentMethod, "银行转账");
  assert.equal(paymentConfirmed.review.inventoryEffect, "none", "payment confirmation must not affect inventory");
  assert.equal(paymentConfirmed.review.payableEffect, "supplier_payable_paid");
  assert.equal(paymentConfirmed.review.paymentEffect, "supplier_payment_confirmed");
  assert.throws(
    () =>
      repository.confirmPayment({
        workspace,
        reviewId: consistentDraft.review.reviewId,
        paidAmount: 1816.14,
        note: "重复确认付款应阻断",
        operatorId: "U-FINANCE-A",
        operatorName: "财务A",
        now: "2026-07-04T03:18:00.000Z",
      }),
    /already confirmed/,
    "supplier payment should not be confirmed twice",
  );

  const reloaded = createLocalRawMaterialSupplierStatementReviewRepository({ storageRoot: repositoryStorageRoot }).loadState();
  assert.equal(reloaded.rawMaterialSupplierStatementReviews[0].status, "已确认付款/已完成", "payment confirmation should persist");
  assert.match(reloaded.rawMaterialSupplierStatementReviews[0].supplierPayableId, /^RMSP-/, "payable draft id should persist");
  assert.match(
    reloaded.rawMaterialSupplierStatementReviews[0].supplierPaymentConfirmationId,
    /^RMSPAY-/,
    "payment confirmation id should persist",
  );
}

async function checkPostgresRepositoryBoundary() {
  const calls = [];
  const repository = createPostgresRawMaterialSupplierStatementReviewRepository({
    queryJson(text, values) {
      const valuesText = values.map((value) => String(value)).join("\n");
      calls.push({ text, values, valuesText });
      if (text.includes("json_build_object")) {
        return {
        review: {
          ...buildSavedReview(),
          reviewId: "RMSR-PG-001",
          status: valuesText.includes("supplier_payment_confirmed")
            ? "已确认付款/已完成"
            : valuesText.includes("已生成应付")
              ? "已生成应付/待付款确认"
              : valuesText.includes("已确认对账")
                ? "已确认对账/待付款"
                : valuesText.includes("已人工复核")
                  ? "已人工复核/一致"
                  : "待人工复核",
          reviewStatus: valuesText.includes("statement_confirmed") || valuesText.includes("supplier_payable_draft") || valuesText.includes("supplier_payment_confirmed")
            ? "statement_confirmed"
            : valuesText.includes("reviewed")
              ? "reviewed"
              : "draft",
          statementStatus: valuesText.includes("statement_confirmed") || valuesText.includes("supplier_payable_draft") || valuesText.includes("supplier_payment_confirmed") ? "已确认对账" : "",
          statementConfirmationId: valuesText.includes("statement_confirmed") || valuesText.includes("supplier_payable_draft") || valuesText.includes("supplier_payment_confirmed") ? "RMSRC-PG-001" : "",
          supplierPayableId: valuesText.includes("supplier_payable_draft") || valuesText.includes("supplier_payment_confirmed") ? "RMSP-PG-001" : "",
          payableStatus: valuesText.includes("supplier_payment_confirmed") ? "已付款" : valuesText.includes("supplier_payable_draft") ? "待财务复核" : "",
          paymentStatus: valuesText.includes("supplier_payment_confirmed") ? "已确认付款" : valuesText.includes("supplier_payable_draft") ? "待财务付款确认" : "",
          supplierPayableDraft: valuesText.includes("supplier_payable_draft") || valuesText.includes("supplier_payment_confirmed")
            ? { supplierPayableId: "RMSP-PG-001", payableAmount: 1816.14, status: "待财务复核" }
            : null,
          supplierPaymentConfirmationId: valuesText.includes("supplier_payment_confirmed") ? "RMSPAY-PG-001" : "",
          supplierPaymentRecord: valuesText.includes("supplier_payment_confirmed")
            ? { supplierPaymentConfirmationId: "RMSPAY-PG-001", supplierPayableId: "RMSP-PG-001", paidAmount: 1816.14, status: "已确认付款" }
            : null,
        },
        operationLogId: "RMSR-LOG-PG-001",
      };
      }
      return [buildSavedReview()];
    },
  });

  const state = await repository.loadState();
  assert.equal(state.rawMaterialSupplierStatementReviews[0].reviewId, "RMSR-LOCAL-001");
  assert.match(calls[0].text, /FROM raw_material_supplier_statement_reviews/, "postgres load should query review table");

  const filteredSql = buildListReviewsPayloadSql({
    query: { keyword: "O'Brien", supplierName: "白侯无纺布", status: "待人工复核", reviewStatus: "draft" },
  });
  assert.match(filteredSql, /payload_json::text ILIKE \$4::text/, "postgres list SQL should bind keyword");
  assert.match(filteredSql, /supplier_name = \$3::text/, "postgres list SQL should bind supplier");
  assert.ok(!filteredSql.includes("O'Brien"));
  assert.deepEqual(buildListReviewsPayloadQuery({
    query: { keyword: "O'Brien", supplierName: "白侯无纺布", status: "待人工复核", reviewStatus: "draft" },
  }).values, ["待人工复核", "draft", "白侯无纺布", "%O'Brien%"]);

  const workspace = { rawMaterialSupplierStatementReviews: [] };
  const created = await repository.createReviewDraft({
    workspace,
    statementResult: buildStatementResult({ fileName: "pg.xlsx" }),
    supplierName: "白侯无纺布",
    fileName: "pg.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-07-04T03:00:00.000Z",
  });
  const transactionSql = calls.find((call) => call.text.includes("INSERT INTO raw_material_supplier_statement_reviews"));
  assert.equal(created.review.reviewId, "RMSR-PG-001");
  assert.match(transactionSql.text, /INSERT INTO raw_material_supplier_statement_reviews/, "postgres create should upsert review payload");
  assert.match(transactionSql.text, /INSERT INTO operation_logs/, "postgres create should write operation log");
  assert.ok(!transactionSql.text.includes("白侯无纺布"));
  assert.doesNotMatch(transactionSql.text, /inventory_ledger_entries|payment_records|supplier_payables|statements\s+SET/, "review draft must not write inventory or payment tables");

  workspace.rawMaterialSupplierStatementReviews = [
    {
      ...created.review,
      status: "已人工复核/一致",
      reviewStatus: "reviewed",
    },
  ];
  const statementConfirmed = await repository.confirmStatement({
    workspace,
    reviewId: created.review.reviewId,
    note: "确认对账，待财务付款确认",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-07-04T03:20:00.000Z",
  });
  const confirmStatementSql = calls.find((call) => call.valuesText.includes("confirm_raw_material_supplier_statement"));
  assert.equal(statementConfirmed.review.reviewStatus, "statement_confirmed");
  assert.match(confirmStatementSql.valuesText, /已确认对账\/待付款/, "postgres confirmation should persist statement-confirmed status");
  assert.match(confirmStatementSql.valuesText, /待财务付款确认/, "postgres confirmation should persist pending payment status");
  assert.doesNotMatch(
    confirmStatementSql.text,
    /inventory_ledger_entries|payment_records|supplier_payables|raw_material_inventory|statements\s+SET/,
    "statement confirmation must not write inventory, payable, payment, or statement ledger tables",
  );

  const payableDraft = await repository.generatePayableDraft({
    workspace,
    reviewId: created.review.reviewId,
    note: "财务生成应付草稿",
    operatorId: "U-FINANCE-A",
    operatorName: "财务A",
    now: "2026-07-04T03:21:00.000Z",
  });
  const payableDraftSql = calls.find((call) => call.valuesText.includes("generate_raw_material_supplier_payable_draft"));
  assert.equal(payableDraft.review.supplierPayableId, "RMSP-PG-001");
  assert.match(payableDraftSql.valuesText, /supplier_payable_draft_created/, "postgres payable draft should persist payable effect");
  assert.match(payableDraftSql.valuesText, /待财务复核/, "postgres payable draft should persist finance review status");
  assert.doesNotMatch(
    payableDraftSql.text,
    /inventory_ledger_entries|payment_records|raw_material_inventory|statements\s+SET/,
    "payable draft generation must not write inventory, payment, or customer statement tables",
  );

  const paymentConfirmed = await repository.confirmPayment({
    workspace,
    reviewId: created.review.reviewId,
    paidAmount: 1816.14,
    paymentMethod: "银行转账",
    note: "财务确认供应商付款",
    operatorId: "U-FINANCE-A",
    operatorName: "财务A",
    now: "2026-07-04T03:22:00.000Z",
  });
  const paymentSql = calls.find((call) => call.valuesText.includes("confirm_raw_material_supplier_payment"));
  assert.equal(paymentConfirmed.review.supplierPaymentConfirmationId, "RMSPAY-PG-001");
  assert.match(paymentSql.valuesText, /supplier_payment_confirmed/, "postgres payment confirmation should persist payment effect");
  assert.match(paymentSql.valuesText, /supplier_payable_paid/, "postgres payment confirmation should persist paid payable effect");
  assert.doesNotMatch(
    paymentSql.text,
    /inventory_ledger_entries|raw_material_inventory|customer_payments|statements\s+SET/,
    "payment confirmation must not write inventory or customer statement tables",
  );
}

async function checkApi() {
  const server = createApiServer({
    rawMaterialSupplierStatementReviewRepositoryOptions: { storageRoot: apiStorageRoot },
  });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const health = await getJson(`${baseUrl}/health`);
    assert.equal(
      health.seed?.rawMaterialSupplierStatementReviewRepository,
      "local_json",
      "health should expose supplier statement review repository kind",
    );

    const emptyList = await getJson(`${baseUrl}/raw-material-supplier-statement-reviews?pageSize=10`);
    assert.equal(emptyList.total, 0, "API list should start empty");

    const denied = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews`, {
      userId: "U-WAREHOUSE-A",
      body: { statementResult: buildStatementResult({ fileName: "denied.xlsx" }) },
    });
    assert.equal(denied.status, 403, "warehouse user should not save supplier statement review drafts");
    assert.equal(denied.json.requiredPermission, "raw_material.inbound.review");

    const created = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews`, {
      userId: "U-OFFICE-A",
      body: {
        supplierName: "白侯无纺布",
        fileName: "api-baihou.xlsx",
        statementResult: buildStatementResult({ fileName: "api-baihou.xlsx" }),
      },
    });
    assert.equal(created.status, 200, "office user should save supplier statement review draft");
    assert.equal(created.json.review.reviewStatus, "draft");
    assert.equal(created.json.review.payableEffect, "none");
    const reviewId = created.json.review.reviewId;

    const confirmed = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/confirm-review`, {
      userId: "U-OFFICE-A",
      body: { decision: "一致", note: "月结行已人工核对" },
    });
    assert.equal(confirmed.status, 200, "office user should confirm review draft");
    assert.equal(confirmed.json.review.status, "已人工复核/一致");
    assert.equal(confirmed.json.review.paymentEffect, "none", "confirmed review should still not confirm payment");

    const statementConfirmed = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/confirm-statement`, {
      userId: "U-OFFICE-A",
      body: { note: "确认对账一致，财务付款另行确认" },
    });
    assert.equal(statementConfirmed.status, 200, "office user should confirm consistent supplier statement");
    assert.match(statementConfirmed.json.review.statementConfirmationId, /^RMSRC-/, "API should return statement confirmation id");
    assert.equal(statementConfirmed.json.review.reviewStatus, "statement_confirmed");
    assert.equal(statementConfirmed.json.review.status, "已确认对账/待付款");
    assert.equal(statementConfirmed.json.review.paymentStatus, "待财务付款确认");
    assert.equal(statementConfirmed.json.review.paymentEffect, "none", "statement confirmation should not confirm payment");

    const duplicateStatementConfirmation = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/confirm-statement`, {
      userId: "U-OFFICE-A",
      body: { note: "重复确认应阻断" },
    });
    assert.equal(duplicateStatementConfirmation.status, 409, "confirmed statement should not be confirmed twice");

    const officePayableDenied = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/generate-payable`, {
      userId: "U-OFFICE-A",
      body: { note: "办公室不能生成应付" },
    });
    assert.equal(officePayableDenied.status, 403, "office user should not generate supplier payable draft");
    assert.equal(officePayableDenied.json.requiredPermission, "raw_material.supplier_payable.create");

    const payableDraft = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/generate-payable`, {
      userId: "U-FINANCE-A",
      body: { note: "财务生成应付草稿，付款另行确认" },
    });
    assert.equal(payableDraft.status, 200, "finance user should generate supplier payable draft");
    assert.match(payableDraft.json.review.supplierPayableId, /^RMSP-/, "API should return supplier payable draft id");
    assert.equal(payableDraft.json.review.status, "已生成应付/待付款确认");
    assert.equal(payableDraft.json.review.payableStatus, "待财务复核");
    assert.equal(payableDraft.json.review.supplierPayableDraft.payableAmount, 1816.14);
    assert.equal(payableDraft.json.review.paymentEffect, "none", "payable draft should not confirm payment");

    const duplicatePayableDraft = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/generate-payable`, {
      userId: "U-FINANCE-A",
      body: { note: "重复生成应付应阻断" },
    });
    assert.equal(duplicatePayableDraft.status, 409, "supplier payable draft should not be generated twice");

    const officePaymentDenied = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
      userId: "U-OFFICE-A",
      body: { paidAmount: 1816.14, note: "办公室不能确认供应商付款" },
    });
    assert.equal(officePaymentDenied.status, 403, "office user should not confirm supplier payment");
    assert.equal(officePaymentDenied.json.requiredPermission, "raw_material.supplier_payment.confirm");

    const wrongPaymentAmount = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
      userId: "U-FINANCE-A",
      body: { paidAmount: 1800, paymentMethod: "银行转账", note: "金额不一致应阻断" },
    });
    assert.equal(wrongPaymentAmount.status, 409, "supplier payment amount should match payable draft in v1");

    const paymentConfirmed = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
      userId: "U-FINANCE-A",
      body: {
        paidAmount: 1816.14,
        paymentMethod: "银行转账",
        paymentReferenceNo: "BANK-API-20260704-001",
        note: "财务确认供应商应付草稿已实际付款",
      },
    });
    assert.equal(paymentConfirmed.status, 200, "finance user should confirm supplier payment");
    assert.match(paymentConfirmed.json.review.supplierPaymentConfirmationId, /^RMSPAY-/, "API should return supplier payment confirmation id");
    assert.equal(paymentConfirmed.json.review.status, "已确认付款/已完成");
    assert.equal(paymentConfirmed.json.review.paymentStatus, "已确认付款");
    assert.equal(paymentConfirmed.json.review.payableStatus, "已付款");
    assert.equal(paymentConfirmed.json.paymentRecord.paidAmount, 1816.14);
    assert.equal(paymentConfirmed.json.review.inventoryEffect, "none");
    assert.equal(paymentConfirmed.json.review.paymentEffect, "supplier_payment_confirmed");

    const duplicatePayment = await postJson(`${baseUrl}/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
      userId: "U-FINANCE-A",
      body: { paidAmount: 1816.14, note: "重复付款确认应阻断" },
    });
    assert.equal(duplicatePayment.status, 409, "supplier payment should not be confirmed twice");

    await closeServer(server);

    const restartedServer = createApiServer({
      rawMaterialSupplierStatementReviewRepositoryOptions: { storageRoot: apiStorageRoot },
    });
    await listen(restartedServer);
    try {
      const restartedBaseUrl = `http://127.0.0.1:${restartedServer.address().port}/api`;
      const persisted = await getJson(`${restartedBaseUrl}/raw-material-supplier-statement-reviews?pageSize=10`);
      assert.equal(persisted.total, 1, "API should reload persisted supplier statement review drafts");
      assert.equal(persisted.items[0].status, "已确认付款/已完成");
      assert.match(persisted.items[0].statementConfirmationId, /^RMSRC-/, "API should reload persisted statement confirmation id");
      assert.match(persisted.items[0].supplierPayableId, /^RMSP-/, "API should reload persisted payable draft id");
      assert.match(persisted.items[0].supplierPaymentConfirmationId, /^RMSPAY-/, "API should reload persisted payment confirmation id");
    } finally {
      await closeServer(restartedServer);
    }
  } finally {
    await closeServer(server);
  }
}

function buildStatementResult(overrides = {}) {
  return {
    version: "p0-raw-material-supplier-statement-import-v1",
    fileName: overrides.fileName ?? "baihou.xlsx",
    supplierName: "白侯无纺布",
    adapter: { key: "baihou", label: "白侯对账单" },
    recommendedAction: "有候选行和纸管扣项，需人工复核。",
    summary: {
      status: "warning",
      statusLabel: "需要复核",
      rowCount: 2,
      matchedRowCount: 1,
      candidateRowCount: 1,
      unmatchedRowCount: 0,
      adjustmentCount: 2,
      totalWeightKg: 212.4,
      totalAmount: 1826.64,
    },
    rows: [
      {
        id: "BH-ROW-1",
        documentNo: "BH-240704-015",
        productName: "白色无纺布",
        color: "本白",
        rollLabel: "重1",
        totalWeightKg: 106.2,
        amount: 913.32,
        matchingStatus: "matched",
        matchedInboundId: "RMI-0704-002",
      },
      {
        id: "BH-ROW-2",
        productName: "白色无纺布",
        color: "本白",
        rollLabel: "重2",
        totalWeightKg: 106.2,
        amount: 913.32,
        matchingStatus: "candidate",
        matchedInboundId: "RMI-0704-002",
      },
    ],
    adjustments: [
      {
        id: "ADJ-1",
        label: "减纸管",
        adjustmentType: "paper_tube_deduction",
        typeLabel: "纸管扣项",
        isCurrentPeriod: true,
        amount: -10.5,
        supplierReportedAmount: -10.5,
        calculatedAmount: -10.5,
        calculationStatus: "matched",
        calculationBasis: {
          quantity: 3,
          quantityUnit: "件",
          unitRate: 3.5,
          unit: "元/件",
          formulaText: "3件 * 3.5元/件 = -10.5",
        },
        configuredRule: {
          key: "baihou.paper_tube_deduction",
          label: "纸管扣项",
          adjustmentType: "paper_tube_deduction",
          unitRate: 3.5,
          unit: "元/件",
          amountMode: "calculated",
          sign: "deduction",
        },
        note: "按供应商扣项规则计算纸管扣项；需人工确认后才可进入应付草稿。",
      },
      {
        id: "ADJ-2",
        label: "历史欠款余额",
        adjustmentType: "reference_balance",
        typeLabel: "历史欠款/余额参考",
        isCurrentPeriod: false,
        amount: 300,
        note: "历史欠款 / 余额仅作参考，不进入本期应付草稿。",
      },
    ],
    issues: [{ severity: "warning", severityLabel: "需确认", message: "纸管扣项需人工确认。" }],
  };
}

function buildSavedReview() {
  return {
    reviewId: "RMSR-LOCAL-001",
    supplierName: "白侯无纺布",
    fileName: "saved.xlsx",
    status: "待人工复核",
    reviewStatus: "draft",
    summary: buildStatementResult().summary,
    summaryText: "明细 2 行，匹配 1，候选 1，未匹配 0，调整 1。",
    rows: buildStatementResult().rows,
    adjustments: buildStatementResult().adjustments,
    issues: buildStatementResult().issues,
    inventoryEffect: "none",
    payableEffect: "none",
    paymentEffect: "none",
    createdAt: "2026-07-04T03:00:00.000Z",
    updatedAt: "2026-07-04T03:00:00.000Z",
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
      else resolve();
    });
  });
}

async function getJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function postJson(url, { userId, body }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": userId,
    },
    body: JSON.stringify(body ?? {}),
  });
  return {
    status: response.status,
    json: await response.json(),
  };
}
