import assert from "node:assert/strict";
import { buildRawMaterialInboundDraftFromOcr, createRawMaterialOcrParserService } from "../server/services/rawMaterialOcrParserService.mjs";
import { createRawMaterialCommandService } from "../server/services/rawMaterialCommandService.mjs";
import { applyRawMaterialInboundAction } from "../server/services/rawMaterialInboundCommandService.mjs";
import { applyRawMaterialOcrReview, applyRawMaterialOcrReparse } from "../server/rawMaterialInboundOcrSupport.mjs";
import { normalizeRawMaterialInbound } from "../server/rawMaterialInboundRecordService.mjs";
import { RAW_MATERIAL_OCR_LINE_REVIEW_KEYS } from "../shared/rawMaterialOcrLineReview.js";

// Transcribed business cells only; no original photos, customer data or balances.
const header = ["商品名称", "颜色", "数量", "重\n量\n单位:千克\n单价", "金额"];
const cloth = [
  ["78*090*1500", "海兰", "2", "108.3", "107.8", "0"],
  ["78*090*1500", "米黄", "2", "106.8", "107.8", "0"],
  ["78*076*1500", "宝兰", "2", "90.8", "90.3", "611.8", "11.8", "7219.24"],
];
const strips = [["米黄条", "1", "82", "0"], ["梅红条", "1", "100", "182", "12", "2184"]];
const cells = rows => rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 96 })));
const build = (rows, options = {}) => buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-TEST-GROUP", knownSupplierNames: ["人意无纺布"], supplierNameHint: "人意无纺布", documentDirectionHint: "supplier_delivery",
  ocr: { tables: [{ cells: cells([header, ...rows]) }] }, ...options,
});
const draft = build([...cloth, ...strips, ["本单金额", "9403.24"]]);
assert.equal(draft.ocrParserVersion, 22);
assert.deepEqual(draft.ocrLines.map(l => l.values.unitPrice), [11.8, 11.8, 11.8, 12, 12]);
assert.deepEqual(draft.ocrLines.map(l => l.values.amount), [2549.98, 2532.28, 2136.98, 984, 1200]);
assert.equal(draft.ocrCalculatedLineAmount, 9403.24);
assert.equal(draft.ocrCalculatedLineWeightKg, 793.8);
assert.equal(draft.documentPriceReferenceOnly, true, "paper prices remain reference-only for this supplier");
assert.deepEqual(draft.rolls.map(r => r.weightKg), [108.3, 107.8, 106.8, 107.8, 90.8, 90.3, 82, 100]);
assert.match(draft.ocrLines[0].sourceText, /107.8 \| 0$/);
assert.equal(draft.ocrLines[0].pricingSource.originalUnitPrice, 0);
assert.equal(draft.ocrLines[0].pricingSource.sourceLineId, draft.ocrLines[2].lineId);
assert.equal(draft.ocrLines[2].pricingSource.originalAmount, 7219.24);
assert.equal(draft.ocrLines[3].pricingSource.sourceLineId, draft.ocrLines[4].lineId);
assert.deepEqual(normalizeRawMaterialInbound(draft).ocrLines[0].pricingSource, draft.ocrLines[0].pricingSource);

function review(before) {
  return applyRawMaterialOcrReview({ before,
    reviewFields: Object.fromEntries(before.ocrReviewFields.map(f => [f.key, f.value])),
    lineReviews: before.ocrLines.map(l => ({ lineId: l.lineId, values: Object.fromEntries(RAW_MATERIAL_OCR_LINE_REVIEW_KEYS.map(k => [k, l.values[k]])) })),
    operatorId: "TEST", operatorName: "测试", now: "2026-10-31T00:00:00Z",
  });
}
const reviewed = review(draft);
assert.equal(reviewed.rolls.length, 8);
assert.equal(reviewed.rolls[0].unitPrice, 11.8);
assert.deepEqual(reviewed.ocrLines[0].pricingSource, draft.ocrLines[0].pricingSource);
const stale = { ...draft, ocrParserVersion: 21, sourceAttachmentId: "ATT-ORIGINAL", sourceAttachmentIds: ["ATT-ORIGINAL"], ocrSourceDigest: "original-digest" };
const upgraded = applyRawMaterialOcrReparse({ before: stale, reparsedInbound: draft });
assert.equal(upgraded.sourceAttachmentId, "ATT-ORIGINAL");
assert.equal(upgraded.ocrSourceDigest, "original-digest");
assert.equal(upgraded.status, "已识别待复核");
assert.throws(() => applyRawMaterialOcrReparse({ before: reviewed, reparsedInbound: { ...draft, ocrParserVersion: 23 } }), e => e.code === "RAW_MATERIAL_OCR_REPARSE_NOT_ALLOWED");

function rejected(rows, label, options) {
  const d = build(rows, options);
  assert.equal(d.ocrLines.some(l => l.pricingSource), false, label);
  return d;
}
for (const [index, value, label] of [[5,"611.9","wrong group weight"],[7,"7219.25","wrong group amount"],[6,"0","zero price"],[6,"-11.8","negative price"],[5,"611.8kg","unconfirmed numeric text"]]) {
  const rows = structuredClone(cloth); rows[2][index] = value; rejected(rows,label);
}
rejected([cloth[0], ["小计","216.1"], cloth[1], cloth[2]], "subtotal boundary");
rejected([cloth[0], [], cloth[1], cloth[2]], "blank row boundary");
rejected([cloth[0], ["未知材料行"], cloth[1], cloth[2]], "unparsed row boundary");
const ownPrice = structuredClone(cloth); ownPrice[0] = [...ownPrice[0].slice(0,5),"10","2161"];
rejected(ownPrice,"do not overwrite an independent line price");
rejected([["78*90*1500","海兰","1","82","0"],strips[1]],"do not combine cloth and handles");
rejected(cloth,"supplier scope",{knownSupplierNames:["其他厂家"],supplierNameHint:"其他厂家"});
rejected(cloth,"return scope",{documentDirectionHint:"supplier_return"});
rejected([["米黄条","1","0.001","0"],["梅红条","1","0.001","0.002","5","0.01"]],"do not invent a rounding allocation");
rejected(cloth,"separate page/table boundary",{ocr:{tables:[{sourcePageIndex:0,cells:cells([header,...cloth.slice(0,2)])},{sourcePageIndex:1,cells:cells([header,cloth[2]])}]}});
const bad = build([cloth[0]]);
assert.throws(() => review(bad), e => e.code === "RAW_MATERIAL_OCR_REVIEW_LINE_UNIT_PRICE_REQUIRED" && /海兰/.test(e.message) && /78\*090\*1500/.test(e.message) && !/OCR-T/.test(e.message));
const singleton = build([["78*90*1500","海兰","1","68","68","11.8","802.4"]]);
assert.equal(singleton.ocrLines[0].values.amount,802.4);
assert.equal(singleton.ocrLines[0].pricingSource,undefined);
const workspace = { users: [{id:"TEST",displayName:"测试"}], rawMaterialInbounds: [structuredClone(stale)], operationLogs: [], colorAliases: [], standardColors: [] };
workspace.rawMaterialInboundRepository = { async applyInboundAction(input) {
  const result = applyRawMaterialInboundAction({workspace,inbounds:workspace.rawMaterialInbounds,inboundId:input.inboundId,action:input.action,body:input.body,operatorId:input.operatorId,operatorName:input.operatorName});
  workspace.rawMaterialInbounds=result.inbounds;
  return {inbound:result.inbound,operationLog:result.operationLog};
}};
const service = createRawMaterialCommandService({rawMaterialOcrParserService:createRawMaterialOcrParserService(),tencentCloudTableOcrService:{recognizeTable(){throw Error("must not call cloud OCR");}}});
const upgradedCommand = await service.recordInboundAction({workspace,inboundId:stale.id,actionSlug:"reparse-ocr",operatorId:"TEST",body:{expectedRevision:1,documentDirectionHint:stale.documentDirection,supplierNameHint:stale.supplierName}});
assert.ok(upgradedCommand.inbound,JSON.stringify(upgradedCommand));
assert.equal(upgradedCommand.inbound.ocrParserVersion,22);
assert.equal(upgradedCommand.inbound.revision,2);
assert.equal(upgradedCommand.inbound.sourceAttachmentId,"ATT-ORIGINAL");
assert.equal(upgradedCommand.inbound.ocrCalculatedLineAmount,9403.24);
assert.equal(workspace.operationLogs.length,1);
assert.equal(workspace.operationLogs[0].action,"reparse_ocr");
const staleRetry = await service.recordInboundAction({workspace,inboundId:stale.id,actionSlug:"reparse-ocr",operatorId:"TEST",body:{expectedRevision:1}});
assert.equal(staleRetry.code,"RAW_MATERIAL_INBOUND_WRITE_CONFLICT");
const repeat = await service.recordInboundAction({workspace,inboundId:stale.id,actionSlug:"reparse-ocr",operatorId:"TEST",body:{expectedRevision:2}});
assert.equal(repeat.code,"RAW_MATERIAL_OCR_REPARSE_NOT_AVAILABLE");
assert.equal(workspace.operationLogs.length,1,"retry must not write another correction");
console.log("PASS grouped pricing: five lines/eight rolls reconcile; source and attachments retained; invalid sums, boundaries, independent prices, returns and rounding fail closed; errors identify material.");
