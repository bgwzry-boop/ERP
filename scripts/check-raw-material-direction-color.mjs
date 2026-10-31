import assert from 'node:assert/strict';
import { buildRawMaterialRollLabelModel } from '../src/domain/rawMaterialRollLabel.js';
import { buildRawMaterialStockLookup, evaluateRawMaterialOrderSupport } from '../shared/rawMaterialInventorySupport.js';
import { normalizeRawMaterialInbound } from '../server/rawMaterialInboundRecordService.mjs';
import { applyLocalRawMaterialInboundLabelAction } from '../src/domain/rawMaterialInboundLocalLabelActions.js';
import { RAW_MATERIAL_OCR_LINE_REVIEW_KEYS } from '../shared/rawMaterialOcrLineReview.js';
import { buildRawMaterialInboundDraftFromOcr } from '../server/services/rawMaterialOcrParserService.mjs';
import { applyRawMaterialOcrReparse, applyRawMaterialOcrReview } from '../server/rawMaterialInboundOcrSupport.mjs';
import { hasStrongRawMaterialSupplierReturnEvidence } from '../shared/rawMaterialSupplierReturn.js';
import { buildOfficeReviewRows, officeReviewSubmitBlocker } from '../src/domain/officeRawMaterialInboundFlow.js';

// Anonymous transcription of the 2026-10-30 field-test layout. No customer,
// contact, original image, token or debt balance is committed.
const cells = rows => rows.flatMap((values, row) => values.map((text, column) => ({text, rowTl: row, rowBr: row, colTl: column, colBr: column, confidence: 96})));
const ocr = {tables: [{cells: cells([
  ['人意无纺布销售单'],
  ['商品名称','颜色','数量','重\n量\n单位:千克\n单价','金额'],
  ['退带色布','1','-68','-68','11.8','-802.4'],
  ['本单金额','-802.40'],
])}]};
const input = {inboundId:'RMI-TEST-DIRECTION', knownSupplierNames:['人意无纺布'], ocr};
const capturedUnderDelivery = buildRawMaterialInboundDraftFromOcr({...input, documentDirectionHint:'supplier_delivery'});
assert.equal(capturedUnderDelivery.documentDirection, 'supplier_return', 'negative material lines override a 送货单 capture selection');
assert.equal(capturedUnderDelivery.documentDirectionSource, 'ocr_return_evidence_over_capture_selection');
assert.equal(capturedUnderDelivery.totalWeightKg, -68);
assert.equal(capturedUnderDelivery.rolls.length, 0);
// Drafts already stored as delivery keep the explicit correction gate.
const before = {
  ...capturedUnderDelivery,
  documentDirection: 'supplier_delivery',
  documentDirectionSource: 'operator_capture_selection',
  documentTypeLabel: '送货单',
  totalWeightKg: 68,
  amount: 802.4,
  statementDifferences: capturedUnderDelivery.statementDifferences.filter((item) => !item.includes('已按退货单处理')),
  sourceAttachmentId: 'ATT-TEST-SOURCE',
  sourceAttachmentIds: ['ATT-TEST-SOURCE'],
  ocrSourceDigest: 'unchanged-source-digest',
};
assert.equal(before.documentDirection, 'supplier_delivery', 'drafts already saved as 送货单 stay blocked until an explicit correction');
assert.equal(before.totalWeightKg, 68);
assert.equal(hasStrongRawMaterialSupplierReturnEvidence(before), true);
assert.match(officeReviewSubmitBlocker(before), /退货/);
const snapshot = JSON.stringify(before);
assert.throws(() => applyRawMaterialOcrReview({before, reviewFields:{factoryColor:'宝蓝',spec:'78*90*1500'}}), e => e.code === 'RAW_MATERIAL_DOCUMENT_DIRECTION_CONFLICT');
assert.equal(JSON.stringify(before), snapshot, 'blocked review cannot mutate the source');
const corrected = applyRawMaterialOcrReparse({before, reparsedInbound:buildRawMaterialInboundDraftFromOcr({...input, documentDirectionHint:'supplier_return'})});
assert.equal(corrected.documentDirection,'supplier_return');
assert.equal(corrected.totalWeightKg,-68);
assert.equal(corrected.amount,-802.4);
assert.equal(corrected.rolls.length,0);
assert.equal(corrected.sourceAttachmentId,before.sourceAttachmentId);
assert.deepEqual(corrected.sourceAttachmentIds,before.sourceAttachmentIds);
assert.equal(corrected.ocrSourceDigest,before.ocrSourceDigest);
assert.equal(hasStrongRawMaterialSupplierReturnEvidence(corrected),false);
const reviewed = applyRawMaterialOcrReview({before:corrected, reviewFields:Object.fromEntries(corrected.ocrReviewFields.map(f=>[f.key,f.value])),lineReviews:corrected.ocrLines.map(line=>({lineId:line.lineId,values:Object.fromEntries(RAW_MATERIAL_OCR_LINE_REVIEW_KEYS.map(k=>[k,line.values[k]]))})),operatorId:'TEST',operatorName:'测试',now:'2026-10-30T00:00:00Z'});
assert.equal(reviewed.status,'退货单已复核');
assert.equal(reviewed.rolls.length,0);
assert.equal(reviewed.factoryColor,'');
assert.equal(reviewed.spec,'');
assert.throws(()=>applyRawMaterialOcrReparse({before:reviewed,reparsedInbound:before}),e=>e.code==='RAW_MATERIAL_OCR_REPARSE_NOT_ALLOWED');
// Negative carry-forward debt is not negative stock; multiline raw values are.
assert.equal(hasStrongRawMaterialSupplierReturnEvidence({ocrTableRows:[[['无纺布','100'],['上期欠款','-802.4']]]}),false);
assert.equal(hasStrongRawMaterialSupplierReturnEvidence({ocrTableRows:[[['78*090*1500','海兰','1','−68']]]}),true);
assert.equal(hasStrongRawMaterialSupplierReturnEvidence({ocrLines:[{sourceText:'退带色布\n1\n-68',values:{totalWeightKg:68}}]}),true);
const delivery = buildRawMaterialInboundDraftFromOcr({inboundId:'RMI-TEST-COLOURS', knownSupplierNames:['人意无纺布'],documentDirectionHint:'supplier_delivery',ocr:{tables:[{cells:cells([
  ['人意无纺布销售单'],
  ['商品名称','颜色','数量','重\n量\n单位:千克\n单价','金额'],
  ['78*090*1500','海兰','2','108.3','107.8','0'],
  ['78*090*1500','米黄','2','106.8','107.8','0'],
  ['78*076*1500','宝兰','2','90.8','90.3','611.8','11.8','7219.24'],
  ['米黄条','1','82','0'],
  ['梅红条','1','100','182','12','2184'],
  ['本单金额','9403.24'],
])}]}});
const rows = buildOfficeReviewRows({...delivery,factoryColor:'宝蓝'});
assert.equal(rows.length,8);
assert.equal(rows.filter(r=>!r.color).length,6,'no document-wide fallback colour may fill unmapped lines');
assert.deepEqual(rows.map(r=>r.supplierColor),['海兰','海兰','米黄','米黄','宝兰','宝兰','米黄','梅红']);
assert.equal(rows[0].blocker,'','owner permits the supplier ticket colour pending later harmonization');
assert.equal(rows[4].color,'宝蓝');
const cleared=buildOfficeReviewRows(delivery,{[rows[4].lineId]:{...rows[4].lineDraft,factoryColor:''}});
assert.equal(cleared[4].color,'','explicit clearing must not resurrect the OCR value');
assert.equal(buildOfficeReviewRows({rolls:[{id:'RM-OLD',factoryColor:'宝蓝',supplierColor:'宝兰',spec:'78*90*1500',weightKg:68}]})[0].color,'宝蓝','retain non-OCR confirmed roll colours');
console.log('PASS direction conflict rejects incoming review; audited reparse keeps attachments and signed returns; colour gaps stay per-line.');

export {before as directionFixture, corrected as correctedFixture, delivery as colourFixture};

const provisional = buildRawMaterialInboundDraftFromOcr({inboundId:'RMI-PROVISIONAL',knownSupplierNames:['人意无纺布'],ocr:{tables:[{cells:cells([['人意无纺布销售单'],['商品名称','颜色','数量','重量','单价','金额'],['78*090*1500','海兰','1','68','11.8','802.4']])}]}});
export {provisional as provisionalFixture};
const reviewProvisional = (supplierColor='海兰',factoryColor='') => applyRawMaterialOcrReview({before:provisional,reviewFields:Object.fromEntries(provisional.ocrReviewFields.map(f=>[f.key,f.value])),lineReviews:provisional.ocrLines.map(l=>({lineId:l.lineId,values:{...Object.fromEntries(RAW_MATERIAL_OCR_LINE_REVIEW_KEYS.map(k=>[k,l.values[k]])),supplierColor,factoryColor}})),operatorId:'TEST',operatorName:'测试',now:'2026-10-30T00:00:00Z'});
const provisionalReviewed = reviewProvisional();
assert.equal(provisionalReviewed.rolls[0].factoryColor,'');
assert.equal(provisionalReviewed.rolls[0].supplierColor,'海兰');
assert.equal(provisionalReviewed.rolls[0].factoryColorMappingStatus,'supplier_provisional');
assert.equal(normalizeRawMaterialInbound(provisionalReviewed).rolls[0].factoryColorMappingStatus,'supplier_provisional','normalization retains provisional provenance');
assert.equal(buildRawMaterialRollLabelModel(provisionalReviewed,provisionalReviewed.rolls[0]).color,'海兰');
const stockInbound={...provisionalReviewed,rolls:provisionalReviewed.rolls.map(r=>({...r,inventoryStatus:'可用',widthCm:90,gramWeightGsm:78}))};
assert.equal(buildRawMaterialStockLookup([stockInbound],{color:'海兰',widthCm:90}).availableRollCount,1,'supplier-colour stock stays visible');
assert.equal(evaluateRawMaterialOrderSupport({inbounds:[stockInbound],order:{size:'30*37*10',qty:100,bagColor:'海兰'}}).availableRollCount,0,'provisional supplier names cannot automatically match factory-colour orders');
assert.equal(buildRawMaterialRollLabelModel({...provisionalReviewed,factoryColor:'宝蓝'},provisionalReviewed.rolls[0]).color,'海兰','each roll source colour precedes the receipt-level colour');
const printed=applyLocalRawMaterialInboundLabelAction({...provisionalReviewed,factoryColor:'宝蓝'},{action:'打印卷标',operatorName:'测试',now:'2026-10-30T00:00:00Z'});
const checked=applyLocalRawMaterialInboundLabelAction(printed,{action:'确认贴标入库',operatorName:'测试',now:'2026-10-30T00:00:00Z',options:{rollId:printed.rolls[0].id,expectedLabelVersion:1,matchResult:'matched',checkedColor:'海兰'}});
assert.equal(checked.rolls[0].inventoryStatus,'可用');
assert.equal(checked.rolls[0].labelVerification.expected.color,'海兰','label verification uses the physical roll colour, not the receipt header');
assert.throws(()=>reviewProvisional('',''),e=>e.code==='RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED_FIELDS_MISSING');
assert.throws(()=>reviewProvisional('海兰','凭空厂内色'),e=>e.code==='RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED_FIELDS_MISSING');
console.log('PASS supplier ticket colour permits review and label, stays provisional, while missing/invalid colours fail.');
