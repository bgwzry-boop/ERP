import { quoteOfficeOrderDraft } from "../src/services/officeOrderPricingApiClient.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
const receiptInput = {
  draftId: "D-RECEIPT",
  clientRevision: 1,
  rows: [{ id: "EXPECTED-LINE", qty: 100, print: "否", orderType: "stock" }],
  authState: { session: { accessToken: "synthetic" } },
  idempotencyKey: "receipt-validation-key",
};
const validReceipt = {
  quote: {
    quoteId: "OQ-SYNTHETIC",
    draftId: "D-RECEIPT",
    clientRevision: 2,
    excludedDraftLineIds: [],
    groups: [],
    affectedOrders: [],
    lines: [
      {
        draftLineId: "EXPECTED-LINE",
        bagPrice: 0.9,
        printPrice: 0,
        otherFee: 0,
        adjustmentAmount: 0,
        chargeableQty: 100,
        amount: 90,
      },
    ],
  },
};
const receipt = async (value) =>
  quoteOfficeOrderDraft(receiptInput, {
    serverRequired: true,
    fetchImpl: async () =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
assert.equal((await receipt(validReceipt)).source, "api");
for (const mutate of [
  (q) => (q.clientRevision = 1),
  (q) => (q.lines[0].draftLineId = "OTHER-LINE"),
  (q) => q.lines.push({ ...q.lines[0] }),
  (q) => delete q.groups,
  (q) => delete q.affectedOrders,
  (q) => (q.lines[0].amount = -1),
  (q) => delete q.lines[0].chargeableQty,
  (q) => (q.lines[0].amount = 0),
]) {
  const bad = structuredClone(validReceipt);
  mutate(bad.quote);
  assert.equal(
    (await receipt(bad)).error.code,
    "ORDER_PRICE_QUOTE_RECEIPT_INVALID",
  );
}
const storageRoot = await mkdtemp(join(tmpdir(), "erp-office-quote-http-"));
const server = createApiServer(
  withLocalRepositoryFixture({
    runtimeMode: "test",
    runtimeStorageRoot: storageRoot,
    seedSource: "synthetic",
    applyProductionEnvFile: false,
    authMode: "prototype",
    authSecret: randomBytes(32).toString("hex"),
    fixedPreviewUserId: "U-MANAGER-A",
    allowLegacyIdentityHeaders: false,
    allowActionPermissionOverride: false,
    allowDefaultSeedUser: false,
    coreWorkspaceReadRepository: {
      kind: "local_memory",
      loadState: () => buildPublishedOrderPriceFixture({ bagPrice: 0.9 }),
    },
  }),
);
try {
  await server.ready;
  await listenTestServer(server);
  const base = getTestServerBaseUrl(server);
  let token;
  const api = (path, body, method = "POST") =>
    requestJson(base, `/api${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.ok(
    [401, 403].includes(
      (await api("/order-drafts/missing/price-quote", { expectedRevision: 1 }))
        .status,
    ),
  );
  const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" });
  token = login.body.session.accessToken;
  const create = async (key, text = "王五包装 30*38红5000个 明天自提") => {
    const r = await api("/order-drafts/recognize", {
      customerId: "C003",
      sourceText: text,
      idempotencyKey: key,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const draft = await create("http-office-quote-create");
  const id = draft.draft.draftId;
  const line = draft.lines[0];
  const price = await api(`/order-drafts/${id}/price-quote`, {
    expectedRevision: draft.draft.clientRevision,
    lines: draft.lines,
    idempotencyKey: "http-office-quote-valid",
    bagPrice: 0.01,
    overrides: [],
  });
  assert.equal(price.status, 200, JSON.stringify(price.body));
  assert.equal(price.body.quote.lines[0].bagPrice, 0.9);
  assert.equal(price.body.quote.lines[0].amount, 4500);
  const missing = await api(`/order-drafts/${id}/confirm`, {
    expectedRevision: price.body.quote.clientRevision,
    lines: draft.lines,
    idempotencyKey: "http-office-no-quote-id",
  });
  assert.equal(missing.status, 409);
  assert.equal(missing.body.code, "ORDER_PRICE_QUOTE_CHANGED");
  const confirmed = await api(`/order-drafts/${id}/confirm`, {
    expectedRevision: price.body.quote.clientRevision,
    lines: draft.lines,
    pricingQuoteId: price.body.quote.quoteId,
    idempotencyKey: "http-office-price-confirm",
    bagPrice: 0.01,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.priceSnapshots[0].finalAmount, 4500);
  assert.equal(
    confirmed.body.priceSnapshots[0].sourceEvidence.officeQuoteId,
    price.body.quote.quoteId,
  );
  assert.equal(confirmed.body.priceSnapshots[0].createdBy, "U-MANAGER-A");
  const special = await create("http-office-special-create");
  const sid = special.draft.draftId;
  const lines = special.lines.map((l) => ({
    ...l,
    orderType: "custom_special",
    size: "43*31*12",
  }));
  const zeroReason = await api(`/order-drafts/${sid}/price-quote`, {
    expectedRevision: special.draft.clientRevision,
    lines,
    overrides: [{ draftLineId: line.draftLineId, bagPrice: 0.8 }],
    idempotencyKey: "http-office-reason-missing",
  });
  assert.equal(zeroReason.status, 422);
  const override = await api(`/order-drafts/${sid}/price-quote`, {
    expectedRevision: special.draft.clientRevision,
    lines,
    overrides: [
      {
        draftLineId: lines[0].draftLineId,
        bagPrice: 0.8,
        reason: "客户议价，已核对本单成交价",
      },
    ],
    operatorId: "FORGED",
    idempotencyKey: "http-office-override-valid",
  });
  assert.equal(override.status, 200, JSON.stringify(override.body));
  assert.equal(override.body.quote.lines[0].amount, 4000);
  assert.equal(override.body.quote.lines[0].override.operatorId, "U-MANAGER-A");
  const finish = await api(`/order-drafts/${sid}/confirm`, {
    expectedRevision: override.body.quote.clientRevision,
    lines,
    pricingQuoteId: override.body.quote.quoteId,
    idempotencyKey: "http-office-override-confirm",
  });
  assert.equal(finish.status, 200, JSON.stringify(finish.body));
  assert.equal(
    finish.body.priceSnapshots[0].overrideReason,
    "客户议价，已核对本单成交价",
  );
  console.log(
    "Office pricing signed HTTP: anonymous denial; current server price and quote id required; authorized special per-order price/reason/actor; immutable confirm snapshot and client fake-price rejection passed.",
  );
} finally {
  await closeTestServer(server);
  await rm(storageRoot, { recursive: true, force: true });
}
