import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { initialRawMaterialSupplierStatementReviews } from "../src/data/fixtures.js";
import {
  buildListReviewsPayloadQuery,
  buildListReviewsPayloadSql,
  createLocalRawMaterialSupplierStatementReviewRepository,
  createPostgresRawMaterialSupplierStatementReviewRepository,
  createReviewDraftPayload,
} from "../server/rawMaterialSupplierStatementReviewRepository.mjs";
import {
  closeTestServer,
  getJson,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "raw-material-supplier-statement-review-api");
const repositoryStorageRoot = join(checkStorageRoot, "repository");
const apiStorageRoot = join(checkStorageRoot, "api");
rmSync(checkStorageRoot, { recursive: true, force: true });

checkCollisionResistantReviewIds();
await checkRepository();
await checkSupplierReturnReconciliation();
await checkPostgresRepositoryBoundary();
await checkApi();

console.log("raw-material supplier statement review API check passed");

function checkCollisionResistantReviewIds() {
  const sameMillisecond = "2026-07-04T03:00:00.000Z";
  const reviewIds = new Set();
  const operationLogIds = new Set();
  for (let index = 0; index < 256; index += 1) {
    const created = createReviewDraftPayload({
      statementResult: buildStatementResult({ fileName: `same-millisecond-${index}.xlsx` }),
      supplierName: "白侯无纺布",
      fileName: `same-millisecond-${index}.xlsx`,
      operatorId: "U-OFFICE-A",
      operatorName: "办公室A",
      now: sameMillisecond,
    });
    reviewIds.add(created.review.reviewId);
    operationLogIds.add(created.operationLog.id);
  }
  assert.equal(reviewIds.size, 256, "review ids created in the same millisecond must remain unique");
  assert.equal(operationLogIds.size, 256, "review operation-log ids created in the same millisecond must remain unique");
  for (const reviewId of reviewIds) {
    assert.match(reviewId, /^RMSR-20260704-[0-9A-F]{32}$/, "review id should retain its date prefix and use UUID entropy");
  }
}

async function checkRepository() {
  const seededRepository = createLocalRawMaterialSupplierStatementReviewRepository({ storageRoot: join(checkStorageRoot, "seeded-read-only") });
  const seededState = seededRepository.loadState({ seedReviews: initialRawMaterialSupplierStatementReviews });
  assert.equal(seededState.rawMaterialSupplierStatementReviews[0].demoReadOnly, true, "demo review must expose a clearly marked read-only filled settlement sample");
  assert.equal(seededState.rawMaterialSupplierStatementReviews[0].supplierPaymentRecord.paidAmount, 94040, "the read-only sample should cover the full statement-to-payment chain");

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

async function checkSupplierReturnReconciliation() {
  const storageRoot = join(checkStorageRoot, "supplier-return-reconciliation");
  const repository = createLocalRawMaterialSupplierStatementReviewRepository({ storageRoot });
  const workspace = repository.loadState();
  workspace.rawMaterialInbounds = [buildReviewedSupplierReturn()];

  const added = repository.createReviewDraft({
    workspace,
    statementResult: buildStatementResult({ fileName: "baihou-2026-07.xlsx" }),
    supplierName: "白侯无纺布",
    fileName: "baihou-2026-07.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:00:00.000Z",
  });
  const returnAdjustment = added.review.adjustments.find((item) => item.sourceReturnInboundId === "RMI-RETURN-20260712-001");
  assert.ok(returnAdjustment, "reviewed ERP supplier return should become a current-period reconciliation adjustment");
  assert.equal(returnAdjustment.adjustmentType, "return_adjustment");
  assert.equal(returnAdjustment.amount, -1172.18, "supplier return must reduce the current supplier payable");
  assert.equal(returnAdjustment.sourceAttachmentId, "ATT-RETURN-001", "return adjustment should retain original document attachment");
  assert.equal(returnAdjustment.sourceEvidence.lineEvidence[0].sourceBounds.x, 120, "return adjustment should retain OCR row crop coordinates");
  assert.deepEqual(added.review.addedSupplierReturnIds, ["RMI-RETURN-20260712-001"]);
  assert.equal(added.review.summary.erpReturnAdjustmentCount, 1);

  repository.confirmReview({
    workspace,
    reviewId: added.review.reviewId,
    decision: "一致",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:01:00.000Z",
  });
  repository.confirmStatement({
    workspace,
    reviewId: added.review.reviewId,
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:02:00.000Z",
  });
  const payable = repository.generatePayableDraft({
    workspace,
    reviewId: added.review.reviewId,
    operatorId: "U-FINANCE-A",
    operatorName: "财务A",
    now: "2026-08-03T05:03:00.000Z",
  });
  assert.equal(payable.payableDraft.lineSubtotal, 1826.64);
  assert.equal(payable.payableDraft.currentAdjustmentSubtotal, -1182.68, "paper-tube and supplier-return deductions should both enter current adjustments");
  assert.equal(payable.payableDraft.payableAmount, 643.96, "current payable should net purchases and reviewed supplier returns");
  assert.equal(payable.payableDraft.currentAdjustments.filter((item) => item.sourceReturnInboundId).length, 1);

  const duplicateReview = repository.createReviewDraft({
    workspace,
    statementResult: buildStatementResult({ fileName: "baihou-duplicate-2026-07.xlsx" }),
    supplierName: "白侯无纺布",
    fileName: "baihou-duplicate-2026-07.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:03:10.000Z",
  });
  repository.confirmReview({
    workspace,
    reviewId: duplicateReview.review.reviewId,
    decision: "一致",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:03:20.000Z",
  });
  assert.throws(
    () => repository.confirmStatement({
      workspace,
      reviewId: duplicateReview.review.reviewId,
      operatorId: "U-OFFICE-A",
      operatorName: "办公室A",
      now: "2026-08-03T05:03:30.000Z",
    }),
    /不能重复抵扣/,
    "one reviewed supplier return must not enter two confirmed supplier statements",
  );

  const alreadyReported = repository.createReviewDraft({
    workspace,
    statementResult: buildStatementWithReportedReturn(),
    supplierName: "白侯无纺布",
    fileName: "baihou-return-row-2026-07.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:04:00.000Z",
  });
  const linkedReturnRows = alreadyReported.review.rows.filter((row) => row.sourceReturnInboundId === "RMI-RETURN-20260712-001");
  assert.equal(linkedReturnRows.length, 1, "supplier statement return row should link to one ERP source return");
  assert.equal(linkedReturnRows[0].amount, -1172.18, "positive printed magnitude in a return section should normalize to negative");
  assert.equal(alreadyReported.review.adjustments.filter((item) => item.sourceReturnInboundId).length, 0, "matched supplier return must not be deducted a second time");
  assert.deepEqual(alreadyReported.review.linkedSupplierReturnIds, ["RMI-RETURN-20260712-001"]);
  assert.equal(alreadyReported.review.summary.totalAmount, -172.18, "statement summary should net purchase and return rows after sign normalization");

  const footerReported = repository.createReviewDraft({
    workspace,
    statementResult: buildStatementWithReportedReturnAdjustment(),
    supplierName: "白侯无纺布",
    fileName: "baihou-return-adjustment-2026-07.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:04:30.000Z",
  });
  const linkedReturnAdjustments = footerReported.review.adjustments.filter((item) => item.sourceReturnInboundId === "RMI-RETURN-20260712-001");
  assert.equal(linkedReturnAdjustments.length, 1, "supplier return footer should link to one ERP source return without adding another deduction");
  assert.equal(linkedReturnAdjustments[0].amount, -1172.18, "positive return footer magnitude should normalize to negative");
  assert.equal(footerReported.review.adjustments.length, 1, "matched supplier return footer must not create a duplicate adjustment");

  const outsidePeriod = repository.createReviewDraft({
    workspace,
    statementResult: {
      ...buildStatementResult({ fileName: "baihou-2026-08.xlsx" }),
      fileName: "baihou-2026-08.xlsx",
      rows: buildStatementResult().rows.map((row) => ({ ...row, documentDate: "2026-08-04" })),
    },
    supplierName: "白侯无纺布",
    fileName: "baihou-2026-08.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:05:00.000Z",
  });
  assert.equal(outsidePeriod.review.adjustments.some((item) => item.sourceReturnInboundId), false, "a July return must not enter an August payable draft");

  workspace.rawMaterialInbounds = [buildReviewedSupplierReturn({
    id: "RMI-RETURN-RENYI-001",
    supplierName: "人意无纺布销售单",
    deliveryNoteNo: "RY-RET-20260715-001",
    documentPriceReferenceOnly: true,
    amount: -999,
    ocrDeclaredAmount: -999,
    ocrCalculatedLineAmount: -999,
  })];
  const referencePriceReturn = repository.createReviewDraft({
    workspace,
    statementResult: {
      ...buildStatementResult({ fileName: "renyi-2026-07.xlsx" }),
      supplierName: "振恒",
      fileName: "renyi-2026-07.xlsx",
      rows: buildStatementResult().rows.map((row) => ({ ...row, supplierName: "振恒", documentDate: "2026-07-04" })),
      adjustments: [],
    },
    supplierName: "振恒",
    fileName: "renyi-2026-07.xlsx",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:06:00.000Z",
  });
  const referenceAdjustment = referencePriceReturn.review.adjustments.find((item) => item.sourceReturnInboundId === "RMI-RETURN-RENYI-001");
  assert.equal(referenceAdjustment.amount, 0, "reference-only supplier ticket price must not silently become the actual payable deduction");
  assert.equal(referenceAdjustment.calculationStatus, "missing_amount");
  assert.match(referencePriceReturn.review.issues.at(-1).message, /实际抵扣金额/, "reference-only return should require finance to confirm the actual deduction");
  assert.throws(
    () => repository.confirmReview({
      workspace,
      reviewId: referencePriceReturn.review.reviewId,
      decision: "一致",
      operatorId: "U-OFFICE-A",
      operatorName: "办公室A",
      now: "2026-08-03T05:07:00.000Z",
    }),
    /实际抵扣金额未确认/,
    "reference-only supplier return must block statement confirmation until the actual deduction is entered",
  );
  const confirmedReferencePrice = repository.confirmReview({
    workspace,
    reviewId: referencePriceReturn.review.reviewId,
    decision: "一致",
    adjustments: referencePriceReturn.review.adjustments.map((item) =>
      item.id === referenceAdjustment.id ? { id: item.id, amount: 820, note: "按厂家月结确认实际退货抵扣" } : { id: item.id }),
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    now: "2026-08-03T05:08:00.000Z",
  });
  const confirmedReturnAdjustment = confirmedReferencePrice.review.adjustments.find((item) => item.id === referenceAdjustment.id);
  assert.equal(confirmedReturnAdjustment.amount, -820, "manually confirmed actual return amount should remain a negative deduction");
  assert.equal(confirmedReturnAdjustment.calculationStatus, "manual_confirmed");
  assert.equal(confirmedReturnAdjustment.confirmedAmountByUserId, "U-OFFICE-A");
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
    rawMaterialSupplierStatementReviewSeeds: [],
  });
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);

  try {
    const health = await getJson(baseUrl, "/api/health");
    assert.equal(
      health.seed?.rawMaterialSupplierStatementReviewRepository,
      "local_json",
      "health should expose supplier statement review repository kind",
    );

    const emptyList = await getJson(baseUrl, "/api/raw-material-supplier-statement-reviews?pageSize=10");
    assert.equal(emptyList.total, 0, "API list should start empty");

    const denied = await postApiJson(baseUrl, "/api/raw-material-supplier-statement-reviews", {
      userId: "U-WAREHOUSE-A",
      body: { statementResult: buildStatementResult({ fileName: "denied.xlsx" }) },
    });
    assert.equal(denied.status, 403, "warehouse user should not save supplier statement review drafts");
    assert.equal(denied.json.requiredPermission, "raw_material.inbound.review");

    const created = await postApiJson(baseUrl, "/api/raw-material-supplier-statement-reviews", {
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

    const confirmed = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/confirm-review`, {
      userId: "U-OFFICE-A",
      body: { decision: "一致", note: "月结行已人工核对" },
    });
    assert.equal(confirmed.status, 200, "office user should confirm review draft");
    assert.equal(confirmed.json.review.status, "已人工复核/一致");
    assert.equal(confirmed.json.review.paymentEffect, "none", "confirmed review should still not confirm payment");

    const statementConfirmed = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/confirm-statement`, {
      userId: "U-OFFICE-A",
      body: { note: "确认对账一致，财务付款另行确认" },
    });
    assert.equal(statementConfirmed.status, 200, "office user should confirm consistent supplier statement");
    assert.match(statementConfirmed.json.review.statementConfirmationId, /^RMSRC-/, "API should return statement confirmation id");
    assert.equal(statementConfirmed.json.review.reviewStatus, "statement_confirmed");
    assert.equal(statementConfirmed.json.review.status, "已确认对账/待付款");
    assert.equal(statementConfirmed.json.review.paymentStatus, "待财务付款确认");
    assert.equal(statementConfirmed.json.review.paymentEffect, "none", "statement confirmation should not confirm payment");

    const duplicateStatementConfirmation = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/confirm-statement`, {
      userId: "U-OFFICE-A",
      body: { note: "重复确认应阻断" },
    });
    assert.equal(duplicateStatementConfirmation.status, 409, "confirmed statement should not be confirmed twice");

    const officePayableDenied = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/generate-payable`, {
      userId: "U-OFFICE-A",
      body: { note: "办公室不能生成应付" },
    });
    assert.equal(officePayableDenied.status, 403, "office user should not generate supplier payable draft");
    assert.equal(officePayableDenied.json.requiredPermission, "raw_material.supplier_payable.create");

    const payableDraft = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/generate-payable`, {
      userId: "U-FINANCE-A",
      body: { note: "财务生成应付草稿，付款另行确认" },
    });
    assert.equal(payableDraft.status, 200, "finance user should generate supplier payable draft");
    assert.match(payableDraft.json.review.supplierPayableId, /^RMSP-/, "API should return supplier payable draft id");
    assert.equal(payableDraft.json.review.status, "已生成应付/待付款确认");
    assert.equal(payableDraft.json.review.payableStatus, "待财务复核");
    assert.equal(payableDraft.json.review.supplierPayableDraft.payableAmount, 1816.14);
    assert.equal(payableDraft.json.review.paymentEffect, "none", "payable draft should not confirm payment");

    const duplicatePayableDraft = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/generate-payable`, {
      userId: "U-FINANCE-A",
      body: { note: "重复生成应付应阻断" },
    });
    assert.equal(duplicatePayableDraft.status, 409, "supplier payable draft should not be generated twice");

    const officePaymentDenied = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
      userId: "U-OFFICE-A",
      body: { paidAmount: 1816.14, note: "办公室不能确认供应商付款" },
    });
    assert.equal(officePaymentDenied.status, 403, "office user should not confirm supplier payment");
    assert.equal(officePaymentDenied.json.requiredPermission, "raw_material.supplier_payment.confirm");

    const wrongPaymentAmount = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
      userId: "U-FINANCE-A",
      body: { paidAmount: 1800, paymentMethod: "银行转账", note: "金额不一致应阻断" },
    });
    assert.equal(wrongPaymentAmount.status, 409, "supplier payment amount should match payable draft in v1");

    const paymentConfirmed = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
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

    const duplicatePayment = await postApiJson(baseUrl, `/api/raw-material-supplier-statement-reviews/${reviewId}/confirm-payment`, {
      userId: "U-FINANCE-A",
      body: { paidAmount: 1816.14, note: "重复付款确认应阻断" },
    });
    assert.equal(duplicatePayment.status, 409, "supplier payment should not be confirmed twice");

    await closeTestServer(server);

    const restartedServer = createApiServer({
      rawMaterialSupplierStatementReviewRepositoryOptions: { storageRoot: apiStorageRoot },
      rawMaterialSupplierStatementReviewSeeds: [],
    });
    await listenTestServer(restartedServer);
    try {
      const restartedBaseUrl = getTestServerBaseUrl(restartedServer);
      const persisted = await getJson(restartedBaseUrl, "/api/raw-material-supplier-statement-reviews?pageSize=10");
      assert.equal(persisted.total, 1, "API should reload persisted supplier statement review drafts");
      assert.equal(persisted.items[0].status, "已确认付款/已完成");
      assert.match(persisted.items[0].statementConfirmationId, /^RMSRC-/, "API should reload persisted statement confirmation id");
      assert.match(persisted.items[0].supplierPayableId, /^RMSP-/, "API should reload persisted payable draft id");
      assert.match(persisted.items[0].supplierPaymentConfirmationId, /^RMSPAY-/, "API should reload persisted payment confirmation id");
    } finally {
      await closeTestServer(restartedServer);
    }
  } finally {
    await closeTestServer(server);
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

function buildReviewedSupplierReturn(overrides = {}) {
  return {
    id: "RMI-RETURN-20260712-001",
    documentDirection: "supplier_return",
    documentTypeLabel: "退货单",
    status: "退货单已复核",
    supplierName: "河北宏尚无纺布有限公司",
    deliveryNoteNo: "HS-RET-20260712-001",
    receivedAt: "2026-07-12",
    materialType: "退带色布",
    productName: "退带色布",
    spec: "",
    supplierColor: "废布",
    factoryColor: "废布",
    rollCount: 5,
    totalWeightKg: -121.8,
    unit: "kg",
    unitPrice: 9.6,
    amount: -1172.18,
    ocrDeclaredAmount: -1172.18,
    ocrCalculatedLineAmount: -1172.18,
    sourceAttachmentId: "ATT-RETURN-001",
    sourceFileName: "宏尚退货单-20260712.jpg",
    sourceMimeType: "image/jpeg",
    ocrRawText: "河北宏尚无纺布有限公司退货单 退带色布 -121.8kg -1172.18元",
    reviewedAt: "2026-07-12T03:00:00.000Z",
    reviewedBy: "办公室A",
    ocrLines: [
      {
        lineId: "OCR-RETURN-LINE-1",
        sourceRowIndex: 1,
        sourceText: "退带色布 废布 -121.8 -1172.18",
        sourceBounds: { x: 120, y: 240, width: 900, height: 110 },
        recognizedValues: { productName: "退带色布", totalWeightKg: -121.8, amount: -1172.18 },
        values: { productName: "退带色布", totalWeightKg: -121.8, amount: -1172.18 },
        reviewStatus: "人工接受",
        reviewedAt: "2026-07-12T03:00:00.000Z",
      },
    ],
    rolls: [],
    ...overrides,
  };
}

function buildStatementWithReportedReturn() {
  return {
    version: "p0-raw-material-supplier-statement-import-v1",
    fileName: "baihou-return-row-2026-07.xlsx",
    supplierName: "白侯无纺布",
    adapter: { key: "baihou", label: "白侯对账单" },
    recommendedAction: "核对进货与退货明细。",
    summary: {
      status: "review",
      statusLabel: "需人工复核",
      rowCount: 2,
      shipmentRowCount: 1,
      returnRowCount: 1,
      matchedRowCount: 2,
      candidateRowCount: 0,
      unmatchedRowCount: 0,
      adjustmentCount: 0,
      totalWeightKg: 321.8,
      totalAmount: 2172.18,
    },
    rows: [
      {
        id: "BH-SHIP-1",
        documentDate: "2026-07-04",
        documentNo: "BH-20260704-001",
        productName: "无纺布",
        spec: "78*90*1500",
        color: "本白",
        totalWeightKg: 200,
        amount: 1000,
        lineType: "shipment",
        matchingStatus: "matched",
        matchedInboundId: "RMI-SHIP-001",
      },
      {
        id: "BH-RETURN-1",
        documentDate: "2026-07-12",
        documentNo: "HS-RET-20260712-001",
        productName: "退带色布",
        color: "废布",
        totalWeightKg: 121.8,
        amount: 1172.18,
        lineType: "return",
        matchingStatus: "matched",
        matchedInboundId: "RMI-RETURN-20260712-001",
      },
    ],
    adjustments: [],
    issues: [],
  };
}

function buildStatementWithReportedReturnAdjustment() {
  return {
    version: "p0-raw-material-supplier-statement-import-v1",
    fileName: "baihou-return-adjustment-2026-07.xlsx",
    supplierName: "白侯无纺布",
    adapter: { key: "baihou", label: "白侯对账单" },
    recommendedAction: "核对退货扣项。",
    summary: {
      status: "review",
      statusLabel: "需人工复核",
      rowCount: 1,
      shipmentRowCount: 1,
      returnRowCount: 0,
      matchedRowCount: 1,
      candidateRowCount: 0,
      unmatchedRowCount: 0,
      adjustmentCount: 1,
      totalWeightKg: 200,
      totalAmount: 1000,
    },
    rows: [{
      id: "BH-SHIP-FOOTER-1",
      documentDate: "2026-07-04",
      documentNo: "BH-20260704-001",
      productName: "无纺布",
      spec: "78*90*1500",
      color: "本白",
      totalWeightKg: 200,
      amount: 1000,
      lineType: "shipment",
      matchingStatus: "matched",
      matchedInboundId: "RMI-SHIP-001",
    }],
    adjustments: [{
      id: "BH-RETURN-FOOTER-1",
      supplierName: "白侯无纺布",
      label: "本期退货合计",
      adjustmentType: "return_adjustment",
      typeLabel: "退货调整",
      isCurrentPeriod: true,
      amount: 1172.18,
      supplierReportedAmount: 1172.18,
      requiresManualReview: true,
    }],
    issues: [],
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

async function postApiJson(baseUrl, route, { userId, body }) {
  const response = await requestJson(baseUrl, route, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": userId,
    },
    body: JSON.stringify(body ?? {}),
  });
  return {
    status: response.status,
    json: response.body,
  };
}
