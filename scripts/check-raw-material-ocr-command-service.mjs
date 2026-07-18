import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyRawMaterialInboundAction } from "../server/rawMaterialInboundRepository.mjs";
import { applyRawMaterialOcrReparse } from "../server/rawMaterialInboundOcrSupport.mjs";
import { createRawMaterialCommandService } from "../server/services/rawMaterialCommandService.mjs";

const repositorySource = readFileSync(new URL("../server/rawMaterialInboundRepository.mjs", import.meta.url), "utf8");
assert.match(repositorySource, /applyRawMaterialOcrReparse/);
assert.ok(repositorySource.split("\n").length <= 2_100, "repository should keep OCR, storage, query, and concurrency rules delegated");

const reparseBefore = {
  id: "RMI-REPARSE-001",
  revision: 3,
  status: "已识别待复核",
  ocrProvider: "tencent_cloud_table_v3",
  ocrParserVersion: 3,
  sourceAttachmentId: "ATT-001",
  rolls: [{ id: "ROLL-001", inventoryStatus: "不可用" }],
};
const reparsed = applyRawMaterialOcrReparse({
  before: reparseBefore,
  reparsedInbound: {
    id: "RMI-REPARSE-001",
    ocrParserVersion: 4,
    supplierName: "供应商A",
    rolls: [{ id: "ROLL-001", inventoryStatus: "不可用" }],
  },
});
assert.equal(reparsed.ocrParserVersion, 4);
assert.equal(reparsed.revision, 3);
assert.equal(reparsed.sourceAttachmentId, "ATT-001");
assert.throws(
  () => applyRawMaterialOcrReparse({
    before: reparseBefore,
    reparsedInbound: { id: "RMI-REPARSE-001", ocrParserVersion: 4, rolls: [{ id: "ROLL-001", inventoryStatus: "可用" }] },
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REPARSE_AVAILABLE_INVENTORY_FORBIDDEN",
);

let ocrCalls = 0;
let attachmentCalls = 0;
let parserCalls = 0;
let reparseCalls = 0;
const workspace = {
  users: [{ id: "U-OFFICE", displayName: "办公室复核员" }],
  operationLogs: [],
  rawMaterialInbounds: [],
  rawMaterialInboundRepository: {
    async createRawMaterialInboundDraft(input) {
      workspace.rawMaterialInbounds.unshift(input.inbound);
      return { inbound: input.inbound, operationLog: input.operationLog, deduplicated: false };
    },
    async recordRawMaterialInboundAction(input) {
      reparseCalls += 1;
      const result = applyRawMaterialInboundAction({
        workspace,
        inbounds: workspace.rawMaterialInbounds,
        inboundId: input.inboundId,
        action: input.action,
        body: input.body,
        operatorId: input.operatorId,
        operatorName: input.operatorName,
      });
      workspace.rawMaterialInbounds = result.inbounds;
      return { inbound: result.inbound, operationLog: result.operationLog };
    },
  },
};
const service = createRawMaterialCommandService({
  attachmentCreateCommandService: {
    async createAttachment({ body }) {
      attachmentCalls += 1;
      assert.equal(body.purpose, "raw_material_delivery_note");
      assert.equal(body.ownerType, "raw_material_inbound");
      assert.equal("secretId" in body.metadata, false);
      return { ok: true, attachment: { attachmentId: "ATT-OCR-1" }, deduplicated: false };
    },
  },
  buildOperationLog(_workspace, input) {
    return { ...input, occurredAt: "2026-07-16T08:00:00.000Z", createdAt: "2026-07-16T08:00:00.000Z" };
  },
  nextId(prefix, rows) {
    return `${prefix}-${rows.length + 1}`;
  },
  rawMaterialOcrParserService: {
    parserVersion: 4,
    buildInboundDraft({ inboundId, ocr }) {
      parserCalls += 1;
      return {
        id: inboundId,
        supplierName: "待复核供应商",
        deliveryNoteNo: "",
        materialType: "无纺布",
        productName: "无纺布",
        spec: "90克*1.6米",
        rollCount: 2,
        unit: "kg",
        status: "已识别待复核",
        ocrProvider: "tencent_cloud_table_v3",
        ocrAction: ocr.action,
        ocrRequestId: ocr.requestId,
        ocrParserVersion: 4,
        ocrReviewFields: [
          { key: "supplierName", label: "供应商", recognizedValue: "待复核供应商", value: "待复核供应商", confidence: 72, required: true },
          { key: "materialType", label: "材料", recognizedValue: "无纺布", value: "无纺布", confidence: 96, required: true },
          { key: "productName", label: "品名", recognizedValue: "无纺布", value: "无纺布", confidence: 96, required: true },
          { key: "spec", label: "规格", recognizedValue: "90克*1.6米", value: "90克*1.6米", confidence: 96, required: true },
          { key: "rollCount", label: "卷数", recognizedValue: 2, value: 2, confidence: 96, required: true },
          { key: "unit", label: "单位", recognizedValue: "kg", value: "kg", confidence: 96, required: true },
        ],
        ocrLines: [{
          lineId: "OCR-1",
          sourceText: "无纺布",
          reviewStatus: "待人工复核",
          values: {
            productName: "无纺布",
            materialType: "无纺布",
            supplierColor: "",
            spec: "90克*1.6米",
            rollCount: 2,
            totalWeightKg: 0,
            unit: "kg",
            unitPrice: 0,
            amount: 0,
            supplierRollNo: "",
            rollWeightsKg: [],
          },
          confidences: {},
        }],
        ocrTableRows: [[[["规格", "数量"], ["90克*1.6米", "2"]]]],
        rolls: [
          { id: "RM-1", inventoryStatus: "不可用", labelStatus: "待人工复核" },
          { id: "RM-2", inventoryStatus: "不可用", labelStatus: "待人工复核" },
        ],
      };
    },
  },
  tencentCloudTableOcrService: {
    async recognizeTable() {
      ocrCalls += 1;
      return { action: "RecognizeTableAccurateOCR", requestId: "req-ocr-1", tables: [] };
    },
  },
});

const body = {
  fileName: "送货单.png",
  mimeType: "image/png",
  fileSize: 4,
  contentDataUrl: "data:image/png;base64,dGVzdA==",
};
const created = await service.recognizeDeliveryNote({ workspace, body, operatorId: "U-OFFICE" });
assert.equal(created.inbound.status, "已识别待复核");
assert.equal(created.inbound.sourceAttachmentId, "ATT-OCR-1");
assert.equal(created.inbound.rolls.every((roll) => roll.inventoryStatus === "不可用"), true);
assert.equal(created.deduplicated, false);
assert.equal(ocrCalls, 1);
assert.equal(attachmentCalls, 1);
assert.equal(workspace.operationLogs[0].action, "recognize_raw_material_delivery_note");

created.inbound.ocrParserVersion = 3;
const duplicate = await service.recognizeDeliveryNote({ workspace, body, operatorId: "U-OFFICE" });
assert.equal(duplicate.deduplicated, true);
assert.equal(duplicate.inbound.id, created.inbound.id);
assert.equal(duplicate.inbound.ocrParserVersion, 4);
assert.equal(ocrCalls, 1, "duplicate source content must not consume another OCR call");
assert.equal(attachmentCalls, 1, "duplicate source content must not store another attachment");
assert.equal(parserCalls, 2, "stale duplicate must be reparsed from saved table rows");
assert.equal(reparseCalls, 1);
assert.equal(workspace.operationLogs[0].action, "reparse_ocr");

assert.throws(
  () => applyRawMaterialInboundAction({
    workspace,
    inbounds: workspace.rawMaterialInbounds,
    inboundId: created.inbound.id,
    action: "review",
    operatorId: "U-OFFICE",
    operatorName: "办公室复核员",
    body: {
      expectedRevision: duplicate.inbound.revision,
      reviewFields: { supplierName: "", materialType: "", productName: "", spec: "", rollCount: 0, unit: "" },
    },
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_REQUIRED_FIELDS_MISSING",
);

const reviewed = applyRawMaterialInboundAction({
  workspace,
  inbounds: workspace.rawMaterialInbounds,
  inboundId: created.inbound.id,
  action: "review",
  operatorId: "U-OFFICE",
  operatorName: "办公室复核员",
  body: {
    expectedRevision: duplicate.inbound.revision,
    now: "2026-07-16T09:00:00.000Z",
    reviewFields: {
      supplierName: "白侯无纺布有限公司",
      materialType: "无纺布",
      productName: "无纺布",
      spec: "90克*1.6米",
      rollCount: 2,
      unit: "kg",
    },
    lineReviews: [{
      lineId: "OCR-1",
      values: {
        productName: "无纺布",
        materialType: "无纺布",
        supplierColor: "",
        spec: "90克*1.6米",
        rollCount: 2,
        totalWeightKg: 0,
        unit: "kg",
        unitPrice: 0,
        amount: 0,
        supplierRollNo: "",
        rollWeightsKg: [],
      },
    }],
  },
});
assert.equal(reviewed.inbound.status, "已复核待打印标签");
assert.equal(reviewed.inbound.supplierName, "白侯无纺布有限公司");
assert.equal(reviewed.inbound.ocrReviewFields.find((field) => field.key === "supplierName").reviewStatus, "人工修改");
assert.equal(reviewed.inbound.ocrLines[0].reviewStatus, "人工接受");
assert.equal(reviewed.inbound.ocrLines[0].recognizedValues.spec, "90克*1.6米");
assert.equal(reviewed.inbound.rolls.every((roll) => roll.inventoryStatus === "不可用"), true);
assert.equal(reviewed.inbound.rolls.every((roll) => roll.labelStatus === "待打印标签"), true);

console.log("Raw-material OCR command checks passed: backend orchestration, attachment ownership, content deduplication, required human review, and unavailable inventory are covered.");
