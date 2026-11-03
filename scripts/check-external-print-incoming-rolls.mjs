import assert from "node:assert/strict";
import { isValidIncomingRollsLine, incomingRollsLabel } from "../shared/externalPrintQuantity.js";
import { resolvePublishedRow } from "../server/orderDraftPublishedPricing.mjs";
import { assertOrderConfirmationPriceSources } from "../server/orderConfirmationPriceSource.mjs";
import { getDraftMissingFields } from "../src/domain/officeRules.js";
import { buildRecordProductionReportTransactionQuery, createLocalProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";

// 负责人 2026-11-03：同行只说「送来 10 卷料印」、不说印多少个。下单只填卷数，数量 0；
// 印完按实际印好的数量定档、计价，交付按实际数量收费。
const line = { id: "L1", orderType: "external_print", qtyBasis: "incoming_rolls", incomingRollCount: 10, qty: 0, printColor: "红", printSide: "单面",
  customerId: "C1", size: "40*32", color: "白", product: "同行A标" };
assert.equal(isValidIncomingRollsLine(line), true);
assert.equal(isValidIncomingRollsLine({ ...line, incomingRollCount: 0 }), false);
assert.equal(isValidIncomingRollsLine({ ...line, qty: 500 }), false, "a line ordered by rolls has no ordered quantity");
assert.equal(isValidIncomingRollsLine({ ...line, orderType: "custom_print" }), false, "only external print may be ordered by rolls");
assert.equal(incomingRollsLabel(line), "按来料 10 卷印，数量待印完");
assert.deepEqual(getDraftMissingFields(line).filter((field) => /数量|卷数/.test(field)), []);
assert.deepEqual(getDraftMissingFields({ ...line, incomingRollCount: "" }).filter((field) => /数量|卷数/.test(field)), ["来料卷数"]);

const source = { priceTable: { id: "PT-1", versionNo: 1 }, priceItems: [] };
const pending = resolvePublishedRow(source, line);
assert.deepEqual([pending.bagPrice, pending.printPrice, pending.amount], [0, 0, 0]);
assert.equal(pending.sourceEvidence.pricedOnActualPrints, true);
assert.equal(pending.sourceEvidence.incomingRollCount, 10);
assert.throws(() => resolvePublishedRow(source, { ...line, incomingRollCount: 0 }), (error) => /来料卷数/.test(error.message));

// Confirmation accepts the zero-priced line only as a priced-on-actual external print line.
const confirmSnapshot = { orderLineId: "OL-1", bagPrice: 0, printPrice: 0, otherFee: 0, finalAmount: 0, chargeableQty: 0, sourceEvidence: pending.sourceEvidence };
assertOrderConfirmationPriceSources({ orderLines: [{ id: "OL-1", orderType: "external_print", qtyBasis: "incoming_rolls", incomingRollCount: 10, qty: 0 }], priceSnapshots: [confirmSnapshot] });
assert.throws(() => assertOrderConfirmationPriceSources({ orderLines: [{ id: "OL-1", orderType: "custom_print", qty: 0 }], priceSnapshots: [confirmSnapshot] }),
  (error) => error.code === "ORDER_PRICE_SOURCE_REQUIRED", "a zero price is never accepted for an ordinary line");

// Completion writes the actual-quantity price snapshot in the same transaction.
const actualSnapshot = { priceSnapshotId: "PS-ACTUAL-OL-1", orderLineId: "OL-1", snapshotType: "actual_print_quantity", versionNo: 1, printPrice: 0.09,
  chargeableQty: 4960, finalAmount: 446.4, createdBy: "U-W", createdAt: "2026-11-04T01:00:00.000Z", sourceEvidence: { kind: "external_print_actual_quantity" } };
const input = {
  workspace: { productionTasks: [], workshopReports: [], priceSnapshots: [] },
  productionTask: { productionTaskId: "PT-1", orderLineId: "OL-1", taskType: "丝印", machineId: "SILK-01", plannedQty: 0, taskStatus: "已完成", revision: 1 },
  workshopReport: { reportId: "WR-1", productionTaskId: "PT-1", orderLineId: "OL-1", processType: "丝印", qualifiedQty: 4960, exceptionQty: 0, completedAt: "2026-11-04T01:00:00.000Z" },
  orderLine: { orderLineId: "OL-1", orderType: "external_print", qtyBasis: "incoming_rolls", lineStatus: "待打包", revision: 1 },
  packingTask: { packingTaskId: "PKT-OL-1", orderLineId: "OL-1", plannedQty: 4960, actualPackedQty: 0, status: "待打包" },
  priceSnapshots: [actualSnapshot],
  operationLog: { id: "LOG-1", targetType: "production_task", targetId: "PT-1", action: "complete_external_print_report", operatorId: "U-W" },
};
const query = buildRecordProductionReportTransactionQuery(input);
assert.match(query.text, /inserted_price_snapshots AS \(\s*INSERT INTO price_snapshots/);
assert.match(query.text, /'priceSnapshots', \(SELECT COALESCE\(json_agg\(result\)/);
assert.throws(() => buildRecordProductionReportTransactionQuery({ ...input, priceSnapshots: [{ ...actualSnapshot, chargeableQty: 5000 }] }),
  (error) => /PRODUCTION_PROCESS_EFFECT_MISMATCH/.test(error.code ?? error.message), "the priced quantity must be the reported good prints");
assert.throws(() => buildRecordProductionReportTransactionQuery({ ...input, orderLine: { ...input.orderLine, qtyBasis: "pieces" } }),
  (error) => /PRODUCTION_PROCESS_EFFECT_MISMATCH/.test(error.code ?? error.message), "only a line ordered by rolls is priced at completion");

const repository = createLocalProductionPackingTransactionRepository();
const saved = repository.recordProductionReport(structuredClone(input));
assert.equal(saved.priceSnapshots[0].chargeableQty, 4960);
console.log("External print by incoming rolls: zero-quantity order, confirmation accepted only for this case, priced on the actual good prints at completion.");
