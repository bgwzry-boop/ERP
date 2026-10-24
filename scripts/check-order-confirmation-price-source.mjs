import assert from "node:assert/strict";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createLocalOrderDraftRepository } from "../server/orderDraftRepository.mjs";
import { createLocalOrderConfirmationTransactionRepository, buildConfirmOrderTransactionQuery } from "../server/orderConfirmationTransactionRepository.mjs";
import { projectBagwinPublicStatus } from "../server/miniapp/bagwinErpIntegrationService.mjs";
import { createApiServer } from "../server/apiServer.mjs";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";
import { createLockedSpecialPriceDraftFixture } from "./helpers/lockedSpecialPriceFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";

export function buildPriceSourceWorkspace({ size = "43*51*12", orderType = "custom_special", print = false } = {}) {
  const line = { id: "D-PRICE-01", draftLineId: "D-PRICE-01", customerId: "C-PRICE", customer: "合成价格核对客户", product: print ? "测试定制图案" : "特殊尺寸空白袋", productName: print ? "测试定制图案" : "特殊尺寸空白袋", orderType, size, color: "红色", bagColor: "红色", handle: "普通提", handleType: "普通提", style: "空白袋", print: print ? "是" : "否", printFlag: print, qty: 100, fulfillment: "自提", fulfillmentMethod: "自提", latest: "2026-11-01", latestNeededAt: "2026-11-01", printSide: print ? "单面" : "非印刷", printColor: print ? "黑色" : "非印刷", artworkStatus: print ? "已上传" : "非印刷" };
  const draft = { id: "D-PRICE", draftId: "D-PRICE", sourceChannel: "manual", customerId: line.customerId, sourceText: "合成未报价核对", status: "待审核", revision: 1, clientRevision: 1, lines: [line] };
  return { users: [{ id: "U-PRICE" }], customers: [{ id: line.customerId, name: line.customer }], orderDrafts: [draft], orderLines: [], originalOrders: [], fulfillments: [], inventories: [], inventoryReservations: [], inventoryIntents: [], inventoryLedgers: [], todos: [], operationLogs: [], productionTasks: [], priceSnapshots: [], miniappConfirmationSources: [], orderDraftRepository: createLocalOrderDraftRepository(), orderConfirmationTransactionRepository: createLocalOrderConfirmationTransactionRepository() };
}

export async function checkOrderConfirmationPriceSource() {
  const service = createApiSharedServiceRegistry().orderDraftCommandService;
  for (const print of [false, true]) {
    const workspace = buildPriceSourceWorkspace({ print });
    const before = structuredClone(workspace.orderDrafts);
    const result = await service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: 1, idempotencyKey: `no-price-${print}`, lines: workspace.orderDrafts[0].lines } });
    assert.equal(result.error, true, "Unpriced special-size orders must be blocked even when a print fee exists");
    assert.equal(result.code, "ORDER_PRICE_SOURCE_REQUIRED");
    assert.deepEqual(workspace.orderDrafts, before, "Refusal must preserve the draft");
    for (const key of ["orderLines", "productionTasks", "fulfillments", "inventoryReservations", "priceSnapshots", "operationLogs"]) assert.equal(workspace[key].length, 0, key);
  }
  const workspace = buildPriceSourceWorkspace({ size: "30*38*10", orderType: "stock" });
  Object.assign(workspace, buildPublishedOrderPriceFixture({ bagPrice: 0.9 }));
  const response = await service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: 1, idempotencyKey: "known-price", lines: workspace.orderDrafts[0].lines } });
  assert.ok(response.response, JSON.stringify(response));
  assert.equal(response.response.priceSnapshots[0].bagPrice, 0.9);
  assert.equal(response.response.priceSnapshots[0].finalAmount, 90);
  assert.equal(response.response.priceSnapshots[0].sourceEvidence.priceTableVersion, 9);
  assert.equal(workspace.priceSnapshots[0].sourceEvidence.priceVersion, "TEST-PUBLISHED-v9");

  const quoted = buildPriceSourceWorkspace();
  quoted.orderDraftRepository = createLockedSpecialPriceDraftFixture();
  const locked = await service.confirmOrderDraft({ workspace: quoted, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: 1, idempotencyKey: "locked-special-price", lines: quoted.orderDrafts[0].lines } });
  assert.ok(locked.response, JSON.stringify(locked));
  assert.equal(locked.response.priceSnapshots[0].finalAmount, 99);
  const quotedFree = buildPriceSourceWorkspace();
  quotedFree.orderDraftRepository = createLockedSpecialPriceDraftFixture();
  const source = quotedFree.orderDraftRepository.getMiniappConfirmationSources({ workspace: quotedFree, draftId: "D-PRICE" })[0];
  const origin = source.lines[0].normalizedLine;
  origin.estimatedAmount = 0;
  Object.assign(origin.quoteSnapshot, { basePrice: 0, unitPrice: 0, amount: 0 });
  source.snapshots[0].quote.amount = 0;
  source.snapshots[0].quote.lines[0] = { sourceLineId: origin.sourceLineId, amount: 0, snapshot: structuredClone(origin.quoteSnapshot) };
  const freeQuote = await service.confirmOrderDraft({ workspace: quotedFree, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: 1, idempotencyKey: "locked-zero-price", lines: quotedFree.orderDrafts[0].lines } });
  assert.ok(freeQuote.response, "An authenticated locked zero quote is not an unknown price");
  assert.equal(freeQuote.response.priceSnapshots[0].finalAmount, 0);

  const direct = { workspace: buildPriceSourceWorkspace(), expectedDraftRevision: 1, idempotencyKey: "direct-no-price", orderDraft: { ...buildPriceSourceWorkspace().orderDrafts[0], status: "已生成正式订单" }, order: { orderId: "ORD-PRICE", customerId: "C-PRICE", sourceDraftId: "D-PRICE", createdBy: "U-PRICE" }, orderLines: [{ orderLineId: "OL-PRICE", orderId: "ORD-PRICE", customerId: "C-PRICE", orderType: "custom_special", size: "43*51*12", originalQty: 100, amount: 0, createdBy: "U-PRICE" }], priceSnapshots: [{ orderLineId: "OL-PRICE", bagPrice: 0, printPrice: 0, chargeableQty: 100, finalAmount: 0, createdBy: "U-PRICE" }], operationLog: { id: "LOG-PRICE", targetType: "original_order", targetId: "ORD-PRICE", action: "confirm_order_draft", operatorId: "U-PRICE" } };
  assert.throws(() => createLocalOrderConfirmationTransactionRepository().confirmOrder(direct), { code: "ORDER_PRICE_SOURCE_REQUIRED" });
  assert.throws(() => buildConfirmOrderTransactionQuery(direct), { code: "ORDER_PRICE_SOURCE_REQUIRED" });
  const valid = structuredClone({ ...direct, workspace: undefined });
  valid.priceSnapshots[0] = { ...valid.priceSnapshots[0], bagPrice: 0.1234, finalAmount: 12.34, overrideReason: "有权限的上游业务已确认本单价" };
  valid.orderLines[0].amount = 12.34;
  assert.ok(buildConfirmOrderTransactionQuery(valid).text);
  const authorized = createLocalOrderConfirmationTransactionRepository().confirmOrder({ ...valid, workspace: buildPriceSourceWorkspace() });
  assert.equal(authorized.priceSnapshots[0].bagPrice, 0.1234);
  const unjustifiedZero = structuredClone(valid);
  unjustifiedZero.priceSnapshots[0].finalAmount = 0;
  unjustifiedZero.orderLines[0].amount = 0;
  assert.throws(() => buildConfirmOrderTransactionQuery(unjustifiedZero), { code: "ORDER_PRICE_SOURCE_REQUIRED" });
  assert.throws(() => createLocalOrderConfirmationTransactionRepository().confirmOrder({ ...unjustifiedZero, workspace: buildPriceSourceWorkspace() }), { code: "ORDER_PRICE_SOURCE_REQUIRED" });
  const waived = structuredClone(unjustifiedZero);
  waived.priceSnapshots[0].adjustmentAmount = -12.34;
  waived.priceSnapshots[0].overrideReason = "已授权全额减免并保存业务依据";
  assert.ok(buildConfirmOrderTransactionQuery(waived).text);
  const unexplainedWaiver = structuredClone(waived);
  unexplainedWaiver.priceSnapshots[0].overrideReason = "";
  assert.throws(() => buildConfirmOrderTransactionQuery(unexplainedWaiver), { code: "ORDER_PRICE_SOURCE_REQUIRED" });
  const roundedZero = structuredClone(unjustifiedZero);
  Object.assign(roundedZero.priceSnapshots[0], { bagPrice: 0.0001, chargeableQty: 1 });
  assert.ok(buildConfirmOrderTransactionQuery(roundedZero).text, "Keep monetary rounding separate from missing prices");
  const gift = structuredClone(valid);
  gift.priceSnapshots[0] = { ...gift.priceSnapshots[0], chargeableQty: 0, finalAmount: 0, overrideReason: "明确赠送，本单不计费" };
  gift.orderLines[0].amount = 0;
  assert.ok(buildConfirmOrderTransactionQuery(gift).text, "An explicitly priced gift is not an unknown price");
  const free = structuredClone(gift);
  free.priceSnapshots[0].bagPrice = 0;
  assert.ok(buildConfirmOrderTransactionQuery(free).text, "An explicit zero-billable gift with audit reason remains legal");
  const giftReceipt = createLocalOrderConfirmationTransactionRepository().confirmOrder({ ...free, workspace: buildPriceSourceWorkspace() });
  assert.equal(giftReceipt.priceSnapshots[0].chargeableQty, 0);
  console.log("Order price-source guards: real command and local transaction reject unpriced blank/printed special orders without losing drafts; known prices, authorized snapshots and explicit gifts remain supported.");
}

export function checkPublicCompletionProjection() {
  const cases = [
    [{ lineStatuses: ["已交付", "制袋中"], fulfillmentStatuses: ["已交付"], orderStatuses: ["处理中"] }, "production"],
    [{ lineStatuses: ["已交付"], fulfillmentStatuses: ["已交付", "配送中"] }, "transporting"],
    [{ lineStatuses: ["已交付", "已作废"], fulfillmentStatuses: ["已交付", "已取消"] }, "completed"],
    [{ lineStatuses: ["已作废", "已取消"] }, "cancelled"],
    [{ lineStatuses: ["已取消", "异常暂停"], fulfillmentStatuses: ["已交付"] }, "production"],
    [{ orderStatuses: ["已完成"] }, "completed"],
    [{ orderStatuses: ["已完成"], fulfillmentStatuses: ["待出库"] }, "delivery"],
    [{ fulfillmentStatuses: ["已交付"] }, "completed"],
    [{ lineStatuses: ["已交付"], fulfillmentStatuses: ["已交付"], productionStatuses: ["制袋中"] }, "production"],
    [{ lineStatuses: ["已交付"], fulfillmentStatuses: ["已交付"], productionStatuses: ["已完成", "已作废"] }, "completed"],
    [{ orderStatuses: ["已完成"], productionStatuses: ["异常暂停"] }, "production"],
    [{}, "confirming"],
  ];
  for (const [facts, expected] of cases) assert.equal(projectBagwinPublicStatus(facts).status, expected, JSON.stringify(facts));
  console.log("Public completion projection: partial delivery, active fulfillment, cancelled lines, exceptions, missing facts and completed legacy history remain distinct.");
}

export async function checkOrderPriceSourceHttp() {
  const storageRoot = await mkdtemp(join(tmpdir(), "erp-order-price-source-"));
  const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: storageRoot, seedSource: "synthetic", applyProductionEnvFile: false, authMode: "prototype", authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A", allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false, allowDefaultSeedUser: false }));
  let token;
  try {
    await server.ready;
    await listenTestServer(server);
    const baseUrl = getTestServerBaseUrl(server);
    const api = (path, body, method = "POST") => requestJson(baseUrl, `/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" });
    assert.equal(login.status, 200);
    token = login.body.session.accessToken;
    const recognized = await api("/order-drafts/recognize", { sourceText: "王五包装 30*38红100个 明天自提", customerId: "C003", idempotencyKey: "http-price-recognize" });
    assert.equal(recognized.status, 200);
    const draftId = recognized.body.draft.draftId;
    const line = { ...buildPriceSourceWorkspace().orderDrafts[0].lines[0], id: `${draftId}-SPECIAL`, draftLineId: `${draftId}-SPECIAL`, customerId: "C003", customer: "王五包装" };
    const saved = await api(`/order-drafts/${draftId}`, { expectedRevision: recognized.body.draft.clientRevision, sourceText: "合成特殊尺寸无报价", customerId: "C003", lines: [line], idempotencyKey: "http-price-save" }, "PATCH");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const before = await api(`/order-drafts/${draftId}`, undefined, "GET");
    const confirmed = await api(`/order-drafts/${draftId}/confirm`, { expectedRevision: saved.body.draft.clientRevision, lines: [line], idempotencyKey: "http-price-confirm" });
    assert.equal(confirmed.status, 409, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.code, "ORDER_PRICE_SOURCE_REQUIRED");
    const after = await api(`/order-drafts/${draftId}`, undefined, "GET");
    assert.deepEqual(after.body, before.body, "HTTP refusal must not consume or erase the saved draft");
    const denied = await requestJson(baseUrl, `/api/order-drafts/${draftId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 2, lines: [line] }) });
    assert.ok([401, 403].includes(denied.status), "No new client-provided price bypass or anonymous confirmation");
    console.log("Order price source HTTP: signed session, real save/confirm command, explicit missing-price conflict, unchanged saved draft, and anonymous refusal passed.");
  } finally {
    await closeTestServer(server);
    await rm(storageRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) { await checkOrderConfirmationPriceSource(); checkPublicCompletionProjection(); await checkOrderPriceSourceHttp(); }
