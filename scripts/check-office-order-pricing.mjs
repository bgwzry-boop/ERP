import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { buildPriceSourceWorkspace } from "./check-order-confirmation-price-source.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { buildOrderPrintingPriceGroups } from "../server/orderPrintingPriceGroups.mjs";
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
  grouped.orderDrafts[0].lines.push({
    ...first,
    id: "D-PRICE-02",
    draftLineId: "D-PRICE-02",
    color: "白色",
    bagColor: "白色",
    printColor: "红色",
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
  for (const change of [
    { printContent: "另一个商标" },
    { size: "32*40*10" },
    { printSide: "双面" },
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
  console.log(
    "Office formal pricing: published price, special confirmed material and fallback, authorized audited override, permission/no-price/stale guards, same-draft colour-independent groups, explicit cross-order supplemental revision and unchanged original snapshots passed.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await checkOfficePricing();
