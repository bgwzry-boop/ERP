import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRawMaterialCommandService } from "../server/services/rawMaterialCommandService.mjs";
import { createRawMaterialOcrParserService } from "../server/services/rawMaterialOcrParserService.mjs";
import { hasStrongRawMaterialSupplierReturnEvidence } from "../shared/rawMaterialSupplierReturn.js";

// Anonymous supplier-note cells and synthetic photo bytes only. Every write is
// confined to the in-memory repository; no cloud, attachment store or stock API.
const operatorId = "TEST-RETURN-REVIEWER";
const supplierName = "人意无纺布";
const capturedAt = "2026-10-31T08:00:00.000Z";
const contentDataUrl = "data:image/png;base64,c3ludGhldGljLXJldHVybi1waG90bw==";
const sourceDigest = createHash("sha256").update(contentDataUrl).digest("hex");
const rows = [
  ["人意无纺布销售单"],
  ["商品名称", "颜色", "数量", "重量", "单价", "金额"],
  ["退带色布", "1", "-68", "11.8", "-802.4"],
  ["本单金额", "-802.40"],
];
const ocr = {
  provider: "tencent_cloud_table_v3", action: "RecognizeTableAccurateOCR", requestId: "TEST-OCR-REQUEST",
  tables: [{ cells: rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 96 }))) }],
};
const parser = createRawMaterialOcrParserService();
const capture = { fileName: "synthetic-return.png", mimeType: "image/png", contentDataUrl, documentDirectionHint: "supplier_delivery", supplierNameHint: supplierName };

function oldDelivery({ version = parser.parserVersion, supplier = supplierName } = {}) {
  const generated = parser.buildInboundDraft({ inboundId: "RMI-OLD-RETURN-GUARD", documentDirectionHint: "supplier_return", supplierNameHint: supplier, knownSupplierNames: [supplier], ocr, recognizedAt: capturedAt });
  const absValues = (values = {}) => ({ ...values, totalWeightKg: Math.abs(values.totalWeightKg), amount: Math.abs(values.amount), rollWeightsKg: values.rollWeightsKg?.map(Math.abs) ?? [] });
  return {
    ...generated,
    revision: 1, ocrParserVersion: version, documentDirection: "supplier_delivery", documentCaptureDirection: "supplier_delivery", documentDirectionSource: "operator_capture_selection", documentTypeLabel: "送货单",
    totalWeightKg: 68, amount: 802.4, ocrCalculatedLineWeightKg: 68, ocrCalculatedLineAmount: 802.4,
    ocrReviewFields: generated.ocrReviewFields.map(field => ["totalWeightKg", "amount"].includes(field.key) ? { ...field, value: Math.abs(field.value), recognizedValue: Math.abs(field.recognizedValue) } : field),
    ocrLines: generated.ocrLines.map(line => ({ ...line, values: absValues(line.values), recognizedValues: absValues(line.recognizedValues ?? line.values) })),
    rolls: [{ id: "RM-OLD-ROLL-01", weightKg: 68, inventoryStatus: "待人工复核", labelStatus: "待人工复核" }],
    sourceAttachmentId: "ATT-ORIGINAL-RETURN", sourceAttachmentIds: ["ATT-ORIGINAL-RETURN"], sourceFileName: "original-return.jpg", sourceFileNames: ["original-return.jpg"],
    ocrSourceDigest: sourceDigest, ocrRecognizedAt: capturedAt,
  };
}

function setup(seed = []) {
  const calls = { cloud: 0, attachment: 0, actions: 0 };
  const workspace = { users: [{ id: operatorId, displayName: "测试复核员" }], suppliers: [{ name: supplierName }, { name: "人意无纺布供应商" }], rawMaterialInbounds: structuredClone(seed), operationLogs: [], colorAliases: [], standardColors: [] };
  workspace.rawMaterialInboundRepository = {
    async createRawMaterialInboundDraft({ inbound, operationLog }) {
      workspace.rawMaterialInbounds.unshift(inbound);
      return { inbound, operationLog, deduplicated: false };
    },
    async applyInboundAction(input) {
      calls.actions += 1;
      const result = input.decide({ workspace, inbounds: workspace.rawMaterialInbounds });
      workspace.rawMaterialInbounds = result.inbounds;
      return result;
    },
  };
  const service = createRawMaterialCommandService({
    rawMaterialOcrParserService: parser,
    attachmentCreateCommandService: { async createAttachment() { calls.attachment += 1; return { ok: true, attachment: { attachmentId: "ATT-NEW-RETURN" } }; } },
    tencentCloudTableOcrService: { async recognizeTable() { calls.cloud += 1; return structuredClone(ocr); } },
    buildOperationLog(_workspace, input) { return { ...input, occurredAt: capturedAt, createdAt: capturedAt }; },
    nextId(prefix, list) { return `${prefix}-${list.length + 1}`; },
  });
  return { workspace, calls, service };
}

function sourceUnchanged(before, after) {
  for (const field of ["sourceAttachmentId", "sourceAttachmentIds", "sourceFileName", "sourceFileNames", "ocrSourceDigest", "ocrRecognizedAt", "ocrRequestId", "ocrTableRows"]) {
    assert.deepEqual(after[field], before[field], field);
  }
  assert.equal(after.status, "已识别待复核");
  assert.equal(after.rolls.some(roll => roll.inventoryStatus === "可用"), false);
  assert.equal(after.documentCaptureDirection, "supplier_delivery", "retain the original photo-time choice separately from its interpreted direction");
}

const first = setup();
const newlyRecognized = await first.service.recognizeDeliveryNote({ workspace: first.workspace, body: capture, operatorId });
assert.equal(newlyRecognized.error, undefined);
assert.equal(newlyRecognized.inbound.documentDirection, "supplier_return");
assert.equal(newlyRecognized.inbound.totalWeightKg, -68);
assert.equal(newlyRecognized.inbound.amount, -802.4);
assert.equal(newlyRecognized.inbound.status, "已识别待复核");
assert.deepEqual(newlyRecognized.inbound.rolls, []);
assert.equal(newlyRecognized.inbound.documentCaptureDirection, "supplier_delivery");
assert.equal(newlyRecognized.inbound.documentDirectionSource, "ocr_return_evidence_over_capture_selection");
assert.equal(first.calls.cloud, 1);
assert.equal(first.calls.attachment, 1);

for (const { label, version, hints } of [
  { label: "current parser, changed capture direction", version: parser.parserVersion, hints: { documentDirectionHint: "supplier_return" } },
  { label: "old parser, delivery capture", version: parser.parserVersion - 1, hints: { documentDirectionHint: "supplier_delivery" } },
  { label: "old parser, omitted capture hints", version: parser.parserVersion - 1, hints: { documentDirectionHint: undefined, supplierNameHint: undefined } },
  { label: "current parser, supplier correction", version: parser.parserVersion, hints: { documentDirectionHint: "supplier_return", supplierNameHint: "人意无纺布供应商" } },
]) {
  const before = oldDelivery({ version });
  const { workspace, service, calls } = setup([before]);
  const result = await service.recognizeDeliveryNote({ workspace, operatorId, body: { ...capture, ...hints } });
  assert.equal(result.error, undefined, label);
  assert.equal(result.deduplicated, true, label);
  assert.equal(result.inbound.documentDirection, "supplier_delivery", label);
  assert.equal(hasStrongRawMaterialSupplierReturnEvidence(result.inbound), true, `${label}: retain the explicit conflict gate`);
  sourceUnchanged(before, result.inbound);
  assert.equal(calls.cloud, 0, label);
  assert.equal(calls.attachment, 0, label);
  assert.equal(workspace.rawMaterialInbounds.length, 1, label);
}

for (const hints of [{}, { documentDirectionHint: "supplier_delivery" }, { supplierNameHint: "人意无纺布供应商" }]) {
  const before = oldDelivery({ version: parser.parserVersion - 1 });
  const { workspace, service, calls } = setup([before]);
  const result = await service.recordInboundAction({ workspace, inboundId: before.id, actionSlug: "reparse-ocr", operatorId, body: { expectedRevision: 1, ...hints } });
  assert.equal(result.error, undefined);
  assert.equal(result.inbound.documentDirection, "supplier_delivery", "a parser or supplier correction is not a direction confirmation");
  sourceUnchanged(before, result.inbound);
  assert.equal(calls.cloud, 0);
  assert.equal(calls.attachment, 0);
}

const beforeCorrection = oldDelivery();
const correction = setup([beforeCorrection]);
const corrected = await correction.service.recordInboundAction({ workspace: correction.workspace, inboundId: beforeCorrection.id, actionSlug: "reparse-ocr", operatorId, body: { expectedRevision: 1, documentDirectionHint: "supplier_return" } });
assert.equal(corrected.error, undefined);
assert.equal(corrected.inbound.documentDirection, "supplier_return");
assert.equal(corrected.inbound.documentCaptureDirection, "supplier_delivery");
assert.equal(corrected.inbound.revision, 2);
assert.equal(corrected.inbound.totalWeightKg, -68);
assert.equal(corrected.inbound.amount, -802.4);
assert.deepEqual(corrected.inbound.rolls, []);
sourceUnchanged(beforeCorrection, corrected.inbound);
assert.ok(corrected.operationLogId);
assert.equal(correction.workspace.operationLogs.length, 1);
assert.equal(correction.workspace.operationLogs[0].action, "reparse_ocr");
assert.equal(correction.workspace.operationLogs[0].operatorId, operatorId);
const replayCapture = await correction.service.recognizeDeliveryNote({ workspace: correction.workspace, operatorId, body: capture });
assert.equal(replayCapture.error, undefined);
assert.equal(replayCapture.inbound.documentDirection, "supplier_return", "a later delivery capture choice cannot revert a saved return");
assert.equal(replayCapture.inbound.revision, 2);
assert.deepEqual(replayCapture.inbound.rolls, []);
assert.equal(correction.workspace.operationLogs.length, 1);
assert.equal(correction.calls.cloud, 0);
assert.equal(correction.calls.attachment, 0);
const stale = await correction.service.recordInboundAction({ workspace: correction.workspace, inboundId: beforeCorrection.id, actionSlug: "reparse-ocr", operatorId, body: { expectedRevision: 1, documentDirectionHint: "supplier_return" } });
assert.equal(stale.code, "RAW_MATERIAL_INBOUND_WRITE_CONFLICT");
assert.equal(correction.workspace.operationLogs.length, 1);

const automaticReturn = { ...structuredClone(newlyRecognized.inbound), ocrParserVersion: parser.parserVersion - 1 };
const autoRefresh = setup([automaticReturn]);
const refreshedAutoReturn = await autoRefresh.service.recordInboundAction({ workspace: autoRefresh.workspace, inboundId: automaticReturn.id, actionSlug: "reparse-ocr", operatorId, body: { expectedRevision: automaticReturn.revision } });
assert.equal(refreshedAutoReturn.error, undefined);
assert.equal(refreshedAutoReturn.inbound.documentDirection, "supplier_return");
assert.equal(refreshedAutoReturn.inbound.documentDirectionSource, "ocr_return_evidence_over_capture_selection", "an upgrade must not replace an automatic decision with a fictional operator choice");
assert.equal(refreshedAutoReturn.inbound.documentCaptureDirection, "supplier_delivery");
sourceUnchanged(automaticReturn, refreshedAutoReturn.inbound);
assert.deepEqual(refreshedAutoReturn.inbound.rolls, []);
assert.equal(autoRefresh.calls.cloud, 0);
assert.equal(autoRefresh.calls.attachment, 0);

const reviewed = { ...corrected.inbound, status: "退货单已复核" };
const frozen = setup([reviewed]);
const rejected = await frozen.service.recordInboundAction({ workspace: frozen.workspace, inboundId: reviewed.id, actionSlug: "reparse-ocr", operatorId, body: { expectedRevision: reviewed.revision, documentDirectionHint: "supplier_delivery" } });
assert.equal(rejected.error, true);
assert.deepEqual(frozen.workspace.rawMaterialInbounds[0], reviewed);
assert.equal(frozen.calls.actions, 0);

console.log("PASS return direction guards: new captures auto-classify; saved drafts retain direction through duplicate capture, parser/supplier refresh and retries; explicit audited correction keeps original photo/table evidence, no cloud retry or usable inventory.");
