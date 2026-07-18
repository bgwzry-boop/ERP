import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizePackingCompletionTransactionResult,
  normalizeProductionDailyProgressTransactionResult,
  normalizeProductionExceptionTransactionResult,
  normalizeProductionReportTransactionResult,
  normalizeProductionSchedulePublishTransactionResult,
} from "../server/productionPackingTransactionRecordNormalizer.mjs";

checkEmptyResults();
checkProductionReportNormalization();
checkExceptionAndScheduleNormalization();
checkPackingNormalization();
checkRepositoryBoundary();

console.log("Production packing transaction record normalizer check passed: transaction result shapes and repository boundary are covered.");

function checkEmptyResults() {
  assert.deepEqual(normalizeProductionReportTransactionResult(null), {
    productionTask: null,
    workshopReport: null,
    orderLine: null,
    packingTask: null,
    machineCapacityBaseline: null,
    inventoryReservations: [],
    inventoryItems: [],
    inventoryLedgerEntries: [],
    operationLogId: "",
  });
  assert.deepEqual(normalizeProductionDailyProgressTransactionResult(undefined), {
    productionTask: null,
    workshopReport: null,
    operationLogId: "",
  });
}

function checkProductionReportNormalization() {
  const result = normalizeProductionReportTransactionResult({
    production_task: {
      id: "PT-NORMALIZER-001",
      order_line_id: "OL-NORMALIZER-001",
      planned_qty: "80",
      task_status: "已完成",
      revision: 2,
    },
    workshop_report: {
      id: "WR-NORMALIZER-001",
      production_task_id: "PT-NORMALIZER-001",
      order_line_id: "OL-NORMALIZER-001",
      qualified_qty: "80",
      machine_count: "12345",
      evidence_json: ["invalid"],
    },
    inventory_reservations: [
      { id: "RSV-NORMALIZER-001", order_line_id: "OL-NORMALIZER-001", inventory_item_id: "INV-NORMALIZER-001", reserved_qty: "80" },
      { id: "RSV-NORMALIZER-INVALID", order_line_id: "OL-NORMALIZER-001" },
    ],
    inventory_items: [{ id: "INV-NORMALIZER-001", on_hand_qty: "180", reserved_qty: "80", revision: 3 }],
    inventory_ledger_entries: [{ id: "LEDGER-NORMALIZER-001", inventory_item_id: "INV-NORMALIZER-001", qty_change: "80" }],
    operation_log_id: "LOG-NORMALIZER-001",
  });

  assert.equal(result.productionTask.productionTaskId, "PT-NORMALIZER-001");
  assert.equal(result.productionTask.plannedQty, 80);
  assert.equal(result.workshopReport.machineCount, 12345);
  assert.deepEqual(result.workshopReport.evidence, {});
  assert.equal(result.inventoryReservations.length, 1);
  assert.equal(result.inventoryItems[0].onHandQty, 180);
  assert.equal(result.inventoryLedgerEntries[0].qtyChange, 80);
  assert.equal(result.operationLogId, "LOG-NORMALIZER-001");
}

function checkExceptionAndScheduleNormalization() {
  const exception = normalizeProductionExceptionTransactionResult({
    production_exception: {
      id: "PEX-NORMALIZER-001",
      production_task_id: "PT-NORMALIZER-001",
      order_line_id: "OL-NORMALIZER-001",
      exception_type: "机器问题",
      continuation_mode: "暂停等确认",
      estimated_loss_qty: "-3",
    },
    production_task: { id: "PT-NORMALIZER-001", order_line_id: "OL-NORMALIZER-001" },
    todo: { id: "TODO-NORMALIZER-001", type: "生产异常", refType: "production_task", refId: "PT-NORMALIZER-001" },
    todo_event: { id: "TODO-EVENT-NORMALIZER-001", todoId: "TODO-NORMALIZER-001" },
  });
  assert.equal(exception.productionException.estimatedLossQty, 0);
  assert.equal(exception.todo.refId, "PT-NORMALIZER-001");
  assert.equal(exception.todoEvent.eventId, "TODO-EVENT-NORMALIZER-001");

  const schedule = normalizeProductionSchedulePublishTransactionResult({
    production_task: { id: "PT-NORMALIZER-001", order_line_id: "OL-NORMALIZER-001", published_schedule_id: "SCH-001" },
    order_line: { id: "OL-NORMALIZER-001", line_status: "制袋已排产", exception_tags: ["需核对"] },
  });
  assert.equal(schedule.productionTask.publishedScheduleId, "SCH-001");
  assert.deepEqual(schedule.orderLine.exceptionTags, ["需核对"]);
}

function checkPackingNormalization() {
  const result = normalizePackingCompletionTransactionResult({
    packing_task: { id: "PKT-NORMALIZER-001", order_line_id: "OL-NORMALIZER-001", actual_packed_qty: "80" },
    packages: [
      { id: "PKG-NORMALIZER-001", order_line_id: "OL-NORMALIZER-001", package_seq: "1", packed_qty: "80" },
      { id: "PKG-NORMALIZER-INVALID" },
    ],
    fulfillment: { id: "FUL-NORMALIZER-001", order_line_id: "OL-NORMALIZER-001", actual_qty: "80", revision: 2 },
    todo: { id: "TODO-PACKING-001", type: "待打印标签", refType: "fulfillment", refId: "FUL-NORMALIZER-001" },
  });
  assert.equal(result.packingTask.actualPackedQty, 80);
  assert.equal(result.packages.length, 1);
  assert.equal(result.fulfillment.actualQty, 80);
  assert.equal(result.todo.refType, "fulfillment");
}

function checkRepositoryBoundary() {
  const repositorySource = readFileSync(new URL("../server/productionPackingTransactionRepository.mjs", import.meta.url), "utf8");
  const normalizerSource = readFileSync(new URL("../server/productionPackingTransactionRecordNormalizer.mjs", import.meta.url), "utf8");
  assert.match(repositorySource, /from "\.\/productionPackingTransactionRecordNormalizer\.mjs"/);
  assert.doesNotMatch(repositorySource, /function normalizeProductionTask\(/);
  assert.match(normalizerSource, /export function normalizeProductionReportTransactionResult\(/);
  assert.ok(repositorySource.split("\n").length <= 1850, "transaction repository should remain focused on orchestration and SQL");
}
