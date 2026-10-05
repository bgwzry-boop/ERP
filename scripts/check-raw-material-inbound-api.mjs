import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { initialOrderLines, initialRawMaterialInbounds } from "../src/data/fixtures.js";
import { createApiServer } from "../server/apiServer.mjs";
import {
  createLocalRawMaterialInboundRepository,
  createPostgresRawMaterialInboundRepository,
  buildListRawMaterialInboundPayloadsQuery,
  buildListRawMaterialInboundPayloadsSql,
} from "../server/rawMaterialInboundRepository.mjs";
import { applyRawMaterialInboundAction } from "../server/services/rawMaterialInboundCommandService.mjs";
import { createRawMaterialInboundOrchestrator } from "../server/services/rawMaterialInboundOrchestrator.mjs";
import {
  closeTestServer,
  getJson,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "raw-material-inbound-api");
const repositoryStorageRoot = join(checkStorageRoot, "repository");
const apiStorageRoot = join(checkStorageRoot, "api");
const seededReviewInbound = initialRawMaterialInbounds.find((item) => item.id === "RMI-0704-001");
const seededOcrReviewPayload = {
  reviewFields: Object.fromEntries((seededReviewInbound?.ocrReviewFields ?? []).map((field) => [field.key, field.value])),
  lineReviews: (seededReviewInbound?.ocrLines ?? []).map((line) => ({ lineId: line.lineId, values: line.values })),
};
rmSync(checkStorageRoot, { recursive: true, force: true });

await checkRepository();
checkPerRollLabelGate();
checkSupplierReturnPhysicalFlow();
await checkPostgresRepositoryBoundary();
await checkApi();

console.log("raw-material inbound API check passed");

async function checkRepository() {
  const repository = createLocalRawMaterialInboundRepository({ storageRoot: repositoryStorageRoot });
  const action = createRawMaterialInboundOrchestrator(repository);
  const state = repository.loadState({ seedInbounds: initialRawMaterialInbounds });
  const workspace = {
    rawMaterialInbounds: state.rawMaterialInbounds,
    orderLines: [
      {
        id: "OL-RMI-001",
        productName: "红色空白袋",
        size: "30*38",
        bagColor: "红色",
        qty: 1000,
        amount: 900,
        customerId: "C-RMI-001",
      },
    ],
    customers: [
      {
        id: "C-RMI-001",
        name: "红袋客户",
      },
    ],
    productionTasks: [
      {
        id: "PT-RMI-001",
        productionTaskId: "PT-RMI-001",
        orderLineId: "OL-RMI-001",
        taskType: "制袋",
        machineId: "BAG-01",
        plannedQty: 1000,
      },
    ],
  };

  const list = repository.listRawMaterialInbounds({
    workspace,
    query: { pageSize: 10, keyword: "宏尚" },
  });
  assert.equal(list.total, 1, "repository should list seeded raw-material inbounds");
  assert.equal(list.items[0].id, "RMI-0704-001", "repository list should find the supplier delivery note");
  assert.equal(list.items[0].deliveryNoteNo, "", "raw-material supplier delivery-note number may be missing");

  const review = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "review",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    body: { expectedRevision: 1, now: "2026-07-04T01:00:00.000Z", ...seededOcrReviewPayload },
  });
  assert.equal(review.inbound.status, "已复核待打印标签", "review should move inbound to pending label print");
  assert.equal(review.inbound.rolls[0].labelStatus, "待打印标签", "review should not mark roll labels as printed");
  assert.equal(review.inbound.rolls[0].inventoryStatus, "不可用", "review must not make raw material available");

  const printed = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "print-labels",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    body: { expectedRevision: 2, now: "2026-07-04T01:05:00.000Z" },
  });
  assert.equal(printed.inbound.status, "已打印待贴标", "printing should move inbound to pending attach");
  assert.equal(printed.inbound.rolls[0].labelStatus, "已打印待贴标", "printing should mark labels as printed");
  assert.equal(printed.inbound.rolls[0].inventoryStatus, "不可用", "printed labels must not create usable inventory");

  const attached = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "attach-confirm",
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房出库A",
    body: { expectedRevision: 3, rollId: "RM-240704-001-01", matchResult: "matched", now: "2026-07-04T01:10:00.000Z" },
  });
  assert.equal(attached.inbound.status, "部分贴标", "single roll attach should keep inbound partially labeled");
  assert.equal(attached.inbound.rolls[0].inventoryStatus, "可用", "attached roll should become available");
  assert.equal(attached.inbound.rolls[1].inventoryStatus, "不可用", "unattached roll should remain unavailable");
  assert.equal(attached.inbound.rolls[0].labelVerification.result, "匹配", "attach confirmation should persist the physical label check");
  assert.equal(attached.inbound.rolls[0].labelVerification.verifiedByUserId, "U-WAREHOUSE-A", "the authenticated operator should be recorded");

  const issued = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "issue-to-machine",
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房出库A",
    body: {
      expectedRevision: 4,
      rollId: "RM-240704-001-01",
      issuedWeightKg: 50,
      machineId: "制袋机-01",
      productionTaskId: "PT-RMI-001",
      now: "2026-07-04T01:15:00.000Z",
    },
  });
  assert.equal(issued.inbound.status, "部分领料/机边", "single issued roll should mark inbound as partially issued");
  assert.equal(issued.inbound.rolls[0].inventoryStatus, "可用", "source roll remainder should stay available after split issue");
  assert.equal(issued.inbound.rolls[0].weightKg, 55.4, "source roll should keep remaining split weight");
  assert.equal(issued.inbound.rolls[1].id, "RM-240704-001-01-S01", "split issue should create a machine-side split roll");
  assert.equal(issued.inbound.rolls[1].inventoryStatus, "机边领用", "split roll should move to machine-side inventory state");
  assert.equal(issued.inbound.rolls[1].weightKg, 50, "split roll should keep issued weight");
  assert.equal(issued.inbound.rolls[1].consumptionStatus, "待生产消耗确认", "issued split roll should wait for consumption confirmation");
  assert.match(issued.inbound.rawMaterialIssueRecords[0].issueRecordId, /^RMI-ISS-/, "issue should create a traceable issue record");
  assert.match(issued.inbound.rawMaterialSplitRecords[0].splitRecordId, /^RMI-SPLIT-/, "partial issue should create a split record");
  assert.equal(issued.inbound.rawMaterialIssueRecords[0].sourceRollId, "RM-240704-001-01", "issue record should link the source roll");
  assert.equal(issued.inbound.rawMaterialIssueRecords[0].remainingWeightKg, 55.4, "issue record should keep source-roll remaining weight");
  assert.equal(issued.inbound.rawMaterialIssueRecords[0].machineId, "制袋机-01", "issue record should keep machine side target");
  assert.equal(issued.inbound.rawMaterialIssueRecords[0].productionTaskMatchStatus, "已匹配", "issue record should mark matched production task");
  assert.equal(issued.inbound.rawMaterialIssueRecords[0].productionTaskOrderLineId, "OL-RMI-001", "issue record should keep matched order line");

  const consumed = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "confirm-consumption",
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房出库A",
    body: {
      expectedRevision: 5,
      rollId: "RM-240704-001-01-S01",
      consumedWeightKg: 30,
      machineId: "制袋机-01",
      productionTaskId: "PT-RMI-001",
      now: "2026-07-04T01:25:00.000Z",
    },
  });
  assert.equal(consumed.inbound.status, "部分消耗确认", "single consumed roll should mark inbound as partially consumed");
  assert.equal(consumed.inbound.rolls[1].inventoryStatus, "机边领用", "partial consumed split roll should remain machine-side");
  assert.equal(consumed.inbound.rolls[1].weightKg, 20, "partial consumption should keep remaining machine-side weight");
  assert.match(consumed.inbound.rawMaterialConsumptionRecords[0].consumptionRecordId, /^RMI-CONS-/, "consumption should create a traceable record");
  assert.equal(
    consumed.inbound.rawMaterialIssueRecords[0].consumptionStatus,
    "部分消耗/机边",
    "issue record should reflect partial consumption confirmation",
  );
  assert.equal(consumed.inbound.rawMaterialIssueRecords[0].remainingWeightKg, 55.4, "partial consumption should not overwrite source-roll remaining weight");
  assert.equal(consumed.inbound.rawMaterialIssueRecords[0].remainingMachineSideWeightKg, 20, "issue record should keep machine-side remaining weight separately");
  assert.equal(consumed.inbound.rawMaterialConsumptionRecords[0].remainingMachineSideWeightKg, 20, "consumption record should keep remaining machine-side weight");

  const costDraft = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "generate-cost-draft",
    operatorId: "U-MANAGER-A",
    operatorName: "管理A",
    body: {
      expectedRevision: 6,
      note: "专项检查生成成本草稿；仍需成本复核。",
      now: "2026-07-04T01:28:00.000Z",
    },
  });
  assert.match(costDraft.inbound.rawMaterialCostAllocationDrafts[0].costAllocationDraftId, /^RMCA-/, "cost draft should create a RMCA record");
  assert.equal(costDraft.inbound.rawMaterialCostAllocationDrafts[0].allocatedWeightKg, 30, "cost draft should allocate consumed weight");
  assert.equal(costDraft.inbound.rawMaterialCostAllocationDrafts[0].allocatedCostAmount, 270, "cost draft should use inbound unit price snapshot");
  assert.equal(costDraft.inbound.rawMaterialCostAllocationDrafts[0].productionTaskId, "PT-RMI-001", "cost draft should keep matched production task");
  assert.equal(costDraft.inbound.rawMaterialCostAllocationDrafts[0].orderLineId, "OL-RMI-001", "cost draft should keep matched order line");
  assert.equal(costDraft.inbound.rawMaterialCostAllocationDrafts[0].costEffect, "draft_only", "cost draft should not become final cost");
  assert.equal(costDraft.inbound.rawMaterialCostAllocationDrafts[0].marginEffect, "none", "cost draft should not update margin");
  assert.equal(costDraft.inbound.costAllocationStatus, "成本草稿待复核", "inbound should expose draft review state");
  assert.equal(costDraft.inbound.costAllocationDraftAmount, 270, "inbound should summarize draft amount");
  assert.equal(costDraft.inbound.rawMaterialIssueRecords[0].costAllocationDraftId, costDraft.inbound.rawMaterialCostAllocationDrafts[0].costAllocationDraftId, "issue record should link cost draft");
  assert.equal(costDraft.inbound.rawMaterialConsumptionRecords[0].costAllocationDraftId, costDraft.inbound.rawMaterialCostAllocationDrafts[0].costAllocationDraftId, "consumption record should link cost draft");

  const costConfirmation = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "confirm-cost-draft",
    operatorId: "U-MANAGER-A",
    operatorName: "管理A",
    body: {
      expectedRevision: 7,
      note: "专项检查确认成本草稿；损耗校准和毛利仍待后续流程。",
      now: "2026-07-04T01:29:00.000Z",
    },
  });
  assert.match(costConfirmation.inbound.rawMaterialCostAllocationConfirmations[0].costConfirmationId, /^RMCC-/, "cost confirmation should create a RMCC record");
  assert.equal(costConfirmation.inbound.rawMaterialCostAllocationConfirmations[0].confirmedCostAmount, 270, "cost confirmation should keep draft amount");
  assert.equal(costConfirmation.inbound.rawMaterialCostAllocationDrafts[0].allocationStatus, "已复核/待损耗校准", "cost draft should move to reviewed state");
  assert.equal(costConfirmation.inbound.rawMaterialCostAllocationDrafts[0].costEffect, "confirmed_material_cost_snapshot", "confirmed draft should become a material cost snapshot");
  assert.equal(costConfirmation.inbound.rawMaterialCostAllocationDrafts[0].marginEffect, "none", "cost confirmation should not update margin");
  assert.equal(costConfirmation.inbound.costAllocationStatus, "成本已复核待损耗校准", "inbound should expose confirmed cost state");
  assert.equal(costConfirmation.inbound.costAllocationConfirmedAmount, 270, "inbound should summarize confirmed cost amount");
  assert.equal(
    costConfirmation.inbound.rawMaterialConsumptionRecords[0].costConfirmationId,
    costConfirmation.inbound.rawMaterialCostAllocationConfirmations[0].costConfirmationId,
    "consumption record should link cost confirmation",
  );

  const lossCalibration = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "calibrate-loss",
    operatorId: "U-MANAGER-A",
    operatorName: "管理A",
    body: {
      expectedRevision: 8,
      expectedOutputQuantity: 1000,
      actualQualifiedOutputQuantity: 950,
      note: "专项检查校准损耗；仍需毛利报表确认。",
      now: "2026-07-04T01:29:30.000Z",
    },
  });
  assert.match(lossCalibration.inbound.rawMaterialCostLossCalibrations[0].lossCalibrationId, /^RMCL-/, "loss calibration should create a RMCL record");
  assert.equal(lossCalibration.inbound.rawMaterialCostLossCalibrations[0].lossRatePercent, 5, "loss calibration should calculate loss rate");
  assert.equal(lossCalibration.inbound.rawMaterialCostLossCalibrations[0].confirmedCostAmount, 270, "loss calibration should keep confirmed cost snapshot");
  assert.equal(lossCalibration.inbound.rawMaterialCostLossCalibrations[0].marginEffect, "pending_margin_snapshot", "loss calibration should not update final margin");
  assert.equal(lossCalibration.inbound.rawMaterialCostAllocationDrafts[0].allocationStatus, "已校准/待毛利确认", "cost draft should move to loss-calibrated state");
  assert.equal(
    lossCalibration.inbound.rawMaterialCostAllocationDrafts[0].costEffect,
    "loss_calibrated_material_cost_snapshot",
    "loss-calibrated draft should expose calibrated cost snapshot",
  );
  assert.equal(lossCalibration.inbound.rawMaterialCostAllocationDrafts[0].marginEffect, "pending_margin_snapshot", "loss-calibrated draft should still wait for margin report");
  assert.equal(lossCalibration.inbound.rawMaterialCostAllocationConfirmations[0].reviewStatus, "已校准/待毛利确认", "cost confirmation should move to calibrated state");
  assert.equal(lossCalibration.inbound.rawMaterialIssueRecords[0].costAllocationStatus, "损耗已校准待毛利确认", "issue record should expose calibrated state");
  assert.equal(
    lossCalibration.inbound.rawMaterialConsumptionRecords[0].lossCalibrationId,
    lossCalibration.inbound.rawMaterialCostLossCalibrations[0].lossCalibrationId,
    "consumption record should link loss calibration",
  );
  assert.equal(lossCalibration.inbound.costAllocationStatus, "损耗已校准待毛利确认", "inbound should expose loss-calibrated state");
  assert.equal(lossCalibration.inbound.costAllocationReviewStatus, "已校准/待毛利确认", "inbound should wait for margin confirmation after loss calibration");

  const marginSnapshot = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "generate-margin-snapshot",
    operatorId: "U-MANAGER-A",
    operatorName: "管理A",
    body: {
      expectedRevision: 9,
      note: "专项检查生成订单毛利快照；只供财务复核。",
      now: "2026-07-04T01:29:45.000Z",
    },
  });
  assert.match(marginSnapshot.inbound.rawMaterialOrderMarginSnapshots[0].marginSnapshotId, /^RMMG-/, "margin snapshot should create a RMMG record");
  assert.equal(marginSnapshot.inbound.rawMaterialOrderMarginSnapshots[0].totalSalesAmount, 900, "margin snapshot should keep order sales amount");
  assert.equal(marginSnapshot.inbound.rawMaterialOrderMarginSnapshots[0].totalMaterialCostAmount, 270, "margin snapshot should keep calibrated material cost");
  assert.equal(marginSnapshot.inbound.rawMaterialOrderMarginSnapshots[0].grossProfitAmount, 630, "margin snapshot should calculate gross profit");
  assert.equal(marginSnapshot.inbound.rawMaterialOrderMarginSnapshots[0].grossMarginRatePercent, 70, "margin snapshot should calculate gross margin rate");
  assert.equal(marginSnapshot.inbound.rawMaterialOrderMarginSnapshots[0].marginEffect, "margin_snapshot_pending_review", "margin snapshot should wait for finance review");
  assert.equal(marginSnapshot.inbound.rawMaterialCostLossCalibrations[0].marginEffect, "margin_snapshot_pending_review", "loss calibration should link margin snapshot without final settlement");
  assert.equal(marginSnapshot.inbound.rawMaterialCostAllocationDrafts[0].allocationStatus, "毛利快照待复核", "cost draft should move to margin snapshot review state");
  assert.equal(marginSnapshot.inbound.rawMaterialConsumptionRecords[0].marginSnapshotId, marginSnapshot.inbound.rawMaterialOrderMarginSnapshots[0].marginSnapshotId, "consumption record should link margin snapshot");
  assert.equal(marginSnapshot.inbound.costAllocationStatus, "毛利快照待复核", "inbound should expose margin snapshot review state");

  const marginReview = action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "review-margin-snapshot",
    operatorId: "U-MANAGER-A",
    operatorName: "管理A",
    body: {
      expectedRevision: 10,
      note: "专项检查复核订单毛利快照；生成内部毛利报表。",
      now: "2026-07-04T01:29:55.000Z",
    },
  });
  assert.match(marginReview.inbound.rawMaterialOrderMarginReports[0].marginReportId, /^RMMR-/, "margin review should create a RMMR report");
  assert.equal(marginReview.inbound.rawMaterialOrderMarginReports[0].grossProfitAmount, 630, "margin report should keep gross profit");
  assert.equal(marginReview.inbound.rawMaterialOrderMarginReports[0].grossMarginRatePercent, 70, "margin report should keep gross margin rate");
  assert.equal(marginReview.inbound.rawMaterialOrderMarginReports[0].marginEffect, "reviewed_margin_report_snapshot", "margin report should mark reviewed effect");
  assert.equal(marginReview.inbound.rawMaterialOrderMarginSnapshots[0].reviewStatus, "已财务复核/报表可用", "margin snapshot should move to reviewed state");
  assert.equal(marginReview.inbound.rawMaterialCostAllocationDrafts[0].allocationStatus, "毛利已复核/报表可用", "cost draft should move to report-ready state");
  assert.equal(marginReview.inbound.rawMaterialCostLossCalibrations[0].marginEffect, "reviewed_margin_report_snapshot", "loss calibration should link reviewed margin report");
  assert.equal(marginReview.inbound.rawMaterialConsumptionRecords[0].marginReportId, marginReview.inbound.rawMaterialOrderMarginReports[0].marginReportId, "consumption record should link margin report");
  assert.equal(marginReview.inbound.costAllocationStatus, "毛利已复核/报表可用", "inbound should expose reviewed margin report state");

  const handleIssued = action.applyAction({
    workspace,
    inboundId: "RMI-0704-003",
    action: "issue-to-machine",
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房出库A",
    body: {
      expectedRevision: 1,
      rollId: "RM-240704-003-01",
      machineId: "BAG-01",
      productionTaskId: "PT-RMI-001",
      now: "2026-07-04T01:30:00.000Z",
    },
  });
  assert.equal(handleIssued.inbound.rolls[0].inventoryStatus, "机边领用", "available handle piece should move to machine-side state");
  const returned = action.applyAction({
    workspace,
    inboundId: "RMI-0704-003",
    action: "return-leftover",
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房出库A",
    body: {
      expectedRevision: 2,
      rollId: "RM-240704-003-01",
      returnLocation: "余料区",
      now: "2026-07-04T01:35:00.000Z",
    },
  });
  assert.equal(returned.inbound.status, "余料待复核", "returned leftover should move inbound to pending leftover review");
  assert.equal(returned.inbound.rolls[0].inventoryStatus, "余料待复核", "returned leftover should not become available inventory");
  assert.match(returned.inbound.rawMaterialLeftoverReturnRecords[0].leftoverReturnRecordId, /^RMI-RET-/, "leftover return should create a traceable record");

  const reviewedLeftover = action.applyAction({
    workspace,
    inboundId: "RMI-0704-003",
    action: "review-leftover",
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房出库A",
    body: {
      expectedRevision: 3,
      rollId: "RM-240704-003-01",
      reviewLocation: "原料库-余料可用区",
      now: "2026-07-04T01:40:00.000Z",
    },
  });
  assert.equal(reviewedLeftover.inbound.status, "部分余料复核", "reviewed leftover should keep inbound partial when other rolls are not available");
  assert.equal(reviewedLeftover.inbound.rolls[0].inventoryStatus, "可用", "reviewed leftover should become available raw-material inventory");
  assert.equal(reviewedLeftover.inbound.rolls[0].consumptionStatus, "余料已复核/可用", "reviewed leftover roll should keep review status");
  assert.match(reviewedLeftover.inbound.rawMaterialLeftoverReviewRecords[0].leftoverReviewRecordId, /^RMI-LREV-/, "leftover review should create a traceable review record");
  assert.equal(
    reviewedLeftover.inbound.rawMaterialLeftoverReturnRecords[0].reviewStatus,
    "复核通过/可用",
    "leftover return record should keep the review result",
  );

  const reloaded = createLocalRawMaterialInboundRepository({ storageRoot: repositoryStorageRoot }).loadState();
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.status,
    "部分消耗确认",
    "repository should persist raw-material inbound state",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.rolls[0].inventoryStatus,
    "可用",
    "repository should persist split source roll available status",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.rolls[1].weightKg,
    20,
    "repository should persist partial consumption remaining machine-side weight",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.rawMaterialCostAllocationDrafts?.[0]?.allocatedCostAmount,
    270,
    "repository should persist raw-material cost allocation draft amount",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.rawMaterialCostAllocationConfirmations?.[0]?.confirmedCostAmount,
    270,
    "repository should persist raw-material cost confirmation amount",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.costAllocationStatus,
    "毛利已复核/报表可用",
    "repository should persist raw-material margin report status",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.rawMaterialCostLossCalibrations?.[0]?.lossRatePercent,
    5,
    "repository should persist raw-material loss calibration rate",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.rawMaterialOrderMarginSnapshots?.[0]?.grossProfitAmount,
    630,
    "repository should persist raw-material margin snapshot gross profit",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-001")?.rawMaterialOrderMarginReports?.[0]?.grossProfitAmount,
    630,
    "repository should persist raw-material reviewed margin report gross profit",
  );
  assert.equal(
    reloaded.rawMaterialInbounds.find((item) => item.id === "RMI-0704-003")?.rolls[0].inventoryStatus,
    "可用",
    "repository should persist reviewed leftover available status",
  );
}

function checkPerRollLabelGate() {
  const inbound = {
    id: "RMI-PER-ROLL-001",
    supplierName: "测试供应商",
    factoryColor: "本白",
    spec: "55cm / 60g",
    status: "已打印待贴标",
    rolls: Array.from({ length: 8 }, (_, index) => ({
      id: `RMI-PER-ROLL-${index + 1}`,
      supplierRollNo: `重${index + 1}`,
      weightKg: 100 + index,
      labelVersion: 1,
      labelStatus: "已打印待贴标",
      inventoryStatus: "待贴标",
      location: "待贴标区",
    })),
  };
  const workspace = { rawMaterialInbounds: [inbound] };
  assert.throws(
    () =>
      applyRawMaterialInboundAction({
        workspace,
        inboundId: inbound.id,
        action: "attach_confirm",
        body: { expectedRevision: 1, matchResult: "matched" },
        operatorId: "U-OFFICE-A",
        operatorName: "办公室A",
      }),
    (error) => error?.code === "RAW_MATERIAL_ATTACH_ROLL_REQUIRED",
    "attach confirmation must fail closed when rollId is missing",
  );

  let current = inbound;
  for (const roll of inbound.rolls.slice(0, 7)) {
    current = applyRawMaterialInboundAction({
      workspace: { rawMaterialInbounds: [current] },
      inboundId: inbound.id,
      action: "attach_confirm",
      body: {
        expectedRevision: current.revision ?? 1,
        rollId: roll.id,
        matchResult: "matched",
        checkedWeightKg: roll.weightKg,
        checkedColor: "本白",
        checkedSpec: "55cm / 60g",
        location: "原料库-A01",
        operatorId: "U-SPOOFED",
      },
      operatorId: "U-OFFICE-A",
      operatorName: "办公室A",
    }).inbound;
  }
  current = applyRawMaterialInboundAction({
    workspace: { rawMaterialInbounds: [current] },
    inboundId: inbound.id,
    action: "attach_confirm",
    body: { expectedRevision: current.revision, rollId: "RMI-PER-ROLL-8", matchResult: "mismatched", location: "原料隔离区" },
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
  }).inbound;
  assert.equal(current.status, "部分入库，1卷异常");
  assert.equal(current.rolls.filter((roll) => roll.inventoryStatus === "可用").length, 7);
  assert.equal(current.rolls[7].labelStatus, "标签或实物不符/待确认");
  assert.equal(current.rolls[0].labelVerification.verifiedByUserId, "U-OFFICE-A", "body operator must not spoof the authenticated operator");

  current = applyRawMaterialInboundAction({
    workspace: { rawMaterialInbounds: [current] },
    inboundId: inbound.id,
    action: "void_label",
    body: { expectedRevision: current.revision, rollId: "RMI-PER-ROLL-8", reason: "标签损坏" },
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
  }).inbound;
  assert.equal(current.rolls[7].labelStatus, "标签已作废/待重打");
  assert.equal(current.rolls[0].inventoryStatus, "可用", "voiding an exceptional label must not affect matched rolls");

  current = applyRawMaterialInboundAction({
    workspace: { rawMaterialInbounds: [current] },
    inboundId: inbound.id,
    action: "reprint_label",
    body: { expectedRevision: current.revision, rollId: "RMI-PER-ROLL-8" },
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
  }).inbound;
  assert.equal(current.rolls[7].labelVersion, 2);
  assert.equal(current.rolls[7].labelStatus, "已打印待贴标");
  current = applyRawMaterialInboundAction({
    workspace: { rawMaterialInbounds: [current] },
    inboundId: inbound.id,
    action: "attach_confirm",
    body: { expectedRevision: current.revision, rollId: "RMI-PER-ROLL-8", matchResult: "matched", location: "原料库-A01" },
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
  }).inbound;
  assert.equal(current.status, "已贴标/可用库存");
  assert.equal(current.rolls.filter((roll) => roll.inventoryStatus === "可用").length, 8);
}

function checkSupplierReturnPhysicalFlow() {
  const stockInbound = {
    id: "RMI-STOCK-RETURN-001",
    revision: 1,
    documentDirection: "supplier_delivery",
    supplierName: "河北宏尚无纺布有限公司",
    status: "已贴标/可用库存",
    rolls: [{
      id: "ROLL-STOCK-RETURN-001",
      supplierRollNo: "HS-ROLL-001",
      weightKg: 121.8,
      labelStatus: "已贴标/可用库存",
      inventoryStatus: "可用",
      location: "原料库-可用区",
    }],
  };
  const sourceReturn = {
    id: "RMI-RETURN-EVIDENCE-001",
    revision: 1,
    documentDirection: "supplier_return",
    documentTypeLabel: "退货单",
    supplierName: "白侯无纺布",
    deliveryNoteNo: "HS-RET-001",
    receivedAt: "2026-07-12",
    status: "退货单已复核",
    rollCount: 1,
    totalWeightKg: -121.8,
    amount: -1172.18,
    sourceAttachmentId: "ATT-HS-RET-001",
    rolls: [],
  };
  const staged = applyRawMaterialInboundAction({
    inbounds: [stockInbound, sourceReturn],
    inboundId: stockInbound.id,
    action: "stage-supplier-return",
    body: {
      expectedRevision: 1,
      rollId: "ROLL-STOCK-RETURN-001",
      sourceReturnInboundId: sourceReturn.id,
      location: "供应商退货暂存区",
    },
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房A",
    serverNow: "2026-07-12T04:00:00.000Z",
  });
  assert.equal(staged.inbound.rolls[0].inventoryStatus, "供应商退货暂存", "stock roll should leave available inventory and enter the supplier-return holding area");
  assert.equal(staged.inbound.rolls[0].location, "供应商退货暂存区");
  assert.equal(staged.inbound.rawMaterialSupplierReturnRecords.length, 1);
  assert.equal(staged.inbound.rawMaterialSupplierReturnRecords[0].sourceReturnInboundId, sourceReturn.id, "physical return must link the reviewed return note");
  assert.equal(staged.inbound.rawMaterialSupplierReturnRecords[0].sourceAttachmentId, sourceReturn.sourceAttachmentId, "physical return must retain original return-note evidence");
  assert.equal(staged.inbounds.find((item) => item.id === sourceReturn.id).status, "退货单已复核", "staging stock must not mutate the financial return-note record");

  assert.throws(
    () => applyRawMaterialInboundAction({
      inbounds: staged.inbounds,
      inboundId: stockInbound.id,
      action: "confirm-supplier-return-shipment",
      body: { expectedRevision: 2, rollId: "ROLL-STOCK-RETURN-001" },
      operatorId: "U-WAREHOUSE-A",
      operatorName: "库房A",
      serverNow: "2026-07-12T04:05:00.000Z",
    }),
    /明确确认实物已经交还供应商/,
    "supplier return must not reduce owned stock without explicit physical handoff confirmation",
  );

  const shipped = applyRawMaterialInboundAction({
    inbounds: staged.inbounds,
    inboundId: stockInbound.id,
    action: "confirm-supplier-return-shipment",
    body: {
      expectedRevision: 2,
      rollId: "ROLL-STOCK-RETURN-001",
      physicalReturnConfirmed: true,
      shipmentReferenceNo: "RET-SHIP-001",
    },
    operatorId: "U-WAREHOUSE-A",
    operatorName: "库房A",
    serverNow: "2026-07-12T04:06:00.000Z",
  });
  assert.equal(shipped.inbound.rolls[0].inventoryStatus, "已退厂", "confirmed physical handoff should close the stock-return direction once");
  assert.equal(shipped.inbound.rawMaterialSupplierReturnRecords[0].status, "已退厂");
  assert.equal(shipped.inbound.rawMaterialSupplierReturnRecords[0].shipmentReferenceNo, "RET-SHIP-001");
  assert.throws(
    () => applyRawMaterialInboundAction({
      inbounds: shipped.inbounds,
      inboundId: stockInbound.id,
      action: "confirm-supplier-return-shipment",
      body: { expectedRevision: 3, rollId: "ROLL-STOCK-RETURN-001", physicalReturnConfirmed: true },
      operatorId: "U-WAREHOUSE-A",
      operatorName: "库房A",
      serverNow: "2026-07-12T04:07:00.000Z",
    }),
    /只有供应商退货暂存区内/,
    "a physically shipped roll must not be deducted twice",
  );
}

async function checkPostgresRepositoryBoundary() {
  const calls = [];
  const repositoryInbound = initialRawMaterialInbounds.find((item) => item.id === "RMI-0704-001");
  const repository = createPostgresRawMaterialInboundRepository({
    queryJson(text, values) {
      calls.push({ kind: "query", text, values });
      if (text.includes("FROM operation_idempotency_keys")) return null;
      if (text.includes("WHERE id =")) return repositoryInbound;
      return [repositoryInbound];
    },
    idempotentTransactionJson(request) {
      calls.push({ kind: "idempotent", ...request });
      return {
        inbound: {
          ...repositoryInbound,
          revision: 2,
          status: "已复核待打印标签",
          rolls: repositoryInbound.rolls.map((roll) => ({ ...roll, labelStatus: "待打印标签" })),
        },
        operationLogId: "RMI-LOG-PG-001",
      };
    },
  });

  const action = createRawMaterialInboundOrchestrator(repository);
  const state = await repository.loadState();
  assert.equal(state.rawMaterialInbounds[0].id, "RMI-0704-001", "postgres loadState should normalize payload rows");
  assert.match(calls[0].text, /FROM raw_material_inbounds/, "postgres loadState should query raw_material_inbounds");

  const filteredSql = buildListRawMaterialInboundPayloadsSql({
    query: { keyword: "O'Brien", status: "已打印待贴标" },
  });
  assert.match(filteredSql, /payload_json::text ILIKE \$2::text/, "postgres list SQL should bind keyword");
  assert.match(filteredSql, /status = \$1::text/, "postgres list SQL should bind status");
  assert.ok(!filteredSql.includes("O'Brien"));
  assert.deepEqual(buildListRawMaterialInboundPayloadsQuery({
    query: { keyword: "O'Brien", status: "已打印待贴标" },
  }).values, ["已打印待贴标", "%O'Brien%"]);

  const workspace = { rawMaterialInbounds: [repositoryInbound] };
  const saved = await action.applyAction({
    workspace,
    inboundId: "RMI-0704-001",
    action: "review",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    idempotencyKey: "idem-raw-material-review-001",
    body: { expectedRevision: 1, now: "2026-07-04T01:00:00.000Z", ...seededOcrReviewPayload },
  });
  const transactionQuery = calls.find((call) => call.kind === "idempotent");
  assert.equal(saved.inbound.status, "已复核待打印标签", "postgres action should return saved inbound payload");
  assert.equal(saved.inbound.revision, 2, "postgres action should return the committed inbound revision");
  assert.equal(transactionQuery.scope, "raw-material.review.rmi-0704-001");
  assert.equal(transactionQuery.idempotencyKey, "idem-raw-material-review-001");
  assert.ok(transactionQuery.resourceLocks.includes("raw-material:RMI-0704-001"));
  assert.match(transactionQuery.text, /UPDATE raw_material_inbounds/, "postgres action should update the locked raw-material payload");
  assert.match(transactionQuery.text, /FOR UPDATE/);
  assert.match(transactionQuery.text, /ERP_RAW_MATERIAL_INBOUND_CONCURRENCY_CONFLICT/);
  assert.match(transactionQuery.text, /revision = raw_material_inbounds\.revision \+ 1/);
  assert.match(transactionQuery.text, /jsonb_build_object\('revision', raw_material_inbounds\.revision\)/);
  assert.doesNotMatch(transactionQuery.text, /jsonb_build_object\('revision', revision\)/);
  assert.match(transactionQuery.text, /INSERT INTO operation_logs/, "postgres action should write operation log");
  assert.ok(!transactionQuery.text.includes("已复核待打印标签"));
  assert.equal(transactionQuery.values.includes("已复核待打印标签"), true);
  assert.equal(workspace.rawMaterialInbounds[0].status, "已复核待打印标签", "postgres action should update workspace projection");
  assert.equal(workspace.rawMaterialInbounds[0].revision, 2, "workspace projection should use the committed revision");
}

async function checkApi() {
  const testOrderLine = {
    id: "ORD-RMI-API-001-01",
    orderId: "ORD-RMI-API-001",
    customerId: "C001",
    productName: "原料领料测试红袋",
    bagColor: "红色",
    color: "红色",
    qty: 1000,
    status: "制袋中",
    lineStatus: "制袋中",
  };
  initialOrderLines.push(testOrderLine);
  const server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
    rawMaterialInboundRepositoryOptions: { storageRoot: apiStorageRoot },
  }));
  await listenTestServer(server);
  const baseUrl = `${getTestServerBaseUrl(server)}/api`;

  try {
    const health = await getJson(baseUrl, "health");
    assert.equal(health.seed?.rawMaterialInboundRepository, "local_json", "health should expose raw-material repository kind");

    const list = await getJson(baseUrl, "raw-material-inbounds?pageSize=10");
    assert(list.items?.some((item) => item.id === "RMI-0704-001"), "API list should include raw-material seed rows");
    assert.equal(list.metrics?.pendingReviewCount >= 1, true, "API list should include raw-material metrics");
    const taskList = await getJson(baseUrl, "production-tasks?pageSize=200");
    const testProductionTask = (taskList.items ?? []).find((item) => item.orderLineId === testOrderLine.id);
    assert.ok(testProductionTask?.productionTaskId, "API test seed should expose a red bag-making production task");
    const testProductionTaskId = testProductionTask.productionTaskId;
    const testMachineId = testProductionTask.productionTask?.machineId;
    assert.equal(testMachineId, "BAG-01", "API test seed should bind the test task to the bag-making machine");

    const review = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/review`, {
      userId: "U-OFFICE-A",
      body: { now: "2026-07-04T02:00:00.000Z", ...seededOcrReviewPayload },
    });
    assert.equal(review.status, 200, "office user should be allowed to review raw-material inbound");
    assert.equal(review.json.inbound.status, "已复核待打印标签", "review route should update status");

    const printed = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/print-labels`, {
      userId: "U-OFFICE-A",
      body: { now: "2026-07-04T02:05:00.000Z" },
    });
    assert.equal(printed.status, 200, "office user should be allowed to print labels");
    assert.equal(printed.json.inbound.status, "已打印待贴标", "print route should update status");
    assert.equal(
      printed.json.inbound.rolls.every((roll) => roll.inventoryStatus !== "可用"),
      true,
      "print route must not make raw material available",
    );

    const invalidOfficeAttach = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/attach-confirm`, {
      userId: "U-OFFICE-A",
      body: { rollId: "RM-240704-001-01" },
    });
    assert.equal(invalidOfficeAttach.status, 422, "office attach confirmation should still require a per-roll match decision");
    assert.equal(
      invalidOfficeAttach.json.code,
      "RAW_MATERIAL_LABEL_MATCH_RESULT_REQUIRED",
      "office attach validation should fail closed before inventory becomes available",
    );

    const attached = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/attach-confirm`, {
      userId: "U-OFFICE-A",
      body: { rollId: "RM-240704-001-01", matchResult: "matched", now: "2026-07-04T02:10:00.000Z" },
    });
    assert.equal(attached.status, 200, "office user should be allowed to confirm the label-to-roll check");
    assert.equal(attached.json.inbound.status, "部分贴标", "single roll attach should not close all rolls");
    assert.equal(attached.json.inbound.rolls[0].inventoryStatus, "可用", "attached roll should be available through API");
    assert.equal(attached.json.inbound.rolls[1].inventoryStatus, "不可用", "unattached roll should stay unavailable through API");

    const unknownTaskIssue = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/issue-to-machine`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-001-01",
        machineId: "BAG-01",
        productionTaskId: "PT-DOES-NOT-EXIST",
      },
    });
    assert.equal(unknownTaskIssue.status, 422, "issue should reject unknown production task ids");
    assert.equal(unknownTaskIssue.json.code, "RAW_MATERIAL_PRODUCTION_TASK_NOT_FOUND", "unknown task issue should return a stable code");

    const incompatibleTaskIssue = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/issue-to-machine`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-001-01",
        machineId: "BAG-01",
        productionTaskId: "PT-ORD-0629-003-01",
      },
    });
    assert.equal(incompatibleTaskIssue.status, 422, "reviewed raw material should not issue against a production task with an incompatible required width");
    assert.equal(incompatibleTaskIssue.json.code, "RAW_MATERIAL_PRODUCTION_TASK_WIDTH_MISMATCH", "width mismatch should return a stable code");

    const deniedIssue = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/issue-to-machine`, {
      userId: "U-OFFICE-A",
      body: { rollId: "RM-240704-001-01", machineId: "制袋机-01" },
    });
    assert.equal(deniedIssue.status, 403, "office user should not issue raw material to machine side");
    assert.equal(
      deniedIssue.json.requiredPermission,
      "raw_material.issue.create",
      "issue denial should return required permission",
    );

    const missingMachineIssue = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/issue-to-machine`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-001-01",
        issuedWeightKg: 50,
        now: "2026-07-04T02:12:00.000Z",
      },
    });
    assert.equal(missingMachineIssue.status, 422, "scan outbound must require the destination machine or area");
    assert.equal(
      missingMachineIssue.json.code,
      "RAW_MATERIAL_ISSUE_MACHINE_REQUIRED",
      "missing machine must fail closed before any raw-material movement",
    );

    const splitIssue = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/issue-to-machine`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-001-01",
        machineId: testMachineId,
        productionTaskId: testProductionTaskId,
        issuedWeightKg: 50,
        now: "2026-07-04T02:12:00.000Z",
      },
    });
    assert.equal(splitIssue.status, 200, "split-roll issue should be allowed after selecting a matching production task and machine");
    assert.equal(splitIssue.json.inbound.status, "部分领料/机边", "single issued roll should keep inbound partially issued");
    assert.equal(splitIssue.json.inbound.rolls[0].inventoryStatus, "可用", "split source roll should stay available inventory");
    assert.equal(splitIssue.json.inbound.rolls[0].weightKg, 55.4, "split source roll should keep remaining weight");
    assert.equal(splitIssue.json.inbound.rolls[1].id, "RM-240704-001-01-S01", "split route should create a child machine-side roll");
    assert.equal(splitIssue.json.inbound.rolls[1].inventoryStatus, "机边领用", "split child roll should be machine-side");
    assert.equal(splitIssue.json.inbound.rawMaterialIssueRecords[0].productionTaskMatchStatus, "已匹配", "issue must persist the selected production task match");
    assert.match(splitIssue.json.inbound.rawMaterialSplitRecords[0].splitRecordId, /^RMI-SPLIT-/, "split route should create RMI-SPLIT record");

    const attachedWhite = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/attach-confirm`, {
      userId: "U-WAREHOUSE-A",
      body: { rollId: "RM-240704-002-01", matchResult: "matched", now: "2026-07-04T02:13:00.000Z" },
    });
    assert.equal(attachedWhite.status, 200, "warehouse user should attach a white raw-material roll for task matching");
    const machineMismatchIssue = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/issue-to-machine`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-002-01",
        machineId: "PRINT-01",
        productionTaskId: "PT-ORD-0629-003-01",
      },
    });
    assert.equal(machineMismatchIssue.status, 422, "issue should reject production task machine mismatch");
    assert.equal(
      machineMismatchIssue.json.code,
      "RAW_MATERIAL_PRODUCTION_TASK_MACHINE_MISMATCH",
      "machine mismatch should return a stable code",
    );
    const matchedIssue = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/issue-to-machine`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-002-01",
        machineId: "BAG-01",
        issuedWeightKg: 50,
        productionTaskId: "PT-ORD-0629-003-01",
        now: "2026-07-04T02:14:00.000Z",
      },
    });
    assert.equal(matchedIssue.status, 200, "matching production task issue should be allowed");
    assert.equal(matchedIssue.json.inbound.productionTaskId, "PT-ORD-0629-003-01", "inbound should keep matched production task");
    assert.equal(matchedIssue.json.inbound.productionTaskMatchStatus, "已匹配", "inbound should expose matched production task status");
    assert.equal(
      matchedIssue.json.inbound.rawMaterialIssueRecords[0].productionTaskGoodsSpec.includes("美的空调"),
      true,
      "matched issue should keep a human-readable production task goods spec",
    );

    const matchedConsumed = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/confirm-consumption`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-002-01-S01",
        consumedWeightKg: 20,
        machineId: "BAG-01",
        productionTaskId: "PT-ORD-0629-003-01",
        now: "2026-07-04T02:18:00.000Z",
      },
    });
    assert.equal(matchedConsumed.status, 200, "matched issue should allow consumption confirmation");
    assert.equal(matchedConsumed.json.inbound.rawMaterialConsumptionRecords[0].consumedWeightKg, 20, "matched consumption should keep consumed weight");

    const deniedConsumption = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/confirm-consumption`, {
      userId: "U-OFFICE-A",
      body: { rollId: "RM-240704-001-01", machineId: "制袋机-01" },
    });
    assert.equal(deniedConsumption.status, 403, "office user should not confirm raw-material consumption");
    assert.equal(
      deniedConsumption.json.requiredPermission,
      "raw_material.consumption.confirm",
      "consumption denial should return required permission",
    );

    const consumed = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/confirm-consumption`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-001-01-S01",
        consumedWeightKg: 30,
        machineId: "制袋机-01",
        productionTaskId: testProductionTaskId,
        now: "2026-07-04T02:25:00.000Z",
      },
    });
    assert.equal(consumed.status, 200, "warehouse user should be allowed to confirm raw-material consumption");
    assert.equal(consumed.json.inbound.status, "部分消耗确认", "consumption route should update inbound status");
    assert.equal(consumed.json.inbound.rolls[1].inventoryStatus, "机边领用", "partial consumption route should keep split roll machine-side");
    assert.equal(consumed.json.inbound.rolls[1].weightKg, 20, "partial consumption route should keep remaining machine-side weight");
    assert.match(consumed.json.inbound.rawMaterialConsumptionRecords[0].consumptionRecordId, /^RMI-CONS-/, "consumption route should create RMI-CONS record");
    assert.equal(consumed.json.inbound.rawMaterialIssueRecords[0].remainingWeightKg, 55.4, "API should preserve source-roll remaining weight");
    assert.equal(consumed.json.inbound.rawMaterialIssueRecords[0].remainingMachineSideWeightKg, 20, "API should expose machine-side remaining weight separately");
    assert.equal(consumed.json.inbound.rawMaterialConsumptionRecords[0].remainingMachineSideWeightKg, 20, "consumption route should store remaining machine-side weight");
    assert.equal(
      consumed.json.inbound.nextStep.includes("成本分摊"),
      true,
      "consumption route should keep cost allocation boundary explicit",
    );

    const deniedCostDraft = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-001/generate-cost-draft`, {
      userId: "U-OFFICE-A",
      body: { now: "2026-07-04T02:27:00.000Z" },
    });
    assert.equal(deniedCostDraft.status, 403, "office user should not generate raw-material cost drafts");
    assert.equal(
      deniedCostDraft.json.requiredPermission,
      "raw_material.cost.allocate",
      "cost draft denial should return required permission",
    );

    const generatedCostDraft = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/generate-cost-draft`, {
      userId: "U-FINANCE-A",
      body: {
        note: "API 检查生成成本草稿；仍需成本复核。",
        now: "2026-07-04T02:29:00.000Z",
      },
    });
    assert.equal(generatedCostDraft.status, 200, "finance user should generate cost draft for matched consumption");
    assert.match(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].costAllocationDraftId, /^RMCA-/, "API cost draft should create RMCA record");
    assert.equal(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].allocatedWeightKg, 20, "API cost draft should allocate consumed weight");
    assert.equal(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].allocatedCostAmount, 172, "API cost draft should use inbound unit price");
    assert.equal(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].productionTaskId, "PT-ORD-0629-003-01", "API cost draft should keep production task");
    assert.equal(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].orderLineId, "ORD-0629-003-01", "API cost draft should keep order line");
    assert.equal(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].costEffect, "draft_only", "API cost draft should be draft only");
    assert.equal(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].marginEffect, "none", "API cost draft should not update margin");
    assert.equal(generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].lossCalibrationStatus, "待损耗校准", "API cost draft should wait for loss calibration");
    assert.equal(generatedCostDraft.json.inbound.costAllocationStatus, "成本草稿待复核", "API inbound should expose cost draft state");
    assert.equal(generatedCostDraft.json.inbound.costAllocationDraftAmount, 172, "API inbound should summarize draft amount");
    assert.equal(
      generatedCostDraft.json.inbound.rawMaterialIssueRecords[0].costAllocationDraftId,
      generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].costAllocationDraftId,
      "API issue record should link generated cost draft",
    );
    assert.equal(
      generatedCostDraft.json.inbound.rawMaterialConsumptionRecords[0].costAllocationDraftId,
      generatedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].costAllocationDraftId,
      "API consumption record should link generated cost draft",
    );

    const duplicateCostDraft = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/generate-cost-draft`, {
      userId: "U-FINANCE-A",
      body: { now: "2026-07-04T02:30:00.000Z" },
    });
    assert.equal(duplicateCostDraft.status, 422, "duplicate cost draft generation should be blocked");
    assert.equal(
      duplicateCostDraft.json.code,
      "RAW_MATERIAL_COST_DRAFT_NO_ELIGIBLE_CONSUMPTION",
      "duplicate cost draft should return no-eligible code",
    );

    const deniedCostConfirm = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/confirm-cost-draft`, {
      userId: "U-WAREHOUSE-A",
      body: { now: "2026-07-04T02:31:00.000Z" },
    });
    assert.equal(deniedCostConfirm.status, 403, "warehouse user should not confirm raw-material cost drafts");
    assert.equal(
      deniedCostConfirm.json.requiredPermission,
      "raw_material.cost.confirm",
      "cost confirmation denial should return required permission",
    );

    const confirmedCostDraft = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/confirm-cost-draft`, {
      userId: "U-FINANCE-A",
      body: {
        note: "API 检查确认成本草稿；损耗校准和毛利仍待后续流程。",
        now: "2026-07-04T02:32:00.000Z",
      },
    });
    assert.equal(confirmedCostDraft.status, 200, "finance user should confirm cost draft");
    assert.match(confirmedCostDraft.json.inbound.rawMaterialCostAllocationConfirmations[0].costConfirmationId, /^RMCC-/, "API cost confirmation should create RMCC record");
    assert.equal(confirmedCostDraft.json.inbound.rawMaterialCostAllocationConfirmations[0].confirmedCostAmount, 172, "API cost confirmation should keep draft amount");
    assert.equal(confirmedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].allocationStatus, "已复核/待损耗校准", "API cost draft should move to reviewed state");
    assert.equal(confirmedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].costEffect, "confirmed_material_cost_snapshot", "API cost confirmation should create material cost snapshot");
    assert.equal(confirmedCostDraft.json.inbound.rawMaterialCostAllocationDrafts[0].marginEffect, "none", "API cost confirmation should not update margin");
    assert.equal(confirmedCostDraft.json.inbound.costAllocationStatus, "成本已复核待损耗校准", "API inbound should expose confirmed cost state");
    assert.equal(confirmedCostDraft.json.inbound.costAllocationConfirmedAmount, 172, "API inbound should summarize confirmed cost amount");

    const duplicateCostConfirm = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/confirm-cost-draft`, {
      userId: "U-FINANCE-A",
      body: { now: "2026-07-04T02:33:00.000Z" },
    });
    assert.equal(duplicateCostConfirm.status, 409, "duplicate cost confirmation should be blocked");
    assert.equal(
      duplicateCostConfirm.json.code,
      "RAW_MATERIAL_COST_CONFIRM_ALREADY_CONFIRMED",
      "duplicate cost confirmation should return stable already-confirmed code",
    );

    const deniedLossCalibration = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/calibrate-loss`, {
      userId: "U-WAREHOUSE-A",
      body: { now: "2026-07-04T02:34:00.000Z" },
    });
    assert.equal(deniedLossCalibration.status, 403, "warehouse user should not calibrate raw-material loss");
    assert.equal(
      deniedLossCalibration.json.requiredPermission,
      "raw_material.cost.calibrate",
      "loss calibration denial should return required permission",
    );

    const calibratedLoss = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/calibrate-loss`, {
      userId: "U-FINANCE-A",
      body: {
        expectedOutputQuantity: 500,
        actualQualifiedOutputQuantity: 475,
        note: "API 检查校准损耗；仍需毛利报表确认。",
        now: "2026-07-04T02:35:00.000Z",
      },
    });
    assert.equal(calibratedLoss.status, 200, "finance user should calibrate raw-material loss after cost confirmation");
    assert.match(calibratedLoss.json.inbound.rawMaterialCostLossCalibrations[0].lossCalibrationId, /^RMCL-/, "API loss calibration should create RMCL record");
    assert.equal(calibratedLoss.json.inbound.rawMaterialCostLossCalibrations[0].lossRatePercent, 5, "API loss calibration should calculate loss rate");
    assert.equal(calibratedLoss.json.inbound.rawMaterialCostLossCalibrations[0].confirmedCostAmount, 172, "API loss calibration should keep confirmed cost amount");
    assert.equal(calibratedLoss.json.inbound.rawMaterialCostLossCalibrations[0].costEffect, "loss_calibrated_material_cost_snapshot", "API loss calibration should expose calibrated cost snapshot");
    assert.equal(calibratedLoss.json.inbound.rawMaterialCostLossCalibrations[0].marginEffect, "pending_margin_snapshot", "API loss calibration should wait for margin report");
    assert.equal(calibratedLoss.json.inbound.rawMaterialCostAllocationDrafts[0].allocationStatus, "已校准/待毛利确认", "API cost draft should move to loss-calibrated state");
    assert.equal(calibratedLoss.json.inbound.rawMaterialCostAllocationConfirmations[0].reviewStatus, "已校准/待毛利确认", "API cost confirmation should move to calibrated state");
    assert.equal(calibratedLoss.json.inbound.rawMaterialConsumptionRecords[0].costAllocationStatus, "损耗已校准待毛利确认", "API consumption should expose calibrated state");
    assert.equal(calibratedLoss.json.inbound.costAllocationStatus, "损耗已校准待毛利确认", "API inbound should expose loss-calibrated state");
    assert.equal(calibratedLoss.json.inbound.costAllocationReviewStatus, "已校准/待毛利确认", "API inbound should wait for margin confirmation");

    const deniedMarginSnapshot = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/generate-margin-snapshot`, {
      userId: "U-WAREHOUSE-A",
      body: { now: "2026-07-04T02:35:30.000Z" },
    });
    assert.equal(deniedMarginSnapshot.status, 403, "warehouse user should not generate raw-material margin snapshot");
    assert.equal(
      deniedMarginSnapshot.json.requiredPermission,
      "raw_material.margin.snapshot",
      "margin snapshot denial should return required permission",
    );

    const marginSnapshot = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/generate-margin-snapshot`, {
      userId: "U-FINANCE-A",
      body: {
        note: "API 检查生成订单毛利快照；只供财务复核。",
        now: "2026-07-04T02:35:45.000Z",
      },
    });
    assert.equal(marginSnapshot.status, 200, "finance user should generate raw-material margin snapshot after loss calibration");
    assert.match(marginSnapshot.json.inbound.rawMaterialOrderMarginSnapshots[0].marginSnapshotId, /^RMMG-/, "API margin snapshot should create RMMG record");
    assert.equal(marginSnapshot.json.inbound.rawMaterialOrderMarginSnapshots[0].totalSalesAmount, 480, "API margin snapshot should keep order sales amount");
    assert.equal(marginSnapshot.json.inbound.rawMaterialOrderMarginSnapshots[0].totalMaterialCostAmount, 172, "API margin snapshot should keep material cost");
    assert.equal(marginSnapshot.json.inbound.rawMaterialOrderMarginSnapshots[0].grossProfitAmount, 308, "API margin snapshot should calculate gross profit");
    assert.equal(marginSnapshot.json.inbound.rawMaterialOrderMarginSnapshots[0].grossMarginRatePercent, 64.17, "API margin snapshot should calculate gross margin rate");
    assert.equal(marginSnapshot.json.inbound.rawMaterialOrderMarginSnapshots[0].marginEffect, "margin_snapshot_pending_review", "API margin snapshot should wait for finance review");
    assert.equal(marginSnapshot.json.inbound.rawMaterialCostLossCalibrations[0].marginEffect, "margin_snapshot_pending_review", "API loss calibration should link margin snapshot");
    assert.equal(marginSnapshot.json.inbound.rawMaterialConsumptionRecords[0].costAllocationStatus, "毛利快照待复核", "API consumption should expose margin snapshot review state");
    assert.equal(marginSnapshot.json.inbound.costAllocationStatus, "毛利快照待复核", "API inbound should expose margin snapshot review state");

    const deniedMarginReview = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/review-margin-snapshot`, {
      userId: "U-WAREHOUSE-A",
      body: { now: "2026-07-04T02:35:47.000Z" },
    });
    assert.equal(deniedMarginReview.status, 403, "warehouse user should not review raw-material margin snapshot");
    assert.equal(
      deniedMarginReview.json.requiredPermission,
      "raw_material.margin.review",
      "margin review denial should return required permission",
    );

    const marginReview = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/review-margin-snapshot`, {
      userId: "U-FINANCE-A",
      body: {
        note: "API 检查复核订单毛利快照；生成内部毛利报表。",
        now: "2026-07-04T02:35:48.000Z",
      },
    });
    assert.equal(marginReview.status, 200, "finance user should review raw-material margin snapshot");
    assert.match(marginReview.json.inbound.rawMaterialOrderMarginReports[0].marginReportId, /^RMMR-/, "API margin review should create RMMR report");
    assert.equal(marginReview.json.inbound.rawMaterialOrderMarginReports[0].totalSalesAmount, 480, "API margin report should keep order sales amount");
    assert.equal(marginReview.json.inbound.rawMaterialOrderMarginReports[0].totalMaterialCostAmount, 172, "API margin report should keep material cost");
    assert.equal(marginReview.json.inbound.rawMaterialOrderMarginReports[0].grossProfitAmount, 308, "API margin report should calculate gross profit");
    assert.equal(marginReview.json.inbound.rawMaterialOrderMarginReports[0].grossMarginRatePercent, 64.17, "API margin report should keep margin rate");
    assert.equal(marginReview.json.inbound.rawMaterialOrderMarginReports[0].marginEffect, "reviewed_margin_report_snapshot", "API margin report should mark reviewed margin effect");
    assert.equal(marginReview.json.inbound.rawMaterialOrderMarginSnapshots[0].reviewStatus, "已财务复核/报表可用", "API margin snapshot should move to reviewed state");
    assert.equal(marginReview.json.inbound.rawMaterialConsumptionRecords[0].costAllocationStatus, "毛利已复核/报表可用", "API consumption should expose margin report state");
    assert.equal(marginReview.json.inbound.costAllocationStatus, "毛利已复核/报表可用", "API inbound should expose margin report state");

    const duplicateMarginReview = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/review-margin-snapshot`, {
      userId: "U-FINANCE-A",
      body: { now: "2026-07-04T02:35:49.000Z" },
    });
    assert.equal(duplicateMarginReview.status, 409, "duplicate margin review should be blocked");
    assert.equal(
      duplicateMarginReview.json.code,
      "RAW_MATERIAL_MARGIN_REVIEW_ALREADY_DONE",
      "duplicate margin review should return stable already-reviewed code",
    );

    const duplicateMarginSnapshot = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/generate-margin-snapshot`, {
      userId: "U-FINANCE-A",
      body: { now: "2026-07-04T02:35:50.000Z" },
    });
    assert.equal(duplicateMarginSnapshot.status, 409, "duplicate margin snapshot should be blocked");
    assert.equal(
      duplicateMarginSnapshot.json.code,
      "RAW_MATERIAL_MARGIN_SNAPSHOT_ALREADY_GENERATED",
      "duplicate margin snapshot should return stable already-generated code",
    );

    const duplicateLossCalibration = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-002/calibrate-loss`, {
      userId: "U-FINANCE-A",
      body: {
        expectedOutputQuantity: 500,
        actualQualifiedOutputQuantity: 470,
        now: "2026-07-04T02:36:00.000Z",
      },
    });
    assert.equal(duplicateLossCalibration.status, 409, "duplicate loss calibration should be blocked");
    assert.equal(
      duplicateLossCalibration.json.code,
      "RAW_MATERIAL_LOSS_CALIBRATION_ALREADY_DONE",
      "duplicate loss calibration should return stable already-calibrated code",
    );

    const handleIssued = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-003/issue-to-machine`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-003-01",
        machineId: "BAG-01",
        productionTaskId: "PT-ORD-0629-003-01",
        now: "2026-07-04T02:30:00.000Z",
      },
    });
    assert.equal(handleIssued.status, 200, "warehouse user should be allowed to issue handle material");
    const deniedLeftover = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-003/return-leftover`, {
      userId: "U-OFFICE-A",
      body: { rollId: "RM-240704-003-01", returnLocation: "余料区" },
    });
    assert.equal(deniedLeftover.status, 403, "office user should not return raw-material leftovers");
    assert.equal(
      deniedLeftover.json.requiredPermission,
      "raw_material.leftover.return",
      "leftover denial should return required permission",
    );

    const returned = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-003/return-leftover`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-003-01",
        returnLocation: "余料区",
        now: "2026-07-04T02:35:00.000Z",
      },
    });
    assert.equal(returned.status, 200, "warehouse user should be allowed to return machine-side leftovers");
    assert.equal(returned.json.inbound.status, "余料待复核", "leftover route should move inbound to pending review");
    assert.equal(returned.json.inbound.rolls[0].inventoryStatus, "余料待复核", "leftover route must not restore available inventory");
    assert.match(returned.json.inbound.rawMaterialLeftoverReturnRecords[0].leftoverReturnRecordId, /^RMI-RET-/, "leftover route should create RMI-RET record");

    const deniedLeftoverReview = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-003/review-leftover`, {
      userId: "U-OFFICE-A",
      body: { rollId: "RM-240704-003-01", reviewLocation: "原料库-余料可用区" },
    });
    assert.equal(deniedLeftoverReview.status, 403, "office user should not review raw-material leftovers back to available");
    assert.equal(
      deniedLeftoverReview.json.requiredPermission,
      "raw_material.leftover.review",
      "leftover review denial should return required permission",
    );

    const reviewedLeftover = await postJson(`${baseUrl}/raw-material-inbounds/RMI-0704-003/review-leftover`, {
      userId: "U-WAREHOUSE-A",
      body: {
        rollId: "RM-240704-003-01",
        reviewLocation: "原料库-余料可用区",
        now: "2026-07-04T02:40:00.000Z",
      },
    });
    assert.equal(reviewedLeftover.status, 200, "warehouse user should be allowed to review leftovers back to available");
    assert.equal(reviewedLeftover.json.inbound.status, "部分余料复核", "leftover review route should keep inbound partial when other rolls are not available");
    assert.equal(reviewedLeftover.json.inbound.rolls[0].inventoryStatus, "可用", "leftover review route should restore available inventory after review");
    assert.match(reviewedLeftover.json.inbound.rawMaterialLeftoverReviewRecords[0].leftoverReviewRecordId, /^RMI-LREV-/, "leftover review route should create RMI-LREV record");

    await closeTestServer(server);

    const restartedServer = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
      rawMaterialInboundRepositoryOptions: { storageRoot: apiStorageRoot },
    }));
    await listenTestServer(restartedServer);
    try {
      const restartedBaseUrl = `${getTestServerBaseUrl(restartedServer)}/api`;
      const persisted = await getJson(restartedBaseUrl, "raw-material-inbounds/RMI-0704-001");
      assert.equal(persisted.inbound.status, "部分消耗确认", "API should reload persisted raw-material inbound status");
      assert.equal(
        persisted.inbound.rolls[0].inventoryStatus,
        "可用",
        "API should reload persisted split source roll status",
      );
      assert.equal(
        persisted.inbound.rolls[1].weightKg,
        20,
        "API should reload persisted partial consumption remaining machine-side weight",
      );
      const persistedCostDraft = await getJson(restartedBaseUrl, "raw-material-inbounds/RMI-0704-002");
      assert.equal(
        persistedCostDraft.inbound.rawMaterialCostAllocationDrafts?.[0]?.allocatedCostAmount,
        172,
        "API should reload persisted raw-material cost draft amount",
      );
      assert.equal(
        persistedCostDraft.inbound.costAllocationStatus,
        "毛利已复核/报表可用",
        "API should reload persisted raw-material margin report status",
      );
      assert.equal(
        persistedCostDraft.inbound.rawMaterialCostAllocationConfirmations?.[0]?.confirmedCostAmount,
        172,
        "API should reload persisted raw-material cost confirmation amount",
      );
      assert.equal(
        persistedCostDraft.inbound.rawMaterialCostLossCalibrations?.[0]?.lossRatePercent,
        5,
        "API should reload persisted raw-material loss calibration rate",
      );
      assert.equal(
        persistedCostDraft.inbound.rawMaterialOrderMarginSnapshots?.[0]?.grossProfitAmount,
        308,
        "API should reload persisted raw-material margin snapshot gross profit",
      );
      assert.equal(
        persistedCostDraft.inbound.rawMaterialOrderMarginReports?.[0]?.grossProfitAmount,
        308,
        "API should reload persisted raw-material reviewed margin report gross profit",
      );
      const persistedLeftover = await getJson(restartedBaseUrl, "raw-material-inbounds/RMI-0704-003");
      assert.equal(
        persistedLeftover.inbound.rolls[0].inventoryStatus,
        "可用",
        "API should reload persisted reviewed leftover status",
      );
    } finally {
      await closeTestServer(restartedServer);
    }
  } finally {
    await closeTestServer(server);
    initialOrderLines.pop();
  }
}

async function postJson(url, { userId, body }) {
  const endpoint = new URL(url);
  const requestBody = { ...(body ?? {}) };
  const inboundMatch = endpoint.pathname.match(/^(.*\/raw-material-inbounds\/([^/]+))\/[^/]+$/);
  if (inboundMatch && requestBody.expectedRevision == null) {
    const revisionResponse = await requestJson(endpoint.origin, inboundMatch[1], {
      method: "GET",
      headers: { "x-erp-user-id": userId },
    });
    requestBody.expectedRevision = Number(revisionResponse.body?.inbound?.revision ?? 0);
  }
  const response = await requestJson(endpoint.origin, `${endpoint.pathname}${endpoint.search}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": userId,
    },
    body: JSON.stringify(requestBody),
  });
  return {
    status: response.status,
    json: response.body,
  };
}
