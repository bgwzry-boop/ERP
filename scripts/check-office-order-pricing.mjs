import {applyRawMaterialTraceabilityAction} from "../server/rawMaterialTraceabilityActionService.mjs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { buildPriceSourceWorkspace } from "./check-order-confirmation-price-source.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { buildOrderPrintingPriceGroups, printingGroupIdentity } from "../server/orderPrintingPriceGroups.mjs";
import {
  defaultMaterialPriceSnapshot,
  specialBagPricingRules,
} from "../shared/pricing/specialBagPricing.js";
import { mapDraftRowsToApiLines } from "../src/services/officeOrderApiClient.js";
import { createLockedSpecialPriceDraftFixture } from "./helpers/lockedSpecialPriceFixture.mjs";
import { resolvedOrderPricingMaterialSnapshot } from "../server/orderPricingMaterialSource.mjs";

export const pricingService =
  createApiSharedServiceRegistry().orderDraftCommandService;
export const permissions = ["order.confirm", "order.price.override"];
export function officePricingWorkspace({
  print = false,
  special = false,
  qty = 5000,
} = {}) {
  const w = Object.assign(
    buildPriceSourceWorkspace({
      size: special ? "43*31*12" : "30*38*10",
      orderType: special ? "custom_special" : print ? "custom_print" : "stock",
      print,
    }),
    buildPublishedOrderPriceFixture({ bagPrice: 0.9 }),
  );
  Object.assign(w.orderDrafts[0].lines[0], {
    qty,
    printContent: print ? "合成客户商标A" : "",
    latest: "2026-11-01",
    latestNeededAt: "2026-11-01",
  });
  w.rawMaterialInbounds = [];
  return w;
}
export function materialFacts(w) {
  w.rawMaterialInbounds = [
    {
      id: "RM-Q-BODY",
      supplierName: "合成供应商",
      updatedAt: "2026-10-01T00:00:00.000Z",
      rolls: [
        {
          id: "RM-Q-BODY-01",
          inventoryStatus: "可用",
          materialType: "无纺布卷料",
          widthCm: 80,
          gramWeightGsm: 78,
          unitPrice: 9.2,
        },
      ],
    },
    {
      id: "RM-Q-HANDLE",
      supplierName: "合成供应商",
      updatedAt: "2026-10-02T00:00:00.000Z",
      rolls: [
        {
          id: "RM-Q-HANDLE-01",
          inventoryStatus: "可用",
          materialType: "提手条",
          widthCm: 5,
          gramWeightGsm: 60,
          unitPrice: 8.5,
        },
      ],
    },
  ];
}
export async function makeQuote(w, extras = {}, key = "q") {
  const d = w.orderDrafts.find(
    (d) => d.id === (w.currentPricingDraftId || "D-PRICE"),
  );
  return pricingService.quoteOrderDraftPrice({
    workspace: w,
    draftId: d.id,
    operatorId: "U-PRICE",
    actionPermissions: permissions,
    body: {
      expectedRevision: d.revision,
      idempotencyKey: `office-pricing-${key}`,
      lines: d.lines,
      ...extras,
    },
  });
}
export async function confirmQuote(w, quote, extras = {}, key = "c") {
  const d = w.orderDrafts.find(
    (d) => d.id === (w.currentPricingDraftId || "D-PRICE"),
  );
  return pricingService.confirmOrderDraft({
    workspace: w,
    draftId: d.id,
    operatorId: "U-PRICE",
    actionPermissions: permissions,
    body: {
      expectedRevision: d.revision,
      idempotencyKey: `office-pricing-confirm-${key}`,
      lines: d.lines,
      pricingQuoteId: quote.quoteId,
      ...extras,
    },
  });
}
export async function checkOfficePricing() {
  const common = officePricingWorkspace();
  const q = await makeQuote(common);
  assert.ok(q.response, JSON.stringify(q));
  assert.equal(q.response.quote.lines[0].amount, 4500);
  const c = await confirmQuote(common, q.response.quote);
  assert.ok(c.response, JSON.stringify(c));
  assert.equal(common.priceSnapshots[0].finalAmount, 4500);
  const manual = officePricingWorkspace({ special: true });
  const no = await makeQuote(manual);
  assert.equal(no.code, "ORDER_SPECIAL_MATERIAL_PRICE_REQUIRED");
  assert.equal(manual.orderDrafts[0].revision, 1);
  const body = {
    expectedRevision: 1,
    idempotencyKey: "forbidden",
    lines: manual.orderDrafts[0].lines,
    overrides: [
      {
        draftLineId: "D-PRICE-01",
        bagPrice: 0.88,
        reason: "客户确认的特殊单报价",
      },
    ],
  };
  assert.equal(
    (
      await pricingService.quoteOrderDraftPrice({
        workspace: manual,
        draftId: "D-PRICE",
        operatorId: "U-PRICE",
        actionPermissions: ["order.confirm"],
        body,
      })
    ).statusCode,
    403,
  );
  const mq = await makeQuote(manual, { overrides: body.overrides }, "manual");
  assert.ok(mq.response, JSON.stringify(mq));
  assert.equal(mq.response.quote.lines[0].amount, 4400);
  assert.equal(mq.response.quote.lines[0].override.beforeAmount, null);
  const mc = await confirmQuote(manual, mq.response.quote);
  assert.ok(mc.response, JSON.stringify(mc));
  assert.equal(manual.priceSnapshots[0].overrideReason, "客户确认的特殊单报价");
  assert.equal(
    manual.todos.filter((t) => t.type === "本单改价待查看").length,
    1,
  );
  const special = officePricingWorkspace({ special: true });
  materialFacts(special);
  const sq = await makeQuote(special);
  assert.ok(sq.response, JSON.stringify(sq));
  assert.equal(
    sq.response.quote.lines[0].ruleVersion,
    specialBagPricingRules.version,
  );
  assert.ok(sq.response.quote.lines[0].amount > 0);
  const sc = await confirmQuote(special, sq.response.quote);
  assert.ok(sc.response, JSON.stringify(sc));
  const stale = officePricingWorkspace({ special: true });
  materialFacts(stale);
  const staleq = await makeQuote(stale);
  stale.rawMaterialInbounds[0].rolls[0].unitPrice = 10;
  await assert.rejects(confirmQuote(stale, staleq.response.quote), {
    code: "ERP_ORDER_PRICE_SOURCE_CONFLICT",
  });
  assert.equal(stale.orderLines.length, 0);
  assert.equal(stale.orderDrafts[0].revision, 2);
  const fallback = structuredClone(defaultMaterialPriceSnapshot);
  fallback.provisional = false;
  const merged = resolvedOrderPricingMaterialSnapshot({
    materials: {
      body: { yuan_per_kg: 9.2, supplier_name: "实际批次", batch_id: "B1" },
      handle: null,
    },
    publishedRelease: {
      specialSizePricing: {
        rules: specialBagPricingRules,
        materialPrice: fallback,
      },
    },
  });
  assert.equal(merged.body.yuanPerTon, 9200);
  assert.equal(merged.handle.yuanPerTon, 8900);
  const grouped = officePricingWorkspace({ print: true });
  const first = grouped.orderDrafts[0].lines[0];
  assert.equal(printingGroupIdentity(first).inkColor, "黑色");
  assert.equal("color" in printingGroupIdentity(first), false);
  assert.equal("bagColor" in printingGroupIdentity(first), false);
  assert.equal(printingGroupIdentity({ ...first, printColor: "待确认" }), null);
  // Different bag colours share one ladder when size, content and ink match.
  grouped.orderDrafts[0].lines.push({
    ...first,
    id: "D-PRICE-02",
    draftLineId: "D-PRICE-02",
    color: "白色",
    bagColor: "白色",
  });
  const gq = await makeQuote(grouped);
  assert.ok(gq.response, JSON.stringify(gq));
  assert.equal(gq.response.quote.groups.length, 1);
  assert.equal(gq.response.quote.groups[0].memberCount, 2);
  assert.deepEqual(
    gq.response.quote.lines.map((l) => l.printPrice),
    [0.06, 0.06],
  );
  assert.ok((await confirmQuote(grouped, gq.response.quote)).response);
  assert.equal(grouped.priceSnapshots.length, 2);
  assert.equal(
    grouped.priceSnapshots[0].sourceEvidence.officePricingGroup.memberCount,
    2,
  );
  // Same merchandise/ink wording is not evidence of identical artwork.
  for (const product of ["白印黑", "LOGO袋"]) {
    const unknown = officePricingWorkspace({ print: true });
    const line = unknown.orderDrafts[0].lines[0];
    Object.assign(line, { printContent: "", product, productName: product });
    unknown.orderDrafts[0].lines.push({
      ...line,
      id: "UNKNOWN-CONTENT-2",
      draftLineId: "UNKNOWN-CONTENT-2",
    });
    const unknownQuote = await makeQuote(
      unknown,
      {},
      `unknown-${product === "白印黑" ? "ink" : "logo"}`,
    );
    assert.ok(unknownQuote.response, JSON.stringify(unknownQuote));
    assert.equal(unknownQuote.response.quote.groups.length, 2);
    assert.deepEqual(
      unknownQuote.response.quote.groups.map((group) => group.memberCount),
      [1, 1],
    );
    assert.deepEqual(
      unknownQuote.response.quote.lines.map((line) => line.printPrice),
      [0.08, 0.08],
    );
    assert.deepEqual(
      unknownQuote.response.quote.lines.map((line) => line.amount),
      [4900, 4900],
    );
    assert.ok(
      (await confirmQuote(unknown, unknownQuote.response.quote)).response,
      "Unidentified artwork still allows independently priced lines",
    );
  }
  const productNameOnly = [
    {
      ...first,
      id: "PRODUCT-NAME-ONLY-1",
      printContent: undefined,
      product: undefined,
      productName: "LOGO袋",
    },
    {
      ...first,
      id: "PRODUCT-NAME-ONLY-2",
      printContent: " ",
      product: undefined,
      productName: "LOGO袋",
    },
  ];
  assert.equal(buildOrderPrintingPriceGroups(productNameOnly).length, 2);
  const sameInkBags = ["黑色", "蓝色", "红色", "绿色"].map((bagColor, index) => ({
    ...first,
    id: `INK-BAG-${index + 1}`,
    color: bagColor,
    bagColor,
    printColor: index === 3 ? "白" : "白色",
    printContent: "同一商标内容",
    qty: 1500,
  }));
  const sameInkGroups = buildOrderPrintingPriceGroups(sameInkBags);
  assert.equal(sameInkGroups.length, 1);
  assert.equal(sameInkGroups[0].quantity, 6000);
  assert.equal(sameInkGroups[0].inkColor, "白色");
  assert.equal(sameInkGroups[0].unitPrice, 0.08);
  assert.equal(sameInkGroups[0].memberCount, 4);
  assert.equal("color" in sameInkGroups[0], false);
  assert.equal("bagColor" in sameInkGroups[0], false);
  const quotedInk = officePricingWorkspace({ print: true, qty: 1500 });
  const quotedBase = quotedInk.orderDrafts[0].lines[0];
  quotedInk.orderDrafts[0].lines = sameInkBags.map((row) => ({
    ...quotedBase,
    ...row,
    draftLineId: row.id,
  }));
  const quotedInkResult = await makeQuote(quotedInk, {}, "same-ink-four-bags");
  assert.ok(quotedInkResult.response, JSON.stringify(quotedInkResult));
  assert.equal(quotedInkResult.response.quote.groups.length, 1);
  assert.equal(quotedInkResult.response.quote.groups[0].quantity, 6000);
  assert.equal(quotedInkResult.response.quote.groups[0].inkColor, "白色");
  assert.equal(quotedInkResult.response.quote.groups[0].unitPrice, 0.08);
  assert.deepEqual(
    quotedInkResult.response.quote.lines.map((line) => line.printPrice),
    [0.08, 0.08, 0.08, 0.08],
  );
  const quotedSplit = officePricingWorkspace({ print: true });
  const splitBase = quotedSplit.orderDrafts[0].lines[0];
  quotedSplit.orderDrafts[0].lines.push({
    ...splitBase,
    id: "INK-RED-QUOTE",
    draftLineId: "INK-RED-QUOTE",
    color: "黑色",
    bagColor: "黑色",
    printColor: "红色",
  });
  const quotedSplitResult = await makeQuote(quotedSplit, {}, "different-ink");
  assert.equal(quotedSplitResult.response.quote.groups.length, 2);
  assert.deepEqual(
    quotedSplitResult.response.quote.lines.map((line) => line.printPrice),
    [0.08, 0.08],
  );
  const aliasGroups = buildOrderPrintingPriceGroups([
    { ...first, id: "ALIAS-1", color: "黑色", bagColor: "黑色", printColor: "大红", qty: 1500 },
    { ...first, id: "ALIAS-2", color: "蓝色", bagColor: "蓝色", printColor: "红色", qty: 1500 },
  ]);
  assert.equal(aliasGroups.length, 1);
  assert.equal(aliasGroups[0].inkColor, "红色");
  assert.equal(aliasGroups[0].quantity, 3000);
  assert.equal(buildOrderPrintingPriceGroups([
    { ...first, id: "NO-INK-1", printColor: "" },
    { ...first, id: "NO-INK-2", printColor: "待确认" },
  ]).length, 2);
  const differentInk = buildOrderPrintingPriceGroups([
    { ...first, id: "INK-WHITE", color: "黑色", bagColor: "黑色", printColor: "白色", qty: 5000 },
    { ...first, id: "INK-RED", color: "黑色", bagColor: "黑色", printColor: "红色", qty: 5000 },
  ]);
  assert.equal(differentInk.length, 2);
  assert.deepEqual(differentInk.map((group) => group.inkColor), ["白色", "红色"]);
  assert.deepEqual(differentInk.map((group) => group.quantity), [5000, 5000]);
  assert.deepEqual(differentInk.map((group) => group.unitPrice), [0.08, 0.08]);
  const noContentOriginal = officePricingWorkspace({ print: true });
  Object.assign(noContentOriginal.orderDrafts[0].lines[0], {
    printContent: "",
    product: "LOGO袋",
    productName: "LOGO袋",
  });
  const noContentQuote = await makeQuote(noContentOriginal);
  assert.ok(
    (await confirmQuote(noContentOriginal, noContentQuote.response.quote))
      .response,
  );
  const noContentOldId = noContentOriginal.orderLines[0].id;
  noContentOriginal.orderDrafts = [
    {
      ...noContentOriginal.orderDrafts[0],
      status: "待审核",
      revision: 1,
      clientRevision: 1,
      recognitionContext: null,
      lines: [
        { ...first, id: "EXPLICIT-NEW-SUP", draftLineId: "EXPLICIT-NEW-SUP" },
      ],
    },
  ];
  const noContentSupplement = await makeQuote(
    noContentOriginal,
    {
      supplementation: {
        orderLineIds: [noContentOldId],
        targetDraftLineId: "EXPLICIT-NEW-SUP",
        confirmedSameBatch: true,
        batchReference: "SYNTHETIC-UNKNOWN-BATCH",
        reason: "不能用商品名猜测旧单稿件",
      },
    },
    "unknown-original-supplement",
  );
  assert.equal(noContentSupplement.code, "ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE");
  for (const change of [
    { printContent: "另一个商标" },
    { printContent: `${first.printContent}。` },
    { size: "32*40*10" },
    { printSide: "双面" },
    { printColor: "白色" },
    { originalOrderGroupId: "另一原单" },
  ]) {
    const rows = [
      { ...first, printingScope: "D-PRICE" },
      {
        ...first,
        ...change,
        id: "D2",
        printingScope: change.originalOrderGroupId || "D-PRICE",
      },
    ];
    assert.equal(buildOrderPrintingPriceGroups(rows).length, 2);
  }
  const supplement = officePricingWorkspace({ print: true });
  const original = await makeQuote(supplement);
  const originalResult = await confirmQuote(
    supplement,
    original.response.quote,
  );
  assert.ok(originalResult.response);
  const oldLine = supplement.orderLines[0],
    oldPrice = structuredClone(supplement.priceSnapshots[0]);
  supplement.orderDrafts = [
    {
      ...supplement.orderDrafts[0],
      status: "待审核",
      revision: 1,
      clientRevision: 1,
      recognitionContext: null,
      lines: [{ ...first, id: "D-SUP-1", draftLineId: "D-SUP-1" }],
    },
  ];
  const sup = {
    orderLineIds: [oldLine.id],
    targetDraftLineId: "D-SUP-1",
    confirmedSameBatch: true,
    batchReference: "合成批次20261024-A",
    reason: "原单未开印，本次追加同图同尺寸",
  };
  const qq = await makeQuote(
    supplement,
    { supplementation: sup },
    "supplement-quote",
  );
  assert.ok(qq.response, JSON.stringify(qq));
  assert.equal(qq.response.quote.affectedOrders[0].previousPrintPrice, 0.08);
  assert.equal(qq.response.quote.affectedOrders[0].revisedPrintPrice, 0.06);
  assert.equal(
    (await confirmQuote(supplement, qq.response.quote, {}, "missing-ack")).code,
    "ORDER_PRINT_AFFECTED_CONFIRMATION_REQUIRED",
  );
  const done = await confirmQuote(
    supplement,
    qq.response.quote,
    { confirmedAffectedOrderLineIds: [oldLine.id] },
    "supplement-confirm",
  );
  assert.ok(done.response, JSON.stringify(done));
  assert.deepEqual(
    supplement.priceSnapshots.find((p) => p.id === oldPrice.id),
    oldPrice,
  );
  assert.equal(supplement.priceSnapshots.length, 3);
  assert.equal(
    supplement.orderLines.find((l) => l.id === oldLine.id).revision,
    2,
  );
  assert.equal(supplement.orderLineChangeRecords.length, 1);
  const edited = officePricingWorkspace();
  const eq = await makeQuote(edited);
  edited.orderDrafts[0].lines[0].qty = 6000;
  assert.equal(
    (await confirmQuote(edited, eq.response.quote)).code,
    "ORDER_PRICE_QUOTE_CHANGED",
  );
  // No ordinary confirmation may bypass an explicit multi-line group quote.
  const bypass = officePricingWorkspace({ print: true });
  bypass.orderDrafts[0].lines.push({
    ...bypass.orderDrafts[0].lines[0],
    id: "D-BYPASS-2",
  });
  assert.equal(
    (
      await pricingService.confirmOrderDraft({
        workspace: bypass,
        draftId: "D-PRICE",
        operatorId: "U-PRICE",
        body: {
          expectedRevision: 1,
          idempotencyKey: "office-group-bypass",
          lines: bypass.orderDrafts[0].lines,
        },
      })
    ).code,
    "ORDER_PRINT_GROUP_QUOTE_REQUIRED",
  );
  const partial = officePricingWorkspace({ print: true });
  const initial = await makeQuote(partial);
  await confirmQuote(partial, initial.response.quote);
  const line = partial.orderLines[0];
  const price = partial.priceSnapshots[0];
  price.sourceEvidence.officePricingGroup.memberCount = 2;
  partial.orderDrafts = [
    {
      ...partial.orderDrafts[0],
      status: "待审核",
      revision: 1,
      recognitionContext: null,
      lines: [{ ...first, id: "D-PARTIAL" }],
    },
  ];
  assert.equal(
    (
      await makeQuote(
        partial,
        {
          supplementation: {
            ...sup,
            targetDraftLineId: "D-PARTIAL",
            orderLineIds: [line.id],
          },
        },
        "partial",
      )
    ).code,
    "ORDER_PRINT_EXISTING_GROUP_REQUIRED",
  );
  const started = officePricingWorkspace({ print: true });
  const startq = await makeQuote(started);
  await confirmQuote(started, startq.response.quote);
  const startline = started.orderLines[0];
  started.productionTasks[0].taskStatus = "丝印中";
  started.productionTasks[0].status = "丝印中";
  started.orderDrafts = [
    {
      ...started.orderDrafts[0],
      status: "待审核",
      revision: 1,
      recognitionContext: null,
      lines: [{ ...first, id: "D-STARTED" }],
    },
  ];
  assert.equal(
    (
      await makeQuote(
        started,
        {
          supplementation: {
            ...sup,
            targetDraftLineId: "D-STARTED",
            orderLineIds: [startline.id],
          },
        },
        "started",
      )
    ).code,
    "ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE",
  );
  const forbidden = officePricingWorkspace();
  const fq = await makeQuote(forbidden, {
    overrides: [
      { draftLineId: "D-PRICE-01", bagPrice: 0.91, reason: "合成授权本单价" },
    ],
  });
  assert.equal(
    fq.response.quote.lines[0].override.managerReviewRequired,
    false,
  );
  assert.equal(
    (
      await pricingService.confirmOrderDraft({
        workspace: forbidden,
        draftId: "D-PRICE",
        operatorId: "U-PRICE",
        actionPermissions: ["order.confirm"],
        body: {
          expectedRevision: 2,
          lines: forbidden.orderDrafts[0].lines,
          pricingQuoteId: fq.response.quote.quoteId,
          idempotencyKey: "office-confirm-denied",
        },
      })
    ).code,
    "ORDER_PRICE_OVERRIDE_FORBIDDEN",
  );
  const locked = officePricingWorkspace({ special: true });
  locked.orderDraftRepository = createLockedSpecialPriceDraftFixture();
  assert.equal((await makeQuote(locked)).code, "MINIAPP_PRICE_LOCKED");
  const precision = officePricingWorkspace({ qty: 100 });
  precision.priceTableItems.forEach((item) => (item.bagPrice = 0.1234));
  const pq = await makeQuote(precision);
  assert.equal(pq.response.quote.lines[0].amount, 12.34);
  const mapped = mapDraftRowsToApiLines([
    { ...first, sourceHoldId: "H-EXPLICIT", sourceIntentId: "INT-EXPLICIT" },
  ]);
  assert.equal(mapped[0].recognitionEvidence.sourceHoldId, "H-EXPLICIT");
  assert.equal(mapped[0].recognitionEvidence.sourceIntentId, "INT-EXPLICIT");
  const once = officePricingWorkspace();
  const ordinary = (key) =>
    pricingService.confirmOrderDraft({
      workspace: once,
      draftId: "D-PRICE",
      operatorId: "U-PRICE",
      body: {
        expectedRevision: once.orderDrafts[0].revision,
        lines: once.orderDrafts[0].lines,
        idempotencyKey: key,
      },
    });
  assert.ok((await ordinary("office-once-first")).response);
  assert.equal(
    (await ordinary("office-once-again")).code,
    "ORDER_DRAFT_ALREADY_CONFIRMED",
  );
  assert.equal(once.originalOrders.length, 1);
  await checkSupplementExecutionFacts();
  console.log(
    "Office formal pricing: published price, special confirmed material and fallback, authorized audited override, permission/no-price/stale guards, same-ink different-bag groups and different-ink splits, explicit cross-order supplemental revision and unchanged original snapshots passed.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await checkOfficePricing();

async function checkSupplementExecutionFacts() {
  const fixture = async () => {
    const w = officePricingWorkspace({print:true});
    const line = structuredClone(w.orderDrafts[0].lines[0]);
    const initial = await makeQuote(w,{},'execution-original');
    const original = await confirmQuote(w,initial.response.quote,{},'execution-original');
    assert.ok(original.response);
    const old = w.orderLines[0], task = w.productionTasks.find(row => row.orderLineId===old.id && /丝印|印刷/.test(row.taskType));
    const draft = w.orderDrafts[0];
    w.currentPricingDraftId = 'D-EXECUTION-SUP';
    w.orderDrafts = [{...draft,id:w.currentPricingDraftId,draftId:w.currentPricingDraftId,status:'待审核',revision:1,clientRevision:1,recognitionContext:null,lines:[{...line,id:'D-EXECUTION-SUP-01',draftLineId:'D-EXECUTION-SUP-01',qty:5000}]}];
    const supplementation={orderLineIds:[old.id],targetDraftLineId:'D-EXECUTION-SUP-01',confirmedSameBatch:true,batchReference:'SYNTHETIC-EXECUTION',reason:'明确同批且尚未开印的补单'};
    const before={id:'RAW-EXECUTION',unit:'kg',rolls:[{id:'ROLL-EXECUTION',weightKg:10,inventoryStatus:'机边领用',issueRecordId:'ISSUE-EXECUTION',machineId:'M-EXECUTION',productionTaskId:task.id}],rawMaterialIssueRecords:[{issueRecordId:'ISSUE-EXECUTION',rollId:'ROLL-EXECUTION',machineId:'M-EXECUTION',productionTaskId:task.id,productionTaskOrderLineId:old.id}]};
    return {w,old,task,before,supplementation};
  };
  const consume=(f,taskId=f.task.id)=>applyRawMaterialTraceabilityAction({workspace:f.w,action:'confirm_consumption',before:{...f.before,rolls:f.before.rolls.map(row=>({...row,productionTaskId:taskId})),rawMaterialIssueRecords:f.before.rawMaterialIssueRecords.map(row=>({...row,productionTaskId:taskId}))},body:{rollId:'ROLL-EXECUTION',consumedWeightKg:5},operatorId:'U-PRICE',now:'2026-10-24T04:00:00Z'});
  const businessState=w=>JSON.stringify({lines:w.orderLines,prices:w.priceSnapshots,tasks:w.productionTasks,changes:w.orderLineChangeRecords});
  for(const stage of ['quote','confirm'])for(const fact of ['printing-consumption','issue-linked-consumption','loadedAt','physicalOutboundAt','finalDeliveryAt','deliveredAt','legacy-pickup','legacy-delivered-label','direct-line-paper','printed','queued']) {
    const f=await fixture();let quote;
    if(stage==='confirm'){quote=await makeQuote(f.w,{supplementation:f.supplementation},'before-fact');assert.ok(quote.response);}
    if(fact.includes('consumption')){const inbound=consume(f);if(fact==='issue-linked-consumption')delete inbound.rawMaterialConsumptionRecords[0].productionTaskId;f.w.rawMaterialInbounds=[inbound];}
    else if(['loadedAt','physicalOutboundAt','finalDeliveryAt','deliveredAt'].includes(fact))f.w.fulfillments.find(row=>(row.orderLineId??row.lineId)===f.old.id)[fact]='2026-10-24T04:01:00Z';
    else if(fact.startsWith('legacy-'))f.w.fulfillments[0].status=fact==='legacy-pickup'?'已自提':'已交付（历史）';
    else if(fact==='direct-line-paper')f.w.paperOutboundDocuments=[{orderLineId:f.old.id,status:'已打印待交库'}];
    else if(fact==='printed')f.w.printRecords=[{targetType:'fulfillment',targetId:f.w.fulfillments[0].id,status:'printed'}];
    else f.w.printJobs=[{targetType:'fulfillment',targetId:f.w.fulfillments[0].id,jobStatus:'queued'}];
    const before=businessState(f.w);
    const result=stage==='quote'?await makeQuote(f.w,{supplementation:f.supplementation},`blocked-${fact}`):await confirmQuote(f.w,quote.response.quote,{confirmedAffectedOrderLineIds:[f.old.id]},`blocked-${fact}`);
    assert.equal(result.statusCode,409,`${stage} ${fact}: ${JSON.stringify(result)}`);
    assert.equal(result.code,['direct-line-paper','printed','queued'].includes(fact)?'ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT':'ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE');
    assert.equal(businessState(f.w),before,'Rejected supplements preserve old order, prices, production and change evidence');
  }
  for(const fact of ['issued-only','bag-making-consumption','unlinked-machine','voided-history']) {
    const f=await fixture();f.w.rawMaterialInbounds=[f.before];
    if(fact==='bag-making-consumption'){f.w.productionTasks.push({id:'BAG-EXECUTION',orderLineId:f.old.id,taskType:'制袋',taskStatus:'生产中',plannedQty:5000,revision:1});f.w.rawMaterialInbounds=[consume(f,'BAG-EXECUTION')];}
    if(fact==='unlinked-machine')f.w.rawMaterialInbounds=[{rawMaterialConsumptionRecords:[{consumedWeightKg:5,machineId:'M-EXECUTION',productionTaskOrderLineId:f.old.id}]}];
    if(fact==='voided-history'){f.w.paperOutboundDocuments=[{orderLineId:f.old.id,status:'voided'}];f.w.printRecords=[{targetType:'fulfillment',targetId:f.w.fulfillments[0].id,status:'voided'}];f.w.printJobs=[{targetType:'fulfillment',targetId:f.w.fulfillments[0].id,jobStatus:'printed'}];}
    const quote=await makeQuote(f.w,{supplementation:f.supplementation},`allowed-${fact}`);assert.ok(quote.response,`${fact}: ${JSON.stringify(quote)}`);
    const draft=f.w.orderDrafts.find(row=>row.id===f.w.currentPricingDraftId),body={expectedRevision:draft.revision,lines:structuredClone(draft.lines),pricingQuoteId:quote.response.quote.quoteId,confirmedAffectedOrderLineIds:[f.old.id],idempotencyKey:`office-pricing-confirm-allowed-${fact}`};
    const input={workspace:f.w,draftId:draft.id,operatorId:'U-PRICE',actionPermissions:permissions,body};
    const saved=await pricingService.confirmOrderDraft(input);assert.ok(saved.response,JSON.stringify(saved));
    const oldRevisions=f.w.priceSnapshots.filter(row=>row.orderLineId===f.old.id);assert.equal(oldRevisions.length,2);assert.equal(oldRevisions.find(row=>row.snapshotType==='print_group_revision').printPrice,.06);
    // Exact successful confirmation remains replayable after later consumption.
    f.w.rawMaterialInbounds=[consume(f)];const replay=await pricingService.confirmOrderDraft(input);assert.deepEqual(replay.response,saved.response);assert.equal(f.w.priceSnapshots.filter(row=>row.orderLineId===f.old.id).length,2);
  }
  console.log('PASS supplement execution facts: quote and confirm reject exact printing consumption, stale-status delivery timestamps and live print/jobs; pure issue, bag-only execution, unlinked machine and voided history remain valid; original success replays before new guards.');
}
