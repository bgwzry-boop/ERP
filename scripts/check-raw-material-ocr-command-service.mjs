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
  ocrParserVersion: 4,
  sourceAttachmentId: "ATT-001",
  rolls: [{ id: "ROLL-001", inventoryStatus: "不可用" }],
};
const reparsed = applyRawMaterialOcrReparse({
  before: reparseBefore,
  reparsedInbound: {
    id: "RMI-REPARSE-001",
    ocrParserVersion: 5,
    supplierName: "供应商A",
    rolls: [{ id: "ROLL-001", inventoryStatus: "不可用" }],
  },
});
assert.equal(reparsed.ocrParserVersion, 5);
assert.equal(reparsed.revision, 3);
assert.equal(reparsed.sourceAttachmentId, "ATT-001");
assert.throws(
  () => applyRawMaterialOcrReparse({
    before: reparseBefore,
    reparsedInbound: { id: "RMI-REPARSE-001", ocrParserVersion: 5, rolls: [{ id: "ROLL-001", inventoryStatus: "可用" }] },
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REPARSE_AVAILABLE_INVENTORY_FORBIDDEN",
);
const sameVersionDirectionCorrection = applyRawMaterialOcrReparse({
  before: { ...reparseBefore, ocrParserVersion: 5, documentDirection: "supplier_delivery" },
  reparsedInbound: {
    id: reparseBefore.id,
    ocrParserVersion: 5,
    documentDirection: "supplier_return",
    documentDirectionSource: "operator_capture_selection",
    rolls: [],
  },
});
assert.equal(sameVersionDirectionCorrection.documentDirection, "supplier_return");
assert.equal(sameVersionDirectionCorrection.documentDirectionSource, "operator_capture_selection");

let ocrCalls = 0;
let activeOcrCalls = 0;
let maxConcurrentOcrCalls = 0;
let attachmentCalls = 0;
let parserCalls = 0;
let reparseCalls = 0;
let parsedDeliveryNoteNo = "";
const workspace = {
  users: [{ id: "U-OFFICE", displayName: "办公室复核员" }],
  attachments: [],
  operationLogs: [],
  rawMaterialInbounds: [],
  attachmentRepository: {
    async findAttachmentById({ attachmentId }) {
      return workspace.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
    },
  },
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
      return { ok: true, attachment: { attachmentId: `ATT-OCR-${attachmentCalls}` }, deduplicated: false };
    },
  },
  buildOperationLog(_workspace, input) {
    return { ...input, occurredAt: "2026-07-16T08:00:00.000Z", createdAt: "2026-07-16T08:00:00.000Z" };
  },
  nextId(prefix, rows) {
    return `${prefix}-${rows.length + 1}`;
  },
  rawMaterialOcrParserService: {
    parserVersion: 5,
    buildInboundDraft({ documentDirectionHint, inboundId, ocr }) {
      parserCalls += 1;
      const isSupplierReturn = documentDirectionHint === "supplier_return";
      return {
        id: inboundId,
        documentDirection: isSupplierReturn ? "supplier_return" : "supplier_delivery",
        documentDirectionSource: isSupplierReturn ? "operator_capture_selection" : "ocr_inference",
        documentTypeLabel: isSupplierReturn ? "退货单" : "送货单",
        supplierName: "待复核供应商",
        deliveryNoteNo: parsedDeliveryNoteNo,
        materialType: "无纺布",
        productName: isSupplierReturn ? "布" : "无纺布",
        supplierColor: isSupplierReturn ? "彩色" : "本白",
        spec: isSupplierReturn ? "" : "90克*1.6米",
        rollCount: 2,
        totalWeightKg: isSupplierReturn ? -100 : 100,
        unit: "kg",
        unitPrice: 9.5,
        amount: isSupplierReturn ? -950 : 950,
        status: "已识别待复核",
        ocrProvider: "tencent_cloud_table_v3",
        ocrAction: ocr.action,
        ocrRequestId: ocr.requestId,
        ocrParserVersion: 5,
        ocrPageCount: ocr.pageCount ?? 1,
        ocrPages: ocr.pages ?? [],
        ocrReviewFields: [
          { key: "supplierName", label: "供应商", recognizedValue: "待复核供应商", value: "待复核供应商", confidence: 72, required: true },
          { key: "materialType", label: "材料", recognizedValue: "无纺布", value: "无纺布", confidence: 96, required: true },
          { key: "productName", label: "品名", recognizedValue: isSupplierReturn ? "布" : "无纺布", value: isSupplierReturn ? "布" : "无纺布", confidence: 96, required: true },
          { key: "spec", label: "规格", recognizedValue: isSupplierReturn ? "" : "90克*1.6米", value: isSupplierReturn ? "" : "90克*1.6米", confidence: 96, required: !isSupplierReturn },
          { key: "rollCount", label: "卷数", recognizedValue: 2, value: 2, confidence: 96, required: true },
          { key: "unit", label: "单位", recognizedValue: "kg", value: "kg", confidence: 96, required: true },
        ],
        ocrLines: [{
          lineId: "OCR-1",
          sourceText: isSupplierReturn ? "布 彩色 -100 9.5 -950" : "无纺布",
          reviewStatus: "待人工复核",
          values: {
            productName: isSupplierReturn ? "布" : "无纺布",
            materialType: "无纺布",
            supplierColor: isSupplierReturn ? "彩色" : "本白",
            returnMaterialCategory: isSupplierReturn ? "彩布" : "",
            spec: isSupplierReturn ? "" : "90克*1.6米",
            rollCount: 2,
            totalWeightKg: isSupplierReturn ? -100 : 100,
            unit: "kg",
            unitPrice: 9.5,
            amount: isSupplierReturn ? -950 : 950,
            supplierRollNo: "",
            rollWeightsKg: isSupplierReturn ? [-50, -50] : [50, 50],
          },
          confidences: {},
        }],
        ocrTableRows: [[[["规格", "数量"], ["90克*1.6米", "2"]]]],
        rolls: isSupplierReturn ? [] : [
          { id: "RM-1", inventoryStatus: "不可用", labelStatus: "待人工复核" },
          { id: "RM-2", inventoryStatus: "不可用", labelStatus: "待人工复核" },
        ],
      };
    },
  },
  async sleep() {},
  tencentCloudTableOcrService: {
    async recognizeTable() {
      ocrCalls += 1;
      const callNumber = ocrCalls;
      activeOcrCalls += 1;
      maxConcurrentOcrCalls = Math.max(maxConcurrentOcrCalls, activeOcrCalls);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeOcrCalls -= 1;
      return { action: "RecognizeTableAccurateOCR", requestId: `req-ocr-${callNumber}`, tables: [] };
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

created.inbound.ocrParserVersion = 4;
const duplicate = await service.recognizeDeliveryNote({ workspace, body, operatorId: "U-OFFICE" });
assert.equal(duplicate.deduplicated, true);
assert.equal(duplicate.inbound.id, created.inbound.id);
assert.equal(duplicate.inbound.ocrParserVersion, 5);
assert.equal(ocrCalls, 1, "duplicate source content must not consume another OCR call");
assert.equal(attachmentCalls, 1, "duplicate source content must not store another attachment");
assert.equal(parserCalls, 2, "stale duplicate must be reparsed from saved table rows");
assert.equal(reparseCalls, 1);
assert.equal(workspace.operationLogs[0].action, "reparse_ocr");

const oldReturnCandidate = {
  ...duplicate.inbound,
  id: "RMI-OCR-OLD-RETURN-DIRECTION",
  revision: 1,
  documentDirection: "supplier_delivery",
  documentDirectionSource: "operator_capture_selection",
  ocrSourceDigest: "old-return-direction-correction-test",
};
workspace.rawMaterialInbounds.unshift(oldReturnCandidate);
const ocrCallsBeforeDirectionCorrection = ocrCalls;
const correctedReturn = await service.recordInboundAction({
  workspace,
  inboundId: oldReturnCandidate.id,
  actionSlug: "reparse-ocr",
  operatorId: "U-OFFICE",
  body: {
    expectedRevision: oldReturnCandidate.revision,
    documentDirectionHint: "supplier_return",
  },
});
assert.equal(correctedReturn.inbound.documentDirection, "supplier_return");
assert.equal(correctedReturn.inbound.documentDirectionSource, "operator_capture_selection");
assert.equal(correctedReturn.inbound.spec, "", "old return drafts may remain without a printed specification");
assert.equal(correctedReturn.inbound.ocrLines[0].values.returnMaterialCategory, "彩布");
assert.equal(correctedReturn.inbound.totalWeightKg, -100);
assert.equal(correctedReturn.inbound.rolls.length, 0);
assert.equal(ocrCalls, ocrCallsBeforeDirectionCorrection, "direction correction must reparse saved tables without another cloud OCR call");
assert.equal(parserCalls, 3);

const multipageBody = {
  pages: [
    { fileName: "腾胜-第一页.jpg", mimeType: "image/jpeg", contentDataUrl: "data:image/jpeg;base64,cGFnZS0x" },
    { fileName: "腾胜-第二页.jpg", mimeType: "image/jpeg", contentDataUrl: "data:image/jpeg;base64,cGFnZS0y" },
  ],
};
const multipage = await service.recognizeDeliveryNote({ workspace, body: multipageBody, operatorId: "U-OFFICE" });
assert.equal(multipage.inbound.ocrPageCount, 2);
assert.deepEqual(multipage.attachmentIds, ["ATT-OCR-2", "ATT-OCR-3"]);
assert.deepEqual(multipage.inbound.sourceFileNames, ["腾胜-第一页.jpg", "腾胜-第二页.jpg"]);
assert.equal(ocrCalls, 3, "each physical page is sent to OCR once");
assert.equal(maxConcurrentOcrCalls, 1, "physical pages must be recognized sequentially to stay below Tencent OCR rate limits");
assert.equal(attachmentCalls, 3, "each source page is preserved as its own audit attachment");

let throttledAttempts = 0;
const throttledService = createRawMaterialCommandService({
  attachmentCreateCommandService: {
    async createAttachment() {
      throw new Error("the pre-uploaded source attachment must be reused");
    },
  },
  buildOperationLog() {
    return { id: "OP-THROTTLED", action: "recognize_raw_material_delivery_note" };
  },
  nextId(prefix) {
    return `${prefix}-THROTTLED`;
  },
  rawMaterialOcrParserService: {
    buildInboundDraft({ inboundId, ocr }) {
      return {
        id: inboundId,
        status: "已识别待复核",
        ocrProvider: "tencent_cloud_table_v3",
        ocrAction: ocr.action,
        ocrRequestId: ocr.requestId,
        ocrPageCount: ocr.pageCount,
        ocrPages: ocr.pages,
        ocrReviewFields: [],
        ocrLines: [],
        ocrTableRows: [],
        rolls: [],
      };
    },
  },
  async sleep() {},
  tencentCloudTableOcrService: {
    async recognizeTable() {
      throttledAttempts += 1;
      if (throttledAttempts === 1) {
        throw Object.assign(new Error("腾讯云 OCR 调用频率或额度已受限，请稍后重试。"), {
          statusCode: 429,
          code: "TENCENT_OCR_REQUEST_FAILED",
          details: { cloudCode: "RequestLimitExceeded" },
        });
      }
      return { action: "RecognizeTableAccurateOCR", requestId: "req-after-retry", tables: [] };
    },
  },
});
workspace.attachments.push({
  attachmentId: "ATT-THROTTLED",
  ownerType: "raw_material_inbound_capture",
  purpose: "raw_material_delivery_note",
  status: "uploaded",
  uploadedBy: "U-OFFICE",
  hasContent: true,
  contentDigest: "a".repeat(64),
});
const throttled = await throttledService.recognizeDeliveryNote({
  workspace,
  operatorId: "U-OFFICE",
  body: { pages: [{ contentDataUrl: "data:image/jpeg;base64,dGhyb3R0bGVk", sourceAttachmentId: "ATT-THROTTLED" }] },
});
assert.equal(throttled.inbound.status, "已识别待复核");
assert.equal(throttledAttempts, 2, "a transient Tencent rate limit must retry automatically");

workspace.attachments.push(
  {
    attachmentId: "ATT-CAPTURE-1",
    ownerType: "raw_material_inbound_capture",
    purpose: "raw_material_delivery_note",
    status: "uploaded",
    uploadedBy: "U-OFFICE",
    hasContent: true,
    contentDigest: "1".repeat(64),
  },
  {
    attachmentId: "ATT-CAPTURE-2",
    ownerType: "raw_material_inbound_capture",
    purpose: "raw_material_delivery_note",
    status: "uploaded",
    uploadedBy: "U-OFFICE",
    hasContent: true,
    contentDigest: "2".repeat(64),
  },
);
const binarySource = await service.recognizeDeliveryNote({
  workspace,
  operatorId: "U-OFFICE",
  body: {
    pages: [
      { fileName: "原图一.jpg", mimeType: "image/jpeg", contentDataUrl: "data:image/jpeg;base64,b2NyLTE=", sourceAttachmentId: "ATT-CAPTURE-1" },
      { fileName: "原图二.jpg", mimeType: "image/jpeg", contentDataUrl: "data:image/jpeg;base64,b2NyLTI=", sourceAttachmentId: "ATT-CAPTURE-2" },
    ],
  },
});
assert.deepEqual(binarySource.attachmentIds, ["ATT-CAPTURE-1", "ATT-CAPTURE-2"]);
assert.equal(attachmentCalls, 3, "pre-uploaded original binaries must not be copied into JSON attachments again");
assert.equal(binarySource.deduplicated, false, "a new inbound must not be reported as a duplicate merely because its sources were pre-uploaded");

const foreignSource = await service.recognizeDeliveryNote({
  workspace,
  operatorId: "U-OTHER",
  body: { pages: [{ contentDataUrl: "data:image/jpeg;base64,b2NyLTM=", sourceAttachmentId: "ATT-CAPTURE-1" }] },
});
assert.equal(foreignSource.code, "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_ATTACHMENT_INVALID");
const ocrCallsBeforeDuplicatePage = ocrCalls;
const duplicatePage = await service.recognizeDeliveryNote({
  workspace,
  body: { pages: [multipageBody.pages[0], multipageBody.pages[0]] },
  operatorId: "U-OFFICE",
});
assert.equal(duplicatePage.code, "RAW_MATERIAL_DELIVERY_NOTE_DUPLICATE_PAGE");
assert.equal(ocrCalls, ocrCallsBeforeDuplicatePage, "a duplicate page set must fail before consuming OCR calls");

parsedDeliveryNoteNo = "XS-2026-08-14-573";
workspace.rawMaterialInbounds.push({
  id: "RMI-HISTORICAL-573",
  revision: 2,
  status: "已复核待打印标签",
  supplierName: "待复核供应商",
  deliveryNoteNo: "XS 2026-08-14-573",
  rolls: [],
});
const duplicateDocumentBody = {
  fileName: "另一张同号送货单.jpg",
  mimeType: "image/jpeg",
  contentDataUrl: "data:image/jpeg;base64,YW5vdGhlci1kb2N1bWVudA==",
};
const duplicateDocumentBlocked = await service.recognizeDeliveryNote({
  workspace,
  body: duplicateDocumentBody,
  operatorId: "U-OFFICE",
});
assert.equal(duplicateDocumentBlocked.code, "RAW_MATERIAL_DELIVERY_NOTE_DUPLICATE_CONFIRMATION_REQUIRED");
assert.deepEqual(duplicateDocumentBlocked.details.duplicateInboundIds, ["RMI-HISTORICAL-573"]);
assert.match(duplicateDocumentBlocked.message, /已录入过/);
const duplicateDocumentConfirmed = await service.recognizeDeliveryNote({
  workspace,
  operatorId: "U-OFFICE",
  body: {
    ...duplicateDocumentBody,
    duplicateConfirmationToken: duplicateDocumentBlocked.details.confirmationToken,
  },
});
assert.equal(duplicateDocumentConfirmed.inbound.duplicateDocumentConfirmation.confirmed, true);
assert.deepEqual(duplicateDocumentConfirmed.inbound.duplicateDocumentConfirmation.duplicateInboundIds, ["RMI-HISTORICAL-573"]);
assert.notEqual(duplicateDocumentConfirmed.inbound.id, "RMI-HISTORICAL-573", "confirmed duplicates stay separate and are never auto-merged");

assert.throws(
  () => applyRawMaterialInboundAction({
    workspace,
    inbounds: workspace.rawMaterialInbounds,
    inboundId: duplicateDocumentConfirmed.inbound.id,
    action: "void_draft",
    operatorId: "U-OFFICE",
    operatorName: "办公室复核员",
    body: { expectedRevision: Number(duplicateDocumentConfirmed.inbound.revision) || 1 },
  }),
  (error) => error.code === "RAW_MATERIAL_INBOUND_DRAFT_VOID_REASON_REQUIRED",
);
const voidedDraft = applyRawMaterialInboundAction({
  workspace,
  inbounds: workspace.rawMaterialInbounds,
  inboundId: duplicateDocumentConfirmed.inbound.id,
  action: "void_draft",
  operatorId: "U-OFFICE",
  operatorName: "办公室复核员",
  serverNow: "2026-08-16T08:00:00.000Z",
  body: {
    expectedRevision: Number(duplicateDocumentConfirmed.inbound.revision) || 1,
    reason: "测试时误拍了同一张单据，确认该草稿不应形成库存。",
  },
});
assert.equal(voidedDraft.inbound.status, "已作废");
assert.equal(voidedDraft.inbound.voidedByUserId, "U-OFFICE");
assert.equal(voidedDraft.inbound.voidReason, "测试时误拍了同一张单据，确认该草稿不应形成库存。");
assert.equal(voidedDraft.inbound.rolls.every((roll) => roll.inventoryStatus === "不可用"), true);
parsedDeliveryNoteNo = "";

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
      factoryColor: "本白",
      rollCount: 2,
      unit: "kg",
    },
    lineReviews: [{
      lineId: "OCR-1",
      values: {
        productName: "无纺布",
        materialType: "无纺布",
        supplierColor: "本白",
        factoryColor: "本白",
        spec: "90克*1.6米",
        rollCount: 2,
        totalWeightKg: 100,
        unit: "kg",
        unitPrice: 9.5,
        amount: 950,
        supplierRollNo: "",
        rollWeightsKg: [50, 50],
      },
    }],
  },
});
assert.equal(reviewed.inbound.status, "已复核待打印标签");
assert.equal(reviewed.inbound.supplierName, "白侯无纺布有限公司");
assert.equal(reviewed.inbound.ocrReviewFields.find((field) => field.key === "supplierName").reviewStatus, "人工修改");
assert.equal(reviewed.inbound.ocrLines[0].reviewStatus, "人工修改", "selecting the authoritative factory colour must remain visible as a human correction");
assert.equal(reviewed.inbound.ocrLines[0].recognizedValues.spec, "90克*1.6米");
assert.equal(reviewed.inbound.rolls.every((roll) => roll.inventoryStatus === "不可用"), true);
assert.equal(reviewed.inbound.rolls.every((roll) => roll.labelStatus === "待打印标签"), true);

const returnDraft = {
  id: "RMI-OCR-RETURN-1",
  revision: 1,
  status: "已识别待复核",
  documentDirection: "supplier_return",
  documentTypeLabel: "退货单",
  supplierName: "人意无纺布有限公司",
  deliveryNoteNo: "RETURN-20260701",
  materialType: "无纺布",
  productName: "退带色布",
  spec: "",
  supplierColor: "带色",
  factoryColor: "",
  rollCount: 2,
  totalWeightKg: -28.4,
  unit: "kg",
  unitPrice: 9.6,
  amount: -272.64,
  ocrProvider: "tencent_cloud_table_v3",
  ocrReviewFields: [
    { key: "supplierName", recognizedValue: "人意无纺布有限公司", value: "人意无纺布有限公司" },
    { key: "materialType", recognizedValue: "无纺布", value: "无纺布" },
    { key: "productName", recognizedValue: "退带色布", value: "退带色布" },
    { key: "spec", recognizedValue: "", value: "" },
    { key: "rollCount", recognizedValue: 2, value: 2 },
    { key: "totalWeightKg", recognizedValue: -28.4, value: -28.4 },
    { key: "unit", recognizedValue: "kg", value: "kg" },
    { key: "unitPrice", recognizedValue: 9.6, value: 9.6 },
    { key: "amount", recognizedValue: -272.64, value: -272.64 },
  ],
  ocrLines: [{
    lineId: "OCR-RETURN-LINE-1",
    values: {
      productName: "退带色布",
      materialType: "无纺布",
      supplierColor: "带色",
      returnMaterialCategory: "彩布",
      spec: "",
      rollCount: 2,
      totalWeightKg: -28.4,
      unit: "kg",
      unitPrice: 9.6,
      amount: -272.64,
      supplierRollNo: "",
      rollWeightsKg: [-4.2, -24.2],
    },
  }],
  rolls: [],
};
const returnWorkspace = { rawMaterialInbounds: [returnDraft], operationLogs: [] };
const reviewedReturn = applyRawMaterialInboundAction({
  workspace: returnWorkspace,
  inbounds: returnWorkspace.rawMaterialInbounds,
  inboundId: returnDraft.id,
  action: "review",
  operatorId: "U-OFFICE",
  operatorName: "办公室复核员",
  body: {
    expectedRevision: 1,
    reviewFields: {
      supplierName: returnDraft.supplierName,
      materialType: returnDraft.materialType,
      productName: returnDraft.productName,
      spec: "",
      rollCount: 2,
      totalWeightKg: -28.4,
      unit: "kg",
      unitPrice: 9.6,
      amount: -272.64,
    },
    lineReviews: returnDraft.ocrLines.map((line) => ({ lineId: line.lineId, values: { ...line.values } })),
  },
});
assert.equal(reviewedReturn.inbound.status, "退货单已复核");
assert.equal(reviewedReturn.inbound.totalWeightKg, -28.4);
assert.equal(reviewedReturn.inbound.amount, -272.64);
assert.deepEqual(reviewedReturn.inbound.rolls, [], "reviewing a return must not create inbound rolls");
assert.match(reviewedReturn.inbound.nextStep, /不进入入库打印和可用库存/);
assert.throws(
  () => applyRawMaterialInboundAction({
    workspace: returnWorkspace,
    inbounds: reviewedReturn.inbounds,
    inboundId: returnDraft.id,
    action: "print_labels",
    operatorId: "U-OFFICE",
    operatorName: "办公室复核员",
    body: { expectedRevision: reviewedReturn.inbound.revision },
  }),
  (error) => error.code === "RAW_MATERIAL_RETURN_LABEL_PRINT_FORBIDDEN",
  "supplier returns must be explicitly blocked from inbound label printing",
);

const scheduledOcrJobs = [];
const voidedCaptureIds = [];
const deletedStorageKeys = [];
const jobOcrCalls = [];
let secondPageShouldFail = true;
const jobWorkspace = {
  users: [{ id: "U-JOB", displayName: "后台识别测试员" }],
  attachments: [
    buildCaptureAttachment("ATT-JOB-1", "1".repeat(64), "job/page-1"),
    buildCaptureAttachment("ATT-JOB-2", "2".repeat(64), "job/page-2"),
    {
      ...buildCaptureAttachment("ATT-EXPIRED", "3".repeat(64), "job/expired"),
      ownerId: "CAPTURE-EXPIRED",
      uploadedAt: "2026-08-13T07:00:00.000Z",
      metadata: { expiresAt: "2026-08-15T07:00:00.000Z" },
    },
  ],
  operationLogs: [],
  rawMaterialInbounds: [],
  attachmentRepository: {
    async findAttachmentById({ attachmentId }) {
      return jobWorkspace.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
    },
    async listAttachments() {
      return jobWorkspace.attachments;
    },
    async voidAttachment({ attachmentId, operationLog }) {
      voidedCaptureIds.push(attachmentId);
      jobWorkspace.operationLogs.unshift(operationLog);
      jobWorkspace.attachments = jobWorkspace.attachments.map((item) =>
        item.attachmentId === attachmentId ? { ...item, status: "voided" } : item
      );
      return { attachment: jobWorkspace.attachments.find((item) => item.attachmentId === attachmentId) };
    },
  },
  attachmentObjectStorage: {
    async readObject({ attachment }) {
      const page = attachment.attachmentId.endsWith("1") ? "page-one" : "page-two";
      return { buffer: Buffer.from(page), contentType: "image/jpeg" };
    },
    async deleteObject({ storageKey }) {
      deletedStorageKeys.push(storageKey);
    },
  },
  rawMaterialInboundRepository: {
    async createRawMaterialInboundDraft({ inbound, operationLog }) {
      jobWorkspace.rawMaterialInbounds.unshift(inbound);
      return { inbound, operationLog, deduplicated: false };
    },
  },
};
const backgroundService = createRawMaterialCommandService({
  attachmentCreateCommandService: {
    async createAttachment() {
      throw new Error("background OCR must reuse the uploaded binary source attachment");
    },
  },
  buildOperationLog(_workspace, input) {
    return { ...input, occurredAt: "2026-08-16T08:00:00.000Z", createdAt: "2026-08-16T08:00:00.000Z" };
  },
  nextId(prefix, rows) {
    return `${prefix}-JOB-${rows.length + 1}`;
  },
  now: () => new Date("2026-08-16T08:00:00.000Z"),
  scheduleTask(task) {
    scheduledOcrJobs.push(task);
  },
  rawMaterialOcrParserService: {
    buildInboundDraft({ inboundId, ocr }) {
      return {
        id: inboundId,
        supplierName: "后台测试供应商",
        deliveryNoteNo: "JOB-20260816-001",
        status: "已识别待复核",
        ocrProvider: "tencent_cloud_table_v3",
        ocrAction: ocr.action,
        ocrRequestId: ocr.requestId,
        ocrPageCount: ocr.pageCount,
        ocrPages: ocr.pages,
        ocrReviewFields: [],
        ocrLines: [],
        ocrTableRows: [],
        rolls: [],
      };
    },
  },
  tencentCloudTableOcrService: {
    async recognizeTable({ contentDataUrl }) {
      const pageText = Buffer.from(contentDataUrl.split(",")[1], "base64").toString("utf8");
      jobOcrCalls.push(pageText);
      if (pageText === "page-two" && secondPageShouldFail) {
        secondPageShouldFail = false;
        throw new Error('insert or update on table "attachments" violates foreign key constraint');
      }
      return { action: "RecognizeTableAccurateOCR", requestId: `REQ-${pageText}`, tables: [] };
    },
  },
  logger: { error() {} },
});
const backgroundStarted = await backgroundService.startDeliveryNoteRecognitionJob({
  workspace: jobWorkspace,
  operatorId: "U-JOB",
  body: {
    pages: [
      { fileName: "第1页.jpg", mimeType: "image/jpeg", sourceAttachmentId: "ATT-JOB-1", ocrAttachmentId: "ATT-JOB-1" },
      { fileName: "第2页.jpg", mimeType: "image/jpeg", sourceAttachmentId: "ATT-JOB-2", ocrAttachmentId: "ATT-JOB-2" },
    ],
  },
});
assert.equal(backgroundStarted.job.status, "queued");
assert.deepEqual(voidedCaptureIds, ["ATT-EXPIRED"], "expired unlinked capture must be voided before a new job starts");
assert.deepEqual(deletedStorageKeys, ["job/expired"], "expired capture binary must be deleted from object storage");
await scheduledOcrJobs.shift()();
const failedBackgroundJob = await backgroundService.getDeliveryNoteRecognitionJob({
  jobId: backgroundStarted.job.jobId,
  operatorId: "U-JOB",
});
assert.equal(failedBackgroundJob.job.status, "failed");
assert.equal(failedBackgroundJob.job.error.code, "RAW_MATERIAL_DELIVERY_NOTE_PAGE_OCR_FAILED");
assert.match(failedBackgroundJob.job.error.message, /第 2 页识别失败/);
assert.doesNotMatch(failedBackgroundJob.job.error.message, /foreign key|constraint/i, "raw database errors must not reach the phone");
assert.deepEqual(jobOcrCalls, ["page-one", "page-two"]);
const queuedRetry = await backgroundService.retryDeliveryNoteRecognitionJob({
  workspace: jobWorkspace,
  jobId: backgroundStarted.job.jobId,
  operatorId: "U-JOB",
});
assert.equal(queuedRetry.job.status, "queued");
await scheduledOcrJobs.shift()();
const completedBackgroundJob = await backgroundService.getDeliveryNoteRecognitionJob({
  jobId: backgroundStarted.job.jobId,
  operatorId: "U-JOB",
});
assert.equal(completedBackgroundJob.job.status, "completed");
assert.equal(completedBackgroundJob.job.result.inbound.status, "已识别待复核");
assert.deepEqual(jobOcrCalls, ["page-one", "page-two", "page-two"], "retry must reuse successful page 1 and OCR only failed page 2");
const foreignBackgroundJob = await backgroundService.getDeliveryNoteRecognitionJob({
  jobId: backgroundStarted.job.jobId,
  operatorId: "U-OTHER",
});
assert.equal(foreignBackgroundJob.code, "RAW_MATERIAL_DELIVERY_NOTE_JOB_NOT_FOUND");
assert.match(foreignBackgroundJob.message, /不属于当前操作人/);

console.log("Raw-material OCR command checks passed: backend orchestration, attachment ownership, content deduplication, required human review, and unavailable inventory are covered.");

function buildCaptureAttachment(attachmentId, contentDigest, storageKey) {
  return {
    attachmentId,
    ownerType: "raw_material_inbound_capture",
    ownerId: `CAPTURE-${attachmentId}`,
    purpose: "raw_material_delivery_note",
    status: "uploaded",
    uploadedBy: "U-JOB",
    uploadedAt: "2026-08-16T07:00:00.000Z",
    hasContent: true,
    contentDigest,
    mimeType: "image/jpeg",
    storageKey,
  };
}
