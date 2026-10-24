import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createApiServer } from "../server/apiServer.mjs";
import { loadSeedWorkspace } from "../server/seedData.mjs";
import { buildPriceSourceWorkspace } from "./check-order-confirmation-price-source.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

const service = createApiSharedServiceRegistry().orderDraftCommandService;
const pricedWorkspace = () => Object.assign(buildPriceSourceWorkspace({ size: "30*38*10", orderType: "stock" }), buildPublishedOrderPriceFixture({ bagPrice: 0.9 }));
const confirm = (workspace, key = "published-confirm") => service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE",
  body: { expectedRevision: 1, idempotencyKey: key, lines: workspace.orderDrafts[0].lines } });
const businessState = workspace => structuredClone(Object.fromEntries(["orderDrafts", "orderLines", "originalOrders", "fulfillments", "productionTasks", "priceSnapshots", "operationLogs"].map(key => [key, workspace[key]])));

async function checkPublishedPriceService() {
  assert.equal(loadSeedWorkspace({ source: "synthetic", runtimeMode: "test" }).priceTables[0].status, "active");
  for (const runtimeMode of ["strict", "prototype"]) assert.equal(loadSeedWorkspace({ source: "synthetic", runtimeMode }).priceTables, undefined, `${runtimeMode} cannot invent a published price`);
  assert.equal(loadSeedWorkspace({ runtimeMode: "production" }).priceTables, undefined);
  const workspace = pricedWorkspace();
  const requestLines = structuredClone(workspace.orderDrafts[0].lines);
  const result = await confirm(workspace);
  assert.equal(result.response.priceSnapshots[0].finalAmount, 90, "Published 0.90 must replace the old 0.34 demo price");
  assert.equal(result.response.priceSnapshots[0].priceVersion, "TEST-PUBLISHED-v9");
  assert.equal(workspace.priceSnapshots[0].sourceEvidence.priceVersion, "TEST-PUBLISHED-v9");
  const original = structuredClone(workspace.priceSnapshots);
  workspace.priceTableItems.forEach(item => { item.bagPrice = 1.5; });
  assert.deepEqual(await service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE",
    body: { expectedRevision: 1, idempotencyKey: "published-confirm", lines: requestLines } }), result, "Same-key replay keeps the original order snapshot after a publication changes");
  assert.deepEqual(workspace.priceSnapshots, original, "Historical orders are never repriced");

  const invalidCases = [
    ["missing table", w => { w.priceTables = []; }],
    ["pending table", w => { w.priceTables[0].status = "pending_review"; }],
    ["future publication", w => { w.priceTables[0].effectiveFrom = "2999-01-01T00:00:00Z"; }],
    ["expired publication", w => { w.priceTables[0].effectiveTo = "2020-01-02T00:00:00Z"; }],
    ["conflicting active tables", w => { w.priceTables.push({ ...w.priceTables[0], id: "PT-OTHER" }); }],
    ["no matching item", w => { w.priceTableItems = []; }],
    ["disabled price", w => { w.priceTableItems.forEach(item => { item.enabled = false; }); }],
    ["duplicate equally specific item", w => { w.priceTableItems.push({ ...w.priceTableItems.find(item => item.sizeKey === "30*37*10" && item.handleType === "普通提" && item.styleKey === "空白袋"), id: "PI-CONFLICT", bagPrice: 1.2 }); }],
    ["unpriced item", w => { w.priceTableItems.forEach(item => { item.bagPrice = 0; }); }],
  ];
  for (const [label, mutate] of invalidCases) {
    const w = pricedWorkspace(); mutate(w);
    const before = businessState(w);
    const denied = await confirm(w);
    assert.equal(denied.code, "ORDER_PRICE_SOURCE_REQUIRED", label);
    assert.deepEqual(businessState(w), before, `${label}: rejected confirmation must preserve every business record`);
  }
  const pending = pricedWorkspace();
  pending.priceTables.push({ ...pending.priceTables[0], id: "PT-PENDING", status: "pending_review" });
  assert.equal((await confirm(pending)).response.priceSnapshots[0].finalAmount, 90, "Pending revisions do not withdraw the current active price");
  const refreshed = pricedWorkspace();
  refreshed.priceTableItems.forEach(item => { item.bagPrice = 0.34; });
  refreshed.coreWorkspaceReadRepository = { kind: "postgres", async loadState() { return buildPublishedOrderPriceFixture({ bagPrice: 0.9 }); } };
  assert.equal((await confirm(refreshed)).response.priceSnapshots[0].finalAmount, 90, "Refresh current server-owned prices before confirmation");
  for (const broken of [{}, { priceTables: [] }, { priceTableItems: [] }]) {
    const w = pricedWorkspace();
    w.coreWorkspaceReadRepository = { kind: "postgres", async loadState() { return broken; } };
    const before = businessState(w);
    assert.equal((await confirm(w)).code, "ORDER_PRICE_SOURCE_REQUIRED", "A damaged fresh-read contract must never reuse cached prices");
    assert.deepEqual(businessState(w), before);
  }
  const precise = pricedWorkspace();
  precise.priceTableItems.forEach(item => { item.bagPrice = 0.1234; });
  const preciseResult = await confirm(precise);
  assert.equal(preciseResult.response.priceSnapshots[0].bagPrice, 0.1234);
  assert.equal(preciseResult.response.priceSnapshots[0].finalAmount, 12.34, "Keep the published four-decimal unit price until final-money rounding");
  const metallic = pricedWorkspace();
  Object.assign(metallic.orderDrafts[0].lines[0], { style: "覆膜金银", product: "覆膜金银袋" });
  metallic.priceTableItems = [
    { ...metallic.priceTableItems[0], id: "PI-LAMINATED-PLAIN", sizeKey: "30*37*10", styleKey: "覆膜袋", bagPrice: 0.9 },
    { ...metallic.priceTableItems[0], id: "PI-LAMINATED-METALLIC", sizeKey: "30*37*10", styleKey: "覆膜金银", bagPrice: 1.2 },
  ];
  assert.equal((await confirm(metallic)).response.priceSnapshots[0].finalAmount, 120, "Metallic lamination cannot take the plain laminated price");
  const noMetallic = pricedWorkspace();
  Object.assign(noMetallic.orderDrafts[0].lines[0], { style: "覆膜金银", product: "覆膜金银袋" });
  noMetallic.priceTableItems = [{ ...noMetallic.priceTableItems[0], sizeKey: "30*37*10", styleKey: "覆膜袋", bagPrice: 0.9 }];
  assert.equal((await confirm(noMetallic)).code, "ORDER_PRICE_SOURCE_REQUIRED", "Missing metallic price must not fall back to plain lamination");
  for (const [handle, itemHandle] of [["普通提", "普通提"], ["加长提", "普通提"], ["加长提", "加长提"]]) {
    const blankStyle = pricedWorkspace();
    Object.assign(blankStyle.orderDrafts[0].lines[0], { style: "覆膜金银", product: "覆膜金银袋", handle, handleType: handle });
    blankStyle.priceTableItems = [{ ...blankStyle.priceTableItems[0], sizeKey: "30*37*10", styleKey: "", handleType: itemHandle, bagPrice: 0.9 }];
    const before = businessState(blankStyle);
    assert.equal((await confirm(blankStyle)).code, "ORDER_PRICE_SOURCE_REQUIRED", `${handle}/${itemHandle}: metallic prices require an explicit matching style`);
    assert.deepEqual(businessState(blankStyle), before);
  }

  const keyedSize = pricedWorkspace();
  keyedSize.priceTableItems.forEach(item => { if (item.sizeKey === "30*37*10") item.sizeKey = "SIZE-PUBLISHED-3037"; });
  keyedSize.sizeSpecs = [{ sizeKey: "SIZE-PUBLISHED-3037", displayName: "30×37×10" }];
  assert.equal((await confirm(keyedSize)).response.priceSnapshots[0].finalAmount, 90, "Price size keys resolve through the same size-spec master as the Miniapp projection");
  const printed = pricedWorkspace();
  Object.assign(printed.orderDrafts[0].lines[0], { orderType: "custom_print", print: "是", printFlag: true, printSide: "单面", printColor: "黑色", artworkStatus: "已上传" });
  assert.equal((await confirm(printed)).response.priceSnapshots[0].finalAmount, 99, "Reuse the established shared print-step price on the published bag price");
  const printedCommon = pricedWorkspace();
  Object.assign(printedCommon.orderDrafts[0].lines[0], { orderType: "stock_printed", style: "福", product: "福字袋", print: "是", printFlag: true, printColor: "金色" });
  assert.equal((await confirm(printedCommon)).response.priceSnapshots[0].finalAmount, 90, "A printed common-goods pattern must not be charged an extra private-print fee");
  const privatePattern = pricedWorkspace();
  Object.assign(privatePattern.orderDrafts[0].lines[0], { orderType: "custom_print", style: "福", product: "客户定制图案", print: "是", printFlag: true, printSide: "单面", printColor: "金色", artworkStatus: "已上传" });
  assert.equal((await confirm(privatePattern)).response.priceSnapshots[0].finalAmount, 99, "An explicit custom-print order cannot become printed common goods just from a pattern name");
  const extended = pricedWorkspace();
  Object.assign(extended.orderDrafts[0].lines[0], { handle: "加长提", handleType: "加长提" });
  extended.priceTableItems = extended.priceTableItems.filter(item => item.handleType !== "加长提");
  assert.equal((await confirm(extended)).response.priceSnapshots[0].finalAmount, 93, "Reuse the established extended-handle fallback");
  const split = pricedWorkspace();
  const first = split.orderDrafts[0].lines[0];
  split.orderDrafts[0].lines.push({ ...first, id: "D-PRICE-02", draftLineId: "D-PRICE-02", qty: 200, latest: "2026-11-02", latestNeededAt: "2026-11-02" });
  const body = { expectedRevision: 1, lines: split.orderDrafts[0].lines };
  const preview = await service.previewOrderDraftSplit({ workspace: split, draftId: "D-PRICE", body });
  assert.equal(preview.response.splitPlan.groups.length, 2);
  const splitResult = await service.confirmSplitOrderDraft({ workspace: split, draftId: "D-PRICE", operatorId: "U-PRICE", body: { ...body, splitPlanHash: preview.response.splitPlan.planHash, idempotencyKey: "published-split" } });
  assert.deepEqual(splitResult.response.priceSnapshots.map(row => row.finalAmount).sort((a, b) => a - b), [90, 180]);

  const stale = pricedWorkspace();
  const before = businessState(stale);
  const persist = stale.orderConfirmationTransactionRepository.confirmOrder.bind(stale.orderConfirmationTransactionRepository);
  stale.orderConfirmationTransactionRepository.confirmOrder = input => {
    stale.priceTableItems.forEach(item => { item.bagPrice = 1; });
    return persist(input);
  };
  await assert.rejects(confirm(stale), { code: "ERP_ORDER_PRICE_SOURCE_CONFLICT" });
  assert.deepEqual(businessState(stale), before, "Publication changes before the local transaction cannot consume the draft");
  console.log("Published order price service: 0.90×100=90, immutable historical/idempotent snapshots, split pricing, effective-date/conflict/missing guards, fresh read and transaction source conflict passed.");
}

async function checkPublishedPriceHttp() {
  const storageRoot = await mkdtemp(join(tmpdir(), "erp-published-order-price-"));
  let prices = buildPublishedOrderPriceFixture({ bagPrice: 0.9 });
  const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: storageRoot, seedSource: "synthetic", applyProductionEnvFile: false,
    authMode: "prototype", authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A", allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false, allowDefaultSeedUser: false,
    coreWorkspaceReadRepository: { kind: "local_memory", loadState: () => structuredClone(prices) } }));
  try {
    await server.ready; await listenTestServer(server);
    const baseUrl = getTestServerBaseUrl(server);
    let token;
    const api = (path, body, method = "POST") => requestJson(baseUrl, `/api${path}`, { method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" });
    assert.equal(login.status, 200); token = login.body.session.accessToken;
    const create = async key => {
      const result = await api("/order-drafts/recognize", { customerId: "C003", sourceText: "王五包装 30*38红100个 明天自提", idempotencyKey: key });
      assert.equal(result.status, 200); return result.body;
    };
    const accepted = await create("http-published-positive");
    const positive = await api(`/order-drafts/${accepted.draft.draftId}/confirm`, { expectedRevision: accepted.draft.clientRevision, lines: accepted.lines,
      bagPrice: 0.01, finalAmount: 1, priceVersion: "forged-client-price", idempotencyKey: "http-published-confirm" });
    assert.equal(positive.status, 200, JSON.stringify(positive.body));
    assert.equal(positive.body.priceSnapshots[0].bagPrice, 0.9);
    assert.equal(positive.body.priceSnapshots[0].finalAmount, 90, "Client fields cannot replace published facts");
    const denied = await create("http-published-negative");
    prices = { priceTables: [], priceTableItems: [] };
    const before = await api(`/order-drafts/${denied.draft.draftId}`, undefined, "GET");
    const blocked = await api(`/order-drafts/${denied.draft.draftId}/confirm`, { expectedRevision: denied.draft.clientRevision, lines: denied.lines, bagPrice: 0.9, idempotencyKey: "http-no-published-price" });
    assert.equal(blocked.status, 409); assert.equal(blocked.body.code, "ORDER_PRICE_SOURCE_REQUIRED");
    assert.deepEqual((await api(`/order-drafts/${denied.draft.draftId}`, undefined, "GET")).body, before.body);

    prices = buildPublishedOrderPriceFixture({ bagPrice: 0.9 });
    const split = await create("http-published-split");
    const first = split.lines[0];
    const lines = [first, { ...first, id: `${first.id}-NEXT`, draftLineId: `${first.draftLineId}-NEXT`, qty: 200, latest: "2099-11-02", latestNeededAt: "2099-11-02" }];
    const preview = await api(`/order-drafts/${split.draft.draftId}/split-preview`, { expectedRevision: split.draft.clientRevision, lines });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.splitPlan.groups.length, 2);
    const splitResult = await api(`/order-drafts/${split.draft.draftId}/split-confirm`, { expectedRevision: split.draft.clientRevision, lines, splitPlanHash: preview.body.splitPlan.planHash, idempotencyKey: "http-published-split-confirm" });
    assert.equal(splitResult.status, 200, JSON.stringify(splitResult.body));
    assert.deepEqual(splitResult.body.priceSnapshots.map(row => row.finalAmount).sort((a, b) => a - b), [90, 180]);
    console.log("Published order price HTTP: signed session uses current 0.90 price for normal/split confirmation; client prices ignored; missing publication returns 409 with unchanged saved draft.");
  } finally { await closeTestServer(server); await rm(storageRoot, { recursive: true, force: true }); }
}

await checkPublishedPriceService();
await checkPublishedPriceHttp();
